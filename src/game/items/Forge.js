// Forge rules on { cfg, loadout, pocket, vault }: wear, take off, store, salvage into powder,
// strengthen with powder, and what a death keeps. Pure; the screen calls these and re-renders.
import { LOADOUT_SLOTS } from './Loadout.js';
import { gradeIndex, rollAffixes } from './ItemFactory.js';
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
  if (ctx.vault.stash.length >= ctx.vault.stashSlots) return { ok: false, reason: 'stashFull' }; // places bought with gold
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

// ---- gold (the family purse, ctx.vault.gold; prices in ctx.econ = tuning/economy.json) ----
// strengthening from item.enhance up to toLevel: base x grade multiplier x the step reached, per step
export function enhanceGold(econ, item, toLevel) {
  const e = econ.enhance, m = (e.gradeMult[item.grade] || 1) * (item.ringSet && econ.ringGoldMult ? econ.ringGoldMult : 1);
  let g = 0;
  for (let k = item.enhance + 1; k <= toLevel; k++) g += Math.round(e.base * m * k);
  return g;
}

// salvaging gives gold by grade (economy.json dismantle)
export function salvageGold(econ, items) {
  return items.reduce((s, it) => s + (econ.dismantle[it.grade] || 0), 0);
}

// ---- salvage ----
// powder is by quality only (일반 · 상급 · 최상급), any part
export function powderOf(ctx, item, into) {
  const cfg = ctx.cfg;
  into[item.quality] += cfg.grades[item.grade].powder;
  if (item.invested > 0) into[0] += Math.floor((item.invested * ctx.econ.dismantle.powderRefund) / cfg.enhance.points[0]); // rounded down: never more than 90% back
  return into;
}

// only pocket and stash items can be salvaged (worn gear is refused)
export function salvagePreview(ctx, ids) {
  const powder = [0, 0, 0], items = [];
  for (const id of ids) {
    const f = findItem(ctx, id);
    if (!f || f.where === 'equipped') continue;
    powderOf(ctx, f.item, powder);
    items.push(f.item);
  }
  return { powder, count: items.length, gold: salvageGold(ctx.econ, items) };
}

export function salvageItems(ctx, ids) {
  const { powder, count, gold } = salvagePreview(ctx, ids);
  if (!count) return { ok: false, powder };
  for (const id of ids) {
    const f = findItem(ctx, id);
    if (!f || f.where === 'equipped') continue;
    pull(f.where === 'pocket' ? ctx.pocket : ctx.vault.stash, id);
  }
  for (let q = 0; q < 3; q++) ctx.vault.powder[q] += powder[q];
  ctx.vault.gold += gold;
  return { ok: true, powder, count, gold };
}

// ---- legacy token ----
export function canTakeToken(item) { return !!item && !item.token && !item.ringSet; } // a set ring never needs one

export function applyToken(ctx, id) {
  const f = findItem(ctx, id);
  if (!f || !canTakeToken(f.item) || ctx.vault.tokens <= 0) return { ok: false };
  f.item.token = true;
  f.item.scar = false;
  ctx.vault.tokens -= 1;
  return { ok: true, item: f.item };
}

// ---- 전승 각인: any item, gold by grade, no hammer; it passes down once for sure, then the mark is gone ----
export function canLegacyEngrave(item) { return !!item && !item.token && !item.ringSet && !item.passOn; }

export function legacyEngraveCost(econ, item) { return (econ.legacyEngrave && econ.legacyEngrave[item.grade]) || 0; }

export function legacyEngraveItem(ctx, id) {
  const f = findItem(ctx, id);
  if (!f || !canLegacyEngrave(f.item)) return { ok: false };
  const cost = legacyEngraveCost(ctx.econ, f.item);
  if (ctx.vault.gold < cost) return { ok: false, reason: 'gold', cost };
  ctx.vault.gold -= cost;
  f.item.passOn = true;
  return { ok: true, cost, item: f.item };
}

