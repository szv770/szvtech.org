// Arbitrary-precision base conversion (2–36) using BigInt. Pure.

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
const PREFIX = { 2: '0b', 8: '0o', 16: '0x' };

/**
 * parseNumber("0xff") -> { value: BigInt, base, negative }
 * Base auto-detected from prefix (0x, 0b, 0o) unless given. Underscores, spaces and commas are ignored.
 */
export function parseNumber(input, base = 'auto') {
  let s = String(input).trim().toLowerCase().replace(/[_\s,']/g, '');
  if (!s) throw new Error('Empty');
  let neg = false;
  if (s[0] === '-' || s[0] === '+') { neg = s[0] === '-'; s = s.slice(1); }
  let b = base === 'auto' ? 10 : +base;
  if (base === 'auto' || +base === 16 || +base === 2 || +base === 8) {
    const m = s.match(/^0([xbo])/);
    if (m) { const pb = { x: 16, b: 2, o: 8 }[m[1]]; if (base === 'auto' || pb === +base) { b = pb; s = s.slice(2); } }
    else if (base === 'auto' && /^[0-9a-f]+h$/.test(s) && /[a-f]/.test(s)) { b = 16; s = s.slice(0, -1); }
  }
  if (!(b >= 2 && b <= 36)) throw new Error('Base must be 2–36');
  if (!s) throw new Error('No digits');
  let v = 0n;
  const B = BigInt(b);
  for (const ch of s) {
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= b) throw new Error(`"${ch}" isn't a base-${b} digit`);
    v = v * B + BigInt(d);
  }
  return { value: neg ? -v : v, base: b, negative: neg && v !== 0n };
}

export function toBase(value, base, { upper = false, prefix = false, group = 0 } = {}) {
  const b = BigInt(base);
  let v = value < 0n ? -value : value;
  let s = '';
  if (v === 0n) s = '0';
  while (v > 0n) { s = DIGITS[Number(v % b)] + s; v /= b; }
  if (group > 0) s = s.replace(new RegExp(`\\B(?=(.{${group}})+$)`, 'g'), base === 10 ? ',' : '_');
  if (upper) s = s.toUpperCase();
  return (value < 0n ? '-' : '') + (prefix && PREFIX[base] ? PREFIX[base] : '') + s;
}

/** two's complement representation of a (possibly negative) value at a bit width */
export function twosComplement(value, bits) {
  const max = 1n << BigInt(bits);
  if (value >= max / 2n || value < -(max / 2n)) {
    if (value >= 0n && value < max) return value; // fits as unsigned
    return null;
  }
  return value < 0n ? max + value : value;
}

export function bitLength(value) {
  let v = value < 0n ? -value : value;
  let n = 0;
  while (v > 0n) { v >>= 1n; n++; }
  return n;
}

/** Convert input in `from` base to every common base */
export function convertAll(input, from = 'auto') {
  const { value, base } = parseNumber(input, from);
  const bits = bitLength(value);
  const width = [8, 16, 32, 64, 128].find((w) => (value < 0n ? bits < w : bits <= w)) || null;
  const tc = value < 0n && width ? twosComplement(value, width) : null;
  return {
    value, base, bits, width,
    bin: toBase(value, 2), oct: toBase(value, 8), dec: toBase(value, 10), hex: toBase(value, 16),
    b32: toBase(value, 32), b36: toBase(value, 36),
    twos: tc != null ? { width, bin: toBase(tc, 2).padStart(width, '0'), hex: toBase(tc, 16).padStart(width / 4, '0') } : null,
    ascii: value > 0n && bits <= 64 * 8 ? bytesAscii(value) : null,
  };
}

function bytesAscii(v) {
  const bytes = [];
  let x = v;
  while (x > 0n) { bytes.unshift(Number(x & 255n)); x >>= 8n; }
  if (!bytes.every((b) => b >= 32 && b < 127)) return null;
  return String.fromCharCode(...bytes);
}
