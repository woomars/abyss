// The eight worn slots. Sums what the worn items give: stats, legendary effects, set counts and
// set bonuses. Pure.
import { zeroStats, addStats } from '../Stats.js';
import { itemStats } from './itemStats.js';

export const LOADOUT_SLOTS = ['weapon', 'helm', 'armor', 'gloves', 'boots', 'amulet', 'ring1', 'ring2'];

export class Loadout {
  constructor(cfg) {
    this.cfg = cfg; // config.items (live)
    this.slots = {};
    for (const s of LOADOUT_SLOTS) this.slots[s] = null;
  }

  // which loadout slot an item goes to: rings take the first empty ring slot (else ring1)
  slotFor(item, slot = null) {
    if (item.slot !== 'ring') return item.slot;
    if (slot === 'ring1' || slot === 'ring2') return slot;
    return !this.slots.ring1 ? 'ring1' : !this.slots.ring2 ? 'ring2' : 'ring1';
  }

  // wear an item; returns the item it replaced (or null)
  equip(item, slot = null) {
    const s = this.slotFor(item, slot);
    const old = this.slots[s];
    this.slots[s] = item;
    return old;
  }

  unequip(slot) {
    const it = this.slots[slot];
    this.slots[slot] = null;
    return it;
  }

  items() { return LOADOUT_SLOTS.map((s) => this.slots[s]).filter(Boolean); }

  find(id) {
    for (const s of LOADOUT_SLOTS) if (this.slots[s] && this.slots[s].id === id) return s;
    return null;
  }

  summary() {
    const cfg = this.cfg, stats = zeroStats(), effects = new Set(), sets = {};
    for (const it of this.items()) {
      addStats(stats, itemStats(it, cfg));
      if (it.effect) effects.add(it.effect);
      if (it.set) sets[it.set] = (sets[it.set] || 0) + 1;
    }
    for (const [id, n] of Object.entries(sets)) {
      const bonuses = cfg.sets[id].bonuses;
      for (const [need, b] of Object.entries(bonuses)) {
        if (n < Number(need)) continue;
        if (b.effect) effects.add(b.effect);
        addStats(stats, b);
      }
      const ang = cfg.sets[id].angles; // 질풍: each piece worn widens 질풍 베기
      if (ang) stats.waveAngle += ang[Math.min(n, ang.length - 1)] - ang[0];
    }
    // set steps from tuning/sets.json, added up to the number of pieces worn
    const T = cfg.setTables, sum = (arr, n) => (arr || []).slice(0, n).reduce((a, b) => a + b, 0);
    if (T) for (const [id, n] of Object.entries(sets)) {
      if (id === 'abyss' && T.lightning) stats.chainStun += sum(T.lightning.stun, n);
      else if (id === 'arcaneVeil' && T.storm) { stats.spinStun += sum(T.storm.stun, n); stats.spinRadiusBonus += sum(T.storm.radius, n); }
      else if (id === 'meteor' && T.meteor) {
        const k = Math.min(n, 5) - 1;
        stats.jumpCore += T.meteor.coreRadius[k];
        stats.jumpRadiusScale += T.meteor.radiusScale[k];
        stats.jumpDistance += sum(T.meteor.distance, n);
        stats.jumpKnockback += sum(T.meteor.knockback, n);
      } else if (id === 'gravecall' && T.wraith) stats.wraithStun += sum(T.wraith.stun, n);
    }
    if (effects.has('storm')) stats.chainRange += cfg.effects.storm.chainRange;
    if (effects.has('earthStep')) { stats.dashRange += cfg.effects.earthStep.dashRange; stats.knockback += cfg.effects.earthStep.knockback; } // 지진의 장화
    return { stats, effects, sets };
  }

  toJSON() { return { ...this.slots }; }

  static fromJSON(data, cfg) {
    const l = new Loadout(cfg);
    if (data && typeof data === 'object') for (const s of LOADOUT_SLOTS) if (data[s] && typeof data[s] === 'object') l.slots[s] = data[s];
    return l;
  }
}
