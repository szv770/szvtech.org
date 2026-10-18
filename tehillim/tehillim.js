// tehillim/tehillim.js — the /tehillim page. Pure logic lives in logic.js; the
// Hebrew day + sunset come from today.js (which reuses /luach and /zmanim).
import * as T from '/tehillim/logic.js';
import { effectiveDay, guessDay } from '/tehillim/today.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RM = matchMedia('(prefers-reduced-motion: reduce)');

/* ------------------------------------------------------------------ storage */
const K = { data: 'szv-tehillim', set: 'szv-tehillim-set', names: 'szv-tehillim-names', cache: 'szv-th-c1:', mode: 'szv-tehillim-mode', pings: 'szv-seder-pings' };
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) {} };
const lsJSON = (k, fb) => { try { const v = JSON.parse(lsGet(k)); return v == null ? fb : v; } catch (e) { return fb; } };

const DEFAULT_SET = { fs: 28, trop: true, nums: true, lines: false, night: false };
let settings = { ...DEFAULT_SET, ...lsJSON(K.set, {}) };
settings.fs = Math.min(52, Math.max(18, +settings.fs || 28));
const saveSettings = () => lsSet(K.set, JSON.stringify(settings));

let data = (() => {
  const d = lsJSON(K.data, null);
  return d && typeof d === 'object' ? { prog: d.prog || {}, full: d.full || {}, last: d.last || null } : { prog: {}, full: {}, last: null };
})();
const saveData = () => lsSet(K.data, JSON.stringify(data));

let names = lsJSON(K.names, []);
if (!Array.isArray(names)) names = [];
names = names.filter((n) => n && typeof n.id === 'string' && typeof n.name === 'string').slice(0, 60);
const saveNames = () => lsSet(K.names, JSON.stringify(names));

/* -------------------------------------------------------------------- state */
let today = guessDay(Date.now());       // refined with sunset right after start
let mode = (() => { const m = lsGet(K.mode); return m === 'week' || m === 'any' ? m : 'month'; })();
let viewMonthDay = null;                  // viewing another day of the month (null = today)
let viewWeekDay = null;
let anyPs = (data.last && data.last.ps) || 1;

const monthNum = () => viewMonthDay || today.h.d;
const weekNum = () => (viewWeekDay == null ? today.wd : viewWeekDay);
const isToday = () => mode === 'month' ? monthNum() === today.h.d : mode === 'week' ? weekNum() === today.wd : false;

function units() {
  if (mode === 'month') return T.monthlyUnits(Math.min(30, monthNum()), today.monthLength);
  if (mode === 'week') return T.weeklyUnits(weekNum());
  return T.allUnits();
}
const curPlanKey = () => T.planKey(mode, mode === 'month' ? monthNum() : mode === 'week' ? weekNum() : 0);
const marks = () => ((data.prog[today.ymd] || {})[curPlanKey()] || []);

function setMark(key, on) {
  const day = (data.prog[today.ymd] = data.prog[today.ymd] || {});
  const pk = curPlanKey();
  let arr = (day[pk] || []).filter((k) => k !== key);
  if (on) arr.push(key);
  day[pk] = arr;
  if (!arr.length) delete day[pk];
  if (!Object.keys(day).length) delete data.prog[today.ymd];
  // "today fully said" = today's own month or week set complete
  if (isToday()) {
    if (T.isComplete(units(), arr)) data.full[today.ymd] = 1; else delete data.full[today.ymd];
  }
  if (mode !== 'any') data.last = { ps: units().find((u) => T.unitKey(u) === key)?.ps || 1 };
  data.prog = T.prune(data.prog, today.ymd, 60);
  data.full = T.prune(data.full, today.ymd, 400);
  saveData();
}

