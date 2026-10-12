// /weather — weather for the saved city (the same one /time and /zmanim use).
// Data: /api/weather (Open-Meteo behind a small validated proxy). The last good
// answer is cached in localStorage so the page opens instantly and still shows
// something offline.

import { savedLoc, defaultLoc, saveLoc, fromCity, zipLoc, locFromParams, hasCoords, CITIES, deviceTz, lsGet, lsSet } from '/zmanim/data.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RM = matchMedia('(prefers-reduced-motion: reduce)');
const STALE_MS = 10 * 60000, KEEP_MS = 6 * 3600000;
const UKEY = 'szv-weather-units', CKEY = 'szv-weather:';

/* ------------------------------------------------------------ conditions */
// WMO weather code -> [label, icon kind]
function cond(code, day = true) {
  const c = code == null ? 3 : code;
  if (c === 0) return [day ? 'Clear' : 'Clear night', 'clear'];
  if (c === 1) return [day ? 'Mostly sunny' : 'Mostly clear', 'clear'];
  if (c === 2) return ['Partly cloudy', 'partly'];
  if (c === 3) return ['Overcast', 'cloud'];
  if (c === 45 || c === 48) return ['Fog', 'fog'];
  if (c >= 51 && c <= 55) return ['Drizzle', 'drizzle'];
  if (c === 56 || c === 57) return ['Freezing drizzle', 'drizzle'];
  if (c === 61) return ['Light rain', 'rain'];
  if (c === 63) return ['Rain', 'rain'];
  if (c === 65) return ['Heavy rain', 'rain'];
  if (c === 66 || c === 67) return ['Freezing rain', 'rain'];
  if (c === 71) return ['Light snow', 'snow'];
  if (c === 73) return ['Snow', 'snow'];
  if (c === 75) return ['Heavy snow', 'snow'];
  if (c === 77) return ['Snow grains', 'snow'];
  if (c >= 80 && c <= 82) return [c === 82 ? 'Violent showers' : 'Rain showers', 'rain'];
  if (c === 85 || c === 86) return ['Snow showers', 'snow'];
  if (c === 95) return ['Thunderstorm', 'storm'];
  if (c === 96 || c === 99) return ['Thunderstorm, hail', 'storm'];
  return ['Cloudy', 'cloud'];
}
const wet = (code) => code != null && ((code >= 51 && code <= 67) || (code >= 80 && code <= 99) || (code >= 71 && code <= 77));

// sky colours per kind: [top, bottom] for day / night
const SKY = {
  clear: [['#1f55c4', '#0a1330'], ['#0c1538', '#05050a']],
  partly: [['#2b5aa8', '#0c1530'], ['#0f1838', '#05050a']],
  cloud: [['#3b4663', '#0e1220'], ['#171b2e', '#05050a']],
  fog: [['#4b5263', '#12141a'], ['#20232e', '#06060a']],
  drizzle: [['#2e3d5c', '#0a101e'], ['#141b2f', '#05050a']],
  rain: [['#27324f', '#090d1a'], ['#10162a', '#05050a']],
  snow: [['#4a5a7c', '#10151f'], ['#1d2438', '#05060a']],
  storm: [['#2d2252', '#08060f'], ['#150f2c', '#05040a']],
};

