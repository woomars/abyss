// Goblin archer: keeps its distance, aims (visible line) only while on screen, then looses an arrow
// at where the player is heading. Returns the movement vector for this step.
export const archerAI = {
  init(e) {
    const t = e.tcfg;
    // stagger the first shots so a group does not fire in one volley
    e.ai = { cd: t.cooldown * (0.4 + ((e.id * 0.37) % 0.6)), aim: 0, aimDir: { x: 1, y: 0 }, strafe: e.id % 2 ? 1 : -1 };
  },

  onHit(e) { e.ai.aim = 0; }, // a hit spoils the shot

  update(e, dt, game) {
    const t = e.tcfg, s = e.ai, p = game.player;
    const dx = p.pos.x - e.pos.x, dy = p.pos.y - e.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    if (s.aim > 0) {
      // track the target until the last 40% of the windup, then hold still and release
      if (s.aim > t.windup * t.lockFraction) s.aimDir = this.leadDir(e, game);
      s.aim -= dt;
      if (s.aim <= 0) {
        s.aim = 0;
        s.cd = t.cooldown;
        const off = e.radius + 4;
        game.hazards.arrow({
          x: e.pos.x + s.aimDir.x * off, y: e.pos.y + s.aimDir.y * off, dir: { ...s.aimDir },
          speed: t.arrowSpeed, radius: t.arrowRadius, damage: e.attack, range: t.arrowRange,
        });
        game.events.emit('enemyShoot', { enemy: e, pos: { x: e.pos.x, y: e.pos.y } });
      }
      return { x: 0, y: 0 };
    }
    s.cd -= dt;
    const v = game.viewRect();
    const onScreen = e.pos.x > v.x && e.pos.x < v.x + v.w && e.pos.y > v.y && e.pos.y < v.y + v.h;
    if (s.cd <= 0 && d <= t.range && onScreen) {
      s.aim = t.windup;
      s.aimDir = this.leadDir(e, game);
      return { x: 0, y: 0 };
    }
    const sp = e.speed;
    if (d > t.keepMax) return { x: ux * sp, y: uy * sp };
    if (d < t.keepMin) return { x: -ux * sp, y: -uy * sp };
    return { x: -uy * s.strafe * sp * t.strafe, y: ux * s.strafe * sp * t.strafe }; // circle the player
  },

  // aim a little ahead of a moving player (lead = fraction of the arrow's travel time)
  leadDir(e, game) {
    const p = game.player, t = e.tcfg;
    const vx = p.heading.x * (p.speed || 0), vy = p.heading.y * (p.speed || 0);
    const travel = Math.hypot(p.pos.x - e.pos.x, p.pos.y - e.pos.y) / t.arrowSpeed;
    const lead = t.lead * travel;
    const tx = p.pos.x + vx * lead - e.pos.x, ty = p.pos.y + vy * lead - e.pos.y;
    const l = Math.hypot(tx, ty) || 1;
    return { x: tx / l, y: ty / l };
  },
};
