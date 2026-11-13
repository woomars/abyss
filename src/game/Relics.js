// Treasure cards (treasure rooms and boss chests). Stat cards are essences (정수): they go into the
// family's essence (vault.essence) and pass down to every heir; a 'life' essence (lifesteal) and the
// one-off cards (healing, gold) last this life only. `max` is a cap for the whole family. Each card also
// rolls a quality tier (normal / 상급 / 최상급) that multiplies its value; deeper floors and boss chests
// roll better tiers more often. Until `healGuarantee.untilFloor`, every draw holds one healing card.
// Pure game logic; this-life picks reset every run.
import { zeroStats } from './Stats.js';

export function formatValue(v, fmt) {
  return fmt === 'pct' ? `${Math.round(v * 100)}%` : String(Math.round(v));
}

export class Relics {
  constructor(cfg, family = () => null) {
    this.cfg = cfg; // config.relics (live); may be missing in hand-made test configs
    this.family = family; // () => vault.essence { stats, owned } (null: nothing passes down)
    this.reset();
  }

  reset() {
    this.owned = {}; // id -> count picked this life (HUD)
    this.stats = zeroStats(); // bonuses that last this life only (the family's essence is in the vault)
  }

  count(id) { return this.owned[id] || 0; }

  // does this card's stat pass down the family line?
  inherits(id) {
    const d = this.cfg.list[id];
    return !!(d && d.stat && !d.life && this.family());
  }

  // how many the cap counts: the family's essences, or this life's picks
  held(id) {
    if (!this.inherits(id)) return this.count(id);
    return this.family().owned[id] || 0;
  }

  // owned relics in pick order, for the HUD: [{ id, icon, name, count }]
  list() {
    const all = (this.cfg && this.cfg.list) || {};
    return Object.keys(this.owned).filter((id) => all[id]).map((id) => ({ id, icon: all[id].icon, name: all[id].name, count: this.owned[id] })); // retired cards drop out
  }

  available() {
    const all = (this.cfg && this.cfg.list) || {};
    return Object.keys(all).filter((id) => !(all[id].max && this.held(id) >= all[id].max));
  }

  // chance of each quality tier at this depth: [normal, 상급, 최상급]
  tierChances(floor = 1, boss = false) {
    const q = this.cfg.quality;
    const out = [0];
    for (let i = 1; i < q.tiers.length; i++) {
      const c = q.chance[i];
      out.push(Math.min(c.max, c.base + c.perFloor * (floor - 1)) + (boss ? q.bossBonus * (i === 1 ? 1 : 0.5) : 0));
    }
    out[0] = Math.max(0, 1 - out.slice(1).reduce((a, b) => a + b, 0));
    return out;
  }

  rollTier(rng, floor, boss) {
    const ch = this.tierChances(floor, boss);
    let r = rng();
    for (let i = ch.length - 1; i >= 1; i--) { if (r < ch[i]) return i; r -= ch[i]; }
    return 0;
  }

  // n distinct offers, weighted by rarity; each offer is a ready-to-show card
  roll(rng, { goldMult = 1, floor = 1, boss = false } = {}) {
    const c = this.cfg;
    if (!c) return [];
    const pool = this.available();
    const n = Math.min(c.choices, pool.length);
    const picks = [];
    for (let k = 0; k < n; k++) {
      let total = 0;
      for (const id of pool) total += c.rarity[c.list[id].rarity].weight;
      let r = rng() * total, chosen = pool[pool.length - 1];
      for (const id of pool) { r -= c.rarity[c.list[id].rarity].weight; if (r <= 0) { chosen = id; break; } }
      pool.splice(pool.indexOf(chosen), 1);
      const tier = c.list[chosen].fixed ? 0 : this.rollTier(rng, floor, boss);
      picks.push(this.offer(chosen, rng, goldMult, tier));
    }
    // shallow floors: one card of three always heals (at least its base 50%)
    const hg = c.healGuarantee;
    if (hg && floor <= hg.untilFloor && c.list[hg.id] && picks.length && !picks.some((o) => o.id === hg.id)) {
      picks[Math.floor(rng() * picks.length) % picks.length] = this.offer(hg.id, rng, goldMult, this.rollTier(rng, floor, boss));
    }
    return picks;
  }

  offer(id, rng, goldMult = 1, tier = 0) {
    const d = this.cfg.list[id], rar = this.cfg.rarity[d.rarity];
    const t = this.cfg.quality.tiers[tier] || this.cfg.quality.tiers[0];
    let value;
    if (d.gold) {
      const [a, b] = d.gold;
      value = Math.round((a + Math.floor(rng() * (b - a + 1))) * goldMult * t.mult);
    } else if (d.heal) value = Math.min(d.cap || 1, d.heal * t.mult);
    else value = d.add * t.mult; // fixed relics only ever roll tier 0
    if (d.fmt === 'int') value = Math.round(value);
    return {
      id, name: d.name, icon: d.icon, rarity: d.rarity, rarityLabel: rar.label, color: rar.color,
      tier, tierLabel: t.label, tierColor: t.color || null, value,
      desc: d.desc.replace('{v}', formatValue(value, d.fmt)), owned: this.held(id),
      essence: !!d.stat, inherit: !!d.stat && !d.life,
    };
  }

  // apply a chosen offer to the game (stats, health, gold)
  take(o, game) {
    const d = this.cfg.list[o.id];
    this.owned[o.id] = this.count(o.id) + 1;
    if (d.stat && this.inherits(o.id)) {
      const f = this.family();
      f.stats[d.stat] = (f.stats[d.stat] || 0) + o.value;
      f.owned[o.id] = (f.owned[o.id] || 0) + 1;
    } else if (d.stat) this.stats[d.stat] += o.value;
    const p = game.player;
    if (d.stat === 'maxHp') { p.maxHp += o.value; p.hp += o.value; }
    if (d.heal) game.healPlayer(o.value);
    if (d.gold) game.dungeon.gold += o.value;
  }
}

export const NO_BONUS = Object.freeze(zeroStats());
