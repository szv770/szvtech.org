/* /convert — page logic. Conversion math lives in /convert/units.js. */
import * as U from '/convert/units.js?v=af1c121a55';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'data') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const svgEl = (d, vb = '0 0 24 24') => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', vb); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d); s.append(p);
  return s;
};
const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(pointer: coarse)').matches;

/* ---------- storage ---------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
};
const K_STATE = 'szv-convert', K_RECENT = 'szv-convert-recent', K_FAVS = 'szv-convert-favs';

/* ---------- category icons ---------- */
const ICONS = {
  length: 'M3 8.5h18v7H3zM7 8.5v3M11 8.5v4M15 8.5v3M19 8.5v4',
  mass: 'M6.5 9h11l2.2 11H4.3zM9.2 9a2.8 2.8 0 1 1 5.6 0',
  temp: 'M10 4.5a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0zM12 10v6',
  volume: 'M8 3h8M9 3v6.5L5 18.5A1.6 1.6 0 0 0 6.5 21h11a1.6 1.6 0 0 0 1.5-2.5L15 9.5V3M7 15h10',
  area: 'M4 4h16v16H4zM4 12h16M12 4v16',
  speed: 'M4 17a8 8 0 1 1 16 0M12 17l4.5-5M12 17h0',
  time: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
  data: 'M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zM5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3',
  energy: 'M13 2.5L4.5 14H11l-1 7.5L19.5 10H13z',
  power: 'M9 2.5v5M15 2.5v5M6 7.5h12v3.5a6 6 0 0 1-12 0zM12 17v4.5',
  pressure: 'M12 21a8.5 8.5 0 1 1 0-17 8.5 8.5 0 0 1 0 17zM12 12.5l4-4M7.5 12.5h.01',
  fuel: 'M4.5 21V5.5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2V21M3 21h12M13.5 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V8.5l-3-3M7 7.5h4',
  cooking: 'M5 6.5h11v9a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 15.5zM16 9h1.5a2.5 2.5 0 0 1 0 5H16M8 10h3M8 13h2',
  angle: 'M4 20h16M4 20L15 6M9.5 20a6 6 0 0 0-2-4.4',
  base: 'M7.5 8L3.5 12l4 4M16.5 8l4 4-4 4M14 5l-4 14',
  shoes: 'M3 16.5v-7l4-1 3.5 3.5h4l5.2 1.8a2.2 2.2 0 0 1 1.3 2v1.2H3zM3 19.5h18',
  clothing: 'M8.5 3.5L3.5 6.5l2 4.5 2.8-1V20.5h7.4V10l2.8 1 2-4.5-5-3a3.5 3.5 0 0 1-7 0z',
};
const DEFVAL = { length: '1', mass: '1', temp: '72', volume: '1', area: '1000', speed: '100', time: '90', data: '1', energy: '100', power: '100', pressure: '32', fuel: '30', cooking: '1', angle: '90', base: '255', shoes: '10', clothing: '8' };

/* ---------- elements ---------- */
const catsEl = $('#cats'), qEl = $('#q'), qx = $('#qx'), qhint = $('#qhint');
const fromVal = $('#fromVal'), toVal = $('#toVal'), fromBtn = $('#fromBtn'), toBtn = $('#toBtn');
const swapBtn = $('#swap'), formulaEl = $('#formula'), approxEl = $('#approx');
const ingBtn = $('#ingBtn'), noteEl = $('#note');
const precEl = $('#prec'), precStep = $('#precStep'), precN = $('#precN');
const grpBtn = $('#grp'), starBtn = $('#star'), copyBtn = $('#copy'), negBtn = $('#neg');
const allEl = $('#all'), allTitle = $('#allTitle'), allSub = $('#allSub');
const favsEl = $('#favs'), favHint = $('#favHint'), recentEl = $('#recent'), clearRecent = $('#clearRecent');
const sheet = $('#sheet'), scrim = $('#scrim'), sq = $('#sq'), plist = $('#plist'), pempty = $('#pempty'), sheetTitle = $('#sheetTitle');
const toastEl = $('#toast');

/* ---------- state ---------- */
const saved = LS.get(K_STATE, {}) || {};
const st = {
  cat: U.getCat(saved.cat) ? saved.cat : 'length',
  from: null, to: null,
  fromText: '', toText: '',
  dir: 'from',              // which field the user typed in last
  ing: U.INGREDIENTS.some((x) => x.id === saved.ing) ? saved.ing : 'flour',
  prec: saved.prec && ['auto', 'sig', 'dec'].includes(saved.prec.mode) ? { mode: saved.prec.mode, n: clampN(saved.prec.n) } : { mode: 'auto', n: 6 },
  group: saved.group !== false,
  per: saved.per && typeof saved.per === 'object' ? saved.per : {},
  label: '',                // raw smart query that produced the current state (for ?q= and recents)
  fromNum: NaN, toNum: NaN, // exact numeric values (numbers) or strings (bases)
};
let recents = LS.get(K_RECENT, []); if (!Array.isArray(recents)) recents = [];
let favs = LS.get(K_FAVS, []); if (!Array.isArray(favs)) favs = [];
function clampN(n) { n = Math.round(+n); return Number.isFinite(n) ? Math.max(0, Math.min(12, n)) : 6; }

const cat = () => U.getCat(st.cat);
const unit = (id) => U.getUnit(st.cat, id);
const isBase = () => st.cat === 'base';
const isSizes = () => !!cat().sizes;

