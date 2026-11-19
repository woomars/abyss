// exit portal (dim ring while closed, glowing swirl once open) and treasure chest
// equipment on the floor: a gem in the grade colour, a beam for epic and better, flying when pulled in
export function drawLoot(rd, game) {
  const ctx = rd.ctx, cfg = game.config.look.items, t = performance.now() / 1000;
  for (const g of game.loot.ground) {
    if (!rd.isVisible(g, 80)) continue;
    const it = g.item, col = cfg.grades[it.grade].color, hi = it.grade === 'epic' || it.grade === 'legendary' || it.grade === 'set';
    const bob = g.fly ? 0 : Math.sin(t * 3 + it.id) * 3;
    const s = g.fly ? 6 : 9;
    ctx.save();
    ctx.translate(g.x, g.y + bob);
    if (hi && !g.fly) { // light pillar
      const grd = ctx.createLinearGradient(0, -90, 0, 0);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, col);
      ctx.globalAlpha = 0.35 + Math.sin(t * 4) * 0.1;
      ctx.fillStyle = grd;
      ctx.fillRect(-5, -90, 10, 90);
    }
    ctx.globalAlpha = g.fly ? 0.8 : 0.35;
    ctx.beginPath();
    ctx.arc(0, 0, s * 2.2, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(0, -s); ctx.lineTo(s * 0.8, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.8, 0);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    const qc = cfg.qualities[it.quality].color;
    ctx.lineWidth = qc ? 2.5 : 1.5;
    ctx.strokeStyle = qc || '#1a1420';
    ctx.stroke();
    ctx.restore();
  }
}

export function drawRoomObjects(rd, d) {
  const ctx = rd.ctx, t = performance.now() / 1000;
  for (const s of d.spikes || []) { // trap tiles: faint when idle, pulsing red as they warn, spikes when up
    if (!rd.isVisible({ x: s.x + s.w / 2, y: s.y + s.h / 2 }, s.w)) continue;
    ctx.fillStyle = s.phase === 'warn' ? `rgba(255,60,40,${0.25 + 0.2 * Math.sin(t * 20)})` : s.phase === 'up' ? 'rgba(90,80,100,0.9)' : 'rgba(120,100,130,0.18)';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.strokeStyle = s.phase === 'warn' ? 'rgba(255,90,60,0.9)' : 'rgba(150,130,160,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(s.x, s.y, s.w, s.h);
    if (s.phase === 'up') {
      ctx.fillStyle = '#d8d0e0';
      const n = 4, step = s.w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const cx = s.x + step * (i + 0.5), cy = s.y + step * (j + 0.5);
        ctx.beginPath(); ctx.moveTo(cx, cy - step * 0.38); ctx.lineTo(cx + step * 0.25, cy + step * 0.3); ctx.lineTo(cx - step * 0.25, cy + step * 0.3); ctx.closePath(); ctx.fill();
      }
    }
  }
  const wp = d.warp;
  if (wp && rd.isVisible(wp, wp.r * 2)) { // Ariadne's rope: a golden thread coiled in a pale ring
    ctx.save();
    ctx.translate(wp.x, wp.y);
    ctx.beginPath(); ctx.arc(0, 0, wp.r * 1.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(160,220,200,0.18)'; ctx.fill();
    ctx.strokeStyle = 'rgba(190,240,220,0.8)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.rotate(-t * 1.2);
    ctx.strokeStyle = '#ffd88a'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let k = 0; k <= 40; k++) { const a = k * 0.45, rr = wp.r * (0.15 + k / 52); ctx[k ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.stroke();
    ctx.restore();
  }
  const ex = d.exit;
  if (ex.r > 0 && ex.open && rd.isVisible(ex, ex.r * 2)) { // the portal only shows once it is there
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
  if (ch && rd.isVisible(ch, ch.r * 2)) {
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

export function drawArena(rd, arena, cam) {
  const ctx = rd.ctx;
  const v = rd.viewWorld;
  ctx.fillStyle = rd.colors.wall;
  ctx.fillRect(cam.x - v.w, cam.y - v.h, v.w * 2, v.h * 2);
  ctx.fillStyle = rd.colors.floor;
  if (arena.cfg.circle) { // round arena: the floor is a disc
    ctx.save();
    ctx.beginPath();
    ctx.arc(arena.width / 2, arena.height / 2, Math.min(arena.width, arena.height) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rd.colors.pillarEdge;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.clip();
  } else ctx.fillRect(0, 0, arena.width, arena.height);
  // grid gives a sense of motion
  const g = 80;
  const x0 = Math.max(0, Math.floor((cam.x - v.w / 2) / g) * g), x1 = Math.min(arena.width, cam.x + v.w / 2);
  const y0 = Math.max(0, Math.floor((cam.y - v.h / 2) / g) * g), y1 = Math.min(arena.height, cam.y + v.h / 2);
  ctx.strokeStyle = rd.colors.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += g) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  for (let y = y0; y <= y1; y += g) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  ctx.stroke();
  if (arena.cfg.circle) ctx.restore();
  for (const p of arena.pillars) {
    if (!rd.isVisible({ x: p.x + p.w / 2, y: p.y + p.h / 2 }, Math.max(p.w, p.h))) continue;
    ctx.fillStyle = rd.colors.pillar;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = rd.colors.pillarEdge;
    ctx.lineWidth = 3;
    ctx.strokeRect(p.x, p.y, p.w, p.h);
  }
}
