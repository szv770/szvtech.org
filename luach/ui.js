// /luach — Hebrew calendar, today panel, Chabad daily study and date converter.
// Hebrew dates / anniversaries come from /luach/logic.js; holidays, parsha,
// omer wording and molad from @hebcal/core (window.hebcal, pinned in index.html);
// zmanim from /api/zmanim (Chabad.org) with /time/zmanim.js as the offline fallback.
import { CITIES, cityById, DEFAULT_CITY_ID, REGIONS, zipToTz } from '/time/cities.js?v=8a8909ac4d';
import * as L from '/luach/logic.js?v=c065cd15ad';
import { HOLIDAY_NOTES, PARSHA_NOTE, FAST_NOTE, chabadDaysOn, STUDY, OMER_BRACHA } from '/luach/data.js?v=ec428d70ab';

/* ======================================================================
   helpers
   ====================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const MIN = 60000, DAY = 86400000;
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };
const lsJSON = (k, fb) => { try { const v = JSON.parse(lsGet(k)); return v == null ? fb : v; } catch (e) { return fb; } };
const lsSetJSON = (k, v) => lsSet(k, v == null ? null : JSON.stringify(v));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const deviceTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } })();
const validTz = (tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch (e) { return false; } };
const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
let reduce = mqReduce.matches;
if (mqReduce.addEventListener) mqReduce.addEventListener('change', (e) => { reduce = e.matches; });

const KEY = {
  loc: 'szv-time-loc', h24: 'szv-time-24h', candle: 'szv-time-candle', ends: 'szv-time-shabbos-ends',
  prefs: 'szv-luach-prefs', study: 'szv-luach-study', omer: 'szv-luach-omer', z: 'szv-luach-z:',
};
const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Shabbos'];
const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Shabbos'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const gregLabel = (abs, opt = {}) => {
  const g = L.absToGreg(abs);
  const wd = opt.wd === false ? '' : (opt.long ? WD_LONG : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])[g.wd] + ', ';
  return `${wd}${(opt.long ? MON_LONG : MON)[g.m - 1]} ${g.d}${opt.year === false ? '' : ', ' + g.y}`;
};
const hebLabel = (abs, withYear = true) => L.hebrewDateEn(L.absToHebrew(abs), withYear);

const fmtCache = new Map();
function fmtFor(tz, key, opts) {
  const k = tz + '|' + key;
  let f = fmtCache.get(k);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }); fmtCache.set(k, f); }
  return f;
}
function partsIn(date, tz) {
  const p = {};
  for (const { type, value } of fmtFor(tz, 'parts', { hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date)) p[type] = value;
  return { y: +p.year, m: +p.month, d: +p.day, H: +p.hour % 24, M: +p.minute, S: +p.second };
}
function tzOffset(ms, tz) {
  const p = partsIn(new Date(ms), tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.H, p.M, p.S) - Math.floor(ms / 1000) * 1000;
}
// wall-clock minutes after local midnight of a civil date in tz -> Date (DST-safe)
function zonedTime(g, minutes, tz) {
  const guess = Date.UTC(g.y, g.m - 1, g.d, 0, minutes);
  let t = guess - tzOffset(guess, tz);
  const o2 = tzOffset(t, tz);
  if (guess - o2 !== t) t = guess - o2;
  return new Date(t);
}
const h24 = () => lsGet(KEY.h24) === '1';
function hm(date, tz) {
  const H24 = h24();
  const p = {};
  for (const { type, value } of fmtFor(tz, 'hm' + H24, { hour: 'numeric', minute: '2-digit', hourCycle: H24 ? 'h23' : 'h12' }).formatToParts(date)) p[type] = value;
  const hh = H24 ? String(p.hour).padStart(2, '0') : p.hour;
  return { t: `${hh}:${p.minute}`, ap: H24 ? '' : (p.dayPeriod || '').toUpperCase() };
}
const hmText = (date, tz) => { const x = hm(date, tz); return x.ap ? `${x.t} ${x.ap}` : x.t; };
const hmShort = (date, tz) => hm(date, tz).t;

let toastT = 0;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 2200);
}
const buzz = (ms = 10) => { if (!reduce && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} };

/* ======================================================================
   clock: light /api/now sync (date roll-over and sunset only need ~1 s)
   ====================================================================== */
let offset = 0;
const qs = (() => { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(); } })();
const debugNow = Date.parse(qs.get('now') || '');
if (Number.isFinite(debugNow)) offset = debugNow - Date.now();
const now = () => new Date(Date.now() + offset);
async function syncClock() {
  if (Number.isFinite(debugNow)) return;
  const got = [];
  for (let i = 0; i < 3; i++) {
    try {
      const ctl = new AbortController();
      const kill = setTimeout(() => ctl.abort(), 2500);
      const d0 = Date.now(), p0 = performance.now();
      const r = await fetch('/api/now?r=' + Math.random().toString(36).slice(2), { cache: 'no-store', signal: ctl.signal });
      const p1 = performance.now();
      clearTimeout(kill);
      if (!r.ok) break;
      const j = await r.json();
      if (!Number.isFinite(j && j.t)) break;
      got.push({ rtt: p1 - p0, off: j.t + 0.5 - (d0 + (p1 - p0) / 2) });
    } catch (e) { break; }
  }
  if (!got.length) return;
  got.sort((a, b) => a.rtt - b.rtt);
  const prev = offset;
  offset = got[0].off;
  if (Math.abs(offset - prev) > 30000) refreshAll();
}

/* ======================================================================
   state & prefs
   ====================================================================== */
const prefs = Object.assign({ mode: 'heb', il: null, chabad: true, daf: false, rambam: 3, bracha: false, remind: false, cv: 'g2h', akind: 'birthday', asrc: 'greg', an: 10 }, lsJSON(KEY.prefs, {}));
const savePrefs = () => lsSetJSON(KEY.prefs, prefs);
const state = { loc: null, il: false, cursor: null, sel: null, todayAbs: 0 };

/* ======================================================================
   location (shared with /time via localStorage 'szv-time-loc')
   ====================================================================== */
const tzCity = (tz) => (tz.split('/').pop() || tz).replace(/_/g, ' ');
const fromCity = (c) => ({ ...c, kind: 'city' });
function slim(loc) {
  if (loc.kind === 'city') return { kind: 'city', id: loc.id };
  const o = { kind: loc.kind, id: loc.id, name: loc.name, country: loc.country, tz: loc.tz };
  if (loc.lat != null) { o.lat = loc.lat; o.lon = loc.lon; }
  if (loc.zip) { o.zip = loc.zip; o.tzAuto = !!loc.tzAuto; }
  return o;
}
function revive(o) {
  if (!o || typeof o !== 'object') return null;
  if (o.kind === 'city' || (!o.kind && o.id)) { const c = cityById(o.id); return c ? fromCity(c) : null; }
  if (!o.tz || !validTz(o.tz)) return null;
  if (o.kind === 'zip' && !/^\d{5}$/.test(o.zip || '')) return null;
  if ((o.kind === 'here' || o.kind === 'custom') && !(isFinite(o.lat) && isFinite(o.lon))) return null;
  return { ...o, name: String(o.name || '').slice(0, 60), country: String(o.country || '').slice(0, 60) };
}
function zipLoc(zip, name) {
  const tz = zipToTz(zip) || deviceTz;
  return { kind: 'zip', id: 'zip-' + zip, zip, tz, tzAuto: true, name: name || 'ZIP ' + zip, country: 'United States' };
}
function locFromURL() {
  const city = qs.get('city');
  if (city) { const c = cityById(city.toLowerCase()); if (c) return fromCity(c); }
  const zip = qs.get('zip');
  if (zip && /^\d{5}$/.test(zip)) return zipLoc(zip);
  return null;
}
const hasCoords = (l) => l && l.lat != null && isFinite(l.lat) && isFinite(l.lon);
const apiQuery = (l) => l.zip ? `zip=${l.zip}` : l.chabadCityId ? `cityid=${l.chabadCityId}` : null;
const locLabel = (l) => l.kind === 'zip' ? l.name.split(',')[0] : l.name;

function setLocation(loc, persist) {
  state.loc = loc;
  if (persist) lsSetJSON(KEY.loc, slim(loc));
  $('#locName').textContent = locLabel(loc);
  state.il = prefs.il == null ? loc.tz === 'Asia/Jerusalem' : !!prefs.il;
  zm.clear();
  evCache.clear();
  syncOptButtons();
  refreshAll();
}

/* ======================================================================
   hebcal events
   ====================================================================== */
