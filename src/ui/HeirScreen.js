// "가문의 계승": the father's record and the son who takes up the sword. fate = Game.endRunByDeath() result.
import { josa } from '../core/josa.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class HeirScreen {
  constructor(root, { onContinue }) {
    this.onContinue = onContinue;
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
          <div class="hs-fell">${r.floor}층에서 쓰러졌습니다</div>
          <div class="hs-stats">
            <span>레벨<b>${r.level}</b></span><span>처치<b>${r.kills}</b></span><span>최고 콤보<b>${r.bestCombo}</b></span><span>잃은 장비<b>${r.lost}</b></span>
          </div>
          ${kept}
        </div>
        <div class="hs-arrow">▼</div>
        <div class="hs-heir">그의 아들 <b>${esc(josa(h.given, '이', '가'))}</b> 뜻을 잇습니다 <small>${h.generation}대손 ${esc(h.family)} ${esc(h.given)}</small></div>
        <button class="tm-btn primary" data-act="go">${label}</button>
      </div>`;
    this.el.classList.remove('hidden');
  }
}
