// Screen shake: a random offset added to the camera, falling evenly from its peak to 0 over
// look.camera.shake.decay seconds. A bigger shake replaces a smaller one; a smaller one is ignored.
export class Shake {
  constructor(look, rng) {
    this.look = look; // config.look (live)
    this.rng = rng;
    this.amount = 0;
    this.peak = 0;
    this.enabled = true; // the settings' screen-shake switch
    this.offset = { x: 0, y: 0 };
    this.prevOffset = { x: 0, y: 0 }; // the offset one step ago, for drawing between steps
  }

  add(amount) {
    if (amount > this.amount) { this.amount = amount; this.peak = amount; }
  }

  // the offset to draw at alpha (0 = previous step, 1 = this step)
  at(alpha) {
    const p = this.prevOffset, o = this.offset;
    return { x: p.x + (o.x - p.x) * alpha, y: p.y + (o.y - p.y) * alpha };
  }

  update(dt) {
    this.prevOffset.x = this.offset.x; this.prevOffset.y = this.offset.y;
    if (this.enabled && this.amount > 0.01) {
      const a = this.amount;
      this.offset.x = (this.rng() * 2 - 1) * a;
      this.offset.y = (this.rng() * 2 - 1) * a;
      this.amount = Math.max(0, a - (this.peak * dt) / Math.max(this.look.camera.shake.decay, 1e-4));
    } else {
      this.amount = 0;
      this.offset.x = 0; this.offset.y = 0;
    }
  }
}
