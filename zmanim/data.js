// zmanim/data.js — locations, /time settings, and day schedules for /zmanim.
//
// Data sources, in order:
//   1. Chabad.org via /api/zmanim (zip= or cityid=), fetched in chunks of <=3 days
//      and cached per day in localStorage ("szv-zv:<query>:<YYYY-MM-DD>").
//      /time's own cache ("szv-z:<query>:<date>") is read too, so a day /time
//      already fetched costs nothing.
//   2. Local calculation in /time/zmanim.js (calibrated to Chabad.org rounding)
//      for locations without a ZIP / Chabad city id, dates outside the API's
//      range, or when the API is unreachable.
// Location + settings are the ones /time stores, so both pages agree.

import { CITIES, cityById, DEFAULT_CITY_ID, zipToTz } from '/time/cities.js?v=8a8909ac4d';

export const MIN = 60000, DAY = 86400000;

/* ---------------- storage ---------------- */
export const KEY = {
  // shared with /time (read; location is also written when picked here)
  loc: 'szv-time-loc', h24: 'szv-time-24h', candle: 'szv-time-candle', ends: 'szv-time-shabbos-ends',
  timeCache: 'szv-z:',
  // /zmanim's own
  cache: 'szv-zv:', look: 'szv-zv-look',
};
export const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
export const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };
export const lsJSON = (k, fb) => { try { const v = JSON.parse(lsGet(k)); return v == null ? fb : v; } catch (e) { return fb; } };
export const lsSetJSON = (k, v) => lsSet(k, v == null ? null : JSON.stringify(v));

