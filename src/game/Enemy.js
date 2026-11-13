import { rhythmFor, teleTime } from './Rhythm.js';
import { AI } from './ai/index.js';

// Single enemy: reacts to hits (stagger, knockback, flash), plays a death fade. Movement and attacks
// come from its type's brain (ai/*), or the default melee behaviour: chase, counterattack when hit.
// Heavy enemies (riposte: elites, enhanced) stay angry for a while after a hit: a player who dashes
// into their reach then is struck at once and the chain breaks — no rushing back and forth for free.
// Boss minions (mods.minion) do not wait to be hit: they chase hard and swing on their own.
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
    this.rearm = 0;
    this.windupTime = 0;
    this.strikeTime = 0; // visual flash after a strike
    this.hidden = false; // untargetable while faded out (wraith)
    this.windupMax = 0; // length of the current windup (telegraph fill)
    this.stunTime = 0; // > 0: stunned by a special attack (no moving, no attacking, no riposte)
    this.lunge = 0; // minion strike: steps this far toward the player when the windup ends
    this.angerTime = 0; // > 0: a hit made it ready to strike back at anyone entering its reach
    this.riposteCd = 0;
    this.wasInReach = false;
    this.minionCd = this.mods.minion ? this.root.minion.attackEvery[0] * 0.5 : 0;
    this.brain = AI[this.tcfg.ai] || null;
    // melee types with a rhythm mix the beats of their counters (stage from the floor)
    this.rhythm = this.tcfg.rhythm && !this.brain ? rhythmFor(root, this.tcfg.rhythm, this.mods.rhythmStage || 1) : null;
    this.beat = null;
    this.rearm = 0;
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
  get canRiposte() { return !!(this.tcfg.riposte || this.mods.riposte); }
  get riposteWindow() { return this.mods.riposteWindow || this.root.counterWindow || 1; }

  // stunned: hold still for t, and forget every attack in progress (anger, counter, windup, timers)
  stun(t) {
    if (!this.alive || this.dying) return;
    this.stunTime = Math.max(this.stunTime, t);
    this.staggerTime = Math.max(this.staggerTime, t);
    this.angerTime = 0;
    this.counterTime = 0;
    this.canCounter = false;
    this.windupTime = 0;
    this.windupMax = 0;
    this.lunge = 0;
    this.riposteCd = 0;
    this.wasInReach = true; // waking up next to the player is not "stepping in"
    if (this.mods.minion) this.minionCd = this.root.minion.attackEvery[0];
    if (this.brain && this.brain.onStun) this.brain.onStun(this);
  }

  startWindup(time, lunge = 0) {
    this.windupTime = time;
    this.windupMax = time;
    this.lunge = lunge;
  }

  takeHit({ damage, knockDir, knockback, stagger }) {
    this.lastBlocked = null;
    if (this.immune) { damage = 0; this.lastBlocked = 'immune'; } // a boss quest: minions or sigils still stand
    else if (this.guard > 0) { // a warrior's guard soaks blows until it breaks; what is left over goes through
      const soak = Math.min(this.guard, damage);
      this.guard -= soak; damage -= soak;
      if (damage <= 0) this.lastBlocked = 'guard';
    }
    if (this.shieldOn) damage *= this.tcfg.shieldMul != null ? this.tcfg.shieldMul : 0.4; // a summoner shielded by its minions
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
    if (this.canRiposte && this.stunTime <= 0) {
      this.angerTime = this.riposteWindow;
      this.wasInReach = true; // the strike that angered it does not count as stepping in
    }
    this.counterTime = this.stunTime > 0 ? 0 : this.root.counterWindow || 0;
    this.canCounter = this.counterTime > 0;
    if (this.rhythm) { this.rhythm.reset(); this.beat = this.rhythm.next(); this.rearm = 0; } // a fresh hit starts the beat over
    return { killed: false };
  }

  // angry after a hit: the moment a dashing player comes into reach (from outside) it strikes at once.
  // Runs even while staggered, and a further hit cannot cancel it. When the enemy itself walks up to
  // the player it uses the ordinary telegraphed counter instead (no unseen instant blows).
  updateRiposte(playerPos, playerRadius, onAttack, onStrike, dashing) {
    const inReach = this.inReach(playerPos, playerRadius);
    const entered = inReach && !this.wasInReach;
    this.wasInReach = inReach;
    if (!entered || !dashing || this.angerTime <= 0 || this.riposteCd > 0 || this.hidden) return;
    this.riposteCd = (this.root.riposte && this.root.riposte.cooldown) || 0.6;
    this.strikeTime = 0.18;
    this.windupTime = 0;
    if (onStrike) onStrike(this, true, true);
    if (onAttack) onAttack(this, true);
  }

  // game: the Game (brains read the player, hazards, view); null in plain melee tests
  update(dt, playerPos, arena, playerRadius = 16, onAttack = null, onStrike = null, game = null) {
    this.prevPos.x = this.pos.x;
    this.prevPos.y = this.pos.y;
    if (this.flashTime > 0) this.flashTime -= dt;
    if (this.strikeTime > 0) this.strikeTime -= dt;
    if (this.counterTime > 0) this.counterTime -= dt;
    if (this.rearm > 0) { this.rearm -= dt; if (this.rearm <= 0 && this.counterTime > 0) this.canCounter = true; } // next beat of a mixed counter
    if (this.riposteCd > 0) this.riposteCd -= dt;
    if (this.stunTime > 0) this.stunTime = Math.max(0, this.stunTime - dt);
    if (this.angerTime > 0) this.angerTime -= dt;
    if (!this.dying && this.canRiposte && this.stunTime <= 0) this.updateRiposte(playerPos, playerRadius, onAttack, onStrike, game ? game.combat.inCombat : true);
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
        if (this.lunge > 0) { // minion: leap at the player as it swings
          const dx = playerPos.x - this.pos.x, dy = playerPos.y - this.pos.y, d = Math.hypot(dx, dy);
          const gap = Math.max(0, d - this.radius - playerRadius);
          const step = Math.min(this.lunge, gap);
          if (d > 1e-6 && step > 0) this.pos = arena.resolveCircle({ x: this.pos.x + (dx / d) * step, y: this.pos.y + (dy / d) * step }, this.radius).pos;
          this.lunge = 0;
        }
        // mixed beats: after a quick strike it may swing again once the beat's wait is over
        if (this.rhythm && this.beat) { const w = this.beat.wait; this.beat = this.rhythm.next(); if (w < this.counterTime) this.rearm = w; }
        const hit = this.inReach(playerPos, playerRadius);
        if (onStrike) onStrike(this, hit);
        if (hit && onAttack) onAttack(this);
      }
    } else if (this.canCounter && this.counterTime > 0 && this.inReach(playerPos, playerRadius)) {
      const base = this.tcfg.attackWindup || 0.2;
      this.startWindup(this.rhythm && this.beat ? teleTime(this.root, base, this.beat.tele) : base);
    } else {
      const dx = playerPos.x - this.pos.x, dy = playerPos.y - this.pos.y;
      const d = Math.hypot(dx, dy);
      const mc = this.mods.minion ? this.root.minion : null;
      if (mc) this.minionCd -= dt;
      if (mc && this.minionCd <= 0 && d - this.radius - playerRadius <= mc.engageRange) {
        // minion: show the swing whether or not the player is in reach yet, then leap and strike
        const [a, b] = mc.attackEvery;
        this.minionCd = a + ((this.id * 0.61) % 1) * (b - a);
        this.startWindup(mc.windup, mc.lunge);
      } else if (d > this.radius) {
        const sp = this.speed * (mc ? mc.speed : 1);
        mx += (dx / d) * sp;
        my += (dy / d) * sp;
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
