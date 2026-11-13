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
import { Relics } from './Relics.js';
import { zeroStats, addStats } from './Stats.js';
import { Loot } from './Loot.js';
import { Loadout } from './items/Loadout.js';
import { Vault } from './items/Vault.js';
import { resolveDeath, applyToken } from './items/Forge.js';
import { skillUps, owedPicks, rollSkillCards } from './SkillGrowth.js';
import { installMedals, emptyRunStats, backfillMedals, noteEssence, checkTrophies, bossRoster } from './Medals.js';
import { addXp, xpForKill, levelStats } from './Progress.js';
import { succeed } from './Family.js';
import { floorInfo } from './floorPlan.js';
import { installGearEffects, evades, abyssRingBonus } from './items/effects.js';

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
    // treasures picked this run (treasure-room cards); their bonuses feed combat, skills, movement
    this.relics = new Relics(config.relics, () => this.vault.essence);
    this.bonusStats = zeroStats(); // cards + equipment, rebuilt by refreshBonus()
    const bonus = () => this.currentBonus();
    this.movement.speedMul = () => 1 + this.bonusStats.speed;
    this.offer = null; // cards on screen: the world waits until one is picked
    this.combat = new CombatController(config.combat, {
      player: this.player, movement: this.movement, enemies: this.enemies, camera: this.camera, events, rng,
      viewRect: () => this.viewRect(), bonus,
    });
    this.skills = new SkillSystem(config.skills, {
      player: this.player, movement: this.movement, enemies: this.enemies, combat: this.combat,
      combatCfg: config.combat, events, rng, arena: this.arena, bonus,
      ups: () => this.skillGrowth || {},
      gear: () => this.gearEffects, gearCfg: () => this.config.items.effects,
    });
    this.hitStop = new HitStop(config.feedback);
    this.effects = new EffectManager(config, events, rng);
    this.pendingStroke = null;
    events.on('stroke', (s) => this.queueStroke(s));
    this.pendingFlick = null;
    events.on('flick', (f) => { this.pendingFlick = { x: f.dir.x, y: f.dir.y }; });
    events.on('hit', (h) => this.onHit(h));
    this.stats = emptyRunStats();
    // equipment on the floor and this run's pocket
    // the save slot in play (main attaches the real one); worn gear; the forge screen when open
    this.vault = new Vault({ family: '', given: '' });
    this.loadout = new Loadout(config.items);
    this.gearEffects = new Set();
    this.gearSets = {};
    this.forge = null; // { start: bool } while the forge screen is open — the world waits
    this.tokenScene = false; // the legacy-token scene is open — the world waits
    this.tokenFloors = new Set(); // floors that already gave a token this run
    this.loot = new Loot(config.items, this);
    events.on('kill', (e) => { this.loot.onKill(e.enemy); this.gainXp(e.enemy); });
    events.on('roomCleared', () => { this.loot.magnet(); this.offerSkillGrowth(); });
    events.on('kill', (e) => {
      // hp is precious: lifesteal only works on mid-boss-class kills and up
      if (this.bonusStats.lifesteal && !this.over && e.enemy && e.enemy.isBoss) this.healFlat(this.bonusStats.lifesteal);
      this.stats.kills += 1;
    });
    events.on('hit', () => { this.stats.bestCombo = Math.max(this.stats.bestCombo, this.effects.combo.count); });
    // player health: enemy counterattacks hurt, a short invulnerability follows; it only comes back from cards
    this.over = false;
    this.resetHealth();
    this.enemies.onAttack = (e, riposte = false) => {
      const r = this.config.enemies.riposte;
      this.damagePlayer(e.attack * (riposte && r ? r.damageMul : 1), e, { riposte });
    };
    this.enemies.onStrike = (e, hit, riposte = false) => events.emit('enemyStrike', { enemy: e, pos: { x: e.pos.x, y: e.pos.y }, hit, riposte });
    // enemy attacks in the world (arrows, telegraphed areas)
    this.hazards = new Hazards(this.arena, config.enemies);
    this.hazards.onHit = (dmg, h) => this.damagePlayer(dmg, { pos: { x: h.x, y: h.y } });
    this.enemies.game = this;
    events.on('bossEnrage', () => this.camera.addShake(this.config.camera.shake.crit));
    events.on('jumpLand', () => this.camera.addShake(this.config.camera.shake.strong)); // the landing thuds
    events.on('floorStart', (e) => {
      // every 100th floor: a legacy token, and the scene to put it on an item (once per floor per run)
      const tk = this.config.items.legacyToken;
      if (this.mode === 'dungeon' && tk && e.floor % tk.every === 0 && !this.tokenFloors.has(e.floor)) {
        this.tokenFloors.add(e.floor);
        this.vault.tokens += 1;
        this.tokenScene = true;
        this.events.emit('legacyToken', { floor: e.floor, tokens: this.vault.tokens });
      }
      if (this.vault.state !== 'run') return;
      this.vault.lastFloor = e.floor;
      this.saveVault();
    });
    // practice arena by default (endless enemies); startRun() switches to the dungeon
    this.mode = 'practice';
    this.dungeon = new Dungeon(config.dungeon, this);
    installGearEffects(this);
    installMedals(this);
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
    this.allies = [];
    this.fields = [];
    this.enemies.clear();
    this.loot.clearGround();
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

  // sum of every bonus source; call whenever cards or equipment change
  refreshBonus() {
    const s = addStats(zeroStats(), this.relics.stats);
    addStats(s, this.vault.essence.stats); // essences handed down the line
    this.skillGrowth = skillUps(this.config.skills.growth, this.vault.skillUps);
    const sum = this.loadout.summary();
    addStats(s, sum.stats);
    addStats(s, levelStats(this.config.progress, this.vault.progress.level));
    this.gearEffects = sum.effects;
    this.gearSets = sum.sets;
    if (sum.effects.has('comboRise')) s.comboStep += this.config.items.effects.comboRise.comboStep; // 광란의 목걸이
    this.bonusStats = s;
  }

  // max hp follows the bonus; gaining max hp also gains that much current hp
  // keepMissing (forge): the same hp stays missing, so swapping gear never heals
  applyMaxHp(keepMissing = false) {
    const p = this.player, max = this.config.combat.player.maxHp + this.bonusStats.maxHp;
    if (keepMissing) p.hp = Math.max(1, max - (p.maxHp - p.hp));
    else if (max > p.maxHp) p.hp += max - p.maxHp;
    p.maxHp = max;
    p.hp = Math.min(p.hp, max);
  }

  gainXp(enemy) {
    if (this.mode !== 'dungeon' || !enemy || this.over) return;
    const cfg = this.config.progress;
    const n = addXp(cfg, this.vault.progress, xpForKill(cfg, enemy, this.dungeon.floor));
    if (n > 0) {
      this.refreshBonus();
      this.applyMaxHp();
      if (cfg.levelUpHeal) this.healPlayer(cfg.levelUpHeal * n); // part of the hp comes back, never all of it
      this.events.emit('levelUp', { level: this.vault.progress.level, pos: { x: this.player.pos.x, y: this.player.pos.y } });
      if (this.vault.state === 'run') this.saveVault(); // levels survive even a closed game
    }
  }

  // put a legacy token on an item (from the scene); returns the item or null
  useToken(id) {
    const r = applyToken(this.forgeCtx(), id);
    if (!r.ok) return null;
    this.saveVault();
    this.events.emit('tokenApplied', { item: r.item });
    return r.item;
  }

  closeTokenScene() { this.tokenScene = false; this.saveVault(); }

  // ---- save slot, forge and the family line ----
  attachVault(vault) {
    this.vault = vault;
    if (this.config.medals) {
      backfillMedals(vault, this.config.medals);
      checkTrophies(vault, this.config.medals, { roster: bossRoster(this.config.dungeon, this.config.enemies) }); // older families: what they already reached
    }
    this.loadout = Loadout.fromJSON(vault.equipped, this.config.items);
    this.refreshBonus();
    this.resetHealth();
  }

  forgeCtx() { return { cfg: this.config.items, loadout: this.loadout, pocket: this.loot.pocket, vault: this.vault }; }

  saveVault() {
    this.vault.equipped = this.loadout.toJSON();
    if (this.vault.state === 'rest') this.vault.run = this.snapshotRun();
    if (this.vault.state === 'run') this.vault.runStats = JSON.parse(JSON.stringify(this.stats));
    if (this.forge && this.forge.start) this.vault.carry = this.loot.pocket.slice();
    this.events.emit('vaultChanged', { vault: this.vault });
  }

  // after any forge action: stats, hp and the save follow the new gear
  forgeChanged() {
    const before = { ...this.gearSets };
    this.refreshBonus();
    this.applyMaxHp(true);
    for (const [id, n] of Object.entries(this.gearSets)) {
      const total = Object.keys(this.config.items.sets[id].pieces).length;
      if (n >= total && (before[id] || 0) < total) this.events.emit('setComplete', { id, name: this.config.items.sets[id].name });
    }
    this.saveVault();
  }

  // between runs (heir screen): no practice enemies, nothing moving
  enterLimbo() {
    this.mode = 'dungeon';
    this.enemies.autoSpawn = false;
    this.resetRun();
    this.dungeon.reset();
  }

  // any gear to manage before setting out (worn, stashed or set aside)
  hasGear() { return this.loadout.items().length > 0 || this.vault.stash.length > 0 || this.vault.carry.length > 0; }

  // start a run: through the start forge when there is gear to manage, else straight to floor 1
  beginRun() {
    if (this.hasGear()) { this.openStartForge(); return true; }
    this.openStartForge({ silent: true });
    this.departForge();
    return false;
  }

  // the forge before floor 1 (new hero or a new run)
  openStartForge({ silent = false } = {}) {
    this.mode = 'dungeon';
    this.enemies.autoSpawn = false;
    this.resetRun();
    this.dungeon.reset();
    this.loot.pocket.push(...this.vault.carry);
    this.forge = { start: true };
    this.vault.state = 'idle';
    this.vault.run = null;
    this.saveVault();
    if (!silent) this.events.emit('forgeOpen', { start: true, floor: 0 });
  }

  // the forge after a boss / floor 15 (called by Dungeon): the run is saved whole while resting here
  openForge() {
    this.forge = { start: false };
    this.combat.reset();
    this.hazards.clear();
    this.vault.state = 'rest';
    this.saveVault();
    this.events.emit('forgeOpen', { start: false, floor: this.dungeon.floor });
  }

  departForge() {
    const start = this.forge && this.forge.start;
    this.forge = null;
    this.vault.state = 'run';
    this.vault.run = null;
    if (start) {
      const pocket = this.loot.pocket.slice(); // what was set aside at the start forge comes along
      this.vault.lastFloor = 1;
      this.vault.carry = [];
      this.saveVault();
      this.startRun(1);
      this.loot.pocket.push(...pocket);
    } else {
      this.vault.lastFloor = this.dungeon.floor + 1;
      this.saveVault();
      this.dungeon.leaveForge();
    }
  }

  snapshotRun() {
    const d = this.dungeon;
    return {
      floor: d.floor, startFloor: d.startFloor || 1, gold: d.gold, hp: this.player.hp,
      pocket: this.loot.pocket.slice(), relics: { owned: { ...this.relics.owned }, stats: { ...this.relics.stats } },
      stats: JSON.parse(JSON.stringify(this.stats)),
    };
  }

  // reopen a run saved while resting at a forge
  restoreRun(snap) {
    this.mode = 'dungeon';
    this.enemies.autoSpawn = false;
    this.resetRun();
    const d = this.dungeon;
    d.reset();
    d.floor = snap.floor; d.startFloor = snap.startFloor; d.gold = snap.gold;
    d.info = floorInfo(snap.floor, d.cfg);
    d.roomKind = 'forge'; d.state = 'forge'; d.fade = 1;
    this.loot.pocket.push(...snap.pocket);
    Object.assign(this.relics.owned, snap.relics.owned);
    Object.assign(this.relics.stats, snap.relics.stats);
    Object.assign(this.stats, snap.stats);
    this.refreshBonus();
    this.resetHealth();
    this.player.hp = Math.min(this.player.maxHp, snap.hp);
    this.forge = { start: false };
    this.events.emit('forgeOpen', { start: false, floor: snap.floor, resumed: true });
  }

  // the hero fell (or the run was cut short): keep what survives, pass the line to the heir
  endRunByDeath(floor = this.dungeon.floor) {
    const l = this.vault.lineage;
    const record = {
      given: l.given, family: l.family, generation: l.generation, sex: l.sex || null, level: this.vault.progress.level,
      floor: floor || this.vault.lastFloor || 1, kills: this.stats.kills, bestCombo: this.stats.bestCombo,
      medals: (this.stats.medals || []).slice(), bosses: JSON.parse(JSON.stringify(this.stats.bosses || {})),
      killer: this.stats.killer || null, at: Date.now(), essences: JSON.parse(JSON.stringify(this.stats.essences || {})),
    };
    const { survived, lost } = resolveDeath(this.forgeCtx(), this.rng, record);
    record.survived = survived.map((i) => i.name);
    record.lost = lost.length;
    const heir = succeed(this.vault, this.config.names, this.rng, record, this.config.progress.historyMax);
    this.vault.state = 'idle';
    this.vault.run = null;
    this.vault.lastFloor = 0;
    this.vault.carry = [];
    this.vault.runStats = null;
    // the new generation may reach a family milestone (counted from the records only)
    if (this.config.medals) {
      const got = checkTrophies(this.vault, this.config.medals, { roster: bossRoster(this.config.dungeon, this.config.enemies) }, record.floor);
      for (const tr of got) this.events.emit('trophy', { trophy: tr, heir: true });
      this.lastTrophies = got;
    }
    this.refreshBonus();
    this.saveVault();
    const trophies = this.lastTrophies || [];
    this.lastTrophies = null;
    return { record, heir, survived, lost, trophies };
  }

  // the bonus read by combat and skills at this moment (effects that depend on state adjust it)
  // combo multiplier: each combo step adds `step` (+ comboStep from cards/gear), counted up to `cap`
  // the multiplier rises one step every `every` combo, counted up to `cap`
  comboMult() {
    const c = this.config.combat.combo;
    if (!c) return 1;
    const steps = Math.floor(Math.min(this.effects.combo.count, c.cap) / (c.every || 1));
    return 1 + steps * (c.step + this.bonusStats.comboStep);
  }

  currentBonus() {
    const extra = abyssRingBonus(this), m = this.comboMult();
    if (extra <= 0 && m === 1) return this.bonusStats;
    // damage is (1 + damage) x combo multiplier
    return { ...this.bonusStats, damage: (1 + this.bonusStats.damage + extra) * m - 1 };
  }

  allocItemId() { return this.vault.allocId(); }

  healFlat(amount) {
    const p = this.player;
    p.hp = Math.min(p.maxHp, p.hp + amount);
  }

  // show treasure cards; the world pauses until chooseRelic(). ctx: { goldMult, floor, boss }
  offerRelics(ctx) {
    const offers = this.relics.roll(this.rng, ctx);
    if (!offers.length) return false;
    this.offer = { offers, ctx, rerolls: 0 };
    this.offer.cost = this.rerollCost();
    this.combat.cancel();
    this.events.emit('relicOffer', { offers, cost: this.offer.cost, gold: this.dungeon.gold });
    return true;
  }

  // every 10 family levels: a special-attack growth card (shown once the room is clear; the world waits)
  owedSkillPicks() { return owedPicks(this.config.skills.growth, this.vault.progress.level, this.vault.skillUps); }

  offerSkillGrowth() {
    const g = this.config.skills.growth;
    if (!g || this.mode !== 'dungeon' || this.over || this.offer || this.skillOffer || this.forge || this.tokenScene) return false;
    if (this.owedSkillPicks() <= 0) return false;
    const defs = this.config.skills.defs;
    const offers = rollSkillCards(g, this.rng).map((c) => ({
      id: c.id, skill: c.skill, kind: c.kind, value: c.add, icon: c.icon, name: defs[c.skill].name,
      rarity: 'epic', color: '#ffd166', tier: 0, owned: this.vault.skillUps[c.id] || 0, skillCard: true,
    }));
    this.skillOffer = { offers };
    this.combat.cancel();
    this.events.emit('skillOffer', { offers, level: this.vault.progress.level });
    return true;
  }

  chooseSkill(i) {
    const o = this.skillOffer && this.skillOffer.offers[i];
    if (!o) return null;
    this.vault.skillUps[o.id] = (this.vault.skillUps[o.id] || 0) + 1;
    this.skillOffer = null;
    this.refreshBonus();
    this.saveVault();
    this.pendingStroke = null;
    this.pendingFlick = null;
    this.combat.reset();
    this.events.emit('skillUp', { card: o });
    return o;
  }

  // price of drawing three new cards: grows with depth (gold multiplier) and with each redraw
  rerollCost() {
    const r = this.config.relics.reroll, o = this.offer;
    return Math.round(r.base * (o.ctx.goldMult || 1) * (1 + r.growth * o.rerolls));
  }

  rerollRelics() {
    const o = this.offer;
    if (!o || this.dungeon.gold < o.cost) return false;
    this.dungeon.gold -= o.cost;
    o.rerolls += 1;
    o.offers = this.relics.roll(this.rng, o.ctx);
    o.cost = this.rerollCost();
    this.events.emit('relicReroll', { offers: o.offers, cost: o.cost, gold: this.dungeon.gold });
    return true;
  }

  chooseRelic(i) {
    if (!this.offer) return null;
    const o = this.offer.offers[i];
    if (!o) return null;
    this.relics.take(o, this);
    if (o.essence) noteEssence(this.stats, o);
    this.refreshBonus();
    this.saveVault(); // an essence belongs to the family at once
    this.offer = null;
    this.pendingStroke = null;
    this.pendingFlick = null;
    this.combat.reset();
    this.events.emit('relicPick', { relic: o, pos: { x: this.player.pos.x, y: this.player.pos.y } });
    if (this.mode === 'dungeon' && this.dungeon.state === 'treasure') this.dungeon.advance(); // on to the next room
    return o;
  }

  resetHealth() {
    const c = this.config.combat.player;
    this.player.maxHp = c.maxHp + this.bonusStats.maxHp;
    this.player.hp = this.player.maxHp;
    this.player.invuln = 0;
    this.sinceHit = Infinity;
  }

  // returns true if the damage landed
  // in the air (점프) the hero cannot be touched — except by a riposte
  dashInvuln() { return !!this.skills.rush; }

  damagePlayer(amount, source, { riposte = false } = {}) {
    const p = this.player;
    if (this.over || p.invuln > 0 || amount <= 0) return false;
    if (this.mode === 'dungeon' && this.dungeon.state === 'fadeOut') return false; // already leaving
    if (!riposte && this.dashInvuln()) return false;
    if (evades(this)) { // 망령의 갑옷
      p.invuln = this.config.items.effects.wraithArmor.invuln;
      this.events.emit('evade', { pos: { x: p.pos.x, y: p.pos.y } });
      return false;
    }
    amount *= Math.max(0.2, 1 - this.bonusStats.armor);
    p.hp = Math.max(0, p.hp - amount);
    this.combat.interrupt(); // a blow taken mid dash/chain breaks the chain
    p.invuln = this.config.combat.player.hurtInvuln;
    this.sinceHit = 0;
    const from = source ? { x: source.pos.x, y: source.pos.y } : null;
    this.events.emit('playerHit', { damage: amount, pos: { x: p.pos.x, y: p.pos.y }, from, hp: p.hp, maxHp: p.maxHp });
    this.hitStop.trigger('normal');
    const shake = this.config.camera.shake.strong;
    if (shake) this.camera.addShake(shake);
    if (p.hp <= 0) {
      // who struck the last blow (area attacks in a boss room belong to the boss)
      const d = this.dungeon, boss = d && d.roomKind === 'boss' && d.boss ? d.boss : null;
      this.stats.killer = source && source.tcfg ? source.tcfg.name : boss ? boss.tcfg.name : null;
      this.die();
    }
    return true;
  }

  die() {
    this.over = true;
    this.combat.cancel();
    const run = this.mode === 'dungeon';
    const fate = run ? this.endRunByDeath() : null;
    this.events.emit('playerDown', { kills: this.stats.kills, bestCombo: this.stats.bestCombo, floor: run ? this.dungeon.floor : 0, startFloor: run ? this.dungeon.startFloor : 0, fate });
  }

  // pause menu "포기하기": a dungeon run counts as a death; the practice arena just restarts
  giveUp() {
    if (this.forge) return; // nothing to give up at a forge
    if (this.mode !== 'dungeon') { this.restart(); return; }
    if (this.over) return;
    this.player.hp = 0;
    this.die();
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
    Object.assign(this.stats, emptyRunStats());
    this.time = 0;
    this.over = false;
    this.offer = null;
    this.forge = null;
    this.tokenScene = false;
    this.tokenFloors = new Set();
    this.skillOffer = null;
    this.loot.reset();
    this.relics.reset();
    this.refreshBonus();
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
    if (this.offer || this.skillOffer || this.forge || this.tokenScene) return; // cards / forge / legacy token
    if (this.over) { this.effects.update(realDt, this.player, false); return; }
    const dt = this.hitStop.update(realDt);
    this.time += dt;
    this.player.savePrev();
    this.updateHealth(dt);
    // input that arrives during hit stop is applied once it ends
    if (!this.hitStop.active) this.applyPendingStroke();
    this.skills.update(dt);
    if (this.gearTick) this.gearTick(dt); // burning ash, allied wraiths
    if (this.skills.spinning) {
      this.movement.update(dt); // keep moving while the blade spins
    } else if (!this.skills.busy) {
      this.combat.update(dt);
      if (!this.combat.inCombat) this.movement.update(dt);
    }
    this.enemies.update(dt, this.player.pos, this.viewRect(), this.combat.inputDir, this.player.radius);
    this.hazards.update(dt, this.player);
    if (this.mode === 'dungeon') { this.dungeon.update(dt); this.loot.update(dt); }
    this.camera.update(dt, this.player);
    this.effects.update(realDt, this.player, this.combat.inCombat || this.skills.busy);
  }

  // world-space rectangle currently visible on screen
  viewRect() {
    const c = this.camera;
    return { x: c.pos.x - c.viewW / 2, y: c.pos.y - c.viewH / 2, w: c.viewW, h: c.viewH };
  }
}
