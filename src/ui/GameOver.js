import { floorLabel } from '../core/floorLabel.js';


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
        <div class="go-fate"></div>
        <button class="primary" data-act="retry">다시 하기</button>
      </div>`;
    root.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.querySelector('[data-act="retry"]').addEventListener('click', () => { this.hide(); onRetry(); });
  }

  // floor 0 = practice arena (no floor stats)
  show({ kills, bestCombo, floor = 0, bestFloor = 0, isNew = false, unranked = false, fate = null }) {
    const fe = this.el.querySelector('.go-fate');
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    fe.innerHTML = fate ? `<div>${esc(fate.record.family)} ${esc(fate.record.given)} (${fate.record.generation}대손)</div>
      <div class="${fate.survived.length ? 'up' : 'dim'}">${fate.survived.length ? `살아남은 장비: ${fate.survived.map((i) => esc(i.name)).join(', ')}` : '살아남은 장비 없음'}</div>
      <div class="dim">잃은 장비 ${fate.lost.length}개 · 골드와 주머니는 사라졌습니다</div>` : '';
    this.el.querySelector('[data-act="retry"]').textContent = fate ? '가문을 잇는다' : '다시 하기';
    this.el.querySelector('.go-kills').textContent = String(kills);
    this.el.querySelector('.go-combo').textContent = String(bestCombo);
    this.el.querySelector('.go-floor').textContent = floorLabel(floor);
    this.el.querySelector('.go-floor-box').classList.toggle('hidden', !floor);
    const best = this.el.querySelector('.go-best');
    best.textContent = !floor ? ''
      : unranked ? '층 이동으로 시작한 판은 기록하지 않습니다'
        : isNew ? `최고 기록 갱신! ${floorLabel(bestFloor)}` : `최고 기록 ${floorLabel(bestFloor)}`;
    best.classList.toggle('new', isNew);
    this.el.classList.remove('hidden');
  }

  hide() { this.el.classList.add('hidden'); }
}