const HC = () => window.hebcal || null;
const hcReady = new Promise((res) => {
  if (HC()) return res(HC());
  const s = document.getElementById('hebcalJs');
  const done = () => res(HC());
  if (s) { s.addEventListener('load', done); s.addEventListener('error', done); }
  setTimeout(done, 8000);
});
const evCache = new Map(); // abs -> [ev]
const NOTE_FOR = (base, kind) => {
  if (kind === 'parsha') return PARSHA_NOTE;
  if (kind === 'rc') return HOLIDAY_NOTES['Rosh Chodesh'];
  if (kind === 'mevarchim') return HOLIDAY_NOTES['Shabbat Mevarchim'];
  return HOLIDAY_NOTES[base] || (kind === 'fast' ? FAST_NOTE : '');
};
const RANK = { chag: 0, fast: 1, cholhamoed: 2, erev: 3, rc: 4, minor: 5, special: 6, chabad: 7, mevarchim: 8, parsha: 9 };
function classify(F, flags) {
  if (flags & F.PARSHA_HASHAVUA) return 'parsha';
  if (flags & F.SHABBAT_MEVARCHIM) return 'mevarchim';
  if (flags & F.ROSH_CHODESH) return 'rc';
  if (flags & F.CHAG) return 'chag';
  if (flags & (F.MAJOR_FAST | F.MINOR_FAST)) return 'fast';
  if (flags & F.CHOL_HAMOED) return 'cholhamoed';
  if (flags & F.EREV) return 'erev';
  if (flags & F.SPECIAL_SHABBAT) return 'special';
  return 'minor';
}
function computeEvents(start, end) {
  const H = HC();
  const out = new Map();
  for (let a = start; a <= end; a++) out.set(a, []);
  if (H) {
    try {
      const evs = H.HebrewCalendar.calendar({ start: new H.HDate(start), end: new H.HDate(end), il: state.il, sedrot: true, noModern: true, shabbatMevarchim: true, locale: 'ashkenazi' });
      const F = H.flags;
      for (const e of evs) {
        const base = e.basename ? e.basename() : e.getDesc();
        if (base === 'Chag HaBanot') continue;
        const flags = e.getFlags();
        const abs = e.getDate().abs();
        if (!out.has(abs)) continue;
        const kind = classify(F, flags);
        let title = e.render('ashkenazi');
        if (kind === 'mevarchim') title = title.replace(/^Shabbos Mevorchim Chodesh|^Shabbat Mevarchim Chodesh/, 'Shabbos Mevarchim');
        let he = '';
        try { he = e.render('he-x-NoNikud'); } catch (x) {}
        out.get(abs).push({ kind, title, he, base, flags, note: NOTE_FOR(base, kind), mevMonth: kind === 'mevarchim' ? e.monthName || '' : '' });
      }
    } catch (e) { /* library mismatch: dates still work */ }
  }
  if (prefs.chabad) {
    for (let a = start; a <= end; a++) {
      const h = L.absToHebrew(a);
      for (const c of chabadDaysOn(h.m, h.d)) out.get(a).push({ kind: 'chabad', title: c.title, he: '', base: c.title, flags: 0, note: c.note });
    }
  }
  for (const [a, list] of out) { list.sort((x, y) => RANK[x.kind] - RANK[y.kind]); evCache.set(a, list); }
}
function eventsOn(abs) {
  if (!evCache.has(abs)) computeEvents(abs - 20, abs + 40);
  return evCache.get(abs) || [];
}
function ensureEvents(start, end) {
  let missing = false;
  for (let a = start; a <= end && !missing; a++) if (!evCache.has(a)) missing = true;
  if (missing) computeEvents(start, end);
}
const hasFlag = (abs, name) => { const H = HC(); if (!H) return false; const f = H.flags[name]; return eventsOn(abs).some((e) => e.flags & f); };
function parshaFor(abs) {
  // the Shabbos on or after abs
  const sat = abs + ((6 - L.weekday(abs) + 7) % 7);
  const evs = eventsOn(sat);
  const p = evs.find((e) => e.kind === 'parsha');
  if (p) return p.title;
  const chag = evs.find((e) => e.kind === 'chag' || e.kind === 'cholhamoed');
  return chag ? chag.title : '';
}

/* ======================================================================
   zmanim: Chabad.org via /api/zmanim, else local calculation
   ====================================================================== */
let Z = null;
const zReady = import('/time/zmanim.js?v=93be04f7f2').then((m) => { Z = m; return m; }).catch(() => null);
const zm = new Map(); // ymd -> { src, items: [{ key, label, at, after }] }
const inflight = new Map();
const LABEL = {
  alos: 'Alos Hashachar', misheyakir: 'Misheyakir', sunrise: 'Netz', sofZmanShma: 'Sof Zman Shema', sofZmanTefila: 'Sof Zman Tefillah',
  chatzos: 'Chatzos', minchaGedola: 'Mincha Gedolah', minchaKetana: 'Mincha Ketanah', plagHamincha: 'Plag Hamincha', sunset: 'Shkiah',
  tzeis: 'Tzeis', candleLighting: 'Candle lighting', shabbosEnds: 'Shabbos ends', holidayEnds: 'Yom Tov ends', fastBegins: 'Fast begins', fastEnds: 'Fast ends',
};
const SHOW = ['fastBegins', 'alos', 'sunrise', 'sofZmanShma', 'sofZmanTefila', 'chatzos', 'minchaGedola', 'plagHamincha', 'candleLighting', 'sunset', 'tzeis', 'shabbosEnds', 'holidayEnds', 'fastEnds'];
const SPECIAL = new Set(['candleLighting', 'shabbosEnds', 'holidayEnds', 'fastBegins', 'fastEnds']);
const CANDLE_OPTIONS = [18, 20, 22, 30, 40];
function candleMin(loc) { const m = lsJSON(KEY.candle, {}); const v = m && m[loc.id]; return CANDLE_OPTIONS.includes(v) ? v : (loc.candleMinutes || 18); }
function candleOverride(loc) { const m = lsJSON(KEY.candle, {}); const v = m && m[loc.id]; return CANDLE_OPTIONS.includes(v) ? v : null; }
function endsPref() { const v = lsGet(KEY.ends); return ['42', '50', '72'].includes(v) ? v : 'deg'; }

