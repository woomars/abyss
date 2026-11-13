// Special attack buttons with cooldown sweep (bottom-left corner by default, or where the player put
// them: positions are fractions of the stage, edited by dragging in the layout mode). Kept out of the
// stroke input area.
// Non-directional skills fire on press. Directional skills (rush, blade wave): press, drag to aim,
// release to fire; a plain tap goes at the nearest enemy (the way the hero runs when there is none).
import { tr, t } from '../i18n/index.js';

const ICONS = {
  spin: '⟳', rushStrike: '⇧',
  bladeWave: '<svg class="wv-ic" viewBox="0 0 32 32" aria-hidden="true"><path d="M5 16 L28 4.5 A 25 25 0 0 1 28 27.5 Z" fill="rgba(159,216,255,0.22)" stroke="#9fd8ff" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 9.5 A 14 14 0 0 1 14 22.5" fill="none" stroke="rgba(220,240,255,0.7)" stroke-width="1.4" stroke-dasharray="2 2.5"/><g class="wv-blade"><path d="M5 16 L25 16" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"/><path d="M5 13.6 L5 18.4" stroke="#c9a86a" stroke-width="2.4" stroke-linecap="round"/></g></svg>', // 질풍 베기: a cone with a swinging blade
};
const AIM_DEADZONE = 30; // px of drag before the aim counts (a plain press-and-release never aims)

export class SkillButtons {
  constructor(root, skills, { toLocal = (x, y) => ({ x, y }) } = {}) {
    this.skills = skills;
    this.toLocal = toLocal;
    this.root = root;
    this.pos = null; // [{ x, y }] stage fractions of each button's centre; null = default corner
    this.editing = false;
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
      if (this.editing) { // layout mode: drag the button instead of firing it
        this.ensureCustom();
        try { b.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        ui.drag = e.pointerId;
        b.classList.add('dragging');
        return;
      }
      const s = this.skills.slots[i];
      if (!this.skills.isDirectional(i)) { fired(this.skills.use(i)); return; }
      if (s.remaining > 0) return;
      try { b.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      const r = b.getBoundingClientRect();
      ui.aiming = { id: e.pointerId, center: this.toLocal(r.left + r.width / 2, r.top + r.height / 2), dir: null };
      b.classList.add('aiming');
    });
    b.addEventListener('pointermove', (e) => {
      if (ui.drag === e.pointerId) { this.dragTo(i, e); return; }
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
    const drop = (e) => { if (ui.drag !== e.pointerId) return false; ui.drag = null; b.classList.remove('dragging'); return true; };
    b.addEventListener('pointerup', (e) => { if (!drop(e)) finish(e, true); });
    b.addEventListener('pointercancel', (e) => { if (!drop(e)) finish(e, false); });
  }

  // ---- layout ----
  stageSize() { return { w: this.root.offsetWidth || 1, h: this.root.offsetHeight || 1 }; }

  // positions (or null for the default corner); bad data falls back to the default
  setLayout(pos) {
    const ok = Array.isArray(pos) && pos.length === this.buttons.length
      && pos.every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
    this.pos = ok ? pos.map((p) => ({ x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) })) : null;
    this.el.classList.toggle('custom', !!this.pos);
    this.buttons.forEach(({ b }, i) => {
      b.style.left = this.pos ? `calc(${(this.pos[i].x * 100).toFixed(2)}% - 32px)` : '';
      b.style.top = this.pos ? `calc(${(this.pos[i].y * 100).toFixed(2)}% - 32px)` : '';
      b.style.right = this.pos ? 'auto' : '';
      b.style.bottom = this.pos ? 'auto' : '';
    });
  }

  // switch to free positions where the buttons are now
  ensureCustom() {
    if (this.pos) return;
    const { w, h } = this.stageSize();
    this.setLayout(this.buttons.map(({ b }) => {
      const r = b.getBoundingClientRect();
      const c = this.toLocal(r.left + r.width / 2, r.top + r.height / 2);
      return { x: c.x / w, y: c.y / h };
    }));
  }

  dragTo(i, e) {
    const { w, h } = this.stageSize(), p = this.toLocal(e.clientX, e.clientY);
    const pos = this.pos.slice();
    pos[i] = {
      x: Math.min(1 - 36 / w, Math.max(36 / w, p.x / w)),
      y: Math.min(1 - 50 / h, Math.max(Math.max(36 / h, 0.2), p.y / h)), // keep off the HUD row
    };
    this.setLayout(pos);
  }

  // layout mode: the game waits, the buttons can be dragged; onDone(positions | null) when finished
  startEdit(onDone) {
    if (this.editing) return;
    this.editing = true;
    this.onDone = onDone;
    this.el.classList.add('editing');
    this.bar = document.createElement('div');
    this.bar.className = 'layout-edit interactive';
    this.bar.innerHTML = `<div class="le-bar"><span>${t('layout.hint')}</span>
      <button class="tm-btn small" data-act="reset">${t('layout.reset')}</button>
      <button class="tm-btn small primary" data-act="done">${t('layout.done')}</button></div>`;
    // act on pointerup: right after a drag some phones never send the click, which left the editor
    // up (covering the screen) and the game waiting
    let down = null, handled = 0;
    const run = (act) => { if (act === 'reset') this.setLayout(null); else if (act === 'done') this.endEdit(); };
    this.bar.addEventListener('pointerdown', (e) => { e.stopPropagation(); const a = e.target.closest('[data-act]'); down = a ? a.dataset.act : null; });
    this.bar.addEventListener('pointerup', (e) => {
      const a = e.target.closest('[data-act]') || (document.elementFromPoint(e.clientX, e.clientY) || { closest: () => null }).closest('[data-act]');
      if (a && a.dataset.act === down) { handled = performance.now(); run(down); }
      down = null;
    });
    this.bar.addEventListener('click', (e) => { // keyboard / mouse fallback, never twice
      if (performance.now() - handled < 600) return;
      const a = e.target.closest('[data-act]');
      if (a) run(a.dataset.act);
    });
    this.root.appendChild(this.bar);
  }

  endEdit() {
    if (!this.editing) return;
    this.editing = false;
    this.el.classList.remove('editing');
    for (const u of this.buttons) { u.drag = null; u.aiming = null; u.b.classList.remove('dragging', 'aiming'); } // nothing left held
    if (this.bar) this.bar.remove();
    this.bar = null;
    if (this.onDone) this.onDone(this.pos ? this.pos.map((p) => ({ ...p })) : null);
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
