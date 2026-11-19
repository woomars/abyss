// How an item reads on screen: name, grade colour and label, stat lines (numbers from logic/items/itemStats).
import { itemStats, baseList } from '../../logic/items/itemStats.js';
import { t, tr, trItemName } from '../../i18n/index.js';

// look: config.look.items (stat labels)
export function formatStat(cfg, look, stat, v) {
  const [ko, fmt] = look.statLabels[stat] || [stat, 'int'];
  const label = tr(ko);
  if (fmt === 'int') return `${label} +${Math.round(v)}`;
  const pct = Math.round(v * 1000) / 10;
  return fmt === 'pctMinus' ? `${label} -${pct}%` : `${label} +${pct}%`;
}

// ready-to-show description (lines in base-then-affix order); look: config.look.items (grade colours and labels, icons)
export function describeItem(item, cfg, look) {
  const g = look.grades[item.grade], q = look.qualities[item.quality];
  const s = itemStats(item, cfg);
  const keys = [...new Set([...baseList(item, cfg).map((b) => b.stat), ...item.affixes.map((a) => a.stat)])];
  const ringKeys = item.ringSet && cfg.ringTable && item.enhance > 0 ? Object.keys(cfg.ringTable.perLevel) : [];
  const lines = item.ringSet ? ringKeys.map((k) => formatStat(cfg, look, k, s[k])) : keys.map((k) => formatStat(cfg, look, k, s[k])); // a set ring: only its enhance bonus
  const set = item.set ? cfg.sets[item.set] : null;
  const base = set && item.legendary ? t('item.setName', { set: tr(set.name), name: trItemName(item.name) }) : trItemName(item.name); // a set-engraved unique: the set name goes first
  return {
    name: (item.enhance ? `+${item.enhance} ` : '') + base,
    gradeLabel: tr(item.ringSet ? '초월' : g.label), gradeColor: item.ringSet ? look.ringSet.color : g.color, // set rings are Transcendent qualityLabel: tr(q.label), qualityColor: q.color,
    partLabel: tr(cfg.parts[item.slot].label), icon: look.parts[item.slot].icon,
    lines,
    effectText: item.effect ? tr(cfg.effects[item.effect].label) : null,
    setText: set ? tr(set.name) : null,
    setAngle: set && set.angleLabel ? tr(set.angleLabel) : null,
    setJump: null, // Phase 6: set pieces no longer grow the jump; // every set piece grows the jump's landing slam
    scar: !!item.scar,
    // heirloom: the latest owner who passed it down (and his feat for notable items)
    heirloom: item.legacy && item.legacy.length ? item.legacy[item.legacy.length - 1] : null,
    lostPower: item.lostPower ? tr(item.lostPower) : null,
    token: item.token ? tr(cfg.legacyToken.text) : null,
    passOn: item.passOn && !item.token ? t('item.passOn') : null,
    ringSet: item.ringSet && cfg.sets[item.ringSet] ? tr(cfg.sets[item.ringSet].name) : null,
  };
}
