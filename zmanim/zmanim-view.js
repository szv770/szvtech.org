// zmanim/zmanim-view.js — embeddable zmanim view with three looks:
//   day  — the halachic day as a glowing vertical timeline (default)
//   sun  — a sky arc with the sun (or moon) at its real place in the day
//   week — 7 days × every zman, Shabbos column accented
//
//   import { mount, unmount, setActive } from '/zmanim/zmanim-view.js';
//   mount(el, { now?: () => ms, location?, compact?: boolean, home?: boolean, urlSync?: boolean });
//   setActive(false)   // pause timers while hidden (e.g. another mode inside /time)
//   unmount()
//
// All CSS lives in /zmanim/zmanim-view.css under the .zv- prefix.

import {
  MIN, DAY, KEY, lsGet, lsSet, partsIn, ymdStr, parseYMD, addDaysStr, todayIn, hm, hmText, countdown, relWords,
  normalizeLoc, locFromParams, savedLoc, defaultLoc, saveLoc, zipLoc, fromCity,
  CITIES, h24Pref, getDays, pruneCache, nextItem, phaseAt, definition, SHORT, ORDER, LABELS,
} from '/zmanim/data.js';
import { createClock } from '/zmanim/sync.js';

const LOOKS = ['day', 'sun', 'week'];
const LOOK_NAMES = { day: 'Day', sun: 'Sun', week: 'Week' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ');
const SVGNS = 'http://www.w3.org/2000/svg';
const mqReduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

let S = null; // the one mounted instance

/* =====================================================================
   public API
   ===================================================================== */
export function mount(containerEl, opts = {}) {
  if (S) unmount();
  if (!containerEl) throw new Error('zmanim-view: container element required');
  const clock = opts.now ? null : createClock();
  S = {
    host: containerEl, opts, clock,
    now: opts.now || (() => clock.now()),
    explicitLoc: !!opts.location,
    loc: normalizeLoc(opts.location) || (opts.urlSync !== false && locFromParams(location.search)) || savedLoc() || defaultLoc(),
    h24: h24Pref(),
    look: LOOKS.includes(lsGet(KEY.look)) ? lsGet(KEY.look) : 'day',
    sel: null,           // selected date (YYYY-MM-DD) for day/sun looks; null = today
    today: '',
    days: new Map(),     // date -> day
    meta: null,
    active: true,
    reduce: mqReduce.matches,
    timers: [], offs: [],
    seq: 0,
    sunSel: null, card: null, flashKey: null,
    userScrolledAt: -1e9,
  };
  build();
  S.today = todayIn(S.now(), S.loc.tz);
  if (clock) clock.start();
  applyLook(S.look, { instant: true });
  load();
  startTick();
  return { setActive, unmount, setLocation, refresh: () => load(true) };
}

export function unmount() {
  if (!S) return;
  stopTick();
  if (S.clock) S.clock.stop();
  S.offs.forEach((f) => { try { f(); } catch (e) {} });
  if (S.ro) S.ro.disconnect();
  S.root.remove();
  S = null;
}

export function setActive(on) {
  if (!S) return;
  on = !!on;
  if (S.active === on) return;
  S.active = on;
  S.root.classList.toggle('zv-paused', !on);
  if (on) {
    if (S.clock) S.clock.start();
    startTick();
    if (todayIn(S.now(), S.loc.tz) !== S.today) { S.today = todayIn(S.now(), S.loc.tz); load(); } else { layoutAll(); tick(); }
  } else {
    stopTick();
    if (S.clock) S.clock.stop();
  }
}

export function setLocation(loc, { persist = true } = {}) {
  if (!S) return;
  const l = normalizeLoc(loc);
  if (!l) return;
  S.loc = l;
  S.days.clear();
  S.meta = null;
  S.today = todayIn(S.now(), l.tz);
  if (persist && !S.explicitLoc) saveLoc(l);
  if (S.opts.urlSync) writeURL(l);
  renderLoc();
  load();
}

/* =====================================================================
   DOM
   ===================================================================== */
const $ = (sel) => S.root.querySelector(sel);
const ICON_CAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
const ICON_CHEV = '<svg class="zv-chev" viewBox="0 0 10 7" aria-hidden="true"><path d="M1 1.5l4 4 4-4"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function build() {
  const o = S.opts;
  const root = document.createElement('div');
  root.className = 'zv' + (o.compact ? ' zv-compact' : '') + (S.reduce ? ' zv-reduce' : '');
  root.innerHTML = `<div class="zv-frame">
  <div class="zv-bg" aria-hidden="true"></div>
  <header class="zv-top">
    <button type="button" class="zv-loc" aria-label="Change location"><i></i><span class="zv-loc-name"></span>${ICON_CHEV}</button>
    <div class="zv-head">
      <h1 class="zv-title"></h1>
      <div class="zv-subline"><span class="zv-heb"></span></div>
    </div>
    <div class="zv-tags"></div>
    <div class="zv-dates" role="group" aria-label="Date">
      <button type="button" data-d="0">Today</button>
      <button type="button" data-d="1"><span class="zv-long">Tomorrow</span><span class="zv-short">Tmrw</span></button>
      <label class="zv-pick" title="Pick a date">${ICON_CAL}<span class="zv-pick-t"></span><input type="date" aria-label="Pick a date"></label>
    </div>
    <div class="zv-looks" role="tablist" aria-label="View">
      ${LOOKS.map((l, i) => `<button type="button" role="tab" data-look="${l}" aria-keyshortcuts="${i + 1}">${LOOK_NAMES[l]}</button>`).join('')}
      <span class="zv-ink" aria-hidden="true"></span>
    </div>
  </header>
  <main class="zv-stage">
    <div class="zv-track">
      <section class="zv-pane zv-pane-day" data-look="day" aria-label="Day timeline"><div class="zv-scroll zv-dayscroll"><div class="zv-tl"></div></div></section>
      <section class="zv-pane zv-pane-sun" data-look="sun" aria-label="Sun arc">
        <div class="zv-sky" aria-hidden="true"><i data-ph="night"></i><i data-ph="dawn"></i><i data-ph="day"></i><i data-ph="dusk"></i></div>
        <div class="zv-arcbox"><svg class="zv-arc" aria-hidden="false"></svg></div>
        <div class="zv-info" aria-live="polite"></div>
      </section>
      <section class="zv-pane zv-pane-week" data-look="week" aria-label="Week"><div class="zv-scroll zv-weekscroll" data-zv-hscroll></div></section>
    </div>
    <div class="zv-status" role="status"></div>
  </main>
  <footer class="zv-foot">
    ${o.home === false || o.compact ? '' : '<a class="zv-home" href="/">&larr; SZVTECH</a>'}
    <span class="zv-credit"></span>
    <span class="zv-keys" aria-hidden="true">&larr; &rarr; views · N now</span>
    <span class="zv-dots" data-szv-theme-dots></span>
  </footer>
  <div class="zv-scrim" hidden></div>
  <div class="zv-card" role="dialog" aria-label="Zman details" hidden></div>
  <div class="zv-sheet" role="dialog" aria-label="Choose location" hidden>
    <div class="zv-sheet-head"><h2>Location</h2><button type="button" class="zv-x" aria-label="Close">${ICON_X}</button></div>
    <div class="zv-sheet-in">
      <input type="search" class="zv-q" placeholder="Search cities" autocomplete="off" spellcheck="false" aria-label="Search cities">
      <form class="zv-zip"><input inputmode="numeric" pattern="[0-9]*" maxlength="5" placeholder="US ZIP" aria-label="US ZIP code"><button type="submit">Use ZIP</button></form>
    </div>
    <div class="zv-list" role="listbox" aria-label="Cities"></div>
    <a class="zv-timelink" href="/time/">More options in /time &rarr;</a>
  </div>
  </div>`;
  S.root = root;
  S.host.appendChild(root);
  try { if (window.SZVTheme && window.SZVTheme.mount) window.SZVTheme.mount($('.zv-dots')); } catch (e) {}
  if (o.compact) { const d = $('.zv-dots'); if (d) d.remove(); }
  else {
    // narrow screens show only the current theme dot; tapping it opens the row
    const dots = $('.zv-dots');
    dots.addEventListener('click', (e) => {
      const b = e.target.closest('.szv-dot');
      if (!b) return;
      clearTimeout(S.dotsT);
      if (!dots.classList.contains('zv-open') && getComputedStyle(dots.querySelector('.szv-dot:not([aria-pressed="true"])') || b).display === 'none') {
        dots.classList.add('zv-open');
        S.dotsT = setTimeout(() => dots.classList.remove('zv-open'), 5000);
      } else S.dotsT = setTimeout(() => dots.classList.remove('zv-open'), 1400);
    }, true);
  }
  S.tl = $('.zv-tl');
  S.dayScroll = $('.zv-dayscroll');
  S.weekScroll = $('.zv-weekscroll');
  S.svg = $('.zv-arc');
  S.info = $('.zv-info');
  S.track = $('.zv-track');
  S.stage = $('.zv-stage');
  renderLoc();
  wire();
}