function calcDay(abs) {
  const loc = state.loc;
  if (!Z || !hasCoords(loc)) return null;
  const g = L.absToGreg(abs);
  const ymd = { y: g.y, m: g.m, d: g.d };
  const zloc = { lat: loc.lat, lon: loc.lon, tz: loc.tz };
  const ends = endsPref();
  const opts = { candleMinutes: candleMin(loc) };
  if (ends !== 'deg') opts.shabbosEnds = { type: 'minutes', value: +ends };
  let z;
  try { z = Z.zmanim(ymd, zloc, opts); } catch (e) { return null; }
  const r = (d, k) => (d ? (Z.roundZman ? Z.roundZman(d, k) : d) : null);
  const items = [];
  const add = (key, at, extra) => { if (at) items.push({ key, label: LABEL[key], at: r(at, key), ...(extra || {}) }); };
  for (const k of ['alos', 'sunrise', 'sofZmanShma', 'sofZmanTefila', 'chatzos', 'minchaGedola', 'plagHamincha', 'sunset', 'tzeis', 'candleLighting', 'shabbosEnds']) add(k, z[k]);
  const late = () => { try { return ends === 'deg' ? Z.zmanim(ymd, zloc, { tzeisDegrees: 8.5 }).tzeis : z.sunset && new Date(+z.sunset + +ends * MIN); } catch (e) { return null; } };
  const wd = L.weekday(abs);
  if (wd !== 5 && hasFlag(abs, 'LIGHT_CANDLES') && z.sunset) add('candleLighting', new Date(+z.sunset - candleMin(loc) * MIN));
  if (hasFlag(abs, 'LIGHT_CANDLES_TZEIS')) {
    if (wd === 6) { const se = items.find((i) => i.key === 'shabbosEnds'); if (se) { se.key = 'candleLighting'; se.after = true; se.label = 'Candle lighting (not before)'; } }
    else add('candleLighting', late(), { after: true, label: 'Candle lighting (not before)' });
  }
  if (hasFlag(abs, 'YOM_TOV_ENDS') && wd !== 6) add('holidayEnds', late());
  const evs = eventsOn(abs);
  if (evs.some((e) => e.kind === 'fast' && e.flags & HC().flags.MINOR_FAST)) { add('fastBegins', z.alos); add('fastEnds', z.tzeis); }
  if (evs.some((e) => e.base === "Tish'a B'Av" && e.kind === 'fast')) add('fastEnds', z.tzeis);
  if (evs.some((e) => e.base === "Tish'a B'Av" && e.kind === 'erev')) add('fastBegins', z.sunset);
  items.sort((a, b) => a.at - b.at);
  return { src: 'calc', items };
}
function fromApiDay(day, loc) {
  const g = L.parseYMD(day.date);
  const cOver = candleOverride(loc), ends = endsPref();
  const items = [];
  for (const it of day.items || []) {
    if (!it || it.key === 'other' || it.minutes == null || !LABEL[it.key]) continue;
    const min = it.minutes + (it.nextDay ? 1440 : 0);
    items.push({ key: it.key, label: it.after ? 'Candle lighting (not before)' : LABEL[it.key], at: zonedTime(g, min, loc.tz), after: !!it.after });
    for (const k of it.also || []) if (LABEL[k] && k !== it.key) items.push({ key: k, label: LABEL[k], at: zonedTime(g, min, loc.tz) });
  }
  const sunset = items.find((i) => i.key === 'sunset');
  if (sunset) for (const i of items) {
    if (i.key === 'candleLighting' && !i.after && cOver) i.at = new Date(+sunset.at - cOver * MIN);
    if (i.key === 'shabbosEnds' && ends !== 'deg') i.at = new Date(+sunset.at + +ends * MIN);
  }
  items.sort((a, b) => a.at - b.at);
  return { src: 'chabad', items };
}
const validDay = (d) => d && /^\d{4}-\d\d-\d\d$/.test(d.date) && Array.isArray(d.items);
function pruneZ(keepFrom) {
  try {
    const dead = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(KEY.z) && k.slice(-10) < keepFrom) dead.push(k);
    }
    dead.forEach((k) => localStorage.removeItem(k));
  } catch (e) {}
}
const apiRange = (abs) => { const t = state.todayAbs; return abs >= t - 1 && abs <= t + 395; };
let zSeq = 0;
/** Make sure zmanim exist for these days; calls onUpdate() when better data arrives. */
async function loadZm(absList, onUpdate) {
  const loc = state.loc, seq = zSeq;
  await zReady;
  if (seq !== zSeq || loc !== state.loc) return;
  const q = apiQuery(loc);
  const need = [];
  for (const abs of [...new Set(absList)].sort((a, b) => a - b)) {
    const ymd = L.absToYMD(abs);
    const have = zm.get(ymd);
    if (have && have.src === 'chabad') continue;
    if (q && apiRange(abs)) {
      const cached = lsJSON(`${KEY.z}${q}:${ymd}`, null);
      if (validDay(cached) && cached.date === ymd) { zm.set(ymd, fromApiDay(cached, loc)); continue; }
      need.push(abs);
    }
    if (!have) { const c = calcDay(abs); if (c) zm.set(ymd, c); }
  }
  if (onUpdate) onUpdate();
  if (!need.length) return;
  // runs of consecutive days, max 3 per request
  const runs = [];
  for (const a of need) {
    const last = runs[runs.length - 1];
    if (last && a === last[0] + last.length && last.length < 3) last.push(a); else runs.push([a]);
  }
  let i = 0;
  const worker = async () => {
    while (i < runs.length) {
      const run = runs[i++];
      const start = L.absToYMD(run[0]);
      const key = `${q}:${start}:${run.length}`;
      let p = inflight.get(key);
      if (!p) {
        p = fetch(`/api/zmanim?${q}&date=${start}&days=${run.length}`, { headers: { accept: 'application/json' } })
          .then((r) => (r.ok ? r.json() : null)).catch(() => null);
        inflight.set(key, p);
        p.finally(() => setTimeout(() => inflight.delete(key), 1000));
      }
      const j = await p;
      if (seq !== zSeq || loc !== state.loc) return;
      if (j && j.source === 'chabad.org' && Array.isArray(j.days)) {
        for (const d of j.days) {
          if (!validDay(d)) continue;
          lsSetJSON(`${KEY.z}${q}:${d.date}`, { date: d.date, items: d.items });
          zm.set(d.date, fromApiDay(d, loc));
        }
        if (onUpdate) onUpdate();
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  pruneZ(L.absToYMD(state.todayAbs - 3));
}
const zOf = (abs) => zm.get(L.absToYMD(abs)) || null;
const zItem = (abs, key, pred) => { const z = zOf(abs); return z ? z.items.find((i) => i.key === key && (!pred || pred(i))) || null : null; };

/* ======================================================================
   today
   ====================================================================== */
function civilToday() { const p = partsIn(now(), state.loc.tz); return L.gregToAbs(p.y, p.m, p.d); }
function afterSunset() {
  const ss = zItem(state.todayAbs, 'sunset');
  return !!(ss && +now() >= +ss.at);
}
const dayKinds = (abs) => eventsOn(abs).map((e) => e.kind);
function dayTitleList(abs) { return eventsOn(abs).filter((e) => e.kind !== 'parsha' && e.kind !== 'mevarchim'); }

function renderToday() {
  const t = state.todayAbs, tz = state.loc.tz;
  const after = afterSunset();
  const habs = after ? t + 1 : t;
  const h = L.absToHebrew(habs);
  const g = L.absToGreg(t);
  $('#tGreg').textContent = `${WD_LONG[g.wd]}${after ? ' night' : ''} · ${MON_LONG[g.m - 1]} ${g.d}, ${g.y}`;
  $('#tHeb').innerHTML = `<span class="dnum">${h.d} ${esc(L.monthName(h.m, h.y))}</span><span class="yr">${h.y}</span>`;
  $('#tHeb').classList.toggle('long', `${h.d} ${L.monthName(h.m, h.y)}`.length > 11); // e.g. "29 Menachem Av": smaller type on desktop
  $('#tHe').textContent = L.hebrewDateHe(h);
  const ss = zItem(t, 'sunset');
  const roll = $('#tRoll');
  if (after) roll.innerHTML = `Since sunset (${esc(hmText(ss.at, tz))}) · daytime was ${esc(hebLabel(t, false))}`;
  else if (ss) roll.innerHTML = `At sunset <b>${esc(hmText(ss.at, tz))}</b> it becomes ${esc(hebLabel(t + 1, false))}`;
  else roll.textContent = '';
  // tags
  const tags = [];
  for (const e of dayTitleList(habs)) tags.push(`<li class="${e.kind}">${esc(e.title)}</li>`);
  const p = parshaFor(habs);
  if (p) tags.push(`<li>${esc(p.startsWith('Parshas') ? p : p)}${L.weekday(habs) === 6 ? '' : ' · this week'}</li>`);
  const om = L.omerDay(h);
  if (om) tags.push(`<li class="rc">Omer · day ${om}</li>`);
  if (prefs.daf) { const d = L.dafYomi(habs); if (d) tags.push(`<li>Daf Yomi · ${esc(d.masechta)} ${d.daf}</li>`); }
  $('#tTags').innerHTML = tags.join('');
  renderShabbos();
  renderOmer();
  renderNext();
  renderStudy();
}

function renderShabbos() {
  const t = state.todayAbs, tz = state.loc.tz, card = $('#cShabbos');
  const n = now();
  // find the next candle lighting (not "after") and its end, within 9 days
  let candle = null, cAbs = 0;
  for (let a = t; a <= t + 8 && !candle; a++) {
    const c = zItem(a, 'candleLighting', (i) => !i.after);
    if (c && +c.at > +n - 0) { candle = c; cAbs = a; }
  }
  // are we inside Shabbos / Yom Tov right now? (ends today and candle lighting already passed)
  let inside = null;
  const endT = zItem(t, 'shabbosEnds') || zItem(t, 'holidayEnds');
  if (endT && +endT.at > +n && (L.weekday(t) === 6 || hasFlag(t, 'CHAG'))) inside = { end: endT, abs: t };
  const yC = zItem(t, 'candleLighting', (i) => !i.after);
  if (yC && +yC.at <= +n) { // lit already tonight: find the end
    for (let a = t + 1; a <= t + 3; a++) { const e = zItem(a, 'shabbosEnds') || zItem(a, 'holidayEnds'); if (e) { inside = { end: e, abs: a }; break; } }
  }
  if (!candle && !inside) { card.hidden = true; return; }
  card.hidden = false;
  let html, target;
  if (inside) {
    const evs = eventsOn(inside.abs);
    const nm = L.weekday(inside.abs) === 6 ? 'Shabbos' : (evs.find((e) => e.kind === 'chag') || {}).title || 'Yom Tov';
    const ends = inside.end;
    target = inside.abs;
    html = `<div class="c-head"><span class="c-kicker">Gut Shabbos · in progress</span><span class="c-big">${esc(nm)}</span></div>
      <div class="sh-times"><div class="sh-t light"><small>${esc(ends.label)}</small><b>${tparts(ends.at, tz)}</b><em>${esc(gregLabel(inside.abs, { year: false }))}</em></div>
      <div class="sh-t"><small>In</small><b>${esc(untilText(+ends.at - +n))}</b></div></div>`;
  } else {
    target = cAbs;
    // what is being ushered in
    const nextDay = cAbs + 1;
    const isShab = L.weekday(cAbs) === 5;
    const chag = eventsOn(nextDay).find((e) => e.kind === 'chag');
    const name = isShab ? (parshaFor(nextDay) ? `Shabbos ${parshaFor(nextDay).replace(/^Parshas /, '')}` : 'Shabbos') : (chag ? chag.title : 'Yom Tov');
    let end = null, eAbs = 0;
    for (let a = nextDay; a <= nextDay + 2; a++) { const e = zItem(a, 'shabbosEnds') || zItem(a, 'holidayEnds'); if (e) { end = e; eAbs = a; break; } }
    const dd = cAbs - state.todayAbs;
    const when = dd === 0 ? 'Today' : dd === 1 ? 'Tomorrow' : WD_LONG[L.weekday(cAbs)];
    html = `<div class="c-head"><span class="c-kicker">${isShab ? 'This Shabbos' : 'Yom Tov'}</span><span class="c-big">${esc(name)}</span></div>
      <div class="sh-times"><div class="sh-t light"><small>Candle lighting</small><b>${tparts(candle.at, tz)}</b><em>${esc(when)} · ${esc(gregLabel(cAbs, { wd: false, year: false }))}</em></div>
      ${end ? `<div class="sh-t"><small>${esc(end.label.replace(' / Yom Tov', ''))}</small><b>${tparts(end.at, tz)}</b><em>${esc(WD_LONG[L.weekday(eAbs)])} · ${esc(gregLabel(eAbs, { wd: false, year: false }))}</em></div>` : ''}</div>`;
  }
  const src = zOf(target);
  html += `<span class="sh-src">${src && src.src === 'chabad' ? 'Chabad.org times' : 'Calculated (Chabad.org method)'} · ${esc(locLabel(state.loc))} · ${candleMin(state.loc)} min candle lighting</span>`;
  card.innerHTML = html;
  card.dataset.abs = target;
}
function tparts(date, tz) { const x = hm(date, tz); return `${esc(x.t)}${x.ap ? `<small>${x.ap}</small>` : ''}`; }
function untilText(ms) {
  const m = Math.max(0, Math.round(ms / MIN));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return `${h}h ${String(r).padStart(2, '0')}m`;
}

function renderNext() {
  const t = state.todayAbs, list = [];
  ensureEvents(t + 1, t + 400);
  const seen = new Set();
  for (let a = t + 1; a <= t + 400 && list.length < 4; a++) {
    for (const e of eventsOn(a)) {
      if (!['chag', 'minor', 'fast', 'chabad', 'rc'].includes(e.kind)) continue;
      // one entry per holiday (e.g. Chanukah, two days of Rosh Chodesh)
      const fam = e.kind === 'rc' ? e.title : e.base;
      if (seen.has(fam)) continue;
      seen.add(fam);
      list.push({ a, e });
      if (list.length >= 4) break;
    }
  }
  $('#nextList').innerHTML = list.map(({ a, e }) => {
    const dd = a - t;
    const title = e.kind === 'chag' || e.kind === 'minor' ? e.title.replace(/:\s*\d+ Candles?$/, '').replace(/ I$/, '') : e.title;
    return `<li><button type="button" data-abs="${a}"><i class="d ${e.kind}"></i><span class="nm"><b>${esc(title)}</b><small>${esc(gregLabel(a, { year: false }))} · ${esc(hebLabel(a, false))}</small></span><span class="in">${dd === 1 ? '<b>tomorrow</b>' : `in <b>${dd}</b> days`}</span></button></li>`;
  }).join('') || '<li><small>Calendar library unavailable offline</small></li>';
}

/* ---------- Omer ---------- */
const omerState = () => lsJSON(KEY.omer, {}) || {};
function omerInfo() {
  const t = state.todayAbs;
  const after = afterSunset();
  const habs = after ? t + 1 : t;
  const today = L.omerDay(L.absToHebrew(habs));          // count already in effect
  const tonight = after ? today : L.omerDay(L.absToHebrew(t + 1)); // count to say tonight
  return { habs, today: after ? 0 : today, tonight, after };
}
function renderOmer() {
  const card = $('#cOmer');
  const { tonight, today, after } = omerInfo();
  if (!tonight && !today) { card.hidden = true; scheduleOmer(); return; }
  card.hidden = false;
  const n = tonight || today;
  const H = HC();
  const tz = state.loc.tz;
  const tzeis = zItem(state.todayAbs, 'tzeis');
  const os = omerState();
  const counted = os.counted === L.absToYMD(state.todayAbs) && tonight;
  $('#omerTitle').textContent = tonight ? `Tonight: day ${tonight}` : `Today is day ${today}`;
  $('#omerLine').textContent = L.omerSentence(n);
  let sef = '', heCount = '';
  if (H) {
    try {
      const ev = new H.OmerEvent(new H.HDate(state.todayAbs + (tonight ? 1 : 0)), n);
      sef = ev.sefira('translit');
      heCount = ev.getTodayIs('he');
    } catch (e) {}
  }
  $('#omerSefira').textContent = sef ? `${sef}` : '';
  const br = $('#omerBracha');
  br.hidden = !prefs.bracha;
  if (prefs.bracha) br.innerHTML = `<p>${esc(OMER_BRACHA)}</p>${heCount ? `<p>${esc(heCount)}</p>` : ''}`;
  $('#omerBrachaBtn').setAttribute('aria-pressed', String(!!prefs.bracha));
  $('#omerRemindBtn').setAttribute('aria-pressed', String(!!prefs.remind));
  const done = $('#omerDoneBtn');
  done.hidden = !tonight;
  done.setAttribute('aria-pressed', String(!!counted));
  done.textContent = counted ? 'Counted tonight' : 'Mark counted';
  let note = '';
  if (tonight && !after && tzeis) note = `Count tonight after nightfall (${hmText(tzeis.at, tz)}). If you forget, count tomorrow without a bracha.`;
  else if (tonight) note = 'Count with a bracha tonight after nightfall.';
  if (prefs.remind) note += ` Reminder on${'Notification' in window && Notification.permission === 'granted' ? '' : ' (allow notifications)'} — works while this page stays open.`;
  $('#omerNote').textContent = note;
  scheduleOmer();
}
let omerTimer = 0;
async function getSWReg() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register('/luach/sw.js', { scope: '/luach/' }); } catch (e) { return null; }
}
async function notify(title, body) {
  try {
    const reg = await getSWReg();
    if (reg && reg.showNotification) { await reg.showNotification(title, { body, tag: 'luach-omer', icon: undefined }); return true; }
  } catch (e) {}
  try { new Notification(title, { body, tag: 'luach-omer' }); return true; } catch (e) { return false; }
}
function scheduleOmer() {
  clearTimeout(omerTimer);
  if (!prefs.remind || !('Notification' in window) || Notification.permission !== 'granted') return;
  const { tonight } = omerInfo();
  if (!tonight) return;
  const tzeis = zItem(state.todayAbs, 'tzeis');
  if (!tzeis) return;
  const today = L.absToYMD(state.todayAbs);
  const os = omerState();
  if (os.notified === today || os.counted === today) return;
  const ms = +tzeis.at - +now();
  const fire = () => {
    const o = omerState();
    if (o.notified === today || o.counted === today) return;
    lsSetJSON(KEY.omer, { ...o, notified: today });
    notify(`Sefiras HaOmer: day ${tonight}`, L.omerSentence(tonight));
  };
  if (ms <= 0) { if (ms > -4 * 3600000) fire(); return; }
  omerTimer = setTimeout(fire, Math.min(ms, 2 ** 31 - 1));
}

/* ---------- study ---------- */
const doneMap = () => { const d = lsJSON(KEY.study, {}); return d && typeof d === 'object' ? d : {}; };
const studyItems = () => STUDY.filter((s) => (s.id === 'mitzvos' ? prefs.rambam === 1 : true));
const tdateOf = (abs) => { const g = L.absToGreg(abs); return `${g.m}/${g.d}/${g.y}`; };
const EXT = '<svg class="ext" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1h6v6M9 1L1 9"/></svg>';
const CHECK = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7"/></svg>';
function studySub(s, abs) {
  const h = L.absToHebrew(abs);
  if (s.id === 'chumash') { const p = parshaFor(abs); return `${p ? p.replace(/^Parshas /, '') + ' · ' : ''}${L.ALIYOS[L.weekday(abs)]}`; }
  if (s.id === 'tehillim') return `Psalms ${L.tehillimFor(h.d, L.daysInMonth(h.m, h.y))}`;
  if (s.id === 'rambam') return prefs.rambam === 1 ? '1 chapter' : '3 chapters';
  if (s.id === 'hayomyom') return `${h.d} ${L.monthName(h.m, h.y, true)}`;
  return s.sub;
}
function renderStudy() {
  const t = state.todayAbs, ymd = L.absToYMD(t), d = doneMap()[ymd] || [];
  const items = studyItems();
  $('#studyGrid').innerHTML = items.map((s) => {
    const on = d.includes(s.id);
    return `<li class="s-card${on ? ' done' : ''}" data-id="${s.id}">
      <a href="${esc(s.url(tdateOf(t), prefs.rambam))}" target="_blank" rel="noopener noreferrer"><span class="s-nm">${esc(s.name)} <span lang="he">${esc(s.he)}</span></span><span class="s-sub">${esc(studySub(s, t))}${EXT}</span></a>
      <button type="button" class="s-check" aria-pressed="${on}" aria-label="${esc(s.name)} done today"><span>${CHECK}</span></button></li>`;
  }).join('');
  const st = L.streakOf(doneMap(), ymd, items.map((s) => s.id));
  const el = $('#streak');
  el.classList.toggle('lit', st.todayDone);
  const flame = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1c.5 2.6 3.8 4 3.8 8a3.8 3.8 0 0 1-7.6 0c0-1.7.8-2.8 1.8-3.6-.1 1.3.4 2.2 1.2 2.6C7 5.6 7.6 3.4 8 1z"/></svg>';
  const cnt = d.filter((x) => items.some((s) => s.id === x)).length;
  el.innerHTML = `${flame}<b>${st.streak}</b> day${st.streak === 1 ? '' : 's'} · ${cnt}/${items.length} today${st.best > st.streak ? ` · best ${st.best}` : ''}`;
  $$('[data-ram]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.ram === prefs.rambam)));
}
$('#studyGrid').addEventListener('click', (e) => {
  const b = e.target.closest('.s-check');
  if (!b) return;
  const card = b.closest('.s-card'), id = card.dataset.id;
  const ymd = L.absToYMD(state.todayAbs);
  const all = doneMap();
  const cur = new Set(all[ymd] || []);
  if (cur.has(id)) cur.delete(id); else { cur.add(id); buzz(12); }
  all[ymd] = [...cur];
  lsSetJSON(KEY.study, L.pruneDone(all, ymd));
  renderStudy();
  const nc = $(`.s-card[data-id="${id}"]`);
  if (nc && cur.has(id)) { nc.classList.add('pop'); setTimeout(() => nc.classList.remove('pop'), 260); }
  const items = studyItems();
  if (items.every((s) => cur.has(s.id)) && cur.has(id)) toast('All done for today — yasher koach!');
});
$$('[data-ram]').forEach((b) => b.addEventListener('click', () => { prefs.rambam = +b.dataset.ram; savePrefs(); renderStudy(); }));

/* ======================================================================
   month grid
   ====================================================================== */
const grid = $('#grid');
function cursorRange() { return L.monthRange(prefs.mode, state.cursor.y, state.cursor.m); }
function cursorForAbs(abs) {
  if (prefs.mode === 'heb') { const h = L.absToHebrew(abs); return { y: h.y, m: h.m }; }
  const g = L.absToGreg(abs); return { y: g.y, m: g.m };
}
function timesForCell(abs) {
  const out = [];
  const c = zItem(abs, 'candleLighting');
  if (c) out.push({ c: true, at: c.at, after: c.after });
  const e = zItem(abs, 'shabbosEnds') || zItem(abs, 'holidayEnds');
  if (e) out.push({ c: false, at: e.at });
  return out;
}
function needsTimes(abs) {
  const wd = L.weekday(abs);
  if (wd === 5 || wd === 6) return true;
  return eventsOn(abs).some((e) => e.kind === 'chag' || e.kind === 'fast' || (e.kind === 'erev' && HC() && e.flags & HC().flags.LIGHT_CANDLES));
}
function renderMonth(anim) {
  const { start, end } = cursorRange();
  const gStart = start - L.weekday(start), gEnd = end + (6 - L.weekday(end));
  ensureEvents(gStart - 1, gEnd + 1);
  const tz = state.loc.tz;
  // title
  const hs = L.absToHebrew(start), he = L.absToHebrew(end), gs = L.absToGreg(start), ge = L.absToGreg(end);
  if (prefs.mode === 'heb') {
    $('#mTitle').innerHTML = `${esc(L.monthName(hs.m, hs.y))} ${hs.y}<span class="he" lang="he">${esc(L.monthNameHe(hs.m, hs.y))}</span>`;
    $('#mSub').textContent = gs.y === ge.y ? `${MON[gs.m - 1]} – ${MON[ge.m - 1]} ${ge.y}` : `${MON[gs.m - 1]} ${gs.y} – ${MON[ge.m - 1]} ${ge.y}`;
  } else {
    $('#mTitle').textContent = `${MON_LONG[gs.m - 1]} ${gs.y}`;
    $('#mSub').textContent = hs.m === he.m ? `${L.monthName(hs.m, hs.y)} ${hs.y}` : `${L.monthName(hs.m, hs.y, true)} – ${L.monthName(he.m, he.y, true)} ${he.y}`;
  }
  let html = '';
  for (let a = gStart; a <= gEnd; a++) {
    const g = L.absToGreg(a), h = L.absToHebrew(a);
    const evs = eventsOn(a);
    const kinds = new Set(evs.map((e) => e.kind));
    const cls = ['day'];
    if (a < start || a > end) cls.push('out');
    if (g.wd === 6) cls.push('sat');
    for (const k of ['chag', 'rc', 'fast']) if (kinds.has(k)) cls.push(k);
    if (a === state.todayAbs) cls.push('today');
    if (a === state.sel) cls.push('sel');
    const main = prefs.mode === 'heb' ? `<span class="n" lang="he">${L.gematriya(h.d)}</span>` : `<span class="n">${g.d}</span>`;
    const sec = prefs.mode === 'heb'
      ? `<span class="s">${g.d === 1 || a === gStart ? MON[g.m - 1] + ' ' : ''}${g.d}</span>`
      : `<span class="s" lang="he">${h.d === 1 || a === gStart ? esc(L.monthNameHe(h.m, h.y).split(' ').pop()) + ' ' : ''}${L.gematriya(h.d)}</span>`;
    const lbls = evs.filter((e) => e.kind !== 'mevarchim').slice(0, 3).map((e) => `<span class="${e.kind === 'parsha' ? 'p' : e.kind}">${esc(e.title.replace(/^Parshas /, ''))}</span>`).join('');
    const dots = [...new Set(evs.filter((e) => !['parsha', 'mevarchim', 'special'].includes(e.kind)).map((e) => e.kind))].slice(0, 3).map((k) => `<i class="d ${k}"></i>`).join('');
    const tms = timesForCell(a).map((x) => `<span class="t${x.c ? ' c' : ''}"><i>${x.c ? (x.after ? '› ' : '') : '✦ '}</i>${esc(hmShort(x.at, tz))}</span>`).join('');
    const label = `${gregLabel(a, { long: true })}, ${hebLabel(a)}${evs.length ? ', ' + evs.map((e) => e.title).join(', ') : ''}`;
    html += `<button type="button" class="${cls.join(' ')}" data-abs="${a}" aria-label="${esc(label)}"${a === state.todayAbs ? ' aria-current="date"' : ''}><span class="top-row">${main}${sec}</span><span class="lbls">${lbls}</span><span class="dots">${dots}</span>${tms}</button>`;
  }
  grid.innerHTML = html;
  if (anim) { grid.classList.remove('fade'); void grid.offsetWidth; grid.classList.add('fade'); }
  renderAgenda(start, end);
  const want = [];
  for (let a = gStart; a <= gEnd; a++) if (needsTimes(a)) want.push(a);
  loadZm(want, () => { if (cursorRange().start === start) { paintTimes(); renderAgenda(start, end); } });
}
function paintTimes() {
  const tz = state.loc.tz;
  for (const b of $$('.day', grid)) {
    const a = +b.dataset.abs;
    $$('.t', b).forEach((x) => x.remove());
    b.insertAdjacentHTML('beforeend', timesForCell(a).map((x) => `<span class="t${x.c ? ' c' : ''}"><i>${x.c ? (x.after ? '› ' : '') : '✦ '}</i>${esc(hmShort(x.at, tz))}</span>`).join(''));
  }
}
function renderAgenda(start, end) {
  const tz = state.loc.tz;
  let html = '';
  for (let a = start; a <= end; a++) {
    const evs = eventsOn(a).filter((e) => e.kind !== 'special' || true);
    const times = timesForCell(a);
    if (!evs.length && !times.length) continue;
    const g = L.absToGreg(a), h = L.absToHebrew(a);
    const lines = evs.slice(0, 4).map((e) => `<span><i class="d ${e.kind}"></i><em>${esc(e.title)}</em></span>`).join('');
    const tm = times.map((x) => `${x.c ? (x.after ? 'after ' : 'light ') : 'ends '}<b>${esc(hmText(x.at, tz))}</b>`).join('<br>');
    html += `<li${a === state.todayAbs ? ' class="today"' : ''}><button type="button" data-abs="${a}"><span class="ag-date"><b>${prefs.mode === 'heb' ? h.d : g.d}</b><small>${g.wd === 6 ? 'Shab' : WD_SHORT[g.wd]}</small><small>${prefs.mode === 'heb' ? MON[g.m - 1] + ' ' + g.d : esc(L.monthName(h.m, h.y, true)) + ' ' + h.d}</small></span><span class="ag-ev">${lines || `<small>${g.wd === 5 ? 'Erev Shabbos' : 'Shabbos'}</small>`}</span><span class="ag-tm">${tm}</span></button></li>`;
  }
  $('#agenda').innerHTML = html;
}
function goMonth(dir) {
  state.cursor = L.stepMonth(prefs.mode, state.cursor.y, state.cursor.m, dir);
  renderMonth(true);
}
function goToday() {
  state.cursor = cursorForAbs(state.todayAbs);
  renderMonth(true);
}
$('#prevM').addEventListener('click', () => goMonth(-1));
$('#nextM').addEventListener('click', () => goMonth(1));
$('#todayBtn').addEventListener('click', () => { goToday(); });
$$('[data-mode]').forEach((b) => b.addEventListener('click', () => {
  if (prefs.mode === b.dataset.mode) return;
  const { start, end } = cursorRange();
  prefs.mode = b.dataset.mode; savePrefs();
  const mid = state.todayAbs >= start && state.todayAbs <= end ? state.todayAbs : Math.floor((start + end) / 2);
  state.cursor = cursorForAbs(mid);
  syncOptButtons();
  renderMonth(true);
}));
$('#optBtn').addEventListener('click', () => {
  const o = $('#opts'), open = o.hidden;
  o.hidden = !open;
  $('#optBtn').setAttribute('aria-expanded', String(open));
});
$$('[data-il]').forEach((b) => b.addEventListener('click', () => {
  prefs.il = b.dataset.il === '1'; savePrefs();
  state.il = prefs.il;
  evCache.clear(); zm.clear();
  syncOptButtons(); refreshAll();
}));
$('#optChabad').addEventListener('click', () => { prefs.chabad = !prefs.chabad; savePrefs(); evCache.clear(); syncOptButtons(); refreshAll(); });
$('#optDaf').addEventListener('click', () => { prefs.daf = !prefs.daf; savePrefs(); syncOptButtons(); refreshAll(); });
function syncOptButtons() {
  $$('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === prefs.mode)));
  $$('[data-il]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.il === '1') === state.il)));
  $('#optChabad').setAttribute('aria-pressed', String(!!prefs.chabad));
  $('#optDaf').setAttribute('aria-pressed', String(!!prefs.daf));
}

// taps on any [data-abs] (grid cells, agenda, coming up, shabbos card)
let swallowClick = false;
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-abs]');
  if (!b || b.closest('.sheet')) return;
  if (swallowClick) { swallowClick = false; e.preventDefault(); return; }
  openDay(+b.dataset.abs);
});

// horizontal swipe on the grid (vertical keeps scrolling: touch-action pan-y)
(() => {
  const wrap = $('#gridwrap');
  let g = null;
  wrap.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    g = { id: e.pointerId, x: e.clientX, y: e.clientY, sw: false, dead: false };
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id || g.dead) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.sw) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { g.dead = true; return; }
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) { g.sw = true; try { wrap.setPointerCapture(e.pointerId); } catch (x) {} }
    }
    if (g.sw && !reduce) { grid.style.transform = `translateX(${(dx * 0.35).toFixed(1)}px)`; grid.style.opacity = String(1 - Math.min(.45, Math.abs(dx) / 500)); }
  });
  const end = (e, cancel) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y, sw = g.sw;
    g = null;
    grid.style.transform = ''; grid.style.opacity = '';
    if (sw) { swallowClick = true; setTimeout(() => { swallowClick = false; }, 350); }
    if (!cancel && sw && Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2) { buzz(8); goMonth(dx < 0 ? 1 : -1); }
  };
  wrap.addEventListener('pointerup', (e) => end(e, false));
  wrap.addEventListener('pointercancel', (e) => end(e, true));
})();

