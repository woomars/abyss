import { AI } from './ai/index.js';

// Single enemy: reacts to hits (stagger, knockback, flash), plays a death fade. Movement and attacks
// come from its type's brain (ai/*), or the default melee behaviour: chase, counterattack when hit.
export class Enemy {
  constructor(id, type, root, pos, mods = null) {
    this.id = id;
    this.type = type;
    this.root = root; // config.enemies (live)
    // floor multipliers (dungeon) and enhanced-monster bonus; practice enemies use 1
    this.mods = { hp: 1, attack: 1, speed: 1, size: 1, enhanced: false, ...(mods || {}) };
    this.pos = { x: pos.x, y: pos.y };
    this.prevPos = { x: pos.x, y: pos.y };
    this.vel = { x: 0, y: 0 }; // knockback velocity
    this.hp = this.tcfg.hp * this.mods.hp;
    this.maxHp = this.hp;
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
    this.hidden = false; // untargetable while faded out (wraith)
    this.brain = AI[this.tcfg.ai] || null;
    if (this.brain) this.brain.init(this);
  }

  // distance at which a strike connects (edge to edge reach)
  inReach(playerPos, playerRadius) {
    const d = Math.hypot(playerPos.x - this.pos.x, playerPos.y - this.pos.y);
    return d <= this.radius + playerRadius + (this.tcfg.attackRange || 0);
  }

  get tcfg() { return this.root.types[this.type]; }
  get radius() { return this.tcfg.radius * this.mods.size; }
  get attack() { return this.tcfg.attack * this.mods.attack; }
  get speed() { return this.tcfg.speed * this.mods.speed; }
  get rank() { return this.tcfg.rank || 'normal'; }
  // heavy targets: preferred by targeting, pushed less by crowding
  get isElite() { return this.rank === 'elite' || this.rank === 'boss' || this.type === 'elite'; }
  get isBoss() { return this.rank === 'boss'; }
  get targetable() { return this.alive && !this.dying && !this.hidden; }

  takeHit({ damage, knockDir, knockback, stagger }) {
    if (!this.targetable) return { killed: false };
    this.hp -= damage;
    this.flashTime = 0.08;
    const k = knockback * (1 - this.tcfg.knockbackResist) * this.root.knockbackDecay;
    this.vel.x += knockDir.x * k;
    this.vel.y += knockDir.y * k;
    const sr = this.tcfg.staggerResist != null ? this.tcfg.staggerResist : this.tcfg.knockbackResist * 0.5;
    this.staggerTime = Math.max(this.staggerTime, stagger * (1 - sr));
    if (this.brain && this.brain.onHit) this.brain.onHit(this);
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

  // game: the Game (brains read the player, hazards, view); null in plain melee tests
  update(dt, playerPos, arena, playerRadius = 16, onAttack = null, onStrike = null, game = null) {
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
    } else if (this.brain && game) {
      const m = this.brain.update(this, dt, game);
      mx += m.x; my += m.y;
    } else if (this.windupTime > 0) {
      // telegraph: stand still, then strike; misses if the player already left the reach
      this.windupTime -= dt;
      if (this.windupTime <= 0) {
        this.windupTime = 0;
        this.canCounter = false;
        this.strikeTime = 0.15;
        const hit = this.inReach(playerPos, playerRadius);
        if (onStrike) onStrike(this, hit);
        if (hit && onAttack) onAttack(this);
      }
    } else if (this.canCounter && this.counterTime > 0 && this.inReach(playerPos, playerRadius)) {
      this.windupTime = this.tcfg.attackWindup || 0.2;
    } else {
      const dx = playerPos.x - this.pos.x, dy = playerPos.y - this.pos.y;
      const d = Math.hypot(dx, dy);
      if (d > this.radius) {
        mx += (dx / d) * this.speed;
        my += (dy / d) * this.speed;
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
