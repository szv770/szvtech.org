// /nfc — pure NDEF logic: record builders, size maths, decoding, Wi-Fi (WSC).
// No DOM and no imports, so it runs in Node for tests.

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8');
export const utf8 = (s) => enc.encode(String(s == null ? '' : s));
export const fromUtf8 = (b) => dec.decode(b);

export function bytesOf(d) {
  if (d == null) return new Uint8Array(0);
  if (typeof d === 'string') return utf8(d);
  if (d instanceof Uint8Array) return d;
  if (d instanceof ArrayBuffer) return new Uint8Array(d);
  if (ArrayBuffer.isView(d)) return new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
  return new Uint8Array(0);
}
export const toHex = (b, sep = ' ') => Array.from(bytesOf(b), (x) => x.toString(16).padStart(2, '0')).join(sep).toUpperCase();
export function b64(bytes) { let s = ''; const u = bytesOf(bytes); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }
export function unb64(str) { const s = atob(str); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }

/* ---------- chip capacities (approximate NDEF message room) ---------- */
export const CAPACITIES = [
  { id: 'ul', name: 'Ultralight', bytes: 48 },
  { id: 'n213', name: 'NTAG213', bytes: 144 },
  { id: 'n215', name: 'NTAG215', bytes: 504 },
  { id: 'm1k', name: 'Mifare 1K', bytes: 716 },
  { id: 'n216', name: 'NTAG216', bytes: 888 },
];
// TLV wrapper: 0x03, length (1 byte, or 3 when >= 255), message, 0xFE terminator
export const tlvOverhead = (msgLen) => (msgLen >= 255 ? 5 : 3);
export function fits(msgLen, cap) { return msgLen + tlvOverhead(msgLen) <= cap; }

/* ---------- URI prefix table (NFC Forum URI RTD) ---------- */
export const URI_PREFIXES = ['', 'http://www.', 'https://www.', 'http://', 'https://', 'tel:', 'mailto:', 'ftp://anonymous:anonymous@', 'ftp://ftp.', 'ftps://', 'sftp://', 'smb://', 'nfs://', 'ftp://', 'dav://', 'news:', 'telnet://', 'imap:', 'rtsp://', 'urn:', 'pop:', 'sip:', 'sips:', 'tftp:', 'btspp://', 'btl2cap://', 'btgoep://', 'tcpobex://', 'irdaobex://', 'file://', 'urn:epc:id:', 'urn:epc:tag:', 'urn:epc:pat:', 'urn:epc:raw:', 'urn:epc:', 'urn:nfc:'];
export function uriPayload(url) {
  const s = String(url);
  let best = 0;
  for (let i = 1; i < URI_PREFIXES.length; i++) if (s.startsWith(URI_PREFIXES[i]) && URI_PREFIXES[i].length > URI_PREFIXES[best].length) best = i;
  const rest = utf8(s.slice(URI_PREFIXES[best].length));
  const out = new Uint8Array(rest.length + 1);
  out[0] = best; out.set(rest, 1);
  return out;
}

/* ---------- Web NFC style record  ->  { tnf, type, id, payload } ---------- */
const TNF = { empty: 0, wellKnown: 1, mime: 2, absUri: 3, external: 4, unknown: 5 };
export function toRaw(rec) {
  const t = rec.recordType;
  const id = rec.id ? utf8(rec.id) : new Uint8Array(0);
  switch (t) {
    case 'empty': return { tnf: TNF.empty, type: new Uint8Array(0), id, payload: new Uint8Array(0) };
    case 'text': {
      const lang = utf8(rec.lang || 'en').slice(0, 63);
      const body = bytesOf(rec.data);
      const p = new Uint8Array(1 + lang.length + body.length);
      p[0] = lang.length; p.set(lang, 1); p.set(body, 1 + lang.length);
      return { tnf: TNF.wellKnown, type: utf8('T'), id, payload: p };
    }
    case 'url': return { tnf: TNF.wellKnown, type: utf8('U'), id, payload: uriPayload(fromUtf8(bytesOf(rec.data))) };
    case 'absolute-url': return { tnf: TNF.absUri, type: bytesOf(rec.data), id, payload: new Uint8Array(0) };
    case 'mime': return { tnf: TNF.mime, type: utf8(rec.mediaType || 'application/octet-stream'), id, payload: bytesOf(rec.data) };
    case 'unknown': return { tnf: TNF.unknown, type: new Uint8Array(0), id, payload: bytesOf(rec.data) };
    default: return { tnf: TNF.external, type: utf8(t), id, payload: bytesOf(rec.data) };
  }
}