function on(target, ev, fn, opt) { target.addEventListener(ev, fn, opt); S.offs.push(() => target.removeEventListener(ev, fn, opt)); }

function wire() {
  // looks
  $('.zv-looks').addEventListener('click', (e) => { const b = e.target.closest('[data-look]'); if (b) applyLook(b.dataset.look); });
  // dates
  $('.zv-dates').addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    const d = +b.dataset.d;
    selectDate(d ? addDaysStr(S.today, d) : null, { scrollNow: true });
  });
  const inp = $('.zv-pick input');
  inp.addEventListener('change', () => { if (/^\d{4}-\d\d-\d\d$/.test(inp.value)) selectDate(inp.value === S.today ? null : inp.value, { scrollNow: true }); });
  // location sheet
  $('.zv-loc').addEventListener('click', openSheet);
  $('.zv-sheet .zv-x').addEventListener('click', closeOverlays);
  $('.zv-scrim').addEventListener('click', closeOverlays);
  $('.zv-q').addEventListener('input', renderList);
  $('.zv-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-city]');
    if (!b) return;
    const c = CITIES.find((x) => x.id === b.dataset.city);
    if (c) { closeOverlays(); setLocation(fromCity(c)); }
  });
  $('.zv-zip').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('.zv-zip input').value.trim();
    if (!/^\d{5}$/.test(v)) { $('.zv-zip input').focus(); $('.zv-zip').classList.add('zv-bad'); return; }
    $('.zv-zip').classList.remove('zv-bad');
    closeOverlays();
    setLocation(zipLoc(v));
  });
  // day timeline taps
  S.tl.addEventListener('click', (e) => {
    if (S.swallow) return;
    const b = e.target.closest('[data-i]');
    if (b) openCard(curDay(), +b.dataset.i);
  });
  on(S.dayScroll, 'scroll', () => { if (!S.autoScrolling) S.userScrolledAt = performance.now(); }, { passive: true });
  // sun ticks
  S.svg.addEventListener('click', (e) => {
    if (S.swallow) return;
    const t = e.target.closest('[data-i]');
    if (t) { S.sunSel = +t.dataset.i; S.sunSelAt = performance.now(); updateSun(true); }
  });
  S.info.addEventListener('click', (e) => {
    if (S.swallow) return;
    const day = curDay();
    if (!day) return;
    const i = S.sunSel != null ? S.sunSel : S.sunNext;
    if (i != null && e.target.closest('.zv-info-main')) openCard(day, i);
  });
  // week cells
  S.weekScroll.addEventListener('click', (e) => {
    if (S.swallow) return;
    const c = e.target.closest('[data-date]');
    if (!c) return;
    S.flashKey = c.dataset.key || null;
    const fk = S.flashKey;
    selectDate(c.dataset.date === S.today ? null : c.dataset.date, { scrollNow: !fk }).then(() => { if (S) applyLook('day'); });
  });
  // card
  S.root.querySelector('.zv-card').addEventListener('click', (e) => { if (e.target.closest('.zv-x')) closeOverlays(); });
  // swipe between looks
  wireSwipe();
  // keyboard
  on(window, 'keydown', onKey);
  // resize
  if ('ResizeObserver' in window) {
    let raf = 0;
    S.ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => S && layoutAll()); });
    S.ro.observe(S.root);
  } else on(window, 'resize', () => layoutAll());
  // settings / location changed by /time (another tab, or the host page)
  on(window, 'storage', (e) => {
    if (!S || !e.key) return;
    if (e.key === KEY.loc && !S.explicitLoc) { const l = savedLoc(); if (l && l.id !== S.loc.id) setLocation(l, { persist: false }); }
    if (e.key === KEY.h24) { S.h24 = h24Pref(); renderAll(); }
    if (e.key === KEY.candle || e.key === KEY.ends) { S.days.clear(); load(); }
  });
  const onMq = (e) => { S.reduce = e.matches; S.root.classList.toggle('zv-reduce', e.matches); };
  if (mqReduce.addEventListener) { mqReduce.addEventListener('change', onMq); S.offs.push(() => mqReduce.removeEventListener('change', onMq)); }
  on(document, 'visibilitychange', () => { if (document.visibilityState === 'visible' && S.active) tick(); });
}

function writeURL(loc) {
  try {
    const u = new URL(location.href);
    ['city', 'zip', 'tz', 'lat', 'lon', 'name'].forEach((k) => u.searchParams.delete(k));
    if (loc.kind === 'city') u.searchParams.set('city', loc.id);
    else if (loc.kind === 'zip') { u.searchParams.set('zip', loc.zip); if (!loc.tzAuto) u.searchParams.set('tz', loc.tz); }
    else if (loc.kind === 'custom') { u.searchParams.set('lat', loc.lat); u.searchParams.set('lon', loc.lon); u.searchParams.set('tz', loc.tz); }
    history.replaceState(history.state, '', u.pathname + u.search + u.hash);
  } catch (e) {}
}

/* =====================================================================
   data
   ===================================================================== */
const selDate = () => S.sel || S.today;
const curDay = () => S.days.get(selDate()) || null;

async function load(force) {
  const token = ++S.seq;
  const loc = S.loc;
  const nowMs = S.now();
  S.today = todayIn(nowMs, loc.tz);
  if (force) S.days.clear();
  setStatus(S.days.size ? '' : 'loading');
  const want = selDate();
  // 1) what is on screen first (selected day + next), 2) the week
  const first = await getDays(loc, want, 2, nowMs);
  if (!S || token !== S.seq) return;
  absorb(first, want);
  renderAll({ scrollNow: true });
  const wk = await getDays(loc, S.today, 7, nowMs);
  if (!S || token !== S.seq) return;
  absorb(wk, S.today);
  pruneCache(addDaysStr(S.today, -2));
  if (S.look === 'week') renderWeek(); else renderCredit();
}
function absorb(res, start) {
  res.days.forEach((d, i) => { if (d) S.days.set(d.date, d); else S.days.delete(addDaysStr(start, i)); });
  if (res.meta) {
    S.meta = res.meta;
    // a ZIP gets Chabad.org's place name ("Brooklyn, NY 11213")
    if (S.loc.kind === 'zip' && res.meta.location && S.loc.name !== res.meta.location) {
      S.loc = { ...S.loc, name: res.meta.location };
      if (!S.explicitLoc && (savedLoc() || {}).id === S.loc.id) saveLoc(S.loc);
      renderLoc();
    }
  }
}
async function selectDate(date, { scrollNow } = {}) {
  S.sel = date;
  S.sunSel = null;
  closeOverlays();
  if (!S.days.has(selDate())) {
    renderHeader();
    setStatus('loading');
    const token = ++S.seq;
    const res = await getDays(S.loc, selDate(), 1, S.now());
    if (!S || token !== S.seq) return;
    absorb(res, selDate());
  }
  renderAll({ scrollNow });
}

