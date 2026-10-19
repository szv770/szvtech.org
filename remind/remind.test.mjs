// Tests for the reminder engine:  node remind/remind.test.mjs
// Times are built with the same local-clock Date the engine uses, so the suite passes in any TZ.
import assert from 'node:assert/strict';
import * as R from './remind.js';
import * as L from '../luach/logic.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; } catch (e) { console.error('FAIL', name); throw e; } };
const at = (y, m, d, H = 9, M = 0) => new Date(y, m - 1, d, H, M).getTime();
const mk = (o) => R.cleanItem({ id: 'x', title: 'T', color: 0, ...o });

test('parseWhen / whenStr round trip and rejects junk', () => {
  assert.equal(R.parseWhen('2026-10-23T16:52'), at(2026, 10, 23, 16, 52));
  assert.equal(R.whenStr(at(2026, 1, 5, 7, 5)), '2026-01-05T07:05');
  for (const bad of ['', null, '2026-02-30T10:00', '2026-13-01T10:00', '2026-10-23T24:00', '2026-10-23 10:00']) assert.equal(R.parseWhen(bad), null, String(bad));
});

test('splitMs', () => {
  assert.deepEqual(R.splitMs(90061000), { d: 1, h: 1, m: 1, s: 1 });
  assert.deepEqual(R.splitMs(-5), { d: 0, h: 0, m: 0, s: 0 });
});

test('once: only while in the future', () => {
  const it = mk({ kind: 'once', when: '2026-10-23T16:00' });
  assert.equal(R.occAfter(it, at(2026, 10, 20)).at, at(2026, 10, 23, 16));
  assert.equal(R.occAfter(it, at(2026, 10, 24)), null);
});

test('daily: today if still ahead, otherwise tomorrow', () => {
  const it = mk({ kind: 'daily', time: '09:30' });
  assert.equal(R.occAfter(it, at(2026, 10, 19, 9, 0)).at, at(2026, 10, 19, 9, 30));
  assert.equal(R.occAfter(it, at(2026, 10, 19, 9, 30)).at, at(2026, 10, 20, 9, 30));
  assert.equal(R.occAfter(it, at(2026, 12, 31, 23, 0)).at, at(2027, 1, 1, 9, 30));
});

test('weekly: picks the right weekdays', () => {
  const fri = mk({ kind: 'weekly', days: [5], time: '12:00' });      // 2026-10-19 is a Monday
  assert.equal(new Date(2026, 9, 19).getDay(), 1);
  assert.equal(R.occAfter(fri, at(2026, 10, 19)).at, at(2026, 10, 23, 12));
  assert.equal(R.occAfter(fri, at(2026, 10, 23, 12)).at, at(2026, 10, 30, 12));
  const two = mk({ kind: 'weekly', days: [0, 3], time: '08:00' });
  assert.equal(R.occAfter(two, at(2026, 10, 19)).at, at(2026, 10, 21, 8));   // Wednesday
  assert.equal(R.occAfter(two, at(2026, 10, 21, 8)).at, at(2026, 10, 25, 8)); // Sunday
});

test('yearly: leap-day birthdays use Feb 28 in other years; nth counts', () => {
  const it = mk({ kind: 'yearly', greg: { m: 2, d: 29, y: 2000 }, time: '10:00' });
  assert.deepEqual(R.occAfter(it, at(2026, 3, 1)), { at: at(2027, 2, 28, 10), nth: 27 });
  assert.deepEqual(R.occAfter(it, at(2027, 3, 1)), { at: at(2028, 2, 29, 10), nth: 28 });
  const plain = mk({ kind: 'yearly', greg: { m: 12, d: 25 } });
  assert.equal(R.occAfter(plain, at(2026, 12, 25, 9, 0)).at, at(2027, 12, 25, 9));
  assert.equal(R.occAfter(plain, at(2026, 1, 1)).nth, null);
});

