import {
  CATS, CURRENCIES, PRESETS, DEFAULTS, todayYMD, validYMD, uid, parseCents, centsToInput, pctOf, counted, totals,
  filterEntries, groupByMonth, civilYears, periodSeries, civilBucket, toCSV, sanitize,
} from '/maaser/logic.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const KEY = 'szv-maaser';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONFULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* ---------- state ---------- */
let S = DEFAULTS();
try { const r = sanitize(JSON.parse(localStorage.getItem(KEY) || 'null')); if (r) S = r; } catch (e) { /* storage blocked: start empty */ }
let storageOk = true;
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); storageOk = true; } catch (e) { storageOk = false; } }

const U = { type: 'all', cat: 'all', q: '', mode: 'civil', period: null, sel: -1 };

/* Hebrew calendar helpers come from /luach/ (imported, not re-implemented). Optional. */
let H = null;
import('/luach/logic.js').then((m) => { H = m; render(); }).catch(() => { /* Hebrew grouping simply stays hidden */ });
const hebBucket = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const h = H.absToHebrew(H.gregToAbs(y, m, d));
  const idx = h.m >= 7 ? h.m - 7 : H.monthsInYear(h.y) - 6 + (h.m - 1);
  return { period: h.y, idx };
};
const hebYearNow = () => { const n = new Date(); return H.absToHebrew(H.gregToAbs(n.getFullYear(), n.getMonth() + 1, n.getDate())).y; };
const hebOn = () => !!(H && S.settings.hebrew);

/* ---------- money ---------- */
const nf = {};
function money(c, opts = {}) {
  const cur = S.settings.cur, whole = c % 100 === 0 && !opts.cents;
  const k = cur + (whole ? 0 : 2);
  if (!nf[k]) { try { nf[k] = new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }); } catch (e) { nf[k] = { format: (v) => '$' + v.toFixed(whole ? 0 : 2) }; } }
  return nf[k].format(c / 100);
}
const curSym = () => { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: S.settings.cur }).formatToParts(0).find((p) => p.type === 'currency').value; } catch (e) { return '$'; } };
const pctLabel = () => `${S.settings.pct}%`;
const shortDate = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return `${MON[m - 1]} ${d}${y !== new Date().getFullYear() ? ', ' + y : ''}`; };
const vib = (n) => { if (!reduced && navigator.vibrate) { try { navigator.vibrate(n); } catch (e) { /* ignore */ } } };

/* ---------- toast ---------- */
let toastT, undoFn = null;
function toast(msg, undo) {
  const t = $('#toast'); $('#toastMsg').textContent = msg; undoFn = undo || null; $('#toastUndo').hidden = !undo;
  t.hidden = false; requestAnimationFrame(() => t.classList.add('on'));
  clearTimeout(toastT); toastT = setTimeout(hideToast, undo ? 6000 : 2200);
}
function hideToast() { const t = $('#toast'); t.classList.remove('on'); setTimeout(() => { t.hidden = true; }, 300); undoFn = null; }
$('#toastUndo').addEventListener('click', () => { const f = undoFn; hideToast(); if (f) f(); });

/* ---------- sheet ---------- */
let lastFocus = null, sheetKeys = null;
function openSheet(html, label, onKey) {
  const sh = $('#sheet'), bk = $('#sheetBack'), wasOpen = !sh.hidden;
  if (!wasOpen) lastFocus = document.activeElement;
  $('#sheetBody').innerHTML = html; sh.setAttribute('aria-label', label || 'Details'); sheetKeys = onKey || null;
  sh.hidden = false; bk.hidden = false;
  requestAnimationFrame(() => { sh.classList.add('on'); bk.classList.add('on'); });
  sh.scrollTop = 0;
  const f = sh.querySelector('[data-autofocus]'); if (f && !wasOpen) f.focus({ preventScroll: true });
}
function closeSheet() {
  const sh = $('#sheet'), bk = $('#sheetBack'); if (sh.hidden) return;
  sh.classList.remove('on'); bk.classList.remove('on'); sheetKeys = null;
  setTimeout(() => { if (!sh.classList.contains('on')) { sh.hidden = true; bk.hidden = true; $('#sheetBody').innerHTML = ''; } }, reduced ? 160 : 420);
  if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
}
$('#sheetBack').addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => {
  const open = !$('#sheet').hidden;
  if (e.key === 'Escape' && open) { closeSheet(); return; }
  if (open && sheetKeys && !(e.target.closest && e.target.closest('input, textarea, select'))) sheetKeys(e);
});

