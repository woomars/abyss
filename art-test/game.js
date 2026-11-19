// svg -> pixel test (A): hero vs 10 skeleton soldiers + 1 orc warrior on floor 1. Dead enemies come back after 1 s.
// Numbers follow the real game (rules/enemies.json, combat.json, pressure.json); 1 art pixel = 1.5 world units.
// Hit tests are top-down (foot point / body circle against the telegraph masks); bodies are drawn in pseudo 3/4.
import * as PIXI from 'https://cdn.jsdelivr.net/npm/pixi.js@8.6.6/dist/pixi.min.mjs';

PIXI.TextureStyle.defaultOptions.scaleMode = 'nearest';
const S = 1.5, VW = 640, VH = 360;
const ARENA = { x0: 40, x1: VW * S - 40, y0: 100, y1: VH * S - 24 };
const P = (w) => Math.round(w / S);
const $ = (s) => document.querySelector(s);

const atlas = await (await fetch('out/atlas.json')).json();
const app = new PIXI.Application();
await app.init({ resizeTo: window, background: '#0c0a10', antialias: false, resolution: window.devicePixelRatio || 1, autoDensity: true });
document.body.prepend(app.canvas);

// ---------------------------------------------------------------- textures
const T = {}, MASK = {};
const cut = (source, m, i) => new PIXI.Texture({ source, frame: new PIXI.Rectangle((i % m.cols) * m.w, Math.floor(i / m.cols) * m.h, m.w, m.h) });
for (const [name, m] of Object.entries(atlas)) {
  const tex = await PIXI.Assets.load(`out/${name}.png`);
  const set = { f: [], w: null };
  for (let i = 0; i < m.n; i++) set.f.push(cut(tex.source, m, i));
  if (m.white) {
    const wt = await PIXI.Assets.load(`out/${name}_white.png`);
    set.w = []; for (let i = 0; i < m.n; i++) set.w.push(cut(wt.source, m, i));
  }
  T[name] = set;
  if (m.mask) { // the hit test reads these pixels: what you see is what hits
    const img = new Image(); img.src = `out/${name}.png`; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    MASK[name] = { data: g.getImageData(0, 0, c.width, c.height).data, W: c.width };
  }
}
$('#load').remove();

function maskHit(name, fi, dx, dy) {
  const m = atlas[name], k = MASK[name];
  const i = Math.floor(m.ax + dx), j = Math.floor(m.ay + dy);
  if (i < 0 || j < 0 || i >= m.w || j >= m.h) return false;
  return k.data[(((Math.floor(fi / m.cols) * m.h + j) * k.W) + (fi % m.cols) * m.w + i) * 4 + 3] > 0;
}
const frameOf = (name, key, k) => atlas[name].anims[key][k];
const count = (name, key) => atlas[name].anims[key].length;

// ---------------------------------------------------------------- scene
function sprite(name, parent, fi = 0) {
  const m = atlas[name], s = new PIXI.Sprite(T[name].f[fi]);
  s.anchor.set(m.ax / m.w, m.ay / m.h); s.asset = name;
  parent.addChild(s);
  return s;
}
function setFrame(s, fi, white = false) { const set = T[s.asset]; s.texture = (white && set.w ? set.w : set.f)[fi]; }
function setAsset(s, name) { if (s.asset === name) return; const m = atlas[name]; s.asset = name; s.anchor.set(m.ax / m.w, m.ay / m.h); }

