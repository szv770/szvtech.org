/* Transliteration, deterministic and documented (see the ⓘ sheet in /hebtype/).
   English -> Hebrew letters: a dictionary of common Chabad words first, then phonetic rules.
   Hebrew -> English: Ashkenazi / Chabad flavoured (kamatz = o, tav without dagesh = s, ch = ח). */
import { fixFinals, stripNikud, hasNikud } from './text.js';

/* [Hebrew, ...latin spellings] — the FIRST latin spelling is what Hebrew→English prints. */
const D = [
  ['שלום', 'sholom', 'shalom', 'shalom'], ['משיח', 'moshiach', 'mashiach', 'moshiah', 'mashiah', 'moshiakh'],
  ['חסידות', 'chassidus', 'chasidus', 'chasidut', 'chassidut', 'hasidut', 'hasidus'], ['חסיד', 'chassid', 'chasid', 'hasid'],
  ['חסידים', 'chassidim', 'chasidim', 'hasidim'], ['חב״ד', 'chabad', 'habad'], ['ליובאוויטש', 'lubavitch', 'lubavich', 'lubavitz'],
  ['ליובאוויטשער', 'lubavitcher'], ['רבי', 'rebbe', 'rabbi', 'rebbi'], ['תורה', 'torah', 'toyrah', 'toyra', 'tora'],
  ['שבת', 'shabbos', 'shabbat', 'shabat', 'shabbath', 'shabos'], ['השם', 'hashem'], ['ברוך', 'boruch', 'baruch', 'baruch', 'barukh'],
  ['מצוה', 'mitzvah', 'mitzva', 'mitzvo', 'mitzvoh'], ['מצוות', 'mitzvos', 'mitzvot'], ['צדקה', 'tzedakah', 'tzedoko', 'tzedaka', 'tzedokoh'],
  ['תפילין', 'tefillin', 'tfillin'], ['תפילה', 'tefillah', 'tefilah', 'tefila', 'tfila', 'tfilah'], ['ישיבה', 'yeshiva', 'yeshivah', 'yeshivoh'],
  ['בחור', 'bochur', 'bachur', 'bocher'], ['שליח', 'shliach', 'shaliach', 'shliah'], ['שליחות', 'shlichus', 'shlichut', 'shlihut'],
  ['ניגון', 'niggun', 'nigun', 'nigan'], ['קידוש', 'kiddush', 'kidush'], ['הבדלה', 'havdalah', 'havdala', 'havdoloh'],
  ['חלה', 'challah', 'chalah', 'chalo'], ['כשר', 'kosher', 'kasher'], ['ברכה', 'brocha', 'bracha', 'brachah', 'berachah', 'berocho'],
  ['ברית', 'bris', 'brit'], ['מזל', 'mazel', 'mazal'], ['טוב', 'tov', 'tuv'], ['לחיים', 'lechaim', "l'chaim", 'lchaim', 'lechayim'],
  ['חיים', 'chaim', 'chayim', 'chayyim', 'haim'], ['חי', 'chai', 'chay', 'hai'], ['אמן', 'amen', 'omein'],
  ['משה', 'moshe', 'moishe', 'mosheh'], ['אברהם', 'avraham', 'abraham', 'avrohom', 'avraam'], ['יצחק', 'yitzchak', 'yitzchok', 'isaac', 'yitzhak'],
  ['יעקב', 'yaakov', 'yakov', 'yankel', 'jacob', 'yaacov'], ['יוסף', 'yosef', 'yoseph', 'joseph'], ['דוד', 'dovid', 'david', 'david'],
  ['שרה', 'sarah', 'sara', 'soro'], ['רבקה', 'rivkah', 'rivka', 'rebecca', 'rivkoh'], ['רחל', 'rachel', 'rochel'], ['לאה', 'leah', 'leya', 'leyah'],
  ['מנחם', 'menachem', 'menachem'], ['מנדל', 'mendel', 'mendl'], ['שניאור', 'shneur', 'schneur'], ['זלמן', 'zalman'],
  ['שניאורסון', 'schneerson', 'shneerson'], ['דובער', 'dovber', 'ber'], ['צבי', 'tzvi', 'zvi', 'hirsh'], ['יהודה', 'yehuda', 'yehudah', 'judah'],
  ['שמואל', 'shmuel', 'samuel'], ['אהרן', 'aharon', 'aaron', 'ahron'], ['אליהו', 'eliyahu', 'eliahu', 'elijah'], ['יהושע', 'yehoshua', 'joshua'],
  ['אסתר', 'esther', 'ester'], ['רות', 'ruth', 'rus'], ['מרדכי', 'mordechai', 'mordecai', 'mordche'], ['בנימין', 'binyomin', 'binyamin', 'benjamin'],
  ['שמעון', 'shimon', 'simon'], ['ראובן', 'reuven', 'ruvein', 'ruben'], ['לוי', 'levi', 'levy'], ['דן', 'dan'], ['אפרים', 'efraim', 'ephraim'], ['מנשה', 'menashe', 'menasheh'],
  ['ישראל', 'yisroel', 'yisrael', 'israel'], ['יהודי', 'yehudi', 'yid'], ['אלהים', 'elokim', 'elohim', 'elokeinu'], ['אדני', 'adonai', 'adoshem'],
  ['תניא', 'tanya'], ['לקוטי', 'likutei', 'likkutei'], ['שיחות', 'sichos', 'sichot', 'sichas'], ['אגרות', 'igros', 'igrot'],
  ['פסח', 'pesach', 'pesah'], ['סוכות', 'sukkos', 'sukkot', 'succos', 'succot'], ['שבועות', 'shavuos', 'shavuot'], ['חנוכה', 'chanukah', 'hanukkah', 'chanuka', 'hanukah'],
  ['פורים', 'purim'], ['שמחת', 'simchas', 'simchat'], ['שמחה', 'simcha', 'simchah', 'simchoh'], ['ראש', 'rosh'], ['השנה', 'hashanah', 'hashana', 'hashono'],
  ['יום', 'yom', 'yuhm'], ['כיפור', 'kippur', 'kipur'], ['אהבה', 'ahavah', 'ahava', 'ahavoh'], ['אהבת', 'ahavas', 'ahavat'],
  ['ארץ', 'eretz', 'aretz'], ['עולם', 'olam', 'oylom'], ['אור', 'or', 'ohr'], ['אמת', 'emes', 'emet', 'emmes'], ['חסד', 'chesed', 'hesed', 'chessed'],
  ['גבורה', 'gevurah', 'gevura'], ['תפארת', 'tiferes', 'tiferet', 'tifferes'], ['נצח', 'netzach', 'netzah'], ['הוד', 'hod'], ['יסוד', 'yesod'],
  ['מלכות', 'malchus', 'malchut', 'malkhut'], ['חכמה', 'chochmah', 'chochma', 'chokhmah', 'chachma'], ['בינה', 'binah', 'bina'], ['דעת', 'daas', 'daat'],
  ['כתר', 'keser', 'keter'], ['אין', 'ein', 'ayin'], ['סוף', 'sof', 'sauf'], ['נפש', 'nefesh'], ['נשמה', 'neshama', 'neshamah', 'neshomo'], ['רוח', 'ruach', 'ruah'],
  ['גאולה', 'geulah', 'geula', 'geulo'], ['תשובה', 'teshuvah', 'teshuva', 'tshuvah', 'teshuvoh'], ['אמונה', 'emunah', 'emuna', 'emunoh'], ['ביטחון', 'bitachon', 'bitahon', 'bitochon'],
  ['תלמוד', 'talmud'], ['משנה', 'mishnah', 'mishna', 'mishneh'], ['גמרא', 'gemara', 'gemoro'], ['חומש', 'chumash', 'humash'], ['תהילים', 'tehillim', 'tehilim', 'tehillem'],
  ['סידור', 'siddur', 'sidur'], ['ספר', 'sefer', 'seifer'], ['כולל', 'kollel', 'kolel'], ['חברותא', 'chavrusa', 'chavruta', 'chavrusah'], ['בית', 'beis', 'beit', 'bayis', 'bayit'],
  ['מדרש', 'medrash', 'midrash'], ['חיל', 'chayil', 'hayil'], ['אשת', 'eshes', 'eshet'], ['מלך', 'melech', 'melekh'], ['אדמו״ר', 'admor', "admo'r"],
  ['עליכם', 'aleichem', 'aleichem', 'alaichem'], ['סלח', 'selach', 'slach'], ['בראשית', 'bereishis', 'bereshit', 'bereishit', 'breishis'], ['שמות', 'shemos', 'shemot'],
  ['ויקרא', 'vayikra'], ['במדבר', 'bamidbar'], ['דברים', 'devarim', 'devorim'], ['אדון', 'adon'], ['עולמים', 'olamim', 'oylomim'], ['בן', 'ben', 'bein'], ['בת', 'bas', 'bat'],
  ['בר', 'bar'], ['מצה', 'matzah', 'matzoh', 'matza'], ['מקווה', 'mikveh', 'mikvah', 'mikva'], ['פרשה', 'parshah', 'parsha', 'parshoh'], ['קדוש', 'kadosh'], ['קדושה', 'kedusha', 'kedushah'],
  ['אלול', 'elul'], ['תשרי', 'tishrei', 'tishrey'], ['ניסן', 'nissan', 'nisan'], ['אייר', 'iyar'], ['תמוז', 'tammuz', 'tamuz'], ['כסלו', 'kislev'], ['שבט', 'shevat', 'shvat'], ['אדר', 'adar'],
];
const LAT2HE = new Map(), HE2LAT = new Map();
for (const [he, ...lats] of D) {
  lats.forEach((l) => { if (!LAT2HE.has(l)) LAT2HE.set(l, he); });
  const k = stripNikud(he).replace(/[׳״'"]/g, '');
  if (!HE2LAT.has(k)) HE2LAT.set(k, lats[0]);
}
export const DICTIONARY_SIZE = LAT2HE.size;

/* ---------------- English -> Hebrew ---------------- */
const V = 'aeiou';
const CONS = { b: 'ב', d: 'ד', f: 'פ', g: 'ג', h: 'ה', k: 'כ', l: 'ל', m: 'מ', n: 'נ', p: 'פ', q: 'ק', r: 'ר', s: 'ס', t: 'ת', w: 'ו', x: 'קס', z: 'ז', y: 'י', j: "ג׳" };
const GERESH = '׳';

function wordToHebrew(raw) {
  const clean = raw.replace(/[’]/g, "'");
  const low = clean.toLowerCase().replace(/^'+|'+$/g, '');
  if (LAT2HE.has(low)) return LAT2HE.get(low);
  if (LAT2HE.has(low.replace(/'/g, ''))) return LAT2HE.get(low.replace(/'/g, ''));
  const s = low;
  let out = '';
  const n = s.length;
  const at = (i) => s[i] || '';
  for (let i = 0; i < n;) {
    const c = s[i], two = s.substr(i, 2), three = s.substr(i, 3);
    const start = i === 0, end = (k) => i + k >= n;
    if (c === "'") { i++; continue; }
    // apostrophe-marked letters: t' = ט, k' = ק, a' / e' / o' / i' / u' = ע
    if (at(i + 1) === "'") {
      if (c === 't') { out += 'ט'; i += 2; continue; }
      if (c === 'k') { out += 'ק'; i += 2; continue; }
      if (c === 'h') { out += 'ח'; i += 2; continue; }
      if (V.includes(c)) { out += 'ע'; i += 2; continue; }
    }
    if (three === 'tch') { out += 'טש'; i += 3; continue; }
    if (three === 'sch') { out += 'ש'; i += 3; continue; }
    if (two === 'tz' || two === 'ts') { out += 'צ'; i += 2; continue; }
    if (two === 'sh') { out += 'ש'; i += 2; continue; }
    if (two === 'ch') { out += 'ח'; i += 2; continue; }
    if (two === 'kh') { out += 'כ'; i += 2; continue; }
    if (two === 'zh') { out += 'ז' + GERESH; i += 2; continue; }
    if (two === 'th') { out += 'ת'; i += 2; continue; }
    if (two === 'ph') { out += 'פ'; i += 2; continue; }
    if (two === 'ck') { out += 'ק'; i += 2; continue; }
    if (two === 'dj') { out += 'ג' + GERESH; i += 2; continue; }
    if (two === 'ee' || two === 'ie') { out += 'י'; i += 2; continue; }
    if (two === 'ai' || two === 'ay' || two === 'ei' || two === 'ey') { out += (start ? 'א' : '') + 'י'; i += 2; continue; }
    if (two === 'oi' || two === 'oy') { out += (start ? 'א' : '') + 'וי'; i += 2; continue; }
    if (two === 'oo' || two === 'ou') { out += start ? 'או' : 'ו'; i += 2; continue; }
    if (c === 'a') { out += start ? 'א' : (end(1) ? 'ה' : ''); if (end(1) && at(i + 1) === '') { /* final a */ } i++; if (at(i) === 'h' && i === n - 1) i++; continue; }
    if (c === 'e') { out += start ? 'א' : (end(1) ? 'ה' : ''); i++; continue; }
    if (c === 'i') { out += start ? 'אי' : 'י'; i++; continue; }
    if (c === 'o') { out += start ? 'או' : 'ו'; i++; continue; }
    if (c === 'u') { out += start ? 'או' : 'ו'; i++; continue; }
    if (c === 'c') { out += 'eiy'.includes(at(i + 1)) && at(i + 1) ? 'ס' : 'ק'; i++; continue; }
    if (c === 'v') { out += start ? 'ו' : 'ב'; i++; while (at(i) === 'v') i++; continue; }
    if (CONS[c]) { out += CONS[c]; i++; while (at(i) === c && c !== 'x') i++; continue; }
    i++; // digits etc. cannot appear here (word regex is letters only)
  }
  return fixFinals(out);
}

/** English letters -> Hebrew letters. Anything that is not a Latin word is passed through. */
export function latinToHebrew(text) {
  return String(text == null ? '' : text).replace(/[A-Za-z][A-Za-z'’]*/g, (w) => wordToHebrew(w));
}
export const hasLatin = (s) => /[A-Za-z]/.test(String(s || ''));

/* ---------------- Hebrew -> English ---------------- */
const K = { 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ז': 'z', 'ח': 'ch', 'ט': 't', 'י': 'y', 'כ': 'ch', 'ך': 'ch', 'ל': 'l', 'מ': 'm', 'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's', 'פ': 'f', 'ף': 'f', 'צ': 'tz', 'ץ': 'tz', 'ק': 'k', 'ר': 'r', 'ש': 'sh', 'ת': 't', 'ו': 'v', 'א': '', 'ע': '' };
const VOWEL = { 'ָ': 'o', 'ַ': 'a', 'ֵ': 'ei', 'ֶ': 'e', 'ִ': 'i', 'ֹ': 'o', 'ֺ': 'o', 'ֻ': 'u', 'ֲ': 'a', 'ֱ': 'e', 'ֳ': 'o', 'ׇ': 'o' };

function clustersOf(word) {
  const out = [];
  for (const ch of Array.from(word.normalize('NFD'))) {
    if (/[א-ת]/.test(ch)) out.push({ c: ch, m: '' });
    else if (out.length && /[ְ-ׇ׳]/.test(ch)) out[out.length - 1].m += ch;
  }
  return out;
}

function pointedWord(word) {
  const cl = clustersOf(word);
  let out = '';
  for (let i = 0; i < cl.length; i++) {
    const { c, m } = cl[i], prev = cl[i - 1], next = cl[i + 1];
    const dag = m.includes('ּ'), rafe = m.includes('ֿ'), geresh = m.includes('׳');
    let vow = '';
    for (const ch of m) if (VOWEL[ch]) { vow = VOWEL[ch]; break; }
    const sheva = m.includes('ְ');
    // vav as a vowel
    if (c === 'ו') {
      if (m.includes('ֹ') && !vow.includes('x')) { out += 'o'; continue; }           // cholam male
      if (dag && !vow) { out += 'u'; continue; }                                         // shuruk
    }
    // yud after chirik / tzeirei / segol is only a vowel letter
    if (c === 'י' && !m.replace(/[ּׁׂ]/g, '') && prev && /[ִֵֶ]/.test(prev.m) && !(prev.m.includes('ְ'))) {
      continue;
    }
    // silent final heh
    const lastC = i === cl.length - 1;
    let cons;
    if (c === 'ב') cons = dag ? 'b' : 'v';
    else if (c === 'כ' || c === 'ך') cons = dag ? 'k' : 'ch';
    else if (c === 'פ' || c === 'ף') cons = dag ? 'p' : 'f';
    else if (c === 'ת') cons = dag ? 't' : 's';
    else if (c === 'ש') cons = m.includes('ׂ') ? 's' : 'sh';
    else if (c === 'ו') cons = 'v';
    else if (c === 'ג' && geresh) cons = 'j';
    else if (c === 'ז' && geresh) cons = 'zh';
    else if (c === 'צ' && geresh) cons = 'tch';
    else if (c === 'ח' && geresh) cons = 'kh';
    else cons = K[c];
    if (c === 'ה' && lastC && !dag && vow) cons = 'h';
    if (c === 'ה' && lastC && !vow && prev) cons = 'h';
    if (sheva && !vow) vow = i === 0 ? 'e' : '';
    void rafe; void next;
    out += cons + vow;
  }
  return out;
}

const isCons = (c) => !'aeiou'.includes(c);
function plainWord(word) {
  const cl = clustersOf(word);
  const parts = []; // { t, v: isVowelish }
  cl.forEach(({ c, m }, i) => {
    const geresh = m.includes('׳'), last = i === cl.length - 1;
    if (c === 'א' || c === 'ע') { if (i === 0) parts.push({ t: 'a', v: true }); return; }
    if (c === 'ו') { parts.push(i === 0 ? { t: 'v', v: false } : { t: 'o', v: true }); return; }
    if (c === 'י') { parts.push(i === 0 ? { t: 'y', v: false } : { t: 'i', v: true }); return; }
    if (c === 'ה' && last && i > 0) { parts.push({ t: parts[parts.length - 1] && !parts[parts.length - 1].v ? 'ah' : 'h', v: false }); return; }
    let t = K[c];
    if (c === 'ג' && geresh) t = 'j'; else if (c === 'ז' && geresh) t = 'zh'; else if (c === 'צ' && geresh) t = 'tch'; else if (c === 'ח' && geresh) t = 'kh';
    else if (c === 'פ') t = 'p'; else if (c === 'כ') t = 'ch'; else if (c === 'ב') t = 'b';
    if (c === 'ף') t = 'f';
    parts.push({ t, v: false });
  });
  let out = '';
  parts.forEach((p, i) => {
    const prev = parts[i - 1];
    if (prev && !prev.v && !p.v && !(p.t === 'ah')) out += 'a';
    out += p.t;
  });
  return out;
}

/** Hebrew letters -> English letters. With niqqud it is exact; without, a vowel-guessing best effort. */
export function hebrewToLatin(text) {
  return String(text == null ? '' : text).replace(/[א-ת֑-ׇ׳״יִ-ﭏ]+/g, (run) => {
    const plain = stripNikud(run).replace(/[׳״]/g, (c) => c);
    const key = plain.replace(/[׳״'"]/g, '');
    if (!hasNikud(run)) {
      if (HE2LAT.has(key)) return HE2LAT.get(key);
      // an acronym with gershayim reads as its letters: חב״ד handled above, others fall through
      return plainWord(run.replace(/[״"]/g, ''));
    }
    return pointedWord(run.replace(/[״"]/g, ''));
  }).replace(/־/g, '-').replace(/׃/g, '.');
}
