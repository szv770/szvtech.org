// /time — full-screen clock for any location, with zmanim, live sky, sun arc,
// Hebrew date, favorites and a bedside mode. The big digits stay the point.
import { CITIES, cityById, DEFAULT_CITY_ID, REGIONS, zipToTz, US_ZONES } from '/time/cities.js?v=8a8909ac4d';

/* ======================================================================
   small helpers
   ====================================================================== */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const html = document.documentElement;
const MIN = 60000, DAY = 86400000;
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };
const lsJSON = (k, fb) => { try { const v = JSON.parse(lsGet(k)); return v == null ? fb : v; } catch (e) { return fb; } };
const lsSetJSON = (k, v) => lsSet(k, v == null ? null : JSON.stringify(v));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const deviceTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } })();
const validTz = (tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch (e) { return false; } };

const KEY = {
  h24: 'szv-time-24h', loc: 'szv-time-loc', favs: 'szv-time-favs', night: 'szv-time-night',
  candle: 'szv-time-candle', ends: 'szv-time-shabbos-ends', zcache: 'szv-z:',
};

// zmanim engine: optional, loaded lazily — the clock never depends on it.
let Z = null;
const zReady = import('/time/zmanim.js?v=93be04f7f2').then((m) => { Z = m; return m; }).catch(() => null);

