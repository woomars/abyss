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
    const sj = cfg.setJump; // each worn set piece, of any set, widens and strengthens the jump's landing
    if (sj) {
      const pieces = Object.values(sets).reduce((a, b) => a + b, 0);
      stats.jumpRadius += sj.radius * pieces;
      stats.jumpDamage += sj.damage * pieces;
    }
    for (const [id, n] of Object.entries(sets)) {
      const bonuses = cfg.sets[id].bonuses;
      for (const [need, b] of Object.entries(bonuses)) {
        if (n < Number(need)) continue;
        if (b.effect) effects.add(b.effect);
        addStats(stats, b);
      }
    }
    if (effects.has('storm')) stats.chainRange += cfg.effects.storm.chainRange;
    return { stats, effects, sets };
  }

  toJSON() { return { ...this.slots }; }

  static fromJSON(data, cfg) {
    const l = new Loadout(cfg);
    if (data && typeof data === 'object') for (const s of LOADOUT_SLOTS) if (data[s] && typeof data[s] === 'object') l.slots[s] = data[s];
    return l;
  }
}
