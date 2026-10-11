// /qr — pure helpers: payload builders, scan parsing, QR matrix → vector paths.
// No DOM here so it can be tested in Node.

/* ======================================================================
   payloads (Make)
   ====================================================================== */
// Wi-Fi / MECARD escaping: backslash, semicolon, comma, colon, double quote
export const escWifi = (s) => String(s || '').replace(/([\\;,:"])/g, '\\$1');
// vCard 3.0 text escaping
export const escVcard = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');

const trim = (s) => String(s == null ? '' : s).trim();
const cleanPhone = (s) => trim(s).replace(/[^\d+*#,;pw]/gi, '');

export const TYPES = ['text', 'wifi', 'contact', 'email', 'sms', 'phone', 'geo'];

export function buildPayload(type, f = {}) {
  switch (type) {
    case 'wifi': {
      const ssid = String(f.ssid || '');
      if (!ssid.trim()) return '';
      const sec = f.sec === 'WEP' ? 'WEP' : f.sec === 'nopass' ? 'nopass' : 'WPA';
      let s = `WIFI:T:${sec};S:${escWifi(ssid)};`;
      if (sec !== 'nopass') s += `P:${escWifi(f.pass || '')};`;
      if (f.hidden) s += 'H:true;';
      return s + ';';
    }
    case 'contact': {
      const first = trim(f.first), last = trim(f.last);
      const fn = [first, last].filter(Boolean).join(' ');
      const org = trim(f.org), tel = trim(f.tel), email = trim(f.email), title = trim(f.title), url = trim(f.url);
      if (!fn && !org && !tel && !email) return '';
      const L = ['BEGIN:VCARD', 'VERSION:3.0'];
      L.push(`N:${escVcard(last)};${escVcard(first)};;;`);
      L.push(`FN:${escVcard(fn || org || tel || email)}`);
      if (org) L.push(`ORG:${escVcard(org)}`);
      if (title) L.push(`TITLE:${escVcard(title)}`);
      if (tel) L.push(`TEL;TYPE=CELL:${escVcard(tel)}`);
      if (email) L.push(`EMAIL:${escVcard(email)}`);
      if (url) L.push(`URL:${escVcard(url)}`);
      L.push('END:VCARD');
      return L.join('\r\n');
    }
    case 'email': {
      const to = trim(f.to);
      const q = [];
      if (trim(f.subject)) q.push('subject=' + encodeURIComponent(trim(f.subject)));
      if (String(f.body || '').trim()) q.push('body=' + encodeURIComponent(String(f.body)));
      if (!to && !q.length) return '';
      return 'mailto:' + to.replace(/[^\w.!#$%&'*+\-/=?^`{|}~@,]/g, encodeURIComponent) + (q.length ? '?' + q.join('&') : '');
    }
    case 'sms': {
      const n = cleanPhone(f.num), m = String(f.msg || '');
      if (!n && !m.trim()) return '';
      return `SMSTO:${n}:${m}`;
    }
    case 'phone': {
      const n = cleanPhone(f.num);
      return n ? 'tel:' + n : '';
    }
    case 'geo': {
      const la = parseFloat(f.lat), lo = parseFloat(f.lon);
      if (!isFinite(la) || !isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return '';
      const r = (x) => String(+x.toFixed(6));
      return `geo:${r(la)},${r(lo)}`;
    }
    default:
      return String(f.text || '');
  }
}

export function utf8Len(s) { return new TextEncoder().encode(s).length; }

/* ======================================================================
   parsing (Scan)
   ====================================================================== */
// split "K:v;K:v;" honoring backslash escapes
function splitEscaped(s, sep) {
  const out = []; let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) { cur += s[++i]; continue; }
    if (c === sep) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}
function rawFields(body) {
  // keep escapes until we know the key, so split on unescaped ';'
  const parts = []; let cur = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\\' && i + 1 < body.length) { cur += c + body[++i]; continue; }
    if (c === ';') { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur) parts.push(cur);
  const o = {};
  for (const p of parts) {
    const k = p.indexOf(':');
    if (k < 1) continue;
    const key = p.slice(0, k).toUpperCase();
    const val = splitEscaped(p.slice(k + 1), '\u0000').join('');
    if (!(key in o)) o[key] = val; else (o['_' + key] = o['_' + key] || []).push(val);
  }
  return o;
}

export function parseWifi(s) {
  const o = rawFields(s.replace(/^WIFI:/i, ''));
  const t = (o.T || '').toUpperCase();
  return {
    ssid: o.S || '',
    pass: o.P || '',
    sec: !t || t === 'NOPASS' ? (o.P ? 'WPA' : 'nopass') : t === 'WEP' ? 'WEP' : 'WPA',
    secLabel: !t || t === 'NOPASS' ? (o.P ? 'WPA' : 'Open') : t,
    hidden: /^true$/i.test(o.H || ''),
  };
}

const unVcard = (s) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
export function parseVcard(s) {
  const lines = s.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const c = { tel: [], email: [], url: [] };
  for (const line of lines) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i).split(';')[0].toUpperCase().replace(/^ITEM\d+\./, '');
    const val = unVcard(line.slice(i + 1));
    if (key === 'FN') c.fn = val;
    else if (key === 'N') { const p = line.slice(i + 1).split(';').map(unVcard); c.last = p[0] || ''; c.first = p[1] || ''; }
    else if (key === 'ORG') c.org = val.replace(/;/g, ' ').trim();
    else if (key === 'TITLE') c.title = val;
    else if (key === 'TEL') c.tel.push(val);
    else if (key === 'EMAIL') c.email.push(val);
    else if (key === 'URL') c.url.push(val);
  }
  if (!c.fn) c.fn = [c.first, c.last].filter(Boolean).join(' ');
  return c;
}
export function parseMecard(s) {
  const o = rawFields(s.replace(/^MECARD:/i, ''));
  const n = (o.N || '').split(',');
  const c = { last: n[0] || '', first: n[1] || '', org: o.ORG || '', tel: [o.TEL, ...(o._TEL || [])].filter(Boolean), email: [o.EMAIL, ...(o._EMAIL || [])].filter(Boolean), url: [o.URL].filter(Boolean) };
  c.fn = [c.first, c.last].filter(Boolean).join(' ') || o.N || '';
  return c;
}
export function contactToVcard(c) {
  return buildPayload('contact', { first: c.first || (!c.last ? c.fn : ''), last: c.last, org: c.org, title: c.title, tel: c.tel && c.tel[0], email: c.email && c.email[0], url: c.url && c.url[0] });
}

function qsParse(q) {
  const o = {};
  for (const part of (q || '').split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    const k = decodeSafe(i < 0 ? part : part.slice(0, i)).toLowerCase();
    o[k] = decodeSafe(i < 0 ? '' : part.slice(i + 1).replace(/\+/g, ' '));
  }
  return o;
}
function decodeSafe(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

export function parsePayload(text) {
  const s = String(text || '');
  const t = s.trim();
  if (/^WIFI:/i.test(t)) return { kind: 'wifi', label: 'Wi-Fi network', wifi: parseWifi(t), text: s };
  if (/^BEGIN:VCARD/i.test(t)) return { kind: 'contact', label: 'Contact', contact: parseVcard(t), vcf: t, text: s };
  if (/^MECARD:/i.test(t)) { const c = parseMecard(t); return { kind: 'contact', label: 'Contact', contact: c, vcf: contactToVcard(c), text: s }; }
  if (/^mailto:/i.test(t)) {
    const rest = t.slice(7); const q = rest.indexOf('?');
    const qs = qsParse(q < 0 ? '' : rest.slice(q + 1));
    return { kind: 'email', label: 'Email', email: { to: decodeSafe(q < 0 ? rest : rest.slice(0, q)), subject: qs.subject || '', body: qs.body || '' }, href: t, text: s };
  }
  if (/^MATMSG:/i.test(t)) {
    const o = rawFields(t.slice(7));
    const e = { to: o.TO || '', subject: o.SUB || '', body: o.BODY || '' };
    return { kind: 'email', label: 'Email', email: e, href: buildPayload('email', e), text: s };
  }
  if (/^(smsto|sms|mmsto):/i.test(t)) {
    const rest = t.replace(/^[a-z]+:/i, '');
    let num, msg;
    if (/^sms:/i.test(t)) { const q = rest.indexOf('?'); num = q < 0 ? rest : rest.slice(0, q); msg = q < 0 ? '' : qsParse(rest.slice(q + 1)).body || ''; }
    else { const i = rest.indexOf(':'); num = i < 0 ? rest : rest.slice(0, i); msg = i < 0 ? '' : rest.slice(i + 1); }
    num = decodeSafe(num);
    return { kind: 'sms', label: 'Text message', sms: { num, msg }, href: 'sms:' + encodeURIComponent(num).replace(/%2B/g, '+') + (msg ? '?body=' + encodeURIComponent(msg) : ''), text: s };
  }
  if (/^tel:/i.test(t)) { const num = decodeSafe(t.slice(4)); return { kind: 'phone', label: 'Phone number', phone: num, href: 'tel:' + num.replace(/[^\d+*#,;pw]/gi, ''), text: s }; }
  const g = /^geo:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i.exec(t);
  if (g) { const lat = +g[1], lon = +g[2]; return { kind: 'geo', label: 'Location', geo: { lat, lon }, href: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`, text: s }; }
  if (/^https?:\/\/\S+$/i.test(t) || /^www\.[^\s/]+\.[a-z]{2,}(\/\S*)?$/i.test(t)) {
    try {
      const u = new URL(/^www\./i.test(t) ? 'https://' + t : t);
      return { kind: 'url', label: 'Link', url: u.href, host: u.hostname, secure: u.protocol === 'https:', puny: /(^|\.)xn--/i.test(u.hostname), text: s };
    } catch (e) { /* fall through */ }
  }
  const scheme = /^([a-z][a-z0-9+.-]{1,20}):\S/i.exec(t);
  return { kind: 'text', label: scheme && !/\s/.test(t) ? scheme[1].toLowerCase() + ': link' : 'Text', text: s };
}

/* ======================================================================
   matrix → vector paths
   ====================================================================== */
// qrcodeLib: the global `qrcode` from qrcode-generator@1.4.4
export const ECL_ORDER = ['L', 'M', 'Q', 'H'];
export function makeMatrix(qrcodeLib, text, ecl) {
  qrcodeLib.stringToBytes = qrcodeLib.stringToBytesFuncs['UTF-8'];
  const q = qrcodeLib(0, ecl);
  q.addData(text, 'Byte');
  q.make();
  const n = q.getModuleCount();
  const m = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) m[y * n + x] = q.isDark(y, x) ? 1 : 0;
  return { n, m, version: (n - 17) / 4, ecl };
}

const isFinder = (x, y, n) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);

// logo plate size in modules (centered, same parity as n so it sits on the grid)
export function logoBox(n) {
  let L = Math.round(n * 0.22);
  if ((n - L) % 2) L += 1;
  const o = (n - L) / 2;
  return { x: o, y: o, s: L };
}

const f = (v) => +v.toFixed(3);

function rr(x, y, w, h, r, ccw) {
  // rounded rect subpath; ccw reverses winding (for holes under nonzero)
  if (!ccw) return `M${f(x + r)} ${f(y)}H${f(x + w - r)}A${r} ${r} 0 0 1 ${f(x + w)} ${f(y + r)}V${f(y + h - r)}A${r} ${r} 0 0 1 ${f(x + w - r)} ${f(y + h)}H${f(x + r)}A${r} ${r} 0 0 1 ${f(x)} ${f(y + h - r)}V${f(y + r)}A${r} ${r} 0 0 1 ${f(x + r)} ${f(y)}Z`;
  return `M${f(x + r)} ${f(y)}A${r} ${r} 0 0 0 ${f(x)} ${f(y + r)}V${f(y + h - r)}A${r} ${r} 0 0 0 ${f(x + r)} ${f(y + h)}H${f(x + w - r)}A${r} ${r} 0 0 0 ${f(x + w)} ${f(y + h - r)}V${f(y + r)}A${r} ${r} 0 0 0 ${f(x + w - r)} ${f(y)}Z`;
}

// Returns { size (modules incl. quiet), d (module path), eyes (path or ''), logo (box or null) }
// in module units, origin at the outer corner of the quiet zone.
export function buildPaths(mx, { quiet = 4, rounded = false, logo = false } = {}) {
  const { n, m } = mx;
  const q = quiet;
  const dark = (x, y) => x >= 0 && y >= 0 && x < n && y < n && m[y * n + x] === 1;
  const lb = logo ? logoBox(n) : null;
  const inLogo = (x, y) => lb && x >= lb.x && y >= lb.y && x < lb.x + lb.s && y < lb.y + lb.s;
  const on = (x, y) => dark(x, y) && !inLogo(x, y) && !(rounded && isFinder(x, y, n));
  let d = '';
  if (!rounded) {
    for (let y = 0; y < n; y++) {
      let x = 0;
      while (x < n) {
        if (!on(x, y)) { x++; continue; }
        let e = x; while (e < n && on(e, y)) e++;
        d += `M${x + q} ${y + q}h${e - x}v1h${x - e}z`;
        x = e;
      }
    }
  } else {
    const r = 0.5;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (!on(x, y)) continue;
      const u = on(x, y - 1), dn = on(x, y + 1), l = on(x - 1, y), rt = on(x + 1, y);
      const tl = !u && !l, tr = !u && !rt, br = !dn && !rt, bl = !dn && !l;
      const X = x + q, Y = y + q;
      d += `M${X + (tl ? r : 0)} ${Y}H${X + 1 - (tr ? r : 0)}`;
      if (tr) d += `a${r} ${r} 0 0 1 ${r} ${r}`;
      d += `V${Y + 1 - (br ? r : 0)}`;
      if (br) d += `a${r} ${r} 0 0 1 -${r} ${r}`;
      d += `H${X + (bl ? r : 0)}`;
      if (bl) d += `a${r} ${r} 0 0 1 -${r} -${r}`;
      d += `V${Y + (tl ? r : 0)}`;
      if (tl) d += `a${r} ${r} 0 0 1 ${r} -${r}`;
      d += 'z';
    }
  }
  let eyes = '';
  if (rounded) {
    for (const [ex, ey] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      const X = ex + q, Y = ey + q;
      eyes += rr(X, Y, 7, 7, 2.1) + rr(X + 1, Y + 1, 5, 5, 1.4, true) + rr(X + 2, Y + 2, 3, 3, 1);
    }
  }
  return { size: n + 2 * q, d, eyes, logo: lb ? { x: lb.x + q, y: lb.y + q, s: lb.s } : null };
}

// The SZVTECH "S" mark, in a 100×100 box (stroked, round caps)
export const S_PATH = 'M69 31C64 22 54 19 46 19C34 19 28 26 28 34C28 44 38 47 50 50C62 53 72 57 72 67C72 76 64 82 53 82C43 82 34 78 29 69';

/* ======================================================================
   color helpers (contrast-safe themed colors)
   ====================================================================== */
export function hexRgb(h) { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
export function luminance([r, g, b]) { return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
export function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
const toHex = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
// darken toward black until contrast vs white >= target
export function darkFor(hex, target = 7) {
  let c = hexRgb(hex);
  for (let i = 0; i < 40 && contrast(c, [255, 255, 255]) < target; i++) c = c.map((v) => v * 0.94);
  return toHex(c);
}
