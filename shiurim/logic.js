/* Shiurim: conversions + friendly number formatting. Pure functions (unit-tested). */
export const ML_PER_FLOZ = 29.5735295625;   // US fluid ounce
export const ML_PER_CUP = 236.5882365;      // US cup
export const CM_PER_IN = 2.54;

export const VOL_UNITS = [
  { id: 'ml', label: 'ml', per: 1 },
  { id: 'floz', label: 'fl oz', per: ML_PER_FLOZ },
  { id: 'cup', label: 'cups', per: ML_PER_CUP },
  { id: 'l', label: 'litres', per: 1000 },
];
export const LEN_UNITS = [
  { id: 'cm', label: 'cm', per: 1 },
  { id: 'in', label: 'inches', per: CM_PER_IN },
  { id: 'm', label: 'metres', per: 100 },
  { id: 'ft', label: 'feet', per: 30.48 },
  { id: 'km', label: 'km', per: 100000 },
  { id: 'mi', label: 'miles', per: 160934.4 },
];
export const unitsFor = (kind) => (kind === 'vol' ? VOL_UNITS : LEN_UNITS);
export const unitById = (kind, id) => unitsFor(kind).find((u) => u.id === id);

export const fromBase = (kind, unitId, base) => base / unitById(kind, unitId).per;
export const toBase = (kind, unitId, val) => val * unitById(kind, unitId).per;

/** Plain number: 1,234 / 12.3 / 1.23 / 0.123 */
export function fmt(n) {
  if (!isFinite(n)) return '—';
  const a = Math.abs(n);
  let s;
  if (a >= 100) s = Math.round(n).toLocaleString('en-US');
  else if (a >= 10) s = String(Math.round(n * 10) / 10);
  else if (a >= 1) s = String(Math.round(n * 100) / 100);
  else s = String(Math.round(n * 1000) / 1000);
  return s;
}

const FR = [[1, 2, '½'], [1, 3, '⅓'], [2, 3, '⅔'], [1, 4, '¼'], [3, 4, '¾'], [1, 6, '⅙'], [5, 6, '⅚'], [1, 8, '⅛'], [3, 8, '⅜'], [5, 8, '⅝'], [7, 8, '⅞']];
/** Nice mixed fraction: 1.3333 -> { text:'1⅓', exact:false }. Falls back to a decimal. */
export function fraction(x, tol = 0.02) {
  if (!isFinite(x) || x < 0) return { text: '—', exact: false };
  let whole = Math.floor(x + 1e-9), rem = x - whole;
  if (rem < 1e-9) return { text: String(whole), exact: true };
  if (1 - rem < 1e-9) return { text: String(whole + 1), exact: true };
  let best = null;
  for (const [n, d, g] of FR) { const e = Math.abs(rem - n / d); if (e <= tol && (!best || e < best.e)) best = { e, g }; }
  if (rem <= tol) return { text: whole ? String(whole) : '0', exact: false, approx: true };
  if (1 - rem <= tol) return { text: String(whole + 1), exact: false, approx: true };
  if (best) return { text: (whole ? whole : '') + best.g, exact: best.e < 1e-6, approx: best.e >= 1e-6 };
  return { text: fmt(x), exact: false, decimal: true };
}

/** "I have {val}{unit}" -> how many of a measure (value in base units). */
export const howMany = (haveBase, measureBase) => (measureBase > 0 ? haveBase / measureBase : NaN);

export function parseNum(s) {
  const t = String(s == null ? '' : s).trim().replace(/,/g, '.').replace(/[^0-9.]/g, '');
  if (!t) return NaN;
  const n = parseFloat(t);
  return isFinite(n) ? n : NaN;
}