// per-tz formatter cache
const fmtCache = new Map();
function fmtFor(tz, key, opts) {
  const k = tz + '|' + key;
  let f = fmtCache.get(k);
  if (!f) { f = new Intl.DateTimeFormat(opts.locale || 'en-US', { timeZone: tz, ...opts, locale: undefined }); fmtCache.set(k, f); }
  return f;
}
function partsIn(date, tz) {
  const f = fmtFor(tz, 'parts', { hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
  const p = {};
  for (const { type, value } of f.formatToParts(date)) p[type] = value;
  return { y: +p.year, m: +p.month, d: +p.day, H: +p.hour % 24, M: +p.minute, S: +p.second, wd: p.weekday };
}
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function ymdIn(date, tz) { const p = partsIn(date, tz); return { y: p.y, m: p.m, d: p.d, weekday: WD[p.wd] }; }
const ymdStr = (o) => `${o.y}-${String(o.m).padStart(2, '0')}-${String(o.d).padStart(2, '0')}`;
function addDaysYMD(o, n) {
  const t = new Date(Date.UTC(o.y, o.m - 1, o.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), weekday: t.getUTCDay() };
}
function parseYMD(s) { const [y, m, d] = s.split('-').map(Number); return addDaysYMD({ y, m, d }, 0); }
// wall-clock time (minutes after local midnight of ymd) in tz → absolute Date. DST-safe.
function tzOffset(ms, tz) {
  const p = partsIn(new Date(ms), tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.H, p.M, p.S) - Math.floor(ms / 1000) * 1000;
}
function zonedTime(ymd, minutes, tz) {
  const guess = Date.UTC(ymd.y, ymd.m - 1, ymd.d, 0, minutes);
  let t = guess - tzOffset(guess, tz);
  const o2 = tzOffset(t, tz);
  if (guess - o2 !== t) t = guess - o2;
  return new Date(t);
}
function hm(date, tz, h24, opt = {}) {
  const f = fmtFor(tz, 'hm' + (h24 ? 24 : 12), { hour: 'numeric', minute: '2-digit', hourCycle: h24 ? 'h23' : 'h12' });
  const p = {};
  for (const { type, value } of f.formatToParts(date)) p[type] = value;
  const hh = h24 ? String(p.hour).padStart(2, '0') : p.hour;
  const ap = (p.dayPeriod || '').toUpperCase();
  return opt.html ? `${hh}:${p.minute}${!h24 && ap ? `<small>${ap}</small>` : ''}` : opt.bare || h24 ? `${hh}:${p.minute}` : `${hh}:${p.minute} ${ap}`;
}
function countdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
}
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ');

/* ======================================================================
   elements & state
   ====================================================================== */
const clock = $('#clock'), stage = $('#stage');
const greg = $('#greg'), heb = $('#heb'), dateEl = $('#date'), merEl = $('#mer'), srEl = $('#sr');
const fill = $('.sweep .fill'), pulse = $('.pulse');
const dots = $$('.col i');
const cells = $$('.h .d, .m .d, .s .d'); // H1 H2 M1 M2 S1 S2
const cname = $('#cname'), cityBtn = $('#cityBtn'), favdotsEl = $('#favdots');
const zline = $('#zline'), zlabel = $('#zlabel'), zcount = $('#zcount');
const arcBig = $('#arcBig'), arcMini = $('#arcMini'), riseT = $('#riseT'), setT = $('#setT');
const sky = $('#sky'), toastEl = $('#toast'), scrim = $('#scrim'), top = $('#top'), foot = $('#foot');
const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
let reduce = mqReduce.matches;
mqReduce.addEventListener && mqReduce.addEventListener('change', (e) => { reduce = e.matches; startSweep(); });

const state = {
  h24: lsGet(KEY.h24) === '1',
  night: lsGet(KEY.night) === '1',
  loc: null,
  favs: lsJSON(KEY.favs, []),
  sched: null,
};
if (!Array.isArray(state.favs)) state.favs = [];
const calm = () => reduce || state.night;
if (state.night) html.classList.add('night');

/* ======================================================================
   locations
   ====================================================================== */
const MY_NAME = 'My location';
function tzCity(tz) { return (tz.split('/').pop() || tz).replace(/_/g, ' '); }
function fromCity(cty) { return { ...cty, kind: 'city' }; }
function slim(loc) { // what we persist / share for a location
  if (!loc) return null;
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
  return { ...o };
}
function zipLoc(zip, tzOverride, name) {
  const auto = zipToTz(zip);
  const tz = tzOverride && validTz(tzOverride) ? tzOverride : auto || deviceTz;
  return { kind: 'zip', id: 'zip-' + zip, zip, tz, tzAuto: !tzOverride, name: name || 'ZIP ' + zip, country: 'United States' };
}
const sameLoc = (a, b) => !!a && !!b && a.id === b.id;
const hasCoords = (l) => l && isFinite(l.lat) && isFinite(l.lon) && l.lat != null;

function locFromURL() {
  let q;
  try { q = new URLSearchParams(location.search); } catch (e) { return null; }
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
function writeURL(loc) {
  try {
    const u = new URL(location.href);
    u.search = '';
    if (loc.kind === 'city') u.searchParams.set('city', loc.id);
    else if (loc.kind === 'zip') { u.searchParams.set('zip', loc.zip); if (!loc.tzAuto) u.searchParams.set('tz', loc.tz); }
    else if (loc.kind === 'custom') { u.searchParams.set('lat', loc.lat); u.searchParams.set('lon', loc.lon); u.searchParams.set('tz', loc.tz); }
    // 'here' (device geolocation) is never written to the URL: coordinates stay on the device.
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  } catch (e) {}
}

/* ======================================================================
   exact time: NTP-style sync against /api/now (like time.is)
   ----------------------------------------------------------------------
   Device clocks are often a few seconds off. now() = Date.now() + offset is
   the one source of "now" on this page. The offset is measured from a few
   round trips to /api/now (Vercel's NTP-synced clock): for each sample the
   server time is compared with the local midpoint of the request, and the
   lowest-latency samples win (their error is at most half the round trip).
   Round trips are timed with performance.now() (monotonic, sub-ms); the
   midpoint is expressed on the Date.now() scale that now() builds on.
   ====================================================================== */
const SYNC = { samples: 6, maxRtt: 1500, every: 5 * MIN, slewMax: 200, timeout: 3000 };
const pnow = () => performance.now();
const sync = {
  ok: false,      // a measurement succeeded (and still applies)
  busy: false,
  from: 0, to: 0, t0: 0, dur: 0, // offset, slewed linearly from `from` to `to` over [t0, t0+dur] (performance time)
  err: null,      // ± uncertainty, ms
  at: -1e9,       // performance time of the last successful sync
  fails: 0,
  retryT: 0,
  shown: '',
};
function offsetNow(p = pnow()) {
  if (!sync.dur || p >= sync.t0 + sync.dur) return sync.to;
  return sync.from + (sync.to - sync.from) * Math.max(0, p - sync.t0) / sync.dur;
}
function now() { return Date.now() + offsetNow(); }
function nowDate() { return new Date(now()); }

async function sampleNow() {
  const ctl = 'AbortController' in window ? new AbortController() : null;
  const kill = setTimeout(() => ctl && ctl.abort(), SYNC.timeout);
  try {
    const d0 = Date.now(), p0 = pnow();
    const r = await fetch('/api/now?r=' + Math.random().toString(36).slice(2), { cache: 'no-store', signal: ctl && ctl.signal });
    const p1 = pnow(); // headers in: the server read its clock just before sending them
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || !Number.isFinite(j.t)) return null;
    const rtt = p1 - p0;
    if (rtt > SYNC.maxRtt) return null;
    // server ms is truncated: its true reading lies in [t, t+1)
    return { rtt, offset: j.t + 0.5 - (d0 + rtt / 2) };
  } catch (e) { return null; } finally { clearTimeout(kill); }
}

let onFirstSample = null;
const firstSample = new Promise((r) => { onFirstSample = r; });
async function syncNow(why) {
  if (sync.busy) return sync.ok;
  sync.busy = true;
  clearTimeout(sync.retryT);
  const got = [];
  for (let i = 0; i < SYNC.samples; i++) {
    const s = await sampleNow();
    if (!s) { if (!got.length && i >= 1) break; continue; } // offline / no endpoint: give up quickly
    got.push(s);
    // the very first good sample already beats the device clock: use it before the intro
    if (!sync.ok && got.length === 1 && !clock.dataset.ready) applyOffset(s.offset, s.rtt / 2 + 1, true);
    onFirstSample();
  }
  onFirstSample();
  sync.busy = false;
  if (!got.length) {
    sync.fails++;
    if (sync.stale) { applyOffset(0, null, true); sync.ok = false; } // device clock jumped and we can't re-measure: trust it
    if (!sync.ok) setSyncStatus();
    sync.retryT = setTimeout(() => syncNow('retry'), Math.min(SYNC.every, 15000 * 2 ** Math.min(4, sync.fails - 1)));
    return false;
  }
  sync.fails = 0;
  sync.stale = false;
  got.sort((a, b) => a.rtt - b.rtt);
  const best = got.slice(0, Math.min(3, got.length)).map((s) => s.offset).sort((a, b) => a - b);
  const offset = best.length === 2 ? (best[0] + best[1]) / 2 : best[Math.floor(best.length / 2)];
  applyOffset(offset, got[0].rtt / 2 + 1);
  sync.at = pnow();
  sync.n = got.length;
  sync.why = why;
  return true;
}
function applyOffset(offset, err, quiet) {
  const p = pnow(), cur = offsetNow(p), delta = offset - cur;
  if (sync.ok && Math.abs(delta) < SYNC.slewMax) {
    // small correction: glide over 1–2 s so no second is skipped or repeated
    sync.from = cur; sync.to = offset; sync.t0 = p; sync.dur = clamp(Math.abs(delta) * 10, 1000, 2000);
  } else {
    sync.from = sync.to = offset; sync.dur = 0;
  }
  sync.err = err;
  sync.ok = err != null;
  setSyncStatus();
  if (!quiet || clock.dataset.ready) {
    if (Math.abs(delta) >= SYNC.slewMax && clock.dataset.ready && fmt) { target = null; render(nowDate(), 'sync'); }
    if (clock.dataset.ready) schedule();
  }
}

// Wake from sleep, or the user changing the system clock: Date jumps relative
// to the monotonic performance clock. Either way, measure again.
let jumpRef = { d: Date.now(), p: pnow() };
function checkJump() {
  const d = Date.now(), p = pnow();
  const drift = (d - jumpRef.d) - (p - jumpRef.p);
  jumpRef = { d, p };
  if (Math.abs(drift) > 1000) {
    sync.stale = true;
    if (document.visibilityState === 'visible') syncNow('jump');
    return true;
  }
  return false;
}
setInterval(() => {
  checkJump();
  if (document.visibilityState === 'visible' && !sync.busy && sync.ok && pnow() - sync.at > SYNC.every) syncNow('periodic');
}, 2000);
addEventListener('online', () => syncNow('online'));

/* the quiet status line in the footer */
const syncEl = $('#sync');
const fmtSec = (ms) => {
  const a = Math.abs(ms) / 1000;
  if (a < 10) return a.toFixed(1) + 's';
  if (a < 60) return Math.round(a) + 's';
  if (a < 3600) return `${Math.floor(a / 60)}m ${String(Math.round(a % 60)).padStart(2, '0')}s`;
  return `${Math.floor(a / 3600)}h ${String(Math.round((a % 3600) / 60)).padStart(2, '0')}m`;
};
function syncCopy() {
  if (sync.busy && (!sync.ok || sync.tap)) return ['syncing…'];
  if (!sync.ok) return sync.fails ? ['device time (offline)', 'device time'] : ['syncing…'];
  const o = sync.to;
  const acc = '±' + Math.max(0.01, sync.err / 1000).toFixed(2) + 's';
  if (Math.abs(o) < 100) return [`synced ${acc} · your clock is exact`, `synced ${acc} · clock exact`, 'clock exact'];
  const rel = `${fmtSec(o)} ${o > 0 ? 'behind' : 'ahead'}`;
  return [`synced ${acc} · your clock is ${rel}`, `synced ${acc} · ${rel}`, `clock ${rel}`];
}
function setSyncStatus() {
  const tiers = syncCopy();
  syncEl.classList.toggle('off', !sync.ok && !sync.busy);
  syncEl.title = tiers[0] + (sync.ok ? ' — tap to sync again' : '');
  syncEl.setAttribute('aria-label', `Time sync: ${tiers[0]}. Sync again.`);
  placeSync(tiers);
}
// Never costs the digits a pixel: it only goes where the footer has room on
// its existing line (the empty middle, or beside the home link), in the
// longest wording that fits — or not at all.
function placeSync(tiers = syncCopy()) {
  const zm = document.body.dataset.zm;
  const homeW = foot.querySelector('.home').scrollWidth, gap = 12, pad = 12;
  let where, avail;
  if (zm === 'none' || zm === 'stacked') {
    where = 'mid';
    avail = foot.clientWidth - 2 * gap - 2 * Math.max(homeW, merEl.scrollWidth) - 4;
  } else {
    where = 'side';
    const col = parseFloat(getComputedStyle(foot).gridTemplateColumns) || 0;
    avail = col - homeW - 16;
    syncEl.style.marginLeft = (homeW + 16 - pad / 2) + 'px';
  }
  syncEl.dataset.where = where;
  for (const t of tiers) {
    if (syncEl.textContent !== t) syncEl.textContent = t;
    if (syncEl.scrollWidth - pad <= avail) { sync.shown = t; return; }
  }
  syncEl.dataset.where = '';
  sync.shown = '';
}
syncEl.addEventListener('click', async () => {
  if (sync.busy) return;
  sync.tap = true;
  const p = syncNow('tap');
  setSyncStatus();
  const ok = await p;
  sync.tap = false;
  setSyncStatus();
  if (ok) {
    const o = Math.round(sync.to), e = Math.max(1, Math.round(sync.err));
    toast(Math.abs(o) < 100 ? `Your clock is exact · off by ${Math.abs(o)} ms (±${e} ms)` : `Your clock is ${(Math.abs(o) / 1000).toFixed(3)} s ${o > 0 ? 'behind' : 'ahead'} · ±${e} ms`);
  } else toast('Couldn’t reach the time server — showing device time');
});

/* ======================================================================
   clock core (unchanged behaviour, dynamic time zone)
   ====================================================================== */
let fmt = null;
function setTzFormat(tz) {
  fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'short', month: 'short', day: 'numeric', timeZoneName: 'short',
  });
}
function nowParts(date) {
  const p = {};
  for (const { type, value } of fmt.formatToParts(date)) p[type] = value;
  return { H: parseInt(p.hour, 10) % 24, M: parseInt(p.minute, 10), S: parseInt(p.second, 10), weekday: p.weekday, month: p.month, day: p.day, zone: p.timeZoneName || '' };
}

const EASE_ROLL = 'cubic-bezier(.22, 1.25, .36, 1)';
function setCell(cell, ch, animate, delay) {
  if (cell.dataset.v === ch && cell.firstChild) return;
  cell.dataset.v = ch;
  while (cell.childNodes.length > 1) cell.firstChild.remove();
  const old = cell.firstChild;
  const nu = document.createElement('span');
  nu.textContent = ch;
  cell.appendChild(nu);
  if (!animate || !nu.animate) { if (old) old.remove(); return; }
  const isSec = cell.closest('.s');
  const dur = isSec ? 560 : 820;
  const opts = { duration: dur, easing: EASE_ROLL, delay: delay || 0, fill: 'backwards' };
  if (calm()) {
    nu.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out', delay: delay || 0, fill: 'backwards' });
    if (old) old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: 'ease-in', delay: delay || 0, fill: 'forwards' }).onfinish = () => old.remove();
    return;
  }
  nu.animate([{ transform: 'translateY(105%)', opacity: .15 }, { transform: 'translateY(0)', opacity: 1 }], opts);
  if (old) old.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-105%)', opacity: .1 }], { ...opts, fill: 'forwards' }).onfinish = () => old.remove();
}

