import { telegraphStyle } from './telegraph.js';

// monotone-chain convex hull of [x, y] points
function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// the floor a pillar hides from (h.x, h.y) is cut out of the clip, pillar by pillar (each clip intersects)
export function clipCover(rd, h, arena) {
  if (!arena || !arena.pillars || !arena.pillars.length) return;
  const ctx = rd.ctx, W = arena.width, H = arena.height, ox = h.x, oy = h.y;
  for (const p of arena.pillars) {
    if (ox >= p.x && ox <= p.x + p.w && oy >= p.y && oy <= p.y + p.h) continue;
    const pts = [];
    for (const [cx, cy] of [[p.x, p.y], [p.x + p.w, p.y], [p.x + p.w, p.y + p.h], [p.x, p.y + p.h]]) {
      const dx = cx - ox, dy = cy - oy, k = 4000 / Math.max(1, Math.hypot(dx, dy));
      pts.push([cx, cy], [ox + dx * (1 + k), oy + dy * (1 + k)]);
    }
    const hull = convexHull(pts);
    let area = 0;
    for (let i = 0; i < hull.length; i++) { const a = hull[i], b = hull[(i + 1) % hull.length]; area += a[0] * b[1] - b[0] * a[1]; }
    if (area > 0) hull.reverse(); // opposite winding to the room rectangle: nonzero leaves the shadow out
    ctx.beginPath();
    ctx.rect(-4000, -4000, W + 8000, H + 8000);
    ctx.moveTo(hull[0][0], hull[0][1]);
    for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i][0], hull[i][1]);
    ctx.closePath();
    ctx.clip();
  }
}

// telegraphs and arrows (drawn on the floor, under the enemies)
// attack warnings on top of every body: melee reach circles (an orc's counter used to hide under the
// crowd) and the edges of enemy circles and cones (their fill stays below, drawn by drawHazards)
export function drawTelegraphs(rd, game, alpha) {
  const ctx = rd.ctx;
  for (const e of game.enemies.all()) {
    if (!(e.windupTime > 0) || e.dying || !rd.isVisible(e.pos, e.radius * 4)) continue;
    const { x, y } = rd.lerpPos(e.prevPos, e.pos, alpha);
    const reach = e.radius + (e.tcfg.attackRange || 0) + 16 + (e.lunge || 0);
    const total = e.windupMax || e.tcfg.attackWindup || 0.2;
    const k = 1 - e.windupTime / total, st = telegraphStyle(k, total - e.windupTime, rd.config.look.render.telegraphFlash);
    const d = e.windupDir, a0 = d ? Math.atan2(d.y, d.x) : 0, half = d ? (e.meleeArc * Math.PI) / 360 : Math.PI;
    const pie = (r) => { ctx.beginPath(); if (d) ctx.moveTo(x, y); ctx.arc(x, y, r, a0 - half, a0 + half); if (d) ctx.closePath(); }; // the swing's cone
    pie(reach * k);
    ctx.fillStyle = `rgba(255,60,50,${st.fillAlpha})`;
    ctx.fill();
    pie(reach);
    ctx.strokeStyle = st.flash ? `rgba(255,235,200,${st.strokeAlpha})` : `rgba(255,70,55,${st.strokeAlpha})`;
    ctx.lineWidth = st.lineWidth;
    if (e.isElite) ctx.setLineDash([10, 7]); // the orc's heavy swing: a dashed edge
    ctx.stroke();
    ctx.setLineDash([]);
    if (e.isElite) { pie(reach); ctx.fillStyle = `rgba(255,40,30,${0.08 + 0.12 * k})`; ctx.fill(); } // the whole floor it covers, reddening
  }
  const hz = game.hazards;
  for (const h of hz.list) {
    if ((h.kind !== 'circle' && h.kind !== 'cone') || h.tell || h.done) continue;
    if (!rd.isVisible(h, h.radius + 20)) continue;
    const st = telegraphStyle(Math.min(1, h.t / h.delay), h.t, rd.config.look.render.telegraphFlash);
    ctx.save();
    if (h.kind !== 'circle') clipCover(rd, h, hz.arena);
    ctx.translate(h.x, h.y);
    ctx.beginPath();
    if (h.kind === 'circle') ctx.arc(0, 0, h.radius, 0, Math.PI * 2);
    else {
      const a0 = Math.atan2(h.dir.y, h.dir.x), half = (h.arcDeg * Math.PI / 180) / 2;
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, h.radius, a0 - half, a0 + half);
      ctx.closePath();
    }
    ctx.strokeStyle = st.flash ? `rgba(255,235,200,${st.strokeAlpha})` : `rgba(255,70,55,${st.strokeAlpha})`;
    ctx.lineWidth = st.lineWidth;
    ctx.stroke();
    ctx.restore();
  }
}

