// Tests for the PARKED speed-test endpoint api/_speed.js. Run with:  node api/_speed.test.mjs
// (When the speed test is switched on, api/_speed.js becomes api/speed.js: update the import below.)
//
// The leading underscore keeps Vercel from deploying this as a function. In
// case it is ever deployed anyway, its default export just answers 404.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import handler, { parseBytes, MAX_BYTES, DEFAULT_BYTES } from './_speed.js';

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

function unitTests() {
  console.log('parseBytes');
  check('missing -> default', parseBytes(undefined) === DEFAULT_BYTES && parseBytes('') === DEFAULT_BYTES);
  check('plain integer', parseBytes('12345') === 12345);
  check('max allowed', parseBytes(String(MAX_BYTES)) === MAX_BYTES);
  for (const bad of ['0', String(MAX_BYTES + 1), '-5', '1e6', '1.5', 'abc', '0x10', ' 10', '9999999999', '100000000000000', ['1', '2']]) {
    check(`rejects ${JSON.stringify(bad)}`, parseBytes(bad) === null, parseBytes(bad));
  }
}

async function httpTests() {
  console.log('over HTTP');
  const srv = http.createServer((req, res) => handler(req, res));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/api/speed`;
  try {
    // download
    let r = await fetch(`${base}?bytes=1000000&r=0.5`);
    let buf = Buffer.from(await r.arrayBuffer());
    check('GET 200', r.status === 200, r.status);
    check('exact byte count', buf.length === 1000000, buf.length);
    check('content-length', r.headers.get('content-length') === '1000000');
    check('octet-stream', r.headers.get('content-type') === 'application/octet-stream');
    check('content-encoding identity', r.headers.get('content-encoding') === 'identity');
    check('no-store + no-transform', /no-store/.test(r.headers.get('cache-control')) && /no-transform/.test(r.headers.get('cache-control')));
    check('cloudflare no-store', r.headers.get('cloudflare-cdn-cache-control') === 'no-store');
    // incompressible-ish: a 64 KiB block shouldn't be mostly one byte value
    const counts = new Uint32Array(256);
    for (let i = 0; i < 65536; i++) counts[buf[i]]++;
    check('looks random (no byte > 1% of a block)', Math.max(...counts) < 656, Math.max(...counts));
    const gz = (await import('node:zlib')).gzipSync(buf.subarray(0, 65536));
    check('does not compress', gz.length > 65000, gz.length);

    r = await fetch(`${base}?bytes=${MAX_BYTES}`);
    buf = Buffer.from(await r.arrayBuffer());
    check('max size streams fully', r.status === 200 && buf.length === MAX_BYTES, buf.length);

    r = await fetch(`${base}`);
    buf = Buffer.from(await r.arrayBuffer());
    check('no bytes param -> default size', buf.length === DEFAULT_BYTES, buf.length);

    for (const q of ['bytes=0', `bytes=${MAX_BYTES + 1}`, 'bytes=abc', 'bytes=1e9', 'bytes=-1']) {
      r = await fetch(`${base}?${q}`);
      const j = await r.json().catch(() => null);
      check(`GET ?${q} -> 400 json`, r.status === 400 && j && j.error, r.status);
    }

    // client abort mid-stream must not crash the server
    const ctl = new AbortController();
    r = await fetch(`${base}?bytes=${MAX_BYTES}`, { signal: ctl.signal });
    const rd = r.body.getReader();
    await rd.read();
    ctl.abort();
    await new Promise((res) => setTimeout(res, 50));
    r = await fetch(`${base}?bytes=10`);
    check('server fine after an aborted download', r.status === 200 && (await r.arrayBuffer()).byteLength === 10);

    // upload
    const body = new Uint8Array(3_000_000).fill(7);
    r = await fetch(base, { method: 'POST', body, headers: { 'content-type': 'application/octet-stream' } });
    let j = await r.json();
    check('POST counts bytes', r.status === 200 && j.bytes === 3_000_000, j);
    check('POST server timing', typeof j.ms === 'number' && j.ms >= 0 && Number.isInteger(j.t) && /^recv;dur=/.test(r.headers.get('server-timing')), j);
    check('POST no-store', /no-store/.test(r.headers.get('cache-control')));

    r = await fetch(base, { method: 'POST', body: new Uint8Array(0) });
    j = await r.json();
    check('POST empty -> 0 bytes', r.status === 200 && j.bytes === 0, j);

    // too large (declared length)
    const big = await rawPost(base, MAX_BYTES + 10, true);
    check('POST over cap (content-length) -> 413', big.status === 413, big);
    // too large (chunked, no length)
    const big2 = await rawPost(base, MAX_BYTES + 70000, false);
    check('POST over cap (chunked) -> 413', big2.status === 413 || big2.status === 'reset', big2);

    // methods
    for (const m of ['PUT', 'DELETE', 'PATCH', 'HEAD']) {
      r = await fetch(base, { method: m });
      check(`${m} -> 405`, r.status === 405 && r.headers.get('allow') === 'GET, POST, OPTIONS', r.status);
    }
    r = await fetch(base, { method: 'OPTIONS' });
    check('OPTIONS -> 204 CORS', r.status === 204 && /POST/.test(r.headers.get('access-control-allow-methods')));
  } finally { srv.close(); }
}

// POST n bytes with node:http so we can send a lying/absent content-length
function rawPost(url, n, withLength) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST',
      headers: withLength ? { 'content-length': n } : { 'transfer-encoding': 'chunked' } }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('error', () => resolve({ status: 'reset' }));
    const chunk = Buffer.alloc(64 * 1024, 1);
    let sent = 0;
    const write = () => {
      while (sent < n) {
        const c = chunk.subarray(0, Math.min(chunk.length, n - sent));
        sent += c.length;
        if (!req.write(c)) { req.once('drain', write); return; }
      }
      req.end();
    };
    if (withLength) { req.write(chunk); setTimeout(() => req.destroy(), 300); } // server answers 413 without reading
    else write();
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  unitTests();
  await httpTests();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}
