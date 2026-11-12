import { Arena } from './Arena.js';
import { Player } from './Player.js';
import { StrokeTracker } from './StrokeTracker.js';
import { MovementController } from './MovementController.js';
import { Camera } from './Camera.js';
import { EnemyManager } from './EnemyManager.js';
import { CombatController } from './CombatController.js';
import { HitStop } from './HitStop.js';
import { SkillSystem } from './SkillSystem.js';
import { EffectManager } from './EffectManager.js';
import { Dungeon } from './Dungeon.js';
import { Hazards } from './Hazards.js';

// Assembles all game systems. No DOM access here.
export class Game {
  constructor(config, { events, rng }) {
    this.config = config;
    this.events = events;
    this.rng = rng;
    this.paused = false;
    this.time = 0;
    this.arena = new Arena(config.movement.arena);
    this.player = new Player(config.movement, this.center());
    this.strokes = new StrokeTracker(config.input, events);
    this.movement = new MovementController(config.movement, this.player, this.arena, events);
    this.enemies = new EnemyManager(config.enemies, this.arena, rng);
    this.camera = new Camera(config.camera, rng);
    this.camera.snapTo(this.player.pos);
    this.combat = new CombatController(config.combat, {
      player: this.player, movement: this.movement, enemies: this.enemies, camera: this.camera, events, rng,
      viewRect: () => this.viewRect(),
    });
    this.skills = new SkillSystem(config.skills, {
      player: this.player, movement: this.movement, enemies: this.enemies, combat: this.combat,
      combatCfg: config.combat, events, rng, arena: this.arena,
    });
    this.hitStop = new HitStop(config.feedback);
    this.effects = new EffectManager(config, events, rng);
    this.pendingStroke = null;
    events.on('stroke', (s) => this.queueStroke(s));
    this.pendingFlick = null;
    events.on('flick', (f) => { this.pendingFlick = { x: f.dir.x, y: f.dir.y }; });
    events.on('hit', (h) => this.onHit(h));
    this.stats = { kills: 0, bestCombo: 0 };
    events.on('kill', () => {
      this.stats.kills += 1;
      this.stats.bestCombo = Math.max(this.stats.bestCombo, this.effects.combo.count);
    });
    // player health: enemy counterattacks hurt, a short invulnerability follows, regen after a quiet delay
    this.over = false;
    this.resetHealth();
    this.enemies.onAttack = (e) => this.damagePlayer(e.attack, e);
    this.enemies.onStrike = (e, hit) => events.emit('enemyStrike', { enemy: e, pos: { x: e.pos.x, y: e.pos.y }, hit });
    // enemy attacks in the world (arrows, telegraphed areas)
    this.hazards = new Hazards(this.arena);
    this.hazards.onHit = (dmg, h) => this.damagePlayer(dmg, { pos: { x: h.x, y: h.y } });
    this.enemies.game = this;
    events.on('bossEnrage', () => this.camera.addShake(this.config.camera.shake.crit));
    // practice arena by default (endless enemies); startRun() switches to the dungeon
    this.mode = 'practice';
    this.dungeon = new Dungeon(config.dungeon, this);
  }

  // begin a dungeon run at the given floor (debug can start deeper)
  startRun(floor = 1) {
    this.mode = 'dungeon';
    this.enemies.autoSpawn = false;
    this.resetRun();
    this.dungeon.start(floor);
  }

  startPractice() {
    this.mode = 'practice';
    this.enemies.autoSpawn = true;
    this.arena.cfg = this.config.movement.arena;
    this.camera.setBounds(null);
    this.dungeon.reset();
    this.resetRun();
    this.player.reset(this.center());
    this.camera.snapTo(this.player.pos);
  }

  // place the player at a new room's start (called by Dungeon behind the fade)
  loadRoom(room) {
    this.enemies.clear();
    this.hazards.clear();
    this.arena.cfg = room.arena;
    this.player.reset(room.start);
    this.movement.burstTime = Infinity;
    this.combat.reset();
    this.skills.cancelActive();
    this.effects.clear();
    this.camera.setMode('normal');
    this.camera.setBounds({ w: room.arena.width, h: room.arena.height });
    this.camera.snapTo(this.camera.clampPoint(this.player.pos));
    this.pendingStroke = null;
    this.pendingFlick = null;
  }

