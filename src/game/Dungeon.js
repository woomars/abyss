import { floorInfo, pickWeighted, randInt } from './floorPlan.js';
import { bossKey } from './Medals.js';
import { pickBoss, pickPair, bossLevel } from './bossPick.js';
import { bossRoster } from './Medals.js';
import { buildRoom } from './RoomBuilder.js';
import { floorLabel } from '../core/floorLabel.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// One dungeon run: floors of rooms. Combat rooms spawn waves; clearing opens the exit; walking into
// the exit fades to the next room. Treasure rooms follow some floors; boss floors spawn a boss.
// Pure game logic (driven by Game.update), emits events for HUD / sound / music.
// combat-floor music: a track of n, not the one the last cycle had (prev may be null)
export function pickStageTrack(n, prev, rng) {
  if (n <= 1) return 0;
  if (prev == null) return Math.floor(rng() * n);
  const k = Math.floor(rng() * (n - 1));
  return k >= prev ? k + 1 : k;
}

export class Dungeon {
  constructor(cfg, game) {
    this.cfg = cfg; // config.dungeon (live)
    this.game = game;
    this.reset();
  }

  reset() {
    this.spikes = [];
    this.cleared = false;
    this.exitIn = Infinity;
    this.variant = null;
    this.rush = null; // debug boss rush: every boss in turn, full hp after each
    this.forceBoss = null;
    this.lastBoss = {}; // tier -> boss met last in this run (not twice in a row)
    this.cycleTypes = { cycle: -1, list: [] }; // attack types met in this 20-floor cycle (no type twice)
    this.waveTimes = [];  // average seconds to beat one wave, on the last few combat floors (timed waves, C5)
    this.interval = null; // seconds between timed waves on this floor (21층~); never longer than before
    this.lastInterval = null;
    this.stageTrack = null; // combat-floor music: one track per 20-floor cycle (music.playlists.stage)
    this.stageCycle = null;
    this.floor = 0;
    this.room = null;
    this.roomKind = null;
    this.info = null;
    this.state = 'idle'; // fadeIn | play | fadeOut
    this.fade = 0;       // 0 = clear, 1 = black
    this.exit = { x: 0, y: 0, r: 0, open: false };
    this.chest = null;
    this.warp = null;  // the rope's warp zone (10.4): { x, y, r, floors, armed }
    this.boss = null;
    this.bosses = [];
    this.waveIndex = 0;
    this.waveCount = 0;
    this.pending = 0;  // enemies of this wave still waiting for room (maxAlive)
    this.clock = 0;    // seconds played in this room
    this.waveAt = 0;   // when the current wave came
    this.waveDur = []; // how long each wave of this floor took
    this.sinceKill = 0;
    this.lastAlive = 0;
  }

  // gold is the family's purse (vault.gold): it stays through death, the forge and new lines
  get gold() { return this.game.vault ? this.game.vault.gold : 0; }
  set gold(v) { if (this.game.vault) this.game.vault.gold = Math.max(0, v); }

  start(floor) {
    this.reset();
    this.floor = floor;
    this.startFloor = floor; // runs started deeper (debug) do not count for the record
    this.info = floorInfo(floor, this.cfg);
    this.enterRoom(this.info.kind);
  }

  // enemies still to beat (a faded-out wraith counts even though it cannot be hit right now)
  get remaining() {
    let n = 0;
    for (const e of this.game.enemies.all()) if (e.alive && !e.dying) n++;
    return n;
  }