let last = null;
function render(now, mode) {
  const t = nowParts(now);
  const hDisp = state.h24 ? t.H : (t.H % 12 || 12);
  const hs = String(hDisp).padStart(2, '0');
  const ms = String(t.M).padStart(2, '0');
  const ss = String(t.S).padStart(2, '0');
  const chars = hs + ms + ss;
  const animate = mode !== 'instant';
  cells.forEach((c, i) => setCell(c, chars[i], animate, mode === 'intro' ? 90 * i : 0));
  cells[0].classList.toggle('off', !state.h24 && hs[0] === '0');

  const gText = `${t.weekday} · ${t.month} ${t.day} · ${t.zone}`;
  if (greg.textContent !== gText) { greg.textContent = gText; layoutHeader(); }
  merEl.innerHTML = state.h24 ? '24H' : `<b>${t.H < 12 ? 'AM' : 'PM'}</b>`;
  const minuteChanged = !last || last.M !== t.M || last.H !== t.H || mode;
  if (minuteChanged) {
    srEl.textContent = `${hDisp}:${ms}${state.h24 ? '' : (t.H < 12 ? ' AM' : ' PM')} in ${state.loc.name}`;
    onMinute(now);
  }
  if (animate && !calm() && pulse.animate) {
    for (const d of dots) d.animate([{ opacity: 1 }, { opacity: .28 }], { duration: 1000, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards' });
    pulse.animate([{ transform: 'scale(.82)', opacity: .95 }, { transform: 'scale(1.18)', opacity: 0 }], { duration: 900, easing: 'cubic-bezier(.16,1,.3,1)' });
  } else if (calm()) {
    for (const d of dots) d.getAnimations && d.getAnimations().forEach((a) => a.cancel());
  }
  if (!last || t.S === 0 || mode) startSweep(now);
  last = t;
  onSecond(now);
}

let sweepAnim = null;
function startSweep(now) {
  now = now || nowDate();
  if (!fmt) return;
  const elapsed = nowParts(now).S * 1000 + now.getMilliseconds();
  const from = elapsed / 60000;
  if (sweepAnim) { sweepAnim.cancel(); sweepAnim = null; }
  if (calm() || !fill.animate) { fill.style.transform = `translateX(${(-(1 - from) * 100).toFixed(3)}%)`; return; }
  fill.style.transform = '';
  sweepAnim = fill.animate([{ transform: `translateX(${(-(1 - from) * 100).toFixed(3)}%)` }, { transform: 'translateX(0%)' }], { duration: Math.max(1, 60000 - elapsed), easing: 'linear', fill: 'forwards' });
}

let timer = 0;
// Tick on the true second: the next whole second of now(), not of the device clock.
function schedule() {
  clearTimeout(timer);
  const ms = 1000 - (now() % 1000);
  timer = setTimeout(tick, ms + 2);
}
function tick() {
  if (checkJump()) { /* re-measuring; keep ticking meanwhile */ }
  const t = now();
  if (t % 1000 > 900) { schedule(); return; } // woke a little early (offset glided): wait for the boundary
  render(new Date(t));
  schedule();
}

/* ======================================================================
   fit: as large as the space allows (+ choose how the zmanim line sits)
   ====================================================================== */
function setAppHeight() {
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight;
  html.style.setProperty('--app-h', Math.round(h) + 'px');
}
const LAYOUTS = ['row', 'split', 'stack'];
const BIAS = { row: 1.12, split: 1, stack: 1 };
function bestLayout() {
  const W = stage.clientWidth, H = stage.clientHeight;
  if (!W || !H) return null;
  let best = null;
  for (const L of LAYOUTS) {
    clock.className = L + (clock.dataset.ready ? ' ready' : '');
    let size = 100;
    for (let k = 0; k < 2; k++) {
      clock.style.fontSize = size + 'px';
      const r = clock.getBoundingClientRect();
      size = size * Math.min(W / r.width, H / r.height);
    }
    size = Math.floor(size * 0.995);
    const score = size * BIAS[L];
    if (!best || score > best.score) best = { L, size, score };
  }
  return best;
}
// The zmanim line costs nothing when it fits between the footer labels ("inline").
// Otherwise it takes one small row ("stacked"). The wide sun arc ("rich") is only
// used when it doesn't shrink the digits.
function inlineFits() {
  const saveL = zlabel.textContent, saveC = zcount.textContent;
  zlabel.textContent = longestLabel(); zcount.textContent = '00:00:00';
  const need = zline.scrollWidth - 24; // minus the tap-target padding
  zlabel.textContent = saveL; zcount.textContent = saveC;
  const side = Math.max(foot.querySelector('.home').scrollWidth, merEl.scrollWidth + 30);
  return need + 2 * side + 24 <= foot.clientWidth;
}
let fitRAF = 0;
function fit() {
  cancelAnimationFrame(fitRAF);
  fitRAF = requestAnimationFrame(() => {
    setAppHeight();
    // (a running slide only translates the clock, so its measured size is unaffected)
    const avail = zAvailable();
    let pick = null;
    if (!avail) {
      document.body.dataset.zm = 'none';
      pick = bestLayout();
    } else {
      document.body.dataset.zm = 'inline';
      let base;
      if (inlineFits()) base = { zm: 'inline', ...bestLayout() };
      else { document.body.dataset.zm = 'stacked'; base = { zm: 'stacked', ...bestLayout() }; }
      pick = base;
      if (sunDay()) {
        document.body.dataset.zm = 'rich';
        const rich = bestLayout();
        if (rich && base.size && rich.size >= base.size * 0.99) pick = { zm: 'rich', ...rich };
      }
      document.body.dataset.zm = pick.zm;
    }
    if (pick && pick.L) {
      clock.className = pick.L + (clock.dataset.ready ? ' ready' : '');
      clock.style.fontSize = pick.size + 'px';
    }
    layoutHeader();
    drawArcs(nowDate());
    placeSync();
  });
}
// Hebrew date: on the same line as the date when it fits, otherwise it gently alternates.
function layoutHeader() {
  if (!heb.textContent) { dateEl.className = 'joined'; return; }
  dateEl.className = 'joined';
  const need = cityBtn.scrollWidth + favdotsEl.offsetWidth + dateEl.scrollWidth + 24;
  dateEl.className = need <= top.clientWidth ? 'joined' : 'alt' + (flip ? ' flip' : '');
}
let flip = false;
setInterval(() => {
  if (!dateEl.classList.contains('alt') || document.hidden) return;
  flip = !flip;
  dateEl.classList.toggle('flip', flip);
}, 7000);

/* ======================================================================
   zmanim: Chabad.org (via /api/zmanim) when available, else local calculation
   ====================================================================== */
const LABELS = {
  alos: 'Alos Hashachar', misheyakir: 'Misheyakir', sunrise: 'Netz', sofZmanShma: 'Sof Zman Shema',
  sofZmanTefila: 'Sof Zman Tefillah', chatzos: 'Chatzos', minchaGedola: 'Mincha Gedolah',
  minchaKetana: 'Mincha Ketanah', plagHamincha: 'Plag Hamincha', sunset: 'Shkiah', tzeis: 'Tzeis',
  candleLighting: 'Candle lighting', shabbosEnds: 'Shabbos ends', holidayEnds: 'Yom Tov ends',
  fastBegins: 'Fast begins', fastEnds: 'Fast ends', chatzosLayla: 'Chatzos Halaylah',
};
const CALC_KEYS = ['alos', 'misheyakir', 'sunrise', 'sofZmanShma', 'sofZmanTefila', 'chatzos', 'minchaGedola',
  'minchaKetana', 'plagHamincha', 'candleLighting', 'sunset', 'tzeis', 'shabbosEnds'];
const PRIORITY = { candleLighting: 3, fastBegins: 3, shabbosEnds: 3, holidayEnds: 3, fastEnds: 3 };
const ENDS = new Set(['shabbosEnds', 'holidayEnds']);
const CANDLE_OPTIONS = [18, 20, 22, 30, 40];
const END_OPTIONS = [['deg', '8.5°'], ['42', '42 min'], ['50', '50 min'], ['72', '72 min']];

const apiQuery = (loc) => loc.zip ? `zip=${loc.zip}` : loc.chabadCityId ? `cityid=${loc.chabadCityId}` : null;
function candlePrefs() { const m = lsJSON(KEY.candle, {}); return m && typeof m === 'object' ? m : {}; }
function candleOverride(loc) { const v = candlePrefs()[loc.id]; return CANDLE_OPTIONS.includes(v) ? v : null; }
function candleFor(loc) { return candleOverride(loc) || loc.candleMinutes || 18; }
function endsPref() { const v = lsGet(KEY.ends); return END_OPTIONS.some(([k]) => k === v) ? v : 'deg'; }

async function fetchJSON(url, ms = 8000) {
  const ctl = 'AbortController' in window ? new AbortController() : null;
  const t = setTimeout(() => ctl && ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl && ctl.signal, headers: { accept: 'application/json' } });
    const body = await r.json().catch(() => null);
    return { status: r.status, body };
  } finally { clearTimeout(t); }
}
const validApi = (j) => j && j.source === 'chabad.org' && Array.isArray(j.days) && j.days.length && j.days.every((d) => /^\d{4}-\d\d-\d\d$/.test(d.date) && Array.isArray(d.items));
function pruneCache(keep) {
  try {
    const dead = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(KEY.zcache)) { const d = k.slice(-10); if (d < keep) dead.push(k); }
    }
    dead.forEach((k) => localStorage.removeItem(k));
  } catch (e) {}
}

