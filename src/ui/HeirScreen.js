// "가문의 계승": the father's record and the son who takes up the sword. fate = Game.endRunByDeath() result.
import { josa } from '../core/josa.js';
import { floorLabel } from '../core/floorLabel.js';
import { relicIcon } from './relicIcons.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class HeirScreen {
  constructor(root, { onContinue, medals = null }) {
    this.onContinue = onContinue;
    this.medals = medals; // config.medals
    this.el = document.createElement('div');
    this.el.className = 'overlay heir-screen interactive hidden';
    root.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="go"]')) { this.hide(); this.onContinue(); }
    });
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }
  hide() { this.el.classList.add('hidden'); }

  // the medals this life earned, and the bosses it slew
  medalLine(r) {
    const cfg = this.medals, ms = cfg ? (r.medals || []).map((id) => cfg.list.find((m) => m.id === id)).filter(Boolean) : [];
    const bosses = Object.values(r.bosses || {});
    const chips = ms.map((m) => `<span class="hl-chip"><span class="hl-badge" style="--mc:${cfg.tiers[m.tier].color};width:18px;height:18px">${relicIcon(m.icon, 10)}</span>${esc(m.name)}</span>`).join('');
    const slain = bosses.length ? `<div class="hs-kept">쓰러뜨린 보스: ${bosses.map((b) => `<b>${esc(b.name)}</b> ×${b.count}`).join(', ')}</div>` : '';
    return (chips ? `<div class="hl-medals hs-medals">${chips}</div>` : '') + slain;
  }

  show(fate, { note = '', label = '대장간으로' } = {}) {
    const r = fate.record, h = fate.heir;
    const kept = fate.survived.length
      ? `<div class="hs-kept">물려받은 장비: ${fate.survived.map((i) => `<b>${esc(i.name)}</b>`).join(', ')}</div>`
      : '<div class="hs-kept dim">물려받은 장비는 없습니다</div>';
    this.el.innerHTML = `
      <div class="hs-panel">
        ${note ? `<p class="hs-note">${esc(note)}</p>` : ''}
        <div class="hs-father">
          <div class="hs-label">${r.generation}대손</div>
          <div class="hs-name">${esc(r.family)} ${esc(r.given)}</div>
          <div class="hs-fell">${floorLabel(r.floor)}에서 쓰러졌습니다</div>
          <div class="hs-stats">
            <span>레벨<b>${r.level}</b></span><span>처치<b>${r.kills}</b></span><span>최고 콤보<b>${r.bestCombo}</b></span><span>잃은 장비<b>${r.lost}</b></span>
          </div>
          ${kept}
          ${this.medalLine(r)}
        </div>
        <div class="hs-arrow">▼</div>
        <div class="hs-heir">그의 아들 <b>${esc(josa(h.given, '이', '가'))}</b> 뜻을 잇습니다 <small>${h.generation}대손 ${esc(h.family)} ${esc(h.given)}</small></div>
        <button class="tm-btn primary" data-act="go">${label}</button>
      </div>`;
    this.el.classList.remove('hidden');
  }
}
