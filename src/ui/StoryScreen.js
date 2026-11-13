// Opening story: Pixabay paintings cross-fade behind text that rises slowly like film credits.
// Plays by itself only when there is nothing to continue; the title's story icon replays it.
import { t } from '../i18n/index.js';

const PARAS = ['story.p1', 'story.p2', 'story.p3', 'story.p4', 'story.p5'];
const ART = ['abyss', 'fallen', 'treasure', 'gate'];
const ART_OF = [0, 1, 1, 2, 3]; // painting behind each paragraph
const SPEED = 15; // px per second the text rises (the whole story takes about a minute)

// the story plays by itself only when no save slot has anything to continue
export function autoStory(slots) { return !slots.some((r) => r && r.summary); }

export class StoryScreen {
  constructor(root, { onDone = () => {}, music = null } = {}) {
    this.onDone = onDone;
    this.music = music;
    this.el = document.createElement('div');
    this.el.className = 'overlay story-screen interactive hidden';
    this.el.innerHTML = `
      ${ART.map((a, i) => `<div class="st-bg" data-i="${i}" style="background-image:url(assets/images/story/${a}.webp)"></div>`).join('')}
      <div class="st-shade"></div>
      <div class="st-embers">${Array.from({ length: 14 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${6 + (i % 5) * 1.7}s;--w:${-(i * 1.3) % 9}s"></i>`).join('')}</div>
      <div class="st-view"><div class="st-text"></div></div>
      <button class="st-skip" data-act="skip"></button>
      <button class="tm-btn primary st-start hidden" data-act="start"></button>`;
    root.appendChild(this.el);
    this.text = this.el.querySelector('.st-text');
    this.view = this.el.querySelector('.st-view');
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) this.finish();
    });
    this.frame = (now) => this.tick(now);
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }

  show() {
    this.y = null;
    this.last = null;
    this.done = false;
    this.art = -1;
    this.el.classList.remove('hidden');
    this.el.querySelector('.st-start').classList.add('hidden');
    this.relabel();
    if (this.music) this.music.play('story');
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
  }

  hide() {
    cancelAnimationFrame(this.raf);
    this.el.classList.add('hidden');
  }

  finish() {
    if (!this.isOpen) return;
    this.hide();
    this.onDone();
  }

  // the language changed while it plays: same place, new words
  relabel() {
    this.text.innerHTML = PARAS.map((k) => `<p>${t(k).split('\n').map((l) => `<span>${l}</span>`).join('<br>')}</p>`).join('');
    this.el.querySelector('.st-skip').textContent = t('story.skip');
    this.el.querySelector('.st-start').textContent = t('story.start');
  }

  setArt(i) {
    if (i === this.art) return;
    this.art = i;
    this.el.querySelectorAll('.st-bg').forEach((b) => b.classList.toggle('on', Number(b.dataset.i) === i));
  }

  tick(now) {
    if (!this.isOpen) return;
    const dt = this.last == null ? 0 : Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const H = this.view.clientHeight || 390;
    if (this.y == null) this.y = H; // start just below the view
    const paras = [...this.text.children];
    // stop when the last paragraph sits a little above the middle
    const lastP = paras[paras.length - 1];
    const lastMid = this.y + lastP.offsetTop + lastP.offsetHeight / 2;
    if (lastMid > H * 0.45) this.y -= SPEED * dt;
    else if (!this.done) { this.done = true; this.el.querySelector('.st-start').classList.remove('hidden'); }
    this.text.style.transform = `translateY(${this.y.toFixed(1)}px)`;
    // the painting of the paragraph nearest the middle
    let best = 0, bd = Infinity;
    paras.forEach((p, i) => {
      const mid = this.y + p.offsetTop + p.offsetHeight / 2;
      const d = Math.abs(mid - H * 0.5);
      if (mid < H * 1.05 && d < bd) { bd = d; best = i; }
      p.style.opacity = String(Math.max(0, Math.min(1, 1.25 - Math.abs(mid - H * 0.5) / (H * 0.55))));
    });
    this.setArt(ART_OF[best]);
    this.raf = requestAnimationFrame(this.frame);
  }
}