/* ---------- derived ---------- */
const T = () => totals(S);
function periods() {
  if (hebOn() && U.mode === 'heb') {
    const s = new Set([hebYearNow()]);
    S.entries.forEach((e) => s.add(hebBucket(e.date).period));
    return [...s].sort((a, b) => b - a);
  }
  return civilYears(S.entries, new Date().getFullYear());
}
function curPeriod() {
  const list = periods();
  if (U.mode === 'heb' && !hebOn()) U.mode = 'civil';
  if (U.period == null || !list.includes(U.period)) U.period = U.mode === 'heb' ? hebYearNow() : new Date().getFullYear();
  if (!list.includes(U.period)) U.period = list[0];
  return U.period;
}
function periodLabel(p) {
  if (U.mode === 'heb' && H) return `${p} (${H.gematriya(p)})`;
  return String(p);
}
function monthLabels(p) {
  if (U.mode === 'heb' && H) return H.monthsOfYear(p).map((m) => m.name.replace('Menachem ', '').slice(0, 3));
  return MON;
}

/* ---------- render: hero ---------- */
function renderHero() {
  const t = T(), has = S.entries.length > 0;
  const R = 84, C = 2 * Math.PI * R;
  let label, big, sub, cls = '';
  if (!has || (t.owed === 0 && t.given === 0)) { label = 'To give'; big = money(0); sub = `Log what you earn and ${pctLabel()} is worked out for you.`; cls = 'zero'; }
  else if (t.left > 0) { label = 'Left to give'; big = money(t.left); sub = `${money(t.given)} given of ${money(t.owed)} owed`; }
  else if (t.left === 0) { label = 'All square'; big = money(0); sub = `You have given all ${money(t.owed)}. Beautiful.`; cls = 'done'; }
  else { label = 'Ahead by'; big = money(-t.left); sub = `${money(t.given)} given, ${money(t.owed)} owed`; cls = 'ahead'; }
  const len = big.length, size = len > 11 ? 'xs' : len > 9 ? 's' : len > 7 ? 'm' : 'l';
  $('#hero').className = 'card hero ' + cls;
  $('#hero').innerHTML = `
    <div class="ringwrap">
      <svg class="ring" viewBox="0 0 200 200" aria-hidden="true">
        <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--a1)"/><stop offset=".55" style="stop-color:var(--a3)"/><stop offset="1" style="stop-color:var(--a2)"/></linearGradient></defs>
        <circle cx="100" cy="100" r="${R}" class="trk"/>
        <circle cx="100" cy="100" r="${R}" class="arc" style="stroke-dasharray:${(C * t.progress).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 100 100)"/>
      </svg>
      <div class="rc"><span class="lab">${label}</span><b class="amt ${size}">${esc(big)}</b></div>
    </div>
    <p class="hsub">${esc(sub)}</p>
    <div class="stats">
      <div><span class="lab">Income</span><b>${money(t.income)}</b></div>
      <div><span class="lab">Owed ${esc(pctLabel())}</span><b>${money(t.owed)}</b></div>
      <div><span class="lab">Given</span><b>${money(t.given)}</b></div>
    </div>
    ${storageOk ? '' : '<p class="warn">This browser is not saving data right now. Download a backup so nothing is lost.</p>'}`;
}

/* ---------- render: quick calc ---------- */
function calcTiles() {
  const v = parseCents($('#calcIn').value);
  const items = PRESETS.map((p) => ({ name: p.name, pct: p.pct }));
  if (!PRESETS.some((p) => p.pct === S.settings.pct)) items.push({ name: 'Your %', pct: S.settings.pct });
  $('#ctiles').innerHTML = items.map((i) => {
    const val = isNaN(v) ? null : pctOf(v, i.pct);
    return `<button type="button" class="ctile" ${val == null ? 'disabled' : `data-copy="${esc(centsToInput(val))}"`}><span class="lab">${esc(i.name)} ${i.pct}%</span><b>${val == null ? '—' : esc(money(val))}</b></button>`;
  }).join('') + (isNaN(v) || v <= 0 ? '' : `<button type="button" class="link" data-add="i" data-prefill="${esc(centsToInput(v))}">Log this as income &rarr;</button>`);
}

