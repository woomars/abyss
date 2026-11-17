// The engraving hammer (Phase 6, 8.6): three blows. A red band closes in over the gold target ring; press
// as they meet (± tolerance). Each blow has its own speed (normal, or now and then fast / slow). Sound and
// a shake for every blow; when all three are done, onDone(hits).
import { t } from '../i18n/index.js';
import { judgeHit } from '../game/items/engrave.js';

const OVERSHOOT = 0.35; // seconds the band keeps closing past the target before the blow counts as missed
const PAUSE = 0.55;     // seconds between blows
const BAND_AT_TARGET = 88 / 212; // the band (212 px across its middle) shrunk onto the gold ring (88 px across its middle)

export class HammerGame {
  // speeds: three seconds-to-target; onBlow(good); onDone(hits)
  constructor(parent, { speeds, tolerance, onBlow = () => {}, onDone = () => {} }) {
    this.speeds = speeds;
    this.tol = tolerance;
    this.onBlow = onBlow;
    this.onDone = onDone;
    this.results = [];
    this.el = document.createElement('div');
    this.el.className = 'hm-wrap';
    this.el.innerHTML = `<div class="hm-panel"><div class="hm-hint">${t('fg.hammerHint')}</div>
      <div class="hm-field"><div class="hm-target"></div><div class="hm-band"></div><div class="hm-flash"></div></div>
      <div class="hm-marks"></div><button class="fg-btn pri hm-strike">${t('fg.hammerStrike')}</button></div>`;
    parent.appendChild(this.el);
    this.band = this.el.querySelector('.hm-band');
    this.flash = this.el.querySelector('.hm-flash');
    this.marks = this.el.querySelector('.hm-marks');
    this.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.press(); });
    this.el.addEventListener('click', (e) => e.stopPropagation());
    this.drawMarks();
    this.next();
    this.raf = requestAnimationFrame(() => this.frame());
  }

  next() {
    this.blow = this.results.length;
    this.t0 = performance.now() / 1000;
    this.wait = this.blow === 0 ? 0.4 : PAUSE; // a breath before the band starts
    this.pressed = false;
  }

  // seconds since this blow's band started (negative while waiting)
  elapsed() { return performance.now() / 1000 - this.t0 - this.wait; }

  frame() {
    if (this.done) return;
    const T = this.speeds[this.blow], e = this.elapsed();
    if (e >= 0 && !this.pressed) {
      const k = 2.2 - 1.2 * (e / T); // band radius in target radii: 2.2 -> 1 at T -> past it
      this.band.style.transform = `translate(-50%, -50%) scale(${(Math.max(0.3, k) * BAND_AT_TARGET)})`; // k = 1: the band sits on the middle of the gold ring
      this.band.style.opacity = '1';
      if (e > T + OVERSHOOT) this.resolve(false); // too late
    } else if (e < 0) this.band.style.opacity = '0';
    this.raf = requestAnimationFrame(() => this.frame());
  }

  press() {
    if (this.done || this.pressed) return;
    const e = this.elapsed();
    if (e < 0) return; // before the band starts: ignored
    this.resolve(judgeHit(e, this.speeds[this.blow], this.tol));
  }

  resolve(good) {
    this.pressed = true;
    this.results.push(good);
    this.onBlow(good);
    this.drawMarks();
    this.flash.className = `hm-flash ${good ? 'good' : 'bad'}`;
    this.flash.textContent = t(good ? 'fg.hammerGood' : 'fg.hammerMiss');
    this.el.classList.remove('shake'); void this.el.offsetWidth; this.el.classList.add('shake');
    if (this.results.length >= 3) {
      this.done = true;
      setTimeout(() => this.onDone(this.results.filter(Boolean).length), 600);
      return;
    }
    setTimeout(() => { if (this.done) return; this.flash.className = 'hm-flash'; this.flash.textContent = ''; this.next(); }, 450);
  }

  drawMarks() {
    this.marks.innerHTML = [0, 1, 2].map((k) => `<i class="${k < this.results.length ? (this.results[k] ? 'good' : 'bad') : ''}">${k < this.results.length ? (this.results[k] ? '✓' : '✗') : k + 1}</i>`).join('');
  }

  destroy() {
    this.done = true;
    cancelAnimationFrame(this.raf);
    this.el.remove();
  }
}
