// Floors go down: shown as 지하 N층 everywhere (Depth N / 地下N階 in English and Japanese).
import { getLang } from '../i18n/index.js';

const FORMATS = { ko: (n) => `지하 ${n}층`, en: (n) => `Depth ${n}`, ja: (n) => `地下${n}階` };
export const floorLabel = (n, lang = getLang()) => (FORMATS[lang] || FORMATS.ko)(n);
