import { relicIcon } from './relicIcons.js';
import { itemCell, itemDetail } from './itemView.js';
import { itemStats, formatStat, describeItem } from '../game/items/itemStats.js';
import { LOADOUT_SLOTS } from '../game/items/Loadout.js';
import {
  findItem, equipItem, unequipItem, storeItem, takeItem, salvagePreview, salvageItems, enhancePreview, enhanceItem,
  compareSlots, salvageSelectAll, gradeUpPreview, gradeUpItem, stashPrice, buyStashSlot,
} from '../game/items/Forge.js';
import { sortItems, applyAutoEquip, snapshotGear, restoreGear, setPieceOwners, equipSet } from '../game/items/gear.js';
import { captureScroll, restoreScroll } from './scrollKeep.js';
import { setLabel } from '../game/items/setLabels.js';
import { canEngrave, engraveCost, engraveChance, hammerSpeeds, engraveItem } from '../game/items/engrave.js';
import { HammerGame } from './HammerGame.js';
import { STAT_KEYS } from '../game/Stats.js';
import { floorLabel } from '../core/floorLabel.js';
import { t, tr, fullName } from '../i18n/index.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slotLabel = (s) => t(`slot.${s}`);
const SLOT_ICON = { weapon: 'sword', helm: 'helm', armor: 'shield', gloves: 'gloves', boots: 'boots', amulet: 'amulet', ring1: 'ring', ring2: 'ring' };
const TIER = ['일반', '상급', '최상급']; // powder tiers (shown through tr)
const tierLabel = (q) => tr(TIER[q]);
const TABS = [['equip', 'fg.tabEquip'], ['salvage', 'fg.tabSalvage'], ['enhance', 'fg.tabEnhance'], ['engrave', 'fg.tabEngrave'], ['sets', 'fg.tabSets']];
const pct = (p) => `${Math.round(p * 100)}%`;
const SCROLLERS = ['.fg-scroll', '.fg-gear', '.fg-sdet'];
// the full stats sheet ([상세]): attack first, then these
const DETAIL = ['maxHp', 'armor', 'crit', 'critDamage', 'chain', 'chainDamage', 'chainRange', 'attackSpeed', 'speed', 'range', 'dashRange', 'cooldown', 'lifesteal', 'skillDamage', 'knockback'];
// is any checked item like this (token gear, set piece)? — for the salvage warning
const picked = (ctx, checked, test) => [...checked].some((id) => { const f = findItem(ctx, id); return f && test(f.item); });

// The forge, one layout for every tab: left = the gear panel (paper doll, or what the picked item / set
// is) over the stats strip; right = what to pick over the tab's buttons (the salvage tab adds the powder
// it would give). Every action goes through the pure Forge rules, then game.forgeChanged().
export class ForgeScreen {
  // sortMode: () => 'grade' | 'type' (the pocket/stash order chosen in the pause menu)
  constructor(root, { game, onDepart, onTitle, onToken, sortMode = () => 'grade' }) {
    this.sortMode = sortMode;
    this.undo = null; // gear before the last auto-equip (one undo, until anything else is done)
    this.onToken = onToken;
    this.game = game;
    this.onDepart = onDepart;
    this.onTitle = onTitle;
    this.tab = 'equip';
    this.bag = 'pocket';
    this.sel = null;     // selected item id
    this.setSel = null;  // the set shown on the sets tab
    this.statsOpen = false;
    this.checked = new Set();
    this.tier = 0;
    this.count = 1;
    this.confirm = false;
    this.scrolls = {};     // tab:bag -> remembered scroll positions (a redraw must not jump to the top)
    this.scrollKey = null;
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
    this.setSel = null;
    this.statsOpen = false;
    this.checked.clear();
    this.confirm = false;
    this.scrolls = {}; // a new visit starts at the top (positions are kept only while it stays open)
    this.undo = null;  // an auto-equip undo belongs to the visit it was made in
    this.scrollKey = null;
    this.el.classList.remove('hidden');
    this.render();
  }

  hide() { this.undo = null; this.stopHammer(); this.engResult = null; this.el.classList.add('hidden'); }

  stopHammer() { if (this.hammer) { this.hammer.destroy(); this.hammer = null; } }

  // the language changed while it is up
  relabel() { if (this.isOpen) this.render(); }

  changed(kind) {
    if (kind !== 'auto') this.undo = null;
    this.game.forgeChanged();
    this.game.events.emit('forgeAction', { kind });
    this.render();
  }

