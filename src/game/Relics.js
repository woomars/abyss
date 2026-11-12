// Run-long treasures picked from cards in treasure rooms. Holds what the player owns and the summed
// stat bonuses that combat, skills, movement and health read. Pure game logic, reset every run.
const ZERO = { damage: 0, maxHp: 0, crit: 0, speed: 0, cooldown: 0, lifesteal: 0, armor: 0, chain: 0 };

export class Relics {
  constructor(cfg) {
    this.cfg = cfg; // config.relics (live); may be missing in hand-made test configs
    this.reset();
  }

  reset() {
    this.owned = {}; // id -> count
    this.stats = { ...ZERO };
  }

  count(id) { return this.owned[id] || 0; }

  // owned relics in pick order, for the HUD: [{ id, icon, name, count }]
  list() {
    const all = (this.cfg && this.cfg.list) || {};
    return Object.keys(this.owned).map((id) => ({ id, icon: all[id].icon, name: all[id].name, count: this.owned[id] }));
  }

  available() {
    const all = (this.cfg && this.cfg.list) || {};
    return Object.keys(all).filter((id) => !(all[id].max && this.count(id) >= all[id].max));
  }

  // n distinct offers, weighted by rarity; each offer is a ready-to-show card
  roll(rng, { goldMult = 1 } = {}) {
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
      picks.push(this.offer(chosen, rng, goldMult));
    }
    return picks;
  }

  offer(id, rng, goldMult) {
    const d = this.cfg.list[id], rar = this.cfg.rarity[d.rarity];
    const o = { id, name: d.name, icon: d.icon, rarity: d.rarity, rarityLabel: rar.label, color: rar.color, desc: d.desc, owned: this.count(id) };
    if (d.gold) {
      const [a, b] = d.gold;
      o.gold = Math.round((a + Math.floor(rng() * (b - a + 1))) * goldMult);
      o.desc = d.desc.replace('{gold}', String(o.gold));
    }
    return o;
  }

  // apply a chosen offer to the game (stats, health, gold)
  take(o, game) {
    const d = this.cfg.list[o.id];
    this.owned[o.id] = this.count(o.id) + 1;
    if (d.stat) this.stats[d.stat] += d.add;
    const p = game.player;
    if (d.stat === 'maxHp') { p.maxHp += d.add; p.hp += d.add; }
    if (d.heal) game.healPlayer(d.heal);
    if (o.gold) game.dungeon.gold += o.gold;
  }
}

export const NO_BONUS = ZERO;
