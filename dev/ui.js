// /dev: the toolbox UI. Every tool is a small factory that returns { el, set(text, route), show?, hide? }.
// Pure logic lives in /dev/lib/* and /dev/logic.js; this file is DOM only. Everything runs in the browser.
import { detect } from '/dev/lib/detect.js?v=6ca331a080';
import * as enc from '/dev/lib/encode.js?v=5328626cab';
import * as json from '/dev/lib/json.js?v=fe024d3717';
import * as hashlib from '/dev/lib/hash.js?v=b88e45031b';
import * as ids from '/dev/lib/ids.js?v=abe9a27f12';
import * as pw from '/dev/lib/password.js?v=73f82f6e14';
import * as color from '/dev/lib/color.js?v=a4e78c5a3d';
import * as txt from '/dev/lib/text.js?v=2a893ad65a';
import * as tm from '/dev/lib/time.js?v=f950873b81';
import * as jwt from '/dev/lib/jwt.js?v=df4c61d9fa';
import * as cron from '/dev/lib/cron.js?v=b3d7894f4a';
import * as nb from '/dev/lib/numbase.js?v=6f5f6b2e99';
import * as rx from '/dev/lib/regex.js?v=5da6f79cba';
import { TABS, suggestions, pickTab, harmony, HARMONIES, shades, readableOn, contrastGrade, fmtBytes, readingTime, esc, lineRows, clip } from '/dev/logic.js?v=725b597d29';

const reduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const KEY_TAB = 'szv-dev-tab';

/* ================================================================ tiny DOM kit */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
const debounce = (fn, ms = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back */ }
  try {
    const ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;left:-999px;top:0;opacity:0' });
    ta.value = text; document.body.append(ta); ta.focus(); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}
