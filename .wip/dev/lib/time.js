// Time-zone math (via Intl), timestamp parsing with unit auto-detect, formatting, relative time. Pure.

const fmtCache = new Map();
function dtf(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short', era: 'short',
    });
    fmtCache.set(tz, f);
  }
  return f;
}
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function isValidTz(tz) { try { dtf(tz); return true; } catch { return false; } }

/** Wall-clock parts of an instant in tz: { y, mo (1-12), d, h, mi, s, wd (0=Sun) } */
export function zonedParts(ms, tz) {
  if (tz === 'UTC') {
    const d = new Date(ms);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), wd: d.getUTCDay() };
  }
  const o = {};
  for (const p of dtf(tz).formatToParts(new Date(ms))) o[p.type] = p.value;
  let y = +o.year; if (o.era === 'BC' || o.era === 'B') y = 1 - y;
  return { y, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd: WD[o.weekday] };
}

/** offset (ms) of tz at instant: local wall time minus UTC */
export function tzOffset(ms, tz) {
  const p = zonedParts(ms, tz);
  const d = new Date(0); d.setUTCFullYear(p.y, p.mo - 1, p.d); d.setUTCHours(p.h, p.mi, p.s, 0);
  return d.getTime() - Math.floor(ms / 1000) * 1000;
}

/**
 * Convert a wall-clock time in tz to an instant.
 * Returns { ms, gap:boolean, ambiguous:boolean }. Times in a DST gap move forward by the gap length
 * (02:30 on spring-forward -> 03:30); ambiguous times (fall-back) take the earlier instant.
 */
export function zonedToInstant(y, mo, d, h = 0, mi = 0, s = 0, tz = 'UTC', msPart = 0) {
  const n = new Date(0); n.setUTCFullYear(y, mo - 1, d); n.setUTCHours(h, mi, s, msPart);
  const naive = n.getTime();
  if (tz === 'UTC') return { ms: naive, gap: false, ambiguous: false };
  const oA = tzOffset(naive - 864e5 / 2, tz), oB = tzOffset(naive + 864e5 / 2, tz);
  const cands = [];
  for (const o of new Set([oA, oB])) { const t = naive - o; if (tzOffset(t, tz) === o) cands.push(t); }
  cands.sort((a, b) => a - b);
  if (cands.length) return { ms: cands[0], gap: false, ambiguous: cands.length > 1 };
  return { ms: naive - oA, gap: true, ambiguous: false };
}

export const pad = (n, w = 2) => String(Math.abs(n)).padStart(w, '0');
export function offsetStr(offMs, colon = true) {
  if (offMs === 0) return 'Z';
  const m = Math.round(Math.abs(offMs) / 60000);
  return (offMs < 0 ? '-' : '+') + pad(Math.floor(m / 60)) + (colon ? ':' : '') + pad(m % 60);
}
const yearStr = (y) => y >= 0 && y <= 9999 ? pad(y, 4) : (y < 0 ? '-' : '+') + pad(y, 6);

/** ISO 8601 with tz offset, e.g. 2026-03-08T03:30:00-04:00 (ms shown only when non-zero) */
export function isoInTz(ms, tz) {
  const p = zonedParts(ms, tz);
  const frac = ((ms % 1000) + 1000) % 1000;
  return `${yearStr(p.y)}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}${frac ? '.' + pad(frac, 3) : ''}${offsetStr(tzOffset(ms, tz))}`;
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function tzAbbr(ms, tz) {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(ms));
    return (p.find((x) => x.type === 'timeZoneName') || {}).value || '';
  } catch { return ''; }
}

/** "Sun, Mar 8, 2026, 3:30:00 AM EDT" */
export function human(ms, tz, { seconds = true } = {}) {
  const p = zonedParts(ms, tz);
  const h12 = p.h % 12 || 12;
  return `${DAYS[p.wd].slice(0, 3)}, ${MONTHS[p.mo - 1].slice(0, 3)} ${p.d}, ${p.y}, ${h12}:${pad(p.mi)}${seconds ? ':' + pad(p.s) : ''} ${p.h < 12 ? 'AM' : 'PM'} ${tzAbbr(ms, tz)}`.trim();
}

