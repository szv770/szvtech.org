// Cron: parse 5-field (min hour dom mon dow) or 6-field (sec min hour dom mon dow) expressions,
// explain them in plain English, and compute next run times in any IANA time zone (DST-aware). Pure.
import { zonedParts, zonedToInstant, tzOffset } from './time.js';

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DOW_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const MACROS = {
  '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *', '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *',
};

const SPECS = {
  second: { min: 0, max: 59, unit: 'second' },
  minute: { min: 0, max: 59, unit: 'minute' },
  hour: { min: 0, max: 23, unit: 'hour' },
  dom: { min: 1, max: 31, unit: 'day' },
  month: { min: 1, max: 12, unit: 'month', names: MONTH_NAMES, base: 1 },
  dow: { min: 0, max: 7, unit: 'weekday', names: DOW_NAMES, base: 0 },
};

class CronError extends Error { constructor(msg, field) { super(msg); this.field = field; } }

function parseField(text, kind) {
  const spec = SPECS[kind];
  const values = new Set();
  const tokens = [];
  let last = false;
  const num = (v) => {
    if (spec.names) {
      const i = spec.names.indexOf(v.toUpperCase());
      if (i >= 0) return i + spec.base;
    }
    if (!/^\d+$/.test(v)) throw new CronError(`"${v}" isn't a valid ${spec.unit}`, kind);
    const n = +v;
    if (n < spec.min || n > spec.max) throw new CronError(`${spec.unit[0].toUpperCase() + spec.unit.slice(1)} ${n} is out of range (${spec.min}–${kind === 'dow' ? 6 : spec.max})`, kind);
    return n;
  };
  for (const part of text.split(',')) {
    if (!part) throw new CronError(`Empty item in the ${spec.unit} field`, kind);
    if (kind === 'dom' && /^L$/i.test(part)) { last = true; tokens.push({ type: 'last' }); continue; }
    if (/[#W]|L/i.test(part) && !/^[A-Z]{3}/i.test(part)) throw new CronError(`"${part}" (Quartz-only syntax) isn't supported`, kind);
    const [rangePart, stepPart, extra] = part.split('/');
    if (extra !== undefined) throw new CronError(`Too many "/" in "${part}"`, kind);
    let step = 1;
    if (stepPart !== undefined) {
      if (!/^\d+$/.test(stepPart) || +stepPart < 1) throw new CronError(`Step "${stepPart}" must be a positive number`, kind);
      step = +stepPart;
    }
    let a, b, type;
    if (rangePart === '*' || rangePart === '?') {
      if (rangePart === '?' && kind !== 'dom' && kind !== 'dow') throw new CronError('"?" is only allowed for day fields', kind);
      a = spec.min; b = kind === 'dow' ? 6 : spec.max; type = stepPart !== undefined ? 'step' : 'any';
    } else if (rangePart.includes('-')) {
      const [x, y, z] = rangePart.split('-');
      if (z !== undefined || !x || !y) throw new CronError(`Bad range "${rangePart}"`, kind);
      a = num(x); b = num(y); type = stepPart !== undefined ? 'rangestep' : 'range';
      if (kind === 'dow' && b === 7) b = 7;
      if (a > b) throw new CronError(`Range ${x}-${y} goes backwards`, kind);
    } else {
      a = num(rangePart);
      b = stepPart !== undefined ? (kind === 'dow' ? 6 : spec.max) : a;
      type = stepPart !== undefined ? 'startstep' : 'val';
    }
    for (let v = a; v <= b; v += step) values.add(kind === 'dow' && v === 7 ? 0 : v);
    tokens.push({ type, a: kind === 'dow' && a === 7 ? 0 : a, b: kind === 'dow' && b === 7 && type === 'val' ? 0 : b, step });
  }
  const star = /^[*?]/.test(text);
  return { text, star, all: star && !text.includes('/') && !text.includes(','), values, tokens, last };
}

/**
 * parse(expr) -> { fields:{second,minute,hour,dom,month,dow}, hasSeconds, normalized }
 * Throws CronError with .field on problems.
 */
export function parseCron(expr) {
  let e = String(expr).trim().replace(/\s+/g, ' ');
  if (!e) throw new CronError('Type a cron expression, like "*/15 9-17 * * 1-5"');
  const low = e.toLowerCase();
  if (low === '@reboot') throw new CronError('@reboot runs once at startup — there is no schedule to show');
  if (low.startsWith('@')) {
    if (!MACROS[low]) throw new CronError(`Unknown macro ${e}`);
    e = MACROS[low];
  }
  const parts = e.split(' ');
  if (parts.length < 5) throw new CronError(`Need 5 fields (minute hour day month weekday) — got ${parts.length}`);
  if (parts.length > 6) throw new CronError(`Too many fields (${parts.length}). Use 5, or 6 with seconds first`);
  const hasSeconds = parts.length === 6;
  const [sec, min, hour, dom, mon, dow] = hasSeconds ? parts : ['0', ...parts];
  const fields = {
    second: parseField(sec, 'second'), minute: parseField(min, 'minute'), hour: parseField(hour, 'hour'),
    dom: parseField(dom, 'dom'), month: parseField(mon, 'month'), dow: parseField(dow, 'dow'),
  };
  return { fields, hasSeconds, normalized: e };
}

const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function dayMatches(f, y, mo, d) {
  const wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  const domOk = f.dom.values.has(d) || (f.dom.last && d === daysInMonth(y, mo));
  const dowOk = f.dow.values.has(wd);
  if (f.dom.star && f.dow.star) return true;
  if (f.dom.star) return dowOk;
  if (f.dow.star) return domOk;
  return domOk || dowOk; // classic cron: either day field may match
}

/** first instant at/after which the offset becomes the "after" offset (minute precision) */
function transitionAfter(lo, hi, tz) {
  const o = tzOffset(lo, tz);
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2000) * 1000;
    if (mid <= lo) break;
    if (tzOffset(mid, tz) === o) lo = mid; else hi = mid;
  }
  return hi;
}