test('hebrew date: Rosh Hashanah / Yom Kippur 5787 land on the right civil dates', () => {
  const rh = mk({ kind: 'hebrew', heb: { m: 7, d: 1, type: 'date' }, time: '08:00' });
  assert.equal(R.occAfter(rh, at(2026, 1, 1)).at, at(2026, 9, 12, 8));
  const yk = mk({ kind: 'hebrew', heb: { m: 7, d: 10, type: 'date' }, time: '08:00' });
  assert.equal(R.occAfter(yk, at(2026, 9, 13)).at, at(2026, 9, 21, 8));
  assert.equal(R.occAfter(yk, at(2026, 9, 21, 8)).at, at(2027, 10, 11, 8));   // 10 Tishrei 5788
});

test('hebrew date: Adar II falls back to Adar in a regular year', () => {
  assert.ok(L.isLeapYear(5787) && !L.isLeapYear(5788));
  const purim = mk({ kind: 'hebrew', heb: { m: 13, d: 14, type: 'date' } });
  assert.equal(R.occAfter(purim, at(2027, 1, 1)).at, at(...L.absToYMD(L.hebrewToAbs(5787, 13, 14)).split('-').map(Number)));
  const next = R.occAfter(purim, at(2027, 6, 1));
  const g = L.absToGreg(L.hebrewToAbs(5788, 12, 14));
  assert.equal(next.at, at(g.y, g.m, g.d));
});

test('hebrew birthday: 1 Jan 2000 is 23 Teves 5760; next ones follow luach rules and count years', () => {
  const h = R.hebrewOf(2000, 1, 1);
  assert.deepEqual([h.y, h.m, h.d], [5760, 10, 23]);
  const it = mk({ kind: 'hebrew', heb: { y: 5760, m: 10, d: 23, type: 'birthday' }, time: '09:00' });
  const o = R.occAfter(it, at(2026, 10, 19));
  const g = L.absToGreg(L.hebrewToAbs(5787, 10, 23));
  assert.equal(o.at, at(g.y, g.m, g.d));
  assert.equal(o.nth, 27);
  assert.equal(g.y, 2027);
});

test('hebrew after-sunset births move to the next Hebrew day', () => {
  const day = R.hebrewOf(2000, 1, 1, false), night = R.hebrewOf(2000, 1, 1, true);
  assert.equal(night.d, day.d + 1);
});

test('yahrzeit: the evening before (eve) is the civil day before', () => {
  const mkY = (eve) => mk({ kind: 'hebrew', heb: { y: 5750, m: 8, d: 20, type: 'yahrzeit' }, eve, time: '18:00' });
  const same = R.occAfter(mkY(false), at(2026, 10, 19)), before = R.occAfter(mkY(true), at(2026, 10, 19));
  assert.equal(Math.round((same.at - before.at) / 864e5), 1);
  assert.equal(same.nth, before.nth);
  assert.equal(R.occAfter(mk({ kind: 'hebrew', heb: { y: 5787, m: 8, d: 20, type: 'yahrzeit' } }), at(2026, 1, 1)).nth, 1);
});