/* ======================================================================
   sheets
   ====================================================================== */
const scrim = $('#scrim'), daySheet = $('#daySheet'), locSheet = $('#locSheet');
let openSheet = null, lastFocus = null;
function showSheet(el) {
  if (openSheet && openSheet !== el) closeSheet(true);
  if (!openSheet) lastFocus = document.activeElement;
  openSheet = el;
  el.classList.add('open'); scrim.classList.add('open');
  el.setAttribute('aria-hidden', 'false');
  setTimeout(() => { const x = el.querySelector('[data-close]'); if (x && !matchMedia('(pointer: coarse)').matches) try { x.focus({ preventScroll: true }); } catch (e) {} }, 60);
}
function closeSheet(quick) {
  const el = openSheet;
  if (!el) return;
  openSheet = null;
  el.classList.remove('open', 'dragging'); el.style.transform = '';
  el.setAttribute('aria-hidden', 'true');
  if (!quick) scrim.classList.remove('open');
  if (document.activeElement && el.contains(document.activeElement)) document.activeElement.blur();
  if (!quick && lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
  if (el === daySheet) { state.sel = null; $$('.day.sel', grid).forEach((b) => b.classList.remove('sel')); }
}
[daySheet, locSheet].forEach((el) => {
  el.setAttribute('aria-hidden', 'true');
  el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
  const head = el.querySelector('.sheet-head');
  let d = null;
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('input, button, select, label, a')) return;
    d = { id: e.pointerId, y: e.clientY, t: performance.now(), dy: 0 };
    try { head.setPointerCapture(e.pointerId); } catch (x) {}
    el.classList.add('dragging');
  });
  head.addEventListener('pointermove', (e) => {
    if (!d || e.pointerId !== d.id) return;
    d.dy = Math.max(0, e.clientY - d.y);
    if (!reduce) el.style.transform = `translate(-50%, ${d.dy}px)`;
  });
  const end = (e) => {
    if (!d || e.pointerId !== d.id) return;
    const v = d.dy / Math.max(1, performance.now() - d.t);
    el.classList.remove('dragging'); el.style.transform = '';
    if (d.dy > 80 || (d.dy > 30 && v > .5)) closeSheet();
    d = null;
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
});
scrim.addEventListener('click', () => closeSheet());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && openSheet) {
    const f = $$('button, input, select, a[href]', openSheet).filter((x) => x.offsetParent !== null && !x.disabled);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    return;
  }
  if (e.key === 'Escape') { if (openSheet) { e.preventDefault(); closeSheet(); } return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest && e.target.closest('input, select, textarea')) return;
  if (openSheet === daySheet && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); openDay(state.sel + (e.key === 'ArrowRight' ? 1 : -1)); return; }
  if (openSheet) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); goMonth(-1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); goMonth(1); }
  else if (e.key === 'Home') { e.preventDefault(); goToday(); }
});

