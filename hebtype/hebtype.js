// /hebtype — Hebrew keyboard, transliteration, Rashi script and text tools.
// Pure text logic lives in text.js / translit.js (unit-tested); the keyboard in keyboard.js (shared with /gematria/).
import { stripNikud, stripTrope, fixFinals, unFinal, reverseVisual, countText, hasNikud } from './text.js';
import { latinToHebrew, hebrewToLatin, DICTIONARY_SIZE } from './translit.js';
import { mountKeyboard } from './keyboard.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RM = matchMedia('(prefers-reduced-motion: reduce)');
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};
const jget = (k, d) => { try { return JSON.parse(ls.get(k, '')) || d; } catch (e) { return d; } };

const txt = $('txt');
const K = { draft: 'szv-hebtype-draft', recent: 'szv-hebtype-recent', own: 'szv-hebtype-own', auto: 'szv-hebtype-autofinal', style: 'szv-hebtype-style', paper: 'szv-hebtype-paper', tab: 'szv-hebtype-tab' };

/* ------------------------------------------------------------ toast + clipboard */
let toastT;
function toast(msg, action, fn, ms = 5000) {
  const t = $('toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  t.hidden = false;
  const b = t.querySelector('button');
  if (b) b.addEventListener('click', () => { t.hidden = true; fn && fn(); });
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, ms);
}
async function copyText(s) {
  try { await navigator.clipboard.writeText(s); return true; } catch (e) { /* fall back */ }
  try {
    const t = document.createElement('textarea');
    t.value = s; t.style.cssText = 'position:fixed;opacity:0;font-size:16px;top:0;left:0'; document.body.appendChild(t);
    t.focus({ preventScroll: true }); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok;
  } catch (e) { return false; }
}
function flash(btn, label = 'Copied', ok = true) {
  const old = btn.dataset.l || btn.textContent;
  btn.dataset.l = old; btn.textContent = ok ? label : 'Select & copy'; btn.classList.toggle('done', ok);
  clearTimeout(btn._t); btn._t = setTimeout(() => { btn.textContent = old; btn.classList.remove('done'); }, 1500);
}
function buzz() { try { if (!RM.matches && navigator.vibrate) navigator.vibrate(8); } catch (e) { /* none */ } }

/* ------------------------------------------------------------ the text, undo, recents */
const undo = [];
function setText(v, { label, undoable = true } = {}) {
  if (undoable && v !== txt.value) { undo.push(txt.value); if (undo.length > 20) undo.shift(); }
  txt.value = v; onText();
  if (label) toast(label, 'Undo', doUndo);
}
function doUndo() { if (undo.length) { txt.value = undo.pop(); onText(); } }

function addRecent(s) {
  s = String(s || '').trim();
  if (s.replace(/\s/g, '').length < 2) return;
  const list = jget(K.recent, []).filter((x) => x !== s);
  list.unshift(s);
  ls.set(K.recent, JSON.stringify(list.slice(0, 12)));
  drawRecent();
}
function drawRecent() {
  const list = jget(K.recent, []);
  $('recentCard').hidden = !list.length;
  $('recentList').innerHTML = list.map((s, i) => `<button class="rrow" type="button" data-i="${i}" dir="rtl" lang="he">${esc(s.replace(/\s+/g, ' '))}</button>`).join('');
}
$('recentList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-i]'); if (!b) return;
  const s = jget(K.recent, [])[+b.dataset.i];
  if (s != null) { setText(s, { label: 'Loaded' }); window.scrollTo({ top: 0, behavior: RM.matches ? 'auto' : 'smooth' }); }
});
$('recentClear').addEventListener('click', () => { ls.set(K.recent, '[]'); drawRecent(); });

