// Golem bosses (Phase 6, 2.1): very slow, never pushed, and they change the ground — cracks that keep
// hurting, boulders that stand like pillars for a while, shockwaves, a room-wide quake. The front is
// guarded (blows from there do little, a shield shows); the back is the weak spot. It turns slowly,
// so the player can get behind it.
import { bossCore } from './bossCore.js';

export function golemFront(e) {
  const A = e.root.ai.golem;
  e.front = { mul: e.tcfg.frontMul != null ? e.tcfg.frontMul : A.frontMul, arc: e.tcfg.frontArc || A.frontArc };
}

// turn the face toward the player, at most ai.golem.turn rad/s
export function turnFace(e, dt, game) {
  const p = game.player.pos, want = Math.atan2(p.y - e.pos.y, p.x - e.pos.x);
  const diff = Math.atan2(Math.sin(want - e.ai.face), Math.cos(want - e.ai.face)), step = e.root.ai.golem.turn * dt;
  e.ai.face += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
}

export const golemAI = {
  init(e) {
    bossCore.init(e);
    e.ai.face = Math.PI; // bosses start right of the room's middle, looking left at the player
    golemFront(e);
  },
  onStun(e) { bossCore.onStun(e); },
  update(e, dt, game) {
    turnFace(e, dt, game);
    return bossCore.update(e, dt, game, golemAI);
  },
  move(e, game, v) {
    if (v.d < e.radius + game.player.radius + e.tcfg.stopDistance) return { x: 0, y: 0 };
    return { x: v.x * e.speed, y: v.y * e.speed };
  },
};