/* ---------------------------------------------------------------- text data */
const inflight = new Map();
function readCache(ps) {
  const s = lsGet(K.cache + ps);
  if (!s) return null;
  try { const v = JSON.parse(s); return Array.isArray(v) && v.length ? v : null; } catch (e) { return null; }
}
const cachedCount = () => { let n = 0; for (let i = 1; i <= 150; i++) if (lsGet(K.cache + i) != null) n++; return n; };

function loadChapter(ps) {
  const c = readCache(ps);
  if (c) return Promise.resolve(c);
  if (inflight.has(ps)) return inflight.get(ps);
  const p = (async () => {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 15000);
    try {
      const r = await fetch(`https://www.sefaria.org/api/v3/texts/Psalms.${ps}?version=hebrew`, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!r.ok) throw new Error('http ' + r.status);
      const verses = T.parseSefaria(await r.json(), ps);
      if (!verses) throw new Error('bad text');
      lsSet(K.cache + ps, JSON.stringify(verses));
      return verses;
    } finally { clearTimeout(to); inflight.delete(ps); }
  })();
  inflight.set(ps, p);
  return p;
}

/* ------------------------------------------------------------------ toast */
let toastT;
function toast(msg, action) {
  const t = $('toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button" id="toastAct">${esc(action.label)}</button>` : ''}`;
  t.classList.add('show');
  if (action) $('toastAct').onclick = () => { action.run(); t.classList.remove('show'); };
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), action ? 6000 : 2600);
}

/* ---------------------------------------------------------------- main page */
const IC = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
};

function renderHero() {
  const us = units();
  const keys = marks();
  const hero = $('hero');
  if (mode === 'any') {
    const u = { ps: anyPs };
    hero.innerHTML = `
      <div class="eyebrow mono">Any chapter</div>
      <h1 class="range">Psalm ${anyPs}</h1>
      <div class="range-he" lang="he" dir="rtl">${esc(T.unitHe(u))}</div>
      <div class="hero-act">
        <button class="cta" id="cta" type="button">Open Psalm ${anyPs}</button>
        <button class="ghost" id="pick" type="button">Pick a chapter</button>
      </div>
      <p class="cap">All 150 chapters, one at a time. Marks here are for you only and do not count toward the streak.</p>`;
    $('cta').onclick = () => openReader(anyPs - 1);
    $('pick').onclick = openPicker;
    return;
  }
  const n = mode === 'month' ? monthNum() : weekNum();
  const done = T.doneCount(us, keys);
  const complete = T.isComplete(us, keys);
  const nextIdx = T.firstOpen(us, keys);
  const st = T.streakOf(data.full, today.ymd);
  const eyebrow = mode === 'month'
    ? `${isToday() ? 'Today' : 'Day'} · ${n} ${esc(today.enText.replace(/^\d+\s/, ''))}`
    : `${isToday() ? 'Today' : 'Weekly'} · ${T.WEEKDAYS[n]}`;
  const heDate = mode === 'month' ? `${T.hebNum(n)} ${today.heText.split(' ').slice(1).join(' ')}` : '';
  const lab = complete ? 'Read it again' : done ? `Continue · ${T.unitLabel(us[nextIdx])}` : `Start · ${T.unitLabel(us[0])}`;
  const pct = us.length ? Math.round((done / us.length) * 100) : 0;
  const stepL = 'Previous day';
  hero.innerHTML = `
    <div class="eyebrow-row">
      <button class="step" id="dayPrev" type="button" aria-label="${stepL}">${IC.chev}</button>
      <div class="eyebrow mono">${eyebrow}</div>
      <button class="step r" id="dayNext" type="button" aria-label="Next day">${IC.chev}</button>
    </div>
    ${heDate ? `<div class="he-date" lang="he" dir="rtl">${esc(heDate)}</div>` : ''}
    <h1 class="range">${esc(T.rangeLabel(us))}</h1>
    <div class="range-he" lang="he" dir="rtl">${esc(T.rangeHe(us))}</div>
    <div class="prog" role="progressbar" aria-valuemin="0" aria-valuemax="${us.length}" aria-valuenow="${done}" aria-label="Chapters said"><i style="width:${pct}%"></i></div>
    <div class="prog-l mono">${complete ? 'All said' : `${done} of ${us.length} said`}${st.streak ? ` · ${st.streak} day streak` : ''}</div>
    <button class="cta${complete ? ' is-done' : ''}" id="cta" type="button">${complete ? `<span class="tick">${IC.check}</span>` : ''}<span>${esc(lab)}</span></button>
    ${!isToday() ? '<button class="ghost slim" id="backToday" type="button">Back to today</button>' : ''}
    ${mode === 'month' && isToday() && today.afterSunset ? `<p class="cap">The Hebrew day began at sunset${today.sunsetText ? ` (${esc(today.sunsetText)}${today.placeName ? ', ' + esc(today.placeName) : ''})` : ''}.</p>` : (mode === 'month' && isToday() && today.sunsetText ? `<p class="cap">Tomorrow's chapters start at sunset, ${esc(today.sunsetText)}${today.placeName ? ' in ' + esc(today.placeName) : ''}.</p>` : '')}`;
  $('cta').onclick = () => openReader(complete ? 0 : nextIdx);
  const shift = (d) => {
    if (mode === 'month') viewMonthDay = ((monthNum() - 1 + d + 30) % 30) + 1; else viewWeekDay = (weekNum() + d + 7) % 7;
    if (mode === 'month' && viewMonthDay === today.h.d) viewMonthDay = null;
    if (mode === 'week' && viewWeekDay === today.wd) viewWeekDay = null;
    render();
  };
  $('dayPrev').onclick = () => shift(-1);
  $('dayNext').onclick = () => shift(1);
  const bt = $('backToday');
  if (bt) bt.onclick = () => { viewMonthDay = viewWeekDay = null; render(); };
}

