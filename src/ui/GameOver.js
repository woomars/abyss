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
          <div class="go-floor-box"><span>도달한 층</span><b class="go-floor">0</b></div>
          <div><span>처치</span><b class="go-kills">0</b></div>
          <div><span>최고 콤보</span><b class="go-combo">0</b></div>
        </div>
        <p class="go-best"></p>
        <button class="primary" data-act="retry">다시 하기</button>
      </div>`;
    root.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.querySelector('[data-act="retry"]').addEventListener('click', () => { this.hide(); onRetry(); });
  }

  // floor 0 = practice arena (no floor stats)
  show({ kills, bestCombo, floor = 0, bestFloor = 0, isNew = false, unranked = false }) {
    this.el.querySelector('.go-kills').textContent = String(kills);
    this.el.querySelector('.go-combo').textContent = String(bestCombo);
    this.el.querySelector('.go-floor').textContent = `${floor}층`;
    this.el.querySelector('.go-floor-box').classList.toggle('hidden', !floor);
    const best = this.el.querySelector('.go-best');
    best.textContent = !floor ? ''
      : unranked ? '층 이동으로 시작한 판은 기록하지 않습니다'
        : isNew ? `최고 기록 갱신! ${bestFloor}층` : `최고 기록 ${bestFloor}층`;
    best.classList.toggle('new', isNew);
    this.el.classList.remove('hidden');
  }

  hide() { this.el.classList.add('hidden'); }
}
