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
    // counterattack: a hit opens a short window in which the enemy strikes back once if the player is in reach
    this.counterTime = 0;
    this.canCounter = false;
    this.windupTime = 0;
    this.strikeTime = 0; // visual flash after a strike
  }

  // distance at which a strike connects (edge to edge reach)
  inReach(playerPos, playerRadius) {
    const d = Math.hypot(playerPos.x - this.pos.x, playerPos.y - this.pos.y);
    return d <= this.radius + playerRadius + (this.tcfg.attackRange || 0);
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
    // being hit interrupts a windup and (re)opens the counter window
    this.windupTime = 0;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dying = true;
      this.deathTimer = this.root.deathTime;
      this.canCounter = false;
      return { killed: true };
    }
    this.counterTime = this.root.counterWindow || 0;
    this.canCounter = this.counterTime > 0;
    return { killed: false };
  }

  update(dt, playerPos, arena, playerRadius = 16, onAttack = null) {
    this.prevPos.x = this.pos.x;
    this.prevPos.y = this.pos.y;
    if (this.flashTime > 0) this.flashTime -= dt;
    if (this.strikeTime > 0) this.strikeTime -= dt;
    if (this.counterTime > 0) this.counterTime -= dt;
    let mx = this.vel.x, my = this.vel.y;
    if (this.dying) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.alive = false;
    } else if (this.staggerTime > 0) {
      this.staggerTime -= dt;
    } else if (this.windupTime > 0) {
      // telegraph: stand still, then strike; misses if the player already left the reach
      this.windupTime -= dt;
      if (this.windupTime <= 0) {
        this.windupTime = 0;
        this.canCounter = false;
        this.strikeTime = 0.15;
        if (this.inReach(playerPos, playerRadius) && onAttack) onAttack(this);
      }
    } else if (this.canCounter && this.counterTime > 0 && this.inReach(playerPos, playerRadius)) {
      this.windupTime = this.tcfg.attackWindup || 0.2;
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
