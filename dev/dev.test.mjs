// node dev/dev.test.mjs : tests for /dev page logic (logic.js) plus end-to-end checks of the lib helpers it wires together.
import assert from 'node:assert/strict';
import { TABS, TAB_IDS, routeFor, suggestions, pickTab, harmony, shades, readableOn, contrastGrade, fmtBytes, readingTime, esc, lineRows, clip } from './logic.js';
import { detect } from './lib/detect.js';
import { parseColor, toHex } from './lib/color.js';
import { diffText } from './lib/text.js';
import { hashHex } from './lib/hash.js';
import { signHmacJwt, verifyHmacJwt, decodeJwt } from './lib/jwt.js';

let n = 0;
const t = (name, fn) => Promise.resolve().then(fn).then(() => { n++; }, (e) => { console.error('FAIL', name); throw e; });

await t('tabs: unique ids, 11 of them', () => { assert.equal(new Set(TAB_IDS).size, TABS.length); assert.equal(TABS.length, 11); });

await t('routeFor maps every detect() tool to an existing tab', () => {
  for (const tool of ['jwt', 'ids', 'json', 'time', 'cron', 'color', 'url', 'html', 'base64', 'base', 'hash', 'regex', 'yaml', 'case']) {
    const r = routeFor(tool); assert.ok(r, tool); assert.ok(TAB_IDS.includes(r.tab), tool);
  }
  assert.equal(routeFor('nope'), null);
});

await t('smart paste: real samples land on the right tab', () => {
  const first = (s) => suggestions(detect(s))[0];
  assert.equal(first('{"a":1}').route.tab, 'json');
  assert.equal(first('1767225600').route.tab, 'time');
  assert.equal(first('*/5 * * * *').route.tab, 'cron');
  assert.equal(first('#8b5cf6').route.tab, 'color');
  assert.equal(first('0192f1e8-7c3a-7b4e-9d1f-2a6b8c0d4e5f').route.tab, 'ids');
  assert.equal(first('https://a.com/?q=1&r=2').route.tab, 'encode');
  assert.equal(first('d41d8cd98f00b204e9800998ecf8427e').route.tab, 'hash');
  assert.equal(first('0xff').route.tab, 'base');
  assert.equal(first('/a+b/gi').route.tab, 'regex');
  assert.equal(first('my_variable_name').route.tab, 'text');
  assert.deepEqual(suggestions(detect('   ')), []);
});

await t('smart paste: JWT first, and suggestions cap at 4', async () => {
  const tok = await signHmacJwt({ alg: 'HS256', typ: 'JWT' }, { sub: '1' }, 's');
  assert.equal(suggestions(detect(tok))[0].route.tab, 'jwt');
  assert.ok(suggestions(detect('hello world')).length <= 4);
});

await t('pickTab: hash beats saved beats default; junk ignored', () => {
  assert.equal(pickTab('#regex', 'json'), 'regex');
  assert.equal(pickTab('', 'json'), 'json');
  assert.equal(pickTab('#evil"><script>', 'also-bad'), 'encode');
  assert.equal(pickTab(null, null), TAB_IDS[0]);
});

await t('harmony: complement of red is cyan, first item is the input', () => {
  const h = harmony(parseColor('#ff0000'), 'complement');
  assert.deepEqual(h, ['#ff0000', '#00ffff']);
  assert.equal(harmony(parseColor('#336699'), 'triad').length, 3);
  assert.equal(harmony(parseColor('#336699'), 'tetrad').length, 4);
  assert.throws(() => harmony(parseColor('#fff'), 'nope'));
});

await t('shades: n valid hex, light to dark', () => {
  const s = shades(parseColor('#8b5cf6'), 9);
  assert.equal(s.length, 9);
  s.forEach((x) => assert.match(x, /^#[0-9a-f]{6}$/));
  const lum = (x) => { const c = parseColor(x); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
  for (let i = 1; i < s.length; i++) assert.ok(lum(s[i]) < lum(s[i - 1]), 'darker each step');
});

await t('readableOn + contrastGrade', () => {
  assert.equal(readableOn(parseColor('#000')), '#ffffff');
  assert.equal(readableOn(parseColor('#fff')), '#000000');
  assert.equal(contrastGrade(21), 'AAA'); assert.equal(contrastGrade(5), 'AA'); assert.equal(contrastGrade(3.2), 'AA Large'); assert.equal(contrastGrade(2), 'Fail');
});

await t('fmtBytes / readingTime / esc / clip', () => {
  assert.equal(fmtBytes(0), '0 B'); assert.equal(fmtBytes(1536), '1.5 KB'); assert.equal(fmtBytes(5 * 1024 * 1024), '5.0 MB'); assert.equal(fmtBytes(-1), '');
  assert.equal(readingTime(0), '0 min'); assert.equal(readingTime(50), '< 1 min'); assert.equal(readingTime(600), '3 min');
  assert.equal(esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.deepEqual(clip('abcdef', 3), { text: 'abc', clipped: 3 }); assert.equal(clip('ab', 3).clipped, 0);
});

await t('lineRows folds long unchanged runs and keeps context', () => {
  const a = Array.from({ length: 30 }, (_, i) => 'line ' + i).join('\n');
  const b = a.replace('line 15', 'LINE 15');
  const rows = lineRows(diffText(a, b, 'line').chunks, 2);
  const types = rows.map((r) => r.type);
  assert.deepEqual(types, ['gap', 'same', 'same', 'del', 'add', 'same', 'same', 'gap']);
  assert.equal(rows[0].n, 13); assert.equal(rows.at(-1).n, 12);
  // identical short text is shown whole; identical long text folds to one gap
  assert.equal(lineRows(diffText('a\nb', 'a\nb').chunks).length, 2);
  const same = lineRows(diffText(a, a).chunks);
  assert.deepEqual(same, [{ type: 'gap', text: '', n: 30 }]);
  assert.deepEqual(lineRows([]), []);
});

await t('wiring: hash, jwt verify round-trip, color hex', async () => {
  assert.equal(await hashHex('SHA-256', new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(await hashHex('MD5', new TextEncoder().encode('')), 'd41d8cd98f00b204e9800998ecf8427e');
  const tok = await signHmacJwt({ alg: 'HS256', typ: 'JWT' }, { sub: 'x', exp: 1 }, 'secret');
  assert.equal(await verifyHmacJwt(tok, 'secret'), true); assert.equal(await verifyHmacJwt(tok, 'nope'), false);
  assert.equal(decodeJwt(tok, 5000).status.expired, true);
  assert.equal(toHex(parseColor('rgb(255 0 128)')), '#ff0080');
});

console.log(`dev tests: ${n} passed`);
