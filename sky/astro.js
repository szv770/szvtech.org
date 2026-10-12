// astro.js — the math behind /sky. No DOM, no network: pure functions that the
// page (and sky.test.mjs) call. Two pinned CDN libraries are injected via init():
//   satellite.js 6.0.2  (SGP4 orbit propagation from a TLE)
//   astronomy-engine 2.1.19  (Moon, planets, twilight; VSOP87-grade accuracy)
// Every time in and out is an absolute instant (Date / ms); time zones are only
// applied by the page when it formats.

let S = null; // satellite.js
let A = null; // astronomy-engine

export function init(libs) { S = libs.satellite; A = libs.Astronomy; }

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const RE = 6371;            // mean Earth radius, km
const AU = 149597870.7;     // km
const MIN = 60000, HOUR = 3600000, DAY = 86400000;

export const ISS_CATNR = 25544;
// Last-resort ISS orbit (CelesTrak, epoch 2026-10-10). Only used when the live
// fetch fails and nothing is cached; the page says how old it is.
export const FALLBACK_TLE = Object.freeze({
  name: 'ISS (ZARYA)',
  l1: '1 25544U 98067A   26282.95044904  .00006711  00000+0  13074-3 0  9997',
  l2: '2 25544  51.6315  92.1575 0006672 244.0714 115.9587 15.48795780589546',
});

/* ======================================================================
   TLE
   ====================================================================== */
function tleChecksum(line) {
  let s = 0;
  for (let i = 0; i < 68; i++) { const c = line[i]; if (c >= '0' && c <= '9') s += +c; else if (c === '-') s += 1; }
  return s % 10;
}
/** Parse a 3-line (or 2-line) TLE block; strict: checksums, line numbers, catalog number. */
export function parseTLE(text, catnr = ISS_CATNR) {
  if (typeof text !== 'string' || text.length > 2000) return null;
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, '')).filter(Boolean);
  const i1 = lines.findIndex((l) => l.startsWith('1 '));
  if (i1 < 0 || !lines[i1 + 1]) return null;
  const l1 = lines[i1], l2 = lines[i1 + 1];
  if (l1.length !== 69 || l2.length !== 69 || !l2.startsWith('2 ')) return null;
  if (+l1[68] !== tleChecksum(l1) || +l2[68] !== tleChecksum(l2)) return null;
  if (+l1.slice(2, 7) !== catnr || +l2.slice(2, 7) !== catnr) return null;
  const name = i1 > 0 ? lines[i1 - 1].trim().slice(0, 40) : 'ISS';
  return { name, l1, l2, epoch: tleEpoch(l1) };
}
/** TLE epoch → ms since 1970. */
export function tleEpoch(l1) {
  const yy = +l1.slice(18, 20), doy = parseFloat(l1.slice(20, 32));
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  return Date.UTC(year, 0, 1) + (doy - 1) * DAY;
}
export function satrec(tle) { return S.twoline2satrec(tle.l1, tle.l2); }

/* ======================================================================
   Sun (low precision, ~0.01°) — enough for shadows and the terminator
   ====================================================================== */
export function sunVector(date) {
  const n = (+date / DAY + 2440587.5) - 2451545.0;
  const L = (280.460 + 0.9856474 * n) * RAD;
  const g = (357.528 + 0.9856003 * n) * RAD;
  const lam = L + (1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const R = (1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g)) * AU;
  const u = { x: Math.cos(lam), y: Math.cos(eps) * Math.sin(lam), z: Math.sin(eps) * Math.sin(lam) };
  return { u, r: R, ra: Math.atan2(u.y, u.x), dec: Math.asin(u.z) };
}
/** Point on Earth where the Sun is overhead: { lat, lon } in degrees. */
export function subsolar(date) {
  const s = sunVector(date);
  const gmst = S.gstime(new Date(+date));
  return { lat: s.dec * DEG, lon: wrapLon((s.ra - gmst) * DEG) };
}
export const wrapLon = (lon) => ((lon + 540) % 360) - 180;

