// Off-screen enemy pointer: when no enemy still to beat is inside the view, the direction to the nearest
// one (hidden wraiths count — they still have to be found). Pure.
export function nearestOffscreen(enemies, view, from) {
  let best = null, bd = Infinity;
  for (const e of enemies) {
    if (!e.alive || e.dying) continue;
    const r = e.radius || 0;
    if (e.pos.x + r >= view.x && e.pos.x - r <= view.x + view.w && e.pos.y + r >= view.y && e.pos.y - r <= view.y + view.h) return null;
    const d = Math.hypot(e.pos.x - from.x, e.pos.y - from.y);
    if (d < bd) { bd = d; best = e; }
  }
  if (!best || bd < 1e-6) return null;
  return { dir: { x: (best.pos.x - from.x) / bd, y: (best.pos.y - from.y) / bd }, dist: bd };
}