function setStatus(kind) {
  const el = $('.zv-status');
  el.dataset.kind = kind || '';
  el.textContent = kind === 'loading' ? 'Loading zmanim…' : kind === 'none' ? 'Zmanim are not available for this place and date. Try a city or ZIP code.' : '';
}

/* =====================================================================
   look switching + swipe + keys
   ===================================================================== */
function applyLook(look, { instant } = {}) {
  if (!LOOKS.includes(look)) return;
  const prev = S.look;
  S.look = look;
  lsSet(KEY.look, look);
  const idx = LOOKS.indexOf(look);
  S.root.dataset.look = look;
  S.root.querySelectorAll('.zv-looks [data-look]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.look === look)));
  S.root.querySelectorAll('.zv-pane').forEach((p) => {
    const act = p.dataset.look === look;
    p.toggleAttribute('inert', !act);
    p.setAttribute('aria-hidden', String(!act));
  });
  moveInk();
  const go = () => { S.track.style.transform = `translate3d(${-idx * 100}%,0,0)`; };
  if (instant || prev === look) { S.track.classList.add('zv-notrans'); go(); void S.track.offsetWidth; S.track.classList.remove('zv-notrans'); }
  else if (S.reduce) {
    // calm: a short crossfade instead of a slide
    S.stage.classList.add('zv-fade');
    clearTimeout(S.fadeT);
    S.fadeT = setTimeout(() => {
      if (!S) return;
      S.track.classList.add('zv-notrans'); go(); void S.track.offsetWidth; S.track.classList.remove('zv-notrans');
      renderLookNow();
      S.stage.classList.remove('zv-fade');
    }, 140);
    renderHeader();
    return;
  } else go();
  renderLookNow();
  renderHeader();
}
function renderLookNow() {
  if (!S.days.size) return;
  if (S.look === 'day') renderDay();
  else if (S.look === 'sun') renderSun();
  else renderWeek();
  renderCredit();
}
function moveInk() {
  const tabs = S.root.querySelector('.zv-looks');
  const b = tabs.querySelector(`[data-look="${S.look}"]`);
  const ink = tabs.querySelector('.zv-ink');
  if (!b || !ink) return;
  ink.style.width = b.offsetWidth + 'px';
  ink.style.transform = `translateX(${b.offsetLeft}px)`;
}

function wireSwipe() {
  // the whole view (header, stage, footer) takes horizontal swipes; overlays don't
  const st = S.root.querySelector('.zv-frame');
  let g = null;
  const canHScroll = (el, dir) => {
    const sc = el && el.closest && el.closest('[data-zv-hscroll]');
    if (!sc || sc.scrollWidth <= sc.clientWidth + 1) return false;
    return dir < 0 ? sc.scrollLeft + sc.clientWidth < sc.scrollWidth - 1 : sc.scrollLeft > 1;
  };
  st.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.target.closest('.zv-card, .zv-sheet, .zv-scrim, input')) { g = null; return; }
    g = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), mode: null, dx: 0, target: e.target };
  });
  st.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.mode) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        try { st.setPointerCapture(e.pointerId); } catch (er) {}
        if (canHScroll(g.target, dx)) {
          // the week table scrolls sideways under the finger (it is pan-y for the browser)
          const sc = g.target.closest('[data-zv-hscroll]');
          cancelAnimationFrame(S.flingRaf);
          g.mode = 'hs'; g.sc = sc; g.left0 = sc.scrollLeft + dx; g.vs = [];
        } else {
          g.mode = 'h';
          S.track.classList.add('zv-drag');
        }
      } else if (Math.abs(dy) > 10) { g.mode = 'v'; }
      else return;
    }
    if (g.mode === 'hs') {
      g.sc.scrollLeft = g.left0 - dx;
      g.vs.push([performance.now(), e.clientX]);
      if (g.vs.length > 6) g.vs.shift();
      e.preventDefault();
      return;
    }
    if (g.mode !== 'h') return;
    g.dx = dx;
    if (!S.reduce) {
      const idx = LOOKS.indexOf(S.look);
      let d = dx;
      if ((idx === 0 && dx > 0) || (idx === LOOKS.length - 1 && dx < 0)) d = dx / 3; // rubber band
      S.track.style.transform = `translate3d(calc(${-idx * 100}% + ${d}px),0,0)`;
    }
    e.preventDefault();
  });
  const end = (e, cancel) => {
    if (!g || e.pointerId !== g.id) return;
    const was = g; g = null;
    if (was.mode === 'hs') {
      S.swallow = true; setTimeout(() => { if (S) S.swallow = false; }, 60);
      const v0 = was.vs.length > 1 ? (was.vs[was.vs.length - 1][1] - was.vs[0][1]) / Math.max(1, was.vs[was.vs.length - 1][0] - was.vs[0][0]) : 0;
      let v = -v0 * 16, last = performance.now();
      const step = (now) => {
        const dt = Math.min(48, now - last) / 16; last = now;
        if (!S || Math.abs(v) < 0.4 || cancel) return;
        was.sc.scrollLeft += v * dt;
        v *= Math.pow(0.94, dt);
        S.flingRaf = requestAnimationFrame(step);
      };
      S.flingRaf = requestAnimationFrame(step);
      return;
    }
    if (was.mode !== 'h') return;
    S.track.classList.remove('zv-drag');
    S.swallow = true; setTimeout(() => { if (S) S.swallow = false; }, 60);
    const v = was.dx / Math.max(1, performance.now() - was.t);
    const W = st.clientWidth || 1;
    const idx = LOOKS.indexOf(S.look);
    let to = idx;
    if (!cancel && (Math.abs(was.dx) > W * 0.18 || Math.abs(v) > 0.45)) to = clamp(idx + (was.dx < 0 ? 1 : -1), 0, LOOKS.length - 1);
    if (to !== idx) { vibrate(); applyLook(LOOKS[to]); } else applyLook(S.look, { instant: S.reduce });
  };
  st.addEventListener('pointerup', (e) => end(e, false));
  st.addEventListener('pointercancel', (e) => end(e, true));
  // after a horizontal drag, swallow the click that would follow
  st.addEventListener('click', (e) => { if (S.swallow) { e.stopPropagation(); e.preventDefault(); } }, true);
}
function vibrate() { try { if (!S.reduce && navigator.vibrate) navigator.vibrate(8); } catch (e) {} }

function onKey(e) {
  if (!S || !S.active || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  if (!S.root.isConnected || S.root.offsetParent === null && getComputedStyle(S.root).position !== 'fixed') return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) { if (e.key === 'Escape') closeOverlays(); return; }
  const open = !$('.zv-sheet').hidden || !$('.zv-card').hidden;
  if (e.key === 'Escape') { if (open) { closeOverlays(); e.preventDefault(); } return; }
  if (open) return;
  const idx = LOOKS.indexOf(S.look);
  if (e.key === 'ArrowRight') { applyLook(LOOKS[Math.min(LOOKS.length - 1, idx + 1)]); e.preventDefault(); }
  else if (e.key === 'ArrowLeft') { applyLook(LOOKS[Math.max(0, idx - 1)]); e.preventDefault(); }
  else if (/^[123]$/.test(e.key)) applyLook(LOOKS[+e.key - 1]);
  else if (e.key === 'n' || e.key === 'N') { selectDate(null, { scrollNow: true }); if (S.look === 'week') applyLook('day'); }
}

