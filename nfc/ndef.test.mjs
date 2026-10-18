// node nfc/ndef.test.mjs
import assert from 'node:assert/strict';
import * as N from './ndef.js';
import * as C from './card.js';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok  ' + name); };

await t('url record is abbreviated and sized right', () => {
  const rec = [{ recordType: 'url', data: 'https://example.com' }];
  const b = N.serialize(rec);
  // header, typelen, payloadlen, 'U', code 0x04, 'example.com'
  assert.equal(b[0], 0xd1); assert.equal(b[3], 0x55); assert.equal(b[4], 0x04);
  assert.equal(b.length, 4 + 1 + 'example.com'.length);
  assert.equal(N.messageSize(rec), b.length);
  assert.equal(N.uriPayload('https://www.x.org')[0], 0x02);
  assert.equal(N.uriPayload('tel:+1555')[0], 0x05);
  assert.equal(N.uriPayload('geo:1,2')[0], 0x00);
});

await t('text record layout + roundtrip', () => {
  const b = N.serialize([{ recordType: 'text', data: 'héllo', lang: 'fr' }]);
  const recs = N.parseNdef(b);
  assert.equal(recs.length, 1);
  const w = N.rawToWeb(recs[0]);
  assert.equal(w.recordType, 'text'); assert.equal(w.lang, 'fr');
  const d = N.decodeRecord(w);
  assert.equal(d.kind, 'text'); assert.equal(d.value, 'héllo'); assert.equal(d.lang, 'fr');
});

await t('multi-record flags MB/ME and long payloads', () => {
  const recs = [{ recordType: 'text', data: 'a' }, { recordType: 'mime', mediaType: 'text/plain', data: new Uint8Array(300) }, { recordType: 'url', data: 'https://a.b' }];
  const b = N.serialize(recs);
  const p = N.parseNdef(b);
  assert.equal(p.length, 3);
  assert.equal(p[1].payload.length, 300);
  assert.ok(b[0] & 0x80); assert.ok(!(b[0] & 0x40));
  assert.equal(N.rawToWeb(p[2]).recordType, 'url');
});

await t('wifi WSC roundtrip', () => {
  const bytes = N.encodeWsc({ ssid: 'Café Net', pass: 'p@ss;word', sec: 'WPA' });
  const w = N.decodeWsc(bytes);
  assert.equal(w.ssid, 'Café Net'); assert.equal(w.pass, 'p@ss;word'); assert.equal(w.sec, 'WPA');
  assert.equal(N.decodeWsc(N.encodeWsc({ ssid: 'x', sec: 'nopass' })).sec, 'Open');
  const d = N.decodeRecord({ recordType: 'mime', mediaType: 'application/vnd.wfa.wsc', data: bytes });
  assert.equal(d.kind, 'wifi'); assert.match(d.qr, /^WIFI:T:WPA;S:Café Net;P:p@ss\\;word;;$/);
});

await t('builders validate and build', () => {
  assert.throws(() => N.TYPES.url.build({ url: '' }));
  assert.equal(N.TYPES.url.build({ url: 'szvtech.org/nfc' })[0].data, 'https://szvtech.org/nfc');
  assert.equal(N.TYPES.phone.build({ num: '(555) 123-4567' })[0].data, 'tel:5551234567');
  assert.equal(N.TYPES.sms.build({ num: '+1 555', msg: 'hi there' })[0].data, 'sms:+1555?body=hi%20there');
  assert.equal(N.TYPES.email.build({ to: 'a@b.co', subject: 'S & T' })[0].data, 'mailto:a@b.co?subject=S%20%26%20T');
  assert.equal(N.TYPES.geo.build({ lat: '40.7128', lon: '-74.006' })[0].data, 'geo:40.7128,-74.006');
  assert.throws(() => N.TYPES.geo.build({ lat: '99', lon: '0' }));
  assert.equal(N.TYPES.whatsapp.build({ num: '+1 (555) 000', msg: 'yo' })[0].data, 'https://wa.me/1555000?text=yo');
  assert.equal(N.TYPES.app.build({ pkg: 'com.whatsapp' })[0].recordType, 'android.com:pkg');
  assert.throws(() => N.TYPES.app.build({ pkg: 'nope' }));
  assert.equal(N.TYPES.social.build({ kind: 'github', handle: '@octo' })[0].data, 'https://github.com/octo');
  assert.equal(N.TYPES.empty.build({})[0].recordType, 'empty');
});

await t('draft size, capacities and raw clone items', () => {
  const items = [{ type: 'url', fields: { url: 'https://example.com' } }, { type: 'text', fields: {} }];
  const s = N.draftSize(items);
  assert.equal(s.records.length, 1);
  assert.ok(s.bytes > 10 && s.bytes < 30);
  assert.ok(N.fits(100, 144)); assert.ok(!N.fits(142, 144)); assert.ok(!N.fits(60, 48));
  const rec = { recordType: 'mime', mediaType: 'text/plain', data: new TextEncoder().encode('zz') };
  const raw = N.webToRawItem(rec);
  const back = N.itemRecords(JSON.parse(JSON.stringify(raw)));
  assert.equal(N.fromUtf8(back[0].data), 'zz'); assert.equal(back[0].mediaType, 'text/plain');
});

