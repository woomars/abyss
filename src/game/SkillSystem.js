// Three equipped special attacks with individual cooldowns.
// Skills are data-defined (config.skills.defs) and equipped into slots (config.skills.slots).
export class SkillSystem {
  constructor(cfg, { player, movement, enemies, combat, combatCfg, events, rng, arena }) {
    this.cfg = cfg; // config.skills (live)
    this.player = player;
    this.movement = movement;
    this.enemies = enemies;
    this.combat = combat;
    this.combatCfg = combatCfg;
    this.events = events;
    this.rng = rng;
    this.arena = arena;
    this.remaining = cfg.slots.map(() => 0);
    this.rush = null;
    this.projectiles = [];
  }

  get slots() {
    return this.cfg.slots.map((id, i) => {
      const d = this.cfg.defs[id];
      return { id, name: d.name, cooldown: d.cooldown, remaining: this.remaining[i] };
    });
  }

  get busy() { return this.rush !== null; }

  reset() {
    this.remaining = this.cfg.slots.map(() => 0);
    this.rush = null;
    this.projectiles.length = 0;
  }

  use(slot) {
    const id = this.cfg.slots[slot];
    if (!id || this.remaining[slot] > 0 || this.busy) return false;
    const def = this.cfg.defs[id];
    this.combat.cancel();
    const p = this.player;
    const dir = { x: this.combat.inputDir.x, y: this.combat.inputDir.y };
    this.events.emit('skill', { id, pos: { x: p.pos.x, y: p.pos.y }, dir });
    if (id === 'spin') this.spin(def);
    else if (id === 'rushStrike') this.rush = { def, dir, traveled: 0, hit: new Set() };
    else if (id === 'bladeWave') this.projectiles.push({ def, x: p.pos.x, y: p.pos.y, dir, traveled: 0, hit: new Set() });
    this.remaining[slot] = def.cooldown;
    return true;
  }

  hitEnemy(e, damage, dir) {
    const c = this.combatCfg;
    const crit = this.rng() < c.critChance;
    const dmg = Math.round(damage * (crit ? c.critMultiplier : 1));
    const kind = crit ? 'crit' : 'strong';
    const { killed } = e.takeHit({ damage: dmg, knockDir: dir, knockback: c.knockback[kind], stagger: c.stagger[kind] });
    const pos = { x: e.pos.x, y: e.pos.y };
    this.events.emit('hit', { enemy: e, damage: dmg, crit, strong: true, chainIndex: 0, pos, dir });
    if (killed) this.events.emit('kill', { enemy: e, pos, dir, crit });
  }

  spin(def) {
    const p = this.player;
    this.events.emit('slash', { pos: { x: p.pos.x, y: p.pos.y }, dir: p.heading, radius: def.radius, arcDeg: 360, chainIndex: 0, strong: true });
    for (const e of this.enemies.targetable()) {
      const dx = e.pos.x - p.pos.x, dy = e.pos.y - p.pos.y;
      const d = Math.hypot(dx, dy);
      if (d - e.radius > def.radius) continue;
      this.hitEnemy(e, def.damage, d > 1e-6 ? { x: dx / d, y: dy / d } : p.heading);
    }
  }

  // hits targetable enemies whose center is within halfWidth (+radius) of point (x, y)
  sweep(x, y, halfWidth, hitSet, dir, damage) {
    for (const e of this.enemies.targetable()) {
      if (hitSet.has(e.id)) continue;
      if (Math.hypot(e.pos.x - x, e.pos.y - y) > halfWidth + e.radius) continue;
      hitSet.add(e.id);
      this.hitEnemy(e, damage, dir);
    }
  }

  update(dt) {
    for (let i = 0; i < this.remaining.length; i++) {
      if (this.remaining[i] > 0) this.remaining[i] = Math.max(0, this.remaining[i] - dt);
    }

    if (this.rush) {
      const r = this.rush;
      const stepLen = Math.min(r.def.speed * dt, r.def.distance - r.traveled);
      const before = { x: this.player.pos.x, y: this.player.pos.y };
      const { blocked } = this.movement.step(r.dir, stepLen);
      this.player.visualAngle = Math.atan2(r.dir.y, r.dir.x);
      const moved = Math.hypot(this.player.pos.x - before.x, this.player.pos.y - before.y);
      r.traveled += stepLen;
      // sample along the segment so fast rushes don't skip enemies
      const n = Math.max(1, Math.ceil(moved / 20));
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        this.sweep(before.x + (this.player.pos.x - before.x) * t, before.y + (this.player.pos.y - before.y) * t,
          r.def.width / 2, r.hit, r.dir, r.def.damage);
      }
      if (blocked || r.traveled >= r.def.distance - 1e-6) {
        this.rush = null;
        this.movement.setDirection(this.combat.inputDir, { burst: false });
      }
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      const stepLen = pr.def.speed * dt;
      const n = Math.max(1, Math.ceil(stepLen / 20));
      for (let k = 0; k < n; k++) {
        pr.x += pr.dir.x * stepLen / n;
        pr.y += pr.dir.y * stepLen / n;
        pr.traveled += stepLen / n;
        this.sweep(pr.x, pr.y, pr.def.width / 2, pr.hit, pr.dir, pr.def.damage);
        if (pr.traveled >= pr.def.range) break;
      }
      const out = pr.x < 0 || pr.y < 0 || pr.x > this.arena.width || pr.y > this.arena.height;
      if (pr.traveled >= pr.def.range || out) this.projectiles.splice(i, 1);
    }
  }
}
