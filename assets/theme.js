/* ==========================================================================
   SZVTECH — site-wide theme  (/assets/theme.js)

   One palette, every page. A theme picked anywhere (homepage terminal,
   /learn terminal, a switcher dot, the `t` key, ?theme=lime) is saved once and
   every page — including ones that don't exist yet — paints itself with it
   before first paint. Open tabs follow along live (storage event).

   NEW PAGE? Two steps:
   1. In <head>, BEFORE any stylesheet, add this classic (non-module) script:
        <script src="/assets/theme.js"></script>
   2. Paint accents with the shared variables — never hardcoded hex:
        color: var(--a1, #8b5cf6);                         primary   (violet)
        color: var(--a2, #22d3ee);                         secondary (cyan)
        color: var(--a3, #e879f9);                         tertiary  (magenta)
        background: var(--grad);                           a1 → a3 → a2 sweep
        color-mix(in srgb, var(--a1) 30%, transparent)     translucent glows
        rgba(var(--a1-rgb, 139, 92, 246), .3)              same, older syntax
        --a1-hi --a2-hi --a3-hi                            lighter tints
        --a12 (a1→a2 blend)  --a1-lo (deep a1)             extra stops
   Optional:
     <div data-szv-theme-dots></div>   a row of theme dots (auto-mounted)
     <html data-theme-keys="off">      page owns the keyboard (no `t` cycling)
     Canvas / WebGL / JS colors:
       const p = SZVTheme.palette();     // { name, a1, a2, a3, ..., rgb: { a1: [r,g,b], ... } }
       SZVTheme.on((name, p) => repaint(p));   // fires on every change
   Full notes: /assets/THEME.md
   ========================================================================== */