function renderSet() {
  const c = $('setCard');
  if (mode === 'any') {
    c.innerHTML = `<h2 class="lab mono">Jump to a chapter</h2>
      <form class="goto" id="gotoForm"><input id="gotoN" type="number" inputmode="numeric" min="1" max="150" placeholder="1–150" aria-label="Chapter number"><button class="ghost" type="submit">Go</button></form>
      <div class="chips" id="chips"></div>`;
    const near = [];
    for (let p = Math.max(1, anyPs - 2); p <= Math.min(150, anyPs + 4); p++) near.push(p);
    $('chips').innerHTML = near.map((p) => chip({ ps: p }, p === anyPs ? 'cur' : '', p - 1)).join('');
    $('gotoForm').onsubmit = (e) => { e.preventDefault(); const v = Math.floor(+$('gotoN').value); if (v >= 1 && v <= 150) { anyPs = v; renderHero(); renderSet(); openReader(v - 1); } };
    $('chips').onclick = chipClick;
    return;
  }
  const us = units(), keys = marks(), next = T.firstOpen(us, keys);
  c.innerHTML = `<h2 class="lab mono">In this set</h2><div class="chips" id="chips">${us.map((u, i) => chip(u, T.unitKey(u) && keys.includes(T.unitKey(u)) ? 'said' : i === next ? 'cur' : '', i)).join('')}</div>`;
  $('chips').onclick = chipClick;
}
function chip(u, cls, i) {
  return `<button class="ch ${cls}" type="button" data-i="${i}" aria-label="${esc(T.unitLabel(u))}${cls === 'said' ? ', said' : ''}">
    <span class="ch-he" lang="he" dir="rtl">${esc(T.unitHeShort(u))}</span><span class="ch-n mono">${esc(T.unitShort(u))}</span>${cls === 'said' ? `<i class="ch-ck">${IC.check}</i>` : ''}</button>`;
}
function chipClick(e) { const b = e.target.closest('.ch'); if (b) openReader(+b.dataset.i); }

