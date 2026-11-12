// 선조의 전당: the family's ancestors (what each one did, which bosses he slew, what he passed down),
// the medal codex (who earned each first) and the boss codex. Read-only view of one save slot.
import { relicIcon } from './relicIcons.js';
import { floorLabel } from '../core/floorLabel.js';
import { bossRoster, backfillMedals } from '../game/Medals.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nameOf = (p) => `${p.generation}대손 ${esc(p.family)} ${esc(p.given)}`;

function day(ms) {
  if (!ms) return '';
  const d = new Date(ms), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
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
    };
    return [cur, ...l.history.slice().reverse()];
  }

  medal(id) { return this.config.medals.list.find((m) => m.id === id); }

  medalBadge(m, earned = true, size = 30) {
    const t = this.config.medals.tiers[m.tier];
    return `<span class="hl-badge${earned ? '' : ' locked'}" style="--mc:${t.color};width:${size}px;height:${size}px">${relicIcon(m.icon, Math.round(size * 0.55))}</span>`;
  }

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
          <div class="hl-title">선조의 전당 <small>${esc(v.lineage.family)} 가문</small></div>
          <div class="hl-tabs">${tab('ancestors', `선조 ${people.length}`)}${tab('medals', `메달 ${got}/${list.length}`)}${tab('bosses', `보스 ${slain}/${roster.length}`)}</div>
          <button class="tm-btn small" data-act="back">뒤로</button>
        </div>
        <div class="hl-body">${body}</div>
      </div>`;
  }

  renderAncestors(people) {
    const sel = Math.min(this.sel, people.length - 1), p = people[sel];
    const rows = people.map((q, i) => `
      <button class="hl-row${i === sel ? ' on' : ''}" data-act="pick" data-i="${i}">
        <b>${q.generation}대손 ${esc(q.given)}</b>
        <small>${q.living ? '<span class="hl-live">살아 있음</span>' : `${floorLabel(q.floor)} · Lv ${q.level}`}</small>
        <span class="hl-mini">${(q.medals || []).length ? `${relicIcon('shield', 11)}${q.medals.length}` : ''}</span>
      </button>`).join('');
    return `<div class="hl-split"><div class="hl-list">${rows}</div><div class="hl-detail">${this.renderPerson(p)}</div></div>`;
  }

  renderPerson(p) {
    const fell = p.living
      ? (p.state === 'rest' ? `${floorLabel(p.floor)} 대장간에서 쉬는 중` : p.state === 'run' ? '싸우던 중 중단됨' : '출정을 준비하는 중')
      : `${floorLabel(p.floor)}에서 ${p.killer ? `${esc(p.killer)}에게 ` : ''}쓰러짐${p.at ? ` <small>${day(p.at)}</small>` : ''}`;
    const medals = (p.medals || []).map((id) => this.medal(id)).filter(Boolean);
    const bosses = Object.values(p.bosses || {});
    const nBoss = bosses.reduce((n, b) => n + b.count, 0);
    const old = !p.living && !p.medals && !p.bosses; // saved before medals existed
    return `
      <div class="hl-who">${nameOf(p)}</div>
      <div class="hl-fell${p.living ? ' live' : ''}">${fell}</div>
      <div class="hs-stats hl-stats">
        <span>레벨<b>${p.level}</b></span><span>처치<b>${p.kills}</b></span><span>최고 콤보<b>${p.bestCombo}</b></span><span>보스<b>${p.bosses ? nBoss : '-'}</b></span>
      </div>
      <div class="hl-sec">메달</div>
      <div class="hl-medals">${medals.length ? medals.map((m) => `<span class="hl-chip">${this.medalBadge(m, true, 22)}${esc(m.name)}</span>`).join('') : '<span class="dim">아직 없음</span>'}</div>
      <div class="hl-sec">쓰러뜨린 보스</div>
      <div class="hl-bosses">${bosses.length
        ? bosses.map((b) => `<div><b>${esc(b.name)}</b> <small>${esc(b.title)}</small> ×${b.count} <small>· 가장 깊은 곳 ${floorLabel(b.deepest)}</small></div>`).join('')
        : `<span class="dim">${old ? '기록이 남아 있지 않음' : '없음'}</span>`}</div>
      ${p.living ? '' : `<div class="hl-sec">물려준 장비</div>
      <div class="hl-kept">${(p.survived || []).length ? p.survived.map((n) => `<b>${esc(n)}</b>`).join(', ') : '<span class="dim">없음</span>'}${p.lost ? ` <small class="dim">(잃은 장비 ${p.lost})</small>` : ''}</div>`}`;
  }

  renderMedals() {
    const v = this.vault, tiers = this.config.medals.tiers;
    return `<div class="hl-grid">${this.config.medals.list.map((m) => {
      const r = v.medals[m.id], earned = !!(r && r.first);
      return `<div class="hl-medal${earned ? '' : ' locked'}">
        ${this.medalBadge(m, earned, 34)}
        <div class="hl-mtext">
          <div class="hl-mname" style="${earned ? `color:${tiers[m.tier].color}` : ''}">${esc(m.name)} <small>${tiers[m.tier].label}</small></div>
          <div class="hl-mdesc">${esc(m.desc)}</div>
          ${earned ? `<div class="hl-mfirst">처음: ${nameOf(r.first)}${r.first.floor ? ` · ${floorLabel(r.first.floor)}` : ''}${r.count > 1 ? ` <small>· 선조 ${r.count}명</small>` : ''}</div>` : '<div class="hl-mfirst dim">아직 아무도 얻지 못함</div>'}
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  renderBosses(roster) {
    const v = this.vault, hist = v.lineage.history;
    return `<div class="hl-blist">${roster.map((b) => {
      const r = v.bestiary[b.key];
      const slayers = hist.filter((h) => h.bosses && h.bosses[b.key]).map((h) => `${h.generation}대손 ${esc(h.given)} ×${h.bosses[b.key].count}`);
      const cur = this.people()[0];
      if (cur.bosses[b.key]) slayers.push(`${cur.generation}대손 ${esc(cur.given)} ×${cur.bosses[b.key].count} <small>(살아 있음)</small>`);
      return `<div class="hl-boss${r ? '' : ' locked'}">
        <div class="hl-bicon">${relicIcon(b.type === 'gatekeeper' ? 'flame' : 'fang', 30)}</div>
        <div class="hl-btext">
          <div class="hl-bname">${r ? esc(b.name) : '???'} <small>${esc(b.title)} · ${floorLabel(b.floor)}부터 ${this.config.dungeon.cycleLength}층마다</small></div>
          ${r ? `<div>가문이 <b>${r.kills}</b>번 쓰러뜨림 · 가장 깊은 곳 ${floorLabel(r.deepest)}</div>
          <div class="hl-mfirst">처음 쓰러뜨린 이: ${nameOf(r.first)} · ${floorLabel(r.first.floor)}</div>
          ${slayers.length ? `<div class="hl-slayers">${slayers.join(' · ')}</div>` : ''}` : '<div class="dim">아직 쓰러뜨리지 못함</div>'}
        </div>
      </div>`;
    }).join('')}</div>`;
  }
}
