// How to play: six cards, one at a time, each a small drawing and a line or two.
import { t } from '../i18n/index.js';

const K = '<path d="M18 0 L-10 -11 L-5 0 L-10 11Z" fill="#f0e6cf" stroke="#c9a86a" stroke-width="2"/>'; // the knight
const knight = (x, y, a = 0) => `<g transform="translate(${x} ${y}) rotate(${a})">${K}</g>`;
const foe = (x, y, r = 11, ring = false) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#8a8f98" stroke="#2a2433" stroke-width="2"/>${ring ? `<circle cx="${x}" cy="${y}" r="${r + 7}" fill="none" stroke="#ff5a4a" stroke-width="3"/>` : ''}`;
const finger = (x, y) => `<circle cx="${x}" cy="${y}" r="9" fill="rgba(255,224,138,0.25)" stroke="#ffe08a" stroke-width="2"/>`;

const ART = [
  // 1 move: a curved finger trail, the knight running along it
  `<path d="M20 90 C 60 20, 110 110, 150 40" fill="none" stroke="#ffe08a" stroke-width="4" stroke-dasharray="8 7" stroke-linecap="round"/>${finger(20, 90)}${knight(165, 32, -40)}`,
  // 2 rush: a short fast swipe, then a chain through three enemies
  `<path d="M14 80 L48 62" stroke="#ffe08a" stroke-width="5" stroke-linecap="round"/>${finger(14, 80)}${knight(64, 56, -25)}<path d="M82 50 L118 34 L152 58 L184 40" fill="none" stroke="#9fd8ff" stroke-width="3"/>${foe(118, 34)}${foe(152, 58)}${foe(184, 40)}`,
  // 3 combo: hits keep coming, the multiplier grows
  `${knight(40, 62)}${foe(90, 40)}${foe(120, 78)}${foe(150, 44)}<text x="150" y="98" fill="#ffe08a" font-size="20" font-weight="800" text-anchor="middle">15 COMBO</text><text x="150" y="20" fill="#9be3b0" font-size="16" font-weight="800" text-anchor="middle">×1.15</text>`,
  // 4 counter: a struck enemy wears a red ring — dashing back in gets punished
  `${foe(110, 55, 14, true)}${knight(52, 55)}<path d="M70 55 L88 55" stroke="#ff5a4a" stroke-width="4"/><path d="M120 18 l14 14 M134 18 l-14 14" stroke="#ff5a4a" stroke-width="4"/>${foe(170, 82)}<path d="M64 70 Q 120 112 160 86" fill="none" stroke="#9be3b0" stroke-width="3" stroke-dasharray="6 5"/>`,
  // 5 boss: dodge the warning cone, strike in the gap
  `<path d="M120 55 L40 15 A 90 90 0 0 0 40 95 Z" fill="rgba(255,80,60,0.22)" stroke="#ff5a4a" stroke-width="2"/>${foe(130, 55, 24)}${knight(70, 102, -20)}<path d="M60 92 L70 70" stroke="#ffe08a" stroke-width="3" stroke-dasharray="5 4"/><text x="175" y="25" fill="#ffe08a" font-size="13" font-weight="700" text-anchor="middle">GAP!</text>`,
  // 6 skills: drag to aim, tap for the nearest
  `<circle cx="40" cy="78" r="20" fill="#221a2c" stroke="#c9a86a" stroke-width="3"/><circle cx="92" cy="86" r="20" fill="#221a2c" stroke="#c9a86a" stroke-width="3"/><circle cx="52" cy="30" r="20" fill="#221a2c" stroke="#c9a86a" stroke-width="3"/><path d="M92 86 L150 52" stroke="#9fd8ff" stroke-width="3" stroke-dasharray="7 5"/>${finger(150, 52)}${foe(182, 34)}<path d="M150 52 L176 38" stroke="#9fd8ff" stroke-width="2"/>`,
  // 7 roll: a band sweeps out from the boss; tumble through it at the right moment
  `${foe(36, 55, 22)}<circle cx="36" cy="55" r="78" fill="none" stroke="rgba(255,90,60,0.55)" stroke-width="16"/><path d="M128 30 q 14 -10 24 4" fill="none" stroke="#9fd8ff" stroke-width="3"/><circle cx="104" cy="48" r="12" fill="none" stroke="#e8f4ff" stroke-width="3" stroke-dasharray="10 6"/><path d="M150 40 L182 30" stroke="#ffe08a" stroke-width="4" stroke-linecap="round"/>${knight(150, 40, -18)}<text x="150" y="92" fill="#ffe08a" font-size="13" font-weight="700" text-anchor="middle">ROLL!</text>`,
];

export class ControlsGuide {
  constructor(root, { onClose = () => {} } = {}) {
    this.onClose = onClose;
    this.i = 0;
    this.el = document.createElement('div');
    this.el.className = 'overlay guide-screen interactive hidden';
    root.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const a = b.dataset.act;
      if (a === 'next') this.i = Math.min(ART.length - 1, this.i + 1);
      else if (a === 'prev') this.i = Math.max(0, this.i - 1);
      else if (a === 'dot') this.i = Number(b.dataset.i);
      else if (a === 'close') { this.hide(); this.onClose(); return; }
      this.render();
    });
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }
  show() { this.i = 0; this.el.classList.remove('hidden'); this.render(); }
  hide() { this.el.classList.add('hidden'); }
  relabel() { if (this.isOpen) this.render(); }

  render() {
    const n = this.i + 1, last = this.i === ART.length - 1;
    this.el.innerHTML = `
      <div class="gd-panel">
        <div class="gd-head"><b>${t('guide.title')}</b><button class="tm-btn small" data-act="close">${t('guide.close')}</button></div>
        <div class="gd-card">
          <svg class="gd-art" viewBox="0 0 200 110" aria-hidden="true">${ART[this.i]}</svg>
          <div class="gd-text"><div class="gd-title">${n}. ${t(`guide.${n}.title`)}</div><p>${t(`guide.${n}.body`)}</p></div>
        </div>
        <div class="gd-nav">
          <button class="tm-btn small" data-act="prev" ${this.i === 0 ? 'disabled' : ''}>${t('guide.prev')}</button>
          <span class="gd-dots">${ART.map((_, k) => `<button class="gd-dot${k === this.i ? ' on' : ''}" data-act="dot" data-i="${k}" aria-label="${k + 1}"></button>`).join('')}</span>
          <button class="tm-btn small ${last ? '' : 'primary'}" data-act="${last ? 'close' : 'next'}">${t(last ? 'guide.close' : 'guide.next')}</button>
        </div>
      </div>`;
  }
}
