// /time hub — the big clock stays the hero; three more modes live one swipe away:
//   Clock (default) · Timer (stopwatch / timer / focus) · World · Zmanim
//
// Switch by swiping up / down (horizontal swipes already belong to favourite
// cities on the clock and to the zmanim looks), by the quiet dot rail on the
// right edge, or with the keys 1–4 / ↑ ↓.
//
// Each mode is an existing embeddable module (/timer/timer.js, /world/world.js,
// /zmanim/zmanim-view.js), imported the first time its mode opens and handed
// /time's server-synced now(). Hidden modes are setActive(false) so their loops
// stop. Deep links: /time/#timer, #stopwatch, #focus, #world, #zmanim,
// #zmanim/sun, #zmanim/week (or ?mode=…). Opening /time always starts on the
// clock unless the link says otherwise.

const MODES = [
  { id: 'clock', name: 'Clock' },
  { id: 'timer', name: 'Timer', long: 'Stopwatch · Timer' },
  { id: 'world', name: 'World' },
  { id: 'zmanim', name: 'Zmanim' },
];
const IDS = MODES.map((m) => m.id);
const HASH = {
  clock: ['clock'], timer: ['timer', { tmode: 'tm' }], stopwatch: ['timer', { tmode: 'sw' }], focus: ['timer', { tmode: 'fc' }],
  world: ['world'], zmanim: ['zmanim'], 'zmanim/day': ['zmanim', { look: 'day' }], 'zmanim/sun': ['zmanim', { look: 'sun' }], 'zmanim/week': ['zmanim', { look: 'week' }],
};
const HINT_KEY = 'szv-time-hub-hint';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const isField = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
const EASE = 'cubic-bezier(.16,1,.3,1)';

