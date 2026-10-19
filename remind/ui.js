// /remind page: big live countdown cards, add/edit sheet, in-page alerts, backup.
// The engine (recurrence, Hebrew dates, zman-relative, storage) is remind.js.
import { createClock } from '/zmanim/sync.js?v=0af1f5a734';
import * as R from './remind.js?v=a8a7c39c62';
import { loadZmanSource, zmanPlace } from './zsource.js?v=ae99534ce1';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RM = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => RM.matches;
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const SET_KEY = 'szv-remind-set';

const clock = createClock();
const now = () => clock.now();
const pad2 = (n) => String(n).padStart(2, '0');

/* ------------------------------------------------------------------ state */
let items = R.load().items;
let P = [];                 // pending state per item, "next up" first
let byId = new Map();
let sig = '';
let settings = (() => { try { const s = JSON.parse(lsGet(SET_KEY)); return { notify: !!(s && s.notify), sound: !s || s.sound !== false, vib: !s || s.vib !== false }; } catch (e) { return { notify: false, sound: true, vib: true }; } })();
const saveSettings = () => lsSet(SET_KEY, JSON.stringify(settings));

function persist() { R.save(items); }
function recompute() {
  P = R.ordered(items, now());
  byId = new Map(P.map((p) => [p.id, p]));
}

