// /qr — make and scan QR codes. Everything happens on this device.
import {
  buildPayload, parsePayload, makeMatrix, buildPaths, S_PATH, darkFor, contrast, hexRgb, utf8Len, ECL_ORDER, TYPES,
} from '/qr/encode.js?v=604205b2fc';

const JSQR_URL = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';

/* ======================================================================
   helpers
   ====================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };
const lsJSON = (k, fb) => { try { const v = JSON.parse(lsGet(k)); return v == null ? fb : v; } catch (e) { return fb; } };
const lsSetJSON = (k, v) => lsSet(k, v == null ? null : JSON.stringify(v));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) && !(el.type === 'checkbox' || el.type === 'range' || el.type === 'file');
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v; // only ever used with our own static SVG strings
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}
const ICON = {
  copy: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2.2"/><path d="M13 7V5.2A2.2 2.2 0 0 0 10.8 3H5.2A2.2 2.2 0 0 0 3 5.2v5.6A2.2 2.2 0 0 0 5.2 13H7"/></svg>',
  open: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M11 3.5h5.5V9M16.5 3.5 9 11M14 12v3.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H8"/></svg>',
  eye: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z"/><circle cx="10" cy="10" r="2.4"/></svg>',
  person: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="7" r="3.2"/><path d="M3.8 17a6.2 6.2 0 0 1 12.4 0"/></svg>',
  phone: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.6 3.2 8.4 7 6.9 8.3a9 9 0 0 0 4.8 4.8L13 11.6l3.8 1.8-.6 2.7a1.6 1.6 0 0 1-1.7 1.2A13 13 0 0 1 2.7 5.5a1.6 1.6 0 0 1 1.2-1.7z"/></svg>',
  mail: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.8" y="4.5" width="14.4" height="11" rx="2"/><path d="m3.5 5.5 6.5 5 6.5-5"/></svg>',
  sms: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 4h11A1.5 1.5 0 0 1 17 5.5v7a1.5 1.5 0 0 1-1.5 1.5H9l-4 3v-3h-.5A1.5 1.5 0 0 1 3 12.5v-7A1.5 1.5 0 0 1 4.5 4z"/></svg>',
  pin: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 17.5s5.5-5 5.5-9.2a5.5 5.5 0 0 0-11 0c0 4.2 5.5 9.2 5.5 9.2z"/><circle cx="10" cy="8.3" r="2"/></svg>',
  link: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1"/></svg>',
  wifi: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 7.5a11 11 0 0 1 15 0M5 10.5a7.3 7.3 0 0 1 10 0M7.6 13.4a3.5 3.5 0 0 1 4.8 0"/><circle cx="10" cy="16" r=".9"/></svg>',
  text: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5h12M4 9h12M4 13h8"/></svg>',
  dl: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v10M5.5 8.5 10 13l4.5-4.5M4 16.5h12"/></svg>',
  qr: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3zM12 12h2v2h-2zM15 15h2v2h-2z"/></svg>',
  scan: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7V4.5A1.5 1.5 0 0 1 4.5 3H7M13 3h2.5A1.5 1.5 0 0 1 17 4.5V7M17 13v2.5a1.5 1.5 0 0 1-1.5 1.5H13M7 17H4.5A1.5 1.5 0 0 1 3 15.5V13M3 10h14"/></svg>',
  x: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12"/></svg>',
};
const TYPE_ICON = { text: 'link', url: 'link', wifi: 'wifi', contact: 'person', email: 'mail', sms: 'sms', phone: 'phone', geo: 'pin' };

let toastT = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2200);
}
async function copyText(s) {
  try { await navigator.clipboard.writeText(s); return true; } catch (e) {}
  try {
    const ta = el('textarea', { style: 'position:fixed;opacity:0;top:0;left:0', readonly: true });
    ta.value = s; document.body.append(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch (e) { return false; }
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const buzz = (ms) => { if (reduce) return; try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
function ago(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 86400 * 7) return Math.floor(s / 86400) + 'd ago';
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
const slug = (s) => String(s || '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').toLowerCase().slice(0, 32) || 'code';

/* ======================================================================
   state
   ====================================================================== */
const KEY = { state: 'szv-qr-state', hist: 'szv-qr-history' };
const DEFAULTS = { type: 'text', style: 'classic', logo: false, ecl: 'M', quiet: 4, size: 1024, fields: {} };
const S = Object.assign({}, DEFAULTS, lsJSON(KEY.state, {}));
if (!TYPES.includes(S.type)) S.type = 'text';
if (!['classic', 'rounded', 'themed'].includes(S.style)) S.style = 'classic';
if (!ECL_ORDER.includes(S.ecl)) S.ecl = 'M';
S.quiet = Math.min(8, Math.max(0, Math.round(+S.quiet) || 0));
if (![512, 1024, 2048].includes(+S.size)) S.size = 1024;
S.fields = S.fields && typeof S.fields === 'object' ? S.fields : {};
for (const t of TYPES) if (!S.fields[t] || typeof S.fields[t] !== 'object') S.fields[t] = {};
if (!S.fields.wifi.sec) S.fields.wifi.sec = 'WPA';
let saveT = 0;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => lsSetJSON(KEY.state, S), 250); };

// shareable: /qr/?text=...  pre-fills Make
const params = new URLSearchParams(location.search);
if (params.has('text')) { S.type = 'text'; S.fields.text = { text: params.get('text') }; }

/* ======================================================================
   views (Make / Scan)
   ====================================================================== */
