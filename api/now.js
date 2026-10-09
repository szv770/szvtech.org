// Vercel Node.js serverless function: the server's clock, for /time.
//
//   GET /api/now  ->  { "t": 1791561600123, "s": "vercel" }
//
// /time measures the round trip of a few of these requests (NTP style) to work
// out how far the visitor's device clock is off, then shows corrected time.
// Vercel's servers keep NTP-synced clocks. The response must never be cached
// anywhere (browser, Cloudflare, Vercel's edge): a cached timestamp is a wrong
// timestamp. Query parameters (the client adds ?r=<random>) are ignored.
// Nothing is awaited: `t` is read as late as possible, right before sending.

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  Pragma: 'no-cache',
  Expires: '0',
  'Access-Control-Allow-Origin': '*',
  'Timing-Allow-Origin': '*',
  'X-Content-Type-Options': 'nosniff',
};

export default function handler(req, res) {
  for (const k in NO_STORE) res.setHeader(k, NO_STORE[k]);
  const method = req.method || 'GET';
  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    res.end();
    return;
  }
  if (method !== 'GET' && method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end('{"error":"method not allowed"}');
    return;
  }
  const t = Date.now();
  const json = `{"t":${t},"s":"vercel"}`;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(json));
  res.setHeader('Server-Timing', `t;desc="${t}"`);
  res.end(method === 'HEAD' ? undefined : json);
}
