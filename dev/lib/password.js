// Password + passphrase generation (unbiased, crypto randomness) and a strength estimate. Pure; rng injectable.
import { WORDS } from './words.js?v=c8bb717127';

export const cryptoRandomU32 = (n) => { const a = new Uint32Array(n); globalThis.crypto.getRandomValues(a); return a; };

/** unbiased integer in [0, n) by rejection sampling */
export function randInt(n, rand = cryptoRandomU32) {
  if (n <= 0 || n > 2 ** 32) throw new Error('bad range');
  const lim = Math.floor(2 ** 32 / n) * n;
  for (;;) { const x = rand(1)[0]; if (x < lim) return x % n; }
}

export const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/~',
};
const AMBIGUOUS = /[Il1O0o|`'"]/g;

export function pool({ lower = true, upper = true, digits = true, symbols = false, noAmbiguous = false, custom = '' } = {}) {
  const sets = [];
  for (const [k, v] of Object.entries({ lower, upper, digits, symbols })) if (v) sets.push(noAmbiguous ? SETS[k].replace(AMBIGUOUS, '') : SETS[k]);
  if (custom) sets.push([...new Set(custom)].join(''));
  return sets.filter(Boolean);
}

/** generatePassword({ length, lower, upper, digits, symbols, noAmbiguous, requireEach }, rand) -> { value, bits } */
export function generatePassword(opts = {}, rand = cryptoRandomU32) {
  const length = Math.max(4, Math.min(256, opts.length | 0 || 20));
  const sets = pool(opts);
  if (!sets.length) throw new Error('Pick at least one character set');
  const chars = [...new Set(sets.join(''))];
  const requireEach = opts.requireEach !== false && length >= sets.length;
  for (let tries = 0; tries < 1000; tries++) {
    let v = '';
    for (let i = 0; i < length; i++) v += chars[randInt(chars.length, rand)];
    if (!requireEach || sets.every((s) => [...v].some((c) => s.includes(c)))) return { value: v, bits: length * Math.log2(chars.length) };
  }
  throw new Error('Could not satisfy the rules');
}

/** generatePassphrase({ words, separator, capitalize, number }) -> { value, bits } */
export function generatePassphrase(opts = {}, rand = cryptoRandomU32) {
  const n = Math.max(3, Math.min(20, opts.words | 0 || 5));
  const sep = opts.separator ?? '-';
  const w = [];
  for (let i = 0; i < n; i++) {
    let x = WORDS[randInt(WORDS.length, rand)];
    if (opts.capitalize) x = x[0].toUpperCase() + x.slice(1);
    w.push(x);
  }
  let bits = n * Math.log2(WORDS.length);
  if (opts.number) {
    const pos = randInt(n, rand);
    w[pos] += String(randInt(10, rand));
    bits += Math.log2(10 * n);
  }
  return { value: w.join(sep), bits };
}

const COMMON = new Set(('123456 password 12345678 qwerty 123456789 12345 1234 111111 1234567 dragon 123123 baseball abc123 football monkey letmein ' +
  'shadow master 666666 qwertyuiop 123321 mustang 1234567890 michael 654321 superman 1qaz2wsx 7777777 121212 000000 qazwsx 123qwe killer ' +
  'trustno1 jordan jennifer zxcvbnm asdfgh hunter buster soccer harley batman andrew tigger sunshine iloveyou 2000 charlie robert thomas ' +
  'hockey ranger daniel starwars klaster 112233 george computer michelle jessica pepper 1111 zxcvbn 555555 11111111 131313 freedom 777777 ' +
  'pass maggie 159753 aaaaaa ginger princess joshua cheese amanda summer love ashley nicole chelsea biteme matthew access yankees 987654321 ' +
  'dallas austin thunder taylor matrix welcome admin login passw0rd p@ssw0rd password1 qwerty123 abcd1234 secret').split(' '));
const SEQS = ['abcdefghijklmnopqrstuvwxyz', '01234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1qaz2wsx3edc'];

/** estimate(pw) -> { bits, score 0-4, label, feedback[] } — a pragmatic heuristic, not zxcvbn */
export function estimate(pw) {
  const s = String(pw);
  if (!s) return { bits: 0, score: 0, label: 'empty', feedback: [] };
  const feedback = [];
  let size = 0;
  if (/[a-z]/.test(s)) size += 26;
  if (/[A-Z]/.test(s)) size += 26;
  if (/\d/.test(s)) size += 10;
  if (/[^A-Za-z0-9\s]/.test(s)) size += 33;
  if (/\s/.test(s)) size += 1;
  if (/[^\x00-\x7f]/.test(s)) size += 100;
  // effective length: collapse repeats and sequences
  const lower = s.toLowerCase();
  let eff = 0;
  for (let i = 0; i < s.length; i++) {
    const c = lower[i], p = lower[i - 1];
    let w = 1;
    if (i && c === p) w = 0.15;
    else if (i && SEQS.some((q) => q.includes(p + c) || q.includes(c + p))) w = 0.3;
    eff += w;
  }
  let bits = eff * Math.log2(Math.max(size, 2));
  const leet = lower.replace(/[@4]/g, 'a').replace(/3/g, 'e').replace(/[1!]/g, 'i').replace(/0/g, 'o').replace(/[$5]/g, 's').replace(/7/g, 't');
  const core = leet.replace(/[^a-z]/g, '');
  if (COMMON.has(lower) || COMMON.has(leet) || (core.length >= 4 && COMMON.has(core))) { bits = Math.min(bits, 10); feedback.push('This is one of the most common passwords'); }
  else if ([...COMMON].some((c) => c.length >= 5 && leet.includes(c))) { bits *= 0.6; feedback.push('Contains a very common password'); }
  if (/(19|20)\d\d/.test(s)) { bits -= 6; feedback.push('Years are easy to guess'); }
  if (/^[A-Z][a-z]+\d+[!.]?$/.test(s)) { bits *= 0.7; feedback.push('“Word + digits” is a pattern crackers try first'); }
  if (s.length < 12) feedback.push('Use 12+ characters (16+ is better)');
  if (size <= 26 && s.length < 20) feedback.push('Mix in other character types, or use a long passphrase');
  bits = Math.max(0, bits);
  const score = bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
  return { bits, score, label: ['very weak', 'weak', 'fair', 'strong', 'very strong'][score], feedback };
}

/** average time to guess at `rate` guesses/second */
export function crackTime(bits, rate = 1e10) {
  const sec = 2 ** Math.max(0, bits - 1) / rate;
  if (sec < 1) return 'instantly';
  const units = [['second', 60], ['minute', 60], ['hour', 24], ['day', 365.25], ['year', 100], ['century', Infinity]];
  let v = sec;
  for (const [u, n] of units) {
    if (v < n || u === 'century') {
      if (u === 'century' && v >= 1e6) return 'longer than the universe has existed';
      const r = Math.round(v);
      return `${r.toLocaleString('en-US')} ${u === 'century' ? (r === 1 ? 'century' : 'centuries') : u + (r === 1 ? '' : 's')}`;
    }
    v /= n;
  }
  return '';
}
