// /nfc — Card tab: build a digital business card that lives inside a link.
import { $, esc, icon, store, toast, copy, download, buzz, uid, reduced, slug } from '/nfc/ui.js';
import { THEMES, SOCIAL_KINDS, emptyCard, normalize, isBlank, encodeCard, cardUrl, cardToVcard, hasCompression } from '/nfc/card.js';
import { messageSize, CAPACITIES, fits } from '/nfc/ndef.js';
import { renderCard, qrSvg, whenQr } from '/nfc/card-render.js';
import { writeNow } from '/nfc/write.js';
import { confirmSheet } from '/nfc/ops.js';
import { onTab } from '/nfc/router.js';

let S = { cur: '', list: [] };
let compact = false;
let out = { token: 0, url: '', enc: '', full: '', short: '' };

const load = () => {
  const s = store.get('cards', null);
  if (s && Array.isArray(s.list) && s.list.length) S = { cur: s.cur, list: s.list.slice(0, 8).map((x) => ({ id: x.id || uid(), label: String(x.label || 'My card').slice(0, 30), card: normalize(x.card) })) };
  if (!S.list.length) { const id = uid(); S = { cur: id, list: [{ id, label: 'My card', card: emptyCard() }] }; }
  if (!S.list.some((x) => x.id === S.cur)) S.cur = S.list[0].id;
  compact = !!store.get('compact', false);
};
const entry = () => S.list.find((x) => x.id === S.cur);
const card = () => entry().card;
let saveT;
const persist = () => { clearTimeout(saveT); saveT = setTimeout(() => { store.set('cards', S); store.set('compact', compact); }, 250); };

/* ---------- selector ---------- */
function renderSel() {
  $('#cSel').innerHTML = S.list.map((x) => `<button type="button" role="tab" data-c="${esc(x.id)}" aria-selected="${x.id === S.cur}">${esc(x.label)}</button>`).join('') +
    (S.list.length < 8 ? `<button type="button" class="plus" data-new>${icon('plus')}New card</button>` : '');
}

/* ---------- form ---------- */
const fld = (label, inner, hint) => `<label class="fld"><span>${esc(label)}</span>${inner}${hint ? `<small class="hint">${esc(hint)}</small>` : ''}</label>`;
const inp = (attrs, v) => `<input ${attrs} value="${esc(v || '')}" autocomplete="off" spellcheck="false">`;

function listHtml(key, items, o) {
  const arr = items.length ? items : [''];
  return arr.map((v, i) => `<div class="multi"><label class="fld"><span>${i === 0 ? esc(o.label) : esc(o.label) + ' ' + (i + 1)}</span>${inp(`data-l="${key}" data-i="${i}" type="${o.type}" inputmode="${o.im}" autocomplete="${o.ac}" placeholder="${esc(o.ph)}"`, v)}</label>${arr.length > 1 ? `<button class="ib bad" type="button" data-rml="${key}" data-i="${i}" aria-label="Remove ${esc(o.label)} ${i + 1}" style="align-self:flex-end">${icon('x')}</button>` : ''}</div>`).join('') +
    (arr.length < 3 ? `<button class="act" type="button" data-addl="${key}" style="margin:-2px 0 12px">${icon('plus')}Add another</button>` : '');
}
function socHtml() {
  const c = card();
  return c.socials.map((s, i) => `<div class="soc-row"><label class="fld"><span>${i === 0 ? 'Where' : '&nbsp;'}</span><select data-s="k" data-i="${i}" aria-label="Network">${SOCIAL_KINDS.map((k) => `<option value="${k.id}"${k.id === s.k ? ' selected' : ''}>${esc(k.name)}</option>`).join('')}</select></label>
    <label class="fld"><span>${i === 0 ? 'Username or link' : '&nbsp;'}</span>${inp(`data-s="h" data-i="${i}" placeholder="${s.k === 'whatsapp' ? '+1 555 010 0000' : '@yourname'}" autocapitalize="off"`, s.h)}</label>
    <button class="ib bad" type="button" data-rms="${i}" aria-label="Remove" style="align-self:flex-end">${icon('x')}</button></div>`).join('') +
    (c.socials.length < 6 ? `<button class="act" type="button" data-adds style="margin:0 0 12px">${icon('plus')}Add a social link</button>` : '');
}
const sum = (c) => ({ about: [c.name, c.title].filter(Boolean).join(' · '), contact: [c.phones[0], c.emails[0]].filter(Boolean).join(' · '), soc: c.socials.length ? c.socials.length + ' linked' : 'None yet' });

