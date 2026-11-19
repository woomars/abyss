// Rolling text (opening story, ending) that a finger can push: it rolls up at `auto` px/s by itself;
// a finger on it takes over (swipe up = forward, down = back) and holding it still stops the roll;
// on release a swipe glides on and eases back to the auto speed. Dragging back does nothing. Times are in seconds. Pure.
export class TextScroller {
  // auto, decay, holdGap, still come from look.ui (auto per screen, the rest under `scroller`)
  constructor({ auto, decay, holdGap, still }) {
    this.auto = auto;
    this.decay = decay; // how fast a glide settles (1/s)
    this.holdGap = holdGap; // s without movement before lifting = it was held, not flung
    this.still = still;     // px: less than this since touching down counts as holding, not swiping
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
    const dy = this.lastY - y; // finger up = text forward; dragging back is ignored (forward only)
    if (dy > 0) this.pos = this.clamp(this.pos + dy);
    this.moved += Math.abs(dy);
    const dt = t - this.lastT;
    if (dt > 0) this.vel = Math.max(0, dy / dt);
    this.lastY = y;
    this.lastT = t;
  }

  // t: when the finger lifted; a finger that rested still before lifting leaves no glide
  up(t = null) {
    if (!this.pressed) return;
    this.pressed = false;
    const rested = t != null && t - this.lastT > this.holdGap;
    this.fling = this.moved >= this.still && !rested ? this.vel : 0;
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
