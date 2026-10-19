// remind/zsource.js — feeds the reminder engine real zmanim for the saved location.
//
// Uses /zmanim/data.js read-only: Chabad.org via /api/zmanim first (cached per day in
// localStorage by that module), the local calculation as the offline fallback.
// Call loadZmanSource() once; remind.js then answers "18 min before candle lighting" sync.
import { savedLoc, defaultLoc, getDays, todayIn, addDaysStr, deviceTz } from '/zmanim/data.js?v=41d2c1bfa5';
import { setZmanSource } from './remind.js?v=a8a7c39c62';

const DAYS_AHEAD = 12;
let map = new Map(), tz = deviceTz, loaded = '', place = '', busy = null;

export const zmanPlace = () => place;

/** Resolve once the next ~12 days of zmanim for the saved location are ready (or known to be unavailable). */
export function loadZmanSource(nowMs = Date.now(), force = false) {
  let loc = null;
  try { loc = savedLoc() || defaultLoc(); } catch (e) { loc = null; }
  if (!loc) return Promise.resolve(false);
  tz = loc.tz || deviceTz;
  const today = todayIn(nowMs, tz);
  const sig = `${today}|${loc.id || loc.zip || loc.chabadCityId || loc.name}|${loc.lat}|${loc.lon}`;
  if (!force && loaded === sig) return Promise.resolve(map.size > 0);
  if (busy) return busy;
  busy = (async () => {
    try {
      const { days } = await getDays(loc, addDaysStr(today, -1), DAYS_AHEAD, nowMs);
      const m = new Map();
      for (const d of days) if (d && d.items) m.set(d.date, d.items.map((i) => ({ key: i.key, at: +i.at })));
      map = m; loaded = sig;
      place = loc.name || loc.label || '';
      setZmanSource({ ymdOf: (ms) => todayIn(ms, tz), day: (ymd) => map.get(ymd) || null });
      return m.size > 0;
    } catch (e) { return false; } finally { busy = null; }
  })();
  return busy;
}
