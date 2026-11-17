// The recollection strip (Phase 6, 12): along the bottom of the hall the hero walks left to right through
// the family's timeline — a boss to fight, a medal, a trophy, an ancestor's grave. It shares its clock with
// the list above: scroll the list fast and the walk speeds up; leave it and the hero walks on slowly,
// carrying the list along.
const SPACING = 150;   // px between two events on the strip
const WALK = 0.35;     // events per second when nobody scrolls
const IDLE = 0.9;      // seconds after the last scroll before the slow walk takes over

export class ChronicleStrip {
  // labelOf(event) -> short text shown over the event the hero stands at
  constructor(canvas, list, events, config, labelOf) {
    this.canvas = canvas;
    this.list = list;
    this.events = events;
    this.config = config;
    this.labelOf = labelOf;
    this.cursor = 0;   // where the hero is (event index, fractional)
    this.target = 0;   // where the list says the time is
    this.lastUser = -1e9;
    this.wrote = null; // the scrollTop the strip itself last set (its own scroll events are not the player's)
    this.onScroll = () => {
      if (this.wrote != null && Math.abs(this.list.scrollTop - this.wrote) < 1) return; // our own scrolling
      this.wrote = null;
      this.lastUser = performance.now() / 1000;
      this.target = this.indexAt(this.list.scrollTop);
    };
    list.addEventListener('scroll', this.onScroll, { passive: true });
    this.t0 = performance.now() / 1000;
    this.raf = requestAnimationFrame(() => this.frame());
  }

  rowTop(i) { const r = this.list.children[i]; return r ? r.offsetTop - this.list.children[0].offsetTop : 0; }

  indexAt(top) {
    const rows = this.list.children, n = rows.length;
    for (let i = 0; i < n - 1; i++) { const a = this.rowTop(i), b = this.rowTop(i + 1); if (top < b) return i + (top - a) / Math.max(1, b - a); }
    return Math.max(0, n - 1);
  }

  frame() {
    if (this.stopped) return;
    const now = performance.now() / 1000, dt = Math.min(0.1, now - this.t0), last = Math.max(0, this.events.length - 1);
    this.t0 = now;
    if (now - this.lastUser > IDLE && this.target < last) { // nobody scrolls: walk on, and the list follows
      this.target = Math.min(last, this.target + WALK * dt);
      const i = Math.floor(this.target), f = this.target - i, max = this.list.scrollHeight - this.list.clientHeight;
      const top = Math.min(max, this.rowTop(i) + f * (this.rowTop(i + 1) - this.rowTop(i) || 0)); // the last rows can never reach the top
      if (max > 0 && Math.abs(this.list.scrollTop - top) > 1) { this.wrote = top; this.list.scrollTop = top; }
    }
    const gap = this.target - this.cursor; // a fast scroll makes him hurry
    const speed = Math.max(WALK, Math.abs(gap) * 4);
    this.cursor += Math.sign(gap) * Math.min(Math.abs(gap), speed * dt);
    this.walking = Math.abs(gap) > 0.01;
    this.draw(now);
    this.raf = requestAnimationFrame(() => this.frame());
  }