  // build a room, move the player there (behind the fade) and populate it
  enterRoom(kind) {
    const g = this.game, c = this.cfg;
    // what the run remembered when this floor began (a save made here goes back to it)
    this.entryMemory = { cycleTypes: JSON.parse(JSON.stringify(this.cycleTypes)), lastBoss: { ...this.lastBoss } };
    const room = buildRoom(kind, c, g.rng, this.roomScale(kind));
    this.room = room;
    this.roomKind = kind;
    g.loadRoom(room);
    this.exit = { x: room.exit.x, y: room.exit.y, r: c.exitRadius, open: false, armIn: 0, armed: false };
    this.cleared = false;
    this.spikes = [];
    this.variant = null; // elite | trap on some combat floors
    this.exitIn = Infinity; // seconds until the exit appears after the room is won
    this.chest = null;
    this.warp = null;
    this.boss = null;
    this.bosses = [];
    this.waveIndex = 0;
    this.waveCount = 0;
    this.pending = 0;
    this.clock = 0;
    this.waveAt = 0;
    this.waveDur = [];
    this.interval = null;
    this.sinceKill = 0;
    this.state = 'fadeIn';
    this.fade = 1;
    const info = this.info;
    this.setRope();
    let title = floorLabel(this.floor), music = info.music, bossName = null, bossNames = null;
    if (kind === 'combat') {
      // from floor 5 on, some combat floors are an elite room or a trap room
      const v = c.variants;
      if (v && (info.base >= v.from || info.cycle > 0)) {
        const r = g.rng();
        this.variant = r < v.elite ? 'elite' : r < v.elite + v.trap ? 'trap' : null;
      }
      if (this.variant === 'trap') this.layTraps();
      const w = c.waves;
      this.waveCount = info.band.waves.count + (w ? w.extraWavesPerCycle * info.cycle : 0); // one more wave each cycle (9.6)
      this.interval = this.timedInterval();
      this.spawnWave();
      const stage = g.config.music && g.config.music.playlists && g.config.music.playlists.stage;
      if (stage && stage.length) {
        if (this.stageTrack == null || this.stageCycle !== info.cycle) { this.stageTrack = pickStageTrack(stage.length, this.stageTrack, g.rng); this.stageCycle = info.cycle; }
        music = 'stage';
      }
    } else if (kind === 'boss') {
      // one of this tier's bosses unlocked by the loop, at random (not the one met last time)
      const b = info.boss, types = g.config.enemies.types;
      const fin = this.isFinal ? c.final : null; // floor 100: the founder, every time
      if (this.cycleTypes.cycle !== info.cycle) this.cycleTypes = { cycle: info.cycle, list: [], pairs: [] };
      let list;
      const forced = this.forceList; // a saved boss floor: the same bosses again
      this.forceList = null;
      if (forced) {
        list = forced.slice();
        if (list.length > 1) this.cycleTypes.pairs.push(list.map((k) => types[k].ai).sort().join('+'));
        else { this.lastBoss[b.tier] = list[0]; this.cycleTypes.list.push(types[list[0]].ai); }
      } else if (this.isDouble(kind)) { // floor 61 on: two bosses whose pair of types is new in this cycle (9.5)
        const pair = pickPair(types, b.tier, info.cycle, g.rng, this.cycleTypes.pairs);
        this.cycleTypes.pairs.push(pair[2]);
        list = [pair[0], pair[1]];
      } else {
        const type = fin ? fin.boss : this.forceBoss || b.type || pickBoss(types, b.tier, info.cycle, g.rng, this.lastBoss[b.tier] || null, this.cycleTypes.list);
        if (!fin) { this.lastBoss[b.tier] = type; this.cycleTypes.list.push(types[type].ai); }
        list = [type];
      }
      const k = fin ? { hp: fin.hp || 1, attack: fin.attack || 1 } : { hp: list.length > 1 ? c.doubleBoss.hp : 1, attack: 1 };
      list.forEach((type, i) => {
        const tcfg = types[type];
        const level = bossLevel(b.tier || tcfg.tier, info.cycle, g.config.enemies);
        const dy = list.length > 1 ? (i ? 1 : -1) * room.arena.height * 0.18 : 0;
        const pos = { x: room.center.x + room.arena.width * 0.18, y: room.center.y + dy };
        const boss = g.enemies.spawnAt(type, pos, { hp: info.mods.hp * b.hp * k.hp, attack: info.mods.attack * b.attack * k.attack, speed: info.mods.speed, level });
        if (b.patterns && !fin) boss.patterns = b.patterns.slice();
        if (fin) boss.founder = g.founderOf(); // who he is: the family's first knight (or the hero's own shadow)
        else boss.bossInfo = { key: bossKey(type), name: tcfg.name, title: info.band.title }; // for the family's bestiary
        this.bosses.push(boss);
      });
      this.boss = this.bosses[0];
      bossNames = list.map((type) => types[type].name);
      bossName = bossNames.join(' · ');
      title = `${floorLabel(this.floor)} ${info.band.title} — ${bossName}`;
    } else if (kind === 'treasure') {
      this.chest = { x: room.center.x, y: room.center.y, r: c.chestRadius, opened: false, big: false };
      title = '보물방';
      music = 'rest';
    }
    this.lastAlive = this.remaining;
    g.events.emit('floorStart', { floor: this.floor, kind, music, track: music === 'stage' ? this.stageTrack : null, title, boss: bossName, bosses: bossNames, final: kind === 'boss' && this.isFinal, founder: this.boss && this.boss.founder ? this.boss.founder : null, variant: this.variant, rush: this.rush ? { n: this.rush.i + 1, total: this.rush.list.length, loop: this.rush.loop } : null });
  }

