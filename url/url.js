// /url — your own short links. Owner-only (PIN). Talks to /api/links; visitors just follow /url/<code>.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const KEY = 'szv-url-pin';
const RESERVED = ['admin', 'api', 'index', 'index.html', 'url', 'urls', 'link', 'links', 'new', 'login', 'logout', 'sys', 'assets', 'static', 'robots.txt', 'favicon.ico', 'www', 'szvtech', 'null', 'undefined'];

let pin = '';
let links = [];
let expChoice = 'never';
const store = {
  get() { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } },
  set(v) { try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch { /* private mode */ } },
};

/* ---------- views ---------- */
const VIEWS = ['vLoading', 'vSetup', 'vGate', 'vApp'];
function show(id) {
  for (const v of VIEWS) $(v).hidden = v !== id;
  $('lockBtn').hidden = id !== 'vApp';
}
let toastT;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200);
}

/* ---------- api ---------- */
async function api(method, path, body) {
  const headers = {};
  let payload;
  if (method === 'POST') { headers['Content-Type'] = 'application/json'; payload = JSON.stringify({ ...body, pin }); }
  else headers['X-Szv-Pin'] = pin;
  let res;
  try { res = await fetch(path, { method, headers, body: payload, cache: 'no-store', credentials: 'same-origin' }); }
  catch { return { status: 0, data: { error: 'offline' } }; }
  let data = null;
  try { data = await res.json(); } catch { data = { error: 'unavailable' }; }
  return { status: res.status, data };
}

/* ---------- boot / gate ---------- */
async function boot() {
  show('vLoading');
  pin = store.get();
  const r = await api('GET', '/api/links');
  if (r.status === 200 && r.data.links) { links = r.data.links; return unlocked(); }
  if (r.status === 503 && r.data && r.data.configured === false) return show('vSetup');
  store.set(''); pin = '';
  show('vGate');
  if (r.status === 0) gateMsg('Cannot reach the server. Check your connection and try again.');
  else if (r.status === 429) gateMsg(r.data.message);
  else if (r.status >= 500) gateMsg('The database did not answer. Try again in a moment.');
  setTimeout(() => $('pin').focus({ preventScroll: true }), 50);
}
function gateMsg(t) { const m = $('gateMsg'); m.textContent = t || ''; m.hidden = !t; }

$('pinEye').addEventListener('click', () => {
  const p = $('pin'), on = p.type === 'password';
  p.type = on ? 'text' : 'password';
  $('pinEye').textContent = on ? 'Hide' : 'Show';
  $('pinEye').setAttribute('aria-pressed', String(on));
  $('pinEye').setAttribute('aria-label', on ? 'Hide PIN' : 'Show PIN');
});
$('gateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = $('pin').value;
  if (!v) { gateMsg('Type your PIN first.'); return; }
  pin = v; gateMsg(''); $('gateGo').disabled = true; $('gateGo').textContent = 'Checking…';
  const r = await api('GET', '/api/links');
  $('gateGo').disabled = false; $('gateGo').textContent = 'Unlock';
  if (r.status === 200) { store.set(pin); links = r.data.links || []; $('pin').value = ''; return unlocked(); }
  pin = '';
  if (r.status === 503 && r.data && r.data.configured === false) return show('vSetup');
  gateMsg(r.status === 0 ? 'Cannot reach the server. Check your connection.' : r.status >= 500 ? 'The database did not answer. Try again in a moment.' : r.data.message || 'That PIN is not right.');
  const g = $('vGate'); g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake');
  $('pin').select();
});
$('setupRetry').addEventListener('click', boot);
$('lockBtn').addEventListener('click', lock);
function lock() { store.set(''); pin = ''; links = []; $('result').hidden = true; $('listBody').innerHTML = ''; show('vGate'); gateMsg(''); toast('Locked'); }

/* ---------- unlocked ---------- */
function unlocked() {
  show('vApp');
  renderList();
  const q = new URLSearchParams(location.search).get('long');
  if (q && !$('longUrl').value) { $('longUrl').value = q.slice(0, 2100); }
  offlineBanner();
}
function offlineBanner() { $('offline').hidden = navigator.onLine !== false; }
addEventListener('online', () => { offlineBanner(); if (!$('vApp').hidden) loadList(); });
addEventListener('offline', offlineBanner);

/* paste */
if (navigator.clipboard && navigator.clipboard.readText) $('pasteBtn').hidden = false;
$('pasteBtn').addEventListener('click', async () => {
  try {
    const t = (await navigator.clipboard.readText()).trim();
    if (!t) return toast('Clipboard is empty');
    $('longUrl').value = t; urlMsg('');
  } catch { toast('Long-press the field and paste instead'); }
});
function urlMsg(t) { const m = $('urlMsg'); m.textContent = t || ''; m.hidden = !t; }
$('longUrl').addEventListener('input', () => urlMsg(''));

