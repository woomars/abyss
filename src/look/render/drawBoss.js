import { tr } from '../../i18n/index.js';

// boss: heavy octagon body with horns; glows red when enraged
export function drawBossBody(rd, e, x, y, fill) {
  if (e.hidden) { // in the smoke (assassin): only a faint puff where it was
    const ctx = rd.ctx;
    ctx.beginPath();
    ctx.arc(x, y, e.radius * 1.1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(40,30,50,0.25)';
    ctx.fill();
    return;
  }
  const ctx = rd.ctx, r = e.radius;
  if (e.ai && e.ai.enraged) {
    const pulse = 0.25 + Math.sin(performance.now() / 120) * 0.1;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,50,30,${pulse})`;
    ctx.fill();
  }
  if (e.immune || e.guard > 0) { // untouchable (blue) or guarded (gold)
    ctx.beginPath();
    ctx.arc(x, y, r * 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = e.immune ? `rgba(140,200,255,${0.6 + Math.sin(performance.now() / 140) * 0.25})` : `rgba(230,200,110,${0.35 + 0.5 * (e.guard / (e.guardMax || 1))})`;
    ctx.lineWidth = e.immune ? 5 : 4;
    ctx.stroke();
  }
  if (e.shieldOn) { // summoner shield while minions live
    ctx.beginPath();
    ctx.arc(x, y, r * 1.35, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(150,200,255,${0.55 + Math.sin(performance.now() / 150) * 0.2})`;
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  const shape = rd.lookOf(e).shape || 'horned';
  if (e.front && e.ai) { // a guarded front (golem): a stone shield arc where it looks
    const half = (e.front.arc * Math.PI) / 360, rr = e.radius;
    ctx.strokeStyle = 'rgba(160,200,235,0.85)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(x, y, rr * 1.2, e.ai.face - half, e.ai.face + half); ctx.stroke();
  }
  if (shape === 'knight') { drawFounder(rd, e, x, y); return; }
  ctx.beginPath();
  if (shape === 'robed') { // mage: tall robe with a hood point
    ctx.moveTo(x, y - r * 1.25); ctx.lineTo(x + r * 0.95, y + r); ctx.lineTo(x - r * 0.95, y + r); ctx.closePath();
  } else if (shape === 'hooded') { // ranged: round cloak
    ctx.arc(x, y, r * 0.95, 0, Math.PI * 2);
  } else if (shape === 'golem') { // golem: a block of stone
    ctx.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8);
  } else if (shape === 'cloaked') { // assassin: a narrow hooded diamond
    ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r * 0.8, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.8, y); ctx.closePath();
  } else { // warrior / summoner: armoured octagon
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = '#ffcf5a';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#e8dcc0';
  if (shape === 'horned') { // horns
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + sgn * r * 0.45, y - r * 0.8);
      ctx.lineTo(x + sgn * r * 0.95, y - r * 1.45);
      ctx.lineTo(x + sgn * r * 0.75, y - r * 0.7);
      ctx.closePath();
      ctx.fill();
    }
  } else if (shape === 'robed') { // a floating orb
    ctx.fillStyle = '#b8a0ff';
    ctx.beginPath(); ctx.arc(x + r * 1.1, y - r * 0.5, r * 0.22, 0, Math.PI * 2); ctx.fill();
  } else if (shape === 'hooded') { // bow arc
    ctx.strokeStyle = '#d8c8a0'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r * 1.25, -0.9, 0.9); ctx.stroke();
  } else if (shape === 'cloaked') { // two blades
    ctx.strokeStyle = '#d8dce8'; ctx.lineWidth = 3;
    for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + sgn * r * 0.7, y + r * 0.2); ctx.lineTo(x + sgn * r * 1.25, y - r * 0.5); ctx.stroke(); }
  } else if (shape === 'crowned') { // bone crown
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * r * 0.22 - r * 0.09, y - r * 0.85);
      ctx.lineTo(x + i * r * 0.22, y - r * (1.25 + (i % 2 ? 0 : 0.15)));
      ctx.lineTo(x + i * r * 0.22 + r * 0.09, y - r * 0.85);
      ctx.closePath();
      ctx.fill();
    }
  }
  // eyes
  ctx.fillStyle = e.ai && e.ai.enraged ? '#ff4030' : '#ffd060';
  ctx.fillRect(x - r * 0.42, y - r * 0.2, r * 0.25, r * 0.12);
  ctx.fillRect(x + r * 0.17, y - r * 0.2, r * 0.25, r * 0.12);
}

// the founder (floor 100): the hero's own arrow-knight shape, giant — a pale gold ghost on page 1,
// the hero's own colours as the mirror on page 2 (lifted and larger while he leaps)
// the founder's death (11.2): kneeling (lower, shorter), a small bubble with his line, fading into light
export function drawFounderDeath(rd, game) {
  const d = game.founderDeath, c = game.config.tuning.founder.death, ctx = rd.ctx;
  const k = d.phase === 'kneel' ? Math.min(1, d.t / c.kneel) : 1, fade = d.phase === 'fade' ? Math.max(0, 1 - d.t / c.fade) : 1;
  const x = d.pos.x, y = d.pos.y + 10 * k;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(x, y); ctx.scale(1, 1 - 0.25 * k); ctx.translate(-x, -y);
  drawFounder(rd, { radius: d.boss.radius, ai: null, airborne: false }, x, y);
  ctx.restore();
  if (d.phase === 'fade') {
    const r = d.boss.radius * (1 + 2 * (1 - fade));
    ctx.globalAlpha = 0.5 * fade; ctx.fillStyle = '#fff4d0';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }
  if (d.phase === 'words' && d.line >= 0 && d.line < d.lines.length && d.t < c.lineTime) {
    const text = tr(d.lines[d.line]);
    ctx.font = c.bubbleFont + 'px system-ui, sans-serif';
    const w = Math.min(Math.min(560, rd.cssW - 24), ctx.measureText(text).width + 16), h = c.bubbleFont + 10, bx = x - w / 2, by = y - d.boss.radius - 40 - h;
    ctx.globalAlpha = Math.max(0, Math.min(1, d.t / 0.2, (c.lineTime - d.t) / 0.25));
    ctx.fillStyle = 'rgba(20,16,26,0.85)'; ctx.strokeStyle = 'rgba(255,236,190,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, w, h, 6); else ctx.rect(bx, by, w, h); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f0e6cf'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, by + h / 2, w - 10);
    ctx.globalAlpha = 1;
  }
}

export function drawFounder(rd, e, x, y) {
  const ctx = rd.ctx, mirror = !!(e.ai && e.ai.mirror), r = e.radius * (e.airborne ? 1.25 : 1);
  const d = (e.ai && e.ai.dir) || { x: -1, y: 0 }, lift = e.airborne ? 22 : 0;
  if (e.airborne) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y + 6, e.radius * 0.9, e.radius * 0.45, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.save();
  ctx.translate(x, y - lift);
  ctx.rotate(Math.atan2(d.y, d.x));
  ctx.shadowColor = mirror ? '#b48cff' : '#ffe39a';
  ctx.shadowBlur = 22;
  ctx.beginPath();
  ctx.moveTo(r * 1.3, 0); ctx.lineTo(-r * 0.9, r * 0.85); ctx.lineTo(-r * 0.5, 0); ctx.lineTo(-r * 0.9, -r * 0.85);
  ctx.closePath();
  ctx.fillStyle = mirror ? rd.colors.player : `rgba(255,236,190,${0.55 + Math.sin(performance.now() / 300) * 0.1})`;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = mirror ? '#7d5cc8' : '#ffcf5a';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
}
