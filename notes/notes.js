// /notes — private notes on this device (localStorage "szv-notes") + shared notes (anyone with the link can
// read AND edit; stored on the server via /api/notes with versions, conflict handling and expiry).
// No tracking, no third-party calls. Text is only ever put into the page with textContent or esc().
import {
  esc, LANGS, langLabel, langExt, langFromFilename, detectLang, formatJson, diffLines, diffRows, diffStats,
  checklistStats, toggleChecklistLine, renderMarkdown, relTime, timeLeft, fmtBytes, byteLen, slug, deriveTitle,
} from '/notes/lib.js?v=e9d2374159';
import { createEditor } from '/notes/editor.js?v=3b848ff3b9';

const $ = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MAX_SHARE_BYTES = 200 * 1024;
const MAX_FILE_BYTES = 500 * 1024;
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const EXPIRIES = [['1d', '1 day'], ['7d', '1 week'], ['30d', '30 days'], ['keep', 'Keep']];
const EXP_LABEL = { '1d': '1 day', '7d': '1 week', '30d': '30 days', keep: 'Kept' };
const now = () => Date.now();
const rid = () => { try { const a = new Uint8Array(9); crypto.getRandomValues(a); return Array.from(a, (b) => b.toString(36).padStart(2, '0')).join(''); } catch { return Math.random().toString(36).slice(2) + now().toString(36); } };

/* ================================================================== store (localStorage, merged across tabs) */
const KEY = 'szv-notes';
let store = { v: 1, notes: [], prefs: { wrap: true } };
const touched = new Set(), removed = new Set();
let storeBroken = false;
const rtMap = new WeakMap(); // per-note runtime state, never saved
const rt = (n) => { let r = rtMap.get(n); if (!r) rtMap.set(n, (r = {})); return r; };

function normalize(n) {
  if (!n || typeof n !== 'object' || typeof n.lid !== 'string') return null;
  const r = n.remote && typeof n.remote === 'object' && ID_RE.test(String(n.remote.id)) ? { id: String(n.remote.id), version: +n.remote.version || 1, expiry: ['1d', '7d', '30d', 'keep'].includes(n.remote.expiry) ? n.remote.expiry : '30d', expires_at: typeof n.remote.expires_at === 'string' ? n.remote.expires_at : null, gone: !!n.remote.gone } : null;
  return { lid: n.lid, title: String(n.title || '').slice(0, 120), text: String(n.text || ''), lang: n.lang === 'auto' || LANGS.some((l) => l.id === n.lang) ? n.lang : 'auto', pinned: !!n.pinned, created: +n.created || now(), updated: +n.updated || now(), remote: r, dirty: !!n.dirty && !!r };
}
function readDisk() {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (j && j.v === 1 && Array.isArray(j.notes)) return { notes: j.notes.map(normalize).filter(Boolean), prefs: j.prefs && typeof j.prefs === 'object' ? j.prefs : {} };
  } catch { /* none */ }
  return null;
}
function loadStore() {
  const d = readDisk();
  if (d) { store.notes = d.notes; store.prefs = { wrap: true, ...d.prefs }; }
}
let persistTimer = 0;
function schedulePersist(ms = 500) { clearTimeout(persistTimer); persistTimer = setTimeout(persistNow, ms); }
function persistNow() {
  clearTimeout(persistTimer); persistTimer = 0;
  const d = readDisk();
  if (d) { // another tab may have changed other notes: keep its work, apply only what this tab touched
    const mem = new Map(store.notes.map((n) => [n.lid, n]));
    for (const dn of d.notes) {
      if (removed.has(dn.lid) || touched.has(dn.lid)) continue;
      const m = mem.get(dn.lid);
      if (!m) store.notes.push(dn);
      else if (dn.updated > m.updated) Object.assign(m, dn);
    }
    store.notes = store.notes.filter((n) => !removed.has(n.lid));
  }
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, notes: store.notes.map(({ lid, title, text, lang, pinned, created, updated, remote, dirty }) => ({ lid, title, text, lang, pinned, created, updated, remote, dirty })), prefs: store.prefs }));
    touched.clear(); removed.clear();
    if (storeBroken) { storeBroken = false; $('storeWarn').hidden = true; }
  } catch {
    if (!storeBroken) { storeBroken = true; $('storeWarn').hidden = false; }
  }
}
const touch = (n) => { touched.add(n.lid); schedulePersist(); if (typeof listSoon === 'function') listSoon(); };

/* ================================================================== small ui helpers */
let toastTimer = 0;
function toast(msg, ms = 2600) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  requestAnimationFrame(() => t.classList.add('on'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('on'); setTimeout(() => { if (!t.classList.contains('on')) t.hidden = true; }, 350); }, ms);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}
// sheets (bottom sheet on phones, centered card on desktop)
let sheetFocus = null, sheetOnClose = null;
function openSheet(title, build, onClose) {
  const sheet = $('sheet'), back = $('sheetBack');
  const wasOpen = !sheet.hidden;
  if (!wasOpen) sheetFocus = document.activeElement;
  $('sheetTitle').textContent = title;
  const body = $('sheetBody'); body.textContent = '';
  build(body);
  sheetOnClose = onClose || null;
  if (!wasOpen) {
    sheet.hidden = false; back.hidden = false;
    requestAnimationFrame(() => { sheet.classList.add('on'); back.classList.add('on'); });
  }
  sheet.scrollTop = 0;
  const f = body.querySelector('button, input, [tabindex]'); if (f && !matchMedia('(pointer: coarse)').matches) f.focus({ preventScroll: true });
}
function closeSheet() {
  const sheet = $('sheet'), back = $('sheetBack');
  if (sheet.hidden) return;
  sheet.classList.remove('on'); back.classList.remove('on');
  const cb = sheetOnClose; sheetOnClose = null;
  setTimeout(() => { if (!sheet.classList.contains('on')) { sheet.hidden = true; back.hidden = true; } }, reduced ? 200 : 420);
  if (sheetFocus && sheetFocus.focus && document.contains(sheetFocus)) sheetFocus.focus({ preventScroll: true });
  if (cb) cb();
}
$('sheetBack').addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('sheet').hidden) { e.preventDefault(); closeSheet(); } });
const h = (tag, props = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};
const para = (text, cls) => h('p', { class: cls, text });
const btn = (label, fn, cls = 'chip') => h('button', { type: 'button', class: cls, onclick: fn, text: label });
function confirmSheet({ title, body, ok, danger = false, cancel = 'Cancel' }) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (done) return; done = true; resolve(v); };
    openSheet(title, (b) => {
      if (body) b.append(para(body));
      b.append(h('div', { class: 'btns' }, btn(ok, () => { fin(true); closeSheet(); }, 'chip primary' + (danger ? ' danger-solid' : '')), btn(cancel, () => { fin(false); closeSheet(); }, 'chip ghost')));
    }, () => fin(false));
  });
}