/* ------------------------------------------------------------ icons */
const SUN = (cx, cy, r) => `<g class="rays" stroke="#fcd34d" stroke-width="3" stroke-linecap="round">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M${cx} ${cy - r - 4.5}v-5" transform="rotate(${a} ${cx} ${cy})"/>`).join('')}</g><circle cx="${cx}" cy="${cy}" r="${r}" fill="#fde68a" stroke="#fbbf24" stroke-width="2"/>`;
const MOON = (cx, cy, r) => `<path d="M${cx + r * .35} ${cy - r}a${r} ${r} 0 1 0 ${r * .9} ${r * 1.45}a${r * .85} ${r * .85} 0 0 1 -${r * .9} -${r * 1.45}z" fill="#e0e7ff" stroke="#a5b4fc" stroke-width="2" stroke-linejoin="round"/>`;
const CLOUD = (dx, dy, fill = '#e5e7f5', stroke = '#9ca3c9', sc = 1) => `<path class="drift" transform="translate(${dx} ${dy}) scale(${sc})" d="M20 44h26a10 10 0 0 0 1.5-19.9A14 14 0 0 0 21 27.5 8.4 8.4 0 0 0 20 44z" fill="${fill}" stroke="${stroke}" stroke-width="2.4" stroke-linejoin="round"/>`;
const DROPS = (n, color = '#67e8f9') => [0, 1, 2].slice(0, n).map((i) => `<path class="drop" d="M${24 + i * 9} 42l-2.5 6" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`).join('');
const FLAKES = () => [0, 1, 2].map((i) => `<g class="drop" stroke="#e0f2fe" stroke-width="2" stroke-linecap="round"><path d="M${24 + i * 9} 41v6M${21.5 + i * 9} 44h5"/></g>`).join('');
function icon(kind, day = true) {
  let g;
  switch (kind) {
    case 'clear': g = day ? SUN(32, 32, 11) : MOON(32, 32, 14); break;
    case 'partly': g = (day ? SUN(25, 23, 8) : MOON(25, 23, 10)) + CLOUD(8, 6, '#e5e7f5', '#9ca3c9', .85); break;
    case 'cloud': g = CLOUD(0, -4); break;
    case 'fog': g = CLOUD(0, -10, '#cfd3e6', '#8d93b5') + '<path d="M14 46h36M20 53h28" stroke="#cfd3e6" stroke-width="3" stroke-linecap="round" opacity=".8"/>'; break;
    case 'drizzle': g = CLOUD(0, -8, '#cbd2ea', '#8a93bd') + DROPS(2); break;
    case 'rain': g = CLOUD(0, -8, '#aeb8dd', '#7480b0') + DROPS(3); break;
    case 'snow': g = CLOUD(0, -8, '#d8def2', '#9aa6cf') + FLAKES(); break;
    case 'storm': g = CLOUD(0, -8, '#8e98c6', '#5f6a9c') + '<path class="bolt" d="M33 36l-6 10h6l-3 9 10-13h-6l4-6z" fill="#fde047" stroke="#f59e0b" stroke-width="1.5" stroke-linejoin="round"/>'; break;
    default: g = CLOUD(0, -4);
  }
  return `<svg viewBox="0 0 64 64" role="img" aria-hidden="true">${g}</svg>`;
}

/* ------------------------------------------------------------ state */
let loc = null, units = 'us', data = null, fetchedAt = 0, busy = false, urlLoc = null;
const num = (v, d = 0) => (v == null ? '--' : v.toFixed(d).replace(/^-0$/, '0'));
const T = (v) => (v == null ? '--' : String(Math.round(v)).replace(/^-0$/, '0')) + '°';
const hourLabel = (iso) => { const h = +iso.slice(11, 13); return h === 0 ? '12 AM' : h < 12 ? h + ' AM' : h === 12 ? '12 PM' : (h - 12) + ' PM'; };
const clock = (iso) => { if (!iso) return '--'; const h = +iso.slice(11, 13), m = iso.slice(14, 16); return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`; };
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayName = (date, i) => (i === 0 ? 'Today' : WD[new Date(date + 'T12:00:00Z').getUTCDay()]);
const compass = (deg) => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round((deg % 360) / 22.5) % 16];
const uvWord = (u) => (u == null ? '' : u < 3 ? 'Low' : u < 6 ? 'Moderate' : u < 8 ? 'High' : u < 11 ? 'Very high' : 'Extreme');
const ago = (ms) => { const m = Math.round(ms / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; };

const locKey = (l) => (hasCoords(l) ? `${l.lat.toFixed(2)},${l.lon.toFixed(2)}` : 'zip' + l.zip);
const locName = (l) => (l.name || 'Here') + '';
const apiUrl = (l) => `/api/weather?${hasCoords(l) ? `lat=${l.lat}&lon=${l.lon}` : `zip=${l.zip}`}&units=${units}`;
const defaultUnits = (l) => (l && /^(America|US)\//.test(l.tz || '') && !/^America\/(Sao_Paulo|Argentina|Bogota|Lima|Santiago|Caracas|Montevideo)/.test(l.tz) ? 'us' : 'metric');

function readCache(l) {
  try { const c = JSON.parse(lsGet(CKEY + locKey(l) + ':' + units)); if (c && c.data && Date.now() - c.t < KEEP_MS) return c; } catch (e) {}
  return null;
}
const writeCache = (l, d) => lsSet(CKEY + locKey(l) + ':' + units, JSON.stringify({ t: Date.now(), data: d }));

/* ------------------------------------------------------------ render */
function setSky(kind, day) {
  const [a, b] = SKY[kind][day ? 0 : 1];
  document.documentElement.style.setProperty('--sky1', a);
  document.documentElement.style.setProperty('--sky2', b);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = b === '#05050a' ? '#05050a' : a;
  fx.set(kind);
}

function render() {
  const d = data;
  if (!d) return;
  const c = d.current, today = d.days[0] || {};
  const [label, kind] = cond(c.code, c.day);
  const u = d.units;
  setSky(kind, c.day);
  $('placeName').textContent = d.place || locName(loc);
  $('heroIcon').innerHTML = icon(kind, c.day);
  $('temp').textContent = num(c.temp);
  $('units').textContent = u.temp;
  $('cond').textContent = label;
  $('sub').innerHTML = `Feels like <b>${T(c.feels)}</b> &nbsp;·&nbsp; H <b>${T(today.hi)}</b> &nbsp; L <b>${T(today.lo)}</b>`;
  document.title = `${T(c.temp)} ${label} · Weather · SZVTECH`;

  // next-wet-hour sentence
  const next24 = d.hours.slice(0, 24);
  const wetHour = next24.find((h, i) => i > 0 && (h.pop || 0) >= 50 && wet(h.code));
  const nowWet = wet(c.code);
  const kindWord = (code) => (cond(code)[1] === 'snow' ? 'Snow' : 'Rain');
  const summary = nowWet ? `<b>${esc(label)}</b> right now.` +
    (() => { const dry = next24.findIndex((h, i) => i > 0 && !wet(h.code)); return dry > 0 ? ` Clearing around <b>${hourLabel(next24[dry].time)}</b>.` : ' Looks like it sticks around.'; })()
    : wetHour ? `<b>${kindWord(wetHour.code)}</b> likely around <b>${hourLabel(wetHour.time)}</b> (${wetHour.pop}%).`
    : 'No rain expected in the next 24 hours.';

  const hoursHtml = d.hours.map((h, i) => {
    const [, k] = cond(h.code, h.day === 1);
    return `<div class="hr${i === 0 ? ' now' : ''}" role="listitem"><div class="t">${i === 0 ? 'NOW' : hourLabel(h.time)}</div>${icon(k, h.day === 1)}<div class="v">${T(h.temp)}</div><div class="p">${(h.pop || 0) >= 20 ? h.pop + '%' : ''}</div></div>`;
  }).join('');

  const lo = Math.min(...d.days.map((x) => x.lo).filter((v) => v != null)), hi = Math.max(...d.days.map((x) => x.hi).filter((v) => v != null));
  const span = Math.max(hi - lo, 1);
  const daysHtml = d.days.slice(0, 7).map((x, i) => {
    const [, k] = cond(x.code, true);
    const l = ((x.lo - lo) / span) * 100, w = Math.max(((x.hi - x.lo) / span) * 100, 6);
    return `<div class="day"><span class="dn">${dayName(x.date, i)}</span>${icon(k, true)}<span class="pp">${(x.pop || 0) >= 20 ? x.pop + '%' : ''}</span><div class="range"><span class="lo">${T(x.lo)}</span><div class="bar"><i style="left:${l.toFixed(1)}%;width:${w.toFixed(1)}%"></i></div></div><span class="hi">${T(x.hi)}</span></div>`;
  }).join('');

  const uv = Math.max(today.uv ?? 0, 0);
  const rot = c.windDir == null ? 0 : (c.windDir + 180) % 360; // arrow points where the wind is going
  $('body').innerHTML = `
    <div class="card alert">${icon(nowWet ? kind : (wetHour ? cond(wetHour.code)[1] : 'clear'), c.day)}<div>${summary}</div></div>
    <div class="card"><h2 class="lab">Next 24 hours</h2><div class="hours" role="list">${hoursHtml}</div>${curve(d.hours.slice(0, 24))}</div>
    <div class="card"><h2 class="lab">7-day forecast</h2>${daysHtml}</div>
    <div class="grid">
      <div class="card"><h2 class="lab">Wind</h2><div class="big">${num(c.wind)}<small>${esc(u.wind)}</small></div>
        <svg class="compass" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1.5"/><g transform="rotate(${rot} 22 22)"><path d="M22 8l5 14h-10z" fill="var(--a2)"/><path d="M22 36l-3-8h6z" fill="rgba(255,255,255,.3)"/></g></svg>
        <div class="note">From the ${c.windDir == null ? '--' : compass(c.windDir)}${c.gust != null ? ` · gusts ${num(c.gust)}` : ''}</div></div>
      <div class="card"><h2 class="lab">Humidity</h2><div class="big">${num(c.humidity)}<small>%</small></div><div class="note">Cloud cover ${num(c.cloud)}%</div></div>
      <div class="card"><h2 class="lab">UV today</h2><div class="big">${num(uv)}<small>${uvWord(uv)}</small></div><div class="meter"><i style="left:${Math.min(uv / 12, 1) * 100}%"></i></div></div>
      <div class="card"><h2 class="lab">Pressure</h2><div class="big">${c.pressure == null ? '--' : c.pressure}<small>${esc(u.pressure)}</small></div></div>
      <div class="card"><h2 class="lab">Sunrise</h2><div class="big">${clock(today.sunrise)}</div><div class="note">Sunset ${clock(today.sunset)}</div></div>
      <div class="card"><h2 class="lab">Precipitation</h2><div class="big">${today.precip == null ? '--' : (+today.precip).toFixed(u.precip === 'mm' ? 1 : 2)}<small>${esc(u.precip)}</small></div><div class="note">${num(today.pop)}% chance today</div></div>
    </div>`;
  stamp();
}

// 24h temperature curve (SVG): smooth line, soft fill, dots every 6 h
function curve(hs) {
  const v = hs.map((h) => h.temp).filter((t) => t != null);
  if (v.length < 3) return '';
  const W = 300, H = 88, pad = 14, mn = Math.min(...v), mx = Math.max(...v), sp = Math.max(mx - mn, 1);
  const pts = hs.map((h, i) => [(i / (hs.length - 1)) * W, pad + (1 - ((h.temp ?? mn) - mn) / sp) * (H - pad * 2 - 8)]);
  let p = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx2 = (x0 + x1) / 2; p += ` C${mx2} ${y0} ${mx2} ${y1} ${x1} ${y1}`; }
  const dots = pts.map(([x, y], i) => (i % 6 === 0 ? `<circle cx="${x}" cy="${y}" r="3" fill="#05050a" stroke="var(--a2)" stroke-width="2"/><text x="${Math.min(Math.max(x, 12), W - 12)}" y="${y - 8}" text-anchor="middle" fill="#f3f1ff" font-size="10" font-weight="700" font-family="JetBrains Mono,monospace">${Math.round(hs[i].temp)}°</text>` : '')).join('');
  return `<svg class="curve" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="cf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--a1)" stop-opacity=".35"/><stop offset="1" stop-color="var(--a1)" stop-opacity="0"/></linearGradient></defs><path d="${p} L${W} ${H} L0 ${H}z" fill="url(#cf)"/><path d="${p}" fill="none" stroke="var(--grad-line, var(--a2))" stroke-width="2.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>${dots}</svg>`;
}

function stamp() {
  if (!data) return;
  const age = Date.now() - fetchedAt;
  $('stamp').textContent = `Updated ${ago(age)}${age > 30 * 60000 ? ' · offline copy' : ''}`;
}

function skeleton() { $('body').innerHTML = '<div class="sk"></div><div class="sk" style="height:150px"></div><div class="sk" style="height:260px"></div>'; }
function showError(msg) {
  $('body').innerHTML = `<div class="card err"><div>${esc(msg)}</div><button class="chip" id="retry" type="button">Try again</button></div>`;
  $('retry').onclick = () => load(true);
  $('cond').textContent = 'No weather'; $('heroIcon').innerHTML = icon('cloud', true); $('temp').textContent = '--';
}

/* ------------------------------------------------------------ load */
async function load(force) {
  if (busy) return;
  busy = true;
  $('refresh').classList.add('spin');
  const l = loc;
  const cached = readCache(l);
  if (cached && !data) { data = cached.data; fetchedAt = cached.t; render(); }
  else if (!data) { skeleton(); $('placeName').textContent = locName(l); }
  if (cached && !force && Date.now() - cached.t < STALE_MS) { busy = false; $('refresh').classList.remove('spin'); return; }
  try {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 12000);
    const r = await fetch(apiUrl(l), { signal: ctl.signal });
    clearTimeout(to);
    if (!r.ok) throw new Error('http ' + r.status);
    const j = await r.json();
    if (l !== loc) return;
    data = j; fetchedAt = Date.now(); writeCache(l, j); render();
  } catch (e) {
    if (l !== loc) return;
    if (data) stamp(); else showError('Couldn’t reach the weather service. Check your connection and try again.');
  } finally { busy = false; $('refresh').classList.remove('spin'); }
}

