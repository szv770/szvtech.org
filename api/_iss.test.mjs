// Tests for api/iss.js. Run with:  node api/_iss.test.mjs
//   --offline   skip the live upstream call
//
// Lives under api/ with a leading underscore so Vercel does not route it; if
// it is ever deployed anyway it just answers 404.
import { pathToFileURL } from 'node:url';
import handler, { parseTle } from './iss.js';

export default function notAFunction(req, res) {
  res.statusCode = 404;
  res.end('Not found');
}

const L0 = 'ISS (ZARYA)';
const L1 = '1 25544U 98067A   26282.95044904  .00006711  00000+0  13074-3 0  9997';
const L2 = '2 25544  51.6315  92.1575 0006672 244.0714 115.9587 15.48795780589546';

let failures = 0, passes = 0;
function check(name, cond, detail) {
  if (cond) { passes++; console.log(`  ok   ${name}`); }
  else { failures++; console.log(`  FAIL ${name}${detail ? ' :: ' + detail : ''}`); }
}

async function run() {
  const t = parseTle(`${L0}\n${L1}\n${L2}\n`);
  check('parses a 3-line TLE', !!t && t.name === 'ISS (ZARYA)' && t.line1 === L1);
  check('epoch is 2026-10-09 ~22:48 UTC', t && Math.abs(t.epoch - Date.UTC(2026, 9, 9, 22, 48, 39)) < 90000, String(t && t.epoch));
  check('parses 2-line TLE', !!parseTle(`${L1}\r\n${L2}`));
  check('rejects bad checksum', parseTle(`${L0}\n${L1.slice(0, 68)}0\n${L2}`) === null);
  check('rejects other satellites', parseTle(`X\n${L1.replace('25544', '25545')}\n${L2}`) === null);
  check('rejects short / empty / non-string', parseTle(`${L0}\n${L1.slice(0, 60)}\n${L2}`) === null && parseTle('') === null && parseTle(null) === null);
  check('rejects oversized input', parseTle('x'.repeat(3000)) === null);
  check('name is sanitized', parseTle(`<b>ISS</b>\n${L1}\n${L2}`).name === 'bISSb');

  // handler: method + headers (no network)
  const mk = () => { const r = { h: {}, setHeader(k, v) { this.h[k] = v; }, end(b) { this.body = b; } }; return r; };
  let r = mk(); await handler({ method: 'POST' }, r);
  check('POST -> 405', r.statusCode === 405);
  r = mk(); await handler({ method: 'OPTIONS' }, r);
  check('OPTIONS -> 204 + CORS', r.statusCode === 204 && r.h['Access-Control-Allow-Origin'] === '*');

  if (!process.argv.includes('--offline')) {
    r = mk(); await handler({ method: 'GET', url: '/api/iss' }, r);
    if (r.statusCode === 200) {
      const j = JSON.parse(r.body);
      check('live: 200 with valid TLE', !!parseTle(`${j.line1}\n${j.line2}`) && ['celestrak', 'wheretheiss.at'].includes(j.source), r.body);
      check('live: cacheable', /s-maxage=\d+/.test(r.h['Cache-Control']));
      check('live: epoch within 10 days', Math.abs(Date.now() - j.epoch) < 10 * 86400000);
    } else {
      console.log(`  skip live check (status ${r.statusCode}: ${r.body})`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}