function fromApi(json, loc) {
  const cOver = candleOverride(loc), ends = endsPref();
  const days = json.days.map((day) => {
    const ymd = parseYMD(day.date);
    const items = [];
    for (const it of day.items) {
      if (!it || it.key === 'other' || it.minutes == null) continue;
      const min = it.minutes + (it.nextDay && it.minutes < 1440 ? 1440 : 0);
      items.push({ key: it.key, label: it.label || LABELS[it.key] || it.key, sub: it.chabadLabel || '', at: zonedTime(ymd, min, loc.tz), after: !!it.after, also: it.also || null });
    }
    const sunset = items.find((i) => i.key === 'sunset');
    // honour the user's own customs on top of Chabad.org's times
    if (sunset) for (const i of items) {
      if (i.key === 'candleLighting' && !i.after && cOver) { i.at = new Date(+sunset.at - cOver * MIN); i.custom = true; }
      if (i.key === 'shabbosEnds' && ends !== 'deg') { i.at = new Date(+sunset.at + +ends * MIN); i.custom = true; }
    }
    items.sort((a, b) => a.at - b.at);
    return { date: day.date, ymd, items, hebrewDate: day.hebrewDate || '' };
  });
  return { source: 'chabad', days, credit: json.credit || 'Zmanim courtesy of Chabad.org', link: json.link || 'https://www.chabad.org/calendar/zmanim.htm', location: json.location || '' };
}
function fromCalc(loc, todayYMD) {
  const zloc = { lat: loc.lat, lon: loc.lon, tz: loc.tz, candleMinutes: candleFor(loc) };
  const ends = endsPref();
  const opts = { candleMinutes: candleFor(loc) };
  if (ends !== 'deg') opts.shabbosEnds = { type: 'minutes', value: +ends };
  const L = Z.ZMANIM_LABELS || {};
  const days = [0, 1].map((n) => {
    const ymd = addDaysYMD(todayYMD, n);
    const z = Z.zmanim({ y: ymd.y, m: ymd.m, d: ymd.d }, zloc, opts) || {};
    const items = [];
    for (const key of CALC_KEYS) {
      const t = z[key];
      if (!t) continue;
      const at = Z.roundZman ? Z.roundZman(t, key) : new Date(Math.round(+t / MIN) * MIN);
      items.push({ key, label: L[key] || LABELS[key], sub: '', at });
    }
    items.sort((a, b) => a.at - b.at);
    return { date: ymdStr(ymd), ymd, items, hebrewDate: '' };
  });
  return { source: 'calc', days };
}

let schedSeq = 0;
async function loadSchedule() {
  const loc = state.loc, token = ++schedSeq;
  const today = ymdIn(nowDate(), loc.tz), todayStr = ymdStr(today);
  let s = null;
  const q = apiQuery(loc);
  if (q) {
    const ck = `${KEY.zcache}${q}:${todayStr}`;
    let json = lsJSON(ck, null);
    if (!validApi(json) || json.days[0].date !== todayStr) {
      json = null;
      try {
        const r = await fetchJSON(`/api/zmanim?${q}&date=${todayStr}&days=2`);
        if (r.status === 200 && validApi(r.body) && r.body.days[0].date === todayStr) {
          json = r.body;
          lsSetJSON(ck, json);
          pruneCache(ymdStr(addDaysYMD(today, -1)));
        }
      } catch (e) { /* offline / no function: fall back */ }
    }
    if (token !== schedSeq) return;
    if (json) {
      s = fromApi(json, loc);
      if (loc.kind === 'zip' && json.location && loc.name !== json.location) {
        loc.name = json.location; showName(); saveLoc();
      }
    }
  }
  if (!s && hasCoords(loc)) {
    await zReady;
    if (token !== schedSeq) return;
    if (Z) { try { s = fromCalc(loc, today); } catch (e) { s = null; } }
  }
  if (s) s.forDate = todayStr;
  state.sched = s;
  target = null;
  zline.classList.remove('wait');
  if (zSheet.classList.contains('open')) renderZSheet();
  onMinute(nowDate());
  fit();
}

const allItems = () => state.sched ? state.sched.days.flatMap((d) => d.items) : [];
function todayDay(now) {
  if (!state.sched) return null;
  const s = ymdStr(ymdIn(now, state.loc.tz));
  return state.sched.days.find((d) => d.date === s) || null;
}
// What the quiet line counts down to.
function computeTarget(now) {
  const t = +now, day = todayDay(now);
  if (!day) return null;
  const items = allItems().filter((i) => i.key !== 'other');
  const future = (i) => +i.at > t;
  const candle = day.items.find((i) => i.key === 'candleLighting' && !i.after);
  // Shabbos / Yom Tov in progress: count to its end
  const endToday = day.items.find((i) => ENDS.has(i.key) && future(i));
  if (endToday && (!candle || !future(candle))) return endToday;
  if (candle) {
    if (future(candle)) return candle; // Friday / erev Yom Tov: candle lighting all day
    const end = items.find((i) => ENDS.has(i.key) && future(i));
    if (end) return end;
  }
  // otherwise the next zman (prefer the meaningful one among simultaneous items)
  let best = null;
  for (const i of items) {
    if (!future(i) || (i.key === 'candleLighting' && i.after)) continue;
    if (!best || +i.at < +best.at || (+i.at === +best.at && (PRIORITY[i.key] || 0) > (PRIORITY[best.key] || 0))) best = i;
  }
  return best;
}
const zAvailable = () => !!(state.sched && computeTarget(nowDate()));
function longestLabel() {
  const labs = allItems().filter((i) => i.key !== 'other').map((i) => i.label);
  return labs.reduce((a, b) => (b.length > a.length ? b : a), 'Shkiah');
}

let target = null, lastTargetKey = '';
function onSecond(now) {
  if (!state.sched) { if (document.body.dataset.zm !== 'none' && document.body.dataset.zm) fit(); return; }
  if (ymdStr(ymdIn(now, state.loc.tz)) !== state.sched.forDate) { state.sched = null; loadSchedule(); return; }
  if (!target || +target.at <= +now) target = computeTarget(now);
  if (!target) { if (document.body.dataset.zm !== 'none') fit(); return; }
  const k = target.key + target.label;
  if (k !== lastTargetKey) {
    lastTargetKey = k;
    zlabel.textContent = target.label;
    zline.classList.toggle('accent', target.key === 'candleLighting');
    zline.classList.toggle('soft', ENDS.has(target.key) || target.key === 'fastBegins' || target.key === 'fastEnds');
    zline.setAttribute('aria-label', `${target.label} at ${hm(target.at, state.loc.tz, state.h24)}. Show all zmanim.`);
    if (document.body.dataset.zm === 'none') fit();
    if (zSheet.classList.contains('open')) renderZSheet();
  }
  zcount.textContent = countdown(+target.at - +now);
}

/* ======================================================================
   Hebrew date (rolls over at sunset)
   ====================================================================== */