/* ---------- day sheet ---------- */
function openDay(abs) {
  if (!Number.isFinite(abs)) return;
  state.sel = abs;
  $$('.day.sel', grid).forEach((b) => b.classList.remove('sel'));
  const cell = $(`.day[data-abs="${abs}"]`, grid);
  if (cell) cell.classList.add('sel');
  ensureEvents(abs - 1, abs + 1);
  renderDay();
  if (openSheet !== daySheet) showSheet(daySheet);
  $('#dBody').scrollTop = 0;
  loadZm([abs], () => { if (state.sel === abs && openSheet === daySheet) renderDayZ(); });
}
$('#dPrev').addEventListener('click', () => openDay(state.sel - 1));
$('#dNext').addEventListener('click', () => openDay(state.sel + 1));
function renderDay() {
  const abs = state.sel, h = L.absToHebrew(abs), g = L.absToGreg(abs);
  const rel = abs - state.todayAbs;
  $('#dTitle').textContent = `${rel === 0 ? 'Today · ' : rel === 1 ? 'Tomorrow · ' : rel === -1 ? 'Yesterday · ' : ''}${WD_LONG[g.wd]}, ${MON[g.m - 1]} ${g.d}${g.y !== L.absToGreg(state.todayAbs).y ? ', ' + g.y : ''}`;
  $('#dSub').innerHTML = `${esc(L.hebrewDateEn(h))} · <span lang="he">${esc(L.hebrewDateHe(h))}</span>`;
  const evs = eventsOn(abs);
  let html = '';
  const evHtml = evs.map((e) => `<div class="ev"><i class="d ${e.kind}"></i><div><b>${esc(e.title)}${e.he && e.kind !== 'chabad' ? `<span lang="he">${esc(e.he)}</span>` : ''}</b>${e.note ? `<p>${esc(e.note)}</p>` : ''}</div></div>`).join('');
  if (evHtml) html += `<div class="blk">${evHtml}</div>`;
  // extras
  const kv = [];
  if (g.wd !== 6) { const p = parshaFor(abs); if (p) kv.push(['This week', p]); }
  const om = L.omerDay(h);
  if (om) kv.push(['Omer', `Day ${om} — counted the night before`]);
  const nextOm = L.omerDay(L.absToHebrew(abs + 1));
  if (nextOm && !om) kv.push(['Omer', `Count day ${nextOm} tonight`]);
  kv.push(['Tehillim', `Psalms ${L.tehillimFor(h.d, L.daysInMonth(h.m, h.y))} (monthly cycle)`]);
  if (prefs.daf) { const d = L.dafYomi(abs); if (d) kv.push(['Daf Yomi', `${d.masechta} ${d.daf}`]); }
  const H = HC();
  const mev = evs.find((e) => e.kind === 'mevarchim');
  if (H && (mev || h.d === 1 || (h.d === 30))) {
    try {
      let mm = h.m, yy = h.y;
      if (mev || h.d === 30) { const nx = L.absToHebrew(L.hebrewToAbs(h.y, h.m, L.daysInMonth(h.m, h.y)) + 1); mm = nx.m; yy = nx.y; }
      const mol = new H.Molad(yy, mm);
      kv.push(['Molad', `${L.monthName(mm, yy)}: ${WD_LONG[mol.getDow()]}, ${((mol.getHour() + 11) % 12) + 1}:${String(mol.getMinutes()).padStart(2, '0')} ${mol.getHour() < 12 ? 'AM' : 'PM'} and ${mol.getChalakim()} ${mol.getChalakim() === 1 ? 'chelek' : 'chalakim'} (Jerusalem)`]);
    } catch (e) {}
  }
  html += `<div class="blk"><dl class="kv">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>`;
  html += `<div class="blk" id="dZ"><h3>Zmanim · ${esc(locLabel(state.loc))}</h3><p class="src">Loading…</p></div>`;
  html += `<div class="d-actions"><button type="button" class="pill" data-act="conv">Convert</button><button type="button" class="pill" data-act="bd">Birthday from this date</button><button type="button" class="pill" data-act="yz">Yahrzeit from this date</button><button type="button" class="pill" data-act="copy">Copy</button></div>`;
  $('#dBody').innerHTML = html;
  renderDayZ();
}
function renderDayZ() {
  const box = $('#dZ');
  if (!box) return;
  const abs = state.sel, z = zOf(abs), tz = state.loc.tz;
  const head = `<h3>Zmanim · ${esc(locLabel(state.loc))}</h3>`;
  if (!z) {
    box.innerHTML = head + `<p class="src">${hasCoords(state.loc) || (apiQuery(state.loc) && apiRange(abs)) ? 'Loading…' : 'Zmanim for this date need a city location (tap the location at the top).'}</p>`;
    return;
  }
  const n = +now();
  const items = z.items.filter((i) => SHOW.includes(i.key)).sort((a, b) => a.at - b.at);
  box.innerHTML = head + `<ul class="zl">${items.map((i) => `<li class="${SPECIAL.has(i.key) ? 'hl' : ''}${abs === state.todayAbs && +i.at < n ? ' past' : ''}"><span>${esc(i.label)}</span><b>${esc(hmText(i.at, tz))}</b></li>`).join('')}</ul>
    <p class="src">${z.src === 'chabad' ? 'Courtesy of <a href="https://www.chabad.org/calendar/zmanim.htm" target="_blank" rel="noopener noreferrer">Chabad.org</a>' : 'Calculated with Chabad.org’s method (offline or outside their range)'} · <a href="/time/">Open /time</a></p>`;
}
$('#dBody').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const abs = state.sel, act = b.dataset.act;
  if (act === 'copy') {
    const evs = eventsOn(abs).map((x) => x.title);
    copyText(`${gregLabel(abs, { long: true })} · ${hebLabel(abs)}${evs.length ? ' · ' + evs.join(', ') : ''}`);
    return;
  }
  closeSheet();
  if (act === 'conv') { setCv('g2h'); $('#gIn').value = L.absToYMD(abs); $('#gSunset').setAttribute('aria-pressed', 'false'); renderG2H(); }
  else {
    setCv('ann');
    prefs.akind = act === 'bd' ? 'birthday' : 'yahrzeit';
    prefs.asrc = 'greg';
    $('#aGIn').value = L.absToYMD(abs);
    $('#aSunset').setAttribute('aria-pressed', 'false');
    syncAnn(); renderAnn();
  }
  savePrefs();
  $('#convert').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
});

