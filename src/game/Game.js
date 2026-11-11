import { Arena } from './Arena.js';
import { Player } from './Player.js';

// Assembles all game systems. No DOM access here.
export class Game {
  constructor(config, { events, rng }) {
    this.config = config;
    this.events = events;
    this.rng = rng;
    this.paused = false;
    this.arena = new Arena(config.movement.arena);
    this.player = new Player(config.movement, this.center());
  }
  center() {
    return { x: this.arena.width / 2, y: this.arena.height / 2 };
  }
  update(dt) {
    if (this.paused) return;
    const p = this.player;
    p.savePrev();
    const speed = this.config.movement.cruiseSpeed;
    const next = { x: p.pos.x + p.heading.x * speed * dt, y: p.pos.y + p.heading.y * speed * dt };
    p.pos = this.arena.resolveCircle(next, p.radius).pos;
  }
}
