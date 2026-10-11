// tz.js — time-zone facts for /time, straight from the browser's Intl database.
// Names, UTC offsets, DST detection and the next clock change, all computed for
// a given instant (so they stay right across daylight-saving switches).

const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const cache = new Map();
function dtf(tz, key, opts) {
  const k = tz + '|' + key;
  let f = cache.get(k);
  if (!f) {
    try { f = new Intl.DateTimeFormat(opts.locale || 'en-US', { ...opts, locale: undefined, timeZone: tz }); }
    catch (e) { f = null; }
    cache.set(k, f);
  }
  return f;
}
const MINUS = '−';

export function validTz(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch (e) { return false; }
}
export const deviceTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } })();
/** Canonical id the engine uses (Asia/Calcutta and Asia/Kolkata collapse together). */
export function canonTz(tz) {
  try { return new Intl.DateTimeFormat('en', { timeZone: tz }).resolvedOptions().timeZone; } catch (e) { return tz; }
}

/** UTC offset of `tz` at instant `ms`, in minutes (e.g. -240 for EDT). */
export function offsetMin(tz, ms) {
  const f = dtf(tz, 'parts', { hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  if (!f) return 0;
  const p = {};
  for (const { type, value } of f.formatToParts(new Date(ms))) p[type] = value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUTC - Math.floor(ms / 1000) * 1000) / MIN);
}
/** "UTC−04:00" (long) or "UTC−4" / "UTC+5:30" (short). Uses a real minus sign. */
export function fmtOffset(min, short) {
  const sign = min < 0 ? MINUS : '+';
  const a = Math.abs(min), h = Math.floor(a / 60), m = a % 60;
  if (short) return 'UTC' + (min === 0 ? '' : sign + h + (m ? ':' + String(m).padStart(2, '0') : ''));
  return `UTC${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
/** "4 hours", "5 hours 30 minutes" — for sentences. */
export function spanWords(min) {
  const a = Math.abs(min), h = Math.floor(a / 60), m = a % 60;
  const hs = h ? `${h} hour${h === 1 ? '' : 's'}` : '';
  const ms = m ? `${m} minutes` : '';
  return [hs, ms].filter(Boolean).join(' ') || '0 hours';
}

function nameOf(tz, ms, style) {
  const f = dtf(tz, 'n-' + style, { timeZoneName: style });
  if (!f) return '';
  try {
    const p = f.formatToParts(new Date(ms)).find((x) => x.type === 'timeZoneName');
    return p ? p.value : '';
  } catch (e) { return ''; }
}
const isGmtish = (s) => !s || /^(GMT|UTC)([+\-−]|$)/.test(s);
/** Last part of an IANA id, readable: America/Argentina/Buenos_Aires -> Buenos Aires. */
// engines still report some legacy ids; show today's names
const MODERN = { Calcutta: 'Kolkata', Katmandu: 'Kathmandu', Saigon: 'Ho Chi Minh', Rangoon: 'Yangon', Kiev: 'Kyiv',
  Godthab: 'Nuuk', Ulan_Bator: 'Ulaanbaatar', Dacca: 'Dhaka', Thimbu: 'Thimphu', Ashkhabad: 'Ashgabat', Chongqing: 'Chongqing',
  Uzhgorod: 'Uzhhorod', Zaporozhye: 'Zaporizhzhia', Enderbury: 'Kanton', Truk: 'Chuuk', Ponape: 'Pohnpei', Tel_Aviv: 'Tel Aviv' };
export function prettyTz(tz) {
  if (/^(Etc\/)?(UTC|GMT|Universal|Zulu)$/i.test(tz)) return 'UTC';
  const last = tz.split('/').pop() || tz;
  return (MODERN[last] || last).replace(/_/g, ' ');
}
export function regionOf(tz) {
  const r = tz.split('/')[0];
  return ['America', 'Europe', 'Asia', 'Africa', 'Australia', 'Pacific', 'Atlantic', 'Indian', 'Antarctica'].includes(r) ? r : 'Other';
}
/** "Eastern Time", "Israel Time", "India Standard Time"… falls back to "Kathmandu time". */
export function genericName(tz, ms = Date.now()) {
  if (/^(Etc\/)?(UTC|GMT|Universal|Zulu)$/i.test(tz)) return 'Coordinated Universal Time';
  let n = '';
  try { n = nameOf(tz, ms, 'longGeneric'); } catch (e) { n = ''; }
  if (isGmtish(n)) {
    const l = nameOf(tz, ms, 'long');
    n = isGmtish(l) ? '' : l.replace(/ (Standard|Daylight|Summer) Time$/, ' Time');
  }
  return n || prettyTz(tz) + ' time';
}
/** The compact form for tight labels: "Eastern", "Israel", "Central European". */
export function shortGeneric(tz, ms) {
  const g = genericName(tz, ms);
  if (g === 'Coordinated Universal Time') return 'UTC';
  return g.replace(/ (Standard |Mean |Daylight )?Time$/i, '').replace(/ time$/, '') || g;
}
/** Long specific name for an instant: "Eastern Daylight Time". */
export const longName = (tz, ms) => { const n = nameOf(tz, ms, 'long'); return isGmtish(n) ? '' : n; };
/** "EDT" when the zone has a real letter abbreviation in English, else ''. */
export function abbr(tz, ms) {
  const s = nameOf(tz, ms, 'short');
  return /^[A-Z]{2,5}$/.test(s) && s !== 'GMT' && s !== 'UTC' ? s : (s === 'GMT' && offsetMin(tz, ms) === 0 ? 'GMT' : '');
}

/** Standard offset for the year around `ms` (the smaller of Jan/Jul), and whether it uses DST. */
export function yearInfo(tz, ms) {
  const y = new Date(ms).getUTCFullYear();
  const jan = offsetMin(tz, Date.UTC(y, 0, 1)), jul = offsetMin(tz, Date.UTC(y, 6, 1));
  return { std: Math.min(jan, jul), dst: Math.max(jan, jul), observes: jan !== jul, southern: jan > jul };
}
export function isDST(tz, ms) {
  const yi = yearInfo(tz, ms);
  return yi.observes && offsetMin(tz, ms) === yi.dst;
}

/** First instant after `from` (within `days`) where the offset changes, to the minute. */
export function nextTransition(tz, from, days = 400, dir = 1) {
  const o0 = offsetMin(tz, from);
  let a = from, b = null;
  for (let i = 1; i <= days; i++) {
    const t = from + dir * i * DAY;
    if (offsetMin(tz, t) !== o0) { b = t; break; }
    a = t;
  }
  if (b == null) return null;
  // binary search between a (old offset) and b (new offset)
  let lo = Math.min(a, b), hi = Math.max(a, b);
  const loOff = offsetMin(tz, lo);
  while (hi - lo > MIN) {
    const mid = Math.floor((lo + hi) / 2 / MIN) * MIN;
    if (mid <= lo || mid >= hi) break;
    if (offsetMin(tz, mid) === loOff) lo = mid; else hi = mid;
  }
  const at = hi;
  return { at, from: offsetMin(tz, at - MIN), to: offsetMin(tz, at) };
}

/** Day-by-day DST map for the calendar year of `ms` (for the little year bar). */
export function yearMap(tz, ms) {
  const y = new Date(ms).getUTCFullYear();
  const yi = yearInfo(tz, ms);
  const out = [];
  const n = (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / DAY;
  for (let i = 0; i < n; i++) out.push(offsetMin(tz, Date.UTC(y, 0, 1, 12) + i * DAY) === yi.dst && yi.observes);
  return { year: y, days: out };
}

/** Every zone the engine knows (falls back to a short list on old browsers). */
const FALLBACK = ['Pacific/Pago_Pago', 'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Phoenix',
  'America/Denver', 'America/Chicago', 'America/New_York', 'America/Halifax', 'America/St_Johns', 'America/Sao_Paulo',
  'Atlantic/Azores', 'Europe/London', 'Europe/Paris', 'Asia/Jerusalem', 'Europe/Moscow', 'Asia/Dubai', 'Asia/Tehran',
  'Asia/Karachi', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Tokyo',
  'Australia/Adelaide', 'Australia/Sydney', 'Pacific/Noumea', 'Pacific/Auckland', 'Pacific/Chatham', 'Pacific/Tongatapu',
  'Pacific/Kiritimati', 'UTC'];
let allZones = null;
export function zones() {
  if (allZones) return allZones;
  let list = [];
  try { if (Intl.supportedValuesOf) list = Intl.supportedValuesOf('timeZone'); } catch (e) { list = []; }
  if (!list || list.length < 20) list = FALLBACK;
  allZones = list.filter(validTz);
  if (!allZones.includes('UTC')) allZones.push('UTC');
  return allZones;
}

export { MIN, HOUR, DAY, MINUS };
