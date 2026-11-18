// 질풍: the dash's gold sword crescent cut loose, flying along its angle (abyss's own pixelfx-style effect).
// Local space faces +x with the origin at the blade's middle; the game moves the origin and turns it to the flight.
// A crescent bulging forward (white rim cooling to deep gold inward), two fainter dithered echoes behind it,
// a glint at each tip and a warm glow round it. The radius and width match the dash slash at its game scale.
import { fit, clamp } from '../pixelfx/core/index.js';

export const meta = {
  name: 'Flying blade',
  desc: 'A gold sword crescent flying out along its angle, with echoes behind and glinting tips.',
  tags: ['projectile', 'slash', 'sword', 'directional', 'one-shot'],
  size: [80, 64],
  origin: [40, 32],
  duration: 0.6,
  loop: false,
  fps: 30,
  options: { palette: ['#3a2a10', '#7a5a1a', '#c8962a', '#f0c850', '#fff0a0', '#fffbe0', '#ffffff'], radius: 24, width: 7, seed: 1 },
};

const SPAN = 0.85; // half the crescent's angle, radians (about 36 px tip to tip at radius 24, like the dash slash)

export function create(o) {
  const C = fit(o.palette, 7), R = o.radius, Wd = o.width;
  // a crescent whose arc passes through (x, 0) and bulges toward +x
  const crescent = (p, x, w, alpha, cool) => {
    const cx = x - R, taper = (u) => w * Math.pow(Math.sin(Math.PI * u), 0.7);
    p.arc(cx, 0, R, taper, -SPAN, SPAN, (u, v) => {
      const s = clamp(v + cool);
      return s > 0.82 ? C[6] : s > 0.6 ? C[5] : s > 0.38 ? C[4] : s > 0.18 ? C[3] : C[2];
    }, alpha);
  };
  let t = 0;
  return {
    update(dt) { t += dt; },
    draw(p) {
      const born = clamp(t / 0.05), w = Wd * (0.6 + 0.4 * born) * (1 - 0.25 * clamp((t - 0.4) / 0.2));
      crescent(p, -11, w * 0.6, 0.25, -0.35); // echoes trail behind and cool
      crescent(p, -5, w * 0.8, 0.5, -0.2);
      crescent(p, 0, w, 1, 0);
      // the tips glint, the blade glows
      const tx = -R + Math.cos(SPAN) * R, ty = Math.sin(SPAN) * R, g = 0.5 + 0.5 * Math.sin(t * 40);
      for (const s of [-1, 1]) { p.dot(tx, s * ty, C[6]); p.dot(tx - 1, s * ty, C[5], g); }
      p.glow(-3, 0, R * 0.8, C[4], 0.28);
      p.glowLine(-2, -R * 0.6, -2, R * 0.6, 4, C[5], 0.2);
    },
  };
}
