import { EffectManager } from './EffectManager.js';
import { HpTrail } from './HpTrail.js';
import { Shake } from './Shake.js';
import { EnemyFx } from './EnemyFx.js';

// Everything the screen shows that the rules never read: effects, hp bar trails, screen shake, struck
// enemies' flash and nudge, the red flash of a blow taken. Built by main.js beside the Game; it listens to
// the game's events and reads its state, and never changes it.
export class Fx {
  constructor(config, events, rng, game) {
    this.config = config; // full config (live)
    this.game = game;
    this.effects = new EffectManager(config, events, rng);
    // the white bars behind the red hp bars (player, boss); look.hud.hpBar is read live
    const bar = () => config.look.hud.hpBar;
    const barCfg = { get trailDelay() { return bar().trailDelay; }, get trailSpeed() { return bar().trailSpeed; } };
    this.hpTrail = new HpTrail(barCfg);
    this.hpTrail.reset(game.player.hp);
    this.bossTrail = new HpTrail(barCfg);
    this.bossTrailOf = null;
    this.shake = new Shake(config.look, rng);
    this.enemies = new EnemyFx(config.look);
    this.hurtFlash = 0;    // seconds left of the knight's red glow after a blow taken
    this.hurtVignette = 0; // seconds left of the red screen edge after a blow taken
    this.time = game.time; // the game clock last seen (shake and enemy nudges run on game time, held by hit stop)

    const shakeCfg = () => config.look.camera.shake;
    events.on('hit', (h) => {
      const s = shakeCfg()[h.crit ? 'crit' : h.strong ? 'strong' : 'normal'];
      if (s) this.shake.add(s);
      this.enemies.onHit(h);
    });
    events.on('enemyHurt', (h) => this.enemies.onHit(h));
    events.on('playerHit', () => {
      const c = this.effects.hitCfg;
      this.hurtFlash = c.flash;
      this.hurtVignette = c.vignette;
      if (c.shake) this.shake.add(c.shake);
    });
    events.on('bossEnrage', () => this.shake.add(shakeCfg().crit));
    events.on('jumpLand', () => this.shake.add(shakeCfg().strong)); // the landing thuds
    events.on('roomReset', () => this.clear());
    events.on('runReset', () => this.clear());
  }

  // a new room or run: effects in the air are gone
  clear() {
    this.effects.clear();
    this.enemies.clear();
  }

  updateTrails(dt) {
    const g = this.game, p = g.player;
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.hpTrail.update(p.hp, p.maxHp, dt);
    const b = g.mode === 'dungeon' ? g.dungeon.boss : null;
    if (b !== this.bossTrailOf) { this.bossTrailOf = b; if (b) this.bossTrail.reset(b.hp); }
    if (b) this.bossTrail.update(b.hp, b.maxHp, dt);
  }

  // realDt: the frame step; called after game.update with the same step
  update(realDt) {
    const g = this.game, p = g.player;
    if (g.waiting) return; // the world waits (pause, cards, forge ...): so does everything on screen
    const dt = Math.max(0, g.time - this.time);
    this.time = g.time;
    if (this.hurtVignette > 0) this.hurtVignette = Math.max(0, this.hurtVignette - realDt);
    if (g.over) { this.hpTrail.reset(p.hp); this.effects.update(realDt, p, false); return; } // dead: both bars empty at once
    if (g.founderDeath) { this.effects.update(realDt, p, false); return; }
    this.updateTrails(realDt);
    this.shake.update(dt);
    this.enemies.update(dt);
    this.effects.update(realDt, p, g.combat.inCombat || g.skills.busy);
  }
}
