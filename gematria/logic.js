/* Gematria: pure logic (no DOM). Used by /gematria/ and tested in gematria.test.mjs. */

const BASE = 'אבגדהוזחטיכלמנסעפצקרשת';
const VALS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400];
const FINAL_BASE = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const GADOL_FINAL = { 'ך': 500, 'ם': 600, 'ן': 700, 'ף': 800, 'ץ': 900 };
const NAMES = { 'א': 'אלף', 'ב': 'בית', 'ג': 'גימל', 'ד': 'דלת', 'ה': 'הא', 'ו': 'ואו', 'ז': 'זין', 'ח': 'חית', 'ט': 'טית', 'י': 'יוד', 'כ': 'כף', 'ל': 'למד', 'מ': 'מם', 'נ': 'נון', 'ס': 'סמך', 'ע': 'עין', 'פ': 'פא', 'צ': 'צדי', 'ק': 'קוף', 'ר': 'ריש', 'ש': 'שין', 'ת': 'תו' };

const baseOf = (ch) => FINAL_BASE[ch] || ch;
export const std = (ch) => { const i = BASE.indexOf(baseOf(ch)); return i < 0 ? 0 : VALS[i]; };
export const ordinal = (ch) => BASE.indexOf(baseOf(ch)) + 1;
export const isLetter = (ch) => /[א-ת]/.test(ch);

/** Only the Hebrew letters of a text (points, trope, punctuation, spaces, geresh/gershayim all dropped). */
export function lettersOf(text) {
  return Array.from(String(text == null ? '' : text).normalize('NFD')).filter(isLetter);
}

export const METHODS = [
  { id: 'standard', name: 'Standard', he: 'מספר הכרחי', blurb: 'Every letter at face value: א = 1 … ת = 400. Final letters count as their regular form (ם = 40).' },
  { id: 'gadol', name: 'Gadol', he: 'מספר גדול', blurb: 'Like Standard, but the five final letters keep going: ך 500, ם 600, ן 700, ף 800, ץ 900.' },
  { id: 'siduri', name: 'Siduri', he: 'מספר סידורי', blurb: 'Ordinal: each letter by its place in the alef-beis, א = 1 … ת = 22.' },
  { id: 'katan', name: 'Katan', he: 'מספר קטן', blurb: 'Reduced: zeros are dropped from each letter. י = 1, כ = 2, ק = 1, ת = 4.' },
  { id: 'atbash', name: 'Atbash', he: 'אתב״ש', blurb: 'Each letter is swapped with its mirror (א ↔ ת, ב ↔ ש …) and the new word is counted in Standard.' },
  { id: 'kadmi', name: 'Kadmi', he: 'מספר קדמי', blurb: 'Cumulative: each letter counts itself plus everything before it (ג = 1+2+3 = 6, י = 1+…+10 = 55).' },
  { id: 'perati', name: 'Perati', he: 'מספר פרטי', blurb: 'Each letter’s value squared: א = 1, ב = 4, י = 100, ת = 160,000.' },
  { id: 'milui', name: 'Milui', he: 'מילוי', blurb: 'Each letter is spelled out in full and the spelling is counted (א → אלף = 111). Spelling used: אלף בית גימל דלת הא ואו זין חית טית יוד כף למד מם נון סמך עין פא צדי קוף ריש שין תו — the “Mah” (45) convention, so יהוה = 45.' },
];
export const methodById = (id) => METHODS.find((m) => m.id === id) || METHODS[0];

/** One letter under one method: { ch, v, alt } (alt = the swapped letter for Atbash, the spelling for Milui). */
export function letterInfo(method, ch) {
  switch (method) {
    case 'gadol': return { ch, v: GADOL_FINAL[ch] || std(ch) };
    case 'siduri': return { ch, v: ordinal(ch) };
    case 'katan': { const v = std(ch); return { ch, v: v >= 100 ? v / 100 : v >= 10 ? v / 10 : v }; }
    case 'atbash': { const i = BASE.indexOf(baseOf(ch)); const m = BASE[21 - i]; return { ch, v: std(m), alt: m }; }
    case 'kadmi': { const v = std(ch); return { ch, v: (v * (v + 1)) / 2 }; }
    case 'perati': { const v = std(ch); return { ch, v: v * v }; }
    case 'milui': { const nm = NAMES[baseOf(ch)] || ''; let v = 0; for (const c of nm) v += std(c); return { ch, v, alt: nm }; }
    default: return { ch, v: std(ch) };
  }
}

