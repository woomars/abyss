// Forge rules on { cfg, loadout, pocket, vault }: wear, take off, store, salvage into powder,
// strengthen with powder, and what a death keeps. Pure; the screen calls these and re-renders.
import { LOADOUT_SLOTS } from './Loadout.js';
import { gradeIndex } from './ItemFactory.js';
import { josa } from '../../core/josa.js';
import { floorLabel } from '../../core/floorLabel.js';

const pull = (list, id) => {
  const i = list.findIndex((it) => it.id === id);
  return i < 0 ? null : list.splice(i, 1)[0];
};

// where an item is: { item, where: 'equipped'|'pocket'|'stash', slot? }
export function findItem(ctx, id) {
  const s = ctx.loadout.find(id);
  if (s) return { item: ctx.loadout.slots[s], where: 'equipped', slot: s };
  let it = ctx.pocket.find((x) => x.id === id);
  if (it) return { item: it, where: 'pocket' };
  it = ctx.vault.stash.find((x) => x.id === id);
  if (it) return { item: it, where: 'stash' };
  return null;
}

// wear an item from the pocket or the stash; the item it replaces goes to the pocket
// (the pocket may exceed its size at the forge — the size only limits picking up)
export function equipItem(ctx, id, slot = null) {
  const f = findItem(ctx, id);
  if (!f || f.where === 'equipped') return { ok: false };
  const item = pull(f.where === 'pocket' ? ctx.pocket : ctx.vault.stash, id);
  const displaced = ctx.loadout.equip(item, slot);
  if (displaced) ctx.pocket.push(displaced);
  ctx.vault.markSeen(item);
  return { ok: true, displaced };
}

export function unequipItem(ctx, slot) {
  const it = ctx.loadout.unequip(slot);
  if (!it) return { ok: false };
  ctx.pocket.push(it);
  return { ok: true };
}

// pocket or worn item -> stash
export function storeItem(ctx, id) {
  const f = findItem(ctx, id);
  if (!f || f.where === 'stash') return { ok: false };
  if (ctx.vault.stash.length >= ctx.cfg.stashSize) return { ok: false, reason: 'stashFull' };
  const it = f.where === 'equipped' ? ctx.loadout.unequip(f.slot) : pull(ctx.pocket, id);
  ctx.vault.stash.push(it);
  ctx.vault.markSeen(it);
  return { ok: true };
}

// stash -> pocket (so it can be carried without wearing it)
export function takeItem(ctx, id) {
  const it = pull(ctx.vault.stash, id);
  if (!it) return { ok: false };
  ctx.pocket.push(it);
  return { ok: true };
}

// ---- salvage ----
const emptyPowder = () => ({ weapon: [0, 0, 0], helm: [0, 0, 0], armor: [0, 0, 0], gloves: [0, 0, 0], boots: [0, 0, 0], amulet: [0, 0, 0], ring: [0, 0, 0] });

function powderOf(ctx, item, into) {
  const cfg = ctx.cfg;
  into[item.slot][item.quality] += cfg.grades[item.grade].powder;
  if (item.invested > 0) into[item.slot][0] += Math.ceil((item.invested * cfg.enhance.refund) / cfg.enhance.points[0]);
  return into;
}

// only pocket and stash items can be salvaged (worn gear is refused)
export function salvagePreview(ctx, ids) {
  const powder = emptyPowder();
  let count = 0;
  for (const id of ids) {
    const f = findItem(ctx, id);
    if (!f || f.where === 'equipped') continue;
    powderOf(ctx, f.item, powder);
    count++;
  }
  return { powder, count };
}

export function salvageItems(ctx, ids) {
  const { powder, count } = salvagePreview(ctx, ids);
  if (!count) return { ok: false, powder };
  for (const id of ids) {
    const f = findItem(ctx, id);
    if (!f || f.where === 'equipped') continue;
    pull(f.where === 'pocket' ? ctx.pocket : ctx.vault.stash, id);
  }
  for (const [part, arr] of Object.entries(powder)) for (let q = 0; q < 3; q++) ctx.vault.powder[part][q] += arr[q];
  return { ok: true, powder, count };
}

