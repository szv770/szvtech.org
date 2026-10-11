// tz.js — time-zone math for /world. Pure functions, no DOM: imported by the page
// (world/app.js) and by the Node test (world/_world.test.mjs).
//
// Everything is driven by Intl with IANA zone names, so DST rules come from the
// browser's (or Node's) tz database. Instants are plain epoch milliseconds.

const MIN = 60000, HOUR = 3600000, DAY = 86400000;

/* ---------- zoned wall-clock parts ---------- */
const fmtCache = new Map();
function partsFmt(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short',
    });
    fmtCache.set(tz, f);
  }
  return f;
}
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Wall-clock parts of instant `ms` in `tz`: { y, m (1-12), d, hh, mm, ss, wd (0=Sun) }. */
export function zonedParts(ms, tz) {
  const o = {};
  for (const p of partsFmt(tz).formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, hh: +o.hour % 24, mm: +o.minute, ss: +o.second, wd: WD[o.weekday] ?? 0 };
}

/** UTC offset of `tz` at instant `ms`, in minutes (New York in summer: -240). */
export function offsetMin(ms, tz) {
  const p = zonedParts(ms, tz);
  const wall = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return Math.round((wall - Math.floor(ms / 1000) * 1000) / MIN);
}

/** True when `tz` is a zone this runtime knows. */
export function validTz(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try { partsFmt(tz); return true; } catch (e) { return false; }
}

/**
 * Instant of local wall time y-m-d hh:mm in `tz`.
 * Wall times skipped by a spring-forward gap resolve forward (02:30 -> 03:30);
 * repeated times in a fall-back overlap resolve to the first (earlier) one.
 */
export function zonedToUtc(y, m, d, hh = 0, mm = 0, tz) {
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  // Try both offsets around the guess; keep candidates that read back as the requested wall time.
  const o1 = offsetMin(wall - offsetMin(wall, tz) * MIN, tz);
  const cands = new Set([o1, offsetMin(wall - 1 * DAY, tz), offsetMin(wall + 1 * DAY, tz), offsetMin(wall, tz)]);
  const ok = [];
  for (const o of cands) {
    const t = wall - o * MIN;
    if (offsetMin(t, tz) === o) ok.push(t);
  }
  if (ok.length) return Math.min(...ok);
  // In a gap: use the offset in force before the gap, which lands after it.
  const before = offsetMin(wall - o1 * MIN - 6 * HOUR, tz);
  return wall - before * MIN;
}

