// Rectangular (or circular: cfg.circle) room with axis-aligned pillar obstacles.
export class Arena {
  constructor(cfg) {
    this.cfg = cfg;
  }
  get width() { return this.cfg.width; }
  get height() { return this.cfg.height; }
  get pillars() { return this.cfg.pillars; }

  // Push a circle out of walls and pillars. Returns resolved pos, whether it hit, and the last contact normal.
  resolveCircle(pos, radius) {
    let x = pos.x, y = pos.y;
    let hitWall = false;
    let nx = 0, ny = 0;
    if (this.cfg.circle) { // round arena: keep inside the circle that fits the room
      const cx = this.width / 2, cy = this.height / 2, R = Math.min(this.width, this.height) / 2;
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
      if (d > R - radius) {
        const k = d > 1e-9 ? (R - radius) / d : 0;
        x = cx + dx * k; y = cy + dy * k;
        hitWall = true;
        if (d > 1e-9) { nx -= dx / d; ny -= dy / d; }
      }
    } else {
      if (x < radius) { x = radius; hitWall = true; nx += 1; }
      if (x > this.width - radius) { x = this.width - radius; hitWall = true; nx -= 1; }
      if (y < radius) { y = radius; hitWall = true; ny += 1; }
      if (y > this.height - radius) { y = this.height - radius; hitWall = true; ny -= 1; }
    }

    const pillars = this.pillars;
    for (let i = 0; i < pillars.length; i++) {
      const p = pillars[i];
      const cx = Math.max(p.x, Math.min(x, p.x + p.w));
      const cy = Math.max(p.y, Math.min(y, p.y + p.h));
      const dx = x - cx, dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= radius * radius) continue;
      hitWall = true;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        const ux = dx / d, uy = dy / d;
        x = cx + ux * radius; y = cy + uy * radius;
        nx += ux; ny += uy;
      } else {
        // center inside pillar: exit through nearest side
        const left = x - p.x, right = p.x + p.w - x, top = y - p.y, bottom = p.y + p.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) { x = p.x - radius; nx -= 1; }
        else if (m === right) { x = p.x + p.w + radius; nx += 1; }
        else if (m === top) { y = p.y - radius; ny -= 1; }
        else { y = p.y + p.h + radius; ny += 1; }
      }
    }
    let normal = null;
    if (hitWall) {
      const l = Math.hypot(nx, ny);
      normal = l > 1e-9 ? { x: nx / l, y: ny / l } : { x: 0, y: 0 };
    }
    return { pos: { x, y }, hitWall, normal };
  }
}
