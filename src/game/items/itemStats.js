// What an item gives (after grade, quality, level and enhancement) and how it reads on screen. Pure.
import { zeroStats } from '../Stats.js';
import { tr, trItemName } from '../../i18n/index.js';

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
  const [ko, fmt] = cfg.statLabels[stat] || [stat, 'int'];
  const label = tr(ko);
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
    name: (item.enhance ? `+${item.enhance} ` : '') + trItemName(item.name),
    gradeLabel: tr(g.label), gradeColor: g.color, qualityLabel: tr(q.label), qualityColor: q.color,
    partLabel: tr(cfg.parts[item.slot].label), icon: cfg.parts[item.slot].icon,
    lines,
    effectText: item.effect ? tr(cfg.effects[item.effect].label) : null,
    setText: set ? tr(set.name) : null,
    setAngle: set && set.angleLabel ? tr(set.angleLabel) : null,
    setJump: set && cfg.setJump ? tr(cfg.setJump.label) : null, // every set piece grows the jump's landing slam
    scar: !!item.scar,
    // heirloom: the latest owner who passed it down (and his feat for notable items)
    heirloom: item.legacy && item.legacy.length ? item.legacy[item.legacy.length - 1] : null,
    lostPower: item.lostPower ? tr(item.lostPower) : null,
    token: item.token ? tr(cfg.legacyToken.text) : null,
  };
}
