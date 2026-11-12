import { Pool } from '../core/Pool.js';

const SLASH_LIFE = 0.2;
const RING_LIFE = 0.28;
const LINK_LIFE = 0.22;
const WIND_LIFE = 0.18;

// Pooled visual-effect state. Pure data; the Renderer draws it.
export class EffectManager {
  constructor(config, events, rng) {
    this.config = config; // full config (live); uses config.feedback
    this.rng = rng;
    const f = config.feedback;
    this.particles = new Pool(() => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: '#fff', dust: false, a0: 1 }), f.particles.max);
    this.numbers = new Pool(() => ({ x: 0, y: 0, value: 0, crit: false, hurt: false, life: 0, max: 1 }), 64);
    this.rings = new Pool(() => ({ x: 0, y: 0, r0: 0, r1: 0, life: 0, max: 1, color: '#fff' }), 32);
    this.slashes = new Pool(() => ({ x: 0, y: 0, angle: 0, radius: 0, arc: 0, life: 0, max: 1, strong: false, sweep: 1 }), 32);
    this.nextSweep = 1; // blade swings alternate clockwise / counter-clockwise
    this.links = new Pool(() => ({ x0: 0, y0: 0, x1: 0, y1: 0, life: 0, max: 1, index: 0 }), 32);
    this.winds = new Pool(() => ({ x: 0, y: 0, angle: 0, life: 0, max: 1 }), 16);
    this.afterimages = []; // {x, y, angle, age}
    this.combo = { count: 0, timer: 0 };

    events.on('slash', (e) => this.onSlash(e));
    events.on('hit', (e) => this.onHit(e));
    events.on('kill', (e) => this.onKill(e));
    events.on('chainLink', (e) => this.onLink(e));
    events.on('turn', (e) => this.onTurn(e));
    events.on('playerHit', (e) => this.onPlayerHit(e));
    events.on('chainBroken', (e) => this.text(e.pos.x, e.pos.y - 52, '끊김'));
    events.on('evade', (e) => this.text(e.pos.x, e.pos.y - 52, '회피'));
    events.on('stun', (e) => this.ring(e.pos.x, e.pos.y, e.enemy.radius, e.enemy.radius + 26, '#ffe08a'));
    events.on('stormZap', (e) => { this.onLink({ ...e, chainIndex: 4 }); this.ring(e.to.x, e.to.y, 6, 34, '#9fd8ff'); });
    events.on('quake', (e) => {
      const n = Math.max(2, Math.ceil(Math.hypot(e.to.x - e.from.x, e.to.y - e.from.y) / 50));
      for (let i = 0; i <= n; i++) this.ring(e.from.x + ((e.to.x - e.from.x) * i) / n, e.from.y + ((e.to.y - e.from.y) * i) / n, 6, 40, '#d9a35b');
    });
    events.on('setBlast', (e) => { this.ring(e.pos.x, e.pos.y, 12, e.radius, '#c27cff'); this.ring(e.pos.x, e.pos.y, 6, e.radius * 0.6, '#ffffff'); });
    events.on('enemyStrike', (e) => {
      if (!e.riposte) return; // riposte: a red burst on the angry enemy
      const r = this.rings.acquire();
      r.x = e.pos.x; r.y = e.pos.y; r.r0 = e.enemy.radius; r.r1 = e.enemy.radius + 50; r.color = '#ff3b30';
      r.life = r.max = RING_LIFE;
    });
  }

  ring(x, y, r0, r1, color) {
    const r = this.rings.acquire();
    r.x = x; r.y = y; r.r0 = r0; r.r1 = r1; r.color = color;
    r.life = r.max = RING_LIFE;
  }

  text(x, y, value) {
    const n = this.numbers.acquire();
    n.x = x; n.y = y; n.value = value; n.crit = false; n.hurt = true;
    n.life = n.max = this.fb.damageNumberLife;
  }

  get fb() { return this.config.feedback; }

  spark(x, y, dir, n, speed, color, size, life) {
    for (let i = 0; i < n; i++) {
      const p = this.particles.acquire();
      const spread = (this.rng() * 2 - 1) * 1.1;
      const a = Math.atan2(dir.y, dir.x) + spread;
      const v = speed * (0.4 + this.rng() * 0.8);
      p.x = x; p.y = y; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v;
      p.life = p.max = life * (0.6 + this.rng() * 0.6);
      p.size = size * (0.6 + this.rng() * 0.8);
      p.color = color;
      p.dust = false;
      p.a0 = 1;
    }
  }

  // short, weak dust puffs kicked up behind a dashing player
  emitDust(player, dt) {
    const d = this.fb.dust;
    if (!d) return;
    this.dustTimer = (this.dustTimer || 0) + dt;
    let mx = player.pos.x - player.prevPos.x, my = player.pos.y - player.prevPos.y;
    let m = Math.hypot(mx, my);
    if (m < 1e-6) { mx = Math.cos(player.visualAngle); my = Math.sin(player.visualAngle); m = 1; }
    const bx = -mx / m, by = -my / m; // backward
    while (this.dustTimer >= d.interval) {
      this.dustTimer -= d.interval;
      for (let i = 0; i < d.count; i++) {
        const p = this.particles.acquire();
        const side = (this.rng() * 2 - 1) * 6;
        p.x = player.pos.x + bx * 14 - by * side;
        p.y = player.pos.y + by * 14 + bx * side;
        const a = Math.atan2(by, bx) + (this.rng() * 2 - 1) * 0.6;
        const v = d.speed * (0.5 + this.rng() * 0.5);
        p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v;
        p.life = p.max = d.life * (0.7 + this.rng() * 0.3);
        p.size = d.size * (0.7 + this.rng() * 0.6);
        p.color = '#8c8296';
        p.dust = true;
        p.a0 = d.alpha;
      }
    }
  }

  onPlayerHit({ damage, pos, from }) {
    const n = this.numbers.acquire();
    n.x = pos.x; n.y = pos.y - 30;
    n.value = Math.max(1, Math.round(damage)); n.crit = false; n.hurt = true;
    n.life = n.max = this.fb.damageNumberLife;
    const dir = from ? { x: pos.x - from.x, y: pos.y - from.y } : { x: 0, y: -1 };
    const l = Math.hypot(dir.x, dir.y) || 1;
    this.spark(pos.x, pos.y, { x: dir.x / l, y: dir.y / l }, 6, 260, '#ff4a4a', 3, 0.3);
    const r = this.rings.acquire();
    r.x = pos.x; r.y = pos.y; r.r0 = 10; r.r1 = 40; r.color = '#ff4a4a';
    r.life = r.max = RING_LIFE;
  }

  onSlash({ pos, dir, radius, arcDeg, strong }) {
    const s = this.slashes.acquire();
    s.x = pos.x; s.y = pos.y; s.angle = Math.atan2(dir.y, dir.x);
    s.radius = radius; s.arc = arcDeg * Math.PI / 180; s.strong = strong;
    s.sweep = this.nextSweep;
    this.nextSweep = -this.nextSweep;
    s.life = s.max = SLASH_LIFE;
  }

  onHit({ damage, crit, strong, pos, dir, enemy }) {
    const color = crit ? '#ffb347' : enemy && enemy.isElite ? '#ff6a5c' : '#fff3c4';
    this.spark(pos.x, pos.y, dir, this.fb.particles.hit, crit ? 520 : 380, color, crit ? 3.5 : 2.5, 0.25);
    const n = this.numbers.acquire();
    n.x = pos.x + (this.rng() * 2 - 1) * 8; n.y = pos.y - 18;
    n.value = damage; n.crit = crit; n.hurt = false;
    n.life = n.max = this.fb.damageNumberLife;
    if (crit || strong) {
      const r = this.rings.acquire();
      r.x = pos.x; r.y = pos.y; r.r0 = 8; r.r1 = crit ? 70 : 50;
      r.color = crit ? '#ffb347' : '#e8e3d6';
      r.life = r.max = RING_LIFE;
    }
  }

  onKill({ pos, dir }) {
    this.spark(pos.x, pos.y, dir, this.fb.particles.kill, 300, '#9aa0aa', 4, 0.5);
    this.combo.count += 1;
    this.combo.timer = this.fb.comboWindow;
  }

  onLink({ from, to, chainIndex }) {
    const l = this.links.acquire();
    l.x0 = from.x; l.y0 = from.y; l.x1 = to.x; l.y1 = to.y; l.index = chainIndex;
    l.life = l.max = LINK_LIFE;
  }

  onTurn({ to, pos }) {
    const w = this.winds.acquire();
    w.x = pos.x; w.y = pos.y; w.angle = Math.atan2(to.y, to.x);
    w.life = w.max = WIND_LIFE;
  }

  // player: Player; fast: true while dashing/bursting (leaves afterimages)
  update(dt, player = null, fast = false) {
    const decay = (pool) => pool.forEachActive((o) => { o.life -= dt; if (o.life <= 0) pool.release(o); });
    this.particles.forEachActive((p) => {
      p.life -= dt;
      if (p.life <= 0) { this.particles.release(p); return; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = Math.exp(-6 * dt);
      p.vx *= k; p.vy *= k;
    });
    this.numbers.forEachActive((n) => { n.life -= dt; n.y -= 40 * dt; if (n.life <= 0) this.numbers.release(n); });
    decay(this.rings); decay(this.slashes); decay(this.links); decay(this.winds);

    for (const a of this.afterimages) a.age += dt;
    while (this.afterimages.length && this.afterimages[0].age > 0.12) this.afterimages.shift();
    if (player && fast) {
      this.afterimages.push({ x: player.pos.x, y: player.pos.y, angle: player.visualAngle, age: 0 });
      while (this.afterimages.length > this.fb.afterimageCount) this.afterimages.shift();
      this.emitDust(player, dt);
    } else {
      this.dustTimer = 0;
    }

    if (this.combo.timer > 0) {
      this.combo.timer -= dt;
      if (this.combo.timer <= 0) { this.combo.timer = 0; this.combo.count = 0; }
    }
  }

  clear() {
    for (const p of [this.particles, this.numbers, this.rings, this.slashes, this.links, this.winds]) p.releaseAll();
    this.afterimages.length = 0;
    this.combo.count = 0; this.combo.timer = 0;
  }
}
