// An assassin's clone: a decoy that circles the player and does not attack. One of them is real
// (they all look alike); hitting it opens the boss up, hitting a fake only makes that one vanish.
export const cloneAI = {
  init(e) { e.ai = { t: e.id * 0.37, strafe: e.id % 2 ? 1 : -1 }; },
  onStun() {},
  update(e, dt, game) {
    e.ai.t += dt;
    const p = game.player.pos, dx = p.x - e.pos.x, dy = p.y - e.pos.y, d = Math.hypot(dx, dy) || 1;
    const sp = e.ai.strafe * e.speed;
    return { x: (-dy / d) * sp, y: (dx / d) * sp };
  },
};