/* ------------------------------------------------------------------ formatting */
const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const dayYFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
function whenText(ms) {
  const same = new Date(ms).getFullYear() === new Date(now()).getFullYear();
  return `${(same ? dayFmt : dayYFmt).format(ms)} · ${timeFmt.format(ms)}`;
}
function agoText(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60 ? (m % 60) + ' min ' : ''}ago`;
  return `${Math.floor(h / 24)} days ago`;
}
const ICON = {
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>',
};
const emojiBox = (p) => (p.emoji ? `<span class="em" aria-hidden="true">${esc(p.emoji)}</span>` : `<span class="em plain" aria-hidden="true">${esc((p.title || '?').trim().slice(0, 1).toUpperCase())}</span>`);
const nthText = (p, item) => {
  if (p.nth == null || p.nth < 1) return '';
  if (item && item.kind === 'hebrew' && item.heb.type === 'yahrzeit') return ` · ${R.ordinalOf(p.nth)} yahrzeit`;
  return ` · turns ${p.nth}`;
};

/* ------------------------------------------------------------------ render */
function card(p, hero) {
  const it = items.find((x) => x.id === p.id);
  if (!it) return '';
  const rep = it.kind === 'once' ? '' : `<span class="rep">${esc(R.describe(it))}</span>`;
  const t = now();
  const doneLabel = p.due ? 'Done' : it.kind === 'once' ? 'Mark done' : 'Skip this one';
  return `<article class="rc c${p.color}${hero ? ' hero' : ''}${p.due ? ' due' : ''}" data-id="${esc(p.id)}">
    <div class="rc-h" data-act="edit">
      ${emojiBox(p)}
      <div class="rc-t">
        <h2>${esc(p.title)}${p.snoozed ? '<span class="pill">snoozed</span>' : ''}</h2>
        <p class="when">${esc(whenText(p.atMs))}${esc(nthText(p, it))}${rep ? '<br>' + rep : ''}</p>
      </div>
      <button class="ico" type="button" data-act="edit" aria-label="Edit ${esc(p.title)}">${ICON.edit}</button>
    </div>
    <div class="cd" data-at="${p.atMs}" role="timer" aria-label="Time left">
      <div><b data-u="d">0</b><small>days</small></div><div><b data-u="h">0</b><small>hrs</small></div>
      <div><b data-u="m">0</b><small>min</small></div><div><b data-u="s">0</b><small>sec</small></div>
    </div>
    <div class="dueline" data-at="${p.atMs}"><b>Due now</b><small data-ago></small></div>
    <div class="acts">
      <button class="btn${p.due ? ' primary' : ''}" type="button" data-act="done">${doneLabel}</button>
      ${p.due ? '<button class="btn" type="button" data-act="snooze">Snooze</button>' : ''}
    </div>
  </article>`;
}

function emptyHTML() {
  return `<div class="empty">
    <h2>Nothing counting down</h2>
    <p>Add a birthday, a yahrzeit, a weekly call, or &ldquo;18 minutes before candle lighting&rdquo;.</p>
    <div class="quick">
      <button class="btn" type="button" data-quick="in10">In 10 minutes</button>
      <button class="btn" type="button" data-quick="tomorrow">Tomorrow 9 AM</button>
      <button class="btn" type="button" data-quick="candles">Before candle lighting</button>
      <button class="btn" type="button" data-quick="birthday">Hebrew birthday</button>
    </div>
  </div>`;
}

function render() {
  const done = items.filter((i) => i.kind === 'once' && i.doneAt).sort((a, b) => b.doneAt - a.doneAt).slice(0, 8);
  let h = '';
  if (!P.length) h += emptyHTML();
  else {
    h += `<div class="lab">Next up</div>${card(P[0], true)}`;
    if (P.length > 1) h += `<div class="lab">Coming up</div>${P.slice(1).map((p) => card(p, false)).join('')}`;
  }
  if (done.length) {
    h += `<div class="lab">Done</div><div class="done-list">${done.map((i) => `<div class="done-row" data-id="${esc(i.id)}"><span class="t">${esc((i.emoji ? i.emoji + ' ' : '') + i.title)}</span><button class="btn ghost" type="button" data-act="reopen">Undo</button><button class="btn ghost danger" type="button" data-act="remove">Delete</button></div>`).join('')}</div>`;
  }
  $('stage').innerHTML = h;
  sig = signature();
  tick(true);
}
const signature = () => P.map((p) => `${p.id}|${p.atMs}|${p.due ? 1 : 0}|${p.snoozed ? 1 : 0}`).join(',') + '#' + items.map((i) => i.id + i.title + (i.doneAt || '')).join(',');

/* ------------------------------------------------------------------ live tick */
const fired = new Map();
function tick(force) {
  const t = now();
  // someone crossed zero (or the list changed under us): recompute and redraw
  if (!force && P.some((p) => (p.atMs <= t) !== p.due)) { recompute(); if (signature() !== sig) { render(); return; } }
  for (const el of $('stage').querySelectorAll('.rc')) {
    const p = byId.get(el.dataset.id);
    if (!p) continue;
    const diff = p.atMs - t;
    const cd = el.querySelector('.cd');
    if (diff > 0) {
      const s = R.splitMs(diff);
      for (const b of cd.querySelectorAll('b')) {
        const v = String(s[b.dataset.u]), z = s[b.dataset.u] === 0 && (b.dataset.u === 'd' || (b.dataset.u === 'h' && s.d === 0));
        if (b.textContent !== v) b.textContent = v;
        b.parentElement.classList.toggle('z', z);
      }
    } else {
      const ago = el.querySelector('[data-ago]');
      const txt = `since ${timeFmt.format(p.atMs)} · ${agoText(-diff)}`;
      if (ago && ago.textContent !== txt) ago.textContent = txt;
    }
  }
  for (const p of P) if (p.atMs <= t) maybeRing(p, t);
  const due = P.find((p) => p.atMs <= t);
  const title = due ? `● ${due.title} · Remind` : 'Remind · SZVTECH';
  if (document.title !== title) document.title = title;
}

/* ------------------------------------------------------------------ alerts (only while this page is open) */
let ac = null, master = null;
function unlockAudio() {
  try {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC(); master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
      const b = ac.createBuffer(1, 1, 22050), src = ac.createBufferSource(); src.buffer = b; src.connect(ac.destination); src.start(0);
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
  } catch (e) { ac = null; }
}
addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
addEventListener('keydown', unlockAudio, { capture: true });
function bell(t0, f, g, dur) {
  for (const [mult, amp, d] of [[1, 1, 1], [2, 0.3, 0.6], [3.01, 0.1, 0.4]]) {
    const o = ac.createOscillator(), gn = ac.createGain();
    o.type = 'sine'; o.frequency.value = f * mult;
    gn.gain.setValueAtTime(0.0001, t0); gn.gain.linearRampToValueAtTime(g * amp, t0 + 0.006); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * d);
    o.connect(gn); gn.connect(master); o.start(t0); o.stop(t0 + dur * d + 0.05);
  }
}
function chime() {
  if (!settings.sound || !ac) return false;
  try {
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    const t0 = ac.currentTime + 0.05;
    for (const [dt, f, g] of [[0, 880, 0.5], [0.18, 1108.73, 0.42], [0.36, 1318.51, 0.4], [0.6, 1760, 0.24]]) bell(t0 + dt, f, g, 1.7);
    return true;
  } catch (e) { return false; }
}
function buzz() {
  if (!settings.vib || reduced() || typeof navigator.vibrate !== 'function') return;   // haptics are skipped under reduced motion
  try { navigator.vibrate([220, 110, 220]); } catch (e) {}
}
const canNotify = () => 'Notification' in window;
function registerSW() { try { if ('serviceWorker' in navigator) navigator.serviceWorker.register('/remind/sw.js', { scope: '/remind/' }).catch(() => {}); } catch (e) {} }
async function notify(title, body, tag) {
  if (!settings.notify || !canNotify() || Notification.permission !== 'granted') return false;
  const o = { body, tag: 'szv-remind-' + tag, renotify: true, silent: false };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration('/remind/') : null;
    if (reg && reg.showNotification) { await reg.showNotification(title, o); return true; }
  } catch (e) {}
  try { new Notification(title, o); return true; } catch (e) { return false; }
}
function ring(p) {
  chime(); buzz();
  if (document.visibilityState !== 'visible') notify(`${p.emoji ? p.emoji + ' ' : ''}${p.title}`, 'Due now', p.id);
}
function maybeRing(p, t) {
  const key = `${p.id}@${p.baseMs}@${p.atMs}`;
  let rec = fired.get(key);
  if (!rec) {
    // only ring if it just became due; something that was already overdue when the page opened stays quiet
    rec = { n: t - p.atMs <= 2 * 60000 ? 0 : 9, t: 0 };
    fired.set(key, rec);
    if (fired.size > 200) fired.delete(fired.keys().next().value);
  }
  if (rec.n < 3 && t - rec.t >= (rec.n === 0 ? 0 : 2 * 60000)) { rec.n++; rec.t = t; ring(p); }
}

/* ------------------------------------------------------------------ toast */
let toastT = 0;
function toast(msg, undo) {
  const el = $('toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button" id="toastUndo">Undo</button>' : ''}`;
  el.hidden = false;
  if (undo) $('toastUndo').onclick = () => { clearTimeout(toastT); el.hidden = true; undo(); };
  clearTimeout(toastT);
  toastT = setTimeout(() => { el.hidden = true; }, undo ? 6500 : 3200);
}

