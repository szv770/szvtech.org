// /nfc — tab router. #read #write #card #tags #tools
import { $, $$, store } from '/nfc/ui.js';

export const TABS = ['read', 'write', 'card', 'tags', 'tools'];
const subs = [];
export const onTab = (cb) => subs.push(cb);
export let current = 'read';

export function goTab(name, { scroll = true, replace = true } = {}) {
  if (!TABS.includes(name)) name = 'read';
  const changed = name !== current;
  current = name;
  document.body.dataset.tab = name;
  $$('.panel').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  $$('#tabbar button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  try { if (replace) history.replaceState(null, '', location.pathname + location.search + '#' + name); } catch (e) { /* ignore */ }
  store.set('tab', name);
  if (scroll && changed) window.scrollTo(0, 0);
  subs.forEach((cb) => { try { cb(name, changed); } catch (e) { console.error(e); } });
}
export function initRouter() {
  $$('#tabbar button').forEach((b) => b.addEventListener('click', () => goTab(b.dataset.tab)));
  const h = location.hash.replace('#', '');
  goTab(TABS.includes(h) ? h : 'read', { scroll: false });
  addEventListener('hashchange', () => { const x = location.hash.replace('#', ''); if (TABS.includes(x) && x !== current) goTab(x, { replace: false }); });
  // arrow keys move between tabs when the tab bar has focus
  $('#tabbar').addEventListener('keydown', (e) => {
    const i = TABS.indexOf(current);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { goTab(TABS[(i + 1) % 5]); $(`#tabbar [data-tab="${current}"]`).focus(); e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { goTab(TABS[(i + 4) % 5]); $(`#tabbar [data-tab="${current}"]`).focus(); e.preventDefault(); }
  });
}