export function createHub(ctx) {
  const body = document.body;
  const rail = document.getElementById('rail');
  const tabs = [...rail.querySelectorAll('[data-mode]')];
  const mini = document.getElementById('mini');
  const panes = {};
  for (const el of document.querySelectorAll('.pane[data-pane]')) panes[el.dataset.pane] = el;
  const mods = {};      // id -> mounted module api
  const loading = {};   // id -> Promise<api>
  let mode = 'clock';
  let anims = [];
  let drag = null;

  /* ---------- layers: what belongs to each mode on screen ---------- */
  const clockLayer = () => ctx.clockEls();             // header, stage, footer clock bits
  const layer = (id) => (id === 'clock' ? clockLayer() : [panes[id]]);
  const moving = (id) => (id === 'clock' ? ctx.clockMoveEls() : [panes[id]]); // the parts that slide
  function setShown(id, on) {
    for (const el of layer(id)) {
      el.classList.toggle('hub-off', !on);
      if (on) { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); }
      else { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); }
    }
    if (id === 'clock') {
      mini.classList.toggle('hub-off', on);
      mini.toggleAttribute('inert', on);
    }
  }
  for (const id of IDS) if (id !== 'clock') setShown(id, false);
  setShown('clock', true);

  /* ---------- module loading ---------- */
  function css(id) {
    const link = document.querySelector(`link[data-mode-css="${id}"]`);
    if (!link) return Promise.resolve();
    if (link.media === 'all') return Promise.resolve();
    return new Promise((res) => {
      const done = () => res();
      // media="print" links are already fetched (non-blocking); flipping media applies them
      if (link.sheet) { link.media = 'all'; done(); return; }
      link.addEventListener('load', () => { link.media = 'all'; done(); }, { once: true });
      link.addEventListener('error', done, { once: true });
      setTimeout(() => { link.media = 'all'; done(); }, 2500);
    });
  }
  const opts0 = {};
  function load(id, o = {}) {
    if (mods[id]) return Promise.resolve(mods[id]);
    if (loading[id]) return loading[id];
    const el = panes[id];
    el.classList.add('loading');
    const p = (async () => {
      await css(id);
      let api = null;
      if (id === 'timer') {
        const m = await import('/timer/timer.js?v=a17f624db9');
        api = m.mount(el, { compact: true, now: ctx.now, docTitle: false, favicon: false, active: o.active !== false, mode: o.tmode });
        watchAlarm(api);
      } else if (id === 'world') {
        const m = await import('/world/world.js?v=d760887e9f');
        api = m.mount(el, { compact: true, now: ctx.now, urlSync: false, onPickCity: (e) => ctx.pickCity(e) });
      } else if (id === 'zmanim') {
        const m = await import('/zmanim/zmanim-view.js?v=c9f47c4e11');
        api = m.mount(el, { compact: true, home: false, urlSync: false, now: ctx.now, location: ctx.loc() });
        // the location button opens /time's own picker, so every mode shares one place
        el.addEventListener('click', (e) => {
          const b = e.target.closest('.zv-loc, .zv-timelink');
          if (!b) return;
          e.preventDefault(); e.stopPropagation();
          ctx.openPicker();
        }, true);
        if (o.look) pickLook(el, o.look);
      }
      mods[id] = api;
      el.classList.remove('loading');
      if (mode !== id && api && api.setActive) api.setActive(false);
      return api;
    })().catch((err) => {
      el.classList.remove('loading');
      el.classList.add('failed');
      delete loading[id];
      console.warn('hub: could not load', id, err);
      return null;
    });
    loading[id] = p;
    return p;
  }
  function pickLook(el, look) {
    const b = el.querySelector(`.zv-looks [data-look="${look}"]`);
    if (b && b.getAttribute('aria-selected') !== 'true') b.click();
  }
  // A timer that ends while another mode is showing brings its alarm forward.
  function watchAlarm(api) {
    const al = api && api.root && api.root.querySelector('.tmr-alarm');
    if (!al || !('MutationObserver' in window)) return;
    new MutationObserver(() => { if (!al.hidden && mode !== 'timer') setMode('timer', { why: 'alarm' }); })
      .observe(al, { attributes: true, attributeFilter: ['hidden'] });
  }
  // Something running from an earlier visit? Mount the timer quietly so it can ring.
  try {
    const t = JSON.parse(lsGet('szv-timer-v1'));
    const running = t && ((t.sw && t.sw.run) || (Array.isArray(t.timers) && t.timers.some((x) => x && (x.st === 'run' || x.st === 'done'))) || (t.fc && (t.fc.st === 'run' || t.fc.st === 'done')));
    if (running) setTimeout(() => { if (!mods.timer) load('timer', { active: mode === 'timer' }); }, 1200);
  } catch (e) {}

  /* ---------- rail ---------- */
  let awakeT = 0;
  function wake(ms = 1600) {
    rail.classList.add('awake');
    clearTimeout(awakeT);
    awakeT = setTimeout(() => rail.classList.remove('awake'), ms);
  }
  function paintRail(preview) {
    tabs.forEach((b) => {
      const on = b.dataset.mode === mode;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle('preview', b.dataset.mode === preview);
    });
    body.dataset.mode = mode;
  }
  rail.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    wake();
    setMode(b.dataset.mode, { focusTab: document.activeElement === b });
  });
  rail.addEventListener('pointerdown', () => wake(2400), { passive: true });
  mini.addEventListener('click', () => setMode('clock'));

  /* ---------- switching ---------- */
  function finishAnims() {
    for (const a of anims) try { a.finish(); } catch (e) {}
    anims = [];
  }
  function writeHash() {
    try {
      const h = mode === 'clock' ? '' : '#' + mode;
      if (location.hash !== h) history.replaceState(history.state, '', location.pathname + location.search + h);
    } catch (e) {}
  }
  async function setMode(id, o = {}) {
    if (!IDS.includes(id)) return;
    if (id === mode) { if (o.tmode && mods.timer) mods.timer.setMode(o.tmode); if (o.look && panes.zmanim) pickLook(panes.zmanim, o.look); return; }
    finishAnims();
    const from = mode;
    const dir = o.dir || (IDS.indexOf(id) > IDS.indexOf(from) ? 1 : -1);
    mode = id;
    paintRail();
    if (!o.quiet) wake();
    if (!o.keepHash) writeHash();
    if (from !== 'clock' && mods[from] && mods[from].setActive) mods[from].setActive(false);
    ctx.onMode(id, from);
    if (id !== 'clock') {
      if (mods[id]) {
        if (o.tmode && mods.timer && id === 'timer') mods.timer.setMode(o.tmode);
        if (o.look) pickLook(panes.zmanim, o.look);
        mods[id].setActive && mods[id].setActive(true);
      } else load(id, o).then((api) => { if (api && mode === id && api.setActive) api.setActive(true); });
    }
    transition(from, id, dir, o.instant, o.fromDrag);
    if (o.focusTab) { const t = tabs.find((b) => b.dataset.mode === id); if (t) t.focus({ preventScroll: true }); }
    else if (document.activeElement && document.activeElement !== document.body) {
      // focus would be stranded inside a hidden layer: move it to the rail
      const a = document.activeElement;
      if (layer(from).some((el) => el.contains(a))) { const t = tabs.find((b) => b.dataset.mode === id); if (t) t.focus({ preventScroll: true }); }
    }
    ctx.announce(MODES[IDS.indexOf(id)].long || MODES[IDS.indexOf(id)].name);
  }
  function transition(from, to, dir, instant, fromDrag) {
    const calm = ctx.reduce();
    const outEls = layer(from), inEls = layer(to);
    const outMove = moving(from), inMove = moving(to);
    setShown(to, true);
    const clear = (els) => els.forEach((el) => { el.style.transform = ''; el.style.opacity = ''; });
    if (instant || !document.body.animate) { clear(outEls); clear(inEls); setShown(from, false); return; }
    const list = [];
    for (const el of outEls) {
      const cur = { opacity: el.style.opacity || 1, transform: el.style.transform || 'none' };
      const slide = !calm && outMove.includes(el);
      const kf = [cur, { opacity: 0, transform: slide ? `translateY(${-dir * 7}vh)` : cur.transform }];
      if (!slide) { kf[0] = { opacity: cur.opacity }; kf[1] = { opacity: 0 }; }
      const a = el.animate(kf, { duration: calm ? 200 : 260, easing: calm ? 'ease-in' : 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
      list.push(a);
    }
    clear(outEls);
    for (const el of inEls) {
      const slide = !calm && inMove.includes(el);
      const kf = slide
        ? [{ opacity: 0, transform: `translateY(${dir * 9}vh)` }, { opacity: 1, transform: 'none' }]
        : [{ opacity: 0 }, { opacity: 1 }];
      list.push(el.animate(kf, { duration: calm ? 300 : 560, delay: calm ? 140 : (fromDrag ? 60 : 110), easing: calm ? 'ease-out' : EASE, fill: 'backwards' }));
    }
    anims = list;
    const outDone = list.slice(0, outEls.length).map((a) => a.finished.catch(() => {}));
    Promise.all(outDone).then(() => {
      if (mode !== from) setShown(from, false);
      for (const a of list.slice(0, outEls.length)) try { a.cancel(); } catch (e) {}
    });
    Promise.all(list.map((a) => a.finished.catch(() => {}))).then(() => { if (anims === list) anims = []; });
  }
  const step = (d, o = {}) => {
    const i = IDS.indexOf(mode) + d;
    if (i < 0 || i >= IDS.length) return false;
    setMode(IDS[i], { dir: d, ...o });
    return true;
  };

  /* ---------- drag (shared by the clock stage and the module panes) ---------- */
  // dy: finger travel (negative = up = next mode)
  function dragStart() {
    finishAnims();
    drag = { els: moving(mode), all: layer(mode) };
    wake(4000);
  }
  function dragMove(dy) {
    if (!drag) return;
    const d = dy < 0 ? 1 : -1;
    const target = IDS[IDS.indexOf(mode) + d];
    const far = Math.min(1, Math.abs(dy) / 120);
    paintRail(target && far > .55 ? target : null);
    if (ctx.reduce()) {
      // calm: no movement — only a gentle dim, and the rail shows where you'd land
      const op = target ? String(1 - .35 * far) : '1';
      for (const el of drag.all) el.style.opacity = op;
      return;
    }
    const k = target ? .32 : .12; // rubber band at either end
    for (const el of drag.all) el.style.opacity = target ? String(1 - .45 * far) : '';
    for (const el of drag.els) el.style.transform = `translateY(${(dy * k).toFixed(1)}px)`;
  }
  function dragEnd(dy, v, cancelled) {
    if (!drag) return false;
    const g = drag; drag = null;
    paintRail();
    const d = dy < 0 ? 1 : -1;
    const go = !cancelled && (Math.abs(dy) > 70 || (Math.abs(dy) > 28 && Math.abs(v) > .45));
    if (go && step(d, { fromDrag: true })) {
      if (navigator.vibrate && !ctx.reduce()) try { navigator.vibrate(8); } catch (e) {}
      return true;
    }
    // spring back
    for (const el of g.all) {
      const from = { opacity: el.style.opacity || 1, transform: el.style.transform || 'none' };
      el.style.transform = ''; el.style.opacity = '';
      if (el.animate && (from.opacity != 1 || from.transform !== 'none')) {
        el.animate([from, { opacity: 1, transform: 'none' }], { duration: ctx.reduce() ? 200 : 380, easing: EASE });
      }
    }
    return false;
  }

  /* ---------- swipe inside the module panes (touch) ---------- */
  function scrollerOf(el, stop) {
    for (let n = el; n && n !== stop; n = n.parentElement) {
      if (n.scrollHeight > n.clientHeight + 1) {
        const oy = getComputedStyle(n).overflowY;
        if (oy === 'auto' || oy === 'scroll') return n;
      }
    }
    const oy = getComputedStyle(stop).overflowY;
    return (oy === 'auto' || oy === 'scroll') && stop.scrollHeight > stop.clientHeight + 1 ? stop : null;
  }
  function inOverlay(el, stop) {
    for (let n = el; n && n !== stop; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return true;
    return false;
  }
  for (const id of IDS) {
    if (id === 'clock') continue;
    const pane = panes[id];
    let g = null;
    pane.addEventListener('touchstart', (e) => {
      g = null;
      if (e.touches.length !== 1 || mode !== id) return;
      const t = e.target;
      if (t.closest && t.closest('input, textarea, select, [contenteditable="true"], [role="slider"]')) return;
      if (inOverlay(t, pane)) return;
      const sc = scrollerOf(t, pane);
      const p = e.touches[0];
      g = { x: p.clientX, y: p.clientY, t0: performance.now(), sc, top: sc ? sc.scrollTop : 0,
        atTop: !sc || sc.scrollTop <= 0, atBot: !sc || sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1, on: false, dead: false, last: [] };
    }, { passive: true });
    pane.addEventListener('touchmove', (e) => {
      if (!g || g.dead) return;
      const p = e.touches[0];
      const dx = p.clientX - g.x, dy = p.clientY - g.y;
      if (!g.on) {
        if (Math.hypot(dx, dy) < 10) return;
        // finger rested first = a hold (world cards reorder on hold); a sideways start belongs to the module
        if (performance.now() - g.t0 > 350 || Math.abs(dy) < 1.4 * Math.abs(dx)) { g.dead = true; return; }
        const up = dy < 0;
        const still = !g.sc || Math.abs(g.sc.scrollTop - g.top) < 2;
        if (!still || (up && !g.atBot) || (!up && !g.atTop)) { g.dead = true; return; }
        g.on = true; g.y0 = p.clientY - (up ? -10 : 10);
        dragStart();
      }
      if (e.cancelable) e.preventDefault();
      const d = p.clientY - g.y0;
      g.last.push([performance.now(), d]); if (g.last.length > 5) g.last.shift();
      dragMove(d);
    }, { passive: false });
    const end = (cancel) => (e) => {
      const gg = g; g = null;
      if (!gg || !gg.on) return;
      const L = gg.last, d = L.length ? L[L.length - 1][1] : 0;
      const v = L.length > 1 ? (L[L.length - 1][1] - L[0][1]) / Math.max(1, L[L.length - 1][0] - L[0][0]) : 0;
      dragEnd(d, v, cancel);
      // swallow the click the browser may synthesize after the swipe
      const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      pane.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => pane.removeEventListener('click', swallow, { capture: true }), 400);
    };
    pane.addEventListener('touchend', end(false));
    pane.addEventListener('touchcancel', end(true));
  }

  /* ---------- keyboard: 1–4 anywhere, ↑ ↓ from the clock / rail ---------- */
  function overlayOpen() {
    if (ctx.sheetOpen()) return true;
    const p = panes[mode];
    if (!p) return false;
    return !!p.querySelector('.tmr-sheet[aria-hidden="false"], .tmr-alarm:not([hidden]), .wld-sheet.open, .zv-sheet:not([hidden]), .zv-card:not([hidden])');
  }
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    if (overlayOpen()) return;
    if (isField(e.target)) {
      // focus left behind in a sheet that has closed (e.g. World's search) is not typing
      const p = panes[mode];
      if (!(p && p.contains(e.target) && inOverlay(e.target, p))) return;
      e.target.blur();
    }
    if (/^[1-4]$/.test(e.key)) {
      e.preventDefault(); e.stopPropagation();
      setMode(IDS[+e.key - 1], { focusTab: rail.contains(document.activeElement) });
      return;
    }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const a = document.activeElement;
    const free = !a || a === document.body || rail.contains(a) || ctx.clockEls().some((el) => el.contains(a));
    if (!free) return;
    e.preventDefault(); e.stopPropagation();
    if (!step(e.key === 'ArrowDown' ? 1 : -1, { focusTab: rail.contains(a) })) wake();
  }, true);
  // labels stay out while a keyboard is on the rail (a tap also focuses, but shouldn't pin them open)
  rail.addEventListener('focusin', (e) => { let kb = false; try { kb = e.target.matches(':focus-visible'); } catch (er) {} rail.classList.toggle('focus', kb); });
  rail.addEventListener('focusout', () => rail.classList.remove('focus'));

  /* ---------- deep links ---------- */
  function fromURL() {
    let key = decodeURIComponent((location.hash || '').slice(1)).toLowerCase();
    if (!key) { try { key = (new URLSearchParams(location.search).get('mode') || '').toLowerCase(); } catch (e) {} }
    return HASH[key] || null;
  }
  addEventListener('hashchange', () => { const h = fromURL(); if (h) setMode(h[0], { ...(h[1] || {}), keepHash: true }); else setMode('clock', { keepHash: true }); });

  const start = fromURL();
  // ?mode=… becomes the hash, so the address bar reads like the other links
  try {
    const q = new URLSearchParams(location.search);
    if (q.has('mode')) { q.delete('mode'); const s = q.toString(); history.replaceState(history.state, '', location.pathname + (s ? '?' + s : '') + (start && start[0] !== 'clock' ? '#' + Object.keys(HASH).find((k) => HASH[k] === start) : '')); }
  } catch (e) {}
  paintRail();
  if (start && start[0] !== 'clock') setMode(start[0], { ...(start[1] || {}), instant: true, quiet: true, keepHash: true });

  // first visits: let the rail say what it is, once or twice
  const seen = +(lsGet(HINT_KEY) || 0);
  if (seen < 3) setTimeout(() => { lsSet(HINT_KEY, String(seen + 1)); wake(3200); }, 1600);

  return {
    get mode() { return mode; },
    setMode, step, dragStart, dragMove, dragEnd,
    locChanged(loc) { if (mods.zmanim && mods.zmanim.setLocation) mods.zmanim.setLocation(loc, { persist: false }); },
    get dragging() { return !!drag; },
  };
}
