// /nfc — Write tab: pick what the tag should do, watch the size, tap to write.
import { $, esc, icon, store, toast, buzz, uid, reduced } from '/nfc/ui.js?v=8974ba5dc3';
import { hasNFC, canLock, writeRecords, lockTag, errText } from '/nfc/nfcio.js?v=fffda67052';
import { SOCIALS, draftRecords, draftSize, CAPACITIES, fits, tlvOverhead } from '/nfc/ndef.js?v=da5a737810';
import { cardToVcard } from '/nfc/card.js?v=e246964108';
import { recent, labelFor } from '/nfc/data.js?v=586e1a8229';
import { goTab, onTab } from '/nfc/router.js?v=f3a68c5008';
import { runOp, confirmSheet, savePresetSheet, showUnsupported } from '/nfc/ops.js?v=0d6918b052';

const TYPE_UI = [
  ['url', 'Link', 'link', 'Opens a web page when tapped'],
  ['text', 'Text', 'text', 'Shows a short note'],
  ['contact', 'Contact', 'user', 'Adds a person to the phone’s contacts'],
  ['phone', 'Call', 'phone', 'Starts a phone call'],
  ['sms', 'Message', 'sms', 'Opens a text message, ready to send'],
  ['email', 'Email', 'mail', 'Opens a new email'],
  ['wifi', 'Wi-Fi', 'wifi', 'Joins a Wi-Fi network (Android)'],
  ['geo', 'Location', 'pin', 'Opens a spot on the map'],
  ['whatsapp', 'WhatsApp', 'chat', 'Opens a WhatsApp chat'],
  ['social', 'Social', 'at', 'Opens a profile'],
  ['app', 'Android app', 'app', 'Launches an app (Android)'],
  ['mime', 'Custom data', 'data', 'Raw data with your own type'],
  ['empty', 'Empty', 'eraser', 'Blank record (to wipe a tag)'],
];
const TYPE_BY = Object.fromEntries(TYPE_UI.map((t) => [t[0], t]));

const F = (k, label, o = {}) => ({ k, label, ...o });
const FORMS = {
  url: [F('url', 'Link', { ph: 'szvtech.org', type: 'url', im: 'url', ac: 'url', hint: 'https:// is added for you' })],
  text: [F('text', 'Text', { area: true, ph: 'Whatever you want to say…' }), F('lang', 'Language code', { ph: 'en', hint: 'Usually “en”' })],
  contact: [F('first', 'First name', { ac: 'given-name', half: true }), F('last', 'Last name', { ac: 'family-name', half: true }), F('org', 'Company', { ac: 'organization' }), F('title', 'Job title'), F('tel', 'Phone', { type: 'tel', im: 'tel', ac: 'tel', half: true }), F('email', 'Email', { type: 'email', im: 'email', ac: 'email', half: true }), F('url', 'Website', { type: 'url', im: 'url' })],
  phone: [F('num', 'Phone number', { type: 'tel', im: 'tel', ac: 'tel', ph: '+1 555 010 0000' })],
  sms: [F('num', 'Phone number', { type: 'tel', im: 'tel', ph: '+1 555 010 0000' }), F('msg', 'Message', { area: true, ph: 'Optional' })],
  email: [F('to', 'To', { type: 'email', im: 'email', ac: 'email' }), F('subject', 'Subject'), F('body', 'Message', { area: true })],
  wifi: [F('ssid', 'Network name', { ac: 'off' }), F('pass', 'Password', { pw: true }), F('sec', 'Security', { choice: [['WPA', 'WPA / WPA2'], ['WEP', 'WEP'], ['nopass', 'Open']] })],
  geo: [F('lat', 'Latitude', { im: 'decimal', ph: '40.7128', half: true }), F('lon', 'Longitude', { im: 'decimal', ph: '-74.0060', half: true })],
  whatsapp: [F('num', 'Phone number with country code', { type: 'tel', im: 'tel', ph: '+1 555 010 0000' }), F('msg', 'First message', { area: true, ph: 'Optional' })],
  social: [F('kind', 'Where', { select: SOCIALS.map((s) => [s.id, s.name]) }), F('handle', 'Username or link', { ph: '@yourname', ac: 'off' })],
  app: [F('pkg', 'Package name', { ph: 'com.whatsapp', ac: 'off', hint: 'Android opens the app, or its Play Store page if it’s missing' })],
  mime: [F('mime', 'Data type', { ph: 'text/plain', ac: 'off' }), F('data', 'Data', { area: true })],
  empty: [],
};
const QUICK_APPS = [['WhatsApp', 'com.whatsapp'], ['Maps', 'com.google.android.apps.maps'], ['YouTube', 'com.google.android.youtube'], ['Spotify', 'com.spotify.music'], ['Camera', 'com.android.camera']];