  // ---------- rendering ----------
  render() {
    const g = this.game, l = g.vault.lineage;
    if (this.scrollKey) this.scrolls[this.scrollKey] = captureScroll(this.el, SCROLLERS); // where the old view stood
    if (this.freshDetail && this.scrollKey) this.scrolls[this.scrollKey].delete('.fg-gear');
    this.freshDetail = false;
    if (this.sel != null && !findItem(this.ctx, this.sel)) this.sel = null;
    const v = this.tab === 'salvage' ? this.salvageView() : this.tab === 'enhance' ? this.enhanceView() : this.tab === 'engrave' ? this.engraveView() : this.tab === 'sets' ? this.setsView() : this.equipView();
    this.pv = this.previewBonus(); // the bonus after the pending action (for the +/- on the stats)
    this.el.innerHTML = `
      <div class="fg-bg"></div>
      <div class="fg-top">
        <span class="fg-title">${t('fg.title')}</span>
        <span class="fg-who">${esc(fullName(l.family, l.given))} · ${t('gen', { n: l.generation })} · Lv ${g.vault.progress.level}</span>
        <div class="fg-tabs">${TABS.map(([k, n]) => `<button class="fg-tab${this.tab === k ? ' on' : ''}" data-act="tab" data-v="${k}">${t(n)}</button>`).join('')}</div>
        <span class="fg-sp"></span>
        <span class="fg-gold">${relicIcon('gold', 13)} ${g.vault.gold}</span>
        ${g.vault.tokens > 0 ? `<button class="fg-btn fg-token" data-act="token">${tr(this.cfg.legacyToken.label)} ×${g.vault.tokens}</button>` : ''}
        <button class="fg-btn small" data-act="title">${t('fg.toTitle')}</button>
        <button class="fg-btn pri" data-act="depart">${t('toFloor', { floor: floorLabel(this.start ? 1 : g.dungeon.floor + 1) })} ▶</button>
      </div>
      <div class="fg-body">
        <div class="fg-col">
          <div class="fg-panel fg-gear${v.doll ? ' dollmode' : ''}">${v.gear}</div>
          <div class="fg-panel fg-stats">${this.statsStrip()}</div>
          ${this.statsOpen ? `<div class="fg-sdet">${this.statsDetail()}</div>` : ''}
        </div>
        <div class="fg-col">
          <div class="fg-panel fg-items">${v.items}</div>
          ${v.gain ? `<div class="fg-panel fg-gain">${v.gain}</div>` : ''}
          <div class="fg-panel fg-btns">${v.btns}</div>
        </div>
      </div>
      ${v.tint ? `<div class="fg-redtint" style="--a:${v.tint.toFixed(3)}"></div>` : ''}
      ${this.engResult ? this.engResultView() : ''}`;
    if (this.hammer) this.el.appendChild(this.hammer.el); // a redraw must not lose the hammer
    this.scrollKey = `${this.tab}:${this.bag}`;
    restoreScroll(this.el, this.scrolls[this.scrollKey]);
  }

