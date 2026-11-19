// Skeleton shieldbearer (41층~, 9.7): a shield covers its front (shieldArc°). A chain dash from the front
// bounces off and ends the chain (Enemy.takeHit / CombatController); from the side or back, or while it is
// stunned, blows go through. It turns slowly toward the player, walks up and shoves with the shield
// (a narrow warned cone).
import { turnFace } from './golem.js';

export const shieldbearerAI = {
  init(e) { e.ai = { face: Math.PI, bash: e.root.ai.shieldbearer.firstBash, hold: 0 }; },
  onStun(e) { e.ai.hold = 0; },
  update(e, dt, game) {
    const s = e.ai, p = game.player.pos, A = e.root.ai.shieldbearer;
    turnFace(e, dt, game);
    if (s.hold > 0) { s.hold -= dt; return { x: 0, y: 0 }; }
    s.bash -= dt;
    const dx = p.x - e.pos.x, dy = p.y - e.pos.y, d = Math.hypot(dx, dy) || 1;
    const gap = d - e.radius - game.player.radius;
    if (s.bash <= 0 && e.aggressive && gap <= (e.tcfg.attackRange || 0) + A.bashReach) {
      s.bash = A.bashEvery;
      s.hold = A.bashWarn;
      game.hazards.cone({ x: e.pos.x, y: e.pos.y, dir: { x: dx / d, y: dy / d }, radius: e.radius + (e.tcfg.attackRange || 0) + A.bashReach, arcDeg: A.bashArc, delay: A.bashWarn, damage: e.attack, owner: e, anchor: true });
      return { x: 0, y: 0 };
    }
    if (gap <= A.stopGap) return { x: 0, y: 0 };
    return { x: (dx / d) * e.speed, y: (dy / d) * e.speed };
  },
};