const nameLine = (n) => `${n.name} ${n.rel === 'bas' ? 'בת' : 'בן'} ${n.mother}`.trim();
function renderNames() {
  const c = $('namesCard');
  const on = names.filter((n) => n.on !== false);
  c.innerHTML = `<div class="row-h"><h2 class="lab mono">Say for someone</h2><button class="ghost slim" id="editNames" type="button">${names.length ? 'Edit' : 'Add a name'}</button></div>
    ${names.length ? `<ul class="names">${names.map((n) => `<li class="${n.on === false ? 'off' : ''}" lang="he" dir="rtl">${esc(nameLine(n))}</li>`).join('')}</ul>
    <p class="cap">${on.length ? `${on.length} shown at the top of the reader, as a reminder to have them in mind.` : 'None switched on, so nothing is shown in the reader.'}</p>`
      : '<p class="cap">Add a name (for example Moshe ben Sarah) and it will sit at the top of the reader as a quiet reminder. Names stay on this device.</p>'}`;
  $('editNames').onclick = openNames;
}

function renderOffline() {
  const c = $('offlineCard');
  const n = cachedCount();
  c.innerHTML = `<div class="row-h"><h2 class="lab mono">Offline</h2><span class="mono dim">${n} of 150 saved</span></div>
    <div class="prog"><i style="width:${Math.round(n / 1.5)}%"></i></div>
    <p class="cap">Chapters you open are saved automatically. To read anywhere without signal, save the whole month now (all 150 chapters, about 0.4 MB).</p>
    <button class="ghost" id="dl" type="button"${n >= 150 ? ' disabled' : ''}>${n >= 150 ? 'Saved for offline' : 'Save this month for offline'}</button>`;
  $('dl').onclick = downloadAll;
}

let dlBusy = false;
async function downloadAll() {
  if (dlBusy) return;
  dlBusy = true;
  const todo = [];
  for (let i = 1; i <= 150; i++) if (lsGet(K.cache + i) == null) todo.push(i);
  const btn = $('dl');
  let ok = 0, fail = 0;
  const upd = () => { if (btn) { btn.disabled = true; btn.textContent = `Saving… ${ok + fail} of ${todo.length}`; } };
  upd();
  const q = todo.slice();
  const worker = async () => { while (q.length) { const p = q.shift(); try { await loadChapter(p); ok++; } catch (e) { fail++; } upd(); } };
  await Promise.all([worker(), worker(), worker(), worker()]);
  dlBusy = false;
  renderOffline();
  toast(fail ? `Saved ${ok}. ${fail} didn't load, try again.` : 'All 150 chapters saved on this device');
}

function render() {
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  renderHero(); renderSet(); renderNames(); renderOffline();
}
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-mode]');
  if (!b) return;
  mode = b.dataset.mode;
  lsSet(K.mode, mode);
  render();
});

/* ------------------------------------------------------------------- sheets */
const sheet = $('sheet'), sback = $('sheetBack');
let sheetOpen = false, sheetFocus = null;
function openSheet(html, after) {
  sheetFocus = document.activeElement;
  $('sheetBody').innerHTML = html;
  sheet.hidden = sback.hidden = false;
  sheet.scrollTop = 0;
  requestAnimationFrame(() => requestAnimationFrame(() => { sheet.classList.add('on'); sback.classList.add('on'); }));
  sheetOpen = true;
  if (after) after($('sheetBody'));
}
function closeSheet() {
  if (!sheetOpen) return;
  sheetOpen = false;
  sheet.classList.remove('on'); sback.classList.remove('on');
  setTimeout(() => { if (!sheetOpen) sheet.hidden = sback.hidden = true; }, RM.matches ? 220 : 460);
  if (sheetFocus && sheetFocus.focus) { try { sheetFocus.focus({ preventScroll: true }); } catch (e) {} }
}
sback.addEventListener('click', closeSheet);
addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetOpen) { e.stopPropagation(); closeSheet(); } });

