/**
 * Phonetic Roman → Devanagari transliteration, vendored (and trimmed to just
 * the Devanagari path) from `indic-transliterator` v1.3.1's `src/engine.js`
 * (MIT licensed: https://www.npmjs.com/package/indic-transliterator).
 *
 * Vendored rather than depended on directly because that package's only
 * public entry point (`indic-transliterator`) unconditionally imports
 * `react` at the top of the file — which would throw `ERR_MODULE_NOT_FOUND`
 * wherever React isn't installed (this API has no React dependency at all).
 * `engine.js` itself has no dependencies, so copying just that logic
 * sidesteps the broken package export instead of fighting it.
 *
 * Lives in a shared package (rather than just `apps/api`) because the
 * candidate form in `apps/web` also needs it client-side, for live Hindi
 * name suggestions as an admin types — duplicating these lookup tables in
 * both apps would be a real risk of them drifting apart.
 */

const HALANT = '्';

const CONSONANTS: Record<string, string> = {
  kshh: 'क्ष', ksh: 'क्ष', gny: 'ज्ञ',
  dny: 'ज्ञ', shr: 'श्र', shh: 'ष', chh: 'छ',
  ttr: 'त्त्र', ntr: 'न्त्र', str: 'स्त्र',
  kh: 'ख', gh: 'घ', ng: 'ङ', ch: 'च', jh: 'झ', Th: 'ठ',
  th: 'थ', Dh: 'ढ', dh: 'ध', ph: 'फ', bh: 'भ', Sh: 'ष',
  sh: 'श', Rh: 'ढ़', jn: 'ज्ञ', gy: 'ज्ञ',
  ny: 'ञ', tr: 'त्र', dr: 'द्र', pr: 'प्र',
  br: 'ब्र', kr: 'क्र', gr: 'ग्र', sr: 'स्र',
  hr: 'ह्र', mr: 'म्र', vr: 'व्र', nr: 'न्र',
  dn: 'द्न', dy: 'द्य', dv: 'द्व', tv: 'त्व',
  sv: 'स्व', hl: 'ह्ल', hm: 'ह्म', hn: 'ह्न',
  hy: 'ह्य', ly: 'ल्य', ry: 'र्य', vy: 'व्य',
  sy: 'स्य', ty: 'त्य', py: 'प्य', by: 'ब्य',
  my: 'म्य', ky: 'क्य', ks: 'क्स', sk: 'स्क',
  st: 'स्त', sp: 'स्प', sn: 'स्न', sm: 'स्म',
  nk: 'ङ्क', nc: 'ञ्च', nj: 'ञ्ज', nd: 'न्द',
  nt: 'न्त', mp: 'म्प', mb: 'म्ब', ld: 'ल्द',
  lk: 'ल्क', lp: 'ल्प', lt: 'ल्त', rk: 'र्क',
  rg: 'र्ग', rj: 'र्ज', rd: 'र्द', rn: 'र्न',
  rm: 'र्म', rl: 'र्ल', rp: 'र्प', rb: 'र्ब',
  rv: 'र्व', rs: 'र्स', rh: 'र्ह', rt: 'र्त',
  rth: 'र्थ', rdh: 'र्ध', rsh: 'र्श', rch: 'र्च',
  k: 'क', g: 'ग', c: 'क', j: 'ज', T: 'ट', D: 'ड', N: 'ण',
  t: 'त', d: 'द', n: 'न', p: 'प', b: 'ब', m: 'म', y: 'य',
  r: 'र', l: 'ल', v: 'व', w: 'व', s: 'स', h: 'ह',
  f: 'फ़', z: 'ज़', q: 'क़', x: 'क्ष', R: 'ड़', L: 'ळ',
};

