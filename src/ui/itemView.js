import { relicIcon } from './relicIcons.js';
import { describeItem } from '../game/items/itemStats.js';
import { t, tr, getLang, trPerson } from '../i18n/index.js';
import { floorLabel } from '../core/floorLabel.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// the heirloom story: saved in Korean; other languages retell it from the item's origin and the floor
export function featLine(entry, item, cfg) {
  if (!entry || !entry.feat) return null;
  if (getLang() === 'ko') return entry.feat;
  let floor = entry.floor;
  if (floor == null) { const m = /(\d+)층까지/.exec(entry.feat); floor = m ? Number(m[1]) : null; } // saves from before the floor was kept
  if (floor == null) return entry.feat;
  const o = item.origin;
  return t('item.feat', {
    part: tr(cfg.parts[item.slot].label), at: o ? floorLabel(o.floor) : '', boss: o && o.boss ? tr(o.boss) : '', floor: floorLabel(floor),
  });
}

// HTML for one item cell (grade border, quality outline, enhance level, icon)
export function itemCell(item, cfg, { cls = '', size = 22 } = {}) {
  const d = describeItem(item, cfg);
  const q = item.quality ? ` q${item.quality}` : '';
  return `<button class="icell g-${item.grade}${q}${item.scar ? ' scar' : ''}${item.token ? ' tok' : ''} ${cls}" data-id="${item.id}" style="--gc:${d.gradeColor};--qc:${d.qualityColor || 'transparent'}">`
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
    <div class="isub">${d.gradeLabel}${d.qualityLabel ? ` · <span style="color:${d.qualityColor}">${d.qualityLabel}</span>` : ''} ${d.partLabel} · Lv ${item.level}${d.scar ? ` · <span class="iscar">${t('item.scar')}</span>` : ''}</div>
    ${d.lines.map((l, i) => `<div class="iline${i === 0 ? ' ibase' : ''}">${l}</div>`).join('')}
    ${d.effectText ? `<div class="ieffect">${d.effectText}</div>` : ''}
    ${d.lostPower ? `<div class="ilost">${d.lostPower}</div>` : ''}
    ${d.token ? `<div class="itoken">${d.token}</div>` : ''}
    ${d.setText ? `<div class="iset">${t('item.set', { name: d.setText })}</div>` : ''}
    ${d.heirloom ? `<div class="iheir">${t('item.heir', { gen: t('gen', { n: d.heirloom.generation }), given: esc(trPerson(d.heirloom.given, 'given')), family: esc(trPerson(d.heirloom.family, 'family')) })}${d.heirloom.feat ? `<br><i>${esc(featLine(d.heirloom, item, cfg))}</i>` : ''}</div>` : ''}
  </div>`;
}
