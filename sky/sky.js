// sky.js — /sky: the ISS live over a 3D Earth, its next passes over you, the Moon,
// tonight's twilight + planets, and a look-up sky chart.
//
//   astro.js   pure math (SGP4 orbit, Sun/Moon/planets, passes)    — unit-tested
//   globe.js   the three.js Earth (loaded lazily: the page still works without WebGL)
//   /api/iss   fresh ISS orbit elements (CelesTrak / wheretheiss.at); the page
//              keeps working from a built-in orbit if that fails
//
// Libraries (pinned CDN scripts in index.html): satellite.js, astronomy-engine.
// Nothing about the visitor leaves the device: the location only picks which
// sky to compute and is never sent anywhere.
import * as X from '/sky/astro.js?v=941f310d1e';
import { CITIES, REGIONS, cityById } from '/time/cities.js?v=8a8909ac4d';

const $ = (id) => document.getElementById(id);
const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
const reduce = () => reduceMQ.matches;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MINUS = '−';

/* ======================================================================
   storage (always try/catch)
   ====================================================================== */
const K = { time: 'szv-time-loc', sky: 'szv-sky-loc', h24: 'szv-time-24h', all: 'szv-sky-all', tle: 'szv-sky-tle' };
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
const lsJSON = (k) => { try { return JSON.parse(lsGet(k)); } catch (e) { return null; } };

/* ======================================================================
   libraries
   ====================================================================== */
function loadScript(src) {
  return new Promise((res) => {
    const s = document.createElement('script');
    s.src = src; s.crossOrigin = 'anonymous';
    s.onload = () => res(true); s.onerror = () => res(false);
    document.head.appendChild(s);
  });
}
async function ensureLibs() {
  if (!window.satellite) await loadScript('https://cdn.jsdelivr.net/npm/satellite.js@6.0.2/dist/satellite.min.js');
  if (!window.Astronomy) await loadScript('https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/astronomy.browser.min.js');
  return !!(window.satellite && window.Astronomy);
}

/* ======================================================================
   time: server-synced (NTP style against /api/now)
   ====================================================================== */
let clockOffset = 0, clockSynced = false, syncing = false, syncFails = 0, lastSync = 0;
const nowMs = () => Date.now() + clockOffset;
async function sampleNow() {
  try {
    const t0 = performance.now(), w0 = Date.now();
    const r = await fetch('/api/now?r=' + Math.random().toString(36).slice(2), { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    const t1 = performance.now();
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || typeof j.t !== 'number') return null;
    const rtt = t1 - t0;
    return { rtt, offset: j.t + rtt / 2 - (w0 + rtt) };
  } catch (e) { return null; }
}
async function syncClock() {
  if (syncing) return;
  syncing = true;
  const got = [];
  for (let i = 0; i < 5; i++) {
    const s = await sampleNow();
    if (!s) { if (!got.length && i >= 1) break; continue; }
    got.push(s);
    await new Promise((r) => setTimeout(r, 120));
  }
  syncing = false;
  if (!got.length) { syncFails++; setTimeout(syncClock, Math.min(5 * MIN, 15000 * 2 ** Math.min(4, syncFails - 1))); return; }
  syncFails = 0;
  got.sort((a, b) => a.rtt - b.rtt);
  const offs = got.slice(0, 3).map((s) => s.offset).sort((a, b) => a - b);
  const off = offs[Math.floor(offs.length / 2)];
  const diff = off - clockOffset;
  // slew small corrections so the seconds never jump around
  clockOffset = !clockSynced || Math.abs(diff) > 1000 ? off : clockOffset + Math.max(-100, Math.min(100, diff));
  clockSynced = true;
  lastSync = performance.now();
}

/* ======================================================================
   formatting (all in the chosen location's zone)
   ====================================================================== */
const dtfCache = new Map();
function dtf(tz, key, opts) {
  const k = tz + '|' + key;
  let f = dtfCache.get(k);
  if (!f) { try { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }); } catch (e) { f = new Intl.DateTimeFormat('en-US', opts); } dtfCache.set(k, f); }
  return f;
}
const use24 = () => lsGet(K.h24) === '1';
function timeParts(ms, tz) {
  const h24 = use24();
  const f = dtf(tz, 'time' + h24, h24 ? { hourCycle: 'h23', hour: '2-digit', minute: '2-digit' } : { hour12: true, hour: 'numeric', minute: '2-digit' });
  let hh = '', mm = '', ap = '';
  for (const p of f.formatToParts(new Date(ms))) { if (p.type === 'hour') hh = p.value; else if (p.type === 'minute') mm = p.value; else if (p.type === 'dayPeriod') ap = p.value.toUpperCase(); }
  return { t: `${hh}:${mm}`, ap };
}
const timeStr = (ms, tz) => { const p = timeParts(ms, tz); return p.ap ? `${p.t} ${p.ap}` : p.t; };
function clockStr(ms, tz) {
  const f = dtf(tz, 'clock' + use24(), { hourCycle: use24() ? 'h23' : 'h12', hour: use24() ? '2-digit' : 'numeric', minute: '2-digit', second: '2-digit' });
  return f.format(new Date(ms)).replace(/\s?[AP]M$/i, (m) => m.toUpperCase().replace(/^\s?/, ' '));
}
const tzAbbr = (ms, tz) => { try { const p = dtf(tz, 'abbr', { timeZoneName: 'short' }).formatToParts(new Date(ms)).find((x) => x.type === 'timeZoneName'); return p ? p.value : ''; } catch (e) { return ''; } };
const ymd = (ms, tz) => dtf(tz, 'ymd', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms)).reduce((s, p) => (p.type === 'year' || p.type === 'month' || p.type === 'day' ? s + p.value : s), '');
const dayNum = (ms, tz) => { const s = ymd(ms, tz); return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) / DAY; };
const wdShort = (ms, tz) => dtf(tz, 'wd', { weekday: 'short' }).format(new Date(ms));
const dateShort = (ms, tz) => dtf(tz, 'ds', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(ms));
const dateNoYear = (ms, tz) => dtf(tz, 'dn', { month: 'short', day: 'numeric' }).format(new Date(ms));
function dayLabel(ms, nowT, tz) {
  const d = dayNum(ms, tz) - dayNum(nowT, tz);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tmrw';
  return `${wdShort(ms, tz)} ${dtf(tz, 'd', { day: 'numeric' }).format(new Date(ms))}`;
}
function inText(ms, nowT) {
  const d = ms - nowT;
  if (d < 0) return 'now';
  const m = Math.round(d / MIN);
  if (d < 60000) return `in ${Math.max(1, Math.round(d / 1000))} s`;
  if (m < 60) return `in ${m} min`;
  if (m < 48 * 60) { const h = Math.floor(m / 60), mm = m % 60; return mm ? `in ${h} h ${mm} m` : `in ${h} h`; }
  const dd = Math.floor(m / 1440), h = Math.round((m % 1440) / 60);
  return h ? `in ${dd} d ${h} h` : `in ${dd} d`;
}
function ageText(ms) {
  const d = Math.max(0, ms);
  if (d < 90 * MIN) return `${Math.max(1, Math.round(d / MIN))} min`;
  if (d < 36 * HOUR) return `${Math.round(d / HOUR)} h`;
  return `${Math.round(d / DAY)} days`;
}
const fmtLat = (v) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? 'N' : 'S'}`;
const fmtLon = (v) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? 'E' : 'W'}`;
const num = (n) => Math.round(n).toLocaleString('en-US');
const magText = (m) => (m < 0 ? MINUS : '') + Math.abs(m).toFixed(1);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ======================================================================
   location
   ====================================================================== */
