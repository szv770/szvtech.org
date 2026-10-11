// node world/_world.test.mjs — time math for /world (offsets across DST, overlap finder, URL parse).
import assert from 'node:assert/strict';
import {
  zonedParts, offsetMin, zonedToUtc, dayRange, fmtDiff, fmtHM, hourClass, findOverlap,
  parseShare, parseInstant, buildShare, fmtInstant, parseTimeQuery, matchCity, summary, addDays, dayDiff, validTz, fmtUtc,
} from './tz.js';

let n = 0, failed = 0;
function test(name, fn) {
  n++;
  try { fn(); } catch (e) { failed++; console.error('FAIL', name, '\n ', e.message); }
}
const U = (s) => Date.parse(s);
const NY = 'America/New_York', JLM = 'Asia/Jerusalem', LON = 'Europe/London', LA = 'America/Los_Angeles';

test('offsets: summer, winter, and the late-October gap when Europe/Israel switched but the US has not', () => {
  assert.equal(offsetMin(U('2026-07-01T12:00Z'), NY), -240);
  assert.equal(offsetMin(U('2026-01-15T12:00Z'), NY), -300);
  assert.equal(offsetMin(U('2026-07-01T12:00Z'), JLM), 180);
  assert.equal(offsetMin(U('2026-01-15T12:00Z'), JLM), 120);
  // Oct 13 2026: NY -4, JLM +3 -> 7h; Oct 28: JLM back to +2 (Oct 25), NY still -4 until Nov 1 -> 6h
  const d1 = U('2026-10-13T14:00Z'), d2 = U('2026-10-28T14:00Z'), d3 = U('2026-11-03T14:00Z');
  assert.equal(offsetMin(d1, JLM) - offsetMin(d1, NY), 7 * 60);
  assert.equal(offsetMin(d2, JLM) - offsetMin(d2, NY), 6 * 60);
  assert.equal(offsetMin(d3, JLM) - offsetMin(d3, NY), 7 * 60);
  assert.equal(offsetMin(d2, LON) - offsetMin(d2, NY), 4 * 60);
  assert.equal(offsetMin(U('2026-03-20T12:00Z'), LON) - offsetMin(U('2026-03-20T12:00Z'), NY), 4 * 60); // March gap
  assert.equal(offsetMin(U('2026-07-01T00:00Z'), 'Asia/Kolkata'), 330);
  assert.equal(offsetMin(U('2026-07-01T00:00Z'), 'Asia/Kathmandu'), 345);
});

test('offset flips exactly at the transition instant', () => {
  // US fall back: 2026-11-01 06:00Z (02:00 EDT -> 01:00 EST)
  assert.equal(offsetMin(U('2026-11-01T05:59:59Z'), NY), -240);
  assert.equal(offsetMin(U('2026-11-01T06:00:00Z'), NY), -300);
  // Southern hemisphere: Sydney goes to +11 on 2026-10-04 (16:00Z Oct 3)
  assert.equal(offsetMin(U('2026-10-03T15:59Z'), 'Australia/Sydney'), 600);
  assert.equal(offsetMin(U('2026-10-03T16:00Z'), 'Australia/Sydney'), 660);
});

test('zonedToUtc: normal, spring-forward gap, fall-back overlap', () => {
  assert.equal(zonedToUtc(2026, 10, 13, 10, 0, NY), U('2026-10-13T14:00Z'));
  assert.equal(zonedToUtc(2026, 10, 13, 17, 0, JLM), U('2026-10-13T14:00Z'));
  assert.equal(zonedToUtc(2026, 3, 8, 2, 30, NY), U('2026-03-08T07:30Z')); // 02:30 doesn't exist -> 03:30 EDT
  assert.equal(zonedToUtc(2026, 11, 1, 1, 30, NY), U('2026-11-01T05:30Z')); // first 01:30 (EDT)
  assert.equal(zonedToUtc(2026, 1, 1, 0, 0, 'Pacific/Kiritimati'), U('2025-12-31T10:00Z'));
  const p = zonedParts(U('2026-10-13T14:00Z'), JLM);
  assert.deepEqual([p.y, p.m, p.d, p.hh, p.mm, p.wd], [2026, 10, 13, 17, 0, 2]);
});

test('dayRange is 23 / 24 / 25 hours on DST days', () => {
  const len = (ymd, tz) => { const [a, b] = dayRange(ymd, tz); return (b - a) / 3600000; };
  assert.equal(len({ y: 2026, m: 3, d: 8 }, NY), 23);
  assert.equal(len({ y: 2026, m: 11, d: 1 }, NY), 25);
  assert.equal(len({ y: 2026, m: 10, d: 13 }, NY), 24);
  assert.equal(len({ y: 2026, m: 10, d: 25 }, LON), 25);
  assert.equal(len({ y: 2026, m: 3, d: 27 }, JLM), 23);
});

