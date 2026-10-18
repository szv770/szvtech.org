// /gematria — value of any Hebrew word, 8 methods, matching words, numbers <-> letters.
// Logic in logic.js (unit-tested); the keyboard and transliteration are shared with /hebtype/;
// the Hebrew year comes from the calendar code in /luach/.
import { METHODS, methodById, compute, equation, breakdownText, numToHeb, hebToNum } from '/gematria/logic.js?v=7854692512';
import { WORDS } from '/gematria/words.js?v=8c4e29b0af';
import { latinToHebrew, hasLatin } from '/hebtype/translit.js?v=32b9a369cc';
import { mountKeyboard } from '/hebtype/keyboard.js?v=4ecc3f1bd9';
import { absToHebrew, gregToAbs, hebrewDateHe } from '/luach/logic.js?v=c065cd15ad';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RM = matchMedia('(prefers-reduced-motion: reduce)');
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};
const K = { recent: 'szv-gematria-recent', method: 'szv-gematria-method', own: 'szv-gematria-own', draft: 'szv-gematria-draft', th: 'szv-gematria-thousands' };
const q = $('q');
let method = METHODS.some((m) => m.id === ls.get(K.method, '')) ? ls.get(K.method, '') : 'standard';
let showAll = false;

/* ------------------------------------------------------------ toast, clipboard */
let toastT;
function toast(msg, ms = 2600) {
  const t = $('toast'); t.innerHTML = `<span>${esc(msg)}</span>`; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms);
}
async function copyText(s) {
  try { await navigator.clipboard.writeText(s); return true; } catch (e) { /* fall back */ }
  try {
    const t = document.createElement('textarea');
    t.value = s; t.style.cssText = 'position:fixed;opacity:0;font-size:16px;top:0;left:0'; document.body.appendChild(t);
    t.focus({ preventScroll: true }); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok;
  } catch (e) { return false; }
}
function flash(btn, label, ok) {
  const old = btn.dataset.l || btn.textContent; btn.dataset.l = old;
  btn.textContent = ok ? label : 'Select & copy'; btn.classList.toggle('done', ok);
  clearTimeout(btn._t); btn._t = setTimeout(() => { btn.textContent = old; btn.classList.remove('done'); }, 1500);
}
function buzz() { try { if (!RM.matches && navigator.vibrate) navigator.vibrate(8); } catch (e) { /* none */ } }

/* ------------------------------------------------------------ input -> Hebrew */
const hebrewOf = (raw) => (hasLatin(raw) ? latinToHebrew(raw) : raw);
let cur = { raw: '', he: '', res: compute('', method) };

function setInput(v, { focus = false } = {}) {
  q.value = v; update();
  if (focus) q.focus({ preventScroll: true });
}

/* ------------------------------------------------------------ matches index */
const indexCache = {};
function indexFor(m) {
  if (indexCache[m]) return indexCache[m];
  const map = new Map();
  for (const [he, en] of WORDS) {
    const v = compute(he, m).total;
    if (!map.has(v)) map.set(v, []);
    map.get(v).push({ he, en });
  }
  return (indexCache[m] = map);
}

/* ------------------------------------------------------------ render */
function renderMethods() {
  $('methods').innerHTML = METHODS.map((m) => `<button type="button" role="radio" data-m="${m.id}" aria-checked="${m.id === method}">${esc(m.name)}</button>`).join('');
  $('mblurb').textContent = methodById(method).blurb;
}
$('methods').addEventListener('click', (e) => {
  const b = e.target.closest('[data-m]'); if (!b) return;
  method = b.dataset.m; ls.set(K.method, method); showAll = false; renderMethods(); update(true);
  b.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: RM.matches ? 'auto' : 'smooth' });
});