function restoreCat(id, want = {}) {
  const c = U.getCat(id);
  const mem = st.per[id] || {};
  let from = want.from || (want.to ? null : mem.from);
  let to = want.to || (want.from ? null : mem.to);
  if (from && !c.map[from]) from = null;
  if (to && !c.map[to]) to = null;
  if (!from && !to) { from = c.def[0]; to = c.def[1]; }
  if (!from) from = (c.def.find((x) => x !== to && U.groupOf(id, x) === U.groupOf(id, to))) || U.defaultTarget(id, to, 1);
  if (!to || to === from || U.groupOf(id, from) !== U.groupOf(id, to)) to = U.defaultTarget(id, from, 1);
  st.cat = id; st.from = from; st.to = to;
  st.fromText = want.val != null ? want.val : (mem.val != null ? mem.val : DEFVAL[id] || '1');
  st.dir = 'from';
}
function remember() { st.per[st.cat] = { from: st.from, to: st.to, val: st.fromText }; }

/* ---------- number helpers ---------- */
const fmtOpts = (group = st.group) => ({ mode: st.prec.mode, n: st.prec.n, group });
function fmt(x, group = st.group) {
  if (typeof x === 'string') return x;
  if (isSizes() && typeof x === 'number' && isFinite(x)) return U.formatNumber(x, { mode: 'auto', group: false });
  return U.formatNumber(x, fmtOpts(group));
}
function fmtBase(s, radix, group = st.group) { return s == null ? '' : group ? U.groupDigits(s, radix) : s; }
/** "1.2e-9" → "1.2 × 10⁻⁹" for read-only text */
const SUPS = { '-': '⁻', '+': '', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
function pretty(s) {
  const m = /^(-?[\d.,]+)e([-+]?\d+)$/i.exec(s);
  return m ? `${m[1]} × 10${[...m[2]].map((c) => SUPS[c]).join('')}` : s;
}
const plain = (n) => (typeof n === 'number' && isFinite(n) ? String(+n.toPrecision(15)) : '');

/** read a value typed into a field of unit `uid`: plain numbers, or anything the smart parser understands */
function readField(text, uid) {
  if (isBase()) {
    const r = unit(uid).radix;
    return U.parseBase(text, r) === null ? null : String(text).trim();
  }
  const n = U.parseNumber(text);
  if (!Number.isNaN(n)) return n;
  const t = String(text || '').trim();
  if (!t) return NaN;
  const p = U.parse(t, { cat: st.cat });
  if (p.ok && p.cat === st.cat && p.value != null && p.from && U.groupOf(st.cat, p.from) === U.groupOf(st.cat, uid)) {
    return U.convert(st.cat, p.from, uid, p.value, { ingredient: p.ingredient || st.ing, raw: true });
  }
  if (p.ok && p.cat == null && typeof p.value === 'number') return p.value;
  return NaN;
}

/* ---------- compute ---------- */
function compute() {
  const opts = { ingredient: st.ing };
  if (isBase()) {
    const rf = unit(st.from).radix, rt = unit(st.to).radix;
    if (st.dir === 'from') {
      const out = U.convertBase(st.fromText, rf, rt);
      st.fromNum = out === null ? null : st.fromText; st.toNum = out;
    } else {
      const out = U.convertBase(st.toText, rt, rf);
      st.toNum = out === null ? null : st.toText; st.fromNum = out;
    }
    return;
  }
  if (st.dir === 'from') {
    const v = readField(st.fromText, st.from);
    st.fromNum = v;
    st.toNum = Number.isNaN(v) ? NaN : U.convert(st.cat, st.from, st.to, v, opts);
  } else {
    const v = readField(st.toText, st.to);
    st.toNum = v;
    st.fromNum = Number.isNaN(v) ? NaN : U.convert(st.cat, st.to, st.from, v, { ...opts, raw: true });
    if (isSizes() && !Number.isNaN(st.fromNum)) st.fromNum = U.convert(st.cat, st.to, st.from, v, opts);
  }
}

/* ---------- rendering ---------- */
function buildCats() {
  catsEl.textContent = '';
  for (const c of U.CATS) {
    const b = h('button', { type: 'button', class: 'chip', data: { cat: c.id }, 'aria-current': 'false', onclick: () => switchCat(c.id) },
      svgEl(ICONS[c.id] || ICONS.length), h('span', { text: c.name }));
    catsEl.append(b);
  }
}
function setUnitBtn(btn, x) {
  btn.querySelector('b').textContent = x.sym;
  btn.querySelector('small').textContent = x.name;
  btn.setAttribute('aria-label', `${btn === fromBtn ? 'From' : 'To'} unit: ${x.name}. Change`);
}

let fitMax = 64;
function measureFit() {
  const w = innerWidth, hgt = innerHeight;
  fitMax = hgt <= 520 && w > hgt ? 46 : w >= 1100 ? 84 : w >= 720 ? 66 : w <= 360 ? 50 : 60;
}
function fit(el, max, min) {
  const len = Math.max(1, (el.value || el.placeholder || '').length);
  const avail = el.clientWidth || 200;
  const size = Math.max(min, Math.min(max, Math.floor(avail / (len * 0.6 + 0.15))));
  el.style.setProperty(el === toVal ? '--big' : '--fs', size + 'px');
  if (el !== toVal) el.style.fontSize = size + 'px';
}

function render(opts = {}) {
  const c = cat(), a = unit(st.from), b = unit(st.to);
  $$('.chip', catsEl).forEach((x) => x.setAttribute('aria-current', String(x.dataset.cat === st.cat)));
  if (opts.scrollChip) scrollChip();
  setUnitBtn(fromBtn, a); setUnitBtn(toBtn, b);
  const im = isBase() ? 'text' : 'decimal';
  fromVal.inputMode = im; toVal.inputMode = im;
  fromVal.autocapitalize = isBase() ? 'characters' : 'off';
  toVal.autocapitalize = isBase() ? 'characters' : 'off';
  fromVal.placeholder = isBase() ? '0' : '0';
  toVal.placeholder = '—';

  // values: the side being edited keeps its raw text, the other side is formatted
  const ae = document.activeElement;
  if (isBase()) {
    const rf = a.radix, rt = b.radix;
    if (st.dir === 'from') {
      if (ae !== fromVal) fromVal.value = st.fromText;
      toVal.value = st.toNum == null ? '' : fmtBase(st.toNum, rt);
    } else {
      if (ae !== toVal) toVal.value = st.toText;
      fromVal.value = st.fromNum == null ? '' : fmtBase(st.fromNum, rf);
    }
    fromVal.classList.toggle('err', st.dir === 'from' && st.fromText.trim() !== '' && st.fromNum == null);
    toVal.classList.toggle('err', st.dir === 'to' && st.toText.trim() !== '' && st.toNum == null);
    approxEl.classList.remove('on');
  } else {
    let rounded = false;
    if (st.dir === 'from') {
      if (ae !== fromVal) fromVal.value = st.fromText;
      const t = Number.isNaN(st.toNum) ? '' : fmt(st.toNum);
      if (ae !== toVal || opts.force) toVal.value = t;
      rounded = !isSizes() && U.isRounded(st.toNum, t);
    } else {
      if (ae !== toVal) toVal.value = st.toText;
      const t = Number.isNaN(st.fromNum) ? '' : fmt(st.fromNum);
      fromVal.value = t;
      rounded = !isSizes() && U.isRounded(st.fromNum, t);
    }
    fromVal.classList.toggle('err', st.dir === 'from' && st.fromText.trim() !== '' && Number.isNaN(st.fromNum));
    toVal.classList.toggle('err', st.dir === 'to' && st.toText.trim() !== '' && Number.isNaN(st.toNum));
    approxEl.classList.toggle('on', rounded);
    approxEl.textContent = st.dir === 'from' ? '≈ rounded' : '≈ from rounded';
  }
  fit(fromVal, coarse ? 30 : 32, 16);
  fit(toVal, fitMax, 20);

  // formula, ingredient, note
  formulaEl.textContent = '';
  const f = formula();
  if (f) formulaEl.append(h('span', { text: f }));
  const showIng = !!c.cooking;
  ingBtn.hidden = !showIng;
  if (showIng) {
    const g = U.ingredient(st.ing);
    $('#ingName').textContent = g.name;
    $('#ingDens').textContent = `${fmtSimple(g.gpc)} g / cup`;
  }
  noteEl.hidden = !c.note;
  noteEl.textContent = c.note || '';
  precEl.hidden = isBase() || isSizes();
  $$('#precMode button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.m === st.prec.mode)));
  precStep.hidden = st.prec.mode === 'auto';
  precN.textContent = st.prec.n;
  grpBtn.setAttribute('aria-pressed', String(st.group));
  grpBtn.textContent = isBase() ? (st.group ? 'FF FF' : 'FFFF') : (st.group ? '1,000' : '1000');
  starBtn.setAttribute('aria-pressed', String(favIndex() >= 0));
  negBtn.hidden = isSizes();

  renderAll();
  scheduleSave();
}
const fmtSimple = (x) => U.formatNumber(x, { mode: 'auto', group: true });

function formula() {
  const a = unit(st.from), b = unit(st.to), c = cat();
  if (isBase()) return `${a.name} → ${b.name}`;
  if (isSizes()) return '';
  if (st.cat === 'temp') {
    const T = {
      'c>f': '°F = °C × 9/5 + 32', 'f>c': '°C = (°F − 32) × 5/9', 'c>k': 'K = °C + 273.15', 'k>c': '°C = K − 273.15',
      'f>k': 'K = (°F + 459.67) × 5/9', 'k>f': '°F = K × 9/5 − 459.67', 'k>r': '°R = K × 9/5', 'r>k': 'K = °R × 5/9',
      'f>r': '°R = °F + 459.67', 'r>f': '°F = °R − 459.67', 'c>re': '°Ré = °C × 4/5', 're>c': '°C = °Ré × 5/4',
    };
    return T[`${a.id}>${b.id}`] || '';
  }
  const one = U.convert(st.cat, st.from, st.to, 1, { ingredient: st.ing, raw: true });
  if (!isFinite(one)) return '';
  if (!!a.inverse !== !!b.inverse) return `${b.sym} = ${pretty(fmtSimple(one))} ÷ ${a.sym}`;
  const ingTxt = c.cooking && a.k !== b.k ? ' ' + U.ingredient(st.ing).name.toLowerCase().replace(/ \(.*\)$/, '') : '';
  return `1 ${a.sym}${ingTxt} = ${pretty(fmtSimple(one))} ${b.sym}`;
}

/* ---------- all units ---------- */
function allUnits() {
  const c = cat();
  if (isBase()) {
    const rs = new Set([2, 8, 10, 16, 3, 12, 32, 36, unit(st.from).radix, unit(st.to).radix]);
    return c.units.filter((x) => rs.has(x.radix));
  }
  return U.unitsLike(st.cat, st.from);
}
function renderAll() {
  const c = cat();
  allEl.textContent = '';
  const gx = U.getUnit(st.cat, st.from).g;
  allTitle.textContent = gx ? (c.units.find((x) => x.g === gx && x.gn) || {}).gn || 'All sizes' : isBase() ? 'Other bases' : `All ${c.name.toLowerCase()} units`;
  allSub.textContent = 'tap to copy';
  const src = st.fromNum;
  const valid = isBase() ? src != null && src !== '' : !Number.isNaN(src) && src != null;
  let lastK = null;
  for (const x of allUnits()) {
    if (c.cooking && x.k !== lastK) { allEl.append(h('li', { class: 'agh', text: x.k === 'v' ? 'Volume' : `Weight · ${U.ingredient(st.ing).name}` })); lastK = x.k; }
    let v = null, txt = '—';
    if (valid) {
      if (isBase()) { v = U.convertBase(src, unit(st.from).radix, x.radix); txt = v == null ? '—' : fmtBase(v, x.radix); }
      else { v = U.convert(st.cat, st.from, x.id, src, { ingredient: st.ing }); txt = Number.isNaN(v) ? '—' : pretty(fmt(v)); }
    }
    const cls = 'arow' + (x.id === st.to ? ' cur' : '') + (x.id === st.from ? ' src' : '');
    const btn = h('button', { type: 'button', class: cls, 'aria-label': `${txt} ${x.name}. Copy` },
      h('span', { class: 'nm' }, h('b', { text: x.name }), h('small', { text: x.sym })),
      h('span', { class: 'v', text: txt }));
    btn.addEventListener('click', () => {
      if (!valid || v == null || (typeof v === 'number' && Number.isNaN(v))) return;
      const raw = isBase() ? v : copyText(v);
      copy(raw, `${raw} ${x.sym}`);
      btn.classList.remove('flash'); void btn.offsetWidth; btn.classList.add('flash');
      commitRecent();
    });
    allEl.append(h('li', null, btn));
  }
}
const copyText = (v) => (typeof v === 'number' ? (isSizes() ? U.formatNumber(v, { group: false }) : U.formatNumber(v, fmtOpts(false))) : String(v));

/* ---------- edits ---------- */
function update(o = {}) { compute(); render(o); scheduleUrl(); scheduleRecent(); }
fromVal.addEventListener('input', () => { st.fromText = fromVal.value; st.dir = 'from'; st.label = ''; update(); });
toVal.addEventListener('input', () => { st.toText = toVal.value; st.dir = 'to'; st.label = ''; update(); });
toVal.addEventListener('focus', () => {
  // switch the result to its full-precision raw form for editing
  if (st.dir === 'from') {
    const raw = isBase() ? (st.toNum || '') : plain(st.toNum);
    toVal.value = raw; st.toText = raw;
  }
  requestAnimationFrame(() => { try { toVal.select(); } catch (e) {} });
});
fromVal.addEventListener('focus', () => {
  if (st.dir === 'to') {
    const raw = isBase() ? (st.fromNum || '') : plain(st.fromNum);
    fromVal.value = raw; st.fromText = raw; st.dir = 'from';
  }
});
toVal.addEventListener('blur', () => {
  if (st.dir === 'to') {
    // fold the edit back into a "from" state so the result stays the big formatted number
    if (isBase() ? st.fromNum != null : !Number.isNaN(st.fromNum)) { st.fromText = isBase() ? st.fromNum : plain(st.fromNum); st.dir = 'from'; }
    compute();
  }
  render({ force: true });
});
fromVal.addEventListener('blur', () => render());
for (const el of [fromVal, toVal]) {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitRecent(); if (coarse) el.blur(); }
    else if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (el.value) { el.value = ''; el.dispatchEvent(new Event('input')); } else el.blur();
    }
  });
}
negBtn.addEventListener('click', () => {
  const t = (st.dir === 'to' ? st.toText : st.fromText).trim();
  const nt = t.startsWith('-') ? t.slice(1) : '-' + (t || '');
  if (st.dir === 'to') { st.toText = nt; toVal.value = nt; } else { st.fromText = nt; fromVal.value = nt; }
  update();
});

