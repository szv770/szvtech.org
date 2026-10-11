// Run: node convert/_convert.test.mjs
import * as U from './units.js';

let pass = 0, fail = 0;
const close = (a, b, rel = 1e-12) => a === b || Math.abs(a - b) <= Math.abs(b) * rel + 1e-15;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error('✗', msg); } }
function eq(a, b, msg) { ok(Object.is(a, b) || a === b, `${msg}: got ${a}, want ${b}`); }
function near(a, b, msg, rel) { ok(typeof a === 'number' && close(a, b, rel), `${msg}: got ${a}, want ${b}`); }
const cv = (c, f, t, v, o) => U.convert(c, f, t, v, o);
function q(text, want, msg = text) {
  const r = U.parse(text);
  if (!r.ok) { ok(false, `parse "${text}" failed (${r.reason})`); return r; }
  for (const k of Object.keys(want)) {
    const a = r[k], b = want[k];
    ok(typeof b === 'number' ? close(a, b, 1e-12) : a === b, `parse "${msg}" .${k}: got ${a}, want ${b}`);
  }
  return r;
}

/* ---------- length (exact definitions) ---------- */
eq(cv('length', 'in', 'm', 1), 0.0254, '1 in = 0.0254 m');
eq(cv('length', 'ft', 'in', 1), 12, '1 ft = 12 in');
eq(cv('length', 'mi', 'm', 1), 1609.344, '1 mi = 1609.344 m');
eq(cv('length', 'mi', 'ft', 1), 5280, '1 mi = 5280 ft');
eq(cv('length', 'yd', 'ft', 1), 3, '1 yd = 3 ft');
eq(cv('length', 'nmi', 'm', 1), 1852, '1 nmi = 1852 m');
eq(cv('length', 'in', 'cm', 71), 180.34, "5'11\" = 180.34 cm");
near(cv('length', 'km', 'mi', 42.195), 26.218757456454306, 'marathon in miles');
near(cv('length', 'ly', 'au', 1), 63241.07708426628, '1 ly in au', 1e-11);

/* ---------- mass ---------- */
eq(cv('mass', 'lb', 'kg', 1), 0.45359237, '1 lb = 0.45359237 kg');
eq(cv('mass', 'lb', 'oz', 1), 16, '1 lb = 16 oz');
eq(cv('mass', 'st', 'lb', 1), 14, '1 st = 14 lb');
eq(cv('mass', 'oz', 'g', 1), 28.349523125, '1 oz = 28.349523125 g');
eq(cv('mass', 'ston', 'lb', 1), 2000, 'short ton');
eq(cv('mass', 'ozt', 'g', 1), 31.1034768, 'troy ounce');
eq(cv('mass', 'ct', 'g', 5), 1, '5 ct = 1 g');
near(cv('mass', 'kg', 'lb', 100), 220.46226218487757, '100 kg in lb');

/* ---------- temperature (offsets, negatives) ---------- */
eq(cv('temp', 'c', 'f', 100), 212, 'boiling');
eq(cv('temp', 'c', 'f', 0), 32, 'freezing');
eq(cv('temp', 'c', 'f', -40), -40, '-40 °C = -40 °F');
eq(cv('temp', 'f', 'c', -40), -40, '-40 °F = -40 °C');
eq(cv('temp', 'k', 'c', 0), -273.15, 'absolute zero °C');
near(cv('temp', 'k', 'f', 0), -459.67, 'absolute zero °F');
eq(cv('temp', 'c', 'k', -273.15), 0, '-273.15 °C = 0 K');
near(cv('temp', 'f', 'c', 72), 22.2222222222222, '72 °F', 1e-13);
near(cv('temp', 'f', 'c', -459.67), -273.15, '-459.67 °F');
near(cv('temp', 'r', 'k', 491.67), 273.15, 'Rankine freezing');
near(cv('temp', 'c', 're', 100), 80, 'Réaumur boiling');
near(cv('temp', 'f', 'k', 98.6), 310.15, 'body temperature in K');

/* ---------- volume ---------- */
eq(cv('volume', 'usgal', 'l', 1), 3.785411784, 'US gallon');
eq(cv('volume', 'ukgal', 'l', 1), 4.54609, 'UK gallon');
eq(cv('volume', 'usgal', 'usfloz', 1), 128, '1 gal = 128 fl oz');
eq(cv('volume', 'uscup', 'ustbsp', 1), 16, '1 cup = 16 tbsp');
eq(cv('volume', 'ustbsp', 'ustsp', 1), 3, '1 tbsp = 3 tsp');
eq(cv('volume', 'ukpt', 'ukfloz', 1), 20, 'UK pint = 20 UK fl oz');
eq(cv('volume', 'usgal', 'in3', 1), 231, 'US gallon = 231 in³');
near(cv('volume', 'ft3', 'l', 1), 28.316846592, 'cubic foot');
eq(cv('volume', 'bbl', 'usgal', 1), 42, 'oil barrel');