const body = document.body;
let view = 'make';
function setView(v, { focus = false } = {}) {
  if (v === view) return;
  view = v;
  body.dataset.view = v;
  $('#make').hidden = v !== 'make';
  $('#scan').hidden = v !== 'scan';
  for (const b of $$('.tabs [role="tab"]')) b.setAttribute('aria-selected', String(b.dataset.view === v));
  if (v !== 'scan') stopCamera();
  try { history.replaceState(null, '', location.pathname + location.search + (v === 'scan' ? '#scan' : '')); } catch (e) {}
  window.scrollTo(0, 0);
  if (focus) $(v === 'scan' ? '#startCam' : '#tabMake').focus({ preventScroll: true });
}
for (const b of $$('.tabs [role="tab"]')) b.addEventListener('click', () => setView(b.dataset.view));
$('.tabs').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  const nv = view === 'make' ? 'scan' : 'make';
  setView(nv);
  $(nv === 'make' ? '#tabMake' : '#tabScan').focus();
});
const top = $('#top');
addEventListener('scroll', () => top.classList.toggle('scrolled', scrollY > 4), { passive: true });

/* ======================================================================
   MAKE: type + fields
   ====================================================================== */
const form = $('#fields');
const panels = Object.fromEntries($$('fieldset[data-panel]').map((p) => [p.dataset.panel, p]));

function fillPanel(type) {
  const p = panels[type], f = S.fields[type];
  for (const inp of $$('[name]', p)) {
    if (inp.type === 'checkbox') inp.checked = !!f[inp.name];
    else inp.value = f[inp.name] == null ? '' : f[inp.name];
  }
  if (type === 'wifi') syncSec();
  autoGrow();
}
function readPanel(type) {
  const p = panels[type], f = S.fields[type];
  for (const inp of $$('[name]', p)) f[inp.name] = inp.type === 'checkbox' ? inp.checked : inp.value;
  return f;
}
function setType(t, { focus = false } = {}) {
  S.type = t;
  for (const b of $$('#types [data-type]')) b.setAttribute('aria-selected', String(b.dataset.type === t));
  for (const [k, p] of Object.entries(panels)) p.hidden = k !== t;
  fillPanel(t);
  save();
  render();
  if (focus) { const first = $('input, textarea', panels[t]); if (first && finePointer) first.focus({ preventScroll: true }); }
}
for (const b of $$('#types [data-type]')) b.addEventListener('click', () => setType(b.dataset.type, { focus: true }));

let renderT = 0;
form.addEventListener('input', (e) => {
  if (S.type === 'geo' && (e.target.name === 'lat' || e.target.name === 'lon')) splitLatLon(e.target);
  if (e.target.tagName === 'TEXTAREA') autoGrow();
  readPanel(S.type);
  save();
  clearTimeout(renderT);
  $('#qrBox').classList.add('stale');
  renderT = setTimeout(render, 140);
});
form.addEventListener('change', () => { readPanel(S.type); save(); render(); });
form.addEventListener('submit', (e) => e.preventDefault());
function autoGrow() {
  for (const ta of $$('textarea', panels[S.type])) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight + 2, innerHeight * 0.4) + 'px';
  }
}
// paste "40.1, -73.2" into either box
function splitLatLon(inp) {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(inp.value);
  if (!m) return;
  panels.geo.querySelector('[name=lat]').value = m[1];
  panels.geo.querySelector('[name=lon]').value = m[2];
}

// Wi-Fi security + password eye
function syncSec() {
  const sec = S.fields.wifi.sec || 'WPA';
  for (const b of $$('#secSeg [data-sec]')) b.setAttribute('aria-checked', String(b.dataset.sec === sec));
  const pass = $('#wpass');
  pass.disabled = sec === 'nopass';
  pass.closest('.fld').style.opacity = sec === 'nopass' ? '.4' : '';
}
for (const b of $$('#secSeg [data-sec]')) b.addEventListener('click', () => { S.fields.wifi.sec = b.dataset.sec; syncSec(); save(); render(); });
$('#eyeBtn').addEventListener('click', () => {
  const p = $('#wpass'), show = p.type === 'password';
  p.type = show ? 'text' : 'password';
  $('#eyeBtn').setAttribute('aria-pressed', String(show));
  $('#eyeBtn').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});

