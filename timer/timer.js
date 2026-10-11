/* ==========================================================================
   SZVTECH Timer — stopwatch, countdown timers, focus (pomodoro).
   /timer/timer.js — an embeddable ES module.

     import { mount } from "timer.js" (served at /timer/timer.js)
     const t = mount(el, {
       standalone: false,   // true on /timer/: footer, document title, favicon, --app-h, ?t= params
       compact: false,      // smaller chrome for embedding (no typed-time box, no key hints, no fullscreen)
       now: () => ms,       // optional server-synced clock (epoch ms); default: own /api/now sync
       active: true,        // keyboard shortcuts on; flip with setActive()
       docTitle, favicon,   // default = standalone
       mode: 'sw'|'tm'|'fc' // optional initial mode (else the saved one)
     });
     t.setActive(false); t.setMode('sw'); t.unmount();
     // module-level helpers act on the mounted instance: unmount(), setActive(bool)

   Timing: every running thing is stored as an absolute end/start time on a
   server-corrected clock and derived from it each frame — nothing counts
   intervals — so it is right after tab switches, sleep and reloads.
   All state lives in localStorage['szv-timer-v1'] (shared by every mount).
   Styles: /timer/timer.css (scoped to .tmr).
   ========================================================================== */

const LS_KEY = 'szv-timer-v1';
const LS_OFF = 'szv-timer-off';
const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN;
const MAXDUR = 99 * HOUR + 59 * MIN + 59 * SEC;
const PRESETS = [1, 3, 5, 10, 15, 25, 30, 60];
const MAX_TIMERS = 12;
const MAX_LAPS = 999;

let inst = null;
let seq = 0;

export function mount(container, opts = {}) {
  if (inst) inst.unmount();
  inst = create(container, opts || {});
  return inst.api;
}
export function unmount() { if (inst) { inst.unmount(); inst = null; } }
export function setActive(on) { if (inst) inst.api.setActive(on); }

