// Tests for the astro math behind /sky. Run with:  node sky/sky.test.mjs
//
// The page loads two pinned CDN libraries (satellite.js 6.0.2, astronomy-engine
// 2.1.19). The test needs the same files: it reads them from $SKY_LIBS (a
// folder holding satellite.min.js + astronomy.browser.min.js) or downloads the
// pinned versions once into the OS temp folder (needs internet / the agent proxy:
// NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const LIBS = [
  ['satellite.min.js', 'https://cdn.jsdelivr.net/npm/satellite.js@6.0.2/dist/satellite.min.js', 'satellite'],
  ['astronomy.browser.min.js', 'https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/astronomy.browser.min.js', 'Astronomy'],
];
async function loadLib([file, url, global]) {
  const dirs = [process.env.SKY_LIBS, path.join(os.tmpdir(), 'szvtech-sky-libs')].filter(Boolean);
  let found = null;
  for (const d of dirs) { const f = path.join(d, file); if (fs.existsSync(f)) { found = f; break; } }
  if (!found) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download ${url}: ${res.status}`);
    const d = path.join(os.tmpdir(), 'szvtech-sky-libs');
    fs.mkdirSync(d, { recursive: true });
    found = path.join(d, file);
    fs.writeFileSync(found, await res.text());
  }
  // Plain require (not vm): satellite.js misbehaves when run in a separate vm realm.
  const mod = createRequire(import.meta.url)(found);
  return mod && Object.keys(mod).length ? mod : globalThis[global];
}

const [satellite, Astronomy] = await Promise.all(LIBS.map(loadLib));
const X = await import('./astro.js');
X.init({ satellite, Astronomy });

let failures = 0, passes = 0;
function check(name, cond, detail) {
  if (cond) { passes++; console.log(`  ok   ${name}`); }
  else { failures++; console.log(`  FAIL ${name}${detail !== undefined ? ' :: ' + detail : ''}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const T = (s) => Date.parse(s);
const NYC = { lat: 40.7128, lon: -74.006, h: 10 };

/* ---- TLE ---- */
const tle = X.parseTLE(`ISS (ZARYA)\n${X.FALLBACK_TLE.l1}\n${X.FALLBACK_TLE.l2}\n`);
check('FALLBACK_TLE parses (checksums, catalog number)', !!tle && tle.name === 'ISS (ZARYA)');
check('TLE epoch 2026-10-09', tle && near(tle.epoch, T('2026-10-09T22:48:39Z'), 120000), tle && new Date(tle.epoch).toISOString());
check('bad checksum rejected', X.parseTLE(`${X.FALLBACK_TLE.l1.slice(0, 68)}1\n${X.FALLBACK_TLE.l2}`) === null);
check('wrong satellite rejected', X.parseTLE(`${X.FALLBACK_TLE.l1.replace('25544', '99999')}\n${X.FALLBACK_TLE.l2}`) === null);

/* ---- ISS state ---- */
const rec = X.satrec(tle);
const st = X.satState(rec, tle.epoch);
check('ISS altitude 390-440 km', st && st.alt > 390 && st.alt < 440, st && st.alt);
check('ISS |lat| <= 51.7', st && Math.abs(st.lat) <= 51.7, st && st.lat);
check('ISS speed ~7.66 km/s', st && near(st.speed, 7.66, 0.08), st && st.speed);
const track = X.groundTrack(rec, tle.epoch, 0, 93, 60);
check('ground track sample count', track.length === 94, track.length);
let maxLat = 0; for (const p of track) maxLat = Math.max(maxLat, Math.abs(p.lat));
check('one orbit reaches ~51.6 deg latitude', maxLat > 51 && maxLat <= 51.9, maxLat);
const p0 = X.satState(rec, tle.epoch), p1 = X.satState(rec, tle.epoch + 92.9 * 60000);
check('orbital period ~92.9 min (back near same latitude)', near(p0.lat, p1.lat, 3), `${p0.lat} vs ${p1.lat}`);

/* ---- geometry ---- */
check('distance NYC-London ~5570 km', near(X.distanceKm(40.7128, -74.006, 51.5074, -0.1278), 5570, 25));
check('distance to self is 0', X.distanceKm(10, 20, 10, 20) === 0);
check('footprint of 420 km at 10 deg elevation ~12.5 deg', near(X.footprintDeg(420, 10), 12.5, 0.6), X.footprintDeg(420, 10));
check('footprint grows as elevation limit drops', X.footprintDeg(420, 0) > X.footprintDeg(420, 10));
check('wrapLon', X.wrapLon(190) === -170 && X.wrapLon(-190) === 170 && X.wrapLon(0) === 0 && X.wrapLon(180) === -180);
check('compass16', X.compass16(0) === 'N' && X.compass16(359) === 'N' && X.compass16(90) === 'E' && X.compass16(225) === 'SW' && X.compass16(-90) === 'W');
check('compassWord', X.compassWord(45) === 'northeast' && X.compassWord(181) === 'south');
check('shadow: behind earth is dark, sunward is lit',
  X.inShadow({ x: -7000, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }) && !X.inShadow({ x: 7000, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }) && !X.inShadow({ x: -7000, y: 8000, z: 0 }, { x: 1, y: 0, z: 0 }));

/* ---- Sun ---- */
const eq = X.subsolar(T('2026-03-20T14:46:00Z'));
check('equinox: subsolar latitude ~0', near(eq.lat, 0, 0.25), eq.lat);
const sol = X.subsolar(T('2026-06-21T08:24:00Z'));
check('June solstice: subsolar latitude ~23.4', near(sol.lat, 23.44, 0.2), sol.lat);
const noonUtc = X.subsolar(T('2026-10-12T12:00:00Z'));
check('sun overhead near lon 0 at 12:00 UTC (+-4 deg, equation of time)', Math.abs(noonUtc.lon) < 4.5, noonUtc.lon);
check('sun altitude NYC: up at local noon, down at local midnight', X.sunAltitude(NYC, T('2026-10-12T16:00:00Z')) > 30 && X.sunAltitude(NYC, T('2026-10-12T04:00:00Z')) < -20);

/* ---- passes ---- */
const t0 = tle.epoch + 3600000;
const passes7 = X.findPasses(rec, NYC, t0, 3);
check('3 days of NYC passes: 8-30 of them', passes7.length >= 8 && passes7.length <= 30, passes7.length);
check('passes are ordered, 1-15 minutes long, rise<max<set', passes7.every((p, i) => p.rise.t < p.max.t && p.max.t < p.set.t && p.set.t - p.rise.t < 16 * 60000 && p.set.t - p.rise.t > 30000 && (!i || p.rise.t > passes7[i - 1].set.t)));
check('rise / set are at the horizon', passes7.every((p) => Math.abs(p.rise.el) < 1 && Math.abs(p.set.el) < 1), passes7.map((p) => [p.rise.el.toFixed(2), p.set.el.toFixed(2)]).join(' '));
check('max elevation positive and <= 90', passes7.every((p) => p.max.el > 0 && p.max.el <= 90));
const vis = passes7.filter((p) => p.visible);
check('visible passes satisfy: bright dark sky, >= 10 deg', vis.every((p) => p.vis.max.el >= 10 && X.sunAltitude(NYC, p.vis.max.t) < -6 && p.mag != null));
check('visible passes are a subset', vis.length <= passes7.length);
const limited = X.findPasses(rec, NYC, t0, 3, { limit: 2 });
check('limit option', limited.length === 2);
check('look angles match the pass peak', (() => { const p = passes7[0]; const l = X.lookAngles(rec, NYC, p.max.t); return near(l.el, p.max.el, 0.5); })());
check('brightnessLabel', X.brightnessLabel(-3.5) === 'brilliant' && X.brightnessLabel(0) === 'modest' && X.brightnessLabel(null) === '');

/* ---- places ---- */
const topo = { type: 'Topology', transform: { scale: [1, 1], translate: [0, 0] }, arcs: [[[10, 10], [10, 0], [0, 10], [-10, 0], [0, -10]], [[12, 12], [2, 0], [0, 2], [-2, 0], [0, -2]]],
  objects: { countries: { type: 'GeometryCollection', geometries: [{ type: 'Polygon', arcs: [[0], [1]], properties: { name: 'Squareland' } }, { type: 'Polygon', arcs: [[1]], properties: { name: 'United States of America' } }] } } };
const cs = X.decodeTopo(topo);
check('decodeTopo: two shapes, rename applied', cs.length === 2 && cs[1].name === 'United States');
check('countryAt: inside, in hole is the inner shape, outside is null', X.countryAt(cs, 11, 11) === 'Squareland' && X.countryAt(cs, 13, 13) === 'United States' && X.countryAt(cs, 50, 50) === null);
check('placeAt falls back to water', X.placeAt(cs, 50, 50).kind === 'water' && X.placeAt(cs, 11, 11).kind === 'land');
check('waterAt', X.waterAt(30, -40) === 'North Atlantic Ocean' && X.waterAt(-30, -140) === 'South Pacific Ocean' && X.waterAt(-10, 80) === 'Indian Ocean' && X.waterAt(35, 18) === 'Mediterranean Sea' && X.waterAt(80, 0) === 'Arctic Ocean' && X.waterAt(-70, 0) === 'Southern Ocean', [X.waterAt(30, -40), X.waterAt(-30, -140), X.waterAt(-10, 80), X.waterAt(35, 18)].join('|'));

/* ---- Moon ---- */
const full = X.moonInfo(T('2024-01-25T17:54:00Z'), NYC);
check('Full Moon 2024-01-25: name, ~100% lit', full.name === 'Full Moon' && full.illum > 0.99, `${full.name} ${full.illum}`);
const nw = X.moonInfo(T('2024-04-08T18:21:00Z'), NYC);
check('New Moon 2024-04-08: name, ~0% lit', nw.name === 'New Moon' && nw.illum < 0.01, `${nw.name} ${nw.illum}`);
const q = X.moonInfo(T('2024-01-18T03:53:00Z'), NYC);
check('First quarter 2024-01-18 ~50% lit, waxing', q.name === 'First Quarter' && near(q.illum, 0.5, 0.03) && q.waxing, `${q.name} ${q.illum}`);
const mi = X.moonInfo(T('2026-10-12T12:00:00Z'), NYC);
check('moonInfo: next events in order and within a month', mi.nextNew && mi.nextFull && +mi.nextNew > T('2026-10-12T12:00:00Z') && mi.nextFull - T('2026-10-12T12:00:00Z') < 30 * 86400000);
check('moon age between 0 and 29.6 days; matches elongation', mi.age >= 0 && mi.age <= 29.7 && near(mi.age, (mi.elong / 360) * 29.53, 1.6), `${mi.age} vs ${(mi.elong / 360) * 29.53}`);
check('moon distance 350-410 thousand km', mi.distKm > 350000 && mi.distKm < 410000, mi.distKm);
check('moonPhaseName covers circle', X.moonPhaseName(0) === 'New Moon' && X.moonPhaseName(45) === 'Waxing Crescent' && X.moonPhaseName(90) === 'First Quarter' && X.moonPhaseName(135) === 'Waxing Gibbous' && X.moonPhaseName(180) === 'Full Moon' && X.moonPhaseName(225) === 'Waning Gibbous' && X.moonPhaseName(270) === 'Last Quarter' && X.moonPhaseName(315) === 'Waning Crescent');
const rs = X.riseSetBetween(Astronomy.Body.Moon, NYC, T('2026-10-12T04:00:00Z'), T('2026-10-13T04:00:00Z'));
check('moon rise/set windows within the day', (!rs.rise || (+rs.rise >= T('2026-10-12T04:00:00Z') && +rs.rise < T('2026-10-13T04:00:00Z'))) && (rs.rise || rs.set));

/* ---- Tonight ---- */
const now = T('2026-10-12T20:00:00Z'); // 4 pm in New York
const night = X.nightOf(now, NYC);
check('sunset ~6:20 pm EDT on 2026-10-12', night.sunset && near(+night.sunset, T('2026-10-12T22:20:00Z'), 12 * 60000), night.sunset && night.sunset.toISOString());
check('twilight order: sunset < civil < nautical < astro dusk < astro dawn < sunrise',
  +night.sunset < +night.civilDusk && +night.civilDusk < +night.nauticalDusk && +night.nauticalDusk < +night.astroDusk && +night.astroDusk < +night.astroDawn && +night.astroDawn < +night.nauticalDawn && +night.nauticalDawn < +night.civilDawn && +night.civilDawn < +night.sunrise);
check('daytime phase', night.phase === 'day', night.phase);
check('night phase after midnight', X.nightOf(T('2026-10-13T06:00:00Z'), NYC).phase === 'night');
check('after midnight still reports the same night', (() => { const n2 = X.nightOf(T('2026-10-13T06:00:00Z'), NYC); return near(+n2.sunset, +night.sunset, 3 * 60000); })());
const pl = X.planetsTonight(now, NYC, night);
check('five planets', pl.length === 5 && pl.map((p) => p.name).join() === 'Mercury,Venus,Mars,Jupiter,Saturn');
check('planet numbers sane', pl.every((p) => p.alt >= -90 && p.alt <= 90 && p.az >= 0 && p.az < 360 && p.elong >= 0 && p.elong <= 180 && isFinite(p.mag)));
const jup = pl.find((p) => p.name === 'Jupiter');
check('Jupiter is a bright night-sky object (mag < -1.5)', jup.mag < -1.5, jup.mag);
check('bodyHorizon sun altitude agrees with sunAltitude', near(X.bodyHorizon(Astronomy.Body.Sun, now, NYC).alt, X.sunAltitude(NYC, now), 1.2));
const sirius = X.starHorizon(X.STARS[0], T('2026-01-15T03:00:00Z'), NYC);
check('Sirius is up in a January evening from NYC', sirius.alt > 20 && sirius.alt < 50, sirius.alt);

/* ---- Hebrew month ---- */
const rc = X.nextRoshChodesh(new Date(T('2026-10-12T16:00:00Z')), 'America/New_York');
check('next Rosh Chodesh found (Cheshvan 5787: 2026-10-12 is 1 Cheshvan?)', !!rc && rc.days >= 0 && rc.days <= 31 && /^(Cheshvan|Kislev)$/.test(rc.month) && (rc.total === 1 || rc.total === 2), JSON.stringify(rc));
const hp = X.hebrewParts(new Date(T('2026-10-12T16:00:00Z')), 'America/New_York');
check('hebrewParts has a day and month', hp && hp.day >= 1 && hp.day <= 30 && !!hp.month, JSON.stringify(hp));

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