/* ------------------------------------------------------------------ sheet plumbing */
const sheet = $('sheet'), back = $('sheetBack'), body = $('sheetBody');
let lastFocus = null, sheetOn = false;
function openSheet(html) {
  if (!sheetOn) lastFocus = document.activeElement;
  body.innerHTML = html;
  body.scrollTop = 0;
  sheet.hidden = back.hidden = false;
  sheetOn = true;
  requestAnimationFrame(() => { sheet.classList.add('on'); back.classList.add('on'); });
  return body;
}
function closeSheet() {
  if (!sheetOn) return;
  sheetOn = false;
  sheet.classList.remove('on'); back.classList.remove('on');
  setTimeout(() => { if (!sheetOn) { sheet.hidden = back.hidden = true; body.innerHTML = ''; } }, reduced() ? 260 : 460);
  if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
}
back.addEventListener('click', closeSheet);
addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetOn) closeSheet(); });

/* ------------------------------------------------------------------ actions */
const snapshot = () => JSON.parse(JSON.stringify(items));
function commit(next, msg, undoTo) {
  items = next; persist(); recompute(); render();
  if (msg) toast(msg, undoTo ? () => { items = undoTo; persist(); recompute(); render(); } : null);
}
function nextText(it) {
  const p = R.pending(it, now());
  return p ? whenText(p.atMs) : '';
}
function actDone(id) {
  const it = items.find((x) => x.id === id); if (!it) return;
  const before = snapshot();
  const upd = R.ackItem(it, now());
  const next = items.map((x) => (x.id === id ? upd : x));
  const nx = it.kind === 'once' ? '' : nextText(upd);
  commit(next, it.kind === 'once' ? 'Done' : nx ? `Done. Next: ${nx}` : 'Done', before);
}
function snoozeSheet(id) {
  const it = items.find((x) => x.id === id); if (!it) return;
  const t = now(), opts = [];
  opts.push(['10 minutes', t + 10 * 60000], ['1 hour', t + 3600000]);
  const eve = new Date(t); eve.setHours(18, 0, 0, 0);
  if (eve.getTime() - t > 30 * 60000) opts.push(['This evening', eve.getTime()]);
  const tom = new Date(t); tom.setDate(tom.getDate() + 1); tom.setHours(9, 0, 0, 0);
  opts.push(['Tomorrow morning', tom.getTime()]);
  openSheet(`<h3>Snooze &ldquo;${esc(it.title)}&rdquo;</h3><div class="snooze-grid">${opts.map(([l, ms]) => `<button class="btn" type="button" data-sn="${ms}">${l}<small>${esc(timeFmt.format(ms))}</small></button>`).join('')}</div><div class="sheet-acts"><button class="btn wide" type="button" data-close>Cancel</button></div>`);
  body.onclick = (e) => {
    if (e.target.closest('[data-close]')) return closeSheet();
    const b = e.target.closest('[data-sn]'); if (!b) return;
    const before = snapshot();
    const upd = R.snoozeItem(it, +b.dataset.sn, now());
    closeSheet();
    commit(items.map((x) => (x.id === id ? upd : x)), `Snoozed until ${timeFmt.format(+b.dataset.sn)}`, before);
  };
}
function actRemove(id) {
  const before = snapshot();
  commit(items.filter((x) => x.id !== id), 'Deleted', before);
}

$('stage').addEventListener('click', (e) => {
  const q = e.target.closest('[data-quick]');
  if (q) return openEdit(null, quickPreset(q.dataset.quick));
  const b = e.target.closest('[data-act]'); if (!b) return;
  const host = b.closest('[data-id]'); if (!host) return;
  const id = host.dataset.id, a = b.dataset.act;
  if (a === 'edit') openEdit(id);
  else if (a === 'done') actDone(id);
  else if (a === 'snooze') snoozeSheet(id);
  else if (a === 'reopen') { commit(items.map((x) => (x.id === id ? R.reopenItem(x) : x)), 'Back on the list'); }
  else if (a === 'remove') actRemove(id);
});
$('addBtn').addEventListener('click', () => openEdit(null));

