// Equipment on the floor: rolls drops on kills, keeps dropped items on the ground, pulls them into
// the player when close (a short flight), and holds this run's pocket. Pure game logic.
import { rollDrop } from './items/ItemFactory.js';

const ease = (k) => 1 - (1 - k) * (1 - k);

export class Loot {
  constructor(cfg, game) {
    this.cfg = cfg; // config.items (live)
    this.game = game;
    this.reset();
  }

  reset() {
    this.ground = []; // { item, x, y, t, fly: null | { t, x0, y0 } }
    this.pocket = [];
    this.warned = false;
  }

  clearGround() { this.ground.length = 0; this.warned = false; }

  flying() { let n = 0; for (const g of this.ground) if (g.fly) n++; return n; }
  hasRoom() { return this.pocket.length + this.flying() < this.cfg.pocketSize; }

  onKill(enemy) {
    const g = this.game;
    if (g.mode !== 'dungeon' || !enemy || enemy.mods.minion) return;
    const d = this.cfg.drops;
    if (enemy.isBoss) { this.dropAt(enemy.pos, { boss: true, minGrade: d.boss.minGrade, count: d.boss.count, bossName: enemy.tcfg.name }); return; }
    const kind = enemy.mods.enhanced ? 'enhanced' : enemy.isElite ? 'elite' : 'normal';
    if (g.rng() < d.chance[kind]) this.dropAt(enemy.pos);
  }

  // place new drops around pos; returns the items
  dropAt(pos, { boss = false, minGrade = null, count = 1, item = null, bossName = null } = {}) {
    const g = this.game, out = [];
    const floor = Math.max(1, g.dungeon.floor || 1);
    for (let i = 0; i < count; i++) {
      const it = item || rollDrop(this.cfg, g.rng, { id: g.allocItemId(), floor, boss, minGrade });
      if (!it.origin) it.origin = { floor, boss: bossName }; // remembered for heirloom stories
      const s = this.cfg.pickup.scatter, a = g.rng() * Math.PI * 2;
      const q = g.arena.resolveCircle({ x: pos.x + Math.cos(a) * s * (count > 1 ? 1 : 0.4), y: pos.y + Math.sin(a) * s * (count > 1 ? 1 : 0.4) }, 10).pos;
      this.ground.push({ item: it, x: q.x, y: q.y, t: 0, fly: null });
      g.events.emit('lootDrop', { item: it, pos: { x: q.x, y: q.y } });
      out.push(it);
    }
    return out;
  }

  startFly(gi) {
    if (!this.hasRoom()) {
      if (!this.warned) { this.warned = true; this.game.events.emit('pocketFull', {}); }
      return false;
    }
    gi.fly = { t: 0, x0: gi.x, y0: gi.y };
    return true;
  }

  // the room is won: everything left on the floor flies to the player
  magnet() { for (const gi of this.ground) if (!gi.fly) this.startFly(gi); }

  update(dt) {
    const p = this.game.player, c = this.cfg.pickup;
    for (let i = this.ground.length - 1; i >= 0; i--) {
      const gi = this.ground[i];
      gi.t += dt;
      if (gi.fly) {
        gi.fly.t += dt;
        const k = Math.min(1, gi.fly.t / c.flyTime), e = ease(k);
        gi.x = gi.fly.x0 + (p.pos.x - gi.fly.x0) * e;
        gi.y = gi.fly.y0 + (p.pos.y - gi.fly.y0) * e;
        if (k >= 1) {
          this.ground.splice(i, 1);
          this.pocket.push(gi.item);
          this.warned = false;
          this.game.events.emit('lootPickup', { item: gi.item, pos: { x: p.pos.x, y: p.pos.y } });
        }
      } else if (Math.hypot(p.pos.x - gi.x, p.pos.y - gi.y) <= c.radius + p.radius) {
        this.startFly(gi);
      }
    }
  }
}
