// /nfc — Read tab: scan a tag, decode every record, offer actions, keep history.
import { $, esc, icon, store, toast, copy, download, buzz, ago, slug, reduced } from '/nfc/ui.js?v=8974ba5dc3';
import { hasNFC, isSecure, errText, isAbort, fmtSerial } from '/nfc/nfcio.js?v=fffda67052';
import { decodeRecord, webToRawItem, itemRecords, messageSize, summarize, fromUtf8, bytesOf } from '/nfc/ndef.js?v=da5a737810';
import { history, lib } from '/nfc/data.js?v=586e1a8229';
import { goTab } from '/nfc/router.js?v=f3a68c5008';
import { onBeforeOp, savePresetSheet, unsupportedReason, showUnsupported } from '/nfc/ops.js?v=0d6918b052';
import { loadIntoWrite, writeNow } from '/nfc/write.js?v=9554f90a03';
import { parseVcard } from '/qr/encode.js?v=604205b2fc';

const KIND_ICON = { url: 'link', phone: 'phone', sms: 'sms', email: 'mail', geo: 'pin', text: 'text', contact: 'user', wifi: 'wifi', app: 'app', poster: 'link', mime: 'data', unknown: 'data', external: 'data', empty: 'nfc' };
const SAFE_HREF = /^(https?:|tel:|sms:|smsto:|mailto:)/i;

let scanning = false, ctl = null, settleT = null;
const shown = []; // result entries on screen, newest first

const stage = () => $('#stage');
function setState(st, title, sub) {
  stage().dataset.state = st;
  $('#scanTitle').textContent = title;
  $('#scanSub').textContent = sub;
  const btn = $('#scanBtn');
  btn.setAttribute('aria-label', scanning ? 'Stop scanning' : 'Start scanning for a tag');
  $('#scanStop').hidden = !scanning;
}

function stopScan(quiet) {
  if (!scanning && !ctl) return;
  scanning = false;
  try { ctl && ctl.abort(); } catch (e) { /* ignore */ }
  ctl = null; clearTimeout(settleT);
  if (!quiet) setState('idle', 'Read a tag', 'Tap the ring, then hold the back of your phone against a tag, card or sticker.');
  else stage().dataset.state = 'idle';
  $('#scanStop').hidden = true;
}

async function startScan() {
  if (!hasNFC() || !isSecure()) { showUnsupported(); return; }
  stopScan(true);
  ctl = new AbortController(); scanning = true;
  setState('scanning', 'Listening…', 'If Chrome asks to use NFC, tap Allow. Then hold a tag against the back of your phone.');
  try {
    const r = new NDEFReader();
    r.onreading = (ev) => onReading(ev);
    r.onreadingerror = () => { setState('error', 'Couldn’t read that tag', 'It might be blank, locked or not an NDEF tag. Try again, or write to it first.'); buzz(40); resumeSoon(3500); };
    await r.scan({ signal: ctl.signal });
  } catch (e) {
    if (isAbort(e)) return;
    scanning = false; ctl = null;
    setState('error', 'Couldn’t start', errText(e));
    $('#scanStop').hidden = true;
  }
}

function resumeSoon(ms) {
  clearTimeout(settleT);
  settleT = setTimeout(() => { if (scanning) setState('scanning', 'Listening…', 'Hold the next tag against the back of your phone.'); }, ms);
}

function onReading(ev) {
  const recs = Array.from((ev.message && ev.message.records) || []);
  const items = recs.map(webToRawItem);
  let bytes = 0; try { bytes = recs.length ? messageSize(recs.map((r) => ({ recordType: r.recordType, mediaType: r.mediaType, lang: r.lang, data: r.data }))) : 0; } catch (e) { /* ignore */ }
  const label = recs.length ? summarize(recs.map((r) => ({ recordType: r.recordType, mediaType: r.mediaType, encoding: r.encoding, lang: r.lang, data: r.data }))) : 'Empty tag';
  const entry = { id: Math.random().toString(36).slice(2), ts: Date.now(), serial: ev.serialNumber || '', bytes, label, items: bytes < 6000 ? items : [] };
  history.add({ ...entry, items: entry.items });
  addResult(entry);
  buzz([25, 40, 25]);
  setState('found', recs.length ? 'Tag found' : 'Blank tag', recs.length ? (recs.length === 1 ? '1 record, ' : recs.length + ' records, ') + bytes + ' bytes. Scan another any time.' : 'This tag has nothing on it yet.');
  resumeSoon(3200);
  renderHistory();
}