/* ================================================================== api */
async function api(method, qs, body) {
  try {
    const r = await fetch('/api/notes' + qs, {
      method, cache: 'no-store', credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined,
    });
    let j = null; try { j = await r.json(); } catch { /* not json */ }
    return { status: r.status, j: j || {} };
  } catch { return { status: 0, j: {} }; }
}
const linkFor = (id) => `${location.origin}/notes/?n=${id}`;
const apiMsg = (r, fallback) => (r.status === 0 ? "Can't reach the server. Check your connection." : (r.j && r.j.message) || fallback);

/* ================================================================== editor + elements */
let cur = null;           // the open note
let previewOn = false;
let pushedEdit = false;
const ed = createEditor($('ed'), {
  describedBy: 'edHelp',
  onMode: (isBig) => { if (isBig) setBanner('big', { text: 'Big note: line numbers and colours are off so typing stays smooth. Everything else works.', actions: [{ label: 'OK' }] }); else clearBanner('big'); },
  onChange: (text) => onText(text),
  onCaret: (c) => { $('pos').textContent = `Ln ${c.line}, Col ${c.col}` + (c.sel ? ` (${c.sel} selected)` : ''); },
});
const langOptions = () => [h('option', { value: 'auto', text: 'Auto-detect' }), ...LANGS.map((l) => h('option', { value: l.id, text: l.label }))];
$('lang').append(...langOptions());
$('expiry').append(...EXPIRIES.map(([v, l]) => h('option', { value: v, text: v === 'keep' ? 'Keep until deleted' : 'Expires after ' + l })));

const resolvedLang = (n) => (n.lang === 'auto' ? (rt(n).detected || 'plain') : n.lang);
function titleOf(n) { return deriveTitle(n.title, n.text); }

/* ================================================================== list view */
let filter = 'all', query = '';
const PIN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 14v7"/></svg>';
function snippet(n, q) {
  const lines = n.text.slice(0, 60000).split('\n');
  if (q) {
    const ql = q.toLowerCase();
    const hit = lines.find((l) => l.toLowerCase().includes(ql));
    if (hit) {
      const t = hit.trim(); const i = t.toLowerCase().indexOf(ql);
      const start = Math.max(0, i - 30); const piece = t.slice(start, start + 140);
      const pi = piece.toLowerCase().indexOf(ql);
      return (start ? '…' : '') + esc(piece.slice(0, pi)) + '<mark>' + esc(piece.slice(pi, pi + q.length)) + '</mark>' + esc(piece.slice(pi + q.length));
    }
  }
  const clean = lines.map((l) => l.trim()).filter(Boolean);
  if (!n.title && clean.length) clean.shift();
  return esc(clean.slice(0, 2).join(' · ').slice(0, 200));
}
function visibleNotes() {
  const q = query.trim().toLowerCase();
  let list = store.notes.slice();
  if (filter === 'pinned') list = list.filter((n) => n.pinned);
  else if (filter === 'shared') list = list.filter((n) => n.remote);
  else if (filter === 'tasks') list = list.filter((n) => { const s = checklistStats(n.text); return s.total > s.done; });
  if (q) list = list.filter((n) => n.title.toLowerCase().includes(q) || n.text.toLowerCase().includes(q));
  list.sort((a, b) => (b.pinned - a.pinned) || (b.updated - a.updated));
  return list;
}
function renderList() {
  const list = visibleNotes();
  const ul = $('cards');
  let html = '';
  for (const n of list) {
    const t = titleOf(n);
    const st = checklistStats(n.text);
    const tl = n.remote && !n.remote.gone ? (n.remote.expiry === 'keep' ? 'Shared · kept' : 'Shared · ' + timeLeft(n.remote.expires_at)) : n.remote ? 'Link expired' : '';
    const soon = n.remote && n.remote.expires_at && Date.parse(n.remote.expires_at) - now() < 86400000;
    html += `<li class="card${cur && cur.lid === n.lid && matchMedia('(min-width: 900px)').matches ? ' cur' : ''}" data-lid="${esc(n.lid)}">`
      + `<button class="card-main" type="button" data-open="${esc(n.lid)}"><div class="c-title${t ? '' : ' empty'}">${esc(t || 'Empty note')}</div>`
      + `<div class="c-snip">${snippet(n, query.trim())}</div>`
      + `<div class="c-meta"><span class="tag">${esc(langLabel(n.lang === 'auto' ? (rt(n).detected || (rt(n).detected = detectLang(n.text.slice(0, 4000)))) : n.lang))}</span>`
      + (st.total ? `<span class="tag">${st.done}/${st.total} done</span>` : '')
      + (tl ? `<span class="tag ${n.remote && !n.remote.gone ? (soon ? 'warn' : 'shared') : 'warn'}">${esc(tl)}</span>` : '')
      + (n.dirty ? '<span class="tag warn">unsaved</span>' : '')
      + `<span>${esc(relTime(n.updated))}</span></div></button>`
      + `<button class="pin" type="button" data-pin="${esc(n.lid)}" aria-pressed="${n.pinned}" aria-label="${n.pinned ? 'Unpin' : 'Pin'} ${esc(t || 'note')}">${PIN_SVG}</button></li>`;
  }
  ul.innerHTML = html;
  const empty = $('empty');
  if (list.length) { empty.hidden = true; return; }
  empty.hidden = false; empty.textContent = '';
  if (!store.notes.length) {
    empty.append(h('h2', { text: 'A blank page, ready.' }), para('Jot something down, keep a to-do list, or paste a snippet. It stays on this device until you share it.'),
      h('div', { class: 'row-btns' }, btn('+ New note', () => newNote({}), 'chip primary'), btn('To-do list', () => newNote({ text: '- [ ] ', title: 'To do' })), btn('Open a file', () => $('file').click())));
  } else empty.append(h('h2', { text: 'Nothing matches.' }), para(query ? 'Try a different word, or clear the search.' : 'No notes in this view yet.'));
}
$('cards').addEventListener('click', (e) => {
  const pin = e.target.closest('[data-pin]');
  if (pin) { const n = store.notes.find((x) => x.lid === pin.dataset.pin); if (n) { n.pinned = !n.pinned; touch(n); renderList(); if (cur === n) renderTools(); } return; }
  const o = e.target.closest('[data-open]');
  if (o) openNote(o.dataset.open);
});
$('filters').addEventListener('click', (e) => {
  const b = e.target.closest('[data-f]'); if (!b) return;
  filter = b.dataset.f;
  for (const x of $('filters').children) { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); }
  renderList();
});
let qTimer = 0;
$('q').addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { query = $('q').value; renderList(); }, 120); });

