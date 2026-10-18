// tehillim/logic.js — pure, dependency-free logic for /tehillim (no DOM, so
// `node tehillim/_tehillim.test.mjs` can test it).
//
// Cycles (checked against the standard table on tfilah.org and the Chabad.org
// guidance "in a 29-day month the 29th and 30th portions are both said on the 29th"):
//   monthly: the book split over the 30 days of the Hebrew month; Ps. 119 is split
//            over days 25 and 26 (verses 1-96, 97-176).
//   weekly : the book split over the 7 days of the week (Sunday first).
//
// A "unit" is what the reader shows one screen at a time: { ps } for a whole
// chapter or { ps: 119, from: 1, to: 96 } for a part of Psalm 119.
//
// Tiny shared contract with /seder (localStorage key `szv-seder-pings`):
//   JSON array of { id, kind: 'tehillim', ymd: 'YYYY-MM-DD', at: <ms>, what: 'Psalms 39–43' }.
//   /tehillim appends one when today's set is complete (id = 'tehillim:<ymd>', no duplicates);
//   /seder reads it to offer "log this as a session" and removes entries it has handled.

export const BOOK_LENGTH = 150;

// [fromPsalm, toPsalm] or [119, 119, fromVerse, toVerse]
const MONTHLY = [null,
  [1, 9], [10, 17], [18, 22], [23, 28], [29, 34], [35, 38], [39, 43], [44, 48], [49, 54], [55, 59],
  [60, 65], [66, 68], [69, 71], [72, 76], [77, 78], [79, 82], [83, 87], [88, 89], [90, 96], [97, 103],
  [104, 105], [106, 107], [108, 112], [113, 118], [119, 119, 1, 96], [119, 119, 97, 176], [120, 134], [135, 139],
  [140, 144], [145, 150]];

const WEEKLY = [[1, 29], [30, 50], [51, 72], [73, 89], [90, 106], [107, 119], [120, 150]]; // Sunday..Shabbos

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Shabbos'];

function expand(r) {
  if (r.length === 4) return [{ ps: r[0], from: r[2], to: r[3] }];
  const out = [];
  for (let p = r[0]; p <= r[1]; p++) out.push({ ps: p });
  return out;
}

/** Units for Hebrew day-of-month `d` (1-30). `monthLength` 29 merges day 30 into day 29. */
export function monthlyUnits(d, monthLength = 30) {
  d = Math.floor(d);
  if (!(d >= 1 && d <= 30)) return [];
  if (d === 29 && monthLength === 29) return [...expand(MONTHLY[29]), ...expand(MONTHLY[30])];
  return expand(MONTHLY[d]);
}
/** Units for weekday 0 (Sunday) .. 6 (Shabbos). */
export function weeklyUnits(wd) {
  wd = ((Math.floor(wd) % 7) + 7) % 7;
  return expand(WEEKLY[wd]);
}
/** Every chapter 1-150 as whole-chapter units. */
export const allUnits = () => Array.from({ length: BOOK_LENGTH }, (_, i) => ({ ps: i + 1 }));

export const unitKey = (u) => (u.from ? `${u.ps}:${u.from}-${u.to}` : String(u.ps));
export const unitEq = (a, b) => unitKey(a) === unitKey(b);

// ---- labels ---------------------------------------------------------------

