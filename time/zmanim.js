// zmanim.js — dependency-free sun times & halachic times (zmanim).
//
// Solar position: NOAA solar calculator equations (after Meeus, "Astronomical
// Algorithms"). All math is done on absolute UTC instants; the location's IANA
// time zone (via Intl) is used only to decide which local calendar day / weekday
// an instant belongs to. The device time zone is never consulted.
//
// loc = { lat, lon, tz: 'IANA/Zone', elevation?: meters (default 0), candleMinutes?: number }
// Every returned time is a Date (absolute instant) or null when the event does
// not occur on that day (polar day / polar night / sun never reaches the depression).

// Defaults follow Chabad.org's published zmanim (Shulchan Aruch HaRav / Baal HaTanya),
// fitted against the chabad.org zmanim feed (see zmanim.test.mjs):
//   alos 16.9° · misheyakir 10.2° · tzeis 6° · Shabbos ends 8.5° · candle lighting 18 min
//   shaos zmaniyos measured from "netz amiti" to "shkiah amiti" = sun center 1.583° below
//   the geometric horizon (not visible sunrise/sunset). Pass { dayDegrees: 'sunrise' } for
//   the plain GRA day (visible sunrise → sunset), e.g. to match Hebcal/MyZmanim GRA times.
export const DEFAULTS = Object.freeze({
  candleMinutes: 18,
  tzeisDegrees: 6,
  shabbosEnds: Object.freeze({ type: 'degrees', value: 8.5 }),
  alosDegrees: 16.9,
  misheyakirDegrees: 10.2,
  dayDegrees: 1.583,
});

// How chabad.org rounds each zman to the displayed minute (lechumra: "earliest"
// times rounded later, "latest" times rounded earlier). Verified on 48 feed days.
export const CHABAD_ROUNDING = Object.freeze({
  alos: 'floor', misheyakir: 'ceil', sunrise: 'round', sofZmanShma: 'floor',
  sofZmanTefila: 'floor', chatzos: 'floor', minchaGedola: 'ceil', minchaKetana: 'ceil',
  plagHamincha: 'ceil', sunset: 'round', tzeis: 'ceil', candleLighting: 'round',
  shabbosEnds: 'round',
});

/** Round a zman Date to the whole minute the way chabad.org displays it (null-safe). */
export function roundZman(date, key) {
  if (!date) return null;
  const mode = CHABAD_ROUNDING[key] || 'round';
  const f = mode === 'floor' ? Math.floor : mode === 'ceil' ? Math.ceil : Math.round;
  return new Date(f(+date / MIN_MS) * MIN_MS);
}

export const ZMANIM_LABELS = Object.freeze({
  alos: 'Alos Hashachar',
  misheyakir: 'Misheyakir',
  sunrise: 'Netz',
  sofZmanShma: 'Sof Zman Shema',
  sofZmanTefila: 'Sof Zman Tefillah',
  chatzos: 'Chatzos',
  minchaGedola: 'Mincha Gedolah',
  minchaKetana: 'Mincha Ketanah',
  plagHamincha: 'Plag Hamincha',
  sunset: 'Shkiah',
  tzeis: 'Tzeis',
  candleLighting: 'Candle lighting',
  shabbosEnds: 'Shabbos ends',
});

// Keys nextZman() walks through on a regular day, in chronological order.
const NEXT_KEYS = ['alos', 'sunrise', 'sofZmanShma', 'sofZmanTefila', 'chatzos',
  'minchaGedola', 'plagHamincha', 'sunset', 'tzeis'];

const DAY_MS = 86400000;
const MIN_MS = 60000;
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

// ---------------------------------------------------------------------------
// Time zone helpers (Intl only)
// ---------------------------------------------------------------------------

const fmtCache = new Map();
function formatter(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      weekday: 'short',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function zonedParts(ms, tz) {
  const out = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  return {
    y: +out.year, m: +out.month, d: +out.day,
    hh: +out.hour % 24, mm: +out.minute, ss: +out.second,
    weekday: WEEKDAYS[out.weekday],
  };
}

/** Local calendar date (and weekday, 0=Sun..6=Sat) of an instant in `tz`. */
export function localYMD(date, tz) {
  const p = zonedParts(+date, tz);
  return { y: p.y, m: p.m, d: p.d, weekday: p.weekday };
}

// Offset (local wall clock - UTC) in ms at instant `ms`.
function tzOffsetMs(ms, tz) {
  const p = zonedParts(ms, tz);
  const wall = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return wall - Math.floor(ms / 1000) * 1000;
}

// UTC instant of a local wall-clock time in `tz` (DST-aware).
function zonedToUtc(y, m, d, hh, mm, tz) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let utc = guess - tzOffsetMs(guess, tz);
  const off2 = tzOffsetMs(utc, tz);
  utc = guess - off2;
  return utc;
}