function renderForm() {
  const c = card(); const e = entry();
  const s = sum(c);
  $('#cForm').innerHTML = `
  <details open><summary>About you<em id="sAbout">${esc(s.about)}</em>${icon('down')}</summary><div>
    ${fld('Name', inp('data-f="name" autocomplete="name" placeholder="Ada Lovelace" autocapitalize="words"', c.name))}
    <div class="f2">${fld('Job title', inp('data-f="title" placeholder="Engineer" autocapitalize="words"', c.title))}${fld('Company', inp('data-f="org" autocomplete="organization" placeholder="Analytical Co." autocapitalize="words"', c.org))}</div>
    ${fld('A line about you', `<textarea data-f="bio" rows="3" maxlength="400" placeholder="Optional. What you do, in a sentence.">${esc(c.bio)}</textarea>`, 'Dropped in compact mode')}
  </div></details>
  <details open><summary>Ways to reach you<em id="sContact">${esc(s.contact)}</em>${icon('down')}</summary><div>
    <div id="cPhones">${listHtml('phones', c.phones, { label: 'Phone', type: 'tel', im: 'tel', ac: 'tel', ph: '+1 555 010 0000' })}</div>
    <div id="cEmails">${listHtml('emails', c.emails, { label: 'Email', type: 'email', im: 'email', ac: 'email', ph: 'you@example.com' })}</div>
    ${fld('Website', inp('data-f="web" type="url" inputmode="url" autocomplete="url" placeholder="yoursite.com" autocapitalize="off"', c.web))}
    ${fld('Address', inp('data-f="addr" autocomplete="street-address" placeholder="12 Main St, Springfield"', c.addr), 'Dropped in compact mode')}
  </div></details>
  <details><summary>Social links<em id="sSoc">${esc(s.soc)}</em>${icon('down')}</summary><div id="cSocs">${socHtml()}</div></details>
  <details><summary>Look &amp; name<em>${esc(THEMES[c.theme].name)}</em>${icon('down')}</summary><div>
    <div class="themes" role="group" aria-label="Card colour">${THEMES.map((t, i) => `<button type="button" data-th="${i}" aria-label="${esc(t.name)}" aria-pressed="${i === c.theme}" style="--sw:linear-gradient(135deg,${t.c[0]},${t.c[1]} 55%,${t.c[2]})"></button>`).join('')}</div>
    ${fld('Name this card', inp('data-lbl maxlength="30" placeholder="Work"', e.label), 'Only for you, to tell your cards apart')}
    ${S.list.length > 1 ? `<button class="btn danger small" type="button" data-delcard>${icon('trash')}Delete this card</button>` : ''}
  </div></details>`;
}
function updSummaries() {
  const s = sum(card());
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set('#sAbout', s.about); set('#sContact', s.contact); set('#sSoc', s.soc);
}

/* ---------- preview + outputs ---------- */
function renderPrev() { $('#cPrev').innerHTML = renderCard(card(), { live: false }); }

const capsOf = (bytes) => CAPACITIES.filter((c) => ['n213', 'n215', 'n216'].includes(c.id)).map((c) => ({ ...c, ok: fits(bytes, c.bytes) }));

async function computeOut() {
  const my = ++out.token;
  const c = card();
  if (isBlank(c)) { out = { token: my, url: '' }; renderOut(); return; }
  const [full, short] = await Promise.all([encodeCard(c), encodeCard(c, { compact: true })]);
  if (my !== out.token) return;
  out = { token: my, full, short, enc: compact ? short : full };
  out.url = cardUrl(location.origin, out.enc);
  out.bytes = messageSize([{ recordType: 'url', data: out.url }]);
  out.fullBytes = messageSize([{ recordType: 'url', data: cardUrl(location.origin, full) }]);
  out.shortBytes = messageSize([{ recordType: 'url', data: cardUrl(location.origin, short) }]);
  out.vcf = cardToVcard(c);
  out.vcfBytes = messageSize([{ recordType: 'mime', mediaType: 'text/vcard', data: new TextEncoder().encode(out.vcf) }]);
  renderOut();
}
let outT;
const scheduleOut = () => { clearTimeout(outT); outT = setTimeout(computeOut, 120); };

