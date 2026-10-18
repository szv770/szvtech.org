// seder/seder.js — learning timer, log and insights. Pure maths is in logic.js.
import * as Q from '/seder/logic.js';
import { guessDay, effectiveDay } from '/tehillim/today.js';
import * as TL from '/tehillim/logic.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RM = matchMedia('(prefers-reduced-motion: reduce)');
const { MIN, HOUR } = Q;

/* ------------------------------------------------------------------ storage */
const KEY = 'szv-seder', PINGS = 'szv-seder-pings', OUT = 'szv-seder-out', TABKEY = 'szv-seder-tab';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) {} };
const lsJSON = (k, fb) => { try { const v = JSON.parse(lsGet(k)); return v == null ? fb : v; } catch (e) { return fb; } };

let S = Q.normalizeState(lsJSON(KEY, null));
let warned = false;
function save() {
  if (!lsSet(KEY, JSON.stringify(S)) && !warned) { warned = true; toast("Can't save on this browser. Export a backup so nothing is lost."); }
}
addEventListener('storage', (e) => { if (e.key === KEY) { S = Q.normalizeState(lsJSON(KEY, null)); renderAll(); } if (e.key === PINGS || e.key === OUT) renderBanner(); });

const sedar = (sid) => S.sedarim.find((x) => x.id === sid) || { id: sid, name: 'Removed seder', c: 8, goal: 0, min: 0, gone: true };
const dot = (sid) => `<i class="dot c${sedar(sid).c}" aria-hidden="true"></i>`;

/* ------------------------------------------------------------------- state */
let tab = (() => { const t = lsGet(TABKEY); return ['today', 'insights', 'log'].includes(t) ? t : 'today'; })();
let runGoal = null;          // minutes chosen for the next run (null = the seder's own goal)
let insSid = null;           // insights filter
let insRange = 30;           // totals-by-seder range: 7 | 30 | 0 (all)
let monthY, monthM, monthSel = null;
let logLimit = 80;
let day = guessDay(Date.now());
let goalShown = false;
const nowMs = () => Date.now();
const todayYmd = () => Q.ymdOf(nowMs());
{ const t = todayYmd().split('-'); monthY = +t[0]; monthM = +t[1]; }

/* -------------------------------------------------------------------- toast */
let toastT;
function toast(msg, action) {
  const t = $('toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button" id="toastAct">${esc(action.label)}</button>` : ''}`;
  t.classList.add('show');
  if (action) $('toastAct').onclick = () => { action.run(); t.classList.remove('show'); };
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), action ? 6500 : 2800);
}

/* ------------------------------------------------------------------- sheets */
const sheet = $('sheet'), sback = $('sheetBack');
let sheetOpen = false, sheetFocus = null, onSheetClose = null;
function openSheet(html, after, onClose) {
  sheetFocus = document.activeElement;
  onSheetClose = onClose || null;
  $('sheetBody').innerHTML = html;
  sheet.hidden = sback.hidden = false;
  sheet.scrollTop = 0;
  requestAnimationFrame(() => requestAnimationFrame(() => { sheet.classList.add('on'); sback.classList.add('on'); }));
  sheetOpen = true;
  if (after) after($('sheetBody'));
}
function closeSheet(silent) {
  if (!sheetOpen) return;
  sheetOpen = false;
  sheet.classList.remove('on'); sback.classList.remove('on');
  setTimeout(() => { if (!sheetOpen) sheet.hidden = sback.hidden = true; }, RM.matches ? 220 : 460);
  const cb = onSheetClose; onSheetClose = null;
  if (cb && !silent) cb();
  if (sheetFocus && sheetFocus.focus && document.contains(sheetFocus)) { try { sheetFocus.focus({ preventScroll: true }); } catch (e) {} }
}
sback.addEventListener('click', () => closeSheet());
addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetOpen) closeSheet(); });

/* ---------------------------------------------------------- small svg bits */
const IC = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13M16 5.5v13"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/></svg>',
  chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5v13M12 6.5C9.5 5 6.5 4.8 4 5.5v13c2.5-.7 5.500-.5 8 1 2.500-1.500 5.500-1.700 8-1v-13c-2.500-.7-5.500-.5-8 1z"/></svg>',
  timer: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13.5" r="7.500"/><path d="M12 13.500V9.500M9.500 2.500h5"/></svg>',
};
/** Ring: size px, segs = [{ f: 0..1, cls }]; f are fractions of the whole circle, drawn one after another. */
function ring(size, sw, segs, extra = '') {
  const r = 50 - sw / 2;
  let off = 0, out = '';
  for (const s of segs) {
    const len = Math.max(0, Math.min(1 - off, s.f)) * 100;
    if (len > 0.2) out += `<circle class="arc ${s.cls || ''}" cx="50" cy="50" r="${r}" pathLength="100" stroke-dasharray="${len.toFixed(2)} ${(100 - len).toFixed(2)}" stroke-dashoffset="${(-off * 100).toFixed(2)}" stroke-width="${sw}"${s.id ? ` id="${s.id}"` : ''}/>`;
    off += s.f;
  }
  return `<svg class="ring" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><circle class="track" cx="50" cy="50" r="${r}" stroke-width="${sw}"/><g transform="rotate(-90 50 50)">${out}</g>${extra}</svg>`;
}

/* ---------------------------------------------------------------- wake lock */
let wl = null;
async function wake(on) {
  if (!('wakeLock' in navigator)) return;
  try {
    if (on && S.settings.wake && !wl && document.visibilityState === 'visible') {
      wl = await navigator.wakeLock.request('screen');
      wl.addEventListener('release', () => { wl = null; });
    } else if (!on && wl) { const w = wl; wl = null; await w.release(); }
  } catch (e) { wl = null; }
}
const running = () => !!(S.active && S.active.run != null);