function sunsetToday(now) {
  const day = todayDay(now);
  const it = day && day.items.find((i) => i.key === 'sunset');
  if (it) return it.at;
  if (Z && hasCoords(state.loc)) {
    try { const y = ymdIn(now, state.loc.tz); const st = Z.sunTimes({ y: y.y, m: y.m, d: y.d }, state.loc); return st && st.sunset; } catch (e) {}
  }
  return null;
}
function hebrewDate(now) {
  try {
    const f = fmtFor(state.loc.tz, 'heb', { locale: 'en-u-ca-hebrew', day: 'numeric', month: 'long', year: 'numeric' });
    const ss = sunsetToday(now);
    const after = ss && +now >= +ss;
    return { text: f.format(after ? new Date(+now + DAY) : now), after };
  } catch (e) { return { text: '', after: false }; }
}
function updateHebrew(now) {
  const h = hebrewDate(now);
  if (heb.textContent !== h.text) { heb.textContent = h.text; layoutHeader(); }
  heb.title = h.after ? 'Hebrew date — began at sunset (nightfall)' : 'Hebrew date — the next day begins at nightfall';
}

/* ======================================================================
   sun: arc + live sky
   ====================================================================== */
function sunDay(now = nowDate()) {
  // { rise, set } for the local day, from the schedule or the engine
  const day = todayDay(now);
  let rise = day && day.items.find((i) => i.key === 'sunrise');
  let set = day && day.items.find((i) => i.key === 'sunset');
  if (rise && set) return { rise: rise.at, set: set.at };
  if (Z && hasCoords(state.loc)) {
    try {
      const y = ymdIn(now, state.loc.tz);
      const st = Z.sunTimes({ y: y.y, m: y.m, d: y.d }, state.loc);
      if (st && st.sunrise && st.sunset) return { rise: st.sunrise, set: st.sunset };
    } catch (e) {}
  }
  return null;
}
const SVGNS = 'http://www.w3.org/2000/svg';
function drawArc(svg, W, H, now, sd, big) {
  if (!sd) { svg.innerHTML = ''; return; }
  const pad = big ? 6 : 2, base = H - 1.5, rx = (W - 2 * pad) / 2, ry = H - (big ? 6 : 3), cx = W / 2;
  const pt = (f) => { const a = Math.PI * (1 - f); return [cx + rx * Math.cos(a), base - ry * Math.sin(a)]; };
  const t = +now, rise = +sd.rise, set = +sd.set;
  const id = svg.id;
  let body = `<defs><linearGradient id="${id}g" x1="0" x2="1"><stop offset="0" stop-color="var(--a1)"/><stop offset=".55" stop-color="var(--a3)"/><stop offset="1" stop-color="var(--a2)"/></linearGradient>` +
    `<radialGradient id="${id}h"><stop offset="0" stop-color="#fff7d6" stop-opacity=".9"/><stop offset=".35" stop-color="var(--a3)" stop-opacity=".45"/><stop offset="1" stop-color="var(--a3)" stop-opacity="0"/></radialGradient></defs>`;
  body += `<line class="hz" x1="0" y1="${base}" x2="${W}" y2="${base}"/>`;
  body += `<path class="track" d="M${pad},${base} A${rx},${ry} 0 0 1 ${W - pad},${base}"/>`;
  if (t >= rise && t <= set) {
    const f = (t - rise) / (set - rise);
    const [x, y] = pt(f);
    body += `<path class="done" stroke="url(#${id}g)" d="M${pad},${base} A${rx},${ry} 0 0 1 ${x.toFixed(2)},${y.toFixed(2)}"/>`;
    const r = big ? 2.6 : 1.9;
    body += `<circle class="halo" cx="${x}" cy="${y}" r="${big ? 11 : 6}" fill="url(#${id}h)"/><circle class="sun" cx="${x}" cy="${y}" r="${r}"/>`;
  } else {
    // night: a faint moon drifts across from sunset to the next sunrise
    const prevSet = t < rise ? set - DAY : set, nextRise = t < rise ? rise : rise + DAY;
    const f = clamp((t - prevSet) / (nextRise - prevSet), 0, 1);
    const [x, y] = pt(f);
    const r = big ? 3 : 2;
    body += `<circle class="moon" cx="${x}" cy="${y}" r="${r}"/><circle class="moon-cut" cx="${x + r * .55}" cy="${y - r * .35}" r="${r * .85}"/>`;
  }
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = body;
}
function drawArcs(now) {
  const sd = zAvailable() ? sunDay(now) : null;
  const zm = document.body.dataset.zm;
  if (zm === 'rich' && sd) {
    const W = Math.round(arcBig.getBoundingClientRect().width) || 240;
    drawArc(arcBig, W, 26, now, sd, true);
    riseT.textContent = hm(sd.rise, state.loc.tz, state.h24, { bare: true });
    setT.textContent = hm(sd.set, state.loc.tz, state.h24, { bare: true });
  } else { arcBig.innerHTML = ''; }
  drawArc(arcMini, 24, 12, now, sd, false);
  arcMini.style.display = sd && zm !== 'rich' ? '' : 'none';
}

