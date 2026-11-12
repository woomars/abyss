import { loadConfig } from './game/config.js';
import { Game } from './game/Game.js';
import { GameLoop } from './game/GameLoop.js';
import { Events } from './core/Events.js';
import { createRng } from './core/rng.js';
import { Renderer } from './render/Renderer.js';
import { bindInput } from './systems/InputBinder.js';
import { AudioSystem } from './systems/AudioSystem.js';
import { MusicSystem } from './systems/MusicSystem.js';
import { SaveSystem } from './systems/SaveSystem.js';
import { SkillButtons } from './ui/SkillButtons.js';
import { HUD } from './ui/HUD.js';
import { PauseMenu } from './ui/PauseMenu.js';
import { DebugPanel } from './ui/DebugPanel.js';
import { GameOver } from './ui/GameOver.js';
import { Banner } from './ui/Banner.js';
import { RecordStore } from './systems/RecordStore.js';
import { RelicPicker } from './ui/RelicPicker.js';
import { LootToast } from './ui/LootToast.js';
import { TitleMenu } from './ui/TitleMenu.js';
import { HeirScreen } from './ui/HeirScreen.js';
import { ForgeScreen } from './ui/ForgeScreen.js';
import { VaultStore } from './systems/VaultStore.js';
import { Vault } from './game/items/Vault.js';
import { chooseRotation, stageSize, stageTransform, toStage } from './systems/orientation.js';

function safeStorage() {
  try { return window.localStorage; } catch (_) { return null; }
}

async function enterFullscreenLandscape() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  } catch (_) { /* not supported or denied: game still works */ }
}