/* ------------------------------------------------------------ stats + panels refresh */
let raf = 0;
function onText() {
  ls.set(K.draft, txt.value);
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(refresh);
}
function refresh() {
  const v = txt.value, c = countText(v);
  $('stats').innerHTML = c.chars
    ? `<span><b>${c.letters}</b> letters</span><span><b>${c.words}</b> words</span>${c.marks ? `<span><b>${c.marks}</b> nikud</span>` : ''}`
    : '<span>Nothing yet. Type, paste, or tap Hebrew keys.</span>';
  const plain = stripNikud(v).trim();
  $('toGem').href = '/gematria/' + (plain ? '?q=' + encodeURIComponent(plain) : '');
  $('toGem').toggleAttribute('aria-disabled', !plain);
  $('counts').innerHTML = [[c.letters, 'letters'], [c.words, 'words'], [c.marks, 'nikud marks'], [c.chars, 'characters'], [v ? v.split('\n').length : 0, 'lines'], [(v.match(/[ךםןףץ]/g) || []).length, 'final letters']]
    .map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('');
  drawHeOut(); drawPreview();
}
txt.addEventListener('input', onText);

/* ------------------------------------------------------------ tabs */
function showTab(id) {
  document.querySelectorAll('.tabs [role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
  document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.id !== 'p-' + id; });
  ls.set(K.tab, id);
  if (id === 'ra') drawPreview();
}
document.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });

/* ------------------------------------------------------------ transliterate */
const lat = $('lat');
function drawLat() {
  const he = latinToHebrew(lat.value);
  $('latOut').innerHTML = he.trim() ? esc(he) : '<span class="ph">&mdash;</span>';
  return he;
}
lat.addEventListener('input', drawLat);
$('latAdd').addEventListener('click', () => {
  const he = drawLat().trim(); if (!he) { lat.focus(); return; }
  const cur = txt.value, sp = cur && !/\s$/.test(cur) ? ' ' : '';
  setText(cur + sp + he, { label: 'Added to your text' });
  lat.value = ''; drawLat(); buzz();
});
$('latCopy').addEventListener('click', async (e) => { const he = drawLat().trim(); if (he) flash(e.currentTarget, 'Copied', await copyText(he)); });

function drawHeOut() {
  const v = txt.value, has = /[א-ת]/.test(v);
  const out = has ? hebrewToLatin(v) : '';
  $('heOut').innerHTML = out.trim() ? esc(out).replace(/\n/g, '<br>') : '<span class="ph">Type or paste Hebrew above</span>';
  $('heMode').textContent = has ? (hasNikud(v) ? '· exact (has nikud)' : '· best guess (no nikud)') : '';
  $('heHint').textContent = has ? (hasNikud(v) ? 'Ashkenazi / Chabad spelling: kamatz = o, tav = s.' : 'Without nikud the vowels are guessed. Add nikud for an exact result.') : '';
  return out;
}
$('heCopy').addEventListener('click', async (e) => { const s = drawHeOut().trim(); if (s) flash(e.currentTarget, 'Copied', await copyText(s)); });

/* ------------------------------------------------------------ Rashi / print / modern */
const STYLES = {
  rashi: { font: '"Noto Rashi Hebrew"', w: 400, note: 'Rashi script (Noto Rashi Hebrew). It is a font: copying gives normal Hebrew letters.' },
  print: { font: '"Frank Ruhl Libre"', w: 500, note: 'Print: a classic book typeface (Frank Ruhl Libre). Shown for comparison, not Rashi.' },
  modern: { font: 'Heebo', w: 500, note: 'Modern: a clean sans-serif (Heebo). Shown for comparison, not Rashi.' },
};
let style = STYLES[ls.get(K.style, 'rashi')] ? ls.get(K.style, 'rashi') : 'rashi';
let paper = ls.get(K.paper, 'paper') === 'dark' ? 'dark' : 'paper';
function drawPreview() {
  const p = $('prev'), v = txt.value.trim();
  p.className = 'prev ' + style;
  p.innerHTML = v ? esc(txt.value) : '<span class="ph">Your text appears here</span>';
  $('styleNote').textContent = STYLES[style].note + (style === 'rashi' && hasNikud(v) ? ' Nikud may not show in Rashi.' : '');
  document.querySelectorAll('#styleSeg [data-style]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.style === style)));
  document.querySelectorAll('#paperSeg [data-paper]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.paper === paper)));
}
$('styleSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-style]'); if (b) { style = b.dataset.style; ls.set(K.style, style); drawPreview(); } });
$('paperSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-paper]'); if (b) { paper = b.dataset.paper; ls.set(K.paper, paper); drawPreview(); } });
$('rCopy').addEventListener('click', async (e) => { if (txt.value.trim()) { flash(e.currentTarget, 'Copied', await copyText(txt.value)); addRecent(txt.value); } });

