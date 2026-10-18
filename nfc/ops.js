// /nfc — the shared sheets: info/confirm sheet, the "tap your tag" sheet, hold-to-confirm, save-preset.
import { $, esc, icon, makeSheet, buzz, sleep, toast } from '/nfc/ui.js';
import { errText, isAbort, hasNFC, isSecure, isAndroid, isIOS } from '/nfc/nfcio.js';
import { goTab } from '/nfc/router.js';
import { lib, labelFor } from '/nfc/data.js';

export const sheet = makeSheet($('#sheet'), $('#sheetBack'));
let cancelCurrent = null;
export const opSheet = makeSheet($('#opSheet'), $('#opBack'), { onClose: () => { if (cancelCurrent) cancelCurrent(); } });

const beforeOp = [];
export const onBeforeOp = (cb) => beforeOp.push(cb);

export const showSheet = (html) => sheet.open(`<div class="grab"></div><div class="body">${html}</div>`);

export function confirmSheet({ title, html = '', ok = 'Continue', danger = false, cancel = 'Cancel' }) {
  return new Promise((resolve) => {
    const prev = sheet.onClose;
    let answered = false;
    const done = (v) => { if (answered) return; answered = true; sheet.onClose = prev; resolve(v); };
    showSheet(`<h2>${esc(title)}</h2>${html}<div class="btn-row"><button class="btn ${danger ? 'danger' : 'primary'}" type="button" data-yes>${esc(ok)}</button><button class="btn" type="button" data-close>${esc(cancel)}</button></div>`);
    sheet.onClose = () => done(false);
    $('#sheet').querySelector('[data-yes]').addEventListener('click', () => { done(true); sheet.close(true); });
  });
}

/* hold a button to confirm. Finger drift > 10px or lifting early cancels. */
export function holdButton(btn, ms, onDone) {
  const fill = btn.querySelector('i');
  let t = null, sx = 0, sy = 0, active = false;
  const reset = () => { active = false; clearTimeout(t); if (fill) { fill.style.transition = 'width .25s'; fill.style.width = '0'; } };
  const start = (x, y) => {
    if (btn.classList.contains('off')) return;
    active = true; sx = x; sy = y;
    if (fill) { fill.style.transition = 'none'; fill.style.width = '0'; void fill.offsetWidth; fill.style.transition = `width ${ms}ms linear`; fill.style.width = '100%'; }
    buzz(8);
    t = setTimeout(() => { if (active) { reset(); buzz([40, 30, 80]); onDone(); } }, ms);
  };
  btn.addEventListener('pointerdown', (e) => { if (e.button > 0) return; try { btn.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } start(e.clientX, e.clientY); });
  btn.addEventListener('pointermove', (e) => { if (active && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) reset(); });
  ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'].forEach((n) => btn.addEventListener(n, reset));
  btn.addEventListener('touchcancel', reset);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  btn.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); start(0, 0); } });
  btn.addEventListener('keyup', reset);
  btn.addEventListener('blur', reset);
}

const RING = (name) => `<div class="ring" aria-hidden="true"><span class="ring-r r1"></span><span class="ring-r r2"></span><span class="ring-r r3"></span><span class="ring-core">${icon(name)}</span></div>`;

