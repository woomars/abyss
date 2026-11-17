// Bomber (summoned by summoner bosses): rushes the player fast; 2-3 s after it appears its fuse runs
// out — a warning circle shows for a moment, then it blows up (and is gone). One hit kills it.
// On common floors (21층~, 9.7) it is lit only when it reaches the player (mobs.bomber fuseRange) and
// its blast also hurts the enemies around it. Blown up by itself it gives nothing.
export const bomberAI = {
  init(e) {
    const [a, b] = e.tcfg.fuse;
    e.ai = { fuse: e.mods.minion ? a + ((e.id * 0.618) % 1) * (b - a) : Infinity, warned: false, field: !e.mods.minion };
  },

  onStun(e) {}, // a stunned bomber still ticks

  update(e, dt, game) {
    const s = e.ai, fb = s.field && game.config.dungeon.mobs ? game.config.dungeon.mobs.bomber : null;
    const bl = fb ? { radius: fb.radius, warn: fb.fuse } : e.tcfg.blast;
    const p0 = game.player.pos;
    if (fb && !s.warned && Math.hypot(p0.x - e.pos.x, p0.y - e.pos.y) - e.radius - game.player.radius <= fb.fuseRange) s.fuse = fb.fuse; // lit
    s.fuse -= dt;
    if (!s.warned && s.fuse <= bl.warn) {
      s.warned = true;
      game.hazards.circle({ x: e.pos.x, y: e.pos.y, radius: bl.radius, delay: Math.max(0.2, s.fuse), damage: e.attack });
    }
    if (s.fuse <= 0) { // boom: it is spent (no kill, no reward)
      e.dying = true;
      e.deathTimer = 0.05;
      game.events.emit('bomberBlast', { pos: { x: e.pos.x, y: e.pos.y }, radius: bl.radius });
      if (fb && fb.hurtsEnemies) for (const m of game.enemies.all()) { // the blast catches the crowd around it
        if (m === e || !m.alive || m.dying) continue;
        const dx = m.pos.x - e.pos.x, dy = m.pos.y - e.pos.y, d = Math.hypot(dx, dy);
        if (d > bl.radius + m.radius) continue;
        const dir = d > 1e-6 ? { x: dx / d, y: dy / d } : { x: 1, y: 0 };
        if (m.takeHit({ damage: e.attack, knockDir: dir, knockback: 120, stagger: 0.2 }).killed) game.events.emit('kill', { enemy: m, pos: { x: m.pos.x, y: m.pos.y }, dir, crit: false });
      }
      return { x: 0, y: 0 };
    }
    if (s.warned) return { x: 0, y: 0 }; // planted, about to blow
    const p = game.player.pos, dx = p.x - e.pos.x, dy = p.y - e.pos.y, d = Math.hypot(dx, dy) || 1;
    if (d < e.radius + game.player.radius) return { x: 0, y: 0 };
    return { x: (dx / d) * e.speed, y: (dy / d) * e.speed };
  },
};
