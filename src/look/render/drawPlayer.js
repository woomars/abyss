import { nearestOffscreen } from '../../logic/world/pointer.js';

// spinning blade: bright edge at the current angle with a fading trail behind it (clockwise)
export function drawSpin(rd, skills, player, alpha) {
  const s = skills.spin;
  if (!s) return;
  const ctx = rd.ctx;
  const { x, y } = rd.lerpPos(player.prevPos, player.pos, alpha);
  const r = s.radius || s.def.radius;
  drawBlade(rd, x, y, r, s.start + s.swept, s, 1);
  if (s.twin) drawBlade(rd, x, y, r, s.start + Math.PI - s.swept, s, -1); // 폭풍 5세트: the other blade, turning back
}

// one spinning blade at angle a (turn: +1 clockwise, -1 the other way). The sword itself reaches the inner
// circle (no stun there, a faint sweep); the outer ring — where the spin stuns — is swept by a blue blade
// wave (검기) that turns with the sword
export function drawBlade(rd, x, y, r, a, s, turn) {
  const ctx = rd.ctx;
  const inner = Math.min(r, (s.def && s.def.innerRadius) || r * 0.5);
  const trail = Math.min(1.4, s.swept) * turn;
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const a0 = a - trail * (i + 1) / steps, a1 = a - trail * i / steps, lo = Math.min(a0, a1), hi = Math.max(a0, a1), k = 1 - i / steps;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, inner, lo, hi); ctx.closePath(); // the sword's own sweep
    ctx.fillStyle = `rgba(235,230,220,${0.14 * k})`; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r, lo, hi); ctx.arc(x, y, inner, hi, lo, true); ctx.closePath(); // the blade wave
    ctx.fillStyle = `rgba(110,200,255,${0.42 * k})`; ctx.fill();
  }
  const shimmer = 0.75 + 0.25 * Math.sin(s.swept * 18);
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y, r, Math.min(a - trail, a), Math.max(a - trail, a)); // the wave's outer edge
  ctx.strokeStyle = `rgba(190,235,255,${0.9 * shimmer})`; ctx.lineWidth = 4; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, inner, Math.min(a - trail, a), Math.max(a - trail, a)); // where the stun zone starts
  ctx.strokeStyle = 'rgba(120,200,255,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
  const c = Math.cos(a), sn = Math.sin(a), px = -sn, py = c;
  ctx.beginPath(); ctx.moveTo(x + c * inner, y + sn * inner); ctx.lineTo(x + c * r, y + sn * r); // the wave's leading front
  ctx.strokeStyle = `rgba(170,230,255,${shimmer})`; ctx.lineWidth = s.pause > 0 ? 7 : 5; ctx.shadowColor = '#6ec8ff'; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowBlur = 0;
  // the sword: grip, guard, a blade tapering to its point at the inner circle
  const g0 = 6, g1 = 13, tip = Math.max(g1 + 8, inner), w = 4.5;
  const P = (d, o) => [x + c * d + px * o, y + sn * d + py * o];
  ctx.beginPath(); ctx.moveTo(...P(g0, 0)); ctx.lineTo(...P(g1, 0)); ctx.strokeStyle = '#6b4a2e'; ctx.lineWidth = 4; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(...P(g1, -7)); ctx.lineTo(...P(g1, 7)); ctx.strokeStyle = '#c9a86a'; ctx.lineWidth = 3.5; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(...P(g1 + 1, -w)); ctx.lineTo(...P(tip - 8, -w)); ctx.lineTo(...P(tip, 0)); ctx.lineTo(...P(tip - 8, w)); ctx.lineTo(...P(g1 + 1, w)); ctx.closePath();
  ctx.fillStyle = s.pause > 0 ? '#ffffff' : '#dfe4ee'; ctx.fill();
  ctx.strokeStyle = '#8a93a6'; ctx.lineWidth = 1; ctx.stroke();
}