/* reading settings */
function openSettings() {
  openSheet(`<h2 class="sh-h">Reading</h2>
    <div class="fs-row"><button class="chip" id="fsDn" type="button" aria-label="Smaller text">A&minus;</button>
      <input id="fs" type="range" min="18" max="52" step="2" value="${settings.fs}" aria-label="Text size">
      <button class="chip" id="fsUp" type="button" aria-label="Larger text">A+</button></div>
    <div class="sample text${settings.night ? ' night' : ''}" id="sample" lang="he" dir="rtl" style="--fs:${settings.fs}px">${esc(sampleText())}</div>
    ${tog('trop', 'Cantillation marks (trop)', 'The small signs above and below the words')}
    ${tog('nums', 'Verse numbers', '')}
    ${tog('lines', 'One verse per line', '')}
    ${tog('night', 'Night reading', 'Softer, warmer text on a darker page')}
    <button class="ghost wide" id="shDone" type="button">Done</button>`, (b) => {
    const apply = () => { saveSettings(); applyReading(); $('fs').value = settings.fs; const s = $('sample'); s.style.setProperty('--fs', settings.fs + 'px'); s.classList.toggle('night', settings.night); s.textContent = sampleText(); };
    $('fs').oninput = (e) => { settings.fs = +e.target.value; apply(); };
    $('fsDn').onclick = () => { settings.fs = Math.max(18, settings.fs - 2); apply(); };
    $('fsUp').onclick = () => { settings.fs = Math.min(52, settings.fs + 2); apply(); };
    b.querySelectorAll('[data-tog]').forEach((el) => { el.onclick = () => { const k = el.dataset.tog; settings[k] = !settings[k]; el.setAttribute('aria-checked', String(settings[k])); apply(); }; });
    $('shDone').onclick = closeSheet;
  });
}
const SAMPLE = 'יְהֹוָ֥ה רֹ֝עִ֗י לֹ֣א אֶחְסָֽר׃';
const sampleText = () => (settings.trop ? SAMPLE : T.stripTrop(SAMPLE));
function tog(k, label, sub) {
  return `<button class="tog" type="button" role="switch" data-tog="${k}" aria-checked="${!!settings[k]}"><span><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><i aria-hidden="true"></i></button>`;
}
$('openSettings').onclick = openSettings;
$('rSettings').onclick = openSettings;

function applyReading() {
  const r = $('reader');
  r.style.setProperty('--fs', settings.fs + 'px');
  r.classList.toggle('night', !!settings.night);
  r.classList.toggle('lines', !!settings.lines);
  r.classList.toggle('nonums', !settings.nums);
  if (!$('reader').hidden && cur.verses) paintText();
}

/* chapter picker */
function openPicker() {
  const us = T.allUnits();
  openSheet(`<h2 class="sh-h">Pick a chapter</h2>
    <div class="grid150" id="g150">${us.map((u) => `<button type="button" class="gc${u.ps === anyPs ? ' cur' : ''}" data-ps="${u.ps}"><span lang="he">${T.hebNum(u.ps, false)}</span><small class="mono">${u.ps}</small></button>`).join('')}</div>`, (b) => {
    b.querySelector('#g150').onclick = (e) => {
      const g = e.target.closest('.gc'); if (!g) return;
      anyPs = +g.dataset.ps; closeSheet(); renderHero(); renderSet(); setTimeout(() => openReader(anyPs - 1), 60);
    };
    const c = b.querySelector('.gc.cur'); if (c) c.scrollIntoView({ block: 'center' });
  });
}