const world = new PIXI.Container();
const ground = new PIXI.Container(), floorFx = new PIXI.Container(), trail = new PIXI.Container(), actors = new PIXI.Container(), top = new PIXI.Container(), ui = new PIXI.Graphics();
actors.sortableChildren = true;
world.addChild(ground, floorFx, trail, actors, top, ui);
for (let y = 0; y < VH; y += 32) for (let x = 0; x < VW; x += 32) sprite('floor', ground, (x * 7 + y * 3) / 32 % 4 | 0).position.set(x, y);
const rt = PIXI.RenderTexture.create({ width: VW, height: VH }); rt.source.scaleMode = 'nearest';
const screen = new PIXI.Sprite(rt); app.stage.addChild(screen);
let Z = 1, OX = 0, OY = 0;
function layout() {
  const bar = window.innerHeight < 500 ? 0 : 44; // phones: the bar floats over the picture
  const dpr = window.devicePixelRatio || 1, W = window.innerWidth, H = window.innerHeight - bar;
  const zp = Math.max(1, Math.floor(Math.min((W * dpr) / VW, (H * dpr) / VH))); // whole device pixels per art pixel
  Z = zp / dpr; OX = Math.round((W * dpr - VW * zp) / 2) / dpr; OY = bar + Math.round((H * dpr - VH * zp) / 2) / dpr;
  screen.scale.set(Z); screen.position.set(OX, OY);
}
window.addEventListener('resize', layout); layout();

// ---------------------------------------------------------------- helpers
const DIR = (dx, dy) => ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
const FACE = (d) => d === 0 ? ['right', 1] : d === 4 ? ['right', -1] : d <= 3 ? ['down', d === 3 ? -1 : 1] : ['up', d === 5 ? -1 : 1];
const clampA = (o) => { o.x = Math.max(ARENA.x0, Math.min(ARENA.x1, o.x)); o.y = Math.max(ARENA.y0, Math.min(ARENA.y1, o.y)); };
const rnd = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
let stop = 0, speed = 1, showPts = false;
const shake = { t: 0, dur: 1, amp: 0 };
function kick(amp, dur) { if (amp >= shake.amp * (shake.t / shake.dur)) Object.assign(shake, { t: dur, dur, amp }); }

const fx = []; // frame animations, or a single frame that fades (life)
function effect(name, key, x, y, fps, layer = top, o = {}) {
  const s = sprite(name, layer, frameOf(name, key, o.frame || 0));
  s.position.set(P(x), P(y) + (o.dy || 0));
  if (o.tint) s.tint = o.tint;
  if (o.alpha) s.alpha = o.alpha;
  fx.push({ s, name, key, n: o.life ? 0 : count(name, key), fps, t: 0, life: o.life || 0, a0: o.alpha || 1 });
}
const nums = [];
function number(v, px, py, col, scale = 1) {
  const str = String(v), w = 4 * scale, c = new PIXI.Container();
  c.position.set(Math.round(px - (str.length * w) / 2), Math.round(py));
  top.addChild(c);
  [...str].forEach((ch, i) => { const s = sprite('digits', c, frameOf('digits', col, +ch)); s.scale.set(scale); s.x = i * w + 2 * scale; });
  nums.push({ c, t: 0, y0: c.y });
}

// ---------------------------------------------------------------- rules (real game values)
const HERO = { r: 16, speed: 150, every: 0.35, dmg: 10, crit: 0.15, kb: [60, 180, 260], stun: [0.12, 0.25, 0.35], max: 5,
  dash: { range: 190, cone: 35, speed: 850, max: 0.35, past: 40, links: 3, linkRange: 140, linkMin: 35, linkCone: 45, delay: 0.04, free: 0.18 } };
const TYPES = {
  soldier: { art: 'skel', r: 14, hp: 20, atk: 5, speed: 95, range: 22, wind: 0.25, resist: 0, tg: 'tgSoldier', first: 'tgFirstS', slash: 'slashS', burst: 'burstS', shadow: 'shadow', windKey: 'wind', strikeKey: 'strike', head: 22 },
  elite: { art: 'orc', r: 26, hp: 90, atk: 20, speed: 70, range: 34, wind: 0.4, resist: 0.75, tg: 'tgOrc', first: 'tgFirstO', slash: 'slashE', burst: 'burstO', shadow: 'shadowBig', windKey: 'windCleave', strikeKey: 'strikeCleave', head: 34, counter: true },
};
const FIRST = { warn: 0.6, chance: 0.15, extra: 40, aggressive: 0.3 };
const COUNTER_WIN = 0.35, ANGRY = 1, RESPAWN = 1, DIE = 0.35;

