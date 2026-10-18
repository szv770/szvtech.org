// Run: node gematria/gematria.test.mjs
import * as G from './logic.js';
import { WORDS } from './words.js';
import { gematriya } from '../luach/logic.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('✗', m); } };
const eq = (a, b, m) => ok(a === b, `${m}: got ${a}, want ${b}`);

/* ---- Standard (hechrachi), the well-known values ---- */
const KNOWN = { 'אהבה': 13, 'אחד': 13, 'חי': 18, 'משיח': 358, 'נחש': 358, 'ברוך': 228, 'שלום': 376, 'תורה': 611, 'יהוה': 26, 'אלהים': 86, 'שדי': 314, 'אדני': 65, 'אהיה': 21, 'יה': 15,
  'חסד': 72, 'גבורה': 216, 'תפארת': 1081, 'נצח': 148, 'הוד': 15, 'יסוד': 80, 'מלכות': 496, 'כתר': 620, 'חכמה': 73, 'בינה': 67, 'דעת': 474, 'אבא': 4, 'אמא': 42, 'דוד': 14, 'משה': 345,
  'אברהם': 248, 'יצחק': 208, 'יעקב': 182, 'ישראל': 541, 'שבת': 702, 'אמת': 441, 'עשו': 376, 'חבד': 14, 'ליובאוויטש': 380, 'לב': 32, 'טוב': 17, 'אור': 207, 'רז': 207, 'שמע': 410, 'ברכה': 227 };
for (const [w, v] of Object.entries(KNOWN)) eq(G.valueOf(w), v, `standard ${w}`);

/* ---- input hygiene: nikud, trope, spaces, geresh, final letters, presentation forms ---- */
eq(G.valueOf('שָׁלוֹם'), 376, 'nikud ignored');
eq(G.valueOf('בְּרֵאשִׁית'), 913, 'nikud on בראשית');
eq(G.valueOf('בְּרֵאשִׁ֖ית'), 913, 'trope ignored');
eq(G.valueOf('שלום עליכם'), 376 + 170, 'phrase');
eq(G.valueOf('שלום־עליכם'), 376 + 170, 'maqaf');
eq(G.valueOf('חב״ד'), 14, 'gershayim ignored');
eq(G.valueOf('ג׳'), 3, 'geresh ignored');
eq(G.valueOf("ח'ב\"ד"), 14, 'ascii quotes ignored');
eq(G.valueOf('שׁלום'), 376, 'presentation form shin-with-dot');
eq(G.valueOf('abc 123 !?'), 0, 'no Hebrew -> 0');
eq(G.valueOf(''), 0, 'empty');
eq(G.valueOf(null), 0, 'null');
eq(G.valueOf('ךםןףץ'), 20 + 40 + 50 + 80 + 90, 'finals in standard are regular values');
eq(G.lettersOf('ש לָ ום').length, 4, 'lettersOf');

/* ---- Gadol ---- */
eq(G.valueOf('ךםןףץ', 'gadol'), 500 + 600 + 700 + 800 + 900, 'gadol finals');
eq(G.valueOf('שלום', 'gadol'), 300 + 30 + 6 + 600, 'gadol שלום');
eq(G.valueOf('אבג', 'gadol'), 6, 'gadol no finals = standard');
eq(G.valueOf('ברוך', 'gadol'), 2 + 200 + 6 + 500, 'gadol ברוך');

/* ---- Siduri ---- */
eq(G.valueOf('אבגדהוזחטיכלמנסעפצקרשת', 'siduri'), 253, 'siduri sum 1..22');
eq(G.valueOf('ת', 'siduri'), 22, 'siduri ת');
eq(G.valueOf('ם', 'siduri'), 13, 'siduri final mem = mem');
eq(G.valueOf('ך', 'siduri'), 11, 'siduri final kaf = kaf');
eq(G.valueOf('שלום', 'siduri'), 21 + 12 + 6 + 13, 'siduri שלום');
eq(G.valueOf('יהוה', 'siduri'), 10 + 5 + 6 + 5, 'siduri יהוה');

/* ---- Katan ---- */
eq(G.valueOf('אבגדהוזחט', 'katan'), 45, 'katan 1-9');
eq(G.valueOf('יכלמנסעפצ', 'katan'), 45, 'katan tens -> 1-9');
eq(G.valueOf('קרשת', 'katan'), 1 + 2 + 3 + 4, 'katan hundreds');
eq(G.valueOf('משיח', 'katan'), 4 + 3 + 1 + 8, 'katan משיח');
eq(G.valueOf('שלום', 'katan'), 3 + 3 + 6 + 4, 'katan שלום');

