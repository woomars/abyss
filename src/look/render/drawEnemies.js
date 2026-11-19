import { drawBossBody } from './drawBoss.js';

export function drawEnemies(rd, game, alpha) {
  const ctx = rd.ctx, mgr = game.enemies, pp = game.player.pos;
  for (const e of mgr.all()) {
    const r = e.radius;
    if (!rd.isVisible(e.pos, r * 3)) continue;
    let { x, y } = rd.lerpPos(e.prevPos, e.pos, alpha);
    const ef = rd.fx.enemies.get(e), push = ef && ef.push, flash = !!ef && ef.flash > 0;
    if (push && push.t > 0) { const k = push.d * (push.t / push.max) ** 2; x += push.x * k; y += push.y * k; } // hit nudge, back in hitPush.time
    let size = r * 1.6;
    let a = e.fade == null ? 1 : e.fade;
    if (e.dying) {
      const k = Math.max(0, e.deathTimer / e.root.deathTime);
      a *= k;
      size *= 0.6 + 0.4 * k;
    }
    if (a <= 0.01) continue;
    const wob = e.staggerTime > 0 && !e.dying ? Math.sin(e.staggerTime * 60) * 2 : 0;
    const fill = flash ? '#ffffff' : e.strikeTime > 0 ? '#ff3b30' : rd.lookOf(e).color;
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
    ctx.strokeStyle = e.mods.enhanced ? '#ffcf5a' : e.isElite ? '#e0a050' : e.mods.minion ? '#c8443a' : '#2b2e36'; // minion: red rim
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
    } else if (ai === 'shieldbearer') { // a square skeleton behind a silver shield arc where it looks
      ctx.fillRect(x - size / 2 + wob, y - size / 2, size, size);
      ctx.strokeRect(x - size / 2 + wob, y - size / 2, size, size);
      if (e.ai && e.ai.face != null) {
        const half = (e.tcfg.shieldArc * Math.PI) / 360;
        ctx.strokeStyle = e.stunTime > 0 ? 'rgba(200,200,210,0.35)' : '#d8dce8'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(x + wob, y, r * 1.3, e.ai.face - half, e.ai.face + half); ctx.stroke();
      }
    } else if (ai === 'slime') { // a wobbling blob, flat while it crouches
      const crouch = e.ai && e.ai.leap && e.ai.leap.t > 0.2;
      const t = performance.now() / 300 + e.id;
      ctx.beginPath(); ctx.ellipse(x + wob, y + (crouch ? r * 0.2 : 0), r * (1.05 + 0.05 * Math.sin(t)) * (crouch ? 1.15 : 1), r * (0.85 - 0.05 * Math.sin(t)) * (crouch ? 0.7 : 1), 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    } else if (ai === 'shaman' || ai === 'buffShaman') { // a small robe with a glowing staff (the buff shaman's orb green)
      ctx.beginPath(); ctx.moveTo(x + wob, y - r * 1.2); ctx.lineTo(x + wob + r * 0.9, y + r); ctx.lineTo(x + wob - r * 0.9, y + r); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#c8b090'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + wob + r, y + r); ctx.lineTo(x + wob + r * 1.3, y - r * 1.3); ctx.stroke();
      ctx.fillStyle = ai === 'buffShaman' ? '#9dffb0' : '#d8a0ff'; ctx.beginPath(); ctx.arc(x + wob + r * 1.3, y - r * 1.4, 3.5, 0, Math.PI * 2); ctx.fill();
      if (ai === 'buffShaman' && !e.dying) { // its buff reach, faint
        ctx.beginPath(); ctx.arc(x, y, rd.config.enemies.ai.buffShaman.radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(125,255,160,0.18)'; ctx.lineWidth = 2; ctx.setLineDash([6, 8]); ctx.stroke(); ctx.setLineDash([]);
      }
    } else if (ai === 'clone' && e.cloneOf) { // an assassin's decoy: drawn exactly as its boss, so only hitting tells them apart
      const b = e.cloneOf;
      drawBossBody(rd, b, x + wob, y, flash ? '#ffffff' : b.strikeTime > 0 ? '#ff3b30' : rd.lookOf(b).color);
    } else if (ai === 'sigil') { // a turning magic circle
      const sp = e.ai ? e.ai.spin : 0;
      ctx.save(); ctx.translate(x, y); ctx.rotate(sp);
      ctx.strokeStyle = '#b89cff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i * Math.PI * 2) / 6 * 2; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85); } ctx.closePath(); ctx.stroke();
      ctx.fillStyle = flash ? '#ffffff' : 'rgba(150,110,255,0.35)'; ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (ai === 'bomber') { // round powder keg with a fuse that blinks faster near the end
      const blink = e.ai && e.ai.fuse < 1.2 && Math.floor(performance.now() / (e.ai.fuse < 0.6 ? 60 : 130)) % 2 === 0;
      ctx.beginPath(); ctx.arc(x + wob, y, r, 0, Math.PI * 2);
      ctx.fillStyle = blink ? '#ff5a3a' : fill; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(x + wob + r * 0.6, y - r * 0.9, 3, 0, Math.PI * 2); ctx.fill();
    } else if (ai === 'spearman') { // square body with a long spear toward the player
      const ang = Math.atan2(pp.y - y, pp.x - x);
      ctx.fillRect(x - size / 2 + wob, y - size / 2, size, size);
      ctx.strokeRect(x - size / 2 + wob, y - size / 2, size, size);
      ctx.save();
      ctx.translate(x + wob, y);
      ctx.rotate(ang);
      const jab = e.ai && e.ai.hold > 0 ? 10 : 0;
      ctx.strokeStyle = '#d8cfb4';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-r * 0.4, 0); ctx.lineTo(r * 2.6 + jab, 0); ctx.stroke();
      ctx.fillStyle = '#e8e3d6';
      ctx.beginPath(); ctx.moveTo(r * 2.6 + jab + 9, 0); ctx.lineTo(r * 2.6 + jab, -4); ctx.lineTo(r * 2.6 + jab, 4); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else if (e.isBoss) {
      drawBossBody(rd, e, x + wob, y, fill);
    } else {
      ctx.fillRect(x - size / 2 + wob, y - size / 2, size, size);
      ctx.strokeRect(x - size / 2 + wob, y - size / 2, size, size);
    }
    if (e.sbuff && !e.dying) { // a buff shaman's blessing: a green glow underfoot
      ctx.beginPath(); ctx.ellipse(x, y + r * 0.6, r * 1.1, r * 0.45, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(125,255,160,0.75)'; ctx.lineWidth = 2; ctx.stroke();
    }
    if (e.bubble && !e.dying) { // a shaman's bubble: one blow stopped
      ctx.beginPath(); ctx.arc(x, y, r * 1.45, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(190,150,255,0.8)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'rgba(190,150,255,0.12)'; ctx.fill();
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
    // stunned: little stars circling over the head
    if (e.stunTime > 0 && !e.dying) {
      const t = performance.now() / 160;
      ctx.fillStyle = '#ffe08a';
      for (let i = 0; i < 3; i++) {
        const a = t + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * r * 0.8, y - r * 1.25 + Math.sin(a) * r * 0.25, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // angry (riposte ready): a pulsing red reach ring that fades as the anger runs out
    if (e.angerTime > 0 && !e.dying && !e.hidden) {
      const reach = r + (e.tcfg.attackRange || 0) + game.player.radius;
      const fade = Math.min(1, e.angerTime / 0.4);
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 70);
      if (e.riposteDir) { // only the cone it strikes into (aimed at the hero a moment after the blow; fainter until armed)
        const d = Math.atan2(e.riposteDir.y, e.riposteDir.x), half = (e.riposteArc * Math.PI) / 360;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, reach, d - half, d + half);
        ctx.closePath();
        ctx.fillStyle = `rgba(255,60,40,${(e.riposteArm > 0 ? 0.08 : 0.2) * fade})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255,70,50,${(0.35 + 0.35 * pulse) * fade})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
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