const NYC = cityById('new-york') || CITIES[0];
const deviceTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } })();
const validTz = (tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch (e) { return false; } };
const fromCity = (c) => ({ kind: 'city', id: c.id, name: c.name, sub: c.country, lat: c.lat, lon: c.lon, tz: c.tz, h: 0 });
const goodNum = (v, a, b) => typeof v === 'number' && isFinite(v) && v >= a && v <= b;

function reviveLoc(o, allowGuess) {
  if (!o || typeof o !== 'object') return null;
  if ((o.kind === 'city' || (!o.kind && o.id)) && typeof o.id === 'string') { const c = cityById(o.id); return c ? fromCity(c) : null; }
  const tz = typeof o.tz === 'string' && validTz(o.tz) ? o.tz : null;
  if (goodNum(o.lat, -90, 90) && goodNum(o.lon, -180, 180)) {
    return { kind: o.kind || 'custom', id: o.id || 'custom', name: String(o.name || 'Your spot').slice(0, 40), sub: o.country ? String(o.country).slice(0, 40) : '', lat: o.lat, lon: o.lon, tz: tz || deviceTz, h: 0 };
  }
  // /time can store a ZIP or a time zone without coordinates: use that zone's best-known city
  if (allowGuess && tz) { const c = CITIES.find((x) => x.tz === tz); if (c) return { ...fromCity(c), name: o.name ? String(o.name).slice(0, 40) : c.name }; }
  return null;
}
const timeLoc = () => reviveLoc(lsJSON(K.time), true);
const skyLoc = () => reviveLoc(lsJSON(K.sky), false);
function saveSkyLoc(loc) {
  if (!loc) { lsSet(K.sky, null); return; }
  lsSet(K.sky, JSON.stringify(loc.kind === 'city' ? { kind: 'city', id: loc.id } : { kind: loc.kind, name: loc.name, lat: +loc.lat.toFixed(3), lon: +loc.lon.toFixed(3), tz: loc.tz }));
}

/* ======================================================================
   state
   ====================================================================== */
const st = {
  loc: skyLoc() || timeLoc() || fromCity(NYC),
  usingSky: !!skyLoc(),
  tle: null, rec: null, tleSource: 'built-in', tleFetched: 0,
  passes: [], passesFor: 0, passesLoc: '',
  showAll: lsGet(K.all) === '1',
  countries: undefined, // undefined = still loading, null = failed, array = ready
  globe: null,
  scrub: 0, rot: 0, compass: false,
  track: { at: 0 }, slow: { at: 0 }, moon: null, night: null, planets: null,
  libsOK: false,
};
const obsOf = (loc) => ({ lat: loc.lat, lon: loc.lon, h: 0 });

/* ======================================================================
   TLE (orbit data)
   ====================================================================== */
function useTLE(t, source, fetched) {
  const parsed = X.parseTLE(`${t.name || 'ISS'}\n${t.line1 || t.l1}\n${t.line2 || t.l2}`);
  if (!parsed) return false;
  try { st.rec = X.satrec(parsed); } catch (e) { return false; }
  st.tle = parsed; st.tleSource = source; st.tleFetched = fetched || 0;
  st.track.at = 0; st.passesFor = 0;
  return true;
}
function loadInitialTLE() {
  const c = lsJSON(K.tle);
  if (c && c.line1 && Date.now() - (c.epoch || 0) < 14 * DAY && useTLE(c, c.source || 'cache', c.fetched)) return;
  useTLE(X.FALLBACK_TLE, 'built-in', 0);
}
let tleBusy = false;
async function fetchTLE() {
  if (tleBusy) return;
  tleBusy = true;
  try {
    const r = await fetch('/api/iss', { signal: AbortSignal.timeout(9000) });
    if (!r.ok) throw new Error('status ' + r.status);
    const j = await r.json();
    if (j && useTLE(j, j.source || 'live', Date.now())) {
      lsSet(K.tle, JSON.stringify({ line1: j.line1, line2: j.line2, name: j.name, epoch: j.epoch, source: j.source, fetched: Date.now() }));
      st.lastTleErr = false;
    } else throw new Error('bad data');
  } catch (e) { st.lastTleErr = true; }
  tleBusy = false;
  paintTleNote();
  refreshAll(true);
}

/* ======================================================================
   hero: ISS live
   ====================================================================== */
function tickISS(t) {
  if (!st.rec) return;
  const s = X.satState(st.rec, t);
  if (!s) return;
  st.iss = s;
  $('sLat').textContent = fmtLat(s.lat);
  $('sLon').textContent = fmtLon(s.lon);
  $('sAlt').innerHTML = `${num(s.alt)}<small> km</small>`;
  $('sSpd').innerHTML = `${num(s.speed * 3600)}<small> km/h</small>`;
  const sun = X.sunVector(t);
  const lit = !X.inShadow(s.eci, sun.u);
  const la = X.lookAngles(st.rec, obsOf(st.loc), t);
  st.above = la && la.el > 0 ? la : null;
  $('issVis').textContent = st.above ? ` · ${lit ? 'above you now' : 'above you, in shadow'}` : lit ? ' · in sunlight' : ' · in Earth’s shadow';
  if (st.countries !== undefined && t - (st.overAt || 0) > 1500) {
    st.overAt = t;
    const p = X.placeAt(st.countries, s.lat, s.lon);
    let name = p.name;
    if (matchMedia('(max-width: 420px)').matches) name = name.replace(/ (Ocean|Sea)$/, '');
    if ($('overName').textContent !== name) $('overName').textContent = name;
  }
  if (st.globe) { st.globe.setISS({ lat: s.lat, lon: s.lon, alt: s.alt }); st.globe.setFootprint(s.lat, s.lon, X.footprintDeg(s.alt, 5)); st.globe.kick(); }
}
function tickTrack(t) {
  if (!st.rec) return;
  if (t - st.track.at < 60000) return;
  st.track.at = t;
  if (st.globe) {
    st.globe.setTrack(X.groundTrack(st.rec, t, -50, 95, 30), t);
    const sub = X.subsolar(t);
    st.globe.setSun(sub.lat, sub.lon);
  }
}

/* ======================================================================
   passes card
   ====================================================================== */
