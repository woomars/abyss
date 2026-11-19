import { t } from '../../i18n/index.js';

export function drawAfterimages(rd, fx, player) {
  const ctx = rd.ctx;
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

export function drawWinds(rd, fx) {
  const ctx = rd.ctx;
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
export function drawSlashes(rd, fx) {
  const ctx = rd.ctx;
  const SWING = rd.config.look.render.sizes.swing; // fraction of the effect spent swinging
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
      const base = s.wave ? 'rgba(170,225,255,' : s.strong ? 'rgba(255,214,150,' : 'rgba(240,235,220,';
      ctx.fillStyle = `${base}${(s.strong ? 0.4 : 0.28) * (1 - i / steps) * fade})`;
      ctx.fill();
    }
    // bright edge along the swept part
    ctx.beginPath();
    ctx.arc(0, 0, r, Math.min(from, cur), Math.max(from, cur));
    ctx.strokeStyle = s.wave ? `rgba(200,238,255,${0.95 * fade})` : s.strong ? `rgba(255,210,138,${0.9 * fade})` : `rgba(255,255,255,${0.75 * fade})`;
    ctx.lineWidth = s.strong ? 4 : 3;
    ctx.stroke();
    // the blade itself while swinging
    if (swing < 1 || fade > 0.6) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(cur) * 14, Math.sin(cur) * 14);
      ctx.lineTo(Math.cos(cur) * r, Math.sin(cur) * r);
      ctx.strokeStyle = s.wave ? `rgba(255,255,255,${fade})` : s.strong ? `rgba(255,210,138,${fade})` : `rgba(255,248,230,${fade})`;
      ctx.lineWidth = s.strong ? 6 : 4;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.restore();
  });
  ctx.globalAlpha = 1;
}

export function drawRings(rd, fx) {
  const ctx = rd.ctx;
  for (const f of fx.floods) { // an orc's heavy swing: its cone red for a moment
    ctx.globalAlpha = 0.55 * (f.life / f.max);
    ctx.fillStyle = '#ff2a1a';
    const a0 = Math.atan2(f.dir.y, f.dir.x), half = (f.arc * Math.PI) / 360;
    ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.arc(f.x, f.y, f.r, a0 - half, a0 + half); ctx.closePath(); ctx.fill();
  }
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

export function drawParticles(rd, fx) {
  const ctx = rd.ctx;
  fx.particles.forEachActive((p) => {
    if (!rd.isVisible(p, 10)) return;
    ctx.globalAlpha = Math.max(0, p.life / p.max) * (p.a0 == null ? 1 : p.a0);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  });
  ctx.globalAlpha = 1;
}

export function drawLinks(rd, fx) {
  const ctx = rd.ctx;
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

export function drawNumbers(rd, fx) {
  const ctx = rd.ctx;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fx.numbers.forEachActive((n) => {
    const k = n.life / n.max;
    const pop = n.crit ? 1 + 0.6 * Math.max(0, (k - 0.75) / 0.25) : 1;
    ctx.globalAlpha = Math.min(1, k * 2);
    ctx.font = `bold ${Math.round((n.crit ? 26 : 17) * pop * (n.scale || 1))}px system-ui, sans-serif`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000000';
    // a blow the shield soaked still shows its damage, in the shield's gold; immunity shows a word
    const shield = n.tag === 'guard', label = n.tag && !shield ? t(`fx.${n.tag}`) : String(n.value);
    ctx.strokeText(label, n.x, n.y);
    ctx.fillStyle = shield ? '#e8cf6a' : n.tag ? '#9fb8d8' : n.hurt ? '#ff4a4a' : n.crit ? '#ffb347' : '#f4f0e6';
    ctx.fillText(label, n.x, n.y);
  });
  ctx.globalAlpha = 1;
}
