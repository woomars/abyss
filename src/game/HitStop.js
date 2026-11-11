// Hit stop = brief slow-motion (not a full freeze) so it never reads as a dropped frame.
export class HitStop {
  constructor(cfg) {
    this.cfg = cfg; // config.feedback (live)
    this.remaining = 0;
  }

  get active() { return this.remaining > 1e-9; }

  trigger(kind) {
    const t = (this.cfg.hitStopMs[kind] || 0) / 1000;
    if (t > this.remaining) this.remaining = t;
  }

  // real dt in -> scaled game dt out
  update(realDt) {
    if (!this.active) { this.remaining = 0; return realDt; }
    const slowed = Math.min(realDt, this.remaining);
    this.remaining -= slowed;
    if (this.remaining < 1e-9) this.remaining = 0;
    return slowed * this.cfg.hitStopScale + (realDt - slowed);
  }

  reset() { this.remaining = 0; }
}
