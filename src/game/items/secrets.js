// Phase 6 secrets and the end of a cycle: the founder's gift (11.1), the hidden set rings (8.5) and what a
// new cycle keeps (11.3). Pure; the screens and the game call these.
import { findItem } from './Forge.js';
import { createItem } from './ItemFactory.js';

const pick = (list, rng) => list[Math.floor(rng() * list.length) % list.length];
const allItems = (ctx) => [...ctx.loadout.items(), ...ctx.pocket, ...ctx.vault.stash];
const partsOf = (cfg, id) => Object.keys(cfg.sets[id].pieces);

// the founder falls: the missing piece of the set the family holds most of (complete sets are passed
// over; ties at random); no set piece at all, or every set complete: any piece. +0, into the stash.
export function founderGift(ctx, rng, level = 100) {
  const cfg = ctx.cfg, ids = Object.keys(cfg.sets), have = {};
  for (const id of ids) have[id] = new Set();
  for (const it of allItems(ctx)) if (it.set && have[it.set]) have[it.set].add(it.slot);
  const open = ids.filter((id) => have[id].size < partsOf(cfg, id).length);
  let set, slot;
  if (!open.length) { set = pick(ids, rng); slot = pick(partsOf(cfg, set), rng); }
  else {
    const most = Math.max(...open.map((id) => have[id].size));
    set = pick(open.filter((id) => have[id].size === most), rng);
    slot = pick(partsOf(cfg, set).filter((s) => !have[set].has(s)), rng);
  }
  const it = createItem(cfg, rng, { id: ctx.vault.allocId(), level, set, slot });
  it.enhance = 0;
  it.gift = true; // the founder's gift: a new cycle keeps it
  ctx.vault.stash.push(it);
  ctx.vault.markSeen(it);
  return it;
}

// the five pieces of a set, one per part, each at the top enhance level (null if any is missing)
function ringPieces(ctx, setId) {
  const max = ctx.cfg.enhance.max, all = allItems(ctx), out = [];
  for (const part of partsOf(ctx.cfg, setId)) {
    // plain pieces first: gear with a legacy token or a founder's gift is used only when nothing else will do
    const it = all.filter((x) => x.set === setId && x.slot === part && x.enhance >= max && !x.ringSet).sort((a, b) => (a.token || a.gift ? 1 : 0) - (b.token || b.gift ? 1 : 0))[0];
    if (!it) return null;
    out.push(it);
  }
  return out;
}

// the secret (8.5): nothing tells of it but the founder's last words
export const canForgeRing = (ctx, setId) => !!ringPieces(ctx, setId);

// the five go; "(set) 반지" comes — no stats of its own, the whole set's effect; kept like a legacy token
export function forgeRing(ctx, setId) {
  const pieces = ringPieces(ctx, setId);
  if (!pieces) return null;
  for (const p of pieces) {
    const f = findItem(ctx, p.id);
    if (f.where === 'equipped') ctx.loadout.unequip(f.slot);
    else { const list = f.where === 'pocket' ? ctx.pocket : ctx.vault.stash; list.splice(list.indexOf(p), 1); }
  }
  const ring = createItem(ctx.cfg, ctx.rng || Math.random, { id: ctx.vault.allocId(), level: Math.max(...pieces.map((p) => p.level)), slot: 'ring', grade: 'legendary' });
  Object.assign(ring, { name: `${ctx.cfg.sets[setId].name} 반지`, base: { stat: ring.base.stat, value: 0 }, affixes: [], enhance: 0, ringSet: setId, quality: 0 });
  delete ring.effect;
  delete ring.legendary;
  ctx.vault.stash.push(ring);
  return ring;
}

// a new cycle keeps only these (11.3)
export const cycleKeepers = (items) => items.filter((it) => it && (it.gift || it.token || it.ringSet));