// "use my location" — only on tap, feature-detected
$('#geoBtn').addEventListener('click', () => {
  const btn = $('#geoBtn'), lbl = $('#geoLbl');
  if (!('geolocation' in navigator)) { toast('Location isn’t available in this browser'); return; }
  btn.classList.add('busy'); lbl.textContent = 'Finding you…';
  navigator.geolocation.getCurrentPosition((pos) => {
    btn.classList.remove('busy'); lbl.textContent = 'Use my location';
    S.fields.geo.lat = pos.coords.latitude.toFixed(6);
    S.fields.geo.lon = pos.coords.longitude.toFixed(6);
    fillPanel('geo'); save(); render();
  }, (err) => {
    btn.classList.remove('busy'); lbl.textContent = 'Use my location';
    toast(err && err.code === 1 ? 'Location permission denied' : 'Couldn’t get your location');
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
});

/* ======================================================================
   MAKE: options
   ====================================================================== */
const ECL_PCT = { L: '7%', M: '15%', Q: '25%', H: '30%' };
const MAX_BYTES = { L: 2953, M: 2331, Q: 1663, H: 1273 };
const requiredEcl = () => (S.logo ? 'H' : S.style !== 'classic' ? 'Q' : 'L');
const effEcl = () => ECL_ORDER[Math.max(ECL_ORDER.indexOf(S.ecl), ECL_ORDER.indexOf(requiredEcl()))];

function syncOpts() {
  const eff = effEcl();
  for (const b of $$('#styleSeg [data-style]')) b.setAttribute('aria-checked', String(b.dataset.style === S.style));
  for (const b of $$('#eclSeg [data-ecl]')) {
    b.setAttribute('aria-checked', String(b.dataset.ecl === S.ecl && eff === S.ecl));
    b.classList.toggle('auto', b.dataset.ecl === eff && eff !== S.ecl);
  }
  for (const b of $$('#sizeSeg [data-size]')) b.setAttribute('aria-checked', String(+b.dataset.size === +S.size));
  $('#logoChk').checked = !!S.logo;
  $('#eclVal').textContent = `${eff} · ${ECL_PCT[eff]} recoverable`;
  const q = $('#quiet');
  q.value = S.quiet;
  q.style.setProperty('--p', (S.quiet / 8) * 100 + '%');
  $('#quietVal').textContent = S.quiet + (S.quiet === 1 ? ' module' : ' modules') + (S.quiet === 4 ? ' · standard' : S.quiet < 2 ? ' · tight' : '');
  $('#pngSizeLbl').textContent = S.size;
  const note = $('#styleNote');
  const msgs = [];
  if (eff !== S.ecl) msgs.push(`Error correction raised to ${eff} so the ${S.logo ? 'logo' : 'styled modules'} can’t stop it scanning.`);
  if (S.style === 'themed') msgs.push(`Theme colors are deepened for contrast (${themedContrast().toFixed(1)}:1 on white).`);
  if (S.quiet < 2) msgs.push('A small quiet zone can make some scanners struggle — keep a white margin around it.');
  note.hidden = !msgs.length;
  note.textContent = msgs.join(' ');
}
for (const b of $$('#styleSeg [data-style]')) b.addEventListener('click', () => { S.style = b.dataset.style; save(); syncOpts(); render(); });
for (const b of $$('#eclSeg [data-ecl]')) b.addEventListener('click', () => {
  S.ecl = b.dataset.ecl; save(); syncOpts(); render();
  if (effEcl() !== S.ecl) toast(`${effEcl()} is the minimum with this style`);
});
for (const b of $$('#sizeSeg [data-size]')) b.addEventListener('click', () => { S.size = +b.dataset.size; save(); syncOpts(); });
$('#logoChk').addEventListener('change', (e) => { S.logo = e.target.checked; save(); syncOpts(); render(); });
$('#quiet').addEventListener('input', (e) => { S.quiet = +e.target.value; save(); syncOpts(); render(); });

/* ======================================================================
   MAKE: rendering
   ====================================================================== */
function themeColors() {
  let p = { a1: '#8b5cf6', a2: '#22d3ee', a3: '#e879f9' };
  try { if (window.SZVTheme) p = SZVTheme.palette(); } catch (e) {}
  return [darkFor(p.a1), darkFor(p.a3), darkFor(p.a2)];
}
function themedContrast() { return Math.min(...themeColors().map((c) => contrast(hexRgb(c), [255, 255, 255]))); }

let cur = null; // { payload, mx, paths, opts }
let uid = 0;
function svgString(c, { px, idp } = {}) {
  const { paths } = c;
  const N = paths.size;
  const themed = c.opts.style === 'themed';
  const id = 'g' + (idp || ++uid);
  const fill = themed ? `url(#${id})` : '#000';
  const mark = themed ? themeColors()[1] : '#000';
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}"${px ? ` width="${px}" height="${px}"` : ''} shape-rendering="${c.opts.style === 'classic' ? 'crispEdges' : 'geometricPrecision'}">`;
  if (themed) {
    const [c1, c2, c3] = themeColors();
    s += `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${N}" y2="${N}"><stop offset="0" stop-color="${c1}"/><stop offset=".5" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/></linearGradient></defs>`;
  }
  s += `<rect width="${N}" height="${N}" fill="#fff"/>`;
  if (paths.d) s += `<path d="${paths.d}" fill="${fill}"/>`;
  if (paths.eyes) s += `<path d="${paths.eyes}" fill="${fill}"/>`;
  if (paths.logo) {
    const { x, y, s: L } = paths.logo, k = L / 100;
    s += `<rect x="${x + 0.25}" y="${y + 0.25}" width="${L - 0.5}" height="${L - 0.5}" rx="${(L * 0.24).toFixed(2)}" fill="#fff"/>`;
    s += `<g transform="translate(${x + L * 0.14} ${y + L * 0.14}) scale(${(k * 0.72).toFixed(4)})"><path d="${S_PATH}" fill="none" stroke="${mark}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }
  return s + '</svg>';
}
function drawCanvas(c, px) {
  const { paths } = c;
  const N = paths.size;
  const cell = Math.max(1, Math.floor(px / N));
  const off = Math.floor((px - cell * N) / 2);
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, px, px);
  ctx.save();
  ctx.translate(off, off);
  ctx.scale(cell, cell);
  let fill = '#000';
  if (c.opts.style === 'themed') {
    const [c1, c2, c3] = themeColors();
    fill = ctx.createLinearGradient(0, 0, N, N);
    fill.addColorStop(0, c1); fill.addColorStop(0.5, c2); fill.addColorStop(1, c3);
  }
  ctx.fillStyle = fill;
  if (paths.d) ctx.fill(new Path2D(paths.d));
  if (paths.eyes) ctx.fill(new Path2D(paths.eyes));
  if (paths.logo) {
    const { x, y, s: L } = paths.logo;
    ctx.fillStyle = '#fff';
    const r = L * 0.24, X = x + 0.25, Y = y + 0.25, W = L - 0.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(X, Y, W, W, r); else ctx.rect(X, Y, W, W);
    ctx.fill();
    ctx.translate(x + L * 0.14, y + L * 0.14);
    ctx.scale(L / 100 * 0.72, L / 100 * 0.72);
    ctx.strokeStyle = c.opts.style === 'themed' ? themeColors()[1] : '#000'; ctx.lineWidth = 13; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke(new Path2D(S_PATH));
  }
  ctx.restore();
  return cv;
}
const toBlob = (cv) => new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('png'))), 'image/png'));

const EMPTY_MSG = {
  text: 'Type something to make a code', wifi: 'Add the network name', contact: 'Add a name, phone or email',
  email: 'Add an address', sms: 'Add a number or message', phone: 'Add a phone number', geo: 'Add latitude and longitude',
};
function summary(type, f, payload) {
  switch (type) {
    case 'wifi': return 'Wi-Fi · ' + (f.ssid || '');
    case 'contact': return [f.first, f.last].filter(Boolean).join(' ') || f.org || f.tel || f.email || 'Contact';
    case 'email': return f.to || f.subject || 'Email';
    case 'sms': return 'SMS · ' + (f.num || f.msg || '');
    case 'phone': return 'Call · ' + (f.num || '');
    case 'geo': return `${f.lat}, ${f.lon}`;
    default: return payload.split(/\r?\n/)[0];
  }
}

const card = $('#card'), qrBox = $('#qrBox');
const actBtns = ['#dlPng', '#dlSvg', '#copyImg', '#shareBtn'].map((s) => $(s));
function setEmpty(msg, isErr) {
  cur = null;
  card.classList.add('empty');
  card.classList.toggle('err', !!isErr);
  $('#emptyMsg').textContent = msg;
  qrBox.replaceChildren();
  $('#thumb').replaceChildren();
  $('#info').textContent = ' ';
  for (const b of actBtns) b.disabled = true;
}
function render() {
  clearTimeout(renderT);
  qrBox.classList.remove('stale');
  syncOpts();
  const type = S.type, f = readPanel(type);
  const payload = buildPayload(type, f);
  const bytes = payload ? utf8Len(payload) : 0;
  $('#raw').textContent = payload || '—';
  $('#rawInfo').textContent = payload ? `${bytes.toLocaleString()} bytes` : '';
  // field validity hints
  if (type === 'geo') {
    for (const n of ['lat', 'lon']) {
      const inp = panels.geo.querySelector(`[name=${n}]`), v = inp.value.trim(), x = parseFloat(v);
      inp.classList.toggle('bad', !!v && (!isFinite(x) || Math.abs(x) > (n === 'lat' ? 90 : 180)));
    }
  }
  if (!payload) { setEmpty(EMPTY_MSG[type]); return; }
  if (typeof window.qrcode !== 'function') { setEmpty('Couldn’t load the QR engine — check your connection and reload', true); return; }
  const ecl = effEcl();
  let mx;
  try { mx = makeMatrix(window.qrcode, payload, ecl); }
  catch (e) {
    setEmpty(`Too much data: ${bytes.toLocaleString()} bytes. At level ${ecl} a code holds up to ${MAX_BYTES[ecl].toLocaleString()}${ecl !== 'L' && S.style === 'classic' && !S.logo ? ' — try a lower error correction' : ''}.`, true);
    return;
  }
  const opts = { style: S.style, quiet: S.quiet, logo: S.logo, ecl };
  const paths = buildPaths(mx, { quiet: S.quiet, rounded: S.style !== 'classic', logo: S.logo });
  cur = { payload, mx, paths, opts, type, fields: { ...f }, label: summary(type, f, payload) };
  card.classList.remove('empty', 'err');
  qrBox.innerHTML = svgString(cur, { idp: 'pv' });
  $('#thumb').innerHTML = svgString(cur, { idp: 'th' });
  qrBox.setAttribute('aria-label', 'QR code: ' + cur.label);
  $('#info').textContent = `V${mx.version} · ${mx.n}×${mx.n} · ${ecl} · ${bytes.toLocaleString()} B`;
  for (const b of actBtns) b.disabled = false;
}

/* ======================================================================
   MAKE: export
   ====================================================================== */
const fileBase = () => `qr-${cur.type === 'text' ? slug(cur.label.replace(/^https?:\/\/(www\.)?/i, '')) : cur.type + '-' + slug(cur.label.replace(/^[^·]*·\s*/, ''))}`;
function flash(btn) { btn.classList.add('ok'); setTimeout(() => btn.classList.remove('ok'), 900); }

async function exportPng() {
  if (!cur) return;
  const blob = await toBlob(drawCanvas(cur, S.size));
  downloadBlob(blob, `${fileBase()}-${S.size}.png`);
  remember('made'); flash($('#dlPng')); toast(`PNG saved · ${S.size}×${S.size}`);
}
function exportSvg() {
  if (!cur) return;
  const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + svgString(cur, { px: 1024, idp: 'x' })], { type: 'image/svg+xml' });
  downloadBlob(blob, `${fileBase()}.svg`);
  remember('made'); flash($('#dlSvg')); toast('SVG saved');
}
const canCopyImg = !!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem);
async function copyImage() {
  if (!cur || !canCopyImg) return;
  const c = cur;
  try {
    // pass the promise straight in so Safari keeps the user gesture
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': toBlob(drawCanvas(c, S.size)) })]);
    remember('made'); flash($('#copyImg')); toast('Image copied');
  } catch (e) { toast('Couldn’t copy the image here'); }
}
const canShare = typeof navigator.share === 'function';
async function share() {
  if (!cur || !canShare) return;
  const c = cur;
  try {
    const blob = await toBlob(drawCanvas(c, S.size));
    const file = new File([blob], `${fileBase()}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'QR code' });
    else await navigator.share({ title: 'QR code', text: c.payload });
    remember('made');
  } catch (e) { if (e && e.name !== 'AbortError') toast('Sharing isn’t available here'); }
}
$('#copyImg').hidden = !canCopyImg;
$('#shareBtn').hidden = !canShare;
$('#dlPng').addEventListener('click', exportPng);
$('#dlSvg').addEventListener('click', exportSvg);
$('#copyImg').addEventListener('click', copyImage);
$('#shareBtn').addEventListener('click', share);
$('#thumb').addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }));

