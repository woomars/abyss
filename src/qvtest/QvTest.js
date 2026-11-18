// Debug "화면 테스트" (throwaway spike): the chosen look, D = pixel art in a 3/4 top-down room, on PixiJS v8.
// The world is drawn at true pixel resolution (1 px = 2 world units) and scaled up with hard edges, so the
// sprites (Puny Characters, CC0) and the pixelfx effects (MIT, vendored in ./pixelfx) share one pixel grid.
// Hits are acted the pixelfx way: wind-up, snap, freeze on contact, the target rocks back, recovery.
// Feel the controls and read the fps with 0/50/100/150 enemies on a phone. Debug text is Korean only.
import { createFrame, clearFrame, createFx, composite } from './pixelfx/core/index.js';
import { FX, facing } from './fxTuning.js';

const PIXI_URL = 'https://cdn.jsdelivr.net/npm/pixi.js@8.6.6/dist/pixi.min.mjs';
const BASE = 'assets/qvtest/';
const PX = 2; // world units per screen pixel
const PILLAR_H = 120;
const KIND = { hero: 'pxHero', zombie: 'pxEnemy', boss: 'pxBoss' };
const CAP = { num: 6, crit: 1, hit: 10, death: 8 }; // live pixelfx instances per group (the oldest goes first)

const CSS = `
.qvt{position:absolute;inset:0;z-index:60;background:#0a0a10;touch-action:none;user-select:none;-webkit-user-select:none;overflow:hidden}
.qvt canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;image-rendering:pixelated;image-rendering:crisp-edges}
.qvt-fps{position:absolute;left:calc(6px + env(safe-area-inset-left));top:4px;font:12px/1.35 monospace;color:#9f9;background:rgba(0,0,0,.5);padding:3px 7px;border-radius:4px;pointer-events:none;white-space:pre}
.qvt-top{position:absolute;right:calc(6px + env(safe-area-inset-right));top:4px;display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;max-width:62%}
.qvt button{font:600 13px system-ui,sans-serif;color:#eee;background:rgba(30,30,44,.82);border:1px solid #556;border-radius:6px;padding:6px 9px;touch-action:manipulation}
.qvt button.on{background:#3a5a8a;border-color:#8af}
.qvt-sk{position:absolute;right:calc(10px + env(safe-area-inset-right));bottom:10px;width:230px;height:170px;pointer-events:none}
.qvt-sk button{position:absolute;width:60px;height:60px;border-radius:50%;padding:0;font-size:14px;pointer-events:auto}
.qvt-sk button.big{width:78px;height:78px;font-size:16px}
.qvt-boss{position:absolute;left:50%;top:40px;transform:translateX(-50%);width:36%;height:8px;background:#311;border:1px solid #a44;display:none;pointer-events:none}
.qvt-boss i{display:block;height:100%;width:100%;background:#d33}
.qvt-stick{position:absolute;width:96px;height:96px;margin:-48px 0 0 -48px;border:2px solid rgba(255,255,255,.22);border-radius:50%;pointer-events:none;display:none}
.qvt-stick i{position:absolute;left:50%;top:50%;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;background:rgba(255,255,255,.28)}
.qvt-help{position:absolute;left:calc(8px + env(safe-area-inset-left));bottom:6px;font:11px/1.4 system-ui,sans-serif;color:#8a8aa0;pointer-events:none}
.qvt-err{position:absolute;inset:60px 20px auto;color:#f88;font:13px monospace;white-space:pre-wrap}
`;

const rnd = (a, b) => a + Math.random() * (b - a);
const len = (x, y) => Math.hypot(x, y) || 1e-6;

export async function openQvTest(root, opts) {
  const t = new QvTest(root, opts);
  try { await t.init(); } catch (err) { t.fail(err); }
  return t;
}