/*
 runOp({ eyebrow, title, wait, work({signal, phase}), okTitle(res), okText(res), okExtra(res), again, extras:[{label, primary, fn(res)}], errText(e) })
 Shows the "hold your phone to the tag" sheet, runs work(), shows success/failure. Resolves with the result or null.
*/
export function runOp(cfg) {
  beforeOp.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
  return new Promise((resolve) => {
    const el = $('#opSheet');
    let ctl = null, gone = false, result = null, running = false;
    const view = (st, ic, title, text, extra = '', btns = '') => {
      el.innerHTML = `<div class="grab"></div><div class="body"><div class="opbox" data-st="${st}">${RING(ic)}
        ${cfg.eyebrow ? `<p class="eyebrow">${esc(cfg.eyebrow)}</p>` : ''}<h2 class="${st === 'ok' ? 'g' : ''}">${esc(title)}</h2><p>${esc(text)}</p>${extra}
        <div class="btn-row">${btns}</div></div></div>`;
    };
    const finish = (res) => {
      if (gone) return; gone = true; cancelCurrent = null;
      opSheet.close(true);
      resolve(res);
    };
    cancelCurrent = () => { if (!gone) { try { ctl && ctl.abort(); } catch (e) { /* ignore */ } finish(null); } };
    const attempt = async () => {
      if (running) return; running = true;
      ctl = new AbortController();
      view('wait', cfg.icon || 'nfc', cfg.title, cfg.wait || 'Hold the back of your phone against the tag.', cfg.waitExtra || '', '<button class="btn" type="button" data-cancel>Cancel</button>');
      try {
        const res = await cfg.work({ signal: ctl.signal, phase: (t, x) => { if (!gone) view('work', cfg.icon || 'nfc', t, x, '', '<button class="btn" type="button" data-cancel>Cancel</button>'); } });
        if (gone) return;
        result = res; buzz([30, 50, 30]);
        const extras = (cfg.extras || []).map((x, i) => `<button class="btn ${x.primary ? 'primary' : ''}" type="button" data-x="${i}">${esc(x.label)}</button>`).join('');
        view('ok', 'check', cfg.okTitle ? cfg.okTitle(res) : 'Done', cfg.okText ? cfg.okText(res) : '', cfg.okExtra ? cfg.okExtra(res) : '',
          `${extras}${cfg.again ? `<button class="btn" type="button" data-again>${esc(cfg.again)}</button>` : ''}<button class="btn ${extras ? '' : 'primary'}" type="button" data-done>Done</button>`);
        const first = el.querySelector('[data-x],[data-done]'); if (first) first.focus({ preventScroll: true });
      } catch (e) {
        if (gone) return;
        if (isAbort(e)) { finish(null); return; }
        buzz(70);
        view('fail', 'x', 'That didn’t work', cfg.errText ? cfg.errText(e) : errText(e), '', '<button class="btn primary" type="button" data-retry>Try again</button><button class="btn" type="button" data-cancel>Close</button>');
      } finally { running = false; }
    };
    el.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-cancel')) { try { ctl && ctl.abort(); } catch (x) { /* ignore */ } finish(null); }
      else if (b.hasAttribute('data-done')) finish(result);
      else if (b.hasAttribute('data-retry') || b.hasAttribute('data-again')) attempt();
      else if (b.hasAttribute('data-x')) { const x = cfg.extras[+b.dataset.x]; finish(result); await sleep(reducedDelay()); if (x && x.fn) x.fn(result); }
    };
    opSheet.open(null);
    attempt();
  });
}
const reducedDelay = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 220 : 460);
export const afterSheet = () => sleep(reducedDelay());

/* "Save as preset" name prompt */
export function savePresetSheet(items, suggested) {
  return new Promise((resolve) => {
    const prev = sheet.onClose; let answered = false;
    const done = (v) => { if (answered) return; answered = true; sheet.onClose = prev; resolve(v); };
    showSheet(`<p class="eyebrow">Tags</p><h2>Save to your library</h2><p>Give it a name so you can find it later and write it to a new tag in two taps.</p>
      <label class="fld"><span>Name</span><input id="presetName" type="text" maxlength="60" autocomplete="off" value="${esc(suggested || labelFor(items))}" autofocus></label>
      <div class="btn-row"><button class="btn primary" type="button" data-save>Save</button><button class="btn" type="button" data-close>Cancel</button></div>`);
    sheet.onClose = () => done(null);
    const input = $('#presetName');
    const save = () => { const e = lib.add(input.value, items); done(e); sheet.close(true); toast('Saved to Tags'); buzz(10); };
    $('#sheet').querySelector('[data-save]').addEventListener('click', save);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    setTimeout(() => { try { input.focus(); input.select(); } catch (e) { /* ignore */ } }, 120);
  });
}

/* "This device can't do that" explanation, shared by Read / Write / Tools */
export function unsupportedReason() {
  if (!hasNFC()) {
    if (isIOS()) return { t: 'iPhone can’t do this part from a website', html: '<p><b>Apple doesn’t let websites read or write NFC tags.</b> But iPhones (XS and newer) already read tags on their own: hold the top of the phone against one. A link on a tag opens straight in Safari, no app needed.</p><p>To <b>write</b> tags you need an Android phone with Chrome. You can still build a card here, show its QR code, or save a contact file.</p>' };
    if (isAndroid()) return { t: 'Open this in Chrome', html: '<p>This browser can’t talk to NFC. <b>Chrome on Android</b> can. Open this page in Chrome, and make sure NFC is switched on in your phone’s settings.</p>' };
    return { t: 'Computers can’t scan tags from the web', html: '<p>Reading and writing tags needs an <b>Android phone with Chrome</b>. Open this page there. On this device you can still build a card, make a QR code and prepare tag contents.</p>' };
  }
  if (!isSecure()) return { t: 'This page needs https', html: '<p>NFC only works on secure pages. Open this page with <b>https://</b> in the address.</p>' };
  return null;
}
export function showUnsupported() {
  const r = unsupportedReason(); if (!r) return;
  showSheet(`<p class="eyebrow">NFC</p><h2>${esc(r.t)}</h2>${r.html}
    <ol class="steps"><li><b>Android + Chrome:</b> reading, writing and locking all work.</li><li><b>Everyone else:</b> build the card, show the QR, or share the link. Friends on any phone can open it.</li></ol>
    <div class="btn-row"><button class="btn primary" type="button" data-go="card">Build a card</button><button class="btn" type="button" data-close>Close</button></div>`);
  $('#sheet').querySelector('[data-go]').addEventListener('click', () => { sheet.close(true); goTab('card'); });
}
