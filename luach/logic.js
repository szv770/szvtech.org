// logic.js — dependency-free Jewish calendar logic for /luach.
//
// Pure functions only (no DOM), so `node luach/_luach.test.mjs` can test them.
// The page uses @hebcal/core for holidays, parsha, omer text and molad; this
// module covers what the page computes itself: Hebrew <-> Gregorian
// arithmetic, birthday / yahrzeit anniversaries (Adar in leap years, 30
// Cheshvan / Kislev), Daf Yomi, the monthly Tehillim cycle, the Omer day,
// the daily-study streak and Chabad dates.
//
// Day numbers are "absolute" (R.D.) days: 1 = Monday, 1 January 1 CE (proleptic
// Gregorian). Months use Hebcal numbering: 1 Nissan ... 6 Elul, 7 Tishrei ...
// 12 Adar (Adar I in a leap year), 13 Adar II.

export const NISAN = 1, IYYAR = 2, SIVAN = 3, TAMUZ = 4, AV = 5, ELUL = 6,
  TISHREI = 7, CHESHVAN = 8, KISLEV = 9, TEVET = 10, SHVAT = 11, ADAR_I = 12, ADAR_II = 13;

const EPOCH = -1373428;          // R.D. of the day before 1 Tishrei AM 1
const UNIX_EPOCH_ABS = 719163;   // R.D. of 1970-01-01
const DAY = 86400000;

// ---------------------------------------------------------------------------
// Hebrew calendar arithmetic (after Dershowitz & Reingold / Hebcal)
// ---------------------------------------------------------------------------

export const isLeapYear = (y) => (1 + y * 7) % 19 < 7;
export const monthsInYear = (y) => (isLeapYear(y) ? 13 : 12);

const elapsedCache = new Map();
/** Days from the Hebrew epoch to 1 Tishrei of year y. */
export function elapsedDays(y) {
  let v = elapsedCache.get(y);
  if (v !== undefined) return v;
  const p = y - 1;
  const mElapsed = 235 * Math.floor(p / 19) + 12 * (p % 19) + Math.floor(((p % 19) * 7 + 1) / 19);
  const pElapsed = 204 + 793 * (mElapsed % 1080);
  const hElapsed = 5 + 12 * mElapsed + 793 * Math.floor(mElapsed / 1080) + Math.floor(pElapsed / 1080);
  const parts = (pElapsed % 1080) + 1080 * (hElapsed % 24);
  const day = 1 + 29 * mElapsed + Math.floor(hElapsed / 24);
  let alt = day;
  if (parts >= 19440 || (day % 7 === 2 && parts >= 9924 && !isLeapYear(y)) || (day % 7 === 1 && parts >= 16789 && isLeapYear(p))) alt++;
  if (alt % 7 === 0 || alt % 7 === 3 || alt % 7 === 5) alt++;
  elapsedCache.set(y, alt);
  return alt;
}
export const daysInYear = (y) => elapsedDays(y + 1) - elapsedDays(y);
export const longCheshvan = (y) => daysInYear(y) % 10 === 5;
export const shortKislev = (y) => daysInYear(y) % 10 === 3;

export function daysInMonth(m, y) {
  switch (m) {
    case IYYAR: case TAMUZ: case ELUL: case TEVET: case ADAR_II: return 29;
    case ADAR_I: return isLeapYear(y) ? 30 : 29;
    case CHESHVAN: return longCheshvan(y) ? 30 : 29;
    case KISLEV: return shortKislev(y) ? 29 : 30;
    default: return 30;
  }
}

/** Hebrew date -> absolute day. Out-of-range days are not normalised. */
export function hebrewToAbs(y, m, d) {
  let t = d;
  if (m < TISHREI) {
    for (let i = TISHREI, n = monthsInYear(y); i <= n; i++) t += daysInMonth(i, y);
    for (let i = NISAN; i < m; i++) t += daysInMonth(i, y);
  } else {
    for (let i = TISHREI; i < m; i++) t += daysInMonth(i, y);
  }
  return EPOCH + elapsedDays(y) + t - 1;
}

