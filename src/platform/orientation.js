// Forced landscape: when the viewport is portrait (auto-rotate off or phone held upright),
// the whole stage is rotated ±90° with CSS. Which side is picked from gravity so turning the
// phone 180° flips the picture. Pure functions — no DOM access.

// rotation in degrees: 0 (native landscape), 90 or -90 (forced)
// gravitySwitch: m/s² along device x needed to switch sides (look.ui.orientation)
export function chooseRotation(current, { vw, vh, gx }, gravitySwitch) {
  if (vw >= vh) return 0;
  if (gx != null && gx > gravitySwitch) return 90;
  if (gx != null && gx < -gravitySwitch) return -90;
  return current === 0 ? 90 : current;
}

export function stageSize(rot, vw, vh) {
  return rot === 0 ? { w: vw, h: vh } : { w: vh, h: vw };
}

// screen (client) point -> stage-local point
export function toStage(rot, sx, sy, vw, vh) {
  if (rot === 90) return { x: sy, y: vw - sx };
  if (rot === -90) return { x: vh - sy, y: sx };
  return { x: sx, y: sy };
}

// CSS transform for a stage positioned at the top-left with transform-origin: 0 0
export function stageTransform(rot, vw, vh) {
  if (rot === 90) return `translate(${vw}px, 0px) rotate(90deg)`;
  if (rot === -90) return `translate(0px, ${vh}px) rotate(-90deg)`;
  return 'none';
}
