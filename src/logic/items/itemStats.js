// What an item gives (after grade, quality, level and enhancement). Pure. How it reads on screen: look/text/itemText.js
import { zeroStats } from '../run/Stats.js';

export function enhanceBonus(cfg, level) {
  return level > 0 ? cfg.enhance.bonus[Math.min(level, cfg.enhance.bonus.length) - 1] : 0;
}

// the item's multipliers: base gets grade and level, everything gets quality and enhancement
export function itemStats(item, cfg) {
  const s = zeroStats();
  if (item.ringSet) { // a set ring: nothing of its own but what its enhance levels add (sets.json ring)
    const rt = cfg.ringTable;
    if (rt) for (const [k, v] of Object.entries(rt.perLevel)) s[k] += v * (item.enhance || 0);
    return s;
  }
  const q = cfg.qualities[item.quality].mult, e = 1 + enhanceBonus(cfg, item.enhance);
  const lvl = 1 + cfg.perLevel * (item.level - 1);
  const fixed = (k) => cfg.affixes[k] && cfg.affixes[k].fixed;
  const add = (k, v, scale) => { s[k] += fixed(k) ? v : v * scale; };
  add(item.base.stat, item.base.value, cfg.grades[item.grade].mult * lvl * q * e);
  for (const a of item.affixes) add(a.stat, a.value, q * e);
  return s;
}
