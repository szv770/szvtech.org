// remind/remind.js — the reminder engine behind /remind and the "next up" card on /today.
//
// No DOM and no absolute imports, so `node remind/remind.test.mjs` can test it. Everything
// here is pure except load()/save() (localStorage, wrapped in try/catch) and the optional
// zman source that the page plugs in with setZmanSource().
//
// An item is {id, title, emoji, color, kind, ...fields, created, ack, doneAt, snooze}:
//   once    when:'YYYY-MM-DDTHH:MM' (device clock)
//   yearly  greg:{m,d,y?} + time          (y = the year it began → "turns N")
//   hebrew  heb:{m,d,y?,type} + time + eve (type birthday | yahrzeit | date; y = Hebrew birth/passing year)
//   weekly  days:[0..6] + time
//   daily   time
//   zman    zman:{key, offset (minutes, − = before), days:null|[0..6]}   (saved location, Chabad.org times)
// ack = scheduled time (ms) of the last occurrence the person marked done / skipped.
// snooze = {for: scheduled ms, until: ms}.
//
// Occurrences are computed on demand ("what is the first one after X?"), so a yearly
// Hebrew birthday never needs to be stored more than once.

import * as L from '../luach/logic.js?v=c065cd15ad';

export const KEY = 'szv-remind';
export const MIN = 60000, HOUR = 3600000, DAY = 86400000;
/** A recurring occurrence that nobody acknowledged is dropped silently after this long. */
export const GRACE = 12 * HOUR;
export const KINDS = ['once', 'yearly', 'hebrew', 'weekly', 'daily', 'zman'];
export const KIND_LABEL = { once: 'One time', yearly: 'Every year', hebrew: 'Hebrew date', weekly: 'Weekly', daily: 'Daily', zman: 'By zman' };

/** Zmanim a reminder can hang off (keys match /zmanim/data.js, Chabad.org spelling). */
export const ZMANIM = [
  { key: 'alos', label: 'Alos Hashachar' }, { key: 'misheyakir', label: 'Misheyakir' }, { key: 'sunrise', label: 'Netz' },
  { key: 'sofZmanShma', label: 'Sof Zman Shema' }, { key: 'sofZmanTefila', label: 'Sof Zman Tefillah' },
  { key: 'chatzos', label: 'Chatzos' }, { key: 'minchaGedola', label: 'Mincha Gedolah' }, { key: 'minchaKetana', label: 'Mincha Ketanah' },
  { key: 'plagHamincha', label: 'Plag Hamincha' }, { key: 'candleLighting', label: 'Candle lighting' }, { key: 'sunset', label: 'Shkiah' },
  { key: 'tzeis', label: 'Tzeis' }, { key: 'shabbosEnds', label: 'Shabbos ends' }, { key: 'holidayEnds', label: 'Yom Tov ends' },
  { key: 'chatzosLayla', label: 'Chatzos Halaylah' },
];
export const zmanLabel = (key) => (ZMANIM.find((z) => z.key === key) || { label: key }).label;

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Shabbos'];
const WD3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Shabbos'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* ------------------------------------------------------------------ small helpers */
const pad2 = (n) => String(n).padStart(2, '0');
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const int = (v, lo, hi) => { const n = typeof v === 'string' && v.trim() !== '' ? +v : v; return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };
export const parseHM = (s, fb = '09:00') => { const r = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return r && +r[1] < 24 && +r[2] < 60 ? `${pad2(+r[1])}:${r[2]}` : fb; };
const hmParts = (s) => { const t = parseHM(s); return [+t.slice(0, 2), +t.slice(3)]; };
export const isLeapGreg = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const dim = (y, m) => [31, isLeapGreg(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
export const localMs = (y, m, d, hm) => { const [H, M] = hmParts(hm); return new Date(y, m - 1, d, H, M, 0, 0).getTime(); };
export const ymdLocal = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
export const parseWhen = (s) => {
  const r = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(s || ''));
  if (!r) return null;
  const y = +r[1], m = +r[2], d = +r[3];
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > dim(y, m) || +r[4] > 23 || +r[5] > 59) return null;
  return localMs(y, m, d, `${r[4]}:${r[5]}`);
};
export const whenStr = (ms) => { const d = new Date(ms); return `${ymdLocal(ms)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const ymdParts = (s) => { const [y, m, d] = String(s).split('-').map(Number); return { y, m, d }; };
const addYmd = (ymd, n) => { const p = ymdParts(ymd), t = new Date(Date.UTC(p.y, p.m - 1, p.d + n)); return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`; };
const wdOfYmd = (ymd) => { const p = ymdParts(ymd); return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); };