test('calendar helpers', () => {
  assert.deepEqual(addDays({ y: 2026, m: 12, d: 31 }, 1), { y: 2027, m: 1, d: 1 });
  assert.deepEqual(addDays({ y: 2028, m: 3, d: 1 }, -1), { y: 2028, m: 2, d: 29 });
  assert.equal(dayDiff({ y: 2026, m: 10, d: 10 }, { y: 2026, m: 10, d: 13 }), 3);
  assert.ok(validTz('Asia/Jerusalem'));
  assert.ok(!validTz('Mars/Olympus'));
  assert.equal(fmtUtc(U('2026-07-01T00:00Z'), 'Asia/Kolkata'), 'UTC+5:30');
  assert.equal(fmtUtc(U('2026-07-01T00:00Z'), NY), 'UTC−4');
});

test('formatting', () => {
  assert.equal(fmtDiff(0), 'same');
  assert.equal(fmtDiff(420), '+7h');
  assert.equal(fmtDiff(-180), '−3h');
  assert.equal(fmtDiff(570), '+9h30');
  assert.equal(fmtDiff(-45), '−0h45');
  assert.equal(fmtHM(0, 5, false), '00:05');
  assert.equal(fmtHM(0, 5, true), '12:05 AM');
  assert.equal(fmtHM(13, 0, true), '1:00 PM');
  assert.equal(fmtHM(12, 0, true), '12:00 PM');
});

test('hourClass boundaries', () => {
  assert.equal(hourClass(9 * 60), 2);
  assert.equal(hourClass(17 * 60 - 1), 2);
  assert.equal(hourClass(17 * 60), 1);
  assert.equal(hourClass(7 * 60), 1);
  assert.equal(hourClass(6 * 60 + 59), 0);
  assert.equal(hourClass(22 * 60), 0);
});

test('overlap: NY + Jerusalem + London on Oct 13 2026', () => {
  const [a, b] = dayRange({ y: 2026, m: 10, d: 13 }, NY);
  const r = findOverlap(a, b, [NY, JLM, LON]);
  // Work hours never coincide (NY 9:00 = JLM 16:00, NY 10:00 = JLM 17:00): one hour, 9–10 NY
  assert.equal(r.level, 2);
  assert.equal(r.ranges.length, 1);
  assert.equal(r.ranges[0].start, U('2026-10-13T13:00Z'));
  assert.equal(r.ranges[0].end, U('2026-10-13T14:00Z'));
});

test('overlap: after Israel/UK fall back, before the US does (Oct 28) the window widens', () => {
  const [a, b] = dayRange({ y: 2026, m: 10, d: 28 }, NY);
  const r = findOverlap(a, b, [NY, JLM]);
  assert.equal(r.level, 2);
  assert.equal(r.ranges[0].start, U('2026-10-28T13:00Z')); // 9:00 NY = 15:00 JLM
  assert.equal(r.ranges[0].end, U('2026-10-28T15:00Z'));   // 11:00 NY = 17:00 JLM
});

test('overlap: LA + Jerusalem only gets "reasonable" hours', () => {
  const [a, b] = dayRange({ y: 2026, m: 10, d: 13 }, LA);
  const r = findOverlap(a, b, [LA, JLM]);
  assert.equal(r.level, 1);
  // LA 7:00–12:00 = JLM 17:00–22:00
  assert.equal(r.ranges[0].start, U('2026-10-13T14:00Z'));
  assert.equal(r.ranges[0].end, U('2026-10-13T19:00Z'));
});

test('overlap: impossible spread returns level 0', () => {
  const [a, b] = dayRange({ y: 2026, m: 10, d: 13 }, 'Pacific/Honolulu');
  const r = findOverlap(a, b, ['Pacific/Honolulu', 'Asia/Dubai', 'Europe/London', 'Asia/Tokyo']);
  assert.ok(r.level <= 1);
  if (r.level === 0) assert.equal(r.ranges.length, 0);
});

test('overlap honours half-hour zones (15-minute slots)', () => {
  const [a, b] = dayRange({ y: 2026, m: 10, d: 13 }, LON);
  const r = findOverlap(a, b, [LON, 'Asia/Kolkata']);
  // London 9:00 BST = 13:30 IST, IST 17:00 = 12:30 BST -> 08:00Z–11:30Z
  assert.equal(r.ranges[0].start, U('2026-10-13T08:00Z'));
  assert.equal(r.ranges[0].end, U('2026-10-13T11:30Z'));
});

