// UUID v4 / v7, ULID, nanoid generators + an inspector. Pure; randomness and clock are injectable for tests.
import { bytesToHex } from './encode.js?v=5328626cab';

export const cryptoRandom = (n) => { const b = new Uint8Array(n); globalThis.crypto.getRandomValues(b); return b; };

const fmtUuid = (b) => {
  const h = bytesToHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

export function uuidv4(rand = cryptoRandom) {
  const b = rand(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return fmtUuid(b);
}

/** Make a v7 generator that stays monotonic within the same millisecond (RFC 9562 method 1: 12-bit counter in rand_a). */
export function uuidv7Factory(rand = cryptoRandom, now = () => Date.now()) {
  let lastMs = -1, counter = 0;
  return function uuidv7() {
    let ms = now();
    if (ms <= lastMs) {
      ms = lastMs;
      counter++;
      if (counter > 0xfff) { ms = ++lastMs; counter = rand(1)[0] & 0x3f; }
    } else counter = (rand(2)[0] << 4 | 0) & 0x3ff; // leave headroom for increments
    lastMs = ms;
    const b = rand(16);
    // 48-bit big-endian timestamp
    let t = ms;
    for (let i = 5; i >= 0; i--) { b[i] = t % 256; t = Math.floor(t / 256); }
    b[6] = 0x70 | ((counter >> 8) & 0x0f);
    b[7] = counter & 0xff;
    b[8] = (b[8] & 0x3f) | 0x80;
    return fmtUuid(b);
  };
}

export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** ULID generator, monotonic within a millisecond (spec: increment the random part). */
export function ulidFactory(rand = cryptoRandom, now = () => Date.now()) {
  let lastMs = -1, last = null; // last random as 16 base32 digits
  return function ulid() {
    let ms = now();
    let r;
    if (ms <= lastMs && last) {
      ms = lastMs;
      r = last.slice();
      let i = 15;
      while (i >= 0 && r[i] === 31) { r[i] = 0; i--; }
      if (i < 0) throw new Error('ULID random overflow');
      r[i]++;
    } else {
      const b = rand(16);
      r = Array.from(b, (x) => x & 31);
    }
    lastMs = ms; last = r;
    let t = '', x = ms;
    for (let i = 0; i < 10; i++) { t = CROCKFORD[x % 32] + t; x = Math.floor(x / 32); }
    return t + r.map((d) => CROCKFORD[d]).join('');
  };
}

export const NANO_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';
/** nanoid with rejection sampling (no modulo bias) */
export function nanoid(size = 21, alphabet = NANO_ALPHABET, rand = cryptoRandom) {
  const len = alphabet.length;
  if (len < 2 || len > 256) throw new Error('Alphabet must have 2–256 characters');
  if (!(size >= 1 && size <= 1024)) throw new Error('Size must be 1–1024');
  const mask = (2 << (31 - Math.clz32((len - 1) | 1))) - 1;
  const step = Math.ceil((1.6 * mask * size) / len);
  let id = '';
  for (;;) {
    const bytes = rand(step);
    for (let i = 0; i < step; i++) {
      const c = bytes[i] & mask;
      if (c < len) { id += alphabet[c]; if (id.length === size) return id; }
    }
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i;

/** Inspect a UUID or ULID: { kind, version, variant, time? (ms) } or null */
export function inspectId(input) {
  const s = String(input).trim().replace(/^\{|\}$/g, '').replace(/^urn:uuid:/i, '');
  if (UUID_RE.test(s)) {
    const h = s.replace(/-/g, '').toLowerCase();
    if (/^0+$/.test(h)) return { kind: 'UUID', version: 0, variant: 'nil', label: 'Nil UUID' };
    if (/^f+$/.test(h)) return { kind: 'UUID', version: 15, variant: 'max', label: 'Max UUID' };
    const version = parseInt(h[12], 16);
    const vn = parseInt(h[16], 16);
    const variant = vn < 8 ? 'NCS' : vn < 12 ? 'RFC 9562' : vn < 14 ? 'Microsoft' : 'future';
    const out = { kind: 'UUID', version, variant, label: `UUID v${version}` };
    if (version === 7) out.time = parseInt(h.slice(0, 12), 16);
    if (version === 1 || version === 6) {
      const ts = version === 1 ? h.slice(13, 16) + h.slice(8, 12) + h.slice(0, 8) : h.slice(0, 12) + h.slice(13, 16);
      out.time = Number((BigInt('0x' + ts) - 122192928000000000n) / 10000n);
    }
    return out;
  }
  if (ULID_RE.test(s)) {
    let t = 0;
    const u = s.toUpperCase();
    for (let i = 0; i < 10; i++) t = t * 32 + CROCKFORD.indexOf(u[i]);
    return { kind: 'ULID', label: 'ULID', time: t };
  }
  return null;
}
