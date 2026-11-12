import { relicIcon } from './relicIcons.js';
import { itemCell, itemDetail } from './itemView.js';
import { itemStats, formatStat } from '../game/items/itemStats.js';
import { LOADOUT_SLOTS } from '../game/items/Loadout.js';
import {
  findItem, equipItem, unequipItem, storeItem, takeItem, salvagePreview, salvageItems, enhancePreview, enhanceItem,
} from '../game/items/Forge.js';
import { STAT_KEYS } from '../game/Stats.js';
import { floorLabel } from '../core/floorLabel.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SLOT_LABEL = { weapon: '무기', helm: '투구', armor: '갑옷', gloves: '장갑', boots: '신발', amulet: '목걸이', ring1: '반지 1', ring2: '반지 2' };
const SLOT_ICON = { weapon: 'sword', helm: 'helm', armor: 'shield', gloves: 'gloves', boots: 'boots', amulet: 'amulet', ring1: 'ring', ring2: 'ring' };
const TIER = ['일반', '상급', '최상급'];
const PARTS = ['weapon', 'helm', 'armor', 'gloves', 'boots', 'amulet', 'ring'];

// The forge: 장비 (paper doll, pocket / stash, compare), 분해 (multi-select into powder), 강화 (powder into
// any item, worn / pocket / stash). Every action goes through the pure Forge rules, then game.forgeChanged().
export class ForgeScreen {
  constructor(root, { game, onDepart, onTitle, onSets, onToken }) {
    this.onToken = onToken;
    this.game = game;
    this.onDepart = onDepart;
    this.onTitle = onTitle;
    this.onSets = onSets;
    this.tab = 'equip';
    this.bag = 'pocket';
    this.sel = null;     // selected item id
    this.checked = new Set();
    this.tier = 0;
    this.count = 1;
    this.confirm = false;
    this.el = document.createElement('div');
    this.el.className = 'overlay forge-screen interactive hidden';
    root.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => this.onClick(e));
  }

  get cfg() { return this.game.config.items; }
  get ctx() { return this.game.forgeCtx(); }
  get isOpen() { return !this.el.classList.contains('hidden'); }

  show({ start }) {
    this.start = start;
    this.tab = 'equip';
    this.bag = this.game.loot.pocket.length ? 'pocket' : 'stash';
    this.sel = null;
    this.checked.clear();
    this.confirm = false;
    this.el.classList.remove('hidden');
    this.render();
  }

  hide() { this.el.classList.add('hidden'); }

  changed(kind) {
    this.game.forgeChanged();
    this.game.events.emit('forgeAction', { kind });
    this.render();
  }

  // ---------- rendering ----------
  render() {
    const g = this.game, l = g.vault.lineage;
    this.el.innerHTML = `
      <div class="fg-bg"></div>
      <div class="fg-top">
        <span class="fg-title">대장간</span>
        <span class="fg-who">${esc(l.family)} ${esc(l.given)} · ${l.generation}대손 · Lv ${g.vault.progress.level}</span>
        <div class="fg-tabs">${[['equip', '장비'], ['salvage', '분해'], ['enhance', '강화']].map(([k, n]) =>
          `<button class="fg-tab${this.tab === k ? ' on' : ''}" data-act="tab" data-v="${k}">${n}</button>`).join('')}</div>
        <span class="fg-sp"></span>
        ${this.start ? '' : `<span class="fg-gold">${relicIcon('gold', 13)} ${g.dungeon.gold}</span>`}
        ${g.vault.tokens > 0 ? `<button class="fg-btn fg-token" data-act="token">유산의 증표 ×${g.vault.tokens}</button>` : ''}
        <button class="fg-btn small" data-act="title">타이틀</button>
        <button class="fg-btn pri" data-act="depart">${floorLabel(this.start ? 1 : g.dungeon.floor + 1)}으로 ▶</button>
      </div>
      <div class="fg-body">${this.tab === 'equip' ? this.renderEquip() : this.tab === 'salvage' ? this.renderSalvage() : this.tab === 'sets' ? this.renderSets() : this.renderEnhance()}</div>`;
  }

  grid(items, { check = false } = {}) {
    if (!items.length) return '<div class="fg-empty">비어 있습니다</div>';
    return `<div class="fg-grid">${items.map((it) => itemCell(it, this.cfg, {
      cls: `${this.sel === it.id ? 'sel' : ''} ${check && this.checked.has(it.id) ? 'chk' : ''}`, size: 22,
    })).join('')}</div>`;
  }

  bagTabs(list) {
    return `<div class="fg-bagtabs">${list.map(([k, n]) => `<button class="fg-bagtab${this.bag === k ? ' on' : ''}" data-act="bag" data-v="${k}">${n}</button>`).join('')}</div>`;
  }

  bagItems() {
    const c = this.ctx;
    if (this.bag === 'pocket') return c.pocket;
    if (this.bag === 'stash') return c.vault.stash;
    return c.loadout.items();
  }

  summaryStats() {
    const g = this.game, b = g.bonusStats, c = g.config.combat;
    return [
      ['공격력', Math.round((c.attackDamage + b.attackFlat) * (1 + b.damage))],
      ['최대 체력', Math.round(g.player.maxHp)],
      ['받는 피해', `-${Math.round(Math.min(0.8, b.armor) * 100)}%`],
      ['치명', `${Math.round((c.critChance + b.crit) * 100)}%`],
      ['연쇄', `${g.combat.chainCount}회`],
    ];
  }

  renderEquip() {
    const c = this.ctx, lo = c.loadout;
    const slot = (s) => {
      const it = lo.slots[s];
      return `<div class="fg-slot fs-${s}">${it ? itemCell(it, this.cfg, { cls: this.sel === it.id ? 'sel' : '', size: 24 })
        : `<span class="fg-slot-empty">${relicIcon(SLOT_ICON[s], 20)}</span>`}<span class="fg-slot-name">${SLOT_LABEL[s]}</span></div>`;
    };
    const sets = this.game.gearSets || {};
    const setN = sets.abyss || 0;
    return `
      <div class="fg-left">
        <div class="fg-doll"><div class="fg-sil"></div>${LOADOUT_SLOTS.map(slot).join('')}</div>
        <div class="fg-stats">${this.summaryStats().map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}
          <button class="fg-set" data-act="sets"><span>세트</span><b>${setN}/5</b></button></div>
      </div>
      <div class="fg-right">
        ${this.bagTabs([['pocket', `주머니 ${c.pocket.length}`], ['stash', `보관함 ${c.vault.stash.length}/${this.cfg.stashSize}`]])}
        ${this.bag === 'pocket' ? '<div class="fg-note">주머니는 죽으면 사라집니다. 지키려면 보관함에 넣으세요.</div>' : ''}
        <div class="fg-scroll">${this.grid(this.bagItems())}</div>
        ${this.equipDetail()}
      </div>`;
  }

  // compare panel for the selected item
  equipDetail() {
    if (this.sel == null) return '<div class="fg-detail dim">아이템을 누르면 지금 장비와 비교합니다</div>';
    const f = findItem(this.ctx, this.sel);
    if (!f) { this.sel = null; return '<div class="fg-detail dim">아이템을 누르면 지금 장비와 비교합니다</div>'; }
    const lo = this.ctx.loadout, it = f.item;
    const equipBtns = it.slot === 'ring' && lo.slots.ring1 && lo.slots.ring2
      ? '<button class="fg-btn pri" data-act="equip" data-v="ring1">반지 1에</button><button class="fg-btn pri" data-act="equip" data-v="ring2">반지 2에</button>'
      : '<button class="fg-btn pri" data-act="equip">장착</button>';
    let btns = '';
    if (f.where === 'equipped') btns = '<button class="fg-btn" data-act="unequip">해제</button><button class="fg-btn" data-act="store">보관함으로</button>';
    else if (f.where === 'pocket') btns = `<button class="fg-btn" data-act="store">보관함으로</button>${equipBtns}`;
    else btns = `<button class="fg-btn" data-act="take">주머니로</button>${equipBtns}`;
    let cmp = '';
    if (f.where !== 'equipped') {
      const target = lo.slotFor(it);
      const worn = lo.slots[target];
      cmp = `<div class="fg-cmp">${worn ? `<div class="fg-cmp-h">착용 중 (${SLOT_LABEL[target]})</div>${itemDetail(worn, this.cfg)}` : `<div class="fg-cmp-h">${SLOT_LABEL[target]} 비어 있음</div>`}
        <div class="fg-delta">${this.deltaLines(it, worn)}</div></div>`;
    }
    return `<div class="fg-detail"><div class="fg-detail-main">${itemDetail(it, this.cfg)}</div>${cmp}<div class="fg-actions sticky">${btns}</div></div>`;
  }

  deltaLines(a, b) {
    const sa = itemStats(a, this.cfg), sb = b ? itemStats(b, this.cfg) : null;
    const out = [];
    for (const k of STAT_KEYS) {
      const d = sa[k] - (sb ? sb[k] : 0);
      if (Math.abs(d) < 1e-9) continue;
      const txt = formatStat(this.cfg, k, Math.abs(d)).replace('+', '').replace('-', '');
      const good = d > 0;
      out.push(`<span class="${good ? 'up' : 'down'}">${good ? '▲' : '▼'} ${txt}</span>`);
    }
    return out.length ? out.join('') : '<span class="dim">변화 없음</span>';
  }

  // set overview: every piece (silhouette until found), how many are worn, active and next bonus
  renderSets() {
    const cfg = this.cfg, v = this.ctx.vault, lo = this.ctx.loadout;
    return Object.entries(cfg.sets).map(([id, s]) => {
      const worn = (this.game.gearSets || {})[id] || 0;
      const seen = v.seen[id] || {};
      const pieces = Object.entries(s.pieces).map(([slot, name]) => {
        const on = lo.items().some((it) => it.set === id && it.slot === slot);
        return `<div class="fg-piece${seen[slot] ? ' seen' : ''}${on ? ' on' : ''}">${relicIcon(cfg.parts[slot].icon, 26)}<span>${seen[slot] ? esc(name) : '???'}</span></div>`;
      }).join('');
      const needs = Object.keys(s.labels).map(Number).sort((a, b) => a - b);
      const next = needs.find((n) => n > worn);
      const bonus = needs.map((n) => `<div class="fg-bonus${worn >= n ? ' on' : ''}${n === next ? ' next' : ''}"><b>${n}세트</b> ${esc(s.labels[n])}${n === next ? ' <small>다음</small>' : ''}</div>`).join('');
      return `<div class="fg-setview"><div class="fg-h">${esc(s.name)} <span class="fg-setn">${worn}/${Object.keys(s.pieces).length} 착용</span></div>
        <div class="fg-pieces">${pieces}</div><div class="fg-bonuses">${bonus}</div>
        <button class="fg-btn" data-act="tab" data-v="equip">장비로 돌아가기</button></div>`;
    }).join('');
  }

  renderSalvage() {
    const c = this.ctx, pre = salvagePreview(c, [...this.checked]);
    const table = `<table class="fg-powder"><tr><th>부위</th>${TIER.map((t, i) => `<th><span class="pw t${i}"></span>${t}</th>`).join('')}</tr>
      ${PARTS.map((p) => `<tr><td>${relicIcon(this.cfg.parts[p].icon, 13)} ${this.cfg.parts[p].label}</td>${[0, 1, 2].map((q) =>
        `<td>${c.vault.powder[p][q]}${pre.powder[p][q] ? ` <small class="up">+${pre.powder[p][q]}</small>` : ''}</td>`).join('')}</tr>`).join('')}</table>`;
    const gain = PARTS.flatMap((p) => [0, 1, 2].filter((q) => pre.powder[p][q]).map((q) => `${this.cfg.parts[p].label} ${TIER[q]} ×${pre.powder[p][q]}`)).join(' · ');
    return `
      <div class="fg-left"><div class="fg-box"><div class="fg-h">가루 보관함</div>${table}</div></div>
      <div class="fg-right">
        ${this.bagTabs([['pocket', `주머니 ${c.pocket.length}`], ['stash', `보관함 ${c.vault.stash.length}`]])}
        <div class="fg-note">착용 중인 장비는 분해할 수 없습니다. 눌러서 여러 개를 고르세요.</div>
        <div class="fg-scroll">${this.grid(this.bagItems(), { check: true })}</div>
        <div class="fg-detail">
          <div><b>${pre.count}개 선택</b>${gain ? ` · 얻는 가루: ${gain}` : ''}</div>
          <div class="fg-actions">
            <button class="fg-btn" data-act="clearChecks">모두 해제</button>
            <button class="fg-btn" data-act="checkCommon">일반만 고르기</button>
            ${this.confirm ? `<span class="fg-ask">${[...this.checked].some((id) => { const f = findItem(c, id); return f && f.item.token; }) ? '유산의 증표가 새겨진 장비도 사라집니다. ' : ''}정말 분해할까요?</span><button class="fg-btn red" data-act="salvageYes">분해</button><button class="fg-btn" data-act="salvageNo">아니오</button>`
              : `<button class="fg-btn red" data-act="salvage" ${pre.count ? '' : 'disabled'}>분해 확인</button>`}
          </div>
        </div>
      </div>`;
  }

  renderEnhance() {
    const c = this.ctx;
    if (this.bag !== 'worn' && this.bag !== 'pocket' && this.bag !== 'stash') this.bag = 'worn';
    let left = '<div class="fg-box dim">오른쪽에서 강화할 장비를 고르세요</div>';
    const f = this.sel != null ? findItem(c, this.sel) : null;
    if (f) {
      const it = f.item, e = this.cfg.enhance, have = c.vault.powder[it.slot];
      const pre = enhancePreview(c, it.id, this.tier, this.count);
      const need = it.enhance < e.max ? e.need[it.enhance] : 0;
      const cur = need ? (it.points / need) * 100 : 100;
      const after = pre.ok ? (pre.to > it.enhance ? 100 : ((pre.points) / need) * 100) : cur;
      left = `<div class="fg-box fg-enh">
        ${itemDetail(it, this.cfg)}
        <div class="fg-enh-lv">+${it.enhance}${pre.ok && pre.to > it.enhance ? ` → <b class="up">+${pre.to}</b>` : ''}${it.enhance >= e.max ? ' <small>(최대)</small>' : ''}</div>
        <div class="fg-gauge"><i style="width:${cur}%"></i>${pre.ok ? `<i class="add" style="left:${cur}%;width:${Math.max(0, after - cur)}%"></i>` : ''}</div>
        <div class="fg-h">${this.cfg.parts[it.slot].label} 가루</div>
        <div class="fg-chips">${[0, 1, 2].map((q) => `<button class="fg-chip${this.tier === q ? ' on' : ''}" data-act="tier" data-v="${q}" ${have[q] ? '' : 'disabled'}>
          <span><span class="pw t${q}"></span>${TIER[q]}</span><b>${have[q]}개</b><small>1개당 ${e.points[q]}</small></button>`).join('')}</div>
        <div class="fg-actions">
          <span class="fg-stepper"><button data-act="cnt" data-v="-1">−</button><b>${pre.use || 0}</b><button data-act="cnt" data-v="1">+</button><button data-act="cnt" data-v="99">최대</button></span>
          <button class="fg-btn pri" data-act="enhance" ${pre.ok ? '' : 'disabled'}>강화</button>
        </div>
      </div>`;
    }
    return `
      <div class="fg-left">${left}</div>
      <div class="fg-right">
        ${this.bagTabs([['worn', '착용 중'], ['pocket', `주머니 ${c.pocket.length}`], ['stash', `보관함 ${c.vault.stash.length}`]])}
        <div class="fg-scroll">${this.grid(this.bagItems())}</div>
        <div class="fg-note">같은 부위 가루로 강화합니다. 실패나 파괴는 없습니다. 단계마다 모든 수치가 오릅니다(+5 30%, +10 100%).</div>
      </div>`;
  }

  // ---------- input ----------
  onClick(e) {
    const cell = e.target.closest('.icell');
    const b = e.target.closest('[data-act]');
    if (cell && !b) { this.pickCell(Number(cell.dataset.id)); return; }
    if (!b || b.disabled) return;
    const a = b.dataset.act, v = b.dataset.v, c = this.ctx;
    if (a === 'tab') { this.tab = v; this.sel = null; this.checked.clear(); this.confirm = false; if (v === 'enhance') this.bag = 'worn'; else if (this.bag === 'worn') this.bag = 'pocket'; this.render(); }
    else if (a === 'bag') { this.bag = v; this.render(); }
    else if (a === 'depart') this.onDepart();
    else if (a === 'title') this.onTitle();
    else if (a === 'token') this.onToken();
    else if (a === 'sets') { this.tab = 'sets'; this.sel = null; this.render(); }
    else if (a === 'equip') { if (equipItem(c, this.sel, v || null).ok) this.changed('equip'); }
    else if (a === 'unequip') { const s = c.loadout.find(this.sel); if (s && unequipItem(c, s).ok) this.changed('unequip'); }
    else if (a === 'store') {
      const r = storeItem(c, this.sel);
      if (r.ok) { this.sel = null; this.changed('store'); } else if (r.reason === 'stashFull') this.flash('보관함이 가득 찼습니다');
    } else if (a === 'take') { if (takeItem(c, this.sel).ok) this.changed('take'); }
    else if (a === 'clearChecks') { this.checked.clear(); this.confirm = false; this.render(); }
    else if (a === 'checkCommon') { for (const it of this.bagItems()) if (it.grade === 'common' && !it.scar && !it.token) this.checked.add(it.id); this.render(); }
    else if (a === 'salvage') { this.confirm = true; this.render(); }
    else if (a === 'salvageNo') { this.confirm = false; this.render(); }
    else if (a === 'salvageYes') { salvageItems(c, [...this.checked]); this.checked.clear(); this.confirm = false; this.changed('salvage'); }
    else if (a === 'tier') { this.tier = Number(v); this.count = 1; this.render(); }
    else if (a === 'cnt') { this.count = Number(v) === 99 ? 999 : Math.max(1, (enhancePreview(c, this.sel, this.tier, this.count).use || 0) + Number(v)); this.render(); }
    else if (a === 'enhance') { const r = enhanceItem(c, this.sel, this.tier, this.count); if (r.ok) { this.count = 1; this.changed(r.to > r.from ? 'enhanceUp' : 'enhance'); } }
  }

  pickCell(id) {
    if (this.tab === 'salvage') {
      const f = findItem(this.ctx, id);
      if (!f || f.where === 'equipped') return;
      if (this.checked.has(id)) this.checked.delete(id); else this.checked.add(id);
      this.confirm = false;
    } else {
      this.sel = this.sel === id ? null : id;
      if (this.tab === 'enhance' && this.sel != null) {
        const it = findItem(this.ctx, id).item, have = this.ctx.vault.powder[it.slot];
        if (!have[this.tier]) this.tier = have.findIndex((n) => n > 0) >= 0 ? have.findIndex((n) => n > 0) : 0;
        this.count = 1;
      }
    }
    this.render();
  }

  flash(msg, good = false) {
    const t = document.createElement('div');
    t.className = `fg-flash${good ? ' good' : ''}`;
    t.textContent = msg;
    this.el.appendChild(t);
    setTimeout(() => t.remove(), 1500);
  }
}
