import assert from 'node:assert/strict';
import { parseCents, centsToInput, pctOf, counted, totals, filterEntries, groupByMonth, periodSeries, civilBucket, toCSV, sanitize, DEFAULTS, validYMD, civilYears } from './logic.js';

assert.equal(parseCents('12.5'), 1250);
assert.equal(parseCents('$1,200'), 120000);
assert.equal(parseCents('0.07'), 7);
assert.equal(parseCents('.5'), 50);
assert.ok(Number.isNaN(parseCents('')));
assert.ok(Number.isNaN(parseCents('1.234')));
assert.ok(Number.isNaN(parseCents('abc')));
assert.equal(centsToInput(1250), '12.50');
assert.equal(centsToInput(1200), '12');
assert.equal(pctOf(10000, 10), 1000);
assert.equal(pctOf(12345, 10), 1235);       // rounds to nearest cent
assert.equal(pctOf(10000, 20), 2000);
assert.ok(validYMD('2026-02-28') && !validYMD('2026-02-30') && !validYMD('x'));

const mk = () => {
  const s = DEFAULTS();
  s.entries = [
    { id: 'a', t: 'i', amt: 100000, net: 80000, date: '2026-01-10', note: 'Paycheck', ts: 1 },
    { id: 'b', t: 'i', amt: 50000, date: '2026-02-05', note: 'Side job', ts: 2 },
    { id: 'c', t: 'g', amt: 5000, date: '2026-01-15', note: 'Shul', cat: 'shul', ts: 3 },
    { id: 'd', t: 'g', amt: 2500, date: '2026-02-20', note: 'Yeshiva dinner', cat: 'yeshiva', ts: 4 },
  ];
  return s;
};
let s = mk();
let t = totals(s);
assert.deepEqual([t.income, t.owed, t.given, t.left], [150000, 15000, 7500, 7500]);
assert.equal(t.progress, 0.5);
s.settings.basis = 'net';                     // entry b has no take-home, falls back to gross
assert.equal(counted(s.entries[0], 'net'), 80000);
assert.equal(counted(s.entries[1], 'net'), 50000);
t = totals(s);
assert.equal(t.income, 130000); assert.equal(t.owed, 13000); assert.equal(t.left, 5500);
s.settings.pct = 20; s.settings.basis = 'gross';
assert.equal(totals(s).owed, 30000);
s.entries.push({ id: 'e', t: 'g', amt: 99999999, date: '2026-03-01', ts: 5 });
assert.ok(totals(s).left < 0);                // ahead
assert.equal(totals(s).progress, 1);
assert.equal(totals({ settings: { pct: 10, basis: 'gross' }, entries: [] }).progress, 0);

s = mk();
assert.deepEqual(filterEntries(s.entries, { type: 'g' }).map((e) => e.id), ['d', 'c']);
assert.deepEqual(filterEntries(s.entries, { cat: 'shul' }).map((e) => e.id), ['c']);
assert.deepEqual(filterEntries(s.entries, { q: 'paycheck' }).map((e) => e.id), ['a']);
assert.deepEqual(filterEntries(s.entries, { q: '25.00' }).map((e) => e.id), ['d']);
const g = groupByMonth(filterEntries(s.entries), 'gross');
assert.deepEqual(g.map((x) => x.key), ['2026-02', '2026-01']);
assert.equal(g[0].income, 50000); assert.equal(g[0].given, 2500);
assert.deepEqual(civilYears(s.entries, 2027), [2027, 2026]);

const ps = periodSeries(s, 2026, civilBucket, 12);
assert.equal(ps.income, 150000); assert.equal(ps.given, 7500); assert.equal(ps.owed, 15000);
assert.equal(ps.series[0].given, 5000); assert.equal(ps.series[1].owed, 5000);
assert.equal(periodSeries(s, 2025, civilBucket, 12).income, 0);

const csv = toCSV(s);
assert.ok(csv.startsWith('Type,Date,Amount,Take-home,Category,Note,Currency'));
assert.ok(csv.includes('Income,2026-01-10,1000.00,800.00,,Paycheck,USD'));
s.entries.push({ id: 'z', t: 'g', amt: 100, date: '2026-04-01', note: '=HYPERLINK("x"),hi', cat: 'other', ts: 9 });
const csv2 = toCSV(s);
assert.ok(csv2.includes(`"'=HYPERLINK(""x""),hi"`));

const back = sanitize(JSON.parse(JSON.stringify(s)));
assert.equal(back.entries.length, 5);
assert.deepEqual(totals(back), totals(s));
assert.equal(sanitize({ nope: 1 }), null);
const dirty = sanitize({ settings: { pct: 9999, cur: 'XXX', basis: 'zzz' }, entries: [{ t: 'i', amt: 'x', date: '2026-01-01' }, { t: 'g', amt: 500, date: '2026-13-01' }, { t: 'g', amt: 500, date: '2026-01-01', note: '<b>x</b>', cat: 'bad' }] });
assert.equal(dirty.entries.length, 1); assert.equal(dirty.entries[0].cat, 'other');
assert.equal(dirty.settings.pct, 10); assert.equal(dirty.settings.cur, 'USD'); assert.equal(dirty.settings.basis, 'gross');
console.log('maaser tests ok');
