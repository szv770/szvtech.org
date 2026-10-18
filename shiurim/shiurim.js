import { OPINIONS, ROWS, SOURCES, TIMES, NOTES, cell, row } from '/shiurim/data.js';
import { unitsFor, unitById, fromBase, toBase, fmt, fraction, howMany, parseNum } from '/shiurim/logic.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const KEY = 'szv-shiurim';
const op = (id) => OPINIONS.find((o) => o.id === id) || OPINIONS[0];

const S = { op: 'naeh', measure: 'revis', tab: 'convert', haveUnit: 'ml', have: '', cV: 'ml', cL: 'cm' };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* storage may be blocked */ }
if (!OPINIONS.some((o) => o.id === S.op)) S.op = 'naeh';
if (!row(S.measure)) S.measure = 'revis';
S.tab = 'convert';
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ op: S.op, measure: S.measure, cV: S.cV, cL: S.cL })); } catch (e) { /* ignore */ } };

/* ---------- helpers ---------- */
const kindOf = () => row(S.measure).kind;
const haveUnits = () => unitsFor(kindOf()).filter((u) => ['ml', 'floz', 'cup', 'cm', 'in'].includes(u.id));
function ensureUnit() { if (!haveUnits().some((u) => u.id === S.haveUnit)) S.haveUnit = kindOf() === 'vol' ? 'ml' : 'cm'; }
function valStr(kind, unitId, base) { return fmt(fromBase(kind, unitId, base)); }

function copy(text, label) {
  const done = () => toast('Copied ' + (label || text));
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, fallback); return; }
  } catch (e) { /* fall through */ }
  fallback();
  function fallback() {
    try {
      const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0;font-size:16px'; document.body.appendChild(t); t.select();
      document.execCommand('copy'); t.remove(); done();
    } catch (e) { toast('Could not copy'); }
  }
}
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false; requestAnimationFrame(() => t.classList.add('on'));
  clearTimeout(toastT); toastT = setTimeout(() => { t.classList.remove('on'); setTimeout(() => { t.hidden = true; }, 300); }, 1800);
}

/* ---------- bottom sheet ---------- */
let lastFocus = null;
function openSheet(html, label) {
  lastFocus = document.activeElement;
  $('#sheetBody').innerHTML = html; $('#sheet').setAttribute('aria-label', label || 'Details');
  const sh = $('#sheet'), bk = $('#sheetBack'); sh.hidden = false; bk.hidden = false;
  requestAnimationFrame(() => { sh.classList.add('on'); bk.classList.add('on'); });
  sh.scrollTop = 0; const f = sh.querySelector('button, a, input'); if (f) f.focus({ preventScroll: true });
}
function closeSheet() {
  const sh = $('#sheet'), bk = $('#sheetBack'); if (sh.hidden) return;
  sh.classList.remove('on'); bk.classList.remove('on');
  setTimeout(() => { sh.hidden = true; bk.hidden = true; }, reduced ? 160 : 420);
  if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
}
$('#sheetBack').addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

function opinionSheet() {
  openSheet(`<h2 class="sh-t">Choose an opinion</h2>` + OPINIONS.map((o) => `
    <button type="button" class="orow${o.id === S.op ? ' on' : ''}" data-op="${o.id}"><span><b>${esc(o.name)}</b><small>${esc(o.sub)}</small></span><i aria-hidden="true">${o.id === S.op ? '&#10003;' : ''}</i></button>`).join('')
    + `<p class="hint">Only published figures are shown. Where none was verified you will see —.</p>`, 'Choose an opinion');
}
function sourcesSheet(focus) {
  let top = '';
  if (focus) {
    const r = row(focus.r), c = cell(focus.r, focus.o);
    top = `<div class="focus"><div class="lab">This figure</div><b>${esc(r.en)} · ${esc(op(focus.o).name)}</b>` + (c
      ? `<ul>${c.src.map((k) => srcLi(k)).join('')}</ul>${c.derived ? '<p class="hint">Calculated from a published figure using the standard Talmudic ratio.</p>' : ''}`
      : `<p class="hint">No figure verified for this opinion, so it is left blank.</p>`) + `</div>`;
  }
  const used = Object.keys(SOURCES).filter((k) => k !== 'ratio');
  openSheet(`<h2 class="sh-t">Sources &amp; notes</h2>${top}
    <div class="lab">Where the numbers come from</div><ul class="srcs">${used.map(srcLi).join('')}${srcLi('ratio')}</ul>
    <div class="lab">Good to know</div><ul class="notes">${NOTES.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
    <p class="hint">For convenience only. For practice, ask your Rav.</p>`, 'Sources and notes');
}
function srcLi(k) { const s = SOURCES[k]; return `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a></li>`; }

