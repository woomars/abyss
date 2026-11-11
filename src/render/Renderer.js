import { BUILD } from '../version.js';

export const COLORS = {
  bg: '#07070b', floor: '#0e0e15', grid: '#1a1a26', wall: '#2a2236', pillar: '#241d30', pillarEdge: '#3b2f4f',
  player: '#e8e3d6', playerEdge: '#c9a86a', text: '#6b6680',
};

const lerpPos = (prev, pos, a) => ({ x: prev.x + (pos.x - prev.x) * a, y: prev.y + (pos.y - prev.y) * a });

export class Renderer {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.config = config;
    this.cssW = 1; this.cssH = 1; this.dpr = 1;
    this.cam = { x: 0, y: 0 };
  }
  resize(cssW, cssH, dpr) {
    const d = Math.min(dpr, this.config.camera.maxDpr);
    this.cssW = cssW; this.cssH = cssH; this.dpr = d;
    this.canvas.width = Math.round(cssW * d);
    this.canvas.height = Math.round(cssH * d);
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
  }
  get scale() { return this.cssH / this.config.camera.viewHeight; }
  // visible world size in world units
  get viewWorld() { return { w: this.cssW / this.scale, h: this.config.camera.viewHeight }; }

  cameraPos(game, alpha) {
    if (game.camera) return game.camera.renderPos;
    return lerpPos(game.player.prevPos, game.player.pos, alpha);
  }

  worldToScreen(p) {
    const s = this.scale;
    return { x: (p.x - this.cam.x) * s + this.cssW / 2, y: (p.y - this.cam.y) * s + this.cssH / 2 };
  }

  render(game, alpha) {
    const ctx = this.ctx;
    const s = this.scale;
    const cam = this.cameraPos(game, alpha);
    this.cam = cam;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    // world transform
    ctx.setTransform(this.dpr * s, 0, 0, this.dpr * s, this.dpr * (this.cssW / 2 - cam.x * s), this.dpr * (this.cssH / 2 - cam.y * s));
    this.drawArena(game.arena, cam);
    this.drawWorld(game, alpha);

    // screen overlay
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawScreen(game, alpha);
    ctx.fillStyle = COLORS.text;
    ctx.font = '10px monospace';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText(`build ${BUILD}`, 6, this.cssH - 4);
  }

  // hook points extended by later tasks
  drawWorld(game, alpha) {
    this.drawPlayer(game.player, alpha);
  }
  drawScreen() {}

  isVisible(pos, r) {
    const v = this.viewWorld, c = this.cam;
    return Math.abs(pos.x - c.x) < v.w / 2 + r && Math.abs(pos.y - c.y) < v.h / 2 + r;
  }

  drawArena(arena, cam) {
    const ctx = this.ctx;
    const v = this.viewWorld;
    ctx.fillStyle = COLORS.wall;
    ctx.fillRect(cam.x - v.w, cam.y - v.h, v.w * 2, v.h * 2);
    ctx.fillStyle = COLORS.floor;
    ctx.fillRect(0, 0, arena.width, arena.height);
    // grid gives a sense of motion
    const g = 80;
    const x0 = Math.max(0, Math.floor((cam.x - v.w / 2) / g) * g), x1 = Math.min(arena.width, cam.x + v.w / 2);
    const y0 = Math.max(0, Math.floor((cam.y - v.h / 2) / g) * g), y1 = Math.min(arena.height, cam.y + v.h / 2);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += g) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    for (let y = y0; y <= y1; y += g) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    ctx.stroke();
    for (const p of arena.pillars) {
      if (!this.isVisible({ x: p.x + p.w / 2, y: p.y + p.h / 2 }, Math.max(p.w, p.h))) continue;
      ctx.fillStyle = COLORS.pillar;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = COLORS.pillarEdge;
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
    }
  }

  drawPlayer(p, alpha) {
    const ctx = this.ctx;
    const { x, y } = lerpPos(p.prevPos, p.pos, alpha);
    const r = p.radius;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.visualAngle);
    ctx.beginPath();
    ctx.moveTo(r * 1.3, 0);
    ctx.lineTo(-r * 0.9, r * 0.85);
    ctx.lineTo(-r * 0.5, 0);
    ctx.lineTo(-r * 0.9, -r * 0.85);
    ctx.closePath();
    ctx.fillStyle = COLORS.player;
    ctx.fill();
    ctx.strokeStyle = COLORS.playerEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

export { lerpPos };
