// Tests for /luach date logic:  node luach/_luach.test.mjs
// Expected anniversaries / Daf Yomi values were cross-checked against hebcal.com.
import assert from 'node:assert/strict';
import * as L from './logic.js';
import { chabadDaysOn, CHABAD_DAYS, STUDY } from './data.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; } catch (e) { console.error('FAIL', name); throw e; }
};
const H = (y, m, d) => ({ y, m, d });
const g = (h) => L.absToYMD(L.hebrewToAbs(h.y, h.m, h.d));

// ---------- conversion vs. the ICU Hebrew calendar ----------
const ICU_MONTH = { Tishri: 7, Heshvan: 8, Kislev: 9, Tevet: 10, Shevat: 11, 'Adar I': 12, Adar: 12, 'Adar II': 13, Nisan: 1, Iyar: 2, Sivan: 3, Tamuz: 4, Av: 5, Elul: 6 };
const icu = new Intl.DateTimeFormat('en-u-ca-hebrew', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
// ICU's Hebrew calendar is wrong for 5806-5807 (it gives 5806 a 30-day Cheshvan);
// those years are checked against hebcal.com below instead. Outside them, this
// module also matched @hebcal/core day-for-day for 1800-2240 when written.
test('absToHebrew matches ICU for every day 1900-2100', () => {
  let n = 0;
  for (let abs = L.gregToAbs(1900, 1, 1), end = L.gregToAbs(2100, 12, 31); abs <= end; abs++) {
    const p = Object.fromEntries(icu.formatToParts(new Date((abs - 719163) * 86400000)).map((x) => [x.type, x.value]));
    const want = H(+p.year, ICU_MONTH[p.month], +p.day);
    const got = L.absToHebrew(abs);
    if (want.y === 5806 || want.y === 5807) continue;
    if (got.y !== want.y || got.m !== want.m || got.d !== want.d) assert.deepEqual(got, want, `abs ${abs} ${L.absToYMD(abs)}`);
    if (L.hebrewToAbs(got.y, got.m, got.d) !== abs) assert.fail(`round trip ${abs}`);
    n++;
  }
  assert.ok(n > 72000);
});

test('known dates', () => {
  assert.deepEqual(L.absToHebrew(L.ymdToAbs('2026-10-11')), H(5787, 7, 30));
  assert.equal(g(H(5787, 7, 1)), '2026-09-12');      // Rosh Hashanah 5787
  assert.equal(g(H(5662, 1, 11)), '1902-04-18');     // the Rebbe's birthday
  assert.equal(g(H(5754, 4, 3)), '1994-06-12');      // Gimmel Tammuz
  assert.equal(L.weekday(L.ymdToAbs('2026-10-11')), 0);
  assert.deepEqual(L.absToHebrew(L.ymdToAbs('2045-11-10')), H(5806, 9, 1));   // hebcal.com (ICU says 30 Cheshvan)
  assert.equal(L.daysInYear(5806), 384);
});

test('leap years and month lengths', () => {
  assert.equal(L.isLeapYear(5784), true);
  assert.equal(L.isLeapYear(5785), false);
  assert.equal(L.isLeapYear(5787), true);
  assert.equal(L.daysInMonth(L.ADAR_I, 5787), 30);   // Adar I has 30 days
  assert.equal(L.daysInMonth(L.ADAR_I, 5786), 29);   // plain Adar has 29
  assert.equal(L.daysInMonth(L.ADAR_II, 5787), 29);
  assert.equal(L.monthName(12, 5787), 'Adar I');
  assert.equal(L.monthName(12, 5786), 'Adar');
  assert.equal(L.monthName(13, 5787), 'Adar II');
  assert.deepEqual(L.monthsOfYear(5786).map((x) => x.m), [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(L.monthsOfYear(5787).map((x) => x.m), [7, 8, 9, 10, 11, 12, 13, 1, 2, 3, 4, 5, 6]);
  assert.equal(L.validHebrew(5786, 13, 1), false);  // no Adar II in a regular year
  assert.equal(L.validHebrew(5787, 13, 29), true);
  assert.equal(L.validHebrew(5786, 8, 30), false);  // short Cheshvan in 5786
  assert.equal(L.validHebrew(5787, 8, 30), true);
});

test('gematriya', () => {
  assert.equal(L.gematriya(1), 'א׳');
  assert.equal(L.gematriya(15), 'ט״ו');
  assert.equal(L.gematriya(16), 'ט״ז');
  assert.equal(L.gematriya(30), 'ל׳');
  assert.equal(L.gematriya(5787), 'תשפ״ז');
  assert.equal(L.gematriya(5775), 'תשע״ה');
  assert.equal(L.hebrewDateHe(H(5787, 13, 14)), 'י״ד אדר ב׳ תשפ״ז');
});

// ---------- anniversaries (expected values from hebcal.com/yahrzeit) ----------
test('yahrzeit: Adar of a regular year -> Adar I in a leap year', () => {
  const death = L.absToHebrew(L.ymdToAbs('2023-03-03')); // 10 Adar 5783
  assert.deepEqual(death, H(5783, 12, 10));
  const occ = L.nextOccurrences('yahrzeit', death, L.ymdToAbs('2026-01-01'), 4);
  assert.deepEqual(occ.map((o) => o.ymd), ['2026-02-27', '2027-02-17', '2028-03-08', '2029-02-25']);
  assert.equal(occ[1].h.m, 12); // Adar I 5787
  assert.equal(occ[1].eveYmd, '2027-02-16');
});
test('yahrzeit: Adar II -> Adar in regular years, Adar II in leap years', () => {
  const death = L.absToHebrew(L.ymdToAbs('2024-03-15')); // 5 Adar II 5784
  assert.deepEqual(death, H(5784, 13, 5));
  const occ = L.nextOccurrences('yahrzeit', death, L.ymdToAbs('2026-01-01'), 4);
  assert.deepEqual(occ.map((o) => o.ymd), ['2026-02-22', '2027-03-14', '2028-03-03', '2029-02-20']);
  assert.deepEqual(occ.map((o) => o.h.m), [12, 13, 12, 12]);
});
test('yahrzeit: 30 Adar I -> 30 Shevat in regular years', () => {
  const death = H(5784, 12, 30);
  assert.equal(g(death), '2024-03-10');
  const occ = L.nextOccurrences('yahrzeit', death, L.ymdToAbs('2026-01-01'), 4);
  assert.deepEqual(occ.map((o) => o.ymd), ['2026-02-17', '2027-03-09', '2028-02-27', '2029-02-15']);
  assert.deepEqual(occ[0].h, H(5786, 11, 30));
});
test('yahrzeit: 30 Cheshvan, first anniversary without the 30th', () => {
  const death = H(5783, 8, 30); // 5784 has a short Cheshvan
  const occ = L.nextOccurrences('yahrzeit', death, L.ymdToAbs('2025-11-01'), 5);
  assert.deepEqual(occ.map((o) => o.ymd), ['2025-11-20', '2026-11-10', '2027-11-30', '2028-11-18', '2029-11-07']);
  assert.deepEqual(occ.map((o) => `${o.h.d}/${o.h.m}`), ['29/8', '30/8', '30/8', '29/8', '29/8']);
});
test('yahrzeit: 30 Cheshvan, first anniversary with the 30th', () => {
  const death = H(5787, 8, 30); // 5788 has a long Cheshvan
  const occ = L.nextOccurrences('yahrzeit', death, L.ymdToAbs('2026-11-11'), 5);
  assert.deepEqual(occ.map((o) => o.ymd), ['2027-11-30', '2028-11-19', '2029-11-08', '2030-11-26', '2031-11-16']);
  assert.deepEqual(occ[1].h, H(5789, 9, 1));
});
test('yahrzeit: 30 Kislev', () => {
  const death = H(5785, 9, 30);
  const occ = L.nextOccurrences('yahrzeit', death, L.ymdToAbs('2025-01-01'), 5);
  assert.deepEqual(occ.map((o) => o.ymd), ['2025-12-20', '2026-12-10', '2027-12-30', '2028-12-18', '2029-12-07']);
  assert.deepEqual(occ[4].h, H(5790, 10, 1));
});
test('yahrzeit is never in the year of death', () => {
  assert.equal(L.yahrzeitIn(H(5787, 7, 10), 5787), null);
  const occ = L.nextOccurrences('yahrzeit', H(5787, 7, 10), L.ymdToAbs('2026-09-01'), 1);
  assert.equal(occ[0].hy, 5788);
});

test('birthday: Adar of a regular year -> Adar II in a leap year (bar mitzvah rule)', () => {
  const born = H(5783, 12, 7);
  assert.equal(g(born), '2023-02-28');
  const occ = L.nextOccurrences('birthday', born, L.ymdToAbs('2026-01-01'), 4);
  assert.deepEqual(occ.map((o) => o.ymd), ['2026-02-24', '2027-03-16', '2028-03-05', '2029-02-22']);
  assert.deepEqual(occ.map((o) => o.h.m), [12, 13, 12, 12]);
});
test('birthday: Adar I of a leap year stays in Adar I', () => {
  assert.deepEqual(L.birthdayIn(H(5784, 12, 15), 5787), H(5787, 12, 15));
  assert.deepEqual(L.birthdayIn(H(5784, 12, 15), 5785), H(5785, 12, 15));
  assert.deepEqual(L.birthdayIn(H(5784, 12, 30), 5785), H(5785, 1, 1)); // 30 Adar I -> 1 Nissan
});
test('birthday: 30 Cheshvan -> 1 Kislev in short years', () => {
  const occ = L.nextOccurrences('birthday', H(5783, 8, 30), L.ymdToAbs('2025-11-01'), 5);
  assert.deepEqual(occ.map((o) => o.ymd), ['2025-11-21', '2026-11-10', '2027-11-30', '2028-11-19', '2029-11-08']);
});
test('birthday counts the original year itself', () => {
  const occ = L.nextOccurrences('birthday', H(5787, 8, 30), L.ymdToAbs('2026-11-01'), 1);
  assert.equal(occ[0].ymd, '2026-11-10');
});

// ---------- learning ----------
test('Daf Yomi (hebcal.com values)', () => {
  const daf = (s) => { const d = L.dafYomi(L.ymdToAbs(s)); return `${d.masechta} ${d.daf}`; };
  assert.equal(daf('2020-01-05'), 'Berachos 2');
  assert.equal(daf('2026-10-11'), 'Bechoros 23');
  assert.equal(daf('2025-03-01'), 'Sanhedrin 74');
  assert.equal(daf('2024-02-14'), 'Bava Kamma 104');
  assert.equal(daf('2027-03-12'), 'Meilah 22');
  assert.equal(daf('2027-03-13'), 'Kinnim 23');
  assert.equal(daf('2027-03-15'), 'Kinnim 25');
  assert.equal(daf('2027-03-16'), 'Tamid 26');
  assert.equal(daf('2027-03-24'), 'Middos 34');
  assert.equal(daf('2027-03-27'), 'Middos 37');
  assert.equal(daf('2027-03-28'), 'Niddah 2');
  assert.equal(daf('2027-06-06'), 'Niddah 72');
  assert.equal(daf('2027-06-08'), 'Berachos 2'); // cycle 15
  assert.equal(L.dafYomi(L.ymdToAbs('2027-06-08')).cycle, 15);
});
test('Tehillim monthly cycle', () => {
  assert.equal(L.tehillimFor(1), '1–9');
  assert.equal(L.tehillimFor(25), '119:1–96');
  assert.equal(L.tehillimFor(29, 30), '140–144');
  assert.equal(L.tehillimFor(29, 29), '140–150');
  assert.equal(L.tehillimFor(30), '145–150');
});

test('Omer', () => {
  assert.equal(L.omerDay(H(5787, 1, 15)), 0);
  assert.equal(L.omerDay(H(5787, 1, 16)), 1);
  assert.equal(L.omerDay(H(5787, 2, 18)), 33);   // Lag BaOmer
  assert.equal(L.omerDay(H(5787, 3, 5)), 49);
  assert.equal(L.omerDay(H(5787, 3, 6)), 0);
  assert.equal(L.omerSentence(1), 'Today is one day of the Omer.');
  assert.equal(L.omerSentence(7), 'Today is seven days, which is one week, of the Omer.');
  assert.equal(L.omerSentence(23), 'Today is twenty-three days, which are three weeks and two days, of the Omer.');
  assert.equal(L.omerSentence(8), 'Today is eight days, which are one week and one day, of the Omer.');
  assert.equal(L.omerSentence(49), 'Today is forty-nine days, which are seven weeks, of the Omer.');
});

// ---------- streaks ----------
test('study streak', () => {
  const req = ['a', 'b'];
  const done = { '2026-10-08': ['a', 'b'], '2026-10-09': ['b', 'a'], '2026-10-10': ['a', 'b'], '2026-10-11': ['a'] };
  assert.deepEqual(L.streakOf(done, '2026-10-11', req), { streak: 3, todayDone: false, best: 3 });
  done['2026-10-11'].push('b');
  assert.deepEqual(L.streakOf(done, '2026-10-11', req), { streak: 4, todayDone: true, best: 4 });
  assert.equal(L.streakOf(done, '2026-10-13', req).streak, 0);          // a day was missed
  assert.equal(L.streakOf(done, '2026-10-13', req).best, 4);
  assert.equal(L.streakOf({}, '2026-10-11', []).streak, 0);
  const pruned = L.pruneDone({ ...done, '2020-01-01': ['a'], bogus: ['a'] }, '2026-10-11');
  assert.deepEqual(Object.keys(pruned).sort(), ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
});

// ---------- grids ----------
test('month ranges and stepping', () => {
  const r = L.monthRange('heb', 5787, 12); // Adar I 5787
  assert.equal(r.end - r.start + 1, 30);
  assert.deepEqual(L.stepMonth('heb', 5787, 12, 1), { y: 5787, m: 13 });
  assert.deepEqual(L.stepMonth('heb', 5787, 13, 1), { y: 5787, m: 1 });
  assert.deepEqual(L.stepMonth('heb', 5786, 11, 1), { y: 5786, m: 12 });
  assert.deepEqual(L.stepMonth('heb', 5786, 12, 1), { y: 5786, m: 1 });  // no Adar II
  assert.deepEqual(L.stepMonth('heb', 5787, 1, -1), { y: 5787, m: 13 });
  assert.deepEqual(L.stepMonth('heb', 5786, 6, 1), { y: 5787, m: 7 });   // Elul -> Tishrei
  assert.deepEqual(L.stepMonth('heb', 5787, 7, -1), { y: 5786, m: 6 });
  assert.deepEqual(L.stepMonth('greg', 2026, 12, 1), { y: 2027, m: 1 });
  assert.deepEqual(L.stepMonth('greg', 2026, 1, -1), { y: 2025, m: 12 });
  const gr = L.monthRange('greg', 2028, 2);
  assert.equal(gr.end - gr.start + 1, 29);
});

test('parseYMD validation', () => {
  assert.equal(L.parseYMD('2026-02-30'), null);
  assert.equal(L.parseYMD('nope'), null);
  assert.deepEqual(L.parseYMD('0099-03-01'), { y: 99, m: 3, d: 1 });
});

test('Chabad days data', () => {
  assert.equal(chabadDaysOn(9, 19)[0].title, 'Yud-Tes Kislev');
  assert.equal(chabadDaysOn(1, 11)[0].title, 'Yud-Alef Nissan');
  assert.equal(chabadDaysOn(8, 1).length, 0);
  for (const [m, d] of CHABAD_DAYS) assert.ok(m >= 1 && m <= 11 && d >= 1 && d <= 29);
  const tdate = '10/11/2026';
  assert.equal(STUDY.find((s) => s.id === 'rambam').url(tdate, 1), 'https://www.chabad.org/dailystudy/rambam.asp?tdate=10/11/2026&rambamChapters=1');
});

console.log(`luach: ${passed} tests passed`);
