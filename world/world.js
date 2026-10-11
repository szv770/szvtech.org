// world.js — world clock + meeting planner, as an embeddable module.
//
//   import { mount, unmount, setActive } from this module (/world/world.js)
//   mount(el, { compact, now, onPickCity, urlSync, storageKey })
//
//   compact     hide the big title / key hints (for embedding inside /time)
//   now         () => epoch ms; a host with server-synced time passes its own.
//               Without it the module syncs against /api/now itself.
//   onPickCity  (entry) => void; tapping a clock card calls this instead of
//               navigating to /time/?city=… (entry: { id, name, country, tz, lat?, lon?, city? })
//   urlSync     keep ?c=…&t=… in the address bar (default: true when not compact)
//   storageKey  localStorage key (default 'szv-world')
//
// setActive(false) pauses ticking and drops the keyboard shortcuts; setActive(true) resumes.
// Styles: /world/world.css (all under .wld, no global rules).

import { CITIES, REGIONS, cityById } from '/time/cities.js?v=8a8909ac4d';
import { sunTimes, sunPosition } from '/time/zmanim.js?v=93be04f7f2';
import * as T from '/world/tz.js?v=b1baec96a8';

const MIN = 60000, HOUR = 3600000;
const DEFAULTS = ['new-york', 'jerusalem', 'london', 'los-angeles'];
const deviceTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } })();
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const p2 = (n) => String(n).padStart(2, '0');
const ZONES = (() => { try { return Intl.supportedValuesOf('timeZone'); } catch (e) { return []; } })();

/* The city the device zone is "in": a default with that zone, a city named after it, or any city in it. */
const hereCity = (() => {
  for (const id of DEFAULTS) { const c = cityById(id); if (c && c.tz === deviceTz) return c; }
  return CITIES.find((c) => c.tz === deviceTz && c.name === T.tzName(deviceTz)) || CITIES.find((c) => c.tz === deviceTz) || null;
})();
const defaultIds = () => ['here', ...DEFAULTS.filter((id) => { const c = cityById(id); return c && c.tz !== deviceTz; })];

function resolve(id) {
  if (id === 'here') {
    return { id, here: true, name: hereCity ? hereCity.name : T.tzName(deviceTz), country: hereCity ? hereCity.country : deviceTz, tz: deviceTz,
      lat: hereCity?.lat, lon: hereCity?.lon, city: hereCity };
  }
  if (id.startsWith('tz:')) {
    const tz = id.slice(3);
    if (!T.validTz(tz)) return null;
    return { id, name: T.tzName(tz), country: tz, tz };
  }
  const c = cityById(id);
  return c ? { id, name: c.name, country: c.country, region: c.region, alt: c.alt, tz: c.tz, lat: c.lat, lon: c.lon, city: c } : null;
}
/* Share links name concrete places: "here" means the sender's zone. */
const concreteId = (id) => (id === 'here' ? (hereCity ? hereCity.id : 'tz:' + deviceTz) : id);

const ICON = {
  up: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 9l4-4 4 4"/></svg>',
  down: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 5l4 4 4-4"/></svg>',
  x: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8"/></svg>',
  plus: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2v10M2 7h10"/></svg>',
  check: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7.5l2.6 2.6L11 4.5"/></svg>',
  sun: '<svg class="wld-sky" viewBox="0 0 16 16" aria-hidden="true"><circle class="sun" cx="8" cy="8" r="3.4"/><path class="ray" d="M8 .9v1.6M8 13.5v1.6M.9 8h1.6M13.5 8h1.6M3 3l1.1 1.1M11.9 11.9L13 13M3 13l1.1-1.1M11.9 4.1L13 3"/></svg>',
  moon: '<svg class="wld-sky" viewBox="0 0 16 16" aria-hidden="true"><path class="moon" d="M10.8 1.6A6.6 6.6 0 1 0 14.4 11 5.4 5.4 0 0 1 10.8 1.6z"/></svg>',
};

const TEMPLATE = `
<div class="wld-cq">
  <header class="wld-top">
    <div class="wld-titlerow">
      <div class="wld-brand">
        <h1 class="wld-h1">World</h1>
        <div class="wld-subline"><span>clock &amp; planner</span><button class="wld-sync" type="button" data-r="sync" title="Time is synced with the server clock. Tap to re-sync."><i aria-hidden="true"></i><span data-r="syncText">syncing…</span></button></div>
      </div>
      <div class="wld-tools">
        <button class="wld-chip" type="button" data-r="fmt" aria-pressed="false" title="12 / 24 hour (h)">24h</button>
        <button class="wld-chip add" type="button" data-r="add" aria-haspopup="dialog" title="Add a city (/)">${ICON.plus}<span>Add</span></button>
      </div>
    </div>
  </header>
  <nav class="wld-tabs" role="tablist" aria-label="View">
    <button type="button" role="tab" data-view="clocks" aria-selected="true">Clocks</button>
    <button type="button" role="tab" data-view="planner" aria-selected="false">Planner</button>
    <i class="wld-ink" aria-hidden="true"></i>
  </nav>
  <div class="wld-views">
    <section class="wld-view wld-clocks" role="tabpanel" aria-label="Clocks">
      <div class="wld-sec">
        <h2>Clocks</h2>
        <span class="wld-hint" data-r="dragHint">Hold &amp; drag to reorder</span>
        <button class="wld-chip ghost" type="button" data-r="edit" aria-pressed="false" title="Reorder / remove (e)">Edit</button>
      </div>
      <ol class="wld-cards" data-r="cards" aria-label="Cities"></ol>
      <div class="wld-empty" data-r="empty" hidden><p>No cities yet.</p><button class="wld-go" type="button" data-r="emptyAdd">Add a city</button></div>
    </section>
    <section class="wld-view wld-planner" role="tabpanel" aria-label="Planner">
      <div class="wld-sec">
        <h2>Planner</h2>
        <span class="wld-hint kbonly">&larr; &rarr; move &middot; [ ] day &middot; n now</span>
      </div>
      <div class="wld-pctl">
        <div class="wld-datebar">
          <button class="wld-ib" type="button" data-r="prev" aria-label="Previous day" title="Previous day ([)"><svg viewBox="0 0 10 16" aria-hidden="true"><path d="M8 2L2 8l6 6"/></svg></button>
          <label class="wld-datef"><span data-r="dateLabel"></span><input type="date" data-r="dateIn" aria-label="Date"></label>
          <button class="wld-ib" type="button" data-r="next" aria-label="Next day" title="Next day (])"><svg viewBox="0 0 10 16" aria-hidden="true"><path d="M2 2l6 6-6 6"/></svg></button>
          <button class="wld-chip wld-now" type="button" data-r="nowBtn" title="Back to now (n)">Now</button>
        </div>
        <form class="wld-conv" data-r="conv" autocomplete="off">
          <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><path d="M8 4.5V8l2.4 1.6"/></svg>
          <input type="text" data-r="convIn" placeholder="3pm London" aria-label="Convert a time, for example 3pm London" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go">
          <button type="submit" class="wld-go sm">Set</button>
        </form>
      </div>
      <p class="wld-chint" data-r="chint" aria-live="polite"></p>
      <div class="wld-pscroll" data-r="pscroll">
        <div class="wld-plan" data-r="plan" tabindex="0" role="slider" aria-label="Meeting time" aria-valuemin="0" aria-valuemax="1440" aria-valuenow="0"></div>
      </div>
      <div class="wld-legend" aria-hidden="true"><span><i class="l2"></i>9–17</span><span><i class="l1"></i>7–9 · 17–22</span><span><i class="l0"></i>night</span><span><i class="lb"></i>works for all</span></div>
      <div class="wld-ovl" data-r="ovl"></div>
      <div class="wld-share">
        <p class="wld-summ" data-r="summ"></p>
        <div class="wld-sbtns">
          <button class="wld-go" type="button" data-r="copySum">Copy summary</button>
          <button class="wld-chip" type="button" data-r="copyLink">Copy link</button>
        </div>
      </div>
    </section>
  </div>
  <div class="wld-keys kbonly"><kbd>/</kbd> add &middot; <kbd>e</kbd> edit &middot; <kbd>h</kbd> 12/24 &middot; <kbd>c</kbd> <kbd>p</kbd> view &middot; <kbd>n</kbd> now &middot; <kbd>t</kbd> theme</div>
</div>
<div class="wld-toast" data-r="toast" role="status" aria-live="polite"></div>
<div class="wld-scrim" data-r="scrim" aria-hidden="true"></div>
<section class="wld-sheet" data-r="sheet" role="dialog" aria-modal="true" aria-label="Cities">
  <div class="wld-sheet-head" data-r="sheetHead">
    <span class="wld-grab" aria-hidden="true"></span>
    <div class="wld-shrow"><h2>Cities</h2><small data-r="count"></small><button class="wld-x" type="button" data-r="sheetX" aria-label="Close">${ICON.x.replace('M3 3l8 8M11 3l-8 8', 'M2 2l10 10M12 2L2 12')}</button></div>
    <label class="wld-search"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5"/><path d="M11 11l3.5 3.5"/></svg><input type="search" data-r="q" placeholder="City, country or time zone" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" aria-label="Search cities"></label>
  </div>
  <div class="wld-sbody" data-r="sbody"><div data-r="list" role="list"></div><p class="wld-none" data-r="none" hidden>Nothing found. Try a country or a zone like “Asia/Kolkata”.</p></div>
</section>`;