/* ---------- convert tab ---------- */
function resultUnits(r, base) {
  if (r.kind === 'vol') {
    const out = [['floz', 'fl oz'], ['cup', 'cups'], ['g', 'g of water']];
    if (base >= 1000) out.push(['l', 'litres']);
    return out.map(([id, lab]) => ({ lab, val: id === 'g' ? fmt(base) : valStr('vol', id, base) }));
  }
  const out = [['in', 'inches']];
  if (base >= 100) out.push(['m', 'metres'], ['ft', 'feet']);
  if (base >= 100000) out.push(['km', 'km'], ['mi', 'miles']);
  return out.map(([id, lab]) => ({ lab, val: valStr('len', id, base) }));
}

function renderConvert() {
  const r = row(S.measure), o = op(S.op), c = cell(r.id, o.id);
  ensureUnit();
  const chipRow = (kind, title) => `<div class="mgroup"><div class="lab">${title}</div><div class="chips" data-fade>${ROWS.filter((x) => x.kind === kind).map((x) => `<button type="button" class="mchip${x.id === S.measure ? ' on' : ''}" data-m="${x.id}"><span>${esc(x.en)}</span><small lang="he" dir="rtl">${x.he}</small></button>`).join('')}</div></div>`;

  let hero;
  if (c) {
    const mainU = r.kind === 'vol' ? 'ml' : 'cm';
    const mainTxt = r.kind === 'vol' ? fmt(c.v) : fmt(c.v);
    const grid = resultUnits(r, c.v).map((u) => `<button type="button" class="ures" data-copy="${esc(u.val + ' ' + u.lab)}"><b>${esc(u.val)}</b><small>${esc(u.lab)}</small></button>`).join('');
    hero = `<div class="hero-top"><span class="he" lang="he" dir="rtl">${r.he}</span><span class="hname">${esc(r.en)}</span></div>
      <button type="button" class="big" data-copy="${esc(mainTxt + ' ' + mainU)}" aria-label="Copy ${esc(mainTxt + ' ' + mainU)}"><span class="num">${esc(mainTxt)}</span><span class="u">${mainU}</span></button>
      <div class="hsub">${esc(r.hint)} · ${esc(o.short)}${c.derived ? ' · <em>calculated</em>' : ''}</div>
      <div class="ugrid">${grid}</div>
      <div class="hfoot"><span>Tap any number to copy</span><button type="button" class="link" data-src="${r.id}|${o.id}">Where is this from?</button></div>`;
  } else {
    const others = OPINIONS.filter((x) => cell(r.id, x.id));
    hero = `<div class="hero-top"><span class="he" lang="he" dir="rtl">${r.he}</span><span class="hname">${esc(r.en)}</span></div>
      <div class="big none"><span class="num">—</span></div>
      <div class="hsub">No verified figure for ${esc(o.name)}.</div>
      <p class="hint" style="margin:6px 0 10px">We only show numbers we could check in a published source.</p>
      <div class="swap">${others.map((x) => `<button type="button" class="chip" data-op="${x.id}">${esc(x.short)}</button>`).join('')}</div>`;
  }

  /* reverse converter */
  let rev = '';
  const cur = c ? c.v : null;
  const haveN = parseNum(S.have);
  let resHtml = `<div class="rres dim">Type an amount to see how many ${esc(r.en)}.</div>`;
  if (!c) resHtml = `<div class="rres dim">Pick an opinion that has a figure for ${esc(r.en)}.</div>`;
  else if (!isNaN(haveN)) {
    const n = howMany(toBase(r.kind, S.haveUnit, haveN), cur), f = fraction(n);
    resHtml = `<button type="button" class="rres" data-copy="${esc((f.approx ? '≈ ' : '') + f.text + ' ' + r.en)}"><span class="rn">${f.approx ? '<i>≈</i> ' : ''}${esc(f.text)}</span><span class="ru">${esc(r.en)}</span>${f.exact || f.decimal ? '' : ''}<small>${esc(fmt(n))} exactly-ish</small></button>`;
    const same = ROWS.filter((x) => x.kind === r.kind && x.id !== r.id && cell(x.id, o.id) && ['kezayis', 'kebeitza', 'revis', 'log', 'kav', 'etzba', 'tefach', 'amah', 'mil'].includes(x.id));
    const base = toBase(r.kind, S.haveUnit, haveN);
    resHtml += `<div class="also"><div class="lab">Same amount in</div><div class="chips" data-fade>${same.map((x) => { const q = fraction(base / cell(x.id, o.id).v); return `<button type="button" class="mchip sm" data-m="${x.id}"><span>${q.approx ? '≈' : ''}${esc(q.text)} ${esc(x.en)}</span></button>`; }).join('')}</div></div>`;
  }
  rev = `<div class="card rev"><div class="lab">Reverse</div><h2>I have…</h2>
    <div class="rin"><input id="have" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done" placeholder="200" value="${esc(S.have)}" aria-label="Amount you have">
    <div class="useg" role="group" aria-label="Unit">${haveUnits().map((u) => `<button type="button" data-hu="${u.id}" aria-pressed="${u.id === S.haveUnit}">${esc(u.label)}</button>`).join('')}</div></div>
    <div id="rout">${resHtml}</div></div>`;

  $('#paneConvert').innerHTML = `
    <button type="button" class="opsel" id="opsel"><span class="lab">Opinion</span><b>${esc(o.name)}</b><i aria-hidden="true">&#9662;</i></button>
    ${chipRow('vol', 'Volume')}${chipRow('len', 'Length')}
    <div class="card hero">${hero}</div>
    ${rev}`;
  fades();
  scrollSelected();
}
function scrollSelected() { document.querySelectorAll('#paneConvert .mchip.on').forEach((b) => { const p = b.parentElement; if (p) p.scrollLeft = Math.max(0, b.offsetLeft - p.clientWidth / 2 + b.offsetWidth / 2); }); }