/* names */
function openNames() {
  const list = () => names.map((n) => `<li><button class="nm-t${n.on === false ? ' off' : ''}" type="button" data-id="${esc(n.id)}" role="switch" aria-checked="${n.on !== false}" aria-label="Show ${esc(nameLine(n))} in the reader"><span lang="he" dir="rtl">${esc(nameLine(n))}</span><i aria-hidden="true"></i></button><button class="nm-x" type="button" data-del="${esc(n.id)}" aria-label="Remove ${esc(nameLine(n))}">&#x2715;</button></li>`).join('');
  openSheet(`<h2 class="sh-h">Say for someone</h2>
    <p class="cap tight">Type the name in Hebrew letters (need a keyboard? <a href="/hebtype/">Hebrew Type</a>). Only you see these, on this device.</p>
    <ul class="nm-list" id="nmList">${list()}</ul>
    <form id="nmForm" class="nm-form" autocomplete="off">
      <input id="nmName" lang="he" dir="rtl" placeholder="שם" aria-label="Name" maxlength="40" required>
      <div class="seg" role="radiogroup" aria-label="Son or daughter of"><button type="button" role="radio" aria-checked="true" data-rel="ben">בן</button><button type="button" role="radio" aria-checked="false" data-rel="bas">בת</button></div>
      <input id="nmMother" lang="he" dir="rtl" placeholder="שם האם" aria-label="Mother's name" maxlength="40">
      <button class="cta small" type="submit">Add</button>
    </form>
    <button class="ghost wide" id="shDone" type="button">Done</button>`, (b) => {
    let rel = 'ben';
    b.querySelectorAll('[data-rel]').forEach((x) => x.onclick = () => { rel = x.dataset.rel; b.querySelectorAll('[data-rel]').forEach((y) => y.setAttribute('aria-checked', String(y === x))); });
    const refresh = () => { $('nmList').innerHTML = list(); renderNames(); };
    $('nmList').onclick = (e) => {
      const t = e.target.closest('[data-id]'), x = e.target.closest('[data-del]');
      if (t) { const n = names.find((q) => q.id === t.dataset.id); if (n) { n.on = n.on === false; saveNames(); refresh(); } }
      if (x) {
        const i = names.findIndex((q) => q.id === x.dataset.del); if (i < 0) return;
        const [gone] = names.splice(i, 1); saveNames(); refresh();
        toast('Name removed', { label: 'Undo', run: () => { names.splice(i, 0, gone); saveNames(); renderNames(); if (sheetOpen) refresh(); } });
      }
    };
    $('nmForm').onsubmit = (e) => {
      e.preventDefault();
      const name = $('nmName').value.trim().slice(0, 40), mother = $('nmMother').value.trim().slice(0, 40);
      if (!name) return;
      if (names.length >= 60) { toast('That is plenty of names for one list'); return; }
      names.push({ id: Math.random().toString(36).slice(2, 10), name, rel, mother, on: true });
      saveNames(); $('nmName').value = ''; $('nmMother').value = ''; refresh(); $('nmName').focus();
    };
    $('shDone').onclick = closeSheet;
  });
}

/* ------------------------------------------------------------------- reader */
const cur = { list: [], i: 0, verses: null, token: 0 };
const reader = $('reader');
let readerOpen = false, readerLast = null;

function openReader(i) {
  cur.list = units();
  cur.i = Math.max(0, Math.min(cur.list.length - 1, i));
  readerLast = document.activeElement;
  reader.hidden = false;
  document.documentElement.classList.add('reading');
  applyReading();
  if (!readerOpen) { try { history.pushState({ th: 1 }, '', '#read'); } catch (e) {} }
  readerOpen = true;
  requestAnimationFrame(() => reader.classList.add('on'));
  showUnit();
  $('rClose').focus({ preventScroll: true });
}
function closeReader(fromPop) {
  if (!readerOpen) return;
  readerOpen = false;
  reader.classList.remove('on');
  $('done').hidden = true;
  setTimeout(() => { if (!readerOpen) { reader.hidden = true; document.documentElement.classList.remove('reading'); } }, RM.matches ? 200 : 380);
  if (!fromPop && history.state && history.state.th) { try { history.back(); } catch (e) {} }
  render();
  if (readerLast && readerLast.focus && document.contains(readerLast)) { try { readerLast.focus({ preventScroll: true }); } catch (e) {} }
}
addEventListener('popstate', () => { if (readerOpen) closeReader(true); });
$('rClose').onclick = () => closeReader(false);
addEventListener('keydown', (e) => {
  if (!readerOpen || sheetOpen) return;
  if (e.key === 'Escape') closeReader(false);
  else if (e.key === 'ArrowRight') go(1);
  else if (e.key === 'ArrowLeft') go(-1);
});