function freshFields(type) {
  if (type === 'wifi') return { sec: 'WPA' };
  if (type === 'text') return { lang: 'en' };
  if (type === 'social') return { kind: 'instagram' };
  if (type === 'mime') return { mime: 'text/plain' };
  return {};
}
const newItem = (type = 'url', fields) => ({ id: uid(), type, fields: fields || freshFields(type) });

let draft = { items: [newItem('url')], sel: 0 };
let opts = { over: true, lock: false };

function loadDraft() {
  const d = store.get('draft', null);
  if (d && Array.isArray(d.items) && d.items.length) {
    draft = { items: d.items.slice(0, 8), sel: Math.min(d.sel | 0, d.items.length - 1) };
    draft.items.forEach((it) => { if (!it.id) it.id = uid(); });
  }
  opts = { ...opts, ...store.get('wopts', {}) };
}
let saveT;
function persist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    // never keep Wi-Fi passwords in the auto-saved draft
    const items = draft.items.map((it) => (it.type === 'wifi' ? { ...it, fields: { ...it.fields, pass: '' }, stash: undefined } : { ...it, stash: undefined }));
    store.set('draft', { items, sel: draft.sel }); store.set('wopts', opts);
  }, 250);
}

const cur = () => draft.items[draft.sel];

/* ---------- rendering ---------- */
function renderTypes() {
  const it = cur();
  $('#wTypes').innerHTML = TYPE_UI.map(([id, name, ic]) => `<button class="tchip" type="button" role="tab" data-t="${id}" aria-selected="${it.type === id}">${icon(ic)}${esc(name)}</button>`).join('');
  centerChip();
}