/* ================================================================== views / history */
function setView(v) {
  $('app').dataset.view = v;
  if (v === 'list') { stopPoll(); renderList(); }
  document.title = v === 'edit' && cur ? `${titleOf(cur) || 'Note'} · SZVTECH` : 'Notes · SZVTECH';
}
function showEditor(n, { push = true, focus = false, fresh = false } = {}) {
  cur = n;
  const r = rt(n);
  if (n.lang === 'auto' && !r.detected) r.detected = detectLang(n.text);
  previewOn = false; $('preview').hidden = true; $('ed').hidden = false; $('prevBtn').setAttribute('aria-pressed', 'false');
  $('loading').hidden = true;
  $('title').value = n.title;
  clearBanners();
  ed.setReadOnly(false);
  ed.setLang(resolvedLang(n));
  ed.setText(n.text);
  ed.setWrap(store.prefs.wrap !== false);
  const url = n.remote ? `/notes/?n=${n.remote.id}` : '/notes/';
  if (push && !pushedEdit) { try { history.pushState({ v: 'edit', lid: n.lid }, '', url); pushedEdit = true; } catch { /* file:// etc */ } }
  else { try { history.replaceState({ v: 'edit', lid: n.lid }, '', url); } catch { /* ignore */ } }
  setView('edit');
  renderAll();
  if (n.remote) { maybeIntro(); startPoll(); if (!fresh) refreshRemote(n); }
  if (focus) setTimeout(() => ed.focus(), 60);
  else if (matchMedia('(min-width: 900px)').matches && !n.text) ed.focus();
}
function openNote(lid, opts) {
  const n = store.notes.find((x) => x.lid === lid);
  if (!n) { toast('That note is gone.'); setView('list'); return; }
  flush();
  showEditor(n, opts);
}
function backToList() {
  flush();
  if (pushedEdit && history.state && history.state.v === 'edit') { history.back(); return; }
  try { history.replaceState({ v: 'list' }, '', '/notes/'); } catch { /* ignore */ }
  cur = null; setView('list');
}
window.addEventListener('popstate', (e) => {
  const s = e.state;
  if (s && s.v === 'edit' && s.lid && store.notes.some((n) => n.lid === s.lid)) { pushedEdit = true; flush(); showEditor(store.notes.find((n) => n.lid === s.lid), { push: false }); return; }
  pushedEdit = false; flush(); cur = null; setView('list');
});
$('toList').addEventListener('click', backToList);
function flush() { syncFromEditor(); if (persistTimer || touched.size || removed.size) persistNow(); }

function newNote({ text = '', title = '', lang = 'auto' } = {}) {
  const n = normalize({ lid: rid(), title, text, lang, created: now(), updated: now() });
  store.notes.unshift(n); touch(n); persistNow();
  showEditor(n, { focus: true });
  if (text) setTimeout(() => { ed.el.setSelectionRange(text.length, text.length); }, 80);
  return n;
}
$('newNote').addEventListener('click', () => newNote({}));

/* ================================================================== editing */
// the editor batches input into the next frame; anything that saves first pulls the very latest text
function syncFromEditor() { if (cur && !$('ed').hidden && ed.el.value !== cur.text) onText(ed.el.value); }
let statTimer = 0, detectTimer = 0, previewTimer = 0, listTimer = 0;
const wide = () => matchMedia('(min-width: 900px)').matches;
function listSoon() { if (!wide()) return; clearTimeout(listTimer); listTimer = setTimeout(renderList, 400); }
function onText(text) {
  if (!cur) return;
  cur.text = text; cur.updated = now();
  clearBanner('json');
  if (cur.remote) { const r = rt(cur); cur.dirty = r.saved ? !(r.saved.text === text && r.saved.title === cur.title && r.saved.lang === resolvedLang(cur)) : true; }
  touch(cur); listSoon();
  lastActivity = now();
  clearTimeout(statTimer); statTimer = setTimeout(renderStats, 120);
  if (cur.lang === 'auto') { clearTimeout(detectTimer); detectTimer = setTimeout(redetect, 900); }
  if (previewOn) { clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 250); }
  renderStatus();
}
function redetect() {
  if (!cur || cur.lang !== 'auto') return;
  const d = detectLang(cur.text);
  const r = rt(cur);
  if (d !== r.detected) { r.detected = d; ed.setLang(d); renderTools(); }
}
$('title').addEventListener('input', () => {
  if (!cur) return;
  cur.title = $('title').value; cur.updated = now();
  if (cur.remote) { const r = rt(cur); cur.dirty = r.saved ? !(r.saved.text === cur.text && r.saved.title === cur.title && r.saved.lang === resolvedLang(cur)) : true; }
  touch(cur); renderStatus(); listSoon();
});
$('title').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ed.focus(); } });
$('lang').addEventListener('change', () => {
  if (!cur) return;
  cur.lang = $('lang').value;
  if (cur.lang === 'auto') rt(cur).detected = detectLang(cur.text);
  ed.setLang(resolvedLang(cur));
  if (cur.remote) { const r = rt(cur); cur.dirty = r.saved ? !(r.saved.text === cur.text && r.saved.title === cur.title && r.saved.lang === resolvedLang(cur)) : true; }
  touch(cur); renderAll();
});
$('wrapBtn').addEventListener('click', () => {
  const on = store.prefs.wrap === false; store.prefs.wrap = on; schedulePersist();
  ed.setWrap(on); renderTools();
});
$('prevBtn').addEventListener('click', () => { previewOn = !previewOn; applyPreview(); });
function applyPreview() {
  $('preview').hidden = !previewOn; $('ed').hidden = previewOn;
  $('prevBtn').setAttribute('aria-pressed', previewOn);
  if (previewOn) { renderPreview(); $('preview').scrollTop = 0; } else setTimeout(() => ed.focus(), 0);
}
function renderPreview() {
  if (!cur) return;
  const el = $('preview'); const st = el.scrollTop;
  el.innerHTML = renderMarkdown(cur.text); // built only from escaped text (see lib.js)
  if (!cur.text.trim()) el.append(para('Nothing to preview yet.', 'empty-prev'));
  el.scrollTop = st;
}
$('preview').addEventListener('click', (e) => {
  if (e.target.closest('a')) return;
  const li = e.target.closest('li.task'); if (!li || !cur) return;
  const next = toggleChecklistLine(cur.text, +li.dataset.line);
  if (next === null) return;
  ed.setText(next, { keepScroll: true }); onText(next); renderPreview();
});
$('fmtBtn').addEventListener('click', () => {
  if (!cur) return;
  if (previewOn) { previewOn = false; applyPreview(); }
  const r = formatJson(cur.text);
  if (r.ok) {
    if (r.text === cur.text) { toast('Already tidy.'); return; }
    ed.replaceAll(r.text); toast('Formatted.');
  } else {
    ed.goto(r.line, r.col, { error: true });
    setBanner('json', { kind: 'warn', text: r.message, actions: [{ label: 'Jump to it', fn: () => ed.goto(r.line, r.col, { error: true }) }] });
    toast('That JSON has a problem on line ' + r.line + '.');
  }
});
$('copyBtn').addEventListener('click', async () => { if (!cur) return; toast((await copyText(cur.text)) ? 'Copied the text.' : 'Could not copy. Select the text and copy it.'); });
$('dlBtn').addEventListener('click', () => {
  if (!cur) return;
  try {
    const name = `${slug(titleOf(cur))}.${langExt(resolvedLang(cur))}`;
    const url = URL.createObjectURL(new Blob([cur.text], { type: 'text/plain;charset=utf-8' }));
    const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Downloaded ' + name);
  } catch { toast('Download is not available here.'); }
});
$('pinBtn').addEventListener('click', () => { if (!cur) return; cur.pinned = !cur.pinned; touch(cur); renderTools(); toast(cur.pinned ? 'Pinned to the top.' : 'Unpinned.'); });
$('linkBtn').addEventListener('click', async () => { if (cur && cur.remote) toast((await copyText(linkFor(cur.remote.id))) ? 'Link copied.' : 'Could not copy. Open Share to see the link.'); });
$('upBtn').addEventListener('click', () => $('file').click());
$('openFile').addEventListener('click', () => $('file').click());
$('histBtn').addEventListener('click', () => openHistory());
$('forkBtn').addEventListener('click', () => forkCurrent());
$('delBtn').addEventListener('click', () => openDelete());
$('saveBtn').addEventListener('click', () => { if (!cur) return; if (cur.remote && cur.dirty && !cur.remote.gone) save(); else openShare(); });
$('status').addEventListener('click', () => {
  if (!cur) return;
  if (cur.remote && cur.dirty && !cur.remote.gone) save();
  else toast(cur.remote ? (cur.remote.gone ? 'This shared note has expired.' : `Saved on the server as version ${cur.remote.version}. Anyone with the link can edit.`) : 'Saved on this device only. Nothing has been sent anywhere.', 3600);
});
$('expiry').addEventListener('change', async () => {
  if (!cur || !cur.remote) return;
  const v = $('expiry').value; const n = cur;
  const r = await api('POST', '', { op: 'settings', id: n.remote.id, expiry: v });
  if (r.status === 200) { n.remote.expiry = v; n.remote.expires_at = r.j.expires_at || null; touch(n); renderAll(); toast(v === 'keep' ? 'This note will be kept until someone deletes it.' : `It now expires ${EXP_LABEL[v]} after the last edit.`); }
  else { renderTools(); if (r.status === 404) markGone(n); else toast(apiMsg(r, 'Could not change that.')); }
});