/* custom ending: live preview + availability */
$('codePre').textContent = location.host + '/url/';
function codeHint() {
  const v = $('code').value, h = $('codeHint');
  h.className = 'hint';
  if (!v) { h.textContent = 'Leave empty for a random short one.'; return true; }
  if (!/^[A-Za-z0-9_-]+$/.test(v)) { h.textContent = 'Use letters, numbers, - and _ only.'; h.classList.add('err'); return false; }
  if (v.length < 3) { h.textContent = 'At least 3 characters.'; h.classList.add('err'); return false; }
  if (RESERVED.includes(v.toLowerCase())) { h.textContent = 'That one is reserved. Try another.'; h.classList.add('err'); return false; }
  if (links.some((l) => l.code === v)) { h.textContent = 'Already taken (by one of your links).'; h.classList.add('err'); return false; }
  h.innerHTML = 'Looks free: <b class="mono">' + esc(location.host + '/url/' + v) + '</b>'; h.classList.add('ok');
  return true;
}
$('code').addEventListener('input', codeHint);

/* expiry chips */
$('expChips').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-exp]'); if (!b) return;
  expChoice = b.dataset.exp;
  for (const x of $('expChips').children) x.setAttribute('aria-checked', String(x === b));
  const d = $('expDate'); d.hidden = expChoice !== 'date';
  if (expChoice === 'date') {
    const t = new Date(Date.now() + 86400000);
    d.min = t.toISOString().slice(0, 10);
    if (!d.value) d.value = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    try { d.focus({ preventScroll: true }); } catch { /* ok */ }
  }
});

/* make */
function makeMsg(t) { const m = $('makeMsg'); m.textContent = t || ''; m.hidden = !t; }
$('makeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  makeMsg(''); urlMsg('');
  const url = $('longUrl').value.trim();
  if (!url) { urlMsg('Paste a link first.'); $('longUrl').focus(); return; }
  if (!codeHint()) { $('code').focus(); return; }
  let expires = expChoice;
  if (expChoice === 'date') { expires = $('expDate').value; if (!expires) return makeMsg('Pick an expiry date, or choose another option.'); }
  const body = { url, expires, note: $('note').value.trim() || undefined };
  if ($('code').value) body.code = $('code').value;
  const btn = $('makeBtn'); btn.disabled = true; $('makeLbl').textContent = 'Making…';
  const r = await api('POST', '/api/links', body);
  btn.disabled = false; $('makeLbl').textContent = 'Make link';
  if (r.status === 201) {
    showResult(r.data);
    $('longUrl').value = ''; $('code').value = ''; $('note').value = ''; codeHint();
    loadList();
    return;
  }
  if (r.status === 401 || r.status === 429) { store.set(''); pin = ''; show('vGate'); gateMsg(r.status === 429 ? r.data.message : 'Your PIN was not accepted. Unlock again.'); return; }
  if (r.status === 0) return makeMsg('You look offline. Try again when you are back.');
  if (r.data && r.data.error === 'bad_url') { urlMsg(r.data.message); $('longUrl').focus(); return; }
  if (r.status === 409 || (r.data && r.data.error === 'bad_code')) { const h = $('codeHint'); h.textContent = r.data.message; h.className = 'hint err'; $('code').focus(); return; }
  makeMsg((r.data && r.data.message) || 'Something went wrong. Try again.');
});