/* ---------------- time zone helpers ---------------- */
export const validTz = (tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch (e) { return false; } };
export const deviceTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } })();
const fmtCache = new Map();
export function fmt(tz, key, opts, locale = 'en-US') {
  const k = tz + '|' + key;
  let f = fmtCache.get(k);
  if (!f) { f = new Intl.DateTimeFormat(locale, { timeZone: tz, ...opts }); fmtCache.set(k, f); }
  return f;
}
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export function partsIn(ms, tz) {
  const f = fmt(tz, 'parts', { hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
  const p = {};
  for (const { type, value } of f.formatToParts(new Date(ms))) p[type] = value;
  return { y: +p.year, m: +p.month, d: +p.day, H: +p.hour % 24, M: +p.minute, S: +p.second, weekday: WD[p.weekday] };
}
export const ymdStr = (o) => `${o.y}-${String(o.m).padStart(2, '0')}-${String(o.d).padStart(2, '0')}`;
export function addDays(o, n) {
  const t = new Date(Date.UTC(o.y, o.m - 1, o.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), weekday: t.getUTCDay() };
}
export function parseYMD(s) { const [y, m, d] = String(s).split('-').map(Number); return addDays({ y, m, d }, 0); }
export const addDaysStr = (s, n) => ymdStr(addDays(parseYMD(s), n));
export const todayIn = (ms, tz) => { const p = partsIn(ms, tz); return ymdStr(p); };
function tzOffset(ms, tz) {
  const p = partsIn(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.H, p.M, p.S) - Math.floor(ms / 1000) * 1000;
}
/** minutes after local midnight of `ymd` in `tz` → absolute ms (DST-safe). */
export function zonedTime(ymd, minutes, tz) {
  const guess = Date.UTC(ymd.y, ymd.m - 1, ymd.d, 0, minutes);
  let t = guess - tzOffset(guess, tz);
  const o2 = tzOffset(t, tz);
  if (guess - o2 !== t) t = guess - o2;
  return t;
}
/** { t: '9:52', ap: 'AM' } (ap '' in 24h). */
export function hm(ms, tz, h24) {
  const f = fmt(tz, 'hm' + (h24 ? 24 : 12), { hour: 'numeric', minute: '2-digit', hourCycle: h24 ? 'h23' : 'h12' });
  const p = {};
  for (const { type, value } of f.formatToParts(new Date(ms))) p[type] = value;
  return { t: `${h24 ? String(p.hour).padStart(2, '0') : p.hour}:${p.minute}`, ap: h24 ? '' : String(p.dayPeriod || '').toUpperCase() };
}
export const hmText = (ms, tz, h24) => { const x = hm(ms, tz, h24); return x.ap ? `${x.t} ${x.ap}` : x.t; };
export function countdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
}
export function relWords(ms) {
  const a = Math.abs(ms), m = Math.round(a / MIN);
  if (m < 1) return 'now';
  const h = Math.floor(m / 60), r = m % 60;
  const t = h ? `${h}h${r ? ` ${r}m` : ''}` : `${m} min`;
  return ms > 0 ? `in ${t}` : `${t} ago`;
}

/* ---------------- locations (same shapes as /time) ---------------- */
const tzCity = (tz) => (tz.split('/').pop() || tz).replace(/_/g, ' ');
export const fromCity = (c) => ({ ...c, kind: 'city' });
export function zipLoc(zip, tzOverride, name) {
  const auto = zipToTz(zip);
  const tz = tzOverride && validTz(tzOverride) ? tzOverride : auto || deviceTz;
  return { kind: 'zip', id: 'zip-' + zip, zip, tz, tzAuto: !tzOverride, name: name || 'ZIP ' + zip, country: 'United States' };
}
export function slim(loc) {
  if (!loc) return null;
  if (loc.kind === 'city') return { kind: 'city', id: loc.id };
  const o = { kind: loc.kind, id: loc.id, name: loc.name, country: loc.country, tz: loc.tz };
  if (loc.lat != null) { o.lat = loc.lat; o.lon = loc.lon; }
  if (loc.zip) { o.zip = loc.zip; o.tzAuto = !!loc.tzAuto; }
  return o;
}
export function revive(o) {
  if (!o || typeof o !== 'object') return null;
  if (o.kind === 'city' || (!o.kind && o.id)) { const c = cityById(o.id); return c ? fromCity(c) : null; }
  if (!o.tz || !validTz(o.tz)) return null;
  if (o.kind === 'zip' && !/^\d{5}$/.test(o.zip || '')) return null;
  if ((o.kind === 'here' || o.kind === 'custom') && !(isFinite(o.lat) && isFinite(o.lon))) return null;
  return { ...o };
}
export function locFromParams(search) {
  let q;
  try { q = new URLSearchParams(search); } catch (e) { return null; }
  const city = q.get('city');
  if (city) { const c = cityById(city.toLowerCase()); if (c) return fromCity(c); }
  const zip = q.get('zip');
  if (zip && /^\d{5}$/.test(zip)) return zipLoc(zip, q.get('tz'));
  const lat = parseFloat(q.get('lat')), lon = parseFloat(q.get('lon'));
  if (isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    const tz = q.get('tz') && validTz(q.get('tz')) ? q.get('tz') : deviceTz;
    const nm = (q.get('name') || '').slice(0, 40).trim();
    return { kind: 'custom', id: 'custom', name: nm || tzCity(tz), country: `${lat.toFixed(2)}, ${lon.toFixed(2)}`, tz, lat, lon };
  }
  return null;
}
/** Location given to mount() — a /time-style loc object, a city id, or a slim object. */
export function normalizeLoc(x) {
  if (!x) return null;
  if (typeof x === 'string') { const c = cityById(x); return c ? fromCity(c) : null; }
  if (x.kind === 'city' && x.lat == null) return revive(x);
  if (x.tz && validTz(x.tz) && (x.zip || x.chabadCityId || isFinite(x.lat))) return { ...x, kind: x.kind || 'custom' };
  return revive(x);
}
export const savedLoc = () => revive(lsJSON(KEY.loc, null));
export const defaultLoc = () => fromCity(cityById(DEFAULT_CITY_ID));
export const saveLoc = (loc) => lsSetJSON(KEY.loc, slim(loc));
export const hasCoords = (l) => !!l && l.lat != null && isFinite(l.lat) && isFinite(l.lon);
export const apiQuery = (loc) => loc.zip ? `zip=${loc.zip}` : loc.chabadCityId ? `cityid=${loc.chabadCityId}` : null;
export { CITIES, cityById };

/* ---------------- /time settings ---------------- */
const CANDLE_OPTIONS = [18, 20, 22, 30, 40];
const END_OPTIONS = ['deg', '42', '50', '72'];
export const h24Pref = () => lsGet(KEY.h24) === '1';
function candleOverride(loc) {
  const m = lsJSON(KEY.candle, {});
  const v = m && typeof m === 'object' ? m[loc.id] : null;
  return CANDLE_OPTIONS.includes(v) ? v : null;
}
export const candleFor = (loc) => candleOverride(loc) || loc.candleMinutes || 18;
export const endsPref = () => { const v = lsGet(KEY.ends); return END_OPTIONS.includes(v) ? v : 'deg'; };

/* ---------------- labels & definitions ---------------- */
export const LABELS = {
  alos: 'Alos Hashachar', misheyakir: 'Misheyakir', sunrise: 'Netz', sofZmanShma: 'Sof Zman Shema',
  sofZmanTefila: 'Sof Zman Tefillah', chatzos: 'Chatzos', minchaGedola: 'Mincha Gedolah',
  minchaKetana: 'Mincha Ketanah', plagHamincha: 'Plag Hamincha', sunset: 'Shkiah', tzeis: 'Tzeis',
  candleLighting: 'Candle lighting', shabbosEnds: 'Shabbos ends', holidayEnds: 'Yom Tov ends',
  fastBegins: 'Fast begins', fastEnds: 'Fast ends', chatzosLayla: 'Chatzos Halaylah',
  bedikasChametz: 'Bedikas Chametz', sofZmanAchilasChametz: 'Finish eating chametz', sofZmanBiurChametz: 'Burn chametz',
};
/** Chabad.org's plain-English names (used when the data has none, i.e. calculated). */
export const SUBS = {
  alos: 'Dawn', misheyakir: 'Earliest tallis & tefillin', sunrise: 'Sunrise', sofZmanShma: 'Latest Shema',
  sofZmanTefila: 'Latest Shacharis', chatzos: 'Midday', minchaGedola: 'Earliest Mincha',
  minchaKetana: 'Small Mincha', plagHamincha: 'Half of Mincha', sunset: 'Sunset', tzeis: 'Nightfall',
  candleLighting: 'Candle lighting', shabbosEnds: 'Shabbos ends', holidayEnds: 'Holiday ends',
  fastBegins: 'Fast begins', fastEnds: 'Fast ends', chatzosLayla: 'Midnight',
};
/** Short labels for tight spots (sun arc on phones). */
export const SHORT = {
  alos: 'Alos', misheyakir: 'Misheyakir', sunrise: 'Netz', sofZmanShma: 'Shema', sofZmanTefila: 'Tefillah',
  chatzos: 'Chatzos', minchaGedola: 'M. Gedolah', minchaKetana: 'M. Ketanah', plagHamincha: 'Plag',
  sunset: 'Shkiah', tzeis: 'Tzeis', candleLighting: 'Candles', shabbosEnds: 'Shabbos ends', holidayEnds: 'Yom Tov ends',
  fastBegins: 'Fast begins', fastEnds: 'Fast ends', chatzosLayla: 'Chatzos Hal.',
  sofZmanAchilasChametz: 'Eat chametz', sofZmanBiurChametz: 'Burn chametz', bedikasChametz: 'Bedikah',
};
/** One plain sentence per zman. */
export function definition(item, day) {
  const sz = day && day.shaahZmanit ? ` (one halachic hour today = ${day.shaahZmanit} min)` : '';
  switch (item.key) {
    case 'alos': return 'Dawn — first light, when the sun is 16.9° below the horizon; the earliest time for the day\'s mitzvos.';
    case 'misheyakir': return 'Earliest time for tallis and tefillin — when it is light enough to recognize an acquaintance.';
    case 'sunrise': return 'Sunrise — the ideal time to begin the Amidah of Shacharis.';
    case 'sofZmanShma': return `Latest time to say the morning Shema: 3 halachic hours after sunrise${sz}.`;
    case 'sofZmanTefila': return `Latest time for the Shacharis Amidah: 4 halachic hours after sunrise${sz}.`;
    case 'chatzos': return 'Midday — halfway between sunrise and sunset, when the sun is at its highest.';
    case 'minchaGedola': return 'Earliest time for Mincha: half a halachic hour after midday.';
    case 'minchaKetana': return 'Mincha Ketanah — the preferred time for Mincha begins, 9½ halachic hours into the day.';
    case 'plagHamincha': return 'Plag Hamincha — 1¼ halachic hours before the day ends; the earliest time to light Shabbos candles early.';
    case 'candleLighting': return item.after
      ? 'Light the candles not before this time (after nightfall), from an existing flame.'
      : `Light the candles ${item.custom ? 'at your chosen' : 'by this'} time — before sunset, never after it.`;
    case 'sunset': return 'Sunset — the sun drops below the horizon; Mincha should be prayed before it.';
    case 'tzeis': return 'Nightfall — three medium stars are out; the new day has begun.';
    case 'shabbosEnds': return 'Shabbos ends — after this time say Havdalah; weekday activity may resume.';
    case 'holidayEnds': return 'Yom Tov ends — after this time say Havdalah.';
    case 'fastBegins': return item.at && day && day.items.some((i) => i.key === 'sunset' && Math.abs(i.at - item.at) < 30 * MIN)
      ? 'The fast begins at sunset — finish eating and drinking before it.'
      : 'The fast begins at dawn — no eating or drinking from here until nightfall.';
    case 'fastEnds': return 'The fast ends — you may eat and drink.';
    case 'chatzosLayla': return 'Halachic midnight — halfway between sunset and sunrise.';
    case 'sofZmanAchilasChametz': return 'Finish eating chametz before this time: 4 halachic hours into the day.';
    case 'sofZmanBiurChametz': return 'Sell and burn your chametz before this time: 5 halachic hours into the day.';
    case 'bedikasChametz': return 'Search for chametz by candlelight at nightfall.';
    default: return '';
  }
}
export const ACCENT = new Set(['candleLighting', 'shabbosEnds', 'holidayEnds', 'fastBegins', 'fastEnds',
  'sofZmanAchilasChametz', 'sofZmanBiurChametz', 'bedikasChametz']);
const PRIORITY = { candleLighting: 3, fastBegins: 3, shabbosEnds: 3, holidayEnds: 3, fastEnds: 3 };
export const ORDER = ['alos', 'fastBegins', 'misheyakir', 'sunrise', 'sofZmanShma', 'sofZmanTefila', 'sofZmanAchilasChametz',
  'sofZmanBiurChametz', 'chatzos', 'minchaGedola', 'minchaKetana', 'plagHamincha', 'candleLighting', 'sunset', 'tzeis',
  'shabbosEnds', 'holidayEnds', 'fastEnds', 'bedikasChametz', 'chatzosLayla'];

// "Dawn (Alot Hashachar)" -> "Dawn"; "Mincha Ketanah (“Small Mincha”)" -> "Small Mincha"
export function cleanSub(label, chabad) {
  if (!chabad) return '';
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(chabad);
  let main = (m ? m[1] : chabad).trim();
  const par = m ? m[2].replace(/[“”"]/g, '').trim() : '';
  const n = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
  if (par && n(main) === n(label)) main = par;
  return n(main) === n(label) ? '' : main;
}

/* ---------------- Hebrew calendar ---------------- */
const HMONTH = { Tishri: 'Tishrei', Heshvan: 'Cheshvan', Kislev: 'Kislev', Tevet: 'Teves', Shevat: 'Shevat', Adar: 'Adar',
  'Adar I': 'Adar I', 'Adar II': 'Adar II', Nisan: 'Nissan', Iyar: 'Iyar', Sivan: 'Sivan', Tamuz: 'Tammuz', Av: 'Menachem Av', Elul: 'Elul' };
const hebFmt = (() => { try { return new Intl.DateTimeFormat('en-u-ca-hebrew', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return null; } })();
/** Hebrew date of the daytime of civil date `ymd`: { day, month, year } or null. */
export function hebDate(ymd) {
  if (!hebFmt) return null;
  try {
    const p = {};
    for (const { type, value } of hebFmt.formatToParts(new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d, 12)))) p[type] = value;
    const day = parseInt(p.day, 10), year = parseInt(p.year, 10);
    if (!day || !p.month) return null;
    return { day, month: HMONTH[p.month] || p.month, raw: p.month, year };
  } catch (e) { return null; }
}
export function hebText(ymd, apiText) {
  // Chabad.org sends "Cheshvan 05, 5787"; show it as "5 Cheshvan 5787".
  const m = /^([A-Za-z' ]+?)\s+0?(\d{1,2}),\s*(\d{4})$/.exec(apiText || '');
  if (m) return `${+m[2]} ${m[1].trim()} ${m[3]}`;
  const h = hebDate(ymd);
  return h ? `${h.day} ${h.month} ${h.year}` : '';
}
/**
 * Holiday / special-day names for civil date `ymd` (daytime), Chabad spelling.
 * Returns [{ name, kind }] where kind is 'shabbos' | 'yomtov' | 'fast' | 'chag' | 'minor'.
 */
export function specialDays(ymd, israel) {
  const out = [];
  const add = (name, kind) => out.push({ name, kind });
  const wd = addDays(ymd, 0).weekday;
  const h = hebDate(ymd);
  if (h) {
    const { day: d, raw } = h;
    const mo = (n) => raw === n;
    const adar = mo('Adar') || mo('Adar II');
    if (mo('Tishri')) {
      if (d === 1 || d === 2) add('Rosh Hashanah', 'yomtov');
      if ((d === 3 && wd !== 6) || (d === 4 && wd === 0)) add('Tzom Gedaliah', 'fast');
      if (d === 9) add('Erev Yom Kippur', 'minor');
      if (d === 10) add('Yom Kippur', 'yomtov');
      if (d === 14) add('Erev Sukkos', 'minor');
      if (d === 15 || (d === 16 && !israel)) add('Sukkos', 'yomtov');
      if (d >= (israel ? 16 : 17) && d <= 20) add('Chol Hamoed Sukkos', 'chag');
      if (d === 21) add('Hoshana Rabbah', 'chag');
      if (d === 22) add(israel ? 'Shemini Atzeres · Simchas Torah' : 'Shemini Atzeres', 'yomtov');
      if (d === 23 && !israel) add('Simchas Torah', 'yomtov');
    }
    if (mo('Elul') && d === 29) add('Erev Rosh Hashanah', 'minor');
    if (mo('Elul') && d === 18) add('Chai Elul', 'minor');
    if (mo('Kislev') && d === 19) add('Yud-Tes Kislev', 'minor');
    for (let k = 0; k < 8; k++) {
      const p = hebDate(addDays(ymd, -k));
      if (p && p.raw === 'Kislev' && p.day === 25) { add(`Chanukah · day ${k + 1}`, 'chag'); break; }
    }
    if (mo('Tevet') && d === 10) add('Asarah B\'Teves', 'fast');
    if (mo('Shevat') && d === 10) add('Yud Shevat', 'minor');
    if (mo('Shevat') && d === 15) add('Tu B\'Shevat', 'minor');
    if (adar && ((d === 13 && wd !== 6) || (d === 11 && wd === 4))) add('Taanis Esther', 'fast');
    if (adar && d === 14) add('Purim', 'chag');
    if (adar && d === 15) add('Shushan Purim', 'minor');
    if (mo('Adar I') && d === 14) add('Purim Katan', 'minor');
    if (mo('Nisan')) {
      if (d === 11) add('Yud-Alef Nissan', 'minor');
      if (d === 14) add('Erev Pesach', 'minor');
      if (d === 15 || (d === 16 && !israel)) add('Pesach', 'yomtov');
      if (d >= (israel ? 16 : 17) && d <= 20) add('Chol Hamoed Pesach', 'chag');
      if (d === 21) add('Shvi\'i shel Pesach', 'yomtov');
      if (d === 22 && !israel) add('Acharon shel Pesach', 'yomtov');
    }
    if (mo('Iyar') && d === 18) add('Lag BaOmer', 'minor');
    if (mo('Sivan')) {
      if (d === 5) add('Erev Shavuos', 'minor');
      if (d === 6 || (d === 7 && !israel)) add('Shavuos', 'yomtov');
    }
    if (mo('Tamuz')) {
      if (d === 3) add('Gimmel Tammuz', 'minor');
      if (d === 12) add('Yud-Beis Tammuz', 'minor');
      if ((d === 17 && wd !== 6) || (d === 18 && wd === 0)) add('17 Tammuz', 'fast');
    }
    if (mo('Av')) {
      if ((d === 9 && wd !== 6) || (d === 10 && wd === 0)) add('Tisha B\'Av', 'fast');
      if (d === 15) add('Tu B\'Av', 'minor');
    }
    if (d === 30) {
      const n = hebDate(addDays(ymd, 1));
      if (n) add(`Rosh Chodesh ${n.month}`, 'minor');
    } else if (d === 1 && !mo('Tishri')) add(`Rosh Chodesh ${h.month}`, 'minor');
  }
  if (wd === 6) out.unshift({ name: 'Shabbos', kind: 'shabbos' });
  else if (wd === 5 && !out.some((o) => o.kind === 'yomtov')) out.push({ name: 'Erev Shabbos', kind: 'minor' });
  return out;
}

/* ---------------- engine (local calculation) ---------------- */
let Z = null;
let zPromise = null;
export function setEngine(m) { Z = m; zPromise = Promise.resolve(m); }
export function loadEngine() {
  if (!zPromise) zPromise = import('/time/zmanim.js?v=93be04f7f2').then((m) => { Z = m; return m; }).catch(() => null);
  return zPromise;
}

const CALC_KEYS = ['alos', 'misheyakir', 'sunrise', 'sofZmanShma', 'sofZmanTefila', 'chatzos', 'minchaGedola',
  'minchaKetana', 'plagHamincha', 'candleLighting', 'sunset', 'tzeis', 'shabbosEnds'];

function sortItems(items) {
  items.sort((a, b) => a.at - b.at || (ORDER.indexOf(a.key) - ORDER.indexOf(b.key)));
  return items;
}

/** One calculated day (needs Z loaded and coordinates). */
export function calcDay(loc, dateStr) {
  if (!Z || !hasCoords(loc)) return null;
  const ymd = parseYMD(dateStr);
  const zloc = { lat: loc.lat, lon: loc.lon, tz: loc.tz, candleMinutes: candleFor(loc) };
  const ends = endsPref();
  const opts = { candleMinutes: candleFor(loc) };
  if (ends !== 'deg') opts.shabbosEnds = { type: 'minutes', value: +ends };
  const z = Z.zmanim({ y: ymd.y, m: ymd.m, d: ymd.d }, zloc, opts) || {};
  const items = [];
  for (const key of CALC_KEYS) {
    const t = z[key];
    if (!t) continue;
    // Chabad convention: on Shabbos the "Shabbos ends" time replaces Tzeis.
    if (key === 'tzeis' && z.shabbosEnds) continue;
    const at = +(Z.roundZman ? Z.roundZman(t, key) : new Date(Math.round(+t / MIN) * MIN));
    items.push({ key, label: LABELS[key], sub: ['candleLighting', 'shabbosEnds'].includes(key) ? '' : SUBS[key] || '', at, accent: ACCENT.has(key), custom: key === 'shabbosEnds' && ends !== 'deg' });
  }
  // Chatzos Halaylah: halfway between sunset and the next sunrise.
  try {
    const n = addDays(ymd, 1);
    const nx = Z.sunTimes({ y: n.y, m: n.m, d: n.d }, zloc);
    if (z.sunset && nx && nx.sunrise) {
      const mid = (+z.sunset + +nx.sunrise) / 2;
      items.push({ key: 'chatzosLayla', label: LABELS.chatzosLayla, sub: SUBS.chatzosLayla, at: Math.floor(mid / MIN) * MIN });
    }
  } catch (e) {}
  let shaah = '';
  if (z.sofZmanShma && z.sofZmanTefila) {
    const s = Math.round((+z.sofZmanTefila - +z.sofZmanShma) / 1000);
    shaah = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  return finishDay({ date: dateStr, ymd, items: sortItems(items), hebrewDate: hebText(ymd, ''), shaahZmanit: shaah, source: 'calc' }, loc);
}

/** Normalize one /api/zmanim day. */
export function apiDay(day, loc) {
  const ymd = parseYMD(day.date);
  const sunsetIt = day.items.find((i) => i.key === 'sunset' && i.minutes != null);
  const cOver = candleOverride(loc), ends = endsPref();
  const items = [];
  for (const it of day.items) {
    if (!it || it.key === 'other' || it.minutes == null) continue;
    const min = it.minutes + (it.nextDay && it.minutes < 1440 ? 1440 : 0);
    const label = it.label || LABELS[it.key] || it.key;
    const plain = ['candleLighting', 'shabbosEnds', 'holidayEnds', 'fastBegins', 'fastEnds'].includes(it.key);
    const item = { key: it.key, label, sub: plain ? '' : cleanSub(label, it.chabadLabel) || SUBS[it.key] || '', at: zonedTime(ymd, min, loc.tz), after: !!it.after, accent: ACCENT.has(it.key) };
    if (it.after) item.label = 'Candle lighting';
    if (it.also) item.also = it.also;
    items.push(item);
  }
  // honour the user's /time customs on top of Chabad.org's times
  if (sunsetIt) {
    const ss = zonedTime(ymd, sunsetIt.minutes, loc.tz);
    for (const i of items) {
      if (i.key === 'candleLighting' && !i.after && cOver) { i.at = ss - cOver * MIN; i.custom = true; }
      if (i.key === 'shabbosEnds' && ends !== 'deg') { i.at = ss + +ends * MIN; i.custom = true; }
    }
  }
  return finishDay({ date: day.date, ymd, items: sortItems(items), hebrewDate: hebText(ymd, day.hebrewDate), shaahZmanit: day.shaahZmanit || '', source: 'chabad' }, loc);
}

function finishDay(d, loc) {
  d.weekday = d.ymd.weekday;
  d.special = specialDays(d.ymd, loc.tz === 'Asia/Jerusalem');
  const has = (k) => d.items.some((i) => i.key === k);
  if (has('fastBegins') && !d.special.some((s) => s.kind === 'fast')) {
    // evening fasts (Yom Kippur / Tisha B'Av) begin the day before
    const n = specialDays(addDays(d.ymd, 1), loc.tz === 'Asia/Jerusalem').find((s) => s.kind === 'fast' || /Yom Kippur/.test(s.name));
    if (n && !d.special.some((s) => s.name === 'Erev ' + n.name)) d.special.push({ name: 'Erev ' + n.name, kind: 'minor' });
  }
  d.shabbos = d.weekday === 6;
  d.erev = has('candleLighting');
  return d;
}

/* ---------------- fetching & cache ---------------- */
async function fetchJSON(url, ms = 9000) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = setTimeout(() => ctl && ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl && ctl.signal, headers: { accept: 'application/json' } });
    const body = await r.json().catch(() => null);
    return { status: r.status, body };
  } finally { clearTimeout(t); }
}
export const validApi = (j) => !!j && j.source === 'chabad.org' && Array.isArray(j.days) && j.days.length > 0
  && j.days.every((d) => d && /^\d{4}-\d\d-\d\d$/.test(d.date) && Array.isArray(d.items));

function cacheGet(q, date) {
  const own = lsJSON(`${KEY.cache}${q}:${date}`, null);
  if (own && own.day && own.day.date === date && Array.isArray(own.day.items)) return own;
  // /time caches two days starting at its "today"
  for (const back of [0, 1]) {
    const k = `${KEY.timeCache}${q}:${addDaysStr(date, -back)}`;
    const j = lsJSON(k, null);
    if (validApi(j)) {
      const day = j.days.find((d) => d.date === date);
      if (day) return { day, location: j.location, link: j.link, credit: j.credit };
    }
  }
  return null;
}
function cachePut(q, json) {
  for (const day of json.days) lsSetJSON(`${KEY.cache}${q}:${day.date}`, { day, location: json.location, link: json.link, credit: json.credit });
}
export function pruneCache(keepFrom) {
  try {
    const dead = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(KEY.cache) && k.slice(-10) < keepFrom) dead.push(k);
    }
    dead.forEach((k) => localStorage.removeItem(k));
  } catch (e) {}
}
// The API accepts dates from 2 days ago (UTC) to 400 days ahead.
function apiInRange(date, nowMs) {
  const today = todayIn(nowMs, 'UTC');
  const diff = Math.round((Date.parse(date + 'T00:00Z') - Date.parse(today + 'T00:00Z')) / DAY);
  return diff >= -2 && diff <= 400;
}