export function rfc2822(ms) { return new Date(ms).toUTCString().replace('GMT', '+0000'); }

/** ISO week number (Mon-based) + day of year, computed from wall date in tz */
export function calendarInfo(ms, tz) {
  const p = zonedParts(ms, tz);
  const day = Date.UTC(p.y, p.mo - 1, p.d);
  const doy = Math.round((day - Date.UTC(p.y, 0, 1)) / 864e5) + 1;
  const wdMon = (p.wd + 6) % 7;
  const thu = day + (3 - wdMon) * 864e5;
  const ty = new Date(thu).getUTCFullYear();
  const week = Math.floor((thu - Date.UTC(ty, 0, 1)) / 864e5 / 7) + 1;
  return { dayOfYear: doy, isoWeek: week, isoWeekYear: ty, weekday: DAYS[p.wd] };
}

/** "in 3 days", "5 minutes ago", "just now" */
export function relative(ms, now = Date.now()) {
  const diff = ms - now;
  const a = Math.abs(diff);
  if (a < 45e3) return a < 5e3 ? 'just now' : diff > 0 ? `in ${Math.round(a / 1e3)} seconds` : `${Math.round(a / 1e3)} seconds ago`;
  const units = [['year', 365.2425 * 864e5], ['month', 30.436875 * 864e5], ['week', 7 * 864e5], ['day', 864e5], ['hour', 36e5], ['minute', 6e4]];
  const lim = { year: Infinity, month: 11.5, week: 4, day: 6.5, hour: 23.5, minute: 59.5 };
  let pick = units[units.length - 1];
  for (let i = units.length - 1; i >= 0; i--) {
    const [u, size] = units[i];
    const v = a / size;
    if (v < lim[u] || u === 'year') { pick = units[i]; break; }
  }
  const n = Math.max(1, Math.round(a / pick[1]));
  const label = `${n} ${pick[0]}${n === 1 ? '' : 's'}`;
  return diff > 0 ? `in ${label}` : `${label} ago`;
}

/** "3d 4h 12m 5s" */
export function duration(ms) {
  let a = Math.abs(Math.round(ms / 1000));
  const d = Math.floor(a / 86400); a -= d * 86400;
  const h = Math.floor(a / 3600); a -= h * 3600;
  const m = Math.floor(a / 60); const s = a - m * 60;
  return [d && d + 'd', (d || h) && h + 'h', (d || h || m) && m + 'm', s + 's'].filter(Boolean).join(' ');
}

const REL_UNITS = { s: 1e3, sec: 1e3, second: 1e3, m: 6e4, min: 6e4, minute: 6e4, h: 36e5, hr: 36e5, hour: 36e5, d: 864e5, day: 864e5, w: 6048e5, wk: 6048e5, week: 6048e5 };

/**
 * Parse anything time-like.
 * -> { ms, unit, label } or throws. unit: 's' | 'ms' | 'µs' | 'ns' | 'iso' | 'date' | 'relative' | 'now'
 * Numbers: <=11 integer digits -> seconds, 12-14 -> ms, 15-17 -> µs, 18-20 -> ns. Force with unit option.
 * Strings without an explicit offset are read as wall time in `tz`.
 */