/* =====================================================================
   header, location, credit
   ===================================================================== */
function renderLoc() {
  const n = $('.zv-loc-name');
  n.textContent = S.loc.name || 'Location';
  S.root.querySelector('.zv-loc').title = `${S.loc.name}${S.loc.country ? ' · ' + S.loc.country : ''} — change location`;
}
function niceDate(dateStr, opt) {
  const y = parseYMD(dateStr);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opt }).format(new Date(Date.UTC(y.y, y.m - 1, y.d, 12)));
}
function renderHeader() {
  const title = $('.zv-title'), heb = $('.zv-heb'), tags = $('.zv-tags');
  const d = selDate();
  const narrow = S.root.clientWidth < 420;
  if (S.look === 'week') {
    title.textContent = 'Next 7 days';
    heb.textContent = `${niceDate(S.today, { month: 'short', day: 'numeric' })} – ${niceDate(addDaysStr(S.today, 6), { month: 'short', day: 'numeric' })}`;
    tags.innerHTML = '';
  } else {
    const rel = d === S.today ? 'Today' : d === addDaysStr(S.today, 1) ? 'Tomorrow' : d === addDaysStr(S.today, -1) ? 'Yesterday' : '';
    const short = narrow && rel;
    title.innerHTML = `${rel ? `<em>${rel}</em> ` : ''}${esc(niceDate(d, short ? { month: 'short', day: 'numeric' } : { weekday: narrow ? 'short' : 'long', month: 'short', day: 'numeric' }))}`;
    const day = curDay();
    heb.textContent = [short ? niceDate(d, { weekday: 'short' }) : '', day ? day.hebrewDate : ''].filter(Boolean).join(' · ');
    const sp = day ? day.special : [];
    tags.innerHTML = sp.slice(0, 3).map((s) => `<b class="zv-tag zv-tag-${esc(s.kind)}">${esc(s.name)}</b>`).join('');
  }
  // date control state
  const dd = S.root.querySelectorAll('.zv-dates [data-d]');
  dd[0].setAttribute('aria-pressed', String(!S.sel));
  dd[1].setAttribute('aria-pressed', String(S.sel === addDaysStr(S.today, 1)));
  const custom = S.sel && S.sel !== addDaysStr(S.today, 1);
  const pick = $('.zv-pick');
  pick.classList.toggle('zv-on', !!custom);
  $('.zv-pick-t').textContent = custom ? niceDate(S.sel, { month: 'short', day: 'numeric' }) : '';
  const inp = $('.zv-pick input');
  inp.value = selDate();
  inp.min = addDaysStr(S.today, -365);
  inp.max = addDaysStr(S.today, 400);
}
function renderCredit() {
  const el = $('.zv-credit');
  const days = S.look === 'week' ? weekDates().map((d) => S.days.get(d)).filter(Boolean) : [curDay()].filter(Boolean);
  const chabad = days.some((d) => d.source === 'chabad');
  const calc = days.some((d) => d.source === 'calc');
  if (chabad) {
    const link = (S.meta && S.meta.link) || 'https://www.chabad.org/calendar/zmanim.htm';
    el.innerHTML = `<a href="${esc(link)}" target="_blank" rel="noopener"><span class="zv-cr-l">Zmanim courtesy of </span>Chabad.org</a>${calc ? ' <span>· some days calculated</span>' : ''}`;
  } else if (calc) {
    el.innerHTML = '<span title="Calculated on this device with Chabad.org\'s method; may differ by a minute">Calculated · Chabad.org method</span>';
  } else el.textContent = '';
}
function renderAll(o = {}) {
  if (!S) return;
  renderHeader();
  const day = curDay();
  setStatus(day || S.look === 'week' ? '' : 'none');
  renderLookNow();
  if (S.look === 'day' && o.scrollNow) scrollDay();
}
function layoutAll() {
  if (!S) return;
  moveInk();
  renderHeader();
  renderLookNow();
}

/* =====================================================================
   look 1: day timeline
   ===================================================================== */
const ROW = 48, ROW_NEXT = 70;
function dayGeometry(day) {
  const items = day.items;
  const w = S.root.clientWidth;
  const pxh = w < 500 ? 46 : 54;               // px per hour before spreading
  const k = pxh / 3600000;
  const g = (key) => { const i = items.find((x) => x.key === key); return i ? i.at : null; };
  const t0 = (g('alos') ?? items[0].at) - 50 * MIN;
  const tEnd = Math.max(items[items.length - 1].at, g('chatzosLayla') || 0) + 40 * MIN;
  const top = 26;
  const nf = g('tzeis') ?? g('shabbosEnds') ?? g('holidayEnds') ?? ((g('sunset') ?? tEnd) + 40 * MIN);
  const nightFrom = nf + 30 * MIN;
  const warp = (t) => t - 0.6 * Math.max(0, t - nightFrom);   // night runs at 40% speed
  const ys = [];
  const nowT = S.now();
  const nx = nextItem(items, nowT);
  let prevY = -1e9, prevH = 0;
  items.forEach((it, i) => {
    const h = it === nx ? ROW_NEXT : ROW;
    let y = top + (warp(it.at) - t0) * k;
    y = Math.max(y, prevY + prevH / 2 + h / 2 + 6);
    ys.push(y); prevY = y; prevH = h;
  });
  const anchors = [[t0, top]];
  items.forEach((it, i) => anchors.push([it.at, ys[i]]));
  const lastY = ys[ys.length - 1];
  const endY = lastY + Math.max(ROW, (warp(tEnd) - warp(items[items.length - 1].at)) * k);
  anchors.push([tEnd, endY]);
  const yOf = (t) => {
    if (t <= anchors[0][0]) return anchors[0][1] - (anchors[0][0] - t) * k;
    for (let i = 1; i < anchors.length; i++) {
      const [ta, ya] = anchors[i - 1], [tb, yb] = anchors[i];
      if (t <= tb) return tb === ta ? ya : ya + (yb - ya) * (t - ta) / (tb - ta);
    }
    const [tl, yl] = anchors[anchors.length - 1];
    return yl + (t - tl) * k;
  };
  return { t0, tEnd, ys, yOf, height: endY + 30, next: nx, k };
}

function skyStops(day, G) {
  const g = (key) => { const i = day.items.find((x) => x.key === key); return i ? i.at : null; };
  const H = G.height;
  const p = (t) => clamp(G.yOf(t) / H * 100, 0, 100).toFixed(2) + '%';
  const alos = g('alos'), rise = g('sunrise'), noon = g('chatzos'), set = g('sunset');
  const nf = g('tzeis') || g('shabbosEnds') || g('holidayEnds') || (set && set + 40 * MIN);
  if (rise == null || set == null) return null;
  const a = alos ?? rise - 70 * MIN;
  const stops = (v) => [
    `var(--zv-${v}-night) 0%`, `var(--zv-${v}-night) ${p(a - 20 * MIN)}`,
    `var(--zv-${v}-dawn) ${p((a + rise) / 2)}`, `var(--zv-${v}-rise) ${p(rise)}`,
    `var(--zv-${v}-day) ${p(rise + (noon - rise) * 0.45)}`, `var(--zv-${v}-day) ${p(set - (set - noon) * 0.3)}`,
    `var(--zv-${v}-dusk) ${p(set)}`, `var(--zv-${v}-eve) ${p(nf)}`, `var(--zv-${v}-night) ${p(nf + 50 * MIN)}`, `var(--zv-${v}-night) 100%`,
  ].join(',');
  return { sky: `linear-gradient(180deg,${stops('sky')})`, line: `linear-gradient(180deg,${stops('ln')})` };
}

