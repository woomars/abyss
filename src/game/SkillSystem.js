// Three equipped special attacks with individual cooldowns.
// Skills are data-defined (config.skills.defs) and equipped into slots (config.skills.slots).
import { NO_BONUS } from './Relics.js';
import { grownDef } from './SkillGrowth.js';
import { clampStun, bossScale, jumpStun, spinStun } from './stun.js';

export class SkillSystem {
  constructor(cfg, { player, movement, enemies, combat, combatCfg, events, rng, arena, bonus = null, ups = null, gear = null, gearCfg = null, stopCost = null }) {
    this.stopCost = stopCost || (() => 0); // () => seconds the game slows on a strong hit (hit stop), counted in the spin's pause budget
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

  // aim preview while a directional button is held (drawn by the renderer); dir null = the jump's own pick
  setAim(slot, dir) { this.aim = { slot, dir: dir ? { x: dir.x, y: dir.y, len: dir.len } : null }; }

  // the farthest targetable foe within maxDist: { dir, dist } or null
  farthestInRange(maxDist) {
    const p = this.player.pos;
    let best = null, bd = -1;
    for (const e of this.enemies.targetable()) {
      const dx = e.pos.x - p.x, dy = e.pos.y - p.y, d = Math.hypot(dx, dy);
      if (d > maxDist || d < 1e-6 || d <= bd) continue;
      bd = d; best = { dir: { x: dx / d, y: dy / d }, dist: d };
    }
    return best;
  }

  // where the jump goes: a plain press = the farthest foe in reach (none: the running way, full reach);
  // aim { x, y, len } = that way, distance from the drag length (30 px dead zone, full reach at 150 px,
  // never under 15%); aim without len = that way at full reach. Walls and pillars stop the leap itself.
  jumpPlan(aim) {
    const plan = this.jumpWay(aim), ar = this.arena, p = this.player;
    if (!ar) return plan;
    let d = 0; // the leap comes down before the first wall or pillar on its way (the preview shows the same spot)
    while (d < plan.dist) {
      const n = Math.min(plan.dist, d + 8);
      if (ar.resolveCircle({ x: p.pos.x + plan.dir.x * n, y: p.pos.y + plan.dir.y * n }, p.radius).hitWall) break;
      d = n;
    }
    return { dir: plan.dir, dist: d };
  }

  jumpWay(aim) {
    const max = this.jumpReach();
    const l = aim ? Math.hypot(aim.x, aim.y) : 0;
    if (l > 1e-6) {
      const k = aim.len == null ? 1 : Math.max(0.15, Math.min(1, (aim.len - 30) / 120));
      return { dir: { x: aim.x / l, y: aim.y / l }, dist: max * k };
    }
    const far = this.farthestInRange(max);
    if (far) return far;
    const p = this.player, hd = p.heading && Math.hypot(p.heading.x, p.heading.y) > 1e-6 ? p.heading : this.combat.inputDir;
    const hl = Math.hypot(hd.x, hd.y) || 1;
    return { dir: { x: hd.x / hl, y: hd.y / hl }, dist: max };
  }
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
    if (id === 'spin') this.spin = { def, start: Math.atan2(p.heading.y, p.heading.x), swept: 0, pause: 0, hits: 0, hit: new Set(), hit2: new Set(), twin: this.gear().has('twinBlade'), radius: this.spinRadius() };
    else if (id === 'rushStrike') { // 점프: the airtime never changes — a longer leap flies faster, a short hop slower
      const base = this.cfg.defs.rushStrike, air = (base.distance || def.distance) / (base.speed || def.speed);
      const plan = this.jumpPlan(aimDir);
      this.rush = { def, dir: plan.dir, traveled: 0, dist: plan.dist, speed: plan.dist / air };
      this.events.emit('jumpAim', { dir: plan.dir, dist: plan.dist });
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
  hitEnemy(e, damage, dir, { critChance = this.combatCfg.critChance + this.bonus().crit, chainIndex = 0, skill = null, knockback = null, stunChance = null, noStop = false } = {}) {
    const c = this.combatCfg;
    const crit = this.rng() < critChance;
    const b = this.bonus();
    const dmg = Math.round(damage * (1 + b.damage + b.skillDamage) * (crit ? c.critMultiplier + b.critDamage : 1));
    const kind = crit ? 'crit' : 'strong';
    const { killed } = e.takeHit({ damage: dmg, knockDir: dir, knockback: (knockback != null ? knockback : c.knockback[kind]) * (1 + b.knockback), stagger: c.stagger[kind] });
    const pos = { x: e.pos.x, y: e.pos.y };
    this.events.emit('hit', { enemy: e, damage: dmg, crit, strong: true, chainIndex, pos, dir, skill, noStop });
    if (killed) { this.events.emit('kill', { enemy: e, pos, dir, crit }); return; }
    // special attacks usually stun, and a stunned enemy forgets the attack it was building up
    const st = this.cfg.stun;
    const own = clampStun(stunChance == null ? (st ? st.chance : 0) : stunChance);
    const chance = st && e.isBoss ? bossScale(own, st.bossChance / st.chance) : own; // bosses: ~44% even for a certain stun
    if (st && chance > 0 && this.rng() < chance) {
      const k = this.gear().has('stunUp') ? ((this.gearCfg().stunUp || {}).mult || 1) : 1; // 천둥 망치
      e.stun((e.isBoss ? st.bossDuration : st.duration) * k);
      this.events.emit('stun', { enemy: e, pos });
    }
  }

  // Clockwise blade sweep around the player. Enemies are hit in the order the blade passes them;
  // each hit counts as the next chain hit (more damage, more crit) and may pause the sweep briefly — but
  // the pauses add up to at most maxPause seconds, and the blade turns at least pauseMinTurn degrees
  // between two pauses, so a crowd never holds the blade still (the rest are struck as it goes by).
  updateSpin(dt) {
    const s = this.spin;
    const def = s.def;
    if (s.pause > 0) { // the rest of the step after a pause ends goes on sweeping
      s.pause -= dt;
      if (s.pause >= 0) return;
      dt = -s.pause; s.pause = 0;
    }
    const TAU = Math.PI * 2;
    const next = Math.min(TAU, s.swept + (TAU / def.duration) * dt);
    const p = this.player.pos;
    const maxPause = def.maxPause != null ? def.maxPause : Infinity, minTurn = ((def.pauseMinTurn || 0) * Math.PI) / 180;
    for (;;) {
      // each blade strikes a foe once; the 폭풍 set's second blade starts opposite and turns the other way
      let first = null, firstRel = Infinity, firstDir = null, firstSet = null;
      const R = s.radius || def.radius;
      for (const e of this.enemies.targetable()) {
        const dx = e.pos.x - p.x, dy = e.pos.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d - e.radius > R) continue;
        const ang = Math.atan2(dy, dx), dirE = d > 1e-6 ? { x: dx / d, y: dy / d } : this.player.heading;
        if (!s.hit.has(e.id)) {
          let rel = (ang - s.start) % TAU;
          if (rel < 0) rel += TAU;
          if (rel <= next && rel < firstRel) { first = e; firstRel = rel; firstDir = dirE; firstSet = s.hit; }
        }
        if (s.twin && !s.hit2.has(e.id)) {
          let rel2 = (s.start + Math.PI - ang) % TAU;
          if (rel2 < 0) rel2 += TAU;
          if (rel2 <= next && rel2 < firstRel) { first = e; firstRel = rel2; firstDir = dirE; firstSet = s.hit2; }
        }
      }
      if (!first) break;
      firstSet.add(first.id);
      s.swept = Math.max(s.swept, firstRel);
      // a pause (with its hit stop) only while the budget lasts and the blade has turned far enough
      const left = maxPause - (s.paused || 0), stop = this.stopCost();
      const pause = left > 1e-9 && (s.pausedAt == null || firstRel - s.pausedAt >= minTurn - 1e-9);
      const damage = this.baseDamage('spin') * (1 + def.chainDamageStep * s.hits);
      const fd = Math.hypot(first.pos.x - p.x, first.pos.y - p.y);
      const stun = spinStun(fd, R, (this.cfg.stun ? this.cfg.stun.chance : 0) + (this.bonus().spinStun || 0), def.nearZero != null ? def.nearZero : 0.4); // the far part of the blade stuns
      this.hitEnemy(first, damage, firstDir, { critChance: this.spinCritChance(s.hits), chainIndex: s.hits, skill: 'spin', noStop: !pause, stunChance: stun });
      s.hits += 1;
      if (!this.spin) return; // the room ended under the blade
      if (pause) {
        s.pause = Math.max(0, Math.min(def.hitPause, left - stop));
        s.paused = (s.paused || 0) + s.pause + stop;
        s.pausedAt = firstRel;
        return;
      }
    }
    s.swept = next;
    if (s.swept >= TAU - 1e-9) this.spin = null;
  }

  // the spin's blade length: 75 (+ growth cards in def.radius) grown by the 폭풍 set
  spinRadius() {
    const up = (this.ups().spin || {}).radius || 0; // growth cards and the set add up: 75 x (1 + growth + 폭풍)
    return this.cfg.defs.spin.radius * (1 + up + (this.bonus().spinRadiusBonus || 0));
  }

  // the jump's full reach (growth cards, then the 유성 set)
  jumpReach() { return this.def('rushStrike').distance * (1 + (this.bonus().jumpDistance || 0)); }

  // the hero's attack (base + flat): every special attack is a share of it (spin 1.1, wave 1.2, jump 0.1)
  charDamage() { return this.combatCfg.attackDamage + (this.bonus().attackFlat || 0); }
  baseDamage(id) { return this.charDamage() * (this.def(id).mult || 0); }

  // the landing circle: base size and damage, grown by worn set pieces (jumpRadius / jumpDamage), the
  // 지진의 장화 legendary (rushSlam) and the hero's base attack (level-ups and flat attack raise it too)
  landing(def) {
    const b = this.bonus(), c = this.combatCfg;
    return {
      radius: def.radius * (b.jumpRadiusScale || 1) * (1 + (b.jumpRadius || 0)), // 유성 set (up to 150%) and the essence of the leap
      damage: this.baseDamage('rushStrike') * (1 + (b.jumpDamage || 0)),
    };
  }

  // the jump comes down: everything inside the landing circle is struck and thrown back, away from the
  // landing spot (no chain dash follows)
  land(r) {
    const p = this.player.pos, { radius, damage } = this.landing(r.def);
    const hit = new Set(), b = this.bonus(), core = b.jumpCore || r.def.coreRadius || 0.2;
    this.events.emit('jumpLand', { pos: { x: p.x, y: p.y }, radius });
    const pull = this.gear().has('meteorPull'); // 유성 5세트: the landing draws the foes around into its core
    if (pull) {
      const band = (this.gearCfg().meteorPull || {}).pullBand != null ? this.gearCfg().meteorPull.pullBand : 0.2;
      const moves = [];
      for (const e of this.enemies.targetable()) {
        const dx = e.pos.x - p.x, dy = e.pos.y - p.y, d = Math.hypot(dx, dy);
        if (d < 1e-6 || d > radius * (1 + band)) continue;
        if ((e.tcfg && e.tcfg.knockbackResist >= 1) || (this.arena && this.arena.blocks(p, e.pos))) continue; // bosses, magic circles and foes behind a pillar stay put
        const to = d <= radius ? Math.min(d, radius * core * 0.9) : radius * (core + (1 - core) * ((d - radius) / (radius * band))) - 1; // inside: into the core; beyond: onto the outer rings
        moves.push({ from: { x: e.pos.x, y: e.pos.y }, to: { x: p.x + (dx / d) * to, y: p.y + (dy / d) * to } });
        e.pos.x = p.x + (dx / d) * to; e.pos.y = p.y + (dy / d) * to;
        e.prevPos.x = e.pos.x; e.prevPos.y = e.pos.y;
      }
      this.events.emit('meteorPull', { pos: { x: p.x, y: p.y }, radius: radius * (1 + band), core: radius * core, moves });
    }
    for (const e of this.enemies.targetable()) {
      const dx = e.pos.x - p.x, dy = e.pos.y - p.y, d = Math.hypot(dx, dy);
      if (d > radius + e.radius) continue;
      hit.add(e.id);
      const kb = pull ? 0 : r.def.knockback * (1 + (b.jumpKnockback || 0)); // the pull replaces the push
      this.hitEnemy(e, damage, d > 1e-6 ? { x: dx / d, y: dy / d } : r.dir, { skill: 'rushStrike', knockback: kb, stunChance: jumpStun(d, radius, core, r.def.outerZones || [0.5, 0]) });
    }
    return hit.size;
  }

  // 질풍 베기 is a cone of `angle` degrees (wider with 질풍 set pieces: waveAngle, and with 세 갈래 팔찌:
  // waveFan), never narrower than the blade's own `width` up close. Inside sword reach (`near`) it hits at full damage and full stun chance; beyond, both
  // fall off toward the far end (damage by fallDamage, stun by fallStun). The 질풍 set adds damage and
  // close-range stun and softens the fall-off (waveDamage, waveStun, waveFalloff).
  waveAngle(def) {
    const fan = 0;
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
      damage: this.baseDamage('bladeWave') * (1 + (b.waveDamage || 0)) * (1 - (def.fallDamage || 0) * f * soft),
      stun: Math.min(1, (def.stunNear != null ? def.stunNear : 0.5) + (b.waveStun || 0)) * (1 - (def.fallStun || 0) * f * soft),
    };
  }

