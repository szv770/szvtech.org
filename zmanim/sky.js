// zmanim/sky.js — the real sky for the Sun look: colours by the sun's true
// altitude, and the moon's position and phase. Pure functions, no DOM.
//
//   skyAt(altitude)                 -> { top, mid, hz, glow, gnd, stars, light }  (CSS colour strings)
//   moonPosition(ms, lat, lon)      -> { altitude, azimuth }   degrees; azimuth from SOUTH, + toward west
//   moonIllumination(ms)            -> { fraction, phase, waxing, name }   phase 0 new · .25 first q · .5 full · .75 last q
//   moonPath(r, fraction, waxing)   -> SVG path "d" for the lit part of a disc of radius r (lit side right when waxing)
//
// The moon follows the low-precision formulas popularised by suncalc (after
// Meeus' "Astronomical Algorithms"): good to about a degree, plenty for a picture.

export { sunPosition } from '/time/zmanim.js?v=93be04f7f2';

const RAD = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const mix = (a, b, f) => a.map((v, i) => v + (b[i] - v) * f);

/* ---------------- sky colours by solar altitude ----------------
   [altitude, top, mid, horizon, sun-glow (rgba)] — a real sky, not a theme:
   deep night → astronomical / nautical twilight blues → pink & gold at netz /
   shkiah → clear blue day. Morning and evening share the same stops. */
const STOPS = [
  [-90, [3, 4, 12], [5, 7, 20], [9, 12, 30], [0, 0, 0, 0]],
  [-18, [4, 6, 16], [7, 10, 28], [14, 20, 48], [40, 50, 110, 0]],
  [-12, [6, 10, 30], [12, 20, 54], [32, 44, 96], [80, 90, 170, .2]],
  [-6, [12, 20, 56], [40, 48, 112], [176, 104, 150], [255, 130, 130, .32]],
  [-2, [24, 40, 96], [98, 88, 156], [250, 136, 112], [255, 150, 100, .5]],
  [1.5, [38, 74, 148], [168, 132, 156], [255, 166, 102], [255, 186, 110, .62]],
  [7, [38, 104, 190], [118, 162, 214], [255, 206, 150], [255, 222, 160, .5]],
  [18, [28, 108, 212], [86, 160, 232], [178, 214, 242], [255, 244, 210, .34]],
  [45, [20, 96, 206], [64, 146, 232], [156, 204, 246], [255, 250, 232, .28]],
  [90, [20, 96, 206], [64, 146, 232], [156, 204, 246], [255, 250, 232, .28]],
];
const GND = { night: [4, 5, 11], day: [14, 20, 32] };
const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const rgba = (c) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${(+c[3]).toFixed(3)})`;

export function skyAt(alt) {
  if (!Number.isFinite(alt)) alt = -30;
  let i = 0;
  while (i < STOPS.length - 2 && alt > STOPS[i + 1][0]) i++;
  const A = STOPS[i], B = STOPS[i + 1];
  const f = clamp((alt - A[0]) / (B[0] - A[0]), 0, 1);
  const dayness = clamp((alt + 8) / 14, 0, 1);
  return {
    top: rgb(mix(A[1], B[1], f)),
    mid: rgb(mix(A[2], B[2], f)),
    hz: rgb(mix(A[3], B[3], f)),
    glow: rgba(mix(A[4], B[4], f)),
    gnd: rgb(mix(GND.night, GND.day, dayness)),
    stars: clamp((-alt - 5) / 9, 0, 1),           // stars fade in through nautical twilight
    light: alt > -1.5,                             // bright (or glowing) enough for dark labels on chips
  };
}

/* ---------------- moon ---------------- */
const E = RAD * 23.4397; // obliquity of the ecliptic
const toDays = (ms) => ms / 86400000 - 0.5 + 2440588 - 2451545;
const raOf = (l, b) => Math.atan2(Math.sin(l) * Math.cos(E) - Math.tan(b) * Math.sin(E), Math.cos(l));
const decOf = (l, b) => Math.asin(Math.sin(b) * Math.cos(E) + Math.cos(b) * Math.sin(E) * Math.sin(l));

function moonCoords(d) {
  const L = RAD * (218.316 + 13.176396 * d);
  const M = RAD * (134.963 + 13.064993 * d);
  const F = RAD * (93.272 + 13.22935 * d);
  const l = L + RAD * 6.289 * Math.sin(M);
  const b = RAD * 5.128 * Math.sin(F);
  return { ra: raOf(l, b), dec: decOf(l, b), dist: 385001 - 20905 * Math.cos(M) };
}
function sunCoords(d) {
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const l = M + C + RAD * 102.9372 + Math.PI;
  return { ra: raOf(l, 0), dec: decOf(l, 0) };
}

export function moonPosition(ms, lat, lon) {
  const d = toDays(ms);
  const c = moonCoords(d);
  const phi = RAD * lat;
  const H = RAD * (280.16 + 360.9856235 * d) + RAD * lon - c.ra;
  const h = Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(c.dec) * Math.cos(phi));
  // horizontal parallax (~0.95°) lowers the moon; refraction lifts it near the horizon
  let alt = h / RAD - 0.9507 * Math.cos(h);
  if (alt > -1) alt += 0.017 / Math.tan(RAD * (alt + 10.26 / (alt + 5.10)));
  return { altitude: alt, azimuth: az / RAD };
}

const NAMES = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
export function moonIllumination(ms) {
  const d = toDays(ms);
  const s = sunCoords(d), m = moonCoords(d);
  const sdist = 149598000;
  const phi = Math.acos(clamp(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra), -1, 1));
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  const fraction = (1 + Math.cos(inc)) / 2;
  const phase = 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / Math.PI;
  const w = phase < 0.5;
  const name = fraction < 0.03 ? NAMES[0] : fraction > 0.97 ? NAMES[4]
    : Math.abs(fraction - 0.5) < 0.06 ? NAMES[w ? 2 : 6] : fraction < 0.5 ? NAMES[w ? 1 : 7] : NAMES[w ? 3 : 5];
  return { fraction, phase, waxing: phase < 0.5, name };
}

// Lit part of the disc: a half circle on the lit side closed by the terminator
// (an ellipse whose half-width is r·|1 − 2·fraction|).
export function moonPath(r, fraction, waxing) {
  const k = clamp(fraction, 0, 1);
  if (k < 0.005) return '';
  const rx = Math.abs(1 - 2 * k) * r;
  const side = waxing ? 1 : 0;              // 1: lit limb on the right
  const term = k > 0.5 ? side : 1 - side;   // gibbous: terminator bulges to the dark side
  const f = (n) => n.toFixed(2);
  return `M0,${f(-r)} A${f(r)},${f(r)} 0 0 ${side} 0,${f(r)} A${f(rx)},${f(r)} 0 0 ${term} 0,${f(-r)}Z`;
}
