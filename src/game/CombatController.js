import { selectAttackTarget, selectChainTarget, slashHits } from './Targeting.js';
import { NO_BONUS } from './Relics.js';

const CONTACT_PAD = 8;
const LINK_MAX_TIME = 0.15;

// Auto-attack state machine: move -> dash -> (strike) -> link -> dash ... -> move.
// Attack-first: once a target is chosen the character leaves its line to rush and chain.
export class CombatController {
  constructor(cfg, { player, movement, enemies, camera, events, rng, viewRect = null, bonus = null }) {
    this.cfg = cfg; // config.combat (live)
    this.bonus = bonus || (() => NO_BONUS); // () => relic stat bonuses (damage, crit, chain)
    this.viewRect = viewRect; // () => world rect on screen; off-screen enemies are never targeted
    this.player = player;
    this.movement = movement;
    this.enemies = enemies;
    this.camera = camera;
    this.events = events;
    this.rng = rng;
    this._state = 'move';
    this.target = null;
    this.chainIndex = 0;
    this.excludeIds = new Set();
    this.dashTime = 0;
    this.linkPoint = null;
    this.linkTime = 0;
    this.retryTimer = 0;
    this.armTimer = 0; // > 0: a recent swipe allows ONE dash+chain sequence
    this.normalTimer = 0; // cooldown of the in-place normal attack
    this.inputDir = { x: player.heading.x, y: player.heading.y };
  }

  get armed() { return this.armTimer > 0; }

  get chainCount() { return this.cfg.chain.count + this.bonus().chain; }
  get slashRadius() { return this.cfg.slashRadius * (1 + this.bonus().range); }

  get state() { return this._state; }

  // targetable enemies fully inside the visible screen
  candidates() {
    const list = this.enemies.targetable();
    if (!this.viewRect) return list;
    const r = this.viewRect();
    return list.filter((e) => {
      const m = e.radius;
      return e.pos.x >= r.x + m && e.pos.x <= r.x + r.w - m && e.pos.y >= r.y + m && e.pos.y <= r.y + r.h - m;
    });
  }
  get inCombat() { return this._state !== 'move'; }

  // long continuous drawing: steer only (never cancels or arms an attack)
  onStroke({ dir }) {
    this.inputDir = { x: dir.x, y: dir.y };
  }

  // short quick flick: cancel the current chain and arm one dash+chain in that direction
  onFlick(dir) {
    this.inputDir = { x: dir.x, y: dir.y };
    this.retryTimer = 0;
    this.armTimer = this.cfg.rushWindow;
    if (this.inCombat) this.finish();
  }

  cancel() {
    if (this.inCombat) this.finish();
  }

  // the player was struck mid dash/chain: the chain breaks and a fresh swipe must wait a moment
  interrupt() {
    if (!this.inCombat) return false;
    const pos = { x: this.player.pos.x, y: this.player.pos.y };
    this.armTimer = 0;
    this.retryTimer = this.cfg.hurtLockout || 0;
    this.finish();
    this.events.emit('chainBroken', { pos });
    return true;
  }

  // carry on as a chain from a hit made elsewhere (the roll's thrust): the next dash goes to the nearest
  // enemy in reach that was not just hit
  chainFrom(dir, hitIds) {
    if (this.inCombat) this.finish();
    this.inputDir = { x: dir.x, y: dir.y };
    this.excludeIds.clear();
    for (const id of hitIds) this.excludeIds.add(id);
    this.chainIndex = 0;
    this.linkPoint = { x: this.player.pos.x, y: this.player.pos.y };
    this.linkTime = 0;
    this.dashFrom = null;
    this.camera.setMode('combat');
    this._state = 'link';
  }

  // hard reset for restart (no events)
  reset() {
    this._state = 'move';
    this.target = null;
    this.linkPoint = null;
    this.chainIndex = 0;
    this.excludeIds.clear();
    this.retryTimer = 0;
    this.armTimer = 0;
    this.normalTimer = 0;
    this.inputDir = { x: 1, y: 0 };
  }

  update(dt) {
    if (this.retryTimer > 0) this.retryTimer -= dt;
    if (this.armTimer > 0) this.armTimer -= dt;
    if (this.normalTimer > 0) this.normalTimer -= dt;
    if (this._state === 'move') {
      const c = this.cfg;
      // no recent swipe: no dash, only an in-place normal attack on enemies within reach
      if (!this.armed) { this.normalAttack(); return; }
      if (this.retryTimer > 0) return;
      const t = selectAttackTarget(this.player.pos, this.inputDir, this.candidates(), { range: c.dashRange * (1 + this.bonus().dashRange), coneDeg: c.attackConeDeg });
      if (!t) { this.normalAttack(); return; }
      this.armTimer = 0; // one swipe = one dash+chain sequence
      this.excludeIds.clear();
      this.chainIndex = 0;
      this.camera.setMode('combat');
      this.startDash(t);
    }
    if (this._state === 'dash') this.updateDash(dt);
    else if (this._state === 'link') this.updateLink(dt);
  }

  startDash(target) {
    this.target = target;
    this.dashTime = 0;
    this.dashFrom = { x: this.player.pos.x, y: this.player.pos.y };
    this._state = 'dash';
    this.events.emit('dashStart', { pos: { x: this.player.pos.x, y: this.player.pos.y }, target, chainIndex: this.chainIndex });
  }

