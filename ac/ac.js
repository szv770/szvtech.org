(() => {
  'use strict';
  // offline support first: the page keeps working (and reloads) with no network
  try {
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('/ac/sw.js', { scope: '/ac/' }).catch(() => {});
    }
  } catch (e) {}
  const $ = (id) => document.getElementById(id);
  const KEY = 'szv-ac';
  const THEME_KEY = 'szv-ac-theme';
  const MODES = {
    cool: { name: 'Cool', icon: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5"/>', color: 'var(--a2)' },
    heat: { name: 'Heat', icon: '<path d="M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-1.7.8-2.8 1.8-3.8.2 1.2.8 1.8 1.5 2C11.5 7.5 11.5 5 12 3z"/><path d="M12 21a2 2 0 0 0 2-2"/>', color: '#fb923c' },
    fan:  { name: 'Fan',  icon: '<circle cx="12" cy="12" r="1.6"/><path d="M12 10.4C12 6 14.5 4 17 5s2 4-1.6 6M13.6 12c4.4 0 6.4 2.5 5.4 5s-4 2-7.4-1.6M12 13.6C12 18 9.5 20 7 19s-2-4 1.6-6M10.4 12C6 12 4 9.5 5 7s4-2 7.4 1.6"/>', color: 'var(--a1)' },
    dry:  { name: 'Dry',  icon: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>', color: 'var(--a3)' },
    eco:  { name: 'Eco',  icon: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19c3-4 6-6 9-8"/>', color: '#4ade80' },
    auto: { name: 'Auto', icon: '<path d="M12 4l3.2 8h-6.4zM6 20l6-13 6 13M8.5 15h7"/>', color: 'var(--a1)' }
  };
  const MODE_KEYS = Object.keys(MODES);
  const FANS = ['auto', 'low', 'med', 'high', 'powerful'];
  const FAN_INFO = {
    auto:     { name: 'Auto',     short: 'AUTO', lvl: 2.6, bars: 2, drift: 1 },
    low:      { name: 'Low',      short: 'LOW',  lvl: 1,   bars: 1, drift: .8 },
    med:      { name: 'Medium',   short: 'MED',  lvl: 2,   bars: 2, drift: 1 },
    high:     { name: 'High',     short: 'HIGH', lvl: 3,   bars: 3, drift: 1.25 },
    powerful: { name: 'Powerful', short: 'MAX',  lvl: 4.6, bars: 4, drift: 1.8 }
  };
  const OLD_FANS = { 1: 'low', 2: 'med', 3: 'high', 4: 'powerful' };   // numeric speeds saved by earlier versions
  const RANGE = { F: [40, 90], C: [5, 32] };
  const COOLING = ['cool', 'eco', 'auto', 'dry'];
  const DEFAULTS = { room: 'Living Room', target: 72, roomT: 78, unit: 'F', mode: 'cool', fan: 'auto', on: true, status: '', drift: true, wipes: false, wipeCount: 3 };

  let S = Object.assign({}, DEFAULTS);
  try { const raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw && typeof raw === 'object') S = Object.assign(S, raw); } catch (e) {}
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  const buzz = (n) => { try { if (!reduced && navigator.vibrate) navigator.vibrate(n); } catch (e) {} };
  const clamp = (v) => Math.max(RANGE[S.unit][0], Math.min(RANGE[S.unit][1], v));
  const toC = (f) => Math.round((f - 32) * 5 / 9);
  const toF = (c) => Math.round(c * 9 / 5 + 32);
  // sanity-check anything that came out of storage
  S.unit = S.unit === 'C' ? 'C' : 'F';
  S.target = clamp(Math.round(Number(S.target)) || DEFAULTS.target);
  S.roomT = Math.round(Number(S.roomT)) || DEFAULTS.roomT;
  if (!MODES[S.mode]) S.mode = 'cool';
  if (OLD_FANS[S.fan]) S.fan = OLD_FANS[S.fan];
  if (!FANS.includes(S.fan)) S.fan = 'auto';
  S.wipes = S.wipes === true;
  S.wipeCount = Math.max(1, Math.min(5, Math.round(Number(S.wipeCount)) || DEFAULTS.wipeCount));
  S.on = S.on !== false;
  S.room = String(S.room).slice(0, 24); S.status = String(S.status).slice(0, 40);

  // ---- light / dark panel (initial value already set by the inline <head> script) ----
  const root = document.documentElement;
  const themeMQ = matchMedia('(prefers-color-scheme: light)');
  const isLight = () => root.getAttribute('data-ac-theme') === 'light';
  function applyTheme(t) {
    root.setAttribute('data-ac-theme', t);
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'light' ? '#f4f4f3' : '#232529');
    $('themeBtn').setAttribute('aria-label', t === 'light' ? 'Switch to graphite panel' : 'Switch to light panel');
  }
  applyTheme(isLight() ? 'light' : 'dark');
  $('themeBtn').addEventListener('click', () => {
    const t = isLight() ? 'dark' : 'light';
    applyTheme(t); buzz(8);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  });
  const followDevice = () => {
    let saved = null; try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (saved !== 'light' && saved !== 'dark') applyTheme(themeMQ.matches ? 'light' : 'dark');
  };
  try { themeMQ.addEventListener('change', followDevice); } catch (e) {}

  // ---- seven-segment target readout ----
  const DIG = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
  const SEGS = (() => {
    const t = 11, g = 2, L = t / 2, R = 56 - t / 2, T = t / 2, M = 50, B = 100 - t / 2, h = t / 2;
    const H = (x0, x1, y) => `M${x0} ${y}L${x0 + h} ${y - h}H${x1 - h}L${x1} ${y}L${x1 - h} ${y + h}H${x0 + h}Z`;
    const V = (x, y0, y1) => `M${x} ${y0}L${x + h} ${y0 + h}V${y1 - h}L${x} ${y1}L${x - h} ${y1 - h}V${y0 + h}Z`;
    return { a: H(L + g, R - g, T), g: H(L + g, R - g, M), d: H(L + g, R - g, B), f: V(L, T + g, M - g), b: V(R, T + g, M - g), e: V(L, M + g, B - g), c: V(R, M + g, B - g) };
  })();
  const NS = 'http://www.w3.org/2000/svg';
  const segEls = [];
  (() => {
    const svg = $('seg');
    const grp = document.createElementNS(NS, 'g');
    grp.setAttribute('transform', 'translate(8 0) skewX(-5)');
    [0, 70].forEach((dx) => {
      const map = {};
      'abcdefg'.split('').forEach((k) => {
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', SEGS[k]); p.setAttribute('transform', `translate(${dx} 0)`);
        grp.appendChild(p); map[k] = p;
      });
      segEls.push(map);
    });
    svg.appendChild(grp);
  })();
  function drawDigits(n) {
    const s = String(Math.abs(n)).padStart(2, ' ').slice(-2);
    segEls.forEach((map, i) => {
      const on = s[i] === ' ' ? '' : DIG[Number(s[i])];
      for (const k in map) map[k].classList.toggle('on', on.includes(k));
    });
  }

  // ---- mode icon row on the display ----
  (() => {
    const row = $('modeRow');
    MODE_KEYS.forEach((k) => {
      const s = document.createElementNS(NS, 'svg');
      s.setAttribute('viewBox', '0 0 24 24'); s.dataset.mode = k;
      s.innerHTML = MODES[k].icon;   // static markup from this file, no user input
      row.appendChild(s);
    });
  })();

  const wipesActive = () => S.on && S.wipes && COOLING.includes(S.mode);
  const asF = (v) => (S.unit === 'C' ? v * 9 / 5 + 32 : v);
  function autoStatus() {
    const t = S.target + '°';
    if (!S.on) return 'Standby';
    if (wipesActive()) return S.roomT > S.target ? 'Wipes assist · ' + S.wipeCount + ' hanging' : 'Holding ' + t + ' · ' + S.wipeCount + (S.wipeCount === 1 ? ' wipe' : ' wipes') + ' on duty';
    if (S.fan === 'powerful' && S.mode === 'cool' && S.roomT > S.target) return 'Powerful · cooling to ' + t;
    if (S.mode === 'fan') return 'Circulating air';
    if (S.mode === 'dry') return 'Dehumidifying';
    if (S.mode === 'eco') return 'Eco · holding ' + t;
    if (S.mode === 'auto') return 'Auto · holding ' + t;
    if (S.mode === 'heat') return S.roomT < S.target ? 'Heating to ' + t : 'Holding ' + t;
    return S.roomT > S.target ? 'Cooling to ' + t : 'Holding ' + t;
  }

  const fanLevel = () => FAN_INFO[S.fan].lvl;
  // how hard the unit is "working": colder target and a bigger room/target gap = stronger, bluer air
  function coldness() {
    if (!S.on || !COOLING.includes(S.mode)) return { cold: 0, gap: 0 };
    const tF = asF(S.target), rF = asF(S.roomT);
    return { cold: Math.max(0, Math.min(1, (74 - tF) / 34)), gap: Math.max(0, Math.min(1, (rF - tF) / 20)) };
  }
  const EL = { chill: document.querySelector('.chill'), coldfx: document.querySelector('.coldfx'), screen: $('screen'), flap: document.querySelector('.flap.open') };
  const setVar = (el, k, v) => { if (el && el.style.getPropertyValue(k) !== v) el.style.setProperty(k, v); };
  const setText = (id, v) => { const el = $(id); if (el.textContent !== v) el.textContent = v; };
  const WIPE_SLOTS = { 1: [.3], 2: [.26, .74], 3: [.2, .36, .74], 4: [.18, .34, .66, .82], 5: [.1, .25, .39, .68, .84] };   // centre kept clear for the pencil
  let wipesBuilt = -1;
  function renderWipes() {
    const box = $('wipes');
    box.classList.toggle('on', S.wipes);
    if (wipesBuilt !== S.wipeCount) {
      wipesBuilt = S.wipeCount;
      box.querySelectorAll('.wipe').forEach((el) => el.remove());
      WIPE_SLOTS[S.wipeCount].forEach((u, i) => {
        const w = document.createElement('div'); w.className = 'wipe';
        w.style.left = (u * 100) + '%';
        w.style.top = (2 + 16 * u * (1 - u) - 1) + 'px';          // sits on the sagging line
        w.style.setProperty('--wd', (-i * .37 - Math.random() * .5).toFixed(2) + 's');
        w.innerHTML = '<i class="pin"></i><b class="cloth"></b>';  // static markup
        box.appendChild(w);
      });
    }
    // flutter follows the airflow (none when off; a very gentle sway with reduced motion)
    const blowing = S.on ? fanLevel() * (S.mode === 'heat' ? .6 : 1) : 0;
    const amp = !S.on ? 0 : reduced ? Math.min(2.2, .8 + blowing * .35) : Math.min(14, 2 + blowing * 2.6);
    setVar(box, '--wamp', amp.toFixed(2));
    setVar(box, '--wdur', (reduced ? 4.5 : Math.max(.35, 1.9 - blowing * .33)).toFixed(2) + 's');
  }
  function render() {
    const m = MODES[S.mode], F = FAN_INFO[S.fan], cg = coldness();
    document.body.classList.toggle('off', !S.on);
    document.body.dataset.mode = S.mode;
    // each variable is written only on the element that uses it, and only when it changes,
    // so a +/- press restyles a couple of layers instead of the whole page
    setVar(root, '--mode', m.color);
    setVar(EL.chill, '--flow', (S.on ? (S.mode === 'heat' ? .5 : 1) * (.35 + fanLevel() / 4 * .65) * (1 + cg.cold * .3) : 0).toFixed(2));
    setVar(EL.coldfx, '--cold', ((cg.cold * .7 + cg.gap * .3) * Math.min(1, .45 + fanLevel() / 4 * .55) + (wipesActive() ? .08 : 0)).toFixed(2));
    setVar(EL.screen, '--frosty', (S.on && COOLING.includes(S.mode) ? Math.max(0, Math.min(1, (62 - asF(S.target)) / 20)) : 0).toFixed(2));
    setVar(EL.flap, '--swing', (4 + fanLevel() * 2.2).toFixed(1));
    setVar(EL.flap, '--swing-dur', (10 - fanLevel() * 1.3).toFixed(1) + 's');
    if ($('modeBtnI').dataset.m !== S.mode) { $('modeBtnI').dataset.m = S.mode; $('modeBtnI').innerHTML = m.icon; }   // static markup from MODES
    const tags = $('tags'), tagKey = (S.on && S.fan === 'powerful' ? 'P' : '') + (S.on && S.wipes ? 'W' + S.wipeCount : '');
    if (tags.dataset.k !== tagKey) {
      tags.dataset.k = tagKey; tags.textContent = '';
      if (S.on && S.fan === 'powerful') { const t = document.createElement('span'); t.className = 'w-tag boost'; t.textContent = 'POWERFUL'; tags.appendChild(t); }
      if (S.on && S.wipes) { const t = document.createElement('span'); t.className = 'w-tag'; t.textContent = 'WIPES ×' + S.wipeCount; tags.appendChild(t); }
    }
    $('wipesBtn').setAttribute('aria-pressed', String(S.wipes));
    $('wipesBtnV').textContent = S.wipes ? '×' + S.wipeCount : 'Off';
    renderWipes();
    [...$('modeRow').children].forEach((el) => el.classList.toggle('on', el.dataset.mode === S.mode));
    $('modeName').textContent = m.name.toUpperCase();
    $('modeBtnV').textContent = m.name;
    $('roomName').textContent = S.room || ' ';
    $('target').textContent = S.target;
    drawDigits(S.target);
    $('unitLabel').textContent = '°' + S.unit;
    $('roomT').textContent = S.roomT + '°';
    [...$('fanBars').children].forEach((el, i) => el.classList.toggle('on', S.on && i < F.bars));
    $('fanName').textContent = F.short;
    $('fanBtnV').textContent = F.name;
    $('status').textContent = S.status.trim() || autoStatus();
    $('power').setAttribute('aria-pressed', String(S.on));
    ['down', 'up'].forEach((id) => { $(id).disabled = !S.on; $(id).style.opacity = S.on ? '' : '.35'; });
    $('modeBtn').disabled = $('fanBtn').disabled = !S.on;
    $('modeBtn').style.opacity = $('fanBtn').style.opacity = S.on ? '' : '.35';
    $('fanBtn').setAttribute('aria-label', 'Fan: ' + F.name);
    $('wipesBtn').setAttribute('aria-label', S.wipes ? 'Wipes: ' + S.wipeCount + ' hanging' : 'Wipes: off');
    if ($('sheet').classList.contains('on')) renderSheet();
    Air.update();
  }

  function setTarget(v) { catchUp(); const n = clamp(v); if (n !== S.target) { S.target = n; buzz(8); } render(); save(); }
  function cycle(list, cur, dir) { return list[(list.indexOf(cur) + (dir || 1) + list.length) % list.length]; }
  const nextMode = () => { catchUp(); S.mode = cycle(MODE_KEYS, S.mode); buzz(10); render(); save(); };
  const nextFan = () => { catchUp(); S.fan = cycle(FANS, S.fan); buzz(10); render(); save(); };
  function setPower(on) { catchUp(); S.on = on; buzz(on ? [12, 40, 12] : 20); render(); save(); wake(); }
  const toggleWipes = () => { catchUp(); S.wipes = !S.wipes; buzz(10); render(); save(); };
  const setWipeCount = (n) => { catchUp(); S.wipeCount = Math.max(1, Math.min(5, n)); render(); save(); };

  // press-and-hold repeat (tap = exactly one step; 10px slop so jitter/scroll doesn't misfire).
  // The first step happens on press; repeats only start after a real hold. If the release turns out
  // to have happened early (its event timestamp says so, e.g. it was delivered late on a busy frame),
  // any repeat steps are taken back so a tap never counts as a hold.
  const HOLD_MS = 500;
  function holdable(btn, fn, snap, restore) {
    let t1, t2, sx, sy, t0 = 0, active = false, repeated = false, saved;
    const stop = () => { active = false; clearTimeout(t1); clearInterval(t2); };
    btn.addEventListener('pointerdown', (e) => {
      if (btn.disabled || (e.button !== undefined && e.button > 0)) return;
      stop(); sx = e.clientX; sy = e.clientY; t0 = e.timeStamp; active = true; repeated = false;
      fn(); saved = snap ? snap() : undefined;
      t1 = setTimeout(() => { if (!active) return; repeated = true; fn(); t2 = setInterval(fn, 110); }, HOLD_MS);
    });
    btn.addEventListener('pointermove', (e) => { if (active && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) stop(); });
    btn.addEventListener('pointerup', (e) => {
      const wasActive = active; stop();
      if (wasActive && repeated && restore && e.timeStamp - t0 < HOLD_MS) restore(saved);
    });
    ['pointercancel', 'pointerleave', 'lostpointercapture', 'blur'].forEach((ev) => btn.addEventListener(ev, stop));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
  }
  const snapT = () => S.target, restoreT = (v) => { S.target = v; render(); save(); };
  holdable($('up'), () => { if (S.on) setTarget(S.target + 1); }, snapT, restoreT);
  holdable($('down'), () => { if (S.on) setTarget(S.target - 1); }, snapT, restoreT);
  $('power').addEventListener('click', () => setPower(!S.on));
  $('modeBtn').addEventListener('click', nextMode);
  $('fanBtn').addEventListener('click', nextFan);
  $('wipesBtn').addEventListener('click', toggleWipes);

  // room temperature slowly meanders toward the target while on (cool/heat/eco/auto):
  // ~1 degree per 90s at normal fan; Powerful and hanging wipes speed it up. Progress is integrated
  // over wall-clock time, so sleep / hidden tabs / throttled timers / offline catch up correctly.
  const DRIFT_MS = 90000;
  let driftAt = Date.now(), driftProg = 0;
  function driftDir() {
    if (!S.on || !S.drift || S.roomT === S.target) return 0;
    if (S.mode === 'fan') return 0;
    if (S.mode === 'dry') return wipesActive() && S.roomT > S.target ? -1 : 0;   // wipes still help
    if (S.mode === 'cool') return S.roomT > S.target ? -1 : 0;
    if (S.mode === 'heat') return S.roomT < S.target ? 1 : 0;
    return S.roomT > S.target ? -1 : 1;                                          // eco / auto
  }
  function driftRate() {
    if (!driftDir()) return 0;
    let r = S.mode === 'heat' ? 1 : FAN_INFO[S.fan].drift;
    if (wipesActive() && driftDir() < 0) r *= 1 + .3 * S.wipeCount;               // 5 wipes = 2.5x
    return r;
  }
  function catchUp() {
    const now = Date.now();
    if (now < driftAt) { driftAt = now; return; }          // clock went backwards
    const rate = driftRate();
    driftProg = rate ? driftProg + (now - driftAt) * rate : 0;
    driftAt = now;
    let moved = false, guard = 0;
    while (driftProg >= DRIFT_MS && guard++ < 300) {
      const d = driftDir();
      if (!d) { driftProg = 0; break; }
      S.roomT += d; driftProg -= DRIFT_MS; moved = true;
    }
    if (moved) { render(); save(); }
  }
  setInterval(catchUp, 15000);

  // keep the screen awake while on (it lives on a big screen)
  let lock = null;
  async function wake() {
    try {
      if (!('wakeLock' in navigator)) return;
      if (S.on && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
      else if (!S.on && lock) { await lock.release(); lock = null; }
    } catch (e) { lock = null; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    catchUp(); render(); wake();
  });
  addEventListener('pageshow', (e) => { if (e.persisted) { catchUp(); render(); wake(); } });
  addEventListener('pointerdown', wake, { once: true });

  // ---- cold air coming out of the louver (canvas; pauses when hidden, stops when off) ----
  // layers: a wide frost plume fanning out, broad soft streams, thin travelling flow lines,
  // mist puffs and tiny ice sparkles. Strength = fan level x how cold / how far from target.
  const Air = (() => {
    const cv = $('airfx'), outlet = $('outlet');
    const ctx = cv.getContext && cv.getContext('2d');
    if (!ctx) return { update() {} };
    const small = Math.min(innerWidth, innerHeight) < 600;
    const CAP = (small ? 60 : 150) * (reduced ? .6 : 1);
    const SCAP = (small ? 24 : 70) * (reduced ? .5 : 1);
    const dprMax = 1;               // soft air needs no hi-dpi pixels: 1x keeps fill cost low on phones / TVs
    let W = 0, H = 0, dpr = 1, ox0 = 0, ox1 = 0, oy = 0, oh = 0, sc = 1, vs = 1;
    let parts = [], sparks = [], raf = 0, last = 0, acc = 0, sacc = 0, level = 0, want = 0, chill = 0, chillWant = 0, t0 = performance.now();
    const ribbons = Array.from({ length: 9 }, (_, i) => ({ u: (i + .5) / 9 + (Math.random() - .5) * .05, ph: Math.random() * 6.28, w: .5 + Math.random() * .6 }));
    const sprites = {};
    function sprite(rgb) {
      if (sprites[rgb]) return sprites[rgb];
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, `rgba(${rgb},.6)`); gr.addColorStop(.4, `rgba(${rgb},.3)`); gr.addColorStop(.75, `rgba(${rgb},.08)`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return (sprites[rgb] = c);
    }
    function measure() {
      const r = cv.getBoundingClientRect(), o = outlet.getBoundingClientRect();
      dpr = Math.min(devicePixelRatio || 1, dprMax);
      W = r.width; H = r.height;
      cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
      ox0 = o.left - r.left; ox1 = o.right - r.left; oy = o.bottom - r.top; oh = o.height;
      sc = Math.max(.7, Math.min(2.2, W / 900)); vs = Math.max(.6, Math.min(2.5, (H - oy + oh) / 120));
    }
    try { new ResizeObserver(measure).observe(cv); } catch (e) { addEventListener('resize', measure); }
    measure();

    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',');
    const tint = (c) => {
      const light = isLight();
      if (S.mode === 'heat') return { rgb: light ? '236,140,90' : '255,170,120', a: .45, spark: 0 };
      if (S.mode === 'fan') return { rgb: light ? '150,170,190' : '220,232,245', a: .7, spark: .25 };
      // colder target = deeper, bluer frost
      return light ? { rgb: mix([115, 182, 235], [62, 148, 232], c), a: 1, spark: 1 }
                   : { rgb: mix([175, 222, 255], [120, 195, 255], c), a: 1, spark: 1 };
    };
    function spawn(n, k) {
      const span = ox1 - ox0;
      for (let i = 0; i < n && parts.length < CAP; i++) {
        const u = Math.random(), x = ox0 + span * (.03 + u * .94);
        const side = (u - .5) * 2;
        const sp = vs * (reduced ? .28 : 1) * (26 + level * 22) * (.7 + Math.random() * .6);
        const y = oy - oh * (.1 + Math.random() * .25);
        // live just long enough to fade out around the bottom edge (velocity decays, hence 1.6x)
        const max = Math.max(.8, Math.min(reduced ? 7 : 4, (H - y) / sp * 1.6 * (.75 + Math.random() * .5)));
        parts.push({ x, y, vx: side * sp * (.45 + Math.random() * .5) * (.7 + k), vy: sp, r: sc * (7 + Math.random() * 14) * (.8 + k * .5), life: 0, max, ph: Math.random() * 6.28 });
      }
    }
    function spawnSparks(n) {
      const span = ox1 - ox0;
      for (let i = 0; i < n && sparks.length < SCAP; i++) {
        const u = Math.random(), side = (u - .5) * 2;
        const sp = vs * (reduced ? .18 : 1) * (22 + level * 16) * (.6 + Math.random() * .8);
        const y = oy - oh * .05;
        sparks.push({ x: ox0 + span * (.04 + u * .92), y, vx: side * sp * .5, vy: sp, s: (1 + Math.random() * 1.6) * Math.sqrt(sc), life: 0,
          max: Math.max(.9, Math.min(reduced ? 8 : 3.5, (H - y) / sp * 1.5)), ph: Math.random() * 6.28, tw: 4 + Math.random() * 6 });
      }
    }
    const FRAME_MS = reduced ? 1000 / 24 : 1000 / 30;   // ~30fps is plenty for drifting air
    function frame(now) {
      raf = 0;
      if (document.hidden) return;
      if (last && now - last < FRAME_MS - 2) { raf = requestAnimationFrame(frame); return; }
      const dt = Math.min(.06, (now - (last || now)) / 1000); last = now;
      const time = (now - t0) / 1000;
      // ease the overall strength toward what the fan asks for (auto breathes a little)
      const target = want * (S.fan === 'auto' ? 1 + .18 * Math.sin(time * .35) : 1);
      const ease = Math.min(1, dt * (reduced ? .6 : 1.2));
      level += (target - level) * ease; chill += (chillWant - chill) * ease;
      const tn = tint(chill);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const light = isLight();
      ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
      const k = Math.min(1.25, level / 4);       // 0..~1.2 strength
      const amp = reduced ? .35 : 1;
      const tsp = reduced ? .3 : 1;               // time speed for sways / shimmer
      const span = ox1 - ox0, drop = H - oy + 10, top = oy - oh * .14;
      const shimmer = .86 + .14 * Math.sin(time * .7 * tsp);

      // 1. the plume: one wide frost fan from the whole louver, widening as it falls
      const spread = span * (.05 + .16 * k);
      let gr = ctx.createLinearGradient(0, top, 0, H);
      const pa = tn.a * (light ? .2 : .13) * (.3 + .7 * k) * shimmer * (.8 + .4 * chill);
      gr.addColorStop(0, `rgba(${tn.rgb},${pa})`); gr.addColorStop(.45, `rgba(${tn.rgb},${pa * .55})`); gr.addColorStop(1, `rgba(${tn.rgb},0)`);
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(ox0 + span * .015, top); ctx.lineTo(ox1 - span * .015, top);
      ctx.quadraticCurveTo(ox1 + spread * .4, top + drop * .5, ox1 + spread, H); ctx.lineTo(ox0 - spread, H);
      ctx.quadraticCurveTo(ox0 - spread * .4, top + drop * .5, ox0 + span * .015, top); ctx.fill();

      // 2. broad soft streams (visible bands of moving air)
      const ns = (small ? 4 : 6) + (S.fan === 'powerful' ? 1 : 0);
      ctx.lineCap = 'round';
      for (let i = 0; i < ns; i++) {
        const u = (i + .5) / ns + .025 * Math.sin(time * .23 * tsp + i * 2.1), x0 = ox0 + span * u, side = (u - .5) * 2;
        const sway = Math.sin(time * (.5 + i * .07) * tsp + i * 1.9) * 14 * sc * amp;
        gr = ctx.createLinearGradient(0, top, 0, oy + drop);
        const a = tn.a * (light ? .095 : .085) * (.35 + k) * (.65 + .35 * Math.sin(time * .9 * tsp + i * 1.7));
        gr.addColorStop(0, `rgba(${tn.rgb},0)`); gr.addColorStop(.12, `rgba(${tn.rgb},${a})`); gr.addColorStop(1, `rgba(${tn.rgb},0)`);
        ctx.strokeStyle = gr; ctx.lineWidth = span / ns * (.32 + .26 * Math.min(1, k));
        ctx.beginPath(); ctx.moveTo(x0, top);
        ctx.bezierCurveTo(x0 + sway * .3, top + drop * .35, x0 + side * span * .1 * (.6 + k) + sway, top + drop * .7, x0 + side * span * .2 * (.6 + k) + sway * 1.4, H + 10);
        ctx.stroke();
      }

      // 3. thin flow lines with travelling dashes
      const nr = Math.max(3, Math.round(3 + level * 1.5));
      for (let i = 0; i < nr; i++) {
        const rb = ribbons[Math.min(ribbons.length - 1, Math.floor((i + .5) * ribbons.length / nr))], x0 = ox0 + span * rb.u, side = (rb.u - .5) * 2;
        ctx.beginPath();
        for (let st = 0; st <= 12; st++) {
          const t = st / 12;
          const x = x0 + side * span * .2 * Math.pow(t, 1.3) * (.6 + k) + Math.sin(time * rb.w * tsp + rb.ph + t * 4) * 10 * sc * amp * t, y = top + drop * t;
          st ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        gr = ctx.createLinearGradient(0, top, 0, oy + drop);
        const a = tn.a * (light ? .34 : .26) * (.4 + k) * (.75 + .25 * Math.sin(time * .8 * tsp + rb.ph));
        gr.addColorStop(0, `rgba(${tn.rgb},0)`); gr.addColorStop(.18, `rgba(${tn.rgb},${a})`); gr.addColorStop(1, `rgba(${tn.rgb},0)`);
        ctx.strokeStyle = gr;
        ctx.setLineDash([]); ctx.lineWidth = sc * (small ? 8 : 11) * (.6 + k * .6); ctx.stroke();
        ctx.setLineDash([sc * (18 + 22 * k), sc * 34]); ctx.lineDashOffset = -time * (reduced ? 10 : 40 + 70 * k) - rb.ph * 30;
        ctx.lineWidth = 1.6 * sc; ctx.stroke();
      }
      ctx.setLineDash([]);

      // 4. mist puffs
      acc += dt * (reduced ? 10 : 28) * level * (small ? .6 : 1);
      let n = acc | 0; acc -= n; spawn(n, k);
      const img = sprite(tn.rgb);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life += dt;
        const f = p.life / p.max;
        if (f >= 1 || p.y > H + 30) { parts.splice(i, 1); continue; }
        p.vx *= 1 - dt * .4; p.vy *= 1 - dt * .55;
        p.x += (p.vx + Math.sin(time * 1.3 * tsp + p.ph) * 8 * sc * amp) * dt; p.y += p.vy * dt;
        const r = p.r * (1 + f * 2.2);
        ctx.globalAlpha = tn.a * (light ? .32 : .18) * Math.sin(Math.PI * f) * (.5 + k);
        ctx.drawImage(img, p.x - r, p.y - r, r * 2, r * 2);
      }

      // 5. ice sparkles: tiny twinkling crosses carried in the stream (more when colder)
      sacc += dt * (reduced ? 2.5 : 10) * k * tn.spark * (.4 + chill) * (small ? .6 : 1);
      n = sacc | 0; sacc -= n; spawnSparks(n);
      ctx.fillStyle = light ? 'rgb(70,150,235)' : 'rgb(235,248,255)';
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.life += dt;
        const f = p.life / p.max;
        if (f >= 1 || p.y > H + 10) { sparks.splice(i, 1); continue; }
        p.vx *= 1 - dt * .3; p.vy *= 1 - dt * .4;
        p.x += (p.vx + Math.sin(time * 2 * tsp + p.ph) * 6 * sc * amp) * dt; p.y += p.vy * dt;
        const tw = .5 + .5 * Math.sin(time * p.tw * (reduced ? .3 : 1) + p.ph);
        ctx.globalAlpha = Math.sin(Math.PI * f) * tw * (light ? .55 : .8);
        const z = p.s * (.6 + tw * .6);
        ctx.fillRect(p.x - z * 2, p.y - z * .25, z * 4, z * .5);
        ctx.fillRect(p.x - z * .25, p.y - z * 2, z * .5, z * 4);
      }
      ctx.globalAlpha = 1;
      if (want > 0 || level > .02 || parts.length || sparks.length) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W, H);
    }
    function start() { if (!raf && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
    return {
      update() {
        const cg = coldness();
        chillWant = cg.cold;
        want = S.on ? fanLevel() * (S.mode === 'heat' ? .7 : 1) * (COOLING.includes(S.mode) ? .8 + .3 * cg.cold + .2 * cg.gap : 1) * (wipesActive() ? 1.05 : 1) : 0;
        if (want > 0 || level > .02) start();
      }
    };
  })();

  // ---- edit sheet ----
  const sheet = $('sheet'), back = $('back');
  function chips(el, items, cur, onPick) {
    el.textContent = '';
    items.forEach(([val, label]) => {
      const b = document.createElement('button');
      b.className = 'btn chip'; b.type = 'button'; b.textContent = label;
      b.setAttribute('aria-pressed', String(val === cur));
      b.addEventListener('click', () => { onPick(val); buzz(8); });
      el.appendChild(b);
    });
  }
  function renderSheet() {
    $('eTVal').textContent = S.target + '°' + S.unit;
    $('eRVal').textContent = S.roomT + '°' + S.unit;
    $('eStatus').placeholder = autoStatus();
    $('eDrift').checked = !!S.drift;
    chips($('eUnit'), [['F', '°F'], ['C', '°C']], S.unit, (u) => {
      if (u === S.unit) return;
      S.target = u === 'C' ? toC(S.target) : toF(S.target);
      S.roomT = u === 'C' ? toC(S.roomT) : toF(S.roomT);
      S.unit = u; S.target = clamp(S.target); render(); save();
    });
    chips($('eMode'), MODE_KEYS.map((k) => [k, MODES[k].name]), S.mode, (k) => { S.mode = k; render(); save(); });
    chips($('eFan'), FANS.map((f) => [f, FAN_INFO[f].name]), S.fan, (f) => { catchUp(); S.fan = f; render(); save(); });
    chips($('eWipes'), [[false, 'Off'], [true, 'Hang']], S.wipes, (v) => { if (v !== S.wipes) toggleWipes(); });
    $('eWVal').textContent = String(S.wipeCount);
  }
  let lastFocus = null;
  function openSheet() {
    lastFocus = document.activeElement;
    $('eRoom').value = S.room; $('eStatus').value = S.status;
    renderSheet();
    sheet.hidden = back.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => { sheet.classList.add('on'); back.classList.add('on'); }));
    setTimeout(() => $('eDone').focus({ preventScroll: true }), 50);
  }
  function closeSheet() {
    sheet.classList.remove('on'); back.classList.remove('on');
    setTimeout(() => { sheet.hidden = back.hidden = true; }, reduced ? 260 : 460);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  $('pencil').addEventListener('click', openSheet);
  $('eDone').addEventListener('click', closeSheet);
  back.addEventListener('click', closeSheet);
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheet.classList.contains('on')) { closeSheet(); return; }
    if (sheet.classList.contains('on') || /^(INPUT|TEXTAREA)$/.test((e.target || {}).tagName || '')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'ArrowUp' && S.on) { e.preventDefault(); setTarget(S.target + 1); }
    else if (e.key === 'ArrowDown' && S.on) { e.preventDefault(); setTarget(S.target - 1); }
    else if (e.key === 'm' && S.on) nextMode();
    else if (e.key === 'f' && S.on) nextFan();
    else if (e.key === 'p') setPower(!S.on);
    else if (e.key === 'w') toggleWipes();
  });
  $('eRoom').addEventListener('input', (e) => { S.room = e.target.value.slice(0, 24); render(); save(); });
  $('eStatus').addEventListener('input', (e) => { S.status = e.target.value.slice(0, 40); render(); save(); });
  $('eDrift').addEventListener('change', (e) => { S.drift = e.target.checked; save(); });
  holdable($('eTUp'), () => setTarget(S.target + 1));
  holdable($('eTDown'), () => setTarget(S.target - 1));
  holdable($('eRUp'), () => { S.roomT = Math.min(S.roomT + 1, 120); render(); save(); });
  holdable($('eWUp'), () => setWipeCount(S.wipeCount + 1));
  holdable($('eWDown'), () => setWipeCount(S.wipeCount - 1));
  holdable($('eRDown'), () => { S.roomT = Math.max(S.roomT - 1, -20); render(); save(); });
  $('eReset').addEventListener('click', () => {
    S = Object.assign({}, DEFAULTS); $('eRoom').value = S.room; $('eStatus').value = ''; render(); save();
  });

  render();
  wake();
})();
