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
    this.spin = null;
    this.projectiles = [];
    this.aim = null;
  }

  get slots() {
    return this.cfg.slots.map((id, i) => {
      const d = this.cfg.defs[id];
      return { id, name: d.name, cooldown: d.cooldown, remaining: this.remaining[i] };
    });
  }

  get busy() { return this.rush !== null; } // blocks movement and auto attacks
  get spinning() { return this.spin !== null; } // blocks auto attacks, player keeps moving

  reset() {
    this.remaining = this.cfg.slots.map(() => 0);
    this.rush = null;
    this.spin = null;
    this.projectiles.length = 0;
    this.aim = null;
  }

  spinCritChance(hitIndex) {
    return this.combatCfg.critChance + this.cfg.defs.spin.chainCritStep * hitIndex;
  }

  isDirectional(slot) {
    const id = this.cfg.slots[slot];
    return !!(id && this.cfg.defs[id].directional);
  }

  // aim preview while a directional button is held (drawn by the renderer)
  setAim(slot, dir) { this.aim = { slot, dir: { x: dir.x, y: dir.y } }; }
  clearAim() { this.aim = null; }

  // aimDir: optional direction for directional skills (button drag); defaults to the input direction
  use(slot, aimDir = null) {
    const id = this.cfg.slots[slot];
    if (!id || this.remaining[slot] > 0 || this.busy || this.spinning) return false;
    const def = this.cfg.defs[id];
    this.combat.cancel();
    const p = this.player;
    const len = aimDir ? Math.hypot(aimDir.x, aimDir.y) : 0;
    const dir = len > 1e-6 && def.directional
      ? { x: aimDir.x / len, y: aimDir.y / len }
      : { x: this.combat.inputDir.x, y: this.combat.inputDir.y };
    this.events.emit('skill', { id, pos: { x: p.pos.x, y: p.pos.y }, dir });
    if (id === 'spin') this.spin = { def, start: Math.atan2(p.heading.y, p.heading.x), swept: 0, pause: 0, hits: 0, hit: new Set() };
    else if (id === 'rushStrike') this.rush = { def, dir, traveled: 0, hit: new Set() };
    else if (id === 'bladeWave') this.projectiles.push({ def, x: p.pos.x, y: p.pos.y, dir, traveled: 0, hit: new Set() });
    this.remaining[slot] = def.cooldown;
    return true;
  }

  hitEnemy(e, damage, dir, { critChance = this.combatCfg.critChance, chainIndex = 0 } = {}) {
    const c = this.combatCfg;
    const crit = this.rng() < critChance;
    const dmg = Math.round(damage * (crit ? c.critMultiplier : 1));
    const kind = crit ? 'crit' : 'strong';
    const { killed } = e.takeHit({ damage: dmg, knockDir: dir, knockback: c.knockback[kind], stagger: c.stagger[kind] });
    const pos = { x: e.pos.x, y: e.pos.y };
    this.events.emit('hit', { enemy: e, damage: dmg, crit, strong: true, chainIndex, pos, dir });
    if (killed) this.events.emit('kill', { enemy: e, pos, dir, crit });
  }

  // Clockwise blade sweep around the player. Enemies are hit in the order the blade passes them;
  // each hit pauses the sweep briefly and counts as the next chain hit (more damage, more crit).
  updateSpin(dt) {
    const s = this.spin;
    const def = s.def;
    if (s.pause > 0) { s.pause -= dt; return; }
    const TAU = Math.PI * 2;
    const next = Math.min(TAU, s.swept + (TAU / def.duration) * dt);
    const p = this.player.pos;
    let first = null, firstRel = Infinity, firstDir = null;
    for (const e of this.enemies.targetable()) {
      if (s.hit.has(e.id)) continue;
      const dx = e.pos.x - p.x, dy = e.pos.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d - e.radius > def.radius) continue;
      let rel = (Math.atan2(dy, dx) - s.start) % TAU;
      if (rel < 0) rel += TAU;
      if (rel > next) continue;
      if (rel < firstRel) { first = e; firstRel = rel; firstDir = d > 1e-6 ? { x: dx / d, y: dy / d } : this.player.heading; }
    }
    if (first) {
      s.hit.add(first.id);
      s.swept = Math.max(s.swept, firstRel);
      s.pause = def.hitPause;
      const damage = def.damage * (1 + def.chainDamageStep * s.hits);
      this.hitEnemy(first, damage, firstDir, { critChance: this.spinCritChance(s.hits), chainIndex: s.hits });
      s.hits += 1;
      return;
    }
    s.swept = next;
    if (s.swept >= TAU - 1e-9) this.spin = null;
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

    if (this.spin) this.updateSpin(dt);

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