class QvTest {
  constructor(root, { config, toLocal, onClose }) {
    this.toLocal = toLocal;
    this.onClose = onClose;
    // the largest combat room (by area), pillars included
    this.room = [...config.dungeon.rooms.combat].sort((a, b) => b.w * b.h - a.w * a.h)[0];
    this.viewH = 420;
    this.fxOn = true;
    this.enemies = [];
    this.fx = []; // sprite fx (afterimages)
    this.pfx = []; // pixelfx instances
    this.waves = [];
    this.hitstop = 0;
    this.shakeT = 0;
    this.shakeAmp = 0;
    this.moveDir = null;
    this.keys = new Set();
    this.buffer = null;
    this.clock = 0;
    this.stats = { frames: 0, time: 0, worst: 0, sum: 0 };

    if (!document.getElementById('qvt-css')) {
      const s = document.createElement('style');
      s.id = 'qvt-css';
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    this.el = document.createElement('div');
    this.el.className = 'qvt';
    this.el.innerHTML = `
      <div class="qvt-fps">불러오는 중...</div>
      <div class="qvt-top">
        <button data-a="n" data-n="0">적 0</button><button data-a="n" data-n="50" class="on">적 50</button><button data-a="n" data-n="100">적 100</button><button data-a="n" data-n="150">적 150</button>
        <button data-a="hero">주인공: Puny</button><button data-a="boss">보스</button><button data-a="fx" class="on">이펙트</button><button data-a="zoom">확대 129%</button><button data-a="close">닫기</button>
      </div>
      <div class="qvt-boss"><i></i></div>
      <div class="qvt-stick"><i></i></div>
      <div class="qvt-sk">
        <button data-k="attack" class="big" style="right:0;bottom:0">공격</button>
        <button data-k="dash" style="right:88px;bottom:2px">대쉬</button>
        <button data-k="spin" style="right:158px;bottom:14px">회전</button>
        <button data-k="jump" style="right:8px;bottom:88px">점프</button>
        <button data-k="wave" style="right:78px;bottom:72px">질풍</button>
      </div>
      <div class="qvt-help">끌기: 이동 · 짧게 튕기기: 대쉬 베기(연쇄) · 톡: 공격 | PC: WASD, J 공격, K 대쉬, L 점프, U 회전, I 질풍</div>`;
    root.appendChild(this.el);
    this.fpsEl = this.el.querySelector('.qvt-fps');
    this.bossBar = this.el.querySelector('.qvt-boss');
    this.stickEl = this.el.querySelector('.qvt-stick');
    this.el.querySelector('.qvt-top').addEventListener('pointerdown', (e) => {
      const b = e.target.closest('button');
      e.stopPropagation();
      if (!b) return;
      e.preventDefault();
      const a = b.dataset.a;
      if (a === 'close') this.close();
      if (!this.app) return;
      if (a === 'n') this.setEnemies(Number(b.dataset.n));
      if (a === 'boss') this.toggleBoss();
      if (a === 'hero') { const order = ['pxHero', 'knight', 'knightGen'].filter((k) => this.sheets[k]); this.setHero(order[(order.indexOf(this.heroArt) + 1) % order.length]); }
      if (a === 'fx') { this.fxOn = !this.fxOn; b.classList.toggle('on', this.fxOn); if (!this.fxOn) this.pfx.length = 0; }
      if (a === 'zoom') { this.viewH = this.viewH === 540 ? 420 : this.viewH === 420 ? 340 : 540; b.textContent = `확대 ${Math.round(540 / this.viewH * 100)}%`; this.layout(); }
    });
    this.el.querySelector('.qvt-sk').addEventListener('pointerdown', (e) => {
      const b = e.target.closest('button');
      e.stopPropagation();
      if (!b) return;
      e.preventDefault();
      if (this.app) this.act(b.dataset.k);
    });
  }

  fail(err) {
    console.error(err);
    const d = document.createElement('div');
    d.className = 'qvt-err';
    d.textContent = `불러오기 실패\n${err && err.stack || err}`;
    this.el.appendChild(d);
  }

  async init() {
    const P = this.P = await import(PIXI_URL);
    const app = new P.Application();
    await app.init({ width: 320, height: 210, resolution: 1, autoDensity: false, antialias: false, roundPixels: true, background: '#0a0a10', preference: 'webgl', powerPreference: 'high-performance' });
    this.el.prepend(app.canvas);
    this.sheets = await fetch(BASE + 'sheets.json', { cache: 'no-cache' }).then((r) => r.json());
    const files = [...Object.values(this.sheets).map((s) => s.image), 'px_dirt.png', 'px_grass1.png'];
    await P.Assets.load(files.map((f) => BASE + f));
    const tex = (f) => { const t = P.Assets.get(BASE + f); t.source.scaleMode = 'nearest'; return t; };
    for (const s of Object.values(this.sheets)) {
      const src = tex(s.image).source;
      s.tex = Array.from({ length: 8 * s.perDir }, (_, i) => new P.Texture({ source: src, frame: new P.Rectangle((i % s.cols) * s.w, Math.floor(i / s.cols) * s.h, s.w, s.h) }));
    }

    // camera (world units, scaled to pixels) > floor / telegraphs / shadows / pixelfx back / sorted bodies; pixelfx front on top
    this.world = new P.Container();
    this.world.scale.set(1 / PX);
    this.floor = new P.Container();
    this.tele = new P.Graphics();
    this.shadows = new P.Container();
    this.fxBack = new P.Sprite(P.Texture.EMPTY);
    this.fxBack.scale.set(PX);
    this.bodies = new P.Container();
    this.bodies.sortableChildren = true;
    this.world.addChild(this.floor, this.tele, this.shadows, this.fxBack, this.bodies);
    this.fxFront = new P.Sprite(P.Texture.EMPTY);
    // the hero is drawn above every effect, so a swing, a spark or a dust cloud never hides him
    this.top = new P.Container();
    this.top.scale.set(1 / PX);
    app.stage.addChild(this.world, this.fxFront, this.top);
    this.app = app;

    this.shadowTex = this.shadowTexture();
    this.drawFloor(tex('px_dirt.png'), tex('px_grass1.png'));
    for (const p of this.room.pillars) this.drawPillar(p);
    this.player = this.actor('hero', 16);
    this.top.addChild(this.player.sprite);
    this.heroArt = 'pxHero';
    Object.assign(this.player, { x: 300, y: this.room.h / 2, hp: 100, maxHp: 100, state: 'free', invuln: 0, chain: null });
    this.cam = { x: this.player.x, y: this.player.y };
    this.layout();
    this.setEnemies(50);
    this.bindInput();
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
    app.ticker.add(() => this.tick(Math.min(0.05, app.ticker.deltaMS / 1000), app.ticker.deltaMS));
  }

  // the canvas is the pixel grid: viewH world units tall = viewH / PX pixels, scaled up by CSS with hard edges
  layout() {
    const cw = this.el.clientWidth || 1, ch = this.el.clientHeight || 1;
    this.ph = Math.round(this.viewH / PX);
    this.pw = Math.round(this.ph * cw / ch);
    this.app.renderer.resize(this.pw, this.ph);
    if (this.layers) for (const L of this.layers) L.tex.destroy(true);
    this.layers = ['back', 'front'].map(() => {
      const c = document.createElement('canvas');
      c.width = this.pw; c.height = this.ph;
      const t = this.P.Texture.from(c);
      t.source.scaleMode = 'nearest';
      return { frame: createFrame(this.pw, this.ph), img: new ImageData(this.pw, this.ph), ctx: c.getContext('2d'), tex: t };
    });
    this.fxBack.texture = this.layers[0].tex;
    this.fxFront.texture = this.layers[1].tex;
    this.pfxDirty = true;
  }

  // a hard-edged pixel ellipse (sprite-gen style contact shadow)
  shadowTexture() {
    const c = document.createElement('canvas'), w = 16, h = 6;
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.38)';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - w / 2) / (w / 2), dy = (y + 0.5 - h / 2) / (h / 2);
      if (dx * dx + dy * dy <= 1) g.fillRect(x, y, 1, 1);
    }
    const t = this.P.Texture.from(c);
    t.source.scaleMode = 'nearest';
    return t;
  }

  drawFloor(dirt, grass) {
    const P = this.P, W = this.room.w, H = this.room.h;
    const ground = new P.TilingSprite({ texture: dirt, width: W / PX, height: H / PX });
    ground.scale.set(PX);
    ground.tint = 0x6f6878;
    this.floor.addChild(ground);
    // a few mossy patches so the floor is not one flat pattern
    for (let i = 0; i < 26; i++) {
      const w = Math.round(rnd(2, 6)) * 16, h = Math.round(rnd(1, 4)) * 16;
      const g = new P.TilingSprite({ texture: grass, width: w, height: h });
      g.position.set(Math.floor(rnd(0, W - w * PX) / 32) * 32, Math.floor(rnd(0, H - h * PX) / 32) * 32);
      g.scale.set(PX);
      g.tint = 0x6c7562;
      this.floor.addChild(g);
    }
    // the north wall face (seen in 3/4), the rest a dark rim
    const wall = new P.Graphics();
    wall.rect(-24, -PILLAR_H, W + 48, PILLAR_H).fill(0x2e2936);
    for (let x = 0; x < W; x += 64) wall.rect(x, -PILLAR_H + 40, 2, PILLAR_H - 40).fill(0x26222d);
    wall.rect(-24, -PILLAR_H - 16, W + 48, 16).fill(0x4b4557);
    wall.rect(-24, -PILLAR_H, 24, H + PILLAR_H + 24).fill(0x15121b);
    wall.rect(W, -PILLAR_H, 24, H + PILLAR_H + 24).fill(0x15121b);
    wall.rect(-24, H, W + 48, 24).fill(0x15121b);
    this.floor.addChild(wall);
  }

  // a stone block: front face and top, in 3/4
  drawPillar(p) {
    const g = new this.P.Graphics();
    g.rect(p.x, p.y + p.h - PILLAR_H, p.w, PILLAR_H).fill(0x38323f);
    g.rect(p.x, p.y + p.h - PILLAR_H, p.w, 4).fill(0x2a2531);
    g.rect(p.x, p.y - PILLAR_H, p.w, p.h).fill(0x4b4557).stroke({ width: 4, color: 0x5d5669, alignment: 1 });
    g.zIndex = p.y + p.h;
    this.bodies.addChild(g);
  }

  // ---- actors ----
  actor(kind, r) {
    const P = this.P, sh = this.sheets[KIND[kind]];
    const sprite = new P.Sprite(sh.tex[0]);
    sprite.anchor.set(sh.anchor[0] / sh.w, sh.anchor[1] / sh.h);
    const shadow = new P.Sprite(this.shadowTex);
    shadow.anchor.set(0.5);
    this.bodies.addChild(sprite);
    this.shadows.addChild(shadow);
    return { kind, sh, sprite, shadow, r, x: 0, y: 0, z: 0, kx: 0, ky: 0, face: 0, dx: 0, dy: 1, anim: 'stand', at: 0, fps: 6, loop: true, hold: null, flash: 0, rock: 0, st: 0, alive: true };
  }

  // Puny rows: row 0 faces south, then 45deg counter-clockwise on screen
  faceTo(e, dx, dy) {
    const deg = Math.atan2(dy, dx) * 180 / Math.PI;
    if (e.sh.dirs === 3) { // front / side / back rows, the left side mirrored
      e.face = deg > 45 && deg < 135 ? 0 : deg < -45 && deg > -135 ? 2 : 1;
      e.flipX = Math.abs(deg) > 90;
    } else {
      e.face = e.sh.dirs === 1 ? 0 : (((Math.round((e.sh.dir0 - deg) / 45)) % 8) + 8) % 8;
      if (Math.abs(dx) > 0.2 * len(dx, dy)) e.flipX = dx < 0; // a one-facing still turns by mirroring (straight up/down keeps the last side)
    }
    const l = len(dx, dy);
    e.dx = dx / l; e.dy = dy / l;
  }

  play(e, anim, fps, loop = true) {
    if (e.anim !== anim) { e.anim = anim; e.at = 0; }
    e.fps = fps; e.loop = loop; e.hold = null;
  }

  animate(e, dt) {
    e.at += dt;
    const a = e.sh.anims[e.anim];
    let k = Math.floor(e.at * e.fps);
    k = e.loop ? k % a[1] : Math.min(k, a[1] - 1);
    e.sprite.texture = e.sh.still ? e.sh.tex[0] : e.sh.tex[e.face * e.sh.perDir + (e.hold != null ? e.hold : a[0] + k)];
  }

  sync(e) {
    const s = e.sprite;
    s.position.set(e.x, e.y - e.z);
    s.zIndex = e.y;
    // rocked back by a hit (squash, easing out), else a slow breath while standing (sprite-gen "Breathe")
    const breath = e.anim === 'stand' && e.hold == null ? Math.sin(this.clock * 3.2 + e.x * 0.01) * 0.035 : 0;
    s.scale.set(PX * (1 + e.rock * 0.3), PX * (1 - e.rock * 0.22 + breath));
    s.rotation = 0;
    if (e.sh.still) this.stillPose(e, s);
    else if (e.sh.dirs === 3 && e.flipX) s.scale.x *= -1;
    s.tint = e.flash > 0 ? 0xff7a7a : 0xffffff;
    s.alpha = e.fade != null ? e.fade : (e.invuln > 0 && Math.floor(e.invuln * 20) % 2 ? 0.45 : 1);
    e.shadow.position.set(e.x, e.y);
    e.shadow.alpha = e.fade != null ? e.fade : 1;
    e.shadow.scale.set(PX * e.r / 16 * (e.shadowK || 1) * (1 - Math.min(0.5, e.z / 220)));
  }

  // one still drawing, moved by code: a step bob, a lean back for the wind-up, a snap forward on the cut, a spin, a flinch
  stillPose(e, s) {
    const side = e.flipX ? -1 : 1;
    let rot = 0, lift = 0;
    if (e.state === 'swing') rot = [-0.22, -0.28, 0.32, 0.16][e.hold - e.sh.anims.swing[0]] || 0;
    else if (e.state === 'spin') rot = (e.st / 0.28) * Math.PI * 2 * side;
    else if (e.state === 'dash') rot = 0.14;
    else if (e.state === 'hurt') rot = -0.25;
    else if (e.state === 'jump') rot = -0.12;
    else if (e.state === 'cast') rot = e.st < 0.12 ? -0.2 : 0.25;
    else if (e.anim === 'run') { lift = Math.floor(this.clock * 10) % 2; rot = 0.05; }
    s.scale.x *= side;
    s.rotation = e.state === 'spin' ? rot : rot * side;
    s.y -= lift * PX;
  }

  // 주인공 비교: Puny warrior (8 directions) or the user's knight (one still, mirrored and moved by code)
  setHero(art) {
    const p = this.player;
    this.heroArt = art;
    if (!this.sheets[art]) return;
    p.sh = this.sheets[art];
    p.sprite.anchor.set(p.sh.anchor[0] / p.sh.w, p.sh.anchor[1] / p.sh.h);
    p.shadowK = 1;
    this.faceTo(p, p.dx, p.dy);
    this.el.querySelector('[data-a="hero"]').textContent = { pxHero: '주인공: Puny', knight: '주인공: 기사 원본', knightGen: '주인공: 기사 생성' }[art];
  }

  all() { return this.boss ? [this.player, ...this.enemies, this.boss] : [this.player, ...this.enemies]; }
  targets() { return this.boss && this.boss.alive ? [...this.enemies.filter((e) => e.alive), this.boss] : this.enemies.filter((e) => e.alive); }

  freeSpot(minFromPlayer) {
    const R = this.room;
    for (let i = 0; i < 40; i++) {
      const x = rnd(60, R.w - 60), y = rnd(60, R.h - 60);
      if (R.pillars.some((p) => x > p.x - 30 && x < p.x + p.w + 30 && y > p.y - 30 && y < p.y + p.h + 30)) continue;
      if (this.player && len(x - this.player.x, y - this.player.y) < minFromPlayer) continue;
      return { x, y };
    }
    return { x: R.w - 100, y: R.h / 2 };
  }

  setEnemies(n) {
    while (this.enemies.length > n) { const e = this.enemies.pop(); e.sprite.destroy(); e.shadow.destroy(); }
    while (this.enemies.length < n) {
      const e = this.actor('zombie', 14);
      this.respawn(e);
      this.enemies.push(e);
    }
    for (const b of this.el.querySelectorAll('[data-a="n"]')) b.classList.toggle('on', Number(b.dataset.n) === n);
  }

  respawn(e) {
    Object.assign(e, this.freeSpot(320), { hp: 40, maxHp: 40, state: 'chase', st: 0, cd: rnd(0, 1), spd: rnd(52, 78), alive: true, fade: null, kx: 0, ky: 0, flash: 0, rock: 0 });
    this.faceTo(e, rnd(-1, 1), rnd(-1, 1));
    this.play(e, 'stand', 6);
  }

  toggleBoss() {
    if (this.boss) { this.boss.sprite.destroy(); this.boss.shadow.destroy(); this.boss = null; this.bossBar.style.display = 'none'; this.tele.clear(); }
    else {
      const b = this.boss = this.actor('boss', 30);
      Object.assign(b, this.freeSpot(450), { hp: 900, maxHp: 900, state: 'idle', st: 0, alive: true, fade: null });
      this.play(b, 'stand', 6);
      this.bossBar.style.display = 'block';
    }
    this.el.querySelector('[data-a="boss"]').classList.toggle('on', !!this.boss);
  }

  // ---- input ----
  bindInput() {
    const cv = this.app.canvas;
    const loc = (e) => this.toLocal(e.clientX, e.clientY);
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.stick) return;
      const p = loc(e);
      this.stick = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y, t0: performance.now() };
      Object.assign(this.stickEl.style, { display: 'block', left: p.x + 'px', top: p.y + 'px' });
    });
    cv.addEventListener('pointermove', (e) => {
      const s = this.stick;
      if (!s || e.pointerId !== s.id) return;
      const p = loc(e);
      s.x = p.x; s.y = p.y;
      const dx = s.x - s.ox, dy = s.y - s.oy, l = len(dx, dy);
      this.moveDir = l > 12 ? { x: dx / l, y: dy / l } : null;
      const k = Math.min(1, 34 / l);
      this.stickEl.firstElementChild.style.transform = `translate(${dx * k}px,${dy * k}px)`;
    });
    const up = (e) => {
      const s = this.stick;
      if (!s || e.pointerId !== s.id) return;
      const dur = (performance.now() - s.t0) / 1000, dx = s.x - s.ox, dy = s.y - s.oy, l = len(dx, dy);
      if (dur < 0.25 && l > 30 && l / dur > 450) this.act('dash', { x: dx / l, y: dy / l }); // flick
      else if (dur < 0.3 && l < 12) this.act('attack'); // tap
      this.stick = null;
      this.moveDir = null;
      this.stickEl.style.display = 'none';
      this.stickEl.firstElementChild.style.transform = '';
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    const KEY = { j: 'attack', k: 'dash', l: 'jump', u: 'spin', i: 'wave' };
    this.onKey = (e) => {
      const k = e.key.toLowerCase();
      if (e.type === 'keydown') {
        if (KEY[k] && !e.repeat) this.act(KEY[k]);
        this.keys.add(k);
      } else this.keys.delete(k);
      if (k === 'escape') this.close();
    };
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
  }

  keyDir() {
    const k = this.keys, dx = (k.has('d') || k.has('arrowright')) - (k.has('a') || k.has('arrowleft')), dy = (k.has('s') || k.has('arrowdown')) - (k.has('w') || k.has('arrowup'));
    if (!dx && !dy) return null;
    const l = len(dx, dy);
    return { x: dx / l, y: dy / l };
  }

  // actions wait (0.25s buffer) until the hero is free; a dash may cut a swing short after its hit
  act(kind, dir = null) {
    const p = this.player;
    const free = p.state === 'free' || (kind === 'dash' && p.state === 'swing' && p.hitDone);
    if (!free) { this.buffer = { kind, dir, t: 0.25 }; return; }
    this.buffer = null;
    const d = dir || this.moveDir || this.keyDir() || { x: p.dx, y: p.dy };
    if (kind === 'attack') {
      const t = this.pick(d, 120, 180);
      if (t) { this.faceTo(p, t.x - p.x, t.y - p.y); const dist = len(t.x - p.x, t.y - p.y) - t.r - p.r; if (dist > 30) this.step(p, p.dx * (dist - 30), p.dy * (dist - 30)); }
      else this.faceTo(p, d.x, d.y);
      this.startSwing(false);
    }
    if (kind === 'dash') {
      p.chain = { left: 3, hit: new Set() };
      const t = this.pick(d, 330, 55);
      this.faceTo(p, d.x, d.y);
      this.startDash(t, d);
    }
    if (kind === 'jump') {
      const t = this.pick(d, 340, 70);
      const tx = t ? t.x : p.x + d.x * 230, ty = t ? t.y : p.y + d.y * 230;
      this.faceTo(p, tx - p.x, ty - p.y);
      Object.assign(p, { state: 'jump', st: 0, jx: p.x, jy: p.y, tx, ty, invuln: 0.5 });
      this.play(p, 'swing', 0); p.hold = p.sh.anims.swing[0];
    }
    if (kind === 'spin') {
      Object.assign(p, { state: 'spin', st: 0, hits: 0, a0: Math.atan2(p.dy, p.dx) });
      this.spawn('spin', p, {}, { follow: p });
    }
    if (kind === 'wave') { this.faceTo(p, d.x, d.y); Object.assign(p, { state: 'cast', st: 0, fired: false }); this.play(p, 'cast', 16, false); }
  }

  // nearest live target within range and inside the cone around dir
  pick(d, range, coneDeg) {
    const p = this.player, cos = Math.cos(coneDeg * Math.PI / 180);
    let best = null, bd = Infinity;
    for (const t of this.targets()) {
      const dx = t.x - p.x, dy = t.y - p.y, l = len(dx, dy);
      if (l > range + t.r || (dx * d.x + dy * d.y) / l < cos || (p.chain && p.chain.hit.has(t))) continue;
      if (l < bd) { bd = l; best = t; }
    }
    return best;
  }

  // the swing is acted: wind-up (raise) 0-0.06, snap to the cut at 0.06 (the hit), follow-through, recovery
  startSwing(fromDash) {
    const p = this.player;
    Object.assign(p, { state: 'swing', st: fromDash ? 0.06 : 0, hitDone: false, fromDash });
    this.play(p, 'swing', 0);
    p.hold = p.sh.anims.swing[0];
  }

  startDash(t, d) {
    const p = this.player;
    const tx = t ? t.x - (t.x - p.x) / len(t.x - p.x, t.y - p.y) * (t.r + p.r + 6) : p.x + d.x * 200;
    const ty = t ? t.y - (t.y - p.y) / len(t.x - p.x, t.y - p.y) * (t.r + p.r + 6) : p.y + d.y * 200;
    if (t) this.faceTo(p, t.x - p.x, t.y - p.y);
    Object.assign(p, { state: 'dash', st: 0, tx, ty, target: t, ghost: 0, invuln: Math.max(p.invuln, 0.2) });
    this.play(p, 'run', 0); p.hold = p.sh.anims.run[0] + 2;
  }

  // ---- hits ----
  hit(t, dmg, dx, dy, kn, stun = 0.22) {
    const crit = Math.random() < 0.15;
    if (crit) { dmg *= 2; kn *= 1.5; }
    t.hp -= dmg;
    t.flash = 0.06;
    t.rock = 1;
    this.freeze(crit ? 0.14 : 0.08, crit ? 2 : 1);
    const aim = Math.atan2(dy, dx), big = t === this.boss;
    if (crit) {
      // the big starburst only on the boss: on a crowd it buries the fight
      this.spawn(big ? 'bossCrit' : 'hitCrit', t, { aim });
      if (big) this.spawn('bossCritNum', t, { text: `${Math.round(dmg)}!` }, { dy: -46 });
      else this.spawn('numCrit', t, { text: `-${Math.round(dmg)}!` }, { dy: -20 });
    } else {
      this.spawn('hit', t, big ? { aim, height: 40 } : { aim });
      this.spawn('num', t, { text: `-${Math.round(dmg)}` }, { dy: big ? -40 : -18 });
    }
    if (t.hp <= 0) { this.kill(t); return; }
    if (big) { t.kx += dx * 40; t.ky += dy * 40; return; }
    Object.assign(t, { state: 'hurt', st: 0, stun, kx: dx * kn, ky: dy * kn });
  }

  kill(t) {
    Object.assign(t, { alive: false, state: 'dead', st: 0 });
    this.play(t, 'die', 12, false);
    this.spawn('death', t);
  }

  hurtPlayer(dmg, dx, dy, kn = 240) {
    const p = this.player;
    if (p.invuln > 0 || p.state === 'jump') return;
    p.hp -= dmg;
    if (p.hp <= 0) p.hp = p.maxHp; // a test: the hero never falls
    Object.assign(p, { state: 'hurt', st: 0, kx: dx * kn, ky: dy * kn, invuln: 0.7, flash: 0.12, rock: 1, chain: null });
    this.buffer = null;
    this.freeze(0.06, 2);
    this.spawn('hitHero', p, { aim: Math.atan2(dy, dx) });
  }

  // freeze on contact (pixelfx "stop") and throw the picture a few whole pixels
  freeze(stop, amp) {
    this.hitstop = Math.max(this.hitstop, stop);
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeT = Math.max(this.shakeT, stop + 0.08);
  }

  slash() {
    const p = this.player, R = p.fromDash ? 95 : 85, cos = Math.cos(65 * Math.PI / 180);
    const last = p.fromDash && p.chain && p.chain.left === 0;
    this.spawnDir(last ? 'finisher' : p.fromDash ? 'slashDash' : 'slash', p);
    for (const t of this.targets()) {
      const dx = t.x - p.x, dy = t.y - p.y, l = len(dx, dy);
      if (l > R + t.r || (dx * p.dx + dy * p.dy) / l < cos) continue;
      this.hit(t, p.fromDash ? 16 : 12, dx / l, dy / l, p.fromDash ? 300 : 220);
      if (p.chain) p.chain.hit.add(t);
    }
  }

  aoe(x, y, R, dmg, kn) {
    for (const t of this.targets()) {
      const dx = t.x - x, dy = t.y - y, l = len(dx, dy);
      if (l < R + t.r) this.hit(t, dmg, dx / l, dy / l, kn);
    }
  }

  // ---- pixelfx ----
  // anchored to a world point (or a body that it follows); lx/ly/dy in pixels; the oldest of a capped group makes room
  spawn(name, at, o = {}, { dy = 0, follow = null, flip = false, angle = 0, lx = 0, ly = 0 } = {}) {
    if (!this.fxOn) return null;
    const pre = FX[name], group = pre.group || null, life = pre.life || 0;
    const f = createFx(pre.mod, { ...pre.o, ...o, flip, angle, seed: Math.floor(Math.random() * 1e6) });
    const e = { f, wx: at.x, wy: at.y, follow, dy, group, lx, ly, life };
    if (group && CAP[group]) {
      const same = this.pfx.filter((q) => q.group === group);
      if (same.length >= CAP[group]) this.pfx.splice(this.pfx.indexOf(same[0]), 1);
    }
    this.pfx.push(e);
    return e;
  }

  // a side-view swing turned to face the hero's way: mirrored when facing left, its arc centre carried ahead of the body
  spawnDir(name, p) {
    const f = facing(Math.atan2(p.dy, p.dx), FX[name].o.scale);
    return this.spawn(name, p, {}, { follow: p, ...f });
  }

  drawPixelFx(dt, frozen) {
    for (let i = this.pfx.length - 1; i >= 0; i--) {
      const q = this.pfx[i];
      if (!frozen) q.f.update(dt);
      if (q.life && q.f.t >= q.life) { q.f.stop(); q.life = 0; } // long dust clouds are cut short: the fight stays readable
      if (q.f.done()) this.pfx.splice(i, 1);
    }
    if (!this.pfx.length && !this.pfxDirty) return;
    this.pfxDirty = this.pfx.length > 0; // one more pass clears the last frame
    const wx0 = this.world.x, wy0 = this.world.y;
    for (const L of this.layers) clearFrame(L.frame);
    for (const q of this.pfx) {
      const ax = q.follow ? q.follow.x : q.wx, ay = q.follow ? q.follow.y - (q.follow.z || 0) : q.wy;
      q.f.options.x = Math.round(wx0 + ax / PX + q.lx);
      q.f.options.y = Math.round(wy0 + ay / PX + q.ly + q.dy);
      q.f.draw(this.layers[0].frame, 'back');
      q.f.draw(this.layers[1].frame, 'front');
    }
    for (const L of this.layers) {
      composite(L.frame, L.img.data, null);
      L.ctx.putImageData(L.img, 0, 0);
      L.tex.source.update();
    }
    this.fxBack.position.set(-wx0 * PX, -wy0 * PX);
  }

  ghost(p) {
    const sp = new this.P.Sprite(p.sprite.texture);
    sp.anchor.copyFrom(p.sprite.anchor);
    sp.position.copyFrom(p.sprite.position);
    sp.scale.copyFrom(p.sprite.scale);
    sp.rotation = p.sprite.rotation;
    sp.zIndex = p.sprite.zIndex - 1;
    sp.tint = 0x66bbff;
    sp.blendMode = 'add';
    this.bodies.addChild(sp);
    this.fx.push({ sp, t: 0, dur: 0.18 });
  }

  // ---- movement ----
  step(e, mx, my) {
    const R = this.room;
    let x = e.x + mx, y = e.y + my;
    for (const p of R.pillars) {
      const nx = Math.max(p.x, Math.min(x, p.x + p.w)), ny = Math.max(p.y, Math.min(y, p.y + p.h));
      const dx = x - nx, dy = y - ny, d = Math.hypot(dx, dy);
      if (d < e.r) {
        if (d > 0.001) { x = nx + dx / d * e.r; y = ny + dy / d * e.r; }
        else x = p.x - e.r; // centre inside: push out to the left
      }
    }
    e.x = Math.max(e.r, Math.min(R.w - e.r, x));
    e.y = Math.max(e.r, Math.min(R.h - e.r, y));
  }

  knock(e, dt) {
    if (!e.kx && !e.ky) return;
    this.step(e, e.kx * dt, e.ky * dt);
    const f = Math.exp(-11 * dt);
    e.kx *= f; e.ky *= f;
    if (Math.abs(e.kx) + Math.abs(e.ky) < 4) { e.kx = 0; e.ky = 0; }
  }

  // ---- per frame ----
  tick(dt, ms) {
    this.measure(dt, ms);
    const frozen = this.hitstop > 0;
    if (frozen) this.hitstop -= dt;
    else {
      this.clock += dt;
      this.updatePlayer(dt);
      this.updateWaves(dt);
      for (const e of this.enemies) this.updateEnemy(e, dt);
      if (this.boss) this.updateBoss(dt);
      this.separate();
      for (const e of this.all()) {
        this.animate(e, dt);
        if (e.flash > 0) e.flash -= dt;
        if (e.rock > 0) e.rock = Math.max(0, e.rock - dt / 0.12);
      }
      for (let i = this.fx.length - 1; i >= 0; i--) {
        const f = this.fx[i];
        f.t += dt;
        f.sp.alpha = 0.6 * (1 - f.t / f.dur);
        if (f.t >= f.dur) { f.sp.destroy(); this.fx.splice(i, 1); }
      }
    }
    for (const e of this.all()) this.sync(e);
    if (this.boss) this.bossBar.firstElementChild.style.width = `${Math.max(0, this.boss.hp / this.boss.maxHp) * 100}%`;
    this.camera(dt);
    this.drawPixelFx(dt, frozen);
  }

  camera(dt) {
    const p = this.player, k = 1 - Math.exp(-dt / 0.12);
    this.cam.x += (p.x - this.cam.x) * k;
    this.cam.y += (p.y - this.cam.y) * k;
    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      sx = Math.round((Math.random() * 2 - 1) * this.shakeAmp);
      sy = Math.round((Math.random() * 2 - 1) * this.shakeAmp);
    } else this.shakeAmp = 0;
    // whole pixels only, so the pixel grid never swims
    this.world.position.set(Math.round(this.pw / 2 - this.cam.x / PX) + sx, Math.round(this.ph / 2 - (this.cam.y - 20) / PX) + sy);
    this.top.position.copyFrom(this.world.position);
  }

  measure(dt, ms) {
    const s = this.stats;
    s.frames++; s.time += dt; s.sum += ms; s.worst = Math.max(s.worst, ms);
    if (s.time >= 0.5) {
      const n = this.enemies.length + (this.boss ? 1 : 0);
      this.fpsEl.textContent = `${Math.round(s.frames / s.time)} fps  평균 ${(s.sum / s.frames).toFixed(1)}ms  최악 ${s.worst.toFixed(0)}ms\n적 ${n} · 픽셀 ${this.pw}x${this.ph} · 이펙트 ${this.pfx.length}`;
      s.frames = 0; s.time = 0; s.sum = 0; s.worst = 0;
    }
  }

  updatePlayer(dt) {
    const p = this.player;
    p.st += dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (this.buffer && (this.buffer.t -= dt) <= 0) this.buffer = null;
    const sw = p.sh.anims.swing[0];
    if (p.state === 'free') {
      if (this.buffer) { const b = this.buffer; this.act(b.kind, b.dir); if (p.state !== 'free') return; }
      const d = this.moveDir || this.keyDir();
      if (d) { this.faceTo(p, d.x, d.y); this.step(p, d.x * 230 * dt, d.y * 230 * dt); this.play(p, 'run', 12); }
      else this.play(p, 'stand', 6);
    } else if (p.state === 'swing') {
      if (!p.hitDone && p.st >= 0.06) { p.hitDone = true; p.hold = sw + 2; this.slash(); } // snap to the cut, then freeze
      else if (!p.hitDone) p.hold = sw + (p.st < 0.03 ? 0 : 1);
      else if (p.st >= 0.11) p.hold = sw + 3; // follow-through
      if (p.st >= 0.2) {
        const next = p.chain && p.chain.left > 0 && p.fromDash ? this.pick({ x: p.dx, y: p.dy }, 180, 180) : null;
        if (next) { p.chain.left--; this.startDash(next); } else { p.state = 'free'; p.chain = null; }
      }
    } else if (p.state === 'dash') {
      const dx = p.tx - p.x, dy = p.ty - p.y, l = len(dx, dy), v = 950 * dt;
      if ((p.ghost -= dt) <= 0) { p.ghost = 0.025; this.ghost(p); }
      if (l <= v || p.st > 0.35) {
        this.step(p, dx * Math.min(1, v / l), dy * Math.min(1, v / l));
        if (p.target) this.startSwing(true); else { p.state = 'free'; p.chain = null; }
      } else this.step(p, dx / l * v, dy / l * v);
    } else if (p.state === 'jump') {
      const k = Math.min(1, p.st / 0.42);
      this.step(p, p.jx + (p.tx - p.jx) * k - p.x, p.jy + (p.ty - p.jy) * k - p.y);
      p.z = Math.sin(Math.PI * k) * 95;
      p.hold = sw + (k > 0.7 ? 2 : k > 0.35 ? 1 : 0);
      if (k >= 1) {
        p.z = 0; p.state = 'free';
        this.spawn('land', p);
        this.aoe(p.x, p.y, 125, 20, 420);
        this.freeze(0.12, 3);
      }
    } else if (p.state === 'spin') {
      const a = p.a0 + p.st / 0.28 * Math.PI * 2; // a full turn every 0.28s through the 8 rows
      this.faceTo(p, Math.cos(a), Math.sin(a));
      p.hold = sw + 2;
      const due = [0.04, 0.19, 0.34].filter((t) => p.st >= t).length;
      while (p.hits < due) { p.hits++; this.aoe(p.x, p.y, 125, 9, 200); }
      if (p.st >= 0.45) { p.state = 'free'; this.faceTo(p, Math.cos(p.a0), Math.sin(p.a0)); }
    } else if (p.state === 'cast') {
      if (!p.fired && p.st >= 0.12) { p.fired = true; this.addWave(p); }
      if (p.st >= 0.26) p.state = 'free';
    } else if (p.state === 'hurt') {
      this.knock(p, dt);
      p.hold = p.sh.anims.die[0] + (p.st < 0.08 ? 0 : 1);
      if (p.st >= 0.25) { p.state = 'free'; p.kx = 0; p.ky = 0; }
    }
  }

  // 질풍: a spinning energy disc flies out and cuts through everything on its line
  addWave(p) {
    const w = { x: p.x + p.dx * 30, y: p.y + p.dy * 30, z: 16, dx: p.dx, dy: p.dy, t: 0, hit: new Set() };
    const th = Math.atan2(p.dy, p.dx), flip = Math.cos(th) < 0;
    const fx = this.spawn('wave', w, {}, { follow: w, flip, angle: flip ? th - Math.PI : th });
    this.waves.push({ w, fx });
  }

  updateWaves(dt) {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const { w, fx } = this.waves[i];
      w.t += dt;
      w.x += w.dx * 760 * dt; w.y += w.dy * 760 * dt;
      for (const t of this.targets()) {
        if (w.hit.has(t) || len(t.x - w.x, t.y - w.y) > 62 + t.r) continue;
        w.hit.add(t);
        this.hit(t, 10, w.dx, w.dy, 120, 0.9);
      }
      if (w.t >= 0.6) { if (fx) fx.f.stop(); this.waves.splice(i, 1); }
    }
  }

  updateEnemy(e, dt) {
    const p = this.player;
    e.st += dt;
    if (e.state === 'dead') {
      if (e.st > 0.5) e.fade = Math.max(0, 1 - (e.st - 0.5) / 0.3);
      if (e.st > 1.3) this.respawn(e);
      return;
    }
    if (e.state === 'hurt') {
      this.knock(e, dt);
      e.hold = e.sh.anims.die[0] + (e.st < 0.08 ? 0 : 1); // Puny's own white hit frame, then the flinch
      if (e.st >= e.stun) { e.state = 'chase'; e.hold = null; }
      return;
    }
    const dx = p.x - e.x, dy = p.y - e.y, l = len(dx, dy);
    e.cd -= dt;
    if (e.state === 'atk') {
      // acted too: raise (wind-up), cut, follow
      const sw = e.sh.anims.swing[0];
      e.hold = sw + (e.st < 0.3 ? 0 : e.st < 0.38 ? 1 : e.st < 0.48 ? 2 : 3);
      if (!e.done && e.st >= 0.38) {
        e.done = true;
        if (l < 58 + p.r && (dx * e.dx + dy * e.dy) / l > 0.4) this.hurtPlayer(8, dx / l, dy / l);
      }
      if (e.st >= 0.6) { e.state = 'chase'; e.hold = null; e.cd = rnd(0.7, 1.2); }
      return;
    }
    if (l > 700) { this.play(e, 'stand', 6); return; }
    this.faceTo(e, dx, dy);
    if (l < 40 + p.r && e.cd <= 0) { Object.assign(e, { state: 'atk', st: 0, done: false }); this.play(e, 'swing', 0); return; }
    if (l > 32 + p.r) { this.step(e, dx / l * e.spd * dt, dy / l * e.spd * dt); this.play(e, 'run', 8); }
    else this.play(e, 'stand', 6);
  }

  // keep bodies apart (n^2 is fine at 150)
  separate() {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive) continue;
        const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r;
        if (dx > min || dx < -min || dy > min || dy < -min) continue;
        const d = Math.hypot(dx, dy);
        if (d >= min || d < 0.001) continue;
        const push = (min - d) / 2 / d;
        a.x -= dx * push; a.y -= dy * push; b.x += dx * push; b.y += dy * push;
      }
    }
  }

  // ---- boss: charge (line), slam (circle), quake (three rings) ----
  updateBoss(dt) {
    const b = this.boss, p = this.player, g = this.tele;
    g.clear();
    b.st += dt;
    if (b.state === 'dead') {
      if (b.st > 1.0) b.fade = Math.max(0, 1 - (b.st - 1.0) / 0.6);
      if (b.st > 3) Object.assign(b, this.freeSpot(450), { hp: b.maxHp, alive: true, state: 'idle', st: 0, fade: null });
      return;
    }
    this.knock(b, dt);
    const dx = p.x - b.x, dy = p.y - b.y, l = len(dx, dy), sw = b.sh.anims.swing[0];
    if (b.state === 'idle') {
      this.faceTo(b, dx, dy);
      this.play(b, 'stand', 6);
      if (b.st > 0.7) {
        const r = Math.random();
        b.st = 0;
        if (l > 300) b.state = r < 0.6 ? 'chargeWind' : 'quake';
        else b.state = r < 0.55 ? 'walk' : 'quake';
        if (b.state === 'chargeWind') { b.cdx = dx / l; b.cdy = dy / l; b.hitP = false; }
        if (b.state === 'quake') b.rings = 0;
      }
    } else if (b.state === 'walk') {
      this.faceTo(b, dx, dy);
      this.play(b, 'run', 8);
      this.step(b, dx / l * 120 * dt, dy / l * 120 * dt);
      if (l < 150 || b.st > 2.5) { b.state = 'slamWind'; b.st = 0; b.sx = b.x + b.dx * 95; b.sy = b.y + b.dy * 95; }
    } else if (b.state === 'slamWind') {
      const k = Math.min(1, b.st / 0.7);
      b.hold = sw + (k < 0.5 ? 0 : 1);
      g.circle(b.sx, b.sy, 110).fill({ color: 0xff2020, alpha: 0.12 }).stroke({ width: 4, color: 0xff4040, alpha: 0.7 });
      g.circle(b.sx, b.sy, 110 * k).fill({ color: 0xff3030, alpha: 0.25 });
      if (k >= 1) {
        b.state = 'recover'; b.st = 0; b.hold = sw + 2;
        this.spawn('bossSlam', { x: b.sx, y: b.sy });
        this.freeze(0.1, 3);
        const ex = p.x - b.sx, ey = p.y - b.sy, el = len(ex, ey);
        if (el < 110 + p.r) this.hurtPlayer(20, ex / el, ey / el, 380);
      }
    } else if (b.state === 'chargeWind') {
      this.faceTo(b, b.cdx, b.cdy);
      this.play(b, 'stand', 14);
      const k = Math.min(1, b.st / 0.75), L = 480, W = 36, nx = -b.cdy * W, ny = b.cdx * W;
      const ex = b.x + b.cdx * L, ey = b.y + b.cdy * L, mx = b.x + b.cdx * L * k, my = b.y + b.cdy * L * k;
      g.poly([b.x + nx, b.y + ny, ex + nx, ey + ny, ex - nx, ey - ny, b.x - nx, b.y - ny]).fill({ color: 0xff2020, alpha: 0.12 }).stroke({ width: 4, color: 0xff4040, alpha: 0.7 });
      g.poly([b.x + nx, b.y + ny, mx + nx, my + ny, mx - nx, my - ny, b.x - nx, b.y - ny]).fill({ color: 0xff3030, alpha: 0.25 });
      if (k >= 1) { b.state = 'charge'; b.st = 0; b.ox = b.x; b.oy = b.y; }
    } else if (b.state === 'charge') {
      this.play(b, 'run', 16);
      const ox = b.x, oy = b.y;
      this.step(b, b.cdx * 640 * dt, b.cdy * 640 * dt);
      if ((this.ghostT = (this.ghostT || 0) - dt) <= 0) { this.ghostT = 0.05; this.ghost(b); }
      if (!b.hitP && len(p.x - b.x, p.y - b.y) < b.r + p.r + 8) { b.hitP = true; this.hurtPlayer(18, b.cdx, b.cdy, 460); }
      const blocked = len(b.x - ox, b.y - oy) < 640 * dt * 0.3;
      if (len(b.x - b.ox, b.y - b.oy) >= 480 || blocked || b.st > 1) {
        b.state = 'recover'; b.st = -0.4; // a longer breather after a charge: the opening
        if (blocked) { this.freeze(0.08, 3); this.spawn('bossCrit', { x: b.x + b.cdx * 30, y: b.y + b.cdy * 30 }, { aim: Math.atan2(b.cdy, b.cdx) }); }
      }
    } else if (b.state === 'quake') {
      this.play(b, 'block', 4);
      const R = [[40, 140], [140, 240], [240, 340]], at = [0.6, 1.0, 1.4];
      for (let i = b.rings; i < 3; i++) {
        const k = Math.max(0, Math.min(1, (b.st - (at[i] - 0.6)) / 0.6));
        if (k <= 0) continue;
        g.circle(b.x, b.y, R[i][1]).fill({ color: 0xff2020, alpha: 0.1 + 0.18 * k }).circle(b.x, b.y, R[i][0]).cut();
        g.circle(b.x, b.y, R[i][1]).stroke({ width: 4, color: 0xff4040, alpha: 0.6 });
      }
      if (b.rings < 3 && b.st >= at[b.rings]) {
        const [r0, r1] = R[b.rings];
        b.rings++;
        b.hold = sw + 2;
        this.spawn('quake', b, { reach: Math.round(r1 / PX / 0.7) });
        this.freeze(0.05, 2);
        if (l > r0 - p.r && l < r1 + p.r) this.hurtPlayer(14, dx / l, dy / l, 300);
      } else if (b.hold != null && b.st - at[b.rings - 1] > 0.15) b.hold = null;
      if (b.st >= 1.8) { b.state = 'idle'; b.st = 0; b.hold = null; }
    } else if (b.state === 'recover') {
      if (b.st >= 0.5) { b.state = 'idle'; b.st = 0; b.hold = null; }
    }
  }

  close() {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    if (this.app) this.app.destroy(true, { children: true });
    this.app = null;
    this.el.remove();
    this.onClose();
  }
}
