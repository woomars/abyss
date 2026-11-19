// 선조의 전당 as a recollection (Phase 6, 12): tabs on top, the family's timeline in time order (what each
// ancestor won, how each fell), and along the bottom a strip where the hero walks through those same
// moments in step with the list. Read-only view of one save slot.
import { relicIcon } from './relicIcons.js';
import { bossRoster, backfillMedals } from '../logic/progress/Medals.js';
import { formatValue } from '../logic/progress/Relics.js';
import { t, tr, trItemName, trPerson, fullName, formatDate, floorText } from '../i18n/index.js';
import { buildTimeline } from './chronicle.js';
import { ChronicleStrip } from './ChronicleStrip.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nameOf = (p) => `${t('gen', { n: p.generation })} ${esc(fullName(p.family, p.given))}`;
const genName = (p) => t('hall.genName', { gen: t('gen', { n: p.generation }), given: esc(trPerson(p.given, 'given')) });
const day = (ms) => formatDate(ms, false);
const TYPE_ICON = { warrior: 'sword', mage: 'flame', ranged: 'eye', summoner: 'fang', assassin: 'eye', golem: 'shield' };

// "칼날의 정수 ×2 (공격력 +30%)" for an essence record { count, total }
export function essenceLine(relicsCfg, id, e, withStat = true) {
  const d = relicsCfg.list[id];
  if (!d) return '';
  const stat = tr(d.desc).replace('{v}', formatValue(e.total, d.fmt));
  return `<b>${esc(tr(d.name))}</b> ×${e.count}${withStat ? ` <small>(${esc(stat)})</small>` : ''}`;
}

