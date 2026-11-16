// Shared bits of the two-layer hp bar (HUD, treasure room): whole numbers, rounded.
export const hpText = (hp, maxHp) => `HP ${Math.round(hp)} / ${Math.round(maxHp)}`;

// markup: white trail behind the red fill, text on top
export const hpBarHtml = (cls = 'hp') => `<div class="${cls}"><div class="hp-trail"></div><div class="hp-fill"></div><span class="hp-text"></span></div>`;

// paint a bar made by hpBarHtml; trail = the white bar's hp (HpTrail.trail), or hp when there is none
export function paintHpBar(el, hp, maxHp, trail = hp) {
  const pct = (v) => `${Math.max(0, Math.min(100, (100 * v) / maxHp))}%`;
  el.querySelector('.hp-fill').style.width = pct(hp);
  el.querySelector('.hp-trail').style.width = pct(Math.max(hp, trail));
  el.querySelector('.hp-text').textContent = hpText(hp, maxHp);
}