/* ---------- area ---------- */
eq(cv('area', 'acre', 'm2', 1), 4046.8564224, 'acre');
eq(cv('area', 'mi2', 'acre', 1), 640, 'square mile = 640 acres');
eq(cv('area', 'ha', 'm2', 1), 10000, 'hectare');
eq(cv('area', 'ft2', 'in2', 1), 144, 'sq ft = 144 sq in');
near(cv('area', 'm2', 'ft2', 1), 10.763910416709722, 'm² in ft²');

/* ---------- speed ---------- */
near(cv('speed', 'kmh', 'mph', 100), 62.13711922373339, '100 km/h');
eq(cv('speed', 'mph', 'kmh', 60), 96.56064, '60 mph');
eq(cv('speed', 'ms', 'kmh', 10), 36, '10 m/s = 36 km/h');
eq(cv('speed', 'kn', 'kmh', 1), 1.852, '1 knot');

/* ---------- time ---------- */
eq(cv('time', 'h', 'min', 1.5), 90, '1.5 h');
eq(cv('time', 'd', 's', 1), 86400, 'day');
eq(cv('time', 'wk', 'h', 1), 168, 'week');
eq(cv('time', 'yr', 'd', 1), 365.2425, 'Gregorian year');

/* ---------- data (SI vs binary) ---------- */
eq(cv('data', 'B', 'bit', 1), 8, 'byte = 8 bits');
eq(cv('data', 'KiB', 'B', 1), 1024, 'KiB');
eq(cv('data', 'kB', 'B', 1), 1000, 'kB');
eq(cv('data', 'GiB', 'MiB', 1), 1024, 'GiB in MiB');
near(cv('data', 'GB', 'GiB', 1), 0.931322574615479, '1 GB in GiB');
eq(cv('data', 'TB', 'GB', 1), 1000, 'TB in GB');
eq(cv('data', 'Mbit', 'MB', 8), 1, '8 Mbit = 1 MB');
eq(cv('data', 'EiB', 'B', 1), 2 ** 60, 'EiB exact');

/* ---------- energy / power / pressure ---------- */
eq(cv('energy', 'kcal', 'kJ', 1), 4.184, 'kcal');
eq(cv('energy', 'kWh', 'MJ', 1), 3.6, 'kWh');
near(cv('energy', 'BTU', 'J', 1), 1055.05585262, 'BTU');
near(cv('energy', 'eV', 'J', 1), 1.602176634e-19, 'eV');
near(cv('power', 'hp', 'W', 1), 745.6998715822702, 'mechanical hp');
near(cv('power', 'PS', 'W', 1), 735.49875, 'metric hp');
eq(cv('pressure', 'atm', 'Pa', 1), 101325, 'atm');
near(cv('pressure', 'psi', 'Pa', 1), 6894.757293168361, 'psi');
near(cv('pressure', 'atm', 'psi', 1), 14.695948775513449, 'atm in psi');
eq(cv('pressure', 'bar', 'kPa', 1), 100, 'bar');
near(cv('pressure', 'atm', 'torr', 1), 760, 'atm = 760 Torr');

/* ---------- fuel economy (inverse!) ---------- */
near(cv('fuel', 'mpgus', 'l100', 30), 7.84048611111111, '30 mpg US → L/100km', 1e-12);
near(cv('fuel', 'l100', 'mpgus', 7.84048611111111), 30, 'round trip L/100km → mpg', 1e-12);
near(cv('fuel', 'mpgus', 'l100', 1), 235.2145833333333, '1 mpg US', 1e-12);
near(cv('fuel', 'mpguk', 'l100', 1), 282.4809363318221, '1 mpg UK', 1e-12);
near(cv('fuel', 'mpguk', 'mpgus', 1), 0.8326741846289889, 'mpg UK → US', 1e-12);
near(cv('fuel', 'l100', 'kml', 5), 20, '5 L/100km = 20 km/L');
ok(cv('fuel', 'l100', 'mpgus', 10) < cv('fuel', 'l100', 'mpgus', 5), 'higher L/100km means fewer mpg');
eq(cv('fuel', 'mpgus', 'l100', 0), Infinity, '0 mpg is infinite L/100km');
near(cv('fuel', 'gal100', 'mpgus', 4), 25, '4 gal/100 mi = 25 mpg');

