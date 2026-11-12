import { floorInfo, pickWeighted, randInt } from './floorPlan.js';
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
      this.waveCount = info.band.waves.count;
      this.spawnWave();
    } else if (kind === 'boss') {
      const b = info.boss;
      const tcfg = g.config.enemies.types[b.type];
      const pos = { x: room.center.x + room.arena.width * 0.18, y: room.center.y };
      this.boss = g.enemies.spawnAt(b.type, pos, { hp: info.mods.hp * b.hp, attack: info.mods.attack * b.attack, speed: info.mods.speed });
      this.boss.patterns = b.patterns.slice();
      bossName = tcfg.name;
      title = `${floorLabel(this.floor)} ${info.band.title} — ${bossName}`;
    } else if (kind === 'treasure') {
      this.chest = { x: room.center.x, y: room.center.y, r: c.chestRadius, opened: false, big: false };
      title = '보물방';
      music = 'rest';
    }
    this.lastAlive = this.remaining;
    g.events.emit('floorStart', { floor: this.floor, kind, music, title, boss: bossName });
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
    while (n > 0) {
      const group = Math.min(n, randInt(c.spawn.groupSize, rng));
      const center = this.spawnPoint();
      for (let i = 0; i < group; i++) {
        const type = pickWeighted(band.mix, rng);
        const mods = { ...this.info.mods };
        if (band.enhancedChance && rng() < band.enhancedChance) {
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
    g.events.emit('roomCleared', { floor: this.floor, kind: this.roomKind, gold });
    this.openExit();
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
    const alive = this.remaining;
    if (!this.exit.open) {
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