  // ---- Ariadne's rope (10.4) ----
  // the first floor of every cycle (1, 21, 41, 61, 81); floor 1 is always one
  isRopeFloor(f) {
    const fin = this.cfg.final ? this.cfg.final.floor : Infinity;
    return f >= 1 && f < fin && (f - 1) % this.cfg.cycleLength === 0;
  }

  get ropeRun() { return !!this.game.vault && !this.rush && this.startFloor !== -1; }

  // first arrival on 21 / 41 / 61 / 81: the family's rope is set there
  setRope() {
    const v = this.game.vault;
    if (!this.ropeRun || this.floor <= 1 || !this.isRopeFloor(this.floor)) return;
    if (!v.ropes) v.ropes = [];
    if (v.ropes.includes(this.floor)) return;
    v.ropes.push(this.floor);
    v.ropes.sort((a, b) => a - b);
    this.game.events.emit('ropeSet', { floor: this.floor });
    if (v.state === 'run') this.game.saveVault();
  }

  // a rope floor won: when another rope floor is set, a warp zone in the room's corner leads there
  openWarp() {
    if (!this.ropeRun || !this.isRopeFloor(this.floor)) return;
    const floors = [...new Set([1, ...(this.game.vault.ropes || [])])].filter((f) => f !== this.floor).sort((a, b) => a - b);
    if (!floors.length) return;
    const g = this.game, r = this.cfg.exitRadius, a = g.arena;
    const at = a.resolveCircle({ x: Math.min(this.cfg.startInset, a.width / 4), y: Math.max(r * 2, a.height * 0.18) }, r).pos;
    this.warp = { x: at.x, y: at.y, r, floors, armed: true };
    g.events.emit('warpOpen', { pos: { x: at.x, y: at.y } });
  }

  // down (or up) the rope: the start of that floor; what lies between is passed by
  warpTo(floor) {
    this.waveTimes = []; // another part of the dungeon: the family's wave time until this run measures its own
    this.floor = floor;
    this.info = floorInfo(floor, this.cfg);
    this.enterRoom(this.info.kind);
  }

  // two bosses on this floor (61 on, not floor 100 or the debug rush)
  isDouble(kind) {
    const d = this.cfg.doubleBoss;
    const pinned = this.info && this.info.boss && this.info.boss.type; // a boss pinned on the band (tests, debug) comes alone
    return kind === 'boss' && !!d && !this.isFinal && !this.rush && !this.forceBoss && !pinned && this.floor >= d.fromFloor;
  }

  // every boss of the room has fallen; while one still stands it is the one on the bar
  bossesDown() {
    const up = (this.bosses.length ? this.bosses : [this.boss]).filter((b) => b.alive && !b.dying);
    if (up.length && up[0] !== this.boss) this.boss = up[0];
    return up.length === 0;
  }

  // floor 100 (dungeon.final): the founder's room
  get isFinal() { const f = this.cfg.final; return !!(f && this.floor === f.floor && !this.rush); }

  // floor 100 lost and the hero tries again: the founder's room from the start
  retryFinal() {
    const g = this.game;
    g.enemies.clear();
    g.hazards.clear();
    this.enterRoom('boss');
  }