/* ---- zman-relative (fake source: candle lighting on Fridays at 20:52 UTC, sunset every day at 21:10 UTC) ---- */
const ymdUTC = (ms) => new Date(ms).toISOString().slice(0, 10);
const fakeSource = (calls = { n: 0 }) => ({
  ymdOf: ymdUTC,
  day(ymd) {
    calls.n++;
    const [y, m, d] = ymd.split('-').map(Number);
    const items = [{ key: 'sunset', at: Date.UTC(y, m - 1, d, 21, 10) }];
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 5) items.push({ key: 'candleLighting', at: Date.UTC(y, m - 1, d, 20, 52) });
    return items;
  },
});
test('zman: 18 minutes before candle lighting, Fridays', () => {
  const it = mk({ kind: 'zman', zman: { key: 'candleLighting', offset: -18, days: [5] } });
  const o = R.occAfter(it, Date.UTC(2026, 9, 19, 12), { zman: fakeSource() });
  assert.equal(o.at, Date.UTC(2026, 9, 23, 20, 34));
  const o2 = R.occAfter(it, o.at, { zman: fakeSource() });
  assert.equal(o2.at, Date.UTC(2026, 9, 30, 20, 34));
});
test('zman: any day it exists (days null) and weekday filter', () => {
  const any = mk({ kind: 'zman', zman: { key: 'candleLighting', offset: 0, days: null } });
  assert.equal(R.occAfter(any, Date.UTC(2026, 9, 24), { zman: fakeSource() }).at, Date.UTC(2026, 9, 30, 20, 52));
  const sun = mk({ kind: 'zman', zman: { key: 'sunset', offset: 30, days: [0] } });
  assert.equal(R.occAfter(sun, Date.UTC(2026, 9, 19), { zman: fakeSource() }).at, Date.UTC(2026, 9, 25, 21, 40));
});
test('zman: offset that crosses midnight still finds it; no source or no data gives null', () => {
  const it = mk({ kind: 'zman', zman: { key: 'sunset', offset: 180, days: null } });
  assert.equal(R.occAfter(it, Date.UTC(2026, 9, 19, 23, 0), { zman: fakeSource() }).at, Date.UTC(2026, 9, 20, 0, 10));
  assert.equal(R.occAfter(it, 0, {}), null);
  assert.equal(R.occAfter(it, 0, { zman: { ymdOf: ymdUTC, day: () => null } }), null);
});
test('setZmanSource is used when no ctx source is given', () => {
  R.setZmanSource(fakeSource());
  const it = mk({ kind: 'zman', zman: { key: 'candleLighting', offset: -18, days: [5] } });
  assert.equal(R.pending(it, Date.UTC(2026, 9, 19)).atMs, Date.UTC(2026, 9, 23, 20, 34));
  R.setZmanSource(null);
  assert.equal(R.pending(it, Date.UTC(2026, 9, 19)), null);
});

/* ---- pending / due / snooze / done ---- */
test('pending: due, ack, snooze, grace', () => {
  const daily = mk({ kind: 'daily', time: '09:00' });
  const n0 = at(2026, 10, 19, 8, 0);
  let p = R.pending(daily, n0);
  assert.equal(p.atMs, at(2026, 10, 19, 9)); assert.equal(p.due, false);
  p = R.pending(daily, at(2026, 10, 19, 9, 5));
  assert.equal(p.due, true); assert.equal(p.baseMs, at(2026, 10, 19, 9));
  // done -> next is tomorrow
  const done = R.ackItem(daily, at(2026, 10, 19, 9, 5));
  assert.equal(R.pending(done, at(2026, 10, 19, 9, 6)).atMs, at(2026, 10, 20, 9));
  // snooze 10 min, then it is due again at that time
  const sn = R.snoozeItem(daily, at(2026, 10, 19, 9, 15), at(2026, 10, 19, 9, 5));
  p = R.pending(sn, at(2026, 10, 19, 9, 6));
  assert.equal(p.atMs, at(2026, 10, 19, 9, 15)); assert.equal(p.snoozed, true); assert.equal(p.due, false);
  assert.equal(R.pending(sn, at(2026, 10, 19, 9, 16)).due, true);
  // an unacknowledged daily from long ago is dropped silently
  p = R.pending(daily, at(2026, 10, 20, 8, 0));
  assert.equal(p.atMs, at(2026, 10, 20, 9));
});

test('pending: a once reminder stays overdue until done; done hides it; reopen brings it back', () => {
  const o = mk({ kind: 'once', when: '2026-10-19T09:00' });
  const later = at(2026, 10, 25);
  const p = R.pending(o, later);
  assert.equal(p.due, true);
  const d = R.ackItem(o, later);
  assert.equal(R.pending(d, later), null);
  assert.ok(d.doneAt);
  assert.ok(R.pending(R.reopenItem(d), later).due);
});