/* ======================================================================
   converter
   ====================================================================== */
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); return; } catch (e) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Copied');
  } catch (e) { toast('Copy not available'); }
}
async function shareText(title, text, params) {
  const u = new URL(location.pathname, location.origin);
  for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
  if (navigator.share) { try { await navigator.share({ title, text, url: u.href }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  copyText(`${text}\n${u.href}`);
}
function setCv(which) {
  prefs.cv = which;
  $$('[data-cv]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.cv === which)));
  $$('.cv-pane').forEach((p) => { p.hidden = p.dataset.pane !== which; });
}
$$('[data-cv]').forEach((b) => b.addEventListener('click', () => { setCv(b.dataset.cv); savePrefs(); }));
const toggle = (b) => { b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); };
const pressed = (b) => b.getAttribute('aria-pressed') === 'true';
function eventsLine(abs) {
  ensureEvents(abs - 1, abs + 1);
  const evs = eventsOn(abs).filter((e) => e.kind !== 'mevarchim');
  return evs.length ? `<ul class="r-ev">${evs.map((e) => `<li>${esc(e.title)}</li>`).join('')}</ul>` : '';
}
// Gregorian -> Hebrew
function renderG2H() {
  const v = $('#gIn').value, out = $('#gOut');
  const abs = L.ymdToAbs(v);
  if (abs == null) { out.innerHTML = v ? '<p class="r-err">Enter a valid date.</p>' : ''; return; }
  const after = pressed($('#gSunset'));
  const habs = abs + (after ? 1 : 0);
  const h = L.absToHebrew(habs);
  out.innerHTML = `<p class="r-main"><span class="grad">${h.d} ${esc(L.monthName(h.m, h.y))}</span> ${h.y}</p>
    <p class="r-he" lang="he">${esc(L.hebrewDateHe(h))}</p>
    <p class="r-sub">${esc(gregLabel(abs, { long: true }))}${after ? ' <b>after sunset</b>' : ''}${L.isLeapYear(h.y) ? ' · leap year' : ''}</p>
    ${eventsLine(habs)}
    <div class="r-actions"><button type="button" class="pill" data-g="copy">Copy</button><button type="button" class="pill" data-g="share">Share</button><button type="button" class="pill" data-g="show">Show in calendar</button></div>`;
  out.dataset.text = `${gregLabel(abs, { long: true })}${after ? ' (after sunset)' : ''} = ${L.hebrewDateEn(h)} · ${L.hebrewDateHe(h)}`;
  out.dataset.habs = habs;
}
$('#gIn').addEventListener('input', renderG2H);
$('#gSunset').addEventListener('click', (e) => { toggle(e.currentTarget); renderG2H(); });
$('#gOut').addEventListener('click', (e) => {
  const b = e.target.closest('[data-g]'); if (!b) return;
  const out = $('#gOut');
  if (b.dataset.g === 'copy') copyText(out.dataset.text);
  else if (b.dataset.g === 'share') shareText('Hebrew date', out.dataset.text, { g: $('#gIn').value, ...(pressed($('#gSunset')) ? { sunset: '1' } : {}) });
  else showInCalendar(+out.dataset.habs);
});
function showInCalendar(abs) {
  state.cursor = cursorForAbs(abs);
  renderMonth(true);
  $('#month').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  setTimeout(() => openDay(abs), reduce ? 50 : 450);
}
// Hebrew selects (shared by H->G and anniversary)
function fillHeb(dSel, mSel, yIn, keep) {
  const y = parseInt(yIn.value, 10);
  const yy = Number.isInteger(y) && y >= 3762 && y <= 6000 ? y : L.absToHebrew(state.todayAbs).y;
  let m = keep ? keep.m : +mSel.value;
  if (m === 13 && !L.isLeapYear(yy)) m = 12;
  mSel.innerHTML = L.monthsOfYear(yy).map((x) => `<option value="${x.m}">${esc(x.name)}</option>`).join('');
  mSel.value = String(m || 7);
  const dim = L.daysInMonth(+mSel.value, yy);
  let d = keep ? keep.d : +dSel.value;
  dSel.innerHTML = Array.from({ length: dim }, (_, i) => `<option>${i + 1}</option>`).join('');
  dSel.value = String(Math.min(d || 1, dim));
}
function readHeb(dSel, mSel, yIn) {
  const y = parseInt(yIn.value, 10), m = +mSel.value, d = +dSel.value;
  return L.validHebrew(y, m, d) ? { y, m, d } : null;
}
const hD = $('#hD'), hM = $('#hM'), hY = $('#hY');
function renderH2G() {
  const h = readHeb(hD, hM, hY), out = $('#hOut');
  if (!h) { out.innerHTML = '<p class="r-err">Enter a Hebrew year between 3762 and 6000.</p>'; return; }
  const abs = L.hebrewToAbs(h.y, h.m, h.d);
  out.innerHTML = `<p class="r-main"><span class="grad">${esc(gregLabel(abs, { wd: false, long: true, year: false }))}</span> ${L.absToGreg(abs).y}</p>
    <p class="r-sub"><b>${esc(WD_LONG[L.weekday(abs)])}</b> · begins at sunset on ${esc(gregLabel(abs - 1, { year: false }))}</p>
    <p class="r-he" lang="he">${esc(L.hebrewDateHe(h))}</p>
    ${eventsLine(abs)}
    <div class="r-actions"><button type="button" class="pill" data-h="copy">Copy</button><button type="button" class="pill" data-h="share">Share</button><button type="button" class="pill" data-h="show">Show in calendar</button></div>`;
  out.dataset.text = `${L.hebrewDateEn(h)} (${L.hebrewDateHe(h)}) = ${gregLabel(abs, { long: true })} (from sunset ${gregLabel(abs - 1)})`;
  out.dataset.abs = abs;
}
hY.addEventListener('input', () => { hY.value = hY.value.replace(/\D/g, '').slice(0, 4); if (hY.value.length === 4) { fillHeb(hD, hM, hY); } renderH2G(); });
hM.addEventListener('change', () => { fillHeb(hD, hM, hY); renderH2G(); });
hD.addEventListener('change', renderH2G);
$('#hOut').addEventListener('click', (e) => {
  const b = e.target.closest('[data-h]'); if (!b) return;
  const out = $('#hOut');
  if (b.dataset.h === 'copy') copyText(out.dataset.text);
  else if (b.dataset.h === 'share') shareText('Gregorian date', out.dataset.text, { h: `${hY.value}-${hM.value}-${hD.value}` });
  else showInCalendar(+out.dataset.abs);
});
// anniversaries
const aD = $('#aD'), aM = $('#aM'), aY = $('#aY');
function syncAnn() {
  $$('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === prefs.akind)));
  $$('[data-src]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.src === prefs.asrc)));
  $('#aGreg').hidden = prefs.asrc !== 'greg';
  $('#aHeb').hidden = prefs.asrc !== 'heb';
  $('#aGLabel').textContent = prefs.akind === 'yahrzeit' ? 'Date of passing' : 'Date of birth';
  $('#aN').value = String(prefs.an);
}
function annOrig() {
  if (prefs.asrc === 'heb') return readHeb(aD, aM, aY);
  const abs = L.ymdToAbs($('#aGIn').value);
  if (abs == null) return null;
  return L.absToHebrew(abs + (pressed($('#aSunset')) ? 1 : 0));
}
function renderAnn() {
  const out = $('#aOut'), orig = annOrig();
  if (!orig) { out.innerHTML = prefs.asrc === 'heb' ? '<p class="r-err">Enter a valid Hebrew date.</p>' : ''; return; }
  const kind = prefs.akind, n = prefs.an;
  const occ = L.nextOccurrences(kind, orig, state.todayAbs, n);
  const kName = kind === 'yahrzeit' ? 'Yahrzeit' : 'Hebrew birthday';
  let note = '';
  if (orig.m === 12 || orig.m === 13) {
    note = kind === 'yahrzeit'
      ? (orig.m === 13 ? 'Adar II: observed in Adar of a regular year and Adar II of a leap year.' : 'In a leap year this is observed in Adar I (some also observe Adar II).')
      : (L.isLeapYear(orig.y) ? (orig.m === 12 ? 'Born in Adar I: stays in Adar I in leap years.' : 'Born in Adar II: Adar in regular years.') : 'Born in Adar of a regular year: Adar II in leap years (as for a bar/bas mitzvah).');
  }
  const lines = occ.map((o) => `${o.hy} · ${L.hebrewDateEn(o.h, false)} · ${gregLabel(o.abs)} (from sunset ${gregLabel(o.eveYmd ? L.ymdToAbs(o.eveYmd) : o.abs - 1, { year: false })})`);
  out.innerHTML = `<p class="r-sub">${esc(kName)} of <b>${esc(L.hebrewDateEn(orig))}</b> · <span lang="he">${esc(L.hebrewDateHe(orig))}</span></p>
    ${note ? `<p class="r-sub">${esc(note)}</p>` : ''}
    <ol class="occ">${occ.map((o, i) => `<li class="${i === 0 ? 'next' : ''}"><span class="y">${o.hy}</span><span class="g">${esc(gregLabel(o.abs))}<small>${esc(L.hebrewDateEn(o.h, false))} · begins at sunset ${esc(gregLabel(o.abs - 1, { year: false }))}${i === 0 ? ` · in ${o.abs - state.todayAbs} days` : ''}</small></span></li>`).join('')}</ol>
    <div class="r-actions"><button type="button" class="pill" data-a="copy">Copy list</button><button type="button" class="pill" data-a="share">Share</button></div>`;
  out.dataset.text = `${kName} — ${L.hebrewDateEn(orig)} (${L.hebrewDateHe(orig)})\n${lines.join('\n')}`;
}
$$('[data-kind]').forEach((b) => b.addEventListener('click', () => { prefs.akind = b.dataset.kind; savePrefs(); syncAnn(); renderAnn(); }));
$$('[data-src]').forEach((b) => b.addEventListener('click', () => {
  const cur = annOrig();
  prefs.asrc = b.dataset.src; savePrefs();
  if (prefs.asrc === 'heb' && cur) { aY.value = cur.y; fillHeb(aD, aM, aY, cur); }
  syncAnn(); renderAnn();
}));
$('#aGIn').addEventListener('input', renderAnn);
$('#aSunset').addEventListener('click', (e) => { toggle(e.currentTarget); renderAnn(); });
aY.addEventListener('input', () => { aY.value = aY.value.replace(/\D/g, '').slice(0, 4); if (aY.value.length === 4) fillHeb(aD, aM, aY); renderAnn(); });
aM.addEventListener('change', () => { fillHeb(aD, aM, aY); renderAnn(); });
aD.addEventListener('change', renderAnn);
$('#aN').addEventListener('change', () => { prefs.an = +$('#aN').value || 10; savePrefs(); renderAnn(); });
$('#aOut').addEventListener('click', (e) => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const out = $('#aOut'), orig = annOrig();
  if (b.dataset.a === 'copy') copyText(out.dataset.text);
  else if (orig) shareText(prefs.akind === 'yahrzeit' ? 'Yahrzeit dates' : 'Hebrew birthday dates', out.dataset.text, { [prefs.akind === 'yahrzeit' ? 'yz' : 'bd']: `${orig.y}-${orig.m}-${orig.d}` });
});

/* ======================================================================
   omer buttons
   ====================================================================== */
$('#omerBrachaBtn').addEventListener('click', () => { prefs.bracha = !prefs.bracha; savePrefs(); renderOmer(); });
$('#omerDoneBtn').addEventListener('click', () => {
  const today = L.absToYMD(state.todayAbs), o = omerState();
  lsSetJSON(KEY.omer, { ...o, counted: o.counted === today ? null : today });
  if (o.counted !== today) buzz(12);
  renderOmer();
});
$('#omerRemindBtn').addEventListener('click', async () => {
  if (prefs.remind) { prefs.remind = false; savePrefs(); renderOmer(); toast('Omer reminder off'); return; }
  if (!('Notification' in window)) { toast('Notifications aren’t supported here'); return; }
  let perm = Notification.permission;
  if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch (e) { perm = 'denied'; } }
  if (perm !== 'granted') { toast('Notifications are blocked for this site'); return; }
  prefs.remind = true; savePrefs();
  getSWReg();
  renderOmer();
  toast('Reminder set for nightfall');
});

/* ======================================================================
   location sheet
   ====================================================================== */
const cityList = $('#cityList'), qEl = $('#q');
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function renderCities() {
  const q = norm(qEl.value.trim());
  const rows = CITIES.filter((c) => !q || norm(`${c.name} ${c.country} ${c.region} ${c.alt || ''} ${c.zip || ''}`).includes(q));
  let html = '', reg = '';
  const ordered = REGIONS.flatMap((r) => rows.filter((c) => c.region === r));
  for (const c of ordered.slice(0, 250)) {
    if (c.region !== reg && !q) { reg = c.region; html += `<p class="rg">${esc(reg)}</p>`; }
    const cur = state.loc && state.loc.id === c.id;
    html += `<button type="button" class="city-row" role="option" aria-selected="${cur}" data-city="${esc(c.id)}"><span><b>${esc(c.name)}</b><small>${esc(c.country)}</small></span><span class="src-tag">${c.zip || c.chabadCityId ? 'CHABAD.ORG' : 'CALC'}</span></button>`;
  }
  cityList.innerHTML = html;
  $('#cityEmpty').hidden = rows.length > 0;
}
$('#locBtn').addEventListener('click', () => { qEl.value = ''; renderCities(); showSheet(locSheet); });
qEl.addEventListener('input', renderCities);
cityList.addEventListener('click', (e) => {
  const b = e.target.closest('[data-city]'); if (!b) return;
  const c = cityById(b.dataset.city); if (!c) return;
  closeSheet();
  setLocation(fromCity(c), true);
  toast(`Location: ${c.name}`);
});
$('#zipIn').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 5); });
$('#zipForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const zip = $('#zipIn').value, st = $('#zipStatus');
  st.classList.remove('err');
  if (!/^\d{5}$/.test(zip)) { st.textContent = 'Enter a 5-digit US ZIP code'; st.classList.add('err'); return; }
  st.textContent = 'Looking up…';
  let name = null;
  try {
    const r = await fetch(`/api/zmanim?zip=${zip}&date=${L.absToYMD(state.todayAbs)}&days=1`);
    if (r.status === 404 || r.status === 400) { st.textContent = 'Chabad.org doesn’t know that ZIP code'; st.classList.add('err'); return; }
    if (r.ok) { const j = await r.json(); name = j && j.location ? String(j.location).slice(0, 60) : null; }
  } catch (x) {}
  st.textContent = 'Zmanim from Chabad.org';
  closeSheet();
  setLocation(zipLoc(zip, name), true);
  toast(`Location: ${name || 'ZIP ' + zip}`);
});
$('#geoBtn').addEventListener('click', () => {
  const st = $('#geoStatus');
  if (!navigator.geolocation) { st.textContent = 'Not available on this device'; return; }
  st.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition((pos) => {
    st.textContent = 'Stays on this device';
    const lat = +pos.coords.latitude.toFixed(4), lon = +pos.coords.longitude.toFixed(4);
    closeSheet();
    setLocation({ kind: 'here', id: 'here', name: 'My location', country: tzCity(deviceTz), tz: deviceTz, lat, lon }, true);
  }, () => { st.textContent = 'Location permission denied'; }, { timeout: 10000, maximumAge: 600000 });
});
addEventListener('storage', (e) => {
  if (e.key !== KEY.loc) return;
  const l = revive(lsJSON(KEY.loc, null));
  if (l && (!state.loc || l.id !== state.loc.id)) setLocation(l, false);
});

