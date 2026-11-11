import { angleOf, angleDiff, dot } from '../core/vec.js';

const TURN_EVENT_COS = Math.cos(Math.PI / 6); // 30 degrees
const HEAD_ON_DOT = -0.95;

// Moves the player: instant direction changes, burst then cruise speed, wall sliding.
export class MovementController {
  constructor(cfg, player, arena, events) {
    this.cfg = cfg; // config.movement (live)
    this.player = player;
    this.arena = arena;
    this.events = events;
    this.burstTime = Infinity; // time since last burst start
  }

  get burstActive() {
    return this.burstTime < this.cfg.burstDuration + this.cfg.burstDecay;
  }

  currentSpeed() {
    const c = this.cfg, t = this.burstTime;
    if (t < c.burstDuration) return c.burstSpeed;
    if (t < c.burstDuration + c.burstDecay) {
      const k = (t - c.burstDuration) / c.burstDecay;
      return c.burstSpeed + (c.cruiseSpeed - c.burstSpeed) * k;
    }
    return c.cruiseSpeed;
  }

  setDirection(dir, { burst }) {
    const p = this.player;
    const from = p.heading;
    if (dot(from, dir) < TURN_EVENT_COS) {
      this.events.emit('turn', { from: { x: from.x, y: from.y }, to: { x: dir.x, y: dir.y }, pos: { x: p.pos.x, y: p.pos.y } });
    }
    p.heading = { x: dir.x, y: dir.y };
    if (burst) this.burstTime = 0;
  }

  // Normal movement along heading. Never stops unless a wall blocks head-on.
  update(dt) {
    const p = this.player;
    this.burstTime += dt;
    p.speed = this.currentSpeed();
    this.step(p.heading, p.speed * dt);
    this.updateVisual(dt);
  }

  // Moves `distance` along dir with wall sliding. Returns {blocked}.
  step(dir, distance) {
    const p = this.player;
    const next = { x: p.pos.x + dir.x * distance, y: p.pos.y + dir.y * distance };
    const r = this.arena.resolveCircle(next, p.radius);
    if (r.hitWall && r.normal && dot(dir, r.normal) < HEAD_ON_DOT) {
      // head-on: stay where we are (resolved position), keep heading for the next input
      p.pos = r.pos;
      return { blocked: true };
    }
    p.pos = r.pos;
    return { blocked: r.hitWall && r.normal !== null && dot(dir, r.normal) < -0.5 };
  }

  updateVisual(dt) {
    const p = this.player;
    const target = angleOf(p.heading);
    const k = 1 - Math.exp(-dt / Math.max(this.cfg.visualTurnTime / 4, 1e-4));
    p.visualAngle += angleDiff(p.visualAngle, target) * k;
  }

  // Used by dashes/skills: move toward target at speed. Reports arrival or wall block.
  moveToward(target, speed, dt) {
    const p = this.player;
    const dx = target.x - p.pos.x, dy = target.y - p.pos.y;
    const d = Math.hypot(dx, dy);
    const stepLen = speed * dt;
    if (d <= stepLen || d < 1e-6) {
      const r = this.arena.resolveCircle({ x: target.x, y: target.y }, p.radius);
      p.pos = r.pos;
      const blocked = r.hitWall && Math.hypot(r.pos.x - target.x, r.pos.y - target.y) > 1;
      return { arrived: !blocked, blocked };
    }
    const dir = { x: dx / d, y: dy / d };
    const before = { x: p.pos.x, y: p.pos.y };
    const { blocked } = this.step(dir, stepLen);
    const moved = Math.hypot(p.pos.x - before.x, p.pos.y - before.y);
    p.visualAngle = angleOf(dir);
    return { arrived: false, blocked: blocked || moved < stepLen * 0.3 };
  }
}