/** Split a millisecond span into days / hours / minutes / seconds (never negative). */
export function splitMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor(s % 86400 / 3600), m: Math.floor(s % 3600 / 60), s: s % 60 };
}

/* ------------------------------------------------------------------ zman source */
// The page plugs in { ymdOf(ms) -> 'YYYY-MM-DD' in the zmanim location's zone,
//                     day(ymd)  -> [{key, at}] | null }.  Tests inject a fake one.
let SOURCE = null;
// Also parked on globalThis so a second copy of this module (same file, different ?v= stamp) still sees it.
export function setZmanSource(s) { SOURCE = s || null; try { globalThis.__szvRemindZ = SOURCE; } catch (e) {} }
export const getZmanSource = () => SOURCE || (typeof globalThis !== 'undefined' && globalThis.__szvRemindZ) || null;

/* ------------------------------------------------------------------ recurrence */
/**
 * First occurrence of `item` strictly after `after` (ms), or null.
 * Returns { at, nth } — nth is "which one" for anniversaries (turns 12, 5th yahrzeit) or null.
 */
export function occAfter(item, after, ctx = {}) {
  const hm = item.time || '09:00';
  switch (item.kind) {
    case 'once': {
      const at = parseWhen(item.when);
      return at != null && at > after ? { at, nth: null } : null;
    }
    case 'daily': {
      const d0 = new Date(after);
      for (let i = -1; i <= 2; i++) {
        const d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i);
        const at = localMs(d.getFullYear(), d.getMonth() + 1, d.getDate(), hm);
        if (at > after) return { at, nth: null };
      }
      return null;
    }
    case 'weekly': {
      const days = item.days && item.days.length ? item.days : [0, 1, 2, 3, 4, 5, 6];
      const d0 = new Date(after);
      for (let i = -1; i <= 8; i++) {
        const d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i);
        if (!days.includes(d.getDay())) continue;
        const at = localMs(d.getFullYear(), d.getMonth() + 1, d.getDate(), hm);
        if (at > after) return { at, nth: null };
      }
      return null;
    }
    case 'yearly': {
      const g = item.greg;
      if (!g) return null;
      const y0 = new Date(after).getFullYear();
      for (let y = y0 - 1; y <= y0 + 8; y++) {
        if (g.y && y < g.y) continue;
        const d = g.m === 2 && g.d === 29 && !isLeapGreg(y) ? 28 : g.d;
        const at = localMs(y, g.m, d, hm);
        if (at > after) return { at, nth: g.y ? y - g.y : null };
      }
      return null;
    }
    case 'hebrew': {
      const h = item.heb;
      if (!h) return null;
      const t0 = new Date(after);
      const hy0 = L.absToHebrew(L.gregToAbs(t0.getFullYear(), t0.getMonth() + 1, t0.getDate())).y;
      for (let hy = hy0 - 1; hy <= hy0 + 6; hy++) {
        let o = null;
        if (h.type === 'birthday' && h.y) o = L.birthdayIn(h, hy);
        else if (h.type === 'yahrzeit' && h.y) o = L.yahrzeitIn(h, hy);
        else {
          let m = h.m;
          if (m === 13 && !L.isLeapYear(hy)) m = 12;
          o = { y: hy, m, d: Math.min(h.d, L.daysInMonth(m, hy)) };
        }
        if (!o) continue;
        let abs = L.hebrewToAbs(o.y, o.m, o.d);
        if (item.eve) abs -= 1;
        const g = L.absToGreg(abs);
        const at = localMs(g.y, g.m, g.d, hm);
        if (at > after) return { at, nth: h.y && h.type !== 'date' ? hy - h.y : null };
      }
      return null;
    }
    case 'zman': {
      const src = ctx.zman || getZmanSource(), z = item.zman;
      if (!src || !z) return null;
      const start = addYmd(src.ymdOf(after), -1);
      for (let i = 0; i < 18; i++) {
        const ymd = addYmd(start, i);
        if (z.days && !z.days.includes(wdOfYmd(ymd))) continue;
        const day = src.day(ymd);
        if (!day) continue;
        const it = day.find((x) => x.key === z.key);
        if (!it) continue;
        const at = +it.at + (z.offset || 0) * MIN;
        if (at > after) return { at, nth: null };
      }
      return null;
    }
    default: return null;
  }
}

