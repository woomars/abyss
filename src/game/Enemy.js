// Single enemy: chases the player, reacts to hits (stagger, knockback, flash), plays a death fade.
export class Enemy {
  constructor(id, type, root, pos) {
    this.id = id;
    this.type = type;
    this.root = root; // config.enemies (live)
    this.pos = { x: pos.x, y: pos.y };
    this.prevPos = { x: pos.x, y: pos.y };
    this.vel = { x: 0, y: 0 }; // knockback velocity
    this.hp = this.tcfg.hp;
    this.maxHp = this.tcfg.hp;
    this.alive = true;
    this.dying = false;
    this.deathTimer = 0;
    this.staggerTime = 0;
    this.flashTime = 0;
  }

  get tcfg() { return this.root.types[this.type]; }
  get radius() { return this.tcfg.radius; }
  get isElite() { return this.type === 'elite'; }
  get targetable() { return this.alive && !this.dying; }

  takeHit({ damage, knockDir, knockback, stagger }) {
    if (!this.targetable) return { killed: false };
    this.hp -= damage;
    this.flashTime = 0.08;
    const k = knockback * (1 - this.tcfg.knockbackResist) * this.root.knockbackDecay;
    this.vel.x += knockDir.x * k;
    this.vel.y += knockDir.y * k;
    this.staggerTime = Math.max(this.staggerTime, stagger * (1 - this.tcfg.knockbackResist * 0.5));
    if (this.hp <= 0) {
      this.hp = 0;
      this.dying = true;
      this.deathTimer = this.root.deathTime;
      return { killed: true };
    }
    return { killed: false };
  }

  update(dt, playerPos, arena) {
    this.prevPos.x = this.pos.x;
    this.prevPos.y = this.pos.y;
    if (this.flashTime > 0) this.flashTime -= dt;
    let mx = this.vel.x, my = this.vel.y;
    if (this.dying) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.alive = false;
    } else if (this.staggerTime > 0) {
      this.staggerTime -= dt;
    } else {
      const dx = playerPos.x - this.pos.x, dy = playerPos.y - this.pos.y;
      const d = Math.hypot(dx, dy);
      if (d > this.radius) {
        mx += (dx / d) * this.tcfg.speed;
        my += (dy / d) * this.tcfg.speed;
      }
    }
    const decay = Math.exp(-this.root.knockbackDecay * dt);
    this.vel.x *= decay;
    this.vel.y *= decay;
    if (mx === 0 && my === 0) return;
    const r = arena.resolveCircle({ x: this.pos.x + mx * dt, y: this.pos.y + my * dt }, this.radius);
    this.pos = r.pos;
  }
}
