// Enemy attacks that live in the world: arrows, and telegraphed areas (circle, cone, expanding ring).
// Every area shows its shape first (delay) and only then checks the player once. Pure game logic.
const TAU = Math.PI * 2;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Hazards {
  constructor(arena, cfg = null) {
    this.arena = arena;
    this.cfg = cfg; // config.enemies (live): hazardFlash = how long a resolved area stays visible
    this.list = [];
    this.onHit = null; // (damage, hazard) => void, set by Game
  }

  clear() { this.list.length = 0; }

  arrow({ x, y, dir, speed, radius, damage, range }) {
    this.list.push({ kind: 'arrow', x, y, dir, speed, radius, damage, range, traveled: 0, t: 0 });
  }

  circle({ x, y, radius, delay, damage }) {
    this.list.push({ kind: 'circle', x, y, radius, delay, damage, t: 0, done: false });
  }

  cone({ x, y, dir, radius, arcDeg, delay, damage }) {
    this.list.push({ kind: 'cone', x, y, dir, radius, arcDeg, delay, damage, t: 0, done: false });
  }

  // shockwave: telegraph for `delay`, then a band of `thickness` grows from 0 to maxRadius at `speed`
  ring({ x, y, delay, speed, maxRadius, thickness, damage }) {
    this.list.push({ kind: 'ring', x, y, delay, speed, maxRadius, thickness, damage, t: 0, r: 0, hit: false });
  }

  hit(h, player) {
    if (this.onHit) this.onHit(h.damage, h, player);
  }

  update(dt, player) {
    const pr = player.radius;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i];
      h.t += dt;
      let remove = false;
      if (h.kind === 'arrow') {
        const step = h.speed * dt;
        h.x += h.dir.x * step;
        h.y += h.dir.y * step;
        h.traveled += step;
        if (Math.hypot(player.pos.x - h.x, player.pos.y - h.y) <= pr + h.radius) { this.hit(h, player); remove = true; }
        else if (h.traveled >= h.range || this.arena.resolveCircle({ x: h.x, y: h.y }, h.radius).hitWall) remove = true;
      } else if (h.kind === 'circle' || h.kind === 'cone') {
        if (!h.done && h.t >= h.delay) {
          h.done = true;
          if (this.inside(h, player.pos, pr)) this.hit(h, player);
        }
        if (h.done && h.t >= h.delay + ((this.cfg && this.cfg.hazardFlash) || 0.15)) remove = true;
      } else if (h.kind === 'ring') {
        if (h.t >= h.delay) {
          h.r = (h.t - h.delay) * h.speed;
          const d = Math.hypot(player.pos.x - h.x, player.pos.y - h.y);
          if (!h.hit && Math.abs(d - h.r) <= h.thickness / 2 + pr) { h.hit = true; this.hit(h, player); }
          if (h.r - h.thickness / 2 > h.maxRadius) remove = true;
        }
      }
      if (remove) this.list.splice(i, 1);
    }
  }

  // is a circle of radius pr at p inside the area (counting the player's size)
  inside(h, p, pr) {
    const dx = p.x - h.x, dy = p.y - h.y, d = Math.hypot(dx, dy);
    if (d > h.radius + pr) return false;
    if (h.kind === 'circle') return true;
    if (d <= pr) return true; // standing on the origin
    const half = (h.arcDeg * Math.PI / 180) / 2;
    const diff = Math.abs(wrapAngle(Math.atan2(dy, dx) - Math.atan2(h.dir.y, h.dir.x)));
    return diff <= half + Math.asin(Math.min(1, pr / d));
  }
}

export { TAU };
