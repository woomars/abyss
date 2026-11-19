// Fixed-step accumulator. The caller drives frame(nowSeconds) (e.g. from rAF).
export class GameLoop {
  constructor({ step, maxFrame, update, render }) {
    this.step = step;
    this.maxFrame = maxFrame;
    this.update = update;
    this.render = render;
    this.reset();
  }
  reset() {
    this.last = null;
    this.acc = 0;
  }
  frame(now) {
    if (this.last === null) {
      this.last = now;
      this.render(0);
      return;
    }
    const delta = Math.min(Math.max(now - this.last, 0), this.maxFrame);
    this.last = now;
    this.acc += delta;
    // small epsilon guards float drift (0.1 / (1/60) = 5.9999...)
    while (this.acc + 1e-9 >= this.step) {
      this.update(this.step);
      this.acc -= this.step;
    }
    if (this.acc < 0) this.acc = 0;
    this.render(this.acc / this.step);
  }
}