/** Absolute day -> { y, m, d } Hebrew date. */
export function absToHebrew(abs) {
  let y = Math.floor((abs - EPOCH) / 365.2468) + 1;
  while (hebrewToAbs(y, TISHREI, 1) > abs) y--;
  while (hebrewToAbs(y + 1, TISHREI, 1) <= abs) y++;
  let m = abs < hebrewToAbs(y, NISAN, 1) ? TISHREI : NISAN;
  while (abs > hebrewToAbs(y, m, daysInMonth(m, y))) m++;
  return { y, m, d: abs - hebrewToAbs(y, m, 1) + 1 };
}

// ---------------------------------------------------------------------------
// Gregorian (civil date strings, no time zones)
// ---------------------------------------------------------------------------

export const pad2 = (n) => String(n).padStart(2, '0');
export const ymdStr = (y, m, d) => `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;

/** 'YYYY-MM-DD' -> { y, m, d } or null when invalid. */
export function parseYMD(s) {
  const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!r) return null;
  const y = +r[1], m = +r[2], d = +r[3];
  const t = new Date(Date.UTC(2000, m - 1, d));
  t.setUTCFullYear(y);
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return { y, m, d };
}
export function gregToAbs(y, m, d) {
  const t = new Date(Date.UTC(2000, m - 1, d));
  t.setUTCFullYear(y);
  return Math.round(t.getTime() / DAY) + UNIX_EPOCH_ABS;
}
export function absToGreg(abs) {
  const t = new Date((abs - UNIX_EPOCH_ABS) * DAY);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), wd: t.getUTCDay() };
}
export const absToYMD = (abs) => { const g = absToGreg(abs); return ymdStr(g.y, g.m, g.d); };
export const ymdToAbs = (s) => { const g = parseYMD(s); return g ? gregToAbs(g.y, g.m, g.d) : null; };
export const weekday = (abs) => ((abs % 7) + 7) % 7; // 0 = Sunday

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

const MONTHS_EN = ['', 'Nissan', 'Iyar', 'Sivan', 'Tammuz', 'Menachem Av', 'Elul', 'Tishrei', 'Cheshvan', 'Kislev', 'Teves', 'Shevat', 'Adar', 'Adar II'];
const MONTHS_SHORT = ['', 'Nissan', 'Iyar', 'Sivan', 'Tammuz', 'Av', 'Elul', 'Tishrei', 'Cheshvan', 'Kislev', 'Teves', 'Shevat', 'Adar', 'Adar II'];
const MONTHS_HE = ['', 'ניסן', 'אייר', 'סיון', 'תמוז', 'מנחם אב', 'אלול', 'תשרי', 'חשון', 'כסלו', 'טבת', 'שבט', 'אדר', 'אדר ב׳'];

/** English month name (Chabad spelling). Adar is "Adar I" in a leap year. */
export function monthName(m, y, short = false) {
  if (m === ADAR_I && isLeapYear(y)) return 'Adar I';
  return (short ? MONTHS_SHORT : MONTHS_EN)[m] || '';
}
export function monthNameHe(m, y) {
  if (m === ADAR_I && isLeapYear(y)) return 'אדר א׳';
  return MONTHS_HE[m] || '';
}
/** Months of year y in calendar order (Tishrei first): [{ m, name }]. */
export function monthsOfYear(y) {
  const out = [];
  const n = monthsInYear(y);
  for (let i = TISHREI; i <= n; i++) out.push({ m: i, name: monthName(i, y) });
  for (let i = NISAN; i < TISHREI; i++) out.push({ m: i, name: monthName(i, y) });
  return out;
}

const GEM = [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']];
/** Hebrew numeral with geresh / gershayim; years drop the thousands (5787 -> תשפ״ז). */
export function gematriya(n) {
  n = Math.floor(n) % 1000;
  if (n <= 0) return '';
  let s = '';
  while (n > 0) {
    if (n === 15) { s += 'טו'; break; }
    if (n === 16) { s += 'טז'; break; }
    for (const [v, ch] of GEM) if (n >= v) { s += ch; n -= v; break; }
  }
  return s.length === 1 ? s + '׳' : s.slice(0, -1) + '״' + s.slice(-1);
}
export const hebrewDateHe = (h) => `${gematriya(h.d)} ${monthNameHe(h.m, h.y)} ${gematriya(h.y)}`;
export const hebrewDateEn = (h, withYear = true) => `${h.d} ${monthName(h.m, h.y)}${withYear ? ' ' + h.y : ''}`;

// ---------------------------------------------------------------------------
// Anniversaries: birthdays and yahrzeits (rules as in Hebcal / Shulchan Aruch)
// ---------------------------------------------------------------------------

/**
 * Hebrew birthday / anniversary of `orig` ({y,m,d}) in Hebrew year `hy`.
 *  - Born in Adar of a regular year (or Adar II of a leap year) -> Adar II in a leap year.
 *  - Born in Adar I of a leap year -> Adar I in leap years, Adar otherwise.
 *  - 30 Cheshvan / 30 Kislev / 30 Adar I that the year lacks -> 1 Kislev / 1 Teves / 1 Nissan.
 * Returns {y,m,d} or null when hy is before the original year.
 */
export function birthdayIn(orig, hy) {
  if (hy < orig.y) return null;
  if (hy === orig.y) return { ...orig };
  const leapOrig = isLeapYear(orig.y);
  let { m, d } = orig;
  if ((m === ADAR_I && !leapOrig) || (m === ADAR_II && leapOrig)) {
    m = monthsInYear(hy);
  } else if (m === CHESHVAN && d === 30 && !longCheshvan(hy)) {
    m = KISLEV; d = 1;
  } else if (m === KISLEV && d === 30 && shortKislev(hy)) {
    m = TEVET; d = 1;
  } else if (m === ADAR_I && d === 30 && leapOrig && !isLeapYear(hy)) {
    m = NISAN; d = 1;
  }
  return { y: hy, m, d };
}

/**
 * Yahrzeit of a passing on `death` ({y,m,d}) in Hebrew year `hy` (> death year).
 *  - 30 Cheshvan / 30 Kislev: in a year that has the 30th, the 30th. In a year without
 *    it: the 29th if the first anniversary also lacked the 30th, otherwise 1 Kislev /
 *    1 Teves (Shulchan Aruch YD 402:12 with Magen Avraham; matches Hebcal).
 *  - Adar II -> the last Adar of the year (Adar, or Adar II in a leap year).
 *  - Adar of a regular year or Adar I -> Adar I in a leap year (common custom;
 *    some also observe Adar II).
 *  - 30 Adar I in a year with one Adar -> 30 Shevat.
 */
export function yahrzeitIn(death, hy) {
  if (hy <= death.y) return null;
  let { m, d } = death;
  if (m === CHESHVAN && d === 30 && !longCheshvan(hy)) {
    if (longCheshvan(death.y + 1)) { m = KISLEV; d = 1; } else d = 29;
  } else if (m === KISLEV && d === 30 && shortKislev(hy)) {
    if (!shortKislev(death.y + 1)) { m = TEVET; d = 1; } else d = 29;
  } else if (m === ADAR_II) {
    m = monthsInYear(hy);
  } else if (m === ADAR_I && d === 30 && !isLeapYear(hy)) {
    m = SHVAT;
  }
  return { y: hy, m, d };
}

/**
 * Upcoming occurrences: `kind` 'birthday' | 'yahrzeit', `orig` Hebrew date,
 * from absolute day `fromAbs` (inclusive), `count` results.
 * Each: { hy, h:{y,m,d}, abs, ymd, eveYmd } — eveYmd is the civil date of the evening it begins.
 */
export function nextOccurrences(kind, orig, fromAbs, count = 5) {
  const fn = kind === 'yahrzeit' ? yahrzeitIn : birthdayIn;
  const out = [];
  let hy = Math.max(absToHebrew(fromAbs).y - 1, orig.y);
  for (let guard = 0; out.length < count && guard < count + 4; guard++, hy++) {
    const h = fn(orig, hy);
    if (!h) continue;
    const abs = hebrewToAbs(h.y, h.m, h.d);
    if (abs < fromAbs) continue;
    out.push({ hy, h, abs, ymd: absToYMD(abs), eveYmd: absToYMD(abs - 1) });
  }
  return out;
}

/** Validate a Hebrew date entered by a person (month must exist in that year). */
export function validHebrew(y, m, d) {
  if (!Number.isInteger(y) || y < 3762 || y > 6000) return false;
  if (!Number.isInteger(m) || m < 1 || m > monthsInYear(y)) return false;
  return Number.isInteger(d) && d >= 1 && d <= daysInMonth(m, y);
}

// ---------------------------------------------------------------------------
// Daily learning
// ---------------------------------------------------------------------------

const SHAS = [['Berachos', 64], ['Shabbos', 157], ['Eruvin', 105], ['Pesachim', 121], ['Shekalim', 22], ['Yoma', 88],
  ['Sukkah', 56], ['Beitzah', 40], ['Rosh Hashanah', 35], ['Taanis', 31], ['Megillah', 32], ['Moed Katan', 29],
  ['Chagigah', 27], ['Yevamos', 122], ['Kesubos', 112], ['Nedarim', 91], ['Nazir', 66], ['Sotah', 49], ['Gittin', 90],
  ['Kiddushin', 82], ['Bava Kamma', 119], ['Bava Metzia', 119], ['Bava Basra', 176], ['Sanhedrin', 113], ['Makkos', 24],
  ['Shevuos', 49], ['Avodah Zarah', 76], ['Horayos', 14], ['Zevachim', 120], ['Menachos', 110], ['Chullin', 142],
  ['Bechoros', 61], ['Arachin', 34], ['Temurah', 34], ['Kerisos', 28], ['Meilah', 22], ['Kinnim', 4], ['Tamid', 9],
  ['Middos', 5], ['Niddah', 73]];
const DAF_NEW_CYCLES = gregToAbs(1975, 6, 24); // cycle 8 onward: 2711 days each

/** Daf Yomi for an absolute day (from 24 June 1975): { masechta, daf, cycle } or null. */
export function dafYomi(abs) {
  if (abs < DAF_NEW_CYCLES) return null;
  const cycle = 8 + Math.floor((abs - DAF_NEW_CYCLES) / 2711);
  const dno = (abs - DAF_NEW_CYCLES) % 2711;
  let total = 0;
  for (let j = 0; j < SHAS.length; j++) {
    const [name, blatt] = SHAS[j];
    total += blatt - 1;
    if (dno < total) {
      let daf = blatt + 1 - (total - dno);
      if (j === 36) daf += 21;      // Kinnim is printed at Meilah 22b-25a
      else if (j === 37) daf += 24; // Tamid 26-33
      else if (j === 38) daf += 32; // Middos 34-37
      return { masechta: name, daf, cycle };
    }
  }
  return null;
}

// Tehillim divided over the days of the Hebrew month (Chabad custom).
const TEHILLIM = ['', '1–9', '10–17', '18–22', '23–28', '29–34', '35–38', '39–43', '44–48', '49–54', '55–59',
  '60–65', '66–68', '69–71', '72–76', '77–78', '79–82', '83–87', '88–89', '90–96', '97–103', '104–105', '106–107',
  '108–112', '113–118', '119:1–96', '119:97–176', '120–134', '135–139', '140–144', '145–150'];
/** Psalms for Hebrew day-of-month `d`; on the 29th of a 29-day month the rest of the book is said. */
export function tehillimFor(d, monthLength = 30) {
  if (d === 29 && monthLength === 29) return '140–150';
  return TEHILLIM[d] || '';
}

/** Weekday aliyah of the weekly Chumash shiur (Sunday = Rishon ... Shabbos = Shevi'i). */
export const ALIYOS = ['Rishon', 'Sheni', 'Shlishi', "Revi'i", 'Chamishi', 'Shishi', "Shevi'i"];

// ---------------------------------------------------------------------------
// Sefiras HaOmer
// ---------------------------------------------------------------------------

/** Omer day (1-49) whose count is said on the night that begins the Hebrew day `h`, else 0. */
export function omerDay(h) {
  const start = hebrewToAbs(h.y, NISAN, 16);
  const n = hebrewToAbs(h.y, h.m, h.d) - start + 1;
  return n >= 1 && n <= 49 ? n : 0;
}
const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty'];
const words = (n) => n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
/** "Today is twenty-three days, which are three weeks and two days, of the Omer." */
export function omerSentence(n) {
  if (n < 1 || n > 49) return '';
  const days = n === 1 ? 'one day' : `${words(n)} days`;
  if (n < 7) return `Today is ${days} of the Omer.`;
  const w = Math.floor(n / 7), r = n % 7;
  const wk = w === 1 ? 'one week' : `${words(w)} weeks`;
  const rest = r ? ` and ${r === 1 ? 'one day' : words(r) + ' days'}` : '';
  return `Today is ${days}, which ${w === 1 && !r ? 'is' : 'are'} ${wk}${rest}, of the Omer.`;
}

// ---------------------------------------------------------------------------
// Daily-study streak
// ---------------------------------------------------------------------------

/**
 * done: { 'YYYY-MM-DD': ['chumash', ...] }, today: 'YYYY-MM-DD', required: ids.
 * Returns { streak, todayDone, best }: consecutive complete days ending today, or
 * ending yesterday while today is still open.
 */
export function streakOf(done, today, required) {
  const full = (ymd) => {
    const v = done && done[ymd];
    return Array.isArray(v) && required.length > 0 && required.every((k) => v.includes(k));
  };
  const t = ymdToAbs(today);
  if (t == null) return { streak: 0, todayDone: false, best: 0 };
  const todayDone = full(today);
  let streak = 0;
  for (let a = todayDone ? t : t - 1; full(absToYMD(a)); a--) streak++;
  let best = 0;
  const days = Object.keys(done || {}).filter((k) => parseYMD(k) && full(k)).map(ymdToAbs).sort((a, b) => a - b);
  let run = 0, prev = null;
  for (const a of days) { run = prev !== null && a === prev + 1 ? run + 1 : 1; prev = a; if (run > best) best = run; }
  return { streak, todayDone, best: Math.max(best, streak) };
}

/** Drop study records older than `keepDays` before `today`. */
export function pruneDone(done, today, keepDays = 400) {
  const t = ymdToAbs(today), out = {};
  for (const [k, v] of Object.entries(done || {})) {
    const a = ymdToAbs(k);
    if (a != null && a > t - keepDays && a <= t + 1 && Array.isArray(v)) out[k] = v.filter((x) => typeof x === 'string').slice(0, 12);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Grids
// ---------------------------------------------------------------------------

/** Absolute-day range of a Hebrew month or a Gregorian month. */
export function monthRange(mode, y, m) {
  if (mode === 'heb') {
    const start = hebrewToAbs(y, m, 1);
    return { start, end: start + daysInMonth(m, y) - 1 };
  }
  const start = gregToAbs(y, m, 1);
  const next = m === 12 ? gregToAbs(y + 1, 1, 1) : gregToAbs(y, m + 1, 1);
  return { start, end: next - 1 };
}
/** Step a month cursor: Hebrew months walk Tishrei..Elul across year ends. */
export function stepMonth(mode, y, m, dir) {
  if (mode === 'greg') {
    const t = (y * 12 + (m - 1)) + dir;
    return { y: Math.floor(t / 12), m: (t % 12 + 12) % 12 + 1 };
  }
  // Hebrew: walk via day numbers so leap years / Adar are handled for free
  const { start, end } = monthRange('heb', y, m);
  const h = absToHebrew(dir > 0 ? end + 1 : start - 1);
  return { y: h.y, m: h.m };
}