test('share URL parse / build round trip', () => {
  const s = parseShare('?c=new-york,jerusalem,london&t=2026-10-13T14:00Z');
  assert.deepEqual(s.cities, ['new-york', 'jerusalem', 'london']);
  assert.equal(s.t, U('2026-10-13T14:00Z'));
  assert.equal(fmtInstant(s.t), '2026-10-13T14:00Z');
  assert.equal(buildShare(s.cities, s.t), '/world/?c=new-york,jerusalem,london&t=2026-10-13T14:00Z');
  const z = parseShare('?c=here,tz:Asia/Kolkata,../evil,<x>,london,london');
  assert.deepEqual(z.cities, ['here', 'tz:Asia/Kolkata', 'london']);
  assert.equal(buildShare(z.cities, null), '/world/?c=here,tz:Asia/Kolkata,london');
  assert.equal(parseShare('').cities, null);
  assert.equal(parseShare('?c=').cities, null);
  assert.equal(parseShare('?t=garbage').t, null);
  assert.equal(parseInstant('2026-10-13T17:00+03:00'), U('2026-10-13T14:00Z'));
  assert.equal(parseInstant('2026-10-13T14:00'), null); // must say which zone
  assert.equal(parseInstant('2026-13-13T14:00Z'), null);
  assert.deepEqual(parseShare('?d=2026-10-13').date, { y: 2026, m: 10, d: 13 });
  assert.equal(parseShare('?d=2026-02-30').date, null);
});

test('converter: time + city parsing', () => {
  const q = (s) => { const r = parseTimeQuery(s); return r && [r.h, r.m, r.rest]; };
  assert.deepEqual(q('3pm London'), [15, 0, 'london']);
  assert.deepEqual(q('London 3:30 pm'), [15, 30, 'london']);
  assert.deepEqual(q('15:00 jlm'), [15, 0, 'jlm']);
  assert.deepEqual(q('noon tokyo'), [12, 0, 'tokyo']);
  assert.deepEqual(q('midnight'), [0, 0, '']);
  assert.deepEqual(q('1530 ny'), [15, 30, 'ny']);
  assert.deepEqual(q('12am paris'), [0, 0, 'paris']);
  assert.deepEqual(q('12 pm'), [12, 0, '']);
  assert.deepEqual(q('9.30a new york'), [9, 30, 'new york']);
  assert.deepEqual(q('3 amsterdam'), [3, 0, 'amsterdam']);
  assert.deepEqual(q('at 10 in los angeles'), [10, 0, 'los angeles']);
  assert.equal(q('London'), null);
  assert.equal(q('13pm london'), null);
  assert.equal(q('25:00'), null);
  const list = [
    { id: 'new-york', name: 'New York', country: 'Manhattan, NY', alt: 'nyc', tz: NY },
    { id: 'london', name: 'London', country: 'United Kingdom', tz: LON },
    { id: 'jerusalem', name: 'Jerusalem', country: 'Israel', tz: JLM },
    { id: 'los-angeles', name: 'Los Angeles', country: 'California', alt: 'la', tz: LA },
    { id: 'sao-paulo', name: 'São Paulo', country: 'Brazil', tz: 'America/Sao_Paulo' },
  ];
  assert.equal(matchCity('ny', list).id, 'new-york');
  assert.equal(matchCity('la', list).id, 'los-angeles');
  assert.equal(matchCity('jlm', list).id, 'jerusalem');
  assert.equal(matchCity('lond', list).id, 'london');
  assert.equal(matchCity('sao paulo', list).id, 'sao-paulo');
  assert.equal(matchCity('israel', list).id, 'jerusalem');
  assert.equal(matchCity('zzz', list), null);
});

test('summary text', () => {
  const t = U('2026-10-13T14:00Z');
  const e = [{ name: 'New York', tz: NY }, { name: 'Jerusalem', tz: JLM }, { name: 'London', tz: LON }];
  assert.equal(summary(t, e), 'Tue Oct 13 · 10:00 New York / 17:00 Jerusalem / 15:00 London');
  const late = U('2026-10-14T02:00Z');
  assert.equal(summary(late, [{ name: 'Los Angeles', tz: LA }, { name: 'Jerusalem', tz: JLM }], true),
    'Tue Oct 13 · 7:00 PM Los Angeles / 5:00 AM Jerusalem (Wed)');
});

console.log(failed ? `${failed}/${n} failed` : `all ${n} tests passed`);
if (failed) process.exit(1);