test('snoozed once item stays due after its snooze time', () => {
  const o = mk({ kind: 'once', when: '2026-10-19T09:00' });
  const sn = R.snoozeItem(o, at(2026, 10, 19, 10), at(2026, 10, 19, 9, 1));
  assert.equal(R.pending(sn, at(2026, 10, 19, 9, 30)).due, false);
  assert.equal(R.pending(sn, at(2026, 10, 19, 11)).due, true);
});

test('skip a future occurrence (ack before it is due) moves to the next one', () => {
  const wk = mk({ kind: 'weekly', days: [5], time: '12:00' });
  const now = at(2026, 10, 19);
  const skipped = R.ackItem(wk, now);
  assert.equal(R.pending(skipped, now).atMs, at(2026, 10, 30, 12));
});

/* ---- upcoming() ---- */
test('upcoming: ordered, one per reminder, due first, limited to n', () => {
  const now = at(2026, 10, 19, 10, 0);
  const items = [
    mk({ id: 'a', title: 'Later', kind: 'once', when: '2026-11-01T09:00' }),
    mk({ id: 'b', title: 'Soon', kind: 'daily', time: '12:00', emoji: '⏰' }),
    mk({ id: 'c', title: 'Overdue', kind: 'once', when: '2026-10-19T08:00' }),
    mk({ id: 'd', title: 'Finished', kind: 'once', when: '2026-10-18T08:00', doneAt: now - 1000 }),
    mk({ id: 'e', title: 'Fri', kind: 'weekly', days: [5], time: '16:00' }),
  ];
  const u = R.upcoming(10, now, items);
  assert.deepEqual(u.map((x) => x.id), ['c', 'b', 'e', 'a']);
  assert.equal(u[0].due, true);
  assert.deepEqual(Object.keys(u[1]).sort(), ['atMs', 'color', 'due', 'emoji', 'id', 'kind', 'nth', 'snoozed', 'title']);
  assert.equal(R.upcoming(2, now, items).length, 2);
  assert.equal(R.upcoming(0, now, items).length, 0);
});

/* ---- validation / storage ---- */
test('cleanItem rejects unusable items and clamps fields', () => {
  assert.equal(R.cleanItem(null), null);
  assert.equal(R.cleanItem({ kind: 'nope' }), null);
  assert.equal(R.cleanItem({ kind: 'once', when: 'soon' }), null);
  assert.equal(R.cleanItem({ kind: 'weekly', days: [] }), null);
  assert.equal(R.cleanItem({ kind: 'weekly', days: [9] }), null);
  assert.equal(R.cleanItem({ kind: 'yearly', greg: { m: 2, d: 30 } }), null);
  assert.equal(R.cleanItem({ kind: 'zman', zman: { key: 'bogus' } }), null);
  assert.equal(R.cleanItem({ kind: 'hebrew', heb: { y: 5788, m: 13, d: 1, type: 'birthday' } }), null);   // 5788 has no Adar II
  const t = R.cleanItem({ kind: 'daily', title: '  <b>x</b>  '.repeat(30), emoji: 'abcdefghijklmnop', color: 99, time: '25:99', id: 'bad id!' });
  assert.equal(t.title.length, 80); assert.equal(t.emoji.length, 8); assert.equal(t.color, 0); assert.equal(t.time, '09:00'); assert.match(t.id, /^[\w-]+$/);
  const h = R.cleanItem({ kind: 'hebrew', heb: { m: 7, d: 1, type: 'yahrzeit' } });
  assert.equal(h.heb.type, 'date');   // no year -> a plain date
});