function renderDay() {
  const day = curDay();
  if (!day || !day.items.length) { S.tl.innerHTML = ''; S.tl.style.height = '0px'; return; }
  const G = dayGeometry(day);
  S.dayG = G; S.dayRef = day;
  const tz = S.loc.tz;
  const st = skyStops(day, G);
  const nowT = S.now();
  let h = `<div class="zv-tl-sky" style="${st ? `background:${st.sky}` : ''}"></div>`;
  h += `<div class="zv-tl-line" style="${st ? `background:${st.line}` : ''}"><i style="${st ? `background:${st.line}` : ''}"></i></div>`;
  // hour ticks
  const p0 = partsIn(G.t0, tz);
  let hr = G.t0 + ((60 - p0.M) * 60 - p0.S) * 1000;
  let ticks = '';
  for (; hr < G.tEnd; hr += 3600000) ticks += `<i style="top:${G.yOf(hr).toFixed(1)}px"></i>`;
  h += `<div class="zv-tl-ticks">${ticks}</div>`;
  day.items.forEach((it, i) => {
    const t = hm(it.at, tz, S.h24);
    const isNext = it === G.next;
    const cls = ['zv-row', it.accent ? 'zv-accent' : '', isNext ? 'zv-next' : '', it.at <= nowT ? 'zv-past' : '', it.key === 'chatzosLayla' ? 'zv-nightrow' : ''].filter(Boolean).join(' ');
    const lab = it.after ? `${esc(it.label)} <em>not before</em>` : esc(it.label);
    h += `<button type="button" class="${cls}" data-i="${i}" data-key="${esc(it.key)}" style="top:${(G.ys[i] - (isNext ? ROW_NEXT : ROW) / 2).toFixed(1)}px;height:${isNext ? ROW_NEXT : ROW}px" aria-label="${esc(it.label)}${it.after ? ', not before' : ''}, ${esc(hmText(it.at, tz, S.h24))}">
      <span class="zv-t">${it.after ? '<u>≥</u>' : ''}<b>${t.t}</b><small>${t.ap}</small></span>
      <span class="zv-dot"></span>
      <span class="zv-lab"><b>${lab}</b>${it.sub ? `<small>${esc(it.sub)}${it.custom ? ' · your custom' : ''}</small>` : ''}${isNext ? '<span class="zv-cd" aria-live="off"></span>' : ''}</span>
    </button>`;
  });
  h += `<div class="zv-nowline" hidden></div><div class="zv-now" hidden><span class="zv-now-t"></span><span class="zv-now-sun"></span><span class="zv-now-l">Now</span></div>`;
  S.tl.innerHTML = h;
  S.tl.style.height = G.height.toFixed(0) + 'px';
  updateDay(true);
  if (S.flashKey) {
    const key = S.flashKey; S.flashKey = null;
    const r = S.tl.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (r) {
      r.classList.add('zv-flash');
      setTimeout(() => r.classList.remove('zv-flash'), 1600);
      requestAnimationFrame(() => scrollDayTo(parseFloat(r.style.top) + ROW / 2, 0.42));
    }
  }
}
function scrollDayTo(y, frac) {
  const sc = S.dayScroll;
  S.autoScrolling = true;
  sc.scrollTo({ top: Math.max(0, y - sc.clientHeight * frac), behavior: S.reduce || !S.scrolledOnce ? 'auto' : 'smooth' });
  S.scrolledOnce = true;
  clearTimeout(S.asT);
  S.asT = setTimeout(() => { if (S) S.autoScrolling = false; }, 700);
}
function scrollDay() {
  if (!S.dayG) return;
  const t = S.now();
  if (selDate() === S.today && t >= S.dayG.t0 - 6 * 3600000 && t <= S.dayG.tEnd) scrollDayTo(S.dayG.yOf(t), 0.36);
  else scrollDayTo(0, 0);
}
function updateDay(fresh) {
  const day = S.dayRef, G = S.dayG;
  if (!day || !G) return;
  const t = S.now();
  // the next zman changed: re-layout (its row is taller)
  const nx = nextItem(day.items, t);
  if (!fresh && nx !== G.next) { renderDay(); return; }
  const rows = S.tl.querySelectorAll('.zv-row');
  day.items.forEach((it, i) => { const r = rows[i]; if (r) r.classList.toggle('zv-past', it.at <= t); });
  const cd = S.tl.querySelector('.zv-next .zv-cd');
  if (cd && nx) cd.textContent = `in ${countdown(nx.at - t)}`;
  const nowEl = S.tl.querySelector('.zv-now'), lineEl = S.tl.querySelector('.zv-nowline');
  const inDay = t >= G.t0 && t <= G.tEnd;
  if (nowEl) {
    nowEl.hidden = lineEl.hidden = !inDay;
    if (inDay) {
      const y = G.yOf(t);
      nowEl.style.transform = lineEl.style.transform = `translate3d(0,${y.toFixed(1)}px,0)`;
      const p = partsIn(t, S.loc.tz);
      const x = hm(t, S.loc.tz, S.h24);
      const pill = nowEl.querySelector('.zv-now-t');
      pill.textContent = `${x.t}:${String(p.S).padStart(2, '0')}`;
      let near = 1e9;
      for (const ry of G.ys) if (Math.abs(ry - y) < Math.abs(near)) near = ry - y;
      const shift = Math.abs(near) < 24 ? (near >= 0 ? near - 24 : near + 24) : 0;
      pill.style.transform = shift ? `translateY(${shift.toFixed(1)}px)` : '';
      const ph = phaseAt(day, t);
      nowEl.dataset.ph = ph;
    }
  }
  // keep following "now" unless the user scrolled in the last 40 s
  if (inDay && selDate() === S.today && S.look === 'day' && performance.now() - S.userScrolledAt > 40000) {
    const y = G.yOf(t), sc = S.dayScroll;
    if (y < sc.scrollTop + sc.clientHeight * 0.15 || y > sc.scrollTop + sc.clientHeight * 0.8) scrollDayTo(y, 0.36);
  }
}

/* =====================================================================
   look 2: sun arc
   ===================================================================== */