  grid(items, { check = false, off = null } = {}) {
    if (!items.length) return `<div class="fg-empty">${t('fg.empty')}</div>`;
    return `<div class="fg-grid">${sortItems(items, this.sortMode(), this.cfg).map((it) => itemCell(it, this.cfg, {
      cls: `${this.sel === it.id ? 'sel' : ''} ${check && this.checked.has(it.id) ? 'chk' : ''} ${off && off(it) ? 'off' : ''}`, size: 22,
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

  // the paper doll; the set button sits in its empty bottom-right corner
  doll() {
    const lo = this.ctx.loadout;
    const slot = (s) => {
      const it = lo.slots[s];
      return `<div class="fg-slot fs-${s}">${it ? itemCell(it, this.cfg, { cls: this.sel === it.id ? 'sel' : '', size: 24 })
        : `<span class="fg-slot-empty">${relicIcon(SLOT_ICON[s], 20)}</span>`}<span class="fg-slot-name">${slotLabel(s)}</span></div>`;
    };
    return `<div class="fg-doll"><div class="fg-sil"></div>${LOADOUT_SLOTS.map(slot).join('')}<div class="fs-set">${this.setButton()}</div></div>`;
  }

  // worn sets: one = name and n/total; several = a row each (most pieces first, three rows, then "외 n종")
  setButton() {
    const sets = this.cfg.sets, worn = this.game.gearSets || {};
    const list = Object.keys(sets).filter((k) => worn[k] > 0)
      .map((k) => [k, worn[k], Object.keys(sets[k].pieces).length]).sort((a, b) => b[1] - a[1]);
    const done = list.filter(([, n, total]) => n >= total).length;
    const cls = `fg-set${list.length > 1 ? ' multi' : ''}${done ? ' done' : ''}${done >= 3 ? ' triple' : ''}`;
    if (list.length <= 1) {
      const [k, n, total] = list[0] || [null, 0, Object.keys(Object.values(sets)[0].pieces).length];
      return `<button class="${cls}" data-act="sets" data-v="${k || ''}"><span>${k ? esc(tr(sets[k].name)) : t('fg.set')}</span><b>${n}/${total}</b></button>`;
    }
    const rows = list.slice(0, 3).map(([k, n, total]) => `<span class="sr${n >= total ? ' ok' : ''}">${esc(tr(sets[k].name))}<b>${n}/${total}</b></span>`).join('');
    return `<button class="${cls}" data-act="sets" data-v="${list[0][0]}">${rows}${list.length > 3 ? `<span class="more">${t('fg.moreSets', { n: list.length - 3 })}</span>` : ''}</button>`;
  }

  // ---------- stats ----------
  // the five numbers of the strip from a bonus: [label, value, kind]
  numbers(b) {
    const c = this.game.config.combat;
    return [
      [tr('공격력'), Math.round((c.attackDamage + b.attackFlat) * (1 + b.damage)), 'n'],
      [tr('최대 체력'), Math.round(c.player.maxHp + b.maxHp), 'n'],
      [tr('받는 피해'), Math.round(Math.min(0.8, b.armor) * 100), 'cut'],
      [t('fg.crit'), Math.round((c.critChance + b.crit) * 100), 'pct'],
      [t('fg.chain'), c.chain.count + b.chain, 'times'],
    ];
  }

  statsStrip() {
    const show = (kind, v) => (kind === 'cut' ? (v ? `-${v}%` : '0%') : kind === 'pct' ? `${v}%` : kind === 'times' ? t('fg.times', { n: v }) : `${v}`);
    const now = this.numbers(this.game.bonusStats), pv = this.pv ? this.numbers(this.pv) : null;
    return `<div class="fg-svs">${now.map(([k, v, kind], i) => {
      const d = pv ? pv[i][1] - v : 0;
      // less damage taken is shown as a minus and is good
      const txt = kind === 'cut' ? `${d > 0 ? '-' : '+'}${Math.abs(d)}%` : `${d > 0 ? '+' : '-'}${Math.abs(d)}${kind === 'pct' ? '%' : ''}`;
      return `<div class="fg-sv"><span>${k}</span><b>${show(kind, v)}${d ? `<i class="${d > 0 ? 'up' : 'down'}">${txt}</i>` : ''}</b></div>`;
    }).join('')}</div><button class="fg-btn small" data-act="statsOpen">${t('fg.details')}</button>`;
  }

  // one stat's total as the hero has it (base + bonus)
  total(k, b) {
    const c = this.game.config.combat;
    if (k === 'attack') return (c.attackDamage + b.attackFlat) * (1 + b.damage);
    if (k === 'maxHp') return c.player.maxHp + b.maxHp;
    if (k === 'armor') return Math.min(0.8, b.armor);
    if (k === 'crit') return c.critChance + b.crit;
    if (k === 'critDamage') return c.critMultiplier + b.critDamage;
    if (k === 'chain') return c.chain.count + b.chain;
    return b[k] || 0;
  }

  fmtStat(k, v, sign = false) {
    const s = sign && v > 0 ? '+' : v < 0 ? '-' : '';
    const a = Math.abs(v);
    if (k === 'chain') return `${s}${t('fg.times', { n: Math.round(a) })}`;
    const fmt = k === 'attack' ? 'int' : (this.cfg.statLabels[k] || [k, 'int'])[1];
    return fmt === 'int' ? `${s}${Math.round(a)}` : `${s}${Math.round(a * 1000) / 10}%`;
  }

  statsDetail() {
    const b = this.game.bonusStats, gear = this.ctx.loadout.summary().stats;
    const label = (k) => (k === 'attack' ? tr('공격력') : tr((this.cfg.statLabels[k] || [k])[0]));
    return `<div class="fg-h">${t('fg.allStats')} <small>${t('fg.gearShare')}</small><button class="fg-btn small" data-act="statsOpen">${t('fg.close')}</button></div>
      <div class="fg-allstats">${['attack', ...DETAIL].map((k) => {
        const v = this.total(k, b), d = this.pv ? this.total(k, this.pv) - v : 0;
        const share = k !== 'attack' && gear[k] ? `<em>(${this.fmtStat(k, gear[k], true)})</em>` : '';
        return `<div class="fg-st"><span>${label(k)}</span><b>${this.fmtStat(k, v)}${share}${Math.abs(d) > 1e-9 ? `<i class="${d > 0 ? 'up' : 'down'}">${this.fmtStat(k, d, true)}</i>` : ''}</b></div>`;
      }).join('')}</div>`;
  }

  // the bonus as it would be after the pending action (equip / take off, enhance a worn item, wear a set),
  // read by putting it on for a moment and back; null when nothing is pending
  previewBonus() {
    const g = this.game, c = this.ctx, lo = c.loadout, slots = { ...lo.slots };
    const f = this.sel != null ? findItem(c, this.sel) : null;
    let enh = null;
    if (this.tab === 'equip' && f) {
      if (f.where !== 'equipped' && f.item.slot === 'ring' && lo.slots.ring1 && lo.slots.ring2) return null; // [반지 1에]/[반지 2에] decide
      if (f.where === 'equipped') lo.slots[f.slot] = null; else lo.equip(f.item);
    } else if (this.tab === 'enhance' && f && f.where === 'equipped') {
      const p = enhancePreview(c, f.item.id, this.tier, this.count);
      if (!p.ok || p.to <= f.item.enhance) return null;
      enh = f.item.enhance;
      f.item.enhance = p.to;
    } else if (this.tab === 'sets' && this.setSel) {
      for (const o of Object.values(setPieceOwners(c, this.setSel))) if (o && o.where !== 'equipped') lo.equip(o.item);
    } else return null;
    try {
      g.refreshBonus();
      return { ...g.bonusStats };
    } finally {
      Object.assign(lo.slots, slots);
      if (enh != null) f.item.enhance = enh;
      g.refreshBonus();
    }
  }

  // ---------- tabs: each gives { gear, doll, items, gain, btns } ----------
  backBtn() { return `<button class="fg-btn small fg-back" data-act="unsel">${t('fg.backDoll')}</button>`; }

  equipView() {
    const c = this.ctx, lo = c.loadout, f = this.sel != null ? findItem(c, this.sel) : null;
    let gear;
    if (f) {
      const it = f.item;
      const cmp = f.where === 'equipped' ? '' : compareSlots(lo, it).map((target) => { // a ring is set beside both worn rings
        const worn = lo.slots[target];
        return `<div class="fg-cmp">${worn ? `<div class="fg-cmp-h">${t('fg.wornIn', { slot: slotLabel(target) })}</div>${itemDetail(worn, this.cfg)}` : `<div class="fg-cmp-h">${t('fg.slotEmpty', { slot: slotLabel(target) })}</div>`}
          <div class="fg-delta">${this.deltaLines(it, worn)}</div></div>`;
      }).join('');
      gear = `<div class="fg-h">${t(f.where === 'equipped' ? 'fg.wornItem' : 'fg.pickedItem')}${this.backBtn()}</div>
        <div class="fg-detail"><div class="fg-detail-main">${itemDetail(it, this.cfg)}</div>${cmp}</div>`;
    }
    const items = `${this.bagTabs([['pocket', t('fg.pocketN', { n: c.pocket.length })], ['stash', t('fg.stashN', { n: `${c.vault.stash.length}/${c.vault.stashSlots}` })]])}
      ${this.bag === 'stash' ? this.stashBuy() : ''}
      <div class="fg-scroll">${this.grid(this.bagItems())}</div>
      ${this.bag === 'pocket' ? `<div class="fg-note">${t('fg.pocketNote')}</div>` : ''}`;
    // left: auto-equip; right: where it is kept, then wearing it — far apart so one is not hit for the other
    const left = `<button class="fg-btn" data-act="auto">${t('fg.autoEquip')}</button><button class="fg-btn" data-act="undo" ${this.undo ? '' : 'disabled'}>${t('fg.undo')}</button>`;
    let right;
    if (!f) right = `<button class="fg-btn" disabled>${t(this.bag === 'stash' ? 'fg.toPocket' : 'fg.toStash')}</button><button class="fg-btn pri" disabled>${t('fg.equip')}</button>`;
    else if (f.where === 'equipped') right = `<button class="fg-btn" data-act="store">${t('fg.toStash')}</button><button class="fg-btn pri" data-act="unequip">${t('fg.unequip')}</button>`;
    else {
      const wear = f.item.slot === 'ring' && lo.slots.ring1 && lo.slots.ring2
        ? `<button class="fg-btn pri" data-act="equip" data-v="ring1">${t('fg.toRing1')}</button><button class="fg-btn pri" data-act="equip" data-v="ring2">${t('fg.toRing2')}</button>`
        : `<button class="fg-btn pri" data-act="equip">${t('fg.equip')}</button>`;
      right = f.where === 'pocket' ? `<button class="fg-btn" data-act="store">${t('fg.toStash')}</button>${wear}` : `<button class="fg-btn" data-act="take">${t('fg.toPocket')}</button>${wear}`;
    }
    return { gear: gear || this.doll(), doll: !gear, items, btns: `<span class="fg-act-l">${left}</span><span class="fg-act-r">${right}</span>` };
  }

  // stash tab: buy one more place (price grows each time)
  stashBuy() {
    const v = this.ctx.vault, s = this.ctx.econ.stash;
    if (v.stashSlots >= s.maxSlots) return '';
    const price = stashPrice(this.ctx.econ, v.stashSlots);
    return `<div class="fg-buyrow"><button class="fg-btn" data-act="buySlot" ${v.gold >= price ? '' : 'disabled'}>${t('fg.buySlot', { n: price })}</button>${v.gold >= price ? '' : `<small class="down">${t('fg.needGold', { n: price - v.gold })}</small>`}</div>`;
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

  salvageView() {
    const c = this.ctx, pre = salvagePreview(c, [...this.checked]);
    const f = this.sel != null && this.checked.has(this.sel) ? findItem(c, this.sel) : null;
    const ask = this.confirm ? `<div class="fg-warn">${picked(c, this.checked, (it) => it.token) ? t('fg.tokenWarn') : ''}${picked(c, this.checked, (it) => it.set) ? t('fg.setWarn') : ''}${t('fg.askSalvage')}</div>` : '';
    const gear = f ? `${ask}<div class="fg-h">${t('fg.selected', { n: pre.count })}</div><div class="fg-detail"><div class="fg-detail-main">${itemDetail(f.item, this.cfg)}</div></div>` : `${ask}${this.doll()}`;
    const items = `${this.bagTabs([['pocket', t('fg.pocketN', { n: c.pocket.length })], ['stash', t('fg.stashN', { n: c.vault.stash.length })]])}
      <div class="fg-scroll">${this.grid(this.bagItems(), { check: true })}</div>
      <div class="fg-note">${t('fg.salvageNote')}</div>`;
    const short = pre.count && c.vault.gold < pre.gold;
    const gain = `<div class="fg-sv"><span>${t('fg.pickLabel')}</span><b>${t('fg.count', { n: pre.count })}</b></div>
      ${[0, 1, 2].map((q) => `<div class="fg-sv"><span><i class="pw t${q}"></i>${t('fg.powderOf', { part: tierLabel(q) })}</span><b>+${pre.powder[q]}</b></div>`).join('')}
      <span class="fg-sp"></span><div class="fg-sv"><span>${t('fg.salvCost')}</span><b class="${short ? 'down' : 'gold'}">◆ ${pre.gold}</b></div>`;
    const btns = this.confirm
      ? `<span class="fg-act-l"><button class="fg-btn" data-act="salvageNo">${t('no')}</button></span><span class="fg-act-r"><button class="fg-btn red" data-act="salvageYes">${t('fg.salvage')} · ◆${pre.gold}</button></span>`
      : `<span class="fg-act-l"><button class="fg-btn" data-act="checkAll">${t('fg.checkAll')}</button><button class="fg-btn" data-act="clearChecks" ${pre.count ? '' : 'disabled'}>${t('fg.clearChecks')}</button></span>
        <span class="fg-act-r">${short ? `<small class="down">${t('fg.needGold', { n: pre.gold - c.vault.gold })}</small>` : ''}<button class="fg-btn red" data-act="salvage" ${pre.count && !short ? '' : 'disabled'}>${t('fg.salvageGoCost', { n: pre.gold })}</button></span>`;
    return { gear, doll: !f, items, gain, btns };
  }

  // +10: one grade up for gold (legendary is the top)
  gradeUpButton(it) {
    const p = gradeUpPreview(this.ctx, it.id);
    if (p.reason === 'maxGrade') return `<b class="fg-topgrade">${t('fg.maxGrade')}</b>`;
    const short = p.reason === 'gold' ? `<small class="down">${t('fg.needGold', { n: p.cost - this.ctx.vault.gold })}</small>` : '';
    return `${short}<button class="fg-btn pri" data-act="gradeUp" ${p.ok ? '' : 'disabled'}>${t('fg.gradeUp', { grade: tr(this.cfg.grades[p.to].label), n: p.cost })}</button>`;
  }

  // the item as it would be at +to: each line at its new value with the gain beside it
  growCard(it, to, caption) {
    const cfg = this.cfg, d = describeItem(it, cfg), now = itemStats(it, cfg), next = itemStats({ ...it, enhance: to }, cfg);
    const keys = [...new Set([it.base.stat, ...it.affixes.map((a) => a.stat)])];
    const lines = keys.map((k) => {
      const int = (cfg.statLabels[k] || [k, 'int'])[1] === 'int';
      const gain = int ? Math.round(next[k]) - Math.round(now[k]) : Math.round((next[k] - now[k]) * 1000) / 10;
      return `<div class="iline fg-grow"><span>${formatStat(cfg, k, next[k])}</span>${gain > 0 ? `<b class="up">+${gain}${int ? '' : '%'}</b>` : ''}</div>`;
    }).join('');
    return `<div class="idetail"><div class="fg-cmp-h">${caption}</div><div class="iname" style="color:${d.gradeColor}">${d.name}</div>${lines}${d.effectText ? `<div class="ieffect">${d.effectText}</div>` : ''}</div>`;
  }

  enhanceView() {
    const c = this.ctx;
    if (this.bag !== 'worn' && this.bag !== 'pocket' && this.bag !== 'stash') this.bag = 'worn';
    const f = this.sel != null ? findItem(c, this.sel) : null;
    const e = this.cfg.enhance, have = c.vault.powder;
    const items = `${this.bagTabs([['worn', t('where.equipped')], ['pocket', t('fg.pocketN', { n: c.pocket.length })], ['stash', t('fg.stashN', { n: c.vault.stash.length })]])}
      <div class="fg-scroll">${this.grid(this.bagItems())}</div>
      <div class="fg-note">${t('fg.enhNote')}</div>`;
    if (!f) {
      return {
        gear: this.doll(), doll: true, items,
        btns: `<span class="fg-act-l"><span class="fg-stepper"><button disabled>−</button><b>-</b><button disabled>+</button><button disabled>${t('fg.max')}</button></span></span><span class="fg-act-r"><button class="fg-btn pri" disabled>${t('fg.enhance')}</button></span>`,
      };
    }
    const it = f.item, pre = enhancePreview(c, it.id, this.tier, this.count), maxed = it.enhance >= e.max;
    const need = maxed ? 0 : e.need[it.enhance];
    const cur = need ? (it.points / need) * 100 : 100;
    const after = pre.ok ? (pre.to > it.enhance ? 100 : (pre.points / need) * 100) : cur;
    const to = maxed ? it.enhance : Math.max(pre.ok ? pre.to : 0, it.enhance + 1);
    const gear = `<div class="fg-h">${t('fg.enhance')} <small>${t('fg.noFail')}</small>${this.backBtn()}</div>
      <div class="fg-enh-top"><span class="fg-enh-lv">+${it.enhance}${pre.ok && pre.to > it.enhance ? ` → <b class="up">+${pre.to}</b>` : ''}${maxed ? ` <small>${t('fg.maxed')}</small>` : ''}</span>
        <div class="fg-gauge"><i style="width:${cur}%"></i>${pre.ok ? `<i class="add" style="left:${cur}%;width:${Math.max(0, after - cur)}%"></i>` : ''}</div></div>
      <div class="fg-chips">${[0, 1, 2].map((q) => `<button class="fg-chip${this.tier === q ? ' on' : ''}" data-act="tier" data-v="${q}" ${have[q] ? '' : 'disabled'}>
        <span><span class="pw t${q}"></span>${tierLabel(q)} ${t('fg.count', { n: have[q] })}</span><small>${t('fg.perOne', { n: e.points[q] })}</small></button>`).join('')}</div>
      <div class="fg-detail">${maxed ? `<div class="fg-detail-main">${itemDetail(it, this.cfg)}</div>`
        : this.growCard(it, to, `${t('fg.atLevel', { n: to })}${pre.ok && pre.to > it.enhance ? '' : ` · ${t('fg.needMore')}`}`)}</div>`;
    const right = maxed ? this.gradeUpButton(it)
      : `${pre.reason === 'gold' ? `<small class="down">${t('fg.needGold', { n: pre.gold - c.vault.gold })}</small>` : ''}<button class="fg-btn pri" data-act="enhance" ${pre.ok ? '' : 'disabled'}>${t('fg.enhance')}${pre.gold ? ` · ◆${pre.gold}` : ''}</button>`;
    const btns = `<span class="fg-act-l"><span class="fg-stepper"><button data-act="cnt" data-v="-1">−</button><b>${pre.use || 0}</b><button data-act="cnt" data-v="1">+</button><button data-act="cnt" data-v="99">${t('fg.max')}</button></span></span>
      <span class="fg-act-r">${right}</span>`;
    return { gear, doll: false, items, btns };
  }

  // 각인: a legendary of a set part gets a set name (random) — or breaks into powder
  engraveView() {
    const c = this.ctx, ecfg = this.game.config.tuning.engrave;
    if (this.bag !== 'worn' && this.bag !== 'pocket' && this.bag !== 'stash') this.bag = 'worn';
    const f = this.sel != null ? findItem(c, this.sel) : null, ok = f && canEngrave(this.cfg, f.item);
    const items = `${this.bagTabs([['worn', t('where.equipped')], ['pocket', t('fg.pocketN', { n: c.pocket.length })], ['stash', t('fg.stashN', { n: c.vault.stash.length })]])}
      <div class="fg-scroll">${this.grid(this.bagItems(), { off: (it) => !canEngrave(this.cfg, it) })}</div>
      <div class="fg-note">${t('fg.engDim')}</div>`;
    if (!ok) {
      return {
        gear: `${f ? `<div class="fg-warn">${t('fg.engPick')}</div>` : ''}${this.doll()}`, doll: true, items,
        btns: `<span class="fg-act-l"><span class="fg-note">${t('fg.engPick')}</span></span><span class="fg-act-r"><button class="fg-btn red" disabled>${t('fg.engGoPlain')}</button></span>`,
      };
    }
    const it = f.item, cost = engraveCost(c.econ, it), base = engraveChance(ecfg, it, 1), short = c.vault.gold < cost;
    const gear = `<div class="fg-h">${t('fg.tabEngrave')} <small>${t('fg.engNth', { n: (it.engraves || 0) + 1 })}</small>${this.backBtn()}</div>
      <div class="fg-detail"><div class="fg-detail-main">${itemDetail(it, this.cfg)}</div>
        <div class="fg-engbox"><div class="fg-engrow"><span>${t('fg.engChance')}</span><b>${pct(base)}</b></div>
          <div class="fg-engsub">${t('fg.engHammer', { lo: pct(engraveChance(ecfg, it, 0)), hi: pct(engraveChance(ecfg, it, 3)) })}</div>
          <div class="fg-engrow"><span>${t('fg.engCost')}</span><b class="gold">◆ ${cost}</b></div>
          <div class="fg-engsub">${t('fg.engRandom')}</div><div class="fg-warn">${t(it.token ? 'fg.engTokenSafe' : 'fg.engFail')}</div></div></div>`;
    const btns = `<span class="fg-act-l"></span><span class="fg-act-r">${short ? `<small class="down">${t('fg.needGold', { n: cost - c.vault.gold })}</small>` : ''}<button class="fg-btn red" data-act="engrave" ${short ? 'disabled' : ''}>${t('fg.engGo', { n: cost })}</button></span>`;
    return { gear, doll: false, items, btns, tint: (1 - base) * ecfg.redTint }; // the likelier the break, the redder the forge
  }

  startEngrave() {
    const f = findItem(this.ctx, this.sel), ecfg = this.game.config.tuning.engrave;
    if (!f || !canEngrave(this.cfg, f.item) || this.hammer) return;
    const id = f.item.id;
    const h = this.hammer = new HammerGame(this.el, {
      speeds: hammerSpeeds(ecfg, f.item, this.game.rng), tolerance: ecfg.tolerance,
      onBlow: (good) => this.game.events.emit('hammerBlow', { good }),
      onDone: (hits) => { if (this.hammer === h) this.finishEngrave(id, hits); }, // (left the forge meanwhile: nothing happens)
    });
  }

  finishEngrave(id, hits) {
    const ecfg = this.game.config.tuning.engrave, f = findItem(this.ctx, id), name = f ? describeItem(f.item, this.cfg).name : '';
    this.stopHammer();
    const r = engraveItem(this.ctx, ecfg, id, hits, this.game.rng);
    if (!r.ok) { this.render(); return; }
    this.engResult = { ...r, hits, name };
    if (!r.success) this.sel = null;
    this.game.events.emit('engraveResult', { success: r.success });
    this.changed('engrave');
  }

  engResultView() {
    const r = this.engResult; // only whether it worked
    return `<div class="fg-engres-shade"></div><div class="fg-engres ${r.success ? 'ok' : 'bad'}">
      <div class="fg-engres-h">${t(r.success ? 'fg.engWin' : 'fg.engLose')}</div>
      <button class="fg-btn pri" data-act="engOk">${t('fg.engOk')}</button></div>`;
  }

  // sets: the list on the right; the chosen set's pieces and steps on the left
  setsView() {
    const cfg = this.cfg, v = this.ctx.vault, worn = this.game.gearSets || {};
    if (!this.setSel || !cfg.sets[this.setSel]) this.setSel = Object.keys(cfg.sets)[0];
    const id = this.setSel, s = cfg.sets[id], n = worn[id] || 0, total = Object.keys(s.pieces).length;
    const seen = v.seen[id] || {};
    const owners = setPieceOwners(this.ctx, id);
    let canWear = false;
    const pieces = Object.entries(s.pieces).map(([slot, name]) => {
      const o = owners[slot], on = o && o.where === 'equipped', own = o && !on;
      if (own) canWear = true;
      const label = `${relicIcon(cfg.parts[slot].icon, 22)}<span>${seen[slot] || o ? esc(tr(name)) : '???'}</span><small>${t(on ? 'fg.pieceWorn' : own ? 'fg.pieceOwn' : 'fg.pieceNone')}</small>`;
      // an owned piece not worn: tap to wear just that one
      return own ? `<button class="fg-piece seen own" data-act="wearPiece" data-v="${o.item.id}">${label}</button>`
        : `<div class="fg-piece${seen[slot] || on ? ' seen' : ''}${on ? ' on' : ''}">${label}</div>`;
    }).join('');
    const needs = Object.keys(s.labels).map(Number).sort((a, b) => a - b);
    const next = needs.find((k) => k > n);
    const bonus = needs.map((k) => `<div class="fg-bonus${n >= k ? ' on' : ''}${k === next ? ' next' : ''}"><b>${t('fg.setN', { n: k })}</b> ${esc(setLabel(cfg, id, k))}${k === next ? ` <small>${t('fg.next')}</small>` : ''}</div>`).join('');
    const gear = `<div class="fg-h">${esc(tr(s.name))} <span class="fg-setn">${t('fg.wornCount', { a: n, b: total })}</span></div>
      <div class="fg-pieces">${pieces}</div><div class="fg-bonuses">${bonus}</div>`;
    const rows = Object.entries(cfg.sets).map(([k, set]) => {
      const own = setPieceOwners(this.ctx, k);
      const dots = Object.keys(set.pieces).map((slot) => { const o = own[slot]; return `<i class="${o ? (o.where === 'equipped' ? 'on' : 'own') : ''}"></i>`; }).join('');
      return `<button class="fg-setrow${k === id ? ' sel' : ''}" data-act="setSel" data-v="${k}"><b>${esc(tr(set.name))}</b><small>${t('fg.wornCount', { a: worn[k] || 0, b: Object.keys(set.pieces).length })}</small><span class="fg-dots">${dots}</span></button>`;
    }).join('');
    const items = `<div class="fg-h">${t('fg.set')} <small>${t('fg.setsHint')}</small></div><div class="fg-scroll fg-setlist">${rows}</div>`;
    const btns = `<span class="fg-act-l"><span class="fg-note">${t('fg.dotsLegend')}</span></span>
      <span class="fg-act-r"><button class="fg-btn pri" data-act="wearSet" data-v="${id}" ${canWear ? '' : 'disabled'}>${t('fg.wearSet')}</button></span>`;
    return { gear, doll: false, items, btns };
  }

  // ---------- input ----------
  onClick(e) {
    const cell = e.target.closest('.icell');
    const b = e.target.closest('[data-act]');
    if (cell && !b) { this.pickCell(Number(cell.dataset.id)); return; }
    if (!b || b.disabled) return;
    const a = b.dataset.act, v = b.dataset.v, c = this.ctx;
    if (a === 'tab') { this.tab = v; this.sel = null; this.checked.clear(); this.confirm = false; if (v === 'enhance' || v === 'engrave') this.bag = 'worn'; else if (this.bag === 'worn') this.bag = 'pocket'; this.render(); }
    else if (a === 'engrave') this.startEngrave();
    else if (a === 'engOk') { this.engResult = null; this.render(); }
    else if (a === 'bag') { this.bag = v; this.render(); }
    else if (a === 'depart') this.onDepart();
    else if (a === 'title') this.onTitle();
    else if (a === 'token') this.onToken();
    else if (a === 'sets') { this.tab = 'sets'; this.setSel = v || null; this.sel = null; this.checked.clear(); this.confirm = false; this.render(); }
    else if (a === 'setSel') { this.setSel = v; this.render(); }
    else if (a === 'unsel') { this.sel = null; this.render(); }
    else if (a === 'statsOpen') { this.statsOpen = !this.statsOpen; this.render(); }
    else if (a === 'equip') { if (equipItem(c, this.sel, v || null).ok) { this.sel = null; this.changed('equip'); } } // back to the doll
    else if (a === 'unequip') { const s = c.loadout.find(this.sel); if (s && unequipItem(c, s).ok) { this.sel = null; this.changed('unequip'); } }
    else if (a === 'store') {
      const r = storeItem(c, this.sel);
      if (r.ok) { this.sel = null; this.changed('store'); } else if (r.reason === 'stashFull') this.flash(t('fg.stashFull'));
    } else if (a === 'take') { if (takeItem(c, this.sel).ok) { this.sel = null; this.changed('take'); } }
    else if (a === 'clearChecks') { this.checked.clear(); this.sel = null; this.confirm = false; this.render(); }
    else if (a === 'checkAll') { for (const id of salvageSelectAll(this.bagItems())) this.checked.add(id); this.confirm = false; this.render(); }
    else if (a === 'salvage') { this.confirm = true; this.freshDetail = true; this.render(); } // the warning sits at the top of the gear panel
    else if (a === 'salvageNo') { this.confirm = false; this.render(); }
    else if (a === 'salvageYes') { const r = salvageItems(c, [...this.checked]); this.confirm = false; if (r.ok) { this.checked.clear(); this.sel = null; this.changed('salvage'); } else { this.render(); if (r.reason === 'gold') this.flash(t('fg.needGold', { n: r.gold - c.vault.gold })); } }
    else if (a === 'auto') { const snap = snapshotGear(c); if (applyAutoEquip(c).changed) { this.undo = snap; this.sel = null; this.changed('auto'); } else this.flash(t('fg.autoNone')); }
    else if (a === 'undo') { if (this.undo) { restoreGear(c, this.undo); this.undo = null; this.changed('undo'); } }
    else if (a === 'wearPiece') { if (equipItem(c, Number(v)).ok) this.changed('equip'); }
    else if (a === 'wearSet') { if (equipSet(c, v).changed) this.changed('equip'); }
    else if (a === 'buySlot') { if (buyStashSlot(c).ok) this.changed('buySlot'); }
    else if (a === 'gradeUp') { if (gradeUpItem(c, this.sel).ok) this.changed('gradeUp'); }
    else if (a === 'tier') { this.tier = Number(v); this.count = 1; this.render(); }
    else if (a === 'cnt') { this.count = Number(v) === 99 ? 999 : Math.max(1, (enhancePreview(c, this.sel, this.tier, this.count).use || 0) + Number(v)); this.render(); }
    else if (a === 'enhance') { const r = enhanceItem(c, this.sel, this.tier, this.count); if (r.ok) { this.count = 1; this.changed(r.to > r.from ? 'enhanceUp' : 'enhance'); } }
  }

  pickCell(id) {
    if (this.tab === 'salvage') {
      const f = findItem(this.ctx, id);
      if (!f || f.where === 'equipped') return;
      if (this.checked.has(id)) { this.checked.delete(id); if (this.sel === id) this.sel = null; } else { this.checked.add(id); this.sel = id; }
      this.confirm = false;
      this.freshDetail = true;
    } else if (this.tab !== 'sets') {
      this.sel = this.sel === id ? null : id;
      this.freshDetail = true; // another item's detail starts at its top
      if (this.tab === 'enhance' && this.sel != null) {
        const have = this.ctx.vault.powder;
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
