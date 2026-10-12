// Vercel Node.js serverless function: the ISS's current orbit (a TLE) for /sky.
//
//   GET /api/iss  ->  { source, name, line1, line2, epoch, fetched }
//
// Neither CelesTrak nor wheretheiss.at is guaranteed to be reachable from a
// browser, so this function fetches one of two FIXED upstream URLs (never an
// open proxy; the visitor controls no part of the URL), validates the
// two-line element set strictly (length, line numbers, checksums, catalog
// number 25544) and returns normalized JSON. /sky then propagates the orbit
// itself (SGP4), so one small cached response is all the page needs. The
// element set changes about every few hours; a short shared cache is plenty.
// No dependencies; relies on Node 18+ global fetch.

const SOURCES = [
  { id: 'celestrak', url: 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE' },
  { id: 'wheretheiss.at', url: 'https://api.wheretheiss.at/v1/satellites/25544/tles?format=text' },
];
const USER_AGENT = 'szvtech.org-sky/1.0 (+https://szvtech.org/sky)';
const TIMEOUT_MS = 6000;
const MAX_BYTES = 8 * 1024;
const CATNR = 25544;
const DAY = 86400000;
const CACHE_OK = 'public, s-maxage=1800, stale-while-revalidate=21600';

function checksum(line) {
  let s = 0;
  for (let i = 0; i < 68; i++) {
    const c = line[i];
    if (c >= '0' && c <= '9') s += +c;
    else if (c === '-') s += 1;
  }
  return s % 10;
}

/** Strict TLE parse. Returns { name, line1, line2, epoch } or null. */
export function parseTle(text) {
  if (typeof text !== 'string' || text.length > 2000) return null;
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, '')).filter(Boolean);
  const i = lines.findIndex((l) => l.startsWith('1 '));
  if (i < 0 || !lines[i + 1]) return null;
  const l1 = lines[i], l2 = lines[i + 1];
  if (l1.length !== 69 || l2.length !== 69 || !l2.startsWith('2 ')) return null;
  if (!/^[0-9]$/.test(l1[68]) || !/^[0-9]$/.test(l2[68])) return null;
  if (+l1[68] !== checksum(l1) || +l2[68] !== checksum(l2)) return null;
  if (+l1.slice(2, 7) !== CATNR || +l2.slice(2, 7) !== CATNR) return null;
  const yy = +l1.slice(18, 20), doy = parseFloat(l1.slice(20, 32));
  if (!isFinite(yy) || !isFinite(doy) || doy < 1 || doy >= 367) return null;
  const epoch = Date.UTC(yy < 57 ? 2000 + yy : 1900 + yy, 0, 1) + (doy - 1) * DAY;
  const name = i > 0 ? lines[i - 1].replace(/[^A-Za-z0-9 ()\-]/g, '').trim().slice(0, 40) : '';
  return { name: name || 'ISS (ZARYA)', line1: l1, line2: l2, epoch: Math.round(epoch) };
}

class UpstreamError extends Error {}

async function fetchSource(src) {
  let res;
  try {
    res = await fetch(src.url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/plain' },
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new UpstreamError(e && e.name === 'TimeoutError' ? 'timeout' : 'fetch failed');
  }
  if (res.status !== 200) throw new UpstreamError(`status ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new UpstreamError('too large');
  const tle = parseTle(text);
  if (!tle) throw new UpstreamError('not a valid ISS element set');
  return tle;
}

function send(req, res, status, body, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', cache || 'no-store');
  const json = JSON.stringify(body);
  res.setHeader('Content-Length', Buffer.byteLength(json));
  res.end(req.method === 'HEAD' ? undefined : json);
}

export default async function handler(req, res) {
  const method = req.method || 'GET';
  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.end();
    return;
  }
  if (method !== 'GET' && method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    return send(req, res, 405, { error: 'method not allowed' });
  }
  const errors = [];
  for (const src of SOURCES) {
    try {
      const tle = await fetchSource(src);
      return send(req, res, 200, { source: src.id, ...tle, fetched: Date.now() }, CACHE_OK);
    } catch (e) {
      errors.push(`${src.id}: ${e.message}`);
    }
  }
  return send(req, res, 502, { error: 'orbit data unavailable', detail: errors }, 'no-store');
}