let timer;
function update(keepRecent) {
  const raw = q.value, he = hebrewOf(raw);
  const res = compute(he, method);
  cur = { raw, he, res };
  ls.set(K.draft, raw);
  // "read as" strip for English letters
  const ra = hasLatin(raw) && res.letters.length;
  $('readAs').hidden = !ra;
  if (ra) $('readHe').textContent = res.hebrew;
  const has = res.letters.length > 0;
  $('empty').hidden = has; $('have').hidden = !has;
  if (has) {
    $('value').textContent = res.total.toLocaleString('en-US');
    $('vword').textContent = res.hebrew.length > 24 ? res.hebrew.slice(0, 24) + '…' : (res.words.length > 1 ? res.words.map((w) => w.text).join(' ') : res.hebrew);
    $('vmeta').textContent = `${methodById(method).name} · ${res.letters.length} letters`;
    let html = '';
    // chips: words separated by a small gap
    let wi = 0, li = 0, n = 0;
    for (const w of res.words) {
      if (wi++) html += '<span class="lc sp"></span>';
      for (let k = 0; k < w.text.length; k++, li++) {
        const l = res.letters[li];
        html += `<span class="lc" style="--i:${Math.min(n++, 24)}"><b lang="he">${esc(l.ch)}</b><i>${l.v}</i>${l.alt && method === 'atbash' ? `<u lang="he">${esc(l.alt)}</u>` : ''}</span>`;
      }
    }
    $('letters').innerHTML = html;
    $('eq').textContent = res.letters.length <= 24 ? equation(res) : `${res.letters.length} letters = ${res.total}`;
    $('wordsum').innerHTML = res.words.length > 1 ? res.words.map((w) => `<span><b lang="he">${esc(w.text)}</b> ${w.total}</span>`).join('') : '';
    if (method === 'milui') $('eq').textContent += '  ·  spelled: ' + res.letters.map((l) => l.alt).join(' ');
    $('toType').href = '/hebtype/?text=' + encodeURIComponent(res.hebrew);
  }
  renderMatches(has ? res : null);
  clearTimeout(timer);
  if (has && keepRecent !== true) timer = setTimeout(() => saveRecent(res.hebrew), 2500);
  const u = new URL(location.href);
  if (has) u.searchParams.set('q', res.hebrew); else u.searchParams.delete('q');
  if (method !== 'standard') u.searchParams.set('m', method); else u.searchParams.delete('m');
  try { history.replaceState(null, '', u); } catch (e) { /* sandboxed */ }
}
q.addEventListener('input', () => update());

function renderMatches(res) {
  const lab = $('matchLab'), box = $('matches'), more = $('moreMatches');
  if (!res) { lab.textContent = 'Words with the same value'; box.innerHTML = '<p class="nomatch">Matches appear here once you have a value.</p>'; more.hidden = true; return; }
  const all = indexFor(method).get(res.total) || [];
  const list = all.filter((m) => compute(m.he, method).total === res.total && m.he.replace(/ /g, '') !== res.hebrew.replace(/ /g, ''));
  lab.textContent = `Same value · ${res.total.toLocaleString('en-US')}`;
  if (!list.length) { box.innerHTML = `<p class="nomatch">Nothing on my list adds up to ${res.total} in ${esc(methodById(method).name)}. Try another method.</p>`; more.hidden = true; return; }
  const shown = showAll ? list : list.slice(0, 8);
  box.innerHTML = shown.map((m) => `<button class="mcard" type="button" data-he="${esc(m.he)}"><b lang="he">${esc(m.he)}</b><small>${esc(m.en)}</small></button>`).join('');
  more.hidden = list.length <= 8 || showAll; more.textContent = `Show ${list.length - 8} more`;
}
$('matches').addEventListener('click', (e) => {
  const b = e.target.closest('[data-he]'); if (!b) return;
  setInput(b.dataset.he); buzz();
  window.scrollTo({ top: 0, behavior: RM.matches ? 'auto' : 'smooth' });
});
$('moreMatches').addEventListener('click', () => { showAll = true; update(true); });