/* ------------------------------------------------------------------ add / edit */
const EMOJIS = ['🔔', '⏰', '🎂', '🕯️', '🕍', '📖', '💊', '💧', '📞', '🛒', '🎁', '❤️', '🚗', '🍷', '✈️', '🧘'];
const COLORS = ['violet', 'cyan', 'pink', 'amber', 'green', 'rose'];
const ymdOf = (ms) => R.ymdLocal(ms);
function baseDraft() {
  const t = new Date(now());
  const tom = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
  return {
    id: '', title: '', emoji: '🔔', color: 0, kind: 'once',
    wdate: ymdOf(tom.getTime()), wtime: '09:00', time: '09:00',
    gm: t.getMonth() + 1, gd: t.getDate(), gy: '',
    hType: 'birthday', hdate: '', hafter: false, hm: 7, hd: 1, eve: false,
    days: [5], zkey: 'candleLighting', zoff: 18, zdir: 'before', zdays: [5], zany: false,
    keep: null,
  };
}
function quickPreset(k) {
  const d = baseDraft(), t = now();
  if (k === 'in10') { const at = t + 10 * 60000; Object.assign(d, { title: 'Reminder', emoji: '⏰', wdate: ymdOf(at), wtime: `${pad2(new Date(at).getHours())}:${pad2(new Date(at).getMinutes())}` }); }
  else if (k === 'tomorrow') Object.assign(d, { title: 'Reminder', emoji: '🔔' });
  else if (k === 'candles') Object.assign(d, { kind: 'zman', title: 'Light candles', emoji: '🕯️', color: 3 });
  else if (k === 'birthday') Object.assign(d, { kind: 'hebrew', hType: 'birthday', title: 'Birthday', emoji: '🎂', color: 2 });
  return d;
}
function fromItem(it) {
  const d = baseDraft();
  Object.assign(d, { id: it.id, title: it.title, emoji: it.emoji, color: it.color, kind: it.kind, time: it.time || '09:00', keep: it });
  if (it.kind === 'once') { d.wdate = it.when.slice(0, 10); d.wtime = it.when.slice(11); }
  if (it.kind === 'yearly') Object.assign(d, { gm: it.greg.m, gd: it.greg.d, gy: it.greg.y || '' });
  if (it.kind === 'hebrew') {
    Object.assign(d, { hType: it.heb.type, eve: !!it.eve, hm: it.heb.m, hd: it.heb.d });
    if (it.heb.type !== 'date') {
      d.hdate = hebToYmd(it.heb);
    }
  }
  if (it.kind === 'weekly') d.days = it.days.slice();
  if (it.kind === 'zman') Object.assign(d, { zkey: it.zman.key, zoff: Math.abs(it.zman.offset), zdir: it.zman.offset > 0 ? 'after' : 'before', zdays: it.zman.days ? it.zman.days.slice() : [], zany: !it.zman.days });
  return d;
}
let L = null;   // luach logic, loaded on demand for the Hebrew form
const loadLuach = () => (L ? Promise.resolve(L) : import('/luach/logic.js?v=c065cd15ad').then((m) => (L = m)));
function hebToYmd(h) { return L ? L.absToYMD(L.hebrewToAbs(h.y, h.m, h.d)) : ''; }

function toItem(d) {
  const base = { id: d.id || R.newId(), title: d.title, emoji: d.emoji, color: d.color, kind: d.kind, time: d.time };
  let err = '';
  if (d.kind === 'once') { if (!d.wdate || !d.wtime) err = 'Pick a date and time.'; base.when = `${d.wdate}T${d.wtime}`; delete base.time; }
  if (d.kind === 'yearly') { base.greg = { m: +d.gm, d: +d.gd }; if (d.gy !== '' && +d.gy) base.greg.y = +d.gy; if (+d.gd > 31) err = 'That day does not exist.'; }
  if (d.kind === 'hebrew') {
    if (d.hType === 'date') base.heb = { m: +d.hm, d: +d.hd, type: 'date' };
    else {
      const p = /^(\d{4})-(\d\d)-(\d\d)$/.exec(d.hdate || '');
      if (!p) err = d.hType === 'yahrzeit' ? 'Enter the date of passing.' : 'Enter the date of birth.';
      else { const h = R.hebrewOf(+p[1], +p[2], +p[3], d.hafter); base.heb = { y: h.y, m: h.m, d: h.d, type: d.hType }; }
    }
    base.eve = !!d.eve;
  }
  if (d.kind === 'weekly') { base.days = d.days; if (!d.days.length) err = 'Pick at least one day.'; }
  if (d.kind === 'zman') {
    const off = Math.max(0, Math.min(720, Math.round(+d.zoff || 0))) * (d.zdir === 'after' ? 1 : -1);
    base.zman = { key: d.zkey, offset: off, days: d.zany ? null : d.zdays };
    if (!d.zany && !d.zdays.length) err = 'Pick at least one day, or choose any day it applies.';
  }
  if (err) return { err };
  const it = R.cleanItem(base);
  if (!it) return { err: 'Something in that reminder doesn’t look right.' };
  // keep progress (done / skipped / snoozed) only if the schedule itself did not change
  if (d.keep) {
    const sch = (x) => JSON.stringify([x.kind, x.when, x.time, x.greg, x.heb, x.eve, x.days, x.zman]);
    if (sch(d.keep) === sch(it)) Object.assign(it, { created: d.keep.created, ack: d.keep.ack, doneAt: d.keep.doneAt, snooze: d.keep.snooze });
  }
  return { it };
}

