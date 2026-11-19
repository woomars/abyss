import { t, tr, fullName } from '../../i18n/index.js';

export function drawScreen(rd, game) {
  const fx = rd.fx;
  drawHurtVignette(rd, fx);
  drawTrail(rd, game);
  drawCombo(rd, game.combo, game.comboMult());
  if (game.mode === 'dungeon') {
    const bt = fx.bossTrailOf === game.dungeon.boss ? fx.bossTrail : null;
    const d = game.dungeon, bars = d.bosses && d.bosses.length > 1 ? d.bosses.filter((b) => b.alive) : [d.boss];
    bars.forEach((b, i) => drawBossBar(rd, b, b === d.boss && bt ? bt.trail : null, b === d.boss && bt ? bt.red : null, i * 34));
    drawExitArrow(rd, game.dungeon);
    const f = game.dungeon.fade;
    if (f > 0) {
      rd.ctx.fillStyle = `rgba(0,0,0,${f})`;
      rd.ctx.fillRect(0, 0, rd.cssW, rd.cssH);
    }
  }
}

// the hero's own hp over the head: white trail behind, red in front (look.hud.overhead)
export function drawOverheadHp(rd, game, alpha) {
  const p = game.player;
  if (!p || game.over || !(p.maxHp > 0)) return;
  const o = (rd.config.look.hud && rd.config.look.hud.overhead) || { width: 44, height: 5, offsetY: 34 };
  const { x, y } = rd.lerpPos(p.prevPos || p.pos, p.pos, alpha);
  const ctx = rd.ctx, w = o.width, h = o.height, left = x - w / 2, top = y - o.offsetY - h / 2;
  const ht = rd.fx.hpTrail, k = Math.max(0, Math.min(p.hp, ht ? ht.red : p.hp) / p.maxHp), kt = Math.max(p.hp / p.maxHp, (ht ? ht.trail : p.hp) / p.maxHp);
  ctx.fillStyle = 'rgba(20,8,10,0.8)';
  ctx.fillRect(left - 1, top - 1, w + 2, h + 2);
  ctx.fillStyle = '#f2ece4';
  ctx.fillRect(left, top, w * Math.min(1, kt), h);
  ctx.fillStyle = '#d0352a';
  ctx.fillRect(left, top, w * k, h);
}