function centerChip() {
  const box = $('#wTypes'); const sel = box.querySelector('[aria-selected="true"]');
  if (sel && box.scrollWidth > box.clientWidth) box.scrollLeft = sel.offsetLeft - box.clientWidth / 2 + sel.offsetWidth / 2;
}
function fieldHtml(f, v) {
  const val = esc(v == null ? '' : v);
  const hint = f.hint ? `<small class="hint">${esc(f.hint)}</small>` : '';
  if (f.select) return `<label class="fld"><span>${esc(f.label)}</span><select data-k="${f.k}">${f.select.map(([id, n]) => `<option value="${esc(id)}"${v === id ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
  if (f.choice) return `<div class="fld"><span>${esc(f.label)}</span><div class="seg" role="group" aria-label="${esc(f.label)}">${f.choice.map(([id, n]) => `<button type="button" data-k="${f.k}" data-v="${esc(id)}" aria-pressed="${(v || f.choice[0][0]) === id}">${esc(n)}</button>`).join('')}</div></div>`;
  if (f.area) return `<label class="fld"><span>${esc(f.label)}</span><textarea data-k="${f.k}" rows="3" placeholder="${esc(f.ph || '')}" autocomplete="off">${val}</textarea>${hint}</label>`;
  if (f.pw) return `<label class="fld"><span>${esc(f.label)}</span><div class="pwd"><input data-k="${f.k}" type="password" value="${val}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(f.ph || '')}"><button class="ib" type="button" data-show aria-label="Show password">SHOW</button></div></label>`;
  return `<label class="fld"><span>${esc(f.label)}</span><input data-k="${f.k}" type="${f.type || 'text'}" inputmode="${f.im || 'text'}" autocomplete="${f.ac || 'off'}" autocapitalize="${f.type ? 'off' : 'sentences'}" spellcheck="false" placeholder="${esc(f.ph || '')}" value="${val}">${hint}</label>`;
}

function renderForm() {
  const it = cur();
  const el = $('#wForm');
  if (it.type === 'raw') {
    el.innerHTML = `<div class="form-h"><span class="row-i">${icon('clone')}</span><div><b>Copied from a tag</b><span>${esc(labelFor([it]))}</span></div></div><p class="hint" style="margin:0">This was copied exactly as it was on the original tag. Remove it to start fresh.</p>
      <div class="btn-row" style="margin-top:12px"><button class="btn small" type="button" data-rmraw>${icon('trash')}Remove</button></div>`;
    return;
  }
  const info = TYPE_BY[it.type] || TYPE_BY.url;
  const spec = FORMS[it.type] || [];
  let html = `<div class="form-h"><span class="row-i">${icon(info[2])}</span><div><b>${esc(info[1])}</b><span>${esc(info[3])}</span></div></div>`;
  let i = 0;
  while (i < spec.length) {
    const f = spec[i];
    if (f.half && spec[i + 1] && spec[i + 1].half) { html += `<div class="f2">${fieldHtml(f, it.fields[f.k])}${fieldHtml(spec[i + 1], it.fields[spec[i + 1].k])}</div>`; i += 2; }
    else { html += fieldHtml(f, it.fields[f.k]); i++; }
  }
  if (it.type === 'geo') html += `<div class="quick"><button class="act" type="button" data-here>${icon('pin')}Use my location</button></div>`;
  if (it.type === 'app') html += `<div class="quick">${QUICK_APPS.map(([n, p]) => `<button class="act" type="button" data-pkg="${esc(p)}">${esc(n)}</button>`).join('')}</div>`;
  if (it.type === 'wifi') html += `<p class="hint" style="margin:-2px 0 0">Android phones offer to join the network when they touch the tag. iPhones can’t join Wi-Fi from a tag. Use a QR code for them.</p>`;
  if (it.type === 'empty') html += `<p class="hint" style="margin:0">Writes a blank record. Use this to wipe a tag, or find a more thorough Erase in Tools.</p>`;
  if (it.type === 'contact') html += `<p class="hint" style="margin:-2px 0 0">Android shows “Add contact”. iPhones ignore contact data on tags. For friends on iPhone, use a Card.</p>`;
  el.innerHTML = html;
}

function renderList() {
  const items = draft.items;
  $('#wCount').textContent = items.length > 1 ? `(${items.length} records)` : '';
  $('#wAdd').hidden = items.length >= 6;
  $('#wList').innerHTML = items.length > 1 ? items.map((it, i) => {
    const info = TYPE_BY[it.type] || ['raw', 'Copied', 'clone'];
    return `<div class="row btn-like" role="button" tabindex="0" data-i="${i}" style="${i === draft.sel ? 'border-color:color-mix(in srgb,var(--a1) 60%,transparent);background:color-mix(in srgb,var(--a1) 14%,transparent)' : ''}"><span class="row-i">${icon(info[2])}</span><span class="row-t"><b>${esc(info[1])}</b><span>${esc(labelFor([it]) || 'Not filled in yet')}</span></span><span class="row-a"><button class="ib bad" type="button" data-rm="${i}" aria-label="Remove record ${i + 1}">${icon('x')}</button></span></div>`;
  }).join('') : '';
}

function status() {
  let err = null, recs = [];
  try { recs = draftRecords(draft.items); } catch (e) { err = e.message; }
  const sz = draftSize(draft.items);
  return { err, recs, bytes: sz.bytes, ready: !err && recs.length > 0 };
}

function renderMeter() {
  const st = status();
  const total = st.bytes ? st.bytes + tlvOverhead(st.bytes) : 0;
  const max = 888;
  const pct = Math.min(100, (total / max) * 100);
  const fitting = CAPACITIES.find((c) => fits(st.bytes, c.bytes));
  let msg;
  if (!st.bytes) msg = 'Add something to see how much room it needs';
  else if (!fitting) msg = 'Too big for common tags. Trim it down';
  else if (fitting.id === 'ul') msg = 'Fits every tag, even the smallest';
  else msg = `Fits ${fitting.name} and bigger`;
  $('#wMeter').innerHTML = `<div class="meter-h"><b>${st.bytes}<small>bytes</small></b><span>${esc(msg)}</span></div>
    <div class="bar${st.bytes && !fitting ? ' over' : ''}" aria-hidden="true"><i style="width:${pct}%"></i>${CAPACITIES.map((c) => `<s style="left:${(c.bytes / max) * 100}%"></s>`).join('')}</div>
    <div class="caps">${CAPACITIES.map((c) => { const ok = st.bytes && fits(st.bytes, c.bytes); const no = st.bytes && !ok; return `<div class="cap ${ok ? 'yes' : no ? 'no' : ''}">${icon(ok ? 'check' : no ? 'x' : 'nfc')}<span>${esc(c.name)}<small>${c.bytes} B</small></span></div>`; }).join('')}</div>`;
  $('#dockSize').textContent = st.bytes ? st.bytes + (st.bytes === 1 ? ' byte' : ' bytes') : 'Nothing yet';
  const note = $('#dockNote');
  note.className = '';
  if (st.err) { note.textContent = st.err; }
  else if (!st.ready) { note.textContent = 'Fill in the form to continue'; }
  else if (!fitting) { note.textContent = 'Too big for common tags'; note.className = 'bad'; }
  else note.textContent = 'Smallest tag: ' + fitting.name;
  $('#wGo').classList.toggle('off', !st.ready);
  $('#wGo').textContent = hasNFC() ? 'Write to tag' : 'How to write';
  const alt = $('#wAlt');
  const first = st.recs[0];
  const qrText = first && (first.recordType === 'url' ? String(first.data) : first.recordType === 'text' ? String(first.data) : '');
  alt.innerHTML = st.ready ? `${qrText ? `<a class="act" href="/qr/?text=${encodeURIComponent(qrText)}">${icon('qr')}Make a QR instead</a>` : ''}<button class="act" type="button" data-savepreset>${icon('star')}Save to library</button>` : '';
}

function renderAll() { renderTypes(); renderForm(); renderList(); renderMeter(); $('#optOver').checked = opts.over; $('#optLock').checked = opts.lock; }

/* ---------- editing ---------- */
function setType(t) {
  const it = cur();
  if (it.type === t) return;
  it.stash = it.stash || {};
  it.stash[it.type] = it.fields;
  it.type = t; it.fields = it.stash[t] || freshFields(t);
  renderTypes(); renderForm(); renderList(); renderMeter(); persist();
}
function syncContact(it) {
  const f = it.fields;
  const name = [f.first, f.last].filter((x) => String(x || '').trim()).join(' ');
  if (!(name || f.org || f.tel || f.email)) { f.vcf = ''; return; }
  f.vcf = cardToVcard({ name, org: f.org, title: f.title, phones: [f.tel], emails: [f.email], web: f.url });
}
function onField(e) {
  const t = e.target; const k = t.dataset && t.dataset.k; if (!k) return;
  const it = cur(); if (it.type === 'raw') return;
  it.fields[k] = t.value;
  if (it.type === 'contact') syncContact(it);
  renderList(); renderMeter(); persist();
}

export function loadIntoWrite(items, { go = false, append = false } = {}) {
  const list = items.map((x) => ({ ...JSON.parse(JSON.stringify(x)), id: uid() }));
  if (append) { draft.items = [...draft.items, ...list].slice(0, 8); draft.sel = draft.items.length - 1; }
  else { draft = { items: list.length ? list : [newItem('url')], sel: 0 }; }
  renderAll(); persist();
  if (go) goTab('write');
}

/* ---------- writing ---------- */
export async function writeNow(items, { overwrite = true, lock = false, label = 'Write' } = {}) {
  if (!hasNFC()) { showUnsupported(); return null; }
  let recs;
  try { recs = draftRecords(items); } catch (e) { toast(e.message); return null; }
  const bytes = draftSize(items).bytes;
  const summary = labelFor(items);
  const res = await runOp({
    eyebrow: label === 'Clone' ? 'Clone' : 'Write',
    icon: 'write',
    title: label === 'Clone' ? 'Tap the new tag' : 'Tap your tag',
    wait: 'Hold the back of your phone against the tag, and keep it there until it says done.',
    waitExtra: `<p class="res-line">${esc(summary)} · ${bytes} bytes${lock ? ' · will be locked' : ''}</p>`,
    again: 'Write another tag',
    errText: (e) => (!overwrite && e && e.name === 'NotAllowedError' ? 'This tag already has something on it. Turn on “Replace what’s on the tag” to write over it. (A locked tag also refuses.)' : errText(e)),
    work: async ({ signal, phase }) => {
      await writeRecords(recs, { overwrite, signal });
      if (lock) { phase('Locking…', 'Keep holding. Making it read-only now.'); await lockTag({ signal }); }
      return { bytes, locked: lock };
    },
    okTitle: (r) => (r.locked ? 'Written and locked' : 'Written'),
    okText: (r) => `${summary} is on the tag (${r.bytes} bytes).${r.locked ? ' It’s now read-only for good.' : ''}`,
    okExtra: () => '',
    extras: [{ label: 'Save to library', fn: () => savePresetSheet(items, summary) }],
  });
  if (res) { recent.add(items, bytes); renderRecentHook(); }
  return res;
}
let renderRecentHook = () => {};
export const onRecentChange = (fn) => { renderRecentHook = fn; };

async function go() {
  const st = status();
  if (!hasNFC()) { showUnsupported(); return; }
  if (!st.ready) { toast(st.err || 'Fill in the form first'); return; }
  if (opts.lock) {
    if (!canLock()) { toast('This browser can’t lock tags. Turn off “read-only”.'); return; }
    const ok = await confirmSheet({ title: 'Make it permanent?', danger: true, ok: 'Write and lock', html: '<p>After this, the tag becomes <b>read-only forever</b>. You can’t change or erase it again. That’s the point, but there’s no undo.</p><p>Not sure? Write it normally first, test it on a phone, and lock it later from Tools.</p>' });
    if (!ok) return;
    await new Promise((r) => setTimeout(r, reduced() ? 220 : 460));
  }
  await writeNow(draft.items, { overwrite: opts.over, lock: opts.lock });
}

/* ---------- init ---------- */
export function initWrite() {
  loadDraft();
  const q = new URLSearchParams(location.search);
  let prefilled = false;
  if (q.has('url') && q.get('url').trim()) { draft = { items: [newItem('url', { url: q.get('url').trim().slice(0, 1000) })], sel: 0 }; prefilled = true; }
  else if (q.has('text') && q.get('text').trim()) { draft = { items: [newItem('text', { text: q.get('text').slice(0, 1000), lang: 'en' })], sel: 0 }; prefilled = true; }
  renderAll();
  if (prefilled) { persist(); goTab('write', { scroll: false }); }

  $('#wTypes').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) { setType(b.dataset.t); buzz(6); } });
  const form = $('#wForm');
  form.addEventListener('input', onField);
  form.addEventListener('click', (e) => {
    const it = cur();
    const seg = e.target.closest('.seg [data-k]');
    if (seg) { it.fields[seg.dataset.k] = seg.dataset.v; seg.parentNode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === seg))); renderMeter(); persist(); return; }
    if (e.target.closest('[data-show]')) { const i = form.querySelector('input[data-k="pass"]'); const b = e.target.closest('[data-show]'); i.type = i.type === 'password' ? 'text' : 'password'; b.textContent = i.type === 'password' ? 'SHOW' : 'HIDE'; return; }
    const pk = e.target.closest('[data-pkg]'); if (pk) { it.fields.pkg = pk.dataset.pkg; form.querySelector('input[data-k="pkg"]').value = pk.dataset.pkg; renderList(); renderMeter(); persist(); return; }
    if (e.target.closest('[data-rmraw]')) { draft.items.splice(draft.sel, 1); if (!draft.items.length) draft.items = [newItem('url')]; draft.sel = Math.max(0, Math.min(draft.sel, draft.items.length - 1)); renderAll(); persist(); return; }
    if (e.target.closest('[data-here]')) {
      if (!navigator.geolocation) { toast('Location isn’t available here'); return; }
      toast('Finding you…');
      navigator.geolocation.getCurrentPosition((p) => { it.fields.lat = p.coords.latitude.toFixed(6); it.fields.lon = p.coords.longitude.toFixed(6); renderForm(); renderMeter(); persist(); }, () => toast('Couldn’t get your location'), { enableHighAccuracy: true, timeout: 12000 });
    }
  });
  $('#wList').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { const i = +rm.dataset.rm; draft.items.splice(i, 1); if (!draft.items.length) draft.items = [newItem('url')]; draft.sel = Math.max(0, Math.min(draft.sel > i ? draft.sel - 1 : draft.sel, draft.items.length - 1)); renderAll(); persist(); return; }
    const row = e.target.closest('[data-i]'); if (row) { draft.sel = +row.dataset.i; renderTypes(); renderForm(); renderList(); persist(); }
  });
  $('#wList').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const row = e.target.closest('[data-i]'); if (row && e.target === row) { e.preventDefault(); row.click(); } } });
  $('#wAdd').addEventListener('click', () => { draft.items.push(newItem('url')); draft.sel = draft.items.length - 1; renderAll(); persist(); $('#wForm').scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); });
  $('#optOver').addEventListener('change', (e) => { opts.over = e.target.checked; persist(); });
  $('#optLock').addEventListener('change', (e) => {
    opts.lock = e.target.checked; persist();
    if (opts.lock && !canLock()) toast(hasNFC() ? 'Note: this browser can’t lock tags' : 'Locking needs Chrome on Android');
  });
  $('#wGo').addEventListener('click', go);
  $('#wAlt').addEventListener('click', async (e) => { if (e.target.closest('[data-savepreset]')) { const st = status(); if (st.ready) await savePresetSheet(draft.items); } });
  onTab((t) => { if (t === 'write') { renderMeter(); centerChip(); } });
}