// sky palette by solar altitude (degrees) — the original violet sky
const SKY_VIOLET = [
  [-90, [44, 30, 110, .10], [20, 14, 60, 0], [5, 5, 10, 0]],
  [-18, [52, 34, 128, .12], [30, 20, 80, .02], [8, 6, 20, .2]],
  [-12, [104, 66, 214, .19], [139, 92, 246, .08], [18, 12, 44, .34]],
  [-6, [190, 86, 228, .22], [139, 92, 246, .1], [26, 16, 56, .38]],
  [-1, [236, 104, 172, .24], [251, 146, 60, .12], [28, 20, 60, .38]],
  [4, [248, 152, 96, .17], [232, 121, 249, .09], [16, 26, 56, .38]],
  [14, [34, 211, 238, .12], [80, 120, 246, .08], [10, 34, 64, .4]],
  [40, [34, 211, 238, .15], [90, 170, 255, .09], [12, 44, 76, .44]],
  [90, [34, 211, 238, .15], [90, 170, 255, .09], [12, 44, 76, .44]],
];
const mix = (a, b, f) => a.map((v, i) => v + (b[i] - v) * f);
// Other site themes (/assets/theme.js): the same sky rebuilt from that palette —
// night tinted from a1, dusk a1→a3, day a2. Sunrise/sunset stay naturally warm.
function skyFor(p) {
  if (!p || p.name === 'violet') return SKY_VIOLET;
  const { a1, a2, a3, a12, a1lo } = p.rgb;
  const k = (c, f, al) => [c[0] * f, c[1] * f, c[2] * f, al];
  const m = (x, y, f, al) => [...mix(x, y, f), al];
  const sk = (f, al) => [...mix([5, 5, 10], mix(a1lo, a2, f), .22), al];
  return [
    [-90, k(a1, .32, .10), k(a1, .14, 0), [5, 5, 10, 0]],
    [-18, k(a1, .38, .12), k(a1, .22, .02), [...mix([5, 5, 10], a1lo, .1), .2]],
    [-12, k(a1, .8, .19), [...a1, .08], sk(0, .34)],
    [-6, m(a1, a3, .55, .22), [...a1, .1], sk(.1, .38)],
    [-1, [236, 104, 172, .24], [251, 146, 60, .12], sk(.15, .38)],
    [4, [248, 152, 96, .17], [...a3, .09], sk(.5, .38)],
    [14, [...a2, .12], [...a12, .08], sk(.75, .4)],
    [40, [...a2, .15], m(a12, a2, .5, .09), sk(1, .44)],
    [90, [...a2, .15], m(a12, a2, .5, .09), sk(1, .44)],
  ];
}
const THEME = window.SZVTheme || null;
let SKY = skyFor(THEME && THEME.palette());
const rgba = (c) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${c[3].toFixed(3)})`;
function altitudeProxy(now) {
  // when there are no coordinates (ZIP-only): estimate from the day's times
  const day = todayDay(now);
  if (!day) return null;
  const g = (k) => { const i = day.items.find((x) => x.key === k); return i ? +i.at : null; };
  const rise = g('sunrise'), set = g('sunset'), alos = g('alos') || (rise && rise - 72 * MIN), tzeis = g('tzeis') || g('shabbosEnds') || (set && set + 40 * MIN);
  if (!rise || !set) return null;
  const t = +now, noon = (rise + set) / 2;
  if (t < alos) return -24;
  if (t < rise) return -16 + 16 * (t - alos) / (rise - alos);
  if (t < set) return 48 * Math.sin(Math.PI * (t - rise) / (set - rise)) * (t < noon ? 1 : 1);
  if (t < tzeis) return -8 * (t - set) / (tzeis - set);
  return Math.max(-24, -8 - 16 * (t - tzeis) / (90 * MIN));
}
let skySet = false;
function updateSky(now) {
  let alt = null;
  if (Z && hasCoords(state.loc)) { try { alt = Z.sunPosition(now, state.loc).altitude; } catch (e) {} }
  if (alt == null) alt = altitudeProxy(now);
  if (alt == null || !isFinite(alt)) { sky.style.opacity = '0'; return; }
  sky.style.opacity = '1';
  let i = 0;
  while (i < SKY.length - 2 && alt > SKY[i + 1][0]) i++;
  const [a0, g0, h0, t0] = SKY[i], [a1, g1, h1, t1] = SKY[i + 1];
  const f = clamp((alt - a0) / (a1 - a0), 0, 1);
  const sd = sunDay(now);
  let x = 50;
  if (sd) x = 10 + 80 * clamp((+now - +sd.rise) / (+sd.set - +sd.rise), 0, 1);
  if (!skySet) sky.classList.add('now');
  sky.style.setProperty('--sky-glow', rgba(mix(g0, g1, f)));
  sky.style.setProperty('--sky-glow2', rgba(mix(h0, h1, f)));
  sky.style.setProperty('--sky-top', rgba(mix(t0, t1, f)));
  sky.style.setProperty('--sky-x', x.toFixed(1) + '%');
  if (!skySet) { skySet = true; requestAnimationFrame(() => requestAnimationFrame(() => sky.classList.remove('now'))); }
  sky.dataset.alt = alt.toFixed(1);
}

if (THEME) THEME.on((name, p) => {
  SKY = skyFor(p);
  if (skySet && !reduce) { sky.classList.add('quick'); setTimeout(() => sky.classList.remove('quick'), 3500); }
  updateSky(nowDate());
});

function onMinute(now) {
  updateHebrew(now);
  updateSky(now);
  drawArcs(now);
}

/* ======================================================================
   location switching
   ====================================================================== */
function showName() {
  // ZIP locations read "Brooklyn, NY 11213" from Chabad.org; the header keeps it short
  cname.textContent = state.loc.kind === 'zip' ? state.loc.name.split(',')[0] : state.loc.name;
  cityBtn.title = state.loc.name;
  cityBtn.setAttribute('aria-label', `Location: ${state.loc.name}. Change location`);
  clock.setAttribute('aria-label', `Current time in ${state.loc.name}. Tap to switch 12/24 hour. Long-press for bedside mode.`);
  document.title = state.loc.id === DEFAULT_CITY_ID ? 'NYC Time · SZVTECH' : `${state.loc.name} Time · SZVTECH`;
}
function saveLoc() { lsSetJSON(KEY.loc, slim(state.loc)); }
function setLocation(loc, opts = {}) {
  state.loc = loc;
  setTzFormat(loc.tz);
  state.sched = null; target = null; lastTargetKey = '';
  zline.classList.add('wait');
  heb.textContent = '';
  showName();
  renderFavDots();
  if (opts.persist !== false) saveLoc();
  if (opts.url) writeURL(loc);
  if (skySet) { sky.classList.add('quick'); setTimeout(() => sky.classList.remove('quick'), 3500); }
  if (fmt && clock.dataset.ready) render(nowDate(), 'instant');
  updateHebrew(nowDate());
  loadSchedule();
  fit();
}
let switching = false;
async function switchTo(loc, dir = 1) {
  if (switching || sameLoc(loc, state.loc)) return;
  switching = true;
  const els = [clock, cname];
  try {
    if (calm() || !clock.animate) {
      await Promise.all(els.map((e) => e.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-in', fill: 'forwards' }).finished));
      setLocation(loc, { url: true });
      await Promise.all(els.map((e) => e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' }).finished));
      els.forEach((e) => e.getAnimations().forEach((a) => a.cancel()));
    } else {
      const off = clock.style.transform || 'translateX(0)';
      await Promise.all([
        clock.animate([{ transform: off, opacity: 1 }, { transform: `translateX(${-dir * 9}%)`, opacity: 0 }], { duration: 230, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).finished,
        cname.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).finished,
      ]);
      clock.style.transform = '';
      setLocation(loc, { url: true });
      await Promise.all([
        clock.animate([{ transform: `translateX(${dir * 9}%)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' }).finished,
        cname.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380 }).finished,
      ]);
      [clock, cname].forEach((e) => e.getAnimations().forEach((a) => a.cancel()));
    }
  } catch (e) { /* animation interrupted */ }
  switching = false;
}

/* ---------- favorites ---------- */
const favLocs = () => state.favs.map(revive).filter(Boolean);
const isFav = (loc) => state.favs.some((f) => f && f.id === loc.id);
function toggleFav(loc) {
  if (isFav(loc)) state.favs = state.favs.filter((f) => f.id !== loc.id);
  else state.favs = [...state.favs, slim(loc)];
  lsSetJSON(KEY.favs, state.favs);
  renderFavDots();
}
function renderFavDots() {
  const favs = favLocs();
  if (favs.length < 2) { favdotsEl.innerHTML = ''; return; }
  favdotsEl.innerHTML = favs.slice(0, 9).map((f) => `<b class="${sameLoc(f, state.loc) ? 'on' : ''}"></b>`).join('');
}
function canCycle() {
  const favs = favLocs();
  return favs.length >= 2 || (favs.length === 1 && !sameLoc(favs[0], state.loc));
}
function cycle(step) {
  const favs = favLocs();
  if (!canCycle()) {
    toast(favs.length ? 'Star one more city to swipe between them' : 'Star cities in the location list to swipe');
    return false;
  }
  const i = favs.findIndex((f) => sameLoc(f, state.loc));
  const next = i < 0 ? (step > 0 ? favs[0] : favs[favs.length - 1]) : favs[(i + step + favs.length) % favs.length];
  switchTo(next, step);
  return true;
}

/* ======================================================================
   toast
   ====================================================================== */
let toastT = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

/* ======================================================================
   12h/24h, bedside, gestures
   ====================================================================== */
function toggle24() {
  state.h24 = !state.h24;
  lsSet(KEY.h24, state.h24 ? '1' : '0');
  render(nowDate(), 'toggle');
  drawArcs(nowDate());
  placeSync();
  if (zSheet.classList.contains('open')) renderZSheet();
}
function toggleNight() {
  state.night = !state.night;
  html.classList.toggle('night', state.night);
  lsSet(KEY.night, state.night ? '1' : '0');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = '#000000';
  if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
  toast(state.night ? 'Bedside mode — long-press to exit' : 'Bedside mode off');
  startSweep();
  render(nowDate(), 'instant');
}

let gesture = null, consumed = false;
stage.style.touchAction = 'none';
stage.addEventListener('pointerdown', (e) => {
  if (e.button > 0) return;
  consumed = false;
  gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, swipe: false, lp: 0 };
  const g = gesture;
  g.lp = setTimeout(() => {
    if (gesture === g && !g.moved) { consumed = true; g.done = true; toggleNight(); }
  }, 600);
});
stage.addEventListener('pointermove', (e) => {
  const g = gesture;
  if (!g || e.pointerId !== g.id || g.done) return;
  const dx = e.clientX - g.x, dy = e.clientY - g.y;
  if (!g.moved && Math.hypot(dx, dy) > 10) {
    g.moved = true; clearTimeout(g.lp);
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
  }
  if (g.moved && Math.abs(dx) > Math.abs(dy) && !calm() && !switching && canCycle()) {
    g.swipe = true;
    clock.style.transform = `translateX(${(dx * 0.28).toFixed(1)}px)`;
    clock.style.opacity = String(1 - Math.min(.5, Math.abs(dx) / 600));
  }
});
function endGesture(e, cancelled) {
  const g = gesture;
  if (!g || e.pointerId !== g.id) return;
  clearTimeout(g.lp);
  gesture = null;
  const dx = e.clientX - g.x, dy = e.clientY - g.y;
  if (g.moved) consumed = true;
  if (!cancelled && !g.done && g.moved && Math.abs(dx) > 50 && Math.abs(dx) > 1.4 * Math.abs(dy)) {
    if (canCycle() && !switching) { clock.style.opacity = ''; cycle(dx < 0 ? 1 : -1); }
    else { springBack(); cycle(dx < 0 ? 1 : -1); }
  } else springBack();
}
function springBack() {
  if (!clock.style.transform && !clock.style.opacity) return;
  const from = clock.style.transform || 'translateX(0)', op = clock.style.opacity || 1;
  clock.style.transform = ''; clock.style.opacity = '';
  if (clock.animate && !calm()) clock.animate([{ transform: from, opacity: op }, { transform: 'translateX(0)', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.16,1,.3,1)' });
}
stage.addEventListener('pointerup', (e) => endGesture(e, false));
stage.addEventListener('pointercancel', (e) => endGesture(e, true));
clock.addEventListener('click', () => { if (consumed) { consumed = false; return; } toggle24(); });
clock.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle24(); } });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (openSheet) closeSheet(); return; }
  if (openSheet || e.target.closest && e.target.closest('input, select, textarea')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); cycle(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); cycle(-1); }
  else if (e.key === 'b' || e.key === 'B') toggleNight();
});

