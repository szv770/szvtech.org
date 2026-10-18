import assert from 'node:assert/strict';
import { cell, ROWS, OPINIONS, SOURCES, row } from './data.js';
import { fraction, fmt, fromBase, toBase, howMany, parseNum, ML_PER_FLOZ } from './logic.js';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} !~ ${b}`);

// published base figures
assert.equal(cell('revis', 'naeh').v, 86.4);
assert.equal(cell('revis', 'chazon').v, 150);
assert.equal(cell('revis', 'chabad').v, 86);
assert.equal(cell('kebeitza', 'naeh').v, 54);
assert.equal(cell('kebeitza', 'chazon').v, 100);
assert.equal(cell('kezayis', 'naeh').v, 27);
assert.equal(cell('kezayis', 'chazon').v, 33.3);
assert.equal(cell('amah', 'naeh').v, 48);
assert.equal(cell('amah', 'chazon').v, 57.72);
assert.equal(cell('amah', 'moshe').v, 53.98);
assert.equal(cell('tefach', 'moshe').v, 9);
assert.equal(cell('etzba', 'chazon').v, 2.41);

// unverified cells stay empty (never invented)
assert.equal(cell('kebeitza', 'chabad'), null);
assert.equal(cell('kebeitza', 'moshe'), null);
assert.equal(cell('revis', 'moshe'), null);
assert.equal(cell('log', 'moshe'), null);
assert.equal(cell('amah', 'chabad'), null);
assert.equal(cell('mil', 'chabad'), null);

// derived by Talmudic ratios
near(cell('log', 'chazon').v, 600);
near(cell('kav', 'chazon').v, 2400);
near(cell('ephah', 'chazon').v, 43200);
near(cell('omer', 'chazon').v, 4320);
near(cell('log', 'naeh').v, 345.6);
assert.equal(cell('log', 'naeh').derived, true);
near(cell('mil', 'naeh').v, 96000);
near(cell('parsah', 'naeh').v, 384000);
near(cell('ris', 'naeh').v, 48 * 2000 * 2 / 15);
near(cell('mil', 'moshe').v, 107960);

// every row/opinion cell is sourced or derived, and sources exist
for (const r of ROWS) for (const o of OPINIONS) {
  const c = cell(r.id, o.id); if (!c) continue;
  assert.ok(c.v > 0);
  for (const s of c.src) assert.ok(SOURCES[s], `${r.id}/${o.id}: unknown source ${s}`);
  assert.ok(c.src.length > 0, `${r.id}/${o.id}: no source`);
}
assert.ok(row('revis'));

// unit conversions
near(fromBase('vol', 'floz', 86.4), 86.4 / ML_PER_FLOZ);
near(fromBase('vol', 'floz', 86.4), 2.92, 0.01);          // matches the published 2.92 fl oz
near(toBase('vol', 'cup', 1), 236.5882365);
near(fromBase('len', 'in', 48), 18.9, 0.01);               // Rav Chaim Naeh amah = 18.90 in
near(fromBase('len', 'in', 57.72), 22.72, 0.01);           // Chazon Ish amah = 22.72 in

// reverse converter + fractions
near(howMany(200, 150), 4 / 3);
assert.equal(fraction(4 / 3).text, '1⅓');
assert.equal(fraction(2).text, '2');
assert.equal(fraction(0.5).text, '½');
assert.equal(fraction(2.75).text, '2¾');
assert.equal(fraction(1.999).text, '2');
assert.equal(fraction(2.4567).decimal, true);
assert.equal(fmt(1234.5), '1,235');
assert.equal(fmt(86.4), '86.4');
assert.equal(fmt(2.918), '2.92');
assert.equal(parseNum('1,5'), 1.5);
assert.ok(Number.isNaN(parseNum('')));
console.log('shiurim tests ok');