  // ---- debug: every common enemy in one fight room (floor 5 strength; no waves after them) ----
  startAllEnemies() {
    const g = this.game, types = g.config.enemies.types;
    this.start(5);
    g.enemies.clear();
    for (const [k, t] of Object.entries(types)) {
      if (t.rank === 'boss' || k === 'sigil' || k === 'clone') continue;
      g.enemies.spawnAt(k, this.spawnPoint(), { ...this.info.mods });
    }
    this.waveIndex = this.waveCount;
    this.pending = 0;
    this.lastAlive = this.remaining;
  }

  // ---- debug: a fight with one chosen boss (on its tier's boss floor of the first cycle) ----
  startBossRoom(type) {
    const g = this.game, tier = g.config.enemies.types[type].tier;
    const band = this.cfg.bands.find((b) => b.kind === 'boss' && b.boss && b.boss.tier === tier);
    this.reset();
    this.floor = band.from;
    this.startFloor = -1; // never a record
    this.info = floorInfo(this.floor, this.cfg);
    this.forceBoss = type;
    this.enterRoom('boss');
    this.forceBoss = null;
  }

  // ---- debug: endless boss room ----
  // every boss in codex order (mid, region, great), then around again one loop deeper; the hero is
  // healed to full after each kill; no chest, exit or drops
  startBossRush() {
    const g = this.game;
    this.reset();
    this.rush = { list: bossRoster(this.cfg, g.config.enemies).map((b) => b.key), i: 0, loop: 0, wait: 0 };
    this.spawnRushBoss();
  }

  spawnRushBoss() {
    const g = this.game, r = this.rush;
    const type = r.list[r.i], tier = g.config.enemies.types[type].tier;
    const band = this.cfg.bands.find((b) => b.kind === 'boss' && b.boss && b.boss.tier === tier);
    this.floor = band.from + r.loop * this.cfg.cycleLength;
    this.startFloor = -1; // never a record
    this.info = floorInfo(this.floor, this.cfg);
    this.forceBoss = type;
    this.enterRoom('boss');
    this.forceBoss = null;
  }

  rushNext() {
    const g = this.game, r = this.rush;
    g.hazards.clear();
    g.player.hp = g.player.maxHp; // this room only: a kill restores all hp
    g.events.emit('bossRushHeal', { pos: { x: g.player.pos.x, y: g.player.pos.y }, n: r.i + 1 });
    r.i += 1;
    if (r.i >= r.list.length) { r.i = 0; r.loop += 1; }
    r.wait = 1.4;
    this.boss = null;
    this.bosses = [];
  }

  // spike tiles of a trap room: two groups rising in turn, away from the start
  layTraps() {
    const t = this.cfg.trap, g = this.game, a = g.arena, rng = g.rng, start = this.room.start;
    this.spikes = [];
    for (let tries = 0; tries < 200 && this.spikes.length < t.tiles; tries++) {
      const x = 60 + rng() * (a.width - 120 - t.size), y = 60 + rng() * (a.height - 120 - t.size);
      const c = { x: x + t.size / 2, y: y + t.size / 2 };
      if (Math.hypot(c.x - start.x, c.y - start.y) < 260) continue;
      if (a.resolveCircle(c, t.size * 0.75).hitWall) continue;
      if (this.spikes.some((s) => Math.abs(s.x - x) < t.size * 1.2 && Math.abs(s.y - y) < t.size * 1.2)) continue;
      this.spikes.push({ x, y, w: t.size, h: t.size, offset: (this.spikes.length % 2) * t.period / 2, phase: 'idle', clock: 0 });
    }
  }