// ---------------------------------------------------------------- hero
const hero = { x: 480, y: 330, face: 'down', flip: 1, state: 'idle', t: 0, at: 0, hp: 100, inv: 0, kx: 0, ky: 0, cool: 0, atk: null, dash: null, dust: 0, ghost: 0, mx: 0, my: 1 };
hero.shadow = sprite('shadow', floorFx); hero.shadow.alpha = 0.5;
hero.sp = sprite('hero', actors);
const preview = { edge: sprite('tgPlayer', floorFx), fill: sprite('tgPlayer', floorFx) };
const mouse = { x: 480, y: 270, held: false };
let target = null;
const ghosts = [];

// ---------------------------------------------------------------- enemies
const enemies = [];
function spawn(type, e = null) {
  const T_ = TYPES[type];
  let x, y; do { x = rnd(ARENA.x0, ARENA.x1); y = rnd(ARENA.y0, ARENA.y1); } while (Math.hypot(x - hero.x, y - hero.y) < 260);
  if (!e) {
    e = { type, T: T_, shadow: sprite(T_.shadow, floorFx), edge: sprite(T_.tg, floorFx), fill: sprite(T_.tg, floorFx), sp: sprite(T_.art, actors) };
    e.shadow.alpha = 0.5;
    if (T_.counter) { e.excl = sprite('excl', top); e.stars = sprite('stars', top); }
    enemies.push(e);
  }
  Object.assign(e, { x, y, hp: T_.hp, state: 'chase', t: 0, vx: 0, vy: 0, stun: 0, flash: 0, angry: 0, dmgd: false, kind: null, dur: 0, dir: 2, face: 'down', flip: 1, moving: false,
    aggressive: Math.random() < FIRST.aggressive, roll: rnd(0, 1) });
  e.sp.visible = e.shadow.visible = true;
  effect('dust', '', x, y, 10, floorFx);
  return e;
}
for (let i = 0; i < 10; i++) spawn('soldier');
spawn('elite');
const alive = (e) => e.state !== 'die';
const counterOpen = (e) => e.T.counter && e.state === 'wind' && e.kind === 'melee' && e.t >= e.dur - COUNTER_WIN;
const bodyPts = (e) => { const r = P(e.T.r), out = [[0, 0]]; for (let k = 0; k < 8; k++) out.push([Math.round(Math.cos(k * Math.PI / 4) * r), Math.round(Math.sin(k * Math.PI / 4) * r)]); return out; };
const bodyIn = (tg, fi, o, e) => bodyPts(e).some(([px, py]) => maskHit(tg, fi, P(e.x) + px - P(o.x), P(e.y) + py - P(o.y)));

function hitEnemy(e, ux, uy, strong) {
  const crit = Math.random() < HERO.crit, k = crit ? 2 : strong ? 1 : 0, counter = counterOpen(e);
  const dmg = Math.round(HERO.dmg * (crit ? 2 : 1) * (counter ? 3.5 : 1));
  e.hp -= dmg; e.flash = 0.1; e.dmgd = true; e.angry = ANGRY;
  const kb = HERO.kb[k] * (1 - e.T.resist) * 8;
  e.vx = ux * kb; e.vy = uy * kb; e.stun = Math.max(e.stun, HERO.stun[k]);
  stop = Math.max(stop, counter ? 0.16 : 0.08); kick(counter ? 9 : P(10), 0.25);
  effect('spark', `d${DIR(ux, uy)}`, e.x - ux * 6, e.y, 20, top, { dy: -Math.round(e.T.head * 0.45) });
  const hy = P(e.y) - e.T.head - 8;
  if (counter) {
    effect('counter', '', e.x, e.y, 14, top, { dy: -Math.round(e.T.head * 0.45) });
    Object.assign(e, { state: 'stagger', t: 0 });
    number(dmg, P(e.x), hy - 8, 'gold', 2);
    const w = sprite('word', top); w.position.set(P(e.x), hy - 16); words.push({ s: w, t: 0, y0: w.y });
  } else number(dmg, P(e.x) + rnd(-5, 5), hy, crit ? 'crit' : 'white', crit ? 2 : 1);
  if (e.hp <= 0) {
    Object.assign(e, { state: 'die', t: 0 });
    effect(e.T.burst, '', e.x, e.y, 12, top, { dy: -Math.round(e.T.head * 0.4) });
  }
}
const words = [];

