import { Enemy } from './Enemy.js';

// Keeps the practice arena populated: spawns off-screen, chases, separates, removes the dead.
export class EnemyManager {
  constructor(cfg, arena, rng) {
    this.cfg = cfg; // config.enemies (live)
    this.arena = arena;
    this.rng = rng;
    this.list = [];
    this.nextId = 1;
    this.spawnTimer = 0;
  }

  all() { return this.list; }
  targetable() { return this.list.filter((e) => e.targetable); }
  clear() { this.list.length = 0; this.spawnTimer = 0; }

  spawnAt(type, pos) {
    const e = new Enemy(this.nextId++, type, this.cfg, pos);
    e.pos = this.arena.resolveCircle(e.pos, e.radius).pos;
    e.prevPos = { x: e.pos.x, y: e.pos.y };
    this.list.push(e);
    return e;
  }

  update(dt, playerPos, viewRect) {
    for (const e of this.list) e.update(dt, playerPos, this.arena);
    this.separate();
    for (let i = this.list.length - 1; i >= 0; i--) if (!this.list[i].alive) this.list.splice(i, 1);
    this.spawn(dt, playerPos, viewRect);
  }

  separate() {
    const list = this.list, k = this.cfg.separation;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dying) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dying) continue;
        let dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y;
        let d = Math.hypot(dx, dy);
        const min = a.radius + b.radius;
        if (d >= min) continue;
        if (d < 1e-6) { // identical positions: deterministic split
          const ang = (a.id * 2.399) % (Math.PI * 2);
          dx = Math.cos(ang); dy = Math.sin(ang); d = 1;
        } else { dx /= d; dy /= d; }
        const push = (min - d) * k * 0.5;
        // heavier (elite) moves less
        const wa = b.isElite && !a.isElite ? 1.5 : a.isElite && !b.isElite ? 0.5 : 1;
        a.pos.x -= dx * push * wa; a.pos.y -= dy * push * wa;
        b.pos.x += dx * push * (2 - wa); b.pos.y += dy * push * (2 - wa);
      }
    }
    for (const e of list) e.pos = this.arena.resolveCircle(e.pos, e.radius).pos;
  }

  spawn(dt, playerPos, viewRect) {
    const c = this.cfg;
    const count = this.list.filter((e) => e.targetable).length;
    if (count >= c.targetCount) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0 && count >= c.minCount) return;
    this.spawnTimer = c.spawnInterval;

    const [gMin, gMax] = c.groupSize;
    const group = this.rng() < c.groupChance ? gMin + Math.floor(this.rng() * (gMax - gMin + 1)) : 1;
    const center = this.pickSpawnPoint(viewRect);
    if (!center) return;
    for (let i = 0; i < group; i++) {
      const type = this.pickType();
      const off = i === 0 ? { x: 0, y: 0 } : { x: (this.rng() * 2 - 1) * 50, y: (this.rng() * 2 - 1) * 50 };
      const pos = { x: center.x + off.x, y: center.y + off.y };
      if (this.inRect(pos, viewRect, 0)) continue;
      this.spawnAt(type, pos);
    }
  }

  pickType() {
    const c = this.cfg;
    const elites = this.list.filter((e) => e.isElite && e.targetable).length;
    return elites < c.maxElites && this.rng() < c.eliteChance ? 'elite' : 'soldier';
  }

  inRect(p, r, margin) {
    return p.x > r.x - margin && p.x < r.x + r.w + margin && p.y > r.y - margin && p.y < r.y + r.h + margin;
  }

  pickSpawnPoint(viewRect) {
    const m = this.cfg.spawnMargin;
    const pad = 40;
    for (let tries = 0; tries < 30; tries++) {
      // sample a ring just outside the view so enemies arrive quickly
      const ang = this.rng() * Math.PI * 2;
      const cx = viewRect.x + viewRect.w / 2, cy = viewRect.y + viewRect.h / 2;
      const rx = viewRect.w / 2 + m + this.rng() * 250, ry = viewRect.h / 2 + m + this.rng() * 250;
      const p = { x: cx + Math.cos(ang) * rx, y: cy + Math.sin(ang) * ry };
      if (p.x < pad || p.y < pad || p.x > this.arena.width - pad || p.y > this.arena.height - pad) continue;
      if (this.inRect(p, viewRect, m * 0.5)) continue;
      return p;
    }
    return null;
  }
}