test('normalize drops bad items and duplicate ids', () => {
  const n = R.normalize({ items: [{ id: 'a', kind: 'daily' }, { id: 'a', kind: 'daily' }, { kind: 'x' }, 5] });
  assert.equal(n.items.length, 1);
  assert.deepEqual(R.normalize(null), { v: 1, items: [] });
});

test('load / save use localStorage safely', () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  assert.deepEqual(R.load().items, []);
  assert.equal(R.save([mk({ id: 'k1', kind: 'daily' })]), true);
  assert.equal(R.load().items[0].id, 'k1');
  assert.equal(JSON.parse(store.get('szv-remind')).v, 1);
  store.set('szv-remind', '{not json');
  assert.deepEqual(R.load().items, []);
  assert.equal(R.upcoming(3, at(2026, 10, 19)).length, 0);
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(R.load().items, []);
  assert.equal(R.save([]), false);
  delete globalThis.localStorage;
});

test('export / import round trip and merge', () => {
  const a = mk({ id: 'a', title: 'A', kind: 'daily' }), b = mk({ id: 'b', title: 'B', kind: 'once', when: '2027-01-01T10:00' });
  const text = R.exportJSON([a, b]);
  const back = R.parseImport(text);
  assert.deepEqual(back.map((x) => x.id), ['a', 'b']);
  assert.equal(R.parseImport('nope'), null);
  assert.equal(R.parseImport('{"x":1}'), null);
  assert.equal(R.parseImport('[{"kind":"bad"}]'), null);
  assert.deepEqual(R.parseImport('[]'), []);
  const m = R.mergeItems([a], [{ ...a, title: 'A2' }, b]);
  assert.equal(m.added, 1); assert.equal(m.updated, 1);
  assert.equal(m.items.find((x) => x.id === 'a').title, 'A2');
});

test('describe gives plain sentences', () => {
  assert.equal(R.describe(mk({ kind: 'weekly', days: [5], time: '16:00' })), 'Every Fri at 4:00 PM');
  assert.equal(R.describe(mk({ kind: 'zman', zman: { key: 'candleLighting', offset: -18, days: [5] } })), '18 min before Candle lighting, every Fri');
  assert.equal(R.describe(mk({ kind: 'zman', zman: { key: 'sunset', offset: 0, days: null } })), 'At Shkiah, every day it applies');
  assert.match(R.describe(mk({ kind: 'hebrew', heb: { y: 5760, m: 10, d: 23, type: 'birthday' } })), /Hebrew birthday, 23 Teves/);
  assert.equal(R.describe(mk({ kind: 'yearly', greg: { m: 3, d: 4 } })), 'Every year on March 4');
  assert.equal(R.ordinalOf(22), '22nd'); assert.equal(R.ordinalOf(11), '11th'); assert.equal(R.ordinalOf(1), '1st');
});

test('icsFor: recurring items carry an RRULE and an alarm; one-offs are UTC', () => {
  const now = at(2026, 10, 19);
  const w = R.icsFor(mk({ kind: 'weekly', days: [5, 0], time: '16:00', title: 'Call, Mom; ok' }), now);
  assert.match(w, /RRULE:FREQ=WEEKLY;BYDAY=SU,FR/); assert.match(w, /BEGIN:VALARM/); assert.match(w, /SUMMARY:Call\\, Mom\\; ok/);
  assert.match(w, /DTSTART:20261023T160000\r\n/);
  const o = R.icsFor(mk({ kind: 'once', when: '2026-11-01T09:00' }), now);
  assert.match(o, /DTSTART:\d{8}T\d{6}Z/); assert.doesNotMatch(o, /RRULE/);
  assert.equal(R.icsFor(mk({ kind: 'once', when: '2026-10-01T09:00' }), now) === null, false);   // overdue but not done: still exportable
  assert.equal(R.icsFor(R.ackItem(mk({ kind: 'once', when: '2026-11-01T09:00' }), now), now), null);
});

console.log(`remind tests: ${passed} passed`);