/** Copy button with visible feedback. getText may be a string or a function. */
function copyBtn(getText, label = 'Copy', cls = '') {
  const b = h('button', { class: 'btn copy ' + cls, type: 'button', 'aria-label': label });
  const lab = h('span', { text: label });
  b.append(lab);
  let timer;
  b.addEventListener('click', async () => {
    const t = typeof getText === 'function' ? getText() : getText;
    if (t == null || t === '') { lab.textContent = 'Nothing yet'; clearTimeout(timer); timer = setTimeout(() => { lab.textContent = label; }, 1100); return; }
    const ok = await copyText(String(t));
    b.classList.toggle('ok', ok);
    lab.textContent = ok ? 'Copied' : 'Select + copy';
    try { if (ok && !reduce() && navigator.vibrate) navigator.vibrate(8); } catch { /* optional */ }
    clearTimeout(timer);
    timer = setTimeout(() => { b.classList.remove('ok'); lab.textContent = label; }, 1400);
  });
  return b;
}
/** A label + big textarea. */
function area(label, { rows = 5, placeholder = '', readonly = false, mono = true, id } = {}) {
  const ta = h('textarea', { rows, placeholder, spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', readonly, class: mono ? 'mono-in' : '', id, 'aria-label': label });
  const head = h('div', { class: 'fh' }, h('span', { class: 'lab mono', text: label }));
  const wrap = h('div', { class: 'field' }, head, ta);
  return { wrap, ta, head };
}
function input(label, { placeholder = '', value = '', type = 'text', mode, mono = true } = {}) {
  const el = h('input', { type, placeholder, value, spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', inputmode: mode, class: mono ? 'mono-in' : '', 'aria-label': label });
  const wrap = h('label', { class: 'field' }, h('span', { class: 'lab mono', text: label }), el);
  return { wrap, el };
}
/** Segmented control. opts: [{v,l}] */
function seg(opts, value, onChange, label = '') {
  const el = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
  let cur = value;
  const btns = opts.map((o) => {
    const b = h('button', { type: 'button', role: 'radio', 'data-v': o.v, text: o.l });
    b.addEventListener('click', () => { if (cur !== o.v) { api.set(o.v); onChange && onChange(o.v); } });
    el.append(b); return b;
  });
  const api = {
    el,
    get: () => cur,
    set(v) { cur = v; btns.forEach((b) => { const on = b.dataset.v === String(v); b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }); },
  };
  api.set(value);
  return api;
}
function toggle(label, checked, onChange) {
  const b = h('button', { type: 'button', class: 'chipt', 'aria-pressed': !!checked, text: label });
  b.addEventListener('click', () => { const v = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', v); onChange && onChange(v); });
  return { el: b, get: () => b.getAttribute('aria-pressed') === 'true', set: (v) => b.setAttribute('aria-pressed', !!v) };
}
function select(label, options, value, onChange) {
  const el = h('select', { 'aria-label': label });
  for (const o of options) el.append(h('option', { value: o.v ?? o, text: o.l ?? o, selected: (o.v ?? o) === value }));
  el.addEventListener('change', () => onChange && onChange(el.value));
  return { el, wrap: h('label', { class: 'field sel' }, h('span', { class: 'lab mono', text: label }), el) };
}
/** Read-only key/value row with a copy button. */
function kv(label, value, { mono = true, wide = false } = {}) {
  const v = h('div', { class: 'kv-v' + (mono ? ' mono' : ''), text: value });
  const row = h('div', { class: 'kv' + (wide ? ' wide' : '') }, h('div', { class: 'kv-k mono', text: label }), v, copyBtn(() => v.textContent, 'Copy', 'sm'));
  return { el: row, set(t) { v.textContent = t; row.hidden = t == null || t === ''; } };
}
const note = (cls = '') => h('p', { class: 'note ' + cls, role: 'status' });
function setNote(el, kind, text) { el.className = 'note ' + (kind || ''); el.textContent = text || ''; el.hidden = !text; }
const card = (...kids) => h('section', { class: 'glass card' }, ...kids);
const title = (t, sub) => h('div', { class: 'ct' }, h('h2', { text: t }), sub ? h('p', { text: sub }) : null);
const row = (...kids) => h('div', { class: 'row' }, ...kids);
const humanUtc = (ms) => tm.human(ms, 'UTC', { seconds: true });

/* ================================================================ icons */
const ICONS = {
  encode: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 5l-4 14"/>',
  json: '<path d="M9 4C7 4 6 5 6 7v2c0 1-1 2-2 3 1 1 2 2 2 3v2c0 2 1 3 3 3M15 4c2 0 3 1 3 3v2c0 1 1 2 2 3-1 1-2 2-2 3v2c0 2-1 3-3 3"/>',
  hash: '<path d="M5 9h15M4 15h15M10 4 8 20M16 4l-2 16"/>',
  ids: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01M12 12h.01"/>',
  color: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  regex: '<path d="M12 4v9M8 6l8 5M16 6l-8 5"/><circle cx="7" cy="18" r="1.3"/>',
  text: '<path d="M5 6h14M12 6v13M9 19h6"/>',
  time: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 3h6"/>',
  jwt: '<rect x="4" y="10" width="16" height="10" rx="3"/><path d="M8 10V8a4 4 0 0 1 8 0v2"/>',
  cron: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  base: '<ellipse cx="8" cy="8" rx="3" ry="4"/><path d="M17 12v8M15 14l2-2M14 20h6"/>',
};
const icon = (id) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id] || ''}</svg>`;

/* ================================================================ ENCODE */
function encodeTool() {
  let mode = 'base64', dir = 'encode';
  const modeSeg = seg([{ v: 'base64', l: 'Base64' }, { v: 'url', l: 'URL' }, { v: 'html', l: 'HTML' }, { v: 'hex', l: 'Hex' }], mode, (v) => { mode = v; opts(); run(); }, 'Format');
  const dirSeg = seg([{ v: 'encode', l: 'Encode' }, { v: 'decode', l: 'Decode' }], dir, (v) => { dir = v; run(); }, 'Direction');
  const urlSafe = toggle('URL-safe', false, run), noPad = toggle('No padding', false, run);
  const urlKind = seg([{ v: 'component', l: 'Component' }, { v: 'uri', l: 'Full URI' }, { v: 'form', l: 'Form (+)' }], 'component', run, 'URL kind');
  const htmlKind = seg([{ v: 'minimal', l: 'Minimal' }, { v: 'named', l: 'Named' }, { v: 'numeric', l: 'Numeric' }], 'minimal', run, 'HTML kind');
  const hexSp = toggle('Spaces', false, run);
  const optBox = h('div', { class: 'opts' });
  const inp = area('Input', { rows: 5, placeholder: 'Type or paste text' });
  const out = area('Output', { rows: 5, readonly: true });
  const swap = h('button', { class: 'btn ghost', type: 'button', text: 'Use output as input' });
  out.head.append(copyBtn(() => out.ta.value, 'Copy', 'sm'));
  const msg = note(), extra = h('div', { class: 'extra' });
  function opts() {
    optBox.replaceChildren(...({ base64: [urlSafe.el, noPad.el], url: [urlKind.el], html: [htmlKind.el], hex: [hexSp.el] })[mode]);
    if (mode === 'url') dirSeg.set(dir);
  }
  swap.addEventListener('click', () => { if (!out.ta.value) return; inp.ta.value = out.ta.value; dir = dir === 'encode' ? 'decode' : 'encode'; dirSeg.set(dir); run(); });
  function run() {
    const v = inp.ta.value;
    extra.replaceChildren(); setNote(msg, '', '');
    if (!v) { out.ta.value = ''; return; }
    try {
      let r = '';
      if (mode === 'base64') {
        if (dir === 'encode') r = enc.encodeBase64(v, { urlSafe: urlSafe.get(), pad: !noPad.get() });
        else {
          const d = enc.decodeBase64(v.trim().replace(/^data:[^,]*;base64,/i, ''));
          r = d.text;
          if (d.binary) setNote(msg, 'warn', `Not valid text (UTF-8). Showing a best guess of ${d.bytes.length} bytes.`);
          else setNote(msg, 'ok', `${d.bytes.length} bytes decoded.`);
        }
      } else if (mode === 'url') {
        if (dir === 'encode') r = enc.urlEncode(v, urlKind.get());
        else {
          r = enc.urlDecode(v);
          const q = enc.parseQuery(v);
          if (q.params.length || q.isUrl) extra.append(queryTable(q));
        }
      } else if (mode === 'html') {
        r = dir === 'encode' ? enc.htmlEncode(v, htmlKind.get()) : enc.htmlDecode(v);
      } else {
        r = dir === 'encode' ? enc.bytesToHex(enc.utf8Encode(v), hexSp.get() ? ' ' : '') : enc.utf8Decode(enc.hexToBytes(v), { fatal: false });
      }
      out.ta.value = r;
    } catch (e) { out.ta.value = ''; setNote(msg, 'bad', e.message); }
  }
  function queryTable(q) {
    const wrap = h('div', { class: 'qt' });
    if (q.parts) {
      const p = q.parts;
      for (const [k, val] of [['Origin', p.origin], ['Path', p.path], ['Hash', p.hash]]) if (val) wrap.append(h('div', { class: 'qrow' }, h('span', { class: 'mono k', text: k }), h('span', { class: 'v mono', text: val })));
    }
    for (const p of q.params) wrap.append(h('div', { class: 'qrow' }, h('span', { class: 'mono k', text: p.key }), h('span', { class: 'v mono', text: p.value })));
    return h('div', null, h('div', { class: 'lab mono sp', text: 'Parts' }), wrap);
  }
  inp.ta.addEventListener('input', debounce(run, 80));
  opts();
  const el = card(title('Encode and decode', 'Base64, URL, HTML entities and hex. Handles emoji and accents.'), row(modeSeg.el, dirSeg.el), optBox, inp.wrap, row(swap), out.wrap, msg, extra);
  return {
    el,
    set(text, r) {
      if (r && r.mode) { mode = r.mode; modeSeg.set(mode); }
      if (r && r.dir) { dir = r.dir; dirSeg.set(dir); }
      opts(); inp.ta.value = text; run();
    },
  };
}

/* ================================================================ JSON */
function highlightJson(text) {
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  let out = '', last = 0, m;
  while ((m = re.exec(text))) {
    out += esc(text.slice(last, m.index));
    const t = m[0];
    const cls = m[1] ? (m[2] ? 'jk' : 'js') : /^(true|false)$/.test(t) ? 'jb' : t === 'null' ? 'jn' : 'jnum';
    out += m[1] && m[2] ? `<span class="jk">${esc(m[1])}</span>${esc(m[2])}` : `<span class="${cls}">${esc(t)}</span>`;
    last = m.index + t.length;
  }
  return out + esc(text.slice(last));
}
function jsonTool() {
  const inp = area('JSON', { rows: 8, placeholder: '{"paste": "your JSON here"}' });
  const indent = seg([{ v: '2', l: '2 spaces' }, { v: '4', l: '4' }, { v: 'tab', l: 'Tab' }, { v: 'min', l: 'Minify' }], '2', run, 'Layout');
  const sort = toggle('Sort keys', false, run);
  const status = h('div', { class: 'status', role: 'status' });
  const frame = h('pre', { class: 'frame mono', hidden: true });
  const outPre = h('pre', { class: 'out mono', tabindex: '0', 'aria-label': 'Formatted JSON' });
  const outHead = h('div', { class: 'fh' }, h('span', { class: 'lab mono', text: 'Result' }), copyBtn(() => current, 'Copy', 'sm'));
  const stats = h('div', { class: 'chips' });
  const useBtn = h('button', { class: 'btn ghost', type: 'button', text: 'Use result as input' });
  let current = '';
  useBtn.addEventListener('click', () => { if (current) { inp.ta.value = current; run(); } });
  function run() {
    const v = inp.ta.value;
    frame.hidden = true; stats.replaceChildren(); current = '';
    if (!v.trim()) { status.className = 'status'; status.textContent = 'Paste JSON to check it.'; outPre.textContent = ''; outHead.parentElement.hidden = true; return; }
    outHead.parentElement.hidden = false;
    const r = json.validate(v);
    if (!r.ok) {
      status.className = 'status bad';
      status.textContent = `${r.error.msg} (line ${r.error.line}, column ${r.error.col})`;
      const lines = json.codeFrame(v, r.error.line);
      frame.hidden = false;
      frame.textContent = lines.map((l) => `${l.isErr ? '>' : ' '} ${String(l.n).padStart(3)} | ${l.text}`).join('\n') + '\n' + ' '.repeat(8 + r.error.col - 1) + '^';
      outPre.textContent = '';
      return;
    }
    status.className = 'status ok';
    status.textContent = r.warnings.length ? `Valid JSON, with a heads-up: ${r.warnings[0].msg}` : 'Valid JSON';
    const s = r.stats;
    for (const [k, n] of [['keys', s.keys], ['objects', s.objects], ['arrays', s.arrays], ['strings', s.strings], ['numbers', s.numbers], ['depth', s.depth]]) stats.append(h('span', { class: 'pill mono', text: `${n} ${k}` }));
    try {
      const o = indent.get();
      current = o === 'min' ? json.minify(v) : json.format(v, { indent: o === 'tab' ? 'tab' : +o, sortKeys: sort.get() });
      if (o === 'min' && sort.get()) current = JSON.stringify(json.sortKeysDeep(JSON.parse(v)));
      stats.append(h('span', { class: 'pill mono', text: fmtBytes(new TextEncoder().encode(current).length) }));
      if (current.length > 300000) outPre.textContent = current; else outPre.innerHTML = highlightJson(current);
    } catch (e) { setNoteStatus(e.message); }
  }
  function setNoteStatus(m) { status.className = 'status bad'; status.textContent = m; }
  inp.ta.addEventListener('input', debounce(run, 120));
  const resultBox = h('div', { class: 'field' }, outHead, outPre);
  const el = card(title('JSON', 'Validate with exact line and column, then format or minify.'), inp.wrap, status, frame, row(indent.el, sort.el), resultBox, stats, row(useBtn));
  run();
  return { el, set(t) { inp.ta.value = t; run(); } };
}

/* ================================================================ HASH */
function hashTool() {
  const inp = area('Text', { rows: 4, placeholder: 'Type text to hash, or pick a file' });
  const hmacKey = input('HMAC secret (optional)', { placeholder: 'Leave empty for a plain hash' });
  const upper = toggle('UPPERCASE', false, () => render());
  const file = h('input', { type: 'file', class: 'sr', id: 'hashfile', 'aria-label': 'Choose a file to hash' });
  const fileBtn = h('label', { class: 'btn ghost', for: 'hashfile', text: 'Hash a file' });
  const clearBtn = h('button', { class: 'btn ghost', type: 'button', text: 'Clear file', hidden: true });
  const info = note();
  const list = h('div', { class: 'list' });
  const cmp = input('Compare with a known hash', { placeholder: 'Paste a hash to check for a match' });
  const verdict = note();
  let bytes = null, results = {}, seq = 0;
  const MAX = 25 * 1024 * 1024;
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    if (f.size > MAX) { setNote(info, 'bad', `That file is ${fmtBytes(f.size)}. The limit here is ${fmtBytes(MAX)}.`); file.value = ''; return; }
    bytes = new Uint8Array(await f.arrayBuffer());
    inp.ta.value = ''; inp.ta.disabled = true; clearBtn.hidden = false;
    setNote(info, 'ok', `${f.name} (${fmtBytes(f.size)})`);
    run();
  });
  clearBtn.addEventListener('click', () => { bytes = null; file.value = ''; inp.ta.disabled = false; clearBtn.hidden = true; setNote(info, '', ''); run(); });
  async function run() {
    const my = ++seq;
    const data = bytes || enc.utf8Encode(inp.ta.value);
    const key = hmacKey.el.value;
    if (!bytes && !inp.ta.value && !key) { results = {}; render(); return; }
    const res = {};
    for (const a of hashlib.ALGOS) {
      try { res[a] = key ? await hashlib.hmacHex(a, enc.utf8Encode(key), data) : await hashlib.hashHex(a, data); }
      catch (e) { res[a] = null; setNote(info, 'bad', e.message); }
    }
    if (my !== seq) return;
    results = res; render();
  }
  function render() {
    list.replaceChildren();
    const u = upper.get();
    const c = cmp.el.value.trim();
    let hit = null;
    for (const a of hashlib.ALGOS) {
      const v = results[a];
      if (!v) continue;
      const shown = u ? v.toUpperCase() : v;
      const r = kv(a + (hmacKey.el.value ? ' HMAC' : ''), shown, { wide: true });
      if (c && hashlib.sameDigest(c, v)) { r.el.classList.add('hit'); hit = a; }
      list.append(r.el);
    }
    if (!Object.keys(results).length) list.append(h('p', { class: 'empty', text: 'Hashes appear here as you type.' }));
    if (!c) setNote(verdict, '', '');
    else if (hit) setNote(verdict, 'ok', `Match: that is the ${hit} of this input.`);
    else setNote(verdict, 'bad', Object.keys(results).length ? 'No match with any of these.' : '');
  }
  inp.ta.addEventListener('input', debounce(run, 100));
  hmacKey.el.addEventListener('input', debounce(run, 100));
  cmp.el.addEventListener('input', render);
  const el = card(title('Hashes', 'MD5, SHA-1, SHA-256, 384 and 512, with optional HMAC.'), inp.wrap, row(fileBtn, clearBtn, upper.el), file, info, hmacKey.wrap, list, cmp.wrap, verdict);
  render();
  return { el, set(t) { if (/^[0-9a-f]{32,128}$/i.test(t.trim())) { cmp.el.value = t.trim(); render(); } else { inp.ta.value = t; run(); } } };
}

/* ================================================================ IDS */
function idsTool() {
  const v7 = ids.uuidv7Factory(), ulid = ids.ulidFactory();
  let kind = 'uuid4', count = 5;
  const kinds = seg([{ v: 'uuid4', l: 'UUID v4' }, { v: 'uuid7', l: 'UUID v7' }, { v: 'ulid', l: 'ULID' }, { v: 'nano', l: 'NanoID' }, { v: 'pass', l: 'Password' }, { v: 'phrase', l: 'Passphrase' }], kind, (v) => { kind = v; opts(); gen(); }, 'Kind');
  const counts = seg([{ v: 1, l: '1' }, { v: 5, l: '5' }, { v: 10, l: '10' }, { v: 25, l: '25' }], count, (v) => { count = +v; gen(); }, 'How many');
  const list = h('div', { class: 'list' });
  const meter = h('div', { class: 'meter-note mono' });
  const genBtn = h('button', { class: 'btn primary', type: 'button', text: 'Generate again' });
  const copyAll = copyBtn(() => values.join('\n'), 'Copy all');
  const optBox = h('div', { class: 'opts' });
  const hyphen = toggle('No hyphens', false, gen), upperU = toggle('UPPERCASE', false, gen);
  const nanoLen = rangeField('Length', 21, 6, 64, gen);
  const pwLen = rangeField('Length', 20, 8, 96, gen);
  const tLower = toggle('a-z', true, gen), tUpper = toggle('A-Z', true, gen), tDigits = toggle('0-9', true, gen), tSym = toggle('!@#', true, gen), tAmb = toggle('No look-alikes', false, gen);
  const wCount = rangeField('Words', 5, 3, 10, gen);
  const sepSeg = seg([{ v: '-', l: '-' }, { v: '.', l: '.' }, { v: '_', l: '_' }, { v: ' ', l: 'space' }], '-', gen, 'Separator');
  const cap = toggle('Capitalize', false, gen), num = toggle('Add a digit', false, gen);
  let values = [];
  function rangeField(label, val, min, max, onInput) {
    const out = h('span', { class: 'mono rv', text: String(val) });
    const el = h('input', { type: 'range', min, max, value: val, 'aria-label': label });
    el.addEventListener('input', () => { out.textContent = el.value; onInput(); });
    return { el: h('label', { class: 'range' }, h('span', { class: 'lab mono', text: label }), el, out), get: () => +el.value };
  }
  function opts() {
    const m = {
      uuid4: [hyphen.el, upperU.el], uuid7: [hyphen.el, upperU.el], ulid: [], nano: [nanoLenWrap()],
      pass: [pwLen.el, tLower.el, tUpper.el, tDigits.el, tSym.el, tAmb.el], phrase: [wCount.el, sepSeg.el, cap.el, num.el],
    };
    optBox.replaceChildren(...m[kind]);
  }
  const nanoLenWrap = () => nanoLen.el;
  function gen() {
    values = []; let bits = null;
    try {
      for (let i = 0; i < count; i++) {
        let v;
        if (kind === 'uuid4') v = ids.uuidv4();
        else if (kind === 'uuid7') v = v7();
        else if (kind === 'ulid') v = ulid();
        else if (kind === 'nano') v = ids.nanoid(nanoLen.get());
        else if (kind === 'pass') { const r = pw.generatePassword({ length: pwLen.get(), lower: tLower.get(), upper: tUpper.get(), digits: tDigits.get(), symbols: tSym.get(), noAmbiguous: tAmb.get() }); v = r.value; bits = r.bits; }
        else { const r = pw.generatePassphrase({ words: wCount.get(), separator: sepSeg.get(), capitalize: cap.get(), number: num.get() }); v = r.value; bits = r.bits; }
        if ((kind === 'uuid4' || kind === 'uuid7') && hyphen.get()) v = v.replace(/-/g, '');
        if ((kind === 'uuid4' || kind === 'uuid7') && upperU.get()) v = v.toUpperCase();
        values.push(v);
      }
      list.replaceChildren(...values.map((v) => kv('', v, { wide: true }).el));
      meter.textContent = bits != null ? `${Math.round(bits)} bits of randomness · ${pw.crackTime(bits)} to crack at 10 billion guesses a second` : kind === 'nano' ? `${Math.round(nanoLen.get() * 6)} bits of randomness` : kind === 'uuid7' ? 'Time-ordered: sorts by creation time.' : kind === 'ulid' ? 'Time-ordered, 26 characters, no look-alike letters.' : '122 random bits.';
    } catch (e) { list.replaceChildren(h('p', { class: 'empty', text: e.message })); meter.textContent = ''; }
  }
  genBtn.addEventListener('click', gen);
  // inspect + strength
  const insp = input('Inspect a UUID or ULID', { placeholder: '0192f1e8-7c3a-7b4e-9d1f-2a6b8c0d4e5f' });
  const inspOut = h('div', { class: 'list' });
  function inspect() {
    inspOut.replaceChildren();
    const v = insp.el.value.trim(); if (!v) return;
    const r = ids.inspectId(v);
    if (!r) { inspOut.append(h('p', { class: 'empty', text: 'Not a UUID or ULID.' })); return; }
    inspOut.append(kv('Type', r.label).el);
    if (r.variant) inspOut.append(kv('Variant', r.variant).el);
    if (r.time != null) { inspOut.append(kv('Created', humanUtc(r.time)).el); inspOut.append(kv('Unix ms', String(r.time)).el); }
  }
  insp.el.addEventListener('input', inspect);
  const chk = input('Check a password', { placeholder: 'Type one to rate it. It never leaves this page.', type: 'text' });
  const bar = h('div', { class: 'bar' }, h('i'));
  const chkOut = h('p', { class: 'note' });
  chk.el.addEventListener('input', () => {
    const v = chk.el.value;
    if (!v) { bar.firstChild.style.width = '0'; setNote(chkOut, '', ''); return; }
    const e = pw.estimate(v);
    bar.firstChild.style.width = (10 + e.score * 22.5) + '%';
    bar.dataset.s = e.score;
    setNote(chkOut, e.score >= 3 ? 'ok' : e.score >= 2 ? 'warn' : 'bad', `${e.label[0].toUpperCase() + e.label.slice(1)} · about ${Math.round(e.bits)} bits · ${pw.crackTime(e.bits)} to crack. ${e.feedback[0] || ''}`);
  });
  const el = h('div', { class: 'stack' },
    card(title('IDs and passwords', 'Made with your browser’s secure random generator.'), kinds.el, optBox, row(counts.el), list, meter, row(genBtn, copyAll)),
    card(title('Look inside an ID'), insp.wrap, inspOut),
    card(title('Rate a password'), chk.wrap, bar, chkOut));
  opts(); gen();
  return { el, set(t) { insp.el.value = t; inspect(); insp.el.scrollIntoView({ block: 'center', behavior: reduce() ? 'auto' : 'smooth' }); } };
}

/* ================================================================ COLOR */
function colorTool() {
  let rgb = { r: 139, g: 92, b: 246, a: 1 }, harm = 'triad';
  const txtIn = input('Color', { value: '#8b5cf6', placeholder: '#8b5cf6, rgb(…), hsl(…), oklch(…), tomato' });
  const pick = h('input', { type: 'color', value: '#8b5cf6', 'aria-label': 'Open color picker', class: 'picker' });
  const sw = h('div', { class: 'swatch' }, h('span', { class: 'mono', text: 'Aa' }));
  const msg = note();
  const fmts = h('div', { class: 'list' });
  const harmSeg = seg(HARMONIES.map((x) => ({ v: x.id, l: x.label })), harm, (v) => { harm = v; paint(); }, 'Harmony');
  const hRow = h('div', { class: 'chips-sw' }), sRow = h('div', { class: 'chips-sw' });
  function swatchBtn(hex) {
    const rg = color.parseColor(hex);
    const b = h('button', { type: 'button', class: 'sw', style: `background:${hex};color:${readableOn(rg)}`, 'aria-label': 'Copy ' + hex });
    const lab = h('span', { class: 'mono', text: hex.replace('#', '') });
    b.append(lab);
    let t;
    b.addEventListener('click', async () => { const ok = await copyText(hex); lab.textContent = ok ? 'copied' : hex; clearTimeout(t); t = setTimeout(() => { lab.textContent = hex.replace('#', ''); }, 1100); });
    return b;
  }
  function paint() {
    const hex = color.toHex({ ...rgb, a: 1 });
    sw.style.setProperty('--c', color.toHex(rgb));
    sw.style.color = readableOn(color.over(rgb, { r: 5, g: 5, b: 10, a: 1 }));
    pick.value = hex;
    const f = color.formats(rgb);
    fmts.replaceChildren(...[['HEX', f.hex], ['RGB', f.rgb], ['HSL', f.hsl], ['OKLCH', f.oklch], ['OKLAB', f.oklab], ['CSS legacy', f.rgbLegacy]].map(([k, v]) => kv(k, v, { wide: true }).el));
    hRow.replaceChildren(...harmony(rgb, harm).map(swatchBtn));
    sRow.replaceChildren(...shades(rgb, 9).map(swatchBtn));
    contrastRun();
  }
  function fromText() {
    try { rgb = color.parseColor(txtIn.el.value); setNote(msg, '', ''); paint(); }
    catch (e) { setNote(msg, 'bad', e.message); }
  }
  txtIn.el.addEventListener('input', debounce(fromText, 80));
  pick.addEventListener('input', () => { txtIn.el.value = pick.value; fromText(); });
  // contrast
  const cFg = input('Text color', { value: '#f3f1ff' }), cBg = input('Background', { value: '#0b0b14' });
  const pFg = h('input', { type: 'color', value: '#f3f1ff', class: 'picker sm', 'aria-label': 'Pick text color' });
  const pBg = h('input', { type: 'color', value: '#0b0b14', class: 'picker sm', 'aria-label': 'Pick background color' });
  const prev = h('div', { class: 'cprev' }, h('strong', { text: 'The quick brown fox' }), h('span', { text: 'Small body text reads like this on that background.' }));
  const ratio = h('div', { class: 'ratio' });
  const badges = h('div', { class: 'chips' });
  const cMsg = note();
  const swapC = h('button', { class: 'btn ghost', type: 'button', text: 'Swap' });
  const useMain = h('button', { class: 'btn ghost', type: 'button', text: 'Use main color as text' });
  function contrastRun() {
    try {
      const fg = color.parseColor(cFg.el.value), bg0 = color.parseColor(cBg.el.value);
      const bg = color.over(bg0, { r: 0, g: 0, b: 0, a: 1 });
      const c = color.contrast(fg, bg);
      prev.style.color = color.toHex(fg); prev.style.background = color.toHex(bg);
      pFg.value = color.toHex({ ...fg, a: 1 }); pBg.value = color.toHex({ ...bg, a: 1 });
      ratio.innerHTML = `<b>${c.ratio.toFixed(2)}</b><span class="mono">: 1 &middot; ${esc(contrastGrade(c.ratio))}</span>`;
      ratio.dataset.ok = c.aa ? '1' : c.aaLarge ? '2' : '0';
      badges.replaceChildren(...[['Text AA', c.aa], ['Text AAA', c.aaa], ['Large AA', c.aaLarge], ['Large AAA', c.aaaLarge], ['UI 3:1', c.ui]].map(([l, ok]) => h('span', { class: 'pill mono ' + (ok ? 'pass' : 'fail'), text: (ok ? 'Pass ' : 'Fail ') + l })));
      setNote(cMsg, '', '');
    } catch (e) { setNote(cMsg, 'bad', e.message); }
  }
  cFg.el.addEventListener('input', debounce(contrastRun, 60)); cBg.el.addEventListener('input', debounce(contrastRun, 60));
  pFg.addEventListener('input', () => { cFg.el.value = pFg.value; contrastRun(); });
  pBg.addEventListener('input', () => { cBg.el.value = pBg.value; contrastRun(); });
  swapC.addEventListener('click', () => { const t = cFg.el.value; cFg.el.value = cBg.el.value; cBg.el.value = t; contrastRun(); });
  useMain.addEventListener('click', () => { cFg.el.value = color.toHex(rgb); contrastRun(); });
  const el = h('div', { class: 'stack' },
    card(title('Color', 'Any CSS color in, every format out.'), h('div', { class: 'colorrow' }, sw, h('div', { class: 'colorin' }, h('div', { class: 'with-picker' }, txtIn.wrap, pick), msg)), fmts),
    card(title('Palette', 'Tap a swatch to copy it.'), harmSeg.el, h('div', { class: 'lab mono sp', text: 'Harmony' }), hRow, h('div', { class: 'lab mono sp', text: 'Light to dark' }), sRow),
    card(title('Contrast checker', 'WCAG 2 ratio for text on a background.'), prev, ratio, badges,
      h('div', { class: 'two' }, h('div', { class: 'with-picker' }, cFg.wrap, pFg), h('div', { class: 'with-picker' }, cBg.wrap, pBg)), cMsg, row(swapC, useMain)));
  paint();
  return { el, set(t) { txtIn.el.value = t.trim(); fromText(); } };
}

/* ================================================================ REGEX */
function regexTool() {
  const pat = input('Pattern', { placeholder: '(\\w+)@(\\w+)\\.com' });
  const flagsDef = [['g', 'g'], ['i', 'i'], ['m', 'm'], ['s', 's'], ['u', 'u'], ['y', 'y']];
  const flagT = flagsDef.map(([f]) => { const t = toggle(f, f === 'g', schedule); t.el.title = { g: 'global', i: 'ignore case', m: 'multiline', s: 'dot matches newline', u: 'unicode', y: 'sticky' }[f]; t.f = f; return t; });
  const text = area('Test text', { rows: 5, placeholder: 'Text to search' });
  const repl = input('Replace with (optional)', { placeholder: '$1 at $2, or $<name>' });
  const common = select('Common patterns', [{ v: '', l: 'Pick one to start…' }, ...rx.COMMON.map((c, i) => ({ v: String(i), l: c.name }))], '', (v) => {
    if (v === '') return;
    const c = rx.COMMON[+v];
    pat.el.value = c.pattern; text.ta.value = c.sample; flagT.forEach((t) => t.set(c.flags.includes(t.f)));
    common.el.value = ''; schedule();
  });
  const msg = note();
  const hl = h('pre', { class: 'hl mono', 'aria-label': 'Matches highlighted' });
  const summary = h('div', { class: 'chips' });
  const list = h('div', { class: 'list' });
  const replOut = area('Replaced', { rows: 3, readonly: true }); replOut.head.append(copyBtn(() => replOut.ta.value, 'Copy', 'sm'));
  let worker = null, seq = 0, timer = null;
  const flags = () => flagT.filter((t) => t.get()).map((t) => t.f).join('');
  function mkWorker() {
    try { worker = new Worker('/dev/regex-worker.js', { type: 'module' }); } catch { worker = null; }
    if (worker) worker.onerror = () => { worker = null; };
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(go, 120); }
  function go() {
    const my = ++seq;
    const p = pat.el.value, t = text.ta.value, r = repl.el.value;
    if (!p) { render(null, '', t); setNote(msg, '', ''); return; }
    try { rx.compile(p, flags()); } catch (e) { setNote(msg, 'bad', e.message); hl.textContent = t; summary.replaceChildren(); list.replaceChildren(); replOut.wrap.hidden = true; return; }
    setNote(msg, '', '');
    const payload = { id: my, pattern: p, flags: flags(), text: t, replacement: r ? r : null };
    if (!worker) mkWorker();
    if (!worker) { try { const res = rx.run(p, flags(), t, { limit: 500 }); render(res, r ? rx.replace(p, flags(), t, r) : null, t); } catch (e) { setNote(msg, 'bad', e.message); } return; }
    const w = worker;
    const kill = setTimeout(() => {
      if (my !== seq) return;
      w.terminate(); worker = null;
      setNote(msg, 'bad', 'That pattern took too long. It may backtrack catastrophically; try making it more specific.');
    }, 1500);
    w.onmessage = (e) => {
      clearTimeout(kill);
      if (e.data.id !== seq) return;
      if (!e.data.ok) { setNote(msg, 'bad', e.data.error); return; }
      render(e.data.res, e.data.replaced, t);
    };
    w.postMessage(payload);
  }
  function render(res, replaced, t) {
    list.replaceChildren(); summary.replaceChildren();
    if (!res) { hl.textContent = t; replOut.wrap.hidden = true; return; }
    const segs = rx.segments(t, res.matches);
    hl.innerHTML = segs.map((s) => s.match < 0 ? esc(s.text) : `<mark class="m${s.match % 3}">${s.empty ? '<i class="e"></i>' : esc(s.text)}</mark>`).join('') || '';
    summary.append(h('span', { class: 'pill mono ' + (res.matches.length ? 'pass' : 'fail'), text: `${res.matches.length}${res.truncated ? '+' : ''} match${res.matches.length === 1 ? '' : 'es'}` }));
    if (res.groupCount) summary.append(h('span', { class: 'pill mono', text: `${res.groupCount} group${res.groupCount === 1 ? '' : 's'}` }));
    res.matches.slice(0, 50).forEach((m, i) => {
      const g = m.groups.map((x) => `${x.name || '$' + x.n}: ${x.value === undefined ? '(unset)' : JSON.stringify(x.value)}`).join('\n');
      list.append(h('div', { class: 'kv wide match' }, h('div', { class: 'kv-k mono', text: `#${i + 1} @${m.index}` }), h('div', { class: 'kv-v mono' }, m.text === '' ? '(empty match)' : m.text, g ? h('div', { class: 'groups', text: g }) : null), copyBtn(m.text, 'Copy', 'sm')));
    });
    replOut.wrap.hidden = replaced == null;
    if (replaced != null) replOut.ta.value = replaced;
  }
  pat.el.addEventListener('input', schedule); text.ta.addEventListener('input', schedule); repl.el.addEventListener('input', schedule);
  const el = card(title('Regex tester', 'JavaScript flavor. Runs safely off the main thread.'), common.wrap, pat.wrap, h('div', { class: 'chips' }, flagT.map((t) => t.el)), text.wrap, msg, h('div', { class: 'field' }, h('div', { class: 'fh' }, h('span', { class: 'lab mono', text: 'Matches' })), hl), summary, list, repl.wrap, replOut.wrap);
  replOut.wrap.hidden = true;
  hl.textContent = '';
  return {
    el,
    set(t) {
      const m = /^\/(.+)\/([dgimsuyv]*)$/s.exec(t.trim());
      if (m) { pat.el.value = m[1]; flagT.forEach((x) => x.set(m[2].includes(x.f))); } else text.ta.value = t;
      schedule();
    },
    hide() { if (worker) { worker.terminate(); worker = null; } },
  };
}

