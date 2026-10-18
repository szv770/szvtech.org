// Tests for seder/logic.js. Run: node seder/_seder.test.mjs
// Runs in New York time so the DST cases are real, whatever the machine's zone is.
process.env.TZ = 'America/New_York';
const S = await import('./logic.js');

let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) { pass++; console.log('  ok  ', name); } else { fail++; console.log('  FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); } };
const L = (y, m, d, H = 0, M = 0) => new Date(y, m - 1, d, H, M).getTime();
const { MIN, HOUR } = S;

console.log('days & calendar');
check('ymdOf local', S.ymdOf(L(2026, 10, 18, 23, 59)) === '2026-10-18' && S.ymdOf(L(2026, 10, 19, 0, 0)) === '2026-10-19');
check('shiftYMD', S.shiftYMD('2026-03-01', -1) === '2026-02-28' && S.shiftYMD('2028-02-28', 1) === '2028-02-29' && S.shiftYMD('2026-12-31', 1) === '2027-01-01');
check('weekday (2026-10-18 is a Sunday)', S.weekdayOf('2026-10-18') === 0 && S.weekdayOf('2026-10-24') === 6 && S.weekStart('2026-10-22') === '2026-10-18');
check('parseYMD rejects nonsense', S.parseYMD('2026-02-30') === null && S.parseYMD('2026-13-01') === null && S.parseYMD(null) === null);
check('localMs round trip', S.hhmmOf(S.localMs('2026-10-18', '07:05')) === '07:05' && S.localMs('2026-10-18', '25:00') === null);
const g = S.monthGrid(2026, 10);
check('month grid shape (Oct 2026 starts Thursday)', g.length === 5 && g[0][4] === '2026-10-01' && g[0][3] === null && g[4][6] === '2026-10-31' && g.flat().filter(Boolean).length === 31, g[0]);
check('month grid Feb 2026 = 4 weeks', S.monthGrid(2026, 2).length === 4);

console.log('duration maths: midnight');
let p = S.splitByDay(L(2026, 10, 18, 23, 30), 90 * MIN);
check('across midnight splits 30 + 60', p.length === 2 && p[0].ymd === '2026-10-18' && p[0].ms === 30 * MIN && p[1].ymd === '2026-10-19' && p[1].ms === 60 * MIN, p);
p = S.splitByDay(L(2026, 10, 18, 10, 0), 45 * MIN);
check('inside one day is one piece', p.length === 1 && p[0].ms === 45 * MIN);
p = S.splitByDay(L(2026, 10, 18, 22, 0), 30 * HOUR);
check('30 h spans three days and sums exactly', p.length === 3 && p.reduce((n, x) => n + x.ms, 0) === 30 * HOUR, p);
check('zero length', S.splitByDay(L(2026, 10, 18, 10), 0).length === 0);

console.log('duration maths: DST');
// US spring forward: 2026-03-08, 02:00 -> 03:00 (a 23 hour day)
p = S.splitByDay(L(2026, 3, 7, 23, 0), 3 * HOUR);
check('spring forward: 3 real hours from 23:00 = 1 h Sat + 2 h Sun', p.length === 2 && p[0].ms === HOUR && p[1].ms === 2 * HOUR, p);
const dayLen = S.startOfNextDay('2026-03-08') - S.startOfDay('2026-03-08');
check('spring-forward day is 23 h', dayLen === 23 * HOUR, dayLen / HOUR);
p = S.splitByDay(S.startOfDay('2026-03-08'), 23 * HOUR);
check('a full 23 h day stays in one day', p.length === 1 && p[0].ymd === '2026-03-08', p);
// fall back: 2026-11-01, 02:00 -> 01:00 (a 25 hour day)
const fall = S.startOfNextDay('2026-11-01') - S.startOfDay('2026-11-01');
check('fall-back day is 25 h', fall === 25 * HOUR, fall / HOUR);
p = S.splitByDay(S.startOfDay('2026-11-01'), 25 * HOUR);
check('25 h from midnight fills the day exactly', p.length === 1 && p[0].ms === 25 * HOUR, p);
p = S.splitByDay(L(2026, 10, 31, 23, 0), 3 * HOUR);
check('fall back: 3 real hours from 23:00 = 1 h Sat + 2 h Sun', p.length === 2 && p[0].ms === HOUR && p[1].ms === 2 * HOUR, p);

console.log('stopwatch (wall clock)');
let a = S.startActive('gemara', 1000, 45 * MIN);
check('running elapsed', S.elapsedOf(a, 1000 + 5 * MIN) === 5 * MIN);
a = S.pauseActive(a, 1000 + 5 * MIN);
check('paused holds', S.elapsedOf(a, 1000 + 50 * MIN) === 5 * MIN && a.run === null);
check('pause twice is harmless', S.pauseActive(a, 99999999).acc === 5 * MIN);
a = S.resumeActive(a, 1000 + 60 * MIN);
check('resume adds on', S.elapsedOf(a, 1000 + 70 * MIN) === 15 * MIN);
check('phone asleep for 20 min still counts', S.elapsedOf(a, 1000 + 80 * MIN) === 25 * MIN);
check('clock going backwards never negative', S.elapsedOf(S.startActive('x', 5000), 1000) === 0);
const fin = S.finishActive(a, 1000 + 70 * MIN, 'id1');
check('finish -> session', fin.s === 1000 && fin.d === 15 * MIN && fin.sid === 'gemara' && fin.id === 'id1');
check('ring fraction', S.ringFrac(22.5 * MIN, 45 * MIN) === .5 && S.ringFrac(90 * MIN, 45 * MIN) === 1 && S.ringFrac(30 * MIN, 0) === .5 && S.ringFrac(HOUR, 0) === 0);
const re = S.cleanActive(JSON.parse(JSON.stringify(a)));
check('survives JSON reload', re.sid === a.sid && re.t0 === a.t0 && re.run === a.run && re.acc === a.acc && re.goal === a.goal);

console.log('formatting');
check('fmtClock', S.fmtClock(65000) === '01:05' && S.fmtClock(3725000) === '1:02:05' && S.fmtClock(-5) === '00:00');
check('fmtDur', S.fmtDur(30000) === '30s' && S.fmtDur(42 * MIN) === '42 min' && S.fmtDur(65 * MIN) === '1h 05m' && S.fmtDur(2 * HOUR) === '2h');

console.log('totals & streaks');
const mk = (id, y, m, d, H, min, sid = 'gemara') => ({ id, s: L(y, m, d, H, 0), d: min * MIN, sid, note: '' });
const sessions = [mk('a', 2026, 10, 14, 9, 20), mk('b', 2026, 10, 15, 9, 30), mk('c', 2026, 10, 16, 21, 40, 'tanya'), mk('d', 2026, 10, 17, 9, 5), mk('e', 2026, 10, 18, 7, 25),
  mk('f', 2026, 10, 18, 20, 20, 'tanya'), mk('g', 2026, 10, 1, 23, 120)];
const dt = S.dayTotals(sessions);
check('day totals combine sessions', dt['2026-10-18'].total === 45 * MIN && dt['2026-10-18'].by.gemara === 25 * MIN && dt['2026-10-18'].by.tanya === 20 * MIN);
check('midnight split lands in both days', dt['2026-10-01'].total === 60 * MIN && dt['2026-10-02'].total === 60 * MIN);
check('sid filter', S.dayTotals(sessions, 'tanya')['2026-10-18'].total === 20 * MIN && !S.dayTotals(sessions, 'tanya')['2026-10-15']);
let st = S.streakOf(dt, '2026-10-18', 15 * MIN);
check('streak with a minimum (17th was only 5 min)', st.streak === 1 && st.todayMet && st.best === 3, st);   // 14,15,16 then break
st = S.streakOf(dt, '2026-10-18', 5 * MIN);
check('lower minimum extends the streak', st.streak === 5 && st.best === 5, st);
st = S.streakOf(dt, '2026-10-19', 5 * MIN);
check('streak alive while today is still open', st.streak === 5 && !st.todayMet, st);
st = S.streakOf(dt, '2026-10-20', 5 * MIN);
check('streak ends after a missed day', st.streak === 0 && st.best === 5, st);
check('minimum 0 means no streak', S.streakOf(dt, '2026-10-18', 0).streak === 0);
check('streak across a DST day', (() => { const s2 = [mk('x', 2026, 3, 7, 9, 30), mk('y', 2026, 3, 8, 9, 30), mk('z', 2026, 3, 9, 9, 30)]; return S.streakOf(S.dayTotals(s2), '2026-03-09', 15 * MIN).streak === 3; })());
const ld = S.lastDays(dt, '2026-10-18', 7);
check('last 7 days oldest first', ld.length === 7 && ld[0].ymd === '2026-10-12' && ld[6].ymd === '2026-10-18' && ld[6].total === 45 * MIN && ld[0].total === 0);
check('heat levels', [S.heatLevel(0, 60 * MIN), S.heatLevel(5 * MIN, 60 * MIN), S.heatLevel(20 * MIN, 60 * MIN), S.heatLevel(40 * MIN, 60 * MIN), S.heatLevel(60 * MIN, 60 * MIN)].join() === '0,1,2,3,4');
const tb = S.totalsBySeder(dt, '2026-10-12', '2026-10-18');
check('totals by seder in range', tb.gemara === 80 * MIN && tb.tanya === 60 * MIN, tb);
const b = S.bests(sessions, dt, 15 * MIN, '2026-10-18');
check('personal bests', b.longest.id === 'g' && b.bestDay.ms === 60 * MIN && b.total === 120 * MIN + 20 * MIN + 30 * MIN + 40 * MIN + 5 * MIN + 45 * MIN && b.sessions === 7, b);
check('best week', b.bestWeek.ms === 120 * MIN && b.bestWeek.start === '2026-09-27', b.bestWeek);

console.log('state, import & export');
const ns = S.normalizeState(null);
check('empty state gets the default sedarim', ns.sedarim.length === 9 && ns.sedarim[0].id === 'chassidus' && ns.sessions.length === 0 && ns.settings.dayGoal === 60);
const bad = S.normalizeState({ sedarim: [{ id: 'x y', name: 'bad' }, { id: 'ok', name: '  Mine  ', c: 99, goal: -5 }], sessions: [{ id: 'q', s: 1, d: 5 }, { id: 's1', s: L(2026, 10, 1, 9), d: 10 * MIN, sid: 'ok', note: 'n'.repeat(500) }], settings: { dayGoal: 'x' } });
check('bad rows dropped, values clamped', bad.sedarim.length === 1 && bad.sedarim[0].name === 'Mine' && bad.sedarim[0].c === 8 && bad.sedarim[0].goal === 0 && bad.sessions.length === 1 && bad.sessions[0].note.length === 200 && bad.settings.dayGoal === 60, bad);
const state = S.normalizeState({ sedarim: [{ id: 'gemara', name: 'Gemara' }, { id: 'tanya', name: 'Tanya' }], sessions });
const csv = S.exportCSV({ ...state, sessions: [{ id: 'n', s: L(2026, 10, 18, 7), d: 25 * MIN, sid: 'gemara', note: '=HYPERLINK("x"), "quote"' }] });
check('CSV header, row and formula guard', csv.startsWith('date,start,end,seder,minutes,note\r\n2026-10-18,07:00,07:25,Gemara,25.0,') && csv.includes(`"'=HYPERLINK(""x""), ""quote"""`), csv);
const js = JSON.parse(S.exportJSON(state));
check('JSON export shape', js.app === 'szvtech-seder' && js.sessions.length === 7);
const merged = S.mergeImport({ ...state, sessions: sessions.slice(0, 3) }, js);
check('import merges new sessions, skips ones it has', merged.added === 4 && merged.skipped === 3 && merged.sessions.length === 7, [merged.added, merged.skipped]);
check('import rejects junk', S.mergeImport(state, { hello: 1 }) === null && S.mergeImport(state, null) === null);
check('newId unique-ish', S.newId() !== S.newId());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