/* ---------------- pure helpers (exported for tests / the /time embed) ---------------- */
const UNIT = /(\d+(?:\.\d+)?)(hours|hour|hrs|hr|h|minutes|minute|mins|min|m|seconds|second|secs|sec|s)/y;
export function parseDuration(str) {
  if (str == null) return null;
  const s = String(str).trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  let ms = 0;
  if (/^\d+(\.\d+)?$/.test(s)) ms = parseFloat(s) * MIN; // bare number = minutes
  else if (/^\d{1,3}(:\d{1,2}){1,2}$/.test(s)) {
    const p = s.split(':').map(Number);
    if (p.slice(1).some((x) => x > 59)) return null;
    ms = (p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]) * SEC;
  } else {
    UNIT.lastIndex = 0;
    let m, pos = 0, any = false;
    while ((m = UNIT.exec(s))) {
      any = true;
      pos = UNIT.lastIndex;
      const v = parseFloat(m[1]), u = m[2][0];
      ms += v * (u === 'h' ? HOUR : u === 'm' ? MIN : SEC);
    }
    if (!any || pos !== s.length) return null;
  }
  ms = Math.round(ms / SEC) * SEC;
  if (!(ms >= SEC) || ms > MAXDUR) return null;
  return ms;
}
export function shortDuration(ms) {
  const t = Math.round(ms / SEC), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return (h ? h + 'h' : '') + (m ? m + 'm' : '') + (s || (!h && !m) ? s + 's' : '');
}
const pad = (n) => String(n).padStart(2, '0');
function partsDown(ms) {
  const t = Math.max(0, Math.ceil(ms / SEC - 1e-6));
  return { h: Math.floor(t / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}
function partsUp(ms) {
  const cs = Math.max(0, Math.floor(ms / 10)), t = Math.floor(cs / 100);
  return { h: Math.floor(t / 3600), m: Math.floor((t % 3600) / 60), s: t % 60, f: cs % 100 };
}
function downStr(ms) { const p = partsDown(ms); return (p.h ? p.h + ':' : '') + pad(p.m) + ':' + pad(p.s); }
function upStr(ms, frac = true) { const p = partsUp(ms); return (p.h ? p.h + ':' : '') + pad(p.m) + ':' + pad(p.s) + (frac ? '.' + pad(p.f) : ''); }
function lenWords(ms) {
  const t = Math.round(ms / SEC), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const out = [];
  if (h) out.push(h + ' h');
  if (m) out.push(m + ' min');
  if (s) out.push(s + ' s');
  return out.join(' ') || '0 s';
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const finite = (x) => typeof x === 'number' && Number.isFinite(x);

/* ============================================================================ */
function create(container, opts) {
  const standalone = !!opts.standalone;
  const compact = !!opts.compact;
  const useTitle = opts.docTitle != null ? !!opts.docTitle : standalone;
  const useFav = opts.favicon != null ? !!opts.favicon : standalone;
  const injectedNow = typeof opts.now === 'function' ? opts.now : null;
  let active = opts.active != null ? !!opts.active : true;
  const uid = 'tmr' + (++seq);
  const html = document.documentElement;
  const fine = !!(window.matchMedia && matchMedia('(pointer: fine)').matches);

  const cleanups = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); cleanups.push(() => t.removeEventListener(ev, fn, o)); };
  let dead = false;

  /* ---------------- DOM ---------------- */
  const root = document.createElement('div');
  root.className = 'tmr' + (compact ? ' tmr-compact' : '') + (standalone ? ' tmr-standalone' : '');
  root.innerHTML = TEMPLATE.replace(/\$U/g, uid);
  container.appendChild(root);
  const R = {};
  root.querySelectorAll('[data-r]').forEach((el) => { R[el.dataset.r] = el; });
  if (!standalone) R.foot.remove();
  if (window.SZVTheme && SZVTheme.mount) root.querySelectorAll('[data-szv-theme-dots]').forEach((el) => { if (!el.childElementCount) SZVTheme.mount(el); });

  /* ---------------- clock: server-corrected, monotonic ---------------- */
  const pnow = () => performance.now();
  const clk = { ae: Date.now(), ap: pnow(), off: 0, ok: !!injectedNow, at: -1e9, busy: false, fails: 0, err: null, retry: 0 };
  if (!injectedNow) {
    try {
      const o = JSON.parse(localStorage.getItem(LS_OFF));
      if (o && finite(o.off) && Math.abs(o.off) < 864e5 && Date.now() - o.when < 864e5) clk.off = o.off;
    } catch (e) {}
  }
  const now = injectedNow ? () => +injectedNow() : () => clk.ae + (pnow() - clk.ap) + clk.off;

  async function sample() {
    const ctl = 'AbortController' in window ? new AbortController() : null;
    const kill = setTimeout(() => ctl && ctl.abort(), 3000);
    try {
      const p0 = pnow();
      const r = await fetch('/api/now?r=' + Math.random().toString(36).slice(2), { cache: 'no-store', signal: ctl && ctl.signal });
      const p1 = pnow();
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || !finite(j.t)) return null;
      const rtt = p1 - p0;
      if (rtt > 1500) return null;
      const mid = clk.ae + ((p0 + p1) / 2 - clk.ap);
      return { rtt, off: j.t + 0.5 - mid };
    } catch (e) { return null; } finally { clearTimeout(kill); }
  }
  let firstSyncDone;
  const firstSync = new Promise((r) => { firstSyncDone = r; });
  async function syncNow() {
    if (injectedNow || clk.busy || dead) return;
    clk.busy = true;
    clearTimeout(clk.retry);
    const got = [];
    for (let i = 0; i < 3; i++) {
      const s = await sample();
      if (!s) { if (!got.length && i >= 1) break; continue; }
      got.push(s);
    }
    clk.busy = false;
    if (dead) return;
    if (!got.length) {
      clk.fails++;
      firstSyncDone();
      clk.retry = setTimeout(syncNow, Math.min(10 * MIN, 15000 * 2 ** Math.min(4, clk.fails - 1)));
      renderSettings();
      return;
    }
    clk.fails = 0;
    got.sort((a, b) => a.rtt - b.rtt);
    applyOffset(got[0].off, got[0].rtt / 2 + 1);
    firstSyncDone();
  }
  function applyOffset(off, err) {
    const delta = off - clk.off;
    clk.off = off; clk.err = err; clk.ok = true; clk.at = pnow();
    try { localStorage.setItem(LS_OFF, JSON.stringify({ off, when: Date.now() })); } catch (e) {}
    // things started on the unsynced clock keep their duration: move them with the clock
    let moved = false;
    const sw = S.sw;
    if (sw.run && (sw.u || Math.abs(delta) < 1000)) { sw.start += delta; moved = true; }
    sw.u = 0;
    for (const t of S.timers) { if (t.u && t.st === 'run') { t.end += delta; moved = true; } t.u = 0; }
    if (S.fc.u && S.fc.st === 'run') { S.fc.end += delta; moved = true; }
    S.fc.u = 0;
    if (moved) save();
    scheduleEnd();
    renderSettings();
  }
  // sleep or a changed system clock: Date jumps against the monotonic clock
  function checkJump() {
    if (injectedNow) return;
    const d = (Date.now() - clk.ae) - (pnow() - clk.ap);
    // small drift is left to the periodic server re-sync (it keeps a running stopwatch smooth);
    // a big jump means sleep (the monotonic clock paused) or a clock change: follow Date, then re-measure
    if (Math.abs(d) > 1500) {
      clk.ae = Date.now(); clk.ap = pnow();
      if (document.visibilityState === 'visible') syncNow();
    }
  }
  const unsynced = () => (clk.ok ? 0 : 1);

  /* ---------------- state ---------------- */
  function fresh() {
    return {
      v: 1,
      mode: 'tm',
      sw: { run: false, start: 0, acc: 0, laps: [], u: 0 },
      timers: [],
      draft: { dur: 5 * MIN, label: '' },
      active: null,
      fc: { phase: 'work', n: 0, today: 0, day: '', st: 'idle', end: 0, left: 0, len: 0, u: 0, ended: '', doneAt: 0 },
      set: { sound: true, vol: 0.7, vib: true, notify: false, wake: true, work: 25, short: 5, long: 15, every: 4, auto: false },
    };
  }
  const num = (x, d, lo, hi) => (finite(x) ? clamp(x, lo, hi) : d);
  const str = (x, d, max = 28) => (typeof x === 'string' ? x.slice(0, max) : d);
  const oneOf = (x, list, d) => (list.includes(x) ? x : d);
  function load() {
    const s = fresh();
    let j = null;
    try { j = JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) {}
    if (!j || typeof j !== 'object') return s;
    s.mode = oneOf(j.mode, ['sw', 'tm', 'fc'], 'tm');
    if (j.sw && typeof j.sw === 'object') {
      const w = j.sw;
      s.sw.run = !!w.run;
      s.sw.start = num(w.start, 0, 0, 1e14);
      s.sw.acc = num(w.acc, 0, 0, 1e12);
      s.sw.u = w.u ? 1 : 0;
      s.sw.laps = Array.isArray(w.laps) ? w.laps.filter(finite).slice(0, MAX_LAPS) : [];
      if (s.sw.run && !s.sw.start) s.sw.run = false;
    }
    if (Array.isArray(j.timers)) {
      for (const t of j.timers.slice(0, MAX_TIMERS)) {
        if (!t || typeof t !== 'object' || typeof t.id !== 'string') continue;
        const st = oneOf(t.st, ['run', 'pause', 'done'], null);
        if (!st) continue;
        const dur = num(t.dur, 0, SEC, MAXDUR + HOUR);
        if (!dur) continue;
        s.timers.push({
          id: t.id.slice(0, 16), label: str(t.label, ''), dur, base: num(t.base, dur, SEC, MAXDUR),
          end: num(t.end, 0, 0, 1e14), left: num(t.left, dur, 0, MAXDUR + HOUR), st, u: t.u ? 1 : 0, doneAt: num(t.doneAt, 0, 0, 1e14),
        });
      }
    }
    if (j.draft && typeof j.draft === 'object') {
      s.draft.dur = num(j.draft.dur, 5 * MIN, 0, MAXDUR);
      s.draft.label = str(j.draft.label, '');
    }
    s.active = typeof j.active === 'string' && s.timers.some((t) => t.id === j.active) ? j.active : null;
    if (j.fc && typeof j.fc === 'object') {
      const f = j.fc;
      s.fc.phase = oneOf(f.phase, ['work', 'short', 'long'], 'work');
      s.fc.n = num(f.n, 0, 0, 99) | 0;
      s.fc.today = num(f.today, 0, 0, 999) | 0;
      s.fc.day = str(f.day, '', 12);
      s.fc.st = oneOf(f.st, ['idle', 'run', 'pause', 'done'], 'idle');
      s.fc.end = num(f.end, 0, 0, 1e14);
      s.fc.left = num(f.left, 0, 0, 1e9);
      s.fc.len = num(f.len, 0, 0, 1e9);
      s.fc.u = f.u ? 1 : 0;
      s.fc.ended = oneOf(f.ended, ['work', 'short', 'long'], 'work');
      s.fc.doneAt = num(f.doneAt, 0, 0, 1e14);
    }
    if (j.set && typeof j.set === 'object') {
      const o = j.set, d = s.set;
      d.sound = o.sound !== false;
      d.vol = num(o.vol, 0.7, 0, 1);
      d.vib = o.vib !== false;
      d.notify = !!o.notify;
      d.wake = o.wake !== false;
      d.work = num(o.work, 25, 1, 180) | 0;
      d.short = num(o.short, 5, 1, 60) | 0;
      d.long = num(o.long, 15, 1, 90) | 0;
      d.every = num(o.every, 4, 2, 12) | 0;
      d.auto = !!o.auto;
    }
    return s;
  }
  let S = load();
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {} }

  // shareable links (standalone page only): ?t=5m  ?t=1h30m  ?t=90s  ?label=tea  ?mode=stopwatch
  if (standalone) {
    try {
      const q = new URLSearchParams(location.search);
      const t = parseDuration(q.get('t'));
      const label = q.has('label') ? str(q.get('label'), '').trim() : null;
      const mq = (q.get('mode') || '').toLowerCase();
      const mm = { sw: 'sw', stopwatch: 'sw', tm: 'tm', timer: 'tm', fc: 'fc', focus: 'fc', pomodoro: 'fc' }[mq];
      if (t || label != null) {
        S.mode = 'tm'; S.active = null;
        if (t) S.draft.dur = t;
        S.draft.label = label || (t ? '' : S.draft.label);
      } else if (mm) S.mode = mm;
    } catch (e) {}
  }
  if (opts.mode && ['sw', 'tm', 'fc'].includes(opts.mode)) S.mode = opts.mode;

  const activeTimer = () => (S.active ? S.timers.find((t) => t.id === S.active) || null : null);
  const swElapsed = (n) => (S.sw.run ? S.sw.acc + Math.max(0, n - S.sw.start) : S.sw.acc);
  const tLeft = (t, n) => (t.st === 'run' ? Math.max(0, t.end - n) : t.st === 'pause' ? t.left : 0);
  const phaseLen = (p) => S.set[p === 'work' ? 'work' : p === 'short' ? 'short' : 'long'] * MIN;
  const fcLeft = (n) => { const f = S.fc; return f.st === 'run' ? Math.max(0, f.end - n) : f.st === 'pause' ? f.left : phaseLen(f.phase); };
  const fcLenNow = () => { const f = S.fc; return (f.st === 'run' || f.st === 'pause') && f.len ? f.len : phaseLen(f.phase); };
  const anyRunning = () => S.sw.run || S.timers.some((t) => t.st === 'run') || S.fc.st === 'run';
  const PHASE = { work: 'Focus', short: 'Short break', long: 'Long break' };
  const localDay = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const clockTime = (ms) => { try { return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
  let ready = false;

  /* ---------------- toast / announce ---------------- */
  let toastT = 0;
  function toast(msg) {
    R.toast.textContent = msg;
    R.toast.classList.add('tmr-show');
    clearTimeout(toastT);
    toastT = setTimeout(() => R.toast.classList.remove('tmr-show'), 1900);
  }
  const say = (msg) => { R.sr.textContent = ''; setTimeout(() => { R.sr.textContent = msg; }, 30); };
  const haptic = (ms) => { if (navigator.vibrate && S.set.vib) try { navigator.vibrate(ms); } catch (e) {} };

  /* ---------------- the big number: render + fit ---------------- */
  const G = { h: R.gh, m: R.gm, s: R.gs, f: R.gf };
  const lastTxt = { h: null, m: null, s: null, f: null };
  let lastShape = '', lastCls = '', lastP = -1, lastLbl = null, lastSub = null, typingPreview = null;

  function view(n) {
    if (S.mode === 'sw') {
      const ms = swElapsed(n);
      return { ms, up: true, st: S.sw.run ? 'run' : ms > 0 ? 'pause' : 'zero', p: (ms % MIN) / MIN };
    }
    if (S.mode === 'tm') {
      const t = activeTimer();
      if (!t) {
        const ms = typingPreview != null ? typingPreview : S.draft.dur;
        return { ms, up: false, st: ms > 0 ? 'idle' : 'zero', p: ms > 0 ? 1 : 0 };
      }
      const left = tLeft(t, n);
      return { ms: left, up: false, st: t.st === 'done' ? 'zero' : t.st, p: t.dur ? left / t.dur : 0 };
    }
    const left = fcLeft(n);
    const st = S.fc.st === 'run' ? 'run' : S.fc.st === 'pause' ? 'pause' : 'idle';
    return { ms: left, up: false, st, p: left / fcLenNow() };
  }
  function setG(k, v) { if (lastTxt[k] !== v) { lastTxt[k] = v; G[k].textContent = v; } }
  function renderFace(n) {
    const v = view(n);
    let h, f = '';
    let m, s;
    if (v.up) { const p = partsUp(v.ms); h = p.h ? String(p.h) : ''; m = pad(p.m); s = pad(p.s); f = '.' + pad(p.f); }
    else { const p = partsDown(v.ms); h = p.h ? String(p.h) : ''; m = pad(p.m); s = pad(p.s); }
    setG('h', h); setG('m', m); setG('s', s); setG('f', f);
    const shape = h.length + '|' + (f ? 1 : 0);
    if (shape !== lastShape) { lastShape = shape; R.num.classList.toggle('tmr-noh', !h); fit(); }
    const cls = v.st;
    if (cls !== lastCls) {
      R.num.classList.remove('tmr-run', 'tmr-paused', 'tmr-idle', 'tmr-zero');
      R.num.classList.add(cls === 'pause' ? 'tmr-paused' : 'tmr-' + cls);
      lastCls = cls;
    }
    const p = clamp(v.p, 0, 1);
    if (Math.abs(p - lastP) > 0.0004) { lastP = p; R.fill.style.setProperty('--p', p.toFixed(4)); }
    renderMeta(n, v);
  }
  function renderMeta(n, v) {
    let lbl = '', sub = '';
    if (S.mode === 'sw') {
      const L = S.sw.laps.length;
      lbl = L ? 'Lap ' + (L + 1) : 'Stopwatch';
      if (L) sub = 'Lap ' + (L + 1) + ' · ' + upStr(v.ms - S.sw.laps[L - 1]);
      else if (v.st === 'zero') sub = fine ? 'Space to start · tap the time' : 'Tap the time to start · hold to reset';
      else if (v.st === 'pause') sub = 'Paused · hold the time to reset';
      else sub = fine ? 'L for a lap' : 'Started ' + clockTime(S.sw.start);
    } else if (S.mode === 'tm') {
      const t = activeTimer();
      if (!t) {
        sub = v.ms > 0 ? (fine ? 'Space to start · ' + (S.timers.length ? S.timers.length + ' more running' : 'scroll the digits to adjust') : 'Tap the time to start') : 'Pick a time';
        if (!fine && S.timers.length) sub = 'Tap to start · ' + S.timers.length + ' more';
      } else if (t.st === 'run') sub = 'Ends ' + clockTime(t.end) + ' · ' + lenWords(t.base) + ' timer';
      else if (t.st === 'pause') sub = 'Paused · hold the time to reset';
      else sub = "Time's up";
    } else {
      const f = S.fc;
      lbl = PHASE[f.phase] + (f.phase === 'work' ? ' · ' + ((f.n % S.set.every) + 1) + ' of ' + S.set.every : '');
      const nxt = f.phase === 'work' ? ((f.n + 1) % S.set.every === 0 ? 'long' : 'short') : 'work';
      const nxtTxt = 'then ' + (nxt === 'work' ? 'focus' : S.set[nxt] + ' min ' + (nxt === 'long' ? 'long break' : 'break'));
      if (f.st === 'run') sub = 'Ends ' + clockTime(f.end) + ' · ' + nxtTxt;
      else if (f.st === 'pause') sub = 'Paused · ' + nxtTxt;
      else sub = (fine ? 'Space to start · ' : 'Tap to start · ') + nxtTxt;
    }
    if (lbl !== lastLbl) { lastLbl = lbl; R.lblTx.textContent = lbl; }
    if (sub !== lastSub) { lastSub = sub; R.sub.textContent = sub; }
  }

  let fitRAF = 0;
  function fit() { cancelAnimationFrame(fitRAF); fitRAF = requestAnimationFrame(doFit); }
  function doFit() {
    if (dead) return;
    if (standalone) {
      const vv = window.visualViewport;
      html.style.setProperty('--app-h', Math.round(vv ? vv.height : innerHeight) + 'px');
    }
    const W = R.stage.clientWidth, H = R.stage.clientHeight;
    if (!W || !H) return;
    const num = R.num;
    const other = R.face.offsetHeight - num.offsetHeight;
    const aw = W - 2, ah = H - other - 2;
    if (ah < 20) return;
    let best = null;
    for (const L of ['row', 'stack']) {
      num.classList.toggle('tmr-stack', L === 'stack');
      let size = 100;
      for (let k = 0; k < 2; k++) {
        num.style.fontSize = size + 'px';
        const r = num.getBoundingClientRect();
        if (!r.width || !r.height) break;
        size = size * Math.min(aw / r.width, ah / r.height);
      }
      size = Math.floor(size * 0.985);
      const score = size * (L === 'row' ? (R.gf.textContent ? 1.32 : 1.12) : 1);
      if (!best || score > best.score) best = { L, size, score };
    }
    num.classList.toggle('tmr-stack', best.L === 'stack');
    num.style.fontSize = Math.max(12, best.size) + 'px';
    if (fontsOK) num.classList.add('tmr-ready');
  }
  let fontsOK = false;
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => fit()) : null;
  if (ro) { ro.observe(R.stage); ro.observe(R.face); }
  on(window, 'resize', fit);
  if (window.visualViewport) on(visualViewport, 'resize', fit);
  const fontsReady = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 900))]) : Promise.resolve();
  fontsReady.then(() => { fontsOK = true; lastShape = ''; fit(); });

  /* ---------------- controls ---------------- */
  function setBtn(btn, text, act, disabled, aria) {
    if (btn.textContent !== text) btn.textContent = text;
    btn.dataset.act = act || '';
    btn.disabled = !!disabled;
    if (aria) btn.setAttribute('aria-label', aria); else btn.removeAttribute('aria-label');
  }
  function setPrimary(running, label, disabled) {
    R.bP.classList.toggle('tmr-on', !!running);
    R.bP.setAttribute('aria-label', label);
    R.bP.title = label + (fine ? ' (Space)' : '');
    R.bP.disabled = !!disabled;
  }
  function renderCtl() {
    const n = now();
    root.dataset.mode = S.mode;
    const draft = S.mode === 'tm' && !activeTimer();
    root.toggleAttribute('data-draft', draft);
    if (S.mode === 'sw') {
      const el = swElapsed(n);
      setBtn(R.bL, 'Reset', 'reset', S.sw.run || el <= 0);
      setPrimary(S.sw.run, S.sw.run ? 'Pause' : el > 0 ? 'Resume' : 'Start');
      setBtn(R.bR, 'Lap', 'lap', !S.sw.run, fine ? 'Lap (L)' : null);
    } else if (S.mode === 'tm') {
      const t = activeTimer();
      if (!t) {
        setBtn(R.bL, 'Custom', 'custom', false, 'Set a custom time');
        setPrimary(false, 'Start', S.draft.dur < SEC);
        setBtn(R.bR, 'Share', 'share', S.draft.dur < SEC, 'Copy a link to this timer');
      } else {
        setBtn(R.bL, 'Reset', 'reset', false);
        setPrimary(t.st === 'run', t.st === 'run' ? 'Pause' : 'Resume', t.st === 'done');
        setBtn(R.bR, '+1 min', 'plus', t.st === 'done', 'Add one minute');
      }
    } else {
      const f = S.fc;
      setBtn(R.bL, 'Reset', 'reset', f.st === 'idle');
      setPrimary(f.st === 'run', f.st === 'run' ? 'Pause' : f.st === 'pause' ? 'Resume' : 'Start ' + PHASE[f.phase].toLowerCase());
      setBtn(R.bR, 'Skip', 'skip', false, f.phase === 'work' ? 'Skip to break' : 'Skip to focus');
    }
    // mode switch
    const i = { sw: 0, tm: 1, fc: 2 }[S.mode];
    R.seg.style.setProperty('--i', i);
    R.seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === S.mode)));
    // label field
    const t = activeTimer();
    const want = t ? t.label : S.draft.label;
    if (document.activeElement !== R.lblIn && R.lblIn.value !== want) R.lblIn.value = want;
    R.lblIn.placeholder = t ? 'Add label' : 'Label · eggs, tea…';
    if (standalone && R.hint) R.hint.innerHTML = HINTS[S.mode];
    R.num.setAttribute('aria-label', (S.mode === 'sw' ? 'Stopwatch' : S.mode === 'tm' ? 'Timer' : 'Focus timer') + '. Tap to start or pause, hold to reset.');
  }
  function renderAll() {
    renderCtl();
    renderPresets();
    renderCards(true);
    renderLaps(true);
    renderFocus();
    renderFace(now());
    updateAlarm();
    updateHead(true);
  }
  function changed() {
    save();
    renderCtl();
    renderPresets();
    renderCards(true);
    renderLaps(true);
    renderFocus();
    renderFace(now());
    updateAlarm();
    updateHead(true);
    scheduleEnd();
    updateWake();
    kick();
  }

  /* ---------------- stopwatch ---------------- */
  function swToggle() {
    const n = now(), w = S.sw;
    if (w.run) { w.acc += Math.max(0, n - w.start); w.run = false; say('Stopwatch paused at ' + upStr(w.acc)); }
    else { w.start = n; w.run = true; w.u = unsynced(); say('Stopwatch started'); }
    changed();
  }
  function swLap() {
    if (!S.sw.run) return;
    if (S.sw.laps.length >= MAX_LAPS) { toast('That is a lot of laps'); return; }
    const el = swElapsed(now());
    S.sw.laps.push(el);
    say('Lap ' + S.sw.laps.length + ': ' + upStr(el - (S.sw.laps[S.sw.laps.length - 2] || 0)));
    changed();
    R.lapList.scrollTop = 0;
  }
  function swReset() { S.sw = { run: false, start: 0, acc: 0, laps: [], u: 0 }; changed(); }

  /* ---------------- timers ---------------- */
  const newId = () => Math.random().toString(36).slice(2, 10);
  function tStart(dur) {
    dur = dur != null ? dur : S.draft.dur;
    if (!(dur >= SEC)) { toast('Pick a time first'); return; }
    if (S.timers.length >= MAX_TIMERS) { toast('Up to ' + MAX_TIMERS + ' timers at once'); return; }
    const n = now();
    const t = { id: newId(), label: S.draft.label.trim(), dur, base: dur, end: n + dur, left: dur, st: 'run', u: unsynced(), doneAt: 0 };
    S.draft.dur = dur;
    S.timers.push(t);
    S.active = t.id;
    typingPreview = null;
    say((t.label ? t.label + ' ' : '') + 'timer started, ' + lenWords(dur));
    changed();
  }
  function tToggle(t) {
    const n = now();
    if (t.st === 'run') { t.left = Math.max(0, t.end - n); t.st = 'pause'; }
    else if (t.st === 'pause') { t.end = n + t.left; t.st = 'run'; t.u = unsynced(); }
    changed();
  }
  function tRemove(t, toDraft) {
    S.timers = S.timers.filter((x) => x !== t);
    if (S.active === t.id) {
      S.active = null;
      if (toDraft) { S.draft.dur = t.base; S.draft.label = t.label; }
    }
    changed();
  }
  function tPlus(t, ms = MIN) {
    const n = now();
    if (t.st === 'run') { t.end += ms; t.dur += ms; }
    else if (t.st === 'pause') { t.left += ms; t.dur += ms; }
    else { t.st = 'run'; t.end = n + ms; t.dur = ms; t.u = unsynced(); }
    changed();
    toast('+1 min' + (t.label ? ' · ' + t.label : ''));
  }
  function newDraft() {
    if (S.mode !== 'tm') S.mode = 'tm';
    S.active = null;
    changed();
  }
  function setDraft(ms, bump) {
    S.draft.dur = clamp(ms, 0, MAXDUR);
    typingPreview = null;
    if (bump && !reduced()) { R.num.classList.remove('tmr-bump'); void R.num.offsetWidth; R.num.classList.add('tmr-bump'); }
    changed();
  }

  /* ---------------- focus ---------------- */
  function bumpToday(at) {
    const d = localDay(at);
    if (S.fc.day !== d) { S.fc.day = d; S.fc.today = 0; }
    S.fc.today++;
  }
  function advance(at) {
    const f = S.fc;
    if (f.phase === 'work') { f.n++; bumpToday(at); return f.n % S.set.every === 0 ? 'long' : 'short'; }
    if (f.phase === 'long') f.n = 0;
    return 'work';
  }
  function fcStart() {
    const f = S.fc, n = now();
    if (f.st === 'pause') { f.end = n + f.left; }
    else { f.len = phaseLen(f.phase); f.end = n + f.len; }
    f.st = 'run'; f.u = unsynced();
  }
  function fcToggle() {
    const f = S.fc;
    if (f.st === 'run') { f.left = Math.max(0, f.end - now()); f.st = 'pause'; }
    else { if (f.st === 'done') f.st = 'idle'; fcStart(); say(PHASE[f.phase] + ' started'); }
    changed();
  }
  function fcReset() { S.fc.st = 'idle'; S.fc.left = 0; changed(); }
  function fcSkip() {
    const f = S.fc, was = f.st === 'run';
    if (f.phase === 'work') f.phase = (f.n + 1) % S.set.every === 0 ? 'long' : 'short';
    else { if (f.phase === 'long') f.n = 0; f.phase = 'work'; }
    f.st = 'idle';
    if (was) fcStart();
    toast(PHASE[f.phase] + (was ? ' started' : ' next'));
    changed();
  }
  function focusEnded(at, fresh) {
    const f = S.fc, ended = f.phase;
    let np = advance(at);
    f.phase = np;
    if (S.set.auto) {
      let end = at + phaseLen(np), guard = 0;
      const n = now();
      while (end <= n && guard++ < 50) { np = advance(end); f.phase = np; end += phaseLen(np); }
      f.len = phaseLen(np); f.end = end; f.st = 'run';
      if (fresh) {
        softChime();
        notify(ended === 'work' ? 'Focus session done' : 'Break over', PHASE[np] + ' started · ' + S.set[np === 'work' ? 'work' : np] + ' min');
        toast((ended === 'work' ? 'Nice work. ' : '') + PHASE[np] + ' started');
      }
    } else {
      f.st = 'done'; f.ended = ended; f.doneAt = at;
    }
  }

  /* ---------------- ends: detect, ring ---------------- */
  function checkEnds(n) {
    if (!ready) return;
    let fresh = [];
    let any = false;
    for (const t of S.timers) {
      if (t.st === 'run' && t.end <= n) { t.st = 'done'; t.doneAt = t.end; any = true; if (n - t.end < 10 * MIN) fresh.push(t); }
    }
    let fcRing = false;
    if (S.fc.st === 'run' && S.fc.end <= n) {
      const at = S.fc.end, recent = n - at < 10 * MIN;
      focusEnded(at, recent);
      any = true;
      if (S.fc.st === 'done' && recent) fcRing = true;
    }
    if (!any) return;
    changed();
    if (fresh.length || fcRing) {
      startAlarm();
      const t = fresh[0];
      if (t) {
        say((t.label || 'Timer') + ' done');
        notify(t.label ? t.label + ' — time’s up' : 'Time’s up', lenWords(t.base) + ' timer' + (fresh.length > 1 ? ' · ' + fresh.length + ' timers done' : ''));
      } else {
        const f = S.fc;
        say(f.ended === 'work' ? 'Focus session done' : 'Break over');
        notify(f.ended === 'work' ? 'Focus session done' : 'Break over', f.phase === 'work' ? 'Ready for the next focus?' : 'Time for a ' + S.set[f.phase] + ' min break');
      }
    }
  }
  let endT = 0;
  function scheduleEnd() {
    clearTimeout(endT);
    let next = Infinity;
    for (const t of S.timers) if (t.st === 'run') next = Math.min(next, t.end);
    if (S.fc.st === 'run') next = Math.min(next, S.fc.end);
    if (!finite(next)) return;
    endT = setTimeout(() => { const n = now(); checkEnds(n); updateHead(); }, clamp(next - now() + 15, 0, 2 ** 31 - 1));
  }

  /* ---------------- alarm overlay ---------------- */
  let alarmItem = null, alarmShown = false, alarmFocusBack = null;
  function currentAlarm() {
    const list = S.timers.filter((t) => t.st === 'done').map((t) => ({ kind: 'tm', t, at: t.doneAt }));
    if (S.fc.st === 'done') list.push({ kind: 'fc', at: S.fc.doneAt });
    list.sort((a, b) => a.at - b.at);
    return { item: list[0] || null, more: Math.max(0, list.length - 1) };
  }
  function updateAlarm() {
    const { item, more } = currentAlarm();
    alarmItem = item;
    if (!item) {
      if (alarmShown) {
        R.alarm.hidden = true; alarmShown = false; stopAlarm();
        if (alarmFocusBack && document.contains(alarmFocusBack)) try { alarmFocusBack.focus({ preventScroll: true }); } catch (e) {}
      }
      return;
    }
    if (item.kind === 'tm') {
      const t = item.t;
      R.alK.textContent = 'Time’s up';
      R.alT.textContent = t.label || lenWords(t.base) + ' timer';
      R.alSub.textContent = (t.label ? lenWords(t.base) + ' timer · ' : '') + 'ended ' + clockTime(t.doneAt);
      R.alMain.textContent = 'Dismiss';
      R.alSec.textContent = '+1 min';
    } else {
      const f = S.fc;
      R.alK.textContent = f.ended === 'work' ? 'Focus done' : 'Break over';
      R.alT.textContent = f.phase === 'work' ? 'Ready to focus?' : 'Take a ' + S.set[f.phase] + ' min ' + (f.phase === 'long' ? 'long break' : 'break');
      R.alSub.textContent = (f.ended === 'work' ? f.today + ' focus session' + (f.today === 1 ? '' : 's') + ' today · ' : '') + 'ended ' + clockTime(f.doneAt);
      R.alMain.textContent = f.phase === 'work' ? 'Start focus' : 'Start break';
      R.alSec.textContent = 'Later';
    }
    R.alMore.textContent = more ? '+' + more + ' more finished' : '';
    if (!alarmShown) {
      alarmShown = true;
      alarmFocusBack = document.activeElement;
      R.alarm.hidden = false;
      if (openSheet) closeSheet(true);
      setTimeout(() => { try { R.alMain.focus({ preventScroll: true }); } catch (e) {} }, 30);
    }
    renderAlarmTick(now());
  }
  let lastOver = '';
  function renderAlarmTick(n) {
    if (!alarmShown || !alarmItem) return;
    const over = Math.max(0, n - alarmItem.at);
    const t = Math.floor(over / SEC), h = Math.floor(t / 3600);
    const s = '+' + (h ? h + ':' : '') + pad(Math.floor((t % 3600) / 60)) + ':' + pad(t % 60);
    if (s !== lastOver) { lastOver = s; R.alNum.textContent = s; }
  }
  function alarmMain() {
    const it = alarmItem;
    if (!it) return;
    if (it.kind === 'tm') tRemove(it.t, true);
    else { S.fc.st = 'idle'; fcStart(); changed(); }
  }
  function alarmSec() {
    const it = alarmItem;
    if (!it) return;
    if (it.kind === 'tm') tPlus(it.t);
    else { S.fc.st = 'idle'; changed(); }
  }
  on(R.alMain, 'click', () => { unlockAudio(); alarmMain(); });
  on(R.alSec, 'click', () => { unlockAudio(); alarmSec(); });

  /* ---------------- sound: generated bell (Web Audio) ---------------- */
  let ac = null, master = null, alarmBus = null, alarmStopT = 0;
  function unlockAudio() {
    try {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ac = new AC();
        master = ac.createGain();
        master.connect(ac.destination);
        const b = ac.createBuffer(1, 1, 22050), src = ac.createBufferSource(); // iOS: a silent blip unlocks output
        src.buffer = b; src.connect(ac.destination); src.start(0);
      }
      if (ac.state === 'suspended') ac.resume().catch(() => {});
    } catch (e) { ac = null; }
  }
  function bell(bus, t0, f, g, dur) {
    for (const [mult, amp, d] of [[1, 1, 1], [2, 0.3, 0.6], [3.01, 0.11, 0.38], [4.17, 0.05, 0.22]]) {
      const o = ac.createOscillator(), gn = ac.createGain();
      o.type = 'sine';
      o.frequency.value = f * mult;
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.linearRampToValueAtTime(g * amp, t0 + 0.006);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * d);
      o.connect(gn); gn.connect(bus);
      o.start(t0); o.stop(t0 + dur * d + 0.05);
    }
  }
  const ARP = [[0, 880, 0.5], [0.17, 1108.73, 0.42], [0.34, 1318.51, 0.38], [0.56, 1760, 0.22]];
  function phrase(bus, t0) { for (const [dt, f, g] of ARP) bell(bus, t0 + dt, f, g, 1.9); }
  function busFor() { master.gain.value = S.set.vol * 0.55; const bus = ac.createGain(); bus.connect(master); return bus; }
  function startAlarm() {
    if (S.set.vib && navigator.vibrate && !reduced()) {
      const pat = [];
      for (let i = 0; i < 8; i++) pat.push(260, 110, 260, 1300);
      try { navigator.vibrate(pat); } catch (e) {}
    }
    if (!S.set.sound || !ac || alarmBus) return;
    try {
      if (ac.state === 'suspended') ac.resume().catch(() => {});
      alarmBus = busFor();
      const t0 = ac.currentTime + 0.05;
      // about a minute of chimes, scheduled on the audio clock (keeps ringing in a background tab)
      for (let i = 0; i < 6; i++) phrase(alarmBus, t0 + i * 2.6);
      let i = 6;
      const more = () => {
        if (!alarmBus || i >= 24) return;
        for (let k = 0; k < 6 && i < 24; k++, i++) phrase(alarmBus, t0 + i * 2.6);
        alarmStopT = setTimeout(more, 6 * 2600 - 500);
      };
      alarmStopT = setTimeout(more, 6 * 2600 - 2000);
    } catch (e) {}
  }
  function stopAlarm() {
    clearTimeout(alarmStopT);
    if (navigator.vibrate) try { navigator.vibrate(0); } catch (e) {}
    if (alarmBus && ac) {
      const b = alarmBus;
      alarmBus = null;
      try { b.gain.setTargetAtTime(0, ac.currentTime, 0.04); setTimeout(() => { try { b.disconnect(); } catch (e) {} }, 400); } catch (e) {}
    }
  }
  function softChime() {
    if (!S.set.sound || !ac) return;
    try { const bus = busFor(), t0 = ac.currentTime + 0.05; bell(bus, t0, 1318.51, 0.4, 1.6); bell(bus, t0 + 0.22, 987.77, 0.34, 2); setTimeout(() => { try { bus.disconnect(); } catch (e) {} }, 3000); } catch (e) {}
  }
  on(document, 'pointerdown', unlockAudio, { capture: true, passive: true });
  on(document, 'keydown', unlockAudio, { capture: true });

  /* ---------------- notifications (opt-in, asked only on tap) ---------------- */
  const canNotify = 'Notification' in window;
  function registerSW() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/timer/sw.js', { scope: '/timer/' }).catch(() => {});
  }
  async function notify(title, body) {
    if (!S.set.notify || !canNotify || Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
    const o = { body, tag: 'szv-timer', renotify: true, silent: false };
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration('/timer/') : null;
      if (reg && reg.showNotification) { await reg.showNotification(title, o); return; }
    } catch (e) {}
    try { new Notification(title, o); } catch (e) {}
  }
  async function toggleNotify() {
    if (!canNotify) return;
    if (S.set.notify) { S.set.notify = false; save(); renderSettings(); return; }
    let p = Notification.permission;
    try { if (p === 'default') p = await Notification.requestPermission(); } catch (e) {}
    if (p === 'granted') { S.set.notify = true; registerSW(); toast('Notifications on'); }
    else { S.set.notify = false; toast(p === 'denied' ? 'Notifications are blocked for this site' : 'Notifications not enabled'); }
    save(); renderSettings();
  }
  if (S.set.notify && canNotify && Notification.permission === 'granted') registerSW();

  /* ---------------- wake lock ---------------- */
  let wl = null, wlBusy = false;
  async function updateWake() {
    if (!('wakeLock' in navigator)) return;
    const want = S.set.wake && anyRunning() && document.visibilityState === 'visible' && !dead;
    if (want && (!wl || wl.released) && !wlBusy) {
      wlBusy = true;
      try { wl = await navigator.wakeLock.request('screen'); } catch (e) { wl = null; }
      wlBusy = false;
      if (dead || !(S.set.wake && anyRunning())) releaseWake();
    } else if (!want) releaseWake();
  }
  function releaseWake() { if (wl) { try { wl.release(); } catch (e) {} wl = null; } }

  /* ---------------- document title + favicon ring ---------------- */
  const origTitle = document.title;
  const favLink = useFav ? document.querySelector('link[rel~="icon"]') : null;
  const origFav = favLink ? { href: favLink.href, type: favLink.type } : null;
  let lastTitle = null, lastFavKey = '', favCanvas = null;
  function headInfo(n) {
    const tmInfo = (t) => ({ txt: t.st === 'done' ? null : downStr(tLeft(t, n)), name: t.label || 'Timer', p: t.st === 'done' ? 0 : t.dur ? tLeft(t, n) / t.dur : 0, st: t.st });
    const fcInfo = () => ({ txt: downStr(fcLeft(n)), name: S.fc.phase === 'work' ? 'Focus' : 'Break', p: fcLeft(n) / fcLenNow(), st: S.fc.st });
    const swInfo = () => ({ txt: upStr(swElapsed(n), false), name: 'Stopwatch', p: (swElapsed(n) % MIN) / MIN, st: S.sw.run ? 'run' : 'pause' });
    if (alarmItem) return alarmItem.kind === 'tm' ? { txt: null, name: alarmItem.t.label || 'Timer', p: 0, st: 'done' } : { txt: null, name: S.fc.ended === 'work' ? 'Focus' : 'Break', p: 0, st: 'done' };
    const t = activeTimer();
    if (S.mode === 'tm' && t && t.st !== 'done') return tmInfo(t);
    if (S.mode === 'fc' && (S.fc.st === 'run' || S.fc.st === 'pause')) return fcInfo();
    if (S.mode === 'sw' && (S.sw.run || S.sw.acc > 0)) return swInfo();
    const run = S.timers.filter((x) => x.st === 'run').sort((a, b) => a.end - b.end)[0];
    if (run) return tmInfo(run);
    if (S.fc.st === 'run') return fcInfo();
    if (S.sw.run) return swInfo();
    return null;
  }
  function updateHead(force) {
    if (!useTitle && !useFav) return;
    const n = now(), h = headInfo(n);
    if (useTitle) {
      let title = origTitle;
      if (h) {
        if (h.st === 'done') title = '⏰ Time’s up · ' + h.name;
        else title = (h.st === 'run' ? '⏱ ' : '⏸ ') + h.txt + ' · ' + h.name;
      }
      if (title !== lastTitle) { lastTitle = title; document.title = title; }
    }
    if (useFav && favLink) {
      const key = h ? h.st + Math.round(h.p * 120) : '';
      if (key !== lastFavKey || force) {
        lastFavKey = key;
        // drawing + encoding the icon is slow on some devices: never inside a tap, at most ~3x a second
        if (!favT) favT = setTimeout(flushFav, Math.max(0, 320 - (pnow() - favAt)));
      }
    }
  }
  let favT = 0, favAt = -1e9;
  function flushFav() {
    favT = 0;
    if (dead || !favLink) return;
    favAt = pnow();
    const h = headInfo(now());
    if (!h) { favLink.type = origFav.type; favLink.href = origFav.href; }
    else drawFav(h);
  }
  function drawFav(h) {
    try {
      const c = favCanvas || (favCanvas = document.createElement('canvas'));
      if (c.width !== 64) c.width = c.height = 64;
      const x = c.getContext('2d');
      const pal = window.SZVTheme ? SZVTheme.palette() : { a1: '#8b5cf6', a2: '#22d3ee', a3: '#e879f9' };
      x.clearRect(0, 0, 64, 64);
      x.fillStyle = '#05050a';
      x.beginPath();
      if (x.roundRect) x.roundRect(0, 0, 64, 64, 16); else x.rect(0, 0, 64, 64);
      x.fill();
      x.lineWidth = 8;
      x.lineCap = 'round';
      x.strokeStyle = 'rgba(255,255,255,.16)';
      x.beginPath(); x.arc(32, 32, 21, 0, Math.PI * 2); x.stroke();
      const g = x.createLinearGradient(8, 8, 56, 56);
      g.addColorStop(0, pal.a1); g.addColorStop(0.5, pal.a3); g.addColorStop(1, pal.a2);
      if (h.st === 'done') {
        x.strokeStyle = g; x.beginPath(); x.arc(32, 32, 21, 0, Math.PI * 2); x.stroke();
        x.fillStyle = pal.a3; x.beginPath(); x.arc(32, 32, 9, 0, Math.PI * 2); x.fill();
      } else {
        const p = clamp(h.p, 0, 1);
        if (p > 0.004) {
          x.strokeStyle = g;
          x.beginPath(); x.arc(32, 32, 21, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); x.stroke();
        }
        x.fillStyle = '#f3f1ff';
        if (h.st === 'run') { x.beginPath(); x.arc(32, 32, 5, 0, Math.PI * 2); x.fill(); }
        else { x.fillRect(25, 23, 5, 18); x.fillRect(34, 23, 5, 18); }
      }
      favLink.type = 'image/png';
      favLink.href = c.toDataURL('image/png');
    } catch (e) {}
  }
  if (window.SZVTheme && SZVTheme.on) cleanups.push(SZVTheme.on(() => { lastFavKey = ''; updateHead(true); renderCards(true); }));

  /* ---------------- presets ---------------- */
  R.presets.innerHTML = PRESETS.map((m) => `<button type="button" class="tmr-chip" data-ms="${m * MIN}" aria-pressed="false" aria-label="${m === 60 ? '1 hour' : m + ' minute' + (m > 1 ? 's' : '')}">${m === 60 ? '1<small>h</small>' : m + '<small>m</small>'}</button>`).join('');
  function renderPresets() {
    const d = S.draft.dur;
    R.presets.querySelectorAll('.tmr-chip').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.ms === d && typingPreview == null)));
  }
  on(R.presets, 'click', (e) => {
    const b = e.target.closest('.tmr-chip');
    if (!b) return;
    R.typeIn.value = '';
    R.typeForm.classList.remove('tmr-bad');
    setDraft(+b.dataset.ms, true);
  });

  /* ---------------- cards (other timers) ---------------- */
  let cardsKey = '';
  const cardEls = new Map();
  function renderCards(full) {
    const others = S.timers.filter((t) => t.id !== S.active);
    const key = S.active + '|' + others.map((t) => t.id + t.st + t.label).join(',');
    if (full && key !== cardsKey) {
      cardsKey = key;
      cardEls.clear();
      R.cards.textContent = '';
      if (S.active || others.length) {
        if (S.active) {
          const add = document.createElement('button');
          add.type = 'button'; add.className = 'tmr-addcard'; add.dataset.act = 'new';
          add.innerHTML = '<b aria-hidden="true">+</b>New timer';
          R.cards.appendChild(add);
        }
        for (const t of others) {
          const c = document.createElement('div');
          c.className = 'tmr-card tmr-' + t.st;
          c.dataset.id = t.id;
          c.innerHTML = CARD;
          c.querySelector('small').textContent = t.label || lenWords(t.base);
          c.querySelector('.tmr-ring').setAttribute('aria-label', t.st === 'run' ? 'Pause' : t.st === 'done' ? 'Dismiss' : 'Resume');
          c.querySelector('.tmr-cmain').setAttribute('aria-label', 'Show ' + (t.label || 'timer'));
          R.cards.appendChild(c);
          cardEls.set(t.id, { el: c, b: c.querySelector('b'), rp: c.querySelector('.tmr-rp'), t, last: '', lp: -1 });
        }
      }
    }
    tickCards(now());
  }
  function tickCards(n) {
    for (const c of cardEls.values()) {
      const t = c.t;
      const txt = t.st === 'done' ? 'Done' : downStr(tLeft(t, n));
      if (txt !== c.last) { c.last = txt; c.b.textContent = txt; }
      const p = t.st === 'done' ? 1 : t.dur ? tLeft(t, n) / t.dur : 0;
      if (Math.abs(p - c.lp) > 0.002) { c.lp = p; c.rp.style.strokeDashoffset = String((100 * (1 - p)).toFixed(2)); }
    }
  }
  on(R.cards, 'click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'new') { newDraft(); return; }
    const card = b.closest('.tmr-card');
    const t = card && S.timers.find((x) => x.id === card.dataset.id);
    if (!t) return;
    if (b.classList.contains('tmr-ring')) { if (t.st === 'done') tRemove(t); else tToggle(t); }
    else if (b.classList.contains('tmr-cx')) tRemove(t);
    else { S.active = t.id; changed(); }
  });

  /* ---------------- laps ---------------- */
  let lapsKey = '', curRow = null, lastCur = '';
  function renderLaps(full) {
    const L = S.sw.laps;
    const key = L.length + '|' + (L.length ? L[L.length - 1] : 0);
    R.laps.classList.toggle('tmr-has', L.length > 0);
    if (full && key !== lapsKey) {
      lapsKey = key;
      R.lapList.textContent = '';
      curRow = null; lastCur = '';
      if (L.length) {
        const lt = L.map((v, i) => v - (i ? L[i - 1] : 0));
        let best = -1, worst = -1;
        if (L.length >= 2) {
          best = 0; worst = 0;
          lt.forEach((v, i) => { if (v < lt[best]) best = i; if (v > lt[worst]) worst = i; });
          if (lt[best] === lt[worst]) best = worst = -1;
        }
        const frag = document.createDocumentFragment();
        curRow = document.createElement('li');
        curRow.className = 'tmr-cur';
        curRow.innerHTML = '<span class="tmr-ln"></span><span class="tmr-lt"></span><span class="tmr-ld"></span><span class="tmr-ls"></span>';
        curRow.firstChild.textContent = String(L.length + 1);
        frag.appendChild(curRow);
        for (let i = L.length - 1; i >= 0; i--) {
          const li = document.createElement('li');
          if (i === best) li.className = 'tmr-best';
          if (i === worst) li.className = 'tmr-worst';
          const d = i ? lt[i] - lt[i - 1] : null;
          const ds = d == null ? '—' : (d < 0 ? '−' : '+') + (Math.abs(d) < MIN ? (Math.abs(d) / 1000).toFixed(2) : upStr(Math.abs(d)));
          li.innerHTML = '<span class="tmr-ln"></span><span class="tmr-lt"></span><span class="tmr-ld"></span><span class="tmr-ls"></span>';
          const sp = li.children;
          sp[0].textContent = String(i + 1);
          if (i === best || i === worst) { const tg = document.createElement('span'); tg.className = 'tmr-tag'; tg.textContent = i === best ? 'best' : 'worst'; sp[0].appendChild(tg); }
          sp[1].textContent = upStr(lt[i]);
          sp[2].textContent = ds;
          if (d != null && d !== 0) sp[2].classList.add(d < 0 ? 'tmr-neg' : 'tmr-pos');
          sp[3].textContent = upStr(L[i]);
          frag.appendChild(li);
        }
        R.lapList.appendChild(frag);
      }
    }
    tickLaps(now());
  }
  function tickLaps(n) {
    if (!curRow) return;
    const L = S.sw.laps, el = swElapsed(n);
    const s = upStr(el - L[L.length - 1]);
    if (s !== lastCur) { lastCur = s; curRow.children[1].textContent = s; curRow.children[3].textContent = upStr(el); }
  }

  /* ---------------- focus panel ---------------- */
  function renderFocus() {
    const f = S.fc, every = S.set.every;
    const k = f.phase === 'long' ? every : f.n % every;
    if (R.fcDots.childElementCount !== every) R.fcDots.innerHTML = '<i></i>'.repeat(every);
    [...R.fcDots.children].forEach((d, i) => {
      d.classList.toggle('tmr-on', i < k);
      d.classList.toggle('tmr-now', i === k && f.phase === 'work');
    });
    const today = f.day === localDay(now()) ? f.today : 0;
    R.fcToday.textContent = '';
    const b = document.createElement('b');
    b.textContent = String(today);
    R.fcToday.append(b, ' focus session' + (today === 1 ? '' : 's') + ' today' + (today ? ' · ' + lenWords(today * S.set.work * MIN) : ''));
    R.fcLen.textContent = S.set.work + ' · ' + S.set.short + ' · ' + S.set.long + ' min';
    R.fcLen.setAttribute('aria-label', 'Focus ' + S.set.work + ' minutes, break ' + S.set.short + ', long break ' + S.set.long + '. Change lengths');
  }
  on(R.fcLen, 'click', () => { showSheet(R.setSheet); setTimeout(() => { const h = R.setSheet.querySelector('[data-r="fcSet"]'); if (h) h.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }); }, 60); });

  /* ---------------- main actions ---------------- */
  function toggle() {
    unlockAudio();
    if (S.mode === 'sw') swToggle();
    else if (S.mode === 'tm') {
      const t = activeTimer();
      if (!t) {
        if (typingPreview != null) { S.draft.dur = typingPreview; }
        tStart();
        R.typeIn.value = '';
      } else if (t.st !== 'done') tToggle(t);
    } else fcToggle();
  }
  function reset(fromHold) {
    if (S.mode === 'sw') { if (S.sw.run || S.sw.acc > 0) { swReset(); if (fromHold) toast('Stopwatch reset'); } }
    else if (S.mode === 'tm') { const t = activeTimer(); if (t) { tRemove(t, true); if (fromHold) toast('Timer reset'); } }
    else if (S.fc.st !== 'idle') { fcReset(); if (fromHold) toast('Reset'); }
  }
  function setMode(m) {
    if (!['sw', 'tm', 'fc'].includes(m) || m === S.mode) return;
    S.mode = m;
    lastShape = '';
    changed();
    fit();
  }
  on(R.ctl, 'click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b === R.bP) { toggle(); return; }
    const act = b.dataset.act;
    const t = activeTimer();
    if (act === 'reset') reset();
    else if (act === 'lap') swLap();
    else if (act === 'plus' && t) tPlus(t);
    else if (act === 'skip') fcSkip();
    else if (act === 'custom') openSetTimer();
    else if (act === 'share') share();
  });
  on(R.seg, 'click', (e) => { const b = e.target.closest('button[data-mode]'); if (b) setMode(b.dataset.mode); });
  on(R.seg, 'keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const order = ['sw', 'tm', 'fc'];
    const m = order[(order.indexOf(S.mode) + (e.key === 'ArrowRight' ? 1 : 2)) % 3];
    setMode(m);
    R.seg.querySelector(`[data-mode="${m}"]`).focus();
  });

  async function share() {
    const d = S.draft.dur;
    if (d < SEC) return;
    const u = new URL('/timer/', location.origin);
    u.searchParams.set('t', shortDuration(d));
    if (S.draft.label.trim()) u.searchParams.set('label', S.draft.label.trim());
    const url = u.toString();
    try { await navigator.clipboard.writeText(url); toast('Link copied · ' + shortDuration(d) + (S.draft.label.trim() ? ' ' + S.draft.label.trim() : '')); return; } catch (e) {}
    try { if (navigator.share) { await navigator.share({ url, title: 'Timer' }); return; } } catch (e) { return; }
    toast(url);
  }

  /* ---------------- tap / hold on the big number ---------------- */
  let g = null;
  function endHold() { if (!g) return; clearTimeout(g.t); clearTimeout(g.v); R.num.classList.remove('tmr-holding'); }
  on(R.num, 'pointerdown', (e) => {
    if (e.button > 0) return;
    endHold();
    const resettable = (S.mode === 'sw' && (S.sw.run || S.sw.acc > 0)) || (S.mode === 'tm' && !!activeTimer()) || (S.mode === 'fc' && S.fc.st !== 'idle');
    const gg = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, fired: false, t: 0, v: 0 };
    g = gg;
    if (resettable) {
      gg.v = setTimeout(() => { if (g === gg && !gg.moved) R.num.classList.add('tmr-holding'); }, 160);
      gg.t = setTimeout(() => {
        if (g !== gg || gg.moved) return;
        gg.fired = true;
        R.num.classList.remove('tmr-holding');
        haptic(18);
        reset(true);
      }, 700);
    }
  });
  on(R.num, 'pointermove', (e) => {
    if (!g || e.pointerId !== g.id || g.moved) return;
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 12) { g.moved = true; endHold(); }
  });
  on(R.num, 'pointerup', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const gg = g;
    endHold(); g = null;
    if (!gg.fired && !gg.moved) toggle();
  });
  on(R.num, 'pointercancel', () => { endHold(); g = null; });
  on(R.num, 'lostpointercapture', () => { if (g) { endHold(); g = null; } });
  // mouse wheel / trackpad over the digits adjusts the timer being set
  let wheelAcc = 0;
  on(R.num, 'wheel', (e) => {
    if (S.mode !== 'tm' || activeTimer()) return;
    e.preventDefault();
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) < 40) return;
    const dir = wheelAcc < 0 ? 1 : -1;
    wheelAcc = 0;
    const grp = e.target.closest('.tmr-g');
    const unit = grp === R.gh ? HOUR : grp === R.gs ? SEC : MIN;
    setDraft(clamp(S.draft.dur + dir * unit, 0, MAXDUR));
  }, { passive: false });
  on(root, 'contextmenu', (e) => { if (!(e.target.closest && e.target.closest('input, a'))) e.preventDefault(); });
  on(root, 'selectstart', (e) => { if (!(e.target.closest && e.target.closest('input'))) e.preventDefault(); });

  /* ---------------- label + typed time ---------------- */
  on(R.lblIn, 'input', () => {
    const v = R.lblIn.value.slice(0, 28);
    const t = activeTimer();
    if (t) t.label = v; else S.draft.label = v;
    save();
    updateHead();
  });
  on(R.lblIn, 'keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); R.lblIn.blur(); } });
  on(R.lblIn, 'change', () => { renderCards(true); updateAlarm(); });
  function wireType(form, input, startOnSubmit) {
    on(input, 'input', () => {
      const v = input.value.trim();
      const ms = parseDuration(v);
      form.classList.toggle('tmr-bad', !!v && ms == null);
      if (S.mode === 'tm' && !activeTimer()) {
        typingPreview = ms;
        if (form === R.typeForm2 && ms != null) setWheels(ms);
        renderPresets();
        renderFace(now());
        renderCtlPrimaryForTyping(ms);
      }
    });
    on(input, 'keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); input.blur(); } });
    on(input, 'blur', () => {
      if (typingPreview != null) { S.draft.dur = typingPreview; typingPreview = null; save(); }
    });
    on(form, 'submit', (e) => {
      e.preventDefault();
      const ms = parseDuration(input.value);
      if (ms == null) { toast('Try 7m30s, 1:30, 90s or 1h'); form.classList.add('tmr-bad'); return; }
      input.value = '';
      form.classList.remove('tmr-bad');
      typingPreview = null;
      S.draft.dur = ms;
      if (S.mode !== 'tm') S.mode = 'tm';
      S.active = null;
      if (startOnSubmit) { if (openSheet) closeSheet(true); unlockAudio(); tStart(ms); input.blur(); }
      else changed();
    });
  }
  function renderCtlPrimaryForTyping(ms) { R.bP.disabled = !((ms != null ? ms : S.draft.dur) >= SEC); }
  wireType(R.typeForm, R.typeIn, true);
  wireType(R.typeForm2, R.typeIn2, true);

  /* ---------------- set-timer sheet: wheels ---------------- */
  const ITEM = 44;
  const wheels = [[R.wh, 24], [R.wm, 60], [R.ws, 60]];
  for (const [el, count] of wheels) {
    let h = '<div class="tmr-pad"></div><div class="tmr-pad"></div>';
    for (let i = 0; i < count; i++) h += `<div role="option" data-v="${i}">${pad(i)}</div>`;
    h += '<div class="tmr-pad"></div><div class="tmr-pad"></div>';
    el.innerHTML = h;
  }
  let wheelSilence = false, wheelRAF = 0;
  function setWheels(ms) {
    const t = Math.round(ms / SEC);
    const v = [Math.min(23, Math.floor(t / 3600)), Math.floor((t % 3600) / 60), t % 60];
    wheelSilence = true;
    wheels.forEach(([el], i) => { el.scrollTop = v[i] * ITEM; markWheel(el, v[i]); });
    requestAnimationFrame(() => requestAnimationFrame(() => { wheelSilence = false; }));
  }
  const wheelVal = (el, count) => clamp(Math.round(el.scrollTop / ITEM), 0, count - 1);
  function markWheel(el, v) { el.querySelectorAll('[aria-selected]').forEach((o) => o.removeAttribute('aria-selected')); const o = el.querySelector(`[data-v="${v}"]`); if (o) o.setAttribute('aria-selected', 'true'); }
  function readWheels() {
    const [h, m, s] = wheels.map(([el, c]) => wheelVal(el, c));
    return (h * 3600 + m * 60 + s) * SEC;
  }
  for (const [el, count] of wheels) {
    on(el, 'scroll', () => {
      if (wheelSilence) return;
      cancelAnimationFrame(wheelRAF);
      wheelRAF = requestAnimationFrame(() => {
        markWheel(el, wheelVal(el, count));
        typingPreview = null;
        S.draft.dur = readWheels();
        R.typeIn2.value = '';
        R.typeForm2.classList.remove('tmr-bad');
        renderFace(now());
        renderPresets();
        R.bP.disabled = S.draft.dur < SEC;
      });
    }, { passive: true });
    on(el, 'keydown', (e) => {
      const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : e.key === 'PageDown' ? 5 : e.key === 'PageUp' ? -5 : 0;
      if (!d) return;
      e.preventDefault();
      el.scrollTo({ top: clamp(wheelVal(el, count) + d, 0, count - 1) * ITEM, behavior: reduced() ? 'auto' : 'smooth' });
    });
    on(el, 'click', (e) => {
      const o = e.target.closest('[data-v]');
      if (o) el.scrollTo({ top: +o.dataset.v * ITEM, behavior: reduced() ? 'auto' : 'smooth' });
    });
  }
  function openSetTimer() {
    if (S.mode !== 'tm') setMode('tm');
    if (activeTimer()) { S.active = null; changed(); }
    showSheet(R.setTimer);
    setWheels(S.draft.dur);
    R.typeIn2.value = '';
    if (fine) setTimeout(() => { try { R.typeIn2.focus({ preventScroll: true }); } catch (e) {} }, 80);
  }
  on(R.stSet, 'click', () => { S.draft.dur = readWheels(); closeSheet(); changed(); });
  on(R.stStart, 'click', () => {
    const ms = parseDuration(R.typeIn2.value) || readWheels();
    closeSheet(true);
    if (ms >= SEC) { unlockAudio(); tStart(ms); } else { S.draft.dur = ms; changed(); }
  });

  /* ---------------- sheets ---------------- */
  let openSheet = null, lastFocus = null;
  function showSheet(el) {
    if (openSheet && openSheet !== el) closeSheet(true);
    openSheet = el;
    lastFocus = document.activeElement;
    el.classList.add('tmr-open');
    el.setAttribute('aria-hidden', 'false');
    R.scrim.classList.add('tmr-open');
    if (el === R.setSheet) renderSettings();
    if (fine) setTimeout(() => { if (openSheet === el && !el.contains(document.activeElement)) try { el.querySelector('.tmr-x').focus({ preventScroll: true }); } catch (e) {} }, 60);
  }
  function closeSheet(quick) {
    const el = openSheet;
    if (!el) return;
    openSheet = null;
    el.classList.remove('tmr-open');
    el.setAttribute('aria-hidden', 'true');
    R.scrim.classList.remove('tmr-open');
    if (document.activeElement && el.contains(document.activeElement)) document.activeElement.blur();
    if (el === R.setTimer && typingPreview != null) { S.draft.dur = typingPreview; typingPreview = null; }
    if (!quick && fine && lastFocus && document.contains(lastFocus)) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
    renderAll();
  }
  on(R.scrim, 'click', () => closeSheet());
  root.querySelectorAll('[data-close]').forEach((b) => on(b, 'click', () => closeSheet()));
  for (const sh of [R.setSheet, R.setTimer]) {
    const head = sh.querySelector('.tmr-sheet-head');
    let d = null;
    on(head, 'pointerdown', (e) => {
      if (e.target.closest('button, input')) return;
      d = { id: e.pointerId, y: e.clientY, dy: 0 };
      try { head.setPointerCapture(e.pointerId); } catch (err) {}
    });
    on(head, 'pointermove', (e) => {
      if (!d || e.pointerId !== d.id) return;
      d.dy = Math.max(0, e.clientY - d.y);
      if (d.dy > 4) { sh.classList.add('tmr-drag'); sh.style.transform = `translate(-50%, ${d.dy}px)`; }
    });
    const end = (e) => {
      if (!d || e.pointerId !== d.id) return;
      const dy = d.dy; d = null;
      sh.classList.remove('tmr-drag');
      sh.style.transform = '';
      if (dy > 90) closeSheet();
    };
    on(head, 'pointerup', end);
    on(head, 'pointercancel', end);
  }

  /* ---------------- settings ---------------- */
  const hasVib = typeof navigator.vibrate === 'function';
  const hasWake = 'wakeLock' in navigator;
  R.vibRow.hidden = !hasVib;
  R.notRow.hidden = !canNotify;
  R.wakeRow.hidden = !hasWake;
  root.querySelectorAll('.tmr-step').forEach((st) => {
    st.innerHTML = '<button type="button" data-d="-1" aria-label="Less">−</button><output></output><button type="button" data-d="1" aria-label="More">+</button>';
  });
  function renderSettings() {
    if (dead) return;
    const s = S.set;
    const sw = (el, v) => el.setAttribute('aria-checked', String(!!v));
    sw(R.oSound, s.sound); sw(R.oVib, s.vib); sw(R.oNotify, s.notify && canNotify && Notification.permission === 'granted'); sw(R.oWake, s.wake); sw(R.oAuto, s.auto);
    R.oVol.value = String(s.vol);
    R.volRow.style.opacity = s.sound ? '' : '.45';
    if (canNotify) R.notNote.textContent = Notification.permission === 'denied' ? 'blocked in this browser’s site settings' : 'when this tab is in the background';
    root.querySelectorAll('.tmr-step').forEach((st) => {
      const k = st.dataset.k, v = s[k];
      st.querySelector('output').textContent = st.dataset.unit === 'focus' ? v + ' focus' : v + ' min';
    });
    if (injectedNow) R.syncNote.textContent = '';
    else if (clk.ok) {
      const o = clk.off;
      R.syncNote.textContent = Math.abs(o) < 150 ? 'This device’s clock is exact.' : 'This device’s clock is ' + (Math.abs(o) / 1000).toFixed(1) + ' s ' + (o > 0 ? 'behind' : 'ahead') + '; corrected.';
    } else R.syncNote.textContent = clk.fails ? 'Offline: using this device’s clock.' : 'Checking the clock…';
  }
  on(R.oSound, 'click', () => { S.set.sound = !S.set.sound; save(); renderSettings(); if (S.set.sound) { unlockAudio(); softChime(); } });
  on(R.oVol, 'input', () => { S.set.vol = clamp(+R.oVol.value, 0, 1); save(); });
  on(R.oVol, 'change', () => { unlockAudio(); softChime(); });
  on(R.oTest, 'click', () => {
    unlockAudio();
    if (!ac) { toast('Sound isn’t available here'); return; }
    try { const bus = busFor(); phrase(bus, ac.currentTime + 0.05); setTimeout(() => { try { bus.disconnect(); } catch (e) {} }, 3000); } catch (e) {}
    if (!S.set.sound) toast('Chime is off — turn it on to hear alarms');
  });
  on(R.oVib, 'click', () => { S.set.vib = !S.set.vib; save(); renderSettings(); if (S.set.vib) haptic(30); });
  on(R.oNotify, 'click', toggleNotify);
  on(R.oWake, 'click', () => { S.set.wake = !S.set.wake; save(); renderSettings(); updateWake(); });
  on(R.oAuto, 'click', () => { S.set.auto = !S.set.auto; save(); renderSettings(); renderFace(now()); });
  on(R.oResetCount, 'click', () => { S.fc.today = 0; S.fc.n = 0; save(); renderFocus(); renderFace(now()); toast('Focus count reset'); });
  on(R.setSheet, 'click', (e) => {
    const b = e.target.closest('.tmr-step button');
    if (!b) return;
    const st = b.closest('.tmr-step'), k = st.dataset.k;
    const d = +b.dataset.d, cur = S.set[k];
    const step = k === 'work' && (d > 0 ? cur >= 10 : cur > 10) ? 5 : 1;
    S.set[k] = clamp(step === 5 ? Math.round((cur + d * step) / 5) * 5 : cur + d, +st.dataset.min, +st.dataset.max);
    save(); renderSettings(); renderFocus(); renderFace(now()); renderCtl();
  });
  on(R.setBtn, 'click', () => showSheet(R.setSheet));

  /* ---------------- fullscreen ---------------- */
  const fsEl = standalone ? html : root;
  const fsOK = !compact && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen);
  R.fsBtn.hidden = !fsOK;
  function toggleFs() {
    if (!fsOK) return;
    const cur = document.fullscreenElement || document.webkitFullscreenElement;
    try {
      if (cur) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else { const p = (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); }
    } catch (e) {}
  }
  on(R.fsBtn, 'click', toggleFs);
  const fsChange = () => { root.classList.toggle('tmr-isfs', !!(document.fullscreenElement || document.webkitFullscreenElement)); R.fsBtn.setAttribute('aria-label', root.classList.contains('tmr-isfs') ? 'Exit fullscreen' : 'Fullscreen'); fit(); };
  on(document, 'fullscreenchange', fsChange);
  on(document, 'webkitfullscreenchange', fsChange);

  /* ---------------- keyboard (only while active) ---------------- */
  const isField = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  on(document, 'keydown', (e) => {
    if (!active || dead || e.defaultPrevented) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (alarmShown) {
      if (k === 'Escape' || ((k === ' ' || k === 'Enter') && !(e.target && e.target.closest && e.target.closest('button')))) { e.preventDefault(); alarmMain(); }
      else if ((k === '+' || k === '=') && alarmItem && alarmItem.kind === 'tm') { e.preventDefault(); alarmSec(); }
      return;
    }
    if (k === 'Escape') { if (openSheet) { e.preventDefault(); closeSheet(); } else if (isField(document.activeElement)) document.activeElement.blur(); return; }
    if (isField(e.target) || isField(document.activeElement)) return;
    if (openSheet) return;
    if (k === ' ' || k === 'Spacebar') {
      e.preventDefault();
      if (e.repeat) return;
      if (e.target && e.target !== R.num && e.target.closest && e.target.closest('button') && root.contains(e.target)) e.target.blur();
      toggle();
      return;
    }
    if (e.repeat) return;
    if (k === 'Enter') {
      if (e.target && e.target.closest && e.target.closest('button, a') && e.target !== R.num) return;
      e.preventDefault();
      toggle();
      return;
    }
    const lk = k.length === 1 ? k.toLowerCase() : k;
    if (lk === 'l') { if (S.mode === 'sw') { e.preventDefault(); swLap(); } }
    else if (lk === 'r') { e.preventDefault(); reset(true); }
    else if (k === '1' || k === '2' || k === '3') { e.preventDefault(); setMode(['sw', 'tm', 'fc'][+k - 1]); }
    else if (lk === 'f') { if (fsOK) { e.preventDefault(); toggleFs(); } }
    else if (k === '/') {
      e.preventDefault();
      if (S.mode !== 'tm' || activeTimer()) { S.mode = 'tm'; S.active = null; changed(); }
      requestAnimationFrame(() => {
        if (R.typeIn.offsetParent) R.typeIn.focus();
        else openSetTimer();
      });
    } else if (k === '+' || k === '=') {
      const t = S.mode === 'tm' && activeTimer();
      if (t && t.st !== 'done') { e.preventDefault(); tPlus(t); }
    } else if (lk === 'n') { e.preventDefault(); newDraft(); }
  });

  /* ---------------- loop ---------------- */
  let raf = 0;
  const visible = () => document.visibilityState === 'visible';
  function kick() { if (!raf && !dead && active && visible()) raf = requestAnimationFrame(frame); }
  function frame() {
    raf = 0;
    if (dead) return;
    const n = now();
    checkEnds(n);
    renderFace(n);
    tickCards(n);
    tickLaps(n);
    renderAlarmTick(n);
    updateHead();
    if (anyRunning() || alarmShown) kick();
  }
  const bg = setInterval(() => {
    checkJump();
    if (!injectedNow && visible() && !clk.busy && pnow() - clk.at > 10 * MIN && clk.fails === 0) syncNow();
    if (!visible() || !active) { const n = now(); checkEnds(n); updateHead(); if (alarmShown) renderAlarmTick(n); }
  }, 1000);
  cleanups.push(() => clearInterval(bg));
  on(document, 'visibilitychange', () => {
    if (visible()) {
      checkJump();
      const n = now();
      checkEnds(n);
      renderFace(n);
      kick();
      updateWake();
      if (!injectedNow && pnow() - clk.at > 60000) syncNow();
    }
    scheduleEnd();
  });
  on(window, 'storage', (e) => {
    if (e.key !== LS_KEY || !e.newValue) return;
    const keepMode = S.mode;
    S = load();
    S.mode = keepMode;
    renderAll(); scheduleEnd(); updateWake(); kick();
  });
  on(window, 'pagehide', save);

  /* ---------------- go ---------------- */
  renderSettings();
  renderAll();
  fit();
  if (!injectedNow) syncNow(); else firstSyncDone();
  Promise.race([firstSync, new Promise((r) => setTimeout(r, 800))]).then(() => {
    if (dead) return;
    ready = true;
    const n = now();
    checkEnds(n);
    renderAll();
    scheduleEnd();
    kick();
  });
  kick();

  /* ---------------- teardown ---------------- */
  function destroy() {
    if (dead) return;
    save();
    dead = true;
    cancelAnimationFrame(raf); cancelAnimationFrame(fitRAF);
    clearTimeout(endT); clearTimeout(toastT); clearTimeout(clk.retry); clearTimeout(favT);
    stopAlarm();
    releaseWake();
    if (ro) ro.disconnect();
    for (const c of cleanups.splice(0)) try { c(); } catch (e) {}
    if (useTitle) document.title = origTitle;
    if (favLink && origFav) { favLink.type = origFav.type; favLink.href = origFav.href; }
    if (ac) try { ac.close(); } catch (e) {}
    root.remove();
    if (inst && inst.root === root) inst = null;
  }
  const api = {
    root,
    unmount: destroy,
    setActive(v) {
      active = !!v;
      if (active) { lastShape = ''; fit(); renderAll(); kick(); }
    },
    setMode,
    get mode() { return S.mode; },
    get running() { return anyRunning(); },
  };
  return { root, api, unmount: destroy };
}