/** Local calendar date of an instant: { y, m, d }. */
export function ymdOf(ms, tz) { const p = zonedParts(ms, tz); return { y: p.y, m: p.m, d: p.d }; }
export const ymdKey = (o) => `${o.y}-${String(o.m).padStart(2, '0')}-${String(o.d).padStart(2, '0')}`;
export function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const o = { y: +m[1], m: +m[2], d: +m[3] };
  const t = new Date(Date.UTC(o.y, o.m - 1, o.d));
  return t.getUTCMonth() === o.m - 1 && t.getUTCDate() === o.d ? o : null;
}
/** Calendar arithmetic on a { y, m, d } (no zone involved). */
export function addDays(o, n) {
  const t = new Date(Date.UTC(o.y, o.m - 1, o.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}
/** Whole days from calendar date a to b. */
export const dayDiff = (a, b) => Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY);

/** [start, end) instants of local date `ymd` in `tz`. 23 or 25 hours long on DST days. */
export function dayRange(ymd, tz) {
  const n = addDays(ymd, 1);
  return [zonedToUtc(ymd.y, ymd.m, ymd.d, 0, 0, tz), zonedToUtc(n.y, n.m, n.d, 0, 0, tz)];
}

/* ---------- formatting ---------- */
const p2 = (n) => String(n).padStart(2, '0');

/** "+7h", "−3h", "+5h30", "−9h30", "same" for an offset difference in minutes. */
export function fmtDiff(min) {
  if (!min) return 'same';
  const s = min > 0 ? '+' : '−', a = Math.abs(min), h = Math.floor(a / 60), m = a % 60;
  return `${s}${h}h${m ? p2(m) : ''}`;
}

/** "14:05" or "2:05 PM". */
export function fmtHM(hh, mm, h12) {
  if (!h12) return `${p2(hh)}:${p2(mm)}`;
  return `${hh % 12 || 12}:${p2(mm)} ${hh < 12 ? 'AM' : 'PM'}`;
}
/** "Tue Oct 13" */
export const fmtDay = (p) => `${WEEKDAYS[p.wd]} ${MONTHS[p.m - 1]} ${p.d}`;

/** "UTC+5:30" style label for a zone at an instant. */
export function fmtUtc(ms, tz) {
  const o = offsetMin(ms, tz);
  if (!o) return 'UTC';
  const a = Math.abs(o);
  return `UTC${o > 0 ? '+' : '−'}${Math.floor(a / 60)}${a % 60 ? ':' + p2(a % 60) : ''}`;
}

/** Display name for a bare IANA zone: "America/Argentina/Buenos_Aires" -> "Buenos Aires". */
export const tzName = (tz) => String(tz || '').split('/').pop().replace(/_/g, ' ');

/* ---------- working hours + overlap ---------- */
export const WORK = Object.freeze({ dayStart: 7 * 60, workStart: 9 * 60, workEnd: 17 * 60, dayEnd: 22 * 60 });

/** 2 = working hours (9–17), 1 = reasonable (7–9, 17–22), 0 = night. Takes local minutes of day. */
export function hourClass(localMin, w = WORK) {
  if (localMin >= w.workStart && localMin < w.workEnd) return 2;
  if (localMin >= w.dayStart && localMin < w.dayEnd) return 1;
  return 0;
}
const localMinOf = (ms, tz) => { const p = zonedParts(ms, tz); return p.hh * 60 + p.mm; };

/**
 * Times in [start, end) that suit every zone. Each `step`-minute slot gets the worst
 * class across `tzs`; the best achievable class wins. Returns
 *   { level: 2|1|0, ranges: [{ start, end }] }  (ranges empty when level is 0).
 * A slot is judged by its own start, so a meeting starting at a range start and
 * ending at its end stays inside everyone's window.
 */
export function findOverlap(start, end, tzs, step = 15, w = WORK) {
  const slots = [];
  for (let t = start; t < end; t += step * MIN) {
    let worst = 2;
    for (const tz of tzs) { worst = Math.min(worst, hourClass(localMinOf(t, tz), w)); if (!worst) break; }
    slots.push([t, worst]);
  }
  const level = slots.reduce((a, s) => Math.max(a, s[1]), 0);
  const ranges = [];
  if (level) {
    for (const [t, c] of slots) {
      const last = ranges[ranges.length - 1];
      if (c !== level) continue;
      if (last && last.end === t) last.end = t + step * MIN;
      else ranges.push({ start: t, end: Math.min(end, t + step * MIN) });
    }
  }
  return { level, ranges };
}

/* ---------- share URL ---------- */
const ID_RE = /^(here|tz:[A-Za-z0-9_+\-/]{1,64}|[a-z0-9-]{1,40})$/;

/** Parse "?c=new-york,jerusalem&t=2026-10-13T14:00Z&d=2026-10-13". */
export function parseShare(search) {
  let q;
  try { q = new URLSearchParams(search || ''); } catch (e) { return { cities: null, t: null, date: null }; }
  let cities = null;
  if (q.has('c')) {
    cities = [];
    for (const raw of q.get('c').split(',')) {
      const id = raw.trim();
      if (id && ID_RE.test(id) && !cities.includes(id)) cities.push(id);
    }
    if (!cities.length) cities = null;
  }
  return { cities, t: parseInstant(q.get('t')), date: parseYmd(q.get('d')) };
}

/** Accepts 2026-10-13T14:00Z, 2026-10-13T14:00:30Z, 2026-10-13T14:00+03:00. Null otherwise. */
export function parseInstant(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  let t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  if (m[7] !== 'Z') {
    const z = m[7].replace(':', ''), sg = z[0] === '-' ? -1 : 1;
    t -= sg * (+z.slice(1, 3) * 60 + +z.slice(3, 5)) * MIN;
  }
  return Number.isFinite(t) && +m[2] >= 1 && +m[2] <= 12 && +m[4] < 24 && +m[5] < 60 ? t : null;
}

/** "2026-10-13T14:00Z" (minute precision, UTC). */
export function fmtInstant(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}Z`;
}

/** "/world/?c=a,b&t=…" */
export function buildShare(ids, t, base = '/world/') {
  const parts = [];
  if (ids && ids.length) parts.push('c=' + ids.map((i) => encodeURIComponent(i).replace(/%2F/g, '/').replace(/%3A/g, ':')).join(','));
  if (t != null) parts.push('t=' + fmtInstant(t));
  return base + (parts.length ? '?' + parts.join('&') : '');
}

/* ---------- "3pm London" converter ---------- */
const ALIASES = {
  ny: 'new-york', nyc: 'new-york', la: 'los-angeles', sf: 'san-francisco', dc: 'washington',
  jlm: 'jerusalem', jeru: 'jerusalem', yerushalayim: 'jerusalem', tlv: 'tel-aviv', ldn: 'london', uk: 'london',
  chi: 'chicago', bk: 'crown-heights', israel: 'jerusalem', local: 'here', me: 'here', mine: 'here',
};
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Pull a clock time out of free text. Returns { h, m, rest } or null.
 *   "3pm London", "London 3:30 pm", "15:00 jlm", "noon tokyo", "1530 ny", "9.30a paris", "midnight"
 */
export function parseTimeQuery(str) {
  let s = ' ' + String(str || '').toLowerCase() + ' ';
  let h = null, m = 0, hit = null;
  const word = /\s(noon|midday|midnight)\s/.exec(s);
  if (word) { h = word[1] === 'midnight' ? 0 : 12; hit = word[0]; }
  else {
    const re = /(^|[\s@,])(\d{1,2})(?:[:.h](\d{2})|(\d{2}))?\s*(a\.?m?\.?|p\.?m?\.?)?(?=[\s,]|$)/;
    const r = re.exec(s);
    if (!r) return null;
    h = +r[2]; m = +(r[3] || r[4] || 0);
    const ap = r[5] ? r[5][0] : '';
    if (m > 59) return null;
    if (ap) {
      if (h < 1 || h > 12) return null;
      h = (h % 12) + (ap === 'p' ? 12 : 0);
    } else if (h > 24 || (h === 24 && m)) return null;
    if (h === 24) h = 0;
    hit = r[0].slice(r[1].length);
  }
  const rest = norm(s.replace(hit, ' ').replace(/\b(at|in|on)\b/g, ' '));
  return { h, m, rest };
}

/** Best match for a query among { id, name, country?, alt?, tz? } entries, or null. */
export function matchCity(q, list) {
  const n = norm(q);
  if (!n) return null;
  if (ALIASES[n]) { const a = list.find((c) => c.id === ALIASES[n]); if (a) return a; }
  let best = null, score = 0;
  for (const c of list) {
    const name = norm(c.name), id = (c.id || '').replace(/-/g, ' ');
    const hay = `${name} ${norm(c.country)} ${norm(c.alt)} ${norm(tzName(c.tz))}`;
    let s = 0;
    if (name === n || id === n) s = 100;
    else if (name.startsWith(n)) s = 80;
    else if ((' ' + hay + ' ').includes(' ' + n + ' ')) s = 60;
    else if (hay.split(' ').some((w) => w.startsWith(n))) s = 40;
    else if (n.length >= 3 && hay.includes(n)) s = 20;
    if (c.pick) s += 5; // prefer entries the caller marks as already selected
    if (s > score) { score = s; best = c; }
  }
  return score ? best : null;
}

/* ---------- copy summary ---------- */
/**
 * "Tue Oct 13 · 10:00 New York / 17:00 Jerusalem (Wed) / 15:00 London"
 * The date is the first entry's; others get their weekday when it differs.
 */
export function summary(ms, entries, h12 = false) {
  if (!entries.length) return '';
  const first = zonedParts(ms, entries[0].tz);
  const bits = entries.map((e) => {
    const p = zonedParts(ms, e.tz);
    const dd = p.d !== first.d || p.m !== first.m ? ` (${WEEKDAYS[p.wd]})` : '';
    return `${fmtHM(p.hh, p.mm, h12)} ${e.name}${dd}`;
  });
  return `${fmtDay(first)} · ${bits.join(' / ')}`;
}
