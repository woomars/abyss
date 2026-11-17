// Debug tuning editor, the part without a screen: change one value of a tuning table (with its "_"
// notes) and put the table into the live game (the notes stay out, as when the game loads).
import { stripNotes, applyTuning } from '../game/config.js';

// set obj[path[0]][path[1]]... = value
export function setAt(obj, path, value) {
  let o = obj;
  for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
  o[path[path.length - 1]] = value;
}

// the edited table (notes included) becomes the game's: config.tuning[name], then applied again
export function applyEdit(config, name, table) {
  config.tuning[name] = stripNotes(table);
  applyTuning(config);
}
