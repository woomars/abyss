// 선조의 전당: the family's ancestors (what each one did, which bosses he slew, what he passed down),
// the medal codex (who earned each first) and the boss codex. Read-only view of one save slot.
import { relicIcon } from './relicIcons.js';
import { floorLabel } from '../core/floorLabel.js';
import { bossRoster, backfillMedals, trophyValue } from '../game/Medals.js';
import { formatValue } from '../game/Relics.js';
import { t, tr, trItemName, trPerson, fullName, formatDate, locale } from '../i18n/index.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nameOf = (p) => `${t('gen', { n: p.generation })} ${esc(fullName(p.family, p.given))}`;
const genName = (p) => t('hall.genName', { gen: t('gen', { n: p.generation }), given: esc(trPerson(p.given, 'given')) });
const day = (ms) => formatDate(ms, false);
const TYPE_ICON = { warrior: 'sword', mage: 'flame', ranged: 'eye', summoner: 'fang' };

// "칼날의 정수 ×2 (공격력 +30%)" for an essence record { count, total }
export function essenceLine(relicsCfg, id, e, withStat = true) {
  const d = relicsCfg.list[id];
  if (!d) return '';
  const stat = tr(d.desc).replace('{v}', formatValue(e.total, d.fmt));
  return `<b>${esc(tr(d.name))}</b> ×${e.count}${withStat ? ` <small>(${esc(stat)})</small>` : ''}`;
}

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
      essences: live && live.essences ? live.essences : {},
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
    const trophies = this.config.medals.trophies || [];
    const reached = trophies.filter((x) => v.trophies[x.id]).length;
    const kinds = Object.keys(v.essence.owned).filter((id) => v.essence.owned[id] > 0).length;
    const body = this.tab === 'medals' ? this.renderMedals() : this.tab === 'bosses' ? this.renderBosses(roster)
      : this.tab === 'essence' ? this.renderEssence(people) : this.tab === 'trophies' ? this.renderTrophies(roster)
      : this.tab === 'chronicle' ? this.renderChronicles() : this.renderAncestors(people);
    const chron = v.chronicles || [];
    this.el.innerHTML = `
      <div class="hl-wrap">
        <div class="hl-head">
          <div class="hl-title">${t('hall.title')} <small>${t('title.house', { family: esc(trPerson(v.lineage.family, 'family')) })}</small></div>
          <div class="hl-tabs">${tab('ancestors', t('hall.tabAncestors', { n: people.length }))}${tab('essence', t('hall.tabEssence', { n: kinds }))}${tab('medals', t('hall.tabMedals', { a: got, b: list.length }))}${tab('trophies', t('hall.tabTrophies', { a: reached, b: trophies.length }))}${tab('bosses', t('hall.tabBosses', { a: slain, b: roster.length }))}${chron.length ? tab('chronicle', t('hall.tabChronicle', { n: chron.length })) : ''}</div>
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
      <div class="hl-sec">${t('hall.essenceLeft')}</div>
      <div class="hl-bosses">${Object.keys(p.essences || {}).length
        ? Object.entries(p.essences).map(([id, e]) => `<div>${essenceLine(this.config.relics, id, e)}${e.life ? ` <small class="dim">${t('hall.lifeOnly')}</small>` : ''}</div>`).join('')
        : `<span class="dim">${!p.living && !p.essences ? t('hall.noRecord') : t('none')}</span>`}</div>
      ${p.living ? '' : `<div class="hl-sec">${t('hall.passed')}</div>
      <div class="hl-kept">${(p.survived || []).length ? p.survived.map((n) => `<b>${esc(trItemName(n))}</b>`).join(', ') : `<span class="dim">${t('none')}</span>`}${p.lost ? ` <small class="dim">${t('hall.lostN', { n: p.lost })}</small>` : ''}</div>`}`;
  }

  // what the house carries now, essence by essence, and which ancestors left it
  renderEssence(people) {
    const v = this.vault, rc = this.config.relics;
    const ids = Object.keys(rc.list).filter((id) => (v.essence.owned[id] || 0) > 0);
    if (!ids.length) return `<p class="hl-note">${t('hall.essenceNote')}</p><div class="dim hl-empty">${t('hall.essenceNone')}</div>`;
    const rows = ids.map((id) => {
      const d = rc.list[id], n = v.essence.owned[id];
      const total = v.essence.stats[d.stat] || 0;
      const by = people.filter((p) => p.essences && p.essences[id] && !p.essences[id].life)
        .map((p) => `${genName(p)} ×${p.essences[id].count}`);
      return `<div class="hl-ess">
        <span class="hl-eicon">${relicIcon(d.icon, 24)}</span>
        <div class="hl-btext">
          <div class="hl-bname">${esc(tr(d.name))} <small>×${n}${d.max ? ` · ${t('hall.cap', { n: d.max })}` : ''}</small></div>
          <div class="hl-estat">${esc(tr(d.desc).replace('{v}', formatValue(total, d.fmt)))}</div>
          ${by.length ? `<div class="hl-slayers">${t('hall.essenceBy', { list: by.join(' · ') })}</div>` : ''}
        </div>
      </div>`;
    }).join('');
    return `<p class="hl-note">${t('hall.essenceNote')}</p><div class="hl-grid">${rows}</div>`;
  }

  // 지난 연대기: the lines that reached floor 100 — the latest first, each with its generations
  renderChronicles() {
    const list = (this.vault.chronicles || []).slice().reverse();
    if (!list.length) return `<p class="hl-note">${t('hall.chronicleNote')}</p><div class="dim hl-empty">${t('hall.chronicleNone')}</div>`;
    const rows = list.map((c) => {
      const e = c.ending || {};
      const people = (c.people || []).map((p) => `${t('gen', { n: p.generation })} ${esc(trPerson(p.given, 'given'))}${p.reached ? '' : ` <small>${floorLabel(p.floor || 1)}</small>`}`).join(' · ');
      return `<div class="hl-ess hl-chron">
        <div class="hl-btext">
          <div class="hl-bname">${t('hall.chronicleHead', { n: c.cycle, family: esc(trPerson(c.family, 'family')) })} <small>${day(c.at)}</small></div>
          <div class="hl-estat">${t('hall.chronicleLine', { first: esc(trPerson(c.founder, 'given')), gen: c.generations, last: esc(trPerson(c.last, 'given')) })}</div>
          <div class="hl-slayers">${t('hall.chronicleStats', { level: c.level, medals: c.medals, trophies: c.trophies, bosses: c.bosses })}</div>
          <div class="hl-slayers">${people}</div>
          ${e.child ? `<div class="hl-slayers">${t('hall.chronicleChild', { name: esc(trPerson(e.child, 'given')), item: e.item ? esc(trItemName(e.item)) : t('ending.legacy') })}</div>` : ''}
        </div>
      </div>`;
    }).join('');
    return `<p class="hl-note">${t('hall.chronicleNote')}</p><div class="hl-grid hl-chrons">${rows}</div>`;
  }

  // family milestones: reached ones show who reached them, the rest how far the house has come
  renderTrophies(roster) {
    const v = this.vault, tiers = this.config.medals.tiers;
    const live = this.people()[0];
    const num = (n) => Number(n).toLocaleString(locale());
    return `<div class="hl-grid">${(this.config.medals.trophies || []).map((x) => {
      const r = v.trophies[x.id], c = tiers[x.tier].color;
      const cur = Math.min(x.value, trophyValue(x.kind, v, { stats: live, roster }));
      return `<div class="hl-medal hl-trophy${r ? '' : ' locked'}">
        <span class="hl-cup${r ? '' : ' locked'}" style="--mc:${c}">${relicIcon('trophy', 22)}</span>
        <div class="hl-mtext">
          <div class="hl-mname" style="${r ? `color:${c}` : ''}">${esc(tr(x.name))} <small>${tr(tiers[x.tier].label)}</small></div>
          <div class="hl-mdesc">${esc(tr(x.desc))}</div>
          ${r ? `<div class="hl-mfirst">${t('hall.reached', { who: nameOf(r) })}${r.at ? ` <small>· ${day(r.at)}</small>` : ''}</div>`
            : `<div class="hl-bar"><i style="width:${Math.round((cur / x.value) * 100)}%"></i></div><div class="hl-mfirst dim">${num(cur)} / ${num(x.value)}</div>`}
        </div>
      </div>`;
    }).join('')}</div>`;
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
        <div class="hl-bicon">${relicIcon(TYPE_ICON[b.type] || 'fang', 30)}</div>
        <div class="hl-btext">
          <div class="hl-bname">${r ? esc(tr(b.name)) : '???'} <small>${t(`btype.${b.type}`)} · ${esc(tr(b.title))} · ${floorLabel(b.floor)} · ${t('hall.fromCycle', { n: b.minCycle + 1 })}</small></div>
          ${r ? `<div>${t('hall.killsBy', { n: r.kills, floor: floorLabel(r.deepest) })}</div>
          <div class="hl-mfirst">${t('hall.firstSlayer', { who: nameOf(r.first), floor: floorLabel(r.first.floor) })}</div>
          ${slayers.length ? `<div class="hl-slayers">${slayers.join(' · ')}</div>` : ''}` : `<div class="dim">${t('hall.notYet')}</div>`}
        </div>
      </div>`;
    }).join('')}</div>`;
  }
}
