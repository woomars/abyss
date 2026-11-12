// Center announcement (floor start, room cleared, chest): fades in, holds, then hides.
export class Banner {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.className = 'banner hidden';
    this.el.innerHTML = '<div class="banner-title"></div><div class="banner-sub"></div>';
    root.appendChild(this.el);
    this.timer = null;
  }

  show(title, sub = '', { ms = 1800, kind = '' } = {}) {
    this.el.querySelector('.banner-title').textContent = title;
    this.el.querySelector('.banner-sub').textContent = sub;
    this.el.className = `banner ${kind}`;
    void this.el.offsetWidth; // restart the CSS animation
    this.el.classList.add('show');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.el.classList.add('hidden'), ms);
  }

  hide() { clearTimeout(this.timer); this.el.classList.add('hidden'); }
}
