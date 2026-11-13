// Korean particle by the last syllable: josa('카엘', '이', '가') -> '카엘이'
// Korean only: English and Japanese sentences are built by their own templates in src/i18n/.
export function josa(word, withFinal, withoutFinal) {
  const s = String(word), c = s.charCodeAt(s.length - 1);
  return s + (c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? withFinal : withoutFinal);
}