/* ---------- files ---------- */
async function openFiles(files) {
  const f = files && files[0]; if (!f) return;
  if (f.size > MAX_FILE_BYTES) { toast(`That file is ${fmtBytes(f.size)}. Notes opens files up to ${fmtBytes(MAX_FILE_BYTES)}.`, 4200); return; }
  let text;
  try { text = await f.text(); } catch { toast('Could not read that file.'); return; }
  if (text.includes('\u0000') || (text.match(/�/g) || []).length > Math.max(8, text.length * 0.02)) { toast('That does not look like a text file.', 3800); return; }
  const lang = langFromFilename(f.name);
  const n = normalize({ lid: rid(), title: f.name.slice(0, 120), text: text.replace(/\r\n?/g, '\n'), lang: lang || 'auto', created: now(), updated: now() });
  store.notes.unshift(n); touch(n); persistNow();
  showEditor(n);
  toast(`Opened ${f.name} (${fmtBytes(f.size)}).`);
}
$('file').addEventListener('change', async (e) => { const files = e.target.files; await openFiles(files); e.target.value = ''; });
let dragDepth = 0;
const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { dragDepth++; $('drop').hidden = false; } });
window.addEventListener('dragleave', (e) => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; $('drop').hidden = true; } });
window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; $('drop').hidden = true; openFiles(e.dataTransfer.files); });

/* ================================================================== rendering of editor chrome */
function renderStats() {
  if (!cur) return;
  const c = ed.caretInfo();
  $('count').textContent = `${c.lines} ${c.lines === 1 ? 'line' : 'lines'} · ${fmtBytes(byteLen(cur.text))}`;
  const st = checklistStats(cur.text);
  const t = $('tasks'); t.hidden = !st.total; t.textContent = `${st.done}/${st.total} done`;
}
function renderTools() {
  if (!cur) return;
  const lang = resolvedLang(cur);
  $('lang').value = cur.lang;
  $('langLabel').textContent = cur.lang === 'auto' ? `Auto · ${langLabel(lang)}` : langLabel(lang);
  $('wrapBtn').setAttribute('aria-pressed', store.prefs.wrap !== false);
  $('prevBtn').hidden = !(lang === 'markdown' || lang === 'plain');
  $('fmtBtn').hidden = lang !== 'json';
  const rem = !!cur.remote && !cur.remote.gone;
  $('linkBtn').hidden = !rem; $('histBtn').hidden = !rem; $('expWrap').hidden = !rem; $('forkBtn').hidden = !cur.remote;
  if (cur.remote) { $('expiry').value = cur.remote.expiry; $('expLabel').textContent = cur.remote.expiry === 'keep' ? 'Kept' : 'Expires: ' + EXP_LABEL[cur.remote.expiry]; }
  $('pinBtn').setAttribute('aria-pressed', !!cur.pinned);
  $('pinBtn').textContent = cur.pinned ? 'Pinned' : 'Pin';
  $('delBtn').textContent = cur.remote ? 'Remove' : 'Delete';
}
function renderStatus() {
  if (!cur) return;
  const s = $('status'), r = rt(cur);
  let k = 'device', t = 'On this device';
  if (cur.remote && cur.remote.gone) { k = 'error'; t = 'Link expired'; }
  else if (cur.remote) {
    if (r.saving) { k = 'saving'; t = 'Saving…'; }
    else if (r.err) { k = 'error'; t = 'Not saved'; }
    else if (cur.dirty) { k = 'dirty'; t = 'Unsaved'; }
    else { k = 'saved'; t = 'Saved v' + cur.remote.version; }
  }
  s.dataset.s = k; $('statusText').textContent = t;
  const b = $('saveBtn');
  if (cur.remote && cur.dirty && !cur.remote.gone) { b.textContent = r.saving ? 'Saving…' : 'Save'; b.className = 'chip primary'; }
  else { b.textContent = 'Share'; b.className = cur.remote && !cur.remote.gone ? 'chip' : 'chip primary'; }
  const e = $('exp');
  if (cur.remote && !cur.remote.gone) {
    const tl = cur.remote.expiry === 'keep' ? 'Kept until deleted' : timeLeft(cur.remote.expires_at);
    e.hidden = false; e.textContent = 'Shared · ' + tl; e.title = 'Anyone with the link can read and edit this note. Do not put secrets in it.';
    e.classList.toggle('warn', !!cur.remote.expires_at && Date.parse(cur.remote.expires_at) - now() < 86400000);
  } else e.hidden = true;
  document.title = `${(cur.dirty ? '• ' : '') + (titleOf(cur) || 'Note')} · SZVTECH`;
}
function renderAll() { renderTools(); renderStatus(); renderStats(); $('count').title = ''; }
setInterval(() => { if (cur && cur.remote) renderStatus(); }, 30000);

