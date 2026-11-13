// Bottom-right special attack buttons with cooldown sweep. Kept out of the stroke input area.
// Non-directional skills fire on press. Directional skills (rush, blade wave): press, drag to aim,
// release to fire; a plain tap fires in the current movement direction.
import { tr } from '../i18n/index.js';

const ICONS = { spin: '⟳', rushStrike: '➤', bladeWave: '≋' };
const AIM_DEADZONE = 12; // px of drag before the aim counts

export class SkillButtons {
  constructor(root, skills, { toLocal = (x, y) => ({ x, y }) } = {}) {
    this.skills = skills;
    this.toLocal = toLocal;
    this.el = document.createElement('div');
    this.el.className = 'skills';
    this.buttons = skills.slots.map((s, i) => {
      const b = document.createElement('button');
      b.className = `skill interactive skill-${i}`;
      b.setAttribute('aria-label', tr(s.name));
      b.innerHTML = `<span class="icon">${ICONS[s.id] || '★'}</span><span class="cd"></span><span class="label">${tr(s.name)}</span>`;
      this.el.appendChild(b);
      const ui = { b, cd: b.querySelector('.cd'), last: '', aiming: null };
      this.bind(ui, i);
      return ui;
    });
    root.appendChild(this.el);
  }

  bind(ui, i) {
    const { b } = ui;
    const fired = (ok) => {
      if (!ok) return;
      b.classList.add('fired');
      setTimeout(() => b.classList.remove('fired'), 150);
    };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const s = this.skills.slots[i];
      if (!this.skills.isDirectional(i)) { fired(this.skills.use(i)); return; }
      if (s.remaining > 0) return;
      try { b.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      const r = b.getBoundingClientRect();
      ui.aiming = { id: e.pointerId, center: this.toLocal(r.left + r.width / 2, r.top + r.height / 2), dir: null };
      b.classList.add('aiming');
    });
    b.addEventListener('pointermove', (e) => {
      const a = ui.aiming;
      if (!a || a.id !== e.pointerId) return;
      const p = this.toLocal(e.clientX, e.clientY);
      const dx = p.x - a.center.x, dy = p.y - a.center.y;
      if (Math.hypot(dx, dy) < AIM_DEADZONE) { a.dir = null; this.skills.clearAim(); return; }
      a.dir = { x: dx, y: dy };
      this.skills.setAim(i, a.dir);
    });
    const finish = (e, fire) => {
      const a = ui.aiming;
      if (!a || a.id !== e.pointerId) return;
      ui.aiming = null;
      b.classList.remove('aiming');
      this.skills.clearAim();
      if (fire) fired(this.skills.use(i, a.dir));
    };
    b.addEventListener('pointerup', (e) => finish(e, true));
    b.addEventListener('pointercancel', (e) => finish(e, false));
  }

  // the language changed: skill names again
  relabel() {
    this.buttons.forEach(({ b }, i) => {
      const name = tr(this.skills.slots[i].name);
      b.setAttribute('aria-label', name);
      b.querySelector('.label').textContent = name;
    });
  }

  // client-space rects (the caller maps them into the stage)
  rects() {
    return this.buttons.map(({ b }) => {
      const r = b.getBoundingClientRect();
      return { x: r.left - 6, y: r.top - 6, w: r.width + 12, h: r.height + 12 };
    });
  }

  render() {
    const slots = this.skills.slots;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const ui = this.buttons[i];
      const pct = s.remaining > 0 ? Math.round((s.remaining / s.cooldown) * 100) : 0;
      const txt = s.remaining > 0 ? String(Math.ceil(s.remaining)) : '';
      const key = pct + '|' + txt;
      if (key === ui.last) continue;
      ui.last = key;
      ui.b.style.setProperty('--cd', pct + '%');
      ui.b.classList.toggle('cooling', pct > 0);
      ui.cd.textContent = txt;
    }
  }
}