/* ---------- render: year ---------- */
function renderYear() {
  const p = curPeriod();
  const heb = U.mode === 'heb' && hebOn();
  const bucketOf = heb ? hebBucket : civilBucket;
  const n = heb ? H.monthsInYear(p) : 12;
  const ps = periodSeries(S, p, bucketOf, n), labels = monthLabels(p);
  const list = periods(), i = list.indexOf(p);
  const max = Math.max(1, ...ps.series.flatMap((s) => [s.owed, s.given]));
  const W = 320, H_ = 120, pad = 6, slot = (W - pad * 2) / n, bw = Math.min(18, slot * 0.6);
  if (U.sel >= n) U.sel = -1;
  const bars = ps.series.map((s, k) => {
    const x = pad + slot * k + (slot - bw) / 2, oh = Math.round((s.owed / max) * H_), gh = Math.round((s.given / max) * H_);
    return `<g class="bar${U.sel === k ? ' sel' : ''}" data-bar="${k}" role="button" tabindex="0" aria-label="${esc(labels[k])}: given ${esc(money(s.given))}, owed ${esc(money(s.owed))}">
      <rect x="${(pad + slot * k).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H_ + 20}" fill="transparent"/>
      <rect class="own" x="${x.toFixed(1)}" y="${H_ - Math.max(oh, s.owed ? 2 : 0)}" width="${bw.toFixed(1)}" height="${Math.max(oh, s.owed ? 2 : 0)}" rx="4"/>
      <rect class="giv" x="${x.toFixed(1)}" y="${H_ - Math.max(gh, s.given ? 2 : 0)}" width="${bw.toFixed(1)}" height="${Math.max(gh, s.given ? 2 : 0)}" rx="4"/>
      <text x="${(pad + slot * k + slot / 2).toFixed(1)}" y="${H_ + 14}" text-anchor="middle">${esc(labels[k])}</text></g>`;
  }).join('');
  const sel = U.sel >= 0 ? ps.series[U.sel] : null;
  const cap = sel ? `<b>${esc(labels[U.sel])}</b> &middot; given ${esc(money(sel.given))} &middot; owed ${esc(money(sel.owed))}` : `<span class="dot g"></span>Given <span class="dot o"></span>Owed that month. Tap a bar.`;
  const empty = ps.income === 0 && ps.given === 0;
  $('#year').innerHTML = `
    <div class="yhead">
      <div class="lab">${heb ? 'Hebrew year' : 'Year'}</div>
      ${H && S.settings.hebrew ? `<div class="useg" role="group" aria-label="Year type"><button type="button" data-mode="civil" aria-pressed="${!heb}">Civil</button><button type="button" data-mode="heb" aria-pressed="${heb}">Hebrew</button></div>` : ''}
    </div>
    <div class="ynav"><button type="button" class="nav" data-yr="1" aria-label="Earlier year" ${i >= list.length - 1 ? 'disabled' : ''}>&lsaquo;</button><b>${esc(periodLabel(p))}</b><button type="button" class="nav" data-yr="-1" aria-label="Later year" ${i <= 0 ? 'disabled' : ''}>&rsaquo;</button></div>
    <div class="stats y"><div><span class="lab">Income</span><b>${money(ps.income)}</b></div><div><span class="lab">Owed</span><b>${money(ps.owed)}</b></div><div><span class="lab">Given</span><b>${money(ps.given)}</b></div></div>
    <svg class="chart${empty ? ' empty' : ''}" viewBox="0 0 ${W} ${H_ + 20}" role="group" aria-label="Giving per month"><defs><linearGradient id="bg2" x1="0" y1="1" x2="0" y2="0"><stop offset="0" style="stop-color:var(--a1)"/><stop offset=".6" style="stop-color:var(--a3)"/><stop offset="1" style="stop-color:var(--a2)"/></linearGradient></defs>${bars}</svg>
    <p class="cap">${cap}</p>`;
}