/**
 * nextRuns(expr | parsed, { from, count, tz }) -> [{ ms, note? }]
 * DST rules (cronie-style): in the skipped hour, fixed-time jobs run right after the jump and
 * wildcard-hour jobs simply have no runs; in the repeated hour, fixed-time jobs run once and
 * wildcard-hour jobs run in both copies.
 */
export function nextRuns(expr, { from = Date.now(), count = 5, tz = 'UTC', maxYears = 8 } = {}) {
  const { fields: f, hasSeconds } = typeof expr === 'string' ? parseCron(expr) : expr;
  const found = new Map(); // ms -> note
  let lastPrimary = -Infinity;
  const p = zonedParts(from, tz);
  // naive wall clock cursor (as a UTC-based Date for calendar arithmetic)
  let cur = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, hasSeconds ? p.s : 0) + (hasSeconds ? 1000 : 60000);
  const stopY = p.y + maxYears;
  let guard = 0;
  const done = () => {
    if (found.size < count) return false;
    const sorted = [...found.keys()].sort((a, b) => a - b);
    return sorted[count - 1] <= lastPrimary;
  };
  while (guard++ < 500000 && !done()) {
    const d = new Date(cur);
    const y = d.getUTCFullYear(), mo = d.getUTCMonth() + 1, day = d.getUTCDate(), h = d.getUTCHours(), mi = d.getUTCMinutes(), s = d.getUTCSeconds();
    if (y > stopY) break;
    if (!f.month.values.has(mo)) { cur = Date.UTC(y, mo, 1); continue; }
    if (!dayMatches(f, y, mo, day)) { cur = Date.UTC(y, mo - 1, day + 1); continue; }
    if (!f.hour.values.has(h)) { cur = Date.UTC(y, mo - 1, day, h + 1); continue; }
    if (!f.minute.values.has(mi)) { cur = Date.UTC(y, mo - 1, day, h, mi + 1); continue; }
    if (!f.second.values.has(s)) { cur = Date.UTC(y, mo - 1, day, h, mi, s + 1); continue; }
    cur += hasSeconds ? 1000 : 60000;
    const r = zonedToInstant(y, mo, day, h, mi, s, tz);
    let cands;
    let note;
    if (r.gap) {
      if (f.hour.all) continue; // that wall time doesn't exist today
      cands = [transitionAfter(r.ms - 4 * 36e5, r.ms, tz)];
      note = 'DST: clock jumps forward, runs right after the change';
    } else if (r.ambiguous) {
      const second = r.ms + Math.abs(tzOffset(r.ms, tz) - tzOffset(r.ms + 4 * 36e5, tz));
      cands = f.hour.all ? [r.ms, second] : [r.ms];
      note = f.hour.all ? 'DST: hour repeats' : 'DST: this hour repeats, runs once';
    } else cands = [r.ms];
    lastPrimary = Math.max(lastPrimary, cands[0]);
    for (const c of cands) if (c > from && !found.has(c)) found.set(c, note);
  }
  return [...found.entries()].sort((a, b) => a[0] - b[0]).slice(0, count).map(([ms, note]) => note ? { ms, note } : { ms });
}

