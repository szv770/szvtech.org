// seder/logic.js — pure, dependency-free logic for /seder (no DOM).
// Tested by `node seder/_seder.test.mjs`.
//
// Time model: a session is { id, s: start (ms since epoch), d: learned time (ms), sid, note }.
// Days are the device's local calendar days ('YYYY-MM-DD'); sessions that cross midnight
// (or a DST change) are split by walking real local midnights, so a 23 h or 25 h day is exact.
//
// Shared contract with /tehillim (localStorage `szv-seder-pings`): a JSON array of
// { id, kind: 'tehillim', ymd, at, what }. /seder reads it to offer logging and deletes
// the entries it handled. /seder itself sets `szv-seder-out` = { at } when you tap its
// "Today's Tehillim" shortcut, so it can offer to log the time when you come back.

export const COLORS = 9;   // dot colours c0..c8 are derived from the theme in seder.css

export const DEFAULT_SEDARIM = [
  { id: 'chassidus', name: 'Chassidus', c: 0, goal: 0, min: 15 },
  { id: 'gemara', name: 'Nigleh / Gemara', c: 1, goal: 0, min: 15 },
  { id: 'halacha', name: 'Halacha', c: 2, goal: 0, min: 10 },
  { id: 'chumash', name: 'Chumash & Rashi', c: 3, goal: 0, min: 10 },
  { id: 'tehillim', name: 'Tehillim', c: 4, goal: 0, min: 10 },
  { id: 'tanya', name: 'Tanya', c: 5, goal: 0, min: 10 },
  { id: 'mishnayos', name: 'Mishnayos', c: 6, goal: 0, min: 10 },
  { id: 'chitas', name: 'Chitas / Hayom Yom', c: 7, goal: 0, min: 15 },
  { id: 'free', name: 'Free learning', c: 8, goal: 0, min: 15 },
];
export const DEFAULT_SETTINGS = { dayGoal: 60, dayMin: 15, wake: true, lastSid: 'gemara' };

export const MIN = 60000, HOUR = 3600000;

// ---- local calendar days ---------------------------------------------------

export const pad2 = (n) => String(n).padStart(2, '0');
export const ymdOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
export function parseYMD(s) {
  const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!r) return null;
  const y = +r[1], m = +r[2], d = +r[3];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? { y, m, d } : null;
}
const dayNo = (ymd) => { const p = parseYMD(ymd); return p ? Math.round(Date.UTC(p.y, p.m - 1, p.d) / 86400000) : null; };
const noToYmd = (n) => { const d = new Date(n * 86400000); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; };
export const shiftYMD = (ymd, n) => { const a = dayNo(ymd); return a == null ? ymd : noToYmd(a + n); };
export const weekdayOf = (ymd) => ((dayNo(ymd) + 4) % 7 + 7) % 7;         // 0 = Sunday
export const weekStart = (ymd) => shiftYMD(ymd, -weekdayOf(ymd));
/** Local midnight (ms) at the start of `ymd`. */
export const startOfDay = (ymd) => { const p = parseYMD(ymd); return new Date(p.y, p.m - 1, p.d).getTime(); };
export const startOfNextDay = (ymd) => { const p = parseYMD(ymd); return new Date(p.y, p.m - 1, p.d + 1).getTime(); };
/** Local 'HH:MM' and date -> ms (null when invalid). */
export function localMs(ymd, hhmm) {
  const p = parseYMD(ymd), t = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!p || !t || +t[1] > 23 || +t[2] > 59) return null;
  return new Date(p.y, p.m - 1, p.d, +t[1], +t[2]).getTime();
}
export const hhmmOf = (ms) => { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

/** Split [s, s+d) over local calendar days: [{ ymd, ms }]. */
export function splitByDay(s, d) {
  const out = [];
  const end = s + d;
  let t = s, guard = 0;
  while (t < end && guard++ < 400) {
    const ymd = ymdOf(t);
    const cut = Math.min(end, startOfNextDay(ymd));
    if (cut <= t) break;
    out.push({ ymd, ms: cut - t });
    t = cut;
  }
  return out;
}

// ---- formatting ------------------------------------------------------------

export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${pad2(m)}:${pad2(x)}` : `${pad2(m)}:${pad2(x)}`;
}
/** '45s', '42 min', '1h 05m', '2h'. */
export function fmtDur(ms) {
  ms = Math.max(0, ms);
  if (ms < MIN) return `${Math.round(ms / 1000)}s`;
  const m = Math.round(ms / MIN);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${pad2(r)}m` : `${h}h`;
}

// ---- stopwatch (wall-clock based: survives sleep, backgrounding, reload) ---