function switchCat(id, want) {
  if (!U.getCat(id)) return;
  remember();
  restoreCat(id, want);
  st.label = '';
  update({ scrollChip: true });
}
function scrollChip() {
  const b = catsEl.querySelector(`[data-cat="${st.cat}"]`);
  if (!b || catsEl.scrollWidth <= catsEl.clientWidth + 2) return;
  const left = b.offsetLeft - (catsEl.clientWidth - b.offsetWidth) / 2;
  catsEl.scrollTo({ left, behavior: reduceMQ.matches ? 'auto' : 'smooth' });
}
function swap() {
  const a = st.from; st.from = st.to; st.to = a;
  if (st.dir === 'to') { st.fromText = st.toText; st.dir = 'from'; }
  st.label = '';
  swapBtn.classList.toggle('spin');
  update();
}
swapBtn.addEventListener('click', swap);

/* precision */
$('#precMode').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  st.prec.mode = b.dataset.m;
  if (st.prec.mode === 'sig' && st.prec.n < 1) st.prec.n = 1;
  render({ force: true });
});
precStep.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  st.prec.n = clampN(st.prec.n + +b.dataset.d);
  if (st.prec.mode === 'sig' && st.prec.n < 1) st.prec.n = 1;
  render({ force: true });
});
grpBtn.addEventListener('click', () => { st.group = !st.group; render({ force: true }); });

