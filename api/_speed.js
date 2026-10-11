// PARKED: rename to api/speed.js to enable the /net speed test (costs Vercel bandwidth, ~20–70 MB per test).
// The leading "_" keeps Vercel from deploying it (and tools/devserver.mjs from routing it).
// See net/SPEED.md for the rest of the switch-on steps.
//
// Vercel Node.js serverless function: the other end of the /net speed test.
//
//   GET  /api/speed?bytes=5000000     ->  5,000,000 bytes of incompressible noise
//   POST /api/speed  (any body)       ->  { "bytes": 4000000, "ms": 812.4, "t": 1791561600123 }
//
// Download: streams N random-ish bytes (a 64 KiB block of random data generated
// once per instance, repeated) so nothing along the way (Vercel, Cloudflare,
// the browser) can compress or cache it. Upload: reads the request body,
// counts it and throws it away. Nothing is stored or logged.
//
// Abuse limits: only GET/POST/OPTIONS; `bytes` must be a plain integer in
// 1..MAX_BYTES (anything else -> 400); upload bodies over MAX_BYTES -> 413.
// Note: Vercel caps request bodies at ~4.5 MB, so the /net client uploads in
// chunks well below that. Every response is no-store / no-transform.
import { randomBytes } from 'node:crypto';

export const MAX_BYTES = 25 * 1024 * 1024; // 25 MiB per request
export const DEFAULT_BYTES = 1024 * 1024;
const BLOCK = randomBytes(64 * 1024);

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, no-transform, must-revalidate, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  Pragma: 'no-cache',
  Expires: '0',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'Server-Timing, X-Bytes',
  'Timing-Allow-Origin': '*',
  'X-Content-Type-Options': 'nosniff',
};
const ALLOW = 'GET, POST, OPTIONS';

// "bytes" query param -> integer, or null when it's not acceptable.
export function parseBytes(raw) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_BYTES;
  if (Array.isArray(raw)) return null;
  const s = String(raw);
  if (!/^\d{1,9}$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_BYTES) return null;
  return n;
}

function queryOf(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  try { return Object.fromEntries(new URL(req.url || '/', 'http://x').searchParams); } catch { return {}; }
}

function json(res, status, obj, extra) {
  const body = JSON.stringify(obj);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  if (extra) for (const k in extra) res.setHeader(k, extra[k]);
  res.end(body);
}

function download(req, res, n) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Encoding', 'identity');
  res.setHeader('Content-Length', n);
  res.setHeader('X-Bytes', n);
  res.setHeader('Server-Timing', `t;desc="${Date.now()}"`);
  return new Promise((resolve) => {
    let left = n, off = 0, done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const pump = () => {
      while (left > 0) {
        const take = Math.min(left, BLOCK.length - off);
        const chunk = BLOCK.subarray(off, off + take);
        left -= take;
        off = (off + take) % BLOCK.length;
        if (left === 0) { res.end(chunk, finish); return; }
        if (!res.write(chunk)) { res.once('drain', pump); return; }
      }
    };
    res.on('close', finish); // client aborted (test deadline): just stop
    res.on('error', finish);
    pump();
  });
}

async function upload(req, res) {
  const declared = Number(req.headers && req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    json(res, 413, { error: 'too large', max: MAX_BYTES }, { Connection: 'close' });
    return;
  }
  const t0 = performance.now();
  let first = 0, bytes = 0;
  try {
    for await (const chunk of req) {
      if (!first) first = performance.now();
      bytes += chunk.length;
      if (bytes > MAX_BYTES) {
        res.setHeader('Connection', 'close');
        json(res, 413, { error: 'too large', max: MAX_BYTES });
        req.destroy();
        return;
      }
    }
  } catch {
    if (!res.headersSent) json(res, 400, { error: 'upload interrupted' });
    return;
  }
  const t1 = performance.now();
  const ms = Math.round((t1 - (first || t0)) * 10) / 10;
  json(res, 200, { bytes, ms, t: Date.now() }, { 'Server-Timing': `recv;dur=${ms}` });
}

export default async function handler(req, res) {
  for (const k in NO_STORE) res.setHeader(k, NO_STORE[k]);
  const method = req.method || 'GET';
  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Methods', ALLOW);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Allow', ALLOW);
    res.end();
    return;
  }
  if (method === 'GET') {
    const n = parseBytes(queryOf(req).bytes);
    if (n === null) return json(res, 400, { error: `bytes must be an integer from 1 to ${MAX_BYTES}` });
    return download(req, res, n);
  }
  if (method === 'POST') return upload(req, res);
  res.setHeader('Allow', ALLOW);
  json(res, 405, { error: 'method not allowed' });
}
