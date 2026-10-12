// Vercel Node.js serverless function: weather for /weather.
//
//   GET /api/weather?lat=40.71&lon=-74.01&units=us
//   GET /api/weather?zip=11213&units=metric
//
// Open-Meteo (free, no key) is fetched from a fixed URL built only from strictly
// validated numbers, never an open proxy. A ZIP is first turned into
// coordinates through zippopotam.us (fixed URL, 5 digits only). Coordinates
// are rounded to 2 decimals (~1 km) so nearby requests share one cache entry.
// Normalized JSON out; nothing is logged or stored.

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const ZIPAPI = 'https://api.zippopotam.us/us/';
const USER_AGENT = 'szvtech.org-weather/1.0 (+https://szvtech.org/weather)';
const TIMEOUT_MS = 6000;
const MAX_BYTES = 512 * 1024;
const CACHE = 'public, s-maxage=600, stale-while-revalidate=1800';
const CREDIT = 'Weather data by Open-Meteo.com';

const CURRENT = 'temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m';
const HOURLY = 'temperature_2m,precipitation_probability,weather_code,is_day,wind_speed_10m,uv_index';
const DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,precipitation_sum,wind_speed_10m_max';
const UNITS = {
  us: { temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch', labels: { temp: '°F', wind: 'mph', precip: 'in', pressure: 'inHg' } },
  metric: { temperature_unit: 'celsius', wind_speed_unit: 'kmh', precipitation_unit: 'mm', labels: { temp: '°C', wind: 'km/h', precip: 'mm', pressure: 'hPa' } },
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Validate the query. Returns { lat, lon } | { zip }, plus units. Throws HttpError(400). */
export function parseQuery(query) {
  const units = query.units === undefined ? 'us' : query.units;
  if (!Object.prototype.hasOwnProperty.call(UNITS, units)) throw new HttpError(400, 'units must be us or metric');
  if (query.zip !== undefined) {
    if (!/^\d{5}$/.test(String(query.zip))) throw new HttpError(400, 'zip must be 5 digits');
    return { zip: String(query.zip), units };
  }
  const num = (v) => (/^-?\d{1,3}(\.\d{1,6})?$/.test(String(v)) ? Number(v) : NaN);
  const lat = num(query.lat), lon = num(query.lon);
  if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) throw new HttpError(400, 'lat/lon out of range');
  return { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, units };
}

async function getJSON(url) {
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new HttpError(504, e && e.name === 'TimeoutError' ? 'upstream timeout' : 'upstream fetch failed');
  }
  if (res.status === 404) throw new HttpError(404, 'not found');
  if (!res.ok) throw new HttpError(502, 'upstream error');
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new HttpError(502, 'upstream response too large');
  try { return JSON.parse(text); } catch { throw new HttpError(502, 'upstream sent bad JSON'); }
}

const n = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const col = (o, k) => (o && Array.isArray(o[k]) ? o[k].map((v) => (typeof v === 'number' ? n(v) : v)) : []);

/** Open-Meteo response -> the compact shape the page uses. */
export function normalize(raw, units, place) {
  const c = raw.current || {}, h = raw.hourly || {}, d = raw.daily || {};
  const hours = col(h, 'time').map((time, i) => ({
    time, temp: col(h, 'temperature_2m')[i], pop: col(h, 'precipitation_probability')[i],
    code: col(h, 'weather_code')[i], day: col(h, 'is_day')[i], wind: col(h, 'wind_speed_10m')[i], uv: col(h, 'uv_index')[i],
  }));
  const days = col(d, 'time').map((date, i) => ({
    date, code: col(d, 'weather_code')[i], hi: col(d, 'temperature_2m_max')[i], lo: col(d, 'temperature_2m_min')[i],
    sunrise: col(d, 'sunrise')[i], sunset: col(d, 'sunset')[i], uv: col(d, 'uv_index_max')[i],
    pop: col(d, 'precipitation_probability_max')[i], precip: col(d, 'precipitation_sum')[i], wind: col(d, 'wind_speed_10m_max')[i],
  }));
  const hpa = n(c.pressure_msl);
  return {
    place: place || null,
    lat: n(raw.latitude), lon: n(raw.longitude),
    tz: typeof raw.timezone === 'string' ? raw.timezone : null,
    utcOffset: n(raw.utc_offset_seconds),
    units: UNITS[units].labels,
    current: {
      time: c.time || null, temp: n(c.temperature_2m), feels: n(c.apparent_temperature), humidity: n(c.relative_humidity_2m),
      day: c.is_day === 1, precip: n(c.precipitation), code: n(c.weather_code), cloud: n(c.cloud_cover),
      pressure: hpa == null ? null : units === 'us' ? Math.round(hpa * 0.02953 * 100) / 100 : Math.round(hpa),
      wind: n(c.wind_speed_10m), windDir: n(c.wind_direction_10m), gust: n(c.wind_gusts_10m),
    },
    hours, days,
    credit: CREDIT,
  };
}

export default async function handler(req, res) {
  const send = (status, obj, cache = 'no-store') => {
    const body = JSON.stringify(obj);
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', cache);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(body);
  };
  try {
    const method = req.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); throw new HttpError(405, 'method not allowed'); }
    const query = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    const q = parseQuery(query);
    let { lat, lon } = q, place = null;
    if (q.zip) {
      const z = await getJSON(ZIPAPI + q.zip);
      const p = z && Array.isArray(z.places) && z.places[0];
      lat = p ? Math.round(parseFloat(p.latitude) * 100) / 100 : NaN;
      lon = p ? Math.round(parseFloat(p.longitude) * 100) / 100 : NaN;
      if (!isFinite(lat) || !isFinite(lon)) throw new HttpError(404, 'zip not found');
      place = `${String(p['place name']).slice(0, 60)}, ${String(p['state abbreviation'] || '').slice(0, 3)}`.replace(/, $/, '');
    }
    const u = UNITS[q.units];
    const url = `${FORECAST}?latitude=${lat}&longitude=${lon}&current=${CURRENT}&hourly=${HOURLY}&daily=${DAILY}` +
      `&temperature_unit=${u.temperature_unit}&wind_speed_unit=${u.wind_speed_unit}&precipitation_unit=${u.precipitation_unit}` +
      '&timezone=auto&forecast_days=8&forecast_hours=48&past_hours=0';
    const raw = await getJSON(url);
    send(200, normalize(raw, q.units, place), CACHE);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    send(status, { error: e instanceof HttpError ? e.message : 'internal error' });
  }
}
