// Opening story and ending paragraphs in the current language: Korean straight from
// src/data/tuning/story.json (the developer's text), English and Japanese from the i18n dictionaries.
const ENDING_KEYS = ['p1', 'p2', 'p3.wife', 'p3.husband', 'p4'];

export function storyText(lang, story, t) {
  if (lang === 'ko' && story) return { opening: story.opening.slice(), ending: { ...story.ending } };
  const n = story ? story.opening.length : 5;
  return {
    opening: Array.from({ length: n }, (_, i) => t(`story.p${i + 1}`)),
    ending: Object.fromEntries(ENDING_KEYS.map((k) => [k, t(`ending.${k}`)])),
  };
}