/* ---------- copy ---------- */
function resultCopyText() {
  if (st.dir === 'to') return isBase() ? (st.fromNum || '') : copyText(st.fromNum);
  return isBase() ? (st.toNum || '') : copyText(st.toNum);
}
async function copy(text, label) {
  if (!text || text === '—') return;
  let ok = false;
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); ok = true; } } catch (e) { ok = false; }
  if (!ok) {
    try {
      const ta = h('textarea', { readonly: true, style: 'position:fixed;left:-9999px;top:0;opacity:0' });
      ta.value = text; document.body.append(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
    } catch (e) { ok = false; }
  }
  toast(ok ? `Copied ${label || text}` : 'Copy failed — select the value instead');
  if (ok && navigator.vibrate) try { navigator.vibrate(8); } catch (e) {}
}
copyBtn.addEventListener('click', () => {
  const side = st.dir === 'to' ? unit(st.from) : unit(st.to);
  const t = resultCopyText();
  copy(t, `${t} ${side.sym}`);
  copyBtn.classList.add('done'); setTimeout(() => copyBtn.classList.remove('done'), 1200);
  commitRecent();
});
let toastT = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 1600);
}

/* ---------- smart box ---------- */
const EXAMPLES = ['5 ft 11 in to cm', '72 f', '3.5 cups flour to g', '100 km/h in mph', '1e6 bytes', '0x1F', '30 mpg to l/100km', 'us men 10 to eu'];
let exampleI = 0;
function idleHint() {
  qhint.className = 'qhint';
  qhint.textContent = '';
  qhint.append('Try ', h('b', { text: EXAMPLES[exampleI % EXAMPLES.length] }), ' · ', h('b', { text: EXAMPLES[(exampleI + 3) % EXAMPLES.length] }));
}
function applySmart(text, { commit = false } = {}) {
  qx.hidden = !text;
  if (!text.trim()) { idleHint(); return false; }
  const r = U.parse(text, { cat: st.cat });
  if (!r.ok) {
    qhint.className = 'qhint err';
    qhint.textContent = r.reason === 'mismatch' ? 'Those units don’t convert into each other' : 'Not sure what that is yet — keep typing';
    return false;
  }
  const want = {};
  if (r.cat && r.cat !== st.cat) {
    remember();
    restoreCat(r.cat, { from: r.from || undefined, to: r.to || undefined });
  } else if (r.cat) {
    if (r.from) st.from = r.from;
    if (r.to) st.to = r.to;
    else if (r.from && (st.to === st.from || U.groupOf(st.cat, st.to) !== U.groupOf(st.cat, st.from))) st.to = U.defaultTarget(st.cat, st.from, r.value);
    if (!r.from && r.to && (st.from === st.to || U.groupOf(st.cat, st.to) !== U.groupOf(st.cat, st.from))) st.from = U.getCat(st.cat).def.find((x) => x !== st.to && U.groupOf(st.cat, x) === U.groupOf(st.cat, st.to)) || st.from;
  }
  if (r.ingredient) st.ing = r.ingredient;
  if (r.value != null) st.fromText = typeof r.value === 'number' ? plain(r.value) : r.value;
  st.dir = 'from';
  st.label = r.cat ? text.trim() : '';
  void want;
  compute();
  render({ scrollChip: true, force: true });
  // preview line
  const a = unit(st.from), b = unit(st.to);
  const left = isBase() ? `${fmtBase(st.fromText, a.radix)} ${a.sym}` : `${pretty(fmt(st.fromNum))} ${a.sym}`;
  const right = isBase() ? `${fmtBase(st.toNum, b.radix)} ${b.sym}` : `${pretty(fmt(st.toNum))} ${b.sym}`;
  qhint.className = 'qhint';
  qhint.textContent = '';
  qhint.append(h('span', { class: 'cat', text: cat().name }), '  ', left, ' = ', h('b', { text: right }));
  scheduleUrl();
  if (commit) commitRecent(); else scheduleRecent();
  return true;
}
let smartT = 0;
qEl.addEventListener('input', () => { clearTimeout(smartT); smartT = setTimeout(() => applySmart(qEl.value), 60); });
qEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault(); clearTimeout(smartT);
    if (applySmart(qEl.value, { commit: true })) {
      if (coarse) qEl.blur(); else qEl.select();
    }
  } else if (e.key === 'Escape') {
    e.preventDefault(); e.stopPropagation();
    if (qEl.value) { qEl.value = ''; applySmart(''); } else qEl.blur();
  }
});
qx.addEventListener('click', () => { qEl.value = ''; applySmart(''); qEl.focus(); });