  healPlayer(frac) {
    const p = this.player;
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * frac);
  }

  resetHealth() {
    const c = this.config.combat.player;
    this.player.maxHp = c.maxHp;
    this.player.hp = c.maxHp;
    this.player.invuln = 0;
    this.sinceHit = Infinity;
  }

  // returns true if the damage landed
  damagePlayer(amount, source) {
    const p = this.player;
    if (this.over || p.invuln > 0 || amount <= 0) return false;
    if (this.mode === 'dungeon' && this.dungeon.state === 'fadeOut') return false; // already leaving
    p.hp = Math.max(0, p.hp - amount);
    p.invuln = this.config.combat.player.hurtInvuln;
    this.sinceHit = 0;
    const from = source ? { x: source.pos.x, y: source.pos.y } : null;
    this.events.emit('playerHit', { damage: amount, pos: { x: p.pos.x, y: p.pos.y }, from, hp: p.hp, maxHp: p.maxHp });
    this.hitStop.trigger('normal');
    const shake = this.config.camera.shake.strong;
    if (shake) this.camera.addShake(shake);
    if (p.hp <= 0) {
      this.over = true;
      this.combat.cancel();
      this.events.emit('playerDown', { kills: this.stats.kills, bestCombo: this.stats.bestCombo, floor: this.mode === 'dungeon' ? this.dungeon.floor : 0 });
    }
    return true;
  }

  updateHealth(dt) {
    const p = this.player, c = this.config.combat.player;
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
    this.sinceHit += dt;
    if (this.sinceHit >= c.regenDelay && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + c.regenPerSec * dt);
  }

  restart() {
    if (this.mode === 'dungeon') { this.startRun(1); return; }
    this.startPractice();
  }

  // shared reset for a new run or practice session
  resetRun() {
    this.enemies.clear();
    this.hazards.clear();
    this.player.reset(this.center());
    this.movement.burstTime = Infinity;
    this.combat.reset();
    this.skills.reset();
    this.hitStop.reset();
    this.effects.clear();
    this.camera.setMode('normal');
    this.camera.snapTo(this.player.pos);
    this.pendingStroke = null;
    this.pendingFlick = null;
    this.stats.kills = 0;
    this.stats.bestCombo = 0;
    this.time = 0;
    this.over = false;
    this.resetHealth();
  }

  onHit(h) {
    const kind = h.crit ? 'crit' : h.strong ? 'strong' : 'normal';
    this.hitStop.trigger(kind);
    const shake = this.config.camera.shake[kind];
    if (shake) this.camera.addShake(shake);
  }

  center() {
    return { x: this.arena.width / 2, y: this.arena.height / 2 };
  }

  // Strokes are applied at the start of the next logic step (and held during hit stop).
  queueStroke(s) {
    const prevNew = this.pendingStroke ? this.pendingStroke.isNew : false;
    this.pendingStroke = { dir: s.dir, isNew: s.isNew || prevNew };
  }

  applyPendingStroke() {
    const s = this.pendingStroke;
    if (s) {
      this.pendingStroke = null;
      this.combat.onStroke(s);
      this.movement.setDirection(s.dir, { burst: true });
    }
    const f = this.pendingFlick;
    if (f) {
      this.pendingFlick = null;
      this.combat.onFlick(f);
      this.movement.setDirection(f, { burst: true });
    }
  }

  update(realDt) {
    if (this.paused) return;
    if (this.over) { this.effects.update(realDt, this.player, false); return; }
    const dt = this.hitStop.update(realDt);
    this.time += dt;
    this.player.savePrev();
    this.updateHealth(dt);
    // input that arrives during hit stop is applied once it ends
    if (!this.hitStop.active) this.applyPendingStroke();
    this.skills.update(dt);
    if (this.skills.spinning) {
      this.movement.update(dt); // keep moving while the blade spins
    } else if (!this.skills.busy) {
      this.combat.update(dt);
      if (!this.combat.inCombat) this.movement.update(dt);
    }
    this.enemies.update(dt, this.player.pos, this.viewRect(), this.combat.inputDir, this.player.radius);
    this.hazards.update(dt, this.player);
    if (this.mode === 'dungeon') this.dungeon.update(dt);
    this.camera.update(dt, this.player);
    this.effects.update(realDt, this.player, this.combat.inCombat || this.skills.busy);
  }

  // world-space rectangle currently visible on screen
  viewRect() {
    const c = this.camera;
    return { x: c.pos.x - c.viewW / 2, y: c.pos.y - c.viewH / 2, w: c.viewW, h: c.viewH };
  }
}