let W = null; // the mounted instance

export function mount(container, opts = {}) {
  if (W) unmount();
  W = createWorld(container, opts);
  return { unmount, setActive, get state() { return W && W.debug(); } };
}
export function unmount() { if (W) { W.destroy(); W = null; } }
export function setActive(on) { if (W) W.setActive(!!on); }

function createWorld(container, opts) {
  const compact = !!opts.compact;
  const urlSync = opts.urlSync ?? !compact;
  const KEY = opts.storageKey || 'szv-world';
  const root = document.createElement('div');
  root.className = 'wld' + (compact ? ' compact' : '');
  root.dataset.view = 'clocks';
  root.innerHTML = TEMPLATE;
  const R = {};
  root.querySelectorAll('[data-r]').forEach((el) => { R[el.dataset.r] = el; });
  container.appendChild(root);

  let alive = true;
  const cleanups = [];
  const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); cleanups.push(() => el.removeEventListener(ev, fn, o)); };
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };

  /* ---------- state ---------- */
  const st = { ids: defaultIds(), h12: false, view: 'clocks', editing: false, active: true, fromShare: false };
  const P = { date: null, sel: null, ds: 0, de: 0, cols: 24, cw: 40, nameW: 116, W: 960, rows: [] };
  let entries = [];
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  if (stored && typeof stored === 'object') {
    if (Array.isArray(stored.ids)) st.ids = stored.ids.filter((id) => typeof id === 'string' && resolve(id));
    if (typeof stored.h12 === 'boolean') st.h12 = stored.h12;
    else try { st.h12 = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle?.startsWith('h1') || false; } catch (e) {}
    if (stored.view === 'planner') st.view = 'planner';
  } else {
    try { st.h12 = (new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle || '').startsWith('h1'); } catch (e) {}
  }
  if (urlSync) {
    const sh = T.parseShare(location.search);
    if (sh.cities) {
      const mine = st.ids.map(concreteId).join(',');
      if (sh.cities.join(',') !== mine) {
        const ids = sh.cities.filter((id) => resolve(id));
        if (ids.length) { st.ids = ids; st.fromShare = true; }
      }
    }
    if (sh.t != null) { P.sel = sh.t; st.view = 'planner'; }
    else if (sh.date) P.date = sh.date;
  }
  function save() {
    try {
      const prev = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
      localStorage.setItem(KEY, JSON.stringify({ ids: st.fromShare ? (prev.ids || defaultIds()) : st.ids, h12: st.h12, view: st.view }));
    } catch (e) {}
  }
  const setIds = (ids) => { st.ids = ids; st.fromShare = false; save(); rebuild(); queueUrl(); };

  /* ---------- exact time ---------- */
  const sync = { offset: 0, ok: false, err: null, busy: false, at: -1e9 };
  const now = typeof opts.now === 'function' ? () => +opts.now() : () => Date.now() + sync.offset;
  async function sample() {
    const ctl = 'AbortController' in window ? new AbortController() : null;
    const kill = setTimeout(() => ctl && ctl.abort(), 3000);
    try {
      const d0 = Date.now(), p0 = performance.now();
      const r = await fetch('/api/now?r=' + Math.random().toString(36).slice(2), { cache: 'no-store', signal: ctl && ctl.signal });
      const p1 = performance.now();
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || !Number.isFinite(j.t)) return null;
      const rtt = p1 - p0;
      return rtt > 1500 ? null : { rtt, offset: j.t + 0.5 - (d0 + rtt / 2) };
    } catch (e) { return null; } finally { clearTimeout(kill); }
  }
  async function doSync() {
    if (opts.now || sync.busy || !alive) return;
    sync.busy = true; syncUi();
    const got = [];
    for (let i = 0; i < 5 && alive; i++) { const s = await sample(); if (s) got.push(s); if (!s && i >= 1 && !got.length) break; }
    sync.busy = false;
    if (!alive) return;
    if (got.length) {
      got.sort((a, b) => a.rtt - b.rtt);
      const best = got.slice(0, 3).map((s) => s.offset).sort((a, b) => a - b);
      sync.offset = best[Math.floor((best.length - 1) / 2)];
      sync.err = got[0].rtt / 2 + 1; sync.ok = true; sync.at = performance.now();
      restartTick();
    }
    syncUi();
  }
  function syncUi() {
    const el = R.sync;
    if (opts.now) { el.hidden = true; return; }
    el.classList.toggle('ok', sync.ok);
    el.classList.toggle('bad', !sync.ok && !sync.busy);
    let txt;
    if (sync.busy && !sync.ok) txt = 'syncing…';
    else if (!sync.ok) txt = 'device clock';
    else {
      const off = Math.abs(sync.offset);
      txt = `synced ±${sync.err < 1000 ? Math.round(sync.err) + 'ms' : (sync.err / 1000).toFixed(1) + 's'}`;
      if (off >= 500) txt += ` · device ${(off / 1000).toFixed(1)}s ${sync.offset > 0 ? 'slow' : 'fast'}`;
    }
    R.syncText.textContent = txt;
  }
  on(R.sync, 'click', () => doSync());

  /* ---------- formatting helpers ---------- */
  const hm = (p) => T.fmtHM(p.hh, p.mm, st.h12);
  const ymdP = (p) => ({ y: p.y, m: p.m, d: p.d });

  /* ---------- toast + clipboard ---------- */
  let toastT = 0;
  function toast(msg) {
    R.toast.textContent = msg;
    R.toast.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => R.toast.classList.remove('show'), 2200);
  }
  async function copy(text, okMsg) {
    let ok = false;
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); ok = true; } } catch (e) {}
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
      } catch (e) {}
    }
    toast(ok ? okMsg : 'Copy failed — select the text instead');
  }

  /* ======================================================================
     CLOCKS
     ====================================================================== */
  const sunCache = new Map();
  function sunFor(e, ymd) {
    if (e.lat == null || e.lon == null) return null;
    const k = e.id + '|' + T.ymdKey(ymd);
    let s = sunCache.get(k);
    if (!s) {
      try {
        const loc = { lat: e.lat, lon: e.lon, tz: e.tz };
        const r = sunTimes(ymd, loc);
        s = { rise: r.sunrise ? +r.sunrise : null, set: r.sunset ? +r.sunset : null };
        if (s.rise == null || s.set == null) s.polar = sunPosition(r.solarNoon || new Date(), loc).altitude > 0 ? 'day' : 'night';
      } catch (err) { s = { rise: null, set: null, polar: null }; }
      if (sunCache.size > 400) sunCache.clear();
      sunCache.set(k, s);
    }
    return s;
  }
  const fracOf = (ms, tz) => { const p = T.zonedParts(ms, tz); return (p.hh * 60 + p.mm) / 1440; };

  function cardHtml(e, i, n) {
    const href = opts.onPickCity ? '#' : e.city ? `/time/?city=${encodeURIComponent(e.city.id)}` : e.here ? '/time/' : '';
    const tag = href ? 'a' : 'div';
    const attrs = href ? `href="${esc(href)}" draggable="false"` : opts.onPickCity ? '' : 'tabindex="0"';
    const label = `${e.name}${e.here ? ' (here)' : ''}`;
    return `<li class="wld-card${e.here ? ' here' : ''}" data-id="${esc(e.id)}">
  <${tag} class="wld-lnk" ${attrs} aria-label="${esc(label)}">
    <span class="wld-name"><b>${esc(e.name)}</b>${e.here ? '<span class="wld-tag">Here</span>' : ''}<span class="sk"></span></span>
    <span class="wld-meta"><span class="ct">${esc(e.country || '')}</span><span class="wld-off"></span><span class="ut"></span><span class="wld-date"></span></span>
    <span class="wld-time"><span class="hm"></span><span class="ss"></span><span class="ap"></span></span>
    <span class="wld-strip"><span class="r0"></span><span class="wld-bar"><i class="day"></i><i class="tk" style="left:25%"></i><i class="tk" style="left:50%"></i><i class="tk" style="left:75%"></i><i class="nw"></i></span><span class="r1"></span></span>
  </${tag}>
  <span class="wld-ed">
    <button type="button" data-act="up" aria-label="Move ${esc(e.name)} up"${i === 0 ? ' disabled' : ''}>${ICON.up}</button>
    <button type="button" data-act="down" aria-label="Move ${esc(e.name)} down"${i === n - 1 ? ' disabled' : ''}>${ICON.down}</button>
    <button type="button" class="rm" data-act="rm" aria-label="Remove ${esc(e.name)}">${ICON.x}</button>
  </span>
</li>`;
  }

  let cardRefs = [];
  function renderCards() {
    R.cards.innerHTML = entries.map((e, i) => cardHtml(e, i, entries.length)).join('');
    cardRefs = [...R.cards.children].map((li, i) => ({
      li, e: entries[i],
      hm: li.querySelector('.hm'), ss: li.querySelector('.ss'), ap: li.querySelector('.ap'),
      off: li.querySelector('.wld-off'), ut: li.querySelector('.ut'), date: li.querySelector('.wld-date'),
      sk: li.querySelector('.sk'), day: li.querySelector('.day'), nw: li.querySelector('.nw'),
      r0: li.querySelector('.r0'), r1: li.querySelector('.r1'), last: {},
    }));
    R.empty.hidden = entries.length > 0;
    R.dragHint.style.visibility = entries.length > 1 ? '' : 'hidden';
    updateCards(true);
  }

  function updateCards(force) {
    const t = now();
    const hereP = T.zonedParts(t, deviceTz);
    const hereOff = T.offsetMin(t, deviceTz);
    for (const c of cardRefs) {
      const e = c.e, p = T.zonedParts(t, e.tz), L = c.last;
      const hmTxt = st.h12 ? `${p.hh % 12 || 12}:${p2(p.mm)}` : `${p2(p.hh)}:${p2(p.mm)}`;
      if (L.hm !== hmTxt || force) {
        c.hm.textContent = hmTxt;
        c.ap.textContent = st.h12 ? (p.hh < 12 ? 'AM' : 'PM') : '';
        L.hm = hmTxt;
        // per-minute work
        const off = T.offsetMin(t, e.tz) - hereOff;
        c.off.textContent = e.here ? '' : T.fmtDiff(off);
        c.off.className = 'wld-off' + (off === 0 ? ' same' : '');
        c.ut.textContent = T.fmtUtc(t, e.tz);
        const dd = T.dayDiff(ymdP(hereP), ymdP(p));
        c.date.textContent = dd ? `${T.fmtDay(p)} · ${dd > 0 ? '+' : '\u2212'}${Math.abs(dd)}d` : '';
        c.date.title = dd === 1 ? 'Tomorrow' : dd === -1 ? 'Yesterday' : '';
        const ymd = ymdP(p), sun = sunFor(e, ymd), dk = T.ymdKey(ymd) + st.h12;
        let isDay;
        if (sun && sun.rise != null && sun.set != null) isDay = t >= sun.rise && t < sun.set;
        else if (sun && sun.polar) isDay = sun.polar === 'day';
        else isDay = p.hh >= 6 && p.hh < 18;
        if (L.isDay !== isDay || force) {
          c.sk.innerHTML = isDay ? ICON.sun : ICON.moon;
          c.li.classList.toggle('night', !isDay);
          c.sk.title = isDay ? 'Daytime' : 'Night';
          L.isDay = isDay;
        }
        if (L.dk !== dk || force) {
          L.dk = dk;
          const fmt = (ms) => { const q = T.zonedParts(ms, e.tz); return st.h12 ? `${q.hh % 12 || 12}:${p2(q.mm)}${q.hh < 12 ? 'a' : 'p'}` : `${p2(q.hh)}:${p2(q.mm)}`; };
          if (sun && sun.rise != null && sun.set != null) {
            const a = fracOf(sun.rise, e.tz), b = fracOf(sun.set, e.tz);
            c.day.className = 'day';
            c.day.style.left = (a * 100).toFixed(2) + '%';
            c.day.style.width = (Math.max(0, b - a) * 100).toFixed(2) + '%';
            c.r0.textContent = '↑' + fmt(sun.rise);
            c.r1.textContent = '↓' + fmt(sun.set);
            c.li.title = `Sunrise ${fmt(sun.rise)} · sunset ${fmt(sun.set)}`;
          } else if (sun && sun.polar) {
            c.day.className = 'day';
            c.day.style.left = '0%'; c.day.style.width = sun.polar === 'day' ? '100%' : '0%';
            c.r0.textContent = ''; c.r1.textContent = sun.polar === 'day' ? 'midnight sun' : 'polar night';
          } else {
            c.day.className = 'day approx';
            c.day.style.left = '25%'; c.day.style.width = '50%';
            c.r0.textContent = ''; c.r1.textContent = '';
          }
        }
        c.nw.style.left = (((p.hh * 60 + p.mm) / 1440) * 100).toFixed(2) + '%';
      }
      c.ss.textContent = ':' + p2(p.ss);
    }
  }

  /* ---------- card clicks / edit buttons ---------- */
  let suppressClick = false;
  on(R.cards, 'click', (ev) => {
    const btn = ev.target.closest('[data-act]');
    const li = ev.target.closest('.wld-card');
    if (!li) return;
    const i = st.ids.indexOf(li.dataset.id);
    if (btn) {
      ev.preventDefault();
      const act = btn.dataset.act;
      if (act === 'rm') {
        const e = entries[i];
        setIds(st.ids.filter((x) => x !== li.dataset.id));
        toast(`Removed ${e ? e.name : 'city'}`);
        const nxt = R.cards.children[Math.min(i, R.cards.children.length - 1)];
        const f = nxt && nxt.querySelector('[data-act="rm"]');
        if (f) f.focus();
      } else move(i, act === 'up' ? i - 1 : i + 1, true);
      return;
    }
    if (suppressClick || st.editing) { ev.preventDefault(); return; }
    if (opts.onPickCity) {
      ev.preventDefault();
      const e = entries[i];
      if (e) opts.onPickCity({ ...e });
    }
  });
  on(R.cards, 'contextmenu', (ev) => { if (ev.target.closest('.wld-card') && (drag || ev.pointerType === 'touch' || matchMedia('(pointer: coarse)').matches)) ev.preventDefault(); });
  on(R.cards, 'keydown', (ev) => {
    const li = ev.target.closest('.wld-card');
    if (!li || !ev.altKey || (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown' && ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight')) return;
    ev.preventDefault();
    const i = st.ids.indexOf(li.dataset.id);
    move(i, ev.key === 'ArrowUp' || ev.key === 'ArrowLeft' ? i - 1 : i + 1, true);
  });
  function move(from, to, refocus) {
    if (to < 0 || to >= st.ids.length || from === to) return;
    const ids = st.ids.slice(), [id] = ids.splice(from, 1);
    ids.splice(to, 0, id);
    const before = rects();
    const act = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.act : null;
    setIds(ids);
    flip(before);
    if (refocus) {
      const li = R.cards.querySelector(`[data-id="${CSS.escape(id)}"]`);
      const f = li && (act ? li.querySelector(`[data-act="${act}"]:not(:disabled)`) || li.querySelector('[data-act]:not(:disabled)') : li.querySelector('.wld-lnk'));
      if (f) f.focus();
    }
  }
  function rects() { const m = new Map(); for (const li of R.cards.children) m.set(li.dataset.id, li.getBoundingClientRect()); return m; }
  function flip(before, skip) {
    if (reduced()) return;
    for (const li of R.cards.children) {
      if (li === skip) continue;
      const a = before.get(li.dataset.id); if (!a) continue;
      const b = li.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (!dx && !dy) continue;
      li.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.9,.2,1)' });
    }
  }

  /* ---------- drag to reorder (mouse: drag; touch: long-press then drag) ---------- */
  let drag = null;
  on(R.cards, 'pointerdown', (ev) => {
    const li = ev.target.closest('.wld-card');
    if (!li || ev.target.closest('.wld-ed') || (ev.pointerType === 'mouse' && ev.button !== 0) || entries.length < 2) return;
    drag = { li, id: li.dataset.id, pid: ev.pointerId, type: ev.pointerType, x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY, on: false, timer: 0 };
    if (ev.pointerType !== 'mouse') {
      li.classList.add('press');
      drag.timer = setTimeout(() => { if (drag && !drag.on) startDrag(); }, 380);
    }
  });
  on(window, 'pointermove', (ev) => {
    if (!drag || ev.pointerId !== drag.pid) return;
    drag.x = ev.clientX; drag.y = ev.clientY;
    const d = Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0);
    if (!drag.on) {
      if (drag.type === 'mouse' ? d > 6 : d > 9) {
        if (drag.type === 'mouse') startDrag();
        else cancelPress();
      }
      return;
    }
    ev.preventDefault();
    dragMove();
  }, { passive: false });
  const endPointer = (ev) => {
    if (!drag || ev.pointerId !== drag.pid) return;
    if (drag.on) endDrag(ev.type === 'pointercancel');
    else cancelPress();
  };
  on(window, 'pointerup', endPointer);
  on(window, 'pointercancel', endPointer);
  on(document, 'touchmove', (ev) => { if (drag && drag.on) ev.preventDefault(); }, { passive: false });
  function cancelPress() { if (!drag) return; clearTimeout(drag.timer); drag.li.classList.remove('press'); drag = null; }
  function startDrag() {
    const d = drag, li = d.li;
    clearTimeout(d.timer);
    li.classList.remove('press');
    d.on = true;
    try { li.setPointerCapture(d.pid); } catch (e) {}
    const r = li.getBoundingClientRect();
    d.gx = d.x - r.left; d.gy = d.y - r.top;
    li.classList.add('lift');
    root.classList.add('dragging');
    try { const s = window.getSelection && window.getSelection(); if (s) s.removeAllRanges(); } catch (e) {}
    dragMove();
    autoScroll();
  }
  function dragMove() {
    const d = drag, li = d.li, box = R.cards.getBoundingClientRect();
    const px = d.x - box.left, py = d.y - box.top;
    // which slot is under the pointer? (offset geometry ignores running transforms)
    let target = null;
    for (const other of R.cards.children) {
      if (other === li) continue;
      if (px >= other.offsetLeft && px <= other.offsetLeft + other.offsetWidth && py >= other.offsetTop && py <= other.offsetTop + other.offsetHeight) { target = other; break; }
    }
    if (target) {
      const kids = [...R.cards.children], from = kids.indexOf(li), to = kids.indexOf(target);
      const before = rects();
      R.cards.insertBefore(li, to > from ? target.nextSibling : target);
      flip(before, li);
    }
    li.style.transform = `translate(${(d.x - box.left - d.gx - li.offsetLeft).toFixed(1)}px, ${(d.y - box.top - d.gy - li.offsetTop).toFixed(1)}px)`;
  }
  function autoScroll() {
    if (!drag || !drag.on) return;
    const edge = 70, vh = window.innerHeight;
    let dy = 0;
    if (drag.y < edge) dy = -Math.ceil((edge - drag.y) / 6);
    else if (drag.y > vh - edge) dy = Math.ceil((drag.y - (vh - edge)) / 6);
    if (dy) { window.scrollBy(0, dy); dragMove(); }
    requestAnimationFrame(autoScroll);
  }
  function endDrag(cancelled) {
    const d = drag; drag = null;
    const li = d.li;
    const cur = li.style.transform;
    li.style.transform = '';
    li.classList.remove('lift');
    root.classList.remove('dragging');
    try { li.releasePointerCapture(d.pid); } catch (e) {}
    if (!reduced() && cur) li.animate([{ transform: cur }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.2,.9,.2,1)' });
    suppressClick = true;
    later(() => { suppressClick = false; }, 60);
    const ids = [...R.cards.children].map((x) => x.dataset.id);
    if (!cancelled && ids.join() !== st.ids.join()) {
      st.ids = ids; st.fromShare = false; save();
      entries = st.ids.map(resolve).filter(Boolean);
      // keep DOM (already in order); refresh refs + arrow states, and the planner
      cardRefs.sort((a, b) => ids.indexOf(a.e.id) - ids.indexOf(b.e.id));
      [...R.cards.children].forEach((x, i) => {
        x.querySelector('[data-act="up"]').disabled = i === 0;
        x.querySelector('[data-act="down"]').disabled = i === ids.length - 1;
      });
      afterOrderChange();
      queueUrl();
    } else if (cancelled) renderCards();
  }

  /* ======================================================================
     PLANNER
     ====================================================================== */
  const ref = () => entries[0];
  const getSel = () => (P.sel != null ? P.sel : now());
  const isLive = () => P.sel == null;
  function todayRef() { return T.ymdOf(now(), ref() ? ref().tz : deviceTz); }

  function afterOrderChange() {
    // keep the same instant; the day is the new reference city's
    if (ref()) P.date = T.ymdOf(getSel(), ref().tz);
    renderPlanner();
  }

  function measure() {
    const scW = R.pscroll.clientWidth || 360;
    const nameW = P.nameW;
    const minCw = matchMedia('(pointer: coarse)').matches ? 40 : 32;
    const avail = scW - nameW - 1;
    P.cw = Math.max(minCw, Math.floor((avail / P.cols) * 100) / 100);
    P.W = P.cw * P.cols;
  }

  function renderPlanner() {
    const r = ref();
    if (!r) { R.plan.innerHTML = '<div class="wld-empty"><p>Add cities to plan a meeting.</p></div>'; R.ovl.innerHTML = ''; R.summ.textContent = ''; R.plan.style.width = ''; return; }
    if (!P.date) P.date = T.ymdOf(getSel(), r.tz);
    [P.ds, P.de] = T.dayRange(P.date, r.tz);
    P.cols = Math.round((P.de - P.ds) / HOUR);
    if (P.sel != null && (P.sel < P.ds || P.sel >= P.de)) P.sel = clamp(P.sel, P.ds, P.de - 15 * MIN);
    // name column width from CSS (container-dependent)
    R.plan.innerHTML = '<div class="wld-prow wld-rail"><div class="wld-pname"></div></div>';
    P.nameW = R.plan.firstChild.firstChild.offsetWidth || 116;
    measure();
    const cols = P.cols, cw = P.cw;
    let html = `<div class="wld-prow wld-rail"><div class="wld-pname" data-r="refDay"></div><div class="wld-track" data-part="rail" style="width:${P.W}px">`;
    for (let i = 0; i < cols; i++) {
      html += `<i class="tk" style="left:${(i * cw).toFixed(1)}px"></i>`;
      if (cw >= 36) html += `<i class="tk q" style="left:${((i + 0.5) * cw).toFixed(1)}px"></i>`;
    }
    html += '</div></div><div class="wld-rows">';
    for (const e of entries) {
      html += `<div class="wld-prow"><div class="wld-pname"><b>${e.here ? '<i title="Here"></i>' : ''}<span>${esc(e.name)}</span></b><span class="wld-pt"></span></div><div class="wld-track" data-part="row" style="width:${P.W}px">`;
      let prevD = null;
      for (let i = 0; i < cols; i++) {
        const t = P.ds + i * HOUR, p = T.zonedParts(t, e.tz);
        const cls = T.hourClass(p.hh * 60 + p.mm);
        const mid = prevD != null && p.d !== prevD;
        prevD = p.d;
        const hh = st.h12 ? String(p.hh % 12 || 12) : String(p.hh);
        const sup = (p.mm ? ':' + p2(p.mm) : '') + (st.h12 && cw >= 34 ? (p.hh < 12 ? 'a' : 'p') : '');
        html += `<span class="wld-cell c${cls}${mid ? ' mid' : ''}" style="width:${(cw - 2).toFixed(2)}px"><span>${hh}${sup ? `<sup>${sup}</sup>` : ''}</span>${mid ? `<span class="wd">${T.WEEKDAYS[p.wd]}</span>` : ''}</span>`;
      }
      html += '</div></div>';
    }
    html += '</div><i class="wld-nowl" hidden></i><div class="wld-scrub"><span class="wld-knob" data-part="knob"><span></span></span></div>';
    R.plan.innerHTML = html;
    R.plan.style.width = (P.nameW + P.W) + 'px';
    P.rows = [...R.plan.querySelectorAll('.wld-rows .wld-pt')];
    P.refDay = R.plan.querySelector('[data-r="refDay"]');
    P.scrub = R.plan.querySelector('.wld-scrub');
    P.knob = R.plan.querySelector('.wld-knob span');
    P.nowl = R.plan.querySelector('.wld-nowl');
    renderOverlap();
    updateDateUi();
    updateScrub();
  }

  const xOf = (t) => P.nameW + ((t - P.ds) / (P.de - P.ds)) * P.W;

  function renderOverlap() {
    for (const b of R.plan.querySelectorAll('.wld-band')) b.remove();
    const tzs = [...new Set(entries.map((e) => e.tz))];
    const r = ref();
    if (entries.length < 2) { R.ovl.innerHTML = '<h3>Best overlap</h3><p>Add another city to find a time that works for everyone.</p>'; return; }
    const o = T.findOverlap(P.ds, P.de, tzs);
    const railH = R.plan.querySelector('.wld-rail').offsetHeight;
    for (const g of o.ranges) {
      const b = document.createElement('i');
      b.className = 'wld-band l' + o.level;
      b.style.left = (xOf(g.start) + 1) + 'px';
      b.style.width = Math.max(4, xOf(g.end) - xOf(g.start) - 2) + 'px';
      b.style.top = (railH + 2) + 'px';
      b.style.bottom = '2px';
      R.plan.appendChild(b);
    }
    if (!o.level) {
      R.ovl.innerHTML = '<h3>Best overlap</h3><p>No hour on this day is between 7:00 and 22:00 for everyone. Try fewer cities, or pick the least-bad slot on the timeline.</p>';
      return;
    }
    const lbl = o.level === 2 ? 'Inside working hours (9–17) for everyone' : 'Reasonable for everyone (7–22) — no shared working hours';
    const short = (q) => (st.h12 ? `${q.hh % 12 || 12}${q.mm ? ':' + p2(q.mm) : ''}${q.hh < 12 ? 'a' : 'p'}` : `${p2(q.hh)}:${p2(q.mm)}`);
    const fmtR = (g, e) => { const a = T.zonedParts(g.start, e.tz), b = T.zonedParts(g.end, e.tz); return `${short(a)}–${short(b)}`; };
    let h = `<h3>${o.level === 2 ? 'Best overlap' : 'Closest overlap'} · <span style="text-transform:none;letter-spacing:.02em">${esc(lbl)}</span></h3><div class="rs l${o.level}">`;
    for (const g of o.ranges) {
      const others = entries.slice(1, 4).map((e) => `${fmtR(g, e)} ${esc(e.name)}`).join(' · ');
      h += `<button type="button" data-start="${g.start}"><b>${fmtR(g, r)}</b><small>${esc(r.name)}${others ? ' · ' + others : ''}${entries.length > 4 ? ' …' : ''}</small></button>`;
    }
    R.ovl.innerHTML = h + '</div>';
  }
  on(R.ovl, 'click', (ev) => {
    const b = ev.target.closest('[data-start]');
    if (!b) return;
    P.sel = +b.dataset.start;
    updateScrub(); ensureVisible(); queueUrl();
  });

  function updateDateUi() {
    const r = ref(); if (!r) return;
    const today = todayRef(), dd = T.dayDiff(today, P.date);
    const p = T.zonedParts(P.ds + 12 * HOUR, r.tz);
    const rel = dd === 0 ? 'Today' : dd === 1 ? 'Tomorrow' : dd === -1 ? 'Yesterday' : '';
    R.dateLabel.innerHTML = `${rel ? `<small>${rel}</small>` : ''}${esc(T.fmtDay(p))}${p.y !== today.y ? ' ' + p.y : ''}`;
    R.dateIn.value = T.ymdKey(P.date);
    if (P.refDay) {
      P.refDay.textContent = `${T.fmtDay(p)}`;
      P.refDay.title = `Columns are hours of ${r.name}'s day` + (P.cols !== 24 ? ` (${P.cols} hours: clocks change)` : '');
      if (P.cols !== 24) P.refDay.textContent += ` · ${P.cols}h`;
    }
    R.nowBtn.classList.toggle('live', isLive());
  }

  function updateScrub() {
    const r = ref(); if (!r || !P.scrub) return;
    const t = getSel();
    const inDay = t >= P.ds && t < P.de;
    const x = xOf(clamp(t, P.ds, P.de));
    P.scrub.style.left = x.toFixed(1) + 'px';
    P.scrub.hidden = !inDay;
    const refP = T.zonedParts(t, r.tz);
    P.knob.textContent = hm(refP);
    entries.forEach((e, i) => {
      const p = T.zonedParts(t, e.tz), el = P.rows[i]; if (!el) return;
      const dd = T.dayDiff(ymdP(refP), ymdP(p));
      const tm = st.h12 ? `${p.hh % 12 || 12}:${p2(p.mm)}<em>${p.hh < 12 ? 'am' : 'pm'}</em>` : `${p2(p.hh)}:${p2(p.mm)}`;
      el.innerHTML = tm + (dd ? `<small>${T.WEEKDAYS[p.wd]}</small>` : '');
    });
    const n = now();
    P.nowl.hidden = !(n >= P.ds && n < P.de) || isLive();
    if (!P.nowl.hidden) P.nowl.style.left = xOf(n).toFixed(1) + 'px';
    const sum = T.summary(t, entries, st.h12);
    R.summ.textContent = sum;
    R.plan.setAttribute('aria-valuenow', String(Math.round((t - P.ds) / MIN)));
    R.plan.setAttribute('aria-valuemax', String(Math.round((P.de - P.ds) / MIN)));
    R.plan.setAttribute('aria-valuetext', sum);
    R.nowBtn.classList.toggle('live', isLive());
  }

  function ensureVisible(smooth) {
    const sc = R.pscroll, x = xOf(getSel());
    const viewL = sc.scrollLeft + P.nameW, viewR = sc.scrollLeft + sc.clientWidth;
    if (x > viewL + 30 && x < viewR - 30) return;
    const left = clamp(x - (sc.clientWidth + P.nameW) / 2, 0, sc.scrollWidth - sc.clientWidth);
    try { sc.scrollTo({ left, behavior: smooth && !reduced() ? 'smooth' : 'auto' }); } catch (e) { sc.scrollLeft = left; }
  }

  function setSel(t, snapMin) {
    const s = snapMin * MIN;
    t = Math.round(t / s) * s;
    P.sel = clamp(t, P.ds, P.de - s);
    updateScrub();
  }
  function selFromX(clientX, snap) {
    const box = R.plan.getBoundingClientRect();
    const x = clientX - box.left - P.nameW;
    setSel(P.ds + (x / P.W) * (P.de - P.ds), snap);
  }

  /* scrubbing: rail + knob drag everywhere; rows drag with a mouse, tap with touch (pan scrolls) */
  let scrub = null;
  on(R.plan, 'pointerdown', (ev) => {
    const part = ev.target.closest('[data-part]');
    if (!part || !ref() || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    const kind = part.dataset.part;
    if (kind === 'row' && ev.pointerType !== 'mouse') {
      scrub = { pid: ev.pointerId, tap: true, x0: ev.clientX, y0: ev.clientY, t0: performance.now() };
      return;
    }
    ev.preventDefault();
    scrub = { pid: ev.pointerId, tap: false, knob: kind === 'knob' };
    try { R.plan.setPointerCapture(ev.pointerId); } catch (e) {}
    R.plan.classList.add('grab');
    if (kind !== 'knob') selFromX(ev.clientX, 15);
    R.plan.focus({ preventScroll: true });
  });
  on(R.plan, 'pointermove', (ev) => {
    if (!scrub || ev.pointerId !== scrub.pid) return;
    if (scrub.tap) { if (Math.hypot(ev.clientX - scrub.x0, ev.clientY - scrub.y0) > 10) scrub.tap = 'moved'; return; }
    selFromX(ev.clientX, 15);
    const sc = R.pscroll.getBoundingClientRect();
    if (ev.clientX > sc.right - 36) R.pscroll.scrollLeft += 10;
    else if (ev.clientX < sc.left + P.nameW + 36) R.pscroll.scrollLeft -= 10;
  });
  const scrubEnd = (ev) => {
    if (!scrub || ev.pointerId !== scrub.pid) return;
    if (scrub.tap === true && ev.type === 'pointerup' && performance.now() - scrub.t0 < 600) {
      const box = R.plan.getBoundingClientRect();
      const i = Math.floor((ev.clientX - box.left - P.nameW) / P.cw);
      if (i >= 0 && i < P.cols) { P.sel = P.ds + i * HOUR; updateScrub(); }
    }
    R.plan.classList.remove('grab');
    scrub = null;
    queueUrl();
  };
  on(R.plan, 'pointerup', scrubEnd);
  on(R.plan, 'pointercancel', scrubEnd);
  on(R.plan, 'keydown', (ev) => {
    if (!ref()) return;
    const step = ev.shiftKey ? 60 : 15;
    let t = getSel();
    switch (ev.key) {
      case 'ArrowLeft': case 'ArrowDown': t -= step * MIN; break;
      case 'ArrowRight': case 'ArrowUp': t += step * MIN; break;
      case 'Home': t = P.ds; break;
      case 'End': t = P.de - 15 * MIN; break;
      case 'PageUp': shiftDay(-1); ev.preventDefault(); return;
      case 'PageDown': shiftDay(1); ev.preventDefault(); return;
      default: return;
    }
    ev.preventDefault();
    t = Math.round(t / (15 * MIN)) * 15 * MIN;
    if (t < P.ds || t >= P.de) { P.sel = t; P.date = T.ymdOf(t, ref().tz); renderPlanner(); }
    else { P.sel = t; updateScrub(); }
    ensureVisible();
    queueUrl();
  });

  function shiftDay(n) {
    const r = ref(); if (!r) return;
    clearHint();
    const p = T.zonedParts(getSel(), r.tz);
    P.date = T.addDays(P.date || T.ymdOf(getSel(), r.tz), n);
    P.sel = T.zonedToUtc(P.date.y, P.date.m, P.date.d, p.hh, p.mm, r.tz);
    renderPlanner(); ensureVisible(); queueUrl();
  }
  function goNow() {
    clearHint();
    P.sel = null;
    P.date = todayRef();
    renderPlanner(); ensureVisible(true); queueUrl();
  }
  on(R.prev, 'click', () => shiftDay(-1));
  on(R.next, 'click', () => shiftDay(1));
  on(R.nowBtn, 'click', goNow);
  on(R.dateIn, 'change', () => {
    const d = T.parseYmd(R.dateIn.value);
    if (!d || !ref()) return;
    const n = T.dayDiff(P.date, d);
    if (n) shiftDay(n);
  });

  function clearHint() { R.chint.textContent = ''; R.chint.classList.remove('err'); }
  /* converter: "3pm London" */
  function convert(str, apply) {
    R.chint.classList.remove('err');
    if (!str.trim()) { R.chint.textContent = ''; return; }
    const q = T.parseTimeQuery(str);
    if (!q) { if (apply) { R.chint.classList.add('err'); R.chint.textContent = 'Try “3pm London”, “15:30 Tokyo” or “noon ny”.'; } else R.chint.textContent = ''; return; }
    const pool = entries.map((e) => ({ ...e, pick: true }));
    if (!entries.some((e) => e.here)) pool.push({ ...resolve('here') });
    for (const c of CITIES) if (!st.ids.includes(c.id)) pool.push(resolve(c.id));
    let target = q.rest ? T.matchCity(q.rest, pool) : ref() || resolve('here');
    if (!target && q.rest) {
      const z = ZONES.find((x) => x.toLowerCase() === q.rest.replace(/ /g, '_') || T.tzName(x).toLowerCase() === q.rest);
      if (z) target = resolve('tz:' + z);
    }
    if (!target) { R.chint.classList.add('err'); R.chint.textContent = `No city matching “${q.rest}”.`; return; }
    const r = ref() || target;
    const mid = P.ds && P.de ? P.ds + (P.de - P.ds) / 2 : now();
    const ymd = T.ymdOf(mid, target.tz);
    const t = T.zonedToUtc(ymd.y, ymd.m, ymd.d, q.h, q.m, target.tz);
    const tp = T.zonedParts(t, target.tz);
    const others = entries.filter((e) => e.tz !== target.tz || e.id !== target.id).slice(0, 4)
      .map((e) => `${esc(hm(T.zonedParts(t, e.tz)))} ${esc(e.name)}`).join(' · ');
    const inList = st.ids.includes(target.id);
    R.chint.innerHTML = `<span><b>${esc(hm(tp))} ${esc(target.name)}</b>${others ? ' = ' + others : ''}</span>` +
      (inList ? '' : `<button type="button" data-addid="${esc(target.id)}">Add ${esc(target.name)}</button>`) +
      (apply ? '' : '<span class="kbonly" style="color:var(--wdim)">Enter to set</span>');
    if (apply && r) {
      P.sel = t;
      P.date = T.ymdOf(t, (ref() || target).tz);
      renderPlanner(); ensureVisible(true); queueUrl();
    }
  }
  on(R.convIn, 'input', () => convert(R.convIn.value, false));
  on(R.conv, 'submit', (ev) => { ev.preventDefault(); convert(R.convIn.value, true); R.convIn.blur(); });
  on(R.chint, 'click', (ev) => {
    const b = ev.target.closest('[data-addid]');
    if (!b) return;
    const id = b.dataset.addid;
    if (!st.ids.includes(id)) { const keep = P.sel; setIds([...st.ids, id]); P.sel = keep; updateScrub(); toast(`Added ${resolve(id).name}`); }
    b.remove();
  });

  on(R.copySum, 'click', () => { if (entries.length) copy(T.summary(getSel(), entries, st.h12), 'Summary copied'); });
  on(R.copyLink, 'click', () => copy(location.origin + T.buildShare(st.ids.map(concreteId), Math.floor(getSel() / MIN) * MIN), 'Link copied'));

  /* ---------- URL ---------- */
  let urlT = 0;
  function queueUrl() {
    if (!urlSync) return;
    clearTimeout(urlT);
    urlT = setTimeout(() => {
      try {
        const q = new URLSearchParams(location.search);
        let u = T.buildShare(st.ids.map(concreteId), P.sel, location.pathname);
        if (q.get('theme')) u += (u.includes('?') ? '&' : '?') + 'theme=' + encodeURIComponent(q.get('theme'));
        if (u !== location.pathname + location.search) history.replaceState(history.state, '', u);
      } catch (e) {}
    }, 250);
  }

  /* ======================================================================
     SHEET (add / remove cities)
     ====================================================================== */
  let sheetOpen = false, lastFocus = null;
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function optHtml(e, t) {
    const p = T.zonedParts(t, e.tz), sel = st.ids.includes(e.id);
    return `<button class="wld-opt" type="button" role="listitem" data-id="${esc(e.id)}" aria-pressed="${sel}"><span class="nm"><b>${esc(e.name)}${e.here ? ' · here' : ''}</b><small>${esc(e.country || e.tz)}</small></span><span class="tm">${esc(hm(p))}<small>${esc(T.fmtUtc(t, e.tz))}</small></span><span class="ck">${sel ? ICON.check : ICON.plus}</span></button>`;
  }
  function renderList() {
    const q = norm(R.q.value.trim()), t = now();
    let h = '', n = 0;
    if (!q) {
      if (entries.length) h += `<div class="wld-gh">Your cities</div>` + entries.map((e) => optHtml(e, t)).join('');
      if (!st.ids.includes('here')) h += `<div class="wld-gh">Here</div>` + optHtml(resolve('here'), t);
      for (const reg of REGIONS) {
        const cs = CITIES.filter((c) => c.region === reg && !st.ids.includes(c.id));
        if (cs.length) h += `<div class="wld-gh">${esc(reg)}</div>` + cs.map((c) => optHtml(resolve(c.id), t)).join('');
      }
      n = 1;
    } else {
      const hits = [];
      const here = resolve('here');
      if ('here local my device'.includes(q) || norm(here.name).includes(q)) hits.push(here);
      for (const c of CITIES) {
        const hay = norm(`${c.name} ${c.country} ${c.region} ${c.alt || ''} ${c.tz.replace(/_/g, ' ')}`);
        if (hay.includes(q)) hits.push(resolve(c.id));
      }
      const qz = q.replace(/ /g, '_');
      const zs = ZONES.filter((z) => z.toLowerCase().includes(qz)).slice(0, 12);
      for (const z of zs) if (!hits.some((e) => e.tz === z && T.tzName(z).toLowerCase() === norm(e.name))) hits.push(resolve('tz:' + z));
      hits.sort((a, b) => (norm(b.name).startsWith(q) ? 1 : 0) - (norm(a.name).startsWith(q) ? 1 : 0));
      n = hits.length;
      h = hits.map((e) => optHtml(e, t)).join('');
    }
    R.list.innerHTML = h;
    R.none.hidden = n > 0;
    R.count.textContent = `${entries.length} selected`;
  }
  function openSheet() {
    if (sheetOpen) return;
    sheetOpen = true; lastFocus = document.activeElement;
    R.q.value = '';
    renderList();
    R.sheet.style.transform = '';
    R.sheet.classList.add('open'); R.scrim.classList.add('open');
    R.sbody.scrollTop = 0;
    if (matchMedia('(pointer: fine)').matches) later(() => R.q.focus({ preventScroll: true }), 60);
    else later(() => R.sheetX.focus({ preventScroll: true }), 60);
  }
  function closeSheet() {
    if (!sheetOpen) return;
    sheetOpen = false;
    R.sheet.classList.remove('open', 'drag'); R.scrim.classList.remove('open');
    R.sheet.style.transform = '';
    if (lastFocus && lastFocus.focus && root.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  on(R.add, 'click', openSheet);
  on(R.emptyAdd, 'click', openSheet);
  on(R.sheetX, 'click', closeSheet);
  on(R.scrim, 'click', closeSheet);
  on(R.q, 'input', () => { renderList(); R.sbody.scrollTop = 0; });
  on(R.q, 'keydown', (ev) => { if (ev.key === 'Enter') { const f = R.list.querySelector('.wld-opt[aria-pressed="false"]'); if (f && R.q.value.trim()) f.click(); } });
  on(R.list, 'click', (ev) => {
    const b = ev.target.closest('.wld-opt'); if (!b) return;
    const id = b.dataset.id, has = st.ids.includes(id);
    const e = resolve(id);
    setIds(has ? st.ids.filter((x) => x !== id) : [...st.ids, id]);
    b.setAttribute('aria-pressed', String(!has));
    b.querySelector('.ck').innerHTML = has ? ICON.plus : ICON.check;
    R.count.textContent = `${entries.length} selected`;
    toast(has ? `Removed ${e.name}` : `Added ${e.name}`);
  });
  // swipe the sheet head down to close
  let sd = null;
  on(R.sheetHead, 'pointerdown', (ev) => {
    if (ev.target.closest('input, button')) return;
    sd = { pid: ev.pointerId, y0: ev.clientY, t0: performance.now(), dy: 0 };
    try { R.sheetHead.setPointerCapture(ev.pointerId); } catch (e) {}
  });
  on(R.sheetHead, 'pointermove', (ev) => {
    if (!sd || ev.pointerId !== sd.pid) return;
    sd.dy = Math.max(0, ev.clientY - sd.y0);
    if (sd.dy > 4) { R.sheet.classList.add('drag'); R.sheet.style.transform = `translate(-50%, ${sd.dy}px)`; }
  });
  const sheetUp = (ev) => {
    if (!sd || ev.pointerId !== sd.pid) return;
    const v = sd.dy / Math.max(1, performance.now() - sd.t0);
    R.sheet.classList.remove('drag');
    if (sd.dy > 110 || (sd.dy > 30 && v > 0.6)) closeSheet(); else R.sheet.style.transform = '';
    sd = null;
  };
  on(R.sheetHead, 'pointerup', sheetUp);
  on(R.sheetHead, 'pointercancel', sheetUp);

  /* ---------- tabs, 12/24, edit ---------- */
  function setView(v, focus) {
    st.view = v; root.dataset.view = v;
    for (const b of root.querySelectorAll('.wld-tabs [data-view]')) b.setAttribute('aria-selected', String(b.dataset.view === v));
    save();
    if (v === 'planner') { renderPlanner(); ensureVisible(); }
    if (focus) root.querySelector(`.wld-tabs [data-view="${v}"]`).focus();
  }
  on(root.querySelector('.wld-tabs'), 'click', (ev) => { const b = ev.target.closest('[data-view]'); if (b) setView(b.dataset.view); });
  on(root.querySelector('.wld-tabs'), 'keydown', (ev) => {
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { ev.preventDefault(); setView(st.view === 'clocks' ? 'planner' : 'clocks', true); }
  });
  function setH12(v) {
    st.h12 = v; save();
    R.fmt.textContent = v ? '12h' : '24h';
    R.fmt.setAttribute('aria-pressed', String(v));
    updateCards(true); renderPlanner();
    if (R.convIn.value) convert(R.convIn.value, false);
  }
  on(R.fmt, 'click', () => setH12(!st.h12));
  function setEdit(v) {
    st.editing = v;
    root.classList.toggle('editing', v);
    R.edit.setAttribute('aria-pressed', String(v));
    R.edit.textContent = v ? 'Done' : 'Edit';
  }
  on(R.edit, 'click', () => setEdit(!st.editing));

  /* ---------- keyboard shortcuts (only while active) ---------- */
  function onKey(ev) {
    if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const tag = ev.target && ev.target.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (ev.target && ev.target.isContentEditable);
    if (ev.key === 'Escape') {
      if (sheetOpen) { ev.preventDefault(); closeSheet(); }
      else if (st.editing) setEdit(false);
      else if (typing && root.contains(ev.target)) ev.target.blur();
      return;
    }
    if (typing || sheetOpen) return;
    switch (ev.key) {
      case '/': case 'a': ev.preventDefault(); openSheet(); break;
      case 'e': setEdit(!st.editing); break;
      case 'h': setH12(!st.h12); break;
      case 'c': setView('clocks'); break;
      case 'p': setView('planner'); break;
      case 'n': goNow(); break;
      case '[': shiftDay(-1); break;
      case ']': shiftDay(1); break;
      default: return;
    }
  }
  // focus trap-lite for the sheet
  function onSheetTab(ev) {
    if (!sheetOpen || ev.key !== 'Tab') return;
    const f = [...R.sheet.querySelectorAll('button, input')].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    else if (!R.sheet.contains(document.activeElement)) { ev.preventDefault(); first.focus(); }
  }

  /* ---------- ticking ---------- */
  let tickT = 0, lastMin = -1, lastDayKey = '';
  function tick() {
    if (!alive || !st.active) return;
    updateCards(false);
    const t = now(), m = Math.floor(t / MIN);
    if (m !== lastMin) {
      lastMin = m;
      const r = ref();
      if (r) {
        const dk = T.ymdKey(T.ymdOf(t, r.tz));
        if (isLive() && lastDayKey && dk !== lastDayKey) { P.date = T.ymdOf(t, r.tz); renderPlanner(); }
        else if (isLive()) updateScrub();
        else if (P.nowl) { const n = t; P.nowl.hidden = !(n >= P.ds && n < P.de); if (!P.nowl.hidden) P.nowl.style.left = xOf(n).toFixed(1) + 'px'; }
        lastDayKey = dk;
        updateDateUi();
      }
    }
    tickT = setTimeout(tick, 1000 - (now() % 1000) + 8);
  }
  function restartTick() { clearTimeout(tickT); lastMin = -1; if (st.active) tick(); }

  /* ---------- build ---------- */
  function rebuild() {
    entries = st.ids.map(resolve).filter(Boolean);
    renderCards();
    if (ref()) P.date = T.ymdOf(getSel(), ref().tz);
    renderPlanner();
    if (sheetOpen) R.count.textContent = `${entries.length} selected`;
  }

  let ro = null, lastW = 0;
  if ('ResizeObserver' in window) {
    ro = new ResizeObserver(() => {
      const w = R.pscroll.clientWidth;
      if (w && Math.abs(w - lastW) > 1) { lastW = w; renderPlanner(); }
    });
    ro.observe(R.pscroll);
  }
  on(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      restartTick();
      if (!opts.now && performance.now() - sync.at > 10 * MIN) doSync();
    }
  });

  let keysOn = false;
  function setActiveImpl(v) {
    st.active = v;
    if (v && !keysOn) { document.addEventListener('keydown', onKey); document.addEventListener('keydown', onSheetTab); keysOn = true; }
    if (!v && keysOn) { document.removeEventListener('keydown', onKey); document.removeEventListener('keydown', onSheetTab); keysOn = false; }
    if (v) { restartTick(); renderPlanner(); } else { clearTimeout(tickT); closeSheet(); }
  }

  // initial paint
  R.fmt.textContent = st.h12 ? '12h' : '24h';
  R.fmt.setAttribute('aria-pressed', String(st.h12));
  entries = st.ids.map(resolve).filter(Boolean);
  if (P.sel != null && entries[0]) P.date = T.ymdOf(P.sel, entries[0].tz);
  renderCards();
  setView(st.view);
  renderPlanner();
  ensureVisible();
  syncUi();
  setActiveImpl(true);
  if (!opts.now) doSync();
  const syncEvery = setInterval(() => { if (!opts.now && document.visibilityState === 'visible' && st.active) doSync(); }, 10 * MIN);
  queueUrl();

  return {
    setActive: setActiveImpl,
    debug: () => ({ ids: st.ids.slice(), sel: P.sel, date: P.date && T.ymdKey(P.date), cols: P.cols, cw: P.cw, view: st.view, h12: st.h12, offset: sync.offset, synced: sync.ok }),
    destroy() {
      setActiveImpl(false);
      alive = false;
      clearTimeout(tickT); clearTimeout(urlT); clearTimeout(toastT); clearInterval(syncEvery);
      for (const id of timers) clearTimeout(id);
      if (ro) ro.disconnect();
      for (const f of cleanups) f();
      root.remove();
    },
  };
}