/* ================================================================ TEXT */
function textTool() {
  let sub = 'case';
  const subSeg = seg([{ v: 'case', l: 'Case' }, { v: 'diff', l: 'Diff' }, { v: 'count', l: 'Count' }, { v: 'lorem', l: 'Lorem' }], sub, (v) => { sub = v; showSub(); }, 'Text tool');
  const body = h('div', { class: 'sub' });
  /* case */
  const cIn = area('Text', { rows: 3, placeholder: 'make this myVariableName or "Hello World"', mono: false });
  const cList = h('div', { class: 'list' });
  const caseBox = h('div', null, cIn.wrap, cList);
  const cRun = () => { cList.replaceChildren(...txt.CASES.map((c) => kv(c.label, cIn.ta.value ? txt.convertCase(cIn.ta.value, c.id) : '—', { wide: true }).el)); };
  cIn.ta.addEventListener('input', debounce(cRun, 60));
  /* diff */
  const dA = area('Original', { rows: 6, placeholder: 'Original text' }), dB = area('Changed', { rows: 6, placeholder: 'Changed text' });
  const dMode = seg([{ v: 'line', l: 'Lines' }, { v: 'word', l: 'Words' }, { v: 'char', l: 'Chars' }], 'line', dRun, 'Compare by');
  const dCase = toggle('Ignore case', false, dRun), dWs = toggle('Ignore spaces', false, dRun);
  const dOut = h('div', { class: 'diff mono', tabindex: '0', 'aria-label': 'Differences' });
  const dSum = h('div', { class: 'chips' });
  let uni = '';
  const dCopy = copyBtn(() => uni, 'Copy as patch');
  function dRun() {
    dOut.replaceChildren(); dSum.replaceChildren(); uni = '';
    const a = clip(dA.ta.value, 60000), b = clip(dB.ta.value, 60000);
    if (!a.text && !b.text) { dOut.append(h('p', { class: 'empty', text: 'Paste two versions to compare them.' })); return; }
    const mode = dMode.get();
    const r = txt.diffText(a.text, b.text, mode, { ignoreCase: dCase.get(), ignoreWhitespace: dWs.get() });
    dSum.append(h('span', { class: 'pill mono ' + (r.same ? 'pass' : ''), text: r.same ? 'Identical' : `+${r.added} added` }), r.same ? null : h('span', { class: 'pill mono fail', text: `-${r.removed} removed` }));
    if (a.clipped || b.clipped) dSum.append(h('span', { class: 'pill mono', text: 'Very long input, trimmed' }));
    if (mode === 'line') {
      uni = txt.unified(r.chunks);
      for (const rw of lineRows(r.chunks)) {
        if (rw.type === 'gap') dOut.append(h('div', { class: 'dl gap', text: `${rw.n} unchanged line${rw.n === 1 ? '' : 's'}` }));
        else dOut.append(h('div', { class: 'dl ' + rw.type }, h('span', { class: 'g', text: rw.type === 'add' ? '+' : rw.type === 'del' ? '-' : '' }), h('span', { class: 't', text: rw.text || ' ' })));
      }
    } else {
      const p = h('div', { class: 'inl' });
      for (const c of r.chunks) p.append(h('span', { class: c.op === '+' ? 'add' : c.op === '-' ? 'del' : '', text: c.items.join('') }));
      dOut.append(p);
    }
  }
  dA.ta.addEventListener('input', debounce(dRun, 120)); dB.ta.addEventListener('input', debounce(dRun, 120));
  const diffBox = h('div', null, h('div', { class: 'two' }, dA.wrap, dB.wrap), row(dMode.el, dCase.el, dWs.el), dSum, dOut, row(dCopy));
  /* count */
  const nIn = area('Text', { rows: 6, placeholder: 'Paste text to count', mono: false });
  const nOut = h('div', { class: 'tiles' });
  const nRun = () => {
    const s = txt.stats(nIn.ta.value);
    nOut.replaceChildren(...[['Characters', s.chars], ['Words', s.words], ['Lines', s.lines], ['Bytes', s.bytes], ['Reading', readingTime(s.words)]].map(([k, v]) => h('div', { class: 'tile' }, h('b', { text: String(v) }), h('span', { class: 'mono', text: k }))));
  };
  nIn.ta.addEventListener('input', nRun);
  const countBox = h('div', null, nIn.wrap, nOut);
  /* lorem */
  let lUnit = 'paragraphs', lCount = 3;
  const lU = seg([{ v: 'paragraphs', l: 'Paragraphs' }, { v: 'sentences', l: 'Sentences' }, { v: 'words', l: 'Words' }], lUnit, (v) => { lUnit = v; lGen(); }, 'Unit');
  const lC = seg([{ v: 1, l: '1' }, { v: 3, l: '3' }, { v: 5, l: '5' }, { v: 10, l: '10' }], lCount, (v) => { lCount = +v; lGen(); }, 'Count');
  const lClassic = toggle('Start with “Lorem ipsum”', true, lGen);
  const lOut = area('Placeholder text', { rows: 8, readonly: true, mono: false }); lOut.head.append(copyBtn(() => lOut.ta.value, 'Copy', 'sm'));
  const lBtn = h('button', { class: 'btn primary', type: 'button', text: 'Shuffle' });
  function lGen() { lOut.ta.value = txt.lorem({ unit: lUnit, count: lUnit === 'words' ? lCount * 20 : lCount, classic: lClassic.get(), seed: (Math.random() * 2 ** 31) | 0 }); }
  lBtn.addEventListener('click', lGen);
  const loremBox = h('div', null, row(lU.el, lC.el), row(lClassic.el), lOut.wrap, row(lBtn));
  const boxes = { case: caseBox, diff: diffBox, count: countBox, lorem: loremBox };
  function showSub() { subSeg.set(sub); body.replaceChildren(boxes[sub]); }
  cRun(); nRun(); dRun(); lGen(); showSub();
  return {
    el: card(title('Text tools', 'Change case, compare two versions, count, or fill with placeholder.'), subSeg.el, body),
    set(t, r) {
      if (r && r.mode) { sub = r.mode; }
      if (sub === 'case') { cIn.ta.value = t; cRun(); } else if (sub === 'count') { nIn.ta.value = t; nRun(); }
      showSub();
    },
  };
}