  updateTraps(dt) {
    const t = this.cfg.trap, g = this.game;
    for (const s of this.spikes) {
      s.clock = (s.clock + dt) % t.period;
      const k = (s.clock + s.offset) % t.period;
      const phase = k < t.period - t.warn - t.up ? 'idle' : k < t.period - t.up ? 'warn' : 'up';
      if (phase === 'up' && s.phase !== 'up') { // the spikes rise: whoever stands there is hurt once
        const inside = (p, r) => p.x + r > s.x && p.x - r < s.x + s.w && p.y + r > s.y && p.y - r < s.y + s.h;
        if (inside(g.player.pos, g.player.radius * 0.6)) g.damagePlayer(t.damage * this.info.mods.attack, { pos: { x: s.x + s.w / 2, y: s.y + s.h / 2 } });
        for (const e of g.enemies.targetable()) {
          if (!inside(e.pos, e.radius * 0.6)) continue;
          const { killed } = e.takeHit({ damage: t.enemyDamage, knockDir: { x: 0, y: -1 }, knockback: 0, stagger: 0.2 });
          g.events.emit('hit', { enemy: e, damage: t.enemyDamage, crit: false, strong: false, chainIndex: 0, pos: { x: e.pos.x, y: e.pos.y }, dir: { x: 0, y: -1 }, skill: 'spikes' });
          if (killed) g.events.emit('kill', { enemy: e, pos: { x: e.pos.x, y: e.pos.y }, dir: { x: 0, y: -1 }, crit: false });
        }
        g.events.emit('spikes', { x: s.x + s.w / 2, y: s.y + s.h / 2 });
      }
      s.phase = phase;
    }
  }

  // next room after the exit: a treasure room after some floors, else the next floor
  advance() {
    if (this.roomKind !== 'treasure' && this.roomKind !== 'forge' && this.info.treasureAfter) { this.enterTreasure(); return; }
    if (this.roomKind !== 'forge' && (this.cfg.forgeAfter || []).includes(this.info.base)) { this.enterForge(); return; }
    this.floor += 1;
    this.info = floorInfo(this.floor, this.cfg);
    this.enterRoom(this.info.kind);
  }

  // the treasure room is a screen too: gold, then three cards at once; picking one moves on
  enterTreasure() {
    const c = this.cfg, g = this.game;
    this.roomKind = 'treasure';
    this.state = 'treasure';
    this.fade = 1;
    this.chest = null;
    this.exit.open = false;
    g.enemies.clear();
    g.hazards.clear();
    g.loot.clearGround();
    const mult = 1 + c.rewards.goldPerFloor * (this.floor - 1);
    const gold = Math.round(randInt(c.rewards.chestGold, g.rng) * mult);
    this.gold += gold;
    g.events.emit('floorStart', { floor: this.floor, kind: 'treasure', music: 'rest', title: '보물방', boss: null });
    g.events.emit('chestOpen', { pos: { x: 0, y: 0 }, gold, heal: 0, big: false });
    if (!g.offerRelics({ goldMult: mult, floor: this.floor, boss: false })) this.advance();
  }

  // the forge is a screen, not a room: the world stays dark behind it until the player leaves
  enterForge() {
    this.roomKind = 'forge';
    this.state = 'forge';
    this.fade = 1;
    this.chest = null;
    this.exit.open = false;
    this.game.openForge();
  }

  leaveForge() {
    this.floor += 1;
    this.info = floorInfo(this.floor, this.cfg);
    this.enterRoom(this.info.kind);
  }

  // the wave mix: the band's mobs, with each cycle's new mob taking its share (9.7, pressure.json mobs)
  mobMix() {
    const base = this.info.band.mix, m = this.cfg.mobs;
    const add = m ? m.added.filter((a) => a.cycle <= this.info.cycle) : [];
    const w = add.reduce((s, a) => s + a.weight, 0);
    if (!w) return base;
    const total = Object.values(base).reduce((a, b) => a + b, 0), out = {};
    for (const [k, v] of Object.entries(base)) out[k] = (v / total) * (1 - w);
    for (const a of add) out[a.type] = (out[a.type] || 0) + a.weight;
    return out;
  }

  // how many may be alive at once on this floor (grows each cycle, 9.6)
  get maxAlive() {
    const w = this.cfg.waves, cy = this.info ? this.info.cycle : 0;
    return w ? w.maxAlive[Math.min(cy, w.maxAlive.length - 1)] : this.cfg.maxAlive;
  }