  draw(now) {
    const c = this.canvas, dpr = window.devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#120e1a'); g.addColorStop(1, '#1d1626');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const ground = H * 0.72, heroX = W * 0.3, camX = this.cursor * SPACING - heroX;
    ctx.strokeStyle = 'rgba(201,168,106,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, ground); ctx.lineTo(W, ground); ctx.stroke();
    // a stone every so often, sliding past as he walks
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let k = Math.floor(camX / 60) - 1; k < (camX + W) / 60 + 1; k++) ctx.fillRect(k * 60 - camX, ground + 6 + ((k * 37) % 3) * 4, 18, 3);
    this.events.forEach((e, i) => {
      const x = i * SPACING - camX;
      if (x < -60 || x > W + 60) return;
      const near = Math.abs(this.cursor - i) < 0.35;
      this.drawEvent(ctx, e, x, ground, near, now);
      if (near) {
        ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#ffe08a';
        ctx.fillText(this.labelOf(e), x, ground - 46, SPACING * 1.6);
      }
    });
    this.drawHero(ctx, heroX, ground, now);
  }

  drawHero(ctx, x, ground, now) {
    const bob = this.walking ? Math.abs(Math.sin(now * 9)) * 3 : Math.sin(now * 2) * 1;
    ctx.save();
    ctx.translate(x, ground - 14 - bob);
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, -10); ctx.lineTo(-5, 0); ctx.lineTo(-10, 10); ctx.closePath();
    ctx.fillStyle = '#f0e6cf'; ctx.strokeStyle = '#c9a86a'; ctx.lineWidth = 2;
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  drawEvent(ctx, e, x, ground, near, now) {
    const y = ground - 16, pulse = near ? 1 + Math.sin(now * 6) * 0.08 : 1;
    ctx.save();
    ctx.translate(x, y); ctx.scale(pulse, pulse);
    if (e.kind === 'boss') { // the boss in its own shape and colour
      const t = this.config.enemies.types[e.key] || {}, r = 15, shape = t.shape || 'horned';
      ctx.fillStyle = t.color || '#8a3a3a'; ctx.strokeStyle = '#ffcf5a'; ctx.lineWidth = 2;
      ctx.beginPath();
      if (shape === 'robed') { ctx.moveTo(0, -r * 1.2); ctx.lineTo(r, r); ctx.lineTo(-r, r); }
      else if (shape === 'hooded') ctx.arc(0, 0, r, 0, Math.PI * 2);
      else if (shape === 'cloaked') { ctx.moveTo(0, -r * 1.2); ctx.lineTo(r * 0.8, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.8, 0); }
      else if (shape === 'golem') ctx.rect(-r, -r, r * 2, r * 2);
      else for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      if (near) { ctx.strokeStyle = 'rgba(255,240,200,0.9)'; ctx.beginPath(); ctx.moveTo(-26, -6); ctx.lineTo(-8, 4); ctx.stroke(); } // a blow
    } else if (e.kind === 'medal') {
      const col = this.config.medals.tiers[e.medal.tier].color;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -6, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a2a3a'; ctx.fillRect(-4, 4, 8, 10);
    } else if (e.kind === 'trophy') {
      ctx.fillStyle = this.config.medals.tiers[e.trophy.tier].color;
      ctx.beginPath(); ctx.moveTo(-11, -14); ctx.lineTo(11, -14); ctx.lineTo(6, 2); ctx.lineTo(-6, 2); ctx.closePath(); ctx.fill();
      ctx.fillRect(-2, 2, 4, 8); ctx.fillRect(-8, 10, 16, 4);
    } else if (e.kind === 'death') { // a grave
      ctx.fillStyle = '#6a6474'; ctx.beginPath(); ctx.moveTo(-10, 16); ctx.lineTo(-10, -6); ctx.arc(0, -6, 10, Math.PI, 0); ctx.lineTo(10, 16); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#2a2433'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 6); ctx.moveTo(-5, -3); ctx.lineTo(5, -3); ctx.stroke();
    } else if (e.kind === 'essence') {
      ctx.shadowColor = '#c27cff'; ctx.shadowBlur = 12; ctx.fillStyle = '#c9a0ff';
      ctx.beginPath(); ctx.arc(0, -4, 8, 0, Math.PI * 2); ctx.fill();
    } else { // a past chronicle: a banner
      ctx.fillStyle = '#c9a86a'; ctx.fillRect(-1, -20, 3, 36);
      ctx.fillStyle = '#7a3a5a'; ctx.beginPath(); ctx.moveTo(2, -20); ctx.lineTo(20, -14); ctx.lineTo(2, -6); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  stop() {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.list.removeEventListener('scroll', this.onScroll);
  }
}