function setLoc(l, persist) {
  loc = l; data = null; fetchedAt = 0;
  if (persist) saveLoc(l);
  load(true);
}

/* ------------------------------------------------------------ effects (rain / snow), skipped under reduced motion */
const fx = (() => {
  const cv = $('fx'), g = cv.getContext('2d');
  let mode = null, parts = [], raf = 0, w = 0, h = 0, last = 0;
  const size = () => { const r = devicePixelRatio > 2 ? 2 : devicePixelRatio || 1; w = cv.width = innerWidth * r; h = cv.height = innerHeight * r; };
  function seed() {
    const heavy = mode === 'storm' ? 1.6 : mode === 'rain' ? 1 : mode === 'drizzle' ? .5 : 0.7;
    const n = Math.round((mode === 'snow' ? 70 : 110) * heavy);
    parts = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, s: .6 + Math.random() * .8, d: Math.random() * 6.28 }));
  }
  function tick(t) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((t - last) / 16.7, 3); last = t;
    g.clearRect(0, 0, w, h);
    const r = w / innerWidth;
    if (mode === 'snow') {
      g.fillStyle = 'rgba(255,255,255,.7)';
      for (const p of parts) { p.y += p.s * 1.1 * r * dt; p.d += .02 * dt; p.x += Math.sin(p.d) * .5 * r * dt; if (p.y > h) { p.y = -4; p.x = Math.random() * w; } g.beginPath(); g.arc(p.x, p.y, (1 + p.s) * r, 0, 6.28); g.fill(); }
    } else {
      g.strokeStyle = 'rgba(170,205,255,.35)'; g.lineWidth = 1.2 * r;
      g.beginPath();
      for (const p of parts) { const len = 10 * p.s * r; p.y += p.s * 14 * r * dt; p.x -= p.s * 2 * r * dt; if (p.y > h) { p.y = -len; p.x = Math.random() * w; } g.moveTo(p.x, p.y); g.lineTo(p.x - 1.5 * r, p.y + len); }
      g.stroke();
    }
  }
  function stop() { cancelAnimationFrame(raf); raf = 0; g.clearRect(0, 0, w, h); }
  function set(kind) {
    const m = ['rain', 'drizzle', 'storm', 'snow'].includes(kind) ? kind : null;
    mode = m;
    if (!m || RM.matches || document.hidden) { stop(); return; }
    size(); seed(); if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
  }
  addEventListener('resize', () => { if (raf) { size(); seed(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (mode) set(mode); });
  RM.addEventListener && RM.addEventListener('change', () => set(mode));
  return { set };
})();

