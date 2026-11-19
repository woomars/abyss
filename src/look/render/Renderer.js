import { BUILD } from '../../core/version.js';
import { drawLoot, drawRoomObjects, drawArena } from './drawArena.js';
import { drawFounderDeath } from './drawBoss.js';
import { drawEnemies } from './drawEnemies.js';
import { drawAfterimages, drawWinds, drawSlashes, drawRings, drawParticles, drawLinks, drawNumbers } from './drawFx.js';
import { drawTelegraphs, drawHazards } from './drawHazards.js';
import { drawScreen, drawOverheadHp } from './drawHud.js';
import { drawSpin, jumpLift, drawRoll, drawGear, drawPointer, drawAim, drawProjectiles, drawHurtFlash, drawPlayer } from './drawPlayer.js';

const lerpPos = (prev, pos, a) => ({ x: prev.x + (pos.x - prev.x) * a, y: prev.y + (pos.y - prev.y) * a });

export class Renderer {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.config = config;
    this.cssW = 1; this.cssH = 1; this.dpr = 1;
    this.cam = { x: 0, y: 0 };
  }
  // an enemy's colour and shape (config.look.enemies)
  lookOf(e) { return this.config.look.enemies.types[e.type] || {}; }
  // floor, wall, pillar and hero colours (config.look.render.colors)
  get colors() { return this.config.look.render.colors; }

  resize(cssW, cssH, dpr) {
    const d = Math.min(dpr, this.config.look.camera.maxDpr);
    this.cssW = cssW; this.cssH = cssH; this.dpr = d;
    this.canvas.width = Math.round(cssW * d);
    this.canvas.height = Math.round(cssH * d);
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
  }
  get scale() { return this.cssH / this.config.camera.viewHeight; }
  // visible world size in world units
  get viewWorld() { return { w: this.cssW / this.scale, h: this.config.camera.viewHeight }; }

  // the followed spot, plus the screen shake on top (look/fx/Shake)
  cameraPos(game, alpha) {
    if (!game.camera) return lerpPos(game.player.prevPos, game.player.pos, alpha);
    const c = lerpPos(game.camera.prevPos, game.camera.pos, alpha), o = this.fx.shake.at(alpha);
    return { x: c.x + o.x, y: c.y + o.y };
  }

  worldToScreen(p) {
    const s = this.scale;
    return { x: (p.x - this.cam.x) * s + this.cssW / 2, y: (p.y - this.cam.y) * s + this.cssH / 2 };
  }

  // fx: the Fx beside the game (effects, shake, hp trails, struck enemies)
  render(game, fx, alpha) {
    this.fx = fx;
    const ctx = this.ctx;
    const s = this.scale;
    const cam = this.cameraPos(game, alpha);
    this.cam = cam;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.colors.bg;
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    // world transform
    ctx.setTransform(this.dpr * s, 0, 0, this.dpr * s, this.dpr * (this.cssW / 2 - cam.x * s), this.dpr * (this.cssH / 2 - cam.y * s));
    drawArena(this, game.arena, cam);
    this.drawWorld(game, alpha);

    // screen overlay
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawScreen(this, game, alpha);
    ctx.fillStyle = this.colors.text;
    ctx.font = '10px monospace';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText(`build ${BUILD}`, 6, this.cssH - 4);
  }

  // hook points extended by later tasks
  drawWorld(game, alpha) {
    const fx = this.fx.effects;
    if (game.mode === 'dungeon') { drawRoomObjects(this, game.dungeon); drawLoot(this, game); }
    drawHazards(this, game.hazards);
    drawGear(this, game);
    drawLinks(this, fx);
    drawEnemies(this, game, alpha);
    if (game.founderDeath) drawFounderDeath(this, game);
    drawTelegraphs(this, game, alpha);
    drawAfterimages(this, fx, game.player);
    drawWinds(this, fx);
    drawRoll(this, game, alpha);
    drawPlayer(this, game.player, alpha, jumpLift(this, game.skills));
    drawHurtFlash(this, game, alpha);
    drawOverheadHp(this, game, alpha);
    drawSpin(this, game.skills, game.player, alpha);
    drawAim(this, game.skills, game.player, alpha);
    drawPointer(this, game, alpha);
    drawSlashes(this, fx);
    drawProjectiles(this, game.skills);
    drawRings(this, fx);
    drawParticles(this, fx);
    drawNumbers(this, fx);
  }

  isVisible(pos, r) {
    const v = this.viewWorld, c = this.cam;
    return Math.abs(pos.x - c.x) < v.w / 2 + r && Math.abs(pos.y - c.y) < v.h / 2 + r;
  }
  // shared with the draw* files
  lerpPos(prev, pos, a) { return lerpPos(prev, pos, a); }
}

export { lerpPos };