/* ---------- render: ledger ---------- */
function renderLedger() {
  const list = filterEntries(S.entries, U), groups = groupByMonth(list, S.settings.basis);
  const seg = (v, l) => `<button type="button" data-type="${v}" aria-pressed="${U.type === v}">${l}</button>`;
  const catRow = U.type === 'g' ? `<div class="chips"><button type="button" class="fchip" data-cat="all" aria-pressed="${U.cat === 'all'}">All</button>${CATS.map((c) => `<button type="button" class="fchip" data-cat="${c.id}" aria-pressed="${U.cat === c.id}">${c.label}</button>`).join('')}</div>` : '';
  let body;
  if (!S.entries.length) body = `<div class="empty"><b>Nothing logged yet</b><span>Tap <em>Got paid</em> when money comes in, and <em>I gave</em> when you give. The rest is done for you.</span></div>`;
  else if (!list.length) body = `<div class="empty"><b>No matches</b><span>Try a different search or filter.</span></div>`;
  else body = groups.map((g) => {
    const [y, m] = g.key.split('-').map(Number);
    return `<div class="mhead"><b>${MONFULL[m - 1]} ${y}</b><span>${g.income ? 'In ' + esc(money(g.income)) : ''}${g.income && g.given ? ' &middot; ' : ''}${g.given ? 'Given ' + esc(money(g.given)) : ''}</span></div>
      <ul class="rows">${g.items.map(rowHtml).join('')}</ul>`;
  }).join('');
  const keep = document.activeElement && document.activeElement.id === 'q' ? document.activeElement.selectionStart : null;
  $('#ledger').innerHTML = `
    <div class="lhead"><div class="lab">Ledger</div><span class="cnt">${S.entries.length} ${S.entries.length === 1 ? 'entry' : 'entries'}</span></div>
    <div class="useg wide" role="group" aria-label="Show">${seg('all', 'All')}${seg('i', 'Income')}${seg('g', 'Given')}</div>
    ${catRow}
    <input id="q" type="search" inputmode="search" autocomplete="off" spellcheck="false" placeholder="Search notes or amounts" value="${esc(U.q)}" aria-label="Search the ledger">
    ${body}
    ${S.entries.length ? `<button type="button" class="link center" data-open="export">Export, print or back up</button>` : ''}`;
  if (keep != null) { const q = $('#q'); q.focus(); try { q.setSelectionRange(keep, keep); } catch (e) { /* ignore */ } }
}
function rowHtml(e) {
  const inc = e.t === 'i', cat = !inc ? (CATS.find((c) => c.id === (e.cat || 'other')) || CATS[4]).label : '';
  const title = e.note || (inc ? 'Income' : 'Given');
  const due = inc ? `<small>Owed ${esc(money(pctOf(counted(e, S.settings.basis), S.settings.pct)))}</small>` : '';
  return `<li class="row ${inc ? 'in' : 'out'}"><span class="dotc" aria-hidden="true"></span>
    <div class="rm"><b>${esc(title)}</b><small>${esc(shortDate(e.date))}${cat ? ' &middot; ' + esc(cat) : ''}${inc && Number.isInteger(e.net) ? ' &middot; take-home ' + esc(money(e.net)) : ''}</small></div>
    <div class="ra"><b>${inc ? '+' : ''}${esc(money(e.amt))}</b>${due}</div>
    <button type="button" class="dots" data-menu="${esc(e.id)}" aria-label="Options for ${esc(title)}, ${esc(money(e.amt))}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button></li>`;
}

function render() {
  renderHero(); renderYear(); renderLedger(); calcTiles();
  $('#calcCur').textContent = curSym();
  $('#calcIn').closest('.calc').querySelector('.cq').textContent = `What’s maaser on…`;
}