function ymdWeekday({ y, m, d }) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addDays({ y, m, d }, n) {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

// ---------------------------------------------------------------------------
// NOAA solar equations
// ---------------------------------------------------------------------------

function solar(ms) {
  const jd = ms / DAY_MS + 2440587.5;
  const T = (jd - 2451545.0) / 36525;
  const L0 = mod(280.46646 + T * (36000.76983 + T * 0.0003032), 360);
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * RAD;
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T))
    + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T)
    + Math.sin(3 * Mr) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const meanObliq = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const obliq = meanObliq + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(obliq * RAD) * Math.sin(appLong * RAD)) * DEG;
  const yv = Math.tan((obliq / 2) * RAD) ** 2;
  const L0r = L0 * RAD;
  const eqTime = 4 * DEG * (yv * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr)
    + 4 * e * yv * Math.sin(Mr) * Math.cos(2 * L0r)
    - 0.5 * yv * yv * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
  return { decl, eqTime }; // degrees, minutes
}

function mod(a, n) { return ((a % n) + n) % n; }
function wrap180(a) { const x = mod(a + 180, 360) - 180; return x === -180 ? 180 : x; }

// Local hour angle (degrees, -180..180, 0 = solar transit) at instant ms.
function hourAngle(ms, lon, eqTime) {
  const utDeg = mod(ms, DAY_MS) / DAY_MS * 360;
  return wrap180(utDeg + eqTime / 4 + lon - 180);
}

// Solar transit nearest to instant `anchorMs`.
function transitNear(anchorMs, lon) {
  let t = anchorMs;
  for (let i = 0; i < 4; i++) {
    const { eqTime } = solar(t);
    t -= hourAngle(t, lon, eqTime) / 360 * DAY_MS;
  }
  return t;
}

// Time when the sun's center is at altitude `alt` (degrees) on the rising
// (dir = -1) or setting (dir = +1) side of the given transit. null if never.
function altitudeTime(transitMs, lat, lon, alt, dir) {
  let t = transitMs;
  const sinAlt = Math.sin(alt * RAD), sinLat = Math.sin(lat * RAD), cosLat = Math.cos(lat * RAD);
  for (let i = 0; i < 6; i++) {
    const { decl, eqTime } = solar(t);
    const cosH = (sinAlt - sinLat * Math.sin(decl * RAD)) / (cosLat * Math.cos(decl * RAD));
    if (!(cosH >= -1 && cosH <= 1)) {
      // Not reached at this estimate. On the first pass that is decisive.
      if (i === 0) return null;
      // Near the threshold the iteration can wander; treat as non-occurring.
      return null;
    }
    const H = Math.acos(cosH) * DEG * dir; // target hour angle
    const ha = hourAngle(t, lon, eqTime);
    const dt = wrap180(H - ha) / 360 * DAY_MS;
    t += dt;
    if (Math.abs(dt) < 500) break;
  }
  return t;
}

function locElevation(loc) { return Math.max(0, +loc.elevation || 0); }

function riseSetAltitude(loc) {
  return -0.833 - (2.076 * Math.sqrt(locElevation(loc))) / 60;
}

function noonAnchor(ymd, loc) {
  return transitNear(zonedToUtc(ymd.y, ymd.m, ymd.d, 12, 0, loc.tz), loc.lon);
}

const toDate = (ms) => (ms == null || !Number.isFinite(ms) ? null : new Date(Math.round(ms)));

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Apparent sunrise, sunset and solar noon for local date `dateYMD` at `loc`. */
export function sunTimes(dateYMD, loc) {
  const noon = noonAnchor(dateYMD, loc);
  const alt = riseSetAltitude(loc);
  return {
    sunrise: toDate(altitudeTime(noon, loc.lat, loc.lon, alt, -1)),
    sunset: toDate(altitudeTime(noon, loc.lat, loc.lon, alt, +1)),
    solarNoon: toDate(noon),
  };
}

/** Sun altitude (apparent, refraction-corrected) and azimuth (deg from north, clockwise). */
export function sunPosition(date, loc) {
  const ms = +date;
  const { decl, eqTime } = solar(ms);
  const ha = hourAngle(ms, loc.lon, eqTime) * RAD;
  const lat = loc.lat * RAD, d = decl * RAD;
  const sinAlt = Math.sin(lat) * Math.sin(d) + Math.cos(lat) * Math.cos(d) * Math.cos(ha);
  const altGeo = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * DEG;
  // Azimuth measured from north, clockwise.
  const az = mod(Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(d) * Math.cos(lat)) * DEG + 180, 360);
  // NOAA atmospheric refraction approximation (arc-seconds).
  let r = 0;
  if (altGeo <= 85) {
    const te = Math.tan(altGeo * RAD);
    if (altGeo > 5) r = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
    else if (altGeo > -0.575) r = 1735 + altGeo * (-518.2 + altGeo * (103.4 + altGeo * (-12.79 + altGeo * 0.711)));
    else r = -20.772 / te;
  }
  return { altitude: altGeo + r / 3600, azimuth: az };
}

