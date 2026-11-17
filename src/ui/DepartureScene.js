// A new beginning (after the ending and the family's recollection): the child of the line walks into the
// abyss's glow, cycle n. A few seconds, or [건너뛰기].
import { t, trPerson } from '../i18n/index.js';

const LENGTH = 5.5; // seconds before it goes on by itself

export class DepartureScene {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.className = 'overlay departure-scene interactive hidden';
    root.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => { if (e.target.closest('[data-act="skip"]')) this.finish(); });
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }

  // who: { family, child, cycle }
  show(who, onDone) {
    this.onDone = onDone;
    this.who = who;
    this.render();
    this.el.classList.remove('hidden');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.finish(), LENGTH * 1000);
  }

  render() {
    const w = this.who;
    this.el.innerHTML = `<div class="dp-stage">
      <div class="dp-glow"></div><div class="dp-door"></div>
      <svg class="dp-hero" viewBox="-20 -14 40 28" aria-hidden="true"><path d="M18 0 L-10 -11 L-5 0 L-10 11Z" fill="#f0e6cf" stroke="#c9a86a" stroke-width="2"/></svg>
      <div class="dp-text"><div class="dp-title">${t('depart.title')}</div>
        <div class="dp-line">${t('depart.line', { family: trPerson(w.family, 'family'), child: trPerson(w.child, 'given'), cycle: w.cycle })}</div></div>
      <button class="tm-btn small dp-skip" data-act="skip">${t('depart.skip')}</button></div>`;
  }

  relabel() { if (this.isOpen) this.render(); }

  finish() {
    if (!this.isOpen) return;
    clearTimeout(this.timer);
    this.el.classList.add('hidden');
    const f = this.onDone;
    this.onDone = null;
    if (f) f();
  }
}