/* ================================================================ TIME */
function timeTool() {
  let tz = tm.localTz();
  const zones = tm.allTimeZones();
  const nowRow = h('div', { class: 'now' });
  const nS = kv('Unix seconds now', ''), nMs = kv('Unix ms now', ''), nIso = kv('UTC now', '');
  nowRow.append(nS.el, nMs.el, nIso.el);
  const inp = input('Timestamp or date', { placeholder: '1767225600 · 2026-03-08 14:30 · in 3 days · now' });
  const tzSel = select('Time zone', zones.includes(tz) ? zones : [tz, ...zones], tz, (v) => { tz = v; run(); });
  const nowBtn = h('button', { class: 'btn ghost', type: 'button', text: 'Use now' });
  const msg = note(), list = h('div', { class: 'list' }), world = h('div', { class: 'list' });
  nowBtn.addEventListener('click', () => { inp.el.value = String(Math.floor(Date.now() / 1000)); run(); });
  function tickNow() {
    const n = Date.now();
    nS.set(String(Math.floor(n / 1000))); nMs.set(String(n)); nIso.set(new Date(n).toISOString());
  }
  function run() {
    list.replaceChildren(); world.replaceChildren(); setNote(msg, '', '');
    const v = inp.el.value.trim();
    if (!v) return;
    try {
      const r = tm.parseTime(v, { tz });
      const ms = Math.round(r.ms);
      setNote(msg, 'ok', `Read as ${r.label}.`);
      const rows = [
        ['Local (' + tz + ')', tm.isoInTz(ms, tz)], ['Readable', tm.human(ms, tz)], ['UTC', new Date(ms).toISOString()],
        ['RFC 2822', tm.rfc2822(ms)], ['Unix seconds', String(Math.floor(ms / 1000))], ['Unix ms', String(ms)],
        ['Relative', tm.relative(ms)], ['Difference', tm.duration(ms - Date.now()) + (ms < Date.now() ? ' ago' : ' from now')],
      ];
      const c = tm.calendarInfo(ms, tz);
      rows.push(['Calendar', `${c.weekday}, day ${c.dayOfYear}, ISO week ${c.isoWeek}`]);
      list.replaceChildren(...rows.map(([k, val]) => kv(k, val, { wide: true }).el));
      world.replaceChildren(h('div', { class: 'lab mono sp', text: 'Around the world' }), ...tm.COMMON_TZ.slice(0, 12).map((z) => kv(z.replace(/_/g, ' '), tm.human(ms, z, { seconds: false }), { wide: true }).el));
    } catch (e) { setNote(msg, 'bad', e.message); }
  }
  inp.el.addEventListener('input', debounce(run, 100));
  let iv = null;
  tickNow();
  return {
    el: card(title('Time', 'Unix timestamps, ISO dates and plain English, in any time zone.'), nowRow, inp.wrap, row(tzSel.wrap, nowBtn), msg, list, world),
    set(t) { inp.el.value = t.trim(); run(); },
    show() { tickNow(); clearInterval(iv); iv = setInterval(tickNow, 1000); },
    hide() { clearInterval(iv); },
  };
}