async function savePng() {
  const raw = txt.value.replace(/\s+$/g, '');
  if (!raw.trim()) { toast('Type something first'); return; }
  const st = STYLES[style], W = 1200, pad = 72, fs = 72, lh = Math.round(fs * 1.55);
  try { await document.fonts.load(`${st.w} ${fs}px ${st.font}`, raw); await document.fonts.ready; } catch (e) { /* draw with fallback */ }
  const c = document.createElement('canvas'), ctx = c.getContext('2d');
  const font = `${st.w} ${fs}px ${st.font}, "Frank Ruhl Libre", serif`;
  ctx.font = font; ctx.direction = 'rtl'; ctx.textAlign = 'right';
  const maxW = W - pad * 2, lines = [];
  for (const para of raw.split('\n')) {
    let cur = '';
    for (const w of para.split(/(\s+)/)) {
      const t = cur + w;
      if (cur && ctx.measureText(t.trimEnd()).width > maxW) { lines.push(cur.trimEnd()); cur = w.trim() ? w : ''; } else cur = t;
    }
    lines.push(cur.trimEnd());
  }
  const H = pad * 2 + lines.length * lh;
  c.width = W; c.height = Math.min(H, 8000);
  const dark = paper === 'dark';
  ctx.fillStyle = dark ? '#05050a' : '#fbf8f1'; ctx.fillRect(0, 0, W, c.height);
  ctx.font = font; ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = dark ? '#f3f1ff' : '#17141f';
  lines.forEach((l, i) => ctx.fillText(l, W - pad, pad + fs + i * lh - fs * 0.12));
  c.toBlob(async (blob) => {
    if (!blob) { toast('Could not make the picture'); return; }
    const file = new File([blob], 'hebrew-text.png', { type: 'image/png' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ files: [file] }); addRecent(txt.value); return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'hebrew-text.png';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Picture saved'); addRecent(txt.value);
  }, 'image/png');
}
$('pngBtn').addEventListener('click', savePng);

/* ------------------------------------------------------------ tidy tools */
const FIX = {
  nikud: [(s) => stripNikud(s), 'Nikud removed'],
  trope: [(s) => stripTrope(s), 'Trope removed'],
  finals: [(s) => fixFinals(s), 'Final letters fixed'],
  unfinal: [(s) => unFinal(s), 'Final letters made regular'],
  reverse: [(s) => reverseVisual(s), 'Reversed'],
  spaces: [(s) => s.replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim(), 'Spaces tidied'],
};
document.querySelector('[data-fix]').parentElement.addEventListener('click', (e) => {
  const b = e.target.closest('[data-fix]'); if (!b) return;
  const [fn, msg] = FIX[b.dataset.fix];
  const before = txt.value, after = fn(before);
  if (after === before) { toast('Nothing to change'); return; }
  setText(after, { label: msg }); buzz();
});

