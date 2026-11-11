// Bottom-right special attack buttons with cooldown sweep. Kept out of the stroke input area.
const ICONS = { spin: '⟳', rushStrike: '➤', bladeWave: '≋' };

export class SkillButtons {
  constructor(root, skills) {
    this.skills = skills;
    this.el = document.createElement('div');
    this.el.className = 'skills';
    this.buttons = skills.slots.map((s, i) => {
      const b = document.createElement('button');
      b.className = `skill interactive skill-${i}`;
      b.setAttribute('aria-label', s.name);
      b.innerHTML = `<span class="icon">${ICONS[s.id] || '★'}</span><span class="cd"></span><span class="label">${s.name}</span>`;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.skills.use(i)) b.classList.add('fired');
        setTimeout(() => b.classList.remove('fired'), 150);
      });
      this.el.appendChild(b);
      return { b, cd: b.querySelector('.cd'), last: '' };
    });
    root.appendChild(this.el);
  }

  // CSS-px rects, used to exclude these areas from stroke input
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