let measureCtx = null;
function textW(s, font) {
  try {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = font;
    return measureCtx.measureText(s).width;
  } catch (e) { return s.length * 7; }
}
function arcModel(day) {
  const g = (key) => { const i = day.items.find((x) => x.key === key); return i ? i.at : null; };
  const r = g('sunrise'), s = g('sunset');
  if (r == null || s == null) return null;
  const c = g('chatzos') ?? (r + s) / 2;
  const cl = g('chatzosLayla') ?? c + DAY / 2;
  const pcl = cl - DAY;
  const ang = (t) => {
    if (t >= r && t <= c) return 180 - 90 * (t - r) / (c - r);
    if (t > c && t <= s) return 90 - 90 * (t - c) / (s - c);
    if (t > s && t <= cl) return -90 * (t - s) / (cl - s);
    if (t > cl) return -90 - 90 * Math.min(1, (t - cl) / (r + DAY - cl));
    if (t < r && t >= pcl) return 180 + 90 * (r - t) / (r - pcl);
    return 270;
  };
  return { r, s, c, cl, ang };
}
function renderSun() {
  const day = curDay();
  const svg = S.svg;
  const box = svg.parentNode;
  const W = Math.max(200, Math.round(box.clientWidth)), H = Math.max(140, Math.round(box.clientHeight));
  const tall = H > W * 0.95;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  if (!day) { svg.innerHTML = ''; S.info.innerHTML = ''; return; }
  const M = arcModel(day);
  if (!M) { svg.innerHTML = ''; S.info.innerHTML = '<p class="zv-info-none">The sun does not rise and set here today.</p>'; return; }
  const narrow = W < 520;
  const below = tall ? 0.5 : 0.36;          // how much of the lower circle shows (fraction of R)
  const R = Math.max(60, Math.min(W / 2 - (narrow ? 16 : 70), (H - 30) / (1 + below + 0.06)));
  const small = narrow || R < 210;
  const cx = W / 2;
  const used = R * (1 + below) + 40;
  const hy = Math.round(Math.max(18 + R + 6, (H - used) / 2 + R + 20));
  const P = (a, rr = R) => [cx + rr * Math.cos(a * Math.PI / 180), hy - rr * Math.sin(a * Math.PI / 180)];
  const minA = -Math.asin(Math.min(0.99, (H - hy - 6) / R)) * 180 / Math.PI;
  const lowA = Math.max(minA, -below * 90);
  S.sunG = { W, H, R, cx, hy, P, M, day, lowA };
  const fmtA = (a, rr = R) => P(a, rr).map((v) => v.toFixed(1)).join(',');
  const arcPath = (a0, a1, rr = R) => {
    // sweep from a0 to a1 (degrees, decreasing = clockwise on screen)
    const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    const sweep = a1 < a0 ? 1 : 0;
    return `M${fmtA(a0, rr)} A${rr},${rr} 0 ${large} ${sweep} ${fmtA(a1, rr)}`;
  };
  let b = `<defs>
    <linearGradient id="zvArcG" x1="0" x2="1"><stop offset="0" style="stop-color:var(--a1)"/><stop offset=".55" style="stop-color:var(--a3)"/><stop offset="1" style="stop-color:var(--a2)"/></linearGradient>
    <radialGradient id="zvHalo"><stop offset="0" stop-color="#fff7d6" stop-opacity=".95"/><stop offset=".3" style="stop-color:var(--a3)" stop-opacity=".5"/><stop offset="1" style="stop-color:var(--a3)" stop-opacity="0"/></radialGradient>
    <linearGradient id="zvGround" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05050a" stop-opacity="0"/><stop offset="1" stop-color="#05050a" stop-opacity=".85"/></linearGradient>
    <linearGradient id="zvHz" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <mask id="zvMoonM"><circle r="${narrow ? 8 : 10}" fill="#fff"/><circle cx="${narrow ? 4.5 : 5.6}" cy="${narrow ? -3 : -3.6}" r="${narrow ? 7 : 8.6}" fill="#000"/></mask>
    <filter id="zvGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
  </defs>`;
  b += `<rect class="zv-ground" x="0" y="${hy}" width="${W}" height="${H - hy}" fill="url(#zvGround)"/>`;
  b += `<path class="zv-arc-night" d="${arcPath(180 - lowA, 180)}"/><path class="zv-arc-night" d="${arcPath(0, lowA)}"/>`;
  b += `<path class="zv-arc-track" d="${arcPath(180, 0)}"/>`;
  b += `<path class="zv-arc-done" stroke="url(#zvArcG)" d=""/>`;
  b += `<path class="zv-arc-glow" stroke="url(#zvArcG)" filter="url(#zvGlow)" d=""/>`;
  b += `<line class="zv-hz" x1="0" y1="${hy}" x2="${W}" y2="${hy}" stroke="url(#zvHz)"/>`;
  // ticks + labels
  const lab = [];
  const placed = [];
  const tz = S.loc.tz;
  const nowT = S.now();
  const nx = nextItem(day.items, nowT);
  const fontN = `600 ${small ? 11.5 : 13}px Inter, system-ui, sans-serif`;
  const fontT = `500 ${small ? 10.5 : 11.5}px "JetBrains Mono", monospace`;
  const ticks = [];
  day.items.forEach((it, i) => {
    const a = M.ang(it.at);
    if (a < lowA - 0.5 || a > 180 - lowA + 0.5) return;  // too deep below the horizon to show
    ticks.push({ it, i, a });
  });
  // place the most important labels first
  const rank = (x) => (x.it === nx ? 0 : x.it.accent ? 1 : ['sunrise', 'sunset', 'chatzos'].includes(x.it.key) ? 2 : 3);
  const order = [...ticks].sort((p, q) => rank(p) - rank(q) || p.it.at - q.it.at);
  const overlap = (r) => placed.reduce((s, p) => {
    const ox = Math.max(0, Math.min(r.x + r.w, p.x + p.w) - Math.max(r.x, p.x));
    const oy = Math.max(0, Math.min(r.y + r.h, p.y + p.h) - Math.max(r.y, p.y));
    return s + ox * oy;
  }, 0);
  const lineH = small ? 13 : 15;
  for (const tk of order) {
    const name = small ? (SHORT[tk.it.key] || tk.it.label) : tk.it.label;
    const t = hm(tk.it.at, tz, S.h24);
    const time = `${tk.it.after ? '≥' : ''}${t.t}${t.ap ? ' ' + t.ap : ''}`;
    const w = Math.max(textW(name, fontN), textW(time, fontT)) + 12;
    const h = lineH * 2;
    const cos = Math.cos(tk.a * Math.PI / 180), sin = Math.sin(tk.a * Math.PI / 180);
    let best = null;
    const nearHz = tk.a < 22 || tk.a > 158;
    const cands = nearHz ? ['h14', 'h40', -16, 18, -36, 38, -58] : [-16, 18, -36, 38, -58, 60, -80];
    for (const off of cands) {
      let x, y, inward;
      if (typeof off === 'string') {
        // same height as the tick, text running toward the middle
        const dx = +off.slice(1), [px, py] = P(tk.a);
        inward = true;
        x = cos > 0 ? px - dx - w : px + dx;
        y = py - h / 2;
      } else {
        const rr = R + off;
        const [px, py] = P(tk.a, rr);
        inward = off < 0;
        const dirX = inward ? -cos : cos, dirY = inward ? sin : -sin; // screen direction away from tick
        const anchor = Math.abs(dirX) < 0.38 ? 'middle' : dirX > 0 ? 'start' : 'end';
        x = anchor === 'start' ? px : anchor === 'end' ? px - w : px - w / 2;
        y = Math.abs(dirY) < 0.38 ? py - h / 2 : dirY > 0 ? py : py - h;
      }
      const r = { x, y, w, h };
      let cost = overlap(r) * 4;
      if (x < 4 || x + w > W - 4 || y < 2 || y + h > H - 2) cost += 1e5 + 1000 * Math.abs(off);
      if (tk.a > 0 && tk.a < 180 && !inward && y + h > hy - 2) cost += 500;           // keep day labels above ground
      if ((tk.a < 0 || tk.a > 180) && y < hy + 2 && !(inward)) cost += 300;
      cost += (typeof off === 'string' ? +off.slice(1) - 14 : Math.abs(off)) * 2 + (inward ? 0 : 8);
      if (!best || cost < best.cost) best = { cost, r };
      if (cost < 40) break;
    }
    // never let labels pile up: a crowded tick keeps just its dot (still tappable)
    if (best.cost >= 1e5 || overlap(best.r) > 0.02 * w * h) continue;
    placed.push(best.r);
    lab.push({ ...tk, name, time, r: best.r });
  }
  ticks.forEach((tk) => {
    const [x1, y1] = P(tk.a, R - 6), [x2, y2] = P(tk.a, R + 6);
    const cls = ['zv-tick', tk.it.accent ? 'zv-accent' : '', tk.it === nx ? 'zv-next' : '', tk.it.at <= nowT ? 'zv-past' : '', (tk.a < 0 || tk.a > 180) ? 'zv-below' : ''].filter(Boolean).join(' ');
    const [hx, hyy] = P(tk.a);
    b += `<g class="${cls}" data-i="${tk.i}" role="button" tabindex="-1" aria-label="${esc(tk.it.label)} ${esc(hmText(tk.it.at, tz, S.h24))}">
      <circle class="zv-hit" cx="${hx.toFixed(1)}" cy="${hyy.toFixed(1)}" r="22"/>
      <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>
      <circle class="zv-tdot" cx="${hx.toFixed(1)}" cy="${hyy.toFixed(1)}" r="3.2"/>
    </g>`;
  });
  lab.forEach((l) => {
    const cls = ['zv-lbl', l.it.accent ? 'zv-accent' : '', l.it === nx ? 'zv-next' : '', l.it.at <= nowT ? 'zv-past' : ''].filter(Boolean).join(' ');
    const anchorX = l.r.x + l.r.w / 2;
    b += `<g class="${cls}" data-i="${l.i}"><rect class="zv-hit" x="${l.r.x.toFixed(1)}" y="${l.r.y.toFixed(1)}" width="${l.r.w.toFixed(1)}" height="${l.r.h.toFixed(1)}" rx="6"/>
      <text x="${anchorX.toFixed(1)}" y="${(l.r.y + lineH - 2).toFixed(1)}" text-anchor="middle" class="zv-lbl-n" style="font-size:${small ? 11.5 : 13}px">${esc(l.name)}</text>
      <text x="${anchorX.toFixed(1)}" y="${(l.r.y + lineH * 2 - 3).toFixed(1)}" text-anchor="middle" class="zv-lbl-t" style="font-size:${small ? 10.5 : 11.5}px">${esc(l.time)}</text></g>`;
  });
  b += `<g class="zv-body"><circle class="zv-halo" r="${narrow ? 22 : 30}" fill="url(#zvHalo)"/><circle class="zv-sun" r="${narrow ? 7 : 9}"/>
    <g class="zv-moon"><circle class="zv-moon-halo" r="${narrow ? 18 : 24}"/><circle r="${narrow ? 8 : 10}" mask="url(#zvMoonM)"/></g></g>`;
  // rise / set labels at the horizon ends
  svg.innerHTML = b;
  updateSun(true);
}
function updateSun(fresh) {
  const G = S.sunG;
  const day = curDay();
  if (!G || !day || G.day !== day) { if (day && S.look === 'sun' && !fresh) renderSun(); return; }
  const t = S.now();
  const { M, P, R, hy } = G;
  const isToday = selDate() === S.today;
  const nx = nextItem(day.items, t);
  const nxI = nx ? day.items.indexOf(nx) : null;
  if (!fresh && S.sunNext !== nxI) { S.sunNext = nxI; renderSun(); return; }
  S.sunNext = nxI;
  // body position
  const body = S.svg.querySelector('.zv-body');
  const done = S.svg.querySelector('.zv-arc-done'), glow = S.svg.querySelector('.zv-arc-glow');
  let ph = 'day';
  if (isToday) {
    ph = phaseAt(day, t);
    const day_ = t >= M.r && t <= M.s;
    let x, y;
    if (day_) {
      const a = M.ang(t);
      [x, y] = P(a);
      const [sx, sy] = P(180);
      const d = `M${sx.toFixed(1)},${sy.toFixed(1)} A${R},${R} 0 0 1 ${x.toFixed(1)},${y.toFixed(1)}`;
      done.setAttribute('d', d); glow.setAttribute('d', d);
    } else {
      // night: the moon crosses the sky from sunset to the next sunrise
      const prevSet = t < M.r ? M.s - DAY : M.s, nextRise = t < M.r ? M.r : M.r + DAY;
      const f = clamp((t - prevSet) / (nextRise - prevSet), 0, 1);
      [x, y] = P(180 - 180 * f, R);
      done.setAttribute('d', ''); glow.setAttribute('d', '');
    }
    body.style.display = '';
    body.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    if (fresh) { body.classList.add('zv-notrans'); void body.getBoundingClientRect(); body.classList.remove('zv-notrans'); }
    body.classList.toggle('zv-isnight', !day_);
  } else {
    body.style.display = 'none';
    done.setAttribute('d', ''); glow.setAttribute('d', '');
  }
  S.svg.querySelectorAll('[data-i]').forEach((g) => {
    const it = day.items[+g.dataset.i];
    g.classList.toggle('zv-past', isToday ? it.at <= t : selDate() < S.today);
    g.classList.toggle('zv-sel', S.sunSel === +g.dataset.i);
  });
  const sky = S.root.querySelector('.zv-sky');
  if (sky.dataset.ph !== ph) sky.dataset.ph = ph;
  // info panel
  if (S.sunSel != null && performance.now() - (S.sunSelAt || 0) > 45000) S.sunSel = null;
  const idx = S.sunSel != null ? S.sunSel : nxI != null ? nxI : null;
  const it = idx != null ? day.items[idx] : null;
  const tz = S.loc.tz;
  const g = (k) => day.items.find((x) => x.key === k);
  const mini = ['sunrise', 'chatzos', 'sunset'].map((k) => g(k)).filter(Boolean)
    .map((x) => `<span><small>${esc(x.label)}</small><b>${esc(hmText(x.at, tz, S.h24))}</b></span>`).join('');
  let main = '';
  if (it) {
    const tt = hm(it.at, tz, S.h24);
    const rel = isToday || Math.abs(it.at - t) < DAY ? (it.at > t ? `in ${countdown(it.at - t)}` : relWords(it.at - t)) : '';
    main = `<button type="button" class="zv-info-main${it.accent ? ' zv-accent' : ''}">
      <span class="zv-info-k">${S.sunSel != null ? 'Selected' : 'Next'}${it.sub ? ' · ' + esc(it.sub) : ''}</span>
      <span class="zv-info-n">${esc(it.label)}${it.after ? ' <em>not before</em>' : ''}</span>
      <span class="zv-info-t"><b>${tt.t}</b><small>${tt.ap}</small><i>${esc(rel)}</i></span>
    </button>`;
  } else main = '<div class="zv-info-main"><span class="zv-info-n">Day complete</span></div>';
  const key = main + mini;
  if (S.infoKey !== key) { S.infoKey = key; S.info.innerHTML = `${main}<div class="zv-info-mini">${mini}</div>`; }
}