const VOWELS: Record<string, [string, string]> = {
  aau: ['औ', 'ौ'], aai: ['ऐ', 'ै'], aae: ['ऐ', 'ै'], aao: ['औ', 'ौ'],
  au: ['औ', 'ौ'], ai: ['ऐ', 'ै'], aa: ['आ', 'ा'], ee: ['ई', 'ी'],
  ii: ['ई', 'ी'], oo: ['ऊ', 'ू'], uu: ['ऊ', 'ू'], ri: ['ऋ', 'ृ'],
  Ri: ['ॠ', 'ॄ'], ru: ['ऋ', 'ृ'], ae: ['ए', 'े'], aw: ['ऑ', 'ॉ'],
  a: ['अ', ''], i: ['इ', 'ि'], u: ['उ', 'ु'], e: ['ए', 'े'], o: ['ओ', 'ो'],
  A: ['आ', 'ा'], I: ['ई', 'ी'], U: ['ऊ', 'ू'], E: ['ए', 'े'], O: ['ओ', 'ो'],
};

const MODIFIERS: Record<string, string> = {
  '||': '॥', '|': '।', M: 'ं', '~': 'ँ', ':': 'ः',
};

const C_KEYS = Object.keys(CONSONANTS).sort((a, b) => b.length - a.length);
const V_KEYS = Object.keys(VOWELS).sort((a, b) => b.length - a.length);
const M_KEYS = Object.keys(MODIFIERS).sort((a, b) => b.length - a.length);

function romanWordToDevanagari(input: string): string {
  let result = '', i = 0, afterConsonant = false;
  const len = input.length;
  while (i < len) {
    if (input[i] === '\\' && i + 1 < len) {
      result += input[i + 1]; afterConsonant = false; i += 2; continue;
    }
    let matched = false;
    for (const mk of M_KEYS) {
      if (i + mk.length <= len && input.substring(i, i + mk.length) === mk) {
        result += MODIFIERS[mk]; afterConsonant = false; i += mk.length; matched = true; break;
      }
    }
    if (matched) continue;
    let bestC: string | null = null, bestCLen = 0, bestV: string | null = null, bestVLen = 0;
    for (const ck of C_KEYS) {
      if (i + ck.length <= len && input.substring(i, i + ck.length) === ck) { bestC = ck; bestCLen = ck.length; break; }
    }
    for (const vk of V_KEYS) {
      if (i + vk.length <= len && input.substring(i, i + vk.length) === vk) { bestV = vk; bestVLen = vk.length; break; }
    }
    if (bestC && bestCLen >= bestVLen) {
      if (afterConsonant) result += HALANT;
      result += CONSONANTS[bestC]; afterConsonant = true; i += bestCLen;
    } else if (bestV) {
      const pair = VOWELS[bestV]!;
      result += afterConsonant ? pair[1] : pair[0];
      afterConsonant = false; i += bestVLen;
    } else {
      result += input[i]; afterConsonant = false; i++;
    }
  }
  return result;
}

/** Converts English (Roman) phonetic text to Devanagari, word by word. */
export function toDevanagari(text: string): string {
  if (!text) return '';
  return text
    .split(/(\s+)/)
    .map((token) => (/^\s+$/.test(token) || !token ? token : romanWordToDevanagari(token)))
    .join('');
}

const hasDevanagari = (text: string) => /[ऀ-ॿ]/.test(text);

/**
 * Returns `text` unchanged if it already contains Devanagari script;
 * otherwise best-effort transliterates it phonetically. Used so certificate
 * fields render in Hindi even when only an English value was entered —
 * transliteration is approximate by nature (there's no single "correct"
 * Devanagari spelling for a Roman name), so this is a fallback, not a
 * substitute for entering the real Hindi text.
 *
 * Input is lowercased before transliterating: the engine treats specific
 * uppercase letters (T/D/N/L/R, A/I/U/E/O) as deliberate retroflex/long-vowel
 * markers, but every other uppercase letter has no mapping at all and would
 * pass through as a raw Latin character — e.g. "Joshi" (normal Title Case)
 * produces "Jओशि", a stray Latin J sitting inside Devanagari text. Casual
 * name entry doesn't use that uppercase convention on purpose, so lowercasing
 * first avoids the garbled output even though it also gives up the
 * retroflex/long-vowel signalling for the rare input that did intend it.
 */
export function ensureHindi(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return hasDevanagari(trimmed) ? trimmed : toDevanagari(trimmed.toLowerCase());
}