/* ---------- cooking (density) ---------- */
eq(cv('cooking', 'uscup', 'g', 1, { ingredient: 'flour' }), 120, '1 cup flour');
eq(cv('cooking', 'uscup', 'g', 3.5, { ingredient: 'flour' }), 420, '3.5 cups flour');
eq(cv('cooking', 'uscup', 'g', 1, { ingredient: 'sugar' }), 200, '1 cup sugar');
near(cv('cooking', 'stick', 'g', 1, { ingredient: 'butter' }), 113.3980925, '1 stick of butter = ¼ lb');
eq(cv('cooking', 'stick', 'ustbsp', 1), 8, 'stick = 8 tbsp');
near(cv('cooking', 'uscup', 'g', 1, { ingredient: 'water' }), 236.5882365, 'cup of water');
near(cv('cooking', 'g', 'uscup', 500, { ingredient: 'flour' }), 4.16666666666667, '500 g flour in cups');
eq(cv('cooking', 'ustbsp', 'ustsp', 2), 6, 'tbsp → tsp ignores ingredient');
near(cv('cooking', 'oz', 'g', 4), 113.3980925, 'oz weight');

/* ---------- angle ---------- */
near(cv('angle', 'deg', 'rad', 180), Math.PI, '180° = π');
near(cv('angle', 'turn', 'deg', 1), 360, 'turn');
near(cv('angle', 'grad', 'deg', 100), 90, '100 gon');
near(cv('angle', 'deg', 'arcsec', 1), 3600, 'degree in arcseconds');

/* ---------- number bases ---------- */
eq(cv('base', 'b16', 'b10', '1F'), '31', 'hex 1F');
eq(cv('base', 'b10', 'b2', '255'), '11111111', '255 binary');
eq(cv('base', 'b2', 'b16', '0b1010_1111'), 'AF', 'binary with prefix and separators');
eq(cv('base', 'b10', 'b16', '-255'), '-FF', 'negative');
eq(cv('base', 'b36', 'b10', 'zz'), '1295', 'base 36');
eq(cv('base', 'b10', 'b3', '0'), '0', 'zero');
eq(cv('base', 'b10', 'b16', '18446744073709551615'), 'FFFFFFFFFFFFFFFF', '2^64-1 exact (BigInt)');
eq(cv('base', 'b2', 'b10', '102'), null, 'invalid binary digit');
eq(cv('base', 'b8', 'b10', '0o777'), '511', 'octal');
eq(U.groupDigits('11111111', 2, ' '), '1111 1111', 'digit grouping');

/* ---------- sizes ---------- */
eq(cv('shoes', 'usm', 'uk', 10), 9, "US men's 10 = UK 9");
eq(cv('shoes', 'usm', 'eu', 9), 42, "US men's 9 = EU 42");
eq(cv('shoes', 'usw', 'eu', 7), 38, "US women's 7 = EU 38");
eq(cv('shoes', 'usm', 'usw', 8), 9, "men's 8 = women's 9");
eq(cv('clothing', 'wd-us', 'wd-uk', 8), 12, 'dress US 8 = UK 12');
eq(cv('clothing', 'wd-us', 'wd-eu', 8), 38, 'dress US 8 = EU 38');
eq(cv('clothing', 'ms-us', 'ms-eu', 40), 50, 'suit 40 = EU 50');
eq(cv('clothing', 'mn-in', 'mn-cm', 16), 41, 'collar 16 in = 41 cm');
ok(Number.isNaN(cv('clothing', 'wd-us', 'ms-eu', 8)), 'no conversion across clothing groups');