/* ================================================================ JWT */
function jwtTool() {
  const inp = area('Token', { rows: 5, placeholder: 'eyJhbGciOiJIUzI1NiIs…' });
  const sample = h('button', { class: 'btn ghost', type: 'button', text: 'Try a sample' });
  const msg = note(), out = h('div', { class: 'stack tight' });
  const secret = input('Secret (HS256 / 384 / 512 only)', { placeholder: 'Type the shared secret to check the signature' });
  const verdict = note();
  let token = '';
  function pre(label, o) {
    const p = h('pre', { class: 'out mono', tabindex: '0' });
    p.innerHTML = highlightJson(JSON.stringify(o, null, 2));
    return h('div', { class: 'field' }, h('div', { class: 'fh' }, h('span', { class: 'lab mono', text: label }), copyBtn(JSON.stringify(o, null, 2), 'Copy', 'sm')), p);
  }
  function run() {
    out.replaceChildren(); setNote(msg, '', ''); setNote(verdict, '', '');
    token = inp.ta.value.trim();
    if (!token) return;
    try {
      const d = jwt.decodeJwt(token);
      const st = d.status;
      const badge = h('div', { class: 'status ' + (st.expired || st.notYetValid ? 'bad' : st.hasExp ? 'ok' : 'warn') });
      badge.textContent = st.expired ? `Expired ${tm.duration(st.expiresInMs)} ago` : st.notYetValid ? 'Not valid yet' : st.hasExp ? `Not expired. Expires ${tm.relative(Date.now() + st.expiresInMs)}.` : 'No expiry claim (exp)';
      out.append(badge);
      if (d.alg === 'none') out.append(h('p', { class: 'note warn', text: 'alg is "none": this token is unsigned, so anyone could have made it.' }));
      out.append(pre('Header', d.header), pre('Payload', d.payload));
      if (d.times.length) out.append(h('div', { class: 'list' }, ...d.times.map((t) => kv(t.label, `${humanUtc(t.ms)} (${tm.relative(t.ms)})`, { wide: true }).el)));
      if (d.payload && typeof d.payload === 'object') {
        const named = Object.keys(d.payload).filter((k) => jwt.CLAIM_NAMES[k] && !jwt.TIME_CLAIMS.includes(k));
        if (named.length) out.append(h('div', { class: 'list' }, ...named.map((k) => kv(jwt.CLAIM_NAMES[k], typeof d.payload[k] === 'object' ? JSON.stringify(d.payload[k]) : String(d.payload[k]), { wide: true }).el)));
      }
      out.append(kv('Signature', d.signature || '(empty)', { wide: true }).el);
      if (/^HS(256|384|512)$/.test(d.alg)) out.append(secret.wrap, verdict); else if (d.alg !== 'none') out.append(h('p', { class: 'note', text: `${d.alg} tokens need a public key to verify, which this page does not do. The contents above are readable by anyone either way.` }));
      checkSecret();
    } catch (e) { setNote(msg, 'bad', e.message); }
  }
  async function checkSecret() {
    const s = secret.el.value;
    if (!s || !token) { setNote(verdict, '', ''); return; }
    try { const ok = await jwt.verifyHmacJwt(token, s); setNote(verdict, ok ? 'ok' : 'bad', ok ? 'Signature matches this secret.' : 'Signature does not match this secret.'); }
    catch (e) { setNote(verdict, 'warn', e.message); }
  }
  secret.el.addEventListener('input', debounce(checkSecret, 150));
  inp.ta.addEventListener('input', debounce(run, 100));
  sample.addEventListener('click', async () => {
    const now = Math.floor(Date.now() / 1000);
    inp.ta.value = await jwt.signHmacJwt({ alg: 'HS256', typ: 'JWT' }, { sub: 'user_42', name: 'Ada Lovelace', iat: now, exp: now + 3600 }, 'secret');
    secret.el.value = 'secret'; run();
  });
  return {
    el: card(title('JWT decoder', 'Reads the token locally. Decoding is not the same as trusting it.'), inp.wrap, row(sample), msg, out),
    set(t) { inp.ta.value = t; run(); },
  };
}