  // the gale strikes what it passes; like the spin's blade it may hold still a moment on a hit — the holds
  // add up to maxPause seconds at most (hit stop included), and it flies on at least pauseMinTravel of its
  // reach between two holds. Returns true when it holds.
  waveSweep(pr) {
    const def = pr.def, half = this.waveWidth(def, pr.traveled) / 2, { damage, stun } = this.waveAt(def, pr.traveled);
    let held = false;
    for (const e of this.enemies.targetable()) {
      if (pr.hit.has(e.id)) continue;
      if (Math.hypot(e.pos.x - pr.x, e.pos.y - pr.y) > half + e.radius) continue;
      pr.hit.add(e.id);
      const left = (def.maxPause || 0) - (pr.paused || 0), stop = this.stopCost();
      const hold = !held && def.hitPause > 0 && left > 1e-9 && (pr.pausedAt == null || pr.traveled - pr.pausedAt >= (def.pauseMinTravel || 0) * def.range - 1e-9);
      this.hitEnemy(e, damage, pr.dir, { skill: 'bladeWave', stunChance: stun, noStop: !hold });
      if (hold) {
        held = true;
        pr.pause = Math.max(0, Math.min(def.hitPause, left - stop));
        pr.paused = (pr.paused || 0) + pr.pause + stop;
        pr.pausedAt = pr.traveled;
      }
    }
    return held;
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
      let pdt = dt;
      if (pr.pause > 0) { // held on a hit; the rest of the step after the hold flies on
        pr.pause -= pdt;
        if (pr.pause >= 0) continue;
        pdt = -pr.pause; pr.pause = 0;
      }
      const stepLen = pr.def.speed * pdt;
      const n = Math.max(1, Math.ceil(stepLen / 20));
      for (let k = 0; k < n; k++) {
        pr.x += pr.dir.x * stepLen / n;
        pr.y += pr.dir.y * stepLen / n;
        pr.traveled += stepLen / n;
        if (this.arena.resolveCircle({ x: pr.x, y: pr.y }, 4).hitWall) { pr.blocked = true; break; } // pillars and walls stop it
        if (this.waveSweep(pr)) break; // holds here (what is left of this step is lost to the hold)
        if (pr.traveled >= pr.def.range) break;
      }
      const out = pr.x < 0 || pr.y < 0 || pr.x > this.arena.width || pr.y > this.arena.height;
      if (pr.traveled >= pr.def.range || out || pr.blocked) this.projectiles.splice(i, 1);
    }
  }
}