/* ======================================================================
   ISS state
   ====================================================================== */
/** Position of the satellite at `date`: lat/lon (deg), alt (km), speed (km/s), eci (km). */
export function satState(rec, date) {
  const d = new Date(+date);
  const pv = S.propagate(rec, d);
  if (!pv || !pv.position || typeof pv.position === 'boolean') return null;
  const gmst = S.gstime(d);
  const g = S.eciToGeodetic(pv.position, gmst);
  const v = pv.velocity;
  return {
    t: +date,
    lat: g.latitude * DEG,
    lon: wrapLon(g.longitude * DEG),
    alt: g.height,
    speed: Math.hypot(v.x, v.y, v.z), // inertial km/s
    eci: pv.position,
    gmst,
  };
}
/** Sub-satellite points from t0+fromMin to t0+toMin. */
export function groundTrack(rec, t0, fromMin, toMin, stepSec = 30) {
  const out = [];
  for (let s = fromMin * 60; s <= toMin * 60; s += stepSec) {
    const st = satState(rec, +t0 + s * 1000);
    if (st) out.push({ t: st.t, lat: st.lat, lon: st.lon, alt: st.alt });
  }
  return out;
}
/** Is a point (ECI km) in Earth's shadow? Cylindrical model. */
export function inShadow(eci, sunU) {
  const d = eci.x * sunU.x + eci.y * sunU.y + eci.z * sunU.z;
  if (d > 0) return false;
  const px = eci.x - d * sunU.x, py = eci.y - d * sunU.y, pz = eci.z - d * sunU.z;
  return Math.hypot(px, py, pz) < RE;
}
/** Great-circle distance in km. */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * RAD, p2 = lat2 * RAD, dp = p2 - p1, dl = (lon2 - lon1) * RAD;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * RE * Math.asin(Math.min(1, Math.sqrt(a)));
}
/** Footprint: angular radius (deg) of the area that sees the satellite above `minEl` degrees. */
export function footprintDeg(altKm, minEl = 10) {
  const e = minEl * RAD, r = RE / (RE + altKm);
  return (Math.acos(r * Math.cos(e)) - e) * DEG;
}

/* look angles of satellite + sun for an observer */
function observerGd(obs) { return { latitude: obs.lat * RAD, longitude: obs.lon * RAD, height: (obs.h || 0) / 1000 }; }
function look(rec, gd, t) {
  const d = new Date(t);
  const pv = S.propagate(rec, d);
  if (!pv || !pv.position || typeof pv.position === 'boolean') return null;
  const gmst = S.gstime(d);
  const ecf = S.eciToEcf(pv.position, gmst);
  const la = S.ecfToLookAngles(gd, ecf);
  return { t, az: la.azimuth * DEG, el: la.elevation * DEG, range: la.rangeSat, eci: pv.position, gmst };
}
/** Altitude of the Sun (deg, geometric) for an observer. */
export function sunAltitude(obs, t) {
  const s = sunVector(t);
  const gmst = S.gstime(new Date(t));
  const ecf = S.eciToEcf({ x: s.u.x * s.r, y: s.u.y * s.r, z: s.u.z * s.r }, gmst);
  return S.ecfToLookAngles(observerGd(obs), ecf).elevation * DEG;
}
/** Satellite above an observer right now: { az, el, range } (deg/km). */
export function lookAngles(rec, obs, t) {
  const l = look(rec, observerGd(obs), +t);
  return l && { az: l.az, el: l.el, range: l.range };
}

