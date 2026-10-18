// /nfc — Tags tab (library, recent writes, backup) and Tools tab (lock, erase, clone, test, health).
import { $, esc, icon, toast, copy, download, buzz, ago, reduced } from '/nfc/ui.js';
import { hasNFC, canLock, isSecure, isAndroid, isIOS, scanOnce, writeRecords, lockTag, fmtSerial } from '/nfc/nfcio.js';
import { webToRawItem, serialize, decodeRecord, CAPACITIES, fits, tlvOverhead, utf8, fromUtf8, bytesOf, summarize } from '/nfc/ndef.js';
import { hasCompression } from '/nfc/card.js';
import { lib, recent, labelFor, bytesFor, kindsFor, exportAll, importAll } from '/nfc/data.js';
import { goTab, onTab } from '/nfc/router.js';
import { runOp, confirmSheet, holdButton, showSheet, sheet, afterSheet, showUnsupported } from '/nfc/ops.js';
import { loadIntoWrite, writeNow, onRecentChange } from '/nfc/write.js';

const KIND_ICON = { url: 'link', phone: 'phone', sms: 'sms', email: 'mail', geo: 'pin', text: 'text', contact: 'user', wifi: 'wifi', app: 'app', poster: 'link', mime: 'data', unknown: 'data', external: 'data', empty: 'nfc' };

/* ================== TAGS ================== */
function row(x, kind) {
  const k = kindsFor(x.items)[0];
  const title = kind === 'lib' ? x.name : x.label;
  const sub = kind === 'lib' ? `${labelFor(x.items)} · ${bytesFor(x.items)} B` : `${x.bytes} B · ${ago(x.ts)}`;
  return `<div class="row"><span class="row-i">${icon(KIND_ICON[k] || 'nfc')}</span><span class="row-t"><b>${esc(title)}</b><span>${esc(sub)}</span></span>
    <span class="row-a"><button class="ib go" type="button" data-a="write" data-k="${kind}" data-id="${esc(x.id)}" aria-label="Write ${esc(title)} to a tag">${icon('write')}</button><button class="ib" type="button" data-a="edit" data-k="${kind}" data-id="${esc(x.id)}" aria-label="Edit">${icon('tools')}</button>${kind === 'lib' ? `<button class="ib bad" type="button" data-a="del" data-id="${esc(x.id)}" aria-label="Delete">${icon('trash')}</button>` : `<button class="ib" type="button" data-a="star" data-id="${esc(x.id)}" aria-label="Save to library">${icon('star')}</button>`}</span></div>`;
}
export function renderTags() {
  const l = lib.all(), r = recent.all();
  $('#libList').innerHTML = l.length ? l.map((x) => row(x, 'lib')).join('') : `<div class="empty">Nothing saved yet.<br>Build something in Write, tap “Save to library”, and it shows up here.</div>`;
  $('#recList').innerHTML = r.length ? r.map((x) => row(x, 'rec')).join('') : `<div class="empty">Tags you write will be remembered here.</div>`;
  $('#recClear').hidden = !r.length;
}
async function onTagClick(e) {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const src = b.dataset.k === 'rec' || b.dataset.a === 'star' ? recent.all() : lib.all();
  const x = src.find((y) => y.id === b.dataset.id) || (b.dataset.a === 'del' ? lib.all().find((y) => y.id === b.dataset.id) : null);
  if (!x) return;
  if (b.dataset.a === 'write') { loadIntoWrite(x.items); await writeNow(x.items, { overwrite: true }); }
  else if (b.dataset.a === 'edit') { loadIntoWrite(x.items, { go: true }); }
  else if (b.dataset.a === 'star') { lib.add('', x.items); renderTags(); toast('Saved to your library'); }
  else if (b.dataset.a === 'del') {
    const ok = await confirmSheet({ title: 'Delete “' + x.name + '”?', danger: true, ok: 'Delete', html: '<p>This only removes it from your library here. Tags you already wrote are untouched.</p>' });
    if (ok) { lib.remove(x.id); renderTags(); }
  }
}
function backupSheet(mode) {
  if (mode === 'copy') { copy(JSON.stringify(exportAll(), null, 1), 'Backup copied'); return; }
  showSheet(`<p class="eyebrow">Backup</p><h2>Import</h2><p>Paste backup text below, or pick a backup file. Items you already have are kept.</p>
    <textarea id="impText" placeholder="Paste backup text here" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Backup text"></textarea>
    <div class="btn-row"><button class="btn primary" type="button" id="impGo">Import</button><button class="btn" type="button" id="impFile">Choose file…</button></div>`);
  $('#impGo').addEventListener('click', () => {
    try { const n = importAll($('#impText').value); sheet.close(true); renderTags(); window.dispatchEvent(new Event('szv-nfc-imported')); toast(n ? `Imported ${n} item${n === 1 ? '' : 's'}` : 'Nothing new to import'); }
    catch (err) { toast(err.message); }
  });
  $('#impFile').addEventListener('click', () => $('#bkFile').click());
}
function initTags() {
  renderTags();
  $('#p-tags').addEventListener('click', onTagClick);
  $('#recClear').addEventListener('click', () => { recent.clear(); renderTags(); toast('Cleared'); });
  $('#bkDl').addEventListener('click', () => { download('szvtech-nfc-backup.json', 'application/json', JSON.stringify(exportAll(), null, 1)); toast('Backup saved'); });
  $('#bkCopy').addEventListener('click', () => backupSheet('copy'));
  $('#bkImp').addEventListener('click', () => backupSheet('import'));
  $('#bkFile').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const n = importAll(await f.text()); sheet.close(true); renderTags(); toast(n ? `Imported ${n} item${n === 1 ? '' : 's'}` : 'Nothing new to import'); }
    catch (err) { toast(err.message); }
  });
  onRecentChange(renderTags);
  onTab((t) => { if (t === 'tags') renderTags(); });
}