// ---- strengthen ----
// adds `points` to an item copy; returns the level it would reach
function applyPoints(cfg, item, points) {
  const e = cfg.enhance;
  let level = item.enhance, cur = item.points, used = 0, left = points;
  while (left > 0 && level < e.max) {
    const need = e.need[level] - cur;
    if (left >= need) { left -= need; used += need; level += 1; cur = 0; } else { cur += left; used += left; left = 0; }
  }
  return { level, points: cur, used };
}

// tier: 0 일반 / 1 상급 / 2 최상급 powder of the item's part; count: how many to use
export function enhancePreview(ctx, id, tier, count) {
  const f = findItem(ctx, id);
  if (!f) return { ok: false };
  const cfg = ctx.cfg, it = f.item;
  const have = ctx.vault.powder[it.slot][tier];
  const maxed = it.enhance >= cfg.enhance.max;
  // never use more powder than the item can still take
  let n = Math.max(0, Math.min(count, have));
  const per = cfg.enhance.points[tier];
  while (n > 0 && applyPoints(cfg, it, (n - 1) * per).level >= cfg.enhance.max) n--;
  const r = applyPoints(cfg, it, n * per);
  return {
    ok: n > 0 && !maxed, from: it.enhance, to: r.level, points: r.points, use: n, have,
    need: r.level < cfg.enhance.max ? cfg.enhance.need[r.level] : 0, maxed,
  };
}

export function enhanceItem(ctx, id, tier, count) {
  const p = enhancePreview(ctx, id, tier, count);
  if (!p.ok) return { ok: false };
  const it = findItem(ctx, id).item, cfg = ctx.cfg;
  const r = applyPoints(cfg, it, p.use * cfg.enhance.points[tier]);
  it.enhance = r.level;
  it.points = r.points;
  it.invested += r.used;
  ctx.vault.powder[it.slot][tier] -= p.use;
  return { ok: true, from: p.from, to: r.level };
}

// ---- death ----
export function survivalChance(item, cfg) {
  if (item.scar) return 0;
  const g = cfg.grades[item.grade].survive;
  return g > 0 ? g + cfg.qualities[item.quality].survive : 0; // 일반·고급 never survive
}


export function isNotable(item, cfg) {
  return gradeIndex(cfg, item.grade) >= 3 || item.enhance >= 5 || item.level >= 10;
}

// the father's story told by an inherited notable item
export function featText(item, cfg, record) {
  const part = cfg.parts[item.slot].label, o = item.origin;
  const got = o ? (o.boss ? `${floorLabel(o.floor)}에서 ${josa(o.boss, '을', '를')} 쓰러뜨리고 얻은 ${part}` : `${floorLabel(o.floor)}에서 얻은 ${part}`) : `오래전에 얻은 ${part}`;
  return `${got}. 그는 ${floorLabel(record.floor)}까지 내려갔다.`;
}

// lifesteal does not pass to the next generation: strip it (affix and the vampire lord's power)
export function stripLifesteal(item, cfg) {
  let changed = false;
  if (item.base.stat === 'lifesteal') { item.base = { stat: 'maxHp', value: cfg.affixes.maxHp.value }; changed = true; }
  const before = item.affixes.length;
  item.affixes = item.affixes.filter((a) => a.stat !== 'lifesteal');
  if (item.affixes.length !== before) changed = true;
  if (item.effect === 'vampLord') { item.effect = null; changed = true; }
  if (changed) item.lostPower = cfg.inheritNote;
  return changed;
}

// worn gear may survive (grade + quality chance, once per item); pocket never does.
// record: { given, family, generation, floor } of the one who died. Survivors stay worn,
// get the scar and an heirloom entry.
export function resolveDeath(ctx, rng, record) {
  const cfg = ctx.cfg, survived = [], lost = [...ctx.pocket];
  ctx.pocket.length = 0;
  for (const s of LOADOUT_SLOTS) {
    const it = ctx.loadout.slots[s];
    if (!it) continue;
    if (rng() < survivalChance(it, cfg)) {
      it.scar = true;
      (it.legacy = it.legacy || []).push({
        given: record.given, family: record.family, generation: record.generation,
        feat: isNotable(it, cfg) ? featText(it, cfg, record) : null,
      });
      survived.push(it);
    } else {
      ctx.loadout.slots[s] = null;
      lost.push(it);
    }
  }
  for (const it of [...survived, ...ctx.vault.stash]) stripLifesteal(it, cfg);
  return { survived, lost };
}
