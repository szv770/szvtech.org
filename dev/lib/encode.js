// Pure encoders/decoders: Base64 (UTF-8 safe), URL, query strings, HTML entities, hex.
// No DOM. Works in browsers and Node 18+.

const te = new TextEncoder();
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_REV = (() => {
  const m = new Int16Array(128).fill(-1);
  for (let i = 0; i < 64; i++) m[B64.charCodeAt(i)] = i;
  m[45] = 62; m[95] = 63; // - _ (url-safe)
  return m;
})();

export function utf8Encode(str) { return te.encode(str); }
export function utf8Decode(bytes, { fatal = true } = {}) { return new TextDecoder('utf-8', { fatal }).decode(bytes); }

/** bytes -> base64 */
export function bytesToBase64(bytes, { urlSafe = false, pad = true } = {}) {
  let out = '';
  const n = bytes.length;
  let i = 0;
  for (; i + 2 < n; i += 3) {
    const v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[v >> 18] + B64[(v >> 12) & 63] + B64[(v >> 6) & 63] + B64[v & 63];
  }
  if (i < n) {
    const v = (bytes[i] << 16) | ((i + 1 < n ? bytes[i + 1] : 0) << 8);
    out += B64[v >> 18] + B64[(v >> 12) & 63];
    out += i + 1 < n ? B64[(v >> 6) & 63] : (pad ? '=' : '');
    out += pad ? '=' : '';
  }
  if (urlSafe) out = out.replace(/\+/g, '-').replace(/\//g, '_');
  return out;
}

/** base64 / base64url (padding optional, whitespace ignored) -> bytes. Throws on bad input. */
export function base64ToBytes(str) {
  const s = String(str).replace(/[\s]/g, '').replace(/=+$/, '');
  if (s.length % 4 === 1) throw new Error('Invalid Base64 length');
  const out = new Uint8Array(Math.floor(s.length * 3 / 4));
  let buf = 0, bits = 0, j = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const v = c < 128 ? B64_REV[c] : -1;
    if (v < 0) throw new Error(`Invalid Base64 character "${s[i]}" at position ${i + 1}`);
    buf = (buf << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out[j++] = (buf >> bits) & 255; }
  }
  return out.subarray(0, j);
}

export const encodeBase64 = (text, opts) => bytesToBase64(utf8Encode(text), opts);
/** base64 -> { text, bytes, binary } ; binary=true when the bytes aren't valid UTF-8 */
export function decodeBase64(str) {
  const bytes = base64ToBytes(str);
  try { return { text: utf8Decode(bytes), bytes, binary: false }; }
  catch { return { text: utf8Decode(bytes, { fatal: false }), bytes, binary: true }; }
}
export function looksLikeBase64(s) {
  const t = String(s).trim();
  if (t.length < 8 || /\s/.test(t)) return false;
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(t)) return false;
  if (/^[0-9]+$/.test(t) || /^[a-z]+$/i.test(t)) return false;
  if (/[+/]/.test(t) && /[-_]/.test(t)) return false;
  if (t.replace(/=+$/, '').length % 4 === 1) return false;
  try { const r = decodeBase64(t); return !r.binary && /^[\P{Cc}\t\n\r]*$/u.test(r.text) && r.text.length > 0; } catch { return false; }
}

export function bytesToHex(bytes, sep = '') {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += (i && sep ? sep : '') + bytes[i].toString(16).padStart(2, '0');
  return s;
}
export function hexToBytes(hex) {
  const h = String(hex).replace(/^0x/i, '').replace(/[\s:-]/g, '');
  if (h.length % 2 || /[^0-9a-f]/i.test(h)) throw new Error('Invalid hex');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

/* ---------------------------------------------------------------- URL */
export function urlEncode(s, mode = 'component') {
  if (mode === 'uri') return encodeURI(s);
  if (mode === 'form') return encodeURIComponent(s).replace(/%20/g, '+');
  // component, plus RFC 3986 reserved !'()*
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}
export function urlDecode(s, { plusAsSpace = true } = {}) {
  const t = plusAsSpace ? String(s).replace(/\+/g, ' ') : String(s);
  try { return decodeURIComponent(t); }
  catch {
    // decode what we can: valid %XX UTF-8 sequences, leave the rest
    return t.replace(/(%[0-9a-f]{2})+/gi, (m) => { try { return decodeURIComponent(m); } catch { return m; } });
  }
}

/** Parse a URL or bare query string into parts + ordered params */
export function parseQuery(input) {
  const raw = String(input).trim();
  let url = null;
  try { if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) url = new URL(raw); } catch { url = null; }
  let qs = raw, hash = '';
  if (url) { qs = url.search; hash = url.hash; }
  else {
    const hi = qs.indexOf('#'); if (hi >= 0) { hash = qs.slice(hi); qs = qs.slice(0, hi); }
    const qi = qs.indexOf('?'); if (qi >= 0) qs = qs.slice(qi);
  }
  qs = qs.replace(/^\?/, '');
  const params = [];
  if (qs) for (const part of qs.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const k = eq < 0 ? part : part.slice(0, eq);
    const v = eq < 0 ? '' : part.slice(eq + 1);
    params.push({ key: urlDecode(k), value: urlDecode(v), hasValue: eq >= 0 });
  }
  const parts = url ? {
    protocol: url.protocol, username: url.username, password: url.password ? '••••' : '', host: url.hostname,
    port: url.port, path: decodeSafe(url.pathname), hash: decodeSafe(url.hash), origin: url.origin === 'null' ? '' : url.origin,
  } : null;
  return { isUrl: !!url, parts, params, hash: decodeSafe(hash) };
}
const decodeSafe = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