/* ------------------------------------------------------------------- views */
function setTab(t) {
  tab = t; lsSet(TABKEY, t);
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  renderView();
}
$('tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });

function renderAll() { renderBanner(); setTab(tab); }
function renderView() {
  const v = $('view');
  if (tab === 'today') v.innerHTML = S.active ? activeHTML() : todayHTML();
  else if (tab === 'insights') v.innerHTML = insightsHTML();
  else v.innerHTML = logHTML();
  v.dataset.tab = tab;
  if (tab === 'today' && S.active) tick(true);
}

/* ---------- Today ---------- */
function dayStats() {
  const dt = Q.dayTotals(S.sessions);
  const t = todayYmd();
  const st = Q.streakOf(dt, t, S.settings.dayMin * MIN);
  return { dt, t, today: dt[t] || { total: 0, by: {} }, st };
}
function tehillimCard() {
  let line = '';
  try {
    const us = TL.monthlyUnits(day.h.d, day.monthLength);
    const d = lsJSON('szv-tehillim', {});
    const keys = ((d.prog || {})[day.ymd] || {})['m' + day.h.d] || [];
    const done = TL.doneCount(us, keys);
    line = `${TL.rangeLabel(us)} · ${done >= us.length ? 'said today' : done ? `${done} of ${us.length} said` : 'not started'}`;
  } catch (e) { line = "Today's chapters by the Hebrew date"; }
  return `<div class="card ties">
    <a class="tie" href="/tehillim/" id="tieTeh"><span class="tie-i">${IC.book}</span><span class="tie-t"><b>Today's Tehillim</b><small>${esc(line)}</small></span><span class="tie-c">${IC.chev}</span></a>
    <a class="tie" href="/timer/"><span class="tie-i">${IC.timer}</span><span class="tie-t"><b>Plain stopwatch</b><small>Countdowns and focus, no logging</small></span><span class="tie-c">${IC.chev}</span></a>
  </div>`;
}
function todayHTML() {
  const { today, st } = dayStats();
  const sel = sedar(S.settings.lastSid);
  const goalMin = runGoal != null ? runGoal : sel.goal;
  const target = S.settings.dayGoal * MIN;
  const segs = Object.entries(today.by).sort((a, b) => b[1] - a[1]).map(([sid, ms]) => ({ f: ms / target, cls: 'c' + sedar(sid).c }));
  const met = today.total >= target;
  const sedBy = (sid) => (today.by[sid] || 0);
  return `
  <section class="card hero">
    <div class="eyebrow-row"><span class="eyebrow mono">Today · ${esc(day.enText)}</span><span class="he-date" lang="he" dir="rtl">${esc(day.heText)}</span></div>
    <div class="ring-wrap${met ? ' met' : ''}">
      ${ring(220, 9, segs)}
      <div class="ring-c"><b>${today.total ? esc(Q.fmtDur(today.total)) : '0 min'}</b><span>${met ? 'daily goal reached' : `of ${esc(Q.fmtDur(target))} goal`}</span></div>
    </div>
    <p class="streakline">${st.streak ? `<b>${st.streak}</b> day streak${st.todayMet ? '' : ' · keep it going today'}${st.best > st.streak ? ` · best ${st.best}` : ''}` : 'Learn for ' + esc(Q.fmtDur(S.settings.dayMin * MIN)) + ' today to start a streak'}</p>
  </section>
  <section class="card pick">
    <h2 class="lab mono">What are you learning?</h2>
    <div class="sedarim" role="radiogroup" aria-label="Seder">${S.sedarim.map((x) => `<button type="button" role="radio" class="sd${x.id === sel.id ? ' on' : ''}" data-sid="${esc(x.id)}" aria-checked="${x.id === sel.id}">${dot(x.id)}<span>${esc(x.name)}</span>${sedBy(x.id) ? `<small class="mono">${esc(Q.fmtDur(sedBy(x.id)))}</small>` : ''}</button>`).join('')}</div>
    <div class="goalrow" role="group" aria-label="Goal in minutes"><span class="lab mono">Goal, minutes</span>${[0, 15, 30, 45, 60, 90].map((g) => `<button type="button" class="gchip${g === goalMin ? ' on' : ''}" data-goal="${g}" aria-pressed="${g === goalMin}">${g ? g : 'None'}</button>`).join('')}</div>
    <button class="cta" id="start" type="button"><span class="ci">${IC.play}</span><span>Start ${esc(sel.name)}</span></button>
  </section>
  ${tehillimCard()}`;
}

/* ---------- active timer ---------- */
function activeHTML() {
  const a = S.active, sd = sedar(a.sid);
  return `
  <section class="card hero active" data-sid="${esc(a.sid)}">
    <div class="eyebrow-row"><span class="eyebrow mono">${dot(a.sid)} ${esc(sd.name)}</span><span class="eyebrow mono" id="runState"></span></div>
    <div class="ring-wrap" id="ringWrap">
      <div id="ringBox"></div>
      <div class="ring-c"><b class="clock" id="clock">00:00</b><span id="goalTxt"></span></div>
    </div>
    <div class="ctrl">
      <button class="cta" id="pauseBtn" type="button"></button>
      <button class="ghost stop" id="stopBtn" type="button"><span class="ci">${IC.stop}</span><span>Stop &amp; save</span></button>
    </div>
    <p class="cap" id="wakeNote"></p>
  </section>
  ${tehillimCard()}`;
}
let lastShown = -1;
function tick(force) {
  const a = S.active;
  if (!a || tab !== 'today' || !$('clock')) return;
  const el = Q.elapsedOf(a, nowMs());
  const sec = Math.floor(el / 1000);
  if (!force && sec === lastShown) return;
  lastShown = sec;
  $('clock').textContent = Q.fmtClock(el);
  const goal = a.goal, f = Q.ringFrac(el, goal);
  const reached = goal > 0 && el >= goal;
  const box = $('ringBox');
  const key = `${Math.round(f * 500)}|${a.sid}|${reached}`;
  if (box.dataset.k !== key) {
    box.dataset.k = key;
    box.innerHTML = ring(240, 9, [{ f, cls: reached ? 'full' : 'c' + sedar(a.sid).c }]);
  }
  $('ringWrap').classList.toggle('met', reached);
  $('goalTxt').textContent = goal > 0 ? (reached ? `goal reached · ${Q.fmtDur(goal)}` : `${Q.fmtClock(goal - el)} to your ${Q.fmtDur(goal)} goal`) : 'no goal, ring turns once an hour';
  const run = a.run != null;
  $('runState').textContent = run ? 'running' : 'paused';
  $('ringWrap').classList.toggle('paused', !run);
  const pb = $('pauseBtn');
  const want = run ? 'pause' : 'resume';
  if (pb.dataset.k !== want) { pb.dataset.k = want; pb.innerHTML = run ? `<span class="ci">${IC.pause}</span><span>Pause</span>` : `<span class="ci">${IC.play}</span><span>Resume</span>`; pb.classList.toggle('calm', run); }
  $('wakeNote').textContent = 'wakeLock' in navigator ? (S.settings.wake ? (wl ? 'Screen stays on while this runs.' : run ? 'Screen can sleep. Time keeps counting by the clock.' : '') : 'Screen may sleep. Time keeps counting by the clock.') : 'Your screen may sleep. Time keeps counting by the clock.';
  if (reached && !goalShown) {
    goalShown = true;
    toast(`Goal reached: ${Q.fmtDur(goal)}`);
    try { if (!RM.matches && navigator.vibrate) navigator.vibrate(60); } catch (e) {}
  }
}
setInterval(() => {
  tick(false);
  if (todayYmd() !== lastDay) { lastDay = todayYmd(); if (!S.active) renderAll(); }
}, 250);
let lastDay = todayYmd();

function startRun() {
  const sel = sedar(S.settings.lastSid);
  const goalMin = runGoal != null ? runGoal : sel.goal;
  S.active = Q.startActive(sel.id, nowMs(), goalMin * MIN);
  goalShown = false; lastShown = -1;
  save(); wake(true); renderView();
}
function togglePause() {
  if (!S.active) return;
  S.active = running() ? Q.pauseActive(S.active, nowMs()) : Q.resumeActive(S.active, nowMs());
  save(); wake(running()); lastShown = -1; tick(true);
}
function stopRun() {
  if (!S.active) return;
  S.active = Q.pauseActive(S.active, nowMs());     // freeze the time while deciding
  save(); wake(false); lastShown = -1; tick(true);
  const a = S.active, el = Q.elapsedOf(a, nowMs());
  if (el < 1000) { S.active = null; save(); renderView(); toast('Too short to save, discarded'); return; }
  let sid = a.sid, confirmDiscard = false;
  openSheet(`<h2 class="sh-h">Save this session</h2>
    <div class="sum"><b>${esc(Q.fmtDur(el))}</b><span>${esc(Q.fmtClock(el))} · started ${esc(Q.hhmmOf(a.t0))}</span></div>
    <label class="fld"><span class="lab mono">Seder</span><select id="svSid">${S.sedarim.map((x) => `<option value="${esc(x.id)}"${x.id === sid ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    <label class="fld"><span class="lab mono">What did you learn? (optional)</span><input id="svNote" type="text" maxlength="140" placeholder="e.g. Bava Kama 20b, the sugya of..." autocomplete="off" enterkeyhint="done"></label>
    <button class="cta" id="svSave" type="button">Save session</button>
    <div class="two"><button class="ghost" id="svKeep" type="button">Keep going</button><button class="ghost danger" id="svDrop" type="button">Discard</button></div>`, (b) => {
    $('svSave').onclick = () => {
      const s = Q.finishActive(S.active, nowMs(), Q.newId());
      s.sid = $('svSid').value; s.note = $('svNote').value.trim().slice(0, 140);
      S.sessions.push(s); S.settings.lastSid = s.sid; S.active = null; save();
      closeSheet(true); renderAll(); toast(`Saved · ${Q.fmtDur(s.d)} of ${sedar(s.sid).name}`);
    };
    $('svNote').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('svSave').click(); });
    $('svKeep').onclick = () => closeSheet();
    $('svDrop').onclick = () => {
      if (!confirmDiscard) { confirmDiscard = true; $('svDrop').textContent = 'Tap again to discard'; return; }
      S.active = null; save(); closeSheet(true); renderAll(); toast('Discarded');
    };
  }, () => { if (S.active) { S.active = Q.resumeActive(S.active, nowMs()); save(); wake(true); lastShown = -1; tick(true); } });
}

/* ---------- view clicks (today) ---------- */
$('view').addEventListener('click', (e) => {
  const t = e.target;
  let b;
  if ((b = t.closest('.sd'))) { S.settings.lastSid = b.dataset.sid; runGoal = null; save(); renderView(); return; }
  if ((b = t.closest('.gchip'))) { runGoal = +b.dataset.goal; renderView(); return; }
  if (t.closest('#start')) return startRun();
  if (t.closest('#pauseBtn')) return togglePause();
  if (t.closest('#stopBtn')) return stopRun();
  if (t.closest('#tieTeh')) { lsSet(OUT, JSON.stringify({ at: nowMs() })); return; }
  if ((b = t.closest('[data-sf]'))) { insSid = b.dataset.sf || null; renderView(); return; }
  if ((b = t.closest('[data-mnav]'))) { monthM += +b.dataset.mnav; if (monthM < 1) { monthM = 12; monthY--; } if (monthM > 12) { monthM = 1; monthY++; } monthSel = null; renderView(); return; }
  if ((b = t.closest('[data-cell]'))) { monthSel = b.dataset.cell; renderView(); return; }
  if ((b = t.closest('[data-range]'))) { insRange = +b.dataset.range; renderView(); return; }
  if ((b = t.closest('[data-edit]'))) return openEdit(b.dataset.edit);
  if (t.closest('#addSession')) return openEdit(null);
  if (t.closest('#moreLog')) { logLimit += 80; renderView(); return; }
  if ((b = t.closest('[data-go]'))) { setTab(b.dataset.go); }
});

/* ---------- Insights ---------- */
const fmtDay = (ymd, o = { weekday: 'short', month: 'short', day: 'numeric' }) => { const p = Q.parseYMD(ymd); return p ? new Date(p.y, p.m - 1, p.d).toLocaleDateString('en-US', o) : ymd; };
const WD1 = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function insightsHTML() {
  if (!S.sessions.length && !S.active) {
    return `<div class="card empty"><h2>Nothing to chart yet</h2><p>Once you save a session, this page fills with your rings, streaks and calendar. Start one from Today.</p><button class="cta" data-go="today" type="button">Go to Today</button></div>`;
  }
  const dt = Q.dayTotals(S.sessions, insSid);
  const dtAll = Q.dayTotals(S.sessions);
  const t = todayYmd();
  const dayGoalMs = (insSid ? Math.max(sedar(insSid).goal || sedar(insSid).min, 5) : S.settings.dayGoal) * MIN;
  const filt = `<div class="fchips" role="group" aria-label="Filter by seder"><button type="button" class="fc${insSid ? '' : ' on'}" data-sf="">All</button>${S.sedarim.map((x) => `<button type="button" class="fc${insSid === x.id ? ' on' : ''}" data-sf="${esc(x.id)}">${dot(x.id)}${esc(x.name)}</button>`).join('')}</div>`;

  // today's rings
  const todayE = dtAll[t] || { by: {} };
  const ringSeds = S.sedarim.filter((x) => (!insSid || x.id === insSid) && ((todayE.by[x.id] || 0) > 0 || x.goal > 0));
  const rings = ringSeds.length ? `<div class="mini-rings">${ringSeds.map((x) => {
    const ms = todayE.by[x.id] || 0, ref = (x.goal || x.min || 15) * MIN, f = Math.min(1, ms / ref);
    return `<div class="mr">${ring(76, 11, [{ f, cls: 'c' + x.c }])}<b>${esc(Q.fmtDur(ms))}</b><small>${esc(x.name)}</small><em class="mono">${x.goal ? 'goal ' + x.goal + ' min' : 'min ' + x.min}</em></div>`;
  }).join('')}</div>` : '<p class="cap">Nothing learned yet today. Rings appear as soon as you log time.</p>';

  // streaks
  const rows = [];
  const mkStreak = (label, sid, minMin, sub) => {
    const d = Q.dayTotals(S.sessions, sid);
    const st = Q.streakOf(d, t, minMin * MIN);
    const strip = Q.lastDays(d, t, 14).map((x) => `<i class="sq${x.total >= minMin * MIN ? ' on' : ''}${x.ymd === t ? ' now' : ''}" title="${esc(fmtDay(x.ymd))}"></i>`).join('');
    return { st, html: `<li class="streak"><div class="st-h">${label}<span class="mono">${sub}</span></div><div class="st-n"><b>${st.streak}</b><small>day${st.streak === 1 ? '' : 's'}</small></div><div class="strip" aria-hidden="true">${strip}</div><div class="st-b mono">best ${st.best}${st.todayMet ? ' · today counted' : ''}</div></li>` };
  };
  if (!insSid) rows.push(mkStreak('<span class="any-dot"></span>Any seder', null, S.settings.dayMin, `from ${S.settings.dayMin} min/day`));
  for (const x of S.sedarim) {
    if (insSid && x.id !== insSid) continue;
    if (!(x.min > 0)) continue;
    rows.push(mkStreak(`${dot(x.id)}${esc(x.name)}`, x.id, x.min, `from ${x.min} min/day`));
  }
  rows.sort((a, b) => b.st.streak - a.st.streak);

  // week bars
  const ld = Q.lastDays(dt, t, 7);
  const wkTotal = ld.reduce((n, x) => n + x.total, 0);
  const maxV = Math.max(dayGoalMs, ...ld.map((x) => x.total));
  const W = 320, H = 150, bw = 30, gap = (W - 7 * bw) / 8, base = 124, top = 18;
  const bars = ld.map((x, i) => {
    const x0 = gap + i * (bw + gap);
    let y = base, segs = '';
    for (const [sid, ms] of Object.entries(x.by).sort((a, b) => b[1] - a[1])) { const h = (ms / maxV) * (base - top); y -= h; segs += `<rect class="bar c${sedar(sid).c}" x="${x0}" y="${y.toFixed(1)}" width="${bw}" height="${Math.max(0, h - 1).toFixed(1)}" rx="3"/>`; }
    const lbl = x.total ? `<text class="bv" x="${x0 + bw / 2}" y="${(y - 5).toFixed(1)}" text-anchor="middle">${x.total >= HOUR ? (x.total / HOUR).toFixed(1) + 'h' : Math.round(x.total / MIN)}</text>` : '';
    return `<g><rect class="slot" x="${x0}" y="${top}" width="${bw}" height="${base - top}" rx="3"/>${segs}${lbl}<text class="bl${x.ymd === t ? ' now' : ''}" x="${x0 + bw / 2}" y="${base + 18}" text-anchor="middle">${WD1[x.wd]}</text></g>`;
  }).join('');
  const goalY = base - (dayGoalMs / maxV) * (base - top);
  const week = `<svg class="bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="Minutes learned per day, last 7 days. Total ${esc(Q.fmtDur(wkTotal))}."><line class="goalline" x1="0" x2="${W}" y1="${goalY.toFixed(1)}" y2="${goalY.toFixed(1)}"/>${bars}</svg>`;

  // month heat calendar
  const grid = Q.monthGrid(monthY, monthM);
  const heat = grid.map((w) => w.map((c) => {
    if (!c) return '<span class="cell empty"></span>';
    const ms = totalOnDt(dt, c), lv = Q.heatLevel(ms, dayGoalMs), fut = c > t;
    return `<button type="button" class="cell h${lv}${c === t ? ' now' : ''}${c === monthSel ? ' sel' : ''}${fut ? ' fut' : ''}" data-cell="${c}" aria-label="${esc(fmtDay(c, { weekday: 'long', month: 'long', day: 'numeric' }))}, ${ms ? esc(Q.fmtDur(ms)) : 'nothing'}"><span>${+c.slice(8)}</span></button>`;
  }).join('')).join('');
  const monthName = new Date(monthY, monthM - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const nowYM = t.slice(0, 7), isNow = `${monthY}-${Q.pad2(monthM)}` === nowYM;
  let detail = '<p class="cap">Tap a day for the details.</p>';
  if (monthSel) {
    const e = dt[monthSel];
    detail = `<p class="detail"><b>${esc(fmtDay(monthSel, { weekday: 'long', month: 'long', day: 'numeric' }))}</b> · ${e ? esc(Q.fmtDur(e.total)) : 'nothing logged'}${e ? '<br><span>' + Object.entries(e.by).sort((a, b) => b[1] - a[1]).map(([sid, ms]) => `${dot(sid)}${esc(sedar(sid).name)} ${esc(Q.fmtDur(ms))}`).join('</span><span>') + '</span>' : ''}</p>`;
  }
  const monthTotal = Object.entries(dt).filter(([k]) => k.startsWith(`${monthY}-${Q.pad2(monthM)}`)).reduce((n, [, e]) => n + e.total, 0);

  // totals by seder
  const from = insRange ? Q.shiftYMD(t, -(insRange - 1)) : null;
  const tb = Q.totalsBySeder(dtAll, from, null);
  const tbRows = Object.entries(tb).filter(([sid]) => !insSid || sid === insSid).sort((a, b) => b[1] - a[1]);
  const tbMax = tbRows.length ? tbRows[0][1] : 1, tbSum = tbRows.reduce((n, [, v]) => n + v, 0);
  const totals = tbRows.length ? tbRows.map(([sid, ms]) => `<li><div class="tb-h">${dot(sid)}<span>${esc(sedar(sid).name)}</span><b>${esc(Q.fmtDur(ms))}</b></div><div class="tb-bar"><i class="c${sedar(sid).c}" style="width:${Math.max(2, Math.round(ms / tbMax * 100))}%"></i></div><small class="mono">${Math.round(ms / tbSum * 100)}%</small></li>`).join('') : '<li class="cap">Nothing in this range.</li>';

  // bests
  const bs = Q.bests(S.sessions.filter((x) => !insSid || x.sid === insSid), dt, (insSid ? sedar(insSid).min : S.settings.dayMin) * MIN, t);
  const tile = (k, v, s) => `<div class="tile"><span class="lab mono">${k}</span><b>${v}</b><small>${s}</small></div>`;
  const bestsHTML = `<div class="tiles">
    ${tile('Longest session', bs.longest ? esc(Q.fmtDur(bs.longest.d)) : '–', bs.longest ? esc(fmtDay(Q.ymdOf(bs.longest.s)) + ' · ' + sedar(bs.longest.sid).name) : '')}
    ${tile('Best day', bs.bestDay ? esc(Q.fmtDur(bs.bestDay.ms)) : '–', bs.bestDay ? esc(fmtDay(bs.bestDay.ymd)) : '')}
    ${tile('Best week', bs.bestWeek ? esc(Q.fmtDur(bs.bestWeek.ms)) : '–', bs.bestWeek ? esc('from ' + fmtDay(bs.bestWeek.start)) : '')}
    ${tile('Longest streak', `${bs.longestStreak} day${bs.longestStreak === 1 ? '' : 's'}`, 'at your minimum')}
    ${tile('All time', esc(Q.fmtDur(bs.total)), `${bs.sessions} session${bs.sessions === 1 ? '' : 's'}`)}
    ${tile('Days learned', String(bs.days), 'with any time logged')}
  </div>`;

  return `${filt}
  <section class="card"><h2 class="lab mono">Today</h2>${rings}</section>
  <section class="card"><h2 class="lab mono">Streaks</h2><ul class="streaks">${rows.map((r) => r.html).join('')}</ul><p class="cap">A day counts when you reach the minimum for that seder. Change minimums in the gear.</p></section>
  <section class="card"><div class="row-h"><h2 class="lab mono">Last 7 days</h2><span class="mono dim">${esc(Q.fmtDur(wkTotal))}</span></div>${week}<p class="cap">Dashed line is ${insSid ? 'the goal' : 'your daily goal'}, ${esc(Q.fmtDur(dayGoalMs))}.</p></section>
  <section class="card"><div class="row-h"><h2 class="lab mono">${esc(monthName)}</h2><div class="mnav"><button type="button" class="step" data-mnav="-1" aria-label="Previous month">${IC.chev}</button><button type="button" class="step r" data-mnav="1" aria-label="Next month"${isNow ? ' disabled' : ''}>${IC.chev}</button></div></div>
    <div class="wdays mono" aria-hidden="true">${WD1.map((x) => `<span>${x}</span>`).join('')}</div><div class="heat">${heat}</div>
    <div class="legend mono" aria-hidden="true"><span>less</span><i class="cell h0"></i><i class="cell h1"></i><i class="cell h2"></i><i class="cell h3"></i><i class="cell h4"></i><span>goal met</span></div>
    ${detail}<p class="cap">${esc(Q.fmtDur(monthTotal))} this month.</p></section>
  <section class="card"><div class="row-h"><h2 class="lab mono">By seder</h2><div class="rchips">${[[7, '7 days'], [30, '30 days'], [0, 'All']].map(([v, l]) => `<button type="button" class="gchip${insRange === v ? ' on' : ''}" data-range="${v}">${l}</button>`).join('')}</div></div><ul class="totals">${totals}</ul></section>
  <section class="card"><h2 class="lab mono">Personal bests</h2>${bestsHTML}</section>`;
}
const totalOnDt = (dt, ymd) => (dt[ymd] ? dt[ymd].total : 0);

/* ---------- Log ---------- */
function logHTML() {
  const list = [...S.sessions].sort((a, b) => b.s - a.s);
  const add = `<button class="ghost wide addbtn" id="addSession" type="button">+ Add a session by hand</button>`;
  if (!list.length) return `<div class="card empty"><h2>No sessions yet</h2><p>Saved sessions show up here, newest first. Tap one to edit its seder, time or note.</p><button class="cta" data-go="today" type="button">Start learning</button></div>${add}`;
  const t = todayYmd(), y = Q.shiftYMD(t, -1);
  const groups = [];
  for (const x of list.slice(0, logLimit)) {
    const ymd = Q.ymdOf(x.s);
    let g = groups[groups.length - 1];
    if (!g || g.ymd !== ymd) { g = { ymd, items: [] }; groups.push(g); }
    g.items.push(x);
  }
  const html = groups.map((g) => {
    const total = g.items.reduce((n, x) => n + x.d, 0);
    const name = g.ymd === t ? 'Today' : g.ymd === y ? 'Yesterday' : fmtDay(g.ymd);
    return `<section class="card lg"><div class="row-h"><h2 class="lab mono">${esc(name)}</h2><span class="mono dim">${esc(Q.fmtDur(total))}</span></div><ul class="sess">${g.items.map((x) => `<li><button type="button" class="srow" data-edit="${esc(x.id)}" aria-label="Edit session">${dot(x.sid)}<span class="s-main"><b>${esc(sedar(x.sid).name)}</b>${x.note ? `<small>${esc(x.note)}</small>` : ''}</span><span class="s-end"><b class="mono">${esc(Q.fmtDur(x.d))}</b><small class="mono">${esc(fmtTime(x.s))}</small></span></button></li>`).join('')}</ul></section>`;
  }).join('');
  return `${add}${html}${list.length > logLimit ? '<button class="ghost wide" id="moreLog" type="button">Show older sessions</button>' : ''}`;
}
const fmtTime = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/* ---------- edit / add a session ---------- */
function openEdit(id) {
  const ex = id ? S.sessions.find((x) => x.id === id) : null;
  const base = ex || { s: nowMs() - 30 * MIN, d: 30 * MIN, sid: S.settings.lastSid, note: '' };
  openSheet(`<h2 class="sh-h">${ex ? 'Edit session' : 'Add a session'}</h2>
    <label class="fld"><span class="lab mono">Seder</span><select id="edSid">${S.sedarim.map((x) => `<option value="${esc(x.id)}"${x.id === base.sid ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}${sedar(base.sid).gone ? `<option value="${esc(base.sid)}" selected>Removed seder</option>` : ''}</select></label>
    <div class="three"><label class="fld"><span class="lab mono">Date</span><input id="edDate" type="date" value="${Q.ymdOf(base.s)}" max="${Q.ymdOf(nowMs())}"></label>
    <label class="fld"><span class="lab mono">Start</span><input id="edTime" type="time" value="${Q.hhmmOf(base.s)}"></label>
    <label class="fld"><span class="lab mono">Minutes</span><input id="edMin" type="number" inputmode="numeric" min="1" max="1440" value="${Math.max(1, Math.round(base.d / MIN))}"></label></div>
    <label class="fld"><span class="lab mono">Note</span><input id="edNote" type="text" maxlength="140" value="${esc(base.note)}" placeholder="optional" autocomplete="off"></label>
    <p class="err" id="edErr" role="alert"></p>
    <button class="cta" id="edSave" type="button">${ex ? 'Save changes' : 'Add session'}</button>
    ${ex ? '<button class="ghost danger wide" id="edDel" type="button">Delete session</button>' : ''}`, () => {
    $('edSave').onclick = () => {
      const s = Q.localMs($('edDate').value, $('edTime').value), m = Math.round(+$('edMin').value);
      const err = (t) => { $('edErr').textContent = t; };
      if (s == null) return err('Pick a date and a start time.');
      if (!(m >= 1 && m <= 1440)) return err('Minutes must be between 1 and 1440.');
      if (s > nowMs() + MIN) return err('That start time is in the future.');
      const rec = { id: ex ? ex.id : Q.newId(), s, d: m * MIN, sid: $('edSid').value, note: $('edNote').value.trim().slice(0, 140) };
      if (ex) S.sessions[S.sessions.indexOf(ex)] = rec; else S.sessions.push(rec);
      save(); closeSheet(true); renderAll(); toast(ex ? 'Session updated' : 'Session added');
    };
    const del = $('edDel');
    if (del) del.onclick = () => {
      const i = S.sessions.indexOf(ex); if (i < 0) return;
      S.sessions.splice(i, 1); save(); closeSheet(true); renderAll();
      toast('Session deleted', { label: 'Undo', run: () => { S.sessions.push(ex); save(); renderAll(); } });
    };
  });
}

/* ---------- banner: "log your Tehillim?" ---------- */
let offerMins = 15;
function offer() {
  const pings = lsJSON(PINGS, []);
  const p = Array.isArray(pings) ? pings.find((x) => x && x.kind === 'tehillim' && typeof x.at === 'number') : null;
  if (p) return { kind: 'ping', p, what: String(p.what || 'Tehillim').slice(0, 60) };
  const out = lsJSON(OUT, null);
  if (out && typeof out.at === 'number') {
    const age = nowMs() - out.at;
    if (age > 6 * HOUR) { lsDel(OUT); return null; }
    if (age > 30000) return { kind: 'out', out, what: 'Tehillim', mins: Math.min(60, Math.max(5, Math.round(age / MIN / 5) * 5)) };
  }
  return null;
}
function renderBanner() {
  const b = $('banner'), o = offer();
  if (!o) { b.innerHTML = ''; return; }
  if (o.kind === 'out' && b.dataset.k !== 'out') offerMins = o.mins;
  b.dataset.k = o.kind;
  b.innerHTML = `<section class="card offer"><p class="o-t"><b>${o.kind === 'ping' ? `You finished today's Tehillim` : 'Back from Tehillim?'}</b><span>${esc(o.what)}. Log it as a session?</span></p>
    <div class="o-m" role="group" aria-label="Minutes">${[5, 10, 15, 20, 30, 45].map((m) => `<button type="button" class="gchip${m === offerMins ? ' on' : ''}" data-om="${m}" aria-pressed="${m === offerMins}">${m} min</button>`).join('')}</div>
    <div class="two"><button class="cta small" id="offLog" type="button">Log ${offerMins} min</button><button class="ghost" id="offNo" type="button">Not now</button></div></section>`;
}
$('banner').addEventListener('click', (e) => {
  const m = e.target.closest('[data-om]');
  if (m) { offerMins = +m.dataset.om; renderBanner(); return; }
  const o = offer();
  if (e.target.closest('#offNo')) { clearOffer(); renderBanner(); return; }
  if (e.target.closest('#offLog') && o) {
    const sid = S.sedarim.find((x) => x.id === 'tehillim') ? 'tehillim' : (S.sedarim.find((x) => /tehillim/i.test(x.name)) || {}).id || S.settings.lastSid;
    const d = offerMins * MIN;
    const s = o.kind === 'ping' ? Math.min(o.p.at, nowMs()) - d : Math.max(o.out.at, nowMs() - d);
    const rec = { id: Q.newId(), s: Math.max(946684800000, s), d, sid, note: o.what };
    S.sessions.push(rec); save(); clearOffer(); renderAll(); toast(`Logged ${offerMins} min of ${sedar(sid).name}`, { label: 'Undo', run: () => { S.sessions = S.sessions.filter((x) => x.id !== rec.id); save(); renderAll(); } });
  }
});
function clearOffer() {
  const pings = lsJSON(PINGS, []);
  const rest = Array.isArray(pings) ? pings.filter((x) => !(x && x.kind === 'tehillim')) : [];
  if (rest.length) lsSet(PINGS, JSON.stringify(rest)); else lsDel(PINGS);
  lsDel(OUT);
}

/* ---------- settings, backup, reset ---------- */
$('openSettings').onclick = openSettings;
function sedarRow(x) {
  return `<li class="sr" data-id="${esc(x.id)}">
    <div class="sr-top"><button type="button" class="dotbtn" data-cyc aria-label="Change colour">${dot(x.id)}</button><input class="sr-name" type="text" maxlength="40" value="${esc(x.name)}" aria-label="Name"><button type="button" class="nm-x" data-rm aria-label="Remove ${esc(x.name)}">&#x2715;</button></div>
    <div class="sr-nums"><label>Goal<input type="number" inputmode="numeric" min="0" max="1440" value="${x.goal}" data-f="goal" aria-label="Goal in minutes for ${esc(x.name)}"><em>min</em></label><label>Streak from<input type="number" inputmode="numeric" min="0" max="1440" value="${x.min}" data-f="min" aria-label="Streak minimum in minutes for ${esc(x.name)}"><em>min/day</em></label></div></li>`;
}
function openSettings() {
  openSheet(`<h2 class="sh-h">Seder settings</h2>
    <h3 class="lab mono">Your sedarim</h3>
    <ul class="srs" id="srs">${S.sedarim.map(sedarRow).join('')}</ul>
    <button class="ghost wide" id="addSeder" type="button">+ Add a seder</button>
    <h3 class="lab mono">Days</h3>
    <div class="nums2"><label class="fld"><span class="lab mono">Daily goal (big ring)</span><span class="inl"><input id="setGoal" type="number" inputmode="numeric" min="5" max="1440" value="${S.settings.dayGoal}"><em>min</em></span></label>
    <label class="fld"><span class="lab mono">Any-seder streak from</span><span class="inl"><input id="setMin" type="number" inputmode="numeric" min="1" max="1440" value="${S.settings.dayMin}"><em>min/day</em></span></label></div>
    <button class="tog" type="button" role="switch" id="setWake" aria-checked="${S.settings.wake}"><span><b>Keep the screen awake while timing</b><small>${'wakeLock' in navigator ? 'Only while a session is running' : "This browser can't do it; the timer still counts by the clock"}</small></span><i aria-hidden="true"></i></button>
    <h3 class="lab mono">Backup</h3>
    <div class="two"><button class="ghost" id="exJson" type="button">Export JSON</button><button class="ghost" id="exCsv" type="button">Export CSV</button></div>
    <button class="ghost wide" id="imp" type="button">Import a JSON backup</button>
    <p class="cap">Import adds sessions you don't already have; nothing is overwritten.</p>
    <h3 class="lab mono">Danger zone</h3>
    <button class="ghost danger wide" id="reset" type="button">Reset everything…</button>
    <button class="cta" id="shDone" type="button">Done</button>`, (b) => {
    const list = $('srs');
    const find = (el) => S.sedarim.find((x) => x.id === el.closest('.sr').dataset.id);
    list.addEventListener('input', (e) => {
      const x = find(e.target); if (!x) return;
      if (e.target.classList.contains('sr-name')) x.name = e.target.value.slice(0, 40) || x.name;
      else if (e.target.dataset.f) { const v = Math.max(0, Math.min(1440, Math.round(+e.target.value) || 0)); x[e.target.dataset.f] = v; }
      save();
    });
    list.addEventListener('click', (e) => {
      const li = e.target.closest('.sr'); if (!li) return;
      const x = find(e.target);
      if (e.target.closest('[data-cyc]')) { x.c = (x.c + 1) % Q.COLORS; li.querySelector('.dot').className = `dot c${x.c}`; save(); }
      if (e.target.closest('[data-rm]')) {
        if (S.sedarim.length < 2) { toast('Keep at least one seder'); return; }
        const i = S.sedarim.indexOf(x); S.sedarim.splice(i, 1);
        if (S.settings.lastSid === x.id) S.settings.lastSid = S.sedarim[0].id;
        save(); li.remove();
        toast(`${x.name} removed (its sessions stay in the log)`, { label: 'Undo', run: () => { S.sedarim.splice(i, 0, x); save(); renderAll(); if (sheetOpen) openSettings(); } });
      }
    });
    $('addSeder').onclick = () => {
      if (S.sedarim.length >= 40) return;
      const x = { id: Q.newId(), name: 'New seder', c: S.sedarim.length % Q.COLORS, goal: 0, min: 10 };
      S.sedarim.push(x); save(); list.insertAdjacentHTML('beforeend', sedarRow(x));
      const inp = list.lastElementChild.querySelector('.sr-name'); inp.focus(); inp.select();
    };
    $('setGoal').oninput = (e) => { S.settings.dayGoal = Math.max(5, Math.min(1440, Math.round(+e.target.value) || 60)); save(); };
    $('setMin').oninput = (e) => { S.settings.dayMin = Math.max(1, Math.min(1440, Math.round(+e.target.value) || 15)); save(); };
    $('setWake').onclick = (e) => { S.settings.wake = !S.settings.wake; e.currentTarget.setAttribute('aria-checked', String(S.settings.wake)); save(); wake(running()); };
    $('exJson').onclick = () => download(`seder-${todayYmd()}.json`, Q.exportJSON(S), 'application/json');
    $('exCsv').onclick = () => download(`seder-${todayYmd()}.csv`, '﻿' + Q.exportCSV(S), 'text/csv');
    $('imp').onclick = () => $('importFile').click();
    $('reset').onclick = openReset;
    $('shDone').onclick = () => closeSheet();
  }, () => renderAll());
}
function download(name, text, type) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`Saved ${name}`);
  } catch (e) { toast("This browser wouldn't save the file"); }
}
$('importFile').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    if (f.size > 8e6) throw new Error('big');
    const m = Q.mergeImport(S, JSON.parse(await f.text()));
    if (!m) throw new Error('shape');
    S.sedarim = m.sedarim; S.sessions = m.sessions; save(); renderAll();
    if (sheetOpen) closeSheet(true);
    toast(`Added ${m.added} session${m.added === 1 ? '' : 's'}${m.skipped ? `, skipped ${m.skipped} you already had` : ''}`);
  } catch (err) { toast("That file isn't a Seder backup"); }
});
function openReset() {
  openSheet(`<h2 class="sh-h">Reset everything?</h2>
    <p class="cap tight">This erases every session, streak and your seder list on this device. Export a backup first if you might want it back. It can't be undone.</p>
    <label class="fld"><span class="lab mono">Type RESET to confirm</span><input id="rsIn" type="text" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="RESET"></label>
    <button class="cta danger" id="rsGo" type="button" disabled>Erase everything</button>
    <button class="ghost wide" id="rsNo" type="button">Cancel</button>`, () => {
    $('rsIn').oninput = (e) => { $('rsGo').disabled = e.target.value.trim() !== 'RESET'; };
    $('rsGo').onclick = () => {
      if ($('rsIn').value.trim() !== 'RESET') return;
      S = Q.normalizeState(null); save(); closeSheet(true); wake(false); renderAll(); toast('Everything was reset');
    };
    $('rsNo').onclick = () => closeSheet();
  });
}

/* ---------------------------------------------------------------- lifecycle */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { if (running()) wake(true); lastShown = -1; tick(true); renderBanner(); refreshDay(); }
});
addEventListener('pageshow', (e) => { if (e.persisted) { renderAll(); refreshDay(); } });
async function refreshDay() {
  try { const d = await effectiveDay(nowMs()); const ch = d.ymd !== day.ymd; day = d; if (ch || tab === 'today') { if (!S.active && tab === 'today') renderView(); } } catch (e) {}
}
if (S.active) { goalShown = S.active.goal > 0 && Q.elapsedOf(S.active, nowMs()) >= S.active.goal; if (running()) wake(true); }
renderAll();
refreshDay();