function ensurePasses(t) {
  if (!st.rec) return;
  const key = `${st.loc.lat},${st.loc.lon}`;
  if (st.passesFor && t - st.passesFor < 10 * MIN && key === st.passesLoc) return;
  st.passes = X.findPasses(st.rec, obsOf(st.loc), t, 7);
  st.passesFor = t; st.passesLoc = key;
  renderPasses(t);
}
function dirWords(p, vis) { const a = vis ? p.vis.start : p.rise, b = vis ? p.vis.end : p.set; return [X.compassWord(a.az), X.compassWord(b.az)]; }
function renderPasses(t) {
  const tz = st.loc.tz;
  $('passWhere').textContent = st.loc.name;
  const upcoming = st.passes.filter((p) => p.set.t > t);
  const vis = upcoming.filter((p) => p.visible && p.vis.end.t > t);
  st.nextVis = vis[0] || null;
  // the big "next pass" block
  const np = $('nextPass');
  const n = vis[0];
  if (n) {
    const start = n.vis.start.t > t ? n.vis.start : { t, az: X.lookAngles(st.rec, obsOf(st.loc), t)?.az ?? n.vis.start.az };
    const tp = timeParts(start.t, tz);
    const [from, to] = dirWords(n, true);
    const lenS = Math.round((n.vis.end.t - n.vis.start.t) / 1000);
    const len = lenS >= 90 ? `${Math.round(lenS / 60)} min` : `${lenS} s`;
    np.innerHTML = `<div class="np-k">${n.vis.start.t <= t ? 'Visible right now' : 'Next visible pass'}</div>
      <div class="np-when"><b>${esc(tp.t)}${tp.ap ? `<small>${esc(tp.ap)}</small>` : ''}</b><span class="np-in" id="npIn">${esc(inText(start.t, t))}</span><span>${esc(dateShort(start.t, tz))}</span></div>
      <p class="np-dir">Rises in the <b>${from}</b>, peaks <b>${Math.round(n.vis.max.el)}°</b> high in the <b>${X.compassWord(n.vis.max.az)}</b>, sets in the <b>${to}</b> · ${len}${n.mag != null ? ` · <b>${magText(n.mag)}</b> ${esc(X.brightnessLabel(n.mag))}` : ''}.</p>`;
  } else {
    np.innerHTML = `<div class="np-k">Next visible pass</div><p class="np-dir" style="margin-top:8px">None in the next 7 days from ${esc(st.loc.name)}. A pass is only visible when the sky is dark and the station is still in sunlight.${upcoming.length && !st.showAll ? ' Tap “Include daylight passes” to see every pass.' : ''}</p>`;
  }
  // list
  const rows = (st.showAll ? upcoming.filter((p) => p.max.el >= 10) : vis).slice(0, 10);
  const html = rows.map((p) => {
    const v = p.visible;
    const a = v ? p.vis.start : p.rise, b = v ? p.vis.end : p.set;
    const t0 = timeParts(Math.max(a.t, t), tz), t1 = timeParts(b.t, tz);
    let why = '';
    if (!v) why = X.sunAltitude(obsOf(st.loc), p.max.t) > -6 ? 'daylight' : p.max.el < 10 ? 'low' : 'in shadow';
    return `<li class="${v ? 'vis' : 'dim'}"><span class="p-day">${esc(dayLabel(a.t, t, tz))}</span>
      <div><div class="p-t">${esc(t0.t)}${t0.ap ? ' ' + esc(t0.ap) : ''} <small>– ${esc(t1.t)}${t1.ap ? ' ' + esc(t1.ap) : ''}</small></div>
      <div class="p-d">${X.compass16(a.az)} → ${X.compass16(b.az)}${v && p.mag != null ? `<span class="mag">${magText(p.mag)}</span>` : ''}${why ? ` · ${why}` : ''}</div></div>
      <span class="p-el">${Math.round(v ? p.vis.max.el : p.max.el)}°<small>max</small></span></li>`;
  }).join('');
  $('pList').innerHTML = html;
  $('allPasses').setAttribute('aria-pressed', String(st.showAll));
  paintTleNote();
}
function tickPasses(t) {
  const el = $('npIn');
  if (el && st.nextVis) { const s = Math.max(t, st.nextVis.vis.start.t); el.textContent = st.nextVis.vis.start.t <= t ? 'now' : inText(s, t); }
  // station above the horizon right now
  const box = $('nowUp');
  if (st.above) {
    const lit = st.iss ? !X.inShadow(st.iss.eci, X.sunVector(t).u) : false;
    const dark = X.sunAltitude(obsOf(st.loc), t) < -6;
    const how = lit && dark ? 'and you can see it with your eyes' : lit ? 'but the sky is too bright to see it' : 'but it is in Earth’s shadow (not lit)';
    box.hidden = false;
    box.innerHTML = `ISS is <b>above your horizon now</b>: look <b>${X.compassWord(st.above.az)}</b>, <b>${Math.round(st.above.el)}°</b> up, ${how}.`;
  } else if (!box.hidden) { box.hidden = true; box.textContent = ''; }
  // roll the list when a pass has finished
  if (st.passes.length && st.passes[0].set.t < t - 5000) renderPasses(t);
}
function paintTleNote() {
  const el = $('tleNote');
  if (!st.tle) { el.textContent = ''; return; }
  const age = Date.now() - st.tle.epoch;
  const src = st.tleSource === 'built-in' ? 'built-in' : st.tleSource;
  let s = `Orbit data: ${src}, ${ageText(age)} old.`;
  if (st.tleSource === 'built-in' || st.lastTleErr) s += ' Couldn’t reach live orbit data; times can be off by a minute or so.';
  else if (age > 6 * DAY) s += ' Getting old, times may drift a little.';
  else s += ' Times are good to a few seconds.';
  el.textContent = s;
}

/* ======================================================================
   moon card
   ====================================================================== */
