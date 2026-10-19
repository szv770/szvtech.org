// Notes editor: a real <textarea> (so phones keep native selection, IME, undo, paste) with a syntax-coloured
// mirror layer underneath, drawn line by line. Both share one scroll box and identical text metrics.
// The mirror is incremental: typing re-colours only the touched lines; big pastes show plain text at once
// and get their colours in small time-boxed slices so nothing janks on a phone.
import { esc, tokenizeLine, lineHtml, enterEdit, toggleChecklistAt } from '/notes/lib.js?v=e9d2374159';

const BIG_LINES = 3000, BIG_CHARS = 150000;   // above this: "big mode" = plain native textarea (no mirror, no numbers)
const SMALL_LINES = 2000, SMALL_CHARS = 100000; // back below this: the mirror comes back
const SLICE_MS = 7;

export function createEditor(root, opts = {}) {
  const grid = document.createElement('div');
  grid.className = 'ed-grid';
  const hl = document.createElement('pre');
  hl.className = 'ed-hl';
  hl.setAttribute('aria-hidden', 'true');
  const ta = document.createElement('textarea');
  ta.className = 'ed-ta';
  ta.setAttribute('aria-label', opts.label || 'Note text');
  ta.setAttribute('aria-describedby', opts.describedBy || '');
  for (const [k, v] of Object.entries({ spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', rows: '1', wrap: 'soft', enterkeyhint: 'enter' })) ta.setAttribute(k, v);
  grid.append(hl, ta);
  root.append(grid);

  let lang = 'plain';
  let lines = [''];        // text split by \n, mirrors the DOM children of hl
  let states = [''];       // tokenizer state at the START of each line (+1 sentinel)
  let colorTimer = 0, colorFrom = -1;
  let escTab = false;
  let errLine = -1;
  let colorOn = true;
  let gutDigits = 0;
  let big = false;

  /* ---------- mirror ---------- */
  const divHtml = (l) => '<div>' + esc(l) + '</div>';
  function setGutter(n) {
    const digits = Math.max(2, String(n).length);
    if (digits === gutDigits) return;
    gutDigits = digits;
    root.style.setProperty('--gut', `calc(${digits}ch + 28px)`);
  }
  function countLines(t) { let n = 1; for (let i = t.indexOf('\n'); i !== -1; i = t.indexOf('\n', i + 1)) n++; return n; }
  function setBig(on) {
    if (on === big) return;
    big = on;
    root.classList.toggle('big', on);
    if (on) { clearTimeout(colorTimer); colorTimer = 0; colorFrom = -1; hl.textContent = ''; lines = ['']; states = ['', '']; }
    if (opts.onMode) opts.onMode(on);
  }
  /** Decide big mode from the text (with hysteresis). Returns true when big. */
  function modeFor(text) {
    if (!big) { if (text.length > BIG_CHARS || countLines(text) > BIG_LINES) setBig(true); }
    else if (text.length < SMALL_CHARS && countLines(text) < SMALL_LINES) setBig(false);
    return big;
  }
  function fullRender(text) {
    if (modeFor(text)) { colorOn = false; return; }
    lines = text.split('\n');
    states = new Array(lines.length + 1).fill('');
    let h = '';
    for (let i = 0; i < lines.length; i++) h += divHtml(lines[i]);
    hl.innerHTML = h;
    setGutter(lines.length);
    errLine = -1;
    colorOn = lang !== 'plain';
    scheduleColor(0);
  }
  function colorLine(i) {
    const r = tokenizeLine(lang, lines[i], states[i]);
    const prev = states[i + 1];
    states[i + 1] = r.s;
    const d = hl.children[i];
    if (d && (lines[i].length)) d.innerHTML = lineHtml(r.t);
    return prev !== r.s;
  }
  /** Colour from line `from`, time-boxed; keeps going (next slice) until done. */
  function scheduleColor(from) {
    if (!colorOn) { if (colorTimer) { clearTimeout(colorTimer); colorTimer = 0; } colorFrom = -1; return; }
    colorFrom = colorFrom < 0 ? from : Math.min(colorFrom, from);
    if (!colorTimer) colorTimer = setTimeout(pump, 0);
  }
  function pump() {
    colorTimer = 0;
    if (colorFrom < 0 || !colorOn) return;
    const t0 = performance.now();
    let i = colorFrom;
    while (i < lines.length) {
      colorLine(i); i++;
      if ((i & 31) === 0 && performance.now() - t0 > SLICE_MS) break;
    }
    if (i < lines.length) { colorFrom = i; colorTimer = setTimeout(pump, 0); } else colorFrom = -1;
  }
  /** Re-colour a small edit synchronously, then let the slicer finish any state change that ripples down. */
  function patch(p, newEnd, oldTail) { // lines [p,newEnd) are new; oldTail = states[] values that followed (for ripple stop)
    let i = p;
    for (; i < newEnd; i++) colorLine(i);
    // ripple: later lines only change if the carried-over state changed
    if (i < lines.length && states[i] !== oldTail) scheduleColor(i);
  }
  function update(text) {
    const wasBig = big;
    if (modeFor(text)) return;
    if (wasBig) { fullRender(text); return; }
    const nl = text.split('\n');
    const ol = lines;
    let p = 0; const max = Math.min(nl.length, ol.length);
    while (p < max && nl[p] === ol[p]) p++;
    let s = 0;
    while (s < max - p && nl[nl.length - 1 - s] === ol[ol.length - 1 - s]) s++;
    const removed = ol.length - s - p, inserted = nl.length - s - p;
    if (removed + inserted > 600) { fullRender(text); return; }
    const kids = hl.children;
    const ref = kids[ol.length - s] || null;
    for (let k = 0; k < removed; k++) hl.removeChild(kids[p]);
    if (inserted) {
      const tmp = document.createElement('div');
      let h = ''; for (let k = 0; k < inserted; k++) h += divHtml(nl[p + k]);
      tmp.innerHTML = h;
      const frag = document.createDocumentFragment();
      while (tmp.firstChild) frag.appendChild(tmp.firstChild);
      hl.insertBefore(frag, ref);
    }
    const oldTailState = states[p + removed];
    const ns = states.slice(0, p + 1);
    for (let k = 0; k < inserted; k++) ns.push('');
    for (let k = p + removed + 1; k < states.length; k++) ns.push(states[k]);
    // states for lines after the edit are still the old values (valid until proven otherwise)
    states = ns;
    lines = nl;
    setGutter(lines.length);
    if (errLine >= 0) { errLine = -1; }
    colorOn = lang !== 'plain';
    if (colorOn) patch(p, p + inserted, oldTailState);
  }

  /* ---------- text edits that keep the native undo stack ---------- */
  function replaceRange(from, to, str, selFrom = null, selTo = null) {
    const before = ta.value;
    const expected = before.slice(0, from) + str + before.slice(to);
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(from, to);
    let ok = false;
    const heavy = str.length > 8000 || to - from > 8000; // execCommand is very slow on big text; skip it (costs one undo step)
    try { ok = heavy ? false : str === '' ? (from < to ? document.execCommand('delete') : true) : document.execCommand('insertText', false, str); } catch { ok = false; }
    if (!ok || ta.value !== expected) { // no execCommand here: still do the edit (loses one undo step, nothing else)
      ta.value = expected;
      ta.setSelectionRange(from + str.length, from + str.length);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (selFrom !== null) ta.setSelectionRange(selFrom, selTo ?? selFrom);
  }
  function indentSelection(outdent) {
    const v = ta.value, a = ta.selectionStart, b = ta.selectionEnd;
    const multi = v.slice(a, b).includes('\n');
    if (!multi && !outdent) { // plain Tab: spaces up to the next 2-column stop
      const col = a - (v.lastIndexOf('\n', a - 1) + 1);
      replaceRange(a, b, col % 2 === 0 ? '  ' : ' ');
      return;
    }
    const ls = v.lastIndexOf('\n', a - 1) + 1;
    let le = v.indexOf('\n', b > a && v[b - 1] === '\n' ? b - 1 : b); if (le < 0) le = v.length;
    const block = v.slice(ls, le).split('\n');
    const next = block.map((l) => outdent ? l.replace(/^(  |\t| )/, '') : (l.length ? '  ' + l : l));
    const text = next.join('\n');
    const delta = text.length - (le - ls);
    const firstDelta = next[0].length - block[0].length;
    replaceRange(ls, le, text);
    ta.setSelectionRange(Math.max(ls, a + firstDelta), Math.max(ls, b + delta));
  }

  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { escTab = true; return; }
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (escTab) { escTab = false; return; }       // Esc then Tab: leave the field (keyboard users)
      e.preventDefault();
      indentSelection(e.shiftKey);
      return;
    }
    if (e.key !== 'Shift' && e.key !== 'Tab') escTab = false;
  });
  ta.addEventListener('blur', () => { escTab = false; });
  ta.addEventListener('beforeinput', (e) => {
    if ((e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') && ta.selectionStart === ta.selectionEnd) {
      const ed = enterEdit(ta.value, ta.selectionStart);
      if (ed) {
        e.preventDefault();
        replaceRange(ed.from, ed.to, ed.text);
      }
    }
  });

  let lastText = '';
  let raf = 0;
  ta.addEventListener('input', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const v = ta.value;
      if (v === lastText) return;
      lastText = v;
      update(v);
      if (opts.onChange) opts.onChange(v);
      keepCaretVisible();
    });
  });
  // a tap on a "[ ]" box toggles it (the markdown preview has big checkboxes too)
  let downX = 0, downY = 0, downT = 0;
  ta.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; downT = e.timeStamp; });
  ta.addEventListener('click', (e) => {
    if (ta.selectionStart !== ta.selectionEnd || ta.readOnly) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 10 || e.timeStamp - downT > 500) return;
    const next = toggleChecklistAt(ta.value, ta.selectionStart);
    if (next === null) return;
    const pos = ta.selectionStart;
    const m = /\[( |x|X)\]/.exec(next.slice(next.lastIndexOf('\n', pos - 1) + 1));
    if (!m) return;
    const bs = next.lastIndexOf('\n', pos - 1) + 1 + m.index + 1;
    replaceRange(bs, bs + 1, next[bs], pos);
  });
  let selRaf = 0;
  document.addEventListener('selectionchange', () => {
    if (document.activeElement !== ta || selRaf) return;
    selRaf = requestAnimationFrame(() => { selRaf = 0; if (opts.onCaret) opts.onCaret(caretInfo()); });
  });

  /* ---------- caret helpers ---------- */
  function caretInfo() {
    const v = ta.value, p = ta.selectionStart;
    let line = 1, last = -1;
    for (let i = v.indexOf('\n'); i !== -1 && i < p; i = v.indexOf('\n', i + 1)) { line++; last = i; }
    return { line, col: p - last, lines: big ? countLines(v) : lines.length, sel: Math.abs(ta.selectionEnd - p), big };
  }
  /** Exact pixel rect of the caret, measured on the mirror (textareas cannot tell us). */
  function caretRect() {
    if (big) return null;
    const p = ta.selectionEnd, v = ta.value;
    let line = 0, last = -1;
    for (let i = v.indexOf('\n'); i !== -1 && i < p; i = v.indexOf('\n', i + 1)) { line++; last = i; }
    const d = hl.children[line];
    if (!d) return null;
    const col = p - last - 1;
    const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT);
    let n, left = col;
    while ((n = w.nextNode())) {
      if (left <= n.length) {
        const r = document.createRange();
        r.setStart(n, left); r.setEnd(n, left);
        let rects = r.getClientRects();
        if (!rects.length && n.length) { r.setStart(n, Math.max(0, left - 1)); r.setEnd(n, left || 1); rects = r.getClientRects(); }
        if (rects.length) return rects[rects.length - 1];
        break;
      }
      left -= n.length;
    }
    return d.getBoundingClientRect();
  }
  function keepCaretVisible() {
    if (document.activeElement !== ta) return;
    const r = caretRect();
    if (!r) return;
    const box = root.getBoundingClientRect();
    const vv = window.visualViewport;
    const bottom = Math.min(box.bottom, vv ? vv.offsetTop + vv.height : innerHeight);
    const pad = 28;
    if (r.bottom + pad > bottom) root.scrollTop += r.bottom + pad - bottom;
    else if (r.top - pad < box.top) root.scrollTop -= box.top + pad - r.top;
    if (!ta.wrap || ta.getAttribute('wrap') === 'off') {
      if (r.right + 24 > box.right) root.scrollLeft += r.right + 24 - box.right;
      else if (r.left - 12 < box.left + 60 && root.scrollLeft) root.scrollLeft -= box.left + 60 - r.left + 12;
    }
  }

  /* ---------- public api ---------- */
  const api = {
    el: ta, root,
    get text() { return ta.value; },
    setText(text, { keepScroll = false } = {}) {
      const st = root.scrollTop;
      ta.value = text; lastText = text;
      try { ta.setSelectionRange(0, 0); } catch { /* not focusable yet */ }
      fullRender(text);
      if (!keepScroll) { root.scrollTop = 0; root.scrollLeft = 0; ta.scrollTop = 0; } else root.scrollTop = st;
      if (opts.onCaret) opts.onCaret(caretInfo());
    },
    setLang(l) { if (l === lang) return; lang = l; if (big) return; states = new Array(lines.length + 1).fill(''); colorOn = lang !== 'plain'; fullRender(ta.value); },
    get big() { return big; },
    setWrap(on) {
      root.classList.toggle('nowrap', !on);
      ta.setAttribute('wrap', on ? 'soft' : 'off');
      if (on) root.scrollLeft = 0;
    },
    setReadOnly(on) { ta.readOnly = !!on; },
    focus() { ta.focus({ preventScroll: true }); },
    blur() { ta.blur(); },
    caretInfo,
    keepCaretVisible,
    replaceAll(text) { ta.focus({ preventScroll: true }); replaceRange(0, ta.value.length, text, 0); },
    insertAtCaret(str) { replaceRange(ta.selectionStart, ta.selectionEnd, str); },
    /** Select a line (1-based) and show it; marks it as an error line until the next edit. */
    goto(line, col = 1, { error = false } = {}) {
      const all = big ? ta.value.split('\n') : lines;
      const idx = Math.max(0, Math.min(all.length - 1, line - 1));
      let pos = 0; for (let i = 0; i < idx; i++) pos += all[i].length + 1;
      pos += Math.min(all[idx].length, Math.max(0, col - 1));
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(pos, pos);
      if (big) { ta.scrollTop = Math.max(0, idx * parseFloat(getComputedStyle(ta).lineHeight) - ta.clientHeight / 3); if (opts.onCaret) opts.onCaret(caretInfo()); return; }
      if (error) { if (errLine >= 0 && hl.children[errLine]) hl.children[errLine].classList.remove('err'); errLine = idx; const d = hl.children[idx]; if (d) d.classList.add('err'); }
      const d = hl.children[idx];
      if (d) {
        const box = root.getBoundingClientRect(), r = d.getBoundingClientRect();
        root.scrollTop += r.top - box.top - box.height / 3;
      }
      if (opts.onCaret) opts.onCaret(caretInfo());
    },
    clearError() { if (big) return; if (errLine >= 0 && hl.children[errLine]) hl.children[errLine].classList.remove('err'); errLine = -1; },
    destroy() { clearTimeout(colorTimer); grid.remove(); },
  };
  fullRender('');
  return api;
}