/* ---------- banners ---------- */
const bannerEls = new Map();
function setBanner(key, { text, kind = '', actions = [] }) {
  clearBanner(key);
  const el = h('div', { class: 'banner ' + kind, role: 'status' }, h('span', { text }), ...actions.map((a) => h('button', { type: 'button', class: a.main ? 'main' : '', onclick: () => { if (a.keep !== true) clearBanner(key); a.fn && a.fn(); }, text: a.label })));
  $('banners').append(el); bannerEls.set(key, el);
}
function clearBanner(key) { const el = bannerEls.get(key); if (el) { el.remove(); bannerEls.delete(key); } }
function clearBanners() { for (const k of [...bannerEls.keys()]) clearBanner(k); }
function maybeIntro() {
  let seen = false; try { seen = localStorage.getItem('szv-notes-ack') === '1'; } catch { /* ignore */ }
  if (seen) return;
  setBanner('intro', { kind: '', text: 'Shared note: anyone with the link can read and edit it. No passwords or secrets, please.', actions: [{ label: 'Got it', main: true, fn: () => { try { localStorage.setItem('szv-notes-ack', '1'); } catch { /* ignore */ } } }] });
}

/* ================================================================== shared notes: create / save / conflict */
function snapshot(n) { return { text: n.text, title: n.title, lang: resolvedLang(n) }; }
const serverTitle = (n) => deriveTitle(n.title, n.text).slice(0, 120);
function sizeCheck(n) {
  const b = byteLen(n.text);
  if (b > MAX_SHARE_BYTES) { toast(`This note is ${fmtBytes(b)}. Shared notes can be 200 KB at most. It still works fine as a private note.`, 5200); return false; }
  return true;
}
async function createShared(n, expiry) {
  const r = await api('POST', '', { op: 'create', title: serverTitle(n), lang: resolvedLang(n), content: n.text, expiry });
  return r;
}
async function shareNew(expiry) {
  syncFromEditor();
  const n = cur; if (!n || n.remote) return;
  if (!sizeCheck(n)) return;
  setBusy(true);
  const r = await createShared(n, expiry);
  setBusy(false);
  if (r.status !== 201) { toast(apiMsg(r, 'Could not create the link.'), 4200); return false; }
  n.remote = { id: r.j.id, version: r.j.version, expiry: r.j.expiry || expiry, expires_at: r.j.expires_at || null, gone: false };
  n.dirty = false; rt(n).saved = snapshot(n); touch(n); persistNow();
  try { history.replaceState({ v: 'edit', lid: n.lid }, '', `/notes/?n=${n.remote.id}`); } catch { /* ignore */ }
  renderAll(); startPoll();
  return true;
}
function setBusy(on) { $('saveBtn').disabled = on; }

let saving = false;
async function save({ base } = {}) {
  syncFromEditor();
  const n = cur;
  if (!n || !n.remote || n.remote.gone || saving) return;
  if (!sizeCheck(n)) return;
  saving = true; const r0 = rt(n); r0.saving = true; r0.err = false; renderStatus();
  const snap = snapshot(n);
  const r = await api('POST', '', { op: 'save', id: n.remote.id, base: base ?? n.remote.version, title: serverTitle(n), lang: snap.lang, content: snap.text, expiry: n.remote.expiry });
  saving = false; r0.saving = false;
  if (r.status === 200) {
    n.remote.version = r.j.version; n.remote.expires_at = r.j.expires_at || null;
    r0.saved = snap; r0.err = false; r0.newer = 0;
    n.dirty = !(n.text === snap.text && n.title === snap.title && resolvedLang(n) === snap.lang);
    clearBanner('newer'); clearBanner('conflict');
    touch(n); persistNow(); renderAll(); lastActivity = now();
    toast(`Saved v${r.j.version}.`, 1800);
    return true;
  }
  if (r.status === 409 && r.j.latest) { renderStatus(); openConflict(r.j.latest); return false; }
  if (r.status === 404) { markGone(n); return false; }
  r0.err = true; renderStatus();
  if (r.status === 0) setBanner('net', { kind: 'warn', text: 'You seem to be offline. Your edits are kept on this device and nothing is lost. Save again when you are back.', actions: [{ label: 'Try again', main: true, fn: () => save() }] });
  else toast(apiMsg(r, 'Could not save.'), 4200);
  return false;
}
function markGone(n) {
  if (!n.remote) return;
  n.remote.gone = true; touch(n); stopPoll();
  if (cur === n) {
    renderAll();
    setBanner('gone', { kind: 'bad', text: 'This shared note has expired or was deleted. Your copy is safe on this device.', actions: [{ label: 'Share as a new link', main: true, fn: () => { n.remote = null; n.dirty = false; touch(n); renderAll(); openShare(); } }, { label: 'Keep it private', fn: () => { n.remote = null; n.dirty = false; touch(n); try { history.replaceState({ v: 'edit', lid: n.lid }, '', '/notes/'); } catch { /* ignore */ } renderAll(); } }] });
  }
}

