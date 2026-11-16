// Forge helpers over the whole gear (Phase 6): the order of the pocket and stash, and auto-equip. Pure.
import { equipItem } from './Forge.js';
import { LOADOUT_SLOTS } from './Loadout.js';

// mode 'grade' (default): higher grade first, then part (cfg.slots order), then strengthening, then level.
// mode 'type': part first, then higher grade, strengthening, level. A new array; the list is untouched.
export function sortItems(items, mode, cfg) {
  const g = (it) => cfg.gradeOrder.indexOf(it.grade), p = (it) => cfg.slots.indexOf(it.slot);
  const byGrade = (a, b) => g(b) - g(a), byPart = (a, b) => p(a) - p(b);
  const tail = (a, b) => (b.enhance || 0) - (a.enhance || 0) || (b.level || 0) - (a.level || 0) || a.id - b.id;
  const first = mode === 'type' ? [byPart, byGrade] : [byGrade, byPart];
  return items.slice().sort((a, b) => first[0](a, b) || first[1](a, b) || tail(a, b));
}

// better gear first: grade, legacy token, strengthening, level, quality
const score = (cfg, it) => [cfg.gradeOrder.indexOf(it.grade), it.token ? 1 : 0, it.enhance || 0, it.level || 0, it.quality || 0];
const better = (cfg) => (a, b) => { const x = score(cfg, a), y = score(cfg, b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i]; return a.id - b.id; };

// every item the forge can put on: worn, pocket, stash
function allGear(ctx) {
  const worn = LOADOUT_SLOTS.map((s) => ctx.loadout.slots[s]).filter(Boolean);
  return [...worn, ...ctx.pocket, ...ctx.vault.stash];
}

// what auto-equip would wear: { loadoutSlot: itemId | null }.
// 1) the set with the most different pieces owned (two or more; tie: more strengthening) fills its slots;
// 2) every other slot takes its best item; the two best rings go to the ring slots.
export function autoEquipPlan(ctx) {
  const cfg = ctx.cfg, gear = allGear(ctx), cmp = better(cfg), plan = {}, used = new Set();
  let setId = null, setN = 1, setEnh = -1;
  for (const id of Object.keys(cfg.sets)) {
    const own = gear.filter((it) => it.set === id), n = new Set(own.map((it) => it.slot)).size, enh = own.reduce((s, it) => s + (it.enhance || 0), 0);
    if (n > setN || (n === setN && n >= 2 && enh > setEnh)) { setId = id; setN = n; setEnh = enh; }
  }
  if (setId) for (const slot of Object.keys(cfg.sets[setId].pieces)) {
    const pick = gear.filter((it) => it.set === setId && it.slot === slot).sort(cmp)[0];
    if (pick) { plan[slot] = pick.id; used.add(pick.id); }
  }
  for (const s of LOADOUT_SLOTS) {
    if (plan[s] !== undefined || s === 'ring1' || s === 'ring2') continue;
    const pick = gear.filter((it) => it.slot === s && !used.has(it.id)).sort(cmp)[0];
    plan[s] = pick ? pick.id : null;
    if (pick) used.add(pick.id);
  }
  const rings = gear.filter((it) => it.slot === 'ring' && !used.has(it.id)).sort(cmp);
  plan.ring1 = rings[0] ? rings[0].id : null;
  plan.ring2 = rings[1] ? rings[1].id : null;
  return plan;
}

// wear the plan; what it pushes out goes to the pocket. Returns how many items changed.
export function applyAutoEquip(ctx) {
  const plan = autoEquipPlan(ctx), lo = ctx.loadout;
  let changed = 0;
  for (const s of LOADOUT_SLOTS) {
    if (s === 'ring1' || s === 'ring2') continue;
    const want = plan[s], cur = lo.slots[s];
    if (want != null && (!cur || cur.id !== want) && equipItem(ctx, want, s).ok) changed++;
  }
  // rings: keep any wanted ring already worn (in either slot), put the others where an unwanted one is
  const wanted = [plan.ring1, plan.ring2].filter((x) => x != null);
  const free = ['ring1', 'ring2'].filter((s) => !lo.slots[s] || !wanted.includes(lo.slots[s].id));
  for (const id of wanted) {
    if (['ring1', 'ring2'].some((s) => lo.slots[s] && lo.slots[s].id === id)) continue;
    const s = free.shift();
    if (s && equipItem(ctx, id, s).ok) changed++;
  }
  return { changed };
}

// for a one-time undo: the same item objects back in the same places
export function snapshotGear(ctx) {
  return { slots: { ...ctx.loadout.slots }, pocket: ctx.pocket.slice(), stash: ctx.vault.stash.slice() };
}

export function restoreGear(ctx, snap) {
  for (const s of LOADOUT_SLOTS) ctx.loadout.slots[s] = snap.slots[s] || null;
  ctx.pocket.splice(0, ctx.pocket.length, ...snap.pocket);
  ctx.vault.stash.splice(0, ctx.vault.stash.length, ...snap.stash);
}

// ---- the set screen ----
// the best owned piece of a set in each of its slots: { slot: { item, where } | null } (a worn piece first)
export function setPieceOwners(ctx, setId) {
  const cfg = ctx.cfg, cmp = better(cfg), out = {};
  const worn = LOADOUT_SLOTS.map((s) => ctx.loadout.slots[s]).filter(Boolean);
  for (const slot of Object.keys(cfg.sets[setId].pieces)) {
    const w = worn.find((it) => it.set === setId && it.slot === slot);
    if (w) { out[slot] = { item: w, where: 'equipped' }; continue; }
    const p = ctx.pocket.filter((it) => it.set === setId && it.slot === slot).sort(cmp)[0];
    const s = ctx.vault.stash.filter((it) => it.set === setId && it.slot === slot).sort(cmp)[0];
    const pick = p && s ? (cmp(p, s) <= 0 ? p : s) : (p || s);
    out[slot] = pick ? { item: pick, where: pick === p ? 'pocket' : 'stash' } : null;
  }
  return out;
}

// [세트 착용]: wear every owned piece of the set that is not worn yet (the gear it replaces goes to the pocket)
export function equipSet(ctx, setId) {
  let changed = 0;
  for (const o of Object.values(setPieceOwners(ctx, setId))) if (o && o.where !== 'equipped' && equipItem(ctx, o.item.id).ok) changed++;
  return { changed };
}