function heroHurt(dmg, from) {
  if (hero.inv > 0) return;
  hero.hp -= dmg; if (hero.hp <= 0) hero.hp = 100;
  const dx = hero.x - from.x, dy = hero.y - from.y, l = Math.hypot(dx, dy) || 1;
  hero.inv = 0.5;
  if (!hero.dash) Object.assign(hero, { state: 'hurt', t: 0, kx: (dx / l) * 260, ky: (dy / l) * 260 });
  stop = Math.max(stop, 0.08); kick(P(10), 0.25);
  number(dmg, P(hero.x), P(hero.y) - 36, 'red');
}

// ---------------------------------------------------------------- hero: auto attack + dash chain
const aimDir = () => mouse.touch ? DIR(hero.mx, hero.my) : DIR(mouse.x - hero.x, mouse.y - hero.y); // touch: along the heading
function autoAttack() {
  const d = aimDir(), fi = frameOf('tgPlayer', `d${d}`, 8);
  const hits = enemies.filter((e) => alive(e) && bodyIn('tgPlayer', fi, hero, e))
    .sort((a, b) => Math.hypot(a.x - hero.x, a.y - hero.y) - Math.hypot(b.x - hero.x, b.y - hero.y)).slice(0, HERO.max);
  if (!hits.length) return false;
  hero.atk = { t: 0, dir: d };
  effect('slashP', `d${d}`, hero.x, hero.y, 18);
  for (const e of hits) { const dx = e.x - hero.x, dy = e.y - hero.y, l = Math.hypot(dx, dy) || 1; hitEnemy(e, dx / l, dy / l, false); }
  return true;
}
function pick(a, range, min, cone, skip) {
  let best = null, bd = 1e9;
  for (const e of enemies) {
    if (!alive(e) || e === skip) continue;
    const dx = e.x - hero.x, dy = e.y - hero.y, d = Math.hypot(dx, dy);
    if (d > range || d < min || angDiff(Math.atan2(dy, dx), a) > cone * Math.PI / 180) continue;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function link(tgt, a) {
  const D = HERO.dash, dash = hero.dash;
  if (tgt) { const dx = tgt.x - hero.x, dy = tgt.y - hero.y; a = Math.atan2(dy, dx); dash.left = Math.min(D.max, (Math.hypot(dx, dy) + D.past) / D.speed); }
  else dash.left = D.free;
  Object.assign(dash, { a, tgt, hit: new Set(), wait: 0 });
  [hero.face, hero.flip] = FACE(DIR(Math.cos(a), Math.sin(a)));
}
function startDash(a = Math.atan2(mouse.y - hero.y, mouse.x - hero.x)) {
  hero.mx = Math.cos(a); hero.my = Math.sin(a);
  hero.dash = { links: HERO.dash.links };
  hero.state = 'dash'; target = null;
  link(pick(a, HERO.dash.range, 0, HERO.dash.cone), a);
}
function updateDash(dt) {
  const D = HERO.dash, dash = hero.dash;
  if (dash.wait > 0) { dash.wait -= dt; if (dash.wait <= 0) link(dash.next, dash.a); return; }
  const ux = Math.cos(dash.a), uy = Math.sin(dash.a), st = Math.min(dash.left, dt) * D.speed;
  hero.x += ux * st; hero.y += uy * st; dash.left -= dt;
  const bx = hero.x, by = hero.y; clampA(hero); if (bx !== hero.x || by !== hero.y) dash.left = 0;
  for (const e of enemies) {
    if (!alive(e) || dash.hit.has(e)) continue;
    if (Math.hypot(e.x - hero.x, e.y - hero.y) <= e.T.r + HERO.r + 8) { dash.hit.add(e); hitEnemy(e, ux, uy, dash.links === 0); }
  }
  if ((hero.ghost -= dt) <= 0) { hero.ghost = 0.02; ghost(); }
  if (dash.left > 0) return;
  const next = dash.hit.size && dash.links > 0 ? pick(dash.a, D.linkRange, D.linkMin, D.linkCone, dash.tgt) : null;
  if (next) { dash.links--; dash.next = next; dash.wait = D.delay; }
  else { hero.dash = null; hero.state = 'idle'; }
}
function ghost() { // afterimage: the hero's silhouette left behind, under every body
  const s = sprite('hero', trail); setFrame(s, hero.sp.fi, true);
  s.scale.x = hero.flip; s.position.set(P(hero.x), P(hero.y)); s.tint = 0xc9a86a; s.alpha = 0.35;
  ghosts.push({ s, t: 0 });
  if (ghosts.length > 6) ghosts.shift().s.destroy();
}

function updateHero(dt) {
  hero.t += dt; hero.at += dt; hero.inv = Math.max(0, hero.inv - dt);
  if (hero.atk && (hero.atk.t += dt) >= 0.25) hero.atk = null;
  if (hero.dash) updateDash(dt);
  else if (hero.state === 'hurt') {
    hero.x += hero.kx * dt; hero.y += hero.ky * dt; hero.kx *= 0.82; hero.ky *= 0.82; clampA(hero);
    if (hero.t >= 0.25) hero.state = 'idle';
  } else {
    if (mouse.held) target = { x: mouse.x, y: mouse.y };
    if (target) {
      const dx = target.x - hero.x, dy = target.y - hero.y, l = Math.hypot(dx, dy);
      if (l < 3) { target = null; hero.state = 'idle'; }
      else {
        const st = Math.min(l, HERO.speed * dt);
        hero.x += (dx / l) * st; hero.y += (dy / l) * st; clampA(hero); hero.mx = dx / l; hero.my = dy / l;
        if (hero.state !== 'walk') { hero.state = 'walk'; hero.at = 0; }
        if ((hero.dust -= dt) <= 0) { hero.dust = 0.25; effect('dust', '', hero.x - hero.mx * 8, hero.y, 12, floorFx); }
      }
    } else hero.state = 'idle';
  }
  hero.cool -= dt;
  if (hero.cool <= 0 && !hero.dash && hero.state !== 'hurt' && autoAttack()) hero.cool = HERO.every;
}

// ---------------------------------------------------------------- enemy ai (default melee of the real game)
function windUp(e, kind, dx, dy) {
  Object.assign(e, { state: 'wind', t: 0, kind, dur: kind === 'melee' ? e.T.wind : FIRST.warn, dir: DIR(dx, dy) });
  [e.face, e.flip] = FACE(e.dir);
  setAsset(e.edge, kind === 'melee' ? e.T.tg : e.T.first); setAsset(e.fill, e.edge.asset);
}
function strike(e) {
  const tg = e.edge.asset, fi = frameOf(tg, `d${e.dir}`, 8);
  if (maskHit(tg, fi, P(hero.x) - P(e.x), P(hero.y) - P(e.y))) heroHurt(e.T.atk, e);
  effect(e.T.slash, `d${e.dir}`, e.x, e.y, 18);
  if (e.T.counter) effect(tg, `d${e.dir}`, e.x, e.y, 0, floorFx, { frame: 8, life: 0.35, tint: 0xff2a1a, alpha: 0.55 });
  Object.assign(e, { state: 'strike', t: 0 });
}
function updateEnemy(e, dt) {
  e.t += dt; e.flash = Math.max(0, e.flash - dt); e.stun = Math.max(0, e.stun - dt); e.angry = Math.max(0, e.angry - dt);
  e.x += e.vx * dt; e.y += e.vy * dt; const f = Math.exp(-8 * dt); e.vx *= f; e.vy *= f; clampA(e);
  if (e.state === 'die') { if (e.t >= RESPAWN) spawn(e.type, e); return; }
  const dx = hero.x - e.x, dy = hero.y - e.y, dist = Math.hypot(dx, dy) || 1, reach = e.T.r + HERO.r + e.T.range;
  e.moving = false;
  if (e.state === 'chase') {
    if (e.stun > 0) return;
    if (e.angry > 0 && dist <= reach) { e.angry = 0; return windUp(e, 'melee', dx, dy); }
    if (e.aggressive && dist <= reach + FIRST.extra && (e.roll -= dt) <= 0) { e.roll = 1; if (Math.random() < FIRST.chance) return windUp(e, 'first', dx, dy); }
    if (dist > reach * 0.8) { e.x += (dx / dist) * e.T.speed * dt; e.y += (dy / dist) * e.T.speed * dt; e.moving = true; }
    [e.face, e.flip] = FACE(DIR(dx, dy));
  } else if (e.state === 'wind') { if (e.t >= e.dur) strike(e); }
  else if (e.state === 'strike') { if (e.t >= 0.18) Object.assign(e, { state: 'recover', t: 0 }); }
  else if (e.state === 'recover') { if (e.t >= 0.3) Object.assign(e, { state: 'chase', t: 0 }); }
  else if (e.state === 'stagger') { if (e.t >= 1.3) Object.assign(e, { state: 'chase', t: 0 }); }
}
function separate() { // enemies push each other apart; the hero passes through them
  const L = enemies.filter(alive);
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = L[i], b = L[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, o = a.T.r + b.T.r - d;
    if (o > 0) { const wa = b.T.r / (a.T.r + b.T.r), wb = 1 - wa; a.x -= dx / d * o * wa; a.y -= dy / d * o * wa; b.x += dx / d * o * wb; b.y += dy / d * o * wb; }
  }
}

// ---------------------------------------------------------------- draw
function drawHero(time) {
  let key, k;
  if (hero.dash) { key = `dash_${hero.face}`; k = 0; }
  else if (hero.state === 'hurt') { key = `hurt_${hero.face}`; k = hero.t < 0.12 ? 0 : 1; }
  else if (hero.atk) { [hero.face, hero.flip] = FACE(hero.atk.dir); key = `attack_${hero.face}`; const t = hero.atk.t; k = t < 0.05 ? 0 : t < 0.1 ? 1 : t < 0.18 ? 2 : 3; }
  else if (hero.state === 'walk') { [hero.face, hero.flip] = FACE(DIR(hero.mx, hero.my)); key = `walk_${hero.face}`; k = Math.floor(hero.at * 10) % 4; }
  else { key = `idle_${hero.face}`; k = Math.floor(time * 2.5) % 2; }
  const fi = frameOf('hero', key, k), blink = hero.inv > 0 && Math.floor(hero.inv / 0.06) % 2 === 0;
  hero.sp.fi = fi; setFrame(hero.sp, fi, blink); hero.sp.tint = blink ? 0xff6a5c : 0xffffff;
  hero.sp.scale.x = hero.flip;
  hero.sp.position.set(P(hero.x), P(hero.y)); hero.shadow.position.set(P(hero.x), P(hero.y));
  // 3/4 depth by feet; while dashing through a body the hero goes behind it, only the afterimage shows the pass
  let z = hero.y;
  if (hero.dash) for (const e of enemies) if (alive(e) && Math.hypot(e.x - hero.x, e.y - hero.y) < e.T.r + HERO.r + 4) z = Math.min(z, e.y - 1);
  hero.sp.zIndex = z;
}
function drawEnemy(e, time) {
  const A = e.T.art, f = e.face;
  let key, k = 0;
  e.edge.visible = e.fill.visible = e.state === 'wind';
  if (e.excl) e.excl.visible = counterOpen(e), e.stars.visible = e.state === 'stagger';
  if (e.state === 'die') {
    const n = count(A, `die_${f}`); key = `die_${f}`; k = Math.min(n - 1, Math.floor(e.t / DIE * n));
    e.sp.visible = e.t < DIE + 0.1 || Math.floor(e.t / 0.05) % 2 === 0;
    e.shadow.visible = e.t < DIE;
    if (e.t >= RESPAWN - 0.25) e.sp.visible = false;
  } else if (e.state === 'wind') { key = `${e.T.windKey}_${f}`; k = e.t < e.dur * 0.45 ? 0 : 1; }
  else if (e.state === 'strike') key = `${e.T.strikeKey}_${f}`;
  else if (e.state === 'stagger') { key = `stagger_${f}`; k = Math.floor(e.t * 5) % 2; }
  else if (e.state === 'recover' && A === 'orc') { key = `recover_${f}`; k = e.t < 0.15 ? 0 : 1; }
  else if (e.stun > 0) key = `hurt_${f}`;
  else { key = `${e.moving ? 'walk' : 'idle'}_${f}`; k = Math.floor(time * (e.moving ? 8 : 2.5)) % count(A, key); }
  setFrame(e.sp, frameOf(A, key, k), e.flash > 0);
  e.sp.scale.x = e.flip;
  const quiver = counterOpen(e) ? Math.floor(time * 30) % 2 : 0, wob = e.stun > 0 && e.state === 'chase' ? Math.round(Math.sin(e.t * 60)) : 0;
  e.sp.position.set(P(e.x) + quiver + wob, P(e.y)); e.sp.zIndex = e.y;
  e.shadow.position.set(P(e.x), P(e.y));
  if (e.state === 'wind') { // telegraph on the floor: the exact area that hits, filling up
    const kk = `d${e.dir}`, q = e.t / e.dur, open = counterOpen(e);
    for (const s of [e.edge, e.fill]) s.position.set(P(e.x), P(e.y));
    setFrame(e.edge, frameOf(e.edge.asset, kk, 0)); setFrame(e.fill, frameOf(e.fill.asset, kk, Math.max(1, Math.min(8, Math.ceil(q * 8)))));
    e.edge.tint = open ? 0xff3040 : e.t < 0.12 ? 0xffebc8 : 0xff4637; e.fill.tint = 0xff3c32;
    e.edge.alpha = open ? (Math.floor(time * 16) % 2 ? 1 : 0.55) : 0.75 + 0.25 * q;
    e.fill.alpha = 0.15 + 0.3 * q;
  }
  if (e.excl?.visible) { setFrame(e.excl, frameOf('excl', '', Math.floor(time * 12) % 2)); e.excl.position.set(P(e.x), P(e.y) - e.T.head - 6); }
  if (e.stars?.visible) { setFrame(e.stars, frameOf('stars', '', Math.floor(time * 10) % 4)); e.stars.position.set(P(e.x), P(e.y) - e.T.head - 2); }
}
function draw(time) {
  drawHero(time);
  for (const e of enemies) drawEnemy(e, time);
  // hero's next swing: the exact cone of the auto attack, toward the mouse
  const d = hero.atk ? hero.atk.dir : aimDir(), kd = `d${d}`, fi = frameOf('tgPlayer', kd, 8);
  const inside = enemies.filter((e) => alive(e) && bodyIn('tgPlayer', fi, hero, e));
  setFrame(preview.edge, frameOf('tgPlayer', kd, 0)); setFrame(preview.fill, fi);
  for (const s of [preview.edge, preview.fill]) { s.position.set(P(hero.x), P(hero.y)); s.tint = inside.length ? (inside.some(counterOpen) ? 0xffd84a : 0xffffff) : 0x7ae8ff; }
  preview.edge.alpha = inside.length ? 0.7 : 0.4; preview.fill.alpha = inside.length ? 0.12 : 0.06;
  preview.edge.visible = preview.fill.visible = !hero.dash;
  ui.clear();
  for (const e of enemies) { // elite bar only once damaged (soldiers never show one)
    if (!e.T.counter || !e.dmgd || !alive(e)) continue;
    const w = P(e.T.r * 2.2), bx = P(e.x) - (w >> 1), by = P(e.y) - e.T.head - 4;
    ui.rect(bx - 1, by - 1, w + 2, 4).fill(0x20141a).rect(bx, by, Math.max(0, Math.round((w * e.hp) / e.T.hp)), 2).fill(0xd0453f);
  }
  ui.rect(VW - 109, 7, 102, 6).fill(0x140f1a).rect(VW - 108, 8, Math.round(hero.hp), 4).fill(0x6ee07a); // top right: the bar floats top left on phones
  if (showPts) { // top-down hit circles (feet)
    for (const e of enemies) if (alive(e)) ui.circle(P(e.x), P(e.y), P(e.T.r)).stroke({ width: 1, color: 0x00ffff });
    ui.circle(P(hero.x), P(hero.y), P(HERO.r)).stroke({ width: 1, color: 0xff00ff });
  }
}

function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const e = fx[i]; e.t += dt;
    if (e.life) { if (e.t >= e.life) { e.s.destroy(); fx.splice(i, 1); } else e.s.alpha = e.a0 * (1 - e.t / e.life); continue; }
    const k = Math.floor(e.t * e.fps);
    if (k >= e.n) { e.s.destroy(); fx.splice(i, 1); continue; }
    setFrame(e.s, frameOf(e.name, e.key, k));
  }
  for (let i = ghosts.length - 1; i >= 0; i--) {
    const g = ghosts[i]; g.t += dt;
    if (g.t >= 0.12) { g.s.destroy(); ghosts.splice(i, 1); } else g.s.alpha = 0.35 * (1 - g.t / 0.12);
  }
  for (let i = nums.length - 1; i >= 0; i--) {
    const e = nums[i]; e.t += dt;
    if (e.t >= 0.8) { e.c.destroy({ children: true }); nums.splice(i, 1); continue; }
    e.c.y = Math.round(e.y0 - (40 / S) * e.t);
    e.c.visible = e.t < 0.6 || Math.floor(e.t / 0.05) % 2 === 0;
  }
  for (let i = words.length - 1; i >= 0; i--) {
    const e = words[i]; e.t += dt;
    if (e.t >= 1) { e.s.destroy(); words.splice(i, 1); continue; }
    e.s.y = Math.round(e.y0 - 8 * Math.min(1, e.t / 0.2)); e.s.visible = e.t < 0.7 || Math.floor(e.t / 0.05) % 2 === 0;
  }
}

