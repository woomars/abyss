// 이펙트·모션 확인 page: every move of the screen test on its own little stage, looping, with the same sprites,
// the same acting (wind-up, snap, freeze, rock back) and the same tuned pixelfx effects (fxTuning.js). Canvas 2D only.
import { createFrame, clearFrame, createFx, composite } from './pixelfx/core/index.js';
import { FX, facing } from './fxTuning.js';

const BASE = '../../assets/qvtest/';
const W = 128, H = 80, GROUND = 60;
const HEROES = { pxHero: 'Puny', knight: '기사 원본', knightGen: '기사 생성' };
let sheets, heroKey = 'pxHero', speed = 1, fxOn = true;

// ---- sprites ----
function rowOf(sh, dx, dy) {
  const deg = Math.atan2(dy, dx) * 180 / Math.PI;
  if (sh.dirs === 1) return 0;
  if (sh.dirs === 3) return deg > 45 && deg < 135 ? 0 : deg < -45 && deg > -135 ? 2 : 1;
  return (((Math.round((sh.dir0 - deg) / 45)) % 8) + 8) % 8;
}

function body(key, x, y, dx = 0, dy = 1) {
  return { key, x, y, z: 0, dx, dy, anim: 'stand', at: 0, hold: null, state: 'idle', st: 0, rock: 0, fade: 1, flip: dx < 0 };
}

function face(b, dx, dy) {
  const l = Math.hypot(dx, dy) || 1;
  b.dx = dx / l; b.dy = dy / l;
  if (Math.abs(b.dx) > 0.2) b.flip = b.dx < 0;
}

function drawBody(ctx, b, clock) {
  const sh = sheets[b.key];
  const a = sh.anims[b.anim] || sh.anims.stand;
  const fps = b.anim === 'run' ? 12 : 6;
  const col = sh.still ? 0 : b.hold != null ? b.hold : a[0] + (Math.floor(b.at * fps) % a[1]);
  const i = (sh.still ? 0 : rowOf(sh, b.dx, b.dy)) * sh.perDir + col;
  const sx = (i % sh.cols) * sh.w, sy = Math.floor(i / sh.cols) * sh.h;
  // the same motion the game gives a one-facing still: lean back, snap forward, spin, flinch, step bob
  let rot = 0, lift = 0;
  const side = b.flip ? -1 : 1, mirror = (sh.still || sh.dirs === 3) && b.flip;
  if (sh.still) {
    if (b.state === 'swing') rot = [-0.22, -0.28, 0.32, 0.16][b.hold - sh.anims.swing[0]] || 0;
    else if (b.state === 'spin') rot = (b.st / 0.28) * Math.PI * 2;
    else if (b.state === 'dash') rot = 0.14;
    else if (b.state === 'hurt') rot = -0.25;
    else if (b.state === 'jump') rot = -0.12;
    else if (b.anim === 'run') { lift = Math.floor(clock * 10) % 2; rot = 0.05; }
    if (b.state !== 'spin') rot *= side;
  }
  const breath = b.anim === 'stand' && b.hold == null ? Math.sin(clock * 3.2) * 0.035 : 0;
  ctx.save();
  ctx.globalAlpha = b.fade;
  ctx.translate(Math.round(b.x), Math.round(b.y - b.z - lift));
  ctx.rotate(rot);
  ctx.scale((mirror ? -1 : 1) * (1 + b.rock * 0.3), 1 - b.rock * 0.22 + breath);
  ctx.drawImage(sh.img, sx, sy, sh.w, sh.h, -sh.anchor[0], -sh.anchor[1], sh.w, sh.h);
  ctx.restore();
}

function shadow(ctx, b, big = 1) {
  const w = Math.round(14 * big * (1 - Math.min(0.5, b.z / 110))), h = Math.max(3, Math.round(5 * big));
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  for (let y = 0; y < h; y++) {
    const r = Math.sqrt(1 - ((y + 0.5 - h / 2) / (h / 2)) ** 2) * w / 2;
    ctx.fillRect(Math.round(b.x - r), Math.round(b.y - h / 2 + y), Math.round(r * 2), 1);
  }
}