/* ---------- entry sheet (keypad) ---------- */
let E = null;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];
function entrySheet(t, existing, prefill) {
  E = existing
    ? { id: existing.id, t: existing.t, amt: centsToInput(existing.amt), date: existing.date, note: existing.note || '', cat: existing.cat || 'tzedakah', net: Number.isInteger(existing.net) ? centsToInput(existing.net) : '', ts: existing.ts }
    : { id: null, t, amt: prefill || '', date: todayYMD(), note: '', cat: 'tzedakah', net: '' };
  const inc = E.t === 'i';
  openSheet(`
    <div class="eh"><h2 class="sh-t">${existing ? 'Edit entry' : inc ? 'Got paid' : 'I gave'}</h2><button type="button" class="chip xs" data-close>Cancel</button></div>
    <div class="kd" aria-live="polite"><span class="cur">${esc(curSym())}</span><b id="kd"></b></div>
    <p class="kpre" id="kpre"></p>
    <div class="kpad" role="group" aria-label="Amount keypad">${KEYS.map((k) => k === 'back'
      ? `<button type="button" class="key fn" data-k="back" aria-label="Delete last digit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-6-6z"/><path d="M13 10l4 4M17 10l-4 4"/></svg></button>`
      : `<button type="button" class="key" data-k="${k}">${k}</button>`).join('')}</div>
    <div class="fields">
      ${inc ? '' : `<div class="chips" role="group" aria-label="Category">${CATS.map((c) => `<button type="button" class="fchip" data-ecat="${c.id}" aria-pressed="${E.cat === c.id}">${c.label}</button>`).join('')}</div>`}
      <label class="fl"><span class="lab">${inc ? 'Source (optional)' : 'To whom (optional)'}</span><input id="eNote" type="text" maxlength="120" autocomplete="off" placeholder="${inc ? 'Paycheck, side job…' : 'Shul, yeshiva, a friend…'}" value="${esc(E.note)}"></label>
      <label class="fl"><span class="lab">Date</span><input id="eDate" type="date" value="${esc(E.date)}"></label>
      ${inc ? `<label class="fl"><span class="lab">Take-home after taxes (optional)</span><input id="eNet" type="text" inputmode="decimal" autocomplete="off" placeholder="Only if you count net" value="${esc(E.net)}"></label>` : ''}
    </div>
    <div class="savebar"><button type="button" class="btn big ${inc ? 'in' : 'out'}" id="eSave">${existing ? 'Save changes' : inc ? 'Add income' : 'Add gift'}</button></div>`,
  existing ? 'Edit entry' : inc ? 'Add income' : 'Add gift', keypadKey);
  entryUpdate();
}
function keypadKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^[0-9]$/.test(e.key) || e.key === '.' || e.key === ',') { keyPress(e.key === ',' ? '.' : e.key); e.preventDefault(); }
  else if (e.key === 'Backspace') { keyPress('back'); e.preventDefault(); }
  else if (e.key === 'Enter') { entrySave(); e.preventDefault(); }
}
function keyPress(k) {
  let a = E.amt;
  if (k === 'back') a = a.slice(0, -1);
  else if (k === '.') { if (!a.includes('.')) a = (a || '0') + '.'; }
  else {
    const [w, f] = a.split('.');
    if (f != null) { if (f.length < 2) a += k; }
    else if (w.length < 9) a = (w === '0' ? '' : a) + k;
  }
  E.amt = a; vib(8); entryUpdate();
}
function entryUpdate() {
  const c = parseCents(E.amt), ok = !isNaN(c) && c > 0;
  $('#kd').textContent = E.amt === '' ? '0' : (() => { const [w, f] = E.amt.split('.'); return w.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f != null ? '.' + f : ''); })();
  $('#kd').className = ok ? '' : 'ph';
  const others = { ...S, entries: S.entries.filter((x) => x.id !== E.id) };
  const t0 = totals(others), pct = S.settings.pct;
  let msg = '';
  if (ok) {
    if (E.t === 'i') {
      const net = parseCents($('#eNet') ? $('#eNet').value : E.net);
      const cnt = S.settings.basis === 'net' && !isNaN(net) ? net : c;
      msg = `<b>${money(pctOf(cnt, pct))}</b> maaser due (${pct}% of ${money(cnt)})`;
      if (S.settings.basis === 'net' && isNaN(net)) msg += `<br><small>Counting the full amount. Add take-home below to count less.</small>`;
    } else {
      const left = t0.left - c;
      msg = left >= 0 ? `<b>${money(left)}</b> still to give after this` : `You would be <b>${money(-left)}</b> ahead`;
    }
  } else msg = E.t === 'i' ? `Type what you were paid. ${pct}% is worked out for you.` : 'Type what you gave.';
  $('#kpre').innerHTML = msg;
  const b = $('#eSave'); if (b) b.disabled = !ok;
}
function entrySave() {
  const c = parseCents(E.amt); if (isNaN(c) || c <= 0) { vib(30); return; }
  const date = validYMD($('#eDate').value) ? $('#eDate').value : todayYMD();
  const note = $('#eNote').value.trim().slice(0, 120);
  const o = { id: E.id || uid(), t: E.t, amt: c, date, note, ts: E.ts || Date.now() };
  if (E.t === 'g') o.cat = E.cat;
  else { const n = parseCents($('#eNet').value); if (!isNaN(n)) o.net = n; }
  const editing = !!E.id, old = editing ? S.entries.find((x) => x.id === E.id) : null;
  if (editing) S.entries = S.entries.map((x) => (x.id === E.id ? o : x)); else S.entries.push(o);
  save(); closeSheet(); render(); vib(14);
  toast(editing ? 'Saved' : `${o.t === 'i' ? 'Income' : 'Gift'} added: ${money(c)}`, () => {
    if (editing) S.entries = S.entries.map((x) => (x.id === o.id ? old : x)); else S.entries = S.entries.filter((x) => x.id !== o.id);
    save(); render();
  });
}

/* ---------- entry menu ---------- */
function menuSheet(id) {
  const e = S.entries.find((x) => x.id === id); if (!e) return;
  openSheet(`<h2 class="sh-t">${esc(e.note || (e.t === 'i' ? 'Income' : 'Given'))}</h2><p class="hint">${esc(money(e.amt))} &middot; ${esc(shortDate(e.date))}</p>
    <button type="button" class="orow" data-edit="${esc(id)}"><b>Edit</b></button>
    <button type="button" class="orow danger" data-del="${esc(id)}"><b>Delete</b></button>
    <button type="button" class="orow" data-close><b>Cancel</b></button>`, 'Entry options');
}
function deleteEntry(id) {
  const i = S.entries.findIndex((x) => x.id === id); if (i < 0) return;
  const e = S.entries[i]; S.entries.splice(i, 1); save(); closeSheet(); render();
  toast('Deleted', () => { S.entries.push(e); save(); render(); });
}

