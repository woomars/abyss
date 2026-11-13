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
import { LegacyScene } from './ui/LegacyScene.js';
import { HallScreen } from './ui/HallScreen.js';
import { StoryScreen, autoStory } from './ui/StoryScreen.js';
import { ControlsGuide } from './ui/ControlsGuide.js';
import { VaultStore } from './systems/VaultStore.js';
import { Vault } from './game/items/Vault.js';
import { chooseRotation, stageSize, stageTransform, toStage } from './systems/orientation.js';
import { initLang, onLangChange, applyI18n, registerNames, t, tr, relicDesc } from './i18n/index.js';
import { floorLabel } from './core/floorLabel.js';

// the language is decided before anything is drawn (?lang= -> saved -> browser)
initLang();

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
  registerNames(config.names);
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
  let editingLayout = false; // dragging the special-attack buttons
  const updatePaused = () => {
    game.paused = !started || (menu && menu.isOpen) || editingLayout;
  };
  // save slots: the vault in play is saved whenever it changes
  const store = new VaultStore(safeStorage());
  let slot = null;
  events.on('vaultChanged', (e) => { if (slot) store.save(slot, e.vault); });

  const skillButtons = new SkillButtons(ui, game.skills, { toLocal: (x, y) => toLocal(x, y) });
  skillButtons.setLayout(settings.skillPos);
  const hud = new HUD(ui, { onPause: () => menu.open() });
  let lastFate = null;
  const heirLabel = () => (game.hasGear() ? 'toForge' : () => t('toFloor', { floor: floorLabel(1) }));
  // to the title screen (from the game over or the forge)
  function toTitle() { heir.hide(); started = false; updatePaused(); title.open(); music.play('base'); }
  // 종료: a window the browser lets us close closes; otherwise back to the woomars game list
  function quitGame() {
    try { window.close(); } catch (_) { /* not allowed */ }
    setTimeout(() => { if (!window.closed) location.href = 'https://woomars.github.io/'; }, 250);
  }
  const gameOver = new GameOver(ui, {
    onRetry: () => {
      if (lastFate) heir.show(lastFate, { label: heirLabel() });
      else game.restart();
    },
    // back to the title: the fall is already recorded, the heir waits in the save (이어하기)
    onMenu: () => { game.enterLimbo(); toTitle(); },
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
    if (e.kind === 'boss') banner.show(tr(e.boss), `${floorLabel(e.floor)} ${tr(game.dungeon.info.band.title)}`, { kind: 'boss', ms: 2400 });
    else if (e.kind === 'treasure') { /* the card screen says it all */ }
    else if (e.variant) banner.show(`${floorLabel(e.floor)} · ${t(`room.${e.variant}`)}`, t(`room.${e.variant}Sub`), { kind: e.variant === 'elite' ? 'boss' : 'reward', ms: 2200 });
    else banner.show(e.kind === 'combat' ? floorLabel(e.floor) : tr(e.title));
  });
  events.on('roomCleared', (e) => {
    if (e.kind === 'boss') banner.show(t('banner.bossDown'), t('banner.chest', { gold: e.gold }), { kind: 'reward', ms: 2400 });
    else banner.show(t('banner.roomClear'), t('banner.exitOpen', { gold: e.gold }));
  });
  events.on('bossEnrage', () => banner.show(t('banner.enrage'), '', { kind: 'boss', ms: 1200 }));
  // treasure room and boss chests: pick one of three cards (the game waits meanwhile)
  let chest = null;
  events.on('chestOpen', (e) => { chest = e; });
  const picker = new RelicPicker(ui, {
    pickDelay: () => config.relics.pickDelay,
    relics: () => config.relics,
    onPick: (i) => {
      if (game.skillOffer) { // special-attack growth card
        const c = game.chooseSkill(i);
        if (c) banner.show(t('sk.banner', { name: tr(c.name) }), t(`sk.${c.kind}`, { v: `${Math.round(c.value * 100)}%` }), { kind: 'reward' });
        setTimeout(() => game.offerSkillGrowth(), 900); // more owed (several levels at once)
        return;
      }
      const o = game.chooseRelic(i);
      if (!o) return;
      const sub = [relicDesc(o, config.relics), chest ? t('banner.gold', { gold: chest.gold }) : ''].filter(Boolean).join(' · ');
      banner.show(t('banner.relic', { name: `${o.tierLabel ? tr(o.tierLabel) + ' ' : ''}${tr(o.name)}` }), sub, { kind: 'reward' });
    },
    onReroll: () => game.rerollRelics(),
  });
  events.on('relicOffer', (e) => picker.show(e.offers, { ...e, title: game.dungeon.state === 'treasure' ? 'room.treasure' : '', gold: game.dungeon.gold, found: chest ? chest.gold : 0 }));
  events.on('skillOffer', (e) => picker.show(e.offers, { mode: 'skill', level: e.level }));
  const toast = new LootToast(ui, config.items);
  events.on('lootPickup', (e) => toast.show(e.item));
  events.on('pocketFull', () => toast.text(t('notice.pocketFull')));
  events.on('relicReroll', (e) => picker.show(e.offers, { ...e, title: game.dungeon.state === 'treasure' ? 'room.treasure' : '', found: chest ? chest.gold : 0 }));
  menu = new PauseMenu(ui, {
    settings,
    onChange: (s) => { applySettings(s); save.save(s); },
    onRestart: () => { gameOver.hide(); game.giveUp(); },
    onOpenChange: updatePaused,
    // drag the special-attack buttons where the player likes them; saved with the settings
    onSkillLayout: () => {
      editingLayout = true;
      skillButtons.startEdit((pos) => { editingLayout = false; settings.skillPos = pos; save.save(settings); layout(); updatePaused(); });
      updatePaused();
    },
  });
  events.on('setComplete', (e) => { if (forge.isOpen) forge.flash(t('notice.setComplete', { name: tr(e.name) }), true); });
  events.on('medal', (e) => toast.medal(e.medal, config.medals, e.first));
  events.on('trophy', (e) => { if (!e.heir) toast.trophy(e.trophy, config.medals); });
  events.on('levelUp', (e) => banner.show(t('banner.levelUp'), t('banner.levelUpSub', { level: e.level }), { kind: 'reward', ms: 1600 }));

  // --- family, forge and title (all inside the landscape stage) ---
  const heir = new HeirScreen(ui, { onContinue: () => game.beginRun(), medals: config.medals, relics: config.relics });
  // 유산의 증표: opened on reaching every 100th floor, or from the forge while tokens are in hand
  const legacy = new LegacyScene(ui, {
    game, toLocal: (x, y) => toLocal(x, y),
    onClose: () => { if (game.tokenScene) game.closeTokenScene(); if (forge.isOpen) forge.render(); },
  });
  events.on('legacyToken', (e) => { banner.hide(); legacy.show({ floor: e.floor }); });
  const forge = new ForgeScreen(ui, {
    game,
    onToken: () => legacy.show(),
    onDepart: () => { forge.hide(); game.departForge(); },
    onTitle: () => { forge.hide(); toTitle(); },
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
  // 선조의 전당 (from 이어하기 -> a family)
  const hall = new HallScreen(ui, { config, onBack: () => {} });
  // opening story (plays by itself only when there is nothing to continue) and the controls guide
  const story = new StoryScreen(ui, { music, onDone: () => music.play('base') });
  const guide = new ControlsGuide(ui);
  const title = new TitleMenu(ui, {
    store, names: config.names,
    onGuide: () => guide.show(),
    onQuit: () => quitGame(),
    onStory: () => story.show(),
    onHall: (n) => { const v = store.load(n); if (v) hall.show(v); },
    onContinue: (n) => {
      const v = store.load(n);
      if (!v) { title.open(); return; }
      enterSlot(n, v);
      if (v.state === 'rest' && v.run) game.restoreRun(v.run);
      else if (v.state === 'run') {
        // the game was closed in the middle of a fight: that run counts as a death
        game.enterLimbo();
        if (v.runStats) Object.assign(game.stats, v.runStats); // what he did before the game closed
        const fate = game.endRunByDeath(v.lastFloor);
        heir.show(fate, { note: 'notice.interrupted', label: heirLabel() });
      } else game.beginRun();
    },
    onNew: (n, family, given) => {
      const v = new Vault({ family, given });
      store.save(n, v);
      enterSlot(n, v);
      game.beginRun();
    },
  });

  if (autoStory(store.list())) story.show();

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
        title.hide(); forge.hide(); heir.hide(); hall.hide(); story.hide(); guide.hide();
        if (slot != null || !started) enterSlot(null, new Vault({ family: '시험', given: '기사' })); // debug runs use a throwaway family
        if (floor === -2) { game.startRun(4); game.dungeon.enterForge(); return; }
        if (floor === -3) { // debug: a legacy token right now
          if (!game.forge) { game.startRun(4); game.dungeon.enterForge(); }
          game.vault.tokens += 1; legacy.show(); return;
        }
        if (floor > 0) game.startRun(floor);
        else if (floor === -1) { game.startRun(3); game.dungeon.enterTreasure(); }
        else { game.startPractice(); music.play(config.music.scenes.play); banner.show(t('hud.practice')); }
      },
    });
  }
  // language switched (title or pause menu): every screen writes its text again, no reload
  onLangChange(() => {
    applyI18n(ui);
    hud.relabel(); skillButtons.relabel(); menu.renderToggles(); gameOver.relabel(); picker.relabel();
    title.relabel(); forge.relabel(); hall.relabel(); heir.relabel(); legacy.relabel(); story.relabel(); guide.relabel();
    layout(); // button sizes may change: refresh the stroke exclusion zones
  });
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
      if (picker.isOpen && !game.offer && !game.skillOffer && !picker.chosen) picker.hide(); // run restarted under the cards
      renderer.render(game, alpha);
      skillButtons.render();
      hud.update(game);
      if (debug) debug.frame();
    },
  });
  const tick = (t) => { loop.frame(t / 1000); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);

  window.__abyss = { game, config, renderer, loop, events, audio, music, menu, store, forge, title, heir, legacy, hall, story, guide };
}

boot().catch((err) => {
  console.error(err);
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#e66;position:fixed;top:8px;left:8px;white-space:pre-wrap';
  pre.textContent = String(err && err.stack || err);
  document.body.appendChild(pre);
});