/* ================== TOOLS ================== */
const caps = () => {
  const nfc = hasNFC(), sec = isSecure();
  const row = (ok, t, sub) => ({ ok, t, sub });
  return [
    row(nfc ? 'g' : 'r', nfc ? 'Web NFC is available' : 'Web NFC isn’t available', nfc ? 'This browser can read and write tags.' : isIOS() ? 'iPhone and iPad browsers don’t offer it.' : isAndroid() ? 'Open this page in Chrome.' : 'Needs Chrome on an Android phone.'),
    row(sec ? 'g' : 'r', sec ? 'Secure page (https)' : 'Not a secure page', sec ? 'NFC is allowed on this address.' : 'NFC only works on https pages.'),
    row(canLock() ? 'g' : (nfc ? 'a' : 'r'), canLock() ? 'Can lock tags' : 'Can’t lock tags here', canLock() ? 'Make a tag read-only for good.' : 'Needs a recent Chrome on Android.'),
    row(hasCompression() ? 'g' : 'a', hasCompression() ? 'Short card links' : 'Longer card links', hasCompression() ? 'Cards are compressed to fit small tags.' : 'This browser can’t compress, so links run longer.'),
    row('share' in navigator ? 'g' : 'a', 'share' in navigator ? 'Sharing sheet' : 'No sharing sheet', 'share' in navigator ? 'Send cards straight to friends.' : 'Copy the link instead.'),
    row('wakeLock' in navigator ? 'g' : 'a', 'wakeLock' in navigator ? 'Screen stays awake in Show QR' : 'Screen may dim in Show QR', 'wakeLock' in navigator ? 'Handy when showing a friend.' : 'Tap now and then to keep it bright.'),
  ];
};
export function capSummary() {
  if (hasNFC() && isSecure()) return { c: 'g', t: 'NFC ready' };
  if (hasNFC()) return { c: 'r', t: 'Needs https' };
  return { c: 'a', t: isIOS() ? 'iPhone: view only' : 'No NFC here' };
}
function renderCaps() {
  $('#capCard').innerHTML = caps().map((r) => `<div class="krow"><i class="dotc ${r.ok}"></i><span>${esc(r.t)}<small>${esc(r.sub)}</small></span></div>`).join('');
}