const MARIA = [[-0.3, -0.4, 0.24], [0.18, -0.32, 0.16], [0.38, -0.06, 0.19], [0.66, -0.24, 0.1], [0.6, 0.16, 0.14], [-0.26, 0.36, 0.18], [-0.62, -0.04, 0.3], [-0.55, 0.38, 0.1], [0.0, -0.8, 0.11], [0.05, 0.1, 0.07]];
function drawMoon(elong, southern) {
  const cv = $('moonCv');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const css = cv.clientWidth || 150;
  const px = Math.round(css * dpr);
  if (cv.width !== px) { cv.width = px; cv.height = px; }
  const g = cv.getContext('2d');
  g.clearRect(0, 0, px, px);
  const c = px / 2, R = px * 0.46;
  const mk = () => { const o = document.createElement('canvas'); o.width = o.height = px; return o; };
  const e = ((elong % 360) + 360) % 360 * Math.PI / 180;
  const waxing = e < Math.PI;
  const k = Math.cos(e);
  // earthshine disc
  g.save(); g.translate(c, c); if (southern) g.rotate(Math.PI);
  g.fillStyle = 'rgba(150,160,205,.11)'; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
  g.restore();
  // lit surface
  const surf = mk(), sg = surf.getContext('2d');
  sg.translate(c, c);
  const base = sg.createRadialGradient(-R * 0.25, -R * 0.2, R * 0.1, 0, 0, R);
  base.addColorStop(0, '#f4f1e8'); base.addColorStop(0.75, '#d9d5ca'); base.addColorStop(1, '#a8a49c');
  sg.fillStyle = base; sg.beginPath(); sg.arc(0, 0, R, 0, Math.PI * 2); sg.fill();
  for (const [x, y, r] of MARIA) {
    const gr = sg.createRadialGradient(x * R, y * R, 0, x * R, y * R, r * R);
    gr.addColorStop(0, 'rgba(92,96,112,.46)'); gr.addColorStop(0.7, 'rgba(100,104,120,.3)'); gr.addColorStop(1, 'rgba(110,112,126,0)');
    sg.fillStyle = gr; sg.beginPath(); sg.arc(x * R, y * R, r * R, 0, Math.PI * 2); sg.fill();
  }
  const tych = sg.createRadialGradient(-0.12 * R, 0.62 * R, 0, -0.12 * R, 0.62 * R, 0.24 * R);
  tych.addColorStop(0, 'rgba(255,255,255,.7)'); tych.addColorStop(1, 'rgba(255,255,255,0)');
  sg.fillStyle = tych; sg.beginPath(); sg.arc(-0.12 * R, 0.62 * R, 0.24 * R, 0, Math.PI * 2); sg.fill();
  // lit shape mask (soft terminator)
  const mask = mk(), mg = mask.getContext('2d');
  mg.translate(c, c);
  try { mg.filter = `blur(${(R * 0.03).toFixed(1)}px)`; } catch (err) { /* no canvas filter: hard edge */ }
  mg.fillStyle = '#fff'; mg.beginPath();
  const N = 64;
  for (let i = 0; i <= N; i++) { const t = (i / N) * Math.PI; const x = R * Math.sin(t) * (waxing ? 1 : -1), y = -R * Math.cos(t); i ? mg.lineTo(x, y) : mg.moveTo(x, y); }
  for (let i = N; i >= 0; i--) { const t = (i / N) * Math.PI; const x = R * k * Math.sin(t) * (waxing ? 1 : -1), y = -R * Math.cos(t); mg.lineTo(x, y); }
  mg.closePath(); mg.fill();
  sg.setTransform(1, 0, 0, 1, 0, 0);
  sg.globalCompositeOperation = 'destination-in'; sg.drawImage(mask, 0, 0);
  g.save(); g.translate(c, c); if (southern) g.rotate(Math.PI); g.translate(-c, -c);
  g.drawImage(surf, 0, 0);
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = Math.max(1, dpr * 0.8);
  g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.stroke();
}
function renderMoon(t) {
  if (!st.libsOK) return;
  const tz = st.loc.tz, obs = obsOf(st.loc);
  const m = X.moonInfo(t, obs);
  st.moon = m;
  $('moonWhen').textContent = dateShort(t, tz);
  $('mName').textContent = m.name;
  $('mIllum').textContent = `${Math.round(m.illum * 100)}%`;
  $('mAge').textContent = `Day ${m.age.toFixed(1)} of 29.5 · ${m.waxing ? 'waxing' : 'waning'}`;
  $('moonWrap').style.setProperty('--glow', (0.25 + 0.75 * m.illum).toFixed(2));
  drawMoon(m.elong, st.loc.lat < 0);
  $('moonWrap').setAttribute('role', 'img');
  $('moonWrap').setAttribute('aria-label', `${m.name}, ${Math.round(m.illum * 100)} percent lit`);
  // rise / set within the next 24h
  const rs = X.riseSetBetween(window.Astronomy.Body.Moon, obs, t, t + DAY);
  const cell = (label, main, sub) => `<div><dt>${label}</dt><dd>${main}${sub ? `<small>${esc(sub)}</small>` : ''}</dd></div>`;
  const at = (d) => d ? esc(timeStr(+d, tz)) : '—';
  const dayTag = (d) => (d ? `${dayLabel(+d, t, tz) === 'Today' ? 'today' : dayLabel(+d, t, tz).toLowerCase()} · ${inText(+d, t)}` : 'not in the next 24 h');
  const dist = m.distKm;
  const dNote = dist < 365000 ? 'closer than usual' : dist > 398000 ? 'farther than usual' : 'average distance';
  const upNow = m.alt > 0 ? `${Math.round(m.alt)}° ${X.compass16(m.az)}` : 'below the horizon';
  $('moonGrid').innerHTML =
    cell('Moonrise', at(rs.rise), dayTag(rs.rise)) + cell('Moonset', at(rs.set), dayTag(rs.set)) +
    cell('Full Moon', esc(m.nextFull ? dateNoYear(+m.nextFull, tz) : '—'), m.nextFull ? inText(+m.nextFull, t) : '') +
    cell('New Moon', esc(m.nextNew ? dateNoYear(+m.nextNew, tz) : '—'), m.nextNew ? inText(+m.nextNew, t) : '') +
    cell('Distance', `${num(dist)} km`, dNote) + cell('In the sky now', esc(upNow), m.alt > 0 ? 'look ' + X.compassWord(m.az) : '');
}

/* ======================================================================
   tonight card
   ====================================================================== */