export function serialize(records) {
  const raws = records.map(toRaw);
  const parts = [];
  raws.forEach((r, i) => {
    const sr = r.payload.length < 256;
    const il = r.id.length > 0;
    const hdr = (i === 0 ? 0x80 : 0) | (i === raws.length - 1 ? 0x40 : 0) | (sr ? 0x10 : 0) | (il ? 0x08 : 0) | r.tnf;
    const h = [hdr, r.type.length];
    if (sr) h.push(r.payload.length); else h.push((r.payload.length >>> 24) & 255, (r.payload.length >>> 16) & 255, (r.payload.length >>> 8) & 255, r.payload.length & 255);
    if (il) h.push(r.id.length);
    parts.push(Uint8Array.from(h), r.type, r.id, r.payload);
  });
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
export const messageSize = (records) => (records && records.length ? serialize(records).length : 0);

/* ---------- parse raw NDEF bytes ---------- */
export function parseNdef(bytes) {
  const b = bytesOf(bytes); const out = []; let i = 0;
  while (i < b.length) {
    const h = b[i++]; const sr = !!(h & 0x10), il = !!(h & 0x08), tnf = h & 7;
    const tl = b[i++];
    let pl;
    if (sr) pl = b[i++]; else { pl = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0; i += 4; }
    const il2 = il ? b[i++] : 0;
    if (i + tl + il2 + pl > b.length) throw new Error('truncated NDEF');
    out.push({ tnf, type: fromUtf8(b.slice(i, i + tl)), typeBytes: b.slice(i, i + tl), id: fromUtf8(b.slice(i + tl, i + tl + il2)), payload: b.slice(i + tl + il2, i + tl + il2 + pl) });
    i += tl + il2 + pl;
    if (h & 0x40) break;
  }
  return out;
}
// raw -> Web NFC style (what NDEFReader would give us)
export function rawToWeb(r) {
  const data = r.payload;
  const mk = (o) => ({ id: r.id || undefined, ...o });
  if (r.tnf === 0) return mk({ recordType: 'empty' });
  if (r.tnf === 1 && r.type === 'T') {
    const st = data[0]; const ln = st & 63;
    return mk({ recordType: 'text', lang: fromUtf8(data.slice(1, 1 + ln)), encoding: st & 128 ? 'utf-16' : 'utf-8', data: data.slice(1 + ln) });
  }
  if (r.tnf === 1 && r.type === 'U') return mk({ recordType: 'url', data: utf8((URI_PREFIXES[data[0]] || '') + fromUtf8(data.slice(1))) });
  if (r.tnf === 1 && r.type === 'Sp') return mk({ recordType: 'smart-poster', data });
  if (r.tnf === 2) return mk({ recordType: 'mime', mediaType: r.type, data });
  if (r.tnf === 3) return mk({ recordType: 'absolute-url', data: r.typeBytes });
  if (r.tnf === 4) return mk({ recordType: r.type, data });
  return mk({ recordType: 'unknown', data });
}

/* ---------- Wi-Fi Simple Configuration (what Android reads from a tag) ---------- */
const tlv = (type, bytes) => { const b = bytesOf(bytes); const o = new Uint8Array(4 + b.length); o[0] = type >> 8; o[1] = type & 255; o[2] = b.length >> 8; o[3] = b.length & 255; o.set(b, 4); return o; };
const cat = (...a) => { const n = a.reduce((x, y) => x + y.length, 0); const o = new Uint8Array(n); let k = 0; for (const p of a) { o.set(p, k); k += p.length; } return o; };
const u16 = (v) => Uint8Array.of(v >> 8, v & 255);
export const WSC_AUTH = { nopass: 0x0001, WEP: 0x0001, WPA: 0x0022, WPA2: 0x0020, WPA3: 0x0040 };
export const WSC_ENC = { nopass: 0x0001, WEP: 0x0002, WPA: 0x000c, WPA2: 0x0008, WPA3: 0x0008 };
export function encodeWsc({ ssid, pass = '', sec = 'WPA' }) {
  const s = sec === 'WEP' || sec === 'nopass' || sec === 'WPA2' || sec === 'WPA3' ? sec : 'WPA';
  const cred = cat(
    tlv(0x1026, Uint8Array.of(1)),
    tlv(0x1045, utf8(ssid)),
    tlv(0x1003, u16(WSC_AUTH[s])),
    tlv(0x100f, u16(WSC_ENC[s])),
    tlv(0x1027, s === 'nopass' ? new Uint8Array(0) : utf8(pass)),
    tlv(0x1020, Uint8Array.of(255, 255, 255, 255, 255, 255)),
  );
  return cat(tlv(0x104a, Uint8Array.of(0x10)), tlv(0x100e, cred));
}
export function decodeWsc(bytes) {
  const b = bytesOf(bytes); const out = {};
  const walk = (u) => {
    let i = 0;
    while (i + 4 <= u.length) {
      const t = (u[i] << 8) | u[i + 1]; const l = (u[i + 2] << 8) | u[i + 3];
      const v = u.slice(i + 4, i + 4 + l); i += 4 + l;
      if (t === 0x100e) walk(v);
      else if (t === 0x1045) out.ssid = fromUtf8(v);
      else if (t === 0x1027) out.pass = fromUtf8(v);
      else if (t === 0x1003) out.auth = (v[0] << 8) | v[1];
      else if (t === 0x100f) out.encr = (v[0] << 8) | v[1];
    }
  };
  walk(b);
  const a = out.auth || 0;
  out.sec = out.ssid == null ? '' : a === 0x0022 ? 'WPA' : a & 0x0040 ? 'WPA3' : a & 0x0020 ? 'WPA2' : a & 0x0002 ? 'WPA' : a & 0x0008 || a & 0x0010 ? 'Enterprise' : out.encr === 0x0002 ? 'WEP' : out.encr === 0x0001 || (!out.pass && a === 1) ? 'Open' : 'WPA';
  return out;
}

/* ---------- builders: form fields -> Web NFC write records ---------- */
export const cleanPhone = (s) => String(s || '').trim().replace(/[^\d+*#,;]/g, '');
export function normUrl(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^[^\s/]+:\d+(\/|$)/.test(t)) return t;
  return 'https://' + t.replace(/^\/\//, '');
}
const q = encodeURIComponent;

export const SOCIALS = [
  { id: 'instagram', name: 'Instagram', base: 'https://instagram.com/' },
  { id: 'linkedin', name: 'LinkedIn', base: 'https://www.linkedin.com/in/' },
  { id: 'x', name: 'X', base: 'https://x.com/' },
  { id: 'facebook', name: 'Facebook', base: 'https://facebook.com/' },
  { id: 'tiktok', name: 'TikTok', base: 'https://www.tiktok.com/@' },
  { id: 'youtube', name: 'YouTube', base: 'https://youtube.com/@' },
  { id: 'github', name: 'GitHub', base: 'https://github.com/' },
  { id: 'telegram', name: 'Telegram', base: 'https://t.me/' },
  { id: 'snapchat', name: 'Snapchat', base: 'https://www.snapchat.com/add/' },
];
export function socialUrl(kind, handle) {
  const h = String(handle || '').trim();
  if (!h) return '';
  if (/^https?:\/\//i.test(h)) return h;
  const s = SOCIALS.find((x) => x.id === kind) || SOCIALS[0];
  return s.base + q(h.replace(/^@/, '')).replace(/%2F/gi, '/');
}

// Record types offered by the Write tab. `fields` describe the form; `build` returns records or throws a friendly Error.
const need = (v, msg) => { if (!String(v == null ? '' : v).trim()) throw new Error(msg); };
const urlRec = (u) => ({ recordType: 'url', data: u });
export const TYPES = {
  url: { name: 'Link', build: (f) => { need(f.url, 'Type a link'); return [urlRec(normUrl(f.url))]; } },
  text: { name: 'Text', build: (f) => { need(f.text, 'Type some text'); return [{ recordType: 'text', data: String(f.text), lang: (f.lang || 'en').trim() || 'en' }]; } },
  contact: { name: 'Contact', build: (f) => { need(f.vcf, 'Add a name, phone or email'); return [{ recordType: 'mime', mediaType: 'text/vcard', data: utf8(f.vcf) }]; } },
  phone: { name: 'Call', build: (f) => { const n = cleanPhone(f.num); need(n, 'Type a phone number'); return [urlRec('tel:' + n)]; } },
  sms: { name: 'Text message', build: (f) => { const n = cleanPhone(f.num); need(n, 'Type a phone number'); return [urlRec('sms:' + n + (String(f.msg || '').trim() ? '?body=' + q(f.msg) : ''))]; } },
  email: { name: 'Email', build: (f) => {
    need(f.to, 'Type an email address');
    const p = []; if (String(f.subject || '').trim()) p.push('subject=' + q(f.subject)); if (String(f.body || '').trim()) p.push('body=' + q(f.body));
    return [urlRec('mailto:' + String(f.to).trim() + (p.length ? '?' + p.join('&') : ''))];
  } },
  wifi: { name: 'Wi-Fi', build: (f) => {
    need(f.ssid, 'Type the network name');
    const sec = f.sec || 'WPA';
    if (sec !== 'nopass') need(f.pass, 'Type the Wi-Fi password');
    return [{ recordType: 'mime', mediaType: 'application/vnd.wfa.wsc', data: encodeWsc({ ssid: f.ssid, pass: f.pass, sec }) }];
  } },
  geo: { name: 'Location', build: (f) => {
    const la = parseFloat(f.lat), lo = parseFloat(f.lon);
    if (!isFinite(la) || !isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) throw new Error('Type a latitude and longitude');
    return [urlRec(`geo:${+la.toFixed(6)},${+lo.toFixed(6)}`)];
  } },
  whatsapp: { name: 'WhatsApp', build: (f) => {
    const n = String(f.num || '').replace(/\D/g, ''); need(n, 'Type a phone number with country code');
    return [urlRec('https://wa.me/' + n + (String(f.msg || '').trim() ? '?text=' + q(f.msg) : ''))];
  } },
  social: { name: 'Social', build: (f) => { need(f.handle, 'Type a username or link'); return [urlRec(socialUrl(f.kind, f.handle))]; } },
  app: { name: 'Android app', build: (f) => {
    const p = String(f.pkg || '').trim();
    if (!/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(p)) throw new Error('Type a package name like com.whatsapp');
    return [{ recordType: 'android.com:pkg', data: utf8(p) }];
  } },
  mime: { name: 'Custom data', build: (f) => {
    const m = String(f.mime || '').trim().toLowerCase();
    if (!/^[a-z0-9][\w.+-]*\/[a-z0-9][\w.+-]*$/.test(m)) throw new Error('Type a type like text/plain');
    need(f.data, 'Type the data');
    return [{ recordType: 'mime', mediaType: m, data: utf8(f.data) }];
  } },
  empty: { name: 'Empty', build: () => [{ recordType: 'empty' }] },
};

// A draft item is { type, fields } or { type:'raw', raw:{recordType, mediaType, lang, b64} } (cloned from a real tag).
export function itemRecords(item) {
  if (item.type === 'raw') {
    const r = item.raw;
    return [{ recordType: r.recordType, mediaType: r.mediaType, lang: r.lang, data: r.recordType === 'empty' ? undefined : unb64(r.b64 || '') }];
  }
  const t = TYPES[item.type];
  if (!t) throw new Error('Unknown type');
  return t.build(item.fields || {});
}
export function draftRecords(items) {
  const out = [];
  for (const it of items) out.push(...itemRecords(it));
  // an "empty" record only makes sense on its own
  return out.length > 1 ? out.filter((r) => r.recordType !== 'empty') : out;
}
// size of a draft, tolerating incomplete items (they count 0)
export function draftSize(items) {
  let recs = [];
  for (const it of items) { try { recs = recs.concat(itemRecords(it)); } catch (e) { /* incomplete */ } }
  return { records: recs, bytes: recs.length ? messageSize(recs) : 0 };
}
// Web NFC reader record -> storable raw item
export function webToRawItem(rec) {
  const d = bytesOf(rec.data);
  return { type: 'raw', raw: { recordType: rec.recordType, mediaType: rec.mediaType || undefined, lang: rec.lang || undefined, b64: b64(d) } };
}

/* ---------- decode (Read tab) ---------- */
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
export function describeUrl(u) {
  const m = SCHEME.exec(u); const sc = m ? m[1].toLowerCase() : '';
  if (sc === 'tel') return { kind: 'phone', label: 'Phone number', title: u.slice(4), href: u };
  if (sc === 'sms' || sc === 'smsto') return { kind: 'sms', label: 'Text message', title: u.replace(/^[a-z]+:/i, '').split(/[?:]/)[0], href: u };
  if (sc === 'mailto') return { kind: 'email', label: 'Email', title: safeDec(u.slice(7).split('?')[0]), href: u };
  if (sc === 'geo') return { kind: 'geo', label: 'Location', title: u.slice(4).split(/[;?]/)[0], href: 'https://www.google.com/maps/search/?api=1&query=' + u.slice(4).split(/[;?]/)[0] };
  if (sc === 'http' || sc === 'https') {
    let host = u; try { host = new URL(u).hostname.replace(/^www\./, ''); } catch (e) { /* keep */ }
    return { kind: 'url', label: 'Link', title: host, href: u, web: true };
  }
  return { kind: 'url', label: sc ? sc + ' link' : 'Link', title: u, href: /^(javascript|data|vbscript|file|blob):/i.test(u) ? '' : u };
}
const safeDec = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };

export function decodeRecord(rec) {
  const d = bytesOf(rec.data); const t = rec.recordType;
  const base = { type: t, bytes: d.length, id: rec.id || '', mediaType: rec.mediaType || '' };
  if (t === 'empty') return { ...base, kind: 'empty', label: 'Empty record', title: 'Nothing here', value: '' };
  if (t === 'text') {
    let text; try { text = new TextDecoder(rec.encoding || 'utf-8').decode(d); } catch (e) { text = fromUtf8(d); }
    return { ...base, kind: 'text', label: 'Text', title: text, value: text, lang: rec.lang || '' };
  }
  if (t === 'url' || t === 'absolute-url') {
    const u = fromUtf8(d);
    return { ...base, ...describeUrl(u), value: u, qr: u, isUrl: true };
  }
  if (t === 'smart-poster') {
    let kids = []; try { kids = parseNdef(d).map(rawToWeb).map(decodeRecord); } catch (e) { /* ignore */ }
    const u = kids.find((k) => k.isUrl); const tx = kids.find((k) => k.kind === 'text');
    return { ...base, kind: 'poster', label: 'Smart poster', title: (tx && tx.value) || (u && u.title) || 'Smart poster', value: u ? u.value : '', href: u && u.href, qr: u && u.value, isUrl: !!u, children: kids };
  }
  if (t === 'mime') {
    const mt = (rec.mediaType || '').toLowerCase();
    if (mt === 'application/vnd.wfa.wsc') {
      const w = decodeWsc(d);
      return { ...base, kind: 'wifi', label: 'Wi-Fi network', title: w.ssid || 'Wi-Fi network', value: w.pass || '', wifi: w, qr: w.ssid ? `WIFI:T:${w.sec === 'Open' ? 'nopass' : w.sec === 'WEP' ? 'WEP' : 'WPA'};S:${escWifi(w.ssid)};P:${escWifi(w.pass || '')};;` : '' };
    }
    if (mt === 'text/vcard' || mt === 'text/x-vcard' || mt === 'text/directory') {
      const vcf = fromUtf8(d);
      return { ...base, kind: 'contact', label: 'Contact card', title: (/^FN[^:]*:(.+)$/im.exec(vcf) || [])[1] || 'Contact', value: vcf, vcf, qr: vcf };
    }
    if (mt.startsWith('text/')) { const s = fromUtf8(d); return { ...base, kind: 'text', label: 'Text (' + mt + ')', title: s, value: s }; }
    if (mt === 'application/json') { const s = fromUtf8(d); return { ...base, kind: 'text', label: 'JSON data', title: s, value: s }; }
    return { ...base, kind: 'mime', label: 'Data · ' + (mt || 'unknown'), title: mt || 'Data', value: toHex(d.slice(0, 64)) + (d.length > 64 ? ' …' : ''), hex: true };
  }
  if (t === 'android.com:pkg') { const p = fromUtf8(d); return { ...base, kind: 'app', label: 'Android app', title: p, value: p, href: 'https://play.google.com/store/apps/details?id=' + encodeURIComponent(p) }; }
  if (t === 'unknown') return { ...base, kind: 'unknown', label: 'Unknown data', title: d.length + ' bytes', value: toHex(d.slice(0, 64)) + (d.length > 64 ? ' …' : ''), hex: true };
  return { ...base, kind: 'external', label: 'Custom · ' + t, title: t, value: looksText(d) ? fromUtf8(d) : toHex(d.slice(0, 64)) + (d.length > 64 ? ' …' : ''), hex: !looksText(d) };
}
function looksText(d) { if (!d.length) return false; for (const c of d) if (c < 9 || (c > 13 && c < 32) || c === 127) return false; return true; }
export const escWifi = (s) => String(s || '').replace(/([\\;,:"])/g, '\\$1');

// short one-line summary for lists (history / library)
export function summarize(recs) {
  if (!recs || !recs.length) return 'Empty tag';
  const d = recs.map((r) => (r.kind ? r : decodeRecord(r)));
  const first = d[0];
  const s = first.kind === 'empty' ? 'Empty' : first.kind === 'wifi' ? 'Wi-Fi · ' + first.title : first.kind === 'contact' ? 'Contact · ' + first.title : first.kind === 'app' ? 'App · ' + first.title : (first.title || first.label);
  const clip = s.length > 60 ? s.slice(0, 57) + '…' : s;
  return d.length > 1 ? clip + ' +' + (d.length - 1) : clip;
}