/**
 * What an item is waiting on right now, or null (finished / nothing coming).
 * { id,title,emoji,color,kind, atMs (when it fires, snooze included), baseMs (scheduled time),
 *   due (atMs <= now), snoozed, nth }
 */
export function pending(item, nowMs, ctx = {}) {
  if (item.kind === 'once' && item.doneAt) return null;
  const ack = +item.ack || 0;
  const recurring = item.kind !== 'once';
  const sn = item.snooze;
  let baseMs, atMs, nth = null, snoozed = false;
  if (sn && sn.for > ack && !(recurring && nowMs - sn.until > GRACE)) {
    baseMs = sn.for; atMs = sn.until; snoozed = true;
  } else {
    const o = occAfter(item, recurring ? Math.max(ack, nowMs - GRACE) : ack, ctx);
    if (!o) return null;
    baseMs = o.at; atMs = o.at; nth = o.nth;
  }
  return { id: item.id, title: item.title, emoji: item.emoji, color: item.color, kind: item.kind, atMs, baseMs, due: atMs <= nowMs, snoozed, nth };
}

/** Sort key used everywhere: due items first (oldest first), then soonest. */
export const byNext = (a, b) => a.atMs - b.atMs || (a.title < b.title ? -1 : 1);

/** Pending state of every item, ordered "next up" first. */
export function ordered(items, nowMs, ctx = {}) {
  return items.map((it) => pending(it, nowMs, ctx)).filter(Boolean).sort(byNext);
}

/**
 * The next `n` things that will fire (one per reminder, due-now ones first):
 *   [{ id, title, emoji, atMs, kind, color, due, snoozed, nth }]
 * Reads the saved reminders unless `items` is given.
 */
export function upcoming(n = 3, nowMs = Date.now(), items = null, ctx = {}) {
  const list = items || load().items;
  return ordered(list, nowMs, ctx).slice(0, Math.max(0, n)).map((p) => ({
    id: p.id, title: p.title, emoji: p.emoji, atMs: p.atMs, kind: p.kind, color: p.color, due: p.due, snoozed: p.snoozed, nth: p.nth,
  }));
}

/* ------------------------------------------------------------------ actions (return a new item) */
/** "Done" for a due reminder, "Skip" for one still ahead. */
export function ackItem(item, nowMs, ctx = {}) {
  const p = pending(item, nowMs, ctx);
  if (!p) return item;
  if (item.kind === 'once') return { ...item, doneAt: nowMs, snooze: null };
  return { ...item, ack: p.baseMs, snooze: null };
}
export function snoozeItem(item, until, nowMs, ctx = {}) {
  const p = pending(item, nowMs, ctx);
  if (!p) return item;
  return { ...item, snooze: { for: p.baseMs, until: Math.max(until, nowMs + MIN) } };
}
export const reopenItem = (item) => ({ ...item, doneAt: null, ack: 0, snooze: null });

/* ------------------------------------------------------------------ describing */
export const fmtHM = (hm) => { const [H, M] = hmParts(hm); return `${H % 12 || 12}:${pad2(M)} ${H < 12 ? 'AM' : 'PM'}`; };
const ordinal = (n) => { const v = n % 100; return n + (['th', 'st', 'nd', 'rd'][(v - 20) % 10] || ['th', 'st', 'nd', 'rd'][v] || 'th'); };
export const ordinalOf = ordinal;
export function hebName(h) { return `${h.d} ${L.monthName(h.m, h.y || 5784)}`; }