// mini preview in the sticky bar once the big one scrolls away (phones)
if ('IntersectionObserver' in window) {
  new IntersectionObserver(([e]) => $('#actions').classList.toggle('peek', !e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0.15 })
    .observe($('.qr-wrap'));
}

/* ======================================================================
   history
   ====================================================================== */
let hist = lsJSON(KEY.hist, []);
if (!Array.isArray(hist)) hist = [];
function remember(k, item) {
  const it = item || (cur && { type: cur.type, text: cur.payload, label: cur.label, fields: cur.fields });
  if (!it || !it.text) return;
  hist = hist.filter((h) => !(h.k === k && h.text === it.text));
  hist.unshift({ k, at: Date.now(), ...it });
  hist = hist.slice(0, 20);
  lsSetJSON(KEY.hist, hist);
  if (openSheet === histSheet) renderHist();
}
function renderHist() {
  const list = $('#histList');
  list.replaceChildren();
  $('#histEmpty').hidden = hist.length > 0;
  $('#histClear').disabled = !hist.length;
  hist.forEach((h, i) => {
    const kind = h.k === 'made' ? (h.type || 'text') : parsePayload(h.text).kind;
    const item = el('button', { type: 'button', class: 'item', onclick: () => openHist(h) },
      el('span', { class: 'ic ' + h.k, html: ICON[TYPE_ICON[kind]] || ICON.text }),
      el('span', { class: 'tx' },
        el('b', { text: h.label || h.text.slice(0, 80) }),
        el('small', { text: `${h.k === 'made' ? 'Made' : 'Scanned'} · ${ago(h.at)}` })));
    const del = el('button', { type: 'button', class: 'del', 'aria-label': 'Remove', html: ICON.x, onclick: () => { hist.splice(i, 1); lsSetJSON(KEY.hist, hist); renderHist(); } });
    list.append(el('li', {}, item, del));
  });
}
function openHist(h) {
  if (h.k === 'made') {
    closeSheet(true);
    const t = TYPES.includes(h.type) ? h.type : 'text';
    S.fields[t] = h.fields && typeof h.fields === 'object' ? { ...h.fields } : { text: h.text };
    setView('make');
    setType(t);
    $('#scrim').classList.remove('open');
  } else {
    showResult(h.text, 'history');
  }
}
$('#histClear').addEventListener('click', () => { hist = []; lsSetJSON(KEY.hist, hist); renderHist(); toast('History cleared'); });
$('#histBtn').addEventListener('click', () => { renderHist(); showSheet(histSheet); });

/* ======================================================================
   sheets
   ====================================================================== */
const resSheet = $('#resSheet'), histSheet = $('#histSheet'), scrim = $('#scrim');
let openSheet = null, lastFocus = null, onSheetClose = null;
function showSheet(sh) {
  if (openSheet && openSheet !== sh) closeSheet(true);
  openSheet = sh;
  lastFocus = document.activeElement;
  sh.classList.add('open');
  sh.setAttribute('aria-hidden', 'false');
  scrim.classList.add('open');
  setTimeout(() => { const f = sh.querySelector('.sheet-foot .btn, .x'); if (f && finePointer) f.focus({ preventScroll: true }); }, 60);
}
function closeSheet(quick) {
  const sh = openSheet;
  if (!sh) return;
  openSheet = null;
  sh.classList.remove('open', 'dragging');
  sh.style.transform = '';
  sh.setAttribute('aria-hidden', 'true');
  if (!quick) scrim.classList.remove('open');
  if (document.activeElement && sh.contains(document.activeElement)) document.activeElement.blur();
  if (!quick && lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
  const cb = onSheetClose; onSheetClose = null;
  if (cb && sh === resSheet) cb();
}
for (const sh of [resSheet, histSheet]) {
  sh.setAttribute('aria-hidden', 'true');
  sh.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
  const head = sh.querySelector('.sheet-head');
  let d = null;
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, a, input')) return;
    d = { id: e.pointerId, y: e.clientY, t: performance.now(), dy: 0 };
    try { head.setPointerCapture(e.pointerId); } catch (err) {}
    sh.classList.add('dragging');
  });
  head.addEventListener('pointermove', (e) => {
    if (!d || e.pointerId !== d.id) return;
    d.dy = Math.max(0, e.clientY - d.y);
    if (!reduce && d.dy > 4) sh.style.transform = `translate(-50%, ${d.dy}px)`;
  });
  const end = (e) => {
    if (!d || e.pointerId !== d.id) return;
    const v = d.dy / Math.max(1, performance.now() - d.t);
    sh.classList.remove('dragging');
    sh.style.transform = '';
    if (e.type !== 'pointercancel' && (d.dy > 90 || (d.dy > 30 && v > 0.5))) closeSheet();
    d = null;
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
}
scrim.addEventListener('click', () => closeSheet());
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || !openSheet) return;
  const f = $$('button, input, a[href]', openSheet).filter((x) => x.offsetParent !== null && !x.disabled);
  if (!f.length) return;
  const i = f.indexOf(document.activeElement);
  if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
  else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
});

/* ======================================================================
   SCAN: result sheet
   ====================================================================== */
function kv(label, value, { mono = false, copy = false, secret = false } = {}) {
  const v = el('span', { class: 'grow', text: secret ? '•'.repeat(Math.min(16, Math.max(8, value.length))) : value });
  const row = el('span', { class: 'v' + (mono ? ' mono' : '') }, v);
  if (secret) {
    let shown = false;
    row.append(el('button', { type: 'button', class: 'mini', 'aria-label': 'Show password', html: ICON.eye, onclick: (e) => {
      shown = !shown; v.textContent = shown ? value : '•'.repeat(Math.min(16, Math.max(8, value.length)));
      e.currentTarget.setAttribute('aria-label', shown ? 'Hide password' : 'Show password');
    } }));
  }
  if (copy) row.append(el('button', { type: 'button', class: 'mini', 'aria-label': 'Copy ' + label.toLowerCase(), html: ICON.copy, onclick: async () => { if (await copyText(value)) toast(label + ' copied'); } }));
  return el('div', { class: 'kv' }, el('span', { text: label }), row);
}
const btn = (label, icon, onclick, primary) => el('button', { type: 'button', class: 'btn' + (primary ? ' primary' : ''), onclick }, el('span', { html: ICON[icon] }), label);
const linkBtn = (label, icon, href, primary) => el('a', { class: 'btn' + (primary ? ' primary' : ''), href, target: '_blank', rel: 'noopener noreferrer' }, el('span', { html: ICON[icon] }), label);
const copyBtn = (s, label = 'Copy', what = 'Copied') => btn(label, 'copy', async () => { if (await copyText(s)) toast(what); }, false);

function showResult(text, source) {
  const r = parsePayload(text);
  const b = $('#resBody'), f = $('#resFoot');
  b.replaceChildren(); f.replaceChildren();
  $('#resKind').textContent = source === 'camera' ? 'Scanned · camera' : source === 'image' ? 'Scanned · image' : 'From history';
  const wrap = el('div', { class: 'rv' });
  let title = r.label;
  switch (r.kind) {
    case 'url': {
      title = r.host.replace(/^www\./, '');
      const i = r.url.indexOf(r.host);
      const u = el('div', { class: 'url' }, r.url.slice(0, i), el('b', { text: r.host }), r.url.slice(i + r.host.length));
      if (!r.secure) wrap.append(el('div', { class: 'warn', text: 'Not encrypted (http). Don’t enter passwords or payment details there.' }));
      if (r.puny) wrap.append(el('div', { class: 'warn', text: 'This address uses look-alike international characters. Check it really is the site you expect.' }));
      wrap.append(u, el('p', { class: 'okline', text: 'Check the full address before opening — nothing opens until you tap.' }));
      f.append(linkBtn('Open link', 'open', r.url, true), copyBtn(r.url, 'Copy link', 'Link copied'));
      break;
    }
    case 'wifi': {
      const w = r.wifi;
      title = w.ssid || 'Wi-Fi network';
      wrap.append(kv('Network', w.ssid, { copy: true }));
      if (w.sec !== 'nopass') wrap.append(kv('Password', w.pass, { mono: true, copy: true, secret: true }));
      wrap.append(kv('Security', w.secLabel + (w.hidden ? ' · hidden network' : '')));
      wrap.append(el('p', { class: 'okline', text: 'Browsers can’t join Wi-Fi for you. Open your Wi-Fi settings, pick this network and paste the password.' }));
      if (w.sec !== 'nopass') f.append(btn('Copy password', 'copy', async () => { if (await copyText(w.pass)) toast('Password copied'); }, true));
      f.append(copyBtn(w.ssid, 'Copy name', 'Network name copied'));
      break;
    }
    case 'contact': {
      const c = r.contact;
      title = c.fn || c.org || 'Contact';
      if (c.org) wrap.append(kv('Organization', c.org + (c.title ? ' · ' + c.title : '')));
      for (const t of c.tel) wrap.append(kv('Phone', t, { copy: true }));
      for (const m of c.email) wrap.append(kv('Email', m, { copy: true }));
      for (const u of c.url) wrap.append(kv('Website', u, { copy: true }));
      f.append(btn('Add contact', 'dl', () => {
        downloadBlob(new Blob([r.vcf.replace(/\r?\n/g, '\r\n') + '\r\n'], { type: 'text/vcard' }), slug(title) + '.vcf');
        toast('Contact card saved (.vcf)');
      }, true));
      if (c.tel[0]) f.append(linkBtn('Call', 'phone', 'tel:' + c.tel[0].replace(/[^\d+*#]/g, '')));
      break;
    }
    case 'email': {
      const m = r.email;
      title = m.to || 'Email';
      if (m.to) wrap.append(kv('To', m.to, { copy: true }));
      if (m.subject) wrap.append(kv('Subject', m.subject));
      if (m.body) wrap.append(el('div', { class: 'text', text: m.body }));
      f.append(linkBtn('Write email', 'mail', r.href, true), copyBtn(m.to || text, 'Copy address', 'Copied'));
      break;
    }
    case 'sms': {
      title = r.sms.num || 'Text message';
      if (r.sms.msg) wrap.append(el('div', { class: 'text', text: r.sms.msg }));
      f.append(linkBtn('Send message', 'sms', r.href, true), copyBtn(r.sms.num, 'Copy number', 'Number copied'));
      break;
    }
    case 'phone': {
      title = r.phone;
      f.append(linkBtn('Call', 'phone', r.href, true), copyBtn(r.phone, 'Copy number', 'Number copied'));
      break;
    }
    case 'geo': {
      title = `${r.geo.lat.toFixed(5)}, ${r.geo.lon.toFixed(5)}`;
      wrap.append(kv('Coordinates', `${r.geo.lat}, ${r.geo.lon}`, { mono: true, copy: true }));
      f.append(linkBtn('Open in Maps', 'pin', r.href, true));
      break;
    }
    default: {
      wrap.append(el('div', { class: 'text', text }));
      if (r.label !== 'Text') wrap.append(el('p', { class: 'okline', text: 'A link for another app — copy it if you trust where it came from.' }));
      f.append(copyBtn(text, 'Copy text', 'Text copied'));
      f.lastChild.classList.add('primary');
    }
  }
  if (r.kind !== 'text' && r.kind !== 'url') f.append(copyBtn(text, 'Copy raw', 'Copied'));
  f.append(btn('Make QR', 'qr', () => {
    S.fields.text = { text };
    closeSheet(true); scrim.classList.remove('open');
    onSheetClose = null;
    setView('make'); setType('text');
  }));
  if (source === 'camera') f.append(btn('Scan again', 'scan', () => { onSheetClose = null; closeSheet(); startCamera(); }));
  $('#resTitle').textContent = title;
  b.append(wrap);
  b.scrollTop = 0;
  if (source !== 'history') remember('scanned', { text, label: title + (r.kind === 'url' ? '' : '') });
  onSheetClose = null;
  showSheet(resSheet);
}

/* ======================================================================
   SCAN: decoders
   ====================================================================== */
let detector = null, detectorTried = false, jsqrP = null;
async function getDetector() {
  if (detectorTried) return detector;
  detectorTried = true;
  try {
    if ('BarcodeDetector' in window) {
      const f = await window.BarcodeDetector.getSupportedFormats();
      if (f.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    }
  } catch (e) { detector = null; }
  return detector;
}
function loadJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (!jsqrP) {
    jsqrP = new Promise((res, rej) => {
      const s = el('script', { src: JSQR_URL, async: true, crossorigin: 'anonymous' });
      s.onload = () => (window.jsQR ? res(window.jsQR) : rej(new Error('jsqr')));
      s.onerror = () => { jsqrP = null; rej(new Error('jsqr')); };
      document.head.append(s);
    });
  }
  return jsqrP;
}
const work = document.createElement('canvas');
const wctx = work.getContext('2d', { willReadFrequently: true });
function frameData(src, sw, sh, max) {
  const k = Math.min(1, max / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
  work.width = w; work.height = h;
  wctx.fillStyle = '#fff';
  wctx.fillRect(0, 0, w, h); // transparent PNGs: read as white, not black
  wctx.drawImage(src, 0, 0, w, h);
  return wctx.getImageData(0, 0, w, h);
}
async function decodeImage(blob) {
  let src, w, h;
  try { src = await createImageBitmap(blob); w = src.width; h = src.height; }
  catch (e) {
    src = await new Promise((res, rej) => {
      const url = URL.createObjectURL(blob), im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); res(im); };
      im.onerror = () => { URL.revokeObjectURL(url); rej(e); };
      im.src = url;
    });
    w = src.naturalWidth; h = src.naturalHeight;
  }
  const det = await getDetector();
  if (det) {
    try { const r = await det.detect(src); if (r && r.length && r[0].rawValue) return r[0].rawValue; } catch (e) {}
  }
  const jsQR = await loadJsQR();
  for (const max of [1000, 700, 1600, 450]) {
    const d = frameData(src, w, h, max);
    const r = jsQR(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' });
    if (r && r.data) return r.data;
  }
  return null;
}

/* ======================================================================
   SCAN: camera
   ====================================================================== */
const scanner = $('#scanner'), video = $('#video'), statusEl = $('#scanStatus');
let stream = null, scanning = false, loopT = 0, starting = false, torchOn = false;
let statusT = 0;
function status(msg, ms = 0) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('show', !!msg);
  clearTimeout(statusT);
  if (msg && ms) statusT = setTimeout(() => statusEl.classList.remove('show'), ms);
}
async function startCamera() {
  if (stream || starting) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    status('No camera access in this browser — scan an image instead', 4000);
    $('#idleSub').textContent = 'Camera isn’t available here (it needs HTTPS and a camera). You can still scan an image.';
    return;
  }
  starting = true;
  status('Starting camera…');
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    if (view !== 'scan' || document.hidden) { s.getTracks().forEach((t) => t.stop()); return; }
    stream = s;
    video.srcObject = s;
    try { await video.play(); } catch (e) {}
    scanner.classList.add('live');
    scanner.classList.remove('hit');
    $('#camToggle').setAttribute('aria-label', 'Stop camera');
    status('Point at a QR code', 2200);
    const track = s.getVideoTracks()[0];
    let caps = {};
    try { caps = track.getCapabilities ? track.getCapabilities() : {}; } catch (e) {}
    $('#torchBtn').disabled = !caps.torch;
    $('#torchBtn').setAttribute('aria-pressed', 'false');
    torchOn = false;
    await getDetector();
    if (!detector) loadJsQR().catch(() => status('Couldn’t load the scanner — check your connection', 5000));
    scanning = true;
    loop();
  } catch (e) {
    const n = e && e.name;
    status(n === 'NotAllowedError' || n === 'SecurityError' ? 'Camera blocked — allow it in site settings, or scan an image'
      : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'No camera found — scan an image instead'
      : n === 'NotReadableError' ? 'The camera is busy in another app' : 'Couldn’t start the camera', 5000);
  } finally { starting = false; }
}
function stopCamera() {
  scanning = false;
  clearTimeout(loopT);
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  video.srcObject = null;
  scanner.classList.remove('live');
  $('#torchBtn').disabled = true;
  $('#torchBtn').setAttribute('aria-pressed', 'false');
  $('#camToggle').setAttribute('aria-label', 'Start camera');
  if (statusEl.textContent === 'Point at a QR code' || statusEl.textContent === 'Starting camera…') status('');
}
async function loop() {
  if (!scanning) return;
  let hit = null;
  if (video.readyState >= 2 && video.videoWidth) {
    try {
      if (detector) {
        const r = await detector.detect(video);
        if (r && r.length && r[0].rawValue) hit = r[0].rawValue;
      } else if (window.jsQR) {
        const d = frameData(video, video.videoWidth, video.videoHeight, 720);
        const r = window.jsQR(d.data, d.width, d.height, { inversionAttempts: 'dontInvert' });
        if (r && r.data) hit = r.data;
      }
    } catch (e) {}
  }
  if (!scanning) return;
  if (hit) {
    buzz(35);
    scanner.classList.add('hit');
    scanning = false;
    setTimeout(() => { stopCamera(); scanner.classList.remove('hit'); showResult(hit, 'camera'); }, reduce ? 60 : 180);
    return;
  }
  loopT = setTimeout(loop, detector ? 90 : 140);
}
$('#startCam').addEventListener('click', startCamera);
$('#camToggle').addEventListener('click', () => (stream ? stopCamera() : startCamera()));
$('#torchBtn').addEventListener('click', async () => {
  if (!stream) return;
  const track = stream.getVideoTracks()[0];
  try {
    await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
    torchOn = !torchOn;
    $('#torchBtn').setAttribute('aria-pressed', String(torchOn));
  } catch (e) { toast('Flashlight isn’t available'); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); });
addEventListener('pagehide', stopCamera);

/* ---------- scan from image: file / paste / drop ---------- */
async function scanFile(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) { toast('That isn’t an image'); return; }
  if (view !== 'scan') setView('scan');
  stopCamera();
  status('Reading image…');
  try {
    const text = await decodeImage(file);
    status('');
    if (text) { buzz(25); showResult(text, 'image'); }
    else status('No QR code found in that image', 3500);
  } catch (e) { status('Couldn’t read that image', 3500); }
}
$('#fileIn').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) scanFile(f); });
$('#imgBtn').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#fileIn').click(); } });
$('#imgBtn').tabIndex = 0;
document.addEventListener('paste', (e) => {
  const items = e.clipboardData ? [...e.clipboardData.items] : [];
  const img = items.find((i) => i.kind === 'file' && /^image\//.test(i.type));
  if (!img) return;
  if (view !== 'scan' && isTyping(e.target)) return;
  e.preventDefault();
  scanFile(img.getAsFile());
});
let dragN = 0;
const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragN++; if (view === 'scan') scanner.classList.add('dragover'); });
addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
addEventListener('dragleave', () => { dragN = Math.max(0, dragN - 1); if (!dragN) scanner.classList.remove('dragover'); });
addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault(); dragN = 0; scanner.classList.remove('dragover');
  const f = [...e.dataTransfer.files].find((x) => /^image\//.test(x.type));
  if (f) scanFile(f); else toast('Drop an image with a QR code');
});

/* ======================================================================
   keyboard
   ====================================================================== */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openSheet) { e.preventDefault(); closeSheet(); return; }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 's' || e.key === 'S') && view === 'make') {
    e.preventDefault(); exportPng(); return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
  if (openSheet) return;
  const k = e.key.toLowerCase();
  if (k === 'm') setView('make');
  else if (k === 's') setView('scan');
  else if (k === 'h') { renderHist(); showSheet(histSheet); }
  else if (view === 'make' && k === 'd') exportPng();
  else if (view === 'make' && k === 'v') exportSvg();
  else if (view === 'make' && k === 'c') copyImage();
  else if (view === 'scan' && e.key === ' ' && !e.target.closest('button, label')) { e.preventDefault(); stream ? stopCamera() : startCamera(); }
  else return;
});

/* ======================================================================
   theme + boot
   ====================================================================== */
if (window.SZVTheme && SZVTheme.on) SZVTheme.on(() => { if (S.style === 'themed') render(); else syncOpts(); });

setType(S.type);
if (location.hash === '#scan' || params.has('scan')) setView('scan');
// the QR engine is a deferred classic script; normally ready before this module runs
if (typeof window.qrcode !== 'function') addEventListener('load', render, { once: true });