// ---- one stage ----
class Stage {
  constructor(def) {
    this.def = def;
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `<canvas width="${W}" height="${H}"></canvas><h2>${def.title}</h2><p>${def.desc}</p>`;
    document.getElementById('cards').appendChild(el);
    this.ctx = el.querySelector('canvas').getContext('2d');
    this.layers = ['back', 'front'].map(() => {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      return { frame: createFrame(W, H), img: new ImageData(W, H), c, g: c.getContext('2d') };
    });
    this.reset();
  }

  reset() {
    this.t = 0; this.prev = -1; this.freeze = 0; this.shake = 0; this.fx = []; this.ghosts = []; this.clock = 0; this.tele = null;
    this.hero = body(this.def.hero === false ? 'pxEnemy' : heroKey, 40, GROUND, 1, 0);
    this.foes = [];
    this.def.setup(this);
  }

  foe(x, y, key = 'pxEnemy') { const b = body(key, x, y, -1, 0); this.foes.push(b); return b; }
  at(time) { return this.prev < time && this.t >= time; }

  spawn(name, x, y, o = {}, place = {}) {
    if (!fxOn) return null;
    const pre = FX[name];
    const f = createFx(pre.mod, { ...pre.o, ...o, flip: !!place.flip, angle: place.angle || 0, seed: (Math.random() * 1e6) | 0 });
    const e = { f, x, y, follow: place.follow || null, lx: place.lx || 0, ly: place.ly || 0, dy: place.dy || 0, life: pre.life || 0 };
    this.fx.push(e);
    return e;
  }

  slash(name, b) {
    const f = facing(Math.atan2(b.dy, b.dx), FX[name].o.scale);
    return this.spawn(name, b.x, b.y, {}, { follow: b, ...f });
  }

  // a hit, acted: the target shows its white frame and rocks back, the picture freezes and shakes
  hit(t, from, crit = false) {
    const ax = t.x - from.x, ay = t.y - from.y, l = Math.hypot(ax, ay) || 1, aim = Math.atan2(ay, ax);
    t.rock = 1; t.state = 'hurt'; t.st = 0; t.kx = ax / l * (crit ? 70 : 45);
    this.freeze = Math.max(this.freeze, crit ? 0.14 : 0.08);
    this.shake = crit ? 2 : 1;
    const boss = t.key === 'pxBoss';
    if (crit && boss) { this.spawn('bossCrit', t.x, t.y, { aim }); this.spawn('bossCritNum', t.x, t.y, { text: '64!' }, { dy: -46 }); }
    else if (crit) { this.spawn('hitCrit', t.x, t.y, { aim }); this.spawn('numCrit', t.x, t.y, { text: '-32!' }, { dy: -20 }); }
    else { this.spawn('hit', t.x, t.y, boss ? { aim, height: 40 } : { aim }); this.spawn('num', t.x, t.y, { text: '-12' }, { dy: boss ? -40 : -18 }); }
  }