export function parseTime(input, { tz = 'UTC', now = Date.now(), unit: force = 'auto' } = {}) {
  const s = String(input).trim();
  if (!s) throw new Error('Empty');
  if (/^now$/i.test(s)) return { ms: now, unit: 'now', label: 'now' };
  const num = s.replace(/[_,\s]/g, '');
  if (/^-?\d+(\.\d+)?$/.test(num)) {
    const intDigits = num.replace(/^-/, '').split('.')[0].replace(/^0+(?=\d)/, '').length;
    let unit = force;
    if (unit === 'auto') unit = intDigits <= 11 ? 's' : intDigits <= 14 ? 'ms' : intDigits <= 17 ? 'µs' : intDigits <= 20 ? 'ns' : null;
    if (!unit) throw new Error('Number is too long to be a timestamp');
    const div = { s: 1e-3, ms: 1, 'µs': 1e3, ns: 1e6 }[unit];
    let ms;
    if (unit === 'ns' || unit === 'µs') {
      const [ip, fp = ''] = num.split('.');
      const big = BigInt(ip);
      const q = BigInt(div);
      ms = Number(big / q) + Number(big % q) / div + (fp ? Number('0.' + fp) / div : 0);
    } else ms = Number(num) / div;
    if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) throw new Error('Out of range');
    return { ms, unit, label: { s: 'seconds', ms: 'milliseconds', 'µs': 'microseconds', ns: 'nanoseconds' }[unit] };
  }
  let m = s.match(/^(?:in\s+)?([+-]?\d+(?:\.\d+)?)\s*(s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?|w|wks?|weeks?)(\s+ago)?$/i);
  if (m) {
    const u = m[2].toLowerCase();
    const size = u[0] === 'w' ? REL_UNITS.w : u[0] === 'd' ? REL_UNITS.d : u[0] === 'h' ? REL_UNITS.h : (u === 'm' || u.startsWith('mi')) ? REL_UNITS.m : REL_UNITS.s;
    let n = parseFloat(m[1]); if (m[3]) n = -n;
    return { ms: now + n * size, unit: 'relative', label: 'relative to now' };
  }
  if (/^(today|tomorrow|yesterday)$/i.test(s)) {
    const p = zonedParts(now, tz);
    const add = { today: 0, tomorrow: 1, yesterday: -1 }[s.toLowerCase()];
    const d = new Date(Date.UTC(p.y, p.mo - 1, p.d + add));
    return { ms: zonedToInstant(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 0, 0, 0, tz).ms, unit: 'date', label: `${s.toLowerCase()}, midnight` };
  }
  // ISO 8601: date, optional time, optional offset
  m = s.match(/^([+-]\d{6}|\d{4})-?(\d{2})-?(\d{2})(?:[T\s]+(\d{2}):?(\d{2})(?::?(\d{2})(?:[.,](\d{1,9}))?)?)?\s*(Z|z|UTC|GMT|[+-]\d{2}(?::?\d{2})?)?$/);
  if (m) {
    const [, Y, Mo, D, H = '0', Mi = '0', S = '0', F = '', Z] = m;
    const y = +Y, mo = +Mo, d = +D, h = +H, mi = +Mi, sec = +S, frac = F ? Math.round(Number('0.' + F) * 1000) : 0;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 24 || mi > 59 || sec > 60) throw new Error('Invalid date/time');
    const check = new Date(Date.UTC(2000, mo - 1, d)); if (check.getUTCDate() !== d && !(mo === 2 && d === 29)) throw new Error('Invalid day for that month');
    let ms;
    if (Z) {
      let off = 0;
      if (!/^(Z|UTC|GMT)$/i.test(Z)) { const zz = Z.replace(':', ''); off = (zz[0] === '-' ? -1 : 1) * (+zz.slice(1, 3) * 60 + +(zz.slice(3, 5) || 0)) * 6e4; }
      const n = new Date(0); n.setUTCFullYear(y, mo - 1, d); n.setUTCHours(h, mi, Math.min(sec, 59), frac);
      ms = n.getTime() - off;
    } else ms = zonedToInstant(y, mo, d, h, mi, Math.min(sec, 59), tz, frac).ms;
    return { ms, unit: 'iso', label: Z ? 'ISO 8601' : `ISO 8601 (read as ${tz})` };
  }
  const p = Date.parse(s);
  if (Number.isFinite(p)) return { ms: p, unit: 'date', label: 'date string' };
  throw new Error('Not a timestamp or date I understand');
}

/** Heuristic for smart paste: looks like a plausible epoch (1990–2100) in s/ms/µs/ns */
export function looksLikeTimestamp(s) {
  const t = String(s).trim();
  if (!/^\d{9,19}(\.\d+)?$/.test(t)) return false;
  try { const { ms } = parseTime(t); return ms > 631152000000 && ms < 4102444800000; } catch { return false; }
}

export const COMMON_TZ = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
  'America/Toronto', 'America/Mexico_City', 'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'Asia/Jerusalem', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland',
];
export function allTimeZones() {
  try { const l = Intl.supportedValuesOf('timeZone'); if (l && l.length) return ['UTC', ...l.filter((z) => z !== 'UTC')]; } catch { /* old browser */ }
  return COMMON_TZ;
}
export function localTz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } }
