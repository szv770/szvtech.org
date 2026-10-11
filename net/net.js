// /net — network & device lab: latency / you / DNS / device.
import { median, mean, jitter, fmtTtl, normDomain, clamp } from '/net/stats.js?v=df6c47bf1f';
import { pingOnce } from '/net/ping.js?v=4a3ec24839';
import { drawSpark, drawHisto, watchSize } from '/net/gfx.js?v=4cda681a41';
import { lookup, RESOLVERS } from '/net/dns.js?v=a7eac9597e';
import { collect, capabilities, asText, gpuInfo, measureRefresh, shortAgent, highEntropy } from '/net/device.js?v=10a9a4eee0';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('net-' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('net-' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const RM = matchMedia('(prefers-reduced-motion: reduce)');
const DEFAULT_PAL = { a1: '#8b5cf6', a2: '#22d3ee', a3: '#e879f9', rgb: { a1: [139, 92, 246], a2: [34, 211, 238], a3: [232, 121, 249] } };
let pal = (window.SZVTheme && SZVTheme.palette()) || DEFAULT_PAL;
const params = new URLSearchParams(location.search);

let toastT = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2200);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}
const fmtMs = (v) => (v == null || !Number.isFinite(v) ? '—' : v < 10 ? v.toFixed(1) : String(Math.round(v)));

/* =====================================================================
   LATENCY MONITOR (1 sample/s while the page is visible)
   ===================================================================== */
const CAP = 90;
const lat = { samples: [], paused: false, held: false, timer: 0, running: false, offsets: [] };

function pushPing(s) {
  lat.samples.push(s);
  if (lat.samples.length > CAP) lat.samples.shift();
  if (s.rtt != null && s.offset != null) {
    lat.offsets.push({ rtt: s.rtt, off: s.offset });
    if (lat.offsets.length > 30) lat.offsets.shift();
  }
  renderLat();
}

async function latLoop() {
  if (lat.running) return;
  lat.running = true;
  while (!lat.paused && !lat.held && !document.hidden) {
    const t0 = performance.now();
    const s = await pingOnce(3000);
    if (lat.paused || lat.held || document.hidden) break;
    pushPing(s ? { rtt: s.rtt, offset: s.offset } : { rtt: null });
    $('liveDot').className = 'brand-dot ' + (s ? 'on' : 'off');
    await new Promise((r) => { lat.wake = r; lat.timer = setTimeout(r, Math.max(50, 1000 - (performance.now() - t0))); });
  }
  lat.running = false;
}
// end the current wait now (the loop then sees paused/held and exits, so a later kick can restart it)
function latStop() { clearTimeout(lat.timer); if (lat.wake) { lat.wake(); lat.wake = null; } }
function latKick() { if (!lat.paused && !lat.held && !document.hidden) latLoop(); }

function renderLat() {
  const s = lat.samples, ok = s.filter((x) => x.rtt != null), vals = ok.map((x) => x.rtt);
  const idle = ok.filter((x) => !x.loaded).map((x) => x.rtt);
  const last = s.length ? s[s.length - 1] : null;
  const now = $('pNow');
  now.textContent = last ? (last.rtt == null ? '×' : fmtMs(last.rtt)) : '—';
  now.className = 'big ' + (!last || last.rtt == null ? 'bad' : last.rtt < 60 ? 'good' : last.rtt < 150 ? 'warn' : 'bad');
  const q = $('pQual'), med = idle.length ? median(idle.slice(-20)) : null;
  if (med == null) { q.textContent = ''; q.className = 'lat-q'; }
  else { const [t, k] = med < 30 ? ['excellent', 'good'] : med < 70 ? ['good', 'good'] : med < 150 ? ['fair', 'warn'] : ['slow', 'bad']; q.textContent = t; q.className = 'lat-q ' + k; }
  $('pMin').textContent = vals.length ? fmtMs(Math.min(...vals)) : '—';
  $('pAvg').textContent = vals.length ? fmtMs(mean(vals)) : '—';
  $('pJit').textContent = idle.length > 1 ? fmtMs(jitter(idle)) : '—';
  $('pLoss').textContent = s.length ? Math.round(100 * (s.length - ok.length) / s.length) + '%' : '—';
  $('pCount').textContent = `${s.length} sample${s.length === 1 ? '' : 's'}`;
  drawSpark($('spark'), { samples: s, cap: CAP, pal });
  const r = drawHisto($('histo'), { samples: s, pal });
  $('pRange').textContent = r ? `${r.lo}–${r.hi} ms` : '';
}

function setPaused(p) {
  lat.paused = p;
  const b = $('pingToggle');
  b.setAttribute('aria-pressed', String(p));
  b.classList.toggle('live', !p);
  $('pingToggleTxt').textContent = p ? 'paused' : 'live';
  if (!p) latKick(); else latStop();
}

// clock: best offset = median of the 3 lowest-RTT recent samples
function clockOffset() {
  const o = [...lat.offsets].sort((a, b) => a.rtt - b.rtt).slice(0, 3);
  if (!o.length) return null;
  return { off: median(o.map((x) => x.off)), err: o[0].rtt / 2 + 1 };
}
const tfmt = (ms) => {
  const d = new Date(ms);
  return d.toLocaleTimeString('en-GB', { hour12: false }) + '.' + Math.floor(d.getMilliseconds() / 100);
};
let clockShown = '';
function tickClock() {
  if (document.hidden) return;
  const c = clockOffset(), n = Date.now();
  $('cLocal').textContent = tfmt(n);
  $('cServer').textContent = c ? tfmt(n + c.off) : '--:--:--.-';
  if (!c) return;
  const off = c.off, err = Math.round(c.err), a = Math.abs(off);
  const txt = a <= Math.max(err, 15)
    ? `Your clock is <b>spot on</b> (within ±${Math.max(err, 15)} ms of the server).`
    : `Your clock is <b>${a >= 1000 ? (a / 1000).toFixed(2) + ' s' : Math.round(a) + ' ms'} ${off > 0 ? 'behind' : 'ahead'}</b> (±${err} ms).`;
  if (txt !== clockShown) { clockShown = txt; $('cOff').innerHTML = txt; }
}

let edge = null; // from /api/ip

/* =====================================================================
   YOU (/api/ip)
   ===================================================================== */
let ipInfo = null;
const regionName = (cc) => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(cc); } catch { return cc; } };
const flag = (cc) => (cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '');

async function loadIp() {
  try {
    const r = await fetch('/api/ip?r=' + Math.random().toString(36).slice(2), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    ipInfo = await r.json();
    edge = ipInfo.edge || null;
    window.NET_EDGE = edge; // read by the parked speed card (net/speed-card.js)
  } catch (e) {
    ipInfo = { error: true };
  }
  renderYou();
}

function renderYou() {
  const i = ipInfo || {};
  const ipEl = $('ipVal');
  const hidden = store.get('hideIp', false);
  $('ipHide').setAttribute('aria-pressed', String(hidden));
  if (i.error || !i.ip) {
    ipEl.textContent = i.error ? 'unavailable' : '…';
  } else {
    ipEl.textContent = i.ip;
    ipEl.classList.toggle('v6', i.version === 6);
  }
  ipEl.classList.toggle('blur', hidden);
  const ver = $('ipVer');
  if (i.ip) { ver.hidden = false; ver.textContent = i.local ? 'local network' : 'IPv' + i.version; } else ver.hidden = true;

  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const rows = [];
  const place = [i.city, i.region || i.regionCode, i.country ? regionName(i.country) : null].filter(Boolean);
  rows.push(['Location', place.length ? `${flag(i.country)} ${esc(place.join(', '))}${i.postal ? ` <small>${esc(i.postal)}</small>` : ''}` : (i.local ? 'Local test server — no location headers' : '<small>not in the request headers</small>'), true]);
  if (i.lat != null && i.lon != null) rows.push(['Coordinates', `${i.lat.toFixed(2)}, ${i.lon.toFixed(2)} <small>city-level guess, not GPS</small>`, true]);
  if (i.tz) rows.push(['Time zone', `${esc(i.tz)} ${i.tz === deviceTz ? '<span class="ok">✓ matches this device</span>' : `<span class="no">≠ device ${esc(deviceTz)}</span>`}`]);
  rows.push(['Network', i.isp || i.asn ? esc([i.isp, i.asn ? 'AS' + String(i.asn).replace(/^AS/i, '') : ''].filter(Boolean).join(' · ')) : '<small>ISP isn’t in the headers we get — finding it would need a lookup service, and this page doesn’t use one</small>']);
  const hops = ['you', edge && edge.cf ? `Cloudflare ${esc(edge.cf)}` : null, edge && edge.vercelRegion ? `Vercel ${esc(edge.vercelRegion)}` : (i.local ? 'this test server' : 'Vercel')].filter(Boolean);
  const proto = (i.proto ? i.proto.toUpperCase() : location.protocol.replace(':', '').toUpperCase()) + (i.version ? ' · IPv' + i.version : '');
  rows.push(['Route', `${hops.join(' → ')} <small>${esc(proto)}</small>`]);
  rows.push(['Browser', esc(shortAgent())]);
  $('youKv').innerHTML = rows.map(([k, v, priv]) => `<dt>${k}</dt><dd${priv && hidden ? ' class="blur"' : ''}>${v}</dd>`).join('');

  // plain words
  const where = i.city ? `${i.city}${i.country ? ', ' + regionName(i.country) : ''}` : i.country ? regionName(i.country) : null;
  const lang = (() => { try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(navigator.language); } catch { return navigator.language; } })();
  const parts = [];
  parts.push(i.ip ? `your IP address${hidden ? '' : ` (<b>${esc(i.ip)}</b>)`}` : 'your IP address');
  if (where) parts.push(`which places you roughly in <b>${esc(where)}</b>`);
  $('plainTxt').innerHTML =
    `Every website you open sees ${parts.join(', ')}. It also learns your browser (<b>${esc(shortAgent())}</b>), your language (<b>${esc(lang)}</b>), ` +
    `your screen size and your time zone. Scripts can read much more — everything in “Your device” below. ` +
    `It can’t see your name, exact address or files unless you hand them over.`;
}

/* =====================================================================
   DNS
   ===================================================================== */
const dnsTypes = ['ALL', 'A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME'];
const dnsState = { type: store.get('dnsType', 'ALL'), res: store.get('dnsRes', 'cloudflare'), ctl: null };
if (params.get('type') && dnsTypes.includes(params.get('type').toUpperCase())) dnsState.type = params.get('type').toUpperCase();
if (!dnsTypes.includes(dnsState.type)) dnsState.type = 'ALL';
if (!RESOLVERS[dnsState.res]) dnsState.res = 'cloudflare';

function renderTypeChips() {
  $('typeChips').innerHTML = dnsTypes.map((t) => `<button type="button" role="radio" data-t="${t}" aria-checked="${t === dnsState.type}">${t}</button>`).join('');
}
function renderRes() {
  document.querySelectorAll('#resSeg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.res === dnsState.res)));
}

async function runDns(raw) {
  const name = normDomain(raw);
  const sum = $('dnsSum'), out = $('dnsOut');
  if (!name) {
    sum.innerHTML = `<span class="st err">Invalid</span> · type a domain like <b>example.com</b> (or an IPv4 for a reverse lookup)`;
    out.innerHTML = '';
    return;
  }
  const type = /\.in-addr\.arpa$/.test(name) ? 'PTR' : dnsState.type;
  if (dnsState.ctl) dnsState.ctl.abort();
  const ctl = dnsState.ctl = new AbortController();
  sum.textContent = `Asking ${RESOLVERS[dnsState.res].label} about ${name}…`;
  out.innerHTML = '<div class="skeleton"></div>';
  try {
    const r = await lookup(name, type, dnsState.res, ctl.signal);
    if (ctl !== dnsState.ctl) return;
    renderDns(r, type);
    saveDnsHist(name);
    try {
      const u = new URL(location.href);
      u.searchParams.set('dns', name);
      if (type !== 'PTR') u.searchParams.set('type', dnsState.type); else u.searchParams.delete('type');
      history.replaceState(null, '', u);
    } catch {}
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    sum.innerHTML = `<span class="st err">Failed</span> · ${esc(e && e.message || 'network error')}`;
    out.innerHTML = '';
  }
}

function renderDns(r, type) {
  const ok = r.status === 'NOERROR';
  $('dnsSum').innerHTML = `<span class="st${ok ? '' : ' err'}">${esc(r.status)}</span> · ${Math.round(r.ms)} ms · ${esc(RESOLVERS[r.resolver].label)}` +
    (r.ad ? ' · DNSSEC <span class="st">✓</span>' : '') + (r.errors.length ? ` · ${r.errors.length} failed` : '');
  const groups = r.groups.filter((g) => g.records.length || (type !== 'ALL' && g.chain.length));
  const empty = r.groups.filter((g) => !g.records.length).map((g) => g.type);
  let html = '';
  for (const g of groups) {
    const recs = g.chain.concat(g.records);
    html += `<div class="rr-group"><div class="rr-head"><span>${esc(g.type)}</span><span>${g.records.length} record${g.records.length === 1 ? '' : 's'}</span></div>`;
    for (const x of recs) {
      const isChain = x.type !== g.type;
      const shown = x.data || (x.type === 'MX' ? '“.” — null MX: this domain accepts no email' : '.');
      html += `<div class="rr"><span class="rr-val">${x.pref != null ? `<span class="pref">${x.pref}</span>` : ''}${isChain ? `<span class="pref">${esc(x.type)}</span>` : ''}${esc(shown)}</span>` +
        `<span class="rr-ttl" title="time to live">${esc(fmtTtl(x.ttl))}</span>` +
        (x.name && x.name !== r.name ? `<span class="rr-name">${esc(x.name)}</span>` : '') + '</div>';
    }
    html += '</div>';
  }
  if (empty.length) html += `<div class="rr-group"><div class="rr-empty">No ${esc(empty.join(', '))} record${empty.length === 1 ? '' : 's'}${r.status === 'NXDOMAIN' ? ' — this domain doesn’t exist' : ''}.</div></div>`;
  $('dnsOut').innerHTML = html;
}

function saveDnsHist(name) {
  const h = store.get('dnsHist', []).filter((x) => x !== name);
  h.unshift(name);
  store.set('dnsHist', h.slice(0, 12));
  renderDnsHist();
}
function renderDnsHist() {
  const h = store.get('dnsHist', []);
  $('dnsRecent').hidden = !h.length;
  $('dnsHist').innerHTML = h.map((n) => `<button type="button" data-n="${esc(n)}">${esc(n)}</button>`).join('');
}

/* =====================================================================
   DEVICE
   ===================================================================== */
const live = {};
let devRenderT = 0;
function renderDevice() {
  const secs = collect(live);
  $('devGrid').innerHTML = secs.map((s) =>
    `<div class="dev-sec"><h3>${esc(s.title)}</h3><dl>` +
    s.rows.map(([k, val, sub]) => `<dt>${esc(k)}</dt><dd>${val == null ? '<span class="na">not reported</span>' : esc(val)}${sub ? `<br><small>${esc(sub)}</small>` : ''}</dd>`).join('') +
    '</dl></div>').join('');
  $('caps').innerHTML = capabilities().map(([k, y]) => `<span class="cap${y ? ' y' : ''}">${esc(k)}</span>`).join('');
}
function devSoon() { clearTimeout(devRenderT); devRenderT = setTimeout(renderDevice, 150); }

async function initDevice() {
  renderDevice();
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 50));
  const gpu = () => { live.gpu = gpuInfo(); devSoon(); };
  idle(gpu);
  measureRefresh().then((hz) => { live.refresh = hz; devSoon(); });
  highEntropy().then((he) => { live.he = he; devSoon(); });
  try {
    if (navigator.getBattery) {
      const b = await navigator.getBattery();
      live.battery = b;
      ['levelchange', 'chargingchange', 'chargingtimechange', 'dischargingtimechange'].forEach((ev) => b.addEventListener(ev, devSoon));
    } else live.battery = null;
  } catch { live.battery = null; }
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      let persisted = null;
      try { persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch {}
      live.storage = { quota: e.quota, usage: e.usage, persisted };
    } else live.storage = null;
  } catch { live.storage = null; }
  devSoon();
  const conn = navigator.connection;
  if (conn && conn.addEventListener) conn.addEventListener('change', devSoon);
  addEventListener('resize', devSoon);
  addEventListener('online', () => { devSoon(); latKick(); });
  addEventListener('offline', () => { devSoon(); $('liveDot').className = 'brand-dot off'; });
  try { screen.orientation.addEventListener('change', () => { devSoon(); setTimeout(() => measureRefresh().then((hz) => { live.refresh = hz; devSoon(); }), 600); }); } catch {}
  ['(prefers-reduced-motion: reduce)', '(prefers-color-scheme: dark)', '(prefers-contrast: more)'].forEach((q) => { try { matchMedia(q).addEventListener('change', devSoon); } catch {} });
}

// ---------------- sensors ----------------
const sens = { on: false, n: 0, t0: 0, o: null, m: null, raf: 0, watchdog: 0 };
async function toggleSensors() {
  const box = $('sensors');
  if (sens.on) { stopSensors(); return; }
  const msg = $('sensMsg');
  try {
    // iOS: must be asked from this tap
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const p = await DeviceOrientationEvent.requestPermission();
      if (p !== 'granted') { msg.textContent = 'Permission denied — allow Motion & Orientation access to see live sensors.'; return; }
    }
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try { await DeviceMotionEvent.requestPermission(); } catch {}
    }
  } catch { msg.textContent = 'This browser didn’t allow sensor access.'; return; }
  if (!('DeviceOrientationEvent' in window) && !('DeviceMotionEvent' in window)) { msg.textContent = 'This browser has no motion sensor support.'; return; }
  sens.on = true; sens.n = 0; sens.t0 = performance.now();
  box.classList.add('on');
  $('sensBtn').classList.add('live');
  $('sensBtnTxt').textContent = 'stop';
  msg.textContent = 'Listening… tilt your device.';
  addEventListener('deviceorientation', onOrient);
  addEventListener('devicemotion', onMotion);
  sens.watchdog = setTimeout(() => {
    if (sens.on && !sens.n) msg.textContent = 'No sensor data — this device or browser doesn’t report motion (desktops usually don’t).';
  }, 2500);
}
function stopSensors() {
  sens.on = false;
  removeEventListener('deviceorientation', onOrient);
  removeEventListener('devicemotion', onMotion);
  clearTimeout(sens.watchdog);
  $('sensors').classList.remove('on');
  $('sensBtn').classList.remove('live');
  $('sensBtnTxt').textContent = 'start';
  $('sensMsg').textContent = 'Sensors stopped.';
}
function onOrient(e) { if (e.beta == null && e.gamma == null) return; sens.o = e; sens.n++; sensFrame(); }
function onMotion(e) { sens.m = e; sens.n++; sensFrame(); }
function sensFrame() {
  if (sens.raf) return;
  sens.raf = requestAnimationFrame(() => {
    sens.raf = 0;
    const o = sens.o, m = sens.m, f1 = (x) => (x == null ? '—' : x.toFixed(1));
    if (o) {
      $('sB').textContent = f1(o.beta) + '°';
      $('sG').textContent = f1(o.gamma) + '°';
      const head = o.webkitCompassHeading != null ? o.webkitCompassHeading : o.alpha;
      $('sA').textContent = head == null ? '—' : Math.round(head) + '°';
      const lim = 45, R = ($('bubble').parentElement.clientWidth / 2) - 13;
      const x = clamp((o.gamma || 0) / lim, -1, 1) * R, y = clamp((o.beta || 0) / lim, -1, 1) * R;
      $('bubble').style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
    if (m) {
      const a = m.accelerationIncludingGravity || m.acceleration;
      if (a && a.x != null) $('sAcc').textContent = `${f1(a.x)} ${f1(a.y)} ${f1(a.z)}`;
      const r = m.rotationRate;
      if (r && r.alpha != null) $('sRot').textContent = `${Math.round(r.alpha)} ${Math.round(r.beta)} ${Math.round(r.gamma)}`;
    }
    const dt = (performance.now() - sens.t0) / 1000;
    if (dt > 1) $('sHz').textContent = Math.round(sens.n / dt) + ' ev/s';
    if (sens.n === 1) $('sensMsg').textContent = 'Live. β = front/back tilt, γ = left/right, accel in m/s² (x y z).';
  });
}

/* =====================================================================
   WIRING
   ===================================================================== */
function redrawAll() { renderLat(); }

function init() {
  // you
  loadIp();
  $('ipHide').addEventListener('click', () => { store.set('hideIp', !store.get('hideIp', false)); renderYou(); });
  $('ipCopy').addEventListener('click', async () => {
    if (!ipInfo || !ipInfo.ip) return;
    toast((await copyText(ipInfo.ip)) ? 'IP copied' : 'Couldn’t copy');
  });

  // latency
  // hooks for the parked speed test (net/speed-card.js): it pauses this monitor
  // while it runs and feeds in its own pings. Inert while the card isn't loaded.
  addEventListener('net:speed', (e) => { lat.held = !!(e.detail && e.detail.running); if (lat.held) latStop(); else latKick(); });
  addEventListener('net:ping', (e) => { if (e.detail) pushPing(e.detail); });
  setPaused(false);
  $('pingToggle').addEventListener('click', () => setPaused(!lat.paused));
  setInterval(tickClock, 100);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) latKick(); });

  // dns
  renderTypeChips(); renderRes(); renderDnsHist();
  $('typeChips').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    dnsState.type = b.dataset.t; store.set('dnsType', dnsState.type); renderTypeChips();
    if ($('dnsIn').value.trim()) runDns($('dnsIn').value);
  });
  $('resSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    dnsState.res = b.dataset.res; store.set('dnsRes', dnsState.res); renderRes();
    if ($('dnsIn').value.trim()) runDns($('dnsIn').value);
  });
  $('dnsForm').addEventListener('submit', (e) => { e.preventDefault(); runDns($('dnsIn').value); $('dnsIn').blur(); });
  $('dnsHist').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; $('dnsIn').value = b.dataset.n; runDns(b.dataset.n); });
  $('dnsClear').addEventListener('click', () => { store.set('dnsHist', []); renderDnsHist(); });
  const q = params.get('dns');
  if (q) { $('dnsIn').value = q.slice(0, 260); runDns(q); }

  // device
  initDevice();
  $('devCopy').addEventListener('click', copyDevice);
  $('sensBtn').addEventListener('click', toggleSensors);

  // theme
  if (window.SZVTheme && SZVTheme.on) SZVTheme.on((n, p) => { pal = p || SZVTheme.palette(); redrawAll(); });
  else addEventListener('szv:theme', (e) => { pal = (e.detail && e.detail.palette) || pal; redrawAll(); });

  // resize -> redraw canvases
  let rT = 0;
  const again = () => { cancelAnimationFrame(rT); rT = requestAnimationFrame(redrawAll); };
  ['spark', 'histo'].forEach((id) => watchSize($(id), again));

  // keyboard
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) { if (e.key === 'Escape') e.target.blur(); return; }
    const k = e.key.toLowerCase();
    if (k === 'p') setPaused(!lat.paused);
    else if (e.key === '/') { e.preventDefault(); $('dnsIn').focus(); $('dnsIn').select(); }
    else if (k === 'c') copyDevice();
  });

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redrawAll);
}

async function copyDevice() {
  const text = asText(collect(live), capabilities());
  const ok = await copyText(text);
  $('devCopyTxt').textContent = ok ? 'copied ✓' : 'copy failed';
  setTimeout(() => { $('devCopyTxt').textContent = 'copy all'; }, 1600);
  if (ok) toast('Device report copied');
}

init();