/* ---- Atbash ---- */
const ab = G.compute('אבגדהוזחטיכלמנסעפצקרשת', 'atbash');
eq(ab.letters.map((l) => l.alt).join(''), 'תשרקצפעסנמלכיטחזוהדגבא', 'atbash mirror');
eq(G.valueOf('א', 'atbash'), 400, 'atbash א=ת');
eq(G.valueOf('ת', 'atbash'), 1, 'atbash ת=א');
eq(G.valueOf('בבל', 'atbash'), G.valueOf('ששך'), 'atbash בבל = ששך (Sheshach, Yirmiyahu 25:26)');
eq(G.compute('בבל', 'atbash').letters.map((l) => l.alt).join(''), 'ששכ', 'atbash בבל word');
eq(G.valueOf('ך', 'atbash'), G.valueOf('כ', 'atbash'), 'atbash final = regular');
eq(G.valueOf('יהוה', 'atbash'), 300, 'atbash יהוה = מצפץ = 300');
eq(G.compute('יהוה', 'atbash').letters.map((l) => l.alt).join(''), 'מצפצ', 'atbash יהוה word');

/* ---- Kadmi ---- */
eq(G.valueOf('א', 'kadmi'), 1, 'kadmi א');
eq(G.valueOf('ב', 'kadmi'), 3, 'kadmi ב');
eq(G.valueOf('ג', 'kadmi'), 6, 'kadmi ג');
eq(G.valueOf('י', 'kadmi'), 55, 'kadmi י');
eq(G.valueOf('כ', 'kadmi'), 210, 'kadmi כ');
eq(G.valueOf('ך', 'kadmi'), 210, 'kadmi ך');
eq(G.valueOf('אבג', 'kadmi'), 10, 'kadmi אבג');

/* ---- Perati ---- */
eq(G.valueOf('א', 'perati'), 1, 'perati א');
eq(G.valueOf('ב', 'perati'), 4, 'perati ב');
eq(G.valueOf('י', 'perati'), 100, 'perati י');
eq(G.valueOf('ת', 'perati'), 160000, 'perati ת');
eq(G.valueOf('חי', 'perati'), 64 + 100, 'perati חי');
eq(G.valueOf('אחד', 'perati'), 1 + 64 + 16, 'perati אחד');

/* ---- Milui (Mah convention) ---- */
const NAMES = { 'א': 111, 'ב': 412, 'ג': 83, 'ד': 434, 'ה': 6, 'ו': 13, 'ז': 67, 'ח': 418, 'ט': 419, 'י': 20, 'כ': 100, 'ל': 74, 'מ': 80, 'נ': 106, 'ס': 120, 'ע': 130, 'פ': 81, 'צ': 104, 'ק': 186, 'ר': 510, 'ש': 360, 'ת': 406 };
for (const [l, v] of Object.entries(NAMES)) eq(G.valueOf(l, 'milui'), v, `milui ${l}`);
eq(G.valueOf('יהוה', 'milui'), 45, 'milui יהוה = 45 (מה)');
eq(G.valueOf('ך', 'milui'), 100, 'milui final kaf');
eq(G.compute('א', 'milui').letters[0].alt, 'אלף', 'milui spelling shown');

/* ---- compute() shape ---- */
const r = G.compute('שלום עליכם');
eq(r.total, 546, 'compute total');
eq(r.words.length, 2, 'two words');
eq(r.words[0].total, 376, 'word 1');
eq(r.words[1].total, 170, 'word 2');
eq(r.letters.length, 9, 'nine letters');
eq(G.equation(G.compute('שלום')), '300 + 30 + 6 + 40 = 376', 'equation');
ok(G.breakdownText('שלום').includes('376'), 'breakdown text');
eq(G.equation(G.compute('abc')), '', 'empty equation');