await t('decode: tel/mail/geo/http/vcard/app/unknown/poster', () => {
  const D = (r) => N.decodeRecord(r);
  const u = (x) => D({ recordType: 'url', data: new TextEncoder().encode(x) });
  assert.equal(u('tel:+1555').kind, 'phone');
  assert.equal(u('mailto:a%20b@c.d?subject=x').title, 'a b@c.d');
  assert.equal(u('geo:1.5,2.5').kind, 'geo');
  assert.equal(u('https://www.example.com/x').title, 'example.com');
  assert.equal(u('javascript:alert(1)').href, '');
  const v = D({ recordType: 'mime', mediaType: 'text/vcard', data: N.utf8('BEGIN:VCARD\r\nFN:Ada L\r\nEND:VCARD') });
  assert.equal(v.kind, 'contact'); assert.equal(v.title, 'Ada L');
  assert.equal(D({ recordType: 'android.com:pkg', data: N.utf8('com.x.y') }).kind, 'app');
  assert.equal(D({ recordType: 'unknown', data: Uint8Array.of(1, 2, 255) }).value, '01 02 FF');
  const sp = N.serialize([{ recordType: 'text', data: 'Menu' }, { recordType: 'url', data: 'https://m.example' }]);
  const p = D({ recordType: 'smart-poster', data: new DataView(sp.buffer) });
  assert.equal(p.kind, 'poster'); assert.equal(p.title, 'Menu'); assert.equal(p.value, 'https://m.example');
  assert.equal(N.summarize([{ recordType: 'url', data: N.utf8('https://a.io') }, { recordType: 'empty' }]), 'a.io +1');
});

await t('card pack/unpack + normalize clamps', () => {
  const c = { name: '  Ada Lovelace ', title: 'Engineer', org: 'Analytical', phones: ['+1 555 0100', ''], emails: ['ada@x.io'], web: 'x.io', addr: '1 Main St', bio: 'Hi', socials: [{ k: 'github', h: '@ada' }, { k: 'bogus', h: 'zz' }, { k: 'x', h: '' }], theme: 99 };
  const n1 = C.normalize(c);
  assert.equal(n1.name, 'Ada Lovelace'); assert.equal(n1.theme, 5); assert.equal(n1.socials.length, 2); assert.equal(n1.socials[1].k, 'instagram');
  assert.deepEqual(C.unpack(C.pack(c)), n1);
  const cp = C.pack(c, true); assert.ok(!cp.b && !cp.a);
});

await t('card encode/decode roundtrip (compressed and plain)', async () => {
  const c = { name: 'Ada Lovelace', title: 'Engineer', org: 'Analytical Engines Ltd', phones: ['+1 555 0100'], emails: ['ada@example.com'], web: 'example.com', addr: '12 Analytical St, London', bio: 'I write the first programs. '.repeat(6), socials: [{ k: 'linkedin', h: 'ada' }], theme: 2 };
  const enc = await C.encodeCard(c);
  assert.match(enc, /^[zj][\w-]+$/);
  assert.deepEqual(await C.decodeCard('#' + enc), C.normalize(c));
  const plain = 'j' + C.b64u(new TextEncoder().encode(JSON.stringify(C.pack(c))));
  assert.deepEqual(await C.decodeCard(plain), C.normalize(c));
  const short = await C.encodeCard(c, { compact: true });
  assert.ok(short.length < enc.length);
  await assert.rejects(() => C.decodeCard('zzzz'));
  await assert.rejects(() => C.decodeCard(''));
  await assert.rejects(() => C.decodeCard('x123'));
  const url = C.cardUrl('https://www.szvtech.org', enc);
  console.log('     full card url', url.length, 'chars; compact', C.cardUrl('https://www.szvtech.org', short).length);
});

await t('vcard + safe links', () => {
  const v = C.cardToVcard({ name: 'Ada Q. Lovelace', org: 'A, B; Co', phones: ['+1 (555) 010-0'], emails: ['a@b.c'], web: 'b.c', socials: [{ k: 'github', h: 'ada' }, { k: 'whatsapp', h: '+1 555' }], bio: 'line1\nline2' });
  assert.match(v, /^BEGIN:VCARD\r\nVERSION:3.0\r\nN:Lovelace;Ada Q\.;;;\r\nFN:Ada Q\. Lovelace/);
  assert.match(v, /ORG:A\\, B\\; Co/); assert.match(v, /TEL;TYPE=CELL:\+15550100/); assert.match(v, /URL:https:\/\/github.com\/ada/);
  assert.match(v, /URL:https:\/\/wa.me\/1555/); assert.match(v, /NOTE:line1\\nline2/); assert.ok(v.endsWith('END:VCARD'));
  assert.equal(C.webHref('javascript:alert(1)'), '');
  assert.equal(C.webHref('example.com/a b'), 'https://example.com/a%20b');
  assert.equal(C.socialHref('x', 'javascript:1'), 'https://x.com/javascript%3A1');
  assert.equal(C.cardInitials({ name: 'ada king lovelace' }), 'AL');
});

console.log(`\n${n} groups passed`);
