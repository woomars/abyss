// Mage sigil: a magic circle on the floor that keeps its mage untouchable while it stands. It does not
// move or attack; break it.
export const sigilAI = {
  init(e) { e.ai = { spin: e.id * 0.7 }; },
  onStun() {},
  update(e, dt) { e.ai.spin += dt * e.root.ai.sigil.spinSpeed; return { x: 0, y: 0 }; },
};
