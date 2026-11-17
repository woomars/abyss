// Shaman (81층~, 9.7): stays far off; now and then wraps nearby allies in a bubble (it stops one blow, and
// shows) and lays a curse on the floor under the player (a patch that keeps hurting). Kill it first.
const BUBBLE_EVERY = 4, BUBBLE_RANGE = 400, BUBBLE_MAX = 3, CURSE_EVERY = 6, KEEP = [360, 520];

export const shamanAI = {
  init(e) { e.ai = { bubble: 2, curse: 4, strafe: e.id % 2 ? 1 : -1 }; },
  onStun() {},
  update(e, dt, game) {
    const s = e.ai, p = game.player.pos;
    s.bubble -= dt;
    s.curse -= dt;
    if (s.bubble <= 0) {
      s.bubble = BUBBLE_EVERY;
      let n = 0;
      for (const m of game.enemies.all()) {
        if (n >= BUBBLE_MAX || m === e || !m.alive || m.dying || m.isBoss || m.bubble || m.type === 'shaman') continue;
        if (Math.hypot(m.pos.x - e.pos.x, m.pos.y - e.pos.y) > BUBBLE_RANGE) continue;
        m.bubble = true;
        n++;
        game.events.emit('shamanBubble', { pos: { x: m.pos.x, y: m.pos.y }, radius: m.radius });
      }
    }
    if (s.curse <= 0 && e.aggressive) {
      s.curse = CURSE_EVERY;
      game.hazards.pool({ x: p.x, y: p.y, radius: 70, delay: 0.8, duration: 3, tick: 0.5, damage: e.attack * 0.5, owner: e, style: 'curse' });
    }
    const dx = p.x - e.pos.x, dy = p.y - e.pos.y, d = Math.hypot(dx, dy) || 1, sp = e.speed;
    if (d < KEEP[0]) return { x: (-dx / d) * sp, y: (-dy / d) * sp };
    if (d > KEEP[1]) return { x: (dx / d) * sp, y: (dy / d) * sp };
    return { x: (-dy / d) * s.strafe * sp * 0.6, y: (dx / d) * s.strafe * sp * 0.6 };
  },
};
