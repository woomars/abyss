// Wraith: drifts toward the player; every few seconds fades out (untargetable), reappears near the
// player and casts a telegraphed circle under itself. Returns the movement vector for this step.
const rand = ([a, b], rng) => a + rng() * (b - a);

export const wraithAI = {
  init(e) {
    const t = e.tcfg;
    e.ai = { phase: 'drift', t: 0, cd: t.blinkCooldown[0] + ((e.id * 0.53) % 1) * (t.blinkCooldown[1] - t.blinkCooldown[0]) };
    e.hidden = false;
    e.fade = 1; // 1 visible .. 0 gone (render)
  },

  update(e, dt, game) {
    const t = e.tcfg, s = e.ai, p = game.player;
    if (s.phase === 'drift') {
      e.fade = 1;
      s.cd -= dt;
      const dx = p.pos.x - e.pos.x, dy = p.pos.y - e.pos.y, d = Math.hypot(dx, dy) || 1;
      if (s.cd <= 0 && d < t.blinkRange) {
        s.phase = 'out'; s.t = t.blinkTime; e.hidden = true;
        game.events.emit('wraithBlink', { enemy: e, pos: { x: e.pos.x, y: e.pos.y } });
        return { x: 0, y: 0 };
      }
      return d > e.radius ? { x: (dx / d) * e.speed, y: (dy / d) * e.speed } : { x: 0, y: 0 };
    }
    if (s.phase === 'out') {
      s.t -= dt;
      e.fade = Math.max(0, s.t / t.blinkTime);
      if (s.t <= 0) {
        // reappear at a free spot near the player
        const ang = game.rng() * Math.PI * 2, r = rand(t.blinkDistance, game.rng);
        const q = game.arena.resolveCircle({ x: p.pos.x + Math.cos(ang) * r, y: p.pos.y + Math.sin(ang) * r }, e.radius).pos;
        e.pos = { x: q.x, y: q.y };
        e.prevPos = { x: q.x, y: q.y };
        e.vel.x = 0; e.vel.y = 0;
        s.phase = 'in'; s.t = t.blinkTime;
      }
      return { x: 0, y: 0 };
    }
    if (s.phase === 'in') {
      s.t -= dt;
      e.fade = 1 - Math.max(0, s.t / t.blinkTime);
      if (s.t <= 0) {
        e.hidden = false;
        e.fade = 1;
        game.hazards.circle({ x: e.pos.x, y: e.pos.y, radius: t.aoeRadius, delay: t.aoeDelay, damage: e.attack });
        s.phase = 'cast'; s.t = t.aoeDelay;
      }
      return { x: 0, y: 0 };
    }
    // cast: hold still until the circle resolves
    s.t -= dt;
    if (s.t <= 0) { s.phase = 'drift'; s.cd = rand(t.blinkCooldown, game.rng); }
    return { x: 0, y: 0 };
  },
};