const TOOLS = [
  ['lock', 'Lock a tag', 'Make it read-only for good', 'lock', 'warn'],
  ['erase', 'Erase a tag', 'Wipe what’s on it', 'eraser'],
  ['clone', 'Clone a tag', 'Copy one tag onto another', 'clone'],
  ['test', 'Test a tag', 'Write a sample and read it back', 'flask'],
  ['health', 'Tag health check', 'Serial number, records, bytes used', 'pulse'],
  ['password', 'Password protect', 'Why the web can’t, and what can', 'key'],
];
function renderTools() {
  const need = !hasNFC();
  $('#toolGrid').innerHTML = TOOLS.map(([id, t, s, ic, cls]) => `<button class="tool ${cls || ''}${need && id !== 'password' ? ' off' : ''}" type="button" data-tool="${id}"><span class="row-i">${icon(ic)}</span><b>${esc(t)}</b><span>${esc(s)}</span></button>`).join('');
  $('#know').innerHTML = `
    <p><b>Which tag should I buy?</b> NTAG213 (144 bytes) holds a link or a short note. NTAG215 (504) fits a contact or a card link with room to spare. NTAG216 (888) is for bigger things. All three work on Android and iPhone.</p>
    <p><b>iPhone.</b> XS and newer read tags on their own: hold the top of the phone near one. Safari opens link tags straight away. Writing needs an Android phone.</p>
    <p><b>Credit cards, hotel keys, transit cards</b> aren’t NDEF tags and can’t be read or copied here. That’s a good thing.</p>
    <p><b>Mifare Classic</b> tags often aren’t formatted for NDEF, so a phone may refuse to write them. Stick to NTAG stickers.</p>`;
}

