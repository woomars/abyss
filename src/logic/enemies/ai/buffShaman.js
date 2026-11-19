// Buff shaman (41층~): no attack of its own. Fast, it runs to its fellow mobs and keeps about keepFrac of
// its buff radius from them (on the far side from the hero), and over and over raises the hp and attack of
// every mob within the radius - itself too (Enemy.addBuff). It comes with a ring of skeletons and an orc
// (Dungeon.spawnTroop). Kill it first.
const ally = (e, m) => m !== e && m.alive && !m.dying && !m.isBoss && m.type !== 'sigil' && m.type !== 'clone' && m.type !== 'buffShaman';

export const buffShamanAI = {
  init(e) { e.ai = { cast: e.root.ai.buffShaman.firstCast, strafe: e.id % 2 ? 1 : -1 }; },
  onStun() {},
  update(e, dt, game) {
    const s = e.ai, A = e.root.ai.buffShaman, all = game.enemies.all();
    s.cast -= dt;
    if (s.cast <= 0) { // the buff: every mob in the radius, and itself
      s.cast = A.every;
      for (const m of all) {
        if (m !== e && !ally(e, m)) continue;
        if (Math.hypot(m.pos.x - e.pos.x, m.pos.y - e.pos.y) > A.radius) continue;
        m.addBuff(A);
      }
      game.events.emit('shamanBuff', { pos: { x: e.pos.x, y: e.pos.y }, radius: A.radius });
    }
    // where to stand: keepFrac x radius from the nearest group of its fellows, on the side away from the hero
    let near = null, nd = Infinity;
    for (const m of all) {
      if (!ally(e, m)) continue;
      const d = Math.hypot(m.pos.x - e.pos.x, m.pos.y - e.pos.y);
      if (d < nd) { nd = d; near = m; }
    }
    const p = game.player.pos, sp = e.speed;
    if (!near) { // alone: keep well away from the hero
      const dx = e.pos.x - p.x, dy = e.pos.y - p.y, d = Math.hypot(dx, dy) || 1;
      return d < A.radius * 1.5 ? { x: (dx / d) * sp, y: (dy / d) * sp } : { x: 0, y: 0 };
    }
    let cx = 0, cy = 0, n = 0;
    for (const m of all) {
      if (!ally(e, m) || Math.hypot(m.pos.x - near.pos.x, m.pos.y - near.pos.y) > A.radius) continue;
      cx += m.pos.x; cy += m.pos.y; n++;
    }
    cx /= n; cy /= n;
    const ax = cx - p.x, ay = cy - p.y, ad = Math.hypot(ax, ay) || 1, keep = A.radius * A.keepFrac;
    const tx = cx + (ax / ad) * keep - e.pos.x, ty = cy + (ay / ad) * keep - e.pos.y, td = Math.hypot(tx, ty);
    if (td < A.arrive) return { x: 0, y: 0 };
    const k = Math.min(1, td / (A.arrive * 3)); // slows as it arrives
    return { x: (tx / td) * sp * k, y: (ty / td) * sp * k };
  },
};
