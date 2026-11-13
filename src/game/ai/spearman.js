// Skeleton spearman: closes to thrusting distance and stabs first, on its own beat. Every thrust shows
// a long narrow cone before it lands (sidestep it). Returns the movement vector for this step.
import { rhythmFor, teleTime } from '../Rhythm.js';

export const spearmanAI = {
  init(e) {
    e.ai = { cd: 0.8 + ((e.id * 0.37) % 1), hold: 0, rhythm: rhythmFor(e.root, 'spear', e.mods.rhythmStage || 1) };
  },

  onStun(e) { e.ai.hold = 0; e.ai.cd = 1; e.ai.rhythm.reset(); },

  update(e, dt, game) {
    const t = e.tcfg, s = e.ai, p = game.player;
    if (s.hold > 0) { s.hold -= dt; return { x: 0, y: 0 }; } // thrusting: plant the feet
    const dx = p.pos.x - e.pos.x, dy = p.pos.y - e.pos.y, d = Math.hypot(dx, dy) || 1;
    s.cd -= dt;
    if (s.cd <= 0 && d - e.radius - p.radius <= t.thrust.radius - 20) {
      const beat = s.rhythm.next();
      const delay = teleTime(e.root, t.thrust.windup, beat.tele);
      game.hazards.cone({ x: e.pos.x, y: e.pos.y, dir: { x: dx / d, y: dy / d }, radius: t.thrust.radius + e.radius, arcDeg: t.thrust.arcDeg, delay, damage: e.attack });
      game.events.emit('enemyThrust', { enemy: e, pos: { x: e.pos.x, y: e.pos.y } });
      s.hold = delay + t.thrust.recover;
      s.cd = s.hold + beat.wait;
      return { x: 0, y: 0 };
    }
    if (d < t.keep) return { x: 0, y: 0 };
    return { x: (dx / d) * e.speed, y: (dy / d) * e.speed };
  },
};