  step(dt) {
    if (this.freeze > 0) { this.freeze -= dt; this.paint(); return; }
    this.clock += dt;
    this.prev = this.t;
    this.t += dt;
    if (this.t >= this.def.len) { this.reset(); return; }
    this.def.update(this, dt);
    for (const b of [this.hero, ...this.foes]) {
      b.at += dt; b.st += dt;
      if (b.rock > 0) b.rock = Math.max(0, b.rock - dt / 0.12);
      if (b.state === 'hurt') {
        const sh = sheets[b.key];
        if (!sh.still) b.hold = sh.anims.die[0] + (b.st < 0.08 ? 0 : 1);
        if (b.kx) { b.x += b.kx * dt; b.kx *= Math.exp(-11 * dt); }
        if (b.st > 0.25) { b.state = 'idle'; b.hold = null; b.kx = 0; }
      }
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) if ((this.ghosts[i].t -= dt) <= 0) this.ghosts.splice(i, 1);
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const q = this.fx[i];
      q.f.update(dt);
      if (q.life && q.f.t >= q.life) { q.f.stop(); q.life = 0; }
      if (q.f.done()) this.fx.splice(i, 1);
    }
    this.paint();
  }

  paint() {
    const g = this.ctx, sx = this.shake && this.freeze > 0 ? Math.round(Math.random() * 2 - 1) * this.shake : 0;
    g.setTransform(1, 0, 0, 1, sx, 0);
    // floor
    g.fillStyle = '#2b2733'; g.fillRect(-4, 0, W + 8, H);
    g.fillStyle = '#25212c';
    for (let x = 0; x < W; x += 16) for (let y = 8; y < H; y += 16) if (((x + y) / 16) & 1) g.fillRect(x, y, 16, 16);
    g.fillStyle = '#2e2936'; g.fillRect(-4, 0, W + 8, 8);
    if (this.tele) this.tele(g);
    for (const L of this.layers) clearFrame(L.frame);
    for (const q of this.fx) {
      const ax = q.follow ? q.follow.x : q.x, ay = q.follow ? q.follow.y - (q.follow.z || 0) : q.y;
      q.f.options.x = Math.round(ax + q.lx); q.f.options.y = Math.round(ay + q.ly + q.dy);
      q.f.draw(this.layers[0].frame, 'back');
      q.f.draw(this.layers[1].frame, 'front');
    }
    for (const L of this.layers) { composite(L.frame, L.img.data, null); L.g.putImageData(L.img, 0, 0); }
    const all = [...this.foes, this.hero].filter((b) => b.fade > 0);
    for (const b of all) shadow(g, b, b.key === 'pxBoss' ? 2 : 1);
    g.drawImage(this.layers[0].c, 0, 0);
    for (const gh of this.ghosts) { g.globalAlpha = gh.t / 0.18 * 0.5; drawBody(g, gh.b, this.clock); g.globalAlpha = 1; }
    for (const b of this.foes.slice().sort((a, b2) => a.y - b2.y)) if (b.fade > 0) drawBody(g, b, this.clock);
    g.drawImage(this.layers[1].c, 0, 0);
    drawBody(g, this.hero, this.clock); // the hero over every effect, as in the game
  }
}

// ---- the moves ----
const swingHold = (b, k) => { b.state = 'swing'; b.hold = sheets[b.key].anims.swing[0] + k; };
// wind-up 0-0.06 (raise), snap to the cut at 0.06 (the hit), follow-through from 0.11, back to standing at 0.2
function actSwing(s, b, t0, onCut) {
  const u = s.t - t0;
  if (u < 0 || u > 0.2) { if (u > 0.2 && b.state === 'swing') { b.state = 'idle'; b.hold = null; } return; }
  if (u < 0.03) swingHold(b, 0); else if (u < 0.06) swingHold(b, 1);
  if (s.at(t0 + 0.06)) { swingHold(b, 2); onCut(); } else if (u >= 0.11) swingHold(b, 3);
}