function openConflict(latest) {
  const n = cur; if (!n || !n.remote) return;
  rt(n).conflict = latest;
  const base = n.remote.version;
  setBanner('conflict', { kind: 'warn', text: 'Someone saved since you opened this. Nothing was overwritten yet.', actions: [{ label: 'Choose what to do', main: true, keep: true, fn: () => openConflict(latest) }] });
  openSheet('Someone saved since you opened this', (b) => {
    b.append(para(`They saved version ${latest.version}${latest.updated_at ? ' (' + relTime(latest.updated_at) + ')' : ''}. You started from version ${base}. Your changes are safe here, nothing has been overwritten.`));
    const diffBox = h('div', { hidden: true });
    const toggle = btn('Show what is different', () => {
      diffBox.hidden = !diffBox.hidden; toggle.textContent = diffBox.hidden ? 'Show what is different' : 'Hide differences';
      if (!diffBox.hidden && !diffBox.firstChild) diffBox.append(renderDiff(latest.content, n.text, 'Theirs', 'Yours'));
    }, 'chip ghost');
    b.append(toggle, diffBox);
    b.append(h('div', { class: 'btns' },
      btn('View theirs', () => { closeSheet(); adoptTheirs(n, latest, true); }, 'chip'),
      btn('Overwrite with mine', async () => { closeSheet(); clearBanner('conflict'); const ok = await save({ base: latest.version }); if (ok === false && !rt(n).conflict) { /* error already shown */ } }, 'chip primary'),
      btn('Save mine as a new link', async () => { closeSheet(); await conflictFork(n, latest); }, 'chip')));
    b.append(para('"View theirs" keeps your edits as a separate private note, so nothing is lost.', 'fine-p'));
  });
}
function adoptTheirs(n, latest, stash) {
  if (stash && n.text !== latest.content) {
    const copy = normalize({ lid: rid(), title: (serverTitle(n) || 'Note') + ' (my edits)', text: n.text, lang: resolvedLang(n), created: now(), updated: now() });
    store.notes.unshift(copy); touch(copy);
    toast('Showing their version. Your edits are kept as a separate note.', 4200);
  }
  n.title = latest.title || n.title; n.text = latest.content; n.lang = latest.lang || n.lang; n.updated = now();
  n.remote.version = latest.version; n.remote.expires_at = latest.expires_at || n.remote.expires_at; if (latest.expiry) n.remote.expiry = latest.expiry;
  n.dirty = false; const r = rt(n); r.saved = { text: n.text, title: n.title, lang: resolvedLang(n) }; r.newer = 0; r.conflict = null;
  clearBanner('newer'); clearBanner('conflict');
  touch(n); persistNow();
  if (cur === n) { $('title').value = n.title; ed.setLang(resolvedLang(n)); ed.setText(n.text, { keepScroll: true }); if (previewOn) renderPreview(); renderAll(); }
}
async function conflictFork(n, latest) {
  if (!sizeCheck(n)) return;
  const mine = snapshot(n);
  setBusy(true);
  const r = await api('POST', '', { op: 'create', title: serverTitle(n), lang: mine.lang, content: mine.text, expiry: n.remote.expiry });
  setBusy(false);
  if (r.status !== 201) { toast(apiMsg(r, 'Could not create the new link.'), 4200); return; }
  const nn = normalize({ lid: rid(), title: n.title, text: mine.text, lang: n.lang, created: now(), updated: now(), remote: { id: r.j.id, version: 1, expiry: r.j.expiry || 'keep', expires_at: r.j.expires_at || null } });
  rt(nn).saved = mine;
  store.notes.unshift(nn); touch(nn);
  adoptTheirs(n, latest, false); // the original goes back to what everyone else sees
  persistNow();
  showEditor(nn, { push: false, fresh: true });
  const ok = await copyText(linkFor(nn.remote.id));
  toast(ok ? 'Saved as a new link. The link is copied.' : 'Saved as a new link.', 4200);
}
async function forkCurrent() {
  const n = cur; if (!n) return;
  if (!sizeCheck(n)) return;
  const r = await api('POST', '', { op: 'create', title: serverTitle(n), lang: resolvedLang(n), content: n.text, expiry: n.remote ? n.remote.expiry : '30d' });
  if (r.status !== 201) { toast(apiMsg(r, 'Could not create the new link.'), 4200); return; }
  const nn = normalize({ lid: rid(), title: (n.title ? n.title : serverTitle(n)) + (n.title ? '' : ''), text: n.text, lang: n.lang, created: now(), updated: now(), remote: { id: r.j.id, version: 1, expiry: r.j.expiry || '30d', expires_at: r.j.expires_at || null } });
  rt(nn).saved = snapshot(n);
  store.notes.unshift(nn); touch(nn); persistNow();
  showEditor(nn, { push: false, fresh: true });
  toast((await copyText(linkFor(nn.remote.id))) ? 'New link created and copied. The old one is unchanged.' : 'New link created. The old one is unchanged.', 4200);
}

/* ---------- share sheet ---------- */
function openShare() {
  const n = cur; if (!n) return;
  if (!n.remote || n.remote.gone) {
    let exp = '30d';
    openSheet('Share this note', (b) => {
      b.append(para('This makes a link. Anyone who has it can open the note and edit it, and the link keeps working after edits.'));
      b.append(para('The note is stored on the server, not just on your phone. Please do not put passwords or secrets in it.', 'warn'));
      b.append(para('Expires after the last edit:'));
      const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Expires after' });
      for (const [v, l] of EXPIRIES) seg.append(h('button', { type: 'button', 'aria-pressed': v === exp, text: l, onclick: (e) => { exp = v; for (const x of seg.children) x.setAttribute('aria-pressed', x === e.currentTarget); } }));
      b.append(seg, para('Every edit renews the clock (except "Keep").', 'fine-p'));
      b.append(h('div', { class: 'btns' }, btn('Create link', async (e) => {
        e.currentTarget.disabled = true;
        const ok = await shareNew(exp);
        if (ok) { closeSheet(); setTimeout(openShare, reduced ? 220 : 480); }
        else e.currentTarget.disabled = false;
      }, 'chip primary'), btn('Not now', closeSheet, 'chip ghost')));
    });
    return;
  }
  const link = linkFor(n.remote.id);
  openSheet('Anyone with this link can edit', (b) => {
    b.append(para(n.dirty ? 'You have unsaved changes. Save them so people see the latest.' : `This is version ${n.remote.version}. ${n.remote.expiry === 'keep' ? 'It is kept until someone deletes it.' : timeLeft(n.remote.expires_at) + ' (renews on every edit).'}`));
    const inp = h('input', { type: 'text', readonly: true, value: link, 'aria-label': 'Link', onfocus: (e) => e.target.select() });
    b.append(h('div', { class: 'linkbox' }, inp, btn('Copy', async () => toast((await copyText(link)) ? 'Link copied.' : 'Press and hold the link to copy it.'), 'chip primary')));
    const row = h('div', { class: 'btns' });
    if (typeof navigator.share === 'function') row.append(btn('Share…', async () => { try { await navigator.share({ title: titleOf(n) || 'Note', url: link }); } catch { /* cancelled */ } }, 'chip'));
    if (n.dirty) row.append(btn('Save changes', async () => { closeSheet(); await save(); }, 'chip primary'));
    row.append(btn('Done', closeSheet, 'chip ghost'));
    b.append(row);
    b.append(para('It is stored on the server and anyone with the link can read and change it. No passwords or secrets, please.', 'warn'));
  });
}