const GEM = [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']];
/** 1-999 as a Hebrew numeral with geresh / gershayim (15 = טו, 16 = טז). */
export function hebNum(n, marks = true) {
  n = Math.floor(n);
  if (!(n > 0 && n < 1000)) return '';
  let s = '';
  while (n > 0) {
    if (n === 15) { s += 'טו'; break; }
    if (n === 16) { s += 'טז'; break; }
    for (const [v, ch] of GEM) if (n >= v) { s += ch; n -= v; break; }
  }
  if (!marks) return s;
  return s.length === 1 ? s + '׳' : s.slice(0, -1) + '״' + s.slice(-1);
}

export const unitLabel = (u) => (u.from ? `Psalm ${u.ps}:${u.from}–${u.to}` : `Psalm ${u.ps}`);
export const unitShort = (u) => (u.from ? `${u.ps}:${u.from}–${u.to}` : String(u.ps));
export const unitHe = (u) => (u.from ? `תהילים ${hebNum(u.ps)} · ${hebNum(u.from)}–${hebNum(u.to)}` : `תהילים ${hebNum(u.ps)}`);
export const unitHeShort = (u) => (u.from ? `${hebNum(u.ps)} · ${hebNum(u.from)}–${hebNum(u.to)}` : hebNum(u.ps));

/** "Psalms 39–43" / "Psalm 119:1–96" / "Psalms 140–150". */
export function rangeLabel(units) {
  if (!units.length) return '';
  const a = units[0], b = units[units.length - 1];
  if (units.length === 1) return unitLabel(a);
  return `Psalms ${unitShort(a)}–${unitShort(b)}`;
}
export function rangeHe(units) {
  if (!units.length) return '';
  const a = units[0], b = units[units.length - 1];
  if (units.length === 1) return unitHe(a);
  return `תהילים ${unitHeShort(a)}–${unitHeShort(b)}`;
}

// ---- text -----------------------------------------------------------------

const ENT = { '&thinsp;': ' ', '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
/** Sefaria Hebrew verse (light HTML) -> plain text. Keeps nikud, taamim and the paseq. */
export function cleanVerse(s) {
  return String(s == null ? '' : s)
    .replace(/<span class="mam-spi-[^"]*">[^<]*<\/span>/g, '')   // parashah markers {פ} {ס}
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:thinsp|nbsp|amp|lt|gt|quot|#39);/g, (m) => ENT[m])
    .replace(/\s+/g, ' ')
    .trim();
}
/** Remove cantillation marks (U+0591-05AF), keep vowels (nikud), meteg and punctuation. */
export const stripTrop = (s) => String(s).replace(/[֑-֯]/g, '');

/** Verses of a unit from a whole chapter's verses (1-based verse numbers kept). */
export function unitVerses(u, verses) {
  const from = u.from || 1, to = u.to || verses.length;
  const out = [];
  for (let v = from; v <= Math.min(to, verses.length); v++) out.push({ n: v, t: verses[v - 1] });
  return out;
}

/** Validate a Sefaria v3 payload -> array of cleaned verses, or null. */
export function parseSefaria(j, ps) {
  try {
    const v = j && j.versions && j.versions.find((x) => x && Array.isArray(x.text));
    if (!v || !v.text.length || v.text.length > 180) return null;
    const out = v.text.map((x) => cleanVerse(Array.isArray(x) ? x.join(' ') : x));
    if (out.some((x) => !x) || (ps === 119 && out.length !== 176)) return null;
    return out;
  } catch (e) { return null; }
}

// ---- progress & streak ----------------------------------------------------

/** keys: array of unitKey strings that are marked said. */
export const doneCount = (units, keys) => units.filter((u) => keys.includes(unitKey(u))).length;
export const isComplete = (units, keys) => units.length > 0 && doneCount(units, keys) === units.length;
/** Index of the first unit not yet said (or -1). */
export const firstOpen = (units, keys) => units.findIndex((u) => !keys.includes(unitKey(u)));

export const pad2 = (n) => String(n).padStart(2, '0');
export function parseYMD(s) {
  const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!r) return null;
  const t = Date.UTC(+r[1], +r[2] - 1, +r[3]);
  const d = new Date(t);
  return d.getUTCMonth() === +r[2] - 1 && d.getUTCDate() === +r[3] ? Math.round(t / 86400000) : null;
}
export const dayToYMD = (n) => { const d = new Date(n * 86400000); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; };
export const shiftYMD = (ymd, n) => { const a = parseYMD(ymd); return a == null ? ymd : dayToYMD(a + n); };

/**
 * full: { 'YYYY-MM-DD': truthy } days whose set was fully said.
 * Streak = consecutive days ending today, or ending yesterday while today is still open.
 */
export function streakOf(full, today) {
  const t = parseYMD(today);
  const has = (n) => !!(full && full[dayToYMD(n)]);
  if (t == null) return { streak: 0, todayDone: false, best: 0 };
  const todayDone = has(t);
  let streak = 0;
  for (let a = todayDone ? t : t - 1; has(a); a--) streak++;
  const days = Object.keys(full || {}).filter((k) => full[k]).map(parseYMD).filter((x) => x != null).sort((a, b) => a - b);
  let best = 0, run = 0, prev = null;
  for (const a of days) { run = prev !== null && a === prev + 1 ? run + 1 : 1; prev = a; if (run > best) best = run; }
  return { streak, todayDone, best: Math.max(best, streak) };
}

/** Drop day records older than `keep` days before `today`. */
export function prune(obj, today, keep = 90) {
  const t = parseYMD(today), out = {};
  for (const [k, v] of Object.entries(obj || {})) { const a = parseYMD(k); if (a != null && a > t - keep && a <= t + 2) out[k] = v; }
  return out;
}

/** Plan key under which a day's marks are stored. */
export const planKey = (mode, n) => (mode === 'month' ? `m${n}` : mode === 'week' ? `w${n}` : 'x');