/** active: { sid, t0, run (ms when the current run began, or null while paused), acc, goal (ms, 0 = none) } */
export const startActive = (sid, now, goalMs = 0) => ({ sid, t0: now, run: now, acc: 0, goal: Math.max(0, goalMs | 0) });
export const elapsedOf = (a, now) => Math.max(0, a.acc + (a.run != null ? now - a.run : 0));
export const pauseActive = (a, now) => (a.run == null ? a : { ...a, acc: elapsedOf(a, now), run: null });
export const resumeActive = (a, now) => (a.run != null ? a : { ...a, run: now });
/** Active -> saved session (without note). */
export function finishActive(a, now, id) { return { id, s: a.t0, d: Math.round(elapsedOf(a, now)), sid: a.sid, note: '' }; }
/** Ring fraction: toward the goal, or around once an hour with no goal. */
export const ringFrac = (ms, goal) => (goal > 0 ? Math.min(1, ms / goal) : (ms % HOUR) / HOUR);

// ---- totals ----------------------------------------------------------------

/** { 'YYYY-MM-DD': { total, by: { sid: ms } } }; optional sid filter. */
export function dayTotals(sessions, sid = null) {
  const out = {};
  for (const x of sessions) {
    if (sid && x.sid !== sid) continue;
    for (const p of splitByDay(x.s, x.d)) {
      const e = (out[p.ymd] = out[p.ymd] || { total: 0, by: {} });
      e.total += p.ms; e.by[x.sid] = (e.by[x.sid] || 0) + p.ms;
    }
  }
  return out;
}
export const totalOn = (dt, ymd) => (dt[ymd] ? dt[ymd].total : 0);

/** Streak of days whose total is at least `minMs` (needs minMs > 0). */
export function streakOf(dt, today, minMs) {
  const t = dayNo(today);
  if (t == null || !(minMs > 0)) return { streak: 0, todayMet: false, best: 0 };
  const met = (n) => totalOn(dt, noToYmd(n)) >= minMs;
  const todayMet = met(t);
  let streak = 0;
  for (let a = todayMet ? t : t - 1; met(a) && streak < 5000; a--) streak++;
  const days = Object.keys(dt).filter((k) => dt[k].total >= minMs).map(dayNo).sort((a, b) => a - b);
  let best = 0, run = 0, prev = null;
  for (const a of days) { run = prev !== null && a === prev + 1 ? run + 1 : 1; prev = a; if (run > best) best = run; }
  return { streak, todayMet, best: Math.max(best, streak) };
}

/** Last `n` days ending `today`: [{ ymd, wd, total, by }] oldest first. */
export function lastDays(dt, today, n = 7) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const ymd = shiftYMD(today, -i), e = dt[ymd];
    out.push({ ymd, wd: weekdayOf(ymd), total: e ? e.total : 0, by: e ? e.by : {} });
  }
  return out;
}