const DEFS = [
  { title: '서기', desc: '숨쉬기(스프라이트 위아래 3.5% 늘었다 줄기). 정면.', len: 3,
    setup: (s) => { s.hero.x = 64; face(s.hero, 0, 1); }, update: () => {} },
  { title: '달리기 8방향', desc: '0.5초마다 방향이 45도씩 돕니다. Puny는 8방향 그림, 기사 생성은 앞·옆·뒤 3장 + 좌우 반전, 기사 원본은 한 장을 좌우 반전.', len: 4,
    setup: (s) => { s.hero.x = 64; s.hero.anim = 'run'; },
    update: (s) => { const a = Math.floor(s.t / 0.5) * Math.PI / 4; face(s.hero, Math.cos(a), Math.sin(a)); } },
  { title: '일반 베기', desc: '예비동작 → 베는 자세로 스냅 → 맞는 순간 0.08초 멈춤 → 마무리. 적은 하얀 프레임 + 반동.', len: 1.4,
    setup: (s) => { s.foe(64, GROUND); s.hero.x = 44; },
    update: (s) => actSwing(s, s.hero, 0.3, () => { s.slash('slash', s.hero); s.hit(s.foes[0], s.hero); }) },
  { title: '치명타', desc: '금색 불꽃과 금색 숫자, 멈춤 0.14초, 흔들림 2px.', len: 1.4,
    setup: (s) => { s.foe(64, GROUND); s.hero.x = 44; },
    update: (s) => actSwing(s, s.hero, 0.3, () => { s.slash('slash', s.hero); s.hit(s.foes[0], s.hero, true); }) },
  { title: '대쉬 연쇄', desc: '튕기면 잔상을 남기며 달려가 금색 베기, 다음 적에게 이어서 마지막은 X 베기.', len: 2,
    setup: (s) => { s.hero.x = 14; s.foe(60, GROUND - 6); s.foe(100, GROUND + 4); s.leg = 0; },
    update: (s) => {
      const h = s.hero, legs = [[0.2, 0.36, s.foes[0], 'slashDash'], [0.62, 0.78, s.foes[1], 'finisher']];
      for (const [a, z, t, fx] of legs) {
        if (s.t >= a && s.t < z) {
          const tx = t.x - 14, ty = t.y, k = (s.t - a) / (z - a);
          h.state = 'dash'; h.hold = sheets[h.key].anims.run[0] + 2; face(h, t.x - h.x, t.y - h.y);
          h.x += (tx - h.x) * Math.min(1, k * 1.6); h.y += (ty - h.y) * Math.min(1, k * 1.6);
          s.ghosts.push({ b: { ...h }, t: 0.18 });
        }
        actSwing(s, h, z - 0.06, () => { s.slash(fx, h); s.hit(t, h); });
      }
    } },
  { title: '회전 베기', desc: '0.28초에 한 바퀴씩 8방향 그림을 돌며 둘레의 적을 세 번 벱니다.', len: 1.6,
    setup: (s) => { s.hero.x = 64; s.foe(40, GROUND - 4); s.foe(88, GROUND - 2); s.foe(66, GROUND + 14); },
    update: (s) => {
      const h = s.hero, u = s.t - 0.3;
      if (s.at(0.3)) s.spawn('spin', h.x, h.y, {}, { follow: h });
      if (u >= 0 && u < 0.45) {
        h.state = 'spin'; h.st = u; h.hold = sheets[h.key].anims.swing[0] + 2;
        const a = u / 0.28 * Math.PI * 2; face(h, Math.cos(a), Math.sin(a));
        for (const tt of [0.34, 0.49, 0.64]) if (s.at(tt)) for (const f of s.foes) s.hit(f, h);
      } else if (u >= 0.45 && h.state === 'spin') { h.state = 'idle'; h.hold = null; face(h, 1, 0); }
    } },
  { title: '점프 내려찍기', desc: '포물선으로 뛰어올라(그림자는 작아짐) 내려찍고, 땅 충격과 함께 0.12초 멈춤.', len: 1.8,
    setup: (s) => { s.hero.x = 24; s.foe(80, GROUND - 4); s.foe(96, GROUND + 6); },
    update: (s) => {
      const h = s.hero, u = (s.t - 0.3) / 0.42, sw = sheets[h.key].anims.swing[0];
      if (u >= 0 && u < 1) { h.state = 'jump'; h.x = 24 + 58 * u; h.z = Math.sin(Math.PI * u) * 34; h.hold = sw + (u > 0.7 ? 2 : u > 0.35 ? 1 : 0); }
      if (s.at(0.72)) { h.z = 0; h.state = 'idle'; h.hold = null; s.spawn('land', h.x, h.y); s.freeze = 0.12; s.shake = 3; for (const f of s.foes) s.hit(f, h); s.freeze = 0.12; }
    } },
  { title: '질풍', desc: '회전 원반이 날아가며 줄 위의 적을 모두 벱니다.', len: 1.6,
    setup: (s) => { s.hero.x = 20; s.foe(72, GROUND); s.foe(104, GROUND); s.disc = null; },
    update: (s) => {
      const h = s.hero;
      if (s.at(0.3)) { h.anim = 'cast'; h.at = 0; }
      if (s.at(0.42)) { s.disc = { x: h.x + 10, y: h.y, z: 8, hit: new Set() }; s.discFx = s.spawn('wave', 0, 0, {}, { follow: s.disc }); }
      if (s.at(0.6)) h.anim = 'stand';
      const d = s.disc;
      if (d) {
        d.x += 230 * (s.t - s.prev);
        for (const f of s.foes) if (!d.hit.has(f) && Math.abs(f.x - d.x) < 10) { d.hit.add(f); s.hit(f, h); }
        if (d.x > W + 20) { if (s.discFx) s.discFx.f.stop(); s.disc = null; }
      }
    } },
  { title: '주인공 피격', desc: '적이 들어올렸다 내려치면, 주인공은 피격 프레임 + 보라 불꽃 + 넉백.', len: 1.6,
    setup: (s) => { s.hero.x = 52; s.foe(70, GROUND); },
    update: (s) => {
      const e = s.foes[0];
      actSwingFoe(s, e, 0.3);
      if (s.at(0.68)) { const h = s.hero; h.state = 'hurt'; h.st = 0; h.rock = 1; h.kx = -60; s.freeze = 0.06; s.shake = 2; s.spawn('hitHero', h.x, h.y, { aim: Math.PI }); }
    } },
  { title: '적 죽음', desc: '마지막 일격: 피격 → 쓰러짐 프레임 → 연기 퍼짐(0.7초에 걷힘).', len: 2,
    setup: (s) => { s.foe(66, GROUND); s.hero.x = 46; },
    update: (s) => {
      const e = s.foes[0];
      actSwing(s, s.hero, 0.3, () => { s.slash('slash', s.hero); s.hit(e, s.hero); });
      if (s.at(0.5)) { e.state = 'dead'; e.anim = 'die'; e.at = 0; e.hold = null; s.spawn('death', e.x, e.y); }
      if (e.state === 'dead') { const sh = sheets[e.key]; e.hold = sh.anims.die[0] + Math.min(sh.anims.die[1] - 1, Math.floor(e.at * 12)); if (e.at > 0.5) e.fade = Math.max(0, 1 - (e.at - 0.5) / 0.3); }
    } },
  { title: '보스 내려찍기', desc: '붉은 원으로 0.7초 예고 → 내려찍기 + 땅 충격 + 0.1초 멈춤.', len: 2.2, hero: false,
    setup: (s) => { s.hero = body('pxBoss', 52, GROUND + 4, 1, 0); },
    update: (s) => {
      const b = s.hero, sw = sheets.pxBoss.anims.swing[0], u = s.t - 0.2;
      if (u >= 0 && u < 0.7) { b.hold = sw + (u < 0.35 ? 0 : 1); const k = u / 0.7; s.tele = (g) => { g.fillStyle = 'rgba(255,40,40,0.14)'; ell(g, 86, GROUND + 4, 26, 12); g.fillStyle = 'rgba(255,50,50,0.28)'; ell(g, 86, GROUND + 4, 26 * k, 12 * k); }; }
      if (s.at(0.9)) { s.tele = null; b.hold = sw + 2; s.spawn('bossSlam', 86, GROUND + 4); s.freeze = 0.1; s.shake = 3; }
      if (s.at(1.4)) b.hold = null;
    } },
  { title: '보스 충격파', desc: '안에서 밖으로 세 고리가 차례로 예고되고 터집니다.', len: 2.4, hero: false,
    setup: (s) => { s.hero = body('pxBoss', 64, GROUND, 0, 1); s.hero.anim = 'block'; },
    update: (s) => {
      const b = s.hero, R = [[6, 18], [18, 30], [30, 42]], at = [0.8, 1.2, 1.6];
      s.tele = (g) => { for (let i = 0; i < 3; i++) { const k = Math.max(0, Math.min(1, (s.t - (at[i] - 0.6)) / 0.6)); if (k > 0 && s.t < at[i]) { g.fillStyle = `rgba(255,40,40,${0.1 + 0.2 * k})`; ring(g, 64, GROUND, R[i][0], R[i][1]); } } };
      for (let i = 0; i < 3; i++) if (s.at(at[i])) { s.spawn('quake', 64, GROUND, { reach: Math.round(R[i][1] / 0.7) }); s.freeze = 0.05; s.shake = 2; b.hold = sheets.pxBoss.anims.swing[0] + 2; }
      if (s.at(1.75)) b.hold = null;
    } },
  { title: '보스가 맞을 때 (치명타)', desc: '보스에게만 큰 별모양 치명타와 CRIT 숫자.', len: 1.6,
    setup: (s) => { s.foe(76, GROUND + 6, 'pxBoss'); s.hero.x = 40; },
    update: (s) => actSwing(s, s.hero, 0.3, () => { s.slash('slash', s.hero); s.hit(s.foes[0], s.hero, true); }) },
];

