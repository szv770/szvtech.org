// tehillim/today.js — "which Hebrew day is it right now?" for /tehillim and /seder.
//
// Uses the repo's existing pieces, read-only: Hebrew calendar maths from
// /luach/logic.js, and the saved location + sunset from /zmanim/data.js (the
// same `szv-time-loc` /time uses). After sunset the Hebrew day has already
// rolled over, so the effective date is tomorrow's.
import * as L from '/luach/logic.js';
import { savedLoc, defaultLoc, partsIn, todayIn, getDays, hmText, deviceTz } from '/zmanim/data.js';

export { L };

function locOrDefault() {
  try { return savedLoc() || defaultLoc(); } catch (e) { return null; }
}

/** Synchronous best guess (device/location date, daytime rule). */
export function guessDay(nowMs, loc = locOrDefault()) {
  const tz = (loc && loc.tz) || deviceTz;
  const p = partsIn(nowMs, tz);
  return build(L.gregToAbs(p.y, p.m, p.d), tz, false, null, loc);
}

function build(civilAbs, tz, after, sunsetMs, loc) {
  const abs = civilAbs + (after ? 1 : 0);
  const h = L.absToHebrew(abs);
  const monthLength = L.daysInMonth(h.m, h.y);
  return {
    civilYmd: L.absToYMD(civilAbs),   // the calendar date on the wall
    ymd: L.absToYMD(abs),             // the civil date of the Hebrew day (tomorrow after sunset)
    abs, h, monthLength, wd: L.weekday(abs),
    afterSunset: after, sunsetMs, tz, loc,
    placeName: (loc && (loc.name || loc.label)) || '',
    sunsetText: sunsetMs ? hmText(sunsetMs, tz) : '',
    heText: `${L.gematriya(h.d)} ${L.monthNameHe(h.m, h.y)}`,
    enText: L.hebrewDateEn(h, false),
  };
}

/** Exact answer: looks up today's sunset for the saved location (offline-safe). */
export async function effectiveDay(nowMs = Date.now()) {
  const loc = locOrDefault();
  const first = guessDay(nowMs, loc);
  try {
    const tz = (loc && loc.tz) || deviceTz;
    const ymd = todayIn(nowMs, tz);
    const { days } = await getDays(loc, ymd, 1, nowMs);
    const it = days && days[0] && days[0].items.find((i) => i.key === 'sunset');
    if (!it) return first;
    const p = partsIn(nowMs, tz);
    return build(L.gregToAbs(p.y, p.m, p.d), tz, nowMs >= +it.at, +it.at, loc);
  } catch (e) { return first; }
}
