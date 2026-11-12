// Small line icons for treasures (inline SVG, so they look the same on every phone).
const P = {
  sword: '<path d="M19 3l2 2-10 10-3 1 1-3z"/><path d="M6 14l4 4M5 19l2-2M4 16l4 4"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  potion: '<path d="M10 3h4M11 3v5l-5 8a3 3 0 0 0 2.6 4.5h6.8A3 3 0 0 0 18 16l-5-8V3"/><path d="M8.5 14h7"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  boots: '<path d="M7 3h5v9l7 3v4H5V3z"/><path d="M5 15h14"/>',
  gold: '<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7"/><path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
  hourglass: '<path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9"/>',
  fang: '<path d="M4 5h16l-3 5-2 9-3-7-3 7-2-9z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M12 7v10"/>',
  chain: '<rect x="2.5" y="9" width="10" height="6" rx="3"/><rect x="11.5" y="9" width="10" height="6" rx="3"/>',
  helm: '<path d="M4 15a8 8 0 0 1 16 0v4H4z"/><path d="M12 7v12M4 15h16"/>',
  gloves: '<path d="M7 21v-8l-2-3 1-2 3 3V5a1.5 1.5 0 0 1 3 0v5V4a1.5 1.5 0 0 1 3 0v6V6a1.5 1.5 0 0 1 3 0v9l-2 6z"/>',
  amulet: '<path d="M6 3c0 6 3 8 6 8s6-2 6-8"/><path d="M12 11l4 5-4 5-4-5z"/>',
  ring: '<circle cx="12" cy="14" r="6"/><path d="M9 6l3-3 3 3-3 2z"/>',
  bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  anvil: '<path d="M3 7h13c0 3 2 4 5 4v2H8l-2 3h3v3H5v-3h1L4 11H3z"/>',
};

export function relicIcon(name, size = 24) {
  return `<svg class="ricon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.gold}</svg>`;
}