/* ======================================================================
   sheets
   ====================================================================== */
const citySheet = $('#citySheet'), zSheet = $('#zSheet');
let openSheet = null, lastFocus = null;
function showSheet(el) {
  if (openSheet && openSheet !== el) closeSheet(true);
  openSheet = el;
  lastFocus = document.activeElement;
  el.classList.add('open');
  scrim.classList.add('open');
  el.setAttribute('aria-hidden', 'false');
}
function closeSheet(quick) {
  const el = openSheet;
  if (!el) return;
  openSheet = null;
  el.classList.remove('open', 'dragging');
  el.style.transform = '';
  el.setAttribute('aria-hidden', 'true');
  if (!quick) scrim.classList.remove('open');
  if (document.activeElement && el.contains(document.activeElement)) document.activeElement.blur();
  if (!quick && lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
}
[citySheet, zSheet].forEach((el) => {
  el.setAttribute('aria-hidden', 'true');
  el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
  // swipe down on the header to dismiss
  const head = el.querySelector('.sheet-head');
  let d = null;
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('input, button, select, label')) return;
    d = { id: e.pointerId, y: e.clientY, t: performance.now(), dy: 0 };
    try { head.setPointerCapture(e.pointerId); } catch (err) {}
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
    el.classList.remove('dragging');
    el.style.transform = '';
    if (d.dy > 90 || (d.dy > 30 && v > .5)) closeSheet();
    d = null;
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
});
scrim.addEventListener('click', () => closeSheet());
// keep Tab inside the open sheet
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || !openSheet) return;
  const f = [...openSheet.querySelectorAll('button, input, select, a[href]')].filter((x) => x.offsetParent !== null && !x.disabled);
  if (!f.length) return;
  const i = f.indexOf(document.activeElement);
  if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
  else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
});
const coarse = matchMedia('(pointer: coarse)').matches;

/* ---------- location sheet ---------- */
const listEl = $('#list'), qEl = $('#q'), emptyEl = $('#empty');
const STAR = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.2l2.35 4.9 5.35.68-3.93 3.7.98 5.3L10 14.2l-4.75 2.58.98-5.3L2.3 7.78l5.35-.68z"/></svg>';
function rowHTML(loc, now) {
  const time = hm(now, loc.tz, state.h24);
  const sub = loc.kind === 'city' ? loc.country : loc.kind === 'zip' ? `ZIP ${loc.zip} · ${tzCity(loc.tz)}` : loc.country || tzCity(loc.tz);
  const fav = isFav(loc);
  return `<div class="row${sameLoc(loc, state.loc) ? ' cur' : ''}" data-id="${esc(loc.id)}">` +
    `<button class="pick" type="button" role="option" aria-selected="${sameLoc(loc, state.loc)}"><span class="nm"><b>${esc(loc.name)}</b><small>${esc(sub)}</small></span><span class="tm">${time}</span></button>` +
    `<button class="star" type="button" aria-pressed="${fav}" aria-label="${fav ? 'Remove' : 'Add'} ${esc(loc.name)} ${fav ? 'from' : 'to'} favorites">${STAR}</button></div>`;
}
let rowIndex = new Map();
function renderList() {
  const now = nowDate();
  const q = norm(qEl.value).trim();
  rowIndex = new Map();
  let out = '', n = 0;
  const add = (loc) => { rowIndex.set(loc.id, loc); n++; return rowHTML(loc, now); };
  if (!q) {
    const favs = favLocs();
    const cur = state.loc;
    if (favs.length) out += `<div class="grp-h">Favorites</div>` + favs.map(add).join('');
    if (cur.kind !== 'city' && !favs.some((f) => sameLoc(f, cur))) out += `<div class="grp-h">Current</div>` + add(cur);
    for (const r of REGIONS) {
      const cs = CITIES.filter((c) => c.region === r);
      if (cs.length) out += `<div class="grp-h">${esc(r)}</div>` + cs.map((c) => add(fromCity(c))).join('');
    }
  } else {
    const words = q.split(/\s+/);
    const scored = [];
    for (const c of CITIES) {
      const hay = norm(`${c.name} ${c.country} ${c.region} ${c.alt || ''} ${c.zip || ''}`);
      if (!words.every((w) => hay.includes(w))) continue;
      const nm = norm(c.name);
      scored.push([nm.startsWith(q) ? 0 : nm.includes(q) ? 1 : 2, c]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name));
    out = scored.map(([, c]) => add(fromCity(c))).join('');
  }
  listEl.innerHTML = out;
  emptyEl.hidden = n > 0;
}
listEl.addEventListener('click', (e) => {
  const row = e.target.closest('.row');
  if (!row) return;
  const loc = rowIndex.get(row.dataset.id);
  if (!loc) return;
  if (e.target.closest('.star')) {
    toggleFav(loc);
    const b = row.querySelector('.star'), on = isFav(loc);
    b.setAttribute('aria-pressed', on);
    b.setAttribute('aria-label', `${on ? 'Remove' : 'Add'} ${loc.name} ${on ? 'from' : 'to'} favorites`);
    if (!calm()) { b.classList.add('pop'); setTimeout(() => b.classList.remove('pop'), 220); }
    return;
  }
  closeSheet();
  if (!sameLoc(loc, state.loc)) switchTo(loc, 1);
});
qEl.addEventListener('input', renderList);
qEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { const first = listEl.querySelector('.pick'); if (first) first.click(); }
  if (e.key === 'ArrowDown') { const first = listEl.querySelector('.pick'); if (first) { e.preventDefault(); first.focus(); } }
});
function openCitySheet() {
  qEl.value = '';
  renderList();
  syncZipForm();
  const body = $('#cityBody');
  body.scrollTop = 0;
  showSheet(citySheet);
  const cur = listEl.querySelector('.row.cur');
  if (cur && state.loc.kind === 'city') requestAnimationFrame(() => { body.scrollTop = Math.max(0, cur.offsetTop - body.clientHeight / 2); });
  if (!coarse) setTimeout(() => qEl.focus({ preventScroll: true }), 60);
}
cityBtn.addEventListener('click', openCitySheet);

/* geolocation — asked only on tap; coordinates are kept on this device */
const geoBtn = $('#geoBtn'), geoStatus = $('#geoStatus');
geoBtn.addEventListener('click', () => {
  if (!('geolocation' in navigator)) { geoStatus.textContent = 'Not available in this browser'; return; }
  geoBtn.classList.add('busy');
  geoStatus.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition((pos) => {
    geoBtn.classList.remove('busy');
    geoStatus.textContent = 'Stays on this device';
    const lat = +pos.coords.latitude.toFixed(4), lon = +pos.coords.longitude.toFixed(4);
    const loc = { kind: 'here', id: 'here', name: MY_NAME, country: tzCity(deviceTz), tz: deviceTz, lat, lon };
    closeSheet();
    state.loc = state.loc.id === 'here' ? { ...state.loc, id: 'here-old' } : state.loc; // force refresh
    switchTo(loc, 1);
    // keep a starred "My location" up to date
    const i = state.favs.findIndex((f) => f && f.id === 'here');
    if (i >= 0) { state.favs[i] = slim(loc); lsSetJSON(KEY.favs, state.favs); }
  }, (err) => {
    geoBtn.classList.remove('busy');
    geoStatus.textContent = err && err.code === 1 ? 'Permission denied' : 'Location unavailable';
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * MIN });
});

