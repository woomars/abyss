// Shared bits of the two-layer hp bar (HUD, treasure room): whole numbers, rounded up.
export const hpText = (hp, maxHp) => `HP ${Math.ceil(hp - 1e-9)} / ${Math.ceil(maxHp - 1e-9)}`; // rounded up: never 0 while alive

// markup: white trail behind the red fill, text on top
export const hpBarHtml = (cls = 'hp') => `<div class="${cls}"><div class="hp-trail"></div><div class="hp-fill"></div><span class="hp-text"></span></div>`;

// paint a bar made by hpBarHtml; trail / red = the white and red bars' hp (HpTrail), or hp when there is none
export function paintHpBar(el, hp, maxHp, trail = hp, red = hp) {
  const pct = (v) => `${Math.max(0, Math.min(100, (100 * v) / maxHp))}%`;
  el.querySelector('.hp-fill').style.width = pct(Math.min(hp, red));
  el.querySelector('.hp-trail').style.width = pct(Math.max(hp, trail));
  el.querySelector('.hp-text').textContent = hpText(hp, maxHp);
}
