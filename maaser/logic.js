/* Maaser ledger logic. Pure functions, amounts are integer cents. Unit-tested. */
export const CATS = [
  { id: 'tzedakah', label: 'Tzedakah' }, { id: 'shul', label: 'Shul' }, { id: 'yeshiva', label: 'Yeshiva' },
  { id: 'family', label: 'Family' }, { id: 'other', label: 'Other' },
];
export const CURRENCIES = ['USD', 'CAD', 'GBP', 'EUR', 'ILS', 'AUD'];
export const PRESETS = [{ pct: 10, name: 'Maaser' }, { pct: 20, name: 'Chomesh' }];
export const DEFAULTS = () => ({ v: 1, settings: { pct: 10, cur: 'USD', basis: 'gross', hebrew: false }, entries: [] });

const pad = (n) => String(n).padStart(2, '0');
export const todayYMD = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const validYMD = (s) => {
  const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); if (!r) return false;
  const d = new Date(+r[1], +r[2] - 1, +r[3]); return d.getFullYear() === +r[1] && d.getMonth() === +r[2] - 1 && d.getDate() === +r[3];
};
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** "12.5" -> 1250 ; "" / junk -> NaN. At most 2 decimals. */
export function parseCents(s) {
  const t = String(s == null ? '' : s).trim().replace(/[, $€£₪]/g, '');
  if (!/^\d*\.?\d{0,2}$/.test(t) || t === '' || t === '.') return NaN;
  const [w, f = ''] = t.split('.');
  return (parseInt(w || '0', 10) * 100) + parseInt((f + '00').slice(0, 2), 10);
}
export const centsToInput = (c) => (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2));
export const pctOf = (cents, pct) => Math.round((cents * pct) / 100);

/** The figure that counts for an income entry under the chosen basis. */
export const counted = (e, basis) => (basis === 'net' && Number.isInteger(e.net) ? e.net : e.amt);

export function totals(state) {
  const { pct, basis } = state.settings;
  let inc = 0, given = 0;
  for (const e of state.entries) { if (e.t === 'i') inc += counted(e, basis); else given += e.amt; }
  const owed = pctOf(inc, pct);
  return { income: inc, owed, given, left: owed - given, progress: owed > 0 ? Math.min(1, given / owed) : (given > 0 ? 1 : 0) };
}

export const monthKey = (ymd) => ymd.slice(0, 7);
export const byNewest = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ts || 0) - (a.ts || 0));

export function filterEntries(entries, { type = 'all', cat = 'all', q = '' } = {}) {
  const s = q.trim().toLowerCase();
  return entries.filter((e) => {
    if (type === 'i' && e.t !== 'i') return false;
    if (type === 'g' && e.t !== 'g') return false;
    if (cat !== 'all' && (e.t !== 'g' || (e.cat || 'other') !== cat)) return false;
    if (s) {
      const hay = `${e.note || ''} ${(e.amt / 100).toFixed(2)} ${e.date} ${e.cat || ''}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  }).sort(byNewest);
}

/** Group (already sorted) entries by calendar month, newest first. */
export function groupByMonth(entries, basis = 'gross') {
  const out = [];
  for (const e of entries) {
    const k = monthKey(e.date);
    let g = out[out.length - 1];
    if (!g || g.key !== k) { g = { key: k, items: [], income: 0, given: 0 }; out.push(g); }
    g.items.push(e);
    if (e.t === 'i') g.income += counted(e, basis); else g.given += e.amt;
  }
  return out;
}

/** Years with entries (civil), newest first; always includes `current`. */
export function civilYears(entries, current) {
  const s = new Set([current]); entries.forEach((e) => s.add(+e.date.slice(0, 4)));
  return [...s].sort((a, b) => b - a);
}

/** Totals for a period + per-bucket (month) series.
    bucketOf(ymd) -> { period, idx } ; the period key is what the year selector chooses. */
export function periodSeries(state, period, bucketOf, nBuckets) {
  const { pct, basis } = state.settings;
  const series = Array.from({ length: nBuckets }, () => ({ income: 0, given: 0 }));
  let income = 0, given = 0;
  for (const e of state.entries) {
    const b = bucketOf(e.date); if (!b || b.period !== period || b.idx < 0 || b.idx >= nBuckets) continue;
    if (e.t === 'i') { const c = counted(e, basis); series[b.idx].income += c; income += c; } else { series[b.idx].given += e.amt; given += e.amt; }
  }
  const owed = pctOf(income, pct);
  return { income, owed, given, left: owed - given, series: series.map((s) => ({ ...s, owed: pctOf(s.income, pct) })) };
}
export const civilBucket = (ymd) => ({ period: +ymd.slice(0, 4), idx: +ymd.slice(5, 7) - 1 });

/* ---------- CSV ---------- */
const csvCell = (v) => {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export function toCSV(state, entries = state.entries) {
  const rows = [['Type', 'Date', 'Amount', 'Take-home', 'Category', 'Note', 'Currency']];
  for (const e of [...entries].sort((a, b) => -byNewest(a, b))) {
    rows.push([e.t === 'i' ? 'Income' : 'Given', e.date, (e.amt / 100).toFixed(2), Number.isInteger(e.net) ? (e.net / 100).toFixed(2) : '', e.t === 'g' ? (e.cat || 'other') : '', e.note || '', state.settings.cur]);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/* ---------- backup / import ---------- */
/** Returns a clean state or null. Never trusts the file. */
export function sanitize(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.entries)) return null;
  const d = DEFAULTS(), s = raw.settings || {};
  const pct = Number(s.pct);
  d.settings.pct = pct > 0 && pct <= 100 ? Math.round(pct * 100) / 100 : 10;
  d.settings.cur = CURRENCIES.includes(s.cur) ? s.cur : 'USD';
  d.settings.basis = s.basis === 'net' ? 'net' : 'gross';
  d.settings.hebrew = !!s.hebrew;
  const seen = new Set();
  for (const e of raw.entries.slice(0, 20000)) {
    if (!e || (e.t !== 'i' && e.t !== 'g') || !Number.isInteger(e.amt) || e.amt <= 0 || e.amt > 1e11 || !validYMD(e.date)) continue;
    const id = typeof e.id === 'string' && e.id && !seen.has(e.id) ? e.id.slice(0, 40) : uid(); seen.add(id);
    const o = { id, t: e.t, amt: e.amt, date: e.date, note: String(e.note || '').slice(0, 200), ts: Number.isFinite(e.ts) ? e.ts : 0 };
    if (e.t === 'i' && Number.isInteger(e.net) && e.net >= 0 && e.net <= 1e11) o.net = e.net;
    if (e.t === 'g') o.cat = CATS.some((c) => c.id === e.cat) ? e.cat : 'other';
    d.entries.push(o);
  }
  return d;
}