export function drawHazards(rd, hz) {
  const ctx = rd.ctx;
  for (const h of hz.list) {
    if (!rd.isVisible(h, (h.radius || h.maxRadius || 20) + 20)) continue;
    if (h.kind === 'arrow' && h.style === 'bolt') { // boss shot: glowing orb with a short tail
      ctx.strokeStyle = 'rgba(255,140,90,0.5)';
      ctx.lineWidth = h.radius * 1.2;
      ctx.beginPath();
      ctx.moveTo(h.x - h.dir.x * 18, h.y - h.dir.y * 18);
      ctx.lineTo(h.x, h.y);
      ctx.stroke();
      ctx.fillStyle = '#ffd0a0';
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    if (h.kind === 'arrow' && h.style === 'dagger') { // assassin's thrown dagger
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(Math.atan2(h.dir.y, h.dir.x));
      ctx.scale(1.6, 1.6);
      ctx.fillStyle = '#e8ecf4';
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-2, -3); ctx.lineTo(-2, 3); ctx.closePath(); ctx.fill(); // blade
      ctx.strokeStyle = '#8a92a8'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#c9a86a'; ctx.fillRect(-4, -5, 2, 10); // guard
      ctx.fillStyle = '#5a3a2a'; ctx.fillRect(-10, -1.5, 6, 3); // grip
      ctx.restore();
      continue;
    }
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
    if (h.kind === 'pool') {
      const on = h.t >= h.delay, curse = h.style === 'curse';
      const fadeOut = on ? Math.min(1, (h.delay + h.duration - h.t) / 0.4) : Math.min(1, h.t / Math.max(0.01, h.delay));
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
      ctx.fillStyle = curse ? `rgba(150,60,200,${(on ? 0.28 : 0.1) * fadeOut})` : `rgba(120,40,20,${(on ? 0.4 : 0.12) * fadeOut})`;
      ctx.fill();
      ctx.strokeStyle = curse ? `rgba(200,120,255,${0.6 * fadeOut})` : `rgba(255,110,60,${0.6 * fadeOut})`;
      ctx.lineWidth = on ? 2 : 1;
      ctx.setLineDash(on ? [] : [6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      continue;
    }
    if (h.kind === 'beam') {
      const on = h.t >= h.delay;
      ctx.save();
      clipCover(rd, h, hz.arena);
      ctx.translate(h.x, h.y);
      ctx.rotate(h.angle);
      if (!on) {
        ctx.setLineDash([12, 8]);
        ctx.strokeStyle = `rgba(255,90,60,${0.3 + 0.5 * Math.min(1, h.t / h.delay)})`;
        ctx.lineWidth = Math.max(2, h.width * 0.3);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(h.length, 0); ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = 'rgba(255,90,60,0.45)';
        ctx.fillRect(0, -h.width / 2, h.length, h.width);
        ctx.fillStyle = 'rgba(255,230,190,0.8)';
        ctx.fillRect(0, -h.width / 6, h.length, h.width / 3);
      }
      ctx.restore();
      continue;
    }
    const k = Math.min(1, h.t / h.delay);
    const flash = h.kind !== 'ring' && h.done;
    ctx.save();
    if (h.kind !== 'circle') clipCover(rd, h, hz.arena);
    ctx.translate(h.x, h.y);
    if (h.kind === 'annulus') { // one ring of a sequential zone attack
      const ring = () => { ctx.beginPath(); ctx.arc(0, 0, h.r1, 0, Math.PI * 2); if (h.r0 > 0) ctx.arc(0, 0, h.r0, 0, Math.PI * 2, true); };
      ring();
      ctx.fillStyle = flash ? 'rgba(255,120,80,0.5)' : `rgba(255,50,40,${0.06 + 0.16 * k})`;
      ctx.fill('evenodd');
      ctx.strokeStyle = flash ? 'rgba(255,200,150,0.9)' : `rgba(255,70,60,${0.35 + 0.45 * k})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (h.kind === 'line') { // a lane: the charge path or the sniper's line
      ctx.rotate(Math.atan2(h.dir.y, h.dir.x));
      if (h.tell) { // aim only: dashed line that brightens
        ctx.setLineDash([12, 8]);
        ctx.strokeStyle = `rgba(255,90,60,${0.35 + 0.5 * k})`;
        ctx.lineWidth = Math.max(2, h.width * 0.35);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(h.length, 0); ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = flash ? 'rgba(255,120,80,0.55)' : 'rgba(255,50,40,0.10)';
        ctx.fillRect(0, -h.width / 2, h.length, h.width);
        ctx.strokeStyle = flash ? 'rgba(255,200,150,0.9)' : 'rgba(255,70,60,0.7)';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, -h.width / 2, h.length, h.width);
        if (!flash) { ctx.fillStyle = `rgba(255,60,50,${0.12 + 0.2 * k})`; ctx.fillRect(0, -h.width / 2, h.length * k, h.width); }
      }
    } else if (h.kind === 'circle' || h.kind === 'cone') {
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
      if (h.tell) { // a warning shape that does no harm itself (spiral glow, fan arc)
        if (!flash) {
          path();
          ctx.setLineDash([8, 6]);
          ctx.strokeStyle = `rgba(255,150,90,${0.4 + 0.5 * k})`;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
        continue;
      }
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