const dayBtns = (sel, key) => R.WD3.map((n, i) => `<button class="day-b" type="button" data-day="${key}:${i}" aria-pressed="${sel.includes(i)}">${n === 'Shabbos' ? 'Shab' : n}</button>`).join('');
const opt = (v, label, cur) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${esc(label)}</option>`;

function kindFields(d) {
  switch (d.kind) {
    case 'once': return `<div class="row2"><label class="f"><span>Date</span><input type="date" data-f="wdate" value="${esc(d.wdate)}"></label><label class="f"><span>Time</span><input type="time" data-f="wtime" value="${esc(d.wtime)}"></label></div>`;
    case 'daily': return `<label class="f"><span>Time</span><input type="time" data-f="time" value="${esc(d.time)}"></label>`;
    case 'weekly': return `<h4>Days</h4><div class="days">${dayBtns(d.days, 'days')}</div><label class="f"><span>Time</span><input type="time" data-f="time" value="${esc(d.time)}"></label>`;
    case 'yearly': return `<div class="row3"><label class="f"><span>Month</span><select data-f="gm">${R.MONTHS.map((m, i) => opt(i + 1, m, d.gm)).join('')}</select></label>
      <label class="f"><span>Day</span><select data-f="gd">${Array.from({ length: 31 }, (_, i) => opt(i + 1, i + 1, d.gd)).join('')}</select></label>
      <label class="f"><span>Time</span><input type="time" data-f="time" value="${esc(d.time)}"></label></div>
      <label class="f"><span>Year it started (optional, shows &ldquo;turns 12&rdquo;)</span><input type="number" inputmode="numeric" data-f="gy" min="1900" max="2200" placeholder="e.g. 2014" value="${esc(d.gy)}"></label>`;
    case 'hebrew': {
      const person = d.hType !== 'date';
      let h = `<div class="seg" role="group" aria-label="Kind of Hebrew date">${[['birthday', 'Birthday'], ['yahrzeit', 'Yahrzeit'], ['date', 'Just a date']].map(([k, l]) => `<button type="button" data-htype="${k}" aria-pressed="${d.hType === k}">${l}</button>`).join('')}</div>`;
      if (person) {
        h += `<label class="f"><span>${d.hType === 'yahrzeit' ? 'Date of passing' : 'Date of birth'} (regular calendar)</span><input type="date" data-f="hdate" value="${esc(d.hdate)}"></label>
        <button class="tog" type="button" role="switch" data-t="hafter" aria-checked="${d.hafter}"><span>${d.hType === 'yahrzeit' ? 'It was after sunset' : 'Born after sunset'}<small>The Hebrew day starts at nightfall</small></span><i></i></button>
        <div class="preview" id="hpv" aria-live="polite">Pick the date to see the Hebrew date.</div>`;
      } else {
        h += `<div class="row2"><label class="f"><span>Month</span><select data-f="hm">${(L ? L.monthsOfYear(5784) : []).map((x) => opt(x.m, x.m === 12 ? 'Adar I (leap years)' : x.m === 13 ? 'Adar (Adar II in a leap year)' : x.name, d.hm)).join('')}</select></label>
        <label class="f"><span>Day</span><select data-f="hd">${Array.from({ length: 30 }, (_, i) => opt(i + 1, i + 1, d.hd)).join('')}</select></label></div>`;
      }
      h += `<label class="f"><span>Time</span><input type="time" data-f="time" value="${esc(d.time)}"></label>
        <button class="tog" type="button" role="switch" data-t="eve" aria-checked="${d.eve}"><span>The evening before<small>For a yahrzeit candle, remind the night it begins</small></span><i></i></button>`;
      return h;
    }
    case 'zman': return `<label class="f"><span>Zman</span><select data-f="zkey">${R.ZMANIM.map((z) => opt(z.key, z.label, d.zkey)).join('')}</select></label>
      <div class="row2"><label class="f"><span>Minutes</span><input type="number" inputmode="numeric" min="0" max="720" data-f="zoff" value="${esc(d.zoff)}"></label>
      <label class="f"><span>&nbsp;</span><select data-f="zdir" aria-label="Before or after">${opt('before', 'before it', d.zdir)}${opt('after', 'after it', d.zdir)}</select></label></div>
      <h4>Which days</h4>
      <button class="tog" type="button" role="switch" data-t="zany" aria-checked="${d.zany}"><span>Any day it applies<small>Candle lighting exists on Fridays and Yom Tov eves</small></span><i></i></button>
      <div class="days" id="zdays"${d.zany ? ' hidden' : ''}>${dayBtns(d.zdays, 'zdays')}</div>
      <p class="note" id="zloc">Uses your saved location (shared with Time and Zmanim) and Chabad.org times.</p>`;
    default: return '';
  }
}

function formHTML(d, isNew) {
  return `<h3>${isNew ? 'New reminder' : 'Edit reminder'}</h3>
  <label class="f"><span>What</span><input type="text" data-f="title" maxlength="80" autocomplete="off" placeholder="Light candles, Call Bubby, Mom's birthday…" value="${esc(d.title)}"></label>
  <h4>Sticker</h4>
  <div class="emojis" role="group" aria-label="Emoji">${['', ...EMOJIS].map((e) => `<button class="em-b" type="button" data-emoji="${esc(e)}" aria-pressed="${d.emoji === e}" aria-label="${e ? 'Emoji ' + esc(e) : 'No emoji'}">${e || '·'}</button>`).join('')}</div>
  <div class="cols" role="group" aria-label="Color">${COLORS.map((c, i) => `<button class="col-b c${i}" type="button" data-color="${i}" aria-pressed="${d.color === i}" aria-label="${c}"></button>`).join('')}</div>
  <h4>When</h4>
  <div class="seg" role="group" aria-label="How it repeats">${R.KINDS.map((k) => `<button type="button" data-kind="${k}" aria-pressed="${d.kind === k}">${R.KIND_LABEL[k]}</button>`).join('')}</div>
  <div id="kf">${kindFields(d)}</div>
  <div class="preview" id="pv" aria-live="polite"></div>
  <p class="note warn" id="err" role="alert" hidden></p>
  ${isNew ? '' : '<h4>Ring even when this page is closed</h4><button class="btn wide" type="button" data-ics style="width:100%">Add to phone calendar</button><p class="note">Downloads a calendar file; your phone&rsquo;s calendar app does the ringing.</p>'}
  <div class="sheet-acts">
    ${isNew ? '<button class="btn" type="button" data-close>Cancel</button>' : '<button class="btn danger" type="button" data-del>Delete</button>'}
    <button class="btn primary wide" type="button" data-save>${isNew ? 'Add reminder' : 'Save'}</button>
  </div>`;
}

let draft = null, pvToken = 0;
async function openEdit(id, preset) {
  const it = id ? items.find((x) => x.id === id) : null;
  if (id && !it) return;
  if (it) { if (it.kind === 'hebrew') await loadLuach(); draft = fromItem(it); }
  else draft = preset || baseDraft();
  if (draft.kind === 'hebrew') await loadLuach();
  const el = openSheet(formHTML(draft, !it));
  wireEdit(el, !it);
  refreshPreview();
}

function wireEdit(el, isNew) {
  const d = draft;
  const setPressed = (sel, on) => el.querySelectorAll(sel).forEach((b) => b.setAttribute('aria-pressed', String(on(b))));
  const delState = { armed: false, t: 0 };
  el.onclick = async (e) => {
    const t = e.target;
    let b;
    if (t.closest('[data-close]')) return closeSheet();
    if ((b = t.closest('[data-emoji]'))) { d.emoji = b.dataset.emoji; setPressed('[data-emoji]', (x) => x.dataset.emoji === d.emoji); return; }
    if ((b = t.closest('[data-color]'))) { d.color = +b.dataset.color; setPressed('[data-color]', (x) => +x.dataset.color === d.color); return; }
    if ((b = t.closest('[data-kind]'))) {
      d.kind = b.dataset.kind;
      if (d.kind === 'hebrew') await loadLuach();
      setPressed('[data-kind]', (x) => x.dataset.kind === d.kind);
      $('kf').innerHTML = kindFields(d);
      refreshPreview();
      return;
    }
    if ((b = t.closest('[data-htype]'))) {
      d.hType = b.dataset.htype;
      if (d.hType === 'yahrzeit') d.eve = true; else if (d.hType === 'birthday') d.eve = false;
      $('kf').innerHTML = kindFields(d);
      refreshPreview();
      return;
    }
    if ((b = t.closest('[data-day]'))) {
      const [key, v] = b.dataset.day.split(':'), n = +v, arr = d[key];
      const i = arr.indexOf(n); if (i >= 0) arr.splice(i, 1); else arr.push(n);
      arr.sort();
      b.setAttribute('aria-pressed', String(arr.includes(n)));
      refreshPreview();
      return;
    }
    if ((b = t.closest('[data-t]'))) {
      const k = b.dataset.t; d[k] = !d[k];
      b.setAttribute('aria-checked', String(d[k]));
      if (k === 'zany') { const z = $('zdays'); if (z) z.hidden = d.zany; }
      refreshPreview();
      return;
    }
    if (t.closest('[data-ics]')) return downloadIcs(d);
    if (t.closest('[data-save]')) return save();
    if ((b = t.closest('[data-del]'))) {
      if (!delState.armed) { delState.armed = true; b.textContent = 'Tap again to delete'; delState.t = setTimeout(() => { delState.armed = false; b.textContent = 'Delete'; }, 3500); return; }
      clearTimeout(delState.t); closeSheet(); actRemove(d.id);
    }
  };
  const onField = (e) => {
    const f = e.target.dataset && e.target.dataset.f;
    if (!f) return;
    const v = e.target.value;
    d[f] = ['gm', 'gd', 'hm', 'hd'].includes(f) ? +v : v;
    refreshPreview();
  };
  el.oninput = onField; el.onchange = onField;
  el.onkeydown = (e) => { if (e.key === 'Enter' && e.target.matches('input[type=text]')) { e.preventDefault(); save(); } };
  function save() {
    const r = toItem(d);
    const er = $('err');
    if (r.err) { er.textContent = r.err; er.hidden = false; return; }
    er.hidden = true;
    const before = snapshot();
    const it = r.it;
    const next = isNew ? [...items, it] : items.map((x) => (x.id === it.id ? it : x));
    closeSheet();
    if (it.kind === 'zman') loadZmanSource(now(), false);
    items = next; persist(); recompute(); render();
    const nx = nextText(it);
    toast(nx ? `Saved. Next: ${nx}` : 'Saved', () => { items = before; persist(); recompute(); render(); });
  }
}

async function refreshPreview() {
  const d = draft, my = ++pvToken;
  const pv = $('pv'); if (!pv) return;
  // Hebrew date line for birthdays / yahrzeits
  const hp = $('hpv');
  if (hp && L) {
    const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(d.hdate || '');
    if (m) { const h = R.hebrewOf(+m[1], +m[2], +m[3], d.hafter); hp.innerHTML = `Hebrew date: <b>${esc(h.en)}</b><br><span class="he">${esc(h.he)}</span>`; }
    else hp.textContent = 'Pick the date to see the Hebrew date.';
  }
  const zl = $('zloc');
  if (d.kind === 'zman') {
    pv.textContent = 'Loading zmanim…';
    const ok = await loadZmanSource(now(), false);
    if (my !== pvToken) return;
    if (zl) zl.innerHTML = ok ? `Uses your saved location: <b>${esc(zmanPlace() || 'default')}</b>. <a href="/zmanim/" style="color:var(--a2)">Change it in Zmanim</a>.` : 'Zmanim aren’t available right now (offline?). Pick a city in <a href="/zmanim/" style="color:var(--a2)">Zmanim</a>.';
    if (!ok) { pv.textContent = 'Can’t work out a time without zmanim for your location.'; return; }
  }
  const r = toItem(d);
  if (r.err) { pv.textContent = ''; pv.hidden = true; return; }
  pv.hidden = false;
  const p = R.pending(r.it, now());
  if (!p) { pv.innerHTML = r.it.kind === 'once' ? 'That time has already passed.' : 'Couldn’t find a coming time for this.'; return; }
  const second = r.it.kind === 'once' ? null : R.occAfter(r.it, p.baseMs);
  pv.innerHTML = `${p.due ? 'This one is due now: ' : 'First alert: '}<b>${esc(whenText(p.atMs))}</b>${second ? `<br>Then <b>${esc(whenText(second.at))}</b>` : ''}`;
}

function downloadIcs(d) {
  const r = toItem(d);
  if (r.err) { const er = $('err'); er.textContent = r.err; er.hidden = false; return; }
  const txt = R.icsFor(r.it, now());
  if (!txt) { toast('Nothing coming up to add'); return; }
  saveFile(`${(r.it.title || 'reminder').replace(/[^\w -]+/g, '').trim().slice(0, 40) || 'reminder'}.ics`, txt, 'text/calendar');
  toast('Calendar file ready. Open it to add the event.');
}
function saveFile(name, text, type) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) { toast('Couldn’t save the file here'); }
}

/* ------------------------------------------------------------------ alerts & backup sheet */
function permissionNote() {
  if (!canNotify()) return 'This browser can’t show notifications. The page still glows and chimes while it is open.';
  if (Notification.permission === 'denied') return 'Notifications are blocked for this site in your browser settings. Allow them there to use this.';
  if (Notification.permission === 'granted' && settings.notify) return 'On. A notification appears if this page is open in the background when something is due.';
  return 'Off. Tap to allow notifications while this page is open in a background tab.';
}
function menuHTML() {
  const vibOk = typeof navigator.vibrate === 'function';
  return `<h3>Alerts &amp; backup</h3>
  <p class="note" style="margin:0 0 12px"><b>Be clear-eyed:</b> a website can&rsquo;t ring when it&rsquo;s closed. These work while this page is open (even in another tab). For must-not-miss things, use <em>Add to phone calendar</em> on the reminder or a phone alarm.</p>
  <button class="tog" type="button" role="switch" data-set="notify" aria-checked="${settings.notify && canNotify() && Notification.permission === 'granted'}"${canNotify() ? '' : ' disabled'}><span>Notifications<small id="permNote">${esc(permissionNote())}</small></span><i></i></button>
  <button class="tog" type="button" role="switch" data-set="sound" aria-checked="${settings.sound}"><span>Chime<small>A soft bell when something is due</small></span><i></i></button>
  ${vibOk ? `<button class="tog" type="button" role="switch" data-set="vib" aria-checked="${settings.vib && !reduced()}"${reduced() ? ' disabled' : ''}><span>Vibrate<small>${reduced() ? 'Off while your phone has reduced motion on' : 'A short buzz when something is due'}</small></span><i></i></button>` : ''}
  <button class="btn" type="button" data-test style="width:100%">Test alert</button>
  <h4>Back up</h4>
  <div class="acts" style="margin-top:0"><button class="btn wide" type="button" data-export>Save file</button><button class="btn wide" type="button" data-copy>Copy</button></div>
  <h4>Restore</h4>
  <label class="f"><span>Choose a backup file</span><input type="file" accept=".json,application/json" data-file></label>
  <label class="f"><span>…or paste it here</span><textarea data-paste spellcheck="false" placeholder='{"items":[…]}'></textarea></label>
  <button class="btn" type="button" data-import style="width:100%">Import</button>
  <p class="note" id="impMsg" role="status"></p>
  <p class="note">Everything stays in this browser (key <span class="mono">szv-remind</span>). Importing adds new reminders and updates ones with the same id.</p>
  <div class="sheet-acts"><button class="btn wide" type="button" data-close>Close</button></div>`;
}
function openMenu() {
  openSheet(menuHTML());
  body.onclick = async (e) => {
    const t = e.target; let b;
    if (t.closest('[data-close]')) return closeSheet();
    if ((b = t.closest('[data-set]'))) {
      const k = b.dataset.set;
      if (b.disabled) return;
      if (k === 'notify') {
        if (settings.notify) settings.notify = false;
        else {
          let p = canNotify() ? Notification.permission : 'denied';
          try { if (p === 'default') p = await Notification.requestPermission(); } catch (er) {}
          settings.notify = p === 'granted';
          if (settings.notify) registerSW();
        }
      } else settings[k] = !settings[k];
      saveSettings();
      b.setAttribute('aria-checked', String(k === 'notify' ? settings.notify && Notification.permission === 'granted' : settings[k]));
      const pn = $('permNote'); if (pn && k === 'notify') pn.textContent = permissionNote();
      syncHonest();
      return;
    }
    if (t.closest('[data-test]')) {
      unlockAudio();
      const ok = chime(); buzz();
      const n = await notify('Remind test', 'This is what a due reminder looks like', 'test');
      toast(ok || n ? 'Test sent' : 'Nothing could play. Check sound and notification settings.');
      return;
    }
    if (t.closest('[data-export]')) { saveFile(`szv-remind-${R.ymdLocal(Date.now())}.json`, R.exportJSON(items), 'application/json'); return; }
    if (t.closest('[data-copy]')) {
      try { await navigator.clipboard.writeText(R.exportJSON(items)); toast('Copied'); } catch (er) { toast('Couldn’t copy. Use Save file instead.'); }
      return;
    }
    if (t.closest('[data-import]')) {
      const txt = body.querySelector('[data-paste]').value.trim();
      doImport(txt);
    }
  };
  body.onchange = (e) => {
    const f = e.target.matches && e.target.matches('[data-file]') ? e.target.files && e.target.files[0] : null;
    if (!f) return;
    if (f.size > 2e6) { $('impMsg').textContent = 'That file is too big to be a backup.'; return; }
    const rd = new FileReader();
    rd.onload = () => doImport(String(rd.result || ''));
    rd.onerror = () => { $('impMsg').textContent = 'Couldn’t read that file.'; };
    rd.readAsText(f);
  };
}
function doImport(txt) {
  const msg = $('impMsg');
  const inc = txt ? R.parseImport(txt) : null;
  if (!inc) { msg.textContent = 'That doesn’t look like a Remind backup.'; return; }
  const before = snapshot();
  const m = R.mergeItems(items, inc);
  items = m.items; persist(); recompute(); render();
  msg.textContent = `Imported: ${m.added} added, ${m.updated} updated.`;
  toast(`Imported ${m.added + m.updated} reminders`, () => { items = before; persist(); recompute(); render(); });
}
$('menuBtn').addEventListener('click', openMenu);

function syncHonest() {
  const btn = $('enableAlerts');
  btn.hidden = !(canNotify() && Notification.permission === 'default');
}
$('enableAlerts').addEventListener('click', async () => {
  try {
    const p = await Notification.requestPermission();
    settings.notify = p === 'granted'; saveSettings();
    if (settings.notify) { registerSW(); toast('Alerts on while this page is open'); }
  } catch (e) {}
  syncHonest();
});

/* ------------------------------------------------------------------ clock status & lifecycle */
const syncEl = $('syncState');
function showSync(st) {
  const ok = !!(st && st.ok);
  syncEl.className = 'sync mono' + (ok ? ' ok' : '');
  syncEl.textContent = ok ? 'Server-synced' : 'Device clock';
}
syncEl.textContent = 'Syncing…';
clock.onChange(showSync);
clock.start();
setTimeout(() => { if (syncEl.textContent === 'Syncing…') showSync(clock.status()); }, 6000);

function reloadFromStorage() {
  const cur = R.load().items;
  if (JSON.stringify(cur) !== JSON.stringify(items)) { items = cur; recompute(); render(); }
}
addEventListener('storage', (e) => { if (e.key === R.KEY) reloadFromStorage(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { reloadFromStorage(); recompute(); tick(); } });

syncHonest();
recompute();
document.body.classList.add('intro');
render();
setTimeout(() => document.body.classList.remove('intro'), 900);
setInterval(() => tick(), 250);
setInterval(() => { recompute(); if (signature() !== sig) render(); }, 30000);
if (settings.notify && canNotify() && Notification.permission === 'granted') registerSW();
if (items.some((i) => i.kind === 'zman')) loadZmanSource(now(), false).then((ok) => { if (ok) { recompute(); render(); } });
if (location.hash === '#new') openEdit(null);
