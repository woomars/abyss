// The two layers of an hp bar, so a change of hp can be seen:
// - a blow: the red drops at once; the white behind it waits trailDelay seconds, then slides down.
// - healing: the white jumps up at once; the red waits trailDelay seconds, then rises to it.
// Only the first change of a burst waits: a further change while one is still waiting or sliding adds
// no new wait. Slides move at trailSpeed (share of max hp per second). white >= hp >= red always. Pure.
export class HpTrail {
  constructor(cfg) {
    this.cfg = cfg; // tuning.hud.hpBar: { trailDelay, trailSpeed }
    this.reset(NaN);
  }

  reset(hp) {
    this.known = Number.isFinite(hp);
    const v = this.known ? hp : 0; // 0 until the first update when hp is not known yet
    this.trail = v; this.red = v;           // white and red widths, in hp
    this.down = { wait: 0, busy: false };   // the white sliding down after a blow
    this.up = { wait: 0, busy: false };     // the red rising after a heal
  }

  // one lagging side: wait once per burst, then move `from` toward `to` by at most step per second
  lag(s, from, to, dt, step) {
    if (!s.busy) { s.busy = true; s.wait = this.cfg.trailDelay; }
    if (s.wait > 0) {
      s.wait -= dt;
      if (s.wait > 0) return from;
      dt = -s.wait; // the rest of this step moves
      s.wait = 0;
    }
    const d = step * dt, next = to > from ? Math.min(to, from + d) : Math.max(to, from - d);
    if (next === to) s.busy = false;
    return next;
  }

  update(hp, maxHp, dt) {
    if (!this.known) { this.reset(hp); return; } // the first hp seen is not a heal
    const step = this.cfg.trailSpeed * maxHp;
    if (hp >= this.trail) { this.trail = hp; this.down.busy = false; } // white is never below hp
    else this.trail = this.lag(this.down, this.trail, hp, dt, step);
    if (hp <= this.red) { this.red = hp; this.up.busy = false; }       // red is never above hp
    else this.red = this.lag(this.up, this.red, hp, dt, step);
  }
}