/* ---------------- markup ---------------- */
const HINTS = {
  sw: '<kbd>Space</kbd> start &middot; <kbd>L</kbd> lap &middot; <kbd>R</kbd> reset &middot; <kbd>F</kbd> fullscreen',
  tm: '<kbd>Space</kbd> start &middot; <kbd>/</kbd> type a time &middot; <kbd>+</kbd> 1 min &middot; <kbd>N</kbd> new &middot; <kbd>R</kbd> reset',
  fc: '<kbd>Space</kbd> start &middot; <kbd>R</kbd> reset &middot; <kbd>F</kbd> fullscreen',
};
const X_ICON = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12"/></svg>';
const CARD = `<button type="button" class="tmr-ring"><svg viewBox="0 0 40 40" aria-hidden="true"><circle class="tmr-rt" cx="20" cy="20" r="17"/><circle class="tmr-rp" cx="20" cy="20" r="17" pathLength="100" stroke-dasharray="100" stroke-dashoffset="0"/></svg><svg class="tmr-ri" viewBox="0 0 24 24" aria-hidden="true"><path class="tmr-ri-play" d="M8 5.5v13l11-6.5z"/><path class="tmr-ri-pause" d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z"/></svg></button><button type="button" class="tmr-cmain"><b>00:00</b><small></small></button><button type="button" class="tmr-cx" aria-label="Remove timer">${X_ICON}</button>`;
const TEMPLATE = `
<div class="tmr-app"><div class="tmr-grid">
  <header class="tmr-top">
    <div class="tmr-seg" data-r="seg" role="tablist" aria-label="Mode">
      <i class="tmr-seg-ind" aria-hidden="true"></i>
      <button type="button" role="tab" data-mode="sw">Stopwatch<kbd aria-hidden="true">1</kbd></button>
      <button type="button" role="tab" data-mode="tm">Timer<kbd aria-hidden="true">2</kbd></button>
      <button type="button" role="tab" data-mode="fc">Focus<kbd aria-hidden="true">3</kbd></button>
    </div>
    <div class="tmr-tools">
      <button class="tmr-icon" data-r="fsBtn" type="button" aria-label="Fullscreen" title="Fullscreen (F)" hidden>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path class="tmr-fs-in" d="M3 7.5V3h4.5M12.5 3H17v4.5M17 12.5V17h-4.5M7.5 17H3v-4.5"/><path class="tmr-fs-out" d="M7.5 3v4.5H3M17 7.5h-4.5V3M12.5 17v-4.5H17M3 12.5h4.5V17"/></svg>
      </button>
      <button class="tmr-icon" data-r="setBtn" type="button" aria-label="Settings" aria-haspopup="dialog" aria-controls="$U-set" title="Settings">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6h8M15 6h2M3 14h2M9 14h8"/><circle cx="13" cy="6" r="2"/><circle cx="7" cy="14" r="2"/></svg>
      </button>
    </div>
  </header>

  <main class="tmr-stage" data-r="stage">
    <div class="tmr-face" data-r="face">
      <div class="tmr-lbl">
        <span data-r="lblTx"></span>
        <input class="tmr-lblin" data-r="lblIn" type="text" maxlength="28" placeholder="Add label" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done" aria-label="Timer label">
      </div>
      <div class="tmr-numwrap">
        <div class="tmr-num" data-r="num" role="timer" tabindex="0" aria-live="off" aria-label="Timer"><span class="tmr-g tmr-h" data-r="gh"></span><span class="tmr-c tmr-c1" aria-hidden="true"><i></i><i></i></span><span class="tmr-g tmr-m" data-r="gm">00</span><span class="tmr-c tmr-c2" aria-hidden="true"><i></i><i></i></span><span class="tmr-g tmr-s" data-r="gs">00</span><span class="tmr-g tmr-f" data-r="gf"></span></div>
        <div class="tmr-prog" aria-hidden="true"><i data-r="fill"></i></div>
      </div>
      <div class="tmr-sub" data-r="sub"></div>
    </div>
  </main>

  <section class="tmr-panel" aria-label="Controls">
    <div class="tmr-extra">
      <form class="tmr-typebox" data-r="typeForm" autocomplete="off">
        <input data-r="typeIn" type="text" placeholder="Type a time · 7m30s, 1:30, 90s" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" aria-label="Type a time, then Enter to start">
        <button type="submit" class="tmr-tbgo" aria-label="Start typed time">&#9166;</button>
      </form>
      <div class="tmr-presets" data-r="presets" role="group" aria-label="Presets"></div>
      <div class="tmr-cards" data-r="cards" role="group" aria-label="Other timers"></div>
      <div class="tmr-laps" data-r="laps" role="group" aria-label="Laps">
        <div class="tmr-lap-h" aria-hidden="true"><span>Lap</span><span>Time</span><span>&Delta;</span><span>Total</span></div>
        <ol data-r="lapList"></ol>
      </div>
      <div class="tmr-fc">
        <div class="tmr-fc-dots" data-r="fcDots" aria-hidden="true"></div>
        <p class="tmr-fc-today" data-r="fcToday"></p>
        <button type="button" class="tmr-fc-len" data-r="fcLen" aria-haspopup="dialog" aria-controls="$U-set"></button>
      </div>
    </div>
    <div class="tmr-ctl" data-r="ctl">
      <button type="button" class="tmr-b2" data-r="bL"></button>
      <button type="button" class="tmr-b1" data-r="bP" aria-label="Start"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="tmr-ic-play" d="M8 5.5v13l11-6.5z"/><path class="tmr-ic-pause" d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z"/></svg></button>
      <button type="button" class="tmr-b2" data-r="bR"></button>
    </div>
  </section>

  <footer class="tmr-foot" data-r="foot">
    <a class="tmr-home" href="/">&larr; SZVTECH</a>
    <span class="tmr-hint" data-r="hint"></span>
    <span class="tmr-fdots" data-szv-theme-dots></span>
  </footer>
</div></div>

<div class="tmr-toast" data-r="toast" role="status" aria-live="polite"></div>
<div class="tmr-sr" data-r="sr" aria-live="polite"></div>
<div class="tmr-scrim" data-r="scrim" aria-hidden="true"></div>

<section class="tmr-sheet" data-r="setSheet" id="$U-set" role="dialog" aria-modal="true" aria-labelledby="$U-set-t" aria-hidden="true">
  <div class="tmr-sheet-head">
    <span class="tmr-grab" aria-hidden="true"></span>
    <div class="tmr-sh-row"><h2 id="$U-set-t">Settings</h2><button class="tmr-x" type="button" data-close aria-label="Close">${X_ICON}</button></div>
  </div>
  <div class="tmr-sheet-body">
    <h3 class="tmr-grp-h">Alarm</h3>
    <div class="tmr-opt"><span>Chime<small>a soft generated bell</small></span><button type="button" class="tmr-sw" role="switch" data-r="oSound" aria-label="Chime"></button></div>
    <div class="tmr-opt" data-r="volRow"><span>Volume</span><span class="tmr-volw"><input type="range" data-r="oVol" min="0" max="1" step="0.05" aria-label="Volume"><button type="button" class="tmr-mini" data-r="oTest">Test</button></span></div>
    <div class="tmr-opt" data-r="vibRow"><span>Vibrate<small>skipped while animations are reduced</small></span><button type="button" class="tmr-sw" role="switch" data-r="oVib" aria-label="Vibrate"></button></div>
    <div class="tmr-opt" data-r="notRow"><span>Notifications<small data-r="notNote">when this tab is in the background</small></span><button type="button" class="tmr-sw" role="switch" data-r="oNotify" aria-label="Notifications"></button></div>
    <div class="tmr-opt" data-r="wakeRow"><span>Keep screen on<small>while something is running</small></span><button type="button" class="tmr-sw" role="switch" data-r="oWake" aria-label="Keep screen on"></button></div>

    <h3 class="tmr-grp-h" data-r="fcSet">Focus</h3>
    <div class="tmr-opt"><span>Focus</span><span class="tmr-step" data-k="work" data-min="1" data-max="180"></span></div>
    <div class="tmr-opt"><span>Short break</span><span class="tmr-step" data-k="short" data-min="1" data-max="60"></span></div>
    <div class="tmr-opt"><span>Long break</span><span class="tmr-step" data-k="long" data-min="1" data-max="90"></span></div>
    <div class="tmr-opt"><span>Long break after</span><span class="tmr-step" data-k="every" data-min="2" data-max="12" data-unit="focus"></span></div>
    <div class="tmr-opt"><span>Auto-start next<small>roll from focus to break with a soft chime</small></span><button type="button" class="tmr-sw" role="switch" data-r="oAuto" aria-label="Auto-start next"></button></div>
    <div class="tmr-opt"><span>Today&rsquo;s count</span><button type="button" class="tmr-mini" data-r="oResetCount">Reset</button></div>

    <h3 class="tmr-grp-h">Look</h3>
    <div class="tmr-opt"><span>Theme<small>every SZVTECH page<span class="tmr-kb"> &middot; <kbd>t</kbd> cycles</span></small></span><span data-szv-theme-dots></span></div>

    <div class="tmr-keys tmr-kb">
      <h3 class="tmr-grp-h">Keyboard</h3>
      <dl>
        <div><dt><kbd>Space</kbd></dt><dd>start / pause</dd></div>
        <div><dt><kbd>L</kbd></dt><dd>lap</dd></div>
        <div><dt><kbd>R</kbd></dt><dd>reset</dd></div>
        <div><dt><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd></dt><dd>stopwatch · timer · focus</dd></div>
        <div><dt><kbd>/</kbd></dt><dd>type a time</dd></div>
        <div><dt><kbd>Enter</kbd></dt><dd>start</dd></div>
        <div><dt><kbd>+</kbd></dt><dd>add a minute</dd></div>
        <div><dt><kbd>N</kbd></dt><dd>new timer</dd></div>
        <div><dt><kbd>F</kbd></dt><dd>fullscreen</dd></div>
      </dl>
    </div>
    <p class="tmr-note">Everything stays in this browser. Times are checked against the server clock, so they stay right even if this device&rsquo;s clock isn&rsquo;t. <span data-r="syncNote"></span></p>
  </div>
</section>

<section class="tmr-sheet" data-r="setTimer" role="dialog" aria-modal="true" aria-labelledby="$U-st-t" aria-hidden="true">
  <div class="tmr-sheet-head">
    <span class="tmr-grab" aria-hidden="true"></span>
    <div class="tmr-sh-row"><h2 id="$U-st-t">Set timer</h2><button class="tmr-x" type="button" data-close aria-label="Close">${X_ICON}</button></div>
  </div>
  <div class="tmr-sheet-body">
    <form class="tmr-typebox tmr-insheet" data-r="typeForm2" autocomplete="off">
      <input data-r="typeIn2" type="text" placeholder="Type · 7m30s, 1:30, 90s" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" aria-label="Type a time">
    </form>
    <div class="tmr-wheels">
      <div class="tmr-wcol"><div class="tmr-wheel" data-r="wh" tabindex="0" role="listbox" aria-label="Hours"></div><span>h</span></div>
      <div class="tmr-wcol"><div class="tmr-wheel" data-r="wm" tabindex="0" role="listbox" aria-label="Minutes"></div><span>min</span></div>
      <div class="tmr-wcol"><div class="tmr-wheel" data-r="ws" tabindex="0" role="listbox" aria-label="Seconds"></div><span>sec</span></div>
      <i class="tmr-wband" aria-hidden="true"></i>
    </div>
    <div class="tmr-st-btns">
      <button type="button" class="tmr-ghost" data-r="stSet">Set</button>
      <button type="button" class="tmr-go" data-r="stStart">Start</button>
    </div>
  </div>
</section>

<div class="tmr-alarm" data-r="alarm" role="alertdialog" aria-modal="true" aria-labelledby="$U-al-t" aria-describedby="$U-al-s" hidden>
  <div class="tmr-al-glow" aria-hidden="true"></div>
  <div class="tmr-al-in">
    <p class="tmr-al-k" data-r="alK">Time&rsquo;s up</p>
    <h2 id="$U-al-t" data-r="alT">Timer</h2>
    <div class="tmr-al-num" data-r="alNum" aria-hidden="true">+00:00</div>
    <p class="tmr-al-sub" id="$U-al-s" data-r="alSub"></p>
    <div class="tmr-al-btns">
      <button type="button" class="tmr-al-main" data-r="alMain">Dismiss</button>
      <button type="button" class="tmr-al-sec" data-r="alSec">+1 min</button>
    </div>
    <p class="tmr-al-more" data-r="alMore"></p>
  </div>
</div>`;
