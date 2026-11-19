// An assassin's clone: looks exactly like its boss, closes in on the player while circling, and swings the
// boss's own basic attack - it hurts. The real "clone" is the boss itself, moving the same way (cloneStep);
// striking it sends it off in smoke to the middle of the room. Hitting a fake only makes that one vanish.
export const cloneState = (e) => ({ strafe: e.id % 2 ? 1 : -1, cd: 0.6 + ((e.id * 0.61) % 1), hold: 0 });

export const cloneAI = {
  init(e) { e.ai = cloneState(e); },
  onStun(e) { e.ai.hold = 0; },
  update(e, dt, game) { return cloneStep(e, e.ai, e.cloneOf, dt, game); },
};

// one step of a clone (or of the boss among them): s its own state, b the boss whose attack it swings
export function cloneStep(e, s, b, dt, game) {
  const bc = e.root.ai.bossCore, basics = b && b.tcfg.basics;
  if (s.hold > 0) { s.hold -= dt; return { x: 0, y: 0 }; } // standing in its own swing
  const p = game.player.pos, dx = p.x - e.pos.x, dy = p.y - e.pos.y, d = Math.hypot(dx, dy) || 1, dir = { x: dx / d, y: dy / d };
  s.cd -= dt;
  if (basics && s.cd <= 0 && d - e.radius <= basics.triggerRange) {
    const a = basics.list[Math.floor(game.rng() * basics.list.length) % basics.list.length];
    const dmg = (a.damage || 0) * b.mods.attack * bc.cloneHit;
    if (a.kind === 'cone') game.hazards.cone({ x: e.pos.x, y: e.pos.y, dir, radius: a.radius + e.radius * 0.5, arcDeg: a.arcDeg, delay: a.windup, damage: dmg, owner: e, anchor: true });
    else game.hazards.circle({ x: e.pos.x, y: e.pos.y, radius: a.radius, delay: a.windup, damage: dmg, owner: e, anchor: true });
    s.hold = a.windup + a.recover;
    s.cd = basics.every * (bc.cloneEvery[0] + game.rng() * (bc.cloneEvery[1] - bc.cloneEvery[0]));
    return { x: 0, y: 0 };
  }
  const close = basics ? basics.triggerRange * 0.6 : 120, inward = d - e.radius > close ? 1 : 0;
  const sp = e.root.types.clone.speed * e.mods.speed; // the boss among them walks at a clone's pace too
  return { x: (-dir.y * s.strafe * 0.6 + dir.x * inward) * sp, y: (dir.x * s.strafe * 0.6 + dir.y * inward) * sp };
}
