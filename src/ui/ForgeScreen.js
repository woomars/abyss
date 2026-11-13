import { relicIcon } from './relicIcons.js';
import { itemCell, itemDetail } from './itemView.js';
import { itemStats, formatStat } from '../game/items/itemStats.js';
import { LOADOUT_SLOTS } from '../game/items/Loadout.js';
import {
  findItem, equipItem, unequipItem, storeItem, takeItem, salvagePreview, salvageItems, enhancePreview, enhanceItem,
} from '../game/items/Forge.js';
import { STAT_KEYS } from '../game/Stats.js';
import { floorLabel } from '../core/floorLabel.js';
import { t, tr, fullName } from '../i18n/index.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slotLabel = (s) => t(`slot.${s}`);
const SLOT_ICON = { weapon: 'sword', helm: 'helm', armor: 'shield', gloves: 'gloves', boots: 'boots', amulet: 'amulet', ring1: 'ring', ring2: 'ring' };
const TIER = ['일반', '상급', '최상급']; // powder tiers (shown through tr)
const tierLabel = (q) => tr(TIER[q]);
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

  // the language changed while it is up
  relabel() { if (this.isOpen) this.render(); }

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
        <span class="fg-title">${t('fg.title')}</span>
        <span class="fg-who">${esc(fullName(l.family, l.given))} · ${t('gen', { n: l.generation })} · Lv ${g.vault.progress.level}</span>
        <div class="fg-tabs">${[['equip', t('fg.tabEquip')], ['salvage', t('fg.tabSalvage')], ['enhance', t('fg.tabEnhance')]].map(([k, n]) =>
          `<button class="fg-tab${this.tab === k ? ' on' : ''}" data-act="tab" data-v="${k}">${n}</button>`).join('')}</div>
        <span class="fg-sp"></span>
        ${this.start ? '' : `<span class="fg-gold">${relicIcon('gold', 13)} ${g.dungeon.gold}</span>`}
        ${g.vault.tokens > 0 ? `<button class="fg-btn fg-token" data-act="token">${tr(this.cfg.legacyToken.label)} ×${g.vault.tokens}</button>` : ''}
        <button class="fg-btn small" data-act="title">${t('fg.toTitle')}</button>
        <button class="fg-btn pri" data-act="depart">${t('toFloor', { floor: floorLabel(this.start ? 1 : g.dungeon.floor + 1) })} ▶</button>
      </div>
      <div class="fg-body">${this.tab === 'equip' ? this.renderEquip() : this.tab === 'salvage' ? this.renderSalvage() : this.tab === 'sets' ? this.renderSets() : this.renderEnhance()}</div>`;
  }

  grid(items, { check = false } = {}) {
    if (!items.length) return `<div class="fg-empty">${t('fg.empty')}</div>`;
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
      [tr('공격력'), Math.round((c.attackDamage + b.attackFlat) * (1 + b.damage))],
      [tr('최대 체력'), Math.round(g.player.maxHp)],
      [tr('받는 피해'), `-${Math.round(Math.min(0.8, b.armor) * 100)}%`],
      [t('fg.crit'), `${Math.round((c.critChance + b.crit) * 100)}%`],
      [t('fg.chain'), t('fg.times', { n: g.combat.chainCount })],
    ];
  }

  renderEquip() {
    const c = this.ctx, lo = c.loadout;
    const slot = (s) => {
      const it = lo.slots[s];
      return `<div class="fg-slot fs-${s}">${it ? itemCell(it, this.cfg, { cls: this.sel === it.id ? 'sel' : '', size: 24 })
        : `<span class="fg-slot-empty">${relicIcon(SLOT_ICON[s], 20)}</span>`}<span class="fg-slot-name">${slotLabel(s)}</span></div>`;
    };
    const sets = this.game.gearSets || {};
    const setN = sets.abyss || 0;
    return `
      <div class="fg-left">
        <div class="fg-doll"><div class="fg-sil"></div>${LOADOUT_SLOTS.map(slot).join('')}</div>
        <div class="fg-stats">${this.summaryStats().map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}
          <button class="fg-set" data-act="sets"><span>${t('fg.set')}</span><b>${setN}/5</b></button></div>
      </div>
      <div class="fg-right">
        ${this.bagTabs([['pocket', t('fg.pocketN', { n: c.pocket.length })], ['stash', t('fg.stashN', { n: `${c.vault.stash.length}/${this.cfg.stashSize}` })]])}
        ${this.bag === 'pocket' ? `<div class="fg-note">${t('fg.pocketNote')}</div>` : ''}
        <div class="fg-scroll">${this.grid(this.bagItems())}</div>
        ${this.equipDetail()}
      </div>`;
  }

  // compare panel for the selected item
  equipDetail() {
    if (this.sel == null) return `<div class="fg-detail dim">${t('fg.cmpHint')}</div>`;
    const f = findItem(this.ctx, this.sel);
    if (!f) { this.sel = null; return `<div class="fg-detail dim">${t('fg.cmpHint')}</div>`; }
    const lo = this.ctx.loadout, it = f.item;
    const equipBtns = it.slot === 'ring' && lo.slots.ring1 && lo.slots.ring2
      ? `<button class="fg-btn pri" data-act="equip" data-v="ring1">${t('fg.toRing1')}</button><button class="fg-btn pri" data-act="equip" data-v="ring2">${t('fg.toRing2')}</button>`
      : `<button class="fg-btn pri" data-act="equip">${t('fg.equip')}</button>`;
    // left: where it is kept (stash / pocket); right: wearing it — far apart so one is not hit for the other
    let left = '', right = '';
    if (f.where === 'equipped') { left = `<button class="fg-btn" data-act="store">${t('fg.toStash')}</button>`; right = `<button class="fg-btn" data-act="unequip">${t('fg.unequip')}</button>`; }
    else if (f.where === 'pocket') { left = `<button class="fg-btn" data-act="store">${t('fg.toStash')}</button>`; right = equipBtns; }
    else { left = `<button class="fg-btn" data-act="take">${t('fg.toPocket')}</button>`; right = equipBtns; }
    const btns = `<span class="fg-act-l">${left}</span><span class="fg-act-r">${right}</span>`;
    let cmp = '';
    if (f.where !== 'equipped') {
      const target = lo.slotFor(it);
      const worn = lo.slots[target];
      cmp = `<div class="fg-cmp">${worn ? `<div class="fg-cmp-h">${t('fg.wornIn', { slot: slotLabel(target) })}</div>${itemDetail(worn, this.cfg)}` : `<div class="fg-cmp-h">${t('fg.slotEmpty', { slot: slotLabel(target) })}</div>`}
        <div class="fg-delta">${this.deltaLines(it, worn)}</div></div>`;
    }
    return `<div class="fg-detail"><div class="fg-detail-main">${itemDetail(it, this.cfg)}</div>${cmp}<div class="fg-actions sticky split">${btns}</div></div>`;
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
    return out.length ? out.join('') : `<span class="dim">${t('fg.noChange')}</span>`;
  }

  // set overview: every piece (silhouette until found), how many are worn, active and next bonus
  renderSets() {
    const cfg = this.cfg, v = this.ctx.vault, lo = this.ctx.loadout;
    return Object.entries(cfg.sets).map(([id, s]) => {
      const worn = (this.game.gearSets || {})[id] || 0;
      const seen = v.seen[id] || {};
      const pieces = Object.entries(s.pieces).map(([slot, name]) => {
        const on = lo.items().some((it) => it.set === id && it.slot === slot);
        return `<div class="fg-piece${seen[slot] ? ' seen' : ''}${on ? ' on' : ''}">${relicIcon(cfg.parts[slot].icon, 26)}<span>${seen[slot] ? esc(tr(name)) : '???'}</span></div>`;
      }).join('');
      const needs = Object.keys(s.labels).map(Number).sort((a, b) => a - b);
      const next = needs.find((n) => n > worn);
      const bonus = needs.map((n) => `<div class="fg-bonus${worn >= n ? ' on' : ''}${n === next ? ' next' : ''}"><b>${t('fg.setN', { n })}</b> ${esc(tr(s.labels[n]))}${n === next ? ` <small>${t('fg.next')}</small>` : ''}</div>`).join('');
      return `<div class="fg-setview"><div class="fg-h">${esc(tr(s.name))} <span class="fg-setn">${t('fg.wornCount', { a: worn, b: Object.keys(s.pieces).length })}</span></div>
        <div class="fg-pieces">${pieces}</div><div class="fg-bonuses">${bonus}</div>
        <button class="fg-btn" data-act="tab" data-v="equip">${t('fg.backToGear')}</button></div>`;
    }).join('');
  }

  renderSalvage() {
    const c = this.ctx, pre = salvagePreview(c, [...this.checked]);
    const table = `<table class="fg-powder"><tr><th>${t('fg.part')}</th>${TIER.map((_, i) => `<th><span class="pw t${i}"></span>${tierLabel(i)}</th>`).join('')}</tr>
      ${PARTS.map((p) => `<tr><td>${relicIcon(this.cfg.parts[p].icon, 13)} ${tr(this.cfg.parts[p].label)}</td>${[0, 1, 2].map((q) =>
        `<td>${c.vault.powder[p][q]}${pre.powder[p][q] ? ` <small class="up">+${pre.powder[p][q]}</small>` : ''}</td>`).join('')}</tr>`).join('')}</table>`;
    const gain = PARTS.flatMap((p) => [0, 1, 2].filter((q) => pre.powder[p][q]).map((q) => `${tr(this.cfg.parts[p].label)} ${tierLabel(q)} ×${pre.powder[p][q]}`)).join(' · ');
    return `
      <div class="fg-left"><div class="fg-box"><div class="fg-h">${t('fg.powderStore')}</div>${table}</div></div>
      <div class="fg-right">
        ${this.bagTabs([['pocket', t('fg.pocketN', { n: c.pocket.length })], ['stash', t('fg.stashN', { n: c.vault.stash.length })]])}
        <div class="fg-note">${t('fg.salvageNote')}</div>
        <div class="fg-scroll">${this.grid(this.bagItems(), { check: true })}</div>
        <div class="fg-detail">
          <div><b>${t('fg.selected', { n: pre.count })}</b>${gain ? t('fg.gain', { list: gain }) : ''}</div>
          <div class="fg-actions">
            <button class="fg-btn" data-act="clearChecks">${t('fg.clearChecks')}</button>
            <button class="fg-btn" data-act="checkCommon">${t('fg.checkCommon')}</button>
            ${this.confirm ? `<span class="fg-ask">${[...this.checked].some((id) => { const f = findItem(c, id); return f && f.item.token; }) ? t('fg.tokenWarn') : ''}${t('fg.askSalvage')}</span><button class="fg-btn red" data-act="salvageYes">${t('fg.salvage')}</button><button class="fg-btn" data-act="salvageNo">${t('no')}</button>`
              : `<button class="fg-btn red" data-act="salvage" ${pre.count ? '' : 'disabled'}>${t('fg.salvageGo')}</button>`}
          </div>
        </div>
      </div>`;
  }

  renderEnhance() {
    const c = this.ctx;
    if (this.bag !== 'worn' && this.bag !== 'pocket' && this.bag !== 'stash') this.bag = 'worn';
    let left = `<div class="fg-box dim">${t('fg.pickEnhance')}</div>`;
    const f = this.sel != null ? findItem(c, this.sel) : null;
    if (f) {
      const it = f.item, e = this.cfg.enhance, have = c.vault.powder[it.slot];
      const pre = enhancePreview(c, it.id, this.tier, this.count);
      const need = it.enhance < e.max ? e.need[it.enhance] : 0;
      const cur = need ? (it.points / need) * 100 : 100;
      const after = pre.ok ? (pre.to > it.enhance ? 100 : ((pre.points) / need) * 100) : cur;
      left = `<div class="fg-box fg-enh">
        ${itemDetail(it, this.cfg)}
        <div class="fg-enh-lv">+${it.enhance}${pre.ok && pre.to > it.enhance ? ` → <b class="up">+${pre.to}</b>` : ''}${it.enhance >= e.max ? ` <small>${t('fg.maxed')}</small>` : ''}</div>
        <div class="fg-gauge"><i style="width:${cur}%"></i>${pre.ok ? `<i class="add" style="left:${cur}%;width:${Math.max(0, after - cur)}%"></i>` : ''}</div>
        <div class="fg-h">${t('fg.powderOf', { part: tr(this.cfg.parts[it.slot].label) })}</div>
        <div class="fg-chips">${[0, 1, 2].map((q) => `<button class="fg-chip${this.tier === q ? ' on' : ''}" data-act="tier" data-v="${q}" ${have[q] ? '' : 'disabled'}>
          <span><span class="pw t${q}"></span>${tierLabel(q)}</span><b>${t('fg.count', { n: have[q] })}</b><small>${t('fg.perOne', { n: e.points[q] })}</small></button>`).join('')}</div>
        <div class="fg-actions">
          <span class="fg-stepper"><button data-act="cnt" data-v="-1">−</button><b>${pre.use || 0}</b><button data-act="cnt" data-v="1">+</button><button data-act="cnt" data-v="99">${t('fg.max')}</button></span>
          <button class="fg-btn pri" data-act="enhance" ${pre.ok ? '' : 'disabled'}>${t('fg.enhance')}</button>
        </div>
      </div>`;
    }
    return `
      <div class="fg-left">${left}</div>
      <div class="fg-right">
        ${this.bagTabs([['worn', t('where.equipped')], ['pocket', t('fg.pocketN', { n: c.pocket.length })], ['stash', t('fg.stashN', { n: c.vault.stash.length })]])}
        <div class="fg-scroll">${this.grid(this.bagItems())}</div>
        <div class="fg-note">${t('fg.enhNote')}</div>
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
    else if (a === 'equip') { if (equipItem(c, this.sel, v || null).ok) { this.sel = null; this.changed('equip'); } } // back to the neutral hint
    else if (a === 'unequip') { const s = c.loadout.find(this.sel); if (s && unequipItem(c, s).ok) { this.sel = null; this.changed('unequip'); } }
    else if (a === 'store') {
      const r = storeItem(c, this.sel);
      if (r.ok) { this.sel = null; this.changed('store'); } else if (r.reason === 'stashFull') this.flash(t('fg.stashFull'));
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
