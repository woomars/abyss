// Pause overlay: resume, restart (with confirmation), screen-shake and sound toggles.
// Also hosts the "rotate to landscape" notice.
export class PauseMenu {
  constructor(root, { settings, onChange, onRestart, onOpenChange }) {
    this.settings = settings;
    this.onChange = onChange;
    this.onRestart = onRestart;
    this.onOpenChange = onOpenChange;
    this.isOpen = false;

    this.el = document.createElement('div');
    this.el.className = 'overlay pause-menu interactive hidden';
    this.el.innerHTML = `
      <div class="panel main-view">
        <h2>일시 정지</h2>
        <button data-act="resume" class="primary">계속하기</button>
        <button data-act="restart">재시작</button>
        <button data-act="shake" class="toggle"></button>
        <button data-act="sound" class="toggle"></button>
      </div>
      <div class="panel confirm-view hidden">
        <h2>정말 재시작할까요?</h2>
        <p>지금까지의 진행이 초기화됩니다.</p>
        <div class="row">
          <button data-act="confirm-yes" class="danger">예</button>
          <button data-act="confirm-no" class="primary">아니오</button>
        </div>
      </div>`;
    root.appendChild(this.el);
    this.mainView = this.el.querySelector('.main-view');
    this.confirmView = this.el.querySelector('.confirm-view');
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (btn) this.act(btn.dataset.act);
    });

    this.rotate = document.createElement('div');
    this.rotate.className = 'overlay rotate-notice hidden';
    this.rotate.innerHTML = '<div class="panel"><div class="rotate-icon">⟲</div><h2>가로로 돌려 주세요</h2></div>';
    root.appendChild(this.rotate);

    this.renderToggles();
  }

  renderToggles() {
    this.el.querySelector('[data-act="shake"]').textContent = `화면 흔들림: ${this.settings.shake ? '켜짐' : '꺼짐'}`;
    this.el.querySelector('[data-act="sound"]').textContent = `소리: ${this.settings.sound ? '켜짐' : '꺼짐'}`;
  }

  act(a) {
    if (a === 'resume') this.close();
    else if (a === 'restart') { this.mainView.classList.add('hidden'); this.confirmView.classList.remove('hidden'); }
    else if (a === 'confirm-no') { this.confirmView.classList.add('hidden'); this.mainView.classList.remove('hidden'); }
    else if (a === 'confirm-yes') { this.onRestart(); this.close(); }
    else if (a === 'shake' || a === 'sound') {
      this.settings[a] = !this.settings[a];
      this.renderToggles();
      this.onChange(this.settings);
    }
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.confirmView.classList.add('hidden');
    this.mainView.classList.remove('hidden');
    this.el.classList.remove('hidden');
    this.onOpenChange();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.add('hidden');
    this.onOpenChange();
  }

  setPortrait(on) {
    this.rotate.classList.toggle('hidden', !on);
  }
}
