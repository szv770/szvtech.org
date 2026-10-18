// /nfc/c/ — shows a card that lives in the link. Works on any phone (iPhone included).
import { decodeCard, cardToVcard, cleanTel, normalize } from '/nfc/card.js?v=e246964108';
import { renderCard, themeVars, qrSvg, whenQr, esc, ci, themeOf } from '/nfc/card-render.js?v=6d402cffd4';

const $ = (s) => document.querySelector(s);
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let card = null;

function toast(msg) {
  const t = $('#vtoast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2400);
}

function empty(title, text) {
  $('#card').innerHTML = `<div class="vempty"><h1>${esc(title)}</h1><p>${esc(text)}</p></div>`;
  $('#acts').innerHTML = '';
}

const fileName = (c) => ((c.name || c.org || 'contact').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'contact') + '.vcf';

function saveContact() {
  const vcf = cardToVcard(card);
  const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  if (isIOS) {
    // Safari opens "Add contact" for a vCard it navigates to
    location.href = url;
  } else {
    const a = document.createElement('a'); a.href = url; a.download = fileName(card); document.body.appendChild(a); a.click(); a.remove();
    toast('Contact file saved. Open it to add the contact.');
  }
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

async function share() {
  const url = location.href;
  const title = card.name || 'Digital card';
  try {
    const file = new File([cardToVcard(card)], fileName(card), { type: 'text/vcard' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); return; }
    if (navigator.share) { await navigator.share({ title, url }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch (e) { toast('Copy the address bar to share'); }
}

function showQr() {
  const run = () => {
    const el = document.createElement('div'); el.className = 'vqr'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = `${qrSvg(location.href, { ecl: 'M' }) || '<p>QR engine could not load</p>'}<h2>${esc(card.name || 'Digital card')}</h2><p>Point a phone camera here</p><button type="button">Close</button>`;
    const close = () => { el.remove(); try { wl && wl.release(); } catch (e) { /* ignore */ } };
    let wl = null;
    try { if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then((w) => { wl = w; }).catch(() => {}); } catch (e) { /* ignore */ }
    el.querySelector('button').addEventListener('click', close);
    el.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    document.body.appendChild(el); el.querySelector('button').focus();
  };
  whenQr(run);
}

function actions() {
  const tel = card.phones[0] ? cleanTel(card.phones[0]) : '';
  const wa = tel.replace(/\D/g, '');
  const quick = [];
  if (tel) quick.push(`<a class="vbtn" href="tel:${esc(tel)}">${ci('phone')}Call</a>`);
  if (wa.length >= 7) quick.push(`<a class="vbtn" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener noreferrer">${ci('chat')}WhatsApp</a>`);
  else if (tel) quick.push(`<a class="vbtn" href="sms:${esc(tel)}">${ci('sms')}Text</a>`);
  if (card.emails[0]) quick.push(`<a class="vbtn" href="mailto:${esc(encodeURI(card.emails[0]))}">${ci('mail')}Email</a>`);
  $('#acts').innerHTML =
    `<div class="vact" style="--n:1"><button class="vbtn big" type="button" id="bSave">${ci('save')}Save to contacts</button></div>` +
    (quick.length ? `<div class="vact" style="--n:${quick.length}">${quick.join('')}</div>` : '') +
    `<div class="vact" style="--n:2"><button class="vbtn" type="button" id="bQr">${ci('qr')}Show QR</button><button class="vbtn" type="button" id="bShare">${ci('share')}Share</button></div>` +
    (isIOS ? '<p class="vnote">On iPhone, “Save to contacts” opens the contact card. Tap <b>Create New Contact</b>.</p>' : '');
  $('#bSave').addEventListener('click', saveContact);
  $('#bQr').addEventListener('click', showQr);
  $('#bShare').addEventListener('click', share);
}

async function load() {
  const h = location.hash.replace(/^#/, '');
  if (!h) { empty('No card here yet', 'This page shows a digital card that lives inside its link. Make one in a minute.'); return; }
  try { card = await decodeCard(h); }
  catch (e) {
    if (e && e.message === 'nocompress') empty('Update your browser', 'This card needs a newer browser to open. Try Chrome or Safari 16.4+.');
    else empty('This link looks incomplete', 'Part of the card link got cut off. Ask for it again, or tap the tag once more.');
    return;
  }
  card = normalize(card);
  const t = themeOf(card).c;
  document.body.style.cssText = `--k1:${t[0]};--k2:${t[1]};--k3:${t[2]}`;
  document.title = (card.name || 'Digital card') + ' · Card';
  $('#card').innerHTML = renderCard(card, { live: true });
  actions();
}
load();
addEventListener('hashchange', load);
