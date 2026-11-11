export class Player {
  constructor(cfg, pos) {
    this.cfg = cfg; // config.movement (live)
    this.reset(pos);
  }
  get radius() { return this.cfg.playerRadius; }
  reset(pos) {
    this.pos = { x: pos.x, y: pos.y };
    this.prevPos = { x: pos.x, y: pos.y };
    this.heading = { x: 1, y: 0 };
    this.visualAngle = 0;
    this.speed = 0;
  }
  savePrev() {
    this.prevPos.x = this.pos.x;
    this.prevPos.y = this.pos.y;
  }
}