/* ---------- delete ---------- */
function openDelete() {
  const n = cur; if (!n) return;
  if (!n.remote) {
    confirmSheet({ title: 'Delete this note?', body: 'It only exists on this device, so it will be gone for good.', ok: 'Delete note', danger: true }).then((yes) => { if (yes) removeLocal(n); });
    return;
  }
  openSheet('Remove this shared note?', (b) => {
    b.append(para('Removing it from this device keeps the link alive for everyone else. Deleting it for everyone makes the link stop working.'));
    b.append(h('div', { class: 'btns' },
      btn('Remove from this device', () => { closeSheet(); removeLocal(n); }, 'chip'),
      btn('Delete for everyone', async () => {
        const r = await api('POST', '', { op: 'delete', id: n.remote.id });
        if (r.status === 200 || r.status === 404) { closeSheet(); removeLocal(n); toast('Deleted. The link no longer works.'); } else toast(apiMsg(r, 'Could not delete it.'), 4200);
      }, 'chip danger'), btn('Cancel', closeSheet, 'chip ghost')));
  });
}
function removeLocal(n) {
  store.notes = store.notes.filter((x) => x !== n); removed.add(n.lid); touched.delete(n.lid); persistNow();
  stopPoll(); cur = null;
  if (pushedEdit && history.state && history.state.v === 'edit') history.back(); else { try { history.replaceState({ v: 'list' }, '', '/notes/'); } catch { /* ignore */ } setView('list'); }
  if (!pushedEdit) toast('Removed.');
}

/* ================================================================== diff view + history */
function renderDiff(aText, bText, aName, bName) {
  const ops = diffLines(aText, bText), st = diffStats(ops);
  const wrap = h('div');
  wrap.append(h('div', { class: 'pv-cap' }, h('span', { text: `${aName} → ${bName}` }), h('span', { text: st.added || st.removed ? `+${st.added} −${st.removed}` : 'identical' })));
  const pv = h('pre', { class: 'pv' });
  if (!st.added && !st.removed) pv.append(h('span', { class: 'dl skip', text: 'No differences.' }));
  for (const r of diffRows(ops, 2).slice(0, 1500)) {
    if (r.op === 'skip') pv.append(h('span', { class: 'dl skip', text: `… ${r.n} unchanged line${r.n === 1 ? '' : 's'} …` }));
    else pv.append(h('span', { class: 'dl ' + (r.op === '+' ? 'add' : r.op === '-' ? 'del' : ''), text: r.text || ' ' }));
  }
  wrap.append(pv);
  return wrap;
}
async function openHistory() {
  const n = cur; if (!n || !n.remote) return;
  openSheet('Version history', (b) => { b.append(para('Loading…')); });
  const r = await api('GET', `?id=${n.remote.id}&versions=1`);
  if (r.status === 404) { closeSheet(); markGone(n); return; }
  if (r.status !== 200) { openSheet('Version history', (b) => { b.append(para(apiMsg(r, 'Could not load the history.'), 'warn'), h('div', { class: 'btns' }, btn('Try again', openHistory, 'chip'), btn('Close', closeSheet, 'chip ghost'))); }); return; }
  const list = r.j.versions || [];
  openSheet('Version history', (b) => {
    b.append(para(`The last ${Math.min(50, list.length)} saves are kept. Restoring makes a new version, nothing is erased.`));
    const view = h('div');
    const rows = h('div', { class: 'rows' });
    for (const v of list) {
      const isHead = v.version === r.j.head;
      rows.append(h('div', { class: 'row' + (isHead ? ' cur' : '') },
        h('div', { class: 'meta' }, h('b', { text: 'v' + v.version }), isHead ? ' · latest' : '', h('small', { text: `${v.created_at ? new Date(v.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''} · ${relTime(v.created_at)} · ${fmtBytes(v.size)}` })),
        h('div', { class: 'acts' },
          btn('View', () => showVersion(v, view, 'view'), ''), btn('Diff', () => showVersion(v, view, 'diff'), ''), isHead ? null : btn('Restore', () => restoreVersion(v), ''))));
    }
    b.append(rows, view);
  });
}
async function fetchVersion(v) {
  const n = cur; const r = await api('GET', `?id=${n.remote.id}&v=${v.version}`);
  if (r.status !== 200) { toast(apiMsg(r, 'Could not load that version.'), 3600); return null; }
  return r.j;
}
async function showVersion(v, box, mode) {
  box.textContent = '';
  box.append(para('Loading…'));
  const d = await fetchVersion(v);
  box.textContent = '';
  if (!d) return;
  if (mode === 'view') {
    box.append(h('div', { class: 'pv-cap' }, h('span', { text: `Version ${d.version}` }), h('span', { text: (d.title || '') })));
    box.append(h('pre', { class: 'pv', text: d.content }));
  } else box.append(renderDiff(d.content, cur.text, `v${d.version}`, 'what is in the editor'));
  box.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
}
async function restoreVersion(v) {
  const n = cur;
  const d = await fetchVersion(v); if (!d) return;
  if (n.dirty || n.text !== d.content) {
    const yes = await confirmSheet({ title: `Restore version ${d.version}?`, body: n.dirty ? 'You have unsaved changes in the editor. Restoring replaces them with this older version, and saves it as a new version.' : 'This saves the older text as a new version. The current one stays in the history.', ok: 'Restore', cancel: 'Cancel' });
    if (!yes) return;
  }
  n.text = d.content; if (d.title) n.title = d.title; if (d.lang) n.lang = d.lang;
  $('title').value = n.title; ed.setLang(resolvedLang(n)); ed.setText(n.text, { keepScroll: true }); if (previewOn) renderPreview();
  n.dirty = true; touch(n); renderAll();
  const ok = await save();
  if (ok) toast(`Restored v${d.version} as v${n.remote.version}.`, 3200);
}

