import { floorInfo, pickWeighted, randInt } from './floorPlan.js';
import { bossKey } from './Medals.js';
import { pickBoss, bossLevel } from './bossPick.js';
import { bossRoster } from './Medals.js';
import { buildRoom } from './RoomBuilder.js';
import { floorLabel } from '../core/floorLabel.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// One dungeon run: floors of rooms. Combat rooms spawn waves; clearing opens the exit; walking into
// the exit fades to the next room. Treasure rooms follow some floors; boss floors spawn a boss.
// Pure game logic (driven by Game.update), emits events for HUD / sound / music.
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
    this.floor = 0;
    this.gold = 0;
    this.room = null;
    this.roomKind = null;
    this.info = null;
    this.state = 'idle'; // fadeIn | play | fadeOut
    this.fade = 0;       // 0 = clear, 1 = black
    this.exit = { x: 0, y: 0, r: 0, open: false };
    this.chest = null;
    this.boss = null;
    this.waveIndex = 0;
    this.waveCount = 0;
    this.sinceKill = 0;
    this.lastAlive = 0;
  }

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
    const room = buildRoom(kind, c, g.rng);
    this.room = room;
    this.roomKind = kind;
    g.loadRoom(room);
    this.exit = { x: room.exit.x, y: room.exit.y, r: c.exitRadius, open: false, armIn: 0, armed: false };
    this.cleared = false;
    this.spikes = [];
    this.variant = null; // elite | trap on some combat floors
    this.exitIn = Infinity; // seconds until the exit appears after the room is won
    this.chest = null;
    this.boss = null;
    this.waveIndex = 0;
    this.waveCount = 0;
    this.sinceKill = 0;
    this.state = 'fadeIn';
    this.fade = 1;
    const info = this.info;
    let title = floorLabel(this.floor), music = info.music, bossName = null;
    if (kind === 'combat') {
      // from floor 5 on, some combat floors are an elite room or a trap room
      const v = c.variants;
      if (v && (info.base >= v.from || info.cycle > 0)) {
        const r = g.rng();
        this.variant = r < v.elite ? 'elite' : r < v.elite + v.trap ? 'trap' : null;
      }
      if (this.variant === 'trap') this.layTraps();
      this.waveCount = info.band.waves.count;
      this.spawnWave();
    } else if (kind === 'boss') {
      // one of this tier's bosses unlocked by the loop, at random (not the one met last time)
      const b = info.boss, types = g.config.enemies.types;
      const type = this.forceBoss || b.type || pickBoss(types, b.tier, info.cycle, g.rng, this.lastBoss[b.tier] || null);
      this.lastBoss[b.tier] = type;
      const tcfg = types[type];
      const level = bossLevel(b.tier || tcfg.tier, info.cycle, g.config.enemies);
      const pos = { x: room.center.x + room.arena.width * 0.18, y: room.center.y };
      this.boss = g.enemies.spawnAt(type, pos, { hp: info.mods.hp * b.hp, attack: info.mods.attack * b.attack, speed: info.mods.speed, level });
      if (b.patterns) this.boss.patterns = b.patterns.slice();
      bossName = tcfg.name;
      this.boss.bossInfo = { key: bossKey(type), name: tcfg.name, title: info.band.title }; // for the family's bestiary
      title = `${floorLabel(this.floor)} ${info.band.title} — ${bossName}`;
    } else if (kind === 'treasure') {
      this.chest = { x: room.center.x, y: room.center.y, r: c.chestRadius, opened: false, big: false };
      title = '보물방';
      music = 'rest';
    }
    this.lastAlive = this.remaining;
    g.events.emit('floorStart', { floor: this.floor, kind, music, title, boss: bossName, variant: this.variant, rush: this.rush ? { n: this.rush.i + 1, total: this.rush.list.length, loop: this.rush.loop } : null });
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

  spawnWave() {
    const g = this.game, c = this.cfg, band = this.info.band, rng = g.rng;
    this.waveIndex += 1;
    const room = Math.max(0, c.maxAlive - this.remaining);
    let n = Math.min(randInt(band.waves.size, rng), room);
    if (this.variant === 'elite') n = Math.max(2, Math.round(n * c.variants.eliteSize)); // fewer, all empowered
    while (n > 0) {
      const group = Math.min(n, randInt(c.spawn.groupSize, rng));
      const center = this.spawnPoint();
      for (let i = 0; i < group; i++) {
        const type = pickWeighted(band.mix, rng);
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
    const mult = 1 + c.rewards.goldPerFloor * (this.floor - 1);
    const gold = Math.round(randInt(c.rewards.clearGold, g.rng) * mult);
    this.gold += gold;
    if (bossPos) {
      const pos = g.arena.resolveCircle(bossPos, c.chestRadius + 10).pos;
      this.chest = { x: pos.x, y: pos.y, r: c.chestRadius * 1.3, opened: false, big: true };
    }
    if (this.variant === 'elite') g.loot.dropAt(bossPos || g.player.pos, { minGrade: c.variants.eliteDrop, count: 1 }); // the elite room's prize
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
        if (this.waveIndex < this.waveCount && alive <= this.info.band.waves.nextAt) this.spawnWave();
        else if (this.waveIndex >= this.waveCount && alive === 0) this.clear();
      } else if (this.roomKind === 'boss' && this.boss && !this.boss.targetable) {
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
    if (this.exit.armed && this.state === 'play' && dist(p.pos, this.exit) <= this.exit.r + p.radius) {
      this.state = 'fadeOut';
      g.events.emit('floorExit', { floor: this.floor });
    }
  }
}
