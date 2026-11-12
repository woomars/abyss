// Game over overlay: shown when the player's HP reaches 0.
export class GameOver {
  constructor(root, { onRetry }) {
    this.el = document.createElement('div');
    this.el.className = 'overlay game-over interactive hidden';
    this.el.innerHTML = `
      <div class="panel">
        <h2 class="go-title">GAME OVER</h2>
        <p class="go-sub">쓰러졌습니다</p>
        <div class="go-stats">
          <div><span>처치</span><b class="go-kills">0</b></div>
          <div><span>최고 콤보</span><b class="go-combo">0</b></div>
        </div>
        <button class="primary" data-act="retry">다시 하기</button>
      </div>`;
    root.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.querySelector('[data-act="retry"]').addEventListener('click', () => { this.hide(); onRetry(); });
  }

  show({ kills, bestCombo }) {
    this.el.querySelector('.go-kills').textContent = String(kills);
    this.el.querySelector('.go-combo').textContent = String(bestCombo);
    this.el.classList.remove('hidden');
  }

  hide() { this.el.classList.add('hidden'); }
}