/* ZIP code → Chabad.org zmanim */
const zipForm = $('#zipForm'), zipIn = $('#zipIn'), zipTzSel = $('#zipTz'), zipStatus = $('#zipStatus');
function fillTzOptions() {
  const z = zipIn.value.trim();
  const auto = /^\d{5}$/.test(z) ? zipToTz(z) : null;
  const autoName = auto ? (US_ZONES.find(([k]) => k === auto) || [auto, tzCity(auto)])[1] : '';
  const keep = zipTzSel.value;
  zipTzSel.innerHTML = `<option value="">${auto ? 'Auto · ' + esc(autoName) : 'Auto time zone'}</option>` +
    US_ZONES.map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  zipTzSel.value = keep;
}
function syncZipForm() {
  if (state.loc.kind === 'zip') {
    zipIn.value = state.loc.zip;
    fillTzOptions();
    zipTzSel.value = state.loc.tzAuto ? '' : state.loc.tz;
  } else { zipIn.value = ''; fillTzOptions(); zipTzSel.value = ''; }
  zipStatus.textContent = 'Zmanim from Chabad.org';
  zipStatus.classList.remove('err');
}
zipIn.addEventListener('input', () => {
  const v = zipIn.value.replace(/\D/g, '').slice(0, 5);
  if (v !== zipIn.value) zipIn.value = v;
  fillTzOptions();
  zipStatus.classList.remove('err');
  zipStatus.textContent = 'Zmanim from Chabad.org';
});
zipForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const zip = zipIn.value.trim();
  if (!/^\d{5}$/.test(zip)) { zipStatus.textContent = 'Enter a 5-digit US ZIP code'; zipStatus.classList.add('err'); zipIn.focus(); return; }
  const loc = zipLoc(zip, zipTzSel.value || null);
  zipStatus.classList.remove('err');
  zipStatus.textContent = 'Looking up…';
  const today = ymdStr(ymdIn(nowDate(), loc.tz));
  let name = null;
  try {
    const r = await fetchJSON(`/api/zmanim?zip=${zip}&date=${today}&days=2`);
    if (r.status === 404 || r.status === 400) { zipStatus.textContent = 'Chabad.org doesn’t know that ZIP code'; zipStatus.classList.add('err'); return; }
    if (r.status === 200 && validApi(r.body)) { name = r.body.location || null; lsSetJSON(`${KEY.zcache}zip=${zip}:${today}`, r.body); }
  } catch (err) { /* offline: still switch, zmanim fall back silently */ }
  if (name) loc.name = name;
  closeSheet();
  if (sameLoc(loc, state.loc)) setLocation(loc, { url: true }); else switchTo(loc, 1);
});

/* ---------- zmanim sheet ---------- */
const zList = $('#zList'), zDay = $('#zDay'), zWhere = $('#zWhere'), zNote = $('#zNote'), zDays = $('#zDays');
const candleChips = $('#candleChips'), endChips = $('#endChips');
let zDayIdx = 0;
function renderZSheet() {
  const s = state.sched;
  if (!s) { closeSheet(); return; }
  const now = nowDate(), tz = state.loc.tz;
  const day = s.days[zDayIdx] || s.days[0];
  zWhere.textContent = s.source === 'chabad' && s.location ? s.location : state.loc.name + (state.loc.kind === 'city' ? ', ' + state.loc.country : '');
  $$('#zDays button').forEach((b) => b.setAttribute('aria-selected', String(+b.dataset.day === zDayIdx)));
  const dname = fmtFor(tz, 'dlong', { weekday: 'short', month: 'short', day: 'numeric' }).format(zonedTime(day.ymd, 720, tz));
  const hd = fmtFor(tz, 'heb', { locale: 'en-u-ca-hebrew', day: 'numeric', month: 'long', year: 'numeric' }).format(zonedTime(day.ymd, 720, tz));
  zDay.textContent = `${dname} · ${day.hebrewDate || hd}`;
  // merge simultaneous items into one row
  const rows = [];
  for (const it of day.items) {
    const prev = rows[rows.length - 1];
    if (prev && +prev.at === +it.at && !prev.after && !it.after) { prev.parts.push(it); continue; }
    rows.push({ at: it.at, after: it.after, parts: [it] });
  }
  const tgt = target;
  zList.innerHTML = rows.map((r) => {
    const label = r.parts.map((p) => p.label).join(' · ');
    const sub = r.parts.map((p) => p.sub).filter(Boolean).join(' · ');
    const isNext = tgt && r.parts.includes(tgt);
    const past = +r.at <= +now;
    const key = r.parts.some((p) => PRIORITY[p.key]);
    const left = isNext ? `<em>in ${countdown(+r.at - +now).replace(/:\d\d$/, '')}</em>` : '';
    return `<li class="${past ? 'past' : ''}${isNext ? ' next' : ''}${key ? ' key' : ''}"><span class="lb"><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>` +
      `<span class="tv">${r.after ? '<small>not before</small> ' : ''}${hm(r.at, tz, state.h24, { html: true })}${left}</span></li>`;
  }).join('');
  // settings
  const cSel = candleFor(state.loc);
  candleChips.innerHTML = CANDLE_OPTIONS.map((m) => `<button type="button" data-v="${m}" aria-pressed="${m === cSel}">${m}</button>`).join('');
  const eSel = endsPref();
  endChips.innerHTML = END_OPTIONS.map(([k, v]) => `<button type="button" data-v="${k}" aria-pressed="${k === eSel}">${v}</button>`).join('');
  zNote.innerHTML = s.source === 'chabad'
    ? `<a href="${esc(s.link)}" target="_blank" rel="noopener">${esc(s.credit)}</a>.${candleOverride(state.loc) || eSel !== 'deg' ? ' Your candle-lighting / Shabbos-ends choices are applied on top.' : ''}`
    : 'Calculated times — may differ slightly from your community’s calendar.';
}
function autoDay(now) {
  // after today's last zman, show tomorrow
  const s = state.sched;
  if (!s || s.days.length < 2) return 0;
  const today = todayDay(now) || s.days[0];
  const last = today.items.filter((i) => i.key !== 'chatzosLayla').pop();
  return last && +now > +last.at ? 1 : 0;
}
zDays.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-day]');
  if (!b) return;
  zDayIdx = +b.dataset.day;
  renderZSheet();
});
candleChips.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]');
  if (!b) return;
  const m = candlePrefs();
  const v = +b.dataset.v;
  if (v === (state.loc.candleMinutes || 18)) delete m[state.loc.id]; else m[state.loc.id] = v;
  lsSetJSON(KEY.candle, m);
  reloadZ();
});
endChips.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]');
  if (!b) return;
  lsSet(KEY.ends, b.dataset.v === 'deg' ? null : b.dataset.v);
  reloadZ();
});
async function reloadZ() { await loadSchedule(); renderZSheet(); }
zline.addEventListener('click', () => {
  if (!state.sched) return;
  const now = nowDate();
  const i = state.sched.days.indexOf(todayDay(now));
  zDayIdx = Math.max(0, i) + autoDay(now);
  if (zDayIdx >= state.sched.days.length) zDayIdx = state.sched.days.length - 1;
  renderZSheet();
  showSheet(zSheet);
});
setInterval(() => { if (openSheet === zSheet) renderZSheet(); }, 15000);

/* ======================================================================
   wake lock & lifecycle
   ====================================================================== */
let wakeWanted = false, wakeLock = null;
async function requestWake() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    if (wakeLock && !wakeLock.released) return;
    wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) { /* ignore: battery saver, unsupported, denied */ }
}
document.addEventListener('pointerdown', () => { wakeWanted = true; requestWake(); }, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkJump();
    render(nowDate(), 'instant');
    schedule();
    if (wakeWanted) requestWake();
    if (pnow() - sync.at > 10000) syncNow('visible');
  } else clearTimeout(timer);
});
document.addEventListener('contextmenu', (e) => { if (!(e.target.closest && e.target.closest('input, a'))) e.preventDefault(); });
document.addEventListener('selectstart', (e) => { if (!(e.target.closest && e.target.closest('input'))) e.preventDefault(); });
addEventListener('resize', fit);
addEventListener('orientationchange', fit);
if (window.visualViewport) visualViewport.addEventListener('resize', fit);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);

/* ======================================================================
   go
   ====================================================================== */
const initial = locFromURL() || revive(lsJSON(KEY.loc, null)) || fromCity(cityById(DEFAULT_CITY_ID));
document.body.dataset.zm = 'none';
zline.classList.add('wait');
setLocation(initial, { persist: !!locFromURL() || !!lsGet(KEY.loc) });
setSyncStatus();
syncNow('load');
// start once the first server sample is in (or after 700 ms on a slow / offline network)
Promise.race([firstSample, new Promise((r) => setTimeout(r, 700))]).then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
  clock.dataset.ready = '1';
  clock.classList.add('ready');
  render(nowDate(), 'intro');
  schedule();
})));
zReady.then(() => { if (!state.sched) loadSchedule(); updateSky(nowDate()); drawArcs(nowDate()); });