/** Full result: { letters:[{ch,v,alt}], total, words:[{text,total}], hebrew } */
export function compute(text, method = 'standard') {
  const letters = lettersOf(text).map((ch) => letterInfo(method, ch));
  const total = letters.reduce((a, l) => a + l.v, 0);
  const words = String(text == null ? '' : text).split(/[\s־\-–—_/]+/).map((w) => {
    const ls = lettersOf(w).map((ch) => letterInfo(method, ch));
    return { text: lettersOf(w).join(''), total: ls.reduce((a, l) => a + l.v, 0) };
  }).filter((w) => w.text);
  return { letters, total, words, hebrew: lettersOf(text).join('') };
}
export const valueOf = (text, method = 'standard') => compute(text, method).total;

/** "300 + 30 + 6 + 40 = 376" */
export function equation(res) {
  if (!res.letters.length) return '';
  return `${res.letters.map((l) => l.v).join(' + ')} = ${res.total}`;
}
/** Plain text of the breakdown, for copying. */
export function breakdownText(text, method = 'standard') {
  const r = compute(text, method);
  const m = methodById(method);
  if (!r.letters.length) return '';
  const lines = [`${r.hebrew} = ${r.total} (${m.name})`];
  lines.push(r.letters.map((l) => `${l.ch}${l.alt ? '→' + l.alt : ''} ${l.v}`).join('  '));
  lines.push(equation(r));
  return lines.join('\n');
}

/* ---------------- numbers <-> Hebrew numerals ---------------- */
const GEM = [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']];
function part(n) {                       // 1..999 -> letters, 15/16 as ט״ו / ט״ז
  let s = '';
  while (n > 0) {
    if (n === 15) { s += 'טו'; break; }
    if (n === 16) { s += 'טז'; break; }
    for (const [v, ch] of GEM) if (n >= v) { s += ch; n -= v; break; }
  }
  return s;
}
const punctuate = (s) => (s.length === 1 ? s + '׳' : s.slice(0, -1) + '״' + s.slice(-1));

/**
 * 5787 -> ה׳תשפ״ז. Options: thousands (default true: write the ה׳), punct (geresh/gershayim).
 * With thousands:false the thousands are left off (the way years are usually written): תשפ״ז.
 * Valid for 1 … 999,999; anything else gives ''.
 */
export function numToHeb(n, { thousands = true, punct = true } = {}) {
  n = Math.floor(Number(n));
  if (!(n >= 1 && n <= 999999)) return '';
  const th = Math.floor(n / 1000), r = n % 1000;
  if (th && thousands) {
    const t = part(th);
    if (!r) return punct ? t + '׳' : t;
    return (punct ? t + '׳' : t) + (punct ? punctuate(part(r)) : part(r));
  }
  if (!r) return punct ? punctuate(part(th)) : part(th);   // e.g. 5000 without thousands: just ה׳
  return punct ? punctuate(part(r)) : part(r);
}

/**
 * Hebrew numeral -> number. ה׳תשפ״ז -> 5787, תשפ״ז -> 787, ט״ו -> 15.
 * A geresh in the middle (letters, ׳, letters) marks thousands. Returns null if it is not a numeral.
 */
export function hebToNum(text) {
  const t = String(text == null ? '' : text).normalize('NFD').replace(/[֑-ׇ]/g, '').replace(/[\s״"”“]/g, '');
  if (!t) return null;
  const parts = t.split(/[׳'’]/);
  if (parts.length > 2 || parts.some((p) => !/^[\u05D0-\u05EA]*$/.test(p))) return null;
  const val = (p) => Array.from(p).reduce((a, c) => a + std(c), 0);
  if (parts.length === 1) return parts[0] ? val(parts[0]) : null;
  if (!parts[0]) return null;
  return parts[1] ? val(parts[0]) * 1000 + val(parts[1]) : val(parts[0]);   // "ה׳" alone is just 5
}