/* ================================================================ CRON */
function cronTool() {
  let tz = tm.localTz();
  const inp = input('Cron expression', { value: '*/15 9-17 * * 1-5', placeholder: '*/15 9-17 * * 1-5' });
  const zones = tm.allTimeZones();
  const tzSel = select('Run times shown in', zones.includes(tz) ? zones : [tz, ...zones], tz, (v) => { tz = v; run(); });
  const presets = [['Every minute', '* * * * *'], ['Every 15 min', '*/15 * * * *'], ['Hourly', '0 * * * *'], ['Daily 9:00', '0 9 * * *'], ['Weekdays 9:00', '0 9 * * 1-5'], ['Monthly', '0 0 1 * *'], ['@weekly', '@weekly']];
  const chips = h('div', { class: 'chips scroll' }, presets.map(([l, v]) => h('button', { type: 'button', class: 'chipt', text: l, onclick: () => { inp.el.value = v; run(); } })));
  const msg = note();
  const desc = h('p', { class: 'cron-desc' });
  const fields = h('div', { class: 'cfields' });
  const runs = h('div', { class: 'list' });
  function run() {
    runs.replaceChildren(); fields.replaceChildren(); desc.textContent = '';
    const v = inp.el.value.trim();
    if (!v) { setNote(msg, '', ''); return; }
    try {
      const parsed = cron.parseCron(v);
      setNote(msg, '', '');
      desc.textContent = cron.describeCron(parsed);
      const raw = (cron.MACROS[v.toLowerCase()] || v).split(/\s+/);
      const names = raw.length === 6 ? ['sec', 'min', 'hour', 'day', 'month', 'weekday'] : ['min', 'hour', 'day', 'month', 'weekday'];
      names.forEach((n, i) => fields.append(h('div', { class: 'cf' }, h('b', { class: 'mono', text: raw[i] ?? '' }), h('span', { class: 'mono', text: n }))));
      const next = cron.nextRuns(parsed, { count: 8, tz });
      if (!next.length) runs.append(h('p', { class: 'empty', text: 'No upcoming runs in the next few years.' }));
      next.forEach((r, i) => runs.append(kv(i === 0 ? 'Next' : '+' + i, `${tm.human(r.ms, tz, { seconds: false })} · ${tm.relative(r.ms)}`, { wide: true }).el));
    } catch (e) { setNote(msg, 'bad', e.message); }
  }
  inp.el.addEventListener('input', debounce(run, 80));
  run();
  return { el: card(title('Cron explainer', '5 fields, or 6 with seconds. Shows the next real run times.'), chips, inp.wrap, msg, desc, fields, tzSel.wrap, runs), set(t) { inp.el.value = t.trim(); run(); } };
}

