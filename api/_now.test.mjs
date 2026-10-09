// Tests for api/now.js. Run with:  node api/_now.test.mjs
//
// The leading underscore keeps Vercel from deploying this as a function. In
// case it is ever deployed anyway, its default export just answers 404; the
// tests only run when this file is executed directly.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import handler from './now.js';

export default function notAFunction(req, res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Not found');
}

let passes = 0, failures = 0;
function check(name, ok, detail) {
  if (ok) { passes++; console.log('  ok  ', name); }
  else { failures++; console.log('  FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); }
}

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: undefined, ended: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = String(v); },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    end(b) { this.body = b; this.ended = true; },
  };
}
function call(method = 'GET', url = '/api/now') {
  const res = mockRes();
  const before = Date.now();
  handler({ method, url, headers: {} }, res); // synchronous: nothing is awaited
  const after = Date.now();
  let json = null;
  try { json = res.body ? JSON.parse(res.body) : null; } catch {}
  return { res, json, before, after };
}

function unitTests() {
  console.log('handler');
  const { res, json, before, after } = call('GET', '/api/now?r=0.123456');
  check('responds synchronously', res.ended);
  check('200', res.statusCode === 200, res.statusCode);
  check('json shape', json && Number.isInteger(json.t) && json.s === 'vercel' && Object.keys(json).length === 2, json);
  check('t within 50ms of the local clock', json && json.t >= before - 50 && json.t <= after + 50, [before, json && json.t, after]);
  const h = res.headers;
  check('content-type', h['content-type'] === 'application/json; charset=utf-8', h['content-type']);
  check('content-length', +h['content-length'] === Buffer.byteLength(res.body), h['content-length']);
  check('cache-control no-store', h['cache-control'] === 'no-store, no-cache, must-revalidate, max-age=0', h['cache-control']);
  check('cdn-cache-control', h['cdn-cache-control'] === 'no-store');
  check('cloudflare-cdn-cache-control', h['cloudflare-cdn-cache-control'] === 'no-store');
  check('pragma', h.pragma === 'no-cache');
  check('cors', h['access-control-allow-origin'] === '*');
  check('server-timing', new RegExp(`^t;desc="${json && json.t}"$`).test(h['server-timing'] || ''), h['server-timing']);

  const head = call('HEAD');
  check('HEAD -> 200, no body, no-store', head.res.statusCode === 200 && head.res.body === undefined && /no-store/.test(head.res.headers['cache-control']));
  const opt = call('OPTIONS');
  check('OPTIONS -> 204 with CORS', opt.res.statusCode === 204 && /GET/.test(opt.res.headers['access-control-allow-methods'] || ''));
  for (const m of ['POST', 'PUT', 'DELETE']) {
    const r = call(m);
    check(`${m} -> 405`, r.res.statusCode === 405 && r.res.headers.allow === 'GET, HEAD, OPTIONS' && /no-store/.test(r.res.headers['cache-control']));
  }
  const q = call('GET', '/api/now?r=1&t=0&s=evil');
  check('query params ignored', q.json && q.json.s === 'vercel' && Math.abs(q.json.t - Date.now()) < 50, q.json);
}

async function httpTest() {
  console.log('over HTTP');
  const srv = http.createServer((req, res) => handler(req, res));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address();
  try {
    const rtts = [];
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      const r = await fetch(`http://127.0.0.1:${port}/api/now?r=${Math.random()}`, { cache: 'no-store' });
      const t1 = Date.now();
      const j = await r.json();
      rtts.push(t1 - t0);
      if (i === 4) {
        check('HTTP 200 + no-store', r.status === 200 && /no-store/.test(r.headers.get('cache-control')));
        check('HTTP t within 50ms of the local clock', j.t >= t0 - 50 && j.t <= t1 + 50, [t0, j.t, t1]);
      }
    }
    check('fast (min RTT < 50ms locally)', Math.min(...rtts) < 50, rtts);
  } finally { srv.close(); }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  unitTests();
  await httpTest();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}