/* =====================================================================
   look 3: week grid
   ===================================================================== */
const weekDates = () => Array.from({ length: 7 }, (_, i) => addDaysStr(S.today, i));
function renderWeek() {
  const dates = weekDates();
  const days = dates.map((d) => S.days.get(d) || null);
  const tz = S.loc.tz;
  const keys = [];
  for (const k of ORDER) if (days.some((d) => d && d.items.some((i) => i.key === k))) keys.push(k);
  days.forEach((d) => d && d.items.forEach((i) => { if (!keys.includes(i.key)) keys.push(i.key); }));
  const t = S.now();
  let nextCell = null;
  for (const d of days) { if (!d) continue; const n = nextItem(d.items, t); if (n && (!nextCell || n.at < nextCell.at)) nextCell = n; }
  let h = '<table class="zv-week"><thead><tr><th class="zv-corner" scope="col"><span>Zman</span></th>';
  dates.forEach((ds, i) => {
    const d = days[i];
    const y = parseYMD(ds);
    const cls = [i === 0 ? 'zv-today' : '', y.weekday === 6 ? 'zv-shab' : '', y.weekday === 5 ? 'zv-fri' : ''].filter(Boolean).join(' ');
    const tag = d && d.special.length ? d.special.find((s) => s.kind !== 'minor') || d.special[0] : null;
    h += `<th scope="col" class="${cls}" data-date="${ds}" tabindex="0"><span class="zv-wd">${i === 0 ? 'Today' : niceDate(ds, { weekday: 'short' })}</span><span class="zv-md">${niceDate(ds, { month: 'short', day: 'numeric' })}</span><span class="zv-hd">${d ? esc(d.hebrewDate.replace(/\s\d{4}$/, '')) : ''}</span>${tag ? `<span class="zv-wt zv-tag-${esc(tag.kind)}">${esc(tag.name)}</span>` : '<span class="zv-wt"></span>'}</th>`;
  });
  h += '</tr></thead><tbody>';
  for (const k of keys) {
    const acc = ['candleLighting', 'shabbosEnds', 'holidayEnds', 'fastBegins', 'fastEnds'].includes(k);
    const sample = days.find((d) => d && d.items.some((i) => i.key === k));
    const lab = sample ? sample.items.find((i) => i.key === k).label : LABELS[k] || k;
    h += `<tr class="${acc ? 'zv-accent' : ''}"><th scope="row"><span>${esc(lab)}</span></th>`;
    dates.forEach((ds, ci) => {
      const d = days[ci];
      const its = d ? d.items.filter((i) => i.key === k) : [];
      const y = parseYMD(ds);
      const cls = [ci === 0 ? 'zv-today' : '', y.weekday === 6 ? 'zv-shab' : '', y.weekday === 5 ? 'zv-fri' : ''];
      if (!its.length) { h += `<td class="${cls.join(' ')} zv-empty">${d ? '' : '<i>…</i>'}</td>`; return; }
      const it = its[0];
      const tt = hm(it.at, tz, S.h24);
      if (it.at <= t) cls.push('zv-past');
      if (it === nextCell) cls.push('zv-nextc');
      if (it.custom) cls.push('zv-custom');
      h += `<td class="${cls.filter(Boolean).join(' ')}"><button type="button" data-date="${ds}" data-key="${esc(k)}" aria-label="${esc(it.label)}${it.after ? ' not before' : ''} ${esc(niceDate(ds, { weekday: 'long', month: 'short', day: 'numeric' }))} ${esc(hmText(it.at, tz, S.h24))}">${it.after ? '<u>≥</u>' : ''}${tt.t}<small>${tt.ap}</small></button></td>`;
    });
    h += '</tr>';
  }
  h += '</tbody></table>';
  if (!days.some(Boolean)) h = '<p class="zv-week-wait">Loading the week…</p>';
  const sc = S.weekScroll, left = sc.scrollLeft, top = sc.scrollTop;
  sc.innerHTML = h;
  sc.scrollLeft = left; sc.scrollTop = top;
  S.weekKey = Math.floor(t / MIN);
}