/* ---------- settings ---------- */
function settingsSheet() {
  const s = S.settings, custom = !PRESETS.some((p) => p.pct === s.pct);
  openSheet(`
    <h2 class="sh-t">Settings</h2>
    <div class="lab">Percentage</div>
    <div class="chips wrap">${PRESETS.map((p) => `<button type="button" class="fchip big" data-pct="${p.pct}" aria-pressed="${s.pct === p.pct}"><b>${p.pct}%</b><small>${p.name}</small></button>`).join('')}
      <label class="fchip big cust" aria-pressed="${custom}"><input id="pctC" type="text" inputmode="decimal" autocomplete="off" placeholder="Other %" value="${custom ? esc(s.pct) : ''}" aria-label="Custom percentage"></label></div>
    <p class="hint">Maaser (10%) and chomesh (20%) are the common customs. This is a calculator, not a ruling. Ask your Rav what applies to you.</p>
    <div class="lab">Count maaser on</div>
    <div class="useg wide" role="group" aria-label="Gross or net"><button type="button" data-basis="gross" aria-pressed="${s.basis === 'gross'}">Gross</button><button type="button" data-basis="net" aria-pressed="${s.basis === 'net'}">Net (take-home)</button></div>
    <p class="hint">Some people give on income before taxes, others on what they take home after taxes or business costs. Customs differ, so ask your Rav. With Net, an income entry counts its take-home figure when you add one, otherwise the full amount.</p>
    <div class="lab">Currency</div>
    <div class="chips wrap">${CURRENCIES.map((c) => `<button type="button" class="fchip" data-cur="${c}" aria-pressed="${s.cur === c}">${c}</button>`).join('')}</div>
    ${H ? `<div class="lab">Hebrew year</div><div class="useg wide" role="group" aria-label="Hebrew year totals"><button type="button" data-heb="0" aria-pressed="${!s.hebrew}">Off</button><button type="button" data-heb="1" aria-pressed="${s.hebrew}">Show totals by Hebrew year</button></div>` : ''}
    <div class="lab">Your data</div>
    <button type="button" class="orow" data-open="export"><b>Export, print &amp; backup</b></button>
    <button type="button" class="orow danger" data-open="reset"><b>Reset all&hellip;</b></button>
    <button type="button" class="btn big in" data-close style="margin-top:12px">Done</button>`, 'Settings');
}
function infoSheet() {
  openSheet(`<h2 class="sh-t">About this page</h2>
    <p class="para"><b>Private.</b> Everything you enter stays in this browser on this device. Nothing is sent anywhere. Use Settings to back it up.</p>
    <p class="para"><b>How it works.</b> Add what you earn under <em>Got paid</em>. The page works out ${esc(pctLabel())} as owed, subtracts what you log under <em>I gave</em>, and shows what is left or how far ahead you are.</p>
    <p class="para"><b>Gross or net.</b> Some count maaser on gross income, others on net after taxes. Customs differ. Ask your Rav.</p>
    <p class="para"><b>10% and 20%.</b> Maaser (a tenth) and chomesh (a fifth) are the common customs. Nothing here is a ruling.</p>
    <button type="button" class="btn big in" data-close>Close</button>`, 'About');
}