/* ------------------------------------------------------------ city sheet */
const sheet = $('sheet'), back = $('sheetBack'), q = $('q'), results = $('results');
let lastFocus = null;
function openSheet() {
  lastFocus = document.activeElement;
  sheet.hidden = back.hidden = false;
  requestAnimationFrame(() => { sheet.classList.add('on'); back.classList.add('on'); });
  q.value = ''; list(''); setTimeout(() => q.focus({ preventScroll: true }), 120);
}
function closeSheet() {
  sheet.classList.remove('on'); back.classList.remove('on');
  setTimeout(() => { sheet.hidden = back.hidden = true; }, RM.matches ? 260 : 460);
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
function list(term) {
  const t = term.trim().toLowerCase();
  const rows = [];
  if (/^\d{5}$/.test(t)) rows.push(`<button class="row" type="button" data-zip="${t}">ZIP ${t}<small>United States</small></button>`);
  const hits = (t ? CITIES.filter((c) => `${c.name} ${c.country} ${c.region} ${c.alt || ''}`.toLowerCase().includes(t)) : CITIES.slice(0, 40)).slice(0, 40);
  for (const c of hits) rows.push(`<button class="row" type="button" data-city="${esc(c.id)}">${esc(c.name)}<small>${esc(c.country)}</small></button>`);
  results.innerHTML = rows.join('') || '<p class="hint">No match. Try a 5-digit ZIP.</p>';
}
q.addEventListener('input', () => list(q.value));
results.addEventListener('click', (e) => {
  const b = e.target.closest('.row'); if (!b) return;
  const l = b.dataset.zip ? zipLoc(b.dataset.zip) : (() => { const c = CITIES.find((x) => x.id === b.dataset.city); return c ? fromCity(c) : null; })();
  if (!l) return;
  urlLoc = null; closeSheet(); setLoc(l, true);
});
$('here').addEventListener('click', () => {
  if (!('geolocation' in navigator)) { $('here').textContent = 'Location isn’t available here'; return; }
  $('here').textContent = 'Finding you…';
  navigator.geolocation.getCurrentPosition((p) => {
    $('here').textContent = 'Use my location';
    const lat = Math.round(p.coords.latitude * 1e4) / 1e4, lon = Math.round(p.coords.longitude * 1e4) / 1e4;
    urlLoc = null; closeSheet();
    setLoc({ kind: 'here', id: 'here', name: 'My location', country: '', tz: deviceTz, lat, lon }, true);
  }, () => { $('here').textContent = 'Couldn’t get location. Search instead.'; }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
});
back.addEventListener('click', closeSheet);
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });
$('place').addEventListener('click', openSheet);

/* ------------------------------------------------------------ controls + lifecycle */
$('units').addEventListener('click', () => {
  units = units === 'us' ? 'metric' : 'us'; lsSet(UKEY, units);
  data = null; load(true);
});
$('refresh').addEventListener('click', () => load(true));
document.addEventListener('visibilitychange', () => { if (!document.hidden && loc && Date.now() - fetchedAt > STALE_MS) load(true); });
addEventListener('online', () => load(true));
setInterval(() => { if (!document.hidden) { stamp(); if (Date.now() - fetchedAt > STALE_MS) load(true); } }, 30000);

const qs = new URLSearchParams(location.search);
urlLoc = locFromParams(location.search);               // ?city=crown-heights / ?zip= / ?lat=&lon= (preview only, not saved)
loc = urlLoc || savedLoc() || defaultLoc();
const u0 = qs.get('units') || lsGet(UKEY);
units = u0 === 'us' || u0 === 'metric' ? u0 : defaultUnits(loc);
load(true);