// Nasal + halant + consonant clusters collapse to the anusvara (ं) form,
// e.g. न्त → ंत — the more common modern-Hindi spelling.
function nasalToAnusvara(devText: string): string {
  return devText
    .replace(/न्([त-न])/g, 'ं$1')
    .replace(/म्([प-म])/g, 'ं$1')
    .replace(/ङ्([क-घ])/g, 'ं$1')
    .replace(/ञ्([च-झ])/g, 'ं$1')
    .replace(/ण्([ट-ढ])/g, 'ं$1');
}

/**
 * Generates alternate phonetic spellings for a single Roman word or short
 * phrase by systematically swapping vowel length, retroflex consonants, and
 * a handful of other commonly-confused sound pairs, then transliterating
 * each variant. There's no single "correct" Devanagari spelling for a Roman
 * name, so this surfaces the plausible candidates for a person to pick from
 * rather than silently committing to one.
 */
function generateVariants(word: string): string[] {
  if (!word || !word.trim()) return [];
  const lc = word.toLowerCase();
  const raw: string[] = [];
  const addedInputs = new Set<string>();
  const add = (input: string) => {
    if (addedInputs.has(input)) return;
    addedInputs.add(input);
    const devText = toDevanagari(input);
    const anusvaraForm = nasalToAnusvara(devText);
    if (anusvaraForm !== devText) raw.push(anusvaraForm);
    raw.push(devText);
  };
  add(lc);
  const de = lc.replace(/([bcdfghjklmnpqrstvwxyz])\1/g, '$1');
  const hasDbl = de !== lc;
  if (hasDbl) add(de);
  const bases = hasDbl ? [lc, de] : [lc];
  bases.forEach((b) => {
    let v: string;
    v = b.replace(/i(?!i|e)/g, 'ee'); if (v !== b) add(v);
    v = b.replace(/ee/g, 'i'); if (v !== b) add(v);
    v = b.replace(/u(?!u|o)/g, 'oo'); if (v !== b) add(v);
    v = b.replace(/oo/g, 'u'); if (v !== b) add(v);
    v = b.replace(/a(?![aiou])/g, 'aa'); if (v !== b) add(v);
    v = b.replace(/aa/g, 'a'); if (v !== b) add(v);
    v = b.replace(/e(?!e|i)/g, 'ai'); if (v !== b) add(v);
    v = b.replace(/ai/g, 'e'); if (v !== b) add(v);
    v = b.replace(/o(?!o|u)/g, 'au'); if (v !== b) add(v);
    v = b.replace(/au/g, 'o'); if (v !== b) add(v);
    v = b.replace(/ri(?=[^i]|$)/g, 'ru'); if (v !== b) add(v);
    v = b.replace(/ru/g, 'ri'); if (v !== b) add(v);
    v = b.replace(/sh/g, 'Sh'); if (v !== b) add(v);
    v = b.replace(/Sh/gi, 'sh'); if (v !== b) add(v);
    v = b.replace(/t(?!h)/g, 'T'); if (v !== b) add(v);
    v = b.replace(/T(?!h)/g, 't'); if (v !== b) add(v);
    v = b.replace(/d(?!h)/g, 'D'); if (v !== b) add(v);
    v = b.replace(/D(?!h)/g, 'd'); if (v !== b) add(v);
    v = b.replace(/n(?!$)/g, 'N'); if (v !== b) add(v);
    v = b.replace(/N/g, 'n'); if (v !== b) add(v);
  });
  add(word.toLowerCase());
  const seen = new Set<string>();
  const unique: string[] = [];
  raw.forEach((t) => {
    if (!seen.has(t)) { seen.add(t); unique.push(t); }
  });
  return unique;
}

/**
 * Returns a short list of alternate Devanagari spellings for a Roman name
 * (up to `limit`, default 8), for a "pick the right one" UI rather than
 * committing to a single best-effort guess. Returns an empty list for
 * inputs too short to meaningfully vary, or that already contain Devanagari
 * (nothing to suggest — the real spelling is already there).
 */
export function getNameSuggestions(text: string, limit = 8): string[] {
  const trimmed = text.trim();
  if (trimmed.length < 2 || hasDevanagari(trimmed)) return [];
  return generateVariants(trimmed).slice(0, limit);
}