/* ================================================================== polling for remote changes */
let pollTimer = 0, lastActivity = now(), polling = false, pollPause = 0;
function pollDelay() { const idle = now() - lastActivity; return idle > 300000 ? 30000 : idle > 60000 ? 15000 : 10000; }
function startPoll() { stopPoll(); schedulePoll(); }
function stopPoll() { clearTimeout(pollTimer); pollTimer = 0; }
function schedulePoll(ms) {
  clearTimeout(pollTimer);
  if (!cur || !cur.remote || cur.remote.gone || document.hidden) { pollTimer = 0; return; }
  pollTimer = setTimeout(poll, ms ?? Math.max(pollDelay(), pollPause ? pollPause : 0));
}
async function poll() {
  pollTimer = 0;
  const n = cur;
  if (!n || !n.remote || n.remote.gone || document.hidden || polling) return;
  if (navigator.onLine === false) { schedulePoll(); return; }
  polling = true;
  const r = await api('GET', `?id=${n.remote.id}&head=1`);
  polling = false;
  if (cur !== n || !n.remote) return;
  pollPause = 0;
  if (r.status === 200) {
    const rr = rt(n);
    if (r.j.expires_at !== undefined && !n.dirty && r.j.expires_at !== n.remote.expires_at) { n.remote.expires_at = r.j.expires_at; renderStatus(); }
    if (r.j.version > n.remote.version && rr.newer !== r.j.version) {
      rr.newer = r.j.version;
      setBanner('newer', { text: `A new version is available (v${r.j.version}).`, actions: [{ label: n.dirty ? 'Compare' : 'Load it', main: true, fn: () => loadNewer(n) }, { label: 'Later', fn: () => {} }] });
    }
    if (!r.j.expires_at && n.remote.expiry !== 'keep') { /* server says no expiry: keep as is */ }
  } else if (r.status === 404) { markGone(n); return; }
  else if (r.status === 429) pollPause = 60000;
  schedulePoll();
}
async function loadNewer(n) {
  const r = await api('GET', `?id=${n.remote.id}`);
  if (r.status === 404) { markGone(n); return; }
  if (r.status !== 200) { toast(apiMsg(r, 'Could not load it.'), 3600); return; }
  if (n.dirty && n.text !== r.j.content) openConflict(r.j);
  else { adoptTheirs(n, r.j, false); toast(`Updated to v${r.j.version}.`); }
}
async function refreshRemote(n) { // right after opening a note we already had: is the server ahead?
  const r = await api('GET', `?id=${n.remote.id}&head=1`);
  if (cur !== n || !n.remote) return;
  if (r.status === 404) { markGone(n); return; }
  if (r.status === 200 && r.j.version > n.remote.version) {
    if (!n.dirty) { const f = await api('GET', `?id=${n.remote.id}`); if (cur === n && f.status === 200) { adoptTheirs(n, f.j, false); toast(`Updated to v${f.j.version}.`); } }
    else { rt(n).newer = r.j.version; setBanner('newer', { text: `A new version is available (v${r.j.version}) and you have unsaved changes.`, actions: [{ label: 'Compare', main: true, fn: () => loadNewer(n) }, { label: 'Later', fn: () => {} }] }); }
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { flush(); stopPoll(); }
  else if (cur && cur.remote) { lastActivity = now(); schedulePoll(1200); }
});
window.addEventListener('online', () => { clearBanner('net'); if (cur && cur.remote) schedulePoll(800); });
window.addEventListener('pagehide', flush);
window.addEventListener('beforeunload', (e) => { flush(); if (cur && cur.remote && cur.dirty && !cur.remote.gone) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('storage', (e) => { if (e.key === KEY && !cur) { const d = readDisk(); if (d) { store.notes = d.notes; renderList(); } } });

/* ================================================================== opening a shared link (?n=ID) */
async function openRemote(id) {
  const existing = store.notes.find((x) => x.remote && x.remote.id === id);
  if (existing) { showEditor(existing, { push: false }); return; }
  const n = normalize({ lid: rid(), title: '', text: '', lang: 'auto', created: now(), updated: now(), remote: { id, version: 1, expiry: '30d', expires_at: null } });
  cur = n;
  $('app').dataset.view = 'edit';
  $('loading').hidden = false; $('ed').hidden = true; $('title').value = ''; ed.setText('');
  clearBanners(); $('statusText').textContent = 'Opening…'; $('status').dataset.s = 'saving';
  try { history.replaceState({ v: 'edit', lid: n.lid }, '', `/notes/?n=${id}`); } catch { /* ignore */ }
  const load = async () => {
    $('loading').hidden = false; clearBanner('openerr');
    const r = await api('GET', `?id=${id}`);
    if (r.status === 200) {
      n.title = r.j.title || ''; n.text = r.j.content || ''; n.lang = r.j.lang || 'auto'; n.updated = Date.parse(r.j.updated_at) || now();
      n.remote = { id, version: r.j.version, expiry: r.j.expiry || '30d', expires_at: r.j.expires_at || null, gone: false };
      n.dirty = false; rt(n).saved = { text: n.text, title: n.title, lang: n.lang };
      store.notes.unshift(n); touch(n); persistNow();
      showEditor(n, { push: false, fresh: true });
    } else {
      $('loading').hidden = true;
      $('statusText').textContent = r.status === 404 ? 'Not found' : 'Not opened'; $('status').dataset.s = 'error';
      setBanner('openerr', { kind: 'bad', text: r.status === 404 ? 'This note has expired or never existed. Check the link, or ask for a new one.' : apiMsg(r, 'Could not open this note.'),
        actions: [...(r.status === 404 ? [] : [{ label: 'Try again', main: true, fn: load }]), { label: 'All notes', main: r.status === 404, fn: () => { cur = null; try { history.replaceState({ v: 'list' }, '', '/notes/'); } catch { /* ignore */ } setView('list'); } }] });
    }
  };
  load();
}

/* ================================================================== phone keyboard + shortcuts */
const root = document.documentElement;
function fit() {
  const vv = window.visualViewport;
  const hgt = vv ? vv.height : innerHeight;
  root.style.setProperty('--app-h', hgt + 'px');
  root.style.setProperty('--app-top', (vv ? vv.offsetTop : 0) + 'px');
  const open = !!vv && innerHeight - hgt > 140 && (document.activeElement === ed.el || document.activeElement === $('title') || document.activeElement === $('q'));
  document.body.classList.toggle('kbd', open);
  if (open) ed.keepCaretVisible();
}
if (window.visualViewport) { visualViewport.addEventListener('resize', fit); visualViewport.addEventListener('scroll', fit); }
window.addEventListener('resize', fit);
document.addEventListener('focusin', () => setTimeout(fit, 120));
document.addEventListener('focusout', () => setTimeout(fit, 120));
fit();
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    if (!cur) return;
    syncFromEditor();
    if (cur.remote && !cur.remote.gone) { if (cur.dirty) save(); else toast(`Already saved (v${cur.remote.version}).`, 1600); }
    else { persistNow(); toast(storeBroken ? 'This browser cannot save notes on this device.' : 'Saved on this device. Press Share to make a link.', 2200); }
  }
});

/* ================================================================== boot */
loadStore();
renderList();
(function boot() {
  const id = new URLSearchParams(location.search).get('n');
  if (id !== null) {
    if (ID_RE.test(id)) { openRemote(id); return; }
    toast('That does not look like a note link.', 4200);
  }
  try { history.replaceState({ v: 'list' }, '', '/notes/'); } catch { /* ignore */ }
  setView('list');
})();