/* ---------- results ---------- */
function recHtml(d, ei, ri) {
  const href = d.href && SAFE_HREF.test(d.href) ? d.href : (d.href && /^https:\/\/(www\.google\.com\/maps|play\.google\.com)\//.test(d.href) ? d.href : '');
  const acts = [];
  if (href) acts.push(`<a class="act main" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${icon('open')}${d.kind === 'phone' ? 'Call' : d.kind === 'email' ? 'Email' : d.kind === 'sms' ? 'Message' : d.kind === 'geo' ? 'Open map' : d.kind === 'app' ? 'Play Store' : 'Open'}</a>`);
  if (d.kind === 'contact') acts.unshift(`<button class="act main" type="button" data-a="vcf" data-e="${ei}" data-r="${ri}">${icon('save')}Save contact</button>`);
  if (d.kind === 'wifi') acts.unshift(`<button class="act main" type="button" data-a="copypw" data-e="${ei}" data-r="${ri}">${icon('key')}Copy password</button>`);
  if (d.value && d.kind !== 'wifi') acts.push(`<button class="act" type="button" data-a="copy" data-e="${ei}" data-r="${ri}">${icon('copy')}Copy</button>`);
  if (d.kind === 'wifi' && d.title) acts.push(`<button class="act" type="button" data-a="copy-name" data-e="${ei}" data-r="${ri}">${icon('copy')}Network name</button>`);
  if (d.qr) acts.push(`<a class="act" href="/qr/?text=${encodeURIComponent(d.qr)}">${icon('qr')}Make QR</a>`);
  if (d.web) acts.push(`<a class="act" href="/url/?long=${encodeURIComponent(d.value)}">${icon('short')}Shorten</a>`);
  let body = '';
  if (d.kind === 'wifi') {
    const w = d.wifi || {};
    body = `<div class="rec-t">${esc(d.title)}</div><div class="rec-v">${esc(w.sec || '')}${w.pass ? ' · password ' + '•'.repeat(Math.min(10, w.pass.length)) : ' · no password'}</div>`;
  } else if (d.kind === 'contact') {
    let c = {}; try { c = parseVcard(d.vcf); } catch (e) { /* ignore */ }
    const bits = [c.org || '', (c.tel || [])[0] || '', (c.email || [])[0] || ''].filter(Boolean).join('\n');
    body = `<div class="rec-t">${esc(d.title)}</div>${bits ? `<div class="rec-v">${esc(bits)}</div>` : ''}`;
  } else if (d.kind === 'text') {
    body = `<div class="rec-t" style="font-size:17px;font-weight:600;font-family:Inter,system-ui,sans-serif;letter-spacing:0">${esc(d.value.length > 600 ? d.value.slice(0, 600) + '…' : d.value)}</div>${d.lang ? `<div class="rec-m">language: ${esc(d.lang)}</div>` : ''}`;
  } else if (d.kind === 'poster') {
    body = `<div class="rec-t">${esc(d.title)}</div>${d.value ? `<div class="rec-v">${esc(d.value)}</div>` : ''}`;
  } else if (d.kind === 'empty') {
    body = '<div class="rec-v">An empty record. Nothing to show.</div>';
  } else if (d.kind === 'url' || d.kind === 'phone' || d.kind === 'sms' || d.kind === 'email' || d.kind === 'geo') {
    body = `<div class="rec-t">${esc(d.title)}</div><div class="rec-v">${esc(d.value)}</div>`;
  } else if (d.kind === 'app') {
    body = `<div class="rec-t">${esc(d.title)}</div><div class="rec-v">Launches this app on Android (or opens its Play Store page).</div>`;
  } else {
    body = `<div class="rec-t">${esc(d.title)}</div><div class="rec-v mono">${esc(d.value)}</div>`;
  }
  return `<div class="rec"><div class="rec-k">${icon(KIND_ICON[d.kind] || 'data')}${esc(d.label)}<em>${d.bytes} B</em></div>${body}${d.mediaType && d.kind !== 'wifi' && d.kind !== 'contact' ? `<div class="rec-m">${esc(d.mediaType)}</div>` : ''}${acts.length ? `<div class="rec-a">${acts.join('')}</div>` : ''}</div>`;
}

function decodeEntry(entry) {
  const recs = []; entry.items.forEach((it) => { try { recs.push(...itemRecords(it)); } catch (e) { /* skip */ } });
  return recs.map((r) => { const rec = { ...r, data: bytesOf(r.data) }; if (r.recordType === 'text') rec.encoding = 'utf-8'; return decodeRecord(rec); });
}

function resHtml(entry, ei) {
  const decoded = decodeEntry(entry);
  entry._decoded = decoded;
  const blank = !entry.items.length;
  return `<article class="res" data-e="${ei}">
    <div class="res-h"><i class="dotc ${blank ? 'a' : 'g'}"></i><div><b>${blank ? 'Blank tag' : 'Tag found'}</b><span>${esc(fmtSerial(entry.serial))}</span></div><time>${esc(ago(entry.ts))}</time></div>
    ${blank ? '<div class="blank"><b>Nothing on this tag yet.</b> It’s ready to be written. Head to Write, or build a card.</div>' : decoded.map((d, ri) => recHtml(d, ei, ri)).join('')}
    <div class="res-f">
      ${blank ? '' : `<button class="btn primary" type="button" data-a="clone" data-e="${ei}">${icon('clone')}Clone to a tag</button><button class="btn" type="button" data-a="save" data-e="${ei}">${icon('star')}Save</button>`}
      ${blank ? `<button class="btn primary" type="button" data-a="towrite">${icon('write')}Write something</button>` : ''}
      <button class="btn ghost" type="button" data-a="dismiss" data-e="${ei}">Dismiss</button>
    </div></article>`;
}

function addResult(entry) {
  shown.unshift(entry); if (shown.length > 4) shown.pop();
  renderResults();
}
function renderResults() {
  stage().classList.toggle('has-res', shown.length > 0);
  $('#results').innerHTML = shown.map((e, i) => resHtml(e, i)).join('');
}

function vcfOf(d) { return d.vcf || d.value; }

async function onResultClick(e) {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const entry = shown[+b.dataset.e]; const d = entry && entry._decoded && entry._decoded[+b.dataset.r];
  switch (b.dataset.a) {
    case 'copy': copy(d.value); break;
    case 'copy-name': copy(d.title, 'Network name copied'); break;
    case 'copypw': if (d.wifi && d.wifi.pass) copy(d.wifi.pass, 'Password copied'); else toast('This network has no password'); break;
    case 'vcf': { const c = parseVcard(vcfOf(d)); download(slug(c.fn || d.title, 'contact') + '.vcf', 'text/vcard;charset=utf-8', vcfOf(d)); toast('Contact file saved'); break; }
    case 'clone': loadIntoWrite(entry.items, { go: true }); await writeNow(entry.items, { label: 'Clone', overwrite: true }); break;
    case 'save': await savePresetSheet(entry.items, entry.label); break;
    case 'towrite': goTab('write'); break;
    case 'dismiss': shown.splice(+b.dataset.e, 1); renderResults(); break;
    default: break;
  }
}

/* ---------- history ---------- */
function renderHistory() {
  const h = history.all();
  $('#histWrap').hidden = !h.length;
  $('#histList').innerHTML = h.map((x, i) => `<button class="row btn-like" type="button" data-h="${i}"><span class="row-i">${icon(x.items && x.items.length ? 'nfc' : 'tags')}</span><span class="row-t"><b>${esc(x.label)}</b><span>${esc(fmtSerial(x.serial))} · ${esc(ago(x.ts))}</span></span><span class="ib go">${icon('chev')}</span></button>`).join('');
}

export function initRead() {
  const r = unsupportedReason();
  $('#scanBtn').addEventListener('click', () => { if (scanning) { stopScan(); return; } startScan(); });
  $('#scanStop').addEventListener('click', () => stopScan());
  $('#results').addEventListener('click', onResultClick);
  $('#histList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-h]'); if (!b) return;
    const x = history.all()[+b.dataset.h]; if (!x) return;
    shown.unshift({ ...x, id: x.id + 'h' + Date.now() }); if (shown.length > 4) shown.pop(); renderResults();
    $('#results').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  });
  $('#histClear').addEventListener('click', () => { history.clear(); renderHistory(); toast('History cleared'); });
  renderHistory();
  onBeforeOp(() => stopScan());
  if (r) {
    setState('unsupported', 'Reading needs an Android phone', 'Tags can be read from the web only by Chrome on Android. Tap the ring to see what you can do here instead.');
    const n = $('#support'); n.hidden = false;
    n.innerHTML = `<p><b>${esc(r.t)}.</b></p>${r.html}<div class="btn-row"><button class="btn primary small" type="button" data-go="card">Build a card</button><button class="btn small" type="button" data-go="write">Prepare a tag</button></div>`;
    n.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) goTab(g.dataset.go); });
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden && scanning) stopScan(); });
}