const PLANET_COL = { Mercury: '#b9b4ad', Venus: '#f7ecc4', Mars: '#ff7b54', Jupiter: '#e8c9a0', Saturn: '#e6cf8a' };
const TW = { day: '#d98a5b', civil: '#8a5aa6', nautical: '#3b4195', astro: '#1b2060', night: '#070920' };
function renderNight(t) {
  if (!st.libsOK) return;
  const tz = st.loc.tz, obs = obsOf(st.loc);
  const n = X.nightOf(t, obs);
  st.night = n;
  $('nightPhase').textContent = cap(n.phase) + (st.moon ? ` · Moon ${Math.round(st.moon.illum * 100)}%` : '');
  // twilight bar
  const pts = [[n.sunset, 'civil'], [n.civilDusk, 'nautical'], [n.nauticalDusk, 'astro'], [n.astroDusk, 'night'], [n.astroDawn, 'astro'], [n.nauticalDawn, 'nautical'], [n.civilDawn, 'civil'], [n.sunrise, 'day']].filter(([d]) => d);
  const bar = $('twBar');
  if (n.sunset && n.sunrise && pts.length >= 2) {
    const start = +n.sunset - 40 * MIN, end = +n.sunrise + 40 * MIN;
    let h = '', prevT = start, prevC = 'day';
    for (const [d, after] of pts) { h += `<i style="flex:${Math.max(1, +d - prevT)};background:${TW[prevC]}"></i>`; prevT = +d; prevC = after; }
    h += `<i style="flex:${Math.max(1, end - prevT)};background:${TW[prevC]}"></i>`;
    const nowPct = ((t - start) / (end - start)) * 100;
    if (nowPct >= 0 && nowPct <= 100) h += `<span class="now" style="left:${nowPct.toFixed(2)}%"></span>`;
    bar.innerHTML = h; bar.hidden = false;
  } else bar.hidden = true;
  const items = [['Sunset', n.sunset, TW.day], ['Civil dusk', n.civilDusk, TW.civil], ['Naut. dusk', n.nauticalDusk, TW.nautical], ['Fully dark', n.astroDusk, TW.astro],
    ['Dark ends', n.astroDawn, TW.astro], ['Naut. dawn', n.nauticalDawn, TW.nautical], ['Civil dawn', n.civilDawn, TW.civil], ['Sunrise', n.sunrise, TW.day]];
  $('twList').innerHTML = items.map(([l, d, col]) => `<li class="${d && +d < t ? 'past' : ''}"><span><i style="background:${col}"></i>${l}</span><b>${d ? esc(timeStr(+d, tz)) : '—'}</b></li>`).join('');
  // planets
  const pl = X.planetsTonight(t, obs, n).map((p) => ({ ...p, up: p.alt > 3 && n.sunAlt < -4 }));
  pl.sort((a, b) => (b.up - a.up) || (b.visibleTonight - a.visibleTonight) || (a.mag - b.mag));
  st.planets = pl;
  $('planets').innerHTML = pl.map((p) => {
    let s;
    if (p.elong < 10) s = 'Lost in the Sun’s glare right now.';
    else if (p.up) s = `Up now, ${Math.round(p.alt)}° high in the ${X.compassWord(p.az)}.${p.rise || p.set ? ` ${p.set ? 'Sets ' + timeStr(+p.set, tz) + '.' : ''}` : ''}`;
    else if (p.visibleTonight && p.best) s = `Best around ${timeStr(p.best.t, tz)}, ${Math.round(p.best.alt)}° high in the ${X.compassWord(p.best.az)}.`;
    else if (p.alt > 0) s = 'Above the horizon, but in daylight.';
    else s = `Below the horizon.${p.rise ? ' Rises ' + timeStr(+p.rise, tz) + '.' : ''}`;
    const loc = p.alt > 0 ? `${Math.round(p.alt)}° ${X.compass16(p.az)}` : 'below';
    return `<li class="${p.up ? 'up' : p.visibleTonight ? '' : 'off'}"><span class="pd" style="background:${PLANET_COL[p.name]};box-shadow:0 0 ${p.up ? 10 : 0}px ${PLANET_COL[p.name]}"></span>
      <span class="pn">${p.name}<small>mag ${magText(p.mag)}</small></span><span class="pa">${loc}</span><span class="ps">${esc(s)}</span></li>`;
  }).join('');
}

/* ======================================================================
   sky chart (dome)
   ====================================================================== */
