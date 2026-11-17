// Room template + rng -> arena (walls, pillars), player start (left) and exit (right) (pure).
// scale: the room grows or shrinks around the same layout (two bosses: a larger room)
export function buildRoom(kind, cfg, rng, scale = 1) {
  const list = cfg.rooms[kind];
  const t0 = list[Math.floor(rng() * list.length) % list.length];
  const t = scale === 1 ? t0 : { ...t0, w: t0.w * scale, h: t0.h * scale, pillars: t0.pillars.map((p) => ({ x: p.x * scale, y: p.y * scale, w: p.w, h: p.h })) };
  const flip = rng() < 0.5; // mirror top/bottom for variety
  const pillars = t.pillars.map((p) => ({ x: p.x, y: flip ? t.h - p.y - p.h : p.y, w: p.w, h: p.h }));
  return {
    kind,
    arena: { width: t.w, height: t.h, pillars, circle: !!t.circle },
    shape: t.shape || null,
    start: { x: Math.min(cfg.startInset, t.w / 4), y: t.h / 2 },
    exit: { x: t.w - Math.min(cfg.exitInset, t.w / 4), y: t.h / 2 },
    center: { x: t.w / 2, y: t.h / 2 },
  };
}
