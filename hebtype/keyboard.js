/* On-screen Hebrew keyboard (docked to the bottom) that types into a real <textarea>/<input>.
   Used by /hebtype/ and by /gematria/.

     const kb = mountKeyboard(hostEl, { target: textarea, onChange });
     kb.show() / hide() / toggle() / isOpen() / setAutoFinal(bool) / destroy()

   Letters, nikud, trope and punctuation layers; long-press a letter for its vowel variants;
   hold backspace to repeat; optional automatic final letters (ך ם ן ף ץ). The textarea should be
   inputmode="none" while the keyboard is open (the page decides). Everything is feature-detected. */
import { FINAL_OF, BASE_OF, MARK_RE } from './text.js?v=078aeda6eb';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const buzz = (ms = 6) => { try { if (!reduced() && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* no haptics */ } };
const store = {
  get(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};

const ROWS = {
  std: ['קראטוןםפ', 'שדגכעיחלךף', 'זסבהנמצתץ'],
  abc: ['אבגדהוזחט', 'יכלמנסעפצ', 'קרשתךםןףץ'],
};
const MARKS = [ // [char, name]
  ['ָ', 'kamatz'], ['ַ', 'patach'], ['ֵ', 'tzeirei'], ['ֶ', 'segol'], ['ִ', 'chirik'], ['ֹ', 'cholam'], ['ֻ', 'kubutz'],
  ['ְ', 'sheva'], ['ּ', 'dagesh'], ['ׁ', 'shin dot'], ['ׂ', 'sin dot'], ['ֿ', 'rafe'], ['וּ', 'shuruk', 'vav'], ['וֹ', 'cholam', 'vav'],
  ['ֲ', 'chataf patach'], ['ֱ', 'chataf segol'], ['ֳ', 'chataf kamatz'],
];
const TROPE = [['֑', 'etnachta'], ['֔', 'zakef katan'], ['֗', 'revia'], ['֖', 'tipcha'], ['֣', 'munach'], ['֥', 'mercha'], ['֙', 'pashta'], ['֛', 'tevir'], ['֮', 'zarka'], ['֒', 'segol (trope)']];
const PUNCT = [['׃', 'sof pasuk'], ['־', 'maqaf'], ['׳', 'geresh'], ['״', 'gershayim'], ['.', 'period'], [',', 'comma'], ['?', 'question mark'], ['!', 'exclamation'], [':', 'colon'], [';', 'semicolon']];
const DIGITS = '1234567890'.split('').map((d) => [d, d]);
const POP_MARKS = ['ָ', 'ַ', 'ֵ', 'ֶ', 'ִ', 'ֹ', 'ֻ', 'ְ', 'ּ'];

const keyOf = (ch, extra = {}) => ({ t: 'ch', v: ch, label: ch, ...extra });
const markKey = (m) => ({ t: 'ch', v: m[0], label: m[2] === 'vav' ? m[0] : '◌' + m[0], name: m[1], mark: true, wide: m[2] === 'vav' });

function layerRows(layer, layout) {
  if (layer === 'nik') {
    const mk = (a) => a.map(markKey);
    return [mk(MARKS.slice(0, 7)), mk(MARKS.slice(7, 14)), [...mk(MARKS.slice(14)), ...PUNCT.slice(2, 4).map((p) => keyOf(p[0], { name: p[1] })), keyOf('־', { name: 'maqaf' })]];
  }
  if (layer === 'sym') {
    return [PUNCT.map((p) => keyOf(p[0], { name: p[1], aria: p[1] })), TROPE.map((m) => ({ t: 'ch', v: m[0], label: '◌' + m[0], mark: true, aria: m[1], name: '' })), DIGITS.map((d) => keyOf(d[0]))];
  }
  return ROWS[layout].map((r) => Array.from(r).map((c) => keyOf(c, { letter: true })));
}

export function mountKeyboard(host, opts = {}) {
  const target = opts.target;
  let layer = store.get('szv-kb-layer', 'abc');
  let layout = store.get('szv-kb-layout', 'std');
  if (!['abc', 'nik', 'sym'].includes(layer)) layer = 'abc';
  if (!ROWS[layout]) layout = 'std';
  let autoFinal = opts.autoFinal !== false;
  let open = false, keys = [], popup = null, st = null;

  host.classList.add('szk-dock');
  host.hidden = true;
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', 'Hebrew keyboard');

  const root = document.createElement('div');
  root.className = 'szk';
  host.appendChild(root);

  function render() {
    keys = [];
    const rows = layerRows(layer, layout);
    const rowHtml = rows.map((r) => `<div class="szk-row">${r.map((k) => {
      const i = keys.push(k) - 1;
      const cls = ['szk-k', k.letter ? 'let' : '', k.mark ? 'mk' : '', k.wide ? 'w2' : ''].join(' ').trim();
      return `<button type="button" class="${cls}" data-i="${i}" ${k.aria ? `aria-label="${k.aria}"` : (k.name ? `aria-label="${k.name}"` : '')} tabindex="-1" lang="he"><span>${k.label}</span>${k.name && layer === 'nik' ? `<small>${k.name}</small>` : ''}</button>`;
    }).join('')}</div>`).join('');
    const spec = (t, label, cls, aria, flex) => { const i = keys.push({ t }) - 1; return `<button type="button" class="szk-k sp ${cls}" data-i="${i}" aria-label="${aria}" tabindex="-1" style="flex:${flex}"><span>${label}</span></button>`; };
    const bottom = `<div class="szk-row szk-bot">${spec('geresh', '׳', '', 'geresh', 1)}${spec('maqaf', '־', '', 'maqaf', 1)}${spec('space', 'space', 'space', 'space', 4)}${spec('bs', '⌫', 'bs', 'backspace', 1.5)}${spec('nl', '↵', 'nl', 'new line', 1.3)}</div>`;
    root.innerHTML = `
      <div class="szk-bar">
        <div class="szk-tabs" role="tablist">
          <button type="button" role="tab" class="${layer === 'abc' ? 'on' : ''}" data-layer="abc" aria-selected="${layer === 'abc'}" tabindex="-1"><span lang="he">אבג</span></button>
          <button type="button" role="tab" class="${layer === 'nik' ? 'on' : ''}" data-layer="nik" aria-selected="${layer === 'nik'}" tabindex="-1"><span lang="he">◌ַָ</span> Nikud</button>
          <button type="button" role="tab" class="${layer === 'sym' ? 'on' : ''}" data-layer="sym" aria-selected="${layer === 'sym'}" tabindex="-1"><span lang="he">׃֑</span> Marks</button>
        </div>
        <button type="button" class="szk-chip" data-act="layout" tabindex="-1" aria-label="Switch key order" ${layer === 'abc' ? '' : 'hidden'}><span lang="he">${layout === 'std' ? 'א‑ב' : 'קרא'}</span></button>
        <button type="button" class="szk-chip" data-act="hide" tabindex="-1" aria-label="Hide keyboard">&#x25BE;</button>
      </div>
      <div class="szk-rows">${rowHtml}${bottom}</div>`;
  }

  /* ---------- typing ---------- */
  function fire(k) {
    if (!target) return;
    if (k.t === 'ch') put(k.v);
    else if (k.t === 'space') put(' ');
    else if (k.t === 'nl') put('\n');
    else if (k.t === 'geresh') put('׳');
    else if (k.t === 'maqaf') put('־');
    else if (k.t === 'bs') back();
  }
  const isPlainLetter = (c) => c && /[א-ת]/.test(c);
  function prevLetter(v, s) { let j = s - 1; while (j >= 0 && MARK_RE.test(v[j])) j--; return j; }
  function put(str) {
    const t = target;
    if (document.activeElement !== t) t.focus({ preventScroll: true });
    const v0 = t.value, s = t.selectionStart, e = t.selectionEnd;
    if (autoFinal && s === e) {
      if (isPlainLetter(str[0])) {                       // typing on: a final form in the middle becomes regular
        const j = prevLetter(v0, s);
        if (j >= 0 && BASE_OF[v0[j]]) t.setRangeText(BASE_OF[v0[j]], j, j + 1, 'preserve');
      } else if (!MARK_RE.test(str[0]) && str !== '׳' && str !== '״') {   // word ends: regular -> final (not for 1-letter words)
        const j = prevLetter(v0, s);
        if (j >= 0 && FINAL_OF[v0[j]] && isPlainLetter(v0[prevLetter(v0, j)])) t.setRangeText(FINAL_OF[v0[j]], j, j + 1, 'preserve');
      }
    }
    t.setRangeText(str, s, e, 'end');
    changed();
  }
  function back() {
    const t = target;
    if (document.activeElement !== t) t.focus({ preventScroll: true });
    const s = t.selectionStart, e = t.selectionEnd;
    if (s !== e) t.setRangeText('', s, e, 'end');
    else if (s > 0) {
      const prev = Array.from(t.value.slice(0, s)).pop();
      t.setRangeText('', s - prev.length, s, 'end');
    }
    changed();
  }
  function changed() {
    const t = target;
    if (t.selectionStart >= t.value.length - 1) t.scrollTop = t.scrollHeight;
    t.dispatchEvent(new Event('input', { bubbles: true }));
    if (opts.onChange) opts.onChange();
  }

  /* ---------- long-press popup (vowels on a letter) ---------- */
  function openPopup(btn, k) {
    closePopup();
    const ch = k.v;
    const opts2 = [ch, ...POP_MARKS.map((m) => ch + m)];
    if (ch === 'ש') opts2.push('שׁ', 'שׂ');
    if (ch === 'ו') opts2.push('וֹ');
    if ('בכפ'.includes(ch)) opts2.push(ch + 'ֿ');
    popup = document.createElement('div');
    popup.className = 'szk-pop';
    popup.innerHTML = opts2.map((o, i) => `<button type="button" data-o="${i}" tabindex="-1" lang="he">${o}</button>`).join('');
    popup._o = opts2;
    root.appendChild(popup);
    const r = btn.getBoundingClientRect(), cols = Math.min(5, opts2.length);
    popup.style.setProperty('--cols', cols);
    const w = cols * 46 + 14;
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(8, Math.min(innerWidth - w - 8, left));
    popup.style.left = left + 'px';
    popup.style.bottom = Math.max(8, innerHeight - r.top + 8) + 'px';
    buzz(10);
  }
  function closePopup() { if (popup) { popup.remove(); popup = null; } }
  const optAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest ? el.closest('[data-o]') : null; };

  /* ---------- pointer handling ---------- */
  function clearSt() { if (!st) return; clearTimeout(st.timer); clearInterval(st.rep); st.btn.classList.remove('down'); st = null; }
  root.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault();                                            // keep the textarea focused
    if (e.target.closest('.szk-pop')) return;
    const b = e.target.closest('[data-i]');
    if (popup) closePopup();
    if (!b) return;
    clearSt();
    const k = keys[+b.dataset.i];
    st = { btn: b, k, x: e.clientX, y: e.clientY, moved: false, long: false, id: e.pointerId };
    b.classList.add('down');
    if (k.t === 'bs') { buzz(); back(); st.timer = setTimeout(() => { st.rep = setInterval(back, 55); }, 420); }
    else if (k.letter) st.timer = setTimeout(() => { if (st) { st.long = true; openPopup(b, k); } }, 420);
  });
  root.addEventListener('pointermove', (e) => {
    if (!st) return;
    if (!st.moved && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 10) { st.moved = true; if (!st.long) clearTimeout(st.timer); }
    if (popup) { const o = optAt(e.clientX, e.clientY); popup.querySelectorAll('.hot').forEach((n) => n.classList.remove('hot')); if (o) o.classList.add('hot'); }
  });
  const end = (e, cancel) => {
    if (!st) return;
    const s = st; const wasPopup = popup;
    if (wasPopup && !cancel) {
      const o = optAt(e.clientX, e.clientY);
      if (o) { put(wasPopup._o[+o.dataset.o]); closePopup(); buzz(); clearSt(); return; }
    }
    clearSt();
    if (cancel) return;
    if (!s.long && !s.moved && s.k.t !== 'bs') { buzz(); fire(s.k); }
    else if (s.moved && !s.long && s.k.t !== 'bs') {
      // a slightly wobbly tap still counts as a tap when it ends on the same key
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el && el.closest('[data-i]') === s.btn) { buzz(); fire(s.k); }
    }
  };
  root.addEventListener('pointerup', (e) => end(e, false));
  root.addEventListener('pointercancel', (e) => end(e, true));
  root.addEventListener('touchcancel', (e) => end(e, true));
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  root.addEventListener('click', (e) => {
    const o = e.target.closest('[data-o]');
    if (o && popup) { put(popup._o[+o.dataset.o]); closePopup(); buzz(); return; }
    const tab = e.target.closest('[data-layer]');
    if (tab) { layer = tab.dataset.layer; store.set('szv-kb-layer', layer); render(); return; }
    const act = e.target.closest('[data-act]');
    if (act) {
      if (act.dataset.act === 'hide') api.hide();
      if (act.dataset.act === 'layout') { layout = layout === 'std' ? 'abc' : 'std'; store.set('szv-kb-layout', layout); render(); }
    }
  });
  document.addEventListener('pointerdown', (e) => { if (popup && !popup.contains(e.target)) closePopup(); }, true);

  /* ---------- dock sizing ---------- */
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    document.documentElement.style.setProperty('--szk-h', open ? host.offsetHeight + 'px' : '0px');
  }) : null;
  if (ro) ro.observe(host);

  // keep the text box above the keyboard (matters on short landscape screens)
  function reveal() {
    if (!target || !open) return;
    const r = target.getBoundingClientRect(), limit = innerHeight - host.offsetHeight - 8;
    if (r.bottom > limit) window.scrollBy(0, Math.max(0, Math.min(r.bottom - limit, r.top - 56)));
  }
  const api = {
    show() { open = true; host.hidden = false; document.body.classList.add('szk-open'); document.documentElement.style.setProperty('--szk-h', host.offsetHeight + 'px'); if (opts.onToggle) opts.onToggle(true); requestAnimationFrame(reveal); },
    hide() { open = false; closePopup(); host.hidden = true; document.body.classList.remove('szk-open'); document.documentElement.style.setProperty('--szk-h', '0px'); if (opts.onToggle) opts.onToggle(false); },
    toggle() { open ? api.hide() : api.show(); },
    isOpen: () => open,
    setAutoFinal(v) { autoFinal = !!v; },
    destroy() { api.hide(); if (ro) ro.disconnect(); host.innerHTML = ''; },
  };
  render();
  return api;
}