/** One plain line: how it repeats. */
export function describe(item) {
  const t = fmtHM(item.time || '09:00');
  switch (item.kind) {
    case 'once': return 'One time';
    case 'daily': return `Every day at ${t}`;
    case 'weekly': {
      const d = item.days || [];
      if (d.length === 7) return `Every day at ${t}`;
      return `Every ${d.map((x) => WD3[x]).join(', ')} at ${t}`;
    }
    case 'yearly': return `Every year on ${MONTHS[item.greg.m - 1]} ${item.greg.d}`;
    case 'hebrew': {
      const h = item.heb, nm = `${h.d} ${h.type === 'date' ? (h.m === 13 ? 'Adar' : L.monthName(h.m, 5784)) : L.monthName(h.m, h.y)}`, ev = item.eve ? ', the evening before' : '';
      if (h.type === 'birthday') return `Hebrew birthday, ${nm}${ev}`;
      if (h.type === 'yahrzeit') return `Yahrzeit, ${nm}${ev}`;
      return `Every year on ${nm}${ev}`;
    }
    case 'zman': {
      const z = item.zman, o = z.offset || 0;
      const rel = o === 0 ? 'At' : `${Math.abs(o)} min ${o < 0 ? 'before' : 'after'}`;
      const days = !z.days ? 'every day it applies' : z.days.length === 7 ? 'every day' : `every ${z.days.map((x) => WD3[x]).join(', ')}`;
      return `${rel} ${zmanLabel(z.key)}, ${days}`;
    }
    default: return '';
  }
}
export { WD, WD3 };

/* ------------------------------------------------------------------ validation & storage */
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Clean one item from anywhere (storage, import, form). Returns null when unusable. */
export function cleanItem(x) {
  if (!isObj(x) || !KINDS.includes(x.kind)) return null;
  const o = {
    id: typeof x.id === 'string' && /^[\w-]{1,40}$/.test(x.id) ? x.id : newId(),
    title: String(x.title == null ? '' : x.title).replace(/\s+/g, ' ').trim().slice(0, 80) || 'Reminder',
    emoji: String(x.emoji || '').trim().slice(0, 8),
    color: int(x.color, 0, 5) ?? 0,
    kind: x.kind,
    created: Number.isFinite(+x.created) && +x.created > 0 ? +x.created : Date.now(),
    ack: Number.isFinite(+x.ack) && +x.ack > 0 ? +x.ack : 0,
    doneAt: Number.isFinite(+x.doneAt) && +x.doneAt > 0 ? +x.doneAt : null,
    snooze: null,
  };
  if (isObj(x.snooze) && Number.isFinite(+x.snooze.for) && Number.isFinite(+x.snooze.until)) o.snooze = { for: +x.snooze.for, until: +x.snooze.until };
  if (x.kind !== 'once') o.time = parseHM(x.time);
  switch (x.kind) {
    case 'once': if (parseWhen(x.when) == null) return null; o.when = x.when; break;
    case 'yearly': {
      const g = x.greg, m = isObj(g) ? int(g.m, 1, 12) : null, d = isObj(g) ? int(g.d, 1, 31) : null;
      if (!m || !d || d > dim(2024, m)) return null;
      o.greg = { m, d }; const y = int(g.y, 1900, 2200); if (y) o.greg.y = y;
      break;
    }
    case 'hebrew': {
      const h = x.heb;
      if (!isObj(h)) return null;
      const m = int(h.m, 1, 13), d = int(h.d, 1, 30), y = int(h.y, 3762, 6000);
      let type = ['birthday', 'yahrzeit', 'date'].includes(h.type) ? h.type : 'date';
      if (!m || !d) return null;
      if (type !== 'date' && !y) type = 'date';
      if (y && !L.validHebrew(y, m, d)) return null;
      o.heb = { m, d, type }; if (y && type !== 'date') o.heb.y = y;
      o.eve = !!x.eve;
      break;
    }
    case 'weekly': {
      const days = [...new Set((Array.isArray(x.days) ? x.days : []).map((v) => int(v, 0, 6)).filter((v) => v != null))].sort();
      if (!days.length) return null;
      o.days = days;
      break;
    }
    case 'zman': {
      const z = x.zman;
      if (!isObj(z) || !ZMANIM.some((k) => k.key === z.key)) return null;
      const off = int(z.offset == null ? 0 : z.offset, -720, 720);
      if (off == null) return null;
      const days = Array.isArray(z.days) ? [...new Set(z.days.map((v) => int(v, 0, 6)).filter((v) => v != null))].sort() : null;
      o.zman = { key: z.key, offset: off, days: days && days.length ? days : null };
      break;
    }
    default: break;
  }
  return o;
}