/* ---------- export / import / reset ---------- */
function periodEntries() {
  const p = curPeriod(), heb = U.mode === 'heb' && hebOn();
  return S.entries.filter((e) => (heb ? hebBucket(e.date) : civilBucket(e.date)).period === p);
}
function exportSheet() {
  openSheet(`<h2 class="sh-t">Export &amp; backup</h2>
    <div class="lab">Records for taxes</div>
    <button type="button" class="orow" data-exp="print"><b>Print summary</b><small>Receipt-style page for ${esc(periodLabel(curPeriod()))} (also Save as PDF)</small></button>
    <button type="button" class="orow" data-exp="csvcopy"><b>Copy as CSV</b><small>Paste into a spreadsheet</small></button>
    <button type="button" class="orow" data-exp="csv"><b>Download CSV</b></button>
    <div class="lab">Backup</div>
    <button type="button" class="orow" data-exp="json"><b>Download backup</b><small>A file you can restore later</small></button>
    <button type="button" class="orow" data-exp="jsoncopy"><b>Copy backup</b></button>
    <label class="orow" for="imp"><b>Import backup</b><small>Choose a backup file</small></label>
    <input id="imp" type="file" accept="application/json,.json" hidden>
    <button type="button" class="btn big in" data-close style="margin-top:12px">Done</button>`, 'Export and backup');
}
function download(name, text, mime) {
  try {
    const b = new Blob([text], { type: mime }), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Downloaded ' + name);
  } catch (e) { toast('Could not download. Try Copy instead.'); }
}
function copyText(text, msg) {
  const fb = () => { try { const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0;font-size:16px'; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); toast(msg); } catch (e) { toast('Could not copy'); } };
  try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(() => toast(msg), fb); return; } } catch (e) { /* fall back */ }
  fb();
}
function printSummary() {
  const p = curPeriod(), heb = U.mode === 'heb' && hebOn(), list = periodEntries();
  const ps = periodSeries(S, p, heb ? hebBucket : civilBucket, heb ? H.monthsInYear(p) : 12);
  const gifts = list.filter((e) => e.t === 'g').sort((a, b) => (a.date < b.date ? -1 : 1));
  $('#receipt').innerHTML = `<h1>Giving summary</h1><p class="rp">${heb ? 'Hebrew year' : 'Calendar year'} ${esc(periodLabel(p))} &middot; prepared ${esc(shortDate(todayYMD()))}</p>
    <table><thead><tr><th>Date</th><th>Recipient / note</th><th>Category</th><th class="r">Amount</th></tr></thead><tbody>
    ${gifts.length ? gifts.map((e) => `<tr><td>${esc(e.date)}</td><td>${esc(e.note || '')}</td><td>${esc((CATS.find((c) => c.id === e.cat) || CATS[4]).label)}</td><td class="r">${esc(money(e.amt, { cents: true }))}</td></tr>`).join('') : '<tr><td colspan="4">No gifts recorded in this period.</td></tr>'}
    </tbody><tfoot><tr><td colspan="3">Total given</td><td class="r">${esc(money(ps.given, { cents: true }))}</td></tr></tfoot></table>
    <h2>Maaser calculation</h2>
    <table><tbody><tr><td>Income counted (${S.settings.basis === 'net' ? 'net' : 'gross'})</td><td class="r">${esc(money(ps.income, { cents: true }))}</td></tr>
    <tr><td>Owed at ${esc(pctLabel())}</td><td class="r">${esc(money(ps.owed, { cents: true }))}</td></tr>
    <tr><td>Given</td><td class="r">${esc(money(ps.given, { cents: true }))}</td></tr>
    <tr><td><b>${ps.left >= 0 ? 'Left to give' : 'Ahead'}</b></td><td class="r"><b>${esc(money(Math.abs(ps.left), { cents: true }))}</b></td></tr></tbody></table>
    <p class="rp">Personal record kept on the owner&rsquo;s device. Not an official receipt from any organization.</p>`;
  closeSheet();
  setTimeout(() => { try { window.print(); } catch (e) { toast('Printing is not available here'); } }, reduced ? 250 : 500);
}
function importFile(file) {
  const rd = new FileReader();
  rd.onload = () => {
    let obj = null; try { obj = JSON.parse(String(rd.result)); } catch (e) { /* invalid */ }
    const clean = sanitize(obj);
    if (!clean || !clean.entries.length && !(obj && obj.entries)) { toast('That does not look like a backup file'); return; }
    window._imp = clean;
    openSheet(`<h2 class="sh-t">Import backup</h2><p class="para">Found <b>${clean.entries.length}</b> ${clean.entries.length === 1 ? 'entry' : 'entries'}. You have <b>${S.entries.length}</b> here now.</p>
      <button type="button" class="orow" data-imp="merge"><b>Add to what is here</b><small>Entries already here are skipped</small></button>
      <button type="button" class="orow danger" data-imp="replace"><b>Replace everything here</b></button>
      <button type="button" class="orow" data-close><b>Cancel</b></button>`, 'Import backup');
  };
  rd.onerror = () => toast('Could not read that file');
  rd.readAsText(file);
}
function resetSheet() {
  openSheet(`<h2 class="sh-t">Reset everything?</h2>
    <p class="para">This permanently erases all ${S.entries.length} entries and your settings from this device. It cannot be undone.</p>
    <button type="button" class="orow" data-exp="json"><b>Download a backup first</b></button>
    <label class="fl"><span class="lab">Type RESET to confirm</span><input id="rtxt" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" data-autofocus></label>
    <button type="button" class="btn big danger" id="doReset" disabled>Erase everything</button>
    <button type="button" class="orow" data-close><b>Keep my data</b></button>`, 'Reset all');
}