(function () {
  'use strict';
  if (window.SZVTheme) return; // included twice: keep the first

  var KEY = 'szv-theme';               // shared choice (the homepage terminal already used this key)
  var SESSION_KEY = 'szv-theme-url';   // ?theme= override for this tab only
  var LEGACY_KEYS = ['theme', 'szvtech-theme', 'szv_theme'];
  var DEFAULT = 'violet';
  var DEFAULT_META = '#05050a';
  var doc = document.documentElement;

  /* Palettes. violet is the site's original look — its values are exact.
     a1/a2/a3: accents · *hi: lighter tints · a12: a1→a2 blend · a1lo: deep a1
     meta: <meta name="theme-color"> (only where a page uses the shared #05050a) */
  var THEMES = {
    violet:  { label: 'Violet',  a1: '#8b5cf6', a2: '#22d3ee', a3: '#e879f9', a1hi: '#a78bfa', a2hi: '#67e8f9', a3hi: '#f0abfc', a12: '#5b8cff', a1lo: '#5b3cc8', meta: '#05050a' },
    cyan:    { label: 'Cyan',    a1: '#22d3ee', a2: '#3b82f6', a3: '#5eead4', a1hi: '#67e8f9', a2hi: '#93c5fd', a3hi: '#99f6e4', a12: '#2ea9f2', a1lo: '#0e6a86', meta: '#03080b' },
    magenta: { label: 'Magenta', a1: '#ff2fa0', a2: '#8b5cf6', a3: '#ffb86b', a1hi: '#ff7cc4', a2hi: '#a78bfa', a3hi: '#ffd4a3', a12: '#c546cb', a1lo: '#a3125f', meta: '#0a0408' },
    lime:    { label: 'Lime',    a1: '#a3e635', a2: '#22d3ee', a3: '#fde047', a1hi: '#bef264', a2hi: '#67e8f9', a3hi: '#fef08a', a12: '#62dd92', a1lo: '#4d7c0f', meta: '#060903' },
    ember:   { label: 'Ember',   a1: '#fb7185', a2: '#fbbf24', a3: '#fb923c', a1hi: '#fda4af', a2hi: '#fde68a', a3hi: '#fdba74', a12: '#fa9858', a1lo: '#9f1239', meta: '#0a0505' },
    ice:     { label: 'Ice',     a1: '#60a5fa', a2: '#e2e8f0', a3: '#a5b4fc', a1hi: '#93c5fd', a2hi: '#f8fafc', a3hi: '#c7d2fe', a12: '#a1c6f5', a1lo: '#1e3a8a', meta: '#05070b' },
  };
  var NAMES = Object.keys(THEMES);
  var COLOR_KEYS = ['a1', 'a2', 'a3', 'a1hi', 'a2hi', 'a3hi', 'a12', 'a1lo'];
  var CSS_NAME = { a1: '--a1', a2: '--a2', a3: '--a3', a1hi: '--a1-hi', a2hi: '--a2-hi', a3hi: '--a3-hi', a12: '--a12', a1lo: '--a1-lo' };

  function rgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function valid(n) { return typeof n === 'string' && Object.prototype.hasOwnProperty.call(THEMES, n.toLowerCase()) ? n.toLowerCase() : null; }
  function lsGet(k, store) { try { return (store || localStorage).getItem(k); } catch (e) { return null; } }
  function lsSet(k, v, store) { try { if (v == null) (store || localStorage).removeItem(k); else (store || localStorage).setItem(k, v); } catch (e) { /* private mode */ } }
  var RM = false;
  try { RM = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* old browser */ }

  /* ---------- resolve the starting theme ---------- */
  (function migrate() {
    if (valid(lsGet(KEY))) return;
    for (var i = 0; i < LEGACY_KEYS.length; i++) {
      var v = valid(lsGet(LEGACY_KEYS[i]));
      if (v) { lsSet(KEY, v); lsSet(LEGACY_KEYS[i], null); return; }
    }
  })();
  (function urlOverride() {
    var m = /[?&]theme=([a-z]+)/i.exec(location.search || '');
    var v = m && valid(m[1]);
    if (v) lsSet(SESSION_KEY, v, sessionStorageSafe());
  })();
  function sessionStorageSafe() { try { return window.sessionStorage; } catch (e) { return null; } }
  function stored() {
    var ss = sessionStorageSafe();
    return (ss && valid(lsGet(SESSION_KEY, ss))) || valid(lsGet(KEY)) || DEFAULT;
  }

  /* ---------- palette object handed to JS ---------- */
  function palette(name) {
    var n = valid(name) || current;
    var t = THEMES[n], p = { name: n, label: t.label, meta: t.meta, rgb: {} };
    COLOR_KEYS.forEach(function (k) { p[k] = t[k]; p.rgb[k] = rgb(t[k]); });
    return p;
  }

  /* ---------- CSS ---------- */
  // Registered as <color> so a theme change can cross-fade (unless reduced motion).
  if (window.CSS && CSS.registerProperty) {
    COLOR_KEYS.forEach(function (k) {
      try { CSS.registerProperty({ name: CSS_NAME[k], syntax: '<color>', inherits: true, initialValue: THEMES.violet[k] }); } catch (e) { /* already registered */ }
    });
  }
  var head = document.head || doc;
  var varsEl = document.createElement('style');
  varsEl.id = 'szv-theme-vars';
  head.appendChild(varsEl);
  var baseEl = document.createElement('style');
  baseEl.id = 'szv-theme-ui';
  baseEl.textContent =
    // html:root (0,1,1) beats each page's own :root fallbacks (0,1,0)
    'html.szv-theme-fade{transition:--a1 .8s ease,--a2 .8s ease,--a3 .8s ease,--a1-hi .8s ease,--a2-hi .8s ease,--a3-hi .8s ease,--a12 .8s ease,--a1-lo .8s ease}' +
    '@media (prefers-reduced-motion:reduce){html:root,html.szv-theme-fade{transition:none}}' +
    '.szv-dots{display:inline-flex;align-items:center;gap:2px;vertical-align:middle;line-height:0}' +
    '.szv-dot{position:relative;width:22px;height:22px;padding:0;margin:0;border:0;background:none;border-radius:50%;cursor:pointer;-webkit-tap-highlight-color:transparent;flex:none}' +
    '.szv-dot::before{content:"";position:absolute;inset:6px;border-radius:50%;background:linear-gradient(135deg,var(--c1) 0 45%,var(--c2) 55%);box-shadow:0 0 0 1px rgba(255,255,255,.14) inset;opacity:.7;transition:transform .25s cubic-bezier(.16,1,.3,1),opacity .2s,box-shadow .25s}' +
    '.szv-dot:hover::before{opacity:1;transform:scale(1.15)}' +
    '.szv-dot[aria-pressed="true"]::before{opacity:1;box-shadow:0 0 0 1.5px #05050a,0 0 0 2.5px var(--c1),0 0 10px var(--c1)}' +
    '.szv-dot:focus{outline:none}.szv-dot:focus-visible{outline:1px solid var(--c1);outline-offset:0}' +
    '@media (pointer:coarse){.szv-dot{width:32px;height:32px}.szv-dot::before{inset:9px}}' +
    '.szv-theme-toast{position:fixed;left:50%;bottom:max(18px,env(safe-area-inset-bottom));z-index:2147483000;transform:translate(-50%,12px);opacity:0;pointer-events:none;' +
    'display:flex;align-items:center;gap:8px;padding:7px 13px 7px 10px;border-radius:999px;background:rgba(10,10,20,.82);border:1px solid rgba(255,255,255,.12);' +
    'color:rgba(243,241,255,.9);font:500 11px/1 "JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.06em;text-transform:lowercase;' +
    '-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);transition:opacity .25s,transform .35s cubic-bezier(.16,1,.3,1)}' +
    '.szv-theme-toast.on{opacity:1;transform:translate(-50%,0)}' +
    '.szv-theme-toast i{width:9px;height:9px;border-radius:50%;background:var(--grad,linear-gradient(135deg,var(--a1),var(--a2)))}' +
    '@media (prefers-reduced-motion:reduce){.szv-theme-toast{transition:none}}';
  head.appendChild(baseEl);

  function cssFor(n) {
    var t = THEMES[n], s = 'html:root{';
    COLOR_KEYS.forEach(function (k) { s += CSS_NAME[k] + ':' + t[k] + ';'; });
    ['a1', 'a2', 'a3'].forEach(function (k) { s += '--' + k + '-rgb:' + rgb(t[k]).join(', ') + ';'; });
    s += '--grad:linear-gradient(100deg,var(--a1),var(--a3) 45%,var(--a2));}';
    return s;
  }

  var current = null;
  var listeners = [];
  var fadeT = 0;

  function apply(n, source) {
    var prev = current;
    current = n;
    // cross-fade only when someone is looking (a hidden tab just snaps)
    if (prev && prev !== n && !RM && !document.hidden) {
      doc.classList.add('szv-theme-fade');
      clearTimeout(fadeT);
      fadeT = setTimeout(function () { doc.classList.remove('szv-theme-fade'); }, 900);
    }
    varsEl.textContent = cssFor(n);
    doc.setAttribute('data-theme', n);
    syncMeta();
    syncDots();
    if (prev && prev !== n) {
      var p = palette(n);
      try { window.dispatchEvent(new CustomEvent('szv:theme', { detail: { name: n, palette: p, previous: prev, source: source } })); } catch (e) { /* very old browser */ }
      listeners.slice().forEach(function (cb) { try { cb(n, p, source); } catch (e) { setTimeout(function () { throw e; }); } });
    }
  }

  // <meta name="theme-color">: only touched when the page uses the shared dark
  // background (/time keeps its pure black, bedside mode keeps its own).
  var metaOwned = null;
  function syncMeta() {
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) return;
    if (metaOwned === null || metaOwned !== m) {
      var c = (m.getAttribute('content') || '').toLowerCase();
      var known = c === DEFAULT_META || NAMES.some(function (k) { return THEMES[k].meta === c; });
      if (!known) return;
      metaOwned = m;
    }
    m.setAttribute('content', THEMES[current].meta);
  }

  /* ---------- switcher dots: any [data-szv-theme-dots] element ---------- */
  function mount(el) {
    if (!el || el.__szvDots) return el;
    el.__szvDots = true;
    el.classList.add('szv-dots');
    if (!el.hasAttribute('role')) el.setAttribute('role', 'group');
    if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', 'Site theme');
    NAMES.forEach(function (n) {
      var t = THEMES[n], b = document.createElement('button');
      b.type = 'button';
      b.className = 'szv-dot';
      b.setAttribute('data-theme-name', n);
      b.setAttribute('aria-label', t.label + ' theme');
      b.title = t.label;
      b.style.setProperty('--c1', t.a1);
      b.style.setProperty('--c2', n === 'violet' ? t.a3 : t.a2);
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); set(n); });
      el.appendChild(b);
    });
    syncDots();
    return el;
  }
  function syncDots() {
    var bs = document.querySelectorAll('.szv-dot[data-theme-name]');
    for (var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', String(bs[i].getAttribute('data-theme-name') === current));
  }
  function mountAll() {
    var els = document.querySelectorAll('[data-szv-theme-dots]');
    for (var i = 0; i < els.length; i++) mount(els[i]);
  }

  /* ---------- tiny toast for the `t` key ---------- */
  var toastEl = null, toastT = 0;
  function toast(n) {
    if (!document.body) return;
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'szv-theme-toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = '<i aria-hidden="true"></i><span></span>';
    toastEl.lastChild.textContent = 'theme · ' + n + '  (t to cycle)';
    void toastEl.offsetWidth;
    toastEl.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('on'); }, 1600);
  }

  /* ---------- public API ---------- */
  function set(name, opts) {
    var n = valid(name);
    if (!n) return false;
    lsSet(KEY, n);
    var ss = sessionStorageSafe();
    if (ss) lsSet(SESSION_KEY, null, ss); // an explicit pick replaces a ?theme= link override
    apply(n, (opts && opts.source) || 'local');
    return true;
  }
  function cycle(dir) {
    var i = NAMES.indexOf(current);
    var n = NAMES[(i + (dir || 1) + NAMES.length) % NAMES.length];
    set(n, { source: 'cycle' });
    return n;
  }
  function on(cb) {
    if (typeof cb !== 'function') return function () {};
    listeners.push(cb);
    return function off() { var i = listeners.indexOf(cb); if (i > -1) listeners.splice(i, 1); };
  }

  window.SZVTheme = {
    get: function () { return current; },
    set: set,
    list: function () { return NAMES.slice(); },
    on: on,
    palette: palette,
    cycle: cycle,
    mount: mount,
    toast: toast,
    themes: THEMES,
    DEFAULT: DEFAULT,
  };

  apply(stored(), 'init');

  /* ---------- other tabs ---------- */
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY && e.key !== null) return;
    var n = valid(e.newValue) || (e.key === null ? DEFAULT : null);
    if (!n) return;
    var ss = sessionStorageSafe();
    if (ss) lsSet(SESSION_KEY, null, ss);
    if (n !== current) apply(n, 'storage');
  });
  // back/forward cache: the page may come back after a change elsewhere
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) { var n = stored(); if (n !== current) apply(n, 'storage'); }
  });

  /* ---------- `t` cycles themes (not while typing; pages can opt out) ---------- */
  window.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key !== 't' && e.key !== 'T') return;
    if (doc.getAttribute('data-theme-keys') === 'off') return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    var a = document.activeElement;
    if (a && a !== t && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
    toast(cycle(e.shiftKey ? -1 : 1));
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll);
  else mountAll();
})();