export class HallScreen {
  constructor(root, { config, onBack, music = null }) {
    this.config = config;
    this.onBack = onBack;
    this.music = music;
    this.tab = 'all';
    this.open = -1; // the timeline row opened (an ancestor's whole story)
    this.el = document.createElement('div');
    this.el.className = 'overlay hall-screen interactive hidden';
    root.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const a = b.dataset.act;
      if (a === 'back') { const next = this.onNext; this.hide(); if (next) next(); else this.onBack(); } else if (a === 'tab') { this.tab = b.dataset.tab; this.open = -1; this.render(); } else if (a === 'pick') { const i = Number(b.dataset.i); this.open = this.open === i ? -1 : i; this.render(true); }
    });
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }
  hide() { this.el.classList.add('hidden'); if (this.strip) { this.strip.stop(); this.strip = null; } }

  // onNext: after the ending — the family's recollection, then on to a new beginning
  show(vault, { onNext = null } = {}) {
    this.vault = vault;
    this.onNext = onNext;
    if (this.music) this.music.play('chronicle');
    backfillMedals(vault, this.config.medals); // older saves (view only; the game does it again on load)
    this.tab = 'all';
    this.open = -1;
    this.el.classList.remove('hidden');
    this.render();
  }

  // the living hero first, then the fallen from the latest back
  people() {
    const v = this.vault, l = v.lineage;
    const live = v.state === 'rest' && v.run ? v.run.stats : v.state === 'run' ? v.runStats : null;
    const cur = {
      living: true, given: l.given, family: l.family, generation: l.generation, level: v.progress.level,
      floor: v.run ? v.run.floor : null, state: v.state, saved: !!(v.run && v.run.saved), auto: !!(v.run && v.run.auto),
      kills: live ? live.kills : 0, bestCombo: live ? live.bestCombo : 0,
      medals: live && live.medals ? live.medals : [], bosses: live && live.bosses ? live.bosses : {},
      essences: live && live.essences ? live.essences : {},
    };
    return [cur, ...l.history.slice().reverse()];
  }

  medal(id) { return this.config.medals.list.find((m) => m.id === id); }

  medalBadge(m, earned = true, size = 30) {
    const t = this.config.look.medals.tiers[m.tier];
    return `<span class="hl-badge${earned ? '' : ' locked'}" style="--mc:${t.color};width:${size}px;height:${size}px">${relicIcon(m.icon, Math.round(size * 0.55))}</span>`;
  }

  // the language changed while it is up
  relabel() { if (this.isOpen && this.vault) this.render(true); }

  // keep: the same tab drawn again (a row opened, the language changed) — the list and the walk stay where they were
  render(keep = false) {
    const old = this.el.querySelector('.hl-tlist');
    const place = keep && old && this.strip ? { top: old.scrollTop, cursor: this.strip.cursor, target: this.strip.target } : null;
    const v = this.vault, list = this.config.medals.list;
    const people = this.people();
    const got = list.filter((m) => v.medals[m.id] && v.medals[m.id].first).length;
    const roster = bossRoster(this.config.dungeon, this.config.enemies);
    const slain = roster.filter((b) => v.bestiary[b.key]).length;
    const tab = (id, label) => `<button class="hl-tab${this.tab === id ? ' on' : ''}" data-act="tab" data-tab="${id}">${label}</button>`;
    const trophies = this.config.medals.trophies || [];
    const reached = trophies.filter((x) => v.trophies[x.id]).length;
    const kinds = Object.keys(v.essence.owned).filter((id) => v.essence.owned[id] > 0).length;
    const events = buildTimeline(v, this.config, this.tab);
    if (this.tab === 'all' || this.tab === 'ancestors') events.push({ kind: 'now', at: Date.now(), who: { given: people[0].given, generation: people[0].generation, family: v.lineage.family }, floor: people[0].floor, person: people[0] });
    const body = this.renderTimeline(events);
    const chron = v.chronicles || [];
    this.el.innerHTML = `
      <div class="hl-wrap">
        <div class="hl-head">
          <div class="hl-title">${t('hall.title')} <small>${t('title.house', { family: esc(trPerson(v.lineage.family, 'family')) })}</small></div>
          <div class="hl-tabs">${tab('all', t('hall.tabAll'))}${tab('ancestors', t('hall.tabAncestors', { n: people.length }))}${tab('essence', t('hall.tabEssence', { n: kinds }))}${tab('medals', t('hall.tabMedals', { a: got, b: list.length }))}${tab('trophies', t('hall.tabTrophies', { a: reached, b: trophies.length }))}${tab('bosses', t('hall.tabBosses', { a: slain, b: roster.length }))}${chron.length ? tab('chronicle', t('hall.tabChronicle', { n: chron.length })) : ''}</div>
          <button class="tm-btn small${this.onNext ? ' primary' : ''}" data-act="back">${this.onNext ? t('hall.next') : t('back')}</button>
        </div>
        <div class="hl-body tl">${body}</div>
      </div>`;
    if (this.strip) this.strip.stop();
    const tlist = this.el.querySelector('.hl-tlist'), canvas = this.el.querySelector('.hl-strip');
    this.strip = tlist && canvas && events.length ? new ChronicleStrip(canvas, tlist, events, this.config, (e) => this.label(e)) : null;
    if (place && this.strip) { tlist.scrollTop = place.top; this.strip.wrote = tlist.scrollTop; Object.assign(this.strip, { cursor: place.cursor, target: place.target }); }
  }

  // the short line over an event on the strip
  label(e) {
    const name = e.kind === 'boss' ? tr(e.boss.name) : e.kind === 'medal' ? tr(e.medal.name) : e.kind === 'trophy' ? tr(e.trophy.name)
      : e.kind === 'essence' ? tr((this.config.relics.list[e.key] || {}).name || '') : e.kind === 'chronicle' ? t('hall.chronicleHead', { n: e.chronicle.cycle, family: trPerson(e.chronicle.family, 'family') })
        : e.kind === 'now' ? t('hall.evNow') : t('hall.fell', { floor: floorText(e.floor), killer: e.killer ? tr(e.killer) : '' });
    return `${genName(e.who)} · ${name}`;
  }

  // one row of the timeline: what, who, where, when (an ancestor's row opens his whole story)
  eventRow(e, i) {
    const who = genName(e.who), where = e.floor ? floorText(e.floor) : '', when = e.at ? day(e.at) : '';
    const sub = [who, where, when].filter(Boolean).join(' · ');
    let icon, title;
    if (e.kind === 'death') { icon = '<span class="hl-grave">✝</span>'; title = t('hall.fell', { floor: floorText(e.floor), killer: e.killer ? esc(tr(e.killer)) : '' }); }
    else if (e.kind === 'now') { icon = '<span class="hl-grave live">➤</span>'; title = t('hall.evNow'); }
    else if (e.kind === 'medal') { icon = this.medalBadge(e.medal, true, 26); title = `<span style="color:${this.config.look.medals.tiers[e.medal.tier].color}">${esc(tr(e.medal.name))}</span>`; }
    else if (e.kind === 'trophy') { const c = this.config.look.medals.tiers[e.trophy.tier].color; icon = `<span class="hl-cup" style="--mc:${c}">${relicIcon('trophy', 18)}</span>`; title = `<span style="color:${c}">${esc(tr(e.trophy.name))}</span>`; }
    else if (e.kind === 'boss') { icon = `<span class="hl-bicon sm">${relicIcon(TYPE_ICON[e.boss.type] || 'fang', 20)}</span>`; title = `${t('hall.evBoss', { name: esc(tr(e.boss.name)) })} <small>${t(`btype.${e.boss.type}`)}</small>`; }
    else if (e.kind === 'essence') { const d = this.config.relics.list[e.key] || {}; icon = `<span class="hl-eicon">${relicIcon(d.icon || 'flame', 20)}</span>`; title = t('hall.evEssence', { name: esc(tr(d.name || e.key)), n: e.count }); }
    else { icon = `<span class="hl-cup" style="--mc:#c9a86a">${relicIcon('trophy', 18)}</span>`; title = t('hall.chronicleHead', { n: e.chronicle.cycle, family: esc(trPerson(e.chronicle.family, 'family')) }); }
    const canOpen = (e.person && (e.kind === 'death' || e.kind === 'now')) || e.kind === 'chronicle';
    const detail = e.kind === 'chronicle' ? this.chronicleStory(e.chronicle) : canOpen ? this.renderPerson(e.person) : '';
    return `<div class="hl-ev${i === this.open ? ' on' : ''}">
      <span class="hl-evicon">${icon}</span><div class="hl-evtext"><div class="hl-evhead"${canOpen ? ` data-act="pick" data-i="${i}"` : ''}><b>${title}</b><small>${sub}</small></div>
      ${i === this.open && canOpen ? `<div class="hl-detail open">${detail}</div>` : ''}</div></div>`;
  }

  // a past chronicle opened: from the founder to the last, what the line won, the child and the heirloom
  chronicleStory(c) {
    const e = c.ending || {};
    const people = (c.people || []).map((p) => `${t('gen', { n: p.generation })} ${esc(trPerson(p.given, 'given'))}${p.reached ? '' : ` <small>${floorText(p.floor || 1)}</small>`}`).join(' · ');
    return `<div>${t('hall.chronicleLine', { first: esc(trPerson(c.founder, 'given')), gen: c.generations, last: esc(trPerson(c.last, 'given')) })}</div>
      <div class="dim">${t('hall.chronicleStats', { level: c.level, medals: c.medals, trophies: c.trophies, bosses: c.bosses })}</div>
      <div class="dim">${people}</div>
      ${e.child ? `<div>${t('hall.chronicleChild', { name: esc(trPerson(e.child, 'given')), item: e.item ? esc(trItemName(e.item)) : t('ending.legacy') })}</div>` : ''}`;
  }

  // the essence tab: what the house holds now (kind, count, what it gives), above the ancestors who left it
  essenceNow() {
    const v = this.vault, rc = this.config.relics;
    const ids = Object.keys(rc.list).filter((id) => (v.essence.owned[id] || 0) > 0);
    if (!ids.length) return '';
    return `<div class="hl-esum">${ids.map((id) => { const d = rc.list[id]; return `<span>${relicIcon(d.icon, 16)} <b>${esc(tr(d.name))}</b> ×${v.essence.owned[id]} <small>${esc(tr(d.desc).replace('{v}', formatValue(v.essence.stats[d.stat] || 0, d.fmt)))}</small></span>`; }).join('')}</div>`;
  }

  renderTimeline(events) {
    const head = this.tab === 'essence' ? this.essenceNow() : '';
    if (!events.length) return `<div class="hl-time">${head}<div class="dim hl-empty">${t('hall.timelineNone')}</div></div>`;
    return `<div class="hl-time">${head}<div class="hl-tlist">${events.map((e, i) => this.eventRow(e, i)).join('')}</div><canvas class="hl-strip"></canvas></div>`;
  }

  renderPerson(p) {
    const fell = p.living
      ? (p.state === 'rest' ? t('where.rest', { floor: floorText(p.floor) }) : p.state === 'run' ? (p.saved ? t('where.saved', { floor: floorText(p.floor) }) : p.auto ? t('where.resume', { floor: floorText(p.floor) }) : t('where.run')) : t('where.idleHall'))
      : `${t('hall.fell', { floor: floorText(p.floor), killer: p.killer ? esc(tr(p.killer)) : '' })}${p.at ? ` <small>${day(p.at)}</small>` : ''}`;
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
        ? bosses.map((b) => `<div><b>${esc(tr(b.name))}</b> <small>${esc(tr(b.title))}</small> ×${b.count} <small>· ${t('hall.deepest', { floor: floorText(b.deepest) })}</small></div>`).join('')
        : `<span class="dim">${old ? t('hall.noRecord') : t('none')}</span>`}</div>
      <div class="hl-sec">${t('hall.essenceLeft')}</div>
      <div class="hl-bosses">${Object.keys(p.essences || {}).length
        ? Object.entries(p.essences).map(([id, e]) => `<div>${essenceLine(this.config.relics, id, e)}${e.life ? ` <small class="dim">${t('hall.lifeOnly')}</small>` : ''}</div>`).join('')
        : `<span class="dim">${!p.living && !p.essences ? t('hall.noRecord') : t('none')}</span>`}</div>
      ${p.living ? '' : `<div class="hl-sec">${t('hall.passed')}</div>
      <div class="hl-kept">${(p.survived || []).length ? p.survived.map((n) => `<b>${esc(trItemName(n))}</b>`).join(', ') : `<span class="dim">${t('none')}</span>`}${p.lost ? ` <small class="dim">${t('hall.lostN', { n: p.lost })}</small>` : ''}</div>`}`;
  }
}
