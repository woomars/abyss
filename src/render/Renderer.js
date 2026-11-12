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
    if (game.camera) return lerpPos(game.camera.prevRenderPos || game.camera.renderPos, game.camera.renderPos, alpha);
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
    const fx = game.effects;
    if (game.mode === 'dungeon') this.drawRoomObjects(game.dungeon);
    this.drawHazards(game.hazards);
    this.drawLinks(fx);
    this.drawEnemies(game, alpha);
    this.drawAfterimages(fx, game.player);
    this.drawWinds(fx);
    this.drawPlayer(game.player, alpha);
    this.drawSpin(game.skills, game.player, alpha);
    this.drawAim(game.skills, game.player, alpha);
    this.drawSlashes(fx);
    this.drawProjectiles(game.skills);
    this.drawRings(fx);
    this.drawParticles(fx);
    this.drawNumbers(fx);
  }

  drawAfterimages(fx, player) {
    const ctx = this.ctx;
    const r = player.radius;
    const n = fx.afterimages.length;
    for (let i = 0; i < n; i++) {
      const a = fx.afterimages[i];
      const k = (i + 1) / (n + 1) * Math.max(0, 1 - a.age / 0.12);
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.angle);
      ctx.globalAlpha = 0.35 * k;
      ctx.fillStyle = '#c9a86a';
      ctx.beginPath();
      ctx.moveTo(r * 1.3, 0); ctx.lineTo(-r * 0.9, r * 0.85); ctx.lineTo(-r * 0.5, 0); ctx.lineTo(-r * 0.9, -r * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawWinds(fx) {
    const ctx = this.ctx;
    ctx.lineCap = 'round';
    fx.winds.forEachActive((w) => {
      const k = w.life / w.max;
      const back = w.angle + Math.PI;
      ctx.strokeStyle = `rgba(220,220,235,${0.5 * k})`;
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        const off = i * 10;
        const px = w.x + Math.cos(w.angle + Math.PI / 2) * off, py = w.y + Math.sin(w.angle + Math.PI / 2) * off;
        const len = 30 + 25 * (1 - k);
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(back) * 12, py + Math.sin(back) * 12);
        ctx.lineTo(px + Math.cos(back) * len, py + Math.sin(back) * len);
        ctx.stroke();
      }
    });
  }

  // Fan slash drawn as a swinging blade (like the spin skill): the blade sweeps across the arc
  // during the first part of the effect, leaving a fading trail, then the trail fades out.
  drawSlashes(fx) {
    const ctx = this.ctx;
    const SWING = 0.55; // fraction of the effect spent swinging
    fx.slashes.forEachActive((s) => {
      const t = 1 - s.life / s.max; // 0 → 1
      const swing = Math.min(1, t / SWING);
      const fade = t <= SWING ? 1 : Math.max(0, 1 - (t - SWING) / (1 - SWING));
      const half = s.arc / 2;
      // in local space the arc spans [-half, +half]; sweep=+1 swings clockwise (from -half to +half)
      const from = -half * s.sweep;
      const cur = from + s.arc * swing * s.sweep;
      const r = s.radius;
      const trailLen = Math.min(s.arc * swing, 1.4);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      // fading trail sectors behind the blade
      const steps = 5;
      for (let i = 0; i < steps; i++) {
        const a0 = cur - s.sweep * trailLen * (i + 1) / steps;
        const a1 = cur - s.sweep * trailLen * i / steps;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, Math.min(a0, a1), Math.max(a0, a1));
        ctx.closePath();
        const base = s.strong ? 'rgba(255,214,150,' : 'rgba(240,235,220,';
        ctx.fillStyle = `${base}${(s.strong ? 0.4 : 0.28) * (1 - i / steps) * fade})`;
        ctx.fill();
      }
      // bright edge along the swept part
      ctx.beginPath();
      ctx.arc(0, 0, r, Math.min(from, cur), Math.max(from, cur));
      ctx.strokeStyle = s.strong ? `rgba(255,210,138,${0.9 * fade})` : `rgba(255,255,255,${0.75 * fade})`;
      ctx.lineWidth = s.strong ? 4 : 3;
      ctx.stroke();
      // the blade itself while swinging
      if (swing < 1 || fade > 0.6) {
        ctx.beginPath();
        ctx.moveTo(Math.cos(cur) * 14, Math.sin(cur) * 14);
        ctx.lineTo(Math.cos(cur) * r, Math.sin(cur) * r);
        ctx.strokeStyle = s.strong ? `rgba(255,210,138,${fade})` : `rgba(255,248,230,${fade})`;
        ctx.lineWidth = s.strong ? 6 : 4;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      ctx.restore();
    });
    ctx.globalAlpha = 1;
  }

  // spinning blade: bright edge at the current angle with a fading trail behind it (clockwise)
  drawSpin(skills, player, alpha) {
    const s = skills.spin;
    if (!s) return;
    const ctx = this.ctx;
    const { x, y } = lerpPos(player.prevPos, player.pos, alpha);
    const r = s.def.radius;
    const a = s.start + s.swept;
    const trail = Math.min(1.4, s.swept);
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const a0 = a - trail * (i + 1) / steps, a1 = a - trail * i / steps;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, r, a0, a1);
      ctx.closePath();
      ctx.fillStyle = `rgba(255,214,150,${0.32 * (1 - i / steps)})`;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, r, a - trail, a);
    ctx.strokeStyle = 'rgba(255,240,210,0.9)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.strokeStyle = s.pause > 0 ? '#ffffff' : '#ffd28a';
    ctx.lineWidth = s.pause > 0 ? 7 : 5;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // directional skill aim preview: dashed line + arrowhead from the player
  drawAim(skills, player, alpha) {
    const a = skills.aim;
    if (!a) return;
    const def = skills.cfg.defs[skills.cfg.slots[a.slot]];
    const len = Math.hypot(a.dir.x, a.dir.y) || 1;
    const ux = a.dir.x / len, uy = a.dir.y / len;
    const reach = def.distance || def.range || 300;
    const { x, y } = lerpPos(player.prevPos, player.pos, alpha);
    const ex = x + ux * reach, ey = y + uy * reach;
    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([14, 10]);
    ctx.strokeStyle = 'rgba(159,216,255,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + ux * 20, y + uy * 20);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    const ang = Math.atan2(uy, ux);
    ctx.translate(ex, ey);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(10, 0); ctx.lineTo(-12, 10); ctx.lineTo(-12, -10);
    ctx.closePath();
    ctx.fillStyle = 'rgba(159,216,255,0.9)';
    ctx.fill();
    ctx.restore();
  }

  // blade wave: glowing crescent flying forward
  drawProjectiles(skills) {
    const ctx = this.ctx;
    for (const p of skills.projectiles) {
      const w = p.def.width;
      const k = 1 - p.traveled / p.def.range;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(p.dir.y, p.dir.x));
      ctx.globalAlpha = 0.4 + 0.6 * k;
      ctx.beginPath();
      ctx.arc(-w * 0.35, 0, w * 0.6, -1.1, 1.1);
      ctx.arc(-w * 0.6, 0, w * 0.6, 1.0, -1.0, true);
      ctx.closePath();
      ctx.fillStyle = '#9fd8ff';
      ctx.shadowColor = '#6cc4ff';
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawRings(fx) {
    const ctx = this.ctx;
    fx.rings.forEachActive((r) => {
      const k = r.life / r.max;
      ctx.globalAlpha = k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 4 * k + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - k), 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  drawParticles(fx) {
    const ctx = this.ctx;
    fx.particles.forEachActive((p) => {
      if (!this.isVisible(p, 10)) return;
      ctx.globalAlpha = Math.max(0, p.life / p.max) * (p.a0 == null ? 1 : p.a0);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    });
    ctx.globalAlpha = 1;
  }

  drawLinks(fx) {
    const ctx = this.ctx;
    ctx.lineCap = 'round';
    fx.links.forEachActive((l) => {
      const k = l.life / l.max;
      ctx.strokeStyle = `rgba(150,200,255,${0.7 * k})`;
      ctx.lineWidth = 2 + 4 * k;
      ctx.beginPath();
      ctx.moveTo(l.x0, l.y0);
      ctx.lineTo(l.x1, l.y1);
      ctx.stroke();
    });
  }

  drawNumbers(fx) {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fx.numbers.forEachActive((n) => {
      const k = n.life / n.max;
      const pop = n.crit ? 1 + 0.6 * Math.max(0, (k - 0.75) / 0.25) : 1;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = `bold ${Math.round((n.crit ? 26 : 17) * pop)}px system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000000';
      ctx.strokeText(String(n.value), n.x, n.y);
      ctx.fillStyle = n.hurt ? '#ff4a4a' : n.crit ? '#ffb347' : '#f4f0e6';
      ctx.fillText(String(n.value), n.x, n.y);
    });
    ctx.globalAlpha = 1;
  }

  drawEnemies(game, alpha) {
    const ctx = this.ctx, mgr = game.enemies, pp = game.player.pos;
    for (const e of mgr.all()) {
      const r = e.radius;
      if (!this.isVisible(e.pos, r * 3)) continue;
      const { x, y } = lerpPos(e.prevPos, e.pos, alpha);
      let size = r * 1.6;
      let a = e.fade == null ? 1 : e.fade;
      if (e.dying) {
        const k = Math.max(0, e.deathTimer / e.root.deathTime);
        a *= k;
        size *= 0.6 + 0.4 * k;
      }
      if (a <= 0.01) continue;
      const wob = e.staggerTime > 0 && !e.dying ? Math.sin(e.staggerTime * 60) * 2 : 0;
      const fill = e.flashTime > 0 ? '#ffffff' : e.strikeTime > 0 ? '#ff3b30' : e.tcfg.color;
      ctx.globalAlpha = a;
      if (e.mods.enhanced && !e.dying) { // enhanced: golden aura
        ctx.beginPath();
        ctx.arc(x, y, r * 1.45, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,200,90,0.16)';
        ctx.fill();
      }
      const ai = e.tcfg.ai;
      ctx.fillStyle = fill;
      ctx.lineWidth = e.isElite || e.mods.enhanced ? 3 : 2;
      ctx.strokeStyle = e.mods.enhanced ? '#ffcf5a' : e.isElite ? '#e0a050' : '#2b2e36';
      if (ai === 'archer') {
        const ang = Math.atan2(pp.y - y, pp.x - x);
        ctx.save();
        ctx.translate(x + wob, y);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(r * 1.1, 0);
        ctx.lineTo(-r * 0.8, r * 0.9);
        ctx.lineTo(-r * 0.8, -r * 0.9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else if (ai === 'wraith') {
        ctx.globalAlpha = a * 0.85;
        ctx.beginPath();
        ctx.arc(x + wob, y, r, Math.PI, 0);
        ctx.lineTo(x + r + wob, y + r * 0.9);
        for (let i = 3; i >= 0; i--) ctx.lineTo(x + wob - r + (2 * r * i) / 3, y + r * (i % 2 ? 0.5 : 0.95));
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = e.mods.enhanced ? '#ffcf5a' : '#cdb8ff';
        ctx.stroke();
      } else if (e.isBoss) {
        this.drawBossBody(e, x + wob, y, fill);
      } else {
        ctx.fillRect(x - size / 2 + wob, y - size / 2, size, size);
        ctx.strokeRect(x - size / 2 + wob, y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      // archer aim line: thin while tracking, bright once locked
      if (ai === 'archer' && e.ai.aim > 0 && !e.dying) {
        const k = 1 - e.ai.aim / e.tcfg.windup, locked = e.ai.aim <= e.tcfg.windup * 0.4;
        ctx.strokeStyle = locked ? 'rgba(255,80,60,0.85)' : `rgba(255,140,90,${0.25 + 0.35 * k})`;
        ctx.lineWidth = locked ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + e.ai.aimDir.x * 320, y + e.ai.aimDir.y * 320);
        ctx.stroke();
      }
      // counterattack telegraph: reach circle that fills in as the strike approaches
      if (e.windupTime > 0 && !e.dying) {
        const reach = r + (e.tcfg.attackRange || 0) + 16;
        const k = 1 - e.windupTime / (e.tcfg.attackWindup || 0.2);
        ctx.beginPath();
        ctx.arc(x, y, reach, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,70,60,0.55)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, reach * k, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,60,50,${0.12 + 0.18 * k})`;
        ctx.fill();
      }
      if ((e.isElite || e.mods.enhanced) && !e.isBoss && !e.dying && e.hp < e.maxHp) {
        const w = r * 2.2, h = 5;
        ctx.fillStyle = '#20141a';
        ctx.fillRect(x - w / 2, y - size / 2 - 12, w, h);
        ctx.fillStyle = e.mods.enhanced ? '#e6b84a' : '#d0453f';
        ctx.fillRect(x - w / 2, y - size / 2 - 12, w * (e.hp / e.maxHp), h);
      }
    }
  }

  // boss: heavy octagon body with horns; glows red when enraged
  drawBossBody(e, x, y, fill) {
    const ctx = this.ctx, r = e.radius;
    if (e.ai && e.ai.enraged) {
      const pulse = 0.25 + Math.sin(performance.now() / 120) * 0.1;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,50,30,${pulse})`;
      ctx.fill();
    }
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = '#ffcf5a';
    ctx.lineWidth = 4;
    ctx.stroke();
    // horns
    ctx.fillStyle = '#e8dcc0';
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + sgn * r * 0.45, y - r * 0.8);
      ctx.lineTo(x + sgn * r * 0.95, y - r * 1.45);
      ctx.lineTo(x + sgn * r * 0.75, y - r * 0.7);
      ctx.closePath();
      ctx.fill();
    }
    // eyes
    ctx.fillStyle = e.ai && e.ai.enraged ? '#ff4030' : '#ffd060';
    ctx.fillRect(x - r * 0.42, y - r * 0.2, r * 0.25, r * 0.12);
    ctx.fillRect(x + r * 0.17, y - r * 0.2, r * 0.25, r * 0.12);
  }

  // telegraphs and arrows (drawn on the floor, under the enemies)
  drawHazards(hz) {
    const ctx = this.ctx;
    for (const h of hz.list) {
      if (!this.isVisible(h, (h.radius || h.maxRadius || 20) + 20)) continue;
      if (h.kind === 'arrow') {
        ctx.strokeStyle = '#f2e3c0';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(h.x - h.dir.x * 20, h.y - h.dir.y * 20);
        ctx.lineTo(h.x, h.y);
        ctx.stroke();
        ctx.fillStyle = '#ff6a50';
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.radius * 0.8, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const k = Math.min(1, h.t / h.delay);
      const flash = h.kind !== 'ring' && h.done;
      ctx.save();
      ctx.translate(h.x, h.y);
      if (h.kind === 'circle' || h.kind === 'cone') {
        const path = () => {
          ctx.beginPath();
          if (h.kind === 'circle') ctx.arc(0, 0, h.radius, 0, Math.PI * 2);
          else {
            const a0 = Math.atan2(h.dir.y, h.dir.x), half = (h.arcDeg * Math.PI / 180) / 2;
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, h.radius, a0 - half, a0 + half);
            ctx.closePath();
          }
        };
        path();
        ctx.fillStyle = flash ? 'rgba(255,120,80,0.55)' : 'rgba(255,50,40,0.10)';
        ctx.fill();
        ctx.strokeStyle = flash ? 'rgba(255,200,150,0.9)' : 'rgba(255,70,60,0.7)';
        ctx.lineWidth = 2;
        ctx.stroke();
        if (!flash) { // fill grows from the center toward the edge as the hit approaches
          ctx.save();
          ctx.scale(k, k);
          path();
          ctx.fillStyle = `rgba(255,60,50,${0.12 + 0.2 * k})`;
          ctx.fill();
          ctx.restore();
        }
      } else if (h.kind === 'ring') {
        if (h.t < h.delay) {
          ctx.setLineDash([10, 10]);
          ctx.strokeStyle = `rgba(255,90,60,${0.25 + 0.3 * k})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, h.maxRadius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = `rgba(255,60,40,${0.2 + 0.3 * k})`;
          ctx.beginPath();
          ctx.arc(0, 0, 30 + 30 * k, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.strokeStyle = 'rgba(255,120,70,0.75)';
          ctx.lineWidth = h.thickness;
          ctx.beginPath();
          ctx.arc(0, 0, Math.max(1, h.r), 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255,230,190,0.9)';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  drawScreen(game) {
    this.drawTrail(game);
    this.drawCombo(game.effects.combo);
    if (game.mode === 'dungeon') {
      this.drawExitArrow(game.dungeon);
      const f = game.dungeon.fade;
      if (f > 0) {
        this.ctx.fillStyle = `rgba(0,0,0,${f})`;
        this.ctx.fillRect(0, 0, this.cssW, this.cssH);
      }
    }
  }

  // exit portal (dim ring while closed, glowing swirl once open) and treasure chest
  drawRoomObjects(d) {
    const ctx = this.ctx, t = performance.now() / 1000;
    const ex = d.exit;
    if (ex.r > 0 && this.isVisible(ex, ex.r * 2)) {
      ctx.save();
      ctx.translate(ex.x, ex.y);
      if (ex.open) {
        const pulse = 1 + Math.sin(t * 4) * 0.06;
        const g = ctx.createRadialGradient(0, 0, 4, 0, 0, ex.r * 1.6 * pulse);
        g.addColorStop(0, 'rgba(255,240,200,0.95)');
        g.addColorStop(0.35, 'rgba(201,168,106,0.65)');
        g.addColorStop(1, 'rgba(120,60,200,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, ex.r * 1.6 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.rotate(t * 1.8);
        ctx.strokeStyle = 'rgba(255,230,170,0.85)';
        ctx.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(0, 0, ex.r * (0.55 + i * 0.22), i * 2.1, i * 2.1 + 2.2);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = 'rgba(120,100,150,0.45)';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, ex.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
    const ch = d.chest;
    if (ch && this.isVisible(ch, ch.r * 2)) {
      const w = ch.r * 1.8, h = ch.r * 1.3;
      ctx.save();
      ctx.translate(ch.x, ch.y);
      if (!ch.opened) {
        const glow = 0.35 + Math.sin(t * 3) * 0.15;
        ctx.fillStyle = `rgba(255,210,120,${glow})`;
        ctx.beginPath();
        ctx.arc(0, 0, ch.r * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = ch.big ? '#7a4a1c' : '#5e3b1a';
      ctx.fillRect(-w / 2, -h / 2 + 4, w, h - 4);
      ctx.strokeStyle = ch.big ? '#ffd76a' : '#d8a64a';
      ctx.lineWidth = 3;
      ctx.strokeRect(-w / 2, -h / 2 + 4, w, h - 4);
      // lid: closed on top, or tipped back when opened
      ctx.fillStyle = ch.big ? '#8f5a24' : '#6e4520';
      if (ch.opened) ctx.fillRect(-w / 2, -h / 2 - 10, w, 8);
      else ctx.fillRect(-w / 2, -h / 2 - 2, w, 10);
      ctx.strokeRect(-w / 2, ch.opened ? -h / 2 - 10 : -h / 2 - 2, w, ch.opened ? 8 : 10);
      ctx.restore();
    }
  }

  // arrow at the screen edge pointing to an open exit that is off-screen
  drawExitArrow(d) {
    const ex = d.exit;
    if (!ex.open || d.state !== 'play') return;
    const s = this.worldToScreen(ex);
    const m = 34;
    if (s.x > m && s.x < this.cssW - m && s.y > m && s.y < this.cssH - m) return;
    const cx = this.cssW / 2, cy = this.cssH / 2;
    const ang = Math.atan2(s.y - cy, s.x - cx);
    // clamp onto the screen rectangle inset by m
    const kx = (this.cssW / 2 - m) / Math.max(1e-6, Math.abs(Math.cos(ang)));
    const ky = (this.cssH / 2 - m) / Math.max(1e-6, Math.abs(Math.sin(ang)));
    const k = Math.min(kx, ky);
    const x = cx + Math.cos(ang) * k, y = cy + Math.sin(ang) * k;
    const ctx = this.ctx, pulse = 1 + Math.sin(performance.now() / 150) * 0.12;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.scale(pulse, pulse);
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, 11);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-10, -11);
    ctx.closePath();
    ctx.fillStyle = '#ffd98a';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  drawCombo(combo) {
    if (combo.count < 2) return;
    const ctx = this.ctx;
    const k = Math.min(1, combo.timer / 0.5);
    ctx.globalAlpha = k;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000';
    const x = this.cssW - 24, y = Math.max(70, this.cssH * 0.26);
    ctx.strokeText(String(combo.count), x, y);
    ctx.fillStyle = '#ffd28a';
    ctx.fillText(String(combo.count), x, y);
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = '#c9a86a';
    ctx.fillText('COMBO', x, y + 26);
    ctx.globalAlpha = 1;
  }

  // fading finger trail (screen space) — feedback that the stroke registered
  drawTrail(game) {
    const life = this.config.feedback.trailLife;
    const now = performance.now() / 1000;
    const pts = game.strokes.trail(now, life);
    if (pts.length < 2) return;
    const ctx = this.ctx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const k = Math.max(0, 1 - (now - b.t) / life);
      ctx.strokeStyle = `rgba(201,168,106,${0.55 * k})`;
      ctx.lineWidth = 2 + 6 * k;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

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
    const blink = p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0;
    ctx.fillStyle = blink ? '#ff6a5c' : COLORS.player;
    ctx.fill();
    ctx.strokeStyle = COLORS.playerEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

export { lerpPos };
