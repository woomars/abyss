// Turns raw pointer samples (CSS px) into movement directions.
// Only the DIRECTION of a stroke matters; its screen position and shape are ignored.
const MIN_UPDATE_PX = 6;
const MAX_POINTS = 64;

export class StrokeTracker {
  constructor(cfg, events) {
    this.cfg = cfg; // config.input (live)
    this.events = events;
    this.excluded = [];
    this.pointers = new Map();
    this.activeId = null;
    this.lastPoints = []; // trail of the most recent stroke (kept after release for fading)
  }

  setExcludedRects(rects) { this.excluded = rects || []; }

  isExcluded(x, y) {
    for (const r of this.excluded) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
    }
    return false;
  }

  pointerDown(id, x, y, t) {
    if (this.isExcluded(x, y)) return;
    const p = { x, y, t };
    const st = { origin: p, points: [p], strokeStart: t, decided: false, lastEmit: p };
    this.pointers.set(id, st);
    this.activeId = id;
    this.lastPoints = st.points;
  }

  pointerMove(id, x, y, t) {
    const st = this.pointers.get(id);
    if (!st || id !== this.activeId) return;
    const prev = st.points[st.points.length - 1];
    const cur = { x, y, t };

    // one stroke accepts input for at most strokeWindowSec; then a continued drag is a new stroke
    if (t - st.strokeStart > this.cfg.strokeWindowSec) {
      st.origin = prev;
      st.points = [prev];
      st.strokeStart = t;
      st.decided = false;
      st.lastEmit = prev;
      this.lastPoints = st.points;
    }

    st.points.push(cur);
    if (st.points.length > MAX_POINTS) st.points.splice(0, st.points.length - MAX_POINTS);

    if (!st.decided) {
      const dx = x - st.origin.x, dy = y - st.origin.y;
      const d = Math.hypot(dx, dy);
      if (d >= this.cfg.directionThresholdPx) {
        st.decided = true;
        st.lastEmit = cur;
        this.events.emit('stroke', { dir: { x: dx / d, y: dy / d }, isNew: true });
      }
      return;
    }

    if (Math.hypot(x - st.lastEmit.x, y - st.lastEmit.y) < MIN_UPDATE_PX) return;
    // direction of the most recent recentWindowPx of movement
    let ref = st.points[0];
    for (let i = st.points.length - 2; i >= 0; i--) {
      const q = st.points[i];
      if (Math.hypot(x - q.x, y - q.y) >= this.cfg.recentWindowPx) { ref = q; break; }
    }
    const dx = x - ref.x, dy = y - ref.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return;
    st.lastEmit = cur;
    this.events.emit('stroke', { dir: { x: dx / d, y: dy / d }, isNew: false });
  }

  pointerUp(id) {
    if (!this.pointers.has(id)) return;
    this.pointers.delete(id);
    if (this.activeId === id) this.activeId = null;
  }

  // recent points of the latest stroke, for drawing a fading finger trail
  trail(now, life = 0.25) {
    const out = [];
    for (const p of this.lastPoints) if (now - p.t <= life) out.push(p);
    return out;
  }
}