/* ---------------------------------------------------------------- English */
const ord = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const listJoin = (a) => a.length <= 1 ? a.join('') : a.length === 2 ? `${a[0]} and ${a[1]}` : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
const clock = (h, m, s) => {
  const ap = h < 12 ? 'AM' : 'PM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')}${s ? ':' + String(s).padStart(2, '0') : ''} ${ap}`;
};
const hourName = (h) => h === 0 ? 'midnight' : h === 12 ? 'noon' : clock(h, 0).replace(':00', '');

function tokenText(t, kind) {
  const name = (v) => kind === 'month' ? MONTH_FULL[v - 1] : kind === 'dow' ? DOW_FULL[v % 7] : kind === 'dom' ? ord(v) : kind === 'hour' ? hourName(v) : String(v);
  const unit = SPECS[kind].unit;
  switch (t.type) {
    case 'last': return 'last day';
    case 'val': return name(t.a);
    case 'range': return `${name(t.a)} through ${name(t.b)}`;
    case 'step': return `every ${t.step === 2 && kind === 'dom' ? 'other day' : t.step + ' ' + unit + 's'}`;
    case 'startstep': return `every ${t.step} ${unit}s starting at ${name(t.a)}`;
    case 'rangestep': return `every ${t.step} ${unit}s from ${name(t.a)} through ${name(t.b)}`;
    default: return '';
  }
}
const fieldText = (f, kind) => listJoin(f.tokens.map((t) => tokenText(t, kind)));
const single = (f) => f.tokens.length === 1 && f.tokens[0].type === 'val';
const valuesOf = (f) => [...f.values].sort((a, b) => a - b);

export function describeCron(expr) {
  const { fields: f, hasSeconds } = typeof expr === 'string' ? parseCron(expr) : expr;
  const parts = [];
  const sec0 = !hasSeconds || (single(f.second) && f.second.tokens[0].a === 0);
  // ---- time of day
  if (!sec0 && !(single(f.second))) {
    parts.push(f.second.all ? 'Every second' : `At ${fieldText(f.second, 'second').replace(/^every/, 'every')} second${f.second.tokens.length === 1 && f.second.tokens[0].type === 'val' ? '' : 's'}`.replace('At every', 'Every').replace(/ seconds seconds/, ' seconds'));
  }
  const secSuffix = (!sec0 && single(f.second)) ? f.second.tokens[0].a : 0;
  if (single(f.minute) && single(f.hour)) {
    parts.push(`At ${clock(f.hour.tokens[0].a, f.minute.tokens[0].a, secSuffix)}`);
  } else if (single(f.minute) && f.hour.tokens.every((t) => t.type === 'val') && f.hour.values.size <= 6) {
    parts.push(`At ${listJoin(valuesOf(f.hour).map((h) => clock(h, f.minute.tokens[0].a, secSuffix)))}`);
  } else {
    let m;
    if (f.minute.all) m = parts.length ? 'every minute' : 'Every minute';
    else if (single(f.minute)) m = f.minute.tokens[0].a === 0 && !secSuffix ? (f.hour.all ? 'Every hour, on the hour' : 'On the hour') : `At ${f.minute.tokens[0].a} minute${f.minute.tokens[0].a === 1 ? '' : 's'} past the hour`;
    else if (f.minute.tokens.length === 1 && f.minute.tokens[0].type === 'step') m = `Every ${f.minute.tokens[0].step} minutes`;
    else m = `At minute ${fieldText(f.minute, 'minute')}`;
    if (secSuffix) m += `, at second ${secSuffix}`;
    if (parts.length) m = m[0].toLowerCase() + m.slice(1);
    if (!(parts.length && f.minute.all && f.hour.all)) parts.push(m);
    if (!f.hour.all) {
      if (f.hour.tokens.length === 1 && f.hour.tokens[0].type === 'range') {
        const { a, b } = f.hour.tokens[0];
        parts.push(`between ${clock(a, 0)} and ${clock(b, f.minute.all || !single(f.minute) ? Math.max(...f.minute.values) : f.minute.tokens[0].a)}`);
      } else if (f.hour.tokens.length === 1 && f.hour.tokens[0].type === 'step') parts.push(`every ${f.hour.tokens[0].step} hours`);
      else if (f.hour.tokens.every((t) => t.type === 'val' || t.type === 'range')) parts.push(`during the ${fieldText(f.hour, 'hour')} hour${f.hour.values.size > 1 ? 's' : ''}`);
      else parts.push(fieldText(f.hour, 'hour'));
    }
  }
  // ---- days
  const domR = !f.dom.star, dowR = !f.dow.star;
  const dowText = () => {
    const v = valuesOf(f.dow);
    if (v.join() === '1,2,3,4,5') return 'on weekdays';
    if (v.join() === '0,6') return 'on weekends';
    const t = fieldText(f.dow, 'dow');
    return t.startsWith('every') ? t.replace('weekdays', 'days of the week') : 'on ' + t;
  };
  const domText = () => {
    const t = fieldText(f.dom, 'dom');
    return t.startsWith('every') ? t : `on the ${t} of the month`;
  };
  if (domR && dowR) parts.push(`${domText()}, or ${dowText()}`);
  else if (domR) parts.push(domText());
  else if (dowR) parts.push(dowText());
  else if (!f.dom.all || !f.dow.all) {
    if (f.dom.tokens[0] && f.dom.tokens[0].type === 'step') parts.push(fieldText(f.dom, 'dom'));
    if (f.dow.tokens[0] && f.dow.tokens[0].type === 'step') parts.push(fieldText(f.dow, 'dow'));
  }
  // ---- months
  if (!f.month.all) {
    const t = fieldText(f.month, 'month');
    parts.push(t.startsWith('every') ? t : 'in ' + t);
  }
  let s = parts.join(', ');
  s = s[0].toUpperCase() + s.slice(1);
  return s + '.';
}

export function looksLikeCron(s) {
  const t = String(s).trim();
  if (/^@(yearly|annually|monthly|weekly|daily|midnight|hourly)$/i.test(t)) return true;
  if (!/^[\d*?/,\-A-Za-z]+(\s+[\d*?/,\-A-Za-z]+){4,5}$/.test(t)) return false;
  if (!/[*]/.test(t) && !/\d/.test(t)) return false;
  try { parseCron(t); return true; } catch { return false; }
}