/* ------------------------------------------------------------ main buttons */
$('copy').addEventListener('click', async (e) => {
  if (!txt.value.trim()) { toast('Nothing to copy yet'); txt.focus(); return; }
  flash(e.currentTarget, 'Copied', await copyText(txt.value)); addRecent(txt.value); buzz();
});
$('paste').addEventListener('click', async () => {
  try {
    const t = await navigator.clipboard.readText();
    if (!t) { toast('Clipboard is empty'); return; }
    const s = txt.selectionStart, e = txt.selectionEnd, v = txt.value;
    setText(v.slice(0, s) + t + v.slice(e), { label: 'Pasted' });
    txt.setSelectionRange(s + t.length, s + t.length);
  } catch (err) { toast('Press and hold in the box, then Paste'); }
});
$('clear').addEventListener('click', () => {
  if (!txt.value) return;
  addRecent(txt.value); setText('', { label: 'Cleared' });
});
$('toGem').addEventListener('click', (e) => { if (!stripNikud(txt.value).trim()) { e.preventDefault(); toast('Type some Hebrew first'); } else addRecent(txt.value); });

/* ------------------------------------------------------------ keyboard */
const coarse = matchMedia('(pointer: coarse)').matches;
let own = ls.get(K.own, coarse ? '1' : '0') === '1';
let autoFinal = ls.get(K.auto, '1') === '1';
const kb = mountKeyboard($('kbHost'), { target: txt, autoFinal, onChange: onText, onToggle: () => syncKb() });
function syncKb() {
  const t = $('kbToggle');
  t.setAttribute('aria-pressed', String(own));
  $('kbLabel').textContent = own ? (kb.isOpen() ? 'Hebrew keys: on' : 'Hebrew keys') : 'Hebrew keys';
  txt.setAttribute('inputmode', own ? 'none' : 'text');
}
$('kbToggle').addEventListener('click', () => {
  if (own && kb.isOpen()) { own = false; kb.hide(); }
  else { own = true; kb.show(); txt.focus({ preventScroll: true }); }
  ls.set(K.own, own ? '1' : '0'); syncKb();
});
txt.addEventListener('focus', () => { if (own && !kb.isOpen()) kb.show(); syncKb(); });
txt.addEventListener('pointerup', () => { if (own && !kb.isOpen()) kb.show(); });
lat.addEventListener('focus', () => { if (kb.isOpen()) kb.hide(); });
syncKb();

/* ------------------------------------------------------------ info sheet */
const sheet = $('sheet'), back = $('sheetBack');
let lastFocus;
function openSheet() {
  lastFocus = document.activeElement;
  $('dictN').textContent = DICTIONARY_SIZE; $('optFinal').checked = autoFinal;
  back.hidden = false; sheet.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => { back.classList.add('on'); sheet.classList.add('on'); $('sheetClose').focus({ preventScroll: true }); }));
}
function closeSheet() {
  if (sheet.hidden) return;
  sheet.classList.remove('on'); back.classList.remove('on');
  setTimeout(() => { sheet.hidden = true; back.hidden = true; }, RM.matches ? 150 : 400);
  if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
}
$('info').addEventListener('click', openSheet);
$('sheetClose').addEventListener('click', closeSheet);
back.addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
$('optFinal').addEventListener('change', (e) => { autoFinal = e.target.checked; kb.setAutoFinal(autoFinal); ls.set(K.auto, autoFinal ? '1' : '0'); });

/* ------------------------------------------------------------ start */
const params = new URLSearchParams(location.search);
const pre = params.get('text') != null ? params.get('text') : params.get('q');
txt.value = pre != null ? pre : ls.get(K.draft, '');
if (params.get('lat')) { lat.value = params.get('lat'); drawLat(); showTab('tr'); } else showTab(['tr', 'ra', 'td'].includes(ls.get(K.tab, 'tr')) ? ls.get(K.tab, 'tr') : 'tr');
if (params.get('tab') && ['tr', 'ra', 'td'].includes(params.get('tab'))) showTab(params.get('tab'));
drawRecent(); refresh();
addEventListener('pagehide', () => addRecent(txt.value));
