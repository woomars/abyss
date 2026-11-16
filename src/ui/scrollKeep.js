// Re-rendering a screen with innerHTML throws its scroll positions away; keep them across the redraw.
// root: anything with querySelector; selectors: the scrolling parts to remember (the first match each)
export function captureScroll(root, selectors) {
  const m = new Map();
  for (const s of selectors) { const el = root.querySelector(s); if (el) m.set(s, el.scrollTop); }
  return m;
}

export function restoreScroll(root, map) {
  if (!map) return;
  for (const [s, top] of map) { const el = root.querySelector(s); if (el) el.scrollTop = top; }
}
