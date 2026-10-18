/* ==========================================================================
   SZVTECH — shared page chrome: "Share" + "More tools"

   One <script type="module" src="/assets/chrome.js"></script> gives a page:
     1. A share sheet. Any element with [data-szv-share] opens it (native phone
        share sheet when there is one, otherwise a bottom sheet: copy link,
        WhatsApp, Telegram, SMS, email, QR).
     2. A "More tools" footer injected at the end of <main> (or into an element
        marked [data-szv-more]): related tools first, then the rest, plus a
        small "share this" row. Skipped when <html data-szv-more="off"> (full
        screen pages) or when the page is not a tool.

   Pages may set <html data-szv-title="Name"> to override the shared title.
   Everything is feature-detected; nothing leaves the browser.
   ========================================================================== */
import { TOOLS, icon } from '/assets/tools.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ORIGIN = location.origin;
const path = location.pathname.replace(/index\.html$/, '');
const here = TOOLS.find((t) => path === t.path || path.startsWith(t.path));

/* ---------- css (once) ---------- */
if (!document.querySelector('link[data-szv-chrome]')) {
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = '/assets/chrome.css'; l.dataset.szvChrome = '';
  document.head.appendChild(l);
}

/* ---------- share ---------- */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canNative = () => typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches;
const shareData = (whole) => {
  const name = document.documentElement.dataset.szvTitle || (here && here.name);
  if (whole || !here) return { title: 'SZVTECH', text: 'Little tools made exactly right. Found this one, thought of you.', url: ORIGIN + '/' };
  return { title: `${name} · SZVTECH`, text: `${name} on SZVTECH: ${here.blurb}`, url: ORIGIN + here.path };
};

let sheet, back, lastFocus;
function build() {
  back = document.createElement('div');
  back.className = 'szv-back'; back.hidden = true;
  sheet = document.createElement('section');
  sheet.className = 'szv-sheet'; sheet.hidden = true;
  sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'Share');
  document.body.append(back, sheet);
  back.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) close(); });
}
function close() {
  if (!sheet || sheet.hidden) return;
  sheet.classList.remove('on'); back.classList.remove('on');
  setTimeout(() => { sheet.hidden = true; back.hidden = true; }, reduced ? 120 : 380);
  if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
}
const wa = (d) => `https://wa.me/?text=${encodeURIComponent(d.text + ' ' + d.url)}`;
const tg = (d) => `https://t.me/share/url?url=${encodeURIComponent(d.url)}&text=${encodeURIComponent(d.text)}`;
const sms = (d) => `sms:?&body=${encodeURIComponent(d.text + ' ' + d.url)}`;
const mail = (d) => `mailto:?subject=${encodeURIComponent(d.title)}&body=${encodeURIComponent(d.text + '\n\n' + d.url)}`;

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
  try {
    const t = document.createElement('textarea');
    t.value = text; t.style.cssText = 'position:fixed;opacity:0;font-size:16px'; document.body.appendChild(t);
    t.select(); const ok = document.execCommand('copy'); t.remove(); return ok;
  } catch (e) { return false; }
}

export function openShare({ whole = false, native = true } = {}) {
  const d = shareData(whole);
  if (native && canNative()) {
    navigator.share(d).catch((e) => { if (e && e.name !== 'AbortError') openShare({ whole, native: false }); });
    return;
  }
  if (!sheet) build();
  lastFocus = document.activeElement;
  const both = here && !whole;
  sheet.innerHTML = `
    <div class="szv-grab" aria-hidden="true"></div>
    <p class="szv-eyebrow">Share</p>
    <h2 class="szv-h">${esc(both ? here.name : 'SZVTECH')}</h2>
    <p class="szv-sub">${esc(both ? here.blurb : 'Little tools, made exactly right.')}</p>
    <button class="szv-link" type="button" data-copy><span>${esc(d.url.replace(/^https?:\/\//, ''))}</span><b>Copy</b></button>
    <div class="szv-apps">
      <a href="${wa(d)}" target="_blank" rel="noopener"><i>WA</i>WhatsApp</a>
      <a href="${tg(d)}" target="_blank" rel="noopener"><i>TG</i>Telegram</a>
      <a href="${sms(d)}"><i>SMS</i>Message</a>
      <a href="${mail(d)}"><i>@</i>Email</a>
      <a href="/qr/?text=${encodeURIComponent(d.url)}"><i>QR</i>QR code</a>
    </div>
    ${both ? '<button class="szv-alt" type="button" data-whole>Share the whole site instead</button>' : ''}`;
  const cp = sheet.querySelector('[data-copy]');
  cp.addEventListener('click', async () => {
    const ok = await copy(d.url);
    cp.classList.toggle('done', ok); cp.querySelector('b').textContent = ok ? 'Copied' : 'Select & copy';
    setTimeout(() => { cp.classList.remove('done'); cp.querySelector('b').textContent = 'Copy'; }, 1800);
  });
  const w = sheet.querySelector('[data-whole]');
  if (w) w.addEventListener('click', () => { close(); setTimeout(() => openShare({ whole: true, native: false }), 200); });
  back.hidden = false; sheet.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => { back.classList.add('on'); sheet.classList.add('on'); cp.focus({ preventScroll: true }); }));
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-szv-share]');
  if (b) { e.preventDefault(); openShare({ whole: b.dataset.szvShare === 'site' }); }
});

/* ---------- more tools ---------- */
function mountMore() {
  if (document.documentElement.dataset.szvMore === 'off' || !here) return;
  const host = document.querySelector('[data-szv-more]') || document.querySelector('main') || document.body;
  const live = TOOLS.filter((t) => t.live && t.id !== here.id);
  const rel = (here.related || []).map((id) => live.find((t) => t.id === id)).filter(Boolean);
  const rest = live.filter((t) => !rel.includes(t));
  const list = [...rel, ...rest].slice(0, 8);
  if (!list.length) return;
  const el = document.createElement('aside');
  el.className = 'szv-more'; el.setAttribute('aria-label', 'More tools');
  el.innerHTML = `
    <div class="szv-more__head"><span>More tools</span><a href="/#tools">All tools</a></div>
    <div class="szv-more__row">${list.map((t, i) => `
      <a class="szv-tool${i < rel.length ? ' rel' : ''}" href="${esc(t.path)}">
        <span class="szv-tool__i">${icon(t)}</span>
        <span class="szv-tool__n">${esc(t.name)}</span>
        <span class="szv-tool__b">${esc(t.blurb)}</span>
      </a>`).join('')}</div>
    <button class="szv-enjoy" type="button" data-szv-share><span><b>Enjoying ${esc(here.name)}?</b> Send it to a friend.</span><i aria-hidden="true">${SHARE_ICON}</i></button>`;
  host.appendChild(el);
}
export const SHARE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8M5 12.5v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>';
/* header share buttons: <button class="szv-sharebtn" data-szv-share aria-label="Share"></button> gets the icon */
document.querySelectorAll('.szv-sharebtn:empty').forEach((b) => { b.innerHTML = SHARE_ICON; });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountMore); else mountMore();
