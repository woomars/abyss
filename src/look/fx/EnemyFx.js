// How a struck enemy looks for a moment: a white flash (look.enemies.hitFlash) and a nudge back along the
// blow that eases home (look.enemies.hitPush). Drawing only; the real knockback is the enemy's own velocity.
export class EnemyFx {
  constructor(look) {
    this.look = look; // config.look (live)
    this.map = new WeakMap(); // enemy -> { flash, push }
    this.live = new Set();    // states still counting down
  }

  get(enemy) { return this.map.get(enemy) || null; }

  state(enemy) {
    let s = this.map.get(enemy);
    if (!s) { s = { flash: 0, push: null }; this.map.set(enemy, s); }
    this.live.add(s);
    return s;
  }

  // h: a 'hit' event { enemy, dir, shield, untargetable }
  onHit(h) {
    const e = h.enemy;
    if (!e || typeof e !== 'object' || h.untargetable) return; // a hidden enemy is not struck: no flash, no nudge
    const s = this.state(e);
    if (h.shield) { s.flash = this.look.enemies.shieldFlash; return; } // a shieldbearer's front soaking a blow: a shorter flash and no nudge
    const le = this.look.enemies;
    s.flash = le.hitFlash != null ? le.hitFlash : 0.1;
    const hp = le.hitPush;
    if (hp && h.dir) s.push = { x: h.dir.x, y: h.dir.y, t: hp.time, max: hp.time, d: hp.distance };
  }

  update(dt) {
    for (const s of this.live) {
      if (s.flash > 0) s.flash -= dt;
      if (s.push && s.push.t > 0) s.push.t -= dt;
      if (!(s.flash > 0) && !(s.push && s.push.t > 0)) this.live.delete(s);
    }
  }

  clear() {
    this.live.clear();
    this.map = new WeakMap();
  }
}
