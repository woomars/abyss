// Bomber (summoned by summoner bosses): rushes the player fast; 2-3 s after it appears its fuse runs
// out — a warning circle shows for a moment, then it blows up (and is gone). One hit kills it.
export const bomberAI = {
  init(e) {
    const [a, b] = e.tcfg.fuse;
    e.ai = { fuse: a + ((e.id * 0.618) % 1) * (b - a), warned: false };
  },

  onStun(e) {}, // a stunned bomber still ticks

  update(e, dt, game) {
    const s = e.ai, bl = e.tcfg.blast;
    s.fuse -= dt;
    if (!s.warned && s.fuse <= bl.warn) {
      s.warned = true;
      game.hazards.circle({ x: e.pos.x, y: e.pos.y, radius: bl.radius, delay: Math.max(0.2, s.fuse), damage: e.attack });
    }
    if (s.fuse <= 0) { // boom: it is spent (no kill, no reward)
      e.dying = true;
      e.deathTimer = 0.05;
      game.events.emit('bomberBlast', { pos: { x: e.pos.x, y: e.pos.y }, radius: bl.radius });
      return { x: 0, y: 0 };
    }
    if (s.warned) return { x: 0, y: 0 }; // planted, about to blow
    const p = game.player.pos, dx = p.x - e.pos.x, dy = p.y - e.pos.y, d = Math.hypot(dx, dy) || 1;
    if (d < e.radius + game.player.radius) return { x: 0, y: 0 };
    return { x: (dx / d) * e.speed, y: (dy / d) * e.speed };
  },
};