async function boot() {
  const config = await loadConfig((p) => fetch(p, { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`load failed: ${p}`);
    return r.json();
  }));
  const events = new Events();
  const rng = createRng((Date.now() & 0xffffffff) >>> 0);
  const canvas = document.getElementById('game');
  const ui = document.getElementById('ui');
  const renderer = new Renderer(canvas, config);
  const game = new Game(config, { events, rng });
  const audio = new AudioSystem(events, rng, config.audio);
  const music = new MusicSystem(config.music);
  const save = new SaveSystem(safeStorage());
  const settings = save.load();

  const applySettings = (s) => {
    game.camera.setShakeEnabled(s.shake);
    audio.setEnabled(s.sound);
    music.setEnabled(s.music);
  };
  applySettings(settings);

  const stage = document.getElementById('stage');
  let started = false;
  let menu = null;
  const updatePaused = () => {
    game.paused = !started || (menu && menu.isOpen);
  };
  // save slots: the vault in play is saved whenever it changes
  const store = new VaultStore(safeStorage());
  let slot = null;
  events.on('vaultChanged', (e) => { if (slot) store.save(slot, e.vault); });

  const skillButtons = new SkillButtons(ui, game.skills, { toLocal: (x, y) => toLocal(x, y) });
  const hud = new HUD(ui, { onPause: () => menu.open() });
  let lastFate = null;
  const gameOver = new GameOver(ui, {
    onRetry: () => {
      if (lastFate) heir.show(lastFate);
      else game.restart();
    },
  });
  const records = new RecordStore(safeStorage());
  events.on('playerDown', (s) => {
    // only honest runs (started at floor 1, not via the debug floor jump) count for the record
    const r = s.floor && s.startFloor === 1 ? records.submitFloor(s.floor) : { bestFloor: records.load().bestFloor, isNew: false };
    lastFate = s.fate || null;
    gameOver.show({ ...s, ...r, unranked: !!s.floor && s.startFloor !== 1 });
  });
  // dungeon announcements and music follow the room
  const banner = new Banner(ui);
  events.on('floorStart', (e) => {
    music.play(e.music);
    if (e.kind === 'boss') banner.show(e.boss, e.title.replace(` — ${e.boss}`, ''), { kind: 'boss', ms: 2400 });
    else if (e.kind === 'treasure') banner.show('보물방', '상자를 열어 보세요');
    else banner.show(e.title);
  });
  events.on('roomCleared', (e) => {
    if (e.kind === 'boss') banner.show('보스 처치!', `보물 상자가 나타났습니다 · 골드 +${e.gold}`, { kind: 'reward', ms: 2400 });
    else banner.show('방 정리', `출구가 열렸습니다 · 골드 +${e.gold}`);
  });
  events.on('bossEnrage', () => banner.show('분노!', '', { kind: 'boss', ms: 1200 }));
  // treasure room and boss chests: pick one of three cards (the game waits meanwhile)
  let chest = null;
  events.on('chestOpen', (e) => { chest = e; });
  const picker = new RelicPicker(ui, {
    pickDelay: () => config.relics.pickDelay,
    onPick: (i) => {
      const o = game.chooseRelic(i);
      if (!o) return;
      const sub = [o.desc, chest ? `골드 +${chest.gold}` : '', chest && chest.big ? '체력 모두 회복' : ''].filter(Boolean).join(' · ');
      banner.show(`${o.tierLabel ? o.tierLabel + ' ' : ''}${o.name} 획득`, sub, { kind: 'reward' });
    },
    onReroll: () => game.rerollRelics(),
  });
  events.on('relicOffer', (e) => picker.show(e.offers, e));
  const toast = new LootToast(ui, config.items);
  events.on('lootPickup', (e) => toast.show(e.item));
  events.on('pocketFull', () => toast.text('주머니가 가득 찼습니다'));
  events.on('relicReroll', (e) => picker.show(e.offers, e));
  menu = new PauseMenu(ui, {
    settings,
    onChange: (s) => { applySettings(s); save.save(s); },
    onRestart: () => { gameOver.hide(); game.giveUp(); },
    onOpenChange: updatePaused,
  });
  events.on('setComplete', (e) => { if (forge.isOpen) forge.flash(`${e.name} 세트 완성! 연쇄 마지막 타격에서 폭발`, true); });
  events.on('levelUp', (e) => banner.show('레벨 업!', `Lv ${e.level} · 공격력과 최대 체력이 올랐습니다`, { kind: 'reward', ms: 1600 }));

  // --- family, forge and title (all inside the landscape stage) ---
  const heir = new HeirScreen(ui, { onContinue: () => game.openStartForge() });
  const forge = new ForgeScreen(ui, {
    game,
    onDepart: () => { forge.hide(); game.departForge(); },
    onTitle: () => { forge.hide(); started = false; updatePaused(); title.open(); music.play('base'); },
  });
  events.on('forgeOpen', (e) => {
    music.play('base');
    gameOver.hide();
    forge.show(e);
  });
  const enterSlot = (n, vault) => {
    slot = n;
    game.attachVault(vault);
    started = true;
    updatePaused();
  };
  const title = new TitleMenu(ui, {
    store, names: config.names,
    onContinue: (n) => {
      const v = store.load(n);
      if (!v) { title.open(); return; }
      enterSlot(n, v);
      if (v.state === 'rest' && v.run) game.restoreRun(v.run);
      else if (v.state === 'run') {
        // the game was closed in the middle of a fight: that run counts as a death
        game.enterLimbo();
        const fate = game.endRunByDeath(v.lastFloor);
        heir.show(fate, { note: '지난 판이 싸움 도중 중단되어, 쓰러진 것으로 처리했습니다.' });
      } else game.openStartForge();
    },
    onNew: (n, family, given) => {
      const v = new Vault({ family, given });
      store.save(n, v);
      enterSlot(n, v);
      game.openStartForge();
    },
  });

  // --- forced landscape: rotate the whole stage when the viewport is portrait ---
  let rot = 0;
  let gx = null; // low-passed gravity along the device x axis (m/s²)
  const toLocal = (x, y) => toStage(rot, x, y, window.innerWidth, window.innerHeight);
  // client-space rect -> stage-space rect (for stroke exclusion zones)
  const rectToStage = (r) => {
    const a = toLocal(r.x, r.y), b = toLocal(r.x + r.w, r.y + r.h);
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  };

  let debug = null;
  const layout = () => {
    const vw = window.innerWidth, vh = window.innerHeight;
    rot = chooseRotation(rot, { vw, vh, gx });
    const s = stageSize(rot, vw, vh);
    stage.style.width = s.w + 'px';
    stage.style.height = s.h + 'px';
    stage.style.transform = stageTransform(rot, vw, vh);
    renderer.resize(s.w, s.h, window.devicePixelRatio || 1);
    const v = renderer.viewWorld;
    game.camera.setViewport(v.w, v.h);
    const rects = [...skillButtons.rects(), hud.rect()];
    if (debug) rects.push(debug.rect());
    game.strokes.setExcludedRects(rects.map(rectToStage));
    updatePaused();
  };
  // in development the tuning panel is on by default; ?debug=0 hides it
  if (new URLSearchParams(location.search).get('debug') !== '0') {
    debug = new DebugPanel(ui, {
      config, game, music, onLayout: () => layout(),
      // jump straight to a floor (or the practice arena) to test bosses
      onFloor: (floor) => {
        gameOver.hide();
        title.hide(); forge.hide(); heir.hide();
        if (slot != null || !started) enterSlot(null, new Vault({ family: '시험', given: '기사' })); // debug runs use a throwaway family
        if (floor === -2) { game.startRun(4); game.dungeon.enterForge(); return; }
        if (floor > 0) game.startRun(floor);
        else if (floor === -1) { game.startRun(3); game.dungeon.enterRoom('treasure'); }
        else { game.startPractice(); music.play(config.music.scenes.play); banner.show('연습장'); }
      },
    });
  }
  window.addEventListener('resize', layout);
  // turning the phone 180° while auto-rotate is off: follow gravity
  window.addEventListener('devicemotion', (e) => {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null) return;
    gx = gx == null ? g.x : gx * 0.8 + g.x * 0.2;
    if (window.innerWidth < window.innerHeight && chooseRotation(rot, { vw: window.innerWidth, vh: window.innerHeight, gx }) !== rot) layout();
  });
  layout();

  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { menu.open(); audio.suspend(); music.suspend(); } else { audio.resume(); music.resume(); }
  });

  bindInput(canvas, game.strokes, { toLocal });
  // Chrome grants user activation for touch on pointerup/touchend, not pointerdown:
  // unlock audio and request fullscreen + landscape lock there, retrying until it sticks.
  const onGesture = (e) => {
    audio.unlock();
    music.unlock();
    if (e.pointerType === 'touch' && !document.fullscreenElement) enterFullscreenLandscape().then(layout);
  };
  document.addEventListener('pointerup', onGesture, true);
  document.addEventListener('pointerdown', () => audio.unlock(), true);

  let lastRender = performance.now();
  const loop = new GameLoop({
    step: 1 / 60,
    maxFrame: 0.25,
    update: (dt) => game.update(dt),
    render: (alpha) => {
      const now = performance.now();
      music.setDuck((menu && menu.isOpen) || game.over);
      music.update(Math.min(0.1, (now - lastRender) / 1000));
      lastRender = now;
      if (picker.isOpen && !game.offer && !picker.chosen) picker.hide(); // run restarted under the cards
      renderer.render(game, alpha);
      skillButtons.render();
      hud.update(game);
      if (debug) debug.frame();
    },
  });
  const tick = (t) => { loop.frame(t / 1000); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);

  window.__abyss = { game, config, renderer, loop, events, audio, music, menu, store, forge, title, heir };
}

boot().catch((err) => {
  console.error(err);
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#e66;position:fixed;top:8px;left:8px;white-space:pre-wrap';
  pre.textContent = String(err && err.stack || err);
  document.body.appendChild(pre);
});