export function buildQuery(params) {
  return params.filter((p) => p.key !== '').map((p) => urlEncode(p.key) + (p.value !== '' || p.hasValue ? '=' + urlEncode(p.value) : '')).join('&');
}

/* ---------------------------------------------------------------- HTML entities */
export const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™', hellip: '…',
  mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', bull: '•', middot: '·',
  deg: '°', plusmn: '±', times: '×', divide: '÷', micro: 'µ', para: '¶', sect: '§', cent: '¢', pound: '£', euro: '€',
  yen: '¥', curren: '¤', iexcl: '¡', iquest: '¿', frac12: '½', frac14: '¼', frac34: '¾', sup1: '¹', sup2: '²', sup3: '³',
  larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', lArr: '⇐', rArr: '⇒', hArr: '⇔', larrhk: '↩', crarr: '↵',
  ne: '≠', le: '≤', ge: '≥', asymp: '≈', equiv: '≡', infin: '∞', sum: '∑', prod: '∏', radic: '√', part: '∂', nabla: '∇',
  isin: '∈', notin: '∉', cap: '∩', cup: '∪', and: '∧', or: '∨', not: '¬', forall: '∀', exist: '∃', empty: '∅', minus: '−',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ', tau: 'τ',
  phi: 'φ', omega: 'ω', Delta: 'Δ', Sigma: 'Σ', Omega: 'Ω', Pi: 'Π', hearts: '♥', spades: '♠', clubs: '♣', diams: '♦',
  check: '✓', cross: '✗', star: '☆', starf: '★', dagger: '†', Dagger: '‡', permil: '‰', prime: '′', Prime: '″',
  shy: '­', ensp: ' ', emsp: ' ', thinsp: ' ', zwnj: '‌', zwj: '‍', lrm: '‎', rlm: '‏',
  Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å', AElig: 'Æ', Ccedil: 'Ç', Egrave: 'È', Eacute: 'É',
  Ecirc: 'Ê', Euml: 'Ë', Iacute: 'Í', Ntilde: 'Ñ', Oacute: 'Ó', Ouml: 'Ö', Oslash: 'Ø', Uacute: 'Ú', Uuml: 'Ü', szlig: 'ß',
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ', ccedil: 'ç', egrave: 'è', eacute: 'é',
  ecirc: 'ê', euml: 'ë', igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï', ntilde: 'ñ', ograve: 'ò', oacute: 'ó', ocirc: 'ô',
  otilde: 'õ', ouml: 'ö', oslash: 'ø', ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü', yacute: 'ý', yuml: 'ÿ',
};
const REV = Object.fromEntries(Object.entries(NAMED).filter(([k]) => !/^(apos|lArr|rArr|hArr)$/.test(k)).map(([k, v]) => [v, k]));

/**
 * mode: 'minimal' (& < > " '), 'named' (minimal + named where known + numeric for other non-ASCII),
 *       'numeric' (minimal + every non-ASCII as &#x..;)
 */
export function htmlEncode(s, mode = 'minimal') {
  let out = '';
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    if (ch === '&') out += '&amp;';
    else if (ch === '<') out += '&lt;';
    else if (ch === '>') out += '&gt;';
    else if (ch === '"') out += '&quot;';
    else if (ch === "'") out += '&#39;';
    else if (mode !== 'minimal' && (cp > 126 || (cp < 32 && cp !== 10 && cp !== 13 && cp !== 9))) {
      if (mode === 'named' && REV[ch]) out += '&' + REV[ch] + ';';
      else out += '&#x' + cp.toString(16).toUpperCase() + ';';
    } else out += ch;
  }
  return out;
}

/** Decode named (known table + optional resolver for unknown) and numeric entities. */
export function htmlDecode(s, resolveUnknown) {
  return String(s).replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);?/gi, (m, body) => {
    if (body[0] === '#') {
      const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(cp) || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '�';
      return cp === 0 ? '�' : String.fromCodePoint(cp);
    }
    if (!m.endsWith(';') && !/^(amp|lt|gt|quot|nbsp|copy|reg)$/i.test(body)) return m;
    if (Object.prototype.hasOwnProperty.call(NAMED, body)) return NAMED[body];
    if (resolveUnknown) { const r = resolveUnknown(m.endsWith(';') ? m : m + ';'); if (r != null) return r; }
    return m;
  });
}