/* ======================================================================
   refresh & lifecycle
   ====================================================================== */
function refreshAll() {
  if (!state.loc) return;
  zSeq++;
  const prevToday = state.todayAbs;
  state.todayAbs = civilToday();
  if (!state.cursor || (prevToday && prevToday !== state.todayAbs && cursorForAbs(prevToday).m === state.cursor.m)) state.cursor = cursorForAbs(state.todayAbs);
  ensureEvents(state.todayAbs - 10, state.todayAbs + 45);
  renderToday();
  renderMonth(false);
  const t = state.todayAbs, want = [t - 1, t, t + 1];
  for (let a = t; a <= t + 9; a++) if (needsTimes(a)) want.push(a);
  loadZm(want, () => { renderToday(); paintTimes(); });
  if (openSheet === daySheet && state.sel != null) renderDay();
}
let lastMinute = -1;
setInterval(() => {
  const m = Math.floor(+now() / MIN);
  if (m === lastMinute) return;
  lastMinute = m;
  if (!state.loc) return;
  if (civilToday() !== state.todayAbs) { refreshAll(); return; }
  renderToday();
}, 5000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.loc) { syncClock(); if (civilToday() !== state.todayAbs) refreshAll(); else renderToday(); } });
window.addEventListener('szv:theme', () => { /* colors are CSS variables; nothing to repaint */ });