async function toolLock() {
  if (!canLock()) {
    showSheet(`<p class="eyebrow">Lock</p><h2>Not possible here</h2><p>Locking from a web page needs a recent <b>Chrome on Android</b>. This browser doesn’t offer it.</p><div class="btn-row"><button class="btn" type="button" data-close>OK</button></div>`);
    return;
  }
  showSheet(`<p class="eyebrow">Lock</p><h2>Make a tag read-only</h2>
    <p>Locking is <b>permanent</b>. The tag can still be read forever, but no phone or app can ever change or erase it again.</p>
    <ol class="steps"><li>Make sure the tag already holds exactly what you want.</li><li>Type <b>LOCK</b> below.</li><li>Press and hold the red button, then touch the tag.</li></ol>
    <label class="fld"><span>Type LOCK to continue</span><input id="lockWord" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="LOCK"></label>
    <button class="hold off" id="lockHold" type="button"><i></i><span>Hold to lock</span></button>
    <div class="btn-row"><button class="btn" type="button" data-close>Cancel</button></div>`);
  const word = $('#lockWord'), hold = $('#lockHold');
  word.addEventListener('input', () => hold.classList.toggle('off', word.value.trim().toUpperCase() !== 'LOCK'));
  holdButton(hold, 1300, async () => {
    sheet.close(true); await afterSheet();
    await runOp({ eyebrow: 'Lock', icon: 'lock', title: 'Tap the tag to lock it', wait: 'Hold the back of your phone against the tag. This can’t be undone.', work: async ({ signal }) => { await lockTag({ signal }); return true; }, okTitle: () => 'Locked', okText: () => 'That tag is now read-only for good.' });
  });
}
async function toolErase() {
  const ok = await confirmSheet({ title: 'Erase a tag?', danger: true, ok: 'Continue', html: '<p>Everything on the tag is replaced with a blank record. If the tag is locked, this won’t work.</p>' });
  if (!ok) return; await afterSheet();
  await runOp({ eyebrow: 'Erase', icon: 'eraser', title: 'Tap the tag to erase', wait: 'Hold the back of your phone against the tag.', again: 'Erase another', work: async ({ signal }) => { await writeRecords([{ recordType: 'empty' }], { overwrite: true, signal }); return true; }, okTitle: () => 'Erased', okText: () => 'The tag is blank and ready for something new.' });
}
async function toolClone() {
  await runOp({
    eyebrow: 'Clone · step 1 of 2', icon: 'read', title: 'Tap the tag to copy', wait: 'Hold the back of your phone against the tag you want to duplicate.',
    work: async ({ signal }) => { const r = await scanOnce({ signal }); const items = r.records.map(webToRawItem); if (!items.length) throw new Error('That tag is empty, so there is nothing to copy.'); return { items, label: summarize(r.records.map((x) => ({ recordType: x.recordType, mediaType: x.mediaType, encoding: x.encoding, lang: x.lang, data: x.data }))) }; },
    okTitle: () => 'Copied', okText: (r) => `${r.label}. Now tap the tag you want to write it onto.`,
    extras: [{ label: 'Tap the new tag', primary: true, fn: (r) => { loadIntoWrite(r.items); writeNow(r.items, { label: 'Clone', overwrite: true }); } }],
  });
}
async function toolTest() {
  const ok = await confirmSheet({ title: 'Test a tag', ok: 'Start', html: '<p>This writes a short test message onto the tag, then asks you to tap again and reads it back to check it matches. <b>It replaces whatever is on the tag.</b></p>' });
  if (!ok) return; await afterSheet();
  const stamp = 'szvtech test ' + Math.random().toString(36).slice(2, 8);
  await runOp({
    eyebrow: 'Test', icon: 'flask', title: 'Tap the tag to test', wait: 'Hold the back of your phone against the tag. We’ll write a short message first.',
    work: async ({ signal, phase }) => {
      await writeRecords([{ recordType: 'text', data: stamp, lang: 'en' }], { overwrite: true, signal });
      phase('Written. Now read it back', 'Lift the tag away, then touch it to your phone again.');
      await new Promise((r) => setTimeout(r, 900));
      const r = await scanOnce({ signal });
      const first = r.records[0]; const got = first && first.recordType === 'text' ? fromUtf8(bytesOf(first.data)) : '';
      if (got !== stamp) throw new Error('The tag didn’t read back the same. It may be faulty, or too small.');
      return { serial: r.serial };
    },
    okTitle: () => 'Tag passed', okText: (r) => `Written and read back correctly${r.serial ? ' (' + fmtSerial(r.serial) + ')' : ''}. The tag now holds a test note. Write over it when you’re ready.`,
  });
}
async function toolHealth() {
  await runOp({
    eyebrow: 'Health check', icon: 'pulse', title: 'Tap the tag to check', wait: 'Hold the back of your phone against the tag.',
    work: async ({ signal }) => {
      const r = await scanOnce({ signal });
      const recs = r.records.map((x) => ({ recordType: x.recordType, mediaType: x.mediaType, encoding: x.encoding, lang: x.lang, data: x.data }));
      const bytes = recs.length ? serialize(recs).length : 0;
      const kinds = recs.map((x) => decodeRecord(x).kind);
      return { serial: r.serial, count: recs.length, bytes, kinds };
    },
    okTitle: (r) => (r.count ? 'Looks healthy' : 'Readable, but blank'),
    okText: (r) => (r.count ? 'The tag answered and its contents read cleanly.' : 'The tag answered. It has no records yet.'),
    okExtra: (r) => {
      const fit = r.bytes ? CAPACITIES.find((c) => fits(r.bytes, c.bytes)) : null;
      return `<dl class="kv" style="text-align:left;margin:6px 0 12px"><dt>Serial</dt><dd>${esc(fmtSerial(r.serial))}</dd><dt>Records</dt><dd>${r.count}${r.kinds.length ? ' (' + esc([...new Set(r.kinds)].join(', ')) + ')' : ''}</dd><dt>Used</dt><dd>${r.bytes} bytes${r.bytes ? ' + ' + tlvOverhead(r.bytes) + ' overhead' : ''}</dd><dt>Needs</dt><dd>${r.bytes ? (fit ? esc(fit.name) + ' or bigger' : 'More than 888 bytes') : 'Anything'}</dd></dl><p class="hint" style="margin:0 0 8px">Web NFC can’t see the chip’s total size, only what’s written.</p>`;
    },
    again: 'Check another',
  });
}
function toolPassword() {
  showSheet(`<p class="eyebrow">Passwords</p><h2>Can a tag have a password?</h2>
    <p>Some chips (NTAG21x) have a built-in password feature, but <b>web pages can’t use it</b>. Chrome’s NFC doesn’t expose it, on purpose, so a website can never lock you out of a tag by accident.</p>
    <ol class="steps"><li><b>To stop edits:</b> use <b>Lock a tag</b>. It’s permanent, but it protects the contents completely.</li><li><b>To keep it private:</b> don’t put secrets on a tag. Anyone with a phone can read one. Put a link on it, and protect the page behind the link.</li><li><b>To set a real chip password:</b> use a dedicated NFC app on Android. Keep that password safe. There is no reset.</li></ol>
    <div class="btn-row"><button class="btn" type="button" data-close>Got it</button></div>`);
}

function initTools() {
  renderCaps(); renderTools();
  $('#toolGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tool]'); if (!b) return;
    const id = b.dataset.tool;
    if (id === 'password') return toolPassword();
    if (!hasNFC() || !isSecure()) return showUnsupported();
    ({ lock: toolLock, erase: toolErase, clone: toolClone, test: toolTest, health: toolHealth })[id]();
  });
}

export function initLib() { initTags(); initTools(); }