function resolveOpts(loc, opts) {
  const o = opts || {};
  return {
    candleMinutes: o.candleMinutes ?? loc.candleMinutes ?? DEFAULTS.candleMinutes,
    tzeisDegrees: o.tzeisDegrees ?? DEFAULTS.tzeisDegrees,
    shabbosEnds: o.shabbosEnds ?? DEFAULTS.shabbosEnds,
    alosDegrees: o.alosDegrees ?? DEFAULTS.alosDegrees,
    misheyakirDegrees: o.misheyakirDegrees ?? DEFAULTS.misheyakirDegrees,
    dayDegrees: o.dayDegrees ?? DEFAULTS.dayDegrees,
  };
}

/** All zmanim for local date `dateYMD` at `loc`. */
export function zmanim(dateYMD, loc, opts = {}) {
  const o = resolveOpts(loc, opts);
  const noon = noonAnchor(dateYMD, loc);
  const at = (deg, dir) => altitudeTime(noon, loc.lat, loc.lon, -deg, dir);

  const riseAlt = riseSetAltitude(loc);
  const rise = altitudeTime(noon, loc.lat, loc.lon, riseAlt, -1);
  const set = altitudeTime(noon, loc.lat, loc.lon, riseAlt, +1);
  const hasDay = rise != null && set != null;
  // Day used for shaos zmaniyos: visible sunrise→sunset ('sunrise'), or netz/shkiah
  // amiti at `dayDegrees` below the geometric horizon (Baal HaTanya, default 1.583°).
  const useVisible = o.dayDegrees === 'sunrise' || o.dayDegrees === 'gra';
  const dStart = useVisible ? rise : at(+o.dayDegrees, -1);
  const dEnd = useVisible ? set : at(+o.dayDegrees, +1);
  const hasHalachicDay = dStart != null && dEnd != null;
  const hour = hasHalachicDay ? (dEnd - dStart) / 12 : null;
  const gra = (h) => (hasHalachicDay ? dStart + h * hour : null);

  const tzeis = at(o.tzeisDegrees, +1);
  const weekday = ymdWeekday(dateYMD);

  let candleLighting = null;
  if (weekday === 5 && set != null) candleLighting = set - o.candleMinutes * MIN_MS;

  let shabbosEnds = null;
  if (weekday === 6) {
    const se = o.shabbosEnds;
    if (se && se.type === 'minutes') shabbosEnds = set != null ? set + se.value * MIN_MS : null;
    else shabbosEnds = at(se && se.value != null ? se.value : DEFAULTS.shabbosEnds.value, +1);
  }

  return {
    alos: toDate(at(o.alosDegrees, -1)),
    misheyakir: toDate(at(o.misheyakirDegrees, -1)),
    sunrise: toDate(rise),
    sofZmanShma: toDate(gra(3)),
    sofZmanTefila: toDate(gra(4)),
    // Midpoint of sunrise/sunset; falls back to solar transit when either is missing.
    chatzos: toDate(hasDay ? (rise + set) / 2 : noon),
    minchaGedola: toDate(gra(6.5)),
    minchaKetana: toDate(gra(9.5)),
    plagHamincha: toDate(gra(10.75)),
    sunset: toDate(set),
    tzeis: toDate(tzeis),
    candleLighting: toDate(candleLighting),
    shabbosEnds: toDate(shabbosEnds),
  };
}

/**
 * Next upcoming zman strictly after `now` (searching today then tomorrow in loc.tz).
 * Returns { key, label, at } or null if nothing occurs in that window (polar regions).
 */
export function nextZman(now, loc, opts = {}) {
  const nowMs = +now;
  const today = localYMD(nowMs, loc.tz);
  const todayYMD = { y: today.y, m: today.m, d: today.d };
  const tomorrowYMD = addDays(todayYMD, 1);
  const zt = zmanim(todayYMD, loc, opts);
  const make = (key, at) => ({ key, label: ZMANIM_LABELS[key], at });

  // Shabbos priority.
  if (today.weekday === 5 && zt.candleLighting) {
    if (nowMs < +zt.candleLighting) return make('candleLighting', zt.candleLighting);
    const zs = zmanim(tomorrowYMD, loc, opts);
    if (zs.shabbosEnds) return make('shabbosEnds', zs.shabbosEnds);
  }
  let skipToday = false;
  if (today.weekday === 6 && zt.shabbosEnds) {
    if (nowMs < +zt.shabbosEnds) return make('shabbosEnds', zt.shabbosEnds);
    skipToday = true; // Shabbos is out: continue with Sunday's zmanim.
  }

  const days = skipToday ? [zmanim(tomorrowYMD, loc, opts)] : [zt, zmanim(tomorrowYMD, loc, opts)];
  for (const z of days) {
    let best = null;
    for (const key of NEXT_KEYS) {
      const t = z[key];
      if (t && +t > nowMs && (!best || +t < +best.at)) best = make(key, t);
    }
    if (best) return best;
  }
  return null;
}
