// What an item gives (after grade, quality, level and enhancement) and how it reads on screen. Pure.
import { zeroStats } from '../Stats.js';

export function enhanceBonus(cfg, level) {
  return level > 0 ? cfg.enhance.bonus[Math.min(level, cfg.enhance.bonus.length) - 1] : 0;
}

// the item's multipliers: base gets grade and level, everything gets quality and enhancement
export function itemStats(item, cfg) {
  const s = zeroStats();
  const q = cfg.qualities[item.quality].mult, e = 1 + enhanceBonus(cfg, item.enhance);
  const lvl = 1 + cfg.perLevel * (item.level - 1);
  const fixed = (k) => cfg.affixes[k] && cfg.affixes[k].fixed;
  const add = (k, v, scale) => { s[k] += fixed(k) ? v : v * scale; };
  add(item.base.stat, item.base.value, cfg.grades[item.grade].mult * lvl * q * e);
  for (const a of item.affixes) add(a.stat, a.value, q * e);
  return s;
}

export function formatStat(cfg, stat, v) {
  const [label, fmt] = cfg.statLabels[stat] || [stat, 'int'];
  if (fmt === 'int') return `${label} +${Math.round(v)}`;
  const pct = Math.round(v * 1000) / 10;
  return fmt === 'pctMinus' ? `${label} -${pct}%` : `${label} +${pct}%`;
}

// ready-to-show description (lines in base-then-affix order)
export function describeItem(item, cfg) {
  const g = cfg.grades[item.grade], q = cfg.qualities[item.quality];
  const s = itemStats(item, cfg);
  const keys = [item.base.stat, ...item.affixes.map((a) => a.stat)];
  const lines = keys.map((k) => formatStat(cfg, k, s[k]));
  const set = item.set ? cfg.sets[item.set] : null;
  return {
    name: (item.enhance ? `+${item.enhance} ` : '') + item.name,
    gradeLabel: g.label, gradeColor: g.color, qualityLabel: q.label, qualityColor: q.color,
    partLabel: cfg.parts[item.slot].label, icon: cfg.parts[item.slot].icon,
    lines,
    effectText: item.effect ? cfg.effects[item.effect].label : null,
    setText: set ? set.name : null,
    scar: !!item.scar,
    // heirloom: the latest owner who passed it down (and his feat for notable items)
    heirloom: item.legacy && item.legacy.length ? item.legacy[item.legacy.length - 1] : null,
    lostPower: item.lostPower || null,
  };
}