/* ---------- recents & favourites ---------- */
const recKey = (r) => [r.cat, r.from, r.to, r.val, r.cat === 'cooking' ? r.ing : ''].join('|');
let recentT = 0;
function scheduleRecent() { clearTimeout(recentT); recentT = setTimeout(commitRecent, 3500); }
function commitRecent() {
  clearTimeout(recentT);
  const val = st.dir === 'to' ? (isBase() ? st.fromNum : plain(st.fromNum)) : (isBase() ? st.fromNum : plain(st.fromNum));
  if (val == null || val === '' || (st.dir === 'from' && !String(st.fromText).trim())) return;
  if (!isBase() && (Number.isNaN(st.toNum) || Number.isNaN(st.fromNum))) return;
  if (isBase() && st.toNum == null) return;
  const r = { cat: st.cat, from: st.from, to: st.to, val: String(val), ing: st.ing, label: st.label || '', t: Date.now() };
  const k = recKey(r);
  recents = [r, ...recents.filter((x) => recKey(x) !== k)].slice(0, 12);
  LS.set(K_RECENT, recents);
  renderRecent();
}
function ago(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
}
function renderRecent() {
  recentEl.textContent = '';
  for (const r of recents) {
    const c = U.getCat(r.cat), a = U.getUnit(r.cat, r.from), b = U.getUnit(r.cat, r.to);
    if (!c || !a || !b) continue;
    let left, right;
    if (r.cat === 'base') {
      const out = U.convertBase(r.val, a.radix, b.radix);
      left = `${r.val} ${a.sym}`; right = `${out ?? '—'} ${b.sym}`;
    } else {
      const v = +r.val, out = U.convert(r.cat, r.from, r.to, v, { ingredient: r.ing });
      const f = (x) => (c.sizes ? U.formatNumber(x, { group: false }) : pretty(U.formatNumber(x, fmtOpts())));
      const ingTxt = c.cooking && a.k !== b.k ? ' ' + U.ingredient(r.ing).name.toLowerCase().replace(/ \(.*\)$/, '') : '';
      left = r.label && r.label.length < 40 ? r.label : `${f(v)} ${a.sym}${ingTxt}`;
      right = `${f(out)} ${b.sym}`;
    }
    const btn = h('button', { type: 'button', class: 'rrow', onclick: () => openRecent(r) },
      h('span', { class: 'l' }, left, h('i', { text: '→' }), h('b', { text: right })),
      h('time', { text: ago(r.t) }));
    recentEl.append(h('li', null, btn));
  }
  clearRecent.hidden = !recents.length;
}
function openRecent(r) {
  if (!U.getCat(r.cat)) return;
  remember();
  restoreCat(r.cat, { from: r.from, to: r.to, val: r.val });
  if (r.ing) st.ing = r.ing;
  st.label = r.label || '';
  qEl.value = r.label || ''; qx.hidden = !qEl.value;
  if (qEl.value) applySmart(qEl.value); else { idleHint(); update({ scrollChip: true }); }
  if (innerWidth < 720) $('#conv').scrollIntoView({ block: 'start', behavior: reduceMQ.matches ? 'auto' : 'smooth' });
}
clearRecent.addEventListener('click', () => { recents = []; LS.set(K_RECENT, recents); renderRecent(); toast('Recent cleared'); });

