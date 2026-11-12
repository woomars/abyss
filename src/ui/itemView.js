import { relicIcon } from './relicIcons.js';
import { describeItem } from '../game/items/itemStats.js';

// HTML for one item cell (grade border, quality outline, enhance level, icon)
export function itemCell(item, cfg, { cls = '', size = 22 } = {}) {
  const d = describeItem(item, cfg);
  const q = item.quality ? ` q${item.quality}` : '';
  return `<button class="icell g-${item.grade}${q}${item.scar ? ' scar' : ''} ${cls}" data-id="${item.id}" style="--gc:${d.gradeColor};--qc:${d.qualityColor || 'transparent'}">`
    + `${item.enhance ? `<span class="ilv">+${item.enhance}</span>` : ''}${relicIcon(d.icon, size)}</button>`;
}

// one-line label: "희귀 · 상급 날카로운 장검"
export function itemLabel(item, cfg) {
  const d = describeItem(item, cfg);
  return `${d.gradeLabel}${d.qualityLabel ? ' · ' + d.qualityLabel : ''} ${d.name}`;
}

// detail block used by tooltips/compare panels
export function itemDetail(item, cfg) {
  const d = describeItem(item, cfg);
  return `<div class="idetail">
    <div class="iname" style="color:${d.gradeColor}">${d.name}</div>
    <div class="isub">${d.gradeLabel}${d.qualityLabel ? ` · <span style="color:${d.qualityColor}">${d.qualityLabel}</span>` : ''} ${d.partLabel} · Lv ${item.level}${d.scar ? ' · <span class="iscar">흔적</span>' : ''}</div>
    ${d.lines.map((l, i) => `<div class="iline${i === 0 ? ' ibase' : ''}">${l}</div>`).join('')}
    ${d.effectText ? `<div class="ieffect">${d.effectText}</div>` : ''}
    ${d.setText ? `<div class="iset">세트: ${d.setText}</div>` : ''}
  </div>`;
}