function renderOut() {
  const el = $('#cOut');
  if (!out.url) {
    el.innerHTML = `<div class="card"><h3 class="out-t">Share it</h3><p class="out-s">Add your name, a number or an email and your card link appears here, ready for a tag, a QR code or a text.</p></div>`;
    return;
  }
  const caps = capsOf(out.bytes);
  const small = capsOf(out.shortBytes)[0].ok; const bigOk = caps[0].ok;
  const hint = !compact && !bigOk && small ? `<button class="linkbtn" type="button" data-compact-on>Switch to compact so it fits NTAG213</button>` : '';
  el.innerHTML = `<div class="card">
    <h3 class="out-t">Share it</h3>
    <p class="out-s">One link holds the whole card. Friends on any phone can open it.</p>
    <div class="linkbox" id="linkText" tabindex="0">${esc(out.url)}</div>
    <div class="fitline"><span>${out.url.length} characters, ${out.bytes} bytes on a tag</span></div>
    <div class="fitline">${caps.map((c) => `<span class="pill ${c.ok ? 'yes' : 'no'}">${c.ok ? '✓' : '✕'} ${esc(c.name)}</span>`).join('')}</div>
    <label class="tgl"><span><b>Compact link</b><small>Skips the bio, address and extras. Fits smaller chips${hasCompression() ? '' : ''}</small></span><input type="checkbox" id="cCompact"${compact ? ' checked' : ''}><i aria-hidden="true"></i></label>
    ${hint}
    <div class="btn-row" style="margin-top:12px"><button class="btn primary" type="button" data-o="tag" style="flex:1 1 100%;min-height:56px">${icon('nfc')}Write card to a tag</button></div>
    <div class="out-grid">
      <button class="btn" type="button" data-o="qr">${icon('full')}Show QR</button>
      <button class="btn" type="button" data-o="share">${icon('share')}Share</button>
      <button class="btn" type="button" data-o="copy">${icon('copy')}Copy link</button>
      <button class="btn" type="button" data-o="vcf">${icon('save')}.vcf file</button>
      <button class="btn" type="button" data-o="vtag">${icon('user')}vCard to tag</button>
      <a class="btn" href="${esc(out.url)}" target="_blank" rel="noopener">${icon('open')}Open card</a>
    </div>
    ${!bigOk ? `<p class="tip"><b>Tight on space?</b> Make the link shorter with <a href="/url/?long=${encodeURIComponent(out.url)}" style="color:var(--a2)">Links</a>, then write that short link instead.</p>` : ''}
    <p class="tip"><b>How to hand it over.</b> A phone can’t pretend to be a tag from a website, so write the link <b>once</b> to a sticker, card or keyring, or show the QR. Then anyone can tap or scan. iPhones (XS and newer) read tags on their own and open the link in Safari.</p>
  </div>`;
}

/* ---------- show-to-friend QR ---------- */
let wake = null;
function showQr() {
  const c = card();
  whenQr(() => {
    const el = $('#show');
    el.innerHTML = `<div class="qrbig">${qrSvg(out.url, { ecl: 'M' }) || '<p>The QR engine couldn’t load. Check your connection.</p>'}</div><h2>${esc(c.name || 'Digital card')}</h2><p>Point a phone camera at this</p><span class="wl">Screen stays on</span><button class="btn" type="button" data-x>Close</button>`;
    el.hidden = false;
    document.body.classList.add('noscroll');
    requestAnimationFrame(() => el.classList.add('on'));
    try { if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then((w) => { wake = w; }).catch(() => {}); } catch (e) { /* ignore */ }
    const close = () => { el.classList.remove('on'); setTimeout(() => { el.hidden = true; el.innerHTML = ''; }, 200); document.body.classList.remove('noscroll'); try { wake && wake.release(); } catch (e) { /* ignore */ } wake = null; document.removeEventListener('keydown', esc2); };
    const esc2 = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc2);
    el.querySelector('[data-x]').addEventListener('click', close);
    el.querySelector('[data-x]').focus({ preventScroll: true });
  });
}

