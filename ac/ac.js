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
  const FANS = ['auto', 1, 2, 3, 4];
  const RANGE = { F: [60, 90], C: [16, 32] };
  const DEFAULTS = { room: 'Living Room', target: 72, roomT: 78, unit: 'F', mode: 'cool', fan: 'auto', on: true, status: '', drift: true };

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
  if (!FANS.includes(S.fan)) S.fan = 'auto';
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

  function autoStatus() {
    const t = S.target + '°';
    if (!S.on) return 'Standby';
    if (S.mode === 'fan') return 'Circulating air';
    if (S.mode === 'dry') return 'Dehumidifying';
    if (S.mode === 'eco') return 'Eco · holding ' + t;
    if (S.mode === 'auto') return 'Auto · holding ' + t;
    if (S.mode === 'heat') return S.roomT < S.target ? 'Heating to ' + t : 'Holding ' + t;
    return S.roomT > S.target ? 'Cooling to ' + t : 'Holding ' + t;
  }

  const fanLevel = () => (S.fan === 'auto' ? 2.6 : S.fan);
  function render() {
    const m = MODES[S.mode];
    document.body.classList.toggle('off', !S.on);
    document.body.dataset.mode = S.mode;
    root.style.setProperty('--mode', m.color);
    root.style.setProperty('--flow', S.on ? String((S.mode === 'heat' ? .5 : 1) * (.35 + fanLevel() / 4 * .65)) : '0');
    [...$('modeRow').children].forEach((el) => el.classList.toggle('on', el.dataset.mode === S.mode));
    $('modeName').textContent = m.name.toUpperCase();
    $('modeBtnV').textContent = m.name;
    $('roomName').textContent = S.room || ' ';
    $('target').textContent = S.target;
    drawDigits(S.target);
    $('unitLabel').textContent = '°' + S.unit;
    $('roomT').textContent = S.roomT + '°';
    const lvl = S.fan === 'auto' ? 2 : S.fan;
    [...$('fanBars').children].forEach((el, i) => el.classList.toggle('on', S.on && i < lvl));
    $('fanName').textContent = String(S.fan).toUpperCase();
    $('fanBtnV').textContent = S.fan === 'auto' ? 'Auto' : 'Speed ' + S.fan;
    $('status').textContent = S.status.trim() || autoStatus();
    $('power').setAttribute('aria-pressed', String(S.on));
    ['down', 'up'].forEach((id) => { $(id).disabled = !S.on; $(id).style.opacity = S.on ? '' : '.35'; });
    $('modeBtn').disabled = $('fanBtn').disabled = !S.on;
    $('modeBtn').style.opacity = $('fanBtn').style.opacity = S.on ? '' : '.35';
    if ($('sheet').classList.contains('on')) renderSheet();
    Air.update();
  }

  function setTarget(v) { const n = clamp(v); if (n !== S.target) { S.target = n; buzz(8); } render(); save(); }
  function cycle(list, cur, dir) { return list[(list.indexOf(cur) + (dir || 1) + list.length) % list.length]; }
  const nextMode = () => { S.mode = cycle(MODE_KEYS, S.mode); buzz(10); render(); save(); };
  const nextFan = () => { S.fan = cycle(FANS, S.fan); buzz(10); render(); save(); };
  function setPower(on) { S.on = on; buzz(on ? [12, 40, 12] : 20); render(); save(); wake(); }

  // press-and-hold repeat for the +/- buttons (tap = one step; 10px slop so scroll/jitter doesn't misfire)
  function holdable(btn, fn) {
    let t1, t2, sx, sy, active = false;
    const stop = () => { active = false; clearTimeout(t1); clearInterval(t2); };
    btn.addEventListener('pointerdown', (e) => {
      if (btn.disabled || (e.button !== undefined && e.button > 0)) return;
      stop(); sx = e.clientX; sy = e.clientY; active = true; fn();
      t1 = setTimeout(() => { t2 = setInterval(fn, 110); }, 480);
    });
    btn.addEventListener('pointermove', (e) => { if (active && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) stop(); });
    ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture', 'blur'].forEach((ev) => btn.addEventListener(ev, stop));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
  }
  holdable($('up'), () => { if (S.on) setTarget(S.target + 1); });
  holdable($('down'), () => { if (S.on) setTarget(S.target - 1); });
  $('power').addEventListener('click', () => setPower(!S.on));
  $('modeBtn').addEventListener('click', nextMode);
  $('fanBtn').addEventListener('click', nextFan);

  // room temperature slowly meanders toward the target while on (cool/heat/eco/auto):
  // one degree per 90s of wall-clock time, caught up after sleep / hidden tabs / throttled timers
  const DRIFT_MS = 90000;
  let driftAt = Date.now();
  function driftStep() {
    if (!S.on || !S.drift || S.mode === 'fan' || S.mode === 'dry') return false;
    if (S.mode === 'cool' && S.roomT <= S.target) return false;
    if (S.mode === 'heat' && S.roomT >= S.target) return false;
    if (S.roomT === S.target) return false;
    S.roomT += S.roomT > S.target ? -1 : 1; return true;
  }
  function catchUp() {
    const now = Date.now();
    if (now < driftAt) { driftAt = now; return; }          // clock went backwards
    const steps = Math.floor((now - driftAt) / DRIFT_MS);
    if (!steps) return;
    driftAt += steps * DRIFT_MS;
    let moved = false;
    for (let i = 0; i < Math.min(steps, 200); i++) { if (!driftStep()) break; moved = true; }
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
  const Air = (() => {
    const cv = $('airfx'), outlet = $('outlet');
    const ctx = cv.getContext && cv.getContext('2d');
    if (!ctx) return { update() {} };
    const small = Math.min(innerWidth, innerHeight) < 600;
    const CAP = (small ? 70 : 170) * (reduced ? .6 : 1);
    const dprMax = small ? 1.5 : 2;
    let W = 0, H = 0, dpr = 1, ox0 = 0, ox1 = 0, oy = 0, oh = 0, sc = 1, vs = 1;
    let parts = [], raf = 0, last = 0, acc = 0, level = 0, want = 0, t0 = performance.now();
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

    const tint = () => {
      const light = isLight();
      if (S.mode === 'heat') return { rgb: light ? '236,140,90' : '255,170,120', a: .45 };
      if (S.mode === 'fan') return { rgb: light ? '150,170,190' : '220,232,245', a: .7 };
      return { rgb: light ? '90,170,235' : '170,220,255', a: 1 };
    };
    function spawn(n) {
      const span = ox1 - ox0;
      for (let i = 0; i < n && parts.length < CAP; i++) {
        const u = Math.random(), x = ox0 + span * (.03 + u * .94);
        const side = (u - .5) * 2;
        const sp = vs * (reduced ? .28 : 1) * (26 + level * 22) * (.7 + Math.random() * .6);
        const y = oy - oh * (.1 + Math.random() * .25);
        // live just long enough to fade out around the bottom edge (velocity decays, hence 1.6x)
        const max = Math.max(.8, Math.min(reduced ? 7 : 4, (H - y) / sp * 1.6 * (.75 + Math.random() * .5)));
        parts.push({ x, y, vx: side * sp * (.35 + Math.random() * .4), vy: sp, r: sc * (6 + Math.random() * 12), life: 0, max, ph: Math.random() * 6.28 });
      }
    }
    function frame(now) {
      raf = 0;
      if (document.hidden) return;
      const dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
      const time = (now - t0) / 1000;
      // ease the overall strength toward what the fan asks for (auto breathes a little)
      const target = want * (S.fan === 'auto' ? 1 + .18 * Math.sin(time * .35) : 1);
      level += (target - level) * Math.min(1, dt * (reduced ? .6 : 1.2));
      const tn = tint();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const light = isLight();
      ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
      const k = level / 4;             // 0..1 strength
      const amp = reduced ? .35 : 1;
      // flowing ribbons (stroke + travelling dashes)
      const span = ox1 - ox0, drop = H - oy + 10;
      ctx.lineCap = 'round';
      const nr = Math.max(3, Math.round(3 + level * 1.5));
      for (let i = 0; i < nr && i < ribbons.length; i++) {
        const rb = ribbons[Math.min(ribbons.length - 1, Math.floor((i + .5) * ribbons.length / nr))], x0 = ox0 + span * rb.u, side = (rb.u - .5) * 2;
        const pts = [];
        for (let s = 0; s <= 12; s++) {
          const t = s / 12;
          pts.push([x0 + side * span * .16 * Math.pow(t, 1.3) * (.6 + k) + Math.sin(time * rb.w * (reduced ? .35 : 1) + rb.ph + t * 4) * 10 * sc * amp * t, oy - oh * .15 + drop * t]);
        }
        const gr = ctx.createLinearGradient(0, oy - oh * .15, 0, oy + drop);
        const a = tn.a * (light ? .3 : .22) * (.4 + k) * (.75 + .25 * Math.sin(time * .8 + rb.ph));
        gr.addColorStop(0, `rgba(${tn.rgb},0)`); gr.addColorStop(.18, `rgba(${tn.rgb},${a})`); gr.addColorStop(1, `rgba(${tn.rgb},0)`);
        ctx.strokeStyle = gr;
        ctx.beginPath(); pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.setLineDash([]); ctx.lineWidth = sc * (small ? 10 : 14) * (.6 + k * .6); ctx.stroke();
        ctx.setLineDash([sc * (18 + 22 * k), sc * 34]); ctx.lineDashOffset = -time * (reduced ? 10 : 40 + 60 * k) - rb.ph * 30;
        ctx.lineWidth = 1.2 * sc; ctx.stroke();
      }
      ctx.setLineDash([]);
      // mist particles
      acc += dt * (reduced ? 10 : 28) * level * (small ? .6 : 1);
      const n = acc | 0; acc -= n; spawn(n);
      const img = sprite(tn.rgb);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life += dt;
        const f = p.life / p.max;
        if (f >= 1 || p.y > H + 30) { parts.splice(i, 1); continue; }
        p.vx *= 1 - dt * .4; p.vy *= 1 - dt * .55;
        p.x += (p.vx + Math.sin(time * 1.3 + p.ph) * 8 * sc * amp) * dt; p.y += p.vy * dt;
        const r = p.r * (1 + f * 2.2);
        ctx.globalAlpha = tn.a * (light ? .32 : .18) * Math.sin(Math.PI * f) * (.5 + k);
        ctx.drawImage(img, p.x - r, p.y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      if (want > 0 || level > .02 || parts.length) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W, H);
    }
    function start() { if (!raf && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
    return {
      update() { want = S.on ? fanLevel() * (S.mode === 'heat' ? .7 : 1) : 0; if (want > 0 || level > .02) start(); }
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
    chips($('eFan'), FANS.map((f) => [f, f === 'auto' ? 'Auto' : String(f)]), S.fan, (f) => { S.fan = f; render(); save(); });
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
  });
  $('eRoom').addEventListener('input', (e) => { S.room = e.target.value.slice(0, 24); render(); save(); });
  $('eStatus').addEventListener('input', (e) => { S.status = e.target.value.slice(0, 40); render(); save(); });
  $('eDrift').addEventListener('change', (e) => { S.drift = e.target.checked; save(); });
  holdable($('eTUp'), () => setTarget(S.target + 1));
  holdable($('eTDown'), () => setTarget(S.target - 1));
  holdable($('eRUp'), () => { S.roomT = Math.min(S.roomT + 1, 120); render(); save(); });
  holdable($('eRDown'), () => { S.roomT = Math.max(S.roomT - 1, -20); render(); save(); });
  $('eReset').addEventListener('click', () => {
    S = Object.assign({}, DEFAULTS); $('eRoom').value = S.room; $('eStatus').value = ''; render(); save();
  });

  render();
  wake();
})();