const favKey = (f) => [f.cat, f.from, f.to, f.cat === 'cooking' ? f.ing : ''].join('|');
function favIndex() { const k = favKey({ cat: st.cat, from: st.from, to: st.to, ing: st.ing }); return favs.findIndex((f) => favKey(f) === k); }
function toggleFav() {
  const i = favIndex();
  if (i >= 0) { favs.splice(i, 1); toast('Removed from saved pairs'); }
  else { favs = [{ cat: st.cat, from: st.from, to: st.to, ing: st.ing }, ...favs].slice(0, 16); toast('Saved pair'); }
  LS.set(K_FAVS, favs);
  renderFavs(); render();
}
starBtn.addEventListener('click', toggleFav);
function renderFavs() {
  favsEl.textContent = '';
  for (const f of favs) {
    const a = U.getUnit(f.cat, f.from), b = U.getUnit(f.cat, f.to);
    if (!a || !b) continue;
    const c = U.getCat(f.cat);
    const ingTxt = c.cooking && a.k !== b.k ? ' · ' + U.ingredient(f.ing).name.replace(/ \(.*\)$/, '').toLowerCase() : '';
    const chip = h('span', { class: 'fav' },
      h('button', { type: 'button', title: `${a.name} → ${b.name}`, onclick: () => {
        const same = f.cat === st.cat;
        const val = same ? (isBase() ? (st.fromNum ?? st.fromText) : plain(st.fromNum) || st.fromText) : undefined;
        remember();
        restoreCat(f.cat, { from: f.from, to: f.to, val: same && f.cat !== 'base' ? val : undefined });
        if (f.ing) st.ing = f.ing;
        st.label = ''; update({ scrollChip: true });
      } }, a.sym, h('i', { text: '→' }), b.sym + ingTxt),
      h('button', { type: 'button', class: 'rm', 'aria-label': `Remove ${a.sym} to ${b.sym}`, text: '×', onclick: () => { favs = favs.filter((x) => favKey(x) !== favKey(f)); LS.set(K_FAVS, favs); renderFavs(); render(); } }));
    favsEl.append(chip);
  }
  favHint.textContent = favs.length ? `${favs.length} saved` : '★ a pair to keep it here';
}