async function shareCard() {
  const c = card(); const title = c.name || 'My card';
  try {
    const file = new File([out.vcf], slug(title, 'contact') + '.vcf', { type: 'text/vcard' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title, text: out.url }); return; }
    if (navigator.share) { await navigator.share({ title, text: title + ' · digital card', url: out.url }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  copy(out.url, 'Link copied. Paste it anywhere');
}

async function onOut(e) {
  if (e.target.id === 'cCompact') { compact = e.target.checked; persist(); computeOut(); return; }
  const b = e.target.closest('[data-o],[data-compact-on]'); if (!b) return;
  if (b.hasAttribute('data-compact-on')) { compact = true; persist(); computeOut(); return; }
  const c = card();
  switch (b.dataset.o) {
    case 'tag': await writeNow([{ type: 'url', fields: { url: out.url } }], { label: 'Write' }); break;
    case 'vtag': await writeNow([{ type: 'contact', fields: { vcf: out.vcf } }], { label: 'Write' }); break;
    case 'qr': showQr(); break;
    case 'share': shareCard(); break;
    case 'copy': copy(out.url, 'Card link copied'); break;
    case 'vcf': download(slug(c.name || c.org, 'contact') + '.vcf', 'text/vcard;charset=utf-8', out.vcf); toast('Contact file saved'); break;
    default: break;
  }
}

/* ---------- editing ---------- */
function changed(structural) {
  persist(); renderPrev(); updSummaries(); scheduleOut();
  if (structural) renderForm();
}
function onInput(e) {
  const t = e.target; const c = card();
  if (t.dataset.f) { c[t.dataset.f] = t.value; changed(); }
  else if (t.dataset.l) { const arr = c[t.dataset.l]; const i = +t.dataset.i; while (arr.length <= i) arr.push(''); arr[i] = t.value; changed(); }
  else if (t.dataset.s) { const s = c.socials[+t.dataset.i]; s[t.dataset.s] = t.value; if (t.dataset.s === 'k') { const h = $(`#cSocs input[data-i="${t.dataset.i}"]`); if (h) h.placeholder = t.value === 'whatsapp' ? '+1 555 010 0000' : '@yourname'; } changed(); }
  else if (t.hasAttribute('data-lbl')) { entry().label = t.value.slice(0, 30) || 'My card'; persist(); renderSel(); }
}
async function onClick(e) {
  const c = card();
  const th = e.target.closest('[data-th]'); if (th) { c.theme = +th.dataset.th; $('#cForm').querySelectorAll('[data-th]').forEach((b) => b.setAttribute('aria-pressed', String(b === th))); changed(); return; }
  const al = e.target.closest('[data-addl]'); if (al) { if (!c[al.dataset.addl].length) c[al.dataset.addl].push(''); c[al.dataset.addl].push(''); persist(); relist(al.dataset.addl); return; }
  const rl = e.target.closest('[data-rml]'); if (rl) { c[rl.dataset.rml].splice(+rl.dataset.i, 1); changed(); relist(rl.dataset.rml); return; }
  if (e.target.closest('[data-adds]')) { c.socials.push({ k: 'instagram', h: '' }); persist(); $('#cSocs').innerHTML = socHtml(); const last = $('#cSocs').querySelectorAll('input'); last[last.length - 1].focus(); return; }
  const rs = e.target.closest('[data-rms]'); if (rs) { c.socials.splice(+rs.dataset.rms, 1); changed(); $('#cSocs').innerHTML = socHtml(); return; }
  if (e.target.closest('[data-delcard]')) {
    const ok = await confirmSheet({ title: 'Delete this card?', danger: true, ok: 'Delete', html: `<p><b>${esc(entry().label)}</b> will be removed from this browser. Links you already shared keep working, since they hold the card inside them.</p>` });
    if (!ok) return;
    S.list = S.list.filter((x) => x.id !== S.cur); S.cur = S.list[0].id; persist(); renderAll();
  }
}
function relist(key) {
  const c = card();
  const o = key === 'phones' ? { label: 'Phone', type: 'tel', im: 'tel', ac: 'tel', ph: '+1 555 010 0000' } : { label: 'Email', type: 'email', im: 'email', ac: 'email', ph: 'you@example.com' };
  $(key === 'phones' ? '#cPhones' : '#cEmails').innerHTML = listHtml(key, c[key], o);
  const inputs = $(key === 'phones' ? '#cPhones' : '#cEmails').querySelectorAll('input'); if (inputs.length) inputs[inputs.length - 1].focus({ preventScroll: true });
}

function renderAll() { renderSel(); renderPrev(); renderForm(); computeOut(); }

export function initCard() {
  load();
  renderAll();
  $('#cSel').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-new')) { const id = uid(); S.list.push({ id, label: 'Card ' + (S.list.length + 1), card: emptyCard() }); S.cur = id; persist(); renderAll(); buzz(8); return; }
    if (b.dataset.c) { S.cur = b.dataset.c; persist(); renderAll(); }
  });
  const f = $('#cForm');
  f.addEventListener('input', onInput);
  f.addEventListener('change', onInput);
  f.addEventListener('click', onClick);
  $('#cOut').addEventListener('click', onOut);
  $('#cOut').addEventListener('change', onOut);
  onTab((t) => { if (t === 'card') computeOut(); });
}
