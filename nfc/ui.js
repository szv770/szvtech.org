// /nfc — small UI helpers shared by the tabs: escaping, storage, toast, sheets, haptics.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const icon = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

/* ---------- storage (always try/catch) ---------- */
export const store = {
  get(k, d) { try { const v = localStorage.getItem('szv-nfc-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('szv-nfc-' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
};

/* ---------- haptics (skipped under reduced motion) ---------- */
export function buzz(p = 12) { try { if (!reduced() && navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } }

/* ---------- toast ---------- */
let toastT;
export function toast(msg, ms = 2200) {
  const el = $('#toast'); if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), ms);
}

/* ---------- clipboard / files ---------- */
export async function copy(text, okMsg = 'Copied') {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
    try {
      const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0;font-size:16px';
      document.body.appendChild(t); t.select(); ok = document.execCommand('copy'); t.remove();
    } catch (e2) { /* ignore */ }
  }
  toast(ok ? okMsg : 'Couldn’t copy — select the text and copy it');
  if (ok) buzz(8);
  return ok;
}
export function download(name, mime, data) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export const slug = (s, d = 'file') => String(s || d).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || d;

/* ---------- bottom sheets ---------- */
// One element pair per sheet. open(html) fills + shows, close() hides and returns focus.
export function makeSheet(el, back, { onClose } = {}) {
  let last = null; let hideT;
  const api = {
    get isOpen() { return !el.hidden; },
    open(html) {
      clearTimeout(hideT);
      if (html != null) el.innerHTML = html;
      last = document.activeElement;
      el.hidden = false; back.hidden = false;
      document.body.classList.add('noscroll');
      requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('on'); back.classList.add('on'); }));
      const f = el.querySelector('[autofocus]'); if (f) setTimeout(() => f.focus({ preventScroll: true }), 60);
      return el;
    },
    close(silent) {
      if (el.hidden) return;
      el.classList.remove('on'); back.classList.remove('on');
      hideT = setTimeout(() => { el.hidden = true; back.hidden = true; if (!document.querySelector('.sheet:not([hidden])')) document.body.classList.remove('noscroll'); }, reduced() ? 160 : 400);
      if (last && last.focus && last.isConnected) last.focus({ preventScroll: true });
      if (!silent && onClose) onClose();
    },
  };
  back.addEventListener('click', () => api.close());
  el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) api.close(); });
  return api;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const fmtBytes = (n) => (n === 1 ? '1 byte' : n + ' bytes');
export function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
