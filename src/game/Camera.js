import { smoothDamp } from '../core/smoothDamp.js';
import { angleOf, angleDiff } from '../core/vec.js';

// normal: follow player with look-ahead. combat: hold still, follow only beyond a free radius.
// Position and velocity stay continuous across every mode change (no teleport).
export class Camera {
  constructor(cfg, rng) {
    this.cfg = cfg; // config.camera (live)
    this.rng = rng;
    this.pos = { x: 0, y: 0 };
    this.renderPos = { x: 0, y: 0 };
    this.vx = { v: 0 };
    this.vy = { v: 0 };
    this.mode = 'normal';
    this.returnTimer = 0;
    this.lookAngle = 0;
    this.viewW = 960;
    this.viewH = 540;
    this.shakeAmount = 0;
    this.shakeEnabled = true;
    this.bounds = null; // room rect {w, h}: the view stays inside it (plus a little wall)
  }

  setBounds(b) { this.bounds = b; }

  // keep a view center inside the room; a room smaller than the view is centered
  clampPoint(p) {
    const b = this.bounds;
    if (!b) return p;
    const m = this.cfg.boundsMargin || 0;
    const fit = (v, size, view) => {
      const lo = view / 2 - m, hi = size - view / 2 + m;
      return lo > hi ? size / 2 : Math.min(hi, Math.max(lo, v));
    };
    return { x: fit(p.x, b.w, this.viewW), y: fit(p.y, b.h, this.viewH) };
  }

  setViewport(worldW, worldH) { this.viewW = worldW; this.viewH = worldH; }

  setMode(mode) {
    if (mode === this.mode) return;
    if (this.mode === 'combat' && mode === 'normal') this.returnTimer = this.cfg.returnTime;
    this.mode = mode;
  }

  // the only discontinuous move — used on restart
  snapTo(pos) {
    this.pos = { x: pos.x, y: pos.y };
    this.renderPos = { x: pos.x, y: pos.y };
    this.prevRenderPos = this.renderPos;
    this.vx.v = 0; this.vy.v = 0;
    this.returnTimer = 0;
  }

  addShake(amount) {
    if (amount > this.shakeAmount) this.shakeAmount = amount;
  }

  setShakeEnabled(on) {
    this.shakeEnabled = on;
    if (!on) this.shakeAmount = 0;
  }

  update(dt, player) {
    const c = this.cfg;
    this.prevRenderPos = this.renderPos; // for render interpolation
    // look-ahead direction rotates smoothly even when the player turns instantly
    const target = angleOf(player.heading);
    const k = 1 - Math.exp(-dt / Math.max(c.lookAheadTurnTime / 3, 1e-4));
    this.lookAngle += angleDiff(this.lookAngle, target) * k;

    let tx, ty, smooth;
    if (this.mode === 'combat') {
      const dx = player.pos.x - this.pos.x, dy = player.pos.y - this.pos.y;
      const d = Math.hypot(dx, dy);
      const R = c.freeRadiusFrac * this.viewW;
      if (d <= R) {
        // hold: glide to a stop by decaying the current velocity (symmetric in every direction;
        // smoothDamp toward its own position would zero negative velocities in one frame)
        const k = Math.exp(-dt / Math.max(c.combatFollowTime / 3, 1e-4));
        this.vx.v *= k; this.vy.v *= k;
        this.pos.x += this.vx.v * dt;
        this.pos.y += this.vy.v * dt;
        this.applyShake(dt);
        return;
      }
      tx = player.pos.x - (dx / d) * R;
      ty = player.pos.y - (dy / d) * R;
      smooth = c.combatFollowTime;
    } else {
      tx = player.pos.x + Math.cos(this.lookAngle) * c.lookAhead;
      ty = player.pos.y + Math.sin(this.lookAngle) * c.lookAhead;
      if (this.returnTimer > 0) {
        this.returnTimer -= dt;
        smooth = c.returnTime;
      } else {
        smooth = c.followTime;
      }
    }
    ({ x: tx, y: ty } = this.clampPoint({ x: tx, y: ty }));
    this.pos.x = smoothDamp(this.pos.x, tx, this.vx, smooth, dt);
    this.pos.y = smoothDamp(this.pos.y, ty, this.vy, smooth, dt);
    this.applyShake(dt);
  }

  // shake: random offset, exponential decay
  applyShake(dt) {
    const c = this.cfg;
    if (this.shakeEnabled && this.shakeAmount > 0.01) {
      const a = this.shakeAmount;
      this.renderPos = { x: this.pos.x + (this.rng() * 2 - 1) * a, y: this.pos.y + (this.rng() * 2 - 1) * a };
      this.shakeAmount *= Math.exp(-dt / Math.max(c.shake.decay / 3, 1e-4));
    } else {
      this.shakeAmount = 0;
      this.renderPos = { x: this.pos.x, y: this.pos.y };
    }
  }
}