/* result */
let qrLib;
function shortFor(code) { return location.origin + '/url/' + code; }
function showResult(d) {
  const s = shortFor(d.code);
  $('shortTxt').innerHTML = '<span>' + esc(location.host + '/url/') + '</span><b>' + esc(d.code) + '</b>';
  $('shortSub').textContent = d.expires_at ? 'Works until ' + new Date(d.expires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + '.' : 'Works until you delete it.';
  $('rCopy').onclick = () => copy(s);
  $('rOpen').href = s;
  $('rQr').href = '/qr/?text=' + encodeURIComponent(s);
  $('rNfc').href = '/nfc/?url=' + encodeURIComponent(s);
  const sh = $('rShare');
  if (navigator.share) { sh.hidden = false; sh.onclick = () => navigator.share({ title: 'Link', url: s }).catch(() => {}); } else sh.hidden = true;
  $('result').hidden = false;
  miniQr(s);
  $('result').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
  copy(s, true);
}
async function miniQr(s) {
  const box = $('miniQr'); box.hidden = true;
  try {
    if (!qrLib) qrLib = new Promise((res, rej) => {
      if (window.qrcode) return res(window.qrcode);
      const el = document.createElement('script');
      el.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
      el.onload = () => res(window.qrcode); el.onerror = rej; document.head.appendChild(el);
    });
    const q = (await qrLib)(0, 'M'); q.addData(s); q.make();
    box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    const svg = box.querySelector('svg'); if (svg) { svg.removeAttribute('width'); svg.removeAttribute('height'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'QR code for the short link'); }
    box.hidden = false;
  } catch { qrLib = null; /* the QR button still works */ }
}
async function copy(text, quiet) {
  try { await navigator.clipboard.writeText(text); toast(quiet ? 'Made it. Copied!' : 'Copied'); return; } catch { /* fall through */ }
  try {
    const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0;font-size:16px';
    document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove();
    if (ok) { toast(quiet ? 'Made it. Copied!' : 'Copied'); return; }
  } catch { /* nothing */ }
  if (!quiet) toast('Press and hold the link to copy');
}

/* list */
async function loadList() {
  const r = await api('GET', '/api/links');
  if (r.status === 200) { links = r.data.links || []; renderList(); codeHint(); return; }
  if (r.status === 401 || r.status === 429) { store.set(''); pin = ''; show('vGate'); gateMsg(r.data.message || ''); return; }
  renderList(r.status === 0 ? 'offline' : 'error');
}
$('refresh').addEventListener('click', async () => { $('listBody').innerHTML = '<div class="sk sk2"></div><div class="sk sk3"></div>'; await loadList(); toast('Updated'); });
const ago = (iso) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  if (s < 86400 * 30) return Math.floor(s / 86400) + ' d ago';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
const inDays = (iso) => {
  const s = (Date.parse(iso) - Date.now()) / 1000;
  if (s < 3600) return 'in under an hour';
  if (s < 86400) return 'in ' + Math.floor(s / 3600) + ' h';
  return 'in ' + Math.floor(s / 86400) + ' d';
};
function renderList(problem) {
  const b = $('listBody');
  if (problem) {
    b.innerHTML = '<div class="errbox"><b>' + (problem === 'offline' ? 'You are offline.' : 'Could not load your links.') + '</b><br>Your links are safe. Try again in a moment.<br><button class="btn" type="button" id="retryList">Try again</button></div>';
    $('retryList').onclick = loadList; return;
  }
  if (!links.length) { b.innerHTML = '<div class="empty"><b>Nothing here yet</b>Your first short link is one paste away.</div>'; return; }
  b.innerHTML = links.map((l) => {
    const meta = ['made ' + ago(l.created_at)];
    if (l.expired) meta.push('expired'); else if (l.expires_at) meta.push('expires ' + inDays(l.expires_at));
    if (l.last_hit) meta.push('last opened ' + ago(l.last_hit));
    return '<article class="lrow' + (l.expired ? ' gone' : '') + '" data-code="' + esc(l.code) + '">' +
      '<div class="lhead"><div class="lcode"><span>' + esc(location.host + '/url/') + '</span>' + esc(l.code) + '</div><span class="hits">' + l.hits + (l.hits === 1 ? ' visit' : ' visits') + '</span></div>' +
      '<div class="ldest" title="' + esc(l.url) + '">' + esc(l.url.replace(/^https?:\/\//, '')) + '</div>' +
      (l.note ? '<p class="lnote">' + esc(l.note) + '</p>' : '') +
      '<p class="lmeta">' + esc(meta.join(' · ')) + '</p>' +
      '<div class="lacts"><button class="btn" type="button" data-a="copy">Copy</button><a class="btn" href="/qr/?text=' + encodeURIComponent(shortFor(l.code)) + '">QR</a><button class="btn danger" type="button" data-a="del">Delete</button></div></article>';
  }).join('');
}
let armed = null, armT;
$('listBody').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-a]'); if (!btn) return;
  const row = btn.closest('.lrow'), code = row.dataset.code;
  if (btn.dataset.a === 'copy') return copy(shortFor(code));
  if (armed !== btn) { // first tap arms, second tap deletes
    resetArmed(); armed = btn; btn.textContent = 'Really delete?';
    armT = setTimeout(resetArmed, 4000); return;
  }
  clearTimeout(armT); armed = null; btn.disabled = true; btn.textContent = 'Deleting…';
  const r = await api('DELETE', '/api/links?code=' + encodeURIComponent(code));
  if (r.status === 200 || r.status === 404) { links = links.filter((l) => l.code !== code); renderList(); codeHint(); toast('Deleted'); }
  else { btn.disabled = false; btn.textContent = 'Delete'; toast(r.status === 0 ? 'You are offline' : 'Could not delete. Try again.'); }
});
function resetArmed() { clearTimeout(armT); if (armed) { armed.textContent = 'Delete'; armed = null; } }

boot();