const hex2rgb = (h) => { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function palette() { try { const p = window.SZVTheme && SZVTheme.palette(); if (p) return p; } catch (e) { /* default */ } return { a1: '#8b5cf6', a2: '#22d3ee', a3: '#e879f9' }; }
let domeGeo = null;
function sizeDome() {
  const cv = $('dome'), box = $('domeWrap');
  const css = Math.round(box.clientWidth) || 300;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(css * dpr)) { cv.width = cv.height = Math.round(css * dpr); }
  domeGeo = { css, dpr };
}
function drawDome() {
  if (!st.libsOK || !st.rec) return;
  if (!domeGeo) sizeDome();
  const cv = $('dome'), g = cv.getContext('2d');
  const { css, dpr } = domeGeo;
  const t = nowMs() + st.scrub * 10 * MIN;
  const obs = obsOf(st.loc), A = window.Astronomy, pal = palette();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, css, css);
  const cx = css / 2, cy = css / 2, R = css / 2 - 24;
  const rot = st.rot;
  const pt = (az, alt) => { const r = R * (90 - Math.max(-8, alt)) / 90, a = ((az - rot) * Math.PI) / 180; return [cx - r * Math.sin(a), cy - r * Math.cos(a)]; };
  const sunAlt = X.sunAltitude(obs, t);
  // sky colour by Sun height
  const f = Math.max(0, Math.min(1, (sunAlt + 18) / 24));
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const nightC = mix([5, 6, 16], hex2rgb(pal.a1).map((v) => v * 0.16), 1), dayC = [38, 78, 128];
  const mid = mix(nightC, dayC, f), edge = mix(mix(nightC, [90, 60, 110], f * 0.8), [120, 150, 190], Math.max(0, f - 0.5) * 1.4);
  const bg = g.createRadialGradient(cx, cy, 0, cx, cy, R);
  bg.addColorStop(0, `rgb(${mid})`); bg.addColorStop(1, `rgb(${edge})`);
  g.fillStyle = bg; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  // grid
  g.strokeStyle = 'rgba(255,255,255,.13)'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  g.setLineDash([2, 5]); g.strokeStyle = 'rgba(255,255,255,.1)';
  for (const a of [30, 60]) { g.beginPath(); g.arc(cx, cy, R * (90 - a) / 90, 0, Math.PI * 2); g.stroke(); }
  g.setLineDash([]);
  g.strokeStyle = 'rgba(255,255,255,.07)';
  for (let az = 0; az < 360; az += 90) { const [x, y] = pt(az, 0); g.beginPath(); g.moveTo(cx, cy); g.lineTo(x, y); g.stroke(); }
  // compass letters
  g.font = '600 11px "JetBrains Mono", ui-monospace, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const [l, az] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) {
    const a = ((az - rot) * Math.PI) / 180, rr = R + 13;
    g.fillStyle = l === 'N' ? pal.a3 : 'rgba(226,224,255,.6)';
    g.fillText(l, cx - rr * Math.sin(a), cy - rr * Math.cos(a));
  }
  // stars
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.font = '500 9.5px "JetBrains Mono", ui-monospace, monospace';
  if (sunAlt < 0) {
    const vis = Math.max(0.25, Math.min(1, (-sunAlt) / 12));
    for (const s of X.STARS) {
      const h = X.starHorizon(s, t, obs);
      if (h.alt < 1) continue;
      const [x, y] = pt(h.az, h.alt), r = Math.max(0.9, 2.3 - s[3] * 0.55);
      g.fillStyle = `rgba(240,242,255,${(0.35 + 0.5 * Math.min(1, (2.2 - s[3]) / 2.2)) * vis})`;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      if (s[3] < 0.5) { g.fillStyle = `rgba(226,224,255,${0.4 * vis})`; g.fillText(s[0], x + 5, y - 4); }
    }
  }
  const label = (x, y, txt, col) => { g.fillStyle = col; g.fillText(txt, x + 8, y + 3); };
  // Sun
  const sh = X.bodyHorizon(A.Body.Sun, t, obs);
  if (sh.alt > -4) {
    const [x, y] = pt(sh.az, sh.alt);
    const gl = g.createRadialGradient(x, y, 0, x, y, 20); gl.addColorStop(0, 'rgba(255,230,160,.9)'); gl.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = gl; g.beginPath(); g.arc(x, y, 20, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff4c8'; g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
    label(x, y, 'Sun', 'rgba(255,240,200,.85)');
  }
  // Moon
  const mh = X.bodyHorizon(A.Body.Moon, t, obs);
  if (mh.alt > -3) {
    const [x, y] = pt(mh.az, mh.alt);
    const gl = g.createRadialGradient(x, y, 0, x, y, 18); gl.addColorStop(0, 'rgba(235,235,255,.5)'); gl.addColorStop(1, 'rgba(235,235,255,0)');
    g.fillStyle = gl; g.beginPath(); g.arc(x, y, 18, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ecebf5'; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
    label(x, y, 'Moon', 'rgba(236,235,245,.85)');
  }
  // planets
  for (const name of X.PLANETS) {
    const h = X.bodyHorizon(A.Body[name], t, obs);
    if (h.alt < 0.5) continue;
    const [x, y] = pt(h.az, h.alt);
    g.fillStyle = PLANET_COL[name]; g.beginPath(); g.arc(x, y, 3.6, 0, Math.PI * 2); g.fill();
    label(x, y, name, 'rgba(226,224,255,.75)');
  }
  // ISS: the path of the next pass + the station itself
  const pass = (st.passes || []).find((p) => p.set.t >= t - 30000 && (p.max.el >= 10 || p.visible));
  if (pass) {
    g.strokeStyle = pal.a2; g.globalAlpha = 0.55; g.lineWidth = 1.6; g.setLineDash([5, 4]); g.beginPath();
    let first = true;
    for (let s = pass.rise.t; s <= pass.set.t; s += 10000) { const l = X.lookAngles(st.rec, obs, s); if (!l) continue; const [x, y] = pt(l.az, l.el); first ? g.moveTo(x, y) : g.lineTo(x, y); first = false; }
    g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
  }
  const la = X.lookAngles(st.rec, obs, t);
  if (la && la.el > -2) {
    const [x, y] = pt(la.az, la.el);
    g.strokeStyle = pal.a2; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 3.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = pal.a2; g.font = '600 10px "JetBrains Mono", ui-monospace, monospace'; g.fillText('ISS', x + 12, y + 3);
  }
  // heading marker (compass mode)
  if (st.compass) { g.fillStyle = pal.a3; g.beginPath(); g.moveTo(cx, cy - R - 4); g.lineTo(cx - 5, cy - R - 12); g.lineTo(cx + 5, cy - R - 12); g.closePath(); g.fill(); }
  // text for screen readers + scrub label
  const issTxt = la && la.el > 0 ? `ISS ${Math.round(la.el)} degrees up in the ${X.compassWord(la.az)}` : 'ISS below the horizon';
  cv.setAttribute('aria-label', `Sky chart for ${st.scrub ? timeStr(t, st.loc.tz) : 'now'}. ${issTxt}.`);
  $('scrubLbl').textContent = st.scrub ? timeStr(t, st.loc.tz) : 'Now';
  $('domeWhen').textContent = st.scrub ? dateShort(t, st.loc.tz) : (sunAlt > -0.83 ? 'Daytime' : 'Night sky');
}

/* compass: follow the phone's heading (only offered on touch devices with motion sensors) */
function setupCompass() {
  const btn = $('compassBtn');
  if (!('DeviceOrientationEvent' in window) || !matchMedia('(pointer: coarse)').matches) return;
  btn.hidden = false;
  $('compassFine').textContent = ', or tap Compass to follow your phone';
  let got = false, timer = 0, raf = 0;
  const onOri = (e) => {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
    else if (e.alpha != null && (e.absolute || e.type === 'deviceorientationabsolute')) h = (360 - e.alpha) % 360;
    if (h == null) return;
    h = (h + ((screen.orientation && screen.orientation.angle) || 0)) % 360;
    got = true;
    const d = ((h - st.rot + 540) % 360) - 180;
    st.rot = (st.rot + d * 0.35 + 360) % 360;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; drawDome(); });
  };
  const stop = () => { st.compass = false; btn.setAttribute('aria-pressed', 'false'); window.removeEventListener('deviceorientationabsolute', onOri, true); window.removeEventListener('deviceorientation', onOri, true); clearTimeout(timer); st.rot = 0; drawDome(); };
  btn.addEventListener('click', async () => {
    if (st.compass) { stop(); return; }
    try { if (typeof DeviceOrientationEvent.requestPermission === 'function') { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') { toast('Compass permission was not given'); return; } } } catch (e) { toast('Compass is not available'); return; }
    st.compass = true; got = false; btn.setAttribute('aria-pressed', 'true');
    window.addEventListener('deviceorientationabsolute', onOri, true);
    window.addEventListener('deviceorientation', onOri, true);
    timer = setTimeout(() => { if (!got) { stop(); toast('No compass sensor found on this device'); } }, 2500);
  });
}

/* ======================================================================
   refresh + tick
   ====================================================================== */
function refreshAll(force) {
  const t = nowMs();
  if (!st.libsOK) return;
  if (force) { st.passesFor = 0; st.slow.at = 0; }
  tickISS(t);
  st.track.at = force ? 0 : st.track.at;
  tickTrack(t);
  ensurePasses(t);
  if (!st.slow.at || t - st.slow.at > 90000) { st.slow.at = t; renderMoon(t); renderNight(t); }
  tickPasses(t);
  drawDome();
}
function paintHeader(t) {
  const tz = st.loc.tz;
  $('clock').innerHTML = `${esc(clockStr(t, tz))}<small>${esc(tzAbbr(t, tz))}</small>`;
}
let tickT = 0;
function tick() {
  clearTimeout(tickT);
  const t = nowMs();
  paintHeader(t);
  if (st.libsOK) {
    tickISS(t); tickTrack(t); ensurePasses(t);
    if (t - st.slow.at > 90000) { st.slow.at = t; renderMoon(t); renderNight(t); }
    tickPasses(t);
    if (st.scrub === 0) drawDome();
  }
  tickT = setTimeout(tick, 1000 - (nowMs() % 1000) + 5);
}

/* ======================================================================
   location UI
   ====================================================================== */
function setLoc(loc, persist) {
  st.loc = loc;
  if (persist === 'sky') { saveSkyLoc(loc); st.usingSky = true; }
  if (persist === 'time') { saveSkyLoc(null); st.usingSky = false; }
  $('locName').textContent = loc.name;
  $('locBtn').title = `${loc.name}${loc.sub ? ', ' + loc.sub : ''} (L to change)`;
  if (st.globe) st.globe.setObserver({ lat: loc.lat, lon: loc.lon });
  st.passes = []; st.passesFor = 0; st.slow.at = 0;
  paintHeader(nowMs());
  refreshAll(true);
  renderTimeLocBtn();
}
function renderTimeLocBtn() {
  const tl = timeLoc(), b = $('timeLocBtn');
  const show = !!tl && st.usingSky && (tl.lat !== st.loc.lat || tl.lon !== st.loc.lon);
  b.hidden = !show;
  if (tl) $('timeLocName').textContent = `Same as /time: ${tl.name}`;
}

const sheet = $('locSheet'), scrim = $('scrim');
let sheetOpen = false, lastFocus = null;
function renderCities(q) {
  const list = $('cityList'), empty = $('empty');
  q = (q || '').trim().toLowerCase();
  let html = '';
  const item = (c) => `<li role="presentation"><button type="button" role="option" data-id="${esc(c.id)}" aria-selected="${st.loc.kind === 'city' && st.loc.id === c.id}"><b>${esc(c.name)}</b><small>${esc(c.country)}</small></button></li>`;
  let n = 0;
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(q);
  if (m && goodNum(+m[1], -90, 90) && goodNum(+m[2], -180, 180)) {
    html += `<li class="rg" role="presentation">Coordinates</li><li role="presentation"><button type="button" role="option" data-ll="${+m[1]},${+m[2]}"><b>${(+m[1]).toFixed(3)}, ${(+m[2]).toFixed(3)}</b><small>Use these coordinates</small></button></li>`;
    n++;
  }
  if (!q) {
    for (const rg of REGIONS) {
      const cs = CITIES.filter((c) => c.region === rg);
      if (!cs.length) continue;
      html += `<li class="rg" role="presentation">${esc(rg)}</li>` + cs.map(item).join(''); n += cs.length;
    }
  } else {
    const words = q.split(/\s+/);
    const hits = CITIES.map((c) => {
      const hay = `${c.name} ${c.country} ${c.region} ${c.alt || ''}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return null;
      return [c, c.name.toLowerCase().startsWith(q) ? 0 : c.name.toLowerCase().includes(q) ? 1 : 2];
    }).filter(Boolean).sort((a, b) => a[1] - b[1]).slice(0, 60);
    html += hits.map(([c]) => item(c)).join(''); n += hits.length;
  }
  list.innerHTML = html;
  empty.hidden = n > 0;
}
function openSheet() {
  if (sheetOpen) return;
  sheetOpen = true; lastFocus = document.activeElement;
  renderCities($('q').value);
  renderTimeLocBtn();
  sheet.inert = false; sheet.classList.add('open'); scrim.classList.add('open');
  sheet.removeAttribute('aria-hidden');
  setTimeout(() => { const sel = sheet.querySelector('[aria-selected="true"]'); if (sel) sel.scrollIntoView({ block: 'center' }); }, 50);
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) $('q').focus({ preventScroll: true }); else sheet.focus({ preventScroll: true });
}
function closeSheet() {
  if (!sheetOpen) return;
  sheetOpen = false;
  sheet.classList.remove('open'); scrim.classList.remove('open'); sheet.inert = true; sheet.setAttribute('aria-hidden', 'true');
  sheet.style.transform = '';
  try { (lastFocus && lastFocus.focus ? lastFocus : $('locBtn')).focus({ preventScroll: true }); } catch (e) { /* ignore */ }
}
function setupSheet() {
  sheet.hidden = false; sheet.inert = true; sheet.setAttribute('aria-hidden', 'true'); sheet.tabIndex = -1;
  $('locBtn').addEventListener('click', openSheet);
  scrim.addEventListener('click', closeSheet);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  $('q').addEventListener('input', (e) => renderCities(e.target.value));
  $('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const b = $('cityList').querySelector('button'); if (b) b.click(); } });
  $('cityList').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ll) {
      const [la, lo] = b.dataset.ll.split(',').map(Number);
      setLoc({ kind: 'custom', id: 'custom', name: `${la.toFixed(2)}, ${lo.toFixed(2)}`, sub: '', lat: la, lon: lo, tz: deviceTz, h: 0 }, 'sky');
    } else {
      const c = cityById(b.dataset.id); if (!c) return;
      setLoc(fromCity(c), 'sky');
    }
    closeSheet();
  });
  $('timeLocBtn').addEventListener('click', () => { const tl = timeLoc(); if (tl) { setLoc(tl, 'time'); closeSheet(); toast(`Following /time: ${tl.name}`); } });
  $('geoBtn').addEventListener('click', () => {
    const btn = $('geoBtn'), status = $('geoStatus');
    if (!('geolocation' in navigator)) { status.textContent = 'Not available on this device'; return; }
    btn.classList.add('busy'); status.textContent = 'Locating…';
    navigator.geolocation.getCurrentPosition((p) => {
      btn.classList.remove('busy'); status.textContent = 'Stays on this device';
      setLoc({ kind: 'here', id: 'here', name: 'My location', sub: '', lat: p.coords.latitude, lon: p.coords.longitude, tz: deviceTz, h: 0 }, 'sky');
      closeSheet(); toast('Using your location (it never leaves this device)');
    }, (err) => {
      btn.classList.remove('busy');
      status.textContent = err && err.code === 1 ? 'Permission was denied. Pick a city instead.' : 'Couldn’t get a location. Pick a city instead.';
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
  });
  // keep Tab inside the open sheet; Esc closes
  sheet.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeSheet(); return; }
    if (e.key !== 'Tab') return;
    const f = [...sheet.querySelectorAll('button, input')].filter((x) => !x.disabled && !x.hidden && x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  // swipe the grabber/header down to dismiss (phone sheet only)
  const head = sheet.querySelector('.sheet-head');
  let drag = null;
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, input')) return;
    if (matchMedia('(min-width: 720px) and (min-height: 620px)').matches) return;
    drag = { y: e.clientY, t: performance.now(), dy: 0 };
    head.setPointerCapture(e.pointerId); sheet.classList.add('dragging');
  });
  head.addEventListener('pointermove', (e) => { if (!drag) return; drag.dy = Math.max(0, e.clientY - drag.y); sheet.style.transform = `translate(-50%, ${drag.dy}px)`; });
  const endDrag = (e) => {
    if (!drag) return;
    const d = drag; drag = null; sheet.classList.remove('dragging');
    const fast = d.dy / Math.max(1, performance.now() - d.t) > 0.6;
    sheet.style.transform = '';
    if (e.type !== 'pointercancel' && (d.dy > 110 || (fast && d.dy > 40))) closeSheet();
  };
  head.addEventListener('pointerup', endDrag); head.addEventListener('pointercancel', endDrag);
}

/* ======================================================================
   tabs / deck (phone), misc UI
   ====================================================================== */
const TABS = ['cPass', 'cMoon', 'cNight', 'cDome'];
function setupDeck() {
  const deck = $('deck'), tabs = [...$('tabs').querySelectorAll('button')], line = $('tabline');
  const setTab = (i) => { tabs.forEach((b, j) => { b.setAttribute('aria-selected', String(i === j)); b.tabIndex = i === j ? 0 : -1; }); line.style.setProperty('--ti', i); line.parentElement.style.setProperty('--ti', i); };
  const leftOf = (card) => card.getBoundingClientRect().left - deck.getBoundingClientRect().left + deck.scrollLeft - (parseFloat(getComputedStyle(deck).paddingLeft) || 0);
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => { setTab(i); deck.scrollTo({ left: leftOf($(TABS[i])), behavior: reduce() ? 'auto' : 'smooth' }); if (i === 3) requestAnimationFrame(() => { sizeDome(); drawDome(); }); });
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const j = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length; tabs[j].focus(); tabs[j].click(); e.preventDefault();
    });
  });
  let sraf = 0;
  deck.addEventListener('scroll', () => {
    if (sraf) return;
    sraf = requestAnimationFrame(() => {
      sraf = 0;
      let best = 0, bd = 1e9;
      TABS.forEach((id, i) => { const d = Math.abs(leftOf($(id)) - deck.scrollLeft); if (d < bd) { bd = d; best = i; } });
      setTab(best);
    });
  }, { passive: true });
  setTab(0);
  $('allPasses').addEventListener('click', () => { st.showAll = !st.showAll; lsSet(K.all, st.showAll ? '1' : '0'); renderPasses(nowMs()); });
  $('scrub').addEventListener('input', (e) => { st.scrub = +e.target.value; drawDome(); });
}
let toastT = 0;
function toast(msg, ms = 2800) {
  const el = $('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), ms);
}

/* ======================================================================
   the globe (lazy: the rest of the page never waits for WebGL)
   ====================================================================== */
async function startGlobe() {
  const nogl = $('noGL');
  let mod;
  try { mod = await import('/sky/globe.js?v=029a735013'); } catch (e) { nogl.hidden = false; nogl.textContent = 'The 3D globe couldn’t load (offline?). Everything below still works.'; return; }
  const cpu = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
  const lowPower = matchMedia('(pointer: coarse)').matches && (cpu <= 4 || mem <= 3);
  const g = mod.createGlobe($('globe'), {
    lowPower, dprCap: lowPower ? 1.5 : 2, reducedMotion: reduce,
    labels: { iss: $('issTag'), you: $('youTag') },
    onFollowChange: (on) => { const b = $('centerBtn'); b.setAttribute('aria-pressed', String(on)); $('centerTxt').textContent = on ? 'Following' : 'Center ISS'; },
  });
  if (!g) { nogl.hidden = false; return; }
  st.globe = g;
  g.applyTheme(palette());
  if (window.SZVTheme) SZVTheme.on(() => { g.applyTheme(palette()); drawDome(); if (st.moon) drawMoon(st.moon.elong, st.loc.lat < 0); });
  g.setObserver({ lat: st.loc.lat, lon: st.loc.lon });
  const ro = new ResizeObserver(() => g.resize());
  ro.observe($('hero'));
  g.resize();
  g.start();
  st.track.at = 0;
  tickISS(nowMs()); tickTrack(nowMs());
  $('centerBtn').addEventListener('click', () => g.center());
  // hide the gesture hint after the first touch or a few seconds
  const hint = $('hint'), gone = () => hint.classList.add('gone');
  $('globe').addEventListener('pointerdown', gone, { once: true });
  setTimeout(gone, 12000);
  // land + country names for "over …" and the dotted-map texture
  try {
    const r = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json', { signal: AbortSignal.timeout(12000) });
    const topo = await r.json();
    st.countries = X.decodeTopo(topo);
    g.setLand(st.countries);
    st.overAt = 0; tickISS(nowMs());
  } catch (e) { st.countries = null; /* oceans-only fallback names still work */ }
}

/* ======================================================================
   keyboard
   ====================================================================== */
function setupKeys() {
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'Escape' && sheetOpen) { closeSheet(); return; }
    if (sheetOpen) return;
    const k = e.key.toLowerCase();
    if (k === 'l') { e.preventDefault(); openSheet(); }
    else if (k === 'c' && st.globe) st.globe.center();
    else if (st.globe && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && tag !== 'BUTTON' && tag !== 'INPUT') st.globe.nudge(e.key === 'ArrowLeft' ? 0.12 : -0.12, 0, 0);
    else if (st.globe && (e.key === '+' || e.key === '=')) st.globe.nudge(0, 0, 1.15);
    else if (st.globe && (e.key === '-' || e.key === '_')) st.globe.nudge(0, 0, 1 / 1.15);
  });
}

/* ======================================================================
   boot
   ====================================================================== */
async function boot() {
  $('locName').textContent = st.loc.name;
  setupSheet(); setupDeck(); setupKeys();
  paintHeader(Date.now());
  tick();
  syncClock().then(() => { paintHeader(nowMs()); refreshAll(true); });
  startGlobe();
  st.libsOK = await ensureLibs();
  if (!st.libsOK) {
    $('nextPass').innerHTML = '<p class="muted">The astronomy libraries couldn’t load (offline?). Reload when you’re back online.</p>';
    toast('Couldn’t load the astronomy libraries');
    return;
  }
  X.init({ satellite: window.satellite, Astronomy: window.Astronomy });
  loadInitialTLE();
  setupCompass();
  sizeDome();
  new ResizeObserver(() => { sizeDome(); drawDome(); if (st.moon) drawMoon(st.moon.elong, st.loc.lat < 0); }).observe($('domeWrap'));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => drawDome());
  setLoc(st.loc);
  fetchTLE();
  setInterval(() => { if (!document.hidden) { if (!st.tleFetched || Date.now() - st.tleFetched > 3 * HOUR) fetchTLE(); } }, 10 * MIN);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (st.globe) st.globe.stop(); clearTimeout(tickT); return; }
    if (st.globe) st.globe.start();
    if (performance.now() - lastSync > 5 * MIN) syncClock();
    if (!st.tleFetched || Date.now() - st.tleFetched > HOUR) fetchTLE();
    st.track.at = 0; st.slow.at = 0; st.passesFor = 0;
    tick();
  });
  addEventListener('online', () => { syncClock(); fetchTLE(); });
  addEventListener('storage', (e) => {
    if (e.key !== K.time && e.key !== K.sky && e.key !== K.h24 && e.key !== null) return;
    if (e.key === K.h24) { st.passesFor = 0; st.slow.at = 0; refreshAll(true); return; }
    const sl = skyLoc();
    st.usingSky = !!sl;
    const l = sl || timeLoc() || fromCity(NYC);
    if (l.lat !== st.loc.lat || l.lon !== st.loc.lon) setLoc(l);
  });
  setInterval(() => { if (!document.hidden && performance.now() - lastSync > 10 * MIN) syncClock(); }, MIN);
}
boot();