  updateDash(dt) {
    const c = this.cfg;
    if (!this.target || !this.target.targetable) {
      const next = this.findChainTarget();
      if (next) { this.target = next; } else { this.finish(); return; }
    }
    const t = this.target;
    const p = this.player;
    const contact = p.radius + t.radius + CONTACT_PAD;
    if (Math.hypot(t.pos.x - p.pos.x, t.pos.y - p.pos.y) <= contact) { this.strike(); return; }
    this.dashTime += dt;
    const r = this.movement.moveToward(t.pos, c.dashSpeed, dt);
    if (Math.hypot(t.pos.x - p.pos.x, t.pos.y - p.pos.y) <= contact) { this.strike(); return; }
    if (r.blocked || this.dashTime > c.dashMaxTime) {
      this.retryTimer = c.retryDelay;
      this.finish();
    }
  }

  // in-place fan slash while moving; never interrupts movement
  normalAttack() {
    if (this.normalTimer > 0) return;
    const c = this.cfg;
    const p = this.player;
    const dir = p.heading;
    const hits = slashHits(p.pos, dir, this.candidates(), { radius: this.slashRadius, arcDeg: c.slashArcDeg, maxTargets: c.maxTargets });
    if (!hits.length) return;
    this.normalTimer = c.normalAttackInterval / (1 + this.bonus().attackSpeed);
    this.applySlash(dir, hits, 0, false);
  }

  strike() {
    const c = this.cfg;
    const p = this.player;
    const t = this.target;
    let dx = t.pos.x - p.pos.x, dy = t.pos.y - p.pos.y;
    let d = Math.hypot(dx, dy);
    const dir = d > 1e-6 ? { x: dx / d, y: dy / d } : { x: this.inputDir.x, y: this.inputDir.y };
    const hits = slashHits(p.pos, dir, this.enemies.targetable(), { radius: this.slashRadius, arcDeg: c.slashArcDeg, maxTargets: c.maxTargets });
    if (!hits.includes(t)) hits.unshift(t);
    this.applySlash(dir, hits, this.chainIndex, this.chainIndex >= this.chainCount);
    if (this.dashFrom) this.events.emit('dashHit', { from: this.dashFrom, to: { x: p.pos.x, y: p.pos.y }, target: t });
    // slash through: continue a little past the target
    this.linkPoint = { x: t.pos.x + dir.x * c.overshoot, y: t.pos.y + dir.y * c.overshoot };
    this.linkTime = 0;
    this._state = 'link';
  }

  applySlash(dir, hits, chainIndex, last) {
    const c = this.cfg, b = this.bonus();
    const p = this.player;
    this.events.emit('slash', { pos: { x: p.pos.x, y: p.pos.y }, dir, radius: this.slashRadius, arcDeg: c.slashArcDeg, chainIndex, strong: last });
    for (const e of hits) {
      const crit = this.rng() < c.critChance + b.crit;
      const strong = last;
      const kind = crit ? 'crit' : strong ? 'strong' : 'normal';
      const mult = (chainIndex > 0 ? c.chain.damageMultiplier * (1 + b.chainDamage) : 1) * (crit ? c.critMultiplier + b.critDamage : 1);
      const damage = Math.round((c.attackDamage + b.attackFlat) * mult * (1 + b.damage));
      let kdx = e.pos.x - p.pos.x, kdy = e.pos.y - p.pos.y;
      const kd = Math.hypot(kdx, kdy);
      const knockDir = kd > 1e-6 ? { x: kdx / kd, y: kdy / kd } : dir;
      const { killed } = e.takeHit({ damage, knockDir, knockback: c.knockback[kind] * (1 + b.knockback), stagger: c.stagger[kind] });
      this.excludeIds.add(e.id);
      const pos = { x: e.pos.x, y: e.pos.y };
      this.events.emit('hit', { enemy: e, damage, crit, strong, chainIndex, pos, dir: knockDir });
      if (killed) this.events.emit('kill', { enemy: e, pos, dir: knockDir, crit });
    }
  }

  updateLink(dt) {
    const c = this.cfg;
    this.linkTime += dt;
    const r = this.movement.moveToward(this.linkPoint, c.dashSpeed, dt);
    if (!(r.arrived || r.blocked || this.linkTime >= LINK_MAX_TIME)) return;
    if (this.linkTime < c.chain.linkDelay && !r.blocked) return;
    if (this.chainIndex >= this.chainCount) { this.finish(); return; }
    const next = this.findChainTarget();
    if (!next) { this.finish(); return; }
    const from = { x: this.player.pos.x, y: this.player.pos.y };
    this.chainIndex += 1;
    this.events.emit('chainLink', { from, to: { x: next.pos.x, y: next.pos.y }, chainIndex: this.chainIndex });
    this.startDash(next);
  }

  findChainTarget() {
    const ch = this.cfg.chain;
    return selectChainTarget(this.player.pos, this.inputDir, this.candidates(), {
      range: ch.range * (1 + this.bonus().chainRange), minDistance: ch.minDistance, coneDeg: ch.coneDeg, excludeIds: this.excludeIds,
    });
  }

  finish() {
    const count = this.chainIndex;
    this._state = 'move';
    this.target = null;
    this.linkPoint = null;
    this.chainIndex = 0;
    this.events.emit('chainEnd', { count });
    this.camera.setMode('normal');
    this.movement.setDirection(this.inputDir, { burst: false });
  }
}