/* update only the reverse result (keeps the input focused while typing) */
function updateReverse() {
  const r = row(S.measure), o = op(S.op), c = cell(r.id, o.id), n0 = parseNum(S.have);
  const out = $('#rout'); if (!out) return;
  if (!c || isNaN(n0)) { renderConvert(); return; }
  const was = document.activeElement && document.activeElement.id === 'have';
  const pos = was ? document.activeElement.selectionStart : 0;
  renderConvert();
  if (was) { const i = $('#have'); i.focus(); try { i.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } }
}

/* ---------- chart tab ---------- */
function renderChart() {
  const tbl = (kind) => {
    const unit = kind === 'vol' ? S.cV : S.cL, us = kind === 'vol' ? [['ml', 'ml'], ['floz', 'fl oz']] : [['cm', 'cm'], ['in', 'inches']];
    const rows = ROWS.filter((x) => x.kind === kind);
    const seg = `<div class="useg small" role="group" aria-label="Unit">${us.map(([id, l]) => `<button type="button" data-cu="${kind}|${id}" aria-pressed="${id === unit}">${l}</button>`).join('')}</div>`;
    const body = rows.map((x) => `<tr><th scope="row"><button type="button" data-m="${x.id}" data-go><b>${esc(x.en)}</b><small>${esc(x.hint)}</small></button></th>${OPINIONS.map((p) => {
      const c = cell(x.id, p.id);
      return c ? `<td><button type="button" data-op="${p.id}" data-m="${x.id}" data-go>${esc(valStr(kind, unit, c.v))}${c.derived ? '<i class="dv" title="calculated"></i>' : ''}</button></td>` : `<td class="na"><span aria-label="no verified figure">—</span></td>`;
    }).join('')}</tr>`).join('');
    return `<div class="card tcard"><div class="thead"><h2>${kind === 'vol' ? 'Volume' : 'Length'}</h2>${seg}</div>
      <div class="twrap" data-fade><table><thead><tr><th scope="col"><span class="sr">Measure</span></th>${OPINIONS.map((p) => `<th scope="col">${esc(p.short)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div></div>`;
  };
  $('#paneChart').innerHTML = `${tbl('vol')}${tbl('len')}
    <p class="legend"><i class="dv"></i> calculated from a published figure by the standard ratio &nbsp;·&nbsp; — not verified, so left blank</p>
    <div class="card times"><div class="lab">By time</div>${TIMES.map((t) => `<div class="trow"><div><b>${esc(t.en)}</b><small>${esc(t.note)}</small></div><div class="tv"><b>${esc(t.val)}</b><small>${esc(t.alt)}</small></div></div>`).join('')}</div>
    <button type="button" class="link center" id="srcBtn">Sources &amp; notes</button>`;
  fades();
}

/* scroll-fade hints on horizontally scrolling strips */
function fades() {
  document.querySelectorAll('[data-fade]').forEach((el) => {
    if (el._f) return; el._f = true;
    const upd = () => { el.classList.toggle('fl', el.scrollLeft > 4); el.classList.toggle('fr', el.scrollLeft + el.clientWidth < el.scrollWidth - 4); };
    el.addEventListener('scroll', upd, { passive: true }); upd(); setTimeout(upd, 300);
  });
}
addEventListener('resize', () => document.querySelectorAll('[data-fade]').forEach((el) => el.dispatchEvent(new Event('scroll'))));

/* ---------- tabs & events ---------- */
function setTab(t) {
  S.tab = t;
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  $('#paneConvert').hidden = t !== 'convert'; $('#paneChart').hidden = t !== 'chart';
  if (t === 'chart') renderChart(); else renderConvert();
  window.scrollTo({ top: 0, behavior: 'auto' });
}
document.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });

document.addEventListener('click', (e) => {
  const t = e.target;
  let b;
  if ((b = t.closest('[data-copy]'))) { copy(b.dataset.copy); return; }
  if (t.closest('#opsel')) { opinionSheet(); return; }
  if ((b = t.closest('.orow'))) { S.op = b.dataset.op; save(); closeSheet(); setTab(S.tab); return; }
  if ((b = t.closest('[data-src]'))) { const [r, o] = b.dataset.src.split('|'); sourcesSheet({ r, o }); return; }
  if (t.closest('#infoBtn') || t.closest('#srcBtn')) { sourcesSheet(); return; }
  if ((b = t.closest('[data-hu]'))) { S.haveUnit = b.dataset.hu; renderConvert(); return; }
  if ((b = t.closest('[data-cu]'))) { const [k, u] = b.dataset.cu.split('|'); if (k === 'vol') S.cV = u; else S.cL = u; save(); renderChart(); return; }
  if ((b = t.closest('[data-go]'))) {
    S.measure = b.dataset.m; if (b.dataset.op) S.op = b.dataset.op; save(); setTab('convert'); return;
  }
  if ((b = t.closest('[data-op]')) && !t.closest('.orow')) { S.op = b.dataset.op; save(); renderConvert(); return; }
  if ((b = t.closest('[data-m]'))) { S.measure = b.dataset.m; save(); renderConvert(); }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'have') { S.have = e.target.value; updateReverse(); }
});

setTab('convert');
