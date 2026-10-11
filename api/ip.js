// Vercel Node.js serverless function: "what this website can see about you", for /net.
//
//   GET /api/ip  ->  { ip, version, country, region, city, lat, lon, tz, ..., via, edge }
//
// Everything comes from the request itself: the connecting IP and the geo
// headers Vercel (x-vercel-ip-*) and Cloudflare (cf-*) attach to it. There are
// no third-party lookups, nothing is logged or stored, and the answer is
// never cached (it is different for every visitor).
//
// www.szvtech.org is proxied by Cloudflare, so the TCP peer Vercel sees (and
// its x-vercel-ip-* geo) can be a Cloudflare server near the visitor. When
// cf-connecting-ip is present it wins, together with Cloudflare's own geo
// headers; Vercel's geo is used for fields Cloudflare doesn't send.
import { isIP } from 'node:net';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  Pragma: 'no-cache',
  Expires: '0',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function h(headers, name) {
  const v = headers && headers[name];
  return Array.isArray(v) ? v[0] : v;
}

// header value -> short, printable string (or null)
export function clean(v, max = 80) {
  if (v === undefined || v === null) return null;
  let s = String(v);
  try { if (/%[0-9a-f]{2}/i.test(s)) s = decodeURIComponent(s); } catch { /* keep raw */ }
  s = s.replace(/[\u0000-\u001f\u007f<>"`]/g, '').trim();
  if (!s) return null;
  return s.slice(0, max);
}

export function cleanIp(v) {
  let s = clean(v, 64);
  if (!s) return null;
  s = s.split(',')[0].trim();
  if (/^\[.*\]/.test(s)) s = s.slice(1, s.indexOf(']'));              // [v6]:port
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(s)) s = s.split(':')[0];    // v4:port
  if (/^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(s)) s = s.slice(7);          // v4-mapped v6
  return isIP(s) ? s : null;
}

function country(v) {
  const s = clean(v, 4);
  return s && /^[A-Z]{2}$/i.test(s) ? s.toUpperCase() : null;
}
function coord(v, lim) {
  const s = clean(v, 20);
  if (!s || !/^-?\d{1,3}(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Math.abs(n) <= lim ? n : null;
}
function tz(v) {
  const s = clean(v, 40);
  return s && /^[A-Za-z_]+(\/[A-Za-z0-9_+\-]+){0,2}$/.test(s) ? s : null;
}
function code(v, max = 12) {
  const s = clean(v, max);
  return s && /^[A-Za-z0-9 ._-]+$/.test(s) ? s : null;
}

function isPrivate(ip) {
  return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(ip) || ip === '::1' || /^f[cd]|^fe80/i.test(ip);
}

export function describe(req) {
  const H = (req && req.headers) || {};
  const cfIp = cleanIp(h(H, 'cf-connecting-ip'));
  const fwd = cleanIp(h(H, 'x-forwarded-for')) || cleanIp(h(H, 'x-real-ip'));
  const sock = cleanIp(req && req.socket && req.socket.remoteAddress);
  const ip = cfIp || fwd || sock;
  const via = cfIp ? 'cloudflare' : fwd ? 'vercel' : sock ? 'socket' : null;
  const cf = !!cfIp;
  const pick = (cfName, vName, fn, ...a) => (cf && fn(h(H, cfName), ...a)) || fn(h(H, vName), ...a) || null;

  const out = {
    ip,
    version: ip ? (isIP(ip) === 6 ? 6 : 4) : null,
    local: ip ? isPrivate(ip) : null,
    via,
    country: pick('cf-ipcountry', 'x-vercel-ip-country', country),
    region: pick('cf-region', 'x-vercel-ip-country-region', clean, 60),
    regionCode: pick('cf-region-code', 'x-vercel-ip-country-region', code, 8),
    city: pick('cf-ipcity', 'x-vercel-ip-city', clean, 60),
    postal: pick('cf-postal-code', 'x-vercel-ip-postal-code', code, 12),
    continent: pick('cf-ipcontinent', 'x-vercel-ip-continent', code, 3),
    lat: (cf ? coord(h(H, 'cf-iplatitude'), 90) : null) ?? coord(h(H, 'x-vercel-ip-latitude'), 90),
    lon: (cf ? coord(h(H, 'cf-iplongitude'), 180) : null) ?? coord(h(H, 'x-vercel-ip-longitude'), 180),
    tz: pick('cf-timezone', 'x-vercel-ip-timezone', tz),
    asn: code(h(H, 'cf-ipasn') || h(H, 'x-vercel-ip-as-number'), 12),
    isp: clean(h(H, 'cf-ipasorg') || h(H, 'x-vercel-ip-as-org'), 80),
    proto: code(h(H, 'x-forwarded-proto'), 8),
    ua: clean(h(H, 'user-agent'), 300),
    lang: clean(h(H, 'accept-language'), 120),
    // which headers the city/region came from (Vercel's may describe the
    // Cloudflare server in between rather than the visitor)
    geo: cf && h(H, 'cf-ipcity') ? 'cloudflare' : h(H, 'x-vercel-ip-city') || h(H, 'x-vercel-ip-country') ? 'vercel' : cf && h(H, 'cf-ipcountry') ? 'cloudflare' : null,
    edge: edgeInfo(H),
    t: Date.now(),
  };
  // Vercel's region code duplicates as region name; drop the dup
  if (out.region && out.regionCode && out.region === out.regionCode) out.region = null;
  // Cloudflare's "unknown" / Tor pseudo-countries
  if (out.country === 'XX') out.country = null;
  return out;
}

// "where did this request land": Cloudflare data center + Vercel edge/function region
export function edgeInfo(H) {
  const ray = clean(h(H, 'cf-ray'), 40);
  const colo = ray && /-([A-Z]{3})$/.exec(ray);
  const vid = clean(h(H, 'x-vercel-id'), 120);
  const parts = vid ? vid.split('::').filter((p) => /^[a-z]{3}\d$/.test(p)) : [];
  return {
    cf: colo ? colo[1] : null,
    vercelEdge: parts[0] || null,
    vercelRegion: parts.length > 1 ? parts[parts.length - 1] : (code(process.env.VERCEL_REGION, 8) || null),
  };
}

export default function handler(req, res) {
  for (const k in NO_STORE) res.setHeader(k, NO_STORE[k]);
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end('{"error":"method not allowed"}');
    return;
  }
  const body = JSON.stringify(describe(req));
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(method === 'HEAD' ? undefined : body);
}