function namesBlock() {
  const on = names.filter((n) => n.on !== false);
  if (!on.length) return '';
  return `<details class="inmind"><summary><span class="mono">Have in mind</span><b>${on.length}</b></summary><ul lang="he" dir="rtl">${on.map((n) => `<li>${esc(nameLine(n))}</li>`).join('')}</ul></details>`;
}

async function showUnit() {
  const u = cur.list[cur.i];
  const token = ++cur.token;
  cur.verses = null;
  $('rHe').textContent = T.unitHe(u);
  $('rSub').textContent = cur.list.length > 1 ? `${T.unitLabel(u)} · ${cur.i + 1} of ${cur.list.length}` : T.unitLabel(u);
  $('rNames').innerHTML = namesBlock();
  $('rEnd').innerHTML = '';
  $('rScroll').scrollTop = 0;
  paintBar();
  paintSay();
  $('rText').innerHTML = '<div class="skel-text" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>';
  if (mode === 'any') { anyPs = u.ps; data.last = { ps: u.ps }; saveData(); }
  try {
    const v = await loadChapter(u.ps);
    if (token !== cur.token) return;
    cur.verses = v;
    paintText();
    // warm the next chapter quietly
    const nx = cur.list[cur.i + 1]; if (nx) loadChapter(nx.ps).catch(() => {});
  } catch (e) {
    if (token !== cur.token) return;
    $('rText').innerHTML = `<div class="err" dir="ltr" lang="en"><b>Couldn't load this chapter.</b><p>${navigator.onLine === false ? "You're offline and it isn't saved yet." : 'The text service did not answer.'}</p><button class="ghost" id="retry" type="button">Try again</button></div>`;
    $('retry').onclick = showUnit;
  }
}
function paintText() {
  const u = cur.list[cur.i];
  const vs = T.unitVerses(u, cur.verses);
  $('rText').innerHTML = vs.map((v) => `<span class="v"><b class="vn" aria-hidden="true">${T.hebNum(v.n, false)}</b>${esc(settings.trop ? v.t : T.stripTrop(v.t))} </span>`).join('');
}
function paintBar() {
  const keys = marks();
  const n = cur.list.length;
  const done = T.doneCount(cur.list, keys);
  const frac = mode === 'any' ? (cur.i + 1) / n : Math.max(done, 0) / n;
  $('rBar').style.width = Math.max(2, Math.round(frac * 100)) + '%';
}
function paintSay() {
  const u = cur.list[cur.i];
  const said = marks().includes(T.unitKey(u));
  const b = $('rSay');
  b.classList.toggle('said', said);
  b.setAttribute('aria-pressed', String(said));
  $('rSayT').textContent = said ? 'Said' : 'Mark as said';
  $('rPrev').disabled = cur.i === 0;
  $('rNext').disabled = cur.i >= cur.list.length - 1;
  $('rNext').classList.toggle('hot', said && cur.i < cur.list.length - 1);
}
function go(d) {
  const j = cur.i + d;
  if (j < 0 || j >= cur.list.length) return;
  cur.i = j; showUnit();
}
$('rPrev').onclick = () => go(-1);
$('rNext').onclick = () => go(1);

