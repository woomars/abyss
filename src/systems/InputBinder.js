// Wires DOM pointer events on the canvas to a StrokeTracker (CSS px coordinates, seconds).
export function bindInput(canvas, tracker, { onFirstPointer } = {}) {
  let first = true;
  const now = (e) => (e.timeStamp || performance.now()) / 1000;

  canvas.addEventListener('pointerdown', (e) => {
    if (first) { first = false; onFirstPointer && onFirstPointer(); }
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    tracker.pointerDown(e.pointerId, e.clientX, e.clientY, now(e));
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    // coalesced events give smoother strokes on high-rate touch screens
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    if (list && list.length) {
      for (const c of list) tracker.pointerMove(e.pointerId, c.clientX, c.clientY, now(c));
    } else {
      tracker.pointerMove(e.pointerId, e.clientX, e.clientY, now(e));
    }
    e.preventDefault();
  });
  const end = (e) => { tracker.pointerUp(e.pointerId, now(e)); };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}