// how high the hero is in the jump (0 on the ground): an arc over the jump's length
export function jumpLift(rd, sk) {
  if (!sk.rush) return null;
  const k = Math.min(1, sk.rush.traveled / Math.max(1, sk.rush.dist)), h = Math.sin(Math.PI * k);
  return { z: h * 46, s: 1 + h * 0.45, k };
}

// the jump: a shadow left on the floor that shrinks as the hero rises, a faint trail of air and a
// marker where the hero will come down; the stiffness after landing: a dim pulse
export function drawRoll(rd, game, alpha) {
  const sk = game.skills, p = game.player, ctx = rd.ctx;
  const { x, y } = rd.lerpPos(p.prevPos, p.pos, alpha);
  if (sk.rush) {
    const d = sk.rush.dir, lift = jumpLift(rd, sk), r = p.radius, h = lift.z / 46;
    const left = Math.max(0, sk.rush.dist - sk.rush.traveled);
    ctx.save(); // where it lands
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(255,210,140,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x + d.x * left, y + d.y * left, sk.landing(sk.rush.def).radius, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = `rgba(0,0,0,${0.45 - 0.2 * h})`; // shadow
    ctx.beginPath(); ctx.ellipse(x, y + 4, r * (1.1 - 0.35 * h), r * (0.6 - 0.2 * h), 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createLinearGradient(x, y - lift.z, x - d.x * 70, y - d.y * 70);
    g.addColorStop(0, 'rgba(220,235,255,0.4)'); g.addColorStop(1, 'rgba(220,235,255,0)');
    ctx.strokeStyle = g; ctx.lineWidth = r * 1.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y - lift.z); ctx.quadraticCurveTo(x - d.x * 35, y - d.y * 35 - lift.z * 0.9, x - d.x * 70, y - d.y * 70); ctx.stroke();
  } else if (sk.stiff > 0) {
    ctx.strokeStyle = `rgba(255,120,90,${0.35 + 0.3 * Math.sin(performance.now() / 50)})`; ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(x, y, p.radius * 1.6, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
}

// burning ash (재의 인장) and allied wraiths (망령 군주의 왕관)
export function drawGear(rd, game) {
  const ctx = rd.ctx, now = performance.now();
  for (const f of game.fields || []) {
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,120,40,${0.12 + 0.1 * Math.sin(now / 90 + f.x)})`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,170,80,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  for (const a of game.allies || []) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, a.t) * 0.8;
    ctx.beginPath();
    ctx.arc(a.x, a.y - 4 + Math.sin(now / 200 + a.x) * 3, 13, Math.PI, 0);
    ctx.lineTo(a.x + 13, a.y + 10); ctx.lineTo(a.x - 13, a.y + 10); ctx.closePath();
    ctx.fillStyle = '#9fd8ff';
    ctx.fill();
    ctx.strokeStyle = '#e0f4ff';
    ctx.stroke();
    ctx.restore();
  }
}

// no enemy on screen: a small arrow around the player toward the nearest one
export function drawPointer(rd, game, alpha) {
  if (game.mode !== 'dungeon' || game.over || game.dungeon.state !== 'play' || game.dungeon.remaining === 0) return;
  const cam = game.camera;
  const view = { x: cam.pos.x - cam.viewW / 2, y: cam.pos.y - cam.viewH / 2, w: cam.viewW, h: cam.viewH };
  const hit = nearestOffscreen(game.enemies.all(), view, game.player.pos);
  if (!hit) return;
  const { x, y } = rd.lerpPos(game.player.prevPos, game.player.pos, alpha);
  const ang = Math.atan2(hit.dir.y, hit.dir.x), R = 72;
  const ctx = rd.ctx, px = x + hit.dir.x * R, py = y + hit.dir.y * R;
  const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 180);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(ang);
  ctx.globalAlpha = pulse;
  // double chevron in the enemy red, so it never reads as the hero's own arrow
  ctx.strokeStyle = '#ff6b55';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(255,80,60,0.7)';
  ctx.shadowBlur = 8;
  for (const o of [-6, 6]) { ctx.beginPath(); ctx.moveTo(o - 7, -10); ctx.lineTo(o + 4, 0); ctx.lineTo(o - 7, 10); ctx.stroke(); }
  ctx.restore();
}

// directional skill aim preview: dashed line + arrowhead from the player
export function drawAim(rd, skills, player, alpha) {
  const a = skills.aim;
  if (!a) return;
  const def = skills.def(skills.cfg.slots[a.slot]);
  if (skills.cfg.slots[a.slot] === 'rushStrike') { // the jump: its own pick (farthest foe) or the drag's way and distance
    const plan = skills.jumpPlan(a.dir), q = rd.lerpPos(player.prevPos, player.pos, alpha);
    drawJumpAim(rd, skills, def, player, q.x, q.y, plan.dir.x, plan.dir.y, plan.dist);
    return;
  }
  if (!a.dir) return;
  const len = Math.hypot(a.dir.x, a.dir.y) || 1;
  const ux = a.dir.x / len, uy = a.dir.y / len;
  const reach = def.distance || def.range || 300;
  const { x, y } = rd.lerpPos(player.prevPos, player.pos, alpha);
  if (skills.cfg.slots[a.slot] === 'bladeWave' && skills.waveWidth) { drawWaveAim(rd, skills, def, x, y, ux, uy); return; }
  const ex = x + ux * reach, ey = y + uy * reach;
  const ctx = rd.ctx;
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

// 질풍 베기 aim: the cone it will sweep, brighter inside sword reach (full damage and stun there)
export function drawWaveAim(rd, skills, def, x, y, ux, uy) {
  const ctx = rd.ctx, px = -uy, py = ux;
  const at = (d) => { const h = skills.waveWidth(def, d) / 2; return [[x + ux * d + px * h, y + uy * d + py * h], [x + ux * d - px * h, y + uy * d - py * h]]; };
  const quad = (d0, d1) => { const [a, b] = at(d0), [c, e] = at(d1); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(e[0], e[1]); ctx.lineTo(b[0], b[1]); ctx.closePath(); };
  ctx.save();
  quad(0, def.range); ctx.fillStyle = 'rgba(159,216,255,0.10)'; ctx.fill();
  ctx.setLineDash([10, 8]); ctx.strokeStyle = 'rgba(159,216,255,0.8)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
  quad(0, Math.min(def.near || 0, def.range)); ctx.fillStyle = 'rgba(255,224,138,0.22)'; ctx.fill();
  ctx.restore();
}

// jump aim: an arching arrow to where the hero will come down (walls and pillars cut it short) and the
// landing circle there
export function drawJumpAim(rd, skills, def, player, x, y, ux, uy, dist = def.distance) {
  const ctx = rd.ctx, ar = skills.arena;
  let d = 0;
  while (d < dist) {
    const n = Math.min(dist, d + 8);
    if (ar && ar.resolveCircle({ x: x + ux * n, y: y + uy * n }, player.radius).hitWall) break;
    d = n;
  }
  const ex = x + ux * d, ey = y + uy * d;
  const lift = Math.min(60, 20 + d * 0.3), mx = (x + ex) / 2, my = (y + ey) / 2 - lift;
  ctx.save();
  ctx.beginPath(); ctx.arc(ex, ey, skills.landing(def).radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,210,140,0.12)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,210,140,0.75)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.setLineDash([12, 8]);
  ctx.strokeStyle = 'rgba(255,224,138,0.95)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
  ctx.setLineDash([]);
  ctx.translate(ex, ey); // arrowhead along the curve's end tangent
  ctx.rotate(Math.atan2(ey - my, ex - mx));
  ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-16, 11); ctx.lineTo(-16, -11); ctx.closePath();
  ctx.fillStyle = 'rgba(255,224,138,0.95)'; ctx.fill();
  ctx.restore();
}

// 질풍 베기 in flight: the front of the cone as a bright arc (a blade edge in a glow of wind), wind
// streaks trailing back toward the hero, fading as it nears the end of its reach
export function drawProjectiles(rd, skills) {
  const ctx = rd.ctx;
  for (const p of skills.projectiles) {
    const k = Math.max(0, 1 - p.traveled / p.def.range);
    const a0 = Math.atan2(p.dir.y, p.dir.x);
    const ox = p.ox != null ? p.ox : p.x - p.dir.x * p.traveled, oy = p.oy != null ? p.oy : p.y - p.dir.y * p.traveled;
    const minHalf = skills.waveWidth ? Math.atan2(p.def.width / 2, Math.max(20, p.traveled)) : 0.5;
    const half = Math.max(minHalf, ((p.angle || 60) * Math.PI / 180) / 2);
    const R = Math.max(20, p.traveled);
    ctx.save();
    ctx.lineCap = 'round';
    // wind streaks behind the front
    for (let i = -2; i <= 2; i++) {
      const a = a0 + (i / 2.5) * half;
      ctx.strokeStyle = `rgba(170,225,255,${0.35 * k})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ox + Math.cos(a) * Math.max(0, R - 46 - Math.abs(i) * 6), oy + Math.sin(a) * Math.max(0, R - 46 - Math.abs(i) * 6));
      ctx.lineTo(ox + Math.cos(a) * (R - 8), oy + Math.sin(a) * (R - 8));
      ctx.stroke();
    }
    // glow band, then the blade edge
    ctx.shadowColor = '#6cc4ff';
    ctx.shadowBlur = 16;
    ctx.strokeStyle = `rgba(120,200,255,${0.25 + 0.4 * k})`;
    ctx.lineWidth = 16;
    ctx.beginPath(); ctx.arc(ox, oy, R, a0 - half, a0 + half); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(235,248,255,${0.55 + 0.45 * k})`;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(ox, oy, R + 3, a0 - half * 0.92, a0 + half * 0.92); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * k})`; // the gleam at the middle of the edge
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(ox, oy, R + 3, a0 - half * 0.25, a0 + half * 0.25); ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// boss name and health across the top of the screen
// a blow taken: the knight glows red for a moment (fx.hurtFlash, look.hud.playerHit.flash)
export function drawHurtFlash(rd, game, alpha) {
  const p = game.player, fx = rd.fx;
  if (!(fx.hurtFlash > 0)) return;
  const total = fx.effects.hitCfg.flash || 0.15, a = Math.min(1, fx.hurtFlash / total);
  const { x, y } = rd.lerpPos(p.prevPos || p.pos, p.pos, alpha);
  const ctx = rd.ctx;
  ctx.beginPath();
  ctx.arc(x, y, p.radius * 1.35, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,40,30,${0.55 * a})`;
  ctx.fill();
}

export function drawPlayer(rd, p, alpha, lift = null) {
  const ctx = rd.ctx;
  const { x, y } = rd.lerpPos(p.prevPos, p.pos, alpha);
  const r = p.radius;
  ctx.save();
  ctx.translate(x, y - (lift ? lift.z : 0)); // in a jump the hero rises and looks bigger
  if (lift) ctx.scale(lift.s, lift.s);
  ctx.rotate(p.visualAngle);
  ctx.beginPath();
  ctx.moveTo(r * 1.3, 0);
  ctx.lineTo(-r * 0.9, r * 0.85);
  ctx.lineTo(-r * 0.5, 0);
  ctx.lineTo(-r * 0.9, -r * 0.85);
  ctx.closePath();
  const blink = p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0;
  ctx.fillStyle = blink ? '#ff6a5c' : rd.colors.player;
  ctx.fill();
  ctx.strokeStyle = rd.colors.playerEdge;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}
