// The combo counts hits; it breaks when no hit lands within comboWindow (real seconds, like the screen shows it).
export class Combo {
  constructor(cfg) {
    this.cfg = cfg; // config.feedback (live)
    this.count = 0;
    this.timer = 0;
  }

  hit() {
    this.count += 1;
    this.timer = this.cfg.comboWindow;
  }

  update(dt) {
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) { this.timer = 0; this.count = 0; }
    }
  }

  reset() { this.count = 0; this.timer = 0; }
}
