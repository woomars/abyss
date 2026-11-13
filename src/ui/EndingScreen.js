// The floor-100 ending: bright Pixabay paintings cross-fade behind four paragraphs that rise slowly,
// then the credits roll over the last one; 건너뛰기 jumps to the credits and runs them fast. The last
// line — the child setting out with the inherited item — comes up over the opening story's last
// painting (the abyss gate), closing the circle. From the title (replay) it ends with 닫기.
import { t, trPerson, trItemName } from '../i18n/index.js';

const ART = ['arrive', 'portal', 'cottage', 'couple'];
const SPEED = 0.042; // share of the view height the text rises per second
const FAST = 9;      // 건너뛰기: the credits run this many times faster

const CREDITS = [
  ['t', () => t('app.title')],
  ['k', () => t('ending.c.plan')], ['v', () => 'woomars'],
  ['k', () => t('ending.c.prog')], ['v', () => 'Claude Code (Opus 5.5)'],
  ['k', () => t('ending.c.art')], ['v', () => 'Pixabay'],
  ['s', () => `${t('ending.c.opening')} — flutie8211 · Rachealmarie · CheeseHand-Sam · Auvryon`],
  ['s', () => `${t('ending.c.ending')} — 1tamara2 · Vilkasss · CrimsonMystique · Insspirito`],
  ['k', () => t('ending.c.music')], ['v', () => 'Pixabay'],
  ['s', () => 'leberch · MenielDM · PaulYudin · The_Mountain · BouncyRunner'],
  ['s', () => 'Jobisahealer · Alec_Koff · OpenMindAudio · mumarmds · RoyaltyFreeMusicStudio'],
  ['s', () => `${t('ending.c.song')} — "Romantic orchestral - inspirational hope" · Sonican`],
  ['k', () => t('ending.c.sfx')], ['v', () => t('ending.c.sfxBy')],
  ['k', () => t('ending.c.and')], ['v', () => t('ending.c.dedication')],
  ['t', () => t('ending.c.thanks')],
];

// the ending's last line from a finale { father, child, sex, heroSex, item }
export function endingLast(f) {
  return t('ending.last', {
    parent: trPerson(f.father, 'given'),
    child: t(`heir.child.${f.sex === 'daughter' ? 'daughter' : 'son'}`),
    name: trPerson(f.child, 'given'),
    parentWord: t(f.heroSex === 'daughter' ? 'ending.mother' : 'ending.father'),
    item: f.item ? trItemName(f.item) : t('ending.legacy'),
  });
}

export class EndingScreen {
  constructor(root, { music = null, onDone = () => {} } = {}) {
    this.music = music;
    this.onDone = onDone;
    this.el = document.createElement('div');
    this.el.className = 'overlay ending-screen interactive hidden';
    this.el.innerHTML = `
      ${ART.map((a) => `<div class="en-bg" data-k="${a}" style="background-image:url(assets/images/ending/${a}.webp)"></div>`).join('')}
      <div class="en-bg" data-k="gate" style="background-image:url(assets/images/story/gate.webp)"></div>
      <div class="en-shade"></div>
      <div class="en-motes">${Array.from({ length: 16 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${9 + (i % 5) * 2.3}s;--w:${-(i * 1.7) % 11}s"></i>`).join('')}</div>
      <div class="en-view"><div class="en-roll"></div></div>
      <div class="en-final"><p class="en-last"></p><button class="tm-btn primary en-go" data-act="go"></button></div>
      <div class="en-flash"></div>
      <button class="st-skip en-skip" data-act="skip"></button>`;
    root.appendChild(this.el);
    this.view = this.el.querySelector('.en-view');
    this.roll = this.el.querySelector('.en-roll');
    this.final = this.el.querySelector('.en-final');
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'skip') this.skip();
      else if (b.dataset.act === 'go') this.done();
    });
    this.frame = (now) => this.tick(now);
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }

  // finale: { father, child, sex, heroSex, item }; replay: shown again from the title (ends with 닫기)
  show(finale, { replay = false } = {}) {
    this.finale = finale;
    this.replay = replay;
    this.y = 0;
    this.last = null;
    this.fast = false;
    this.phase = 'roll';
    this.bg = '';
    this.el.classList.remove('hidden');
    this.final.classList.remove('on');
    this.view.classList.remove('gone');
    this.el.querySelector('.en-skip').classList.remove('hidden');
    this.relabel();
    this.setBg('arrive');
    const fl = this.el.querySelector('.en-flash'); // the dark ends in a burst of light
    fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
    if (this.music) this.music.play('ending');
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
  }

  hide() {
    cancelAnimationFrame(this.raf);
    this.el.classList.add('hidden');
  }

  relabel() {
    if (!this.finale) return;
    const f = this.finale, para = (k) => `<p class="en-p" data-bg="${ART[k]}">${t(k === 2 ? `ending.p3.${f.heroSex === 'daughter' ? 'husband' : 'wife'}` : `ending.p${k + 1}`).replace(/\n/g, '<br>')}</p>`;
    this.roll.innerHTML = `${[0, 1, 2, 3].map(para).join('')}<div class="en-credits">${CREDITS.map(([c, txt]) => `<div class="en-c-${c}">${txt()}</div>`).join('')}</div>`;
    this.el.querySelector('.en-last').innerHTML = endingLast(f).replace(/\n/g, '<br>');
    this.el.querySelector('.en-skip').textContent = t('story.skip');
    this.el.querySelector('.en-go').textContent = t(this.replay ? 'ending.close' : 'ending.start');
  }

  setBg(k) {
    if (k === this.bg) return;
    this.bg = k;
    this.el.querySelectorAll('.en-bg').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
  }

  skip() {
    if (this.phase !== 'roll') return;
    const credits = this.roll.querySelector('.en-credits');
    this.fast = true;
    if (credits && this.y < credits.offsetTop) this.y = credits.offsetTop;
    this.el.querySelector('.en-skip').classList.add('hidden');
  }

  tick(now) {
    if (!this.isOpen) return;
    const dt = this.last == null ? 0 : Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.phase === 'roll') {
      const H = this.view.clientHeight || 390;
      this.y += H * SPEED * dt * (this.fast ? FAST : 1);
      this.roll.style.transform = `translateY(${(H - this.y).toFixed(1)}px)`;
      // the painting follows the paragraph at the middle; the credits stay on the last one
      let k = ART[0];
      for (const p of this.roll.querySelectorAll('.en-p')) if (p.offsetTop - H * 0.1 <= this.y - H / 2) k = p.dataset.bg;
      this.setBg(k);
      if (this.y > this.roll.scrollHeight + H * 0.15) this.toFinal();
    }
    this.raf = requestAnimationFrame(this.frame);
  }

  toFinal() {
    this.phase = 'final';
    this.el.querySelector('.en-skip').classList.add('hidden');
    this.view.classList.add('gone');
    this.setBg('gate');
    this.final.classList.add('on');
  }

  done() {
    if (this.phase !== 'final') return;
    this.hide();
    this.onDone(this.replay);
  }
}