function actSwingFoe(s, e, t0) {
  const u = s.t - t0, sw = sheets[e.key].anims.swing[0];
  if (u < 0) return;
  e.hold = u < 0.3 ? sw : u < 0.38 ? sw + 1 : u < 0.48 ? sw + 2 : u < 0.6 ? sw + 3 : null;
}
function ell(g, cx, cy, rx, ry) { for (let y = -ry; y <= ry; y++) { const r = rx * Math.sqrt(Math.max(0, 1 - (y / ry) ** 2)); g.fillRect(Math.round(cx - r), Math.round(cy + y), Math.round(r * 2), 1); } }
function ring(g, cx, cy, r0, r1) { for (let y = -r1 / 2; y <= r1 / 2; y++) { const o = r1 * Math.sqrt(Math.max(0, 1 - (y / (r1 / 2)) ** 2)), i = (y / (r0 / 2)) ** 2 < 1 ? r0 * Math.sqrt(1 - (y / (r0 / 2)) ** 2) : 0; g.fillRect(Math.round(cx - o), Math.round(cy + y), Math.round(o - i), 1); g.fillRect(Math.round(cx + i), Math.round(cy + y), Math.round(o - i), 1); } }

// ---- boot ----
async function boot() {
  sheets = await fetch(BASE + 'sheets.json', { cache: 'no-cache' }).then((r) => r.json());
  await Promise.all(Object.values(sheets).map((s) => new Promise((ok, bad) => { s.img = new Image(); s.img.onload = ok; s.img.onerror = () => bad(new Error(s.image)); s.img.src = BASE + s.image; })));
  const stages = DEFS.map((d) => new Stage(d));
  const heroes = document.getElementById('heroes');
  heroes.innerHTML = Object.entries(HEROES).filter(([k]) => sheets[k]).map(([k, n]) => `<button data-hero="${k}" class="${k === heroKey ? 'on' : ''}">${n}</button>`).join('');
  document.querySelector('header').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.hero) { heroKey = b.dataset.hero; for (const x of heroes.children) x.classList.toggle('on', x === b); stages.forEach((s) => s.reset()); }
    if (b.dataset.speed) { speed = Number(b.dataset.speed); for (const x of document.querySelectorAll('[data-speed]')) x.classList.toggle('on', x === b); }
    if (b.id === 'fx') { fxOn = !fxOn; b.classList.toggle('on', fxOn); b.textContent = fxOn ? '켬' : '끔'; stages.forEach((s) => s.reset()); }
  });
  let last = performance.now();
  const tick = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000) * speed;
    last = now;
    for (const s of stages) s.step(dt);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

boot().catch((err) => { const d = document.createElement('div'); d.className = 'err'; d.textContent = String(err && err.stack || err); document.body.appendChild(d); });