// every item the token could go on: worn, stash, pocket (with where it is)
export function tokenCandidates(ctx) {
  const out = [];
  for (const s of LOADOUT_SLOTS) if (ctx.loadout.slots[s]) out.push({ item: ctx.loadout.slots[s], where: 'equipped' });
  for (const it of ctx.vault.stash) out.push({ item: it, where: 'stash' });
  for (const it of ctx.pocket) out.push({ item: it, where: 'pocket' });
  return out.filter((o) => !o.item.ringSet);
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

// tier: 0 일반 / 1 상급 / 2 최상급 powder (any part); count: how many to use; gold for the steps gained
export function enhancePreview(ctx, id, tier, count) {
  const f = findItem(ctx, id);
  if (!f) return { ok: false };
  const cfg = ctx.cfg, it = f.item;
  const have = ctx.vault.powder[tier];
  const maxed = it.enhance >= cfg.enhance.max;
  // never use more powder than the item can still take
  let n = Math.max(0, Math.min(count, have));
  const per = cfg.enhance.points[tier];
  while (n > 0 && applyPoints(cfg, it, (n - 1) * per).level >= cfg.enhance.max) n--;
  const r = applyPoints(cfg, it, n * per);
  const gold = enhanceGold(ctx.econ, it, r.level), rich = ctx.vault.gold >= gold;
  return {
    ok: n > 0 && !maxed && rich, reason: n > 0 && !maxed && !rich ? 'gold' : undefined, from: it.enhance, to: r.level, points: r.points, use: n, have,
    need: r.level < cfg.enhance.max ? cfg.enhance.need[r.level] : 0, maxed, gold,
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
  ctx.vault.powder[tier] -= p.use;
  ctx.vault.gold -= p.gold;
  return { ok: true, from: p.from, to: r.level, gold: p.gold };
}

// ---- death ----
export function survivalChance(item, cfg) {
  if (item.token || item.ringSet) return 1; // 유산의 증표 and set rings (8.5): always pass down
  if (item.passOn) return 1; // 전승 각인 / 세트 각인: once, even over a scar
  if (item.scar) return 0;
  // set pieces have their own (high) chance; legendary gets its high chance from its grade
  const g = item.set ? cfg.setSurvive : cfg.grades[item.grade].survive;
  return g > 0 ? g + cfg.qualities[item.quality].survive : 0; // 일반·고급 never survive
}


export function isNotable(item, cfg) {
  return gradeIndex(cfg, item.grade) >= 3 || item.enhance >= 5 || item.level >= 10;
}

// the father's story told by an inherited notable item (saved in Korean; the screen retells it in
// the current language from item.origin and the entry's floor, see ui/itemView.js)
export function featText(item, cfg, record) {
  const part = cfg.parts[item.slot].label, o = item.origin, F = (n) => floorLabel(n, 'ko');
  const got = o ? (o.boss ? `${F(o.floor)}에서 ${josa(o.boss, '을', '를')} 쓰러뜨리고 얻은 ${part}` : `${F(o.floor)}에서 얻은 ${part}`) : `오래전에 얻은 ${part}`;
  return `${got}. 그는 ${F(record.floor)}까지 내려갔다.`;
}

// worn gear may survive (grade + quality chance, once per item); pocket never does.
// record: { given, family, generation, floor } of the one who died. Survivors stay worn,
// get the scar and an heirloom entry.
export function resolveDeath(ctx, rng, record) {
  const cfg = ctx.cfg, survived = [], lost = [];
  // pocket: lost, except items carrying the legacy token (they go to the stash)
  for (const it of ctx.pocket) {
    if (it.token || it.ringSet || it.passOn) { ctx.vault.stash.push(it); survived.push(it); delete it.passOn; } else lost.push(it);
  }
  ctx.pocket.length = 0;
  for (const s of LOADOUT_SLOTS) {
    const it = ctx.loadout.slots[s];
    if (!it) continue;
    if (rng() < survivalChance(it, cfg)) {
      if (!it.token && !it.ringSet) it.scar = true; // the token (and a set ring) ignores the once-only rule
      delete it.passOn; // an engraving passes it down once, then is gone
      (it.legacy = it.legacy || []).push({
        given: record.given, family: record.family, generation: record.generation, floor: record.floor,
        feat: isNotable(it, cfg) ? featText(it, cfg, record) : null,
      });
      survived.push(it);
    } else {
      ctx.loadout.slots[s] = null;
      lost.push(it);
    }
  }
  // lifesteal on gear stays with the gear for as long as the gear itself lasts
  return { survived, lost };
}

// ---- Phase 6 forge helpers ----
// the set button on the paper doll: the set worn the most (first in config order on a tie)
export function wornSetSummary(gearSets, setsCfg) {
  let id = null, n = 0;
  for (const k of Object.keys(setsCfg)) { const c = (gearSets && gearSets[k]) || 0; if (c > n) { id = k; n = c; } }
  const total = id ? Object.keys(setsCfg[id].pieces).length : Object.keys(Object.values(setsCfg)[0].pieces).length;
  return { id, n, total };
}

// which worn slots an item is compared with: a ring with both rings, anything else with its own slot
export function compareSlots(loadout, item) {
  return item.slot === 'ring' ? ['ring1', 'ring2'] : [loadout.slotFor(item)];
}

// 분해 "모두 선택": everything shown except legacy-token gear, engraved gear and set pieces (those are picked one by one)
export function salvageSelectAll(items) {
  return items.filter((it) => !it.token && !it.set && !it.ringSet && !it.passOn).map((it) => it.id);
}

// ---- +10 grade-up (one grade higher for gold; back to +0; the new grade's affix count) ----
export function gradeUpPreview(ctx, id) {
  const f = findItem(ctx, id);
  if (!f) return { ok: false };
  const cfg = ctx.cfg, it = f.item, order = cfg.gradeOrder, gi = order.indexOf(it.grade);
  const to = order[gi + 1] || null, cost = to ? ctx.econ.gradeUp[it.grade] : 0;
  const base = { from: it.grade, to, cost };
  if (!to) return { ...base, ok: false, reason: 'maxGrade' };
  if (it.enhance < cfg.enhance.max) return { ...base, ok: false, reason: 'notMax' };
  if (ctx.vault.gold < cost) return { ...base, ok: false, reason: 'gold' };
  return { ...base, ok: true };
}

export function gradeUpItem(ctx, id) {
  const p = gradeUpPreview(ctx, id);
  if (!p.ok) return { ok: false, reason: p.reason };
  const cfg = ctx.cfg, it = findItem(ctx, id).item;
  ctx.vault.gold -= p.cost;
  it.grade = p.to;
  it.enhance = 0;
  it.points = 0; // invested stays: salvaging still gives back what went in
  const want = cfg.grades[it.grade].affixes - it.affixes.length;
  if (want > 0) it.affixes.push(...rollAffixes(cfg, ctx.rng, it.grade, want, [it.base.stat, ...it.affixes.map((a) => a.stat)]));
  // a legendary gets a unique effect of its slot (set pieces keep their set instead)
  if (it.grade === 'legendary' && !it.set && !it.effect) {
    const fits = Object.keys(cfg.legendaries).filter((k) => cfg.legendaries[k].slot === it.slot);
    if (fits.length) {
      const k = fits[Math.floor(ctx.rng() * fits.length) % fits.length], L = cfg.legendaries[k];
      it.legendary = k; it.effect = L.effect; it.name = L.name;
    }
  }
  return { ok: true, item: it };
}

// ---- stash places (a new family has none; each costs `growth` times more than the last) ----
export function stashPrice(econ, slots) {
  const s = econ.stash;
  return Math.round(s.firstPrice * Math.pow(s.growth, slots - s.startSlots));
}

export function buyStashSlot(ctx) {
  const v = ctx.vault, s = ctx.econ.stash;
  if (v.stashSlots >= s.maxSlots) return { ok: false, reason: 'max' };
  const price = stashPrice(ctx.econ, v.stashSlots);
  if (v.gold < price) return { ok: false, reason: 'gold', price };
  v.gold -= price;
  v.stashSlots += 1;
  return { ok: true, price };
}