  // the room grows smaller each cycle down to minScale (9.6); two bosses: that, then a little larger
  roomScale(kind) {
    const rs = this.cfg.roomShrink, cy = this.info ? this.info.cycle : 0;
    const shrink = rs && (kind === 'combat' || kind === 'boss') ? Math.max(rs.minScale, 1 - rs.shrinkPerCycle * cy) : 1;
    return shrink * (this.isDouble(kind) ? this.cfg.doubleBoss.roomScale : 1);
  }

  // timed waves (21층~, C5): the measured wave time x ratio (the last few combat floors), else the
  // family's value, else the fallback; never longer than the last interval. null below fromFloor.
  timedInterval() {
    const tw = this.cfg.timedWaves, v = this.game.vault;
    if (!tw || this.floor < tw.fromFloor) return null;
    const avg = this.waveTimes.length ? this.waveTimes.reduce((a, b) => a + b, 0) / this.waveTimes.length : null;
    let t = avg != null ? avg * tw.ratio : (v && v.waveInterval) || tw.fallbackSec;
    if (tw.neverLonger && this.lastInterval != null) t = Math.min(t, this.lastInterval);
    this.lastInterval = t;
    if (tw.saveToFamily && v) v.waveInterval = t;
    return t;
  }

  // the floor's waves are beaten: keep its average wave time (the last sampleFloors floors)
  recordWaves() {
    const tw = this.cfg.timedWaves;
    this.waveDur.push(this.clock - this.waveAt);
    if (!tw || this.variant) return;
    this.waveTimes.push(this.waveDur.reduce((a, b) => a + b, 0) / this.waveDur.length);
    if (this.waveTimes.length > tw.sampleFloors) this.waveTimes.shift();
  }

  spawnWave() {
    const g = this.game, c = this.cfg, band = this.info.band, rng = g.rng, mix = this.mobMix();
    if (this.waveIndex > 0) this.waveDur.push(this.clock - this.waveAt);
    this.waveIndex += 1;
    this.waveAt = this.clock;
    const w = c.waves, mult = w ? w.sizeMult[Math.min(this.info.cycle, w.sizeMult.length - 1)] : 1;
    let n = Math.round(randInt(band.waves.size, rng) * mult);
    if (this.variant === 'elite') n = Math.max(2, Math.round(n * c.variants.eliteSize)); // fewer, all empowered
    const now = Math.min(n, Math.max(0, this.maxAlive - this.remaining));
    this.pending += n - now; // the rest come when there is room
    this.spawnSome(now, mix);
  }

  spawnSome(n, mix = this.mobMix()) {
    const g = this.game, c = this.cfg, band = this.info.band, rng = g.rng;
    while (n > 0) {
      const group = Math.min(n, randInt(c.spawn.groupSize, rng));
      const center = this.spawnPoint();
      for (let i = 0; i < group; i++) {
        const type = pickWeighted(mix, rng);
        const mods = { ...this.info.mods };
        if (this.variant === 'elite' || (band.enhancedChance && rng() < band.enhancedChance)) {
          mods.hp *= c.enhanced.hp; mods.attack *= c.enhanced.attack; mods.size = c.enhanced.size; mods.enhanced = true; mods.riposte = !!c.enhanced.riposte;
        }
        const s = c.spawn.groupSpread;
        g.enemies.spawnAt(type, { x: center.x + (rng() * 2 - 1) * s, y: center.y + (rng() * 2 - 1) * s }, mods);
      }
      n -= group;
    }
  }

  // a free spot away from the player: first try just off-screen within maxDistance,
  // then anywhere off-screen, then anywhere far enough
  spawnPoint() {
    const g = this.game, c = this.cfg, a = g.arena, rng = g.rng, p = g.player.pos;
    const pad = c.spawn.edgePad, view = g.viewRect(), min = c.spawn.minDistance, max = c.spawn.maxDistance;
    const inView = (q) => q.x > view.x && q.x < view.x + view.w && q.y > view.y && q.y < view.y + view.h;
    let best = null, bestD = -1;
    for (let tries = 0; tries < 90; tries++) {
      let q;
      if (tries < 40) { // ring around the player
        const ang = rng() * Math.PI * 2, r = min + rng() * (max - min);
        q = { x: p.x + Math.cos(ang) * r, y: p.y + Math.sin(ang) * r };
        if (q.x < pad || q.y < pad || q.x > a.width - pad || q.y > a.height - pad) continue;
      } else {
        q = { x: pad + rng() * (a.width - 2 * pad), y: pad + rng() * (a.height - 2 * pad) };
      }
      if (a.resolveCircle(q, c.spawn.clearance).hitWall) continue;
      const d = dist(q, p);
      if (d >= min && (tries >= 70 || !inView(q))) return q;
      if (d > bestD) { best = q; bestD = d; }
    }
    return best || { x: a.width - pad, y: a.height / 2 };
  }