/* ---------- parser ---------- */
q('5 ft 11 in', { cat: 'length', from: 'in', to: 'cm', value: 71, compound: true });
q('5\'11"', { cat: 'length', from: 'in', value: 71 });
q("5'11", { cat: 'length', from: 'in', value: 71 }, "5'11 (implicit inches)");
q('5ft 11in to cm', { cat: 'length', to: 'cm', value: 71 });
q('72 f', { cat: 'temp', from: 'f', to: 'c', value: 72 });
q('72°F', { cat: 'temp', from: 'f', value: 72 });
q('-40 c to f', { cat: 'temp', from: 'c', to: 'f', value: -40 });
q('3.5 cups flour to g', { cat: 'cooking', from: 'uscup', to: 'g', value: 3.5, ingredient: 'flour' });
q('1 1/2 cups of sugar in grams', { cat: 'cooking', from: 'uscup', to: 'g', value: 1.5, ingredient: 'sugar' });
q('½ cup to tbsp', { cat: 'volume', from: 'uscup', to: 'ustbsp', value: 0.5 });
q('2 sticks of butter', { cat: 'cooking', from: 'stick', to: 'g', value: 2, ingredient: 'butter' });
q('how many cups in 500 g flour', { cat: 'cooking', from: 'g', to: 'uscup', value: 500, ingredient: 'flour' });
q('100 km/h in mph', { cat: 'speed', from: 'kmh', to: 'mph', value: 100 });
q('1e6 bytes', { cat: 'data', from: 'B', to: 'MB', value: 1e6 });
q('8 Mb to MB', { cat: 'data', from: 'Mbit', to: 'MB', value: 8 });
q('5 mb', { cat: 'data', from: 'MB' }, 'lower-case mb means megabytes');
q('0x1F', { cat: 'base', from: 'b16', to: 'b10', value: '1F' });
q('255 to hex', { cat: 'base', from: 'b10', to: 'b16', value: '255' });
q('1010 bin to dec', { cat: 'base', from: 'b2', to: 'b10', value: '1010' });
q('zz base36 to base 10', { cat: 'base', from: 'b36', to: 'b10' });
q('30 mpg to l/100km', { cat: 'fuel', from: 'mpgus', to: 'l100', value: 30 });
q('us men 10 to eu', { cat: 'shoes', from: 'usm', to: 'eu', value: 10 });
q('eu 38 to us women', { cat: 'shoes', from: 'eu', to: 'usw', value: 38 });
q('1h 30m', { cat: 'time', from: 'min', value: 90 });
q('2 lb 3 oz to kg', { cat: 'mass', from: 'oz', to: 'kg', value: 35 });
q('1,000 km to mi', { cat: 'length', from: 'km', to: 'mi', value: 1000 });
q('a mile in km', { cat: 'length', from: 'mi', to: 'km', value: 1 });
q('5 in to cm', { cat: 'length', from: 'in', to: 'cm', value: 5 });
q('8 oz to ml', { cat: 'cooking', from: 'oz', to: 'ml' }, 'oz → ml needs a density: cooking');
q('90° to rad', { cat: 'angle', from: 'deg', to: 'rad', value: 90 });
q('2 c to km/s', { cat: 'speed', from: 'c' }, 'c resolved by the other side');
q('1000 sq ft to m2', { cat: 'area', from: 'ft2', to: 'm2', value: 1000 });
q('square feet', { cat: 'area', from: 'ft2' });
q('42', { cat: null, value: 42 });
q('to mph', { cat: 'speed', to: 'mph' });
ok(!U.parse('5 kg to km').ok, 'mismatched units fail');
ok(!U.parse('hello world').ok, 'nonsense fails');
eq(U.parse('1 cup to ml', { cat: 'cooking' }).cat, 'cooking', 'hint keeps current category');

/* ---------- canonical query round-trip (every unit) ---------- */
for (const c of U.CATS) {
  for (const x of c.units) {
    const to = U.defaultTarget(c.id, x.id, 2);
    const value = c.id === 'base' ? '1' : 2;
    const s = U.toQuery({ cat: c.id, from: x.id, to, value, ingredient: 'water' });
    const r = U.parse(s);
    ok(r.ok && r.cat === c.id && r.from === x.id && r.to === to, `round-trip "${s}" → ${r.ok ? r.cat + ':' + r.from + '→' + r.to : r.reason}`);
  }
}

/* ---------- formatting ---------- */
eq(U.formatNumber(1234567.891), '1,234,568', 'auto groups and rounds');
eq(U.formatNumber(1234567.891, { group: false }), '1234568', 'no separators');
eq(U.formatNumber(22.2222222222222), '22.22222', 'auto ≈7 significant');
eq(U.formatNumber(0.0254), '0.0254', 'small exact');
eq(U.formatNumber(1.602176634e-19), '1.602177e-19', 'tiny → scientific');
eq(U.formatNumber(Math.PI, { mode: 'dec', n: 2 }), '3.14', 'decimals');
eq(U.formatNumber(123456, { mode: 'sig', n: 3, group: false }), '123000', 'significant figures (large)');
eq(U.formatNumber(0.000123456, { mode: 'sig', n: 2 }), '0.00012', 'significant figures (small)');
eq(U.formatNumber(Infinity), '∞', 'infinity');
eq(U.formatNumber(-0.5), '-0.5', 'negative');
ok(U.isRounded(1 / 3, '0.333333'), 'rounded flag on 1/3');
ok(!U.isRounded(180.34, '180.34'), 'exact value not flagged');
eq(U.parseNumber('1,5'), 1.5, 'decimal comma');
eq(U.parseNumber('1,500'), 1500, 'thousands comma');
eq(U.parseNumber('3/4'), 0.75, 'fraction');

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