/* =====================================================================
   detail card + location sheet
   ===================================================================== */
function openCard(day, i) {
  const it = day && day.items[i];
  if (!it) return;
  S.card = { day, i };
  const el = $('.zv-card');
  const tz = S.loc.tz;
  const tt = hm(it.at, tz, S.h24);
  el.innerHTML = `<button type="button" class="zv-x" aria-label="Close">${ICON_X}</button>
    <div class="zv-card-k">${esc(it.sub || '')}${it.custom ? ' · your custom' : ''}</div>
    <h3 class="zv-card-h${it.accent ? ' zv-accent' : ''}">${esc(it.label)}</h3>
    <div class="zv-card-t">${it.after ? '<em>not before</em> ' : ''}<b>${tt.t}</b><small>${tt.ap}</small><span class="zv-card-cd"></span></div>
    <p>${esc(definition(it, day))}</p>
    <div class="zv-card-f">${esc(niceDate(day.date, { weekday: 'long', month: 'short', day: 'numeric' }))} · ${day.source === 'chabad' ? 'Chabad.org' : 'calculated'}</div>`;
  el.hidden = false;
  $('.zv-scrim').hidden = false;
  requestAnimationFrame(() => { if (S) { el.classList.add('zv-open'); $('.zv-scrim').classList.add('zv-open'); } });
  updateCard();
  try { el.querySelector('.zv-x').focus({ preventScroll: true }); } catch (e) {}
}
function updateCard() {
  if (!S.card) return;
  const it = S.card.day.items[S.card.i];
  const el = $('.zv-card .zv-card-cd');
  if (!el || !it) return;
  const d = it.at - S.now();
  el.textContent = Math.abs(d) < DAY ? (d > 0 ? `in ${countdown(d)}` : relWords(d)) : '';
}
function openSheet() {
  const sh = $('.zv-sheet');
  sh.hidden = false;
  $('.zv-scrim').hidden = false;
  $('.zv-q').value = '';
  $('.zv-zip input').value = S.loc.zip || '';
  renderList();
  requestAnimationFrame(() => { if (S) { sh.classList.add('zv-open'); $('.zv-scrim').classList.add('zv-open'); } });
  // don't pop the keyboard on phones; desktop gets the search focused
  if (matchMedia('(pointer: fine)').matches) setTimeout(() => { try { $('.zv-q').focus({ preventScroll: true }); } catch (e) {} }, 60);
}
function renderList() {
  const q = norm($('.zv-q').value).trim();
  const words = q.split(/\s+/).filter(Boolean);
  let list = CITIES;
  if (words.length) list = CITIES.filter((c) => { const hay = norm(`${c.name} ${c.country} ${c.region} ${c.alt || ''}`); return words.every((w) => hay.includes(w)); });
  const cur = S.loc.id;
  $('.zv-list').innerHTML = list.slice(0, 80).map((c) => `<button type="button" role="option" data-city="${esc(c.id)}" aria-selected="${c.id === cur}"><b>${esc(c.name)}</b><small>${esc(c.country)}</small>${c.zip || c.chabadCityId ? '<i title="Chabad.org zmanim">Chabad.org</i>' : '<i class="zv-calc">calc</i>'}</button>`).join('')
    || '<p class="zv-none">No city found — try a US ZIP code.</p>';
}
function closeOverlays() {
  if (!S) return;
  const card = $('.zv-card'), sheet = $('.zv-sheet'), scrim = $('.zv-scrim');
  const wasOpen = !card.hidden || !sheet.hidden;
  [card, sheet, scrim].forEach((x) => x.classList.remove('zv-open'));
  S.card = null;
  clearTimeout(S.closeT);
  S.closeT = setTimeout(() => { if (!S) return; [card, sheet, scrim].forEach((x) => { if (!x.classList.contains('zv-open')) x.hidden = true; }); }, S.reduce ? 160 : 380);
  if (wasOpen && document.activeElement && S.root.contains(document.activeElement)) { try { document.activeElement.blur(); } catch (e) {} }
}

/* =====================================================================
   ticking
   ===================================================================== */
function startTick() {
  stopTick();
  const loop = () => {
    if (!S || !S.active) return;
    tick();
    const ms = 1000 - (S.now() % 1000);
    S.tickT = setTimeout(loop, ms + 5);
  };
  loop();
}
function stopTick() { if (S) clearTimeout(S.tickT); }
function tick() {
  if (!S || document.visibilityState === 'hidden') return;
  const t = S.now();
  const today = todayIn(t, S.loc.tz);
  if (today !== S.today) { S.today = today; if (S.sel && S.sel === today) S.sel = null; load(); return; }
  if (S.look === 'day') updateDay(false);
  else if (S.look === 'sun') updateSun(false);
  else if (S.look === 'week' && Math.floor(t / MIN) !== S.weekKey && S.days.size) renderWeek();
  updateCard();
}
