// node zmanim/data.test.mjs — unit tests for /zmanim/data.js (no network).
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The site imports modules by absolute URL path ("/time/cities.js"); map those to the repo.
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (/^\\/(time|zmanim)\\//.test(spec)) return next(${JSON.stringify(pathToFileURL(ROOT).href)} + spec.replace(/\\?.*$/, ''), ctx);
    return next(spec, ctx);
  }`));

globalThis.localStorage = (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i], get length() { return m.size; } }; })();

const D = await import('/zmanim/data.js');
const Z = await import('/time/zmanim.js');
D.setEngine(Z);
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };

const crown = D.normalizeLoc('crown-heights');
const jlm = D.normalizeLoc('jerusalem');
const tzfat = D.normalizeLoc('tzfat');

t('cleanSub', () => {
  assert.equal(D.cleanSub('Alos Hashachar', 'Dawn (Alot Hashachar)'), 'Dawn');
  assert.equal(D.cleanSub('Mincha Ketanah', 'Mincha Ketanah (“Small Mincha”)'), 'Small Mincha');
  assert.equal(D.cleanSub('Sof Zman Shema', 'Latest Shema'), 'Latest Shema');
  assert.equal(D.cleanSub('Fast begins', 'Fast Begins'), '');
});

t('hebText from Chabad and Intl', () => {
  assert.equal(D.hebText(D.parseYMD('2026-10-16'), 'Cheshvan 05, 5787'), '5 Cheshvan 5787');
  assert.equal(D.hebText(D.parseYMD('2026-10-11'), ''), '30 Tishrei 5787');
});

t('special days', () => {
  const names = (s, il) => D.specialDays(D.parseYMD(s), il).map((x) => x.name);
  assert.ok(names('2026-10-11').includes('Rosh Chodesh Cheshvan'));
  assert.ok(names('2026-10-17').includes('Shabbos'));
  assert.ok(names('2026-10-16').includes('Erev Shabbos'));
  assert.ok(names('2026-12-20').includes('Asarah B\'Teves'));
  assert.deepEqual(names('2027-04-23', false).filter((x) => /Pesach/.test(x)), ['Pesach']);
  assert.ok(names('2027-04-22', false).includes('Pesach'));
  assert.ok(names('2027-04-23', true).includes('Chol Hamoed Pesach'));
  assert.ok(names('2026-12-05').some((x) => /Chanukah · day 1/.test(x)), names('2026-12-05').join());
});

t('apiDay: Shabbos ends, nextDay, after candle', () => {
  const day = D.apiDay({ date: '2027-04-22', hebrewDate: 'Nissan 15, 5787', shaahZmanit: '68:38', items: [
    { key: 'sunrise', label: 'Netz', chabadLabel: 'Sunrise (Hanetz Hachamah)', minutes: 367 },
    { key: 'sunset', label: 'Shkiah', chabadLabel: 'Sunset (Shkiah)', minutes: 1182 },
    { key: 'candleLighting', label: 'Candle lighting (not before)', chabadLabel: 'Candle Lighting after', minutes: 1226, after: true },
    { key: 'chatzosLayla', label: 'Chatzos Halaylah', chabadLabel: 'Midnight (Chatzot HaLailah)', minutes: 53, nextDay: true },
  ] }, crown);
  const c = day.items.find((i) => i.key === 'candleLighting');
  assert.equal(c.after, true);
  assert.equal(c.label, 'Candle lighting');
  assert.equal(day.items[day.items.length - 1].key, 'chatzosLayla');
  assert.equal(D.hmText(day.items[day.items.length - 1].at, crown.tz), '12:53 AM');
  assert.equal(new Date(day.items.find((i) => i.key === 'sunset').at).toISOString(), '2027-04-22T23:42:00.000Z');
  assert.equal(day.source, 'chabad');
});

t('calcDay Tzfat Shabbos: ends replaces tzeis, chatzos halaylah present', () => {
  const sat = D.calcDay(tzfat, '2026-10-17');
  const keys = sat.items.map((i) => i.key);
  assert.ok(keys.includes('shabbosEnds'));
  assert.ok(!keys.includes('tzeis'));
  assert.equal(keys[keys.length - 1], 'chatzosLayla');
  const fri = D.calcDay(tzfat, '2026-10-16');
  const cl = fri.items.find((i) => i.key === 'candleLighting');
  const ss = fri.items.find((i) => i.key === 'sunset');
  assert.ok(cl && ss && Math.round((ss.at - cl.at) / 60000) === 18, 'candle lighting 18 min before sunset');
});

t('calcDay vs Chabad Jerusalem within 1 min', () => {
  const d = D.calcDay(jlm, '2026-10-16');
  const want = { alos: '5:26 AM', sunrise: '6:43 AM', sofZmanShma: '9:31 AM', chatzos: '12:24 PM', sunset: '6:06 PM', tzeis: '6:31 PM' };
  for (const [k, v] of Object.entries(want)) {
    const it = d.items.find((i) => i.key === k);
    const got = D.hmText(it.at, jlm.tz);
    const toMin = (s) => { const [h, m] = s.split(/[: ]/); return (+h % 12) * 60 + +m + (/PM/.test(s) ? 720 : 0); };
    assert.ok(Math.abs(toMin(got) - toMin(v)) <= 1, `${k}: ${got} vs ${v}`);
  }
});

t('nextItem prefers accented item on ties', () => {
  const items = [{ key: 'tzeis', at: 100 }, { key: 'fastEnds', at: 100 }, { key: 'chatzosLayla', at: 200 }];
  assert.equal(D.nextItem(items, 50).key, 'fastEnds');
  assert.equal(D.nextItem(items, 150).key, 'chatzosLayla');
  assert.equal(D.nextItem(items, 250), null);
});

t('locations from URL params', () => {
  assert.equal(D.locFromParams('?city=jerusalem').id, 'jerusalem');
  const z = D.locFromParams('?zip=90210');
  assert.equal(z.kind, 'zip'); assert.equal(z.tz, 'America/Los_Angeles');
  const c = D.locFromParams('?lat=32.96&lon=35.49&tz=Asia/Jerusalem&name=Here');
  assert.equal(c.kind, 'custom'); assert.equal(c.name, 'Here');
  assert.equal(D.locFromParams('?zip=abc'), null);
});

t('/time saved location + settings are honoured', () => {
  localStorage.setItem('szv-time-loc', JSON.stringify({ kind: 'city', id: 'tzfat' }));
  assert.equal(D.savedLoc().id, 'tzfat');
  localStorage.setItem('szv-time-shabbos-ends', '72');
  const sat = D.calcDay(tzfat, '2026-10-17');
  const se = sat.items.find((i) => i.key === 'shabbosEnds');
  const ss = sat.items.find((i) => i.key === 'sunset');
  assert.equal(Math.round((se.at - ss.at) / 60000), 72);
  localStorage.removeItem('szv-time-shabbos-ends');
});

console.log(`\n${n} tests passed`);
