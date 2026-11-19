// Shaman (81층~, 9.7): stays far off; now and then wraps nearby allies in a bubble (it stops one blow, and
// shows) and lays a curse on the floor under the player (a patch that keeps hurting). Kill it first.
export const shamanAI = {
  init(e) { const A = e.root.ai.shaman; e.ai = { bubble: A.firstBubble, curse: A.firstCurse, strafe: e.id % 2 ? 1 : -1 }; },
  onStun() {},
  update(e, dt, game) {
    const s = e.ai, p = game.player.pos, A = e.root.ai.shaman;
    s.bubble -= dt;
    s.curse -= dt;
    if (s.bubble <= 0) {
      s.bubble = A.bubbleEvery;
      let n = 0;
      for (const m of game.enemies.all()) {
        if (n >= A.bubbleMax || m === e || !m.alive || m.dying || m.isBoss || m.bubble || m.type === 'shaman') continue;
        if (Math.hypot(m.pos.x - e.pos.x, m.pos.y - e.pos.y) > A.bubbleRange) continue;
        m.bubble = true;
        n++;
        game.events.emit('shamanBubble', { pos: { x: m.pos.x, y: m.pos.y }, radius: m.radius });
      }
    }
    if (s.curse <= 0 && e.aggressive) {
      s.curse = A.curseEvery;
      game.hazards.pool({ x: p.x, y: p.y, radius: A.curse.radius, delay: A.curse.delay, duration: A.curse.duration, tick: A.curse.tick, damage: e.attack * A.curse.damageMul, owner: e, style: 'curse' });
    }
    const dx = p.x - e.pos.x, dy = p.y - e.pos.y, d = Math.hypot(dx, dy) || 1, sp = e.speed;
    if (d < A.keep[0]) return { x: (-dx / d) * sp, y: (-dy / d) * sp };
    if (d > A.keep[1]) return { x: (dx / d) * sp, y: (dy / d) * sp };
    return { x: (-dy / d) * s.strafe * sp * A.strafeMul, y: (dx / d) * s.strafe * sp * A.strafeMul };
  },
};
