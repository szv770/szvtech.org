/* Hebrew text helpers (pure, no DOM): shared by /hebtype/ and /gematria/. */

// Hebrew letters, points and cantillation
export const LETTER_RE = /[א-ת]/;
export const MARK_RE = /[֑-ׇֽֿׁׂׅׄ]/;       // points + trope (not maqaf / sof pasuq)
const MARKS_G = /[֑-ׇֽֿׁׂׅׄ]/g;
const TROPE_G = /[֑-ֽ֯]/g;                                            // cantillation only (leaves vowels)
export const FINAL_OF = { 'כ': 'ך', 'מ': 'ם', 'נ': 'ן', 'פ': 'ף', 'צ': 'ץ' };
export const BASE_OF = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

const nfd = (s) => String(s == null ? '' : s).normalize('NFD');   // splits presentation forms (שׁ U+FB2A -> ש + dot)

/** Remove niqqud AND cantillation. Maqaf and sof pasuq stay. */
export const stripNikud = (s) => nfd(s).replace(MARKS_G, '').normalize('NFC');
/** Remove only the cantillation marks (teamim), keep the vowels. */
export const stripTrope = (s) => nfd(s).replace(TROPE_G, '').normalize('NFC');
/** Does the text contain any vowel point? (used to decide how to transliterate) */
export const hasNikud = (s) => /[ְ-ׇּׁׂ]/.test(nfd(s));

/** Counts for the stats line. */
export function countText(s) {
  const t = nfd(s);
  let letters = 0, marks = 0;
  for (const ch of t) { if (LETTER_RE.test(ch)) letters++; else if (MARK_RE.test(ch)) marks++; }
  const words = (t.match(/[^\s־]+/g) || []).filter((w) => /[א-תA-Za-z0-9]/.test(w)).length;
  return { letters, words, marks, chars: Array.from(String(s || '')).length };
}

/**
 * Fix final letters: the last letter of each Hebrew word becomes ך ם ן ף ץ,
 * and a final form sitting in the middle of a word goes back to כ מ נ פ צ.
 * A word that ends in a geresh (an abbreviation like מ׳) is left alone.
 */
export function fixFinals(s) {
  const t = nfd(s);
  const out = t.replace(/[א-ת֑-ֽֿ-ׂׄ-ׇ׳״]+/g, (run) => {
    const ch = Array.from(run);
    let last = -1;
    for (let i = 0; i < ch.length; i++) if (LETTER_RE.test(ch[i])) last = i;
    if (last < 0) return run;
    const endsGeresh = ch[ch.length - 1] === '׳';
    const single = ch.filter((c) => LETTER_RE.test(c)).length === 1;
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i];
      if (!LETTER_RE.test(c)) continue;
      if (i === last && !endsGeresh && !single) { if (FINAL_OF[c]) ch[i] = FINAL_OF[c]; }
      else if (BASE_OF[c]) ch[i] = BASE_OF[c];
    }
    return ch.join('');
  });
  return out.normalize('NFC');
}
/** Turn every final letter into its regular form (for typing practice / odd fonts). */
export const unFinal = (s) => String(s || '').replace(/[ךםןףץ]/g, (c) => BASE_OF[c]);

/**
 * Visual reverse for apps that show Hebrew left-to-right. Reverses each line
 * but keeps every letter together with its points.
 */
export function reverseVisual(s) {
  return String(s || '').split('\n').map((line) => {
    const clusters = line.match(/[\s\S][֑-ׇ‍‌]*/gu) || [];
    // brackets mirror when reversed
    return clusters.reverse().map(mirror).join('');
  }).join('\n');
}
const PAIRS = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '«': '»', '»': '«' };
const mirror = (c) => (c.length === 1 && PAIRS[c]) || c;