/** Rough visual magnitude (std mag -1.8 at 1000 km, half phase). */
function magnitude(l, obs, sunU) {
  const oe = S.ecfToEci(S.geodeticToEcf(observerGd(obs)), l.gmst);
  const toObs = { x: oe.x - l.eci.x, y: oe.y - l.eci.y, z: oe.z - l.eci.z };
  const n = Math.hypot(toObs.x, toObs.y, toObs.z);
  const cosb = (toObs.x * sunU.x + toObs.y * sunU.y + toObs.z * sunU.z) / n;
  const b = Math.acos(Math.max(-1, Math.min(1, cosb))); // phase angle: 0 = sunlit face toward us
  const f = Math.max(1e-3, Math.sin(b) + (Math.PI - b) * Math.cos(b));
  return Math.max(-4.5, Math.min(4, -1.8 + 5 * Math.log10(l.range / 1000) - 2.5 * Math.log10(f)));
}

/**
 * Passes of the satellite over an observer between t0 and t0+days.
 * Returns [{ rise, max, set, visible, vis: {start, max, end} | null, mag }], each point { t, az, el }.
 * A pass is "visible" when the satellite is sunlit, the observer's sky is dark
 * (Sun below -6°) and it climbs at least 10° during that time.
 */
export function findPasses(rec, obs, t0, days = 4, opts = {}) {
  const gd = observerGd(obs);
  const step = 30000, end = +t0 + days * DAY, minEl = opts.minEl ?? 0;
  const passes = [];
  const el = (t) => { const l = look(rec, gd, t); return l ? l.el : -90; };
  const refine = (a, b, rising) => { // el crosses minEl between a and b
    for (let i = 0; i < 14; i++) { const m = (a + b) / 2; if ((el(m) > minEl) === rising) b = m; else a = m; }
    return b;
  };
  let tPrev = +t0, ePrev = el(tPrev);
  let riseT = ePrev > minEl ? +t0 : null;
  for (let t = tPrev + step; t <= end + 20 * MIN; t += step) {
    const e = el(t);
    if (riseT == null && e > minEl && ePrev <= minEl) {
      if (t - step > end) break;
      riseT = refine(t - step, t, true);
    } else if (riseT != null && e <= minEl && ePrev > minEl) {
      const setT = refine(t - step, t, false);
      passes.push(describePass(rec, gd, obs, riseT, setT));
      riseT = null;
      if (opts.limit && passes.length >= opts.limit) break;
    }
    ePrev = e;
  }
  return passes;
}
function describePass(rec, gd, obs, riseT, setT) {
  const pt = (l) => ({ t: Math.round(l.t), az: l.az, el: l.el });
  let max = null, vStart = null, vEnd = null, vMax = null, mag = null;
  for (let t = riseT; t <= setT + 1; t += 5000) {
    const tt = Math.min(t, setT);
    const l = look(rec, gd, tt);
    if (!l) continue;
    if (!max || l.el > max.el) max = l;
    const s = sunVector(tt);
    const lit = !inShadow(l.eci, s.u);
    const dark = sunAltitude(obs, tt) < -6;
    if (lit && dark && l.el > 0) {
      if (!vStart) vStart = l;
      vEnd = l;
      if (!vMax || l.el > vMax.el) { vMax = l; mag = magnitude(l, obs, s.u); }
    }
  }
  const visible = !!vMax && vMax.el >= 10 && vEnd.t - vStart.t >= 30000;
  return {
    rise: pt(look(rec, gd, riseT)), max: pt(max), set: pt(look(rec, gd, setT)),
    visible,
    vis: visible ? { start: pt(vStart), max: pt(vMax), end: pt(vEnd) } : null,
    mag: visible ? Math.round(mag * 10) / 10 : null,
  };
}
export function brightnessLabel(mag) {
  if (mag == null) return '';
  if (mag <= -3) return 'brilliant';
  if (mag <= -2) return 'very bright';
  if (mag <= -1) return 'bright';
  return 'modest';
}

/* ======================================================================
   Directions
   ====================================================================== */
const PTS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass16 = (az) => PTS16[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];
const PTS8 = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
export const compassWord = (az) => PTS8[Math.round((((az % 360) + 360) % 360) / 45) % 8];