/* ---------- events ---------- */
document.addEventListener('click', (ev) => {
  const t = ev.target; let b;
  if (t.closest('[data-close]')) { closeSheet(); return; }
  if ((b = t.closest('[data-add]'))) { entrySheet(b.dataset.add, null, b.dataset.prefill || ''); return; }
  if ((b = t.closest('[data-copy]'))) { copyText(b.dataset.copy, 'Copied ' + money(parseCents(b.dataset.copy))); return; }
  if (t.closest('#setBtn')) { settingsSheet(); return; }
  if (t.closest('#infoBtn')) { infoSheet(); return; }
  if ((b = t.closest('[data-open]'))) { ({ export: exportSheet, reset: resetSheet })[b.dataset.open](); return; }
  if ((b = t.closest('[data-k]'))) { if (E) keyPress(b.dataset.k); return; }
  if ((b = t.closest('[data-ecat]'))) { E.cat = b.dataset.ecat; document.querySelectorAll('[data-ecat]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); return; }
  if (t.closest('#eSave')) { entrySave(); return; }
  if ((b = t.closest('[data-menu]'))) { menuSheet(b.dataset.menu); return; }
  if ((b = t.closest('[data-edit]'))) { const e = S.entries.find((x) => x.id === b.dataset.edit); if (e) entrySheet(e.t, e); return; }
  if ((b = t.closest('[data-del]'))) { deleteEntry(b.dataset.del); return; }
  if ((b = t.closest('[data-pct]'))) { S.settings.pct = +b.dataset.pct; save(); render(); settingsSheet(); return; }
  if ((b = t.closest('[data-basis]'))) { S.settings.basis = b.dataset.basis; save(); render(); settingsSheet(); return; }
  if ((b = t.closest('[data-cur]'))) { S.settings.cur = b.dataset.cur; save(); render(); settingsSheet(); return; }
  if ((b = t.closest('[data-heb]'))) { S.settings.hebrew = b.dataset.heb === '1'; if (!S.settings.hebrew) U.mode = 'civil'; save(); render(); settingsSheet(); return; }
  if ((b = t.closest('[data-mode]'))) { U.mode = b.dataset.mode; U.period = null; U.sel = -1; renderYear(); return; }
  if ((b = t.closest('[data-yr]'))) { const l = periods(), i = l.indexOf(curPeriod()) + Number(b.dataset.yr); if (l[i] != null) { U.period = l[i]; U.sel = -1; renderYear(); } return; }
  if ((b = t.closest('[data-bar]'))) { U.sel = U.sel === +b.dataset.bar ? -1 : +b.dataset.bar; renderYear(); return; }
  if ((b = t.closest('[data-type]'))) { U.type = b.dataset.type; if (U.type !== 'g') U.cat = 'all'; renderLedger(); return; }
  if ((b = t.closest('[data-cat]'))) { U.cat = b.dataset.cat; renderLedger(); return; }
  if ((b = t.closest('[data-exp]'))) {
    const k = b.dataset.exp, stamp = todayYMD();
    if (k === 'print') printSummary();
    else if (k === 'csv') download(`maaser-${stamp}.csv`, toCSV(S), 'text/csv');
    else if (k === 'csvcopy') copyText(toCSV(S), 'CSV copied');
    else if (k === 'json') download(`maaser-backup-${stamp}.json`, JSON.stringify(S, null, 1), 'application/json');
    else if (k === 'jsoncopy') copyText(JSON.stringify(S), 'Backup copied');
    return;
  }
  if ((b = t.closest('[data-imp]'))) {
    const c = window._imp; if (!c) return;
    if (b.dataset.imp === 'replace') S = c;
    else { const ids = new Set(S.entries.map((x) => x.id)); c.entries.forEach((e) => { if (!ids.has(e.id)) S.entries.push(e); }); }
    window._imp = null; save(); closeSheet(); render(); toast('Imported'); return;
  }
  if (t.closest('#doReset')) {
    S = DEFAULTS(); U.period = null; U.type = 'all'; U.cat = 'all'; U.q = ''; save(); closeSheet(); render(); toast('Everything erased'); return;
  }
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('[data-bar]')) { e.preventDefault(); e.target.closest('[data-bar]').dispatchEvent(new MouseEvent('click', { bubbles: true })); }
});
document.addEventListener('input', (e) => {
  const id = e.target.id;
  if (id === 'calcIn') calcTiles();
  else if (id === 'q') { U.q = e.target.value; renderLedger(); }
  else if (id === 'eNet') entryUpdate();
  else if (id === 'rtxt') $('#doReset').disabled = e.target.value.trim().toUpperCase() !== 'RESET';
  else if (id === 'pctC') { const v = parseFloat(e.target.value.replace(',', '.')); if (v > 0 && v <= 100) { S.settings.pct = Math.round(v * 100) / 100; save(); renderHero(); renderYear(); renderLedger(); calcTiles(); document.querySelectorAll('[data-pct]').forEach((x) => x.setAttribute('aria-pressed', 'false')); } }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'imp' && e.target.files && e.target.files[0]) importFile(e.target.files[0]);
});

render();