  openExit() {
    this.exit.open = true;
    this.exit.armIn = this.cfg.exitArmDelay;
    this.exit.armed = false;
    this.game.events.emit('exitOpen', { pos: { x: this.exit.x, y: this.exit.y } });
  }

  clear(bossPos = null) {
    const c = this.cfg, g = this.game;
    g.hazards.clear(); // nothing left in flight can hurt after the room is won
    this.openWarp();
    const mult = 1 + c.rewards.goldPerFloor * (this.floor - 1);
    const gold = Math.round(randInt(c.rewards.clearGold, g.rng) * mult);
    this.gold += gold;
    if (bossPos) {
      const pos = g.arena.resolveCircle(bossPos, c.chestRadius + 10).pos;
      this.chest = { x: pos.x, y: pos.y, r: c.chestRadius * 1.3, opened: false, big: true };
    }
    if (this.variant === 'elite') { const er = g.config.items.drops.eliteRoom; g.loot.dropAt(bossPos || g.player.pos, { minGrade: er.minGrade, count: er.count }); } // the elite room's prize
    this.spikes = []; // the traps fall silent
    g.events.emit('roomCleared', { floor: this.floor, kind: this.roomKind, gold, variant: this.variant });
    // the way down appears in the middle of the room a moment later (moved off a pillar if needed)
    this.cleared = true;
    const ctr = this.room ? this.room.center : { x: this.exit.x, y: this.exit.y };
    const at = g.arena.resolveCircle({ x: ctr.x, y: ctr.y }, c.exitRadius + 10).pos;
    this.exit.x = at.x; this.exit.y = at.y;
    this.exitIn = c.exitDelay != null ? c.exitDelay : 0;
    if (this.exitIn <= 0) this.openExit();
  }

  // boss chest: gold and a full heal; treasure-room chest: gold. Both then offer three treasure cards.
  openChest() {
    const c = this.cfg, g = this.game, ch = this.chest;
    ch.opened = true;
    const mult = 1 + c.rewards.goldPerFloor * (this.floor - 1);
    const gold = Math.round(randInt(ch.big ? c.rewards.bossChestGold : c.rewards.chestGold, g.rng) * mult);
    const heal = ch.big ? c.rewards.bossChestHeal : 0;
    this.gold += gold;
    if (heal) g.healPlayer(heal);
    g.events.emit('chestOpen', { pos: { x: ch.x, y: ch.y }, gold, heal, big: ch.big });
    if (!this.exit.open) this.openExit();
    g.offerRelics({ goldMult: mult, floor: this.floor, boss: ch.big });
  }

  // enemies left far away (stuck behind pillars, wandering) come back near the player
  // is the straight line between two points cut by a pillar
  blocked(a, b) {
    const arena = this.game.arena, n = Math.ceil(dist(a, b) / 20);
    for (let i = 1; i < n; i++) {
      const q = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
      if (arena.resolveCircle(q, 2).hitWall) return true;
    }
    return false;
  }

  bringBackStragglers() {
    const g = this.game, p = g.player.pos;
    for (const e of g.enemies.targetable()) {
      if (dist(e.pos, p) <= this.cfg.spawn.maxDistance + this.cfg.stragglerMargin && !this.blocked(e.pos, p)) continue;
      const q = this.spawnPoint();
      e.pos = { x: q.x, y: q.y };
      e.prevPos = { x: q.x, y: q.y };
    }
  }

