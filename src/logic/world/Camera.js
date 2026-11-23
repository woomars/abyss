import { smoothDamp } from '../../core/smoothDamp.js';
import { angleOf, angleDiff } from '../../core/vec.js';

// normal: follow player with look-ahead. combat: hold still, follow only beyond a free radius.
// Position and velocity stay continuous across every mode change (no teleport).
// The screen shake is not here: look/fx/Shake adds it on top when drawing.
export class Camera {
  constructor(cfg) {
    this.cfg = cfg; // config.camera (live)
    this.pos = { x: 0, y: 0 };
    this.prevPos = { x: 0, y: 0 }; // pos one step ago, for render interpolation
    this.vx = { v: 0 };
    this.vy = { v: 0 };
    this.mode = 'normal';
    this.returnTimer = 0;
    this.lookAngle = 0;
    this.viewW = 960;
    this.viewH = 540;
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

  // player offset from the view center lies within edgeMargin of the screen edge
  atEdge(dx, dy) {
    const m = this.cfg.edgeMargin;
    if (m == null) return false;
    return Math.abs(dx) > this.viewW / 2 - m || Math.abs(dy) > this.viewH / 2 - m;
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
    this.prevPos = { x: pos.x, y: pos.y };
    this.vx.v = 0; this.vy.v = 0;
    this.returnTimer = 0;
  }

  update(dt, player) {
    const c = this.cfg;
    this.prevPos = { x: this.pos.x, y: this.pos.y }; // for render interpolation
    // look-ahead direction rotates smoothly even when the player turns instantly
    const target = angleOf(player.heading);
    const k = 1 - Math.exp(-dt / Math.max(c.lookAheadTurnTime / 3, 1e-4));
    this.lookAngle += angleDiff(this.lookAngle, target) * k;

    let tx, ty, smooth;
    if (this.mode === 'combat') {
      const dx = player.pos.x - this.pos.x, dy = player.pos.y - this.pos.y;
      const d = Math.hypot(dx, dy);
      const R = c.freeRadiusFrac * this.viewW;
      const inside = this.clampPoint(this.pos);
      const out = Math.abs(inside.x - this.pos.x) > 0.5 || Math.abs(inside.y - this.pos.y) > 0.5;
      if (d <= R && !out && !this.atEdge(dx, dy)) {
        // hold: glide to a stop by decaying the current velocity (symmetric in every direction;
        // smoothDamp toward its own position would zero negative velocities in one frame)
        const k = Math.exp(-dt / Math.max(c.combatFollowTime / 3, 1e-4));
        this.vx.v *= k; this.vy.v *= k;
        this.pos.x += this.vx.v * dt;
        this.pos.y += this.vy.v * dt;
        return;
      }
      // outside the room while holding: glide back in; otherwise follow at the free radius
      tx = d <= R ? inside.x : player.pos.x - (dx / d) * R;
      ty = d <= R ? inside.y : player.pos.y - (dy / d) * R;
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
    // player near a screen edge: keep it edgeMargin inside, catching up fast (walls still win below)
    if (this.atEdge(player.pos.x - this.pos.x, player.pos.y - this.pos.y)) {
      const ex = this.viewW / 2 - c.edgeMargin, ey = this.viewH / 2 - c.edgeMargin;
      tx = Math.min(player.pos.x + ex, Math.max(player.pos.x - ex, tx));
      ty = Math.min(player.pos.y + ey, Math.max(player.pos.y - ey, ty));
      smooth = Math.min(smooth, c.edgeFollowTime);
    }
    ({ x: tx, y: ty } = this.clampPoint({ x: tx, y: ty }));
    this.pos.x = smoothDamp(this.pos.x, tx, this.vx, smooth, dt);
    this.pos.y = smoothDamp(this.pos.y, ty, this.vy, smooth, dt);
  }
}
