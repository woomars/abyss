// Debug tuning editor, the part without a screen: change one value of a data table (with its "_"
// notes) and put the table into the live game (the notes stay out, as when the game loads).
import { stripNotes, deriveConfig, putAt } from '../logic/run/config.js';

// set obj[path[0]][path[1]]... = value
export function setAt(obj, path, value) {
  let o = obj;
  for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
  o[path[path.length - 1]] = value;
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function refill(cur, next) {
  for (const k of Object.keys(cur)) if (!(k in next)) delete cur[k];
  for (const k of Object.keys(next)) {
    if (isObj(cur[k]) && isObj(next[k])) refill(cur[k], next[k]);
    else cur[k] = next[k];
  }
}

// the edited table (notes included) becomes the game's at its config path (a DATA_TABLES key), then derived again.
// An existing table is refilled in place, all the way down through plain objects (arrays and leaves are
// replaced), so systems holding it or a sub-table (Camera, MusicSystem, Arena(config.movement.arena) …) see the change.
export function applyEdit(config, key, table) {
  const path = key.split('.'), last = path.pop(), parent = path.reduce((o, k) => o[k], config);
  const next = stripNotes(table), cur = parent[last];
  if (isObj(cur)) refill(cur, next);
  else putAt(config, key, next);
  deriveConfig(config);
}