$('rSay').onclick = () => {
  const u = cur.list[cur.i], key = T.unitKey(u);
  const was = marks().includes(key);
  setMark(key, !was);
  paintSay(); paintBar();
  if (was) { toast('Unmarked'); return; }
  const us = cur.list, done = T.doneCount(us, marks());
  if (mode !== 'any' && T.isComplete(us, marks())) { complete(); return; }
  if (mode === 'any') { toast(`${T.unitLabel(u)} said`); return; }
  toast(`${done} of ${us.length} said`);
  // gently bring the next chapter forward
  const nx = T.firstOpen(us, marks());
  if (nx >= 0 && nx !== cur.i && cur.i < us.length - 1) {
    $('rEnd').innerHTML = `<button class="cta" id="rContinue" type="button"><span>Next · ${esc(T.unitLabel(us[Math.min(cur.i + 1, us.length - 1)]))}</span></button>`;
    $('rContinue').onclick = () => go(1);
  }
};

function writePing() {
  if (!isToday() || mode === 'any') return;
  try {
    const id = 'tehillim:' + today.ymd;
    let arr = lsJSON(K.pings, []);
    if (!Array.isArray(arr)) arr = [];
    if (arr.some((p) => p && p.id === id)) return;
    arr.push({ id, kind: 'tehillim', ymd: today.ymd, at: Date.now(), what: T.rangeLabel(units()) });
    lsSet(K.pings, JSON.stringify(arr.slice(-20)));
  } catch (e) {}
}
function complete() {
  writePing();
  $('toast').classList.remove('show');
  const st = T.streakOf(data.full, today.ymd);
  const d = $('done');
  d.hidden = false;
  d.innerHTML = `<div class="done-card" role="alertdialog" aria-labelledby="dnT">
    <div class="done-ring" aria-hidden="true">${IC.check}</div>
    <h2 id="dnT">${isToday() ? "Today's Tehillim is complete" : 'This set is complete'}</h2>
    <p>${esc(T.rangeLabel(cur.list))}${isToday() && st.streak > 1 ? ` · ${st.streak} days in a row` : ''}</p>
    ${isToday() ? '<a class="ghost" href="/seder/">Log it in Seder</a>' : ''}
    <button class="cta" id="dnClose" type="button">Done</button>
  </div>`;
  requestAnimationFrame(() => d.classList.add('on'));
  $('dnClose').onclick = () => { d.classList.remove('on'); d.hidden = true; closeReader(false); };
  $('dnClose').focus({ preventScroll: true });
}

/* progress while scrolling: thin bar combines said count and scroll position */
$('rScroll').addEventListener('scroll', () => {
  const s = $('rScroll');
  const frac = s.scrollHeight - s.clientHeight > 0 ? s.scrollTop / (s.scrollHeight - s.clientHeight) : 0;
  const n = cur.list.length || 1;
  const base = mode === 'any' ? cur.i : T.doneCount(cur.list, marks());
  const inUnit = marks().includes(T.unitKey(cur.list[cur.i] || { ps: 0 })) ? 0 : frac;
  $('rBar').style.width = Math.max(2, Math.round(((base + inUnit) / n) * 100)) + '%';
}, { passive: true });

/* ---------------------------------------------------------------- lifecycle */
async function refreshDay() {
  const t = await effectiveDay(Date.now());
  const changed = t.ymd !== today.ymd || t.afterSunset !== today.afterSunset || t.sunsetText !== today.sunsetText;
  today = t;
  if (changed && !readerOpen) render();
}
render();
applyReading();
refreshDay().then(() => { if (!readerOpen) render(); prefetchToday(); });
setInterval(() => { if (!document.hidden) refreshDay(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDay(); });

function prefetchToday() {
  if (navigator.onLine === false) return;
  const us = T.monthlyUnits(today.h.d, today.monthLength);
  const q = us.map((u) => u.ps).filter((p, i, a) => a.indexOf(p) === i);
  const next = async () => { const p = q.shift(); if (!p) return; try { await loadChapter(p); } catch (e) {} setTimeout(next, 150); };
  setTimeout(() => { next(); renderOffline(); }, 1200);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/tehillim/sw.js', { scope: '/tehillim/' }).catch(() => {});
}