/* ---------- picker sheet ---------- */
let pick = null;           // { side: 'from'|'to'|'ing' }
let lastFocus = null, items = [], act = -1;
function openPicker(side) {
  pick = { side };
  lastFocus = document.activeElement;
  sheetTitle.textContent = side === 'ing' ? 'Ingredient' : side === 'from' ? 'Convert from' : 'Convert to';
  sq.value = '';
  sq.placeholder = side === 'ing' ? 'Search ingredients' : `Search ${cat().name.toLowerCase()} — or any unit`;
  buildList();
  sheet.classList.add('open'); scrim.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  document.documentElement.classList.add('locked');
  const sel = plist.querySelector('[aria-selected="true"]');
  const body = sheet.querySelector('.sheet-body');
  body.scrollTop = 0;
  if (sel) requestAnimationFrame(() => { body.scrollTop = Math.max(0, sel.offsetTop - body.clientHeight / 2 + 30); });
  if (!coarse) setTimeout(() => sq.focus({ preventScroll: true }), reduceMQ.matches ? 0 : 60);
  else sheet.querySelector('.x').focus({ preventScroll: true });
}
function closePicker() {
  if (!pick) return;
  pick = null;
  sheet.classList.remove('open', 'dragging'); sheet.style.transform = '';
  scrim.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  document.documentElement.classList.remove('locked');
  if (sheet.contains(document.activeElement)) document.activeElement.blur();
  if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
}
const CHECK = 'M4 10.5l4 4 8-9';
function opt(label, sub, sym, selected, onPick) {
  const b = h('button', { type: 'button', class: 'popt', role: 'option', 'aria-selected': String(!!selected) },
    h('span', { class: 's', text: sym }),
    h('span', { class: 'n' }, label, sub ? h('small', { text: sub }) : null),
    (() => { const s = svgEl(CHECK, '0 0 20 20'); s.classList.add('ck'); return s; })());
  b.addEventListener('click', onPick);
  items.push(b);
  return h('li', null, b);
}
function score(x, q) {
  const n = x.name.toLowerCase(), s = x.sym.toLowerCase();
  const al = x.a.map((a) => a.replace(/^=/, '').toLowerCase());
  if (s === q || al.includes(q)) return 0;
  if (n.startsWith(q) || s.startsWith(q) || al.some((a) => a.startsWith(q))) return 1;
  if (n.includes(q) || al.some((a) => a.includes(q))) return 2;
  return -1;
}
function buildList() {
  const q = sq.value.trim().toLowerCase();
  plist.textContent = ''; items = []; act = -1;
  if (pick.side === 'ing') {
    for (const g of U.INGREDIENTS) {
      if (q && !g.name.toLowerCase().includes(q) && !g.a.some((a) => a.includes(q))) continue;
      plist.append(opt(g.name, g.a.slice(0, 3).join(' · '), `${fmtSimple(g.gpc)} g`, g.id === st.ing, () => { st.ing = g.id; closePicker(); update(); }));
    }
  } else {
    const side = pick.side, cur = side === 'from' ? st.from : st.to;
    const c = cat();
    let list = c.units.map((x) => ({ x, s: q ? score(x, q) : 0 })).filter((o) => o.s >= 0);
    if (q) list.sort((a, b) => a.s - b.s);
    let lastG = null;
    if (isBase() && !q) {
      plist.append(h('li', { class: 'pgh', text: 'Common' }));
      for (const o of list.filter((o) => o.x.common)) plist.append(opt(o.x.name, `radix ${o.x.radix}`, o.x.sym, o.x.id === cur, () => choose(side, st.cat, o.x.id)));
      plist.append(h('li', { class: 'pgh', text: 'All bases' }));
      list = list.filter((o) => !o.x.common);
    }
    for (const o of list) {
      const x = o.x;
      if (!q && x.gn && x.g !== lastG) { plist.append(h('li', { class: 'pgh', text: x.gn })); lastG = x.g; }
      if (c.cooking && !q && x.k !== lastG) { plist.append(h('li', { class: 'pgh', text: x.k === 'v' ? 'Volume' : 'Weight' })); lastG = x.k; }
      const sub = x.a.filter((a) => a[0] !== '=' && a !== x.sym.toLowerCase()).slice(0, 3).join(' · ');
      plist.append(opt(x.name, sub, x.sym, x.id === cur, () => choose(side, st.cat, x.id)));
    }
    if (q) {
      const other = [];
      for (const oc of U.CATS) {
        if (oc.id === st.cat || oc.id === 'base') continue;
        for (const x of oc.units) { const s = score(x, q); if (s >= 0) other.push({ oc, x, s }); }
      }
      other.sort((a, b) => a.s - b.s);
      if (other.length) {
        plist.append(h('li', { class: 'pgh', text: 'Other categories' }));
        for (const o of other.slice(0, 24)) plist.append(opt(o.x.name, o.oc.name, o.x.sym, false, () => choose(side, o.oc.id, o.x.id)));
      }
    }
  }
  pempty.hidden = items.length > 0;
  if (q && items.length) setAct(0);
}
function setAct(i) {
  if (act >= 0 && items[act]) items[act].classList.remove('act');
  act = Math.max(0, Math.min(items.length - 1, i));
  const b = items[act];
  if (b) { b.classList.add('act'); b.scrollIntoView({ block: 'nearest' }); }
}
function choose(side, catId, id) {
  closePicker();
  if (catId !== st.cat) { switchCat(catId, side === 'from' ? { from: id } : { to: id }); return; }
  const other = side === 'from' ? 'to' : 'from';
  const prev = st[side];
  st[side] = id;
  if (st[other] === id) st[other] = prev;
  if (U.groupOf(st.cat, st[other]) !== U.groupOf(st.cat, id)) st[other] = U.defaultTarget(st.cat, id, 1);
  if (st.dir === 'to') { st.fromText = isBase() ? (st.fromNum ?? '') : plain(st.fromNum); st.dir = 'from'; }
  st.label = '';
  update();
}
fromBtn.addEventListener('click', () => openPicker('from'));
toBtn.addEventListener('click', () => openPicker('to'));
ingBtn.addEventListener('click', () => openPicker('ing'));
sq.addEventListener('input', buildList);
sq.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); setAct(act + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); setAct(act - 1); }
  else if (e.key === 'Enter') { e.preventDefault(); const b = items[act >= 0 ? act : 0]; if (b) b.click(); }
});
sheet.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePicker(); return; }
  if (e.key === 'Tab') {
    const f = [sheet.querySelector('.x'), sq, ...items].filter((x) => x && x.offsetParent !== null);
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target !== sq) {
    const i = items.indexOf(document.activeElement);
    if (i >= 0) { e.preventDefault(); const n = items[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (n) n.focus(); }
  }
});
sheet.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closePicker(); });
scrim.addEventListener('click', closePicker);
sheet.setAttribute('aria-hidden', 'true');
// swipe the sheet header down to dismiss
(() => {
  const head = sheet.querySelector('.sheet-head');
  let d = null;
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('input, button, label')) return;
    d = { id: e.pointerId, y: e.clientY, t: performance.now(), dy: 0 };
    try { head.setPointerCapture(e.pointerId); } catch (err) {}
    sheet.classList.add('dragging');
  });
  head.addEventListener('pointermove', (e) => {
    if (!d || e.pointerId !== d.id) return;
    d.dy = Math.max(0, e.clientY - d.y);
    if (!reduceMQ.matches && d.dy > 4) sheet.style.transform = `translate(-50%, ${d.dy}px)`;
  });
  const end = (e) => {
    if (!d || e.pointerId !== d.id) return;
    const v = d.dy / Math.max(1, performance.now() - d.t);
    sheet.classList.remove('dragging'); sheet.style.transform = '';
    if (d.dy > 90 || (d.dy > 30 && v > 0.5)) closePicker();
    d = null;
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
})();

