// JWT decode (no verification) + optional HMAC (HS256/384/512) verification. Pure.
import { base64ToBytes, utf8Decode, bytesToBase64, utf8Encode } from './encode.js';
import { hmac } from './hash.js';

export const JWT_RE = /^[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]*$/;

export function looksLikeJwt(s) {
  const t = String(s).trim().replace(/^Bearer\s+/i, '');
  if (!JWT_RE.test(t)) return false;
  try { const h = JSON.parse(utf8Decode(base64ToBytes(t.split('.')[0]))); return !!h && typeof h === 'object' && ('alg' in h || 'typ' in h); }
  catch { return false; }
}

function part(seg, name) {
  let text;
  try { text = utf8Decode(base64ToBytes(seg)); }
  catch { throw new Error(`The ${name} isn't valid base64url`); }
  try { return { json: JSON.parse(text), text }; }
  catch { throw new Error(`The ${name} isn't valid JSON`); }
}

export const TIME_CLAIMS = ['exp', 'nbf', 'iat', 'auth_time', 'updated_at'];
export const CLAIM_NAMES = {
  iss: 'Issuer', sub: 'Subject', aud: 'Audience', exp: 'Expires', nbf: 'Not before', iat: 'Issued at', jti: 'JWT ID',
  auth_time: 'Authenticated at', updated_at: 'Updated at', azp: 'Authorized party', scope: 'Scope', nonce: 'Nonce',
  name: 'Name', email: 'Email', alg: 'Algorithm', typ: 'Type', kid: 'Key ID', cty: 'Content type',
};

/**
 * decode(token, nowMs) -> { header, payload, signature, alg, times:[{claim,label,ms}], status }
 * status: { expired, notYetValid, expiresInMs }
 */
export function decodeJwt(token, nowMs = Date.now()) {
  const t = String(token).trim().replace(/^Bearer\s+/i, '');
  const segs = t.split('.');
  if (segs.length === 5) throw new Error('This looks like an encrypted JWE (5 parts) — it can’t be decoded without the key');
  if (segs.length !== 3) throw new Error(`A JWT has 3 parts separated by dots — this has ${segs.length}`);
  const header = part(segs[0], 'header');
  const payload = part(segs[1], 'payload');
  const p = payload.json;
  const times = [];
  if (p && typeof p === 'object') for (const c of TIME_CLAIMS) {
    if (typeof p[c] === 'number' && Number.isFinite(p[c])) times.push({ claim: c, label: CLAIM_NAMES[c], ms: p[c] * 1000 });
  }
  const exp = p && typeof p.exp === 'number' ? p.exp * 1000 : null;
  const nbf = p && typeof p.nbf === 'number' ? p.nbf * 1000 : null;
  return {
    header: header.json, payload: p, headerText: header.text, payloadText: payload.text,
    signature: segs[2], alg: header.json && header.json.alg, signingInput: segs[0] + '.' + segs[1],
    times,
    status: {
      expired: exp != null && nowMs >= exp,
      notYetValid: nbf != null && nowMs < nbf,
      expiresInMs: exp != null ? exp - nowMs : null,
      hasExp: exp != null,
    },
  };
}

const HS = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' };

/** verify HS* signature with a shared secret. secretEncoding: 'utf8' | 'base64' -> true/false; throws for unsupported alg */
export async function verifyHmacJwt(token, secret, { secretEncoding = 'utf8' } = {}) {
  const d = decodeJwt(token);
  const algo = HS[d.alg];
  if (!algo) throw new Error(d.alg === 'none' ? 'alg "none" — unsigned token' : `Only HS256/384/512 can be checked here (this is ${d.alg})`);
  const key = secretEncoding === 'base64' ? base64ToBytes(secret) : utf8Encode(secret);
  const sig = await hmac(algo, key, d.signingInput);
  return bytesToBase64(sig, { urlSafe: true, pad: false }) === d.signature;
}

/** Sign (for tests / samples): HS* only */
export async function signHmacJwt(header, payload, secret) {
  const enc = (o) => bytesToBase64(utf8Encode(JSON.stringify(o)), { urlSafe: true, pad: false });
  const input = enc(header) + '.' + enc(payload);
  const sig = await hmac(HS[header.alg], utf8Encode(secret), input);
  return input + '.' + bytesToBase64(sig, { urlSafe: true, pad: false });
}