/* ================================================================ BASES */
function baseTool() {
  let from = 'auto';
  const inp = input('Number', { placeholder: '255, 0xff, 0b1010, 0o17', mode: 'text' });
  const fromSel = seg([{ v: 'auto', l: 'Auto' }, { v: '2', l: 'Bin' }, { v: '8', l: 'Oct' }, { v: '10', l: 'Dec' }, { v: '16', l: 'Hex' }], from, (v) => { from = v; run(); }, 'Input base');
  const msg = note(), list = h('div', { class: 'list' });
  function run() {
    list.replaceChildren(); setNote(msg, '', '');
    const v = inp.el.value.trim(); if (!v) return;
    try {
      const r = nb.convertAll(v, from);
      setNote(msg, 'ok', `Read as base ${r.base}. ${r.bits} bit${r.bits === 1 ? '' : 's'}${r.width ? `, fits in ${r.width}` : ''}.`);
      const rows = [['Binary', nb.toBase(r.value, 2, { prefix: true })], ['Octal', nb.toBase(r.value, 8, { prefix: true })], ['Decimal', nb.toBase(r.value, 10, { group: 3 })], ['Hex', nb.toBase(r.value, 16, { prefix: true })], ['Base 32', r.b32], ['Base 36', r.b36]];
      if (r.twos) { rows.push([`Two's complement ${r.twos.width}-bit`, r.twos.bin], [`Two's complement hex`, '0x' + r.twos.hex]); }
      if (r.ascii) rows.push(['As ASCII', r.ascii]);
      list.replaceChildren(...rows.map(([k, val]) => kv(k, val, { wide: true }).el));
    } catch (e) { setNote(msg, 'bad', e.message); }
  }
  inp.el.addEventListener('input', debounce(run, 60));
  return { el: card(title('Number bases', 'Any size, thanks to big integers.'), inp.wrap, fromSel.el, msg, list), set(t) { inp.el.value = t.trim(); from = 'auto'; fromSel.set('auto'); run(); } };
}