/* ---------- keyboard ---------- */
const typing = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
document.addEventListener('keydown', (e) => {
  if (pick) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const ae = document.activeElement;
  if (e.key === 'Escape') {
    if (typing(ae)) ae.blur();
    else if (qEl.value) { qEl.value = ''; applySmart(''); }
    return;
  }
  if (typing(ae)) return;
  if (e.key === '/') { e.preventDefault(); qEl.focus(); qEl.select(); return; }
  if (e.key === 'x' || e.key === 'X') { e.preventDefault(); swap(); return; }
  if (e.key === 'c' || e.key === 'C') { e.preventDefault(); copyBtn.click(); return; }
  if (e.key === 's' || e.key === 'S') { e.preventDefault(); toggleFav(); return; }
  if (e.key === '[' || e.key === ']') {
    e.preventDefault();
    const i = U.CATS.findIndex((c) => c.id === st.cat), n = U.CATS.length;
    switchCat(U.CATS[(i + (e.key === ']' ? 1 : -1) + n) % n].id);
    return;
  }
  // start typing a number anywhere → it goes into the From field
  if (/^[0-9.\-]$/.test(e.key) && !(ae && ae.tagName === 'BUTTON' && e.key === ' ')) {
    fromVal.focus(); fromVal.select();
  }
});

/* ---------- persistence & URL ---------- */
let saveT = 0, urlT = 0;
function scheduleSave() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { remember(); LS.set(K_STATE, { cat: st.cat, per: st.per, ing: st.ing, prec: st.prec, group: st.group }); }, 250);
}
function scheduleUrl() {
  clearTimeout(urlT);
  urlT = setTimeout(() => {
    let q = st.label;
    if (!q) {
      const v = isBase() ? (st.fromNum ?? '') : (Number.isNaN(st.fromNum) ? '' : st.fromNum);
      if (v === '' || v == null) return;
      q = U.toQuery({ cat: st.cat, from: st.from, to: st.to, value: v, ingredient: st.ing });
    }
    const u = new URL(location.href);
    u.searchParams.set('q', q);
    const s = u.pathname + '?' + u.searchParams.toString().replace(/%20/g, '+') + u.hash;
    try { history.replaceState(null, '', s); } catch (e) {}
  }, 350);
}

/* ---------- boot ---------- */
buildCats();
measureFit();
restoreCat(st.cat);
const q0 = new URLSearchParams(location.search).get('q');
renderFavs();
renderRecent();
exampleI = Math.floor(Math.random() * EXAMPLES.length);
if (q0 && q0.trim()) {
  qEl.value = q0.trim();
  if (!applySmart(qEl.value)) { compute(); render({ scrollChip: true }); }
} else {
  idleHint();
  compute(); render({ scrollChip: true });
}
qx.hidden = !qEl.value;
let rzT = 0;
addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { measureFit(); fit(fromVal, coarse ? 30 : 32, 16); fit(toVal, fitMax, 20); }, 60); });
if ('ResizeObserver' in window) new ResizeObserver(() => { fit(fromVal, coarse ? 30 : 32, 16); fit(toVal, fitMax, 20); }).observe(toVal);
setInterval(() => { if (!document.hidden) renderRecent(); }, 60000);
