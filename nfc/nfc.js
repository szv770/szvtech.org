// /nfc — NFC Station. Bootstrap: tabs, capability pill, "How NFC works", wiring.
import { $, esc, store } from '/nfc/ui.js';
import { initRouter, goTab } from '/nfc/router.js';
import { showSheet, sheet } from '/nfc/ops.js';
import { initRead } from '/nfc/read.js';
import { initWrite } from '/nfc/write.js';
import { initCard } from '/nfc/cardtab.js';
import { initLib, capSummary } from '/nfc/libtab.js';

function capPill() {
  const s = capSummary();
  $('#capDot').className = 'dotc ' + s.c;
  $('#capTxt').textContent = s.t;
}

function infoSheet() {
  showSheet(`<p class="eyebrow">How NFC works</p><h2 class="g">A tag is a tiny sticker with a note inside</h2>
    <p>An NFC tag has no battery. When your phone touches it, the phone’s signal powers the tag for a split second, long enough to read what’s written there. That note is usually a <b>link</b>, some <b>text</b>, a <b>contact</b>, or a <b>Wi-Fi login</b>.</p>
    <details class="acc" open><summary>Reading a tag<svg class="ic"><use href="#i-down"/></svg></summary><p>Hold the back of the phone against the tag for a second. Android needs NFC switched on. iPhones (XS and newer) read tags automatically with the screen on.</p></details>
    <details class="acc"><summary>Writing a tag<svg class="ic"><use href="#i-down"/></svg></summary><p>Pick what it should do, press <b>Write to tag</b>, then touch the tag. This part works on <b>Android with Chrome</b> only. Apple doesn’t allow websites to write tags.</p></details>
    <details class="acc"><summary>Your digital card<svg class="ic"><use href="#i-down"/></svg></summary><p>The card isn’t stored on a server. All of it is packed into one link. Write that link to a tag (or show its QR code). When a friend taps, their phone opens the link and shows your card, with a one-tap “Save to contacts”. It works on iPhone and Android alike.</p></details>
    <details class="acc"><summary>Why can’t my phone be the tag?<svg class="ic"><use href="#i-down"/></svg></summary><p>Websites can’t make a phone act like a tag. So write your link to a sticker, card or keyring once, and that object does the job. Or show the QR code on screen.</p></details>
    <details class="acc"><summary>Is it private?<svg class="ic"><use href="#i-down"/></svg></summary><p>Yes. Nothing is sent anywhere. Your cards, saved tags and scan history live only in this browser. Anyone who touches a tag can read what’s on it, so never write secrets to one.</p></details>
    <div class="btn-row"><button class="btn" type="button" data-close>Got it</button></div>`);
}

function boot() {
  initRouter();
  initRead(); initWrite(); initCard(); initLib();
  capPill();
  $('#capPill').addEventListener('click', () => { goTab('tools'); setTimeout(() => $('#capCard').scrollIntoView({ block: 'center' }), 60); });
  $('#infoBtn').addEventListener('click', infoSheet);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheet.isOpen) sheet.close();
  });
}
boot();
