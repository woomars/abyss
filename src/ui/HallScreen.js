// 선조의 전당: the family's ancestors (what each one did, which bosses he slew, what he passed down),
// the medal codex (who earned each first) and the boss codex. Read-only view of one save slot.
import { relicIcon } from './relicIcons.js';
import { floorLabel } from '../core/floorLabel.js';
import { bossRoster, backfillMedals } from '../game/Medals.js';
import { t, tr, trItemName, trPerson, fullName, formatDate } from '../i18n/index.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nameOf = (p) => `${t('gen', { n: p.generation })} ${esc(fullName(p.family, p.given))}`;
const genName = (p) => t('hall.genName', { gen: t('gen', { n: p.generation }), given: esc(trPerson(p.given, 'given')) });
const day = (ms) => formatDate(ms, false);

export class HallScreen {
  constructor(root, { config, onBack }) {
    this.config = config;
    this.onBack = onBack;
    this.tab = 'ancestors';
    this.sel = 0;
    this.el = document.createElement('div');
    this.el.className = 'overlay hall-screen interactive hidden';
    root.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const a = b.dataset.act;
      if (a === 'back') { this.hide(); this.onBack(); } else if (a === 'tab') { this.tab = b.dataset.tab; this.render(); } else if (a === 'pick') { this.sel = Number(b.dataset.i); this.render(); }
    });
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }
  hide() { this.el.classList.add('hidden'); }

  show(vault) {
    this.vault = vault;
    backfillMedals(vault, this.config.medals); // older saves (view only; the game does it again on load)
    this.tab = 'ancestors';
    this.sel = 0;
    this.el.classList.remove('hidden');
    this.render();
  }

  // the living hero first, then the fallen from the latest back
  people() {
    const v = this.vault, l = v.lineage;
    const live = v.state === 'rest' && v.run ? v.run.stats : v.state === 'run' ? v.runStats : null;
    const cur = {
      living: true, given: l.given, family: l.family, generation: l.generation, level: v.progress.level,
      floor: v.state === 'rest' && v.run ? v.run.floor : null, state: v.state,
      kills: live ? live.kills : 0, bestCombo: live ? live.bestCombo : 0,
      medals: live && live.medals ? live.medals : [], bosses: live && live.bosses ? live.bosses : {},
    };
    return [cur, ...l.history.slice().reverse()];
  }

  medal(id) { return this.config.medals.list.find((m) => m.id === id); }

  medalBadge(m, earned = true, size = 30) {
    const t = this.config.medals.tiers[m.tier];
    return `<span class="hl-badge${earned ? '' : ' locked'}" style="--mc:${t.color};width:${size}px;height:${size}px">${relicIcon(m.icon, Math.round(size * 0.55))}</span>`;
  }

  // the language changed while it is up
  relabel() { if (this.isOpen && this.vault) this.render(); }

  render() {
    const v = this.vault, list = this.config.medals.list;
    const people = this.people();
    const got = list.filter((m) => v.medals[m.id] && v.medals[m.id].first).length;
    const roster = bossRoster(this.config.dungeon, this.config.enemies);
    const slain = roster.filter((b) => v.bestiary[b.key]).length;
    const tab = (id, label) => `<button class="hl-tab${this.tab === id ? ' on' : ''}" data-act="tab" data-tab="${id}">${label}</button>`;
    const body = this.tab === 'medals' ? this.renderMedals() : this.tab === 'bosses' ? this.renderBosses(roster) : this.renderAncestors(people);
    this.el.innerHTML = `
      <div class="hl-wrap">
        <div class="hl-head">
          <div class="hl-title">${t('hall.title')} <small>${t('title.house', { family: esc(trPerson(v.lineage.family, 'family')) })}</small></div>
          <div class="hl-tabs">${tab('ancestors', t('hall.tabAncestors', { n: people.length }))}${tab('medals', t('hall.tabMedals', { a: got, b: list.length }))}${tab('bosses', t('hall.tabBosses', { a: slain, b: roster.length }))}</div>
          <button class="tm-btn small" data-act="back">${t('back')}</button>
        </div>
        <div class="hl-body">${body}</div>
      </div>`;
  }

  renderAncestors(people) {
    const sel = Math.min(this.sel, people.length - 1), p = people[sel];
    const rows = people.map((q, i) => `
      <button class="hl-row${i === sel ? ' on' : ''}" data-act="pick" data-i="${i}">
        <b>${genName(q)}</b>
        <small>${q.living ? `<span class="hl-live">${t('hall.alive')}</span>` : `${floorLabel(q.floor)} · Lv ${q.level}`}</small>
        <span class="hl-mini">${(q.medals || []).length ? `${relicIcon('shield', 11)}${q.medals.length}` : ''}</span>
      </button>`).join('');
    return `<div class="hl-split"><div class="hl-list">${rows}</div><div class="hl-detail">${this.renderPerson(p)}</div></div>`;
  }

  renderPerson(p) {
    const fell = p.living
      ? (p.state === 'rest' ? t('where.rest', { floor: floorLabel(p.floor) }) : p.state === 'run' ? t('where.run') : t('where.idleHall'))
      : `${t('hall.fell', { floor: floorLabel(p.floor), killer: p.killer ? esc(tr(p.killer)) : '' })}${p.at ? ` <small>${day(p.at)}</small>` : ''}`;
    const medals = (p.medals || []).map((id) => this.medal(id)).filter(Boolean);
    const bosses = Object.values(p.bosses || {});
    const nBoss = bosses.reduce((n, b) => n + b.count, 0);
    const old = !p.living && !p.medals && !p.bosses; // saved before medals existed
    return `
      <div class="hl-who">${nameOf(p)}</div>
      <div class="hl-fell${p.living ? ' live' : ''}">${fell}</div>
      <div class="hs-stats hl-stats">
        <span>${t('stat.level')}<b>${p.level}</b></span><span>${t('stat.kills')}<b>${p.kills}</b></span><span>${t('stat.bestCombo')}<b>${p.bestCombo}</b></span><span>${t('stat.bosses')}<b>${p.bosses ? nBoss : '-'}</b></span>
      </div>
      <div class="hl-sec">${t('hall.medals')}</div>
      <div class="hl-medals">${medals.length ? medals.map((m) => `<span class="hl-chip">${this.medalBadge(m, true, 22)}${esc(tr(m.name))}</span>`).join('') : `<span class="dim">${t('hall.noneYet')}</span>`}</div>
      <div class="hl-sec">${t('hall.slain')}</div>
      <div class="hl-bosses">${bosses.length
        ? bosses.map((b) => `<div><b>${esc(tr(b.name))}</b> <small>${esc(tr(b.title))}</small> ×${b.count} <small>· ${t('hall.deepest', { floor: floorLabel(b.deepest) })}</small></div>`).join('')
        : `<span class="dim">${old ? t('hall.noRecord') : t('none')}</span>`}</div>
      ${p.living ? '' : `<div class="hl-sec">${t('hall.passed')}</div>
      <div class="hl-kept">${(p.survived || []).length ? p.survived.map((n) => `<b>${esc(trItemName(n))}</b>`).join(', ') : `<span class="dim">${t('none')}</span>`}${p.lost ? ` <small class="dim">${t('hall.lostN', { n: p.lost })}</small>` : ''}</div>`}`;
  }

  renderMedals() {
    const v = this.vault, tiers = this.config.medals.tiers;
    return `<div class="hl-grid">${this.config.medals.list.map((m) => {
      const r = v.medals[m.id], earned = !!(r && r.first);
      return `<div class="hl-medal${earned ? '' : ' locked'}">
        ${this.medalBadge(m, earned, 34)}
        <div class="hl-mtext">
          <div class="hl-mname" style="${earned ? `color:${tiers[m.tier].color}` : ''}">${esc(tr(m.name))} <small>${tr(tiers[m.tier].label)}</small></div>
          <div class="hl-mdesc">${esc(tr(m.desc))}</div>
          ${earned ? `<div class="hl-mfirst">${t('hall.first', { who: nameOf(r.first) })}${r.first.floor ? ` · ${floorLabel(r.first.floor)}` : ''}${r.count > 1 ? ` <small>· ${t('hall.count', { n: r.count })}</small>` : ''}</div>` : `<div class="hl-mfirst dim">${t('hall.nobody')}</div>`}
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  renderBosses(roster) {
    const v = this.vault, hist = v.lineage.history;
    return `<div class="hl-blist">${roster.map((b) => {
      const r = v.bestiary[b.key];
      const slayers = hist.filter((h) => h.bosses && h.bosses[b.key]).map((h) => `${genName(h)} ×${h.bosses[b.key].count}`);
      const cur = this.people()[0];
      if (cur.bosses[b.key]) slayers.push(`${genName(cur)} ×${cur.bosses[b.key].count} <small>${t('hall.living')}</small>`);
      return `<div class="hl-boss${r ? '' : ' locked'}">
        <div class="hl-bicon">${relicIcon(b.type === 'gatekeeper' ? 'flame' : 'fang', 30)}</div>
        <div class="hl-btext">
          <div class="hl-bname">${r ? esc(tr(b.name)) : '???'} <small>${esc(tr(b.title))} · ${t('hall.bossFrom', { floor: floorLabel(b.floor), n: this.config.dungeon.cycleLength })}</small></div>
          ${r ? `<div>${t('hall.killsBy', { n: r.kills, floor: floorLabel(r.deepest) })}</div>
          <div class="hl-mfirst">${t('hall.firstSlayer', { who: nameOf(r.first), floor: floorLabel(r.first.floor) })}</div>
          ${slayers.length ? `<div class="hl-slayers">${slayers.join(' · ')}</div>` : ''}` : `<div class="dim">${t('hall.notYet')}</div>`}
        </div>
      </div>`;
    }).join('')}</div>`;
  }
}