/* ======================================================================
   go
   ====================================================================== */
function initConverter() {
  const t = civilToday();
  const th = L.absToHebrew(t);
  const g = qs.get('g'), hq = qs.get('h'), bd = qs.get('bd'), yz = qs.get('yz');
  $('#gIn').value = L.parseYMD(g) ? g : L.absToYMD(t);
  if (qs.get('sunset') === '1') $('#gSunset').setAttribute('aria-pressed', 'true');
  const parseH = (s) => { const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s || ''); if (!m) return null; const o = { y: +m[1], m: +m[2], d: +m[3] }; return L.validHebrew(o.y, o.m, o.d) ? o : null; };
  const hh = parseH(hq) || th;
  hY.value = hh.y; fillHeb(hD, hM, hY, hh);
  const ann = parseH(bd) || parseH(yz);
  if (ann) { prefs.asrc = 'heb'; prefs.akind = yz ? 'yahrzeit' : 'birthday'; }
  const a0 = ann || th;
  aY.value = a0.y; fillHeb(aD, aM, aY, a0);
  if (L.parseYMD(g)) setCv('g2h'); else if (parseH(hq)) setCv('h2g'); else if (ann) setCv('ann'); else setCv(prefs.cv || 'g2h');
  syncAnn();
  renderG2H(); renderH2G(); renderAnn();
  if (g || hq || ann) setTimeout(() => $('#convert').scrollIntoView({ block: 'start' }), 300);
}

const urlLoc = locFromURL();
const initial = urlLoc || revive(lsJSON(KEY.loc, null)) || fromCity(cityById(DEFAULT_CITY_ID));
syncClock();
hcReady.then(() => {
  setLocation(initial, !!urlLoc);
  initConverter();
  const d = L.parseYMD(qs.get('date') || '');
  if (d) showInCalendar(L.gregToAbs(d.y, d.m, d.d));
});
zReady.then(() => { if (state.loc) refreshAll(); });