/* ======================================================================
   "Over: <country / ocean>" from world-atlas TopoJSON
   ====================================================================== */
const RENAME = {
  'United States of America': 'United States', Palestine: 'Israel', 'Dem. Rep. Congo': 'DR Congo',
  'Central African Rep.': 'Central African Republic', 'Bosnia and Herz.': 'Bosnia & Herzegovina',
  'Dominican Rep.': 'Dominican Republic', 'S. Sudan': 'South Sudan', 'Eq. Guinea': 'Equatorial Guinea',
  'Solomon Is.': 'Solomon Islands', 'Falkland Is.': 'Falkland Islands', 'Fr. S. Antarctic Lands': 'French Southern Lands',
  'W. Sahara': 'Western Sahara', 'N. Cyprus': 'Cyprus', "Côte d'Ivoire": "Côte d'Ivoire",
};
/** Decode a TopoJSON GeometryCollection into [{ name, polys: [[ring...]...], bbox }]. */
export function decodeTopo(topo, objectName = 'countries') {
  const tr = topo.transform;
  const arcs = topo.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => { x += dx; y += dy; return tr ? [x * tr.scale[0] + tr.translate[0], y * tr.scale[1] + tr.translate[1]] : [dx, dy]; });
  });
  const ring = (ids) => {
    const out = [];
    ids.forEach((i, k) => {
      const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
      out.push(...(k ? a.slice(1) : a));
    });
    return out;
  };
  const obj = topo.objects[objectName];
  return obj.geometries.map((g) => {
    const polys = g.type === 'Polygon' ? [g.arcs.map(ring)] : g.type === 'MultiPolygon' ? g.arcs.map((p) => p.map(ring)) : [];
    let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
    for (const p of polys) for (const [x, y] of p[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const raw = (g.properties && g.properties.name) || '';
    return { name: RENAME[raw] || raw, polys, bbox: [x0, y0, x1, y1] };
  }).filter((c) => c.polys.length);
}
function inRing(x, y, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function countryAt(countries, lat, lon) {
  for (const c of countries) {
    const [x0, y0, x1, y1] = c.bbox;
    if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
    for (const p of c.polys) {
      if (!inRing(lon, lat, p[0])) continue;
      let hole = false;
      for (let k = 1; k < p.length; k++) if (inRing(lon, lat, p[k])) { hole = true; break; }
      if (!hole) return c.name;
    }
  }
  return null;
}
// Seas first (small boxes), then the big oceans. Approximate on purpose.
const SEAS = [
  ['Mediterranean Sea', 30, 46, -6, 36.5], ['Black Sea', 40.5, 47, 27, 42], ['Caspian Sea', 36.5, 47.5, 46.5, 55],
  ['Red Sea', 12.5, 30, 32, 43.5], ['Persian Gulf', 23.5, 30.5, 47.5, 57], ['Gulf of Mexico', 18, 31, -98, -81],
  ['Caribbean Sea', 9, 22, -88, -60], ['Hudson Bay', 51, 66, -95, -76], ['Baltic Sea', 53.5, 66, 9.5, 30.5],
  ['North Sea', 51, 61.5, -4, 9.5], ['Bay of Bengal', 5, 23, 79.5, 95], ['Arabian Sea', 5, 25.5, 50, 77.5],
  ['South China Sea', 0, 23, 105, 121], ['Sea of Japan', 34, 51.5, 127, 142], ['East China Sea', 23, 34, 117, 131],
  ['Philippine Sea', 5, 34, 121, 145], ['Coral Sea', -30, -9, 142, 165], ['Tasman Sea', -47, -30, 147, 173],
  ['Bering Sea', 51.5, 66, 162, 180], ['Bering Sea', 51.5, 66, -180, -157], ['Gulf of Alaska', 50, 61, -157, -132],
  ['Sea of Okhotsk', 43, 62, 135, 162], ['Java Sea', -8, -3, 105, 119], ['Gulf of Guinea', -5, 6.5, -10, 10],
];
export function waterAt(lat, lon) {
  for (const [n, a, b, c, d] of SEAS) if (lat >= a && lat <= b && lon >= c && lon <= d) return n;
  if (lat > 66) return 'Arctic Ocean';
  if (lat < -60) return 'Southern Ocean';
  // Indian Ocean: south of Asia, between Africa and Australia
  if (lon >= 20 && lon <= 147 && lat < 30 && !(lon > 100 && lat > 0) && !(lon > 120 && lat > -12)) {
    if (lon < 120 || lat < -25) return 'Indian Ocean';
  }
  // Atlantic: between the Americas and Europe/Africa
  // (land is matched first, so the west edge only has to split the two coasts)
  const atlW = lat >= 18 ? -100 : lat >= 9 ? -83 : -70;
  if (lon >= atlW && lon <= 20) return lat >= 0 ? 'North Atlantic Ocean' : 'South Atlantic Ocean';
  return lat >= 0 ? 'North Pacific Ocean' : 'South Pacific Ocean';
}
export function placeAt(countries, lat, lon) {
  const c = countries && countryAt(countries, lat, lon);
  return c ? { kind: 'land', name: c } : { kind: 'water', name: waterAt(lat, lon) };
}

/* ======================================================================
   Moon (astronomy-engine)
   ====================================================================== */
const SYNODIC = 29.530588853;
export function moonPhaseName(elong) {
  const e = ((elong % 360) + 360) % 360;
  if (e < 6 || e >= 354) return 'New Moon';
  if (e < 84) return 'Waxing Crescent';
  if (e < 96) return 'First Quarter';
  if (e < 174) return 'Waxing Gibbous';
  if (e < 186) return 'Full Moon';
  if (e < 264) return 'Waning Gibbous';
  if (e < 276) return 'Last Quarter';
  return 'Waning Crescent';
}
const dt = (x) => (x ? x.date : null);
export function moonInfo(date, obs) {
  const d = new Date(+date);
  const elong = A.MoonPhase(d);
  const ill = A.Illumination(A.Body.Moon, d);
  let prevNew = dt(A.SearchMoonPhase(0, new Date(+d - 31 * DAY), 31.5));
  if (prevNew && +prevNew > +d) prevNew = dt(A.SearchMoonPhase(0, new Date(+d - 45 * DAY), 20));
  const later = prevNew && dt(A.SearchMoonPhase(0, new Date(+prevNew + DAY), 31));
  if (later && +later <= +d) prevNew = later;
  const nextNew = dt(A.SearchMoonPhase(0, d, 31));
  const nextFull = dt(A.SearchMoonPhase(180, d, 31));
  const nextFirst = dt(A.SearchMoonPhase(90, d, 31));
  const nextLast = dt(A.SearchMoonPhase(270, d, 31));
  const out = {
    elong,
    name: moonPhaseName(elong),
    illum: ill.phase_fraction,
    mag: ill.mag,
    age: prevNew ? (+d - +prevNew) / DAY : (elong / 360) * SYNODIC,
    waxing: elong < 180,
    prevNew, nextNew, nextFull, nextFirst, nextLast,
  };
  if (obs) {
    const o = new A.Observer(obs.lat, obs.lon, obs.h || 0);
    const eq = A.Equator(A.Body.Moon, d, o, true, true);
    const hz = A.Horizon(d, o, eq.ra, eq.dec, 'normal');
    out.alt = hz.altitude; out.az = hz.azimuth; out.distKm = eq.dist * AU;
  }
  return out;
}
/** Rise/set of a body inside [from, to). */
export function riseSetBetween(body, obs, from, to) {
  const o = new A.Observer(obs.lat, obs.lon, obs.h || 0);
  const days = (+to - +from) / DAY;
  const rise = A.SearchRiseSet(body, o, +1, new Date(+from), days);
  const set = A.SearchRiseSet(body, o, -1, new Date(+from), days);
  return { rise: rise && +rise.date < +to ? rise.date : null, set: set && +set.date < +to ? set.date : null };
}

/* ======================================================================
   Tonight: sunset → twilights → dawn
   ====================================================================== */
export function nightOf(now, obs) {
  const o = new A.Observer(obs.lat, obs.lon, obs.h || 0);
  const t = +now;
  const sr = (dir, from, lim = 2) => dt(A.SearchRiseSet(A.Body.Sun, o, dir, new Date(from), lim));
  const sa = (dir, from, alt, lim = 1.2) => dt(A.SearchAltitude(A.Body.Sun, o, dir, new Date(from), lim, alt));
  // the night we are in, or the next one
  let sunset = sr(-1, t - DAY);
  if (sunset) {
    const rise = sr(+1, +sunset);
    if (rise && +rise < t) sunset = sr(-1, t);
  }
  const base = sunset ? +sunset : t;
  const ev = {
    sunset,
    civilDusk: sa(-1, base, -6), nauticalDusk: sa(-1, base, -12), astroDusk: sa(-1, base, -18),
  };
  const dawnFrom = ev.astroDusk || ev.nauticalDusk || ev.civilDusk || sunset || new Date(t);
  ev.astroDawn = sa(+1, +dawnFrom, -18);
  ev.nauticalDawn = sa(+1, +dawnFrom, -12);
  ev.civilDawn = sa(+1, +dawnFrom, -6);
  ev.sunrise = sr(+1, base, 1.5);
  // keep only dawn events of this same night
  for (const k of ['astroDawn', 'nauticalDawn', 'civilDawn']) if (ev[k] && ev.sunrise && +ev[k] > +ev.sunrise) ev[k] = null;
  const sunNow = A.Horizon(new Date(t), o, ...raDec(A.Body.Sun, t, o), 'normal').altitude;
  ev.sunAlt = sunNow;
  ev.phase = sunNow > -0.833 ? 'day' : sunNow > -6 ? 'civil twilight' : sunNow > -12 ? 'nautical twilight' : sunNow > -18 ? 'astronomical twilight' : 'night';
  return ev;
}
function raDec(body, t, o) { const e = A.Equator(body, new Date(t), o, true, true); return [e.ra, e.dec]; }

export const PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
export function bodyHorizon(body, t, obs) {
  const o = new A.Observer(obs.lat, obs.lon, obs.h || 0);
  const e = A.Equator(body, new Date(+t), o, true, true);
  const h = A.Horizon(new Date(+t), o, e.ra, e.dec, 'normal');
  return { alt: h.altitude, az: h.azimuth };
}
/** Planets now + their best moment during the coming/current dark hours. */
export function planetsTonight(now, obs, night) {
  const o = new A.Observer(obs.lat, obs.lon, obs.h || 0);
  const from = night.civilDusk || night.sunset, to = night.civilDawn || night.sunrise;
  return PLANETS.map((name) => {
    const body = A.Body[name];
    const cur = bodyHorizon(body, now, obs);
    const mag = A.Illumination(body, new Date(+now)).mag;
    let best = null;
    if (from && to) {
      const a = Math.max(+from, +now - 0), b = +to;
      for (let t = Math.min(a, b); t <= b; t += 15 * MIN) {
        const h = bodyHorizon(body, t, obs);
        if (!best || h.alt > best.alt) best = { t, alt: h.alt, az: h.az };
      }
    }
    const rs = riseSetBetween(body, obs, +now, +now + DAY);
    const elong = A.AngleFromSun(body, new Date(+now));
    return { name, alt: cur.alt, az: cur.az, mag, best, rise: rs.rise, set: rs.set, elong, visibleTonight: !!best && best.alt > 5 && elong > 10 };
  });
}

/* bright stars for the sky dome: [name, RA hours (J2000), Dec deg, mag] */
export const STARS = [
  ['Sirius', 6.7525, -16.716, -1.46], ['Canopus', 6.3992, -52.696, -0.74], ['Arcturus', 14.261, 19.182, -0.05],
  ['Vega', 18.6156, 38.784, 0.03], ['Capella', 5.2782, 45.998, 0.08], ['Rigel', 5.2423, -8.202, 0.13],
  ['Procyon', 7.655, 5.225, 0.34], ['Betelgeuse', 5.9195, 7.407, 0.5], ['Achernar', 1.6286, -57.237, 0.46],
  ['Altair', 19.8464, 8.868, 0.77], ['Aldebaran', 4.5987, 16.509, 0.85], ['Antares', 16.4901, -26.432, 0.96],
  ['Spica', 13.4199, -11.161, 0.97], ['Pollux', 7.7553, 28.026, 1.14], ['Fomalhaut', 22.9608, -29.622, 1.16],
  ['Deneb', 20.6905, 45.28, 1.25], ['Regulus', 10.1395, 11.967, 1.35], ['Castor', 7.5767, 31.888, 1.58],
  ['Polaris', 2.5303, 89.264, 1.98], ['Bellatrix', 5.4189, 6.35, 1.64], ['Alnilam', 5.6036, -1.202, 1.69],
  ['Dubhe', 11.0621, 61.751, 1.79], ['Alkaid', 13.7923, 49.313, 1.86], ['Mirfak', 3.4054, 49.861, 1.79],
  ['Acrux', 12.4433, -63.099, 0.76], ['Hadar', 14.0637, -60.373, 0.61], ['Rigil Kent.', 14.6601, -60.834, -0.27],
];
export function starHorizon(star, t, obs) {
  const o = new A.Observer(obs.lat, obs.lon, obs.h || 0);
  const h = A.Horizon(new Date(+t), o, star[1], star[2], 'normal');
  return { alt: h.altitude, az: h.azimuth };
}

/* ======================================================================
   Hebrew month (Intl hebrew calendar) — "Rosh Chodesh in N days"
   ====================================================================== */
const HEB_NAMES = {
  Tishri: 'Tishrei', Heshvan: 'Cheshvan', Kislev: 'Kislev', Tevet: 'Teves', Shevat: 'Shevat',
  'Adar I': 'Adar I', 'Adar II': 'Adar II', Adar: 'Adar', Nisan: 'Nissan', Iyar: 'Iyar', Sivan: 'Sivan',
  Tamuz: 'Tammuz', Av: 'Menachem Av', Elul: 'Elul',
};
export function hebrewParts(date, tz) {
  try {
    const f = new Intl.DateTimeFormat('en-u-ca-hebrew', { timeZone: tz, day: 'numeric', month: 'long', year: 'numeric' });
    const p = {};
    for (const { type, value } of f.formatToParts(date)) p[type] = value;
    const month = p.month;
    return { day: +p.day, month: HEB_NAMES[month] || month, raw: month, year: +String(p.year || p.relatedYear || '').replace(/\D/g, '') };
  } catch (e) { return null; }
}
/** Next Rosh Chodesh (civil-date based) from `date`, in tz: { days, month, dayOf (1|2), total (1|2) } */
export function nextRoshChodesh(date, tz) {
  for (let k = 0; k <= 31; k++) {
    const d = new Date(+date + k * DAY);
    const p = hebrewParts(d, tz);
    if (!p) return null;
    if (p.day === 30) {
      const nx = hebrewParts(new Date(+d + DAY), tz);
      return { days: k, month: nx ? nx.month : '', dayOf: 1, total: 2 };
    }
    if (p.day === 1 && p.raw !== 'Tishri') {
      const pv = hebrewParts(new Date(+d - DAY), tz);
      const two = pv && pv.day === 30;
      return { days: k, month: p.month, dayOf: two ? 2 : 1, total: two ? 2 : 1 };
    }
  }
  return null;
}