/** Month grid, Sunday first: array of weeks, each 7 cells of ymd or null. */
export function monthGrid(y, m) {
  const first = `${y}-${pad2(m)}-01`;
  const lead = weekdayOf(first);
  const len = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array(lead).fill(null);
  for (let d = 1; d <= len; d++) cells.push(`${y}-${pad2(m)}-${pad2(d)}`);
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
/** 0 none, 1 under a quarter of the goal, 2 under half, 3 under the goal, 4 goal met. */
export function heatLevel(ms, goalMs) {
  if (!(ms > 0)) return 0;
  const r = ms / Math.max(goalMs, MIN);
  return r >= 1 ? 4 : r >= .5 ? 3 : r >= .25 ? 2 : 1;
}

/** Totals per seder between two ymd (inclusive); null from/to = open. */
export function totalsBySeder(dt, from = null, to = null) {
  const out = {};
  for (const [ymd, e] of Object.entries(dt)) {
    if ((from && ymd < from) || (to && ymd > to)) continue;
    for (const [sid, ms] of Object.entries(e.by)) out[sid] = (out[sid] || 0) + ms;
  }
  return out;
}

export function bests(sessions, dt, dayMinMs) {
  let longest = null;
  for (const x of sessions) if (!longest || x.d > longest.d) longest = x;
  let bestDay = null, total = 0;
  for (const [ymd, e] of Object.entries(dt)) { total += e.total; if (!bestDay || e.total > bestDay.ms) bestDay = { ymd, ms: e.total }; }
  const weeks = {};
  for (const [ymd, e] of Object.entries(dt)) { const w = weekStart(ymd); weeks[w] = (weeks[w] || 0) + e.total; }
  let bestWeek = null;
  for (const [w, ms] of Object.entries(weeks)) if (!bestWeek || ms > bestWeek.ms) bestWeek = { start: w, ms };
  const best = streakOf(dt, ymdOf(Date.now()), dayMinMs).best;
  return { longest, bestDay, bestWeek, total, sessions: sessions.length, days: Object.keys(dt).length, longestStreak: best };
}

// ---- state validation / import / export -----------------------------------

const clampInt = (v, lo, hi, fb) => { v = Math.round(+v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fb; };
const cleanStr = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

export function cleanSeder(x) {
  if (!x || typeof x !== 'object' || !/^[A-Za-z0-9_-]{1,40}$/.test(String(x.id))) return null;
  const name = cleanStr(x.name, 40);
  if (!name) return null;
  return { id: String(x.id), name, c: clampInt(x.c, 0, COLORS - 1, 0), goal: clampInt(x.goal, 0, 1440, 0), min: clampInt(x.min, 0, 1440, 10) };
}
export function cleanSession(x) {
  if (!x || typeof x !== 'object') return null;
  const s = +x.s, d = +x.d;
  if (!isFinite(s) || s < 946684800000 || s > 4102444800000 || !isFinite(d) || d < 1000 || d > 48 * HOUR) return null;
  const id = /^[A-Za-z0-9_-]{1,40}$/.test(String(x.id)) ? String(x.id) : null;
  if (!id || !/^[A-Za-z0-9_-]{1,40}$/.test(String(x.sid))) return null;
  return { id, s: Math.round(s), d: Math.round(d), sid: String(x.sid), note: cleanStr(x.note, 200) };
}
export function cleanActive(a) {
  if (!a || typeof a !== 'object' || !/^[A-Za-z0-9_-]{1,40}$/.test(String(a.sid))) return null;
  const t0 = +a.t0, acc = +a.acc, run = a.run == null ? null : +a.run, goal = +a.goal || 0;
  if (!isFinite(t0) || !isFinite(acc) || acc < 0 || (run != null && !isFinite(run))) return null;
  return { sid: String(a.sid), t0, acc, run, goal: Math.max(0, Math.min(1440 * MIN, goal)) };
}
export function normalizeState(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  let sedarim = (Array.isArray(r.sedarim) ? r.sedarim : []).map(cleanSeder).filter(Boolean).slice(0, 40);
  if (!sedarim.length) sedarim = DEFAULT_SEDARIM.map((x) => ({ ...x }));
  const seen = new Set();
  sedarim = sedarim.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
  const ids = new Set();
  const sessions = (Array.isArray(r.sessions) ? r.sessions : []).map(cleanSession).filter((x) => x && !ids.has(x.id) && ids.add(x.id)).slice(-20000);
  const st = r.settings && typeof r.settings === 'object' ? r.settings : {};
  const settings = {
    dayGoal: clampInt(st.dayGoal, 5, 1440, DEFAULT_SETTINGS.dayGoal),
    dayMin: clampInt(st.dayMin, 1, 1440, DEFAULT_SETTINGS.dayMin),
    wake: st.wake !== false,
    lastSid: sedarim.some((x) => x.id === st.lastSid) ? st.lastSid : sedarim[0].id,
  };
  return { v: 1, sedarim, sessions, active: cleanActive(r.active), settings };
}

/** Merge an imported JSON file into the current state (same ids are skipped, new ones added). */
export function mergeImport(state, file) {
  if (!file || typeof file !== 'object' || !Array.isArray(file.sessions)) return null;
  const inc = normalizeState({ sedarim: file.sedarim, sessions: file.sessions, settings: {} });
  const haveS = new Set(state.sedarim.map((x) => x.id)), haveX = new Set(state.sessions.map((x) => x.id));
  const addS = inc.sedarim.filter((x) => !haveS.has(x.id) && file.sedarim);
  const addX = inc.sessions.filter((x) => !haveX.has(x.id));
  // sessions pointing at a seder we do not have yet need it to exist (file's seder list covers them)
  return { sedarim: [...state.sedarim, ...addS], sessions: [...state.sessions, ...addX].sort((a, b) => a.s - b.s), added: addX.length, skipped: inc.sessions.length - addX.length };
}

export const exportJSON = (state) => JSON.stringify({ app: 'szvtech-seder', v: 1, exported: new Date().toISOString(), sedarim: state.sedarim, sessions: state.sessions, settings: state.settings }, null, 1);

const csvCell = (v) => {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;           // stop spreadsheet formulas
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function exportCSV(state) {
  const name = (sid) => (state.sedarim.find((x) => x.id === sid) || { name: sid }).name;
  const rows = [['date', 'start', 'end', 'seder', 'minutes', 'note']];
  for (const x of [...state.sessions].sort((a, b) => a.s - b.s)) {
    rows.push([ymdOf(x.s), hhmmOf(x.s), hhmmOf(x.s + x.d), name(x.sid), (x.d / MIN).toFixed(1), x.note]);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