/* ---- number -> Hebrew letters ---- */
const N = (n, o) => G.numToHeb(n, o);
eq(N(5787), 'ה׳תשפ״ז', '5787');
eq(N(5787, { thousands: false }), 'תשפ״ז', '5787 without thousands');
eq(N(5787, { punct: false }), 'התשפז', '5787 plain');
eq(N(15), 'ט״ו', '15 = ט״ו');
eq(N(16), 'ט״ז', '16 = ט״ז');
eq(N(115), 'קט״ו', '115');
eq(N(116), 'קט״ז', '116');
eq(N(1), 'א׳', '1');
eq(N(10), 'י׳', '10');
eq(N(18), 'י״ח', '18');
eq(N(26), 'כ״ו', '26');
eq(N(400), 'ת׳', '400');
eq(N(500), 'ת״ק', '500');
eq(N(900), 'תת״ק', '900');
eq(N(999), 'תתקצ״ט', '999');
eq(N(1000), 'א׳', '1000 = א׳');
eq(N(5000), 'ה׳', '5000');
eq(N(5015), 'ה׳ט״ו', '5015');
eq(N(15000), 'טו׳', '15000');
eq(N(0), '', '0 invalid');
eq(N(-5), '', 'negative invalid');
eq(N(1000000), '', 'too big');
eq(N('abc'), '', 'NaN invalid');
eq(N(1.9), 'א׳', 'floors');
for (const y of [5700, 5763, 5784, 5785, 5786, 5787, 5788, 5799, 5800, 5815, 5816, 5750, 5710]) eq(N(y, { thousands: false }), gematriya(y), `agrees with /luach/ gematriya(${y})`);
for (let n = 1; n < 1000; n++) eq(N(n, { thousands: false }), gematriya(n), `agrees with /luach/ gematriya(${n})`);

/* ---- Hebrew numeral -> number ---- */
const H = G.hebToNum;
eq(H('ה׳תשפ״ז'), 5787, 'parse ה׳תשפ״ז');
eq(H('תשפ״ז'), 787, 'parse תשפ״ז');
eq(H('תשפז'), 787, 'parse plain');
eq(H('ט״ו'), 15, 'parse ט״ו');
eq(H('ט״ז'), 16, 'parse ט״ז');
eq(H("ה'תשפ\"ז"), 5787, 'parse ascii quotes');
eq(H('טו׳'), 15, 'parse 15 with trailing geresh (just 15)');
eq(H('abc'), null, 'parse latin = null');
eq(H(''), null, 'parse empty = null');
eq(H('ש ל ו ם'), 376, 'parse spaces ignored');
eq(H('ה׳'), 5, 'lone geresh');
for (const n of [1, 5, 15, 16, 18, 26, 99, 100, 115, 358, 613, 787, 999, 1000, 1234, 5000, 5015, 5787, 5799, 10000, 15000, 123456]) eq(H(N(n)), n === 15000 ? 15 : n === 5000 ? 5 : n === 1000 ? 1 : n === 10000 ? 10 : n, `round trip ${n}`);
for (let n = 1; n < 1000; n++) eq(H(N(n)), n, `round trip ${n}`);

/* ---- the curated words list ---- */
const seen = new Map();
for (const [he, en] of WORDS) {
  ok(typeof he === 'string' && typeof en === 'string' && en.length > 0, `entry shape ${he}`);
  ok(/^[א-ת ׳]+$/.test(he), `${he}: only Hebrew letters and spaces`);
  const k = G.lettersOf(he).join('');
  ok(!seen.has(k), `duplicate entry ${he}`);
  seen.set(k, he);
  ok(G.valueOf(he) > 0, `${he} has a value`);
  // finals only at the end of a word
  for (const w of he.split(' ')) ok(!/[ךםןףץ]./.test(w), `${he}: final letter inside a word`);
  ok(/[ךםןףץ]$/.test(he.split(' ').pop()) || !/[כמנפצ]$/.test(he.split(' ').pop()), `${he}: word should end in a final letter`);
}
ok(WORDS.length >= 300, `at least 300 entries (${WORDS.length})`);
// spot checks: the data reads right and the maths is right
const V = (w) => G.valueOf(w);
eq(V('יהוה'), 26, 'list: יהוה'); eq(V('בראשית'), 913, 'list: בראשית'); eq(V('ירושלים'), 596, 'list: ירושלים');
eq(V('חנוכה'), 8 + 50 + 6 + 20 + 5, 'list: חנוכה');
ok(V('אהבה') === V('אחד'), 'אהבה = אחד (13)'); ok(V('משיח') === V('נחש'), 'משיח = נחש (358)');
ok(V('עשו') === V('שלום'), 'עשו = שלום (376)'); ok(V('חיים') === 68, 'חיים = 68'); ok(V('לחיים') === 98, 'לחיים = 98');
ok(V('אור') === V('רז'), 'אור = רז (207)');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
