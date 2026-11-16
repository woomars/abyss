// The white bar behind a red hp bar: the red drops at once, the white waits trailDelay seconds after a
// hit and then slides down to it at trailSpeed (share of max hp per second), so the loss can be seen.
// Only the first hit of a burst waits: a hit while the white is still waiting or sliding adds no new
// wait. Healing lifts the white with the red at once. Pure.
export class HpTrail {
  constructor(cfg) {
    this.cfg = cfg; // tuning.hud.hpBar: { trailDelay, trailSpeed }
    this.trail = 0;
    this.wait = 0;      // > 0: waiting before sliding
    this.busy = false;  // waiting or sliding toward hp
  }

  reset(hp) {
    this.trail = Number.isFinite(hp) ? hp : 0; // 0 until the first update when hp is not known yet
    this.wait = 0;
    this.busy = false;
  }

  update(hp, maxHp, dt) {
    if (!Number.isFinite(this.trail) || hp >= this.trail) { this.reset(hp); return; } // not set yet, or healed
    if (!this.busy) { this.busy = true; this.wait = this.cfg.trailDelay; }
    if (this.wait > 0) {
      this.wait -= dt;
      if (this.wait > 0) return;
      dt = -this.wait; // the rest of this step slides
      this.wait = 0;
    }
    this.trail = Math.max(hp, this.trail - this.cfg.trailSpeed * maxHp * dt);
    if (this.trail <= hp) this.busy = false;
  }
}