/* ================================================================ shell */
const FACTORIES = { encode: encodeTool, json: jsonTool, hash: hashTool, ids: idsTool, color: colorTool, regex: regexTool, text: textTool, time: timeTool, jwt: jwtTool, cron: cronTool, base: baseTool };

export function mount(root = document, opts = {}) {
  const tabsEl = root.querySelector('#tabs'), panelsEl = root.querySelector('#panels');
  const smart = root.querySelector('#smart'), sugg = root.querySelector('#sugg'), pasteBtn = root.querySelector('#pasteBtn');
  const tools = {}, panelEls = {}, tabEls = {};
  let active = null;

  for (const t of TABS) {
    const b = h('button', { class: 'tab', type: 'button', role: 'tab', id: 'tab-' + t.id, 'aria-controls': 'p-' + t.id, 'aria-selected': 'false', tabindex: '-1', title: t.blurb });
    b.innerHTML = `${icon(t.id)}<span>${esc(t.label)}</span><i class="dot" aria-hidden="true"></i>`;
    b.addEventListener('click', () => open(t.id));
    b.addEventListener('keydown', (e) => {
      const i = TABS.findIndex((x) => x.id === t.id);
      const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null;
      if (to == null) return;
      e.preventDefault();
      const n = TABS[(to + TABS.length) % TABS.length].id; open(n); tabEls[n].focus();
    });
    tabEls[t.id] = b; tabsEl.append(b);
    const p = h('section', { class: 'panel', role: 'tabpanel', id: 'p-' + t.id, 'aria-labelledby': 'tab-' + t.id, hidden: true });
    panelEls[t.id] = p; panelsEl.append(p);
  }
  function ensure(id) {
    if (!tools[id]) {
      tools[id] = FACTORIES[id]();
      panelEls[id].append(tools[id].el);
    }
    return tools[id];
  }
  function open(id, { silent = false } = {}) {
    if (!FACTORIES[id]) return null;
    if (active && active !== id) { panelEls[active].hidden = true; tabEls[active].setAttribute('aria-selected', 'false'); tabEls[active].tabIndex = -1; tools[active] && tools[active].hide && tools[active].hide(); }
    const tool = ensure(id);
    active = id;
    const p = panelEls[id]; p.hidden = false;
    p.classList.remove('in'); void p.offsetWidth; p.classList.add('in');
    const b = tabEls[id]; b.setAttribute('aria-selected', 'true'); b.tabIndex = 0;
    const box = tabsEl; const left = b.offsetLeft - (box.clientWidth - b.offsetWidth) / 2;
    try { box.scrollTo({ left, behavior: reduce() || silent ? 'auto' : 'smooth' }); } catch { box.scrollLeft = left; }
    if (!silent) { store.set(KEY_TAB, id); try { history.replaceState(null, '', '#' + id); } catch { /* ignore */ } }
    tool.show && tool.show();
    return tool;
  }

  /* smart paste */
  let lastKeys = [];
  function renderSugg() {
    const text = smart.value;
    sugg.replaceChildren();
    Object.values(tabEls).forEach((b) => b.classList.remove('hint'));
    if (!text.trim()) return;
    let list = [];
    try { list = suggestions(detect(text)); } catch { list = []; }
    lastKeys = list;
    if (!list.length) { sugg.append(h('span', { class: 'sg-none', text: 'Nothing obvious. Pick a tool below and paste there.' })); return; }
    list.forEach((s, i) => {
      tabEls[s.route.tab].classList.add('hint');
      const b = h('button', { type: 'button', class: 'sg' + (i === 0 ? ' first' : '') });
      b.append(h('b', { text: s.label }), h('span', { class: 'mono', text: '→ ' + TABS.find((t) => t.id === s.route.tab).label }), h('em', { text: s.why }));
      b.addEventListener('click', () => { const tool = open(s.route.tab); tool.set(text, s.route); });
      sugg.append(b);
    });
  }
  smart.addEventListener('input', debounce(renderSugg, 120));
  if (navigator.clipboard && navigator.clipboard.readText) {
    pasteBtn.hidden = false;
    pasteBtn.addEventListener('click', async () => {
      try { smart.value = await navigator.clipboard.readText(); renderSugg(); smart.focus(); }
      catch { smart.focus(); sugg.replaceChildren(h('span', { class: 'sg-none', text: 'Your browser blocked that. Long-press the box and choose Paste.' })); }
    });
  }

  const start = pickTab(location.hash, store.get(KEY_TAB));
  open(opts.tab || start, { silent: true });
  addEventListener('hashchange', () => { const t = pickTab(location.hash, null); if (location.hash && t !== active) open(t, { silent: true }); });
  return { open, tools, get active() { return active; } };
}

const root = document.getElementById('app');
if (root) { window.SZVDev = mount(document); }
