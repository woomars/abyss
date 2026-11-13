// Three equipped special attacks with individual cooldowns.
// Skills are data-defined (config.skills.defs) and equipped into slots (config.skills.slots).
import { NO_BONUS } from './Relics.js';
import { grownDef } from './SkillGrowth.js';

export class SkillSystem {
  constructor(cfg, { player, movement, enemies, combat, combatCfg, events, rng, arena, bonus = null, ups = null, gear = null, gearCfg = null }) {
    this.gear = gear || (() => new Set()); // () => worn legendary/set effects
    this.gearCfg = gearCfg || (() => ({})); // () => config.items.effects
    this.ups = ups || (() => ({})); // () => growth per skill (SkillGrowth.skillUps)
    this.cfg = cfg; // config.skills (live)
    this.bonus = bonus || (() => NO_BONUS); // () => relic stat bonuses (damage, crit, cooldown)
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
    this.stiff = 0; // stiffness after the roll's thrust: no moving, and no longer untouchable
  }

  get slots() {
    return this.cfg.slots.map((id, i) => {
      const d = this.def(id);
      return { id, name: d.name, cooldown: this.cooldownOf(d), remaining: this.remaining[i] };
    });
  }

  // the definition with this family's growth cards applied
  def(id) { return grownDef(this.cfg.defs[id], this.ups()[id], this.cfg.growth); }

  // nearest targetable enemy's direction from the player (null when none)
  nearestDir() {
    const p = this.player.pos;
    let best = null, bd = Infinity;
    for (const e of this.enemies.targetable()) {
      const d = Math.hypot(e.pos.x - p.x, e.pos.y - p.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best || bd < 1e-6) return null;
    return { x: (best.pos.x - p.x) / bd, y: (best.pos.y - p.y) / bd };
  }

  cooldownOf(def) { return def.cooldown * Math.max(0.2, 1 - this.bonus().cooldown); }

  get busy() { return this.rush !== null || this.stiff > 0; } // blocks movement and auto attacks (roll, then its stiffness)
  get spinning() { return this.spin !== null; } // blocks auto attacks, player keeps moving

  // stop skills in flight (room change) but keep cooldowns
  cancelActive() {
    this.stiff = 0;
    this.rush = null;
    this.spin = null;
    this.projectiles.length = 0;
    this.aim = null;
  }

  reset() {
    this.remaining = this.cfg.slots.map(() => 0);
    this.stiff = 0;
    this.rush = null;
    this.spin = null;
    this.projectiles.length = 0;
    this.aim = null;
  }

  spinCritChance(hitIndex) {
    return this.combatCfg.critChance + this.bonus().crit + this.cfg.defs.spin.chainCritStep * hitIndex;
  }

  isDirectional(slot) {
    const id = this.cfg.slots[slot];
    return !!(id && this.cfg.defs[id].directional);
  }

  // aim preview while a directional button is held (drawn by the renderer)
  setAim(slot, dir) { this.aim = { slot, dir: { x: dir.x, y: dir.y } }; }
  clearAim() { this.aim = null; }

  // aimDir: optional direction for directional skills (button drag); a plain tap aims at the nearest
  // enemy, or the input direction when there is none
  use(slot, aimDir = null) {
    const id = this.cfg.slots[slot];
    if (!id || this.remaining[slot] > 0 || this.busy || this.spinning) return false;
    const def = this.def(id);
    this.combat.cancel();
    const p = this.player;
    const len = aimDir ? Math.hypot(aimDir.x, aimDir.y) : 0;
    const auto = def.directional && !(len > 1e-6) ? this.nearestDir() : null;
    const dir = len > 1e-6 && def.directional
      ? { x: aimDir.x / len, y: aimDir.y / len }
      : auto || { x: this.combat.inputDir.x, y: this.combat.inputDir.y };
    this.events.emit('skill', { id, pos: { x: p.pos.x, y: p.pos.y }, dir });
    if (id === 'spin') this.spin = { def, start: Math.atan2(p.heading.y, p.heading.x), swept: 0, pause: 0, hits: 0, hit: new Set() };
    else if (id === 'rushStrike') this.rush = { def, dir, traveled: 0, hit: new Set(), dist: def.distance * (1 + (this.bonus().rollRange || 0)) }; // 구르기
    else if (id === 'bladeWave') {
      this.projectiles.push({ def, x: p.pos.x, y: p.pos.y, dir, traveled: 0, hit: new Set() });
      if (this.gear().has('waveFan')) { // 세 갈래 팔찌: two more waves at an angle
        const a = ((this.gearCfg().waveFan || {}).angle || 15) * Math.PI / 180;
        for (const s of [-a, a]) this.projectiles.push({ def, x: p.pos.x, y: p.pos.y, dir: { x: dir.x * Math.cos(s) - dir.y * Math.sin(s), y: dir.x * Math.sin(s) + dir.y * Math.cos(s) }, traveled: 0, hit: new Set() });
      }
    }
    this.remaining[slot] = this.cooldownOf(def);
    return true;
  }

  hitEnemy(e, damage, dir, { critChance = this.combatCfg.critChance + this.bonus().crit, chainIndex = 0, skill = null } = {}) {
    const c = this.combatCfg;
    const crit = this.rng() < critChance;
    const b = this.bonus();
    const dmg = Math.round(damage * (1 + b.damage + b.skillDamage) * (crit ? c.critMultiplier + b.critDamage : 1));
    const kind = crit ? 'crit' : 'strong';
    const { killed } = e.takeHit({ damage: dmg, knockDir: dir, knockback: c.knockback[kind] * (1 + b.knockback), stagger: c.stagger[kind] });
    const pos = { x: e.pos.x, y: e.pos.y };
    this.events.emit('hit', { enemy: e, damage: dmg, crit, strong: true, chainIndex, pos, dir, skill });
    if (killed) { this.events.emit('kill', { enemy: e, pos, dir, crit }); return; }
    // special attacks usually stun, and a stunned enemy forgets the attack it was building up
    const st = this.cfg.stun;
    if (st && this.rng() < (e.isBoss ? st.bossChance : st.chance)) {
      const k = this.gear().has('stunUp') ? ((this.gearCfg().stunUp || {}).mult || 1) : 1; // 천둥 망치
      e.stun((e.isBoss ? st.bossDuration : st.duration) * k);
      this.events.emit('stun', { enemy: e, pos });
    }
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
      this.hitEnemy(first, damage, firstDir, { critChance: this.spinCritChance(s.hits), chainIndex: s.hits, skill: 'spin' });
      s.hits += 1;
      return;
    }
    s.swept = next;
    if (s.swept >= TAU - 1e-9) this.spin = null;
  }

