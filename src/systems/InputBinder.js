// Wires DOM pointer events on the canvas to a StrokeTracker (stage-local CSS px, seconds).
// toLocal maps client coordinates into the (possibly rotated) stage.
export function bindInput(canvas, tracker, { toLocal = (x, y) => ({ x, y }) } = {}) {
  const now = (e) => (e.timeStamp || performance.now()) / 1000;

  canvas.addEventListener('pointerdown', (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    const p = toLocal(e.clientX, e.clientY);
    tracker.pointerDown(e.pointerId, p.x, p.y, now(e));
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    // coalesced events give smoother strokes on high-rate touch screens
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    const samples = list && list.length ? list : [e];
    for (const c of samples) {
      const p = toLocal(c.clientX, c.clientY);
      tracker.pointerMove(e.pointerId, p.x, p.y, now(c));
    }
    e.preventDefault();
  });
  const end = (e) => { tracker.pointerUp(e.pointerId, now(e)); };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}