  update(dt) {
    const c = this.cfg, g = this.game;
    if (this.state === 'idle' || !this.room) return; // between runs (limbo): nothing to run
    if (this.state === 'fadeIn') {
      this.fade = Math.max(0, this.fade - dt / c.fadeTime);
      if (this.fade === 0) this.state = 'play';
    } else if (this.state === 'forge' || this.state === 'treasure') {
      return;
    } else if (this.state === 'fadeOut') {
      this.fade = Math.min(1, this.fade + dt / c.fadeTime);
      if (this.fade === 1) this.advance();
      return;
    }
    if (this.rush && this.rush.wait > 0) { // between bosses
      this.rush.wait -= dt;
      if (this.rush.wait <= 0) this.spawnRushBoss();
      return;
    }
    const alive = this.remaining;
    if (this.cleared && !this.exit.open) {
      this.exitIn -= dt;
      if (this.exitIn <= 0) { this.exitIn = Infinity; this.openExit(); }
    }
    if (this.spikes.length && !this.cleared) this.updateTraps(dt);
    if (!this.exit.open && !this.cleared) {
      if (this.roomKind === 'combat') {
        this.clock += dt;
        if (this.pending > 0 && alive < this.maxAlive) { const k = Math.min(this.pending, this.maxAlive - alive); this.pending -= k; this.spawnSome(k); }
        const timed = this.interval != null && this.clock - this.waveAt >= this.interval; // 21층~: also on time
        if (this.waveIndex < this.waveCount && (this.remaining + this.pending <= this.info.band.waves.nextAt || timed)) this.spawnWave();
        else if (this.waveIndex >= this.waveCount && this.remaining === 0 && this.pending === 0) { this.recordWaves(); this.clear(); }
      } else if (this.roomKind === 'boss' && this.boss && this.bossesDown()) { // (a boss in the smoke is only hidden)
        // the boss falls: its minions fall with it
        const bp = this.boss.pos;
        for (const e of g.enemies.all()) {
          if (!e.alive || e.dying) continue;
          e.hidden = false;
          const dx = e.pos.x - bp.x, dy = e.pos.y - bp.y, l = Math.hypot(dx, dy) || 1;
          const dir = { x: dx / l, y: dy / l };
          e.takeHit({ damage: e.hp + 1, knockDir: dir, knockback: 0, stagger: 0 });
          g.events.emit('kill', { enemy: e, pos: { x: e.pos.x, y: e.pos.y }, dir, crit: false });
        }
        if (this.rush) { this.rushNext(); return; }
        if (this.isFinal) { // floor 100 won: no chest, no exit — the legacy token, then the ending
          g.hazards.clear();
          this.cleared = true;
          g.finalVictory();
          return;
        }
        this.clear(this.boss.pos);
      }
      // stuck guard: no kill for a while -> bring far enemies back
      const now = this.remaining;
      if (now < this.lastAlive) this.sinceKill = 0;
      else this.sinceKill += dt;
      this.lastAlive = now;
      if (now > 0 && this.sinceKill >= c.stuckTime) { this.bringBackStragglers(); this.sinceKill = 0; }
    }
    const p = g.player;
    this.exit.r = c.exitRadius;
    if (this.chest) this.chest.r = c.chestRadius * (this.chest.big ? 1.3 : 1);
    if (this.exit.open && !this.exit.armed) {
      this.exit.armIn -= dt;
      const outside = dist(p.pos, this.exit) > this.exit.r + p.radius;
      if (this.exit.armIn <= 0 && outside) this.exit.armed = true;
    }
    if (this.chest && !this.chest.opened && dist(p.pos, this.chest) <= this.chest.r + p.radius) this.openChest();
    if (this.warp && this.state === 'play' && !g.ropeOffer) { // the rope: step in for the list, step out to use it again
      const inWarp = dist(p.pos, this.warp) <= this.warp.r + p.radius;
      if (inWarp && this.warp.armed) { this.warp.armed = false; g.openRope(this.warp.floors); } else if (!inWarp) this.warp.armed = true;
    }
    if (this.exit.armed && this.state === 'play' && dist(p.pos, this.exit) <= this.exit.r + p.radius) {
      this.state = 'fadeOut';
      g.events.emit('floorExit', { floor: this.floor });
    }
  }
}
