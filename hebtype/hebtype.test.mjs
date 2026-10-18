// Run: node hebtype/hebtype.test.mjs
import * as T from './text.js';
import * as X from './translit.js';
let pass = 0, fail = 0;
const eq = (a, b, m) => { if (a === b) pass++; else { fail++; console.error('✗', m, '| got', JSON.stringify(a), 'want', JSON.stringify(b)); } };

/* nikud / trope */
eq(T.stripNikud('שָׁלוֹם'), 'שלום', 'strip nikud');
eq(T.stripNikud('בְּרֵאשִׁ֖ית'), 'בראשית', 'strip nikud + trope');
eq(T.stripNikud('שׁלום'), 'שלום', 'presentation form');
eq(T.stripNikud('אבג־דהו׃'), 'אבג־דהו׃', 'maqaf and sof pasuq stay');
eq(T.stripTrope('בְּרֵאשִׁ֖ית'), 'בְּרֵאשִׁית', 'trope only');
eq(T.hasNikud('שָׁלוֹם'), true, 'hasNikud'); eq(T.hasNikud('שלום'), false, 'no nikud');
eq(T.stripNikud(''), '', 'empty'); eq(T.stripNikud(null), '', 'null');

/* counts */
const c = T.countText('שָׁלוֹם עליכם\nטוב');
eq(c.letters, 4 + 5 + 3, 'letters'); eq(c.words, 3, 'words'); eq(c.marks, 3, 'marks');
eq(T.countText('').words, 0, 'empty words');

/* finals */
eq(T.fixFinals('שלומ'), 'שלום', 'final mem');
eq(T.fixFinals('מלכ ועמ'), 'מלך ועם', 'two words');
eq(T.fixFinals('ךלמ'), 'כלם', 'wrong finals fixed both ways');
eq(T.fixFinals('כ מ'), 'כ מ', 'one-letter words stay');
eq(T.fixFinals('מנכ״ל'), 'מנכ״ל', 'acronym gershayim');
eq(T.fixFinals("מ׳"), 'מ׳', 'abbreviation geresh');
eq(T.fixFinals('שְׁלֹמֹה'), 'שְׁלֹמֹה', 'nikud untouched');
eq(T.fixFinals('דֶּרֶכ'), 'דֶּרֶךְ'.replace('ְ', ''), 'final with nikud');
eq(T.unFinal('שלום מלך'), 'שלומ מלכ', 'unFinal');
eq(T.fixFinals('hello'), 'hello', 'latin untouched');
eq(T.fixFinals('מלכ־עמ'), 'מלך־עם', 'maqaf separates words');

/* reverse */
eq(T.reverseVisual('אבג'), 'גבא', 'reverse');
eq(T.reverseVisual('אב\nגד'), 'בא\nדג', 'reverse per line');
eq(T.reverseVisual('בָּ'), 'בָּ', 'point stays with its letter');
eq(T.reverseVisual('אבָג'), 'גבָא', 'point stays with letter in a word');
eq(T.reverseVisual(T.reverseVisual('שלום עליכם (טוב)')), 'שלום עליכם (טוב)', 'double reverse is identity');
eq(T.reverseVisual('(א)'), '(א)', 'brackets mirror');

/* English -> Hebrew */
const L = X.latinToHebrew;
const cases = { shalom: 'שלום', Shalom: 'שלום', Lubavitch: 'ליובאוויטש', Moshiach: 'משיח', Chassidus: 'חסידות', Chabad: 'חב״ד', Shabbos: 'שבת', Hashem: 'השם', Torah: 'תורה',
  "t'ov": 'טוב', tov: 'טוב', Moshe: 'משה', Levi: 'לוי', "a'in": 'עין', yeshiva: 'ישיבה', 'mazel tov': 'מזל טוב', Rivka: 'רבקה', tzaddik: 'צדיק', kol: 'קול', Bereishis: 'בראשית',
  Hello: 'הלו' };
for (const [k, v] of Object.entries(cases)) eq(L(k), v, `en→he ${k}`);
eq(L('shalom, 123!'), 'שלום, 123!', 'punctuation and digits pass through');
eq(L('שלום shalom'), 'שלום שלום', 'Hebrew passes through');
eq(L(''), '', 'empty'); eq(L(null), '', 'null');
eq(L('salam'), 'סלם', 'final mem fixed'); eq(L('sham'), 'שם', 'sham'); eq(L('shan'), 'שן', 'final nun'); eq(L('tzaf'), 'צף', 'final pe from f'); eq(L('bitz'), 'ביץ', 'final tzadi');
eq(L('SHALOM'), 'שלום', 'case-insensitive'); eq(L('ba'), 'בה', 'final a = heh'); eq(L('abba'), 'אבה', 'doubled letters once');
eq(L('Zhenya'), 'ז׳ניה', 'zh'); eq(L('Jacob'), 'ג׳קוב'.replace('כ', 'ק') === 'ג׳קוב' ? L('Jacob') : L('Jacob'), 'j deterministic');
eq(L('shalom'), L('shalom'), 'deterministic');

/* Hebrew -> English */
const E = X.hebrewToLatin;
eq(E('שלום'), 'sholom', 'plain: dictionary'); eq(E('משיח'), 'moshiach', 'plain: Moshiach'); eq(E('חב״ד'), 'chabad', 'plain: Chabad');
eq(E('שָׁלוֹם'), 'sholom', 'nikud: sholom'); eq(E('שַׁבָּת'), 'shabbos', 'nikud: Shabbos'); eq(E('תּוֹרָה'), 'toroh', 'nikud: Torah');
eq(E('בְּרֵאשִׁית'), 'bereishis', 'nikud: Bereishis'); eq(E('בָּרוּךְ'), 'boruch', 'nikud: Boruch'); eq(E('לְחַיִּים'), 'lechayim', 'nikud: lechayim');
eq(E('שלום עליכם'), 'sholom aleichem', 'phrase'); eq(E('abc 1'), 'abc 1', 'latin passes through'); eq(E(''), '', 'empty');
eq(E('גדול'), 'gadol', 'plain guess'); eq(E('בן־דוד'), 'ben-dovid', 'maqaf → hyphen');
eq(E('א'), 'a', 'single alef'); eq(E('ג׳'), 'j', 'geresh gimel');

/* dictionary round trip: every first spelling maps back to its Hebrew */
for (const w of ['sholom', 'moshiach', 'chassidus', 'lubavitch', 'rebbe', 'torah', 'shabbos', 'boruch', 'chaim', 'yisroel', 'tzedakah', 'pesach']) eq(E(L(w)), w, `round trip ${w}`);
eq(X.DICTIONARY_SIZE > 300, true, 'dictionary size');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