export function normalize(raw) {
  const list = isObj(raw) && Array.isArray(raw.items) ? raw.items : [];
  const seen = new Set(), items = [];
  for (const r of list) {
    const it = cleanItem(r);
    if (it && !seen.has(it.id)) { seen.add(it.id); items.push(it); }
    if (items.length >= 500) break;
  }
  return { v: 1, items };
}

export function load() {
  try { return normalize(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return { v: 1, items: [] }; }
}
export function save(items) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, items })); return true; } catch (e) { return false; }
}

export const exportJSON = (items) => JSON.stringify({ app: 'szvtech-remind', v: 1, exported: new Date().toISOString(), items }, null, 2);

/** Parse an exported file (or a bare {items} / [items] shape). Returns [items] or null. */
export function parseImport(text) {
  let j;
  try { j = JSON.parse(text); } catch (e) { return null; }
  const list = Array.isArray(j) ? j : isObj(j) && Array.isArray(j.items) ? j.items : null;
  if (!list) return null;
  const out = normalize({ items: list }).items;
  return out.length || !list.length ? out : null;
}
/** Merge imported items into the current ones: new ids are added, same id is replaced by the import. */
export function mergeItems(cur, inc) {
  const map = new Map(cur.map((i) => [i.id, i]));
  let added = 0, updated = 0;
  for (const i of inc) { if (map.has(i.id)) updated++; else added++; map.set(i.id, i); }
  return { items: [...map.values()].slice(0, 500), added, updated };
}

/* ------------------------------------------------------------------ calendar file (.ics) */
// The one honest way to ring while this page is closed: hand the phone's own calendar the event.
const icsEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsUtc = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`; };
const icsLocal = (ms) => { const d = new Date(ms); return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`; };
export function icsFor(item, nowMs, ctx = {}) {
  const p = pending(item, nowMs, ctx);
  if (!p) return null;
  const BY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  let rrule = '';
  if (item.kind === 'daily') rrule = 'RRULE:FREQ=DAILY';
  else if (item.kind === 'weekly') rrule = `RRULE:FREQ=WEEKLY;BYDAY=${item.days.map((d) => BY[d]).join(',')}`;
  else if (item.kind === 'yearly') rrule = 'RRULE:FREQ=YEARLY';
  const start = rrule ? `DTSTART:${icsLocal(p.baseMs)}` : `DTSTART:${icsUtc(p.baseMs)}`;
  const end = rrule ? `DTEND:${icsLocal(p.baseMs + 15 * MIN)}` : `DTEND:${icsUtc(p.baseMs + 15 * MIN)}`;
  const title = `${item.emoji ? item.emoji + ' ' : ''}${item.title}`;
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SZVTECH//Remind//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${item.id}@szvtech.org`, `DTSTAMP:${icsUtc(nowMs)}`, start, end, rrule, `SUMMARY:${icsEsc(title)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(title)}`, 'TRIGGER:PT0S', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR']
    .filter(Boolean).join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------------ Hebrew helper for the form */
/** Gregorian y-m-d (+ "after sunset" flag) -> {y,m,d} Hebrew + names. */
export function hebrewOf(y, m, d, afterSunset = false) {
  const h = L.absToHebrew(L.gregToAbs(y, m, d) + (afterSunset ? 1 : 0));
  return { ...h, en: `${h.d} ${L.monthName(h.m, h.y)} ${h.y}`, he: L.hebrewDateHe(h) };
}
export const monthChoices = (leap = true) => L.monthsOfYear(leap ? 5784 : 5785).map((x) => ({ m: x.m, name: x.name }));
