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
    this.stiff = 0; // stiffness after the jump lands: no moving, and no longer untouchable
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
    const auto = def.directional && !(len > 1e-6) ? this.nearestDir() : null; // a plain tap goes at the nearest enemy (the jump too)
    const hd = p.heading && Math.hypot(p.heading.x, p.heading.y) > 1e-6 ? p.heading : this.combat.inputDir;
    const dir = len > 1e-6 && def.directional
      ? { x: aimDir.x / len, y: aimDir.y / len }
      : auto || (id === 'rushStrike' ? { x: hd.x, y: hd.y } : { x: this.combat.inputDir.x, y: this.combat.inputDir.y }); // no enemy: the jump goes the way the hero is moving
    this.events.emit('skill', { id, pos: { x: p.pos.x, y: p.pos.y }, dir });
    if (id === 'spin') this.spin = { def, start: Math.atan2(p.heading.y, p.heading.x), swept: 0, pause: 0, hits: 0, hit: new Set() };
    else if (id === 'rushStrike') { // 점프: the distance grows with the growth cards, the airtime never does (a longer leap flies faster)
      const base = this.cfg.defs.rushStrike;
      this.rush = { def, dir, traveled: 0, dist: def.distance, speed: def.speed * (def.distance / (base.distance || def.distance)) };
    }
    else if (id === 'bladeWave') {
      const angle = this.waveAngle(def); // 질풍 베기: the blade sweeps the cone, the gale flies on
      this.events.emit('slash', { pos: { x: p.pos.x, y: p.pos.y }, dir: { x: dir.x, y: dir.y }, radius: 70, arcDeg: angle, chainIndex: 0, strong: true, wave: true });
      this.projectiles.push({ def, x: p.pos.x, y: p.pos.y, ox: p.pos.x, oy: p.pos.y, angle, dir, traveled: 0, hit: new Set() });
    }
    this.remaining[slot] = this.cooldownOf(def);
    return true;
  }

  // stunChance: this hit's own stun chance against ordinary enemies (bosses get it scaled by bossChance / chance)
  hitEnemy(e, damage, dir, { critChance = this.combatCfg.critChance + this.bonus().crit, chainIndex = 0, skill = null, knockback = null, stunChance = null } = {}) {
    const c = this.combatCfg;
    const crit = this.rng() < critChance;
    const b = this.bonus();
    const dmg = Math.round(damage * (1 + b.damage + b.skillDamage) * (crit ? c.critMultiplier + b.critDamage : 1));
    const kind = crit ? 'crit' : 'strong';
    const { killed } = e.takeHit({ damage: dmg, knockDir: dir, knockback: (knockback != null ? knockback : c.knockback[kind]) * (1 + b.knockback), stagger: c.stagger[kind] });
    const pos = { x: e.pos.x, y: e.pos.y };
    this.events.emit('hit', { enemy: e, damage: dmg, crit, strong: true, chainIndex, pos, dir, skill });
    if (killed) { this.events.emit('kill', { enemy: e, pos, dir, crit }); return; }
    // special attacks usually stun, and a stunned enemy forgets the attack it was building up
    const st = this.cfg.stun;
    const chance = stunChance == null ? (e.isBoss ? st && st.bossChance : st && st.chance) : (e.isBoss ? stunChance * (st.bossChance / st.chance) : stunChance);
    if (st && this.rng() < chance) {
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

  // the landing circle: base size and damage, grown by worn set pieces (jumpRadius / jumpDamage), the
  // 지진의 장화 legendary (rushSlam) and the hero's base attack (level-ups and flat attack raise it too)
  landing(def) {
    const b = this.bonus(), c = this.combatCfg;
    const slam = this.gear().has('rushSlam') ? (this.gearCfg().rushSlam || {}) : {};
    const base = c.attackDamage > 0 ? (c.attackDamage + (b.attackFlat || 0)) / c.attackDamage : 1;
    return {
      radius: def.radius * (1 + (b.jumpRadius || 0) + (slam.radius || 0)),
      damage: def.damage * base * (1 + (b.jumpDamage || 0) + (slam.damage || 0)),
    };
  }

  // the jump comes down: everything inside the landing circle is struck and thrown back, away from the
  // landing spot (no chain dash follows)
  land(r) {
    const p = this.player.pos, { radius, damage } = this.landing(r.def);
    const hit = new Set();
    this.events.emit('jumpLand', { pos: { x: p.x, y: p.y }, radius });
    for (const e of this.enemies.targetable()) {
      const dx = e.pos.x - p.x, dy = e.pos.y - p.y, d = Math.hypot(dx, dy);
      if (d > radius + e.radius) continue;
      hit.add(e.id);
      this.hitEnemy(e, damage, d > 1e-6 ? { x: dx / d, y: dy / d } : r.dir, { skill: 'rushStrike', knockback: r.def.knockback });
    }
    return hit.size;
  }

  // 질풍 베기 is a cone of `angle` degrees (wider with 질풍 set pieces: waveAngle, and with 세 갈래 팔찌:
  // waveFan), never narrower than the blade's own `width` up close. Inside sword reach (`near`) it hits at full damage and full stun chance; beyond, both
  // fall off toward the far end (damage by fallDamage, stun by fallStun). The 질풍 set adds damage and
  // close-range stun and softens the fall-off (waveDamage, waveStun, waveFalloff).
  waveAngle(def) {
    const fan = this.gear().has('waveFan') ? ((this.gearCfg().waveFan || {}).angle || 0) : 0;
    return Math.min(170, (def.angle || 60) + (this.bonus().waveAngle || 0) + fan);
  }

  waveWidth(def, traveled) {
    const half = (this.waveAngle(def) * Math.PI / 180) / 2;
    return Math.max(def.width, 2 * Math.min(traveled, def.range) * Math.tan(half));
  }

  waveAt(def, dist) {
    const b = this.bonus();
    const f = Math.max(0, Math.min(1, (dist - (def.near || 0)) / Math.max(1, def.range - (def.near || 0))));
    const soft = 1 - Math.min(1, b.waveFalloff || 0);
    return {
      damage: def.damage * (1 + (b.waveDamage || 0)) * (1 - (def.fallDamage || 0) * f * soft),
      stun: Math.min(1, (def.stunNear != null ? def.stunNear : 0.5) + (b.waveStun || 0)) * (1 - (def.fallStun || 0) * f * soft),
    };
  }

  waveSweep(pr) {
    const half = this.waveWidth(pr.def, pr.traveled) / 2, { damage, stun } = this.waveAt(pr.def, pr.traveled);
    for (const e of this.enemies.targetable()) {
      if (pr.hit.has(e.id)) continue;
      if (Math.hypot(e.pos.x - pr.x, e.pos.y - pr.y) > half + e.radius) continue;
      pr.hit.add(e.id);
      this.hitEnemy(e, damage, pr.dir, { skill: 'bladeWave', stunChance: stun });
    }
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
      // 점프: a leap (the hero cannot be hit while airborne), then a slam all around the landing spot
      const stepLen = Math.min((r.speed || r.def.speed) * dt, r.dist - r.traveled);
      const { blocked } = this.movement.step(r.dir, stepLen);
      this.player.visualAngle = Math.atan2(r.dir.y, r.dir.x);
      r.traveled += stepLen;
      if (blocked || r.traveled >= r.dist - 1e-6) {
        this.rush = null;
        this.stiff = r.def.recover || 0;
        this.land(r);
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
        this.waveSweep(pr);
        if (pr.traveled >= pr.def.range) break;
      }
      const out = pr.x < 0 || pr.y < 0 || pr.x > this.arena.width || pr.y > this.arena.height;
      if (pr.traveled >= pr.def.range || out || pr.blocked) this.projectiles.splice(i, 1);
    }
  }
}