// a blow taken: the screen edge flashes red, fading out (look.hud.playerHit)
export function drawHurtVignette(rd, fx) {
  if (!(fx.hurtVignette > 0)) return;
  const c = fx.effects.hitCfg, k = Math.min(1, fx.hurtVignette / (c.vignette || 0.3));
  const ctx = rd.ctx, w = rd.cssW, h = rd.cssH;
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.55);
  g.addColorStop(0, 'rgba(255,0,0,0)');
  g.addColorStop(1, `rgba(220,20,20,${(c.vignetteAlpha || 0.45) * k})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export function drawBossBar(rd, boss, trail = null, red = null, dy = 0) {
  if (!boss || !boss.alive) return;
  const ctx = rd.ctx;
  const w = Math.min(420, rd.cssW * 0.42), h = 10;
  const x = (rd.cssW - w) / 2, y = 58 + dy;
  const k = Math.max(0, (red != null ? Math.min(boss.hp, red) : boss.hp) / boss.maxHp);
  const enraged = boss.ai && boss.ai.enraged;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillStyle = enraged ? '#ff7a60' : '#f0dfae';
  const f = boss.founder, name = f ? t(f.shadow ? 'final.shadowName' : 'final.bossName', { name: fullName(f.family, f.given) }) : tr(boss.tcfg.name);
  ctx.fillText(name + (enraged ? t('boss.enraged') : ''), rd.cssW / 2, y - 3);
  ctx.fillStyle = '#1a0d10';
  ctx.fillRect(x, y, w, h);
  if (trail != null) { ctx.fillStyle = '#f2ece4'; ctx.fillRect(x, y, w * Math.min(1, Math.max(boss.hp, trail) / boss.maxHp), h); }
  ctx.fillStyle = enraged ? '#ff3b2a' : '#c0392b';
  ctx.fillRect(x, y, w * k, h);
  ctx.strokeStyle = '#c9a86a';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  // the quest: what the boss hides behind, or the opening
  const s = boss.ai || {}, q = s.quest !== undefined ? s.quest : boss.tcfg.quest; // the founder's quest changes by phase
  if (q) {
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    if (s.qphase === 'exposed') { ctx.fillStyle = '#ffe08a'; ctx.fillText(t('boss.exposed'), rd.cssW / 2, y + h + 4); }
    else if (q === 'guard' && boss.guard > 0) {
      ctx.fillStyle = '#20242c'; ctx.fillRect(x, y + h + 2, w, 5);
      ctx.fillStyle = '#d8c070'; ctx.fillRect(x, y + h + 2, w * (boss.guard / boss.guardMax), 5);
      ctx.fillStyle = '#e8d9a8'; ctx.fillText(t('boss.guard'), rd.cssW / 2, y + h + 9);
    } else if (boss.immune) { ctx.fillStyle = '#9fd8ff'; ctx.fillText(t(q === 'minions' ? 'boss.immuneMinions' : q === 'clones' ? 'boss.immuneClones' : 'boss.immuneSigils'), rd.cssW / 2, y + h + 4); }
    else if (q === 'backWeak') { ctx.fillStyle = '#a8c8e8'; ctx.fillText(t('boss.backWeak'), rd.cssW / 2, y + h + 4); }
    ctx.textBaseline = 'bottom';
  }
  // enrage threshold tick
  const at = boss.tcfg.enrageAt;
  if (at) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(x + w * at - 1, y, 2, h);
  }
}

// arrow at the screen edge pointing to an open exit that is off-screen
export function drawExitArrow(rd, d) {
  const ex = d.exit;
  if (!ex.open || d.state !== 'play') return;
  const s = rd.worldToScreen(ex);
  const m = 34;
  if (s.x > m && s.x < rd.cssW - m && s.y > m && s.y < rd.cssH - m) return;
  const cx = rd.cssW / 2, cy = rd.cssH / 2;
  const ang = Math.atan2(s.y - cy, s.x - cx);
  // clamp onto the screen rectangle inset by m
  const kx = (rd.cssW / 2 - m) / Math.max(1e-6, Math.abs(Math.cos(ang)));
  const ky = (rd.cssH / 2 - m) / Math.max(1e-6, Math.abs(Math.sin(ang)));
  const k = Math.min(kx, ky);
  const x = cx + Math.cos(ang) * k, y = cy + Math.sin(ang) * k;
  const ctx = rd.ctx, pulse = 1 + Math.sin(performance.now() / 150) * 0.12;
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

export function drawCombo(rd, combo, mult = 1) {
  if (combo.count < 2) return;
  const ctx = rd.ctx;
  const k = Math.min(1, combo.timer / 0.5);
  ctx.globalAlpha = k;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#000';
  const x = rd.cssW - 24, y = Math.max(70, rd.cssH * 0.26);
  ctx.strokeText(String(combo.count), x, y);
  ctx.fillStyle = '#ffd28a';
  ctx.fillText(String(combo.count), x, y);
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillStyle = '#c9a86a';
  ctx.fillText('COMBO', x, y + 26);
  // the damage multiplier the combo gives, brighter as it grows (shown once it starts to count)
  if (mult <= 1) { ctx.globalAlpha = 1; return; }
  const heat = Math.min(1, (mult - 1) / 1.5);
  ctx.font = `bold ${Math.round(18 + heat * 8)}px system-ui, sans-serif`;
  ctx.lineWidth = 4;
  ctx.strokeText(`X${mult.toFixed(2)}`, x, y + 52);
  ctx.fillStyle = `rgb(255,${Math.round(210 - heat * 130)},${Math.round(120 - heat * 90)})`;
  ctx.fillText(`X${mult.toFixed(2)}`, x, y + 52);
  ctx.globalAlpha = 1;
}

// fading finger trail (screen space) — feedback that the stroke registered
export function drawTrail(rd, game) {
  const life = rd.config.look.feedback.trailLife;
  const now = performance.now() / 1000;
  const pts = game.strokes.trail(now, life);
  if (pts.length < 2) return;
  const ctx = rd.ctx;
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
