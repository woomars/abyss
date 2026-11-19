import { rhythmFor, teleTime } from '../combat/Rhythm.js';
import { AI } from './ai/index.js';

// Single enemy: reacts to hits (stagger, knockback), plays a death fade. Movement and attacks
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
    this.windupDir = null; // the swing's way: toward the hero when the windup starts (a cone, never all round)
    this.angerTime = 0; // > 0: a hit made it ready to strike back at anyone entering its reach
    this.riposteCd = 0;
    this.riposteArc = 0;    // width of the riposte cone (deg); 0 = all round
    this.riposteDir = null; // the riposte cone's way: toward the hero aimDelay after the blow
    this.riposteAimIn = 0;  // > 0: the cone is not aimed yet
    this.riposteArm = 0;    // > 0: the cone is shown but cannot strike yet
    this.wasInReach = false;
    this.firstHold = 0; // > 0: standing still behind its own first-strike warning (9.2)
    this.aggressive = true; // 선공몹: attacks on its own; a calm one (false) waits until it is hit (EnemyManager)
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
  get meleeArc() { const m = this.root.meleeArc; return m ? (this.isElite ? m.eliteArc : m.arc) : 90; } // width of a plain swing (deg)
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
    this.firstHold = 0;
    this.riposteAimIn = 0;
    this.wasInReach = true; // waking up next to the player is not "stepping in"
    if (this.mods.minion) this.minionCd = this.root.minion.attackEvery[0];
    if (this.brain && this.brain.onStun) this.brain.onStun(this);
  }

  startWindup(time, lunge = 0, dir = null) {
    this.windupTime = time;
    this.windupMax = time;
    this.lunge = lunge;
    this.windupDir = dir;
  }

  // noRiposte: a blow that never angers (망령 set wraiths) — no riposte window, no counter
  // passDir: the way the dashing hero went (a shieldbearer blocks a dash from its front)
  takeHit({ damage, knockDir, knockback, stagger, noRiposte = false, passDir = null }) {
    this.lastBlocked = null;
    this.aggressive = true; // struck: a calm mob turns on the hero
    if (this.immune) { damage = 0; this.lastBlocked = 'immune'; this.struck = true; } // a boss quest: minions or sigils still stand (struck: an assassin found among its clones)
    else if (this.guard > 0) { // a warrior's guard soaks blows until it breaks; what is left over goes through
      const soak = Math.min(this.guard, damage);
      this.guard -= soak; damage -= soak;
      if (damage <= 0) this.lastBlocked = 'guard';
    }
    if (this.front && damage > 0) { // a golem's guarded front: a blow from there does little (quest backWeak)
      const a = Math.atan2(-knockDir.y, -knockDir.x) - this.ai.face;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) <= (this.front.arc * Math.PI) / 360) { damage *= this.front.mul; this.lastBlocked = 'guard'; }
    }
    if (this.shieldOn) damage *= this.tcfg.shieldMul != null ? this.tcfg.shieldMul : 0.4; // a summoner shielded by its minions
    if (!this.targetable) return { killed: false, untargetable: true }; // (hidden or dying: no flash, no nudge either)
    if (this.tcfg.shieldArc && passDir && this.stunTime <= 0 && this.ai && this.ai.face != null) { // a shieldbearer's front
      const a = Math.atan2(-knockDir.y, -knockDir.x) - this.ai.face;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) <= (this.tcfg.shieldArc * Math.PI) / 360) { this.lastBlocked = 'guard'; return { killed: false, blocked: true }; }
    }
    if (this.bubble && damage > 0) { this.bubble = false; damage = 0; this.lastBlocked = 'immune'; } // a shaman's bubble stops one blow
    this.hp -= damage; // the flash and the drawn nudge are look/fx/EnemyFx (the real knockback is vel below)
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
    if (noRiposte) return { killed: false }; // a wraith blow: no anger, and a window the hero opened stays as it was
    if (this.canRiposte && this.stunTime <= 0) {
      this.angerTime = this.riposteWindow;
      this.wasInReach = true; // the strike that angered it does not count as stepping in
      this.riposteDir = null; // aimed at the hero a moment later (any blow, skills too)
      this.riposteAimIn = this.riposteArc > 0 ? (this.root.riposteCone && this.root.riposteCone.aimDelay) || 0.2 : 0;
      this.riposteArm = (this.root.riposteCone && this.root.riposteCone.armDelay) || 0;
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
    if (!entered || !dashing || this.angerTime <= 0 || this.riposteCd > 0 || this.hidden || this.riposteArm > 0) return;
    if (!this.inRiposteCone(playerPos)) return;
    this.riposteCd = (this.root.riposte && this.root.riposte.cooldown) || 0.6;
    this.strikeTime = 0.18;
    this.windupTime = 0;
    if (onStrike) onStrike(this, true, true);
    if (onAttack) onAttack(this, true);
  }

  // plain melee: now and then strike first — a warned cone toward the hero (dies with it, see Hazards)
  firstStrike(dt, game, ux, uy, fs) {
    const cycle = (game.dungeon && game.dungeon.info && game.dungeon.info.cycle) || 0;
    const per = fs.chancePerSec[Math.min(cycle, fs.chancePerSec.length - 1)];
    if (game.rng() >= per * dt) return false;
    game.hazards.cone({ x: this.pos.x, y: this.pos.y, dir: { x: ux, y: uy }, radius: this.radius + (this.tcfg.attackRange || 0) + fs.reach, arcDeg: fs.cone, delay: fs.warn, damage: this.attack, owner: this, anchor: true });
    this.firstHold = fs.warn;
    return true;
  }

  // is the hero inside the riposte cone (all round when it has no direction)
  inRiposteCone(p) {
    const d = this.riposteDir;
    if (!d) return !(this.riposteArc > 0); // not aimed yet: nothing (no cone at all: all round)
    return this.inCone(p, d, this.riposteArc);
  }

  inCone(p, d, arcDeg) {
    const a = Math.atan2(p.y - this.pos.y, p.x - this.pos.x) - Math.atan2(d.y, d.x);
    return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) <= (arcDeg * Math.PI) / 360;
  }

  // a buff shaman's blessing (A = ai.buffShaman): hp and attack up while it lasts; cast again, it lasts longer
  addBuff(A) {
    if (!this.sbuff) {
      this.sbuff = { t: 0, hp: 1 + A.hp, atk: 1 + A.attack };
      this.mods = { ...this.mods, attack: this.mods.attack * this.sbuff.atk };
      this.maxHp *= this.sbuff.hp;
      this.hp *= this.sbuff.hp;
    }
    this.sbuff.t = A.duration;
  }

  dropBuff() {
    const b = this.sbuff;
    this.sbuff = null;
    this.mods = { ...this.mods, attack: this.mods.attack / b.atk };
    this.maxHp /= b.hp;
    this.hp = Math.min(this.hp, this.maxHp);
  }

  aimAt(p) { const dx = p.x - this.pos.x, dy = p.y - this.pos.y, d = Math.hypot(dx, dy) || 1; return { x: dx / d, y: dy / d }; }

  // game: the Game (brains read the player, hazards, view); null in plain melee tests
  update(dt, playerPos, arena, playerRadius = 16, onAttack = null, onStrike = null, game = null) {
    this.prevPos.x = this.pos.x;
    this.prevPos.y = this.pos.y;
    if (this.sbuff && (this.sbuff.t -= dt) <= 0) this.dropBuff(); // a buff shaman's blessing ran out
    if (this.strikeTime > 0) this.strikeTime -= dt;
    if (this.counterTime > 0) this.counterTime -= dt;
    if (this.rearm > 0) { this.rearm -= dt; if (this.rearm <= 0 && this.counterTime > 0) this.canCounter = true; } // next beat of a mixed counter
    if (this.riposteCd > 0) this.riposteCd -= dt;
    if (this.riposteArm > 0) this.riposteArm -= dt;
    if (this.riposteAimIn > 0) { // the cone takes its way: toward where the hero stands now
      this.riposteAimIn -= dt;
      if (this.riposteAimIn <= 0) { const dx = playerPos.x - this.pos.x, dy = playerPos.y - this.pos.y, d = Math.hypot(dx, dy) || 1; this.riposteDir = { x: dx / d, y: dy / d }; }
    }
    if (this.firstHold > 0) this.firstHold -= dt;
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
        const hit = this.inReach(playerPos, playerRadius) && (!this.windupDir || this.inCone(playerPos, this.windupDir, this.meleeArc));
        if (onStrike) onStrike(this, hit);
        if (hit && onAttack) onAttack(this);
      }
    } else if (this.firstHold > 0) {
      // its first strike is on the floor: hold still until it lands
    } else if (this.canCounter && this.counterTime > 0 && this.inReach(playerPos, playerRadius)) {
      const base = this.tcfg.attackWindup || 0.2;
      this.startWindup(this.rhythm && this.beat ? teleTime(this.root, base, this.beat.tele) : base, 0, this.aimAt(playerPos));
    } else {
      const dx = playerPos.x - this.pos.x, dy = playerPos.y - this.pos.y;
      const d = Math.hypot(dx, dy);
      const mc = this.mods.minion ? this.root.minion : null;
      if (mc) this.minionCd -= dt;
      const fs = !mc && game ? this.root.firstStrike : null;
      if (fs && this.aggressive && d - this.radius - playerRadius <= (this.tcfg.attackRange || 0) + fs.reach && this.firstStrike(dt, game, dx / (d || 1), dy / (d || 1), fs)) {
        // a warned cone at the hero, on its own (9.2)
      } else if (mc && this.minionCd <= 0 && d - this.radius - playerRadius <= mc.engageRange) {
        // minion: show the swing whether or not the player is in reach yet, then leap and strike
        const [a, b] = mc.attackEvery;
        this.minionCd = a + ((this.id * 0.61) % 1) * (b - a);
        this.startWindup(mc.windup, mc.lunge, this.aimAt(playerPos));
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
