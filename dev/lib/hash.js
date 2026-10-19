// Hashes: MD5 (pure JS, RFC 1321) + SHA-1/256/384/512 via WebCrypto, and HMAC for all of them.
import { utf8Encode, bytesToHex } from './encode.js?v=5328626cab';

const toBytes = (d) => typeof d === 'string' ? utf8Encode(d) : d instanceof Uint8Array ? d : new Uint8Array(d);

/* ---------------------------------------------------------------- MD5 */
const K = new Uint32Array(64);
for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
const R = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];

/** MD5 of bytes/string -> Uint8Array(16) */
export function md5Bytes(data) {
  const msg = toBytes(data);
  const len = msg.length;
  const total = (((len + 8) >> 6) + 1) << 6;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[len] = 0x80;
  const bitLen = len * 8;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, bitLen >>> 0, true);
  dv.setUint32(total - 4, Math.floor(bitLen / 2 ** 32), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const M = new Uint32Array(16);
  for (let off = 0; off < total; off += 64) {
    for (let j = 0; j < 16; j++) M[j] = dv.getUint32(off + j * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) & 15; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) & 15; }
      else { F = C ^ (B | ~D); g = (7 * i) & 15; }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + ((F << R[i]) | (F >>> (32 - R[i])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, a0, true); ov.setUint32(4, b0, true); ov.setUint32(8, c0, true); ov.setUint32(12, d0, true);
  return out;
}
export const md5 = (data) => bytesToHex(md5Bytes(data));

/* ---------------------------------------------------------------- SHA via WebCrypto */
export const ALGOS = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
const subtle = () => {
  const s = globalThis.crypto && globalThis.crypto.subtle;
  if (!s) throw new Error('WebCrypto needs a secure context (https or localhost)');
  return s;
};

/** digest(algo, data) -> Uint8Array */
export async function digest(algo, data) {
  if (algo === 'MD5') return md5Bytes(data);
  return new Uint8Array(await subtle().digest(algo, toBytes(data)));
}
export async function hashHex(algo, data) { return bytesToHex(await digest(algo, data)); }

const BLOCK = { 'MD5': 64, 'SHA-1': 64, 'SHA-256': 64, 'SHA-384': 128, 'SHA-512': 128 };

/** HMAC (RFC 2104) -> Uint8Array. Built on digest() so empty keys and MD5 work too. */
export async function hmac(algo, key, data) {
  const B = BLOCK[algo];
  if (!B) throw new Error('Unknown algorithm ' + algo);
  const msg = toBytes(data);
  let k = toBytes(key);
  if (k.length > B) k = await digest(algo, k);
  const inner = new Uint8Array(B + msg.length);
  const outerKey = new Uint8Array(B);
  for (let i = 0; i < B; i++) { const b = k[i] || 0; inner[i] = b ^ 0x36; outerKey[i] = b ^ 0x5c; }
  inner.set(msg, B);
  const ih = await digest(algo, inner);
  const outer = new Uint8Array(B + ih.length);
  outer.set(outerKey); outer.set(ih, B);
  return digest(algo, outer);
}
export async function hmacHex(algo, key, data) { return bytesToHex(await hmac(algo, key, data)); }

/** constant-ish time compare of two hex/base64 strings, case-insensitive for hex */
export function sameDigest(a, b, { caseInsensitive = true } = {}) {
  let x = String(a).trim(), y = String(b).trim();
  if (caseInsensitive) { x = x.toLowerCase(); y = y.toLowerCase(); }
  if (!x || x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}
