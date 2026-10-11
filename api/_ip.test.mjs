// Tests for api/ip.js. Run with:  node api/_ip.test.mjs
//
// The leading underscore keeps Vercel from deploying this as a function. In
// case it is ever deployed anyway, its default export just answers 404.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import handler, { describe, cleanIp, clean } from './ip.js';

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

const VERCEL = {
  'x-forwarded-for': '203.0.113.9',
  'x-vercel-ip-country': 'US',
  'x-vercel-ip-country-region': 'NY',
  'x-vercel-ip-city': 'New%20York',
  'x-vercel-ip-latitude': '40.7128',
  'x-vercel-ip-longitude': '-74.0060',
  'x-vercel-ip-timezone': 'America/New_York',
  'x-vercel-id': 'iad1::iad1::abcd1-1791561600000-0123456789ab',
  'user-agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/130',
  'accept-language': 'en-US,en;q=0.9',
  'x-forwarded-proto': 'https',
};
const CF = {
  ...VERCEL,
  'x-forwarded-for': '172.70.1.2',          // the Cloudflare server in between
  'x-vercel-ip-city': 'Newark',
  'cf-connecting-ip': '2001:db8::42',
  'cf-ipcountry': 'us',
  'cf-ipcity': 'Brooklyn',
  'cf-region': 'New York',
  'cf-region-code': 'NY',
  'cf-iplatitude': '40.6782',
  'cf-iplongitude': '-73.9442',
  'cf-timezone': 'America/New_York',
  'cf-ray': '8d1234567890abcd-EWR',
};

function unitTests() {
  console.log('cleanIp / clean');
  check('v4', cleanIp('203.0.113.9') === '203.0.113.9');
  check('first of a list', cleanIp('203.0.113.9, 10.0.0.1') === '203.0.113.9');
  check('v6', cleanIp('2001:db8::1') === '2001:db8::1');
  check('[v6]:port', cleanIp('[2001:db8::1]:443') === '2001:db8::1');
  check('v4:port', cleanIp('203.0.113.9:5555') === '203.0.113.9');
  check('v4-mapped v6', cleanIp('::ffff:127.0.0.1') === '127.0.0.1');
  for (const bad of ['hello', '<script>', '999.1.1.1', '', null, undefined, '1.2.3']) check(`rejects ip ${JSON.stringify(bad)}`, cleanIp(bad) === null);
  check('clean strips control chars and markup', clean('a\u0000b<c>"d') === 'abcd', clean('a\u0000b<c>"d'));
  check('clean decodes %20', clean('San%20Jos%C3%A9') === 'San José');
  check('clean caps length', clean('x'.repeat(500)).length === 80);

  console.log('describe: Vercel only');
  let d = describe({ headers: VERCEL });
  check('ip + v4', d.ip === '203.0.113.9' && d.version === 4 && d.via === 'vercel' && d.local === false, d);
  check('city decoded', d.city === 'New York', d.city);
  check('country/region', d.country === 'US' && d.regionCode === 'NY', d);
  check('coords', d.lat === 40.7128 && d.lon === -74.006, [d.lat, d.lon]);
  check('tz', d.tz === 'America/New_York');
  check('edge region', d.edge.vercelEdge === 'iad1' && d.edge.vercelRegion === 'iad1' && d.edge.cf === null, d.edge);
  check('geo source vercel', d.geo === 'vercel');
  check('ua + lang', /Android/.test(d.ua) && /en-US/.test(d.lang));

  console.log('describe: Cloudflare in front');
  d = describe({ headers: CF });
  check('cf-connecting-ip wins', d.ip === '2001:db8::42' && d.version === 6 && d.via === 'cloudflare', d);
  check('cf geo wins', d.city === 'Brooklyn' && d.region === 'New York' && d.country === 'US' && d.lat === 40.6782, d);
  check('cf colo from ray', d.edge.cf === 'EWR', d.edge);
  check('geo source cloudflare', d.geo === 'cloudflare');

  console.log('describe: hostile / empty');
  d = describe({ headers: { 'x-forwarded-for': 'not-an-ip', 'x-vercel-ip-latitude': '999', 'x-vercel-ip-timezone': '../../etc', 'x-vercel-ip-country': 'USA<' } });
  check('bad values dropped', d.ip === null && d.lat === null && d.tz === null && d.country === null, d);
  d = describe({ headers: {}, socket: { remoteAddress: '::ffff:127.0.0.1' } });
  check('falls back to the socket', d.ip === '127.0.0.1' && d.via === 'socket' && d.local === true, d);
  d = describe({ headers: { 'cf-connecting-ip': '198.51.100.7', 'cf-ipcountry': 'XX' } });
  check('XX country -> null', d.country === null && d.ip === '198.51.100.7');
}

async function httpTests() {
  console.log('over HTTP');
  const srv = http.createServer((req, res) => handler(req, res));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/api/ip`;
  try {
    let r = await fetch(base, { headers: { 'x-forwarded-for': '203.0.113.5', 'x-vercel-ip-city': 'Paris', 'x-vercel-ip-country': 'FR' } });
    const j = await r.json();
    check('200 json', r.status === 200 && /json/.test(r.headers.get('content-type')));
    check('values', j.ip === '203.0.113.5' && j.city === 'Paris' && j.country === 'FR', j);
    check('no-store, private', /no-store/.test(r.headers.get('cache-control')) && /private/.test(r.headers.get('cache-control')));
    check('not CORS-readable by other sites', r.headers.get('access-control-allow-origin') === null);
    r = await fetch(base, { method: 'POST', body: 'x' });
    check('POST -> 405', r.status === 405);
  } finally { srv.close(); }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  unitTests();
  await httpTests();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}