  // the thrust that ends a roll: everything along a short lane ahead is hit hard; if anything was hit,
  // an automatic chain dash carries on from there
  thrust(r) {
    const th = r.def.thrust, p = this.player.pos, dir = r.dir;
    const hit = new Set();
    this.events.emit('slash', { pos: { x: p.x, y: p.y }, dir: { x: dir.x, y: dir.y }, radius: th.length, arcDeg: 22, chainIndex: 0, strong: false, thrust: true });
    const n = Math.ceil(th.length / 20);
    for (let k = 1; k <= n; k++) this.sweep(p.x + dir.x * th.length * (k / n), p.y + dir.y * th.length * (k / n), th.width / 2, hit, dir, r.def.damage, 'rushStrike');
    this.events.emit('thrust', { pos: { x: p.x, y: p.y }, dir: { x: dir.x, y: dir.y }, hits: hit.size });
    if (hit.size) this.combat.chainFrom(dir, hit);
    return hit.size;
  }

  // hits targetable enemies whose center is within halfWidth (+radius) of point (x, y)
  sweep(x, y, halfWidth, hitSet, dir, damage, skill = null) {
    for (const e of this.enemies.targetable()) {
      if (hitSet.has(e.id)) continue;
      if (Math.hypot(e.pos.x - x, e.pos.y - y) > halfWidth + e.radius) continue;
      hitSet.add(e.id);
      this.hitEnemy(e, damage, dir, { skill });
    }
  }

  update(dt) {
    for (let i = 0; i < this.remaining.length; i++) {
      if (this.remaining[i] > 0) this.remaining[i] = Math.max(0, this.remaining[i] - dt);
    }

    if (this.spin) this.updateSpin(dt);
    if (this.stiff > 0) this.stiff = Math.max(0, this.stiff - dt);

    if (this.rush) {
      const r = this.rush;
      // 구르기: a short roll (the hero cannot be hit meanwhile), then a strong thrust straight ahead
      const stepLen = Math.min(r.def.speed * dt, r.dist - r.traveled);
      const { blocked } = this.movement.step(r.dir, stepLen);
      this.player.visualAngle = Math.atan2(r.dir.y, r.dir.x);
      r.traveled += stepLen;
      if (blocked || r.traveled >= r.dist - 1e-6) {
        this.rush = null;
        this.stiff = r.def.recover || 0;
        this.thrust(r);
        this.events.emit('rushEnd', { pos: { x: this.player.pos.x, y: this.player.pos.y }, dir: r.dir });
        if (!this.combat.inCombat) this.movement.setDirection(this.combat.inputDir, { burst: false });
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
        if (this.arena.resolveCircle({ x: pr.x, y: pr.y }, 4).hitWall) { pr.blocked = true; break; } // pillars and walls stop it
        this.sweep(pr.x, pr.y, pr.def.width / 2, pr.hit, pr.dir, pr.def.damage, 'bladeWave');
        if (pr.traveled >= pr.def.range) break;
      }
      const out = pr.x < 0 || pr.y < 0 || pr.x > this.arena.width || pr.y > this.arena.height;
      if (pr.traveled >= pr.def.range || out || pr.blocked) this.projectiles.splice(i, 1);
    }
  }
}
