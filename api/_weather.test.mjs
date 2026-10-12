// Tests for api/weather.js. Run with:  node api/_weather.test.mjs
// The leading underscore keeps Vercel from deploying this as a function.
import { pathToFileURL } from 'node:url';
import handler, { parseQuery, normalize } from './weather.js';

export default function notAFunction(req, res) { res.statusCode = 404; res.end('Not found'); }

let passes = 0, failures = 0;
function check(name, ok, detail) {
  if (ok) { passes++; console.log('  ok  ', name); }
  else { failures++; console.log('  FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); }
}
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.status; } };

function unitTests() {
  console.log('parseQuery');
  const q = parseQuery({ lat: '40.7128', lon: '-74.0060' });
  check('rounds to 2 decimals, default units us', q.lat === 40.71 && q.lon === -74.01 && q.units === 'us', q);
  check('metric accepted', parseQuery({ lat: '1', lon: '2', units: 'metric' }).units === 'metric');
  check('bad units 400', throws(() => parseQuery({ lat: '1', lon: '2', units: 'kelvin' })) === 400);
  check('units "__proto__" 400', throws(() => parseQuery({ lat: '1', lon: '2', units: '__proto__' })) === 400);
  check('lat out of range 400', throws(() => parseQuery({ lat: '91', lon: '0' })) === 400);
  check('lon out of range 400', throws(() => parseQuery({ lat: '0', lon: '181' })) === 400);
  check('junk lat 400', throws(() => parseQuery({ lat: '1e2', lon: '0' })) === 400);
  check('missing coords 400', throws(() => parseQuery({})) === 400);
  check('zip ok', parseQuery({ zip: '11213' }).zip === '11213');
  check('zip with letters 400', throws(() => parseQuery({ zip: '1121x' })) === 400);
  check('zip too long 400', throws(() => parseQuery({ zip: '112134' })) === 400);

  console.log('normalize');
  const raw = {
    latitude: 40.71, longitude: -74.01, timezone: 'America/New_York', utc_offset_seconds: -14400,
    current: { time: '2026-10-12T01:30', temperature_2m: 52.1, apparent_temperature: 49, relative_humidity_2m: 70, is_day: 0, precipitation: 0, weather_code: 3, cloud_cover: 90, pressure_msl: 1015, wind_speed_10m: 6, wind_direction_10m: 200, wind_gusts_10m: 12 },
    hourly: { time: ['2026-10-12T01:00'], temperature_2m: [52], precipitation_probability: [10], weather_code: [3], is_day: [0], wind_speed_10m: [6], uv_index: [0] },
    daily: { time: ['2026-10-12'], weather_code: [61], temperature_2m_max: [60], temperature_2m_min: [48], sunrise: ['2026-10-12T07:00'], sunset: ['2026-10-12T18:10'], uv_index_max: [3], precipitation_probability_max: [40], precipitation_sum: [0.1], wind_speed_10m_max: [15] },
  };
  const o = normalize(raw, 'us', 'Brooklyn, NY');
  check('current mapped', o.current.temp === 52.1 && o.current.day === false && o.current.code === 3, o.current);
  check('pressure to inHg', o.current.pressure === 29.97, o.current.pressure);
  check('metric pressure hPa', normalize(raw, 'metric').current.pressure === 1015);
  check('hours/days mapped', o.hours[0].pop === 10 && o.days[0].hi === 60 && o.days[0].sunset === '2026-10-12T18:10');
  check('empty upstream survives', normalize({}, 'us').hours.length === 0 && normalize({}, 'us').current.temp === null);
  check('units labels', o.units.temp === '°F' && o.units.wind === 'mph');
}

async function handlerTests() {
  console.log('handler (stubbed fetch)');
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).startsWith('https://api.zippopotam.us/us/')) {
      return String(url).endsWith('00000') ? new Response('{}', { status: 404 })
        : new Response(JSON.stringify({ places: [{ 'place name': 'Brooklyn', latitude: '40.67', longitude: '-73.9366', 'state abbreviation': 'NY' }] }));
    }
    return new Response(JSON.stringify({ latitude: 40.67, longitude: -73.94, timezone: 'America/New_York', current: { temperature_2m: 50 } }));
  };
  const run = async (url, method = 'GET') => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = b; } };
    await handler({ method, url }, res);
    return { res, json: JSON.parse(res.body) };
  };
  try {
    let r = await run('/api/weather?lat=40.7128&lon=-74.006');
    check('200 with cache headers', r.res.statusCode === 200 && /s-maxage=600/.test(r.res.headers['cache-control']), r.res.headers);
    check('upstream URL is fixed host with rounded coords', calls[0].startsWith('https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.01&'), calls[0]);
    r = await run('/api/weather?zip=11213&units=metric');
    check('zip geocoded, place returned', r.json.place === 'Brooklyn, NY' && calls.at(-1).includes('latitude=40.67&longitude=-73.94') && calls.at(-1).includes('celsius'), calls.at(-1));
    r = await run('/api/weather?zip=00000');
    check('unknown zip 404, not cached', r.res.statusCode === 404 && r.res.headers['cache-control'] === 'no-store');
    const before = calls.length;
    r = await run('/api/weather?lat=abc&lon=1');
    check('bad input 400 and no upstream call', r.res.statusCode === 400 && calls.length === before);
    r = await run('/api/weather?lat=1&lon=1', 'POST');
    check('POST 405', r.res.statusCode === 405);
    globalThis.fetch = async () => { throw Object.assign(new Error('x'), { name: 'TimeoutError' }); };
    r = await run('/api/weather?lat=1&lon=1');
    check('timeout -> 504', r.res.statusCode === 504, r.json);
  } finally { globalThis.fetch = real; }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  unitTests();
  await handlerTests();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}
