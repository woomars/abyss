// Rolling text (opening story, ending) that a finger can push: it rolls up at `auto` px/s by itself;
// a finger on it takes over (swipe up = forward, down = back) and holding it still stops the roll;
// on release a swipe glides on and eases back to the auto speed. Times are in seconds. Pure.
const HOLD_GAP = 0.1; // s without movement before lifting = it was held, not flung
const STILL = 8; // px: less than this since touching down counts as holding, not swiping

export class TextScroller {
  constructor({ auto = 40, decay = 4 } = {}) {
    this.auto = auto;
    this.decay = decay; // how fast a glide settles (1/s)
    this.pos = 0;       // total roll, px (+ = text moved up)
    this.min = -Infinity;
    this.max = Infinity;
    this.pressed = false;
    this.fling = 0;     // extra px/s from the last swipe
    this.vel = 0;
    this.moved = 0;
    this.lastY = 0;
    this.lastT = 0;
  }

  clampMin(min) { this.min = min; this.pos = Math.max(min, this.pos); }
  clampMax(max) { this.max = max; this.pos = Math.min(max, this.pos); }
  clamp(v) { return Math.min(this.max, Math.max(this.min, v)); }

  down(y, t) {
    this.pressed = true;
    this.fling = 0;
    this.vel = 0;
    this.moved = 0;
    this.lastY = y;
    this.lastT = t;
  }

  move(y, t) {
    if (!this.pressed) return;
    const dy = this.lastY - y; // finger up = text forward
    this.pos = this.clamp(this.pos + dy);
    this.moved += Math.abs(dy);
    const dt = t - this.lastT;
    if (dt > 0) this.vel = dy / dt;
    this.lastY = y;
    this.lastT = t;
  }

  // t: when the finger lifted; a finger that rested still before lifting leaves no glide
  up(t = null) {
    if (!this.pressed) return;
    this.pressed = false;
    const rested = t != null && t - this.lastT > HOLD_GAP;
    this.fling = this.moved >= STILL && !rested ? this.vel : 0;
  }

  // px rolled this frame (0 while the finger is on it)
  step(dt) {
    if (this.pressed) return 0;
    const before = this.pos;
    this.pos = this.clamp(this.pos + (this.auto + this.fling) * dt);
    this.fling *= Math.exp(-this.decay * dt);
    if (Math.abs(this.fling) < 1) this.fling = 0;
    return this.pos - before;
  }
}
