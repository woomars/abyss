// How to play: eight cards, one at a time, each a small moving drawing and a line or two.
import { t } from '../i18n/index.js';

const K = '<path d="M18 0 L-10 -11 L-5 0 L-10 11Z" fill="#f0e6cf" stroke="#c9a86a" stroke-width="2"/>'; // the knight
const knight = (x, y, a = 0) => `<g transform="translate(${x} ${y}) rotate(${a})">${K}</g>`;
const foe = (x, y, r = 11, ring = false) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#8a8f98" stroke="#2a2433" stroke-width="2"/>${ring ? `<circle cx="${x}" cy="${y}" r="${r + 7}" fill="none" stroke="#ff5a4a" stroke-width="3"/>` : ''}`;
const finger = (x, y) => `<circle cx="${x}" cy="${y}" r="9" fill="rgba(255,224,138,0.25)" stroke="#ffe08a" stroke-width="2"/>`;

// every card moves (SMIL inside the SVG): a short loop showing the move
const loop = (dur) => `dur="${dur}s" repeatCount="indefinite"`;
const ART = [
  // 1 move: the finger draws a curve, the knight runs along it
  `<path d="M20 90 C 60 20, 110 110, 150 40" fill="none" stroke="#ffe08a" stroke-width="4" stroke-dasharray="8 7" stroke-linecap="round"/><g>${finger(0, 0)}<animateMotion path="M20 90 C 60 20, 110 110, 150 40" ${loop(2.4)}/></g><g>${knight(0, 0)}<animateMotion path="M20 90 C 60 20, 110 110, 165 32" rotate="auto" keyPoints="0;0;1" keyTimes="0;0.12;1" calcMode="linear" ${loop(2.4)}/></g>`,
  // 2 rush: a short fast swipe, then the chain runs through three enemies
  `<path d="M14 80 L48 62" stroke="#ffe08a" stroke-width="5" stroke-linecap="round" stroke-dasharray="40" stroke-dashoffset="40"><animate attributeName="stroke-dashoffset" values="40;0;0" keyTimes="0;0.2;1" ${loop(2.2)}/></path>${finger(14, 80)}${foe(118, 34)}${foe(152, 58)}${foe(184, 40)}<path d="M64 56 L118 34 L152 58 L184 40" fill="none" stroke="#9fd8ff" stroke-width="3" stroke-dasharray="150" stroke-dashoffset="150"><animate attributeName="stroke-dashoffset" values="150;150;0;0" keyTimes="0;0.2;0.6;1" ${loop(2.2)}/></path><g>${knight(0, 0)}<animateMotion path="M48 62 L118 34 L152 58 L184 40" rotate="auto" keyPoints="0;0;1;1" keyTimes="0;0.2;0.6;1" calcMode="linear" ${loop(2.2)}/></g>`,
  // 3 combo: hits keep coming, the count and the multiplier grow
  `${knight(40, 62)}${foe(90, 40)}${foe(120, 78)}${foe(150, 44)}<text x="150" y="98" fill="#ffe08a" font-size="20" font-weight="800" text-anchor="middle">15 COMBO<animate attributeName="font-size" values="16;22;16" ${loop(0.9)}/></text><text x="150" y="20" fill="#9be3b0" font-size="16" font-weight="800" text-anchor="middle">×1.15<animate attributeName="opacity" values="0.4;1;0.4" ${loop(0.9)}/></text>`,
  // 4 counter: a struck enemy's red cone points where the hero went — dashing back in through it gets punished
  `${foe(110, 55, 14)}<path d="M110 55 L160 30 A 56 56 0 0 1 160 80 Z" fill="rgba(255,60,40,0.25)" stroke="#ff5a4a" stroke-width="2"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.25;0.35;0.9;1" ${loop(2.6)}/></path><g>${knight(0, 0)}<animateMotion path="M40 55 L150 55 L175 55" rotate="auto" keyPoints="0;0.85;1;1" keyTimes="0;0.25;0.35;1" calcMode="linear" ${loop(2.6)}/></g><path d="M64 92 Q 120 112 165 90" fill="none" stroke="#9be3b0" stroke-width="3" stroke-dasharray="6 5"/>`,
  // 5 boss: the warning cone fills, the hero steps aside and strikes in the gap
  `<path d="M120 55 L40 15 A 90 90 0 0 0 40 95 Z" fill="#ff503c" fill-opacity="0.15" stroke="#ff5a4a" stroke-width="2"><animate attributeName="fill-opacity" values="0.1;0.45;0.1" ${loop(1.6)}/></path>${foe(130, 55, 24)}<g>${knight(0, 0)}<animateMotion path="M60 60 L70 102 L100 80" rotate="auto" ${loop(1.6)}/></g><text x="175" y="25" fill="#ffe08a" font-size="13" font-weight="700" text-anchor="middle">GAP!</text>`,
  // 6 skills: drag from a button to aim, let go
  `<circle cx="40" cy="78" r="20" fill="#221a2c" stroke="#c9a86a" stroke-width="3"/><circle cx="92" cy="86" r="20" fill="#221a2c" stroke="#c9a86a" stroke-width="3"/><circle cx="52" cy="30" r="20" fill="#221a2c" stroke="#c9a86a" stroke-width="3"/><path d="M92 86 L150 52" stroke="#9fd8ff" stroke-width="3" stroke-dasharray="7 5"><animate attributeName="stroke-dashoffset" values="24;0" ${loop(0.8)}/></path><g>${finger(0, 0)}<animateMotion path="M92 86 L150 52" ${loop(1.6)}/></g>${foe(182, 34)}`,
  // 7 jump: a band sweeps out from the boss; leap over it and land with a slam
  `${foe(30, 55, 20)}<circle cx="30" cy="55" r="30" fill="none" stroke="rgba(255,90,60,0.55)" stroke-width="14"><animate attributeName="r" values="30;120" ${loop(2)}/><animate attributeName="opacity" values="1;0" ${loop(2)}/></circle><path d="M84 40 Q 112 -6 140 40" fill="none" stroke="#9fd8ff" stroke-width="3" stroke-dasharray="6 5"/><g>${knight(0, 0)}<animateMotion path="M84 40 Q 112 -6 146 44" ${loop(2)}/></g><circle cx="146" cy="44" r="26" fill="rgba(255,210,140,0.18)" stroke="#ffd28a" stroke-width="3"><animate attributeName="r" values="4;4;30" keyTimes="0;0.8;1" ${loop(2)}/></circle>${foe(166, 52, 9)}<text x="160" y="96" fill="#ffe08a" font-size="13" font-weight="700" text-anchor="middle">JUMP!</text>`,
  // 8 engrave: the red band closes on the gold ring at the normal speed — strike as they meet
  `<circle cx="100" cy="55" r="22" fill="none" stroke="#ffcf5a" stroke-width="7"/><circle cx="100" cy="55" r="48" fill="none" stroke="#ff3a2a" stroke-width="4"><animate attributeName="r" values="48;22;16" keyTimes="0;0.8;1" ${loop(1)}/></circle><g transform="translate(150 30)"><rect x="-4" y="0" width="8" height="34" rx="2" fill="#8a6a4a"/><rect x="-14" y="-10" width="28" height="12" rx="2" fill="#c8ccd8"/><animateTransform attributeName="transform" type="rotate" values="0 0 34;-35 0 34;0 0 34;0 0 34" keyTimes="0;0.6;0.8;1" additive="sum" ${loop(1)}/></g>${finger(100, 96)}<text x="40" y="100" fill="#9be3b0" font-size="13" font-weight="800" text-anchor="middle">✓ ✓ ✓</text>`,
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