// ---------------------------------------------------------------- input
const toWorld = (e) => ({ x: ((e.clientX - OX) / Z) * S, y: ((e.clientY - OY) / Z) * S });
app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
const press = { x: 0, y: 0, t: 0 };
app.canvas.addEventListener('pointerdown', (e) => {
  Object.assign(mouse, toWorld(e)); mouse.touch = e.pointerType !== 'mouse';
  Object.assign(press, { x: e.clientX, y: e.clientY, t: performance.now() });
  if (e.button === 0) { mouse.held = true; if (!hero.dash && hero.state !== 'hurt') { target = { x: mouse.x, y: mouse.y }; effect('marker', '', mouse.x, mouse.y, 12, floorFx); } }
  if (e.button === 2 && !hero.dash && hero.state !== 'hurt') startDash();
});
window.addEventListener('pointermove', (e) => Object.assign(mouse, toWorld(e)));
window.addEventListener('pointerup', (e) => {
  if (e.button !== 0) return;
  mouse.held = false;
  // flick (real game input.json: <= 0.25 s, >= 30 px, >= 500 px/s) = dash along the flick
  const dx = e.clientX - press.x, dy = e.clientY - press.y, l = Math.hypot(dx, dy), dt = (performance.now() - press.t) / 1000;
  if (dt <= 0.25 && l >= 30 && l / dt >= 500 && !hero.dash && hero.state !== 'hurt') { target = null; startDash(Math.atan2(dy, dx)); }
});
document.querySelectorAll('[data-speed]').forEach((b) => b.onclick = () => { speed = +b.dataset.speed; document.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === b)); });
$('#pts').onclick = (e) => { showPts = !showPts; e.target.classList.toggle('on', showPts); };

// ---------------------------------------------------------------- loop
let time = 0;
app.ticker.add((tk) => {
  const real = Math.min(0.05, tk.deltaMS / 1000) * speed;
  let dt = real;
  if (stop > 0) { stop -= dt; dt = 0; } // hit stop: the whole world holds
  time += dt;
  if (dt > 0) { updateHero(dt); for (const e of enemies) updateEnemy(e, dt); separate(); updateFx(dt); }
  shake.t = Math.max(0, shake.t - real);
  const a = shake.amp * (shake.t / shake.dur);
  world.position.set(Math.round(rnd(-a, a)), Math.round(rnd(-a, a)));
  draw(time);
  app.renderer.render({ container: world, target: rt, clear: true });
});
window.__t = { hero, enemies, mouse, startDash, windUp };
