// Tests for tehillim/logic.js. Run: node tehillim/_tehillim.test.mjs
import * as T from './logic.js';

let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) { pass++; console.log('  ok  ', name); } else { fail++; console.log('  FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('monthly table');
const EXPECT = ['', '1–9', '10–17', '18–22', '23–28', '29–34', '35–38', '39–43', '44–48', '49–54', '55–59', '60–65', '66–68', '69–71', '72–76',
  '77–78', '79–82', '83–87', '88–89', '90–96', '97–103', '104–105', '106–107', '108–112', '113–118', '119:1–96', '119:97–176', '120–134', '135–139', '140–144', '145–150'];
const flat = (d, len) => T.monthlyUnits(d, len).map((u) => u.ps);
const all = []; for (let d = 1; d <= 30; d++) for (const u of T.monthlyUnits(d, 30)) all.push(u);
const whole = all.filter((u) => !u.from).map((u) => u.ps);
check('covers all 150 chapters (119 as two halves)', whole.length === 149 && all.length === 151, { n: whole.length, all: all.length });
check('chapters in order, no gaps', whole.every((p, i) => p === (i < 118 ? i + 1 : i + 2)), whole.slice(115, 122));
check('119 halves are 1–96 and 97–176', eq(T.monthlyUnits(25).map((u) => [u.from, u.to]), [[1, 96]]) && eq(T.monthlyUnits(26).map((u) => [u.from, u.to]), [[97, 176]]));
check('day labels match the standard table', Array.from({ length: 30 }, (_, i) => T.rangeLabel(T.monthlyUnits(i + 1, 30))).every((l, i) => l.replace('Psalms ', '').replace('Psalm ', '') === EXPECT[i + 1]),
  Array.from({ length: 30 }, (_, i) => T.rangeLabel(T.monthlyUnits(i + 1, 30))));

console.log('29-day month');
check('day 29 of a 30-day month = 140–144', eq(flat(29, 30), [140, 141, 142, 143, 144]));
check('day 29 of a 29-day month = 140–150', eq(flat(29, 29), [140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150]));
check('day 30 still 145–150 (30-day month)', eq(flat(30, 30), [145, 146, 147, 148, 149, 150]));
check('day 28 unaffected in a 29-day month', eq(flat(28, 29), [135, 136, 137, 138, 139]));
check('range label for merged day', T.rangeLabel(T.monthlyUnits(29, 29)) === 'Psalms 140–150');
check('out of range days are empty', T.monthlyUnits(0).length === 0 && T.monthlyUnits(31).length === 0);

console.log('weekly');
const wk = []; for (let d = 0; d < 7; d++) wk.push(T.rangeLabel(T.weeklyUnits(d)));
check('weekly table', eq(wk, ['Psalms 1–29', 'Psalms 30–50', 'Psalms 51–72', 'Psalms 73–89', 'Psalms 90–106', 'Psalms 107–119', 'Psalms 120–150']), wk);
check('weekly covers 150', [0, 1, 2, 3, 4, 5, 6].reduce((n, d) => n + T.weeklyUnits(d).length, 0) === 150);
check('weekday wraps', T.weeklyUnits(7)[0].ps === 1 && T.weeklyUnits(-1)[0].ps === 120);

console.log('labels');
check('hebNum values', [T.hebNum(1), T.hebNum(15), T.hebNum(16), T.hebNum(119), T.hebNum(150)].join(' ') === 'א׳ ט״ו ט״ז קי״ט ק״נ', [T.hebNum(1), T.hebNum(15), T.hebNum(16), T.hebNum(119), T.hebNum(150)]);
check('unitHe', T.unitHe({ ps: 23 }) === 'תהילים כ״ג');
check('unit keys', T.unitKey({ ps: 5 }) === '5' && T.unitKey({ ps: 119, from: 1, to: 96 }) === '119:1-96');

console.log('text cleaning');
check('removes parashah markers and br', T.cleanVerse('אבג&nbsp;<span class="mam-spi-pe">{פ}</span><br>') === 'אבג');
check('keeps the paseq', T.cleanVerse('א&thinsp;<b>׀</b> ב') === 'א ׀ ב');
check('stripTrop keeps nikud, drops taamim', T.stripTrop('יְהֹוָ֥ה') === 'יְהֹוָה');
const v = T.cleanVerse('<i>x</i>');
check('strips tags', v === 'x');
check('parseSefaria ok', T.parseSefaria({ versions: [{ text: ['א', 'ב'] }] }, 3).length === 2);
check('parseSefaria rejects empty/garbage', T.parseSefaria({}, 3) === null && T.parseSefaria({ versions: [{ text: [] }] }, 3) === null && T.parseSefaria({ versions: [{ text: ['', 'x'] }] }, 3) === null);
check('parseSefaria 119 needs 176 verses', T.parseSefaria({ versions: [{ text: ['a', 'b'] }] }, 119) === null);
check('unitVerses slices 119 half', T.unitVerses({ ps: 119, from: 97, to: 176 }, Array.from({ length: 176 }, (_, i) => 'v' + (i + 1))).length === 80);

console.log('progress & streak');
const us = T.monthlyUnits(7, 30);
check('doneCount/isComplete', T.doneCount(us, ['39', '40']) === 2 && !T.isComplete(us, ['39']) && T.isComplete(us, ['39', '40', '41', '42', '43']));
check('firstOpen', T.firstOpen(us, ['39', '40']) === 2 && T.firstOpen(us, ['39', '40', '41', '42', '43']) === -1);
const full = { '2026-10-16': 1, '2026-10-17': 1, '2026-10-18': 1, '2026-10-10': 1, '2026-10-11': 1, '2026-10-12': 1, '2026-10-13': 1 };
check('streak ending today', T.streakOf(full, '2026-10-18').streak === 3 && T.streakOf(full, '2026-10-18').todayDone);
check('streak survives while today still open', T.streakOf({ '2026-10-16': 1, '2026-10-17': 1 }, '2026-10-18').streak === 2);
check('streak breaks after a missed day', T.streakOf({ '2026-10-15': 1 }, '2026-10-18').streak === 0);
check('best streak', T.streakOf(full, '2026-10-18').best === 4);
check('streak across month/year end', T.streakOf({ '2026-12-31': 1, '2027-01-01': 1, '2027-01-02': 1 }, '2027-01-02').streak === 3);
check('streak across leap day', T.streakOf({ '2028-02-28': 1, '2028-02-29': 1, '2028-03-01': 1 }, '2028-03-01').streak === 3);
check('shiftYMD', T.shiftYMD('2026-03-01', -1) === '2026-02-28' && T.shiftYMD('2026-12-31', 1) === '2027-01-01');
check('parseYMD rejects bad dates', T.parseYMD('2026-02-30') === null && T.parseYMD('x') === null);
check('prune drops old', !('2026-01-01' in T.prune({ '2026-01-01': 1, '2026-10-17': 1 }, '2026-10-18', 90)) && '2026-10-17' in T.prune({ '2026-01-01': 1, '2026-10-17': 1 }, '2026-10-18', 90));
check('planKey', T.planKey('month', 7) === 'm7' && T.planKey('week', 2) === 'w2' && T.planKey('any', 0) === 'x');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