/**
 * Days `start`..`start+n-1` for `loc`. Resolves to
 *   { days: [day|null...], meta: { location, link, credit } | null }
 * Missing API days are fetched in parallel chunks of <=3 consecutive days.
 */
export async function getDays(loc, start, n, nowMs) {
  const dates = Array.from({ length: n }, (_, i) => addDaysStr(start, i));
  const raw = new Map();
  let meta = null;
  const q = apiQuery(loc);
  if (q) {
    const missing = [];
    for (const d of dates) {
      const c = cacheGet(q, d);
      if (c) { raw.set(d, c.day); meta = meta || c; } else if (apiInRange(d, nowMs)) missing.push(d);
    }
    const chunks = [];
    for (const d of missing) {
      const last = chunks[chunks.length - 1];
      if (last && last.length < 3 && addDaysStr(last[last.length - 1], 1) === d) last.push(d); else chunks.push([d]);
    }
    await Promise.all(chunks.map(async (ch) => {
      try {
        const r = await fetchJSON(`/api/zmanim?${q}&date=${ch[0]}&days=${ch.length}`);
        if (r.status === 200 && validApi(r.body) && r.body.days[0].date === ch[0]) {
          cachePut(q, r.body);
          for (const day of r.body.days) raw.set(day.date, day);
          meta = meta || r.body;
        }
      } catch (e) { /* offline / no function: fall back below */ }
    }));
  }
  const need = dates.some((d) => !raw.has(d));
  if (need && hasCoords(loc)) await loadEngine();
  const days = dates.map((d) => {
    if (raw.has(d)) { try { return apiDay(raw.get(d), loc); } catch (e) { /* fall through */ } }
    try { return calcDay(loc, d); } catch (e) { return null; }
  });
  return { days, meta: meta ? { location: meta.location || '', link: meta.link || 'https://www.chabad.org/calendar/zmanim.htm', credit: meta.credit || 'Zmanim courtesy of Chabad.org' } : null };
}

/* ---------------- schedule helpers ---------------- */
/** The zman to highlight: the next one after `t` (ties: the meaningful one wins). */
export function nextItem(items, t) {
  let best = null;
  for (const i of items) {
    if (i.at <= t) continue;
    if (!best || i.at < best.at || (i.at === best.at && (PRIORITY[i.key] || 0) > (PRIORITY[best.key] || 0))) best = i;
  }
  return best;
}
/** Sky phase at `t` for a day: 'night' | 'dawn' | 'day' | 'dusk'. */
export function phaseAt(day, t) {
  const g = (k) => { const i = day && day.items.find((x) => x.key === k); return i ? i.at : null; };
  const alos = g('alos'), rise = g('sunrise'), set = g('sunset');
  const tz = g('tzeis') || g('shabbosEnds') || g('holidayEnds') || (set != null ? set + 40 * MIN : null);
  if (rise == null || set == null) return 'night';
  if (t < (alos ?? rise - 72 * MIN)) return 'night';
  if (t < rise) return 'dawn';
  if (t < set) return 'day';
  if (t < tz) return 'dusk';
  return 'night';
}
export const israelLoc = (loc) => loc && loc.tz === 'Asia/Jerusalem';