/* ------------------------------------------------------------ recents */
const jget = (k, d) => { try { return JSON.parse(ls.get(k, '')) || d; } catch (e) { return d; } };
function saveRecent(he) {
  if (!he) return;
  const list = jget(K.recent, []).filter((x) => x !== he); list.unshift(he);
  ls.set(K.recent, JSON.stringify(list.slice(0, 20))); drawRecent();
}
function drawRecent() {
  const list = jget(K.recent, []);
  $('recentCard').hidden = !list.length;
  $('recentList').innerHTML = list.map((he, i) => `<button class="rchip" type="button" data-i="${i}"><span lang="he" dir="rtl">${esc(he)}</span><i>${compute(he, method).total}</i></button>`).join('');
}
$('recentList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-i]'); if (!b) return;
  const he = jget(K.recent, [])[+b.dataset.i]; if (he) { setInput(he); window.scrollTo({ top: 0, behavior: RM.matches ? 'auto' : 'smooth' }); }
});
$('recentClear').addEventListener('click', () => { ls.set(K.recent, '[]'); drawRecent(); });

/* ------------------------------------------------------------ buttons */
$('copyVal').addEventListener('click', async (e) => { if (cur.res.letters.length) { flash(e.currentTarget, 'Copied', await copyText(String(cur.res.total))); saveRecent(cur.res.hebrew); buzz(); } });
$('copyBrk').addEventListener('click', async (e) => { if (cur.res.letters.length) flash(e.currentTarget, 'Copied', await copyText(breakdownText(cur.he, method))); });
$('shareRes').addEventListener('click', async () => {
  if (!cur.res.letters.length) return;
  const url = location.origin + '/gematria/?q=' + encodeURIComponent(cur.res.hebrew) + (method !== 'standard' ? '&m=' + method : '');
  const text = `${cur.res.hebrew} = ${cur.res.total} (${methodById(method).name})`;
  try { if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ title: 'Gematria', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  flash($('shareRes'), 'Link copied', await copyText(`${text}\n${url}`));
});
$('paste').addEventListener('click', async () => {
  try { const t = await navigator.clipboard.readText(); if (t) setInput(t.slice(0, 600)); else toast('Clipboard is empty'); }
  catch (err) { toast('Press and hold in the box, then Paste'); }
});
$('clear').addEventListener('click', () => { if (q.value) { setInput(''); } });
$('useHe').addEventListener('click', () => setInput(cur.res.hebrew, { focus: false }));
$('tries').innerHTML = ['שלום', 'אהבה', 'משיח', 'תורה', 'חי', 'ברוך'].map((w) => `<button type="button" data-he="${w}" lang="he">${w}</button>`).join('');
$('tries').addEventListener('click', (e) => { const b = e.target.closest('[data-he]'); if (b) setInput(b.dataset.he); });

/* ------------------------------------------------------------ number <-> letters */
const num = $('num');
let numOut = '';
function drawNum() {
  const v = num.value.trim(), out = $('nout');
  numOut = ''; $('numUse').dataset.he = '';
  if (!v) { out.innerHTML = '<span class="ph">Type a number to see it in letters, or Hebrew letters to see the number.</span>'; return; }
  if (/^\d[\d,]*$/.test(v)) {
    const n = +v.replace(/,/g, ''), h = numToHeb(n, { thousands: $('optTh').checked });
    if (!h) { out.innerHTML = '<span class="ph">Numbers from 1 to 999,999 work.</span>'; return; }
    numOut = h; $('numUse').dataset.he = h;
    out.innerHTML = `<span class="big" lang="he" dir="rtl">${esc(h)}</span>`;
  } else if (/[א-ת]/.test(v)) {
    const n = hebToNum(v);
    if (n == null) { out.innerHTML = '<span class="ph">That does not read as one numeral.</span>'; return; }
    numOut = String(n); $('numUse').dataset.he = v;
    out.innerHTML = `<span class="num">${n.toLocaleString('en-US')}</span>`;
  } else out.innerHTML = '<span class="ph">Digits or Hebrew letters, please.</span>';
}
num.addEventListener('input', drawNum);
$('optTh').checked = ls.get(K.th, '1') === '1';
$('optTh').addEventListener('change', () => { ls.set(K.th, $('optTh').checked ? '1' : '0'); drawNum(); });
$('numCopy').addEventListener('click', async (e) => { if (numOut) flash(e.currentTarget, 'Copied', await copyText(numOut)); });
$('numUse').addEventListener('click', () => { const he = $('numUse').dataset.he; if (he) { setInput(he); window.scrollTo({ top: 0, behavior: RM.matches ? 'auto' : 'smooth' }); } });

/* ------------------------------------------------------------ this year (from /luach/) */
(function year() {
  try {
    const d = new Date();
    const h = absToHebrew(gregToAbs(d.getFullYear(), d.getMonth() + 1, d.getDate()));
    const letters = numToHeb(h.y, { thousands: false });
    $('yearNum').textContent = numToHeb(h.y, { thousands: true });
    $('yearY').textContent = h.y;
    const plain = numToHeb(h.y, { thousands: false, punct: false });
    $('yearSub').textContent = `Today is ${hebrewDateHe(h)} · ${plain} = ${compute(plain).total}`;
    $('yearBtn').dataset.he = plain;
    $('yearBtn').setAttribute('aria-label', `Hebrew year ${h.y}, ${letters}. Tap to count it.`);
  } catch (e) { $('yearCard').hidden = true; }
})();
$('yearBtn').addEventListener('click', () => { const he = $('yearBtn').dataset.he; if (he) { setInput(he); window.scrollTo({ top: 0, behavior: RM.matches ? 'auto' : 'smooth' }); } });

/* ------------------------------------------------------------ keyboard */
let own = ls.get(K.own, '0') === '1';
const kb = mountKeyboard($('kbHost'), { target: q, onChange: () => update(), onToggle: () => syncKb() });
function syncKb() { $('kbToggle').setAttribute('aria-pressed', String(own && kb.isOpen())); q.setAttribute('inputmode', own ? 'none' : 'text'); }
$('kbToggle').addEventListener('click', () => {
  if (own && kb.isOpen()) { own = false; kb.hide(); } else { own = true; kb.show(); q.focus({ preventScroll: true }); }
  ls.set(K.own, own ? '1' : '0'); syncKb();
});
q.addEventListener('focus', () => { if (own && !kb.isOpen()) kb.show(); syncKb(); });
q.addEventListener('pointerup', () => { if (own && !kb.isOpen()) kb.show(); });
num.addEventListener('focus', () => { if (kb.isOpen()) kb.hide(); });
syncKb();

/* ------------------------------------------------------------ info sheet */
$('methodList').innerHTML = METHODS.map((m) => `<div class="mrow"><b>${esc(m.name)}<span lang="he">${esc(m.he)}</span></b><p>${esc(m.blurb)}</p></div>`).join('');
const sheet = $('sheet'), back = $('sheetBack');
let lastFocus;
function openSheet() {
  lastFocus = document.activeElement; back.hidden = false; sheet.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => { back.classList.add('on'); sheet.classList.add('on'); $('sheetClose').focus({ preventScroll: true }); }));
}
function closeSheet() {
  if (sheet.hidden) return;
  sheet.classList.remove('on'); back.classList.remove('on');
  setTimeout(() => { sheet.hidden = true; back.hidden = true; }, RM.matches ? 150 : 400);
  if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
}
$('info').addEventListener('click', openSheet); $('sheetClose').addEventListener('click', closeSheet); back.addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

/* ------------------------------------------------------------ start */
const P = new URLSearchParams(location.search);
if (METHODS.some((m) => m.id === P.get('m'))) method = P.get('m');
renderMethods(); drawRecent();
const pre = P.get('q') != null ? P.get('q') : P.get('text');
q.value = pre != null ? pre.slice(0, 600) : ls.get(K.draft, '');
update(true);
if (pre != null && cur.res.letters.length) saveRecent(cur.res.hebrew);
