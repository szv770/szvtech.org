/* /convert — conversion engine. Pure, no DOM: imported by the page and by _convert.test.mjs.
   Exact definitions everywhere a definition exists (1 in = 0.0254 m, 1 lb = 0.45359237 kg,
   US gal = 231 in³ = 3.785411784 L, UK gal = 4.54609 L, …). Temperatures use offsets,
   fuel economy L/100km is an inverse unit, number bases use BigInt (exact at any size). */

/* ---------- exact constants ---------- */
const IN = 0.0254, FT = 0.3048, YD = 0.9144, MI = 1609.344, NMI = 1852;
const LB = 0.45359237, OZ = LB / 16, G0 = 9.80665;
const USGAL = 3.785411784, UKGAL = 4.54609;          // litres
const USFLOZ = USGAL / 128, UKFLOZ = UKGAL / 160;
const USCUP = USFLOZ * 8, USTBSP = USFLOZ / 2, USTSP = USFLOZ / 6;
const CALTH = 4.184, BTU = 1055.05585262;

/* u(id, name, sym, aliases, factor | {to, from}, extra)
   aliases: case-insensitive, except those prefixed with "=" which only match exactly (MB vs Mb). */
function u(id, name, sym, aliases, f, extra) {
  const o = { id, name, sym, a: aliases };
  if (f === undefined) o.f = 1; else if (typeof f === 'number') o.f = f; else Object.assign(o, f);
  return Object.assign(o, extra);
}
const lin = (k, off = 0) => ({ to: (x) => (x - off) / k, from: (b) => b * k + off });   // x = base*k + off

/* ---------- categories ---------- */
export const CATS = [
  {
    id: 'length', name: 'Length', base: 'm', def: ['ft', 'm'],
    units: [
      u('m', 'Metre', 'm', ['m', 'meter', 'meters', 'metre', 'metres']),
      u('km', 'Kilometre', 'km', ['km', 'kilometer', 'kilometers', 'kilometre', 'kilometres', 'kms'], 1000),
      u('cm', 'Centimetre', 'cm', ['cm', 'centimeter', 'centimeters', 'centimetre', 'centimetres', 'cms'], 0.01),
      u('mm', 'Millimetre', 'mm', ['mm', 'millimeter', 'millimeters', 'millimetre', 'millimetres'], 0.001),
      u('um', 'Micrometre', 'µm', ['µm', 'um', 'micron', 'microns', 'micrometer', 'micrometers', 'micrometre'], 1e-6),
      u('nm', 'Nanometre', 'nm', ['nm', 'nanometer', 'nanometers', 'nanometre', 'nanometres'], 1e-9),
      u('in', 'Inch', 'in', ['in', 'inch', 'inches', '"', '″', '”', "''"], IN),
      u('ft', 'Foot', 'ft', ['ft', 'foot', 'feet', "'", '′', '’'], FT),
      u('yd', 'Yard', 'yd', ['yd', 'yds', 'yard', 'yards'], YD),
      u('mi', 'Mile', 'mi', ['mi', 'mile', 'miles'], MI),
      u('nmi', 'Nautical mile', 'nmi', ['nmi', 'nautical mile', 'nautical miles', 'nm (nautical)'], NMI),
      u('mil', 'Thou (mil)', 'mil', ['mil', 'mils', 'thou'], IN / 1000),
      u('au', 'Astronomical unit', 'au', ['au', 'astronomical unit', 'astronomical units'], 149597870700),
      u('ly', 'Light-year', 'ly', ['ly', 'light year', 'light years', 'light-year', 'light-years', 'lightyear'], 9460730472580800),
      u('pc', 'Parsec', 'pc', ['pc', 'parsec', 'parsecs'], 149597870700 * 648000 / Math.PI),
    ],
    pairs: { m: 'ft', km: 'mi', cm: 'in', mm: 'in', um: 'mil', nm: 'um', in: 'cm', ft: 'm', yd: 'm', mi: 'km', nmi: 'km', mil: 'mm', au: 'km', ly: 'km', pc: 'ly' },
  },
  {
    id: 'mass', name: 'Weight', base: 'kg', def: ['lb', 'kg'],
    units: [
      u('kg', 'Kilogram', 'kg', ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms']),
      u('g', 'Gram', 'g', ['g', 'gram', 'grams', 'gramme', 'grammes'], 1e-3),
      u('mg', 'Milligram', 'mg', ['mg', 'milligram', 'milligrams'], 1e-6),
      u('ug', 'Microgram', 'µg', ['µg', 'ug', 'mcg', 'microgram', 'micrograms'], 1e-9),
      u('t', 'Tonne', 't', ['t', 'tonne', 'tonnes', 'metric ton', 'metric tons'], 1000),
      u('lb', 'Pound', 'lb', ['lb', 'lbs', 'pound', 'pounds', '#'], LB),
      u('oz', 'Ounce', 'oz', ['oz', 'ounce', 'ounces'], OZ),
      u('st', 'Stone', 'st', ['st', 'stone', 'stones'], LB * 14),
      u('ston', 'US ton (short)', 'ton', ['ton', 'tons', 'short ton', 'short tons', 'us ton', 'us tons'], LB * 2000),
      u('lton', 'UK ton (long)', 'long ton', ['long ton', 'long tons', 'uk ton', 'uk tons', 'imperial ton'], LB * 2240),
      u('ozt', 'Troy ounce', 'oz t', ['oz t', 'ozt', 'troy oz', 'troy ounce', 'troy ounces'], 0.0311034768),
      u('ct', 'Carat', 'ct', ['ct', 'carat', 'carats'], 2e-4),
      u('gr', 'Grain', 'gr', ['gr', 'grain', 'grains'], 6.479891e-5),
    ],
    pairs: { kg: 'lb', g: 'oz', mg: 'gr', ug: 'mg', t: 'ston', lb: 'kg', oz: 'g', st: 'kg', ston: 't', lton: 't', ozt: 'g', ct: 'g', gr: 'mg' },
  },
  {
    id: 'temp', name: 'Temperature', base: 'c', def: ['f', 'c'], affine: true,
    units: [
      u('c', 'Celsius', '°C', ['c', '°c', 'º c', 'degc', 'deg c', 'degree c', 'degrees c', 'celsius', 'centigrade', 'degrees celsius', 'degree celsius', '℃'], 1),
      u('f', 'Fahrenheit', '°F', ['f', '°f', 'degf', 'deg f', 'degree f', 'degrees f', 'fahrenheit', 'degrees fahrenheit', 'degree fahrenheit', '℉'],
        { to: (x) => (x - 32) * 5 / 9, from: (b) => b * 9 / 5 + 32 }),
      u('k', 'Kelvin', 'K', ['k', 'kelvin', 'kelvins', '°k'], { to: (x) => x - 273.15, from: (b) => b + 273.15 }),
      u('r', 'Rankine', '°R', ['°r', 'ra', 'rankine', 'degrees rankine'], { to: (x) => (x - 491.67) * 5 / 9, from: (b) => (b + 273.15) * 9 / 5 }),
      u('re', 'Réaumur', '°Ré', ['°re', '°ré', 'réaumur', 'reaumur'], { to: (x) => x * 5 / 4, from: (b) => b * 4 / 5 }),
    ],
    pairs: { c: 'f', f: 'c', k: 'c', r: 'f', re: 'c' },
  },
  {
    id: 'volume', name: 'Volume', base: 'l', def: ['usgal', 'l'],
    units: [
      u('l', 'Litre', 'L', ['l', 'liter', 'liters', 'litre', 'litres', 'ltr', 'ltrs']),
      u('ml', 'Millilitre', 'mL', ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres', 'mls'], 1e-3),
      u('cl', 'Centilitre', 'cL', ['cl', 'centiliter', 'centilitre', 'centiliters', 'centilitres'], 1e-2),
      u('dl', 'Decilitre', 'dL', ['dl', 'deciliter', 'decilitre', 'deciliters', 'decilitres'], 0.1),
      u('m3', 'Cubic metre', 'm³', ['m3', 'm^3', 'cubic meter', 'cubic meters', 'cubic metre', 'cubic metres', 'cu m'], 1000),
      u('cm3', 'Cubic centimetre', 'cm³', ['cm3', 'cm^3', 'cc', 'cubic centimeter', 'cubic centimeters', 'cubic centimetre', 'cubic centimetres'], 1e-3),
      u('usgal', 'US gallon', 'gal', ['gal', 'gals', 'gallon', 'gallons', 'us gal', 'us gallon', 'us gallons'], USGAL),
      u('usqt', 'US quart', 'qt', ['qt', 'qts', 'quart', 'quarts', 'us qt', 'us quart', 'us quarts'], USGAL / 4),
      u('uspt', 'US pint', 'pt', ['pt', 'pts', 'pint', 'pints', 'us pt', 'us pint', 'us pints'], USGAL / 8),
      u('uscup', 'US cup', 'cup', ['cup', 'cups', 'c.', 'us cup', 'us cups'], USCUP),
      u('usfloz', 'US fluid ounce', 'fl oz', ['fl oz', 'floz', 'fl. oz', 'fl. oz.', 'fluid ounce', 'fluid ounces', 'us fl oz', 'us fluid ounce', 'us fluid ounces'], USFLOZ),
      u('ustbsp', 'US tablespoon', 'tbsp', ['tbsp', 'tbsps', 'tbs', 'tablespoon', 'tablespoons', '=T', '=Tb'], USTBSP),
      u('ustsp', 'US teaspoon', 'tsp', ['tsp', 'tsps', 'teaspoon', 'teaspoons', '=t.'], USTSP),
      u('ukgal', 'Imperial gallon', 'imp gal', ['imp gal', 'uk gal', 'uk gallon', 'uk gallons', 'imperial gallon', 'imperial gallons', 'imp gallon', 'imp gallons'], UKGAL),
      u('ukqt', 'Imperial quart', 'imp qt', ['imp qt', 'uk qt', 'uk quart', 'uk quarts', 'imperial quart', 'imperial quarts'], UKGAL / 4),
      u('ukpt', 'Imperial pint', 'imp pt', ['imp pt', 'uk pt', 'uk pint', 'uk pints', 'imperial pint', 'imperial pints', 'imp pint'], UKGAL / 8),
      u('ukfloz', 'Imperial fluid ounce', 'imp fl oz', ['imp fl oz', 'uk fl oz', 'uk fluid ounce', 'uk fluid ounces', 'imperial fluid ounce', 'imperial fluid ounces'], UKFLOZ),
      u('in3', 'Cubic inch', 'in³', ['in3', 'in^3', 'cu in', 'cubic inch', 'cubic inches'], IN * IN * IN * 1000),
      u('ft3', 'Cubic foot', 'ft³', ['ft3', 'ft^3', 'cu ft', 'cubic foot', 'cubic feet'], FT * FT * FT * 1000),
      u('yd3', 'Cubic yard', 'yd³', ['yd3', 'yd^3', 'cu yd', 'cubic yard', 'cubic yards'], YD * YD * YD * 1000),
      u('bbl', 'Barrel (oil)', 'bbl', ['bbl', 'barrel', 'barrels', 'oil barrel', 'oil barrels'], USGAL * 42),
    ],
    pairs: { l: 'usgal', ml: 'usfloz', cl: 'usfloz', dl: 'uscup', m3: 'ft3', cm3: 'in3', usgal: 'l', usqt: 'l', uspt: 'ml', uscup: 'ml', usfloz: 'ml', ustbsp: 'ml', ustsp: 'ml', ukgal: 'l', ukqt: 'l', ukpt: 'ml', ukfloz: 'ml', in3: 'cm3', ft3: 'm3', yd3: 'm3', bbl: 'l' },
  },
  {
    id: 'area', name: 'Area', base: 'm2', def: ['ft2', 'm2'],
    units: [
      u('m2', 'Square metre', 'm²', ['m2', 'm^2', 'sq m', 'sqm', 'square meter', 'square meters', 'square metre', 'square metres']),
      u('km2', 'Square kilometre', 'km²', ['km2', 'km^2', 'sq km', 'square kilometer', 'square kilometers', 'square kilometre', 'square kilometres'], 1e6),
      u('cm2', 'Square centimetre', 'cm²', ['cm2', 'cm^2', 'sq cm', 'square centimeter', 'square centimeters', 'square centimetre', 'square centimetres'], 1e-4),
      u('mm2', 'Square millimetre', 'mm²', ['mm2', 'mm^2', 'sq mm', 'square millimeter', 'square millimeters', 'square millimetre'], 1e-6),
      u('ha', 'Hectare', 'ha', ['ha', 'hectare', 'hectares'], 1e4),
      u('are', 'Are', 'a', ['are', 'ares'], 100),
      u('in2', 'Square inch', 'in²', ['in2', 'in^2', 'sq in', 'square inch', 'square inches'], IN * IN),
      u('ft2', 'Square foot', 'ft²', ['ft2', 'ft^2', 'sq ft', 'sqft', 'square foot', 'square feet'], FT * FT),
      u('yd2', 'Square yard', 'yd²', ['yd2', 'yd^2', 'sq yd', 'square yard', 'square yards'], YD * YD),
      u('acre', 'Acre', 'ac', ['ac', 'acre', 'acres'], 4046.8564224),
      u('mi2', 'Square mile', 'mi²', ['mi2', 'mi^2', 'sq mi', 'square mile', 'square miles'], MI * MI),
    ],
    pairs: { m2: 'ft2', km2: 'mi2', cm2: 'in2', mm2: 'in2', ha: 'acre', are: 'ft2', in2: 'cm2', ft2: 'm2', yd2: 'm2', acre: 'ha', mi2: 'km2' },
  },
  {
    id: 'speed', name: 'Speed', base: 'ms', def: ['kmh', 'mph'],
    units: [
      u('ms', 'Metres per second', 'm/s', ['m/s', 'mps', 'meters per second', 'metres per second', 'meter per second', 'metre per second']),
      u('kmh', 'Kilometres per hour', 'km/h', ['km/h', 'kmh', 'kph', 'kmph', 'km/hr', 'kilometers per hour', 'kilometres per hour', 'km per hour'], 1000 / 3600),
      u('mph', 'Miles per hour', 'mph', ['mph', 'mi/h', 'mi/hr', 'miles per hour', 'mile per hour'], MI / 3600),
      u('kn', 'Knot', 'kn', ['kn', 'kt', 'kts', 'knot', 'knots'], NMI / 3600),
      u('fts', 'Feet per second', 'ft/s', ['ft/s', 'fps', 'feet per second', 'foot per second'], FT),
      u('kms', 'Kilometres per second', 'km/s', ['km/s', 'kilometers per second', 'kilometres per second'], 1000),
      u('mach', 'Mach (20 °C air)', 'Mach', ['mach'], 343),
      u('c', 'Speed of light', 'c', ['c', 'speed of light', 'lightspeed'], 299792458),
    ],
    pairs: { ms: 'kmh', kmh: 'mph', mph: 'kmh', kn: 'kmh', fts: 'ms', kms: 'mph', mach: 'kmh', c: 'kms' },
  },
  {
    id: 'time', name: 'Time', base: 's', def: ['h', 'min'],
    units: [
      u('ns', 'Nanosecond', 'ns', ['ns', 'nanosecond', 'nanoseconds'], 1e-9),
      u('us', 'Microsecond', 'µs', ['µs', 'microsecond', 'microseconds'], 1e-6),
      u('ms', 'Millisecond', 'ms', ['ms', 'msec', 'millisecond', 'milliseconds'], 1e-3),
      u('s', 'Second', 's', ['s', 'sec', 'secs', 'second', 'seconds']),
      u('min', 'Minute', 'min', ['min', 'mins', 'minute', 'minutes', 'm'], 60),
      u('h', 'Hour', 'h', ['h', 'hr', 'hrs', 'hour', 'hours'], 3600),
      u('d', 'Day', 'd', ['d', 'day', 'days'], 86400),
      u('wk', 'Week', 'wk', ['wk', 'wks', 'week', 'weeks'], 604800),
      u('fn', 'Fortnight', 'fortnight', ['fortnight', 'fortnights'], 1209600),
      u('mo', 'Month (avg)', 'mo', ['mo', 'mos', 'month', 'months'], 2629746),
      u('yr', 'Year (avg, 365.2425 d)', 'yr', ['yr', 'yrs', 'y', 'year', 'years'], 31556952),
      u('dec', 'Decade', 'decade', ['decade', 'decades'], 315569520),
      u('cen', 'Century', 'century', ['century', 'centuries'], 3155695200),
    ],
    pairs: { ns: 'us', us: 'ms', ms: 's', s: 'min', min: 'h', h: 'min', d: 'h', wk: 'd', fn: 'd', mo: 'd', yr: 'd', dec: 'yr', cen: 'yr' },
  },
  {
    id: 'data', name: 'Data', base: 'bit', def: ['GB', 'GiB'],
    units: [
      u('bit', 'Bit', 'bit', ['bit', 'bits', '=b'], 1),
      u('nib', 'Nibble', 'nibble', ['nibble', 'nibbles'], 4),
      u('B', 'Byte', 'B', ['byte', 'bytes', '=B', 'octet', 'octets'], 8),
      u('kbit', 'Kilobit', 'kbit', ['kbit', 'kbits', 'kilobit', 'kilobits', '=Kb'], 1e3),
      u('Mbit', 'Megabit', 'Mbit', ['mbit', 'mbits', 'megabit', 'megabits', '=Mb'], 1e6),
      u('Gbit', 'Gigabit', 'Gbit', ['gbit', 'gbits', 'gigabit', 'gigabits', '=Gb'], 1e9),
      u('Tbit', 'Terabit', 'Tbit', ['tbit', 'tbits', 'terabit', 'terabits', '=Tb'], 1e12),
      u('Kibit', 'Kibibit', 'Kibit', ['kibit', 'kibibit', 'kibibits'], 1024),
      u('Mibit', 'Mebibit', 'Mibit', ['mibit', 'mebibit', 'mebibits'], 2 ** 20),
      u('Gibit', 'Gibibit', 'Gibit', ['gibit', 'gibibit', 'gibibits'], 2 ** 30),
      u('kB', 'Kilobyte', 'kB', ['kb', 'kbyte', 'kbytes', 'kilobyte', 'kilobytes', '=kB', '=KB'], 8e3),
      u('MB', 'Megabyte', 'MB', ['mb', 'mbyte', 'mbytes', 'megabyte', 'megabytes', 'meg', 'megs', '=MB'], 8e6),
      u('GB', 'Gigabyte', 'GB', ['gb', 'gbyte', 'gigabyte', 'gigabytes', 'gig', 'gigs', '=GB'], 8e9),
      u('TB', 'Terabyte', 'TB', ['tb', 'terabyte', 'terabytes', '=TB'], 8e12),
      u('PB', 'Petabyte', 'PB', ['pb', 'petabyte', 'petabytes', '=PB'], 8e15),
      u('EB', 'Exabyte', 'EB', ['eb', 'exabyte', 'exabytes', '=EB'], 8e18),
      u('KiB', 'Kibibyte', 'KiB', ['kib', 'kibibyte', 'kibibytes'], 8 * 1024),
      u('MiB', 'Mebibyte', 'MiB', ['mib', 'mebibyte', 'mebibytes'], 8 * 2 ** 20),
      u('GiB', 'Gibibyte', 'GiB', ['gib', 'gibibyte', 'gibibytes'], 8 * 2 ** 30),
      u('TiB', 'Tebibyte', 'TiB', ['tib', 'tebibyte', 'tebibytes'], 8 * 2 ** 40),
      u('PiB', 'Pebibyte', 'PiB', ['pib', 'pebibyte', 'pebibytes'], 8 * 2 ** 50),
      u('EiB', 'Exbibyte', 'EiB', ['eib', 'exbibyte', 'exbibytes'], 8 * 2 ** 60),
    ],
    pairs: { bit: 'B', nib: 'bit', kbit: 'kB', Mbit: 'MB', Gbit: 'GB', Tbit: 'TB', Kibit: 'KiB', Mibit: 'MiB', Gibit: 'GiB', kB: 'KiB', MB: 'MiB', GB: 'GiB', TB: 'TiB', PB: 'PiB', EB: 'EiB', KiB: 'kB', MiB: 'MB', GiB: 'GB', TiB: 'TB', PiB: 'PB', EiB: 'EB' },
  },
  {
    id: 'energy', name: 'Energy', base: 'J', def: ['kcal', 'kJ'],
    units: [
      u('J', 'Joule', 'J', ['j', 'joule', 'joules']),
      u('kJ', 'Kilojoule', 'kJ', ['kj', 'kilojoule', 'kilojoules'], 1e3),
      u('MJ', 'Megajoule', 'MJ', ['mj', 'megajoule', 'megajoules', '=MJ'], 1e6),
      u('cal', 'Calorie (small)', 'cal', ['cal', 'cals', 'calorie', 'calories', 'small calorie', 'small calories'], CALTH),
      u('kcal', 'Kilocalorie (food Cal)', 'kcal', ['kcal', 'kcals', 'kilocalorie', 'kilocalories', 'food calorie', 'food calories', '=Cal', '=Cals'], CALTH * 1000),
      u('Wh', 'Watt-hour', 'Wh', ['wh', 'watt hour', 'watt hours', 'watt-hour', 'watt-hours'], 3600),
      u('kWh', 'Kilowatt-hour', 'kWh', ['kwh', 'kilowatt hour', 'kilowatt hours', 'kilowatt-hour', 'kilowatt-hours'], 3.6e6),
      u('BTU', 'British thermal unit', 'BTU', ['btu', 'btus', 'british thermal unit', 'british thermal units'], BTU),
      u('therm', 'Therm (US)', 'thm', ['therm', 'therms', 'thm'], 105480400),
      u('ftlbf', 'Foot-pound', 'ft·lbf', ['ft-lb', 'ft lb', 'ftlb', 'ft·lbf', 'ft-lbf', 'ft lbf', 'foot pound', 'foot pounds', 'foot-pound', 'foot-pounds'], FT * LB * G0),
      u('eV', 'Electronvolt', 'eV', ['ev', 'electronvolt', 'electronvolts', 'electron volt', 'electron volts'], 1.602176634e-19),
      u('erg', 'Erg', 'erg', ['erg', 'ergs'], 1e-7),
    ],
    pairs: { J: 'cal', kJ: 'kcal', MJ: 'kWh', cal: 'J', kcal: 'kJ', Wh: 'J', kWh: 'MJ', BTU: 'kJ', therm: 'kWh', ftlbf: 'J', eV: 'J', erg: 'J' },
  },
  {
    id: 'power', name: 'Power', base: 'W', def: ['hp', 'kW'],
    units: [
      u('W', 'Watt', 'W', ['w', 'watt', 'watts']),
      u('kW', 'Kilowatt', 'kW', ['kw', 'kilowatt', 'kilowatts'], 1e3),
      u('MW', 'Megawatt', 'MW', ['megawatt', 'megawatts', '=MW'], 1e6),
      u('hp', 'Horsepower (mech.)', 'hp', ['hp', 'horsepower', 'bhp'], 550 * FT * LB * G0),
      u('PS', 'Metric horsepower', 'PS', ['ps', 'metric hp', 'metric horsepower', 'cv', 'pk'], 75 * G0),
      u('BTUh', 'BTU per hour', 'BTU/h', ['btu/h', 'btu/hr', 'btuh', 'btu per hour'], BTU / 3600),
      u('ftlbfs', 'Foot-pound per second', 'ft·lbf/s', ['ft-lb/s', 'ft lbf/s', 'ft·lbf/s'], FT * LB * G0),
      u('kcalh', 'Kilocalorie per hour', 'kcal/h', ['kcal/h', 'kcal/hr'], CALTH * 1000 / 3600),
    ],
    pairs: { W: 'BTUh', kW: 'hp', MW: 'hp', hp: 'kW', PS: 'kW', BTUh: 'W', ftlbfs: 'W', kcalh: 'W' },
  },
  {
    id: 'pressure', name: 'Pressure', base: 'Pa', def: ['psi', 'bar'],
    units: [
      u('Pa', 'Pascal', 'Pa', ['pa', 'pascal', 'pascals']),
      u('hPa', 'Hectopascal', 'hPa', ['hpa', 'hectopascal', 'hectopascals'], 100),
      u('kPa', 'Kilopascal', 'kPa', ['kpa', 'kilopascal', 'kilopascals'], 1e3),
      u('MPa', 'Megapascal', 'MPa', ['mpa', 'megapascal', 'megapascals'], 1e6),
      u('bar', 'Bar', 'bar', ['bar', 'bars'], 1e5),
      u('mbar', 'Millibar', 'mbar', ['mbar', 'millibar', 'millibars', 'mb (pressure)'], 100),
      u('atm', 'Atmosphere', 'atm', ['atm', 'atmosphere', 'atmospheres'], 101325),
      u('psi', 'Pound per sq inch', 'psi', ['psi', 'lb/in2', 'lbf/in2', 'pounds per square inch'], LB * G0 / (IN * IN)),
      u('torr', 'Torr', 'Torr', ['torr'], 101325 / 760),
      u('mmHg', 'Millimetre of mercury', 'mmHg', ['mmhg', 'mm hg', 'millimeters of mercury', 'millimetres of mercury'], 133.322387415),
      u('inHg', 'Inch of mercury', 'inHg', ['inhg', 'in hg', 'inches of mercury'], 3386.389),
      u('at', 'Technical atmosphere', 'at', ['kgf/cm2', 'kgf/cm²', 'technical atmosphere'], G0 * 1e4),
    ],
    pairs: { Pa: 'psi', hPa: 'inHg', kPa: 'psi', MPa: 'psi', bar: 'psi', mbar: 'inHg', atm: 'kPa', psi: 'bar', torr: 'Pa', mmHg: 'kPa', inHg: 'hPa', at: 'bar' },
  },
  {
    id: 'fuel', name: 'Fuel economy', base: 'kml', def: ['mpgus', 'l100'],
    units: [
      u('l100', 'Litres per 100 km', 'L/100 km', ['l/100km', 'l/100 km', 'l per 100km', 'l per 100 km', 'liters per 100 km', 'litres per 100 km', 'liters per 100km', 'litres per 100km', 'lp100km', 'l100km', 'l/100'],
        { to: (x) => 100 / x, from: (b) => 100 / b, inverse: true }),
      u('kml', 'Kilometres per litre', 'km/L', ['km/l', 'kmpl', 'kpl', 'km per liter', 'km per litre', 'kilometers per liter', 'kilometres per litre'], 1),
      u('mpgus', 'Miles per US gallon', 'mpg (US)', ['mpg', 'mpg us', 'us mpg', 'mpgus', 'mi/gal', 'miles per gallon', 'miles per us gallon'], (MI / 1000) / USGAL),
      u('mpguk', 'Miles per imp. gallon', 'mpg (UK)', ['mpg uk', 'uk mpg', 'mpg imp', 'imperial mpg', 'mpguk', 'miles per imperial gallon', 'miles per uk gallon'], (MI / 1000) / UKGAL),
      u('mpl', 'Miles per litre', 'mi/L', ['mi/l', 'miles per liter', 'miles per litre'], MI / 1000),
      u('gal100', 'US gallons per 100 mi', 'gal/100 mi', ['gal/100mi', 'gal/100 mi', 'gallons per 100 miles'],
        { to: (x) => 100 * (MI / 1000) / (x * USGAL), from: (b) => 100 * (MI / 1000) / (b * USGAL), inverse: true }),
    ],
    pairs: { l100: 'mpgus', kml: 'l100', mpgus: 'l100', mpguk: 'l100', mpl: 'l100', gal100: 'l100' },
  },
  {
    id: 'cooking', name: 'Cooking', base: 'ml', def: ['uscup', 'g'], cooking: true,
    units: [
      u('uscup', 'Cup (US)', 'cup', ['cup', 'cups', 'c.', 'us cup', 'us cups'], USCUP * 1000, { k: 'v' }),
      u('ustbsp', 'Tablespoon', 'tbsp', ['tbsp', 'tbsps', 'tbs', 'tablespoon', 'tablespoons', '=T', '=Tb'], USTBSP * 1000, { k: 'v' }),
      u('ustsp', 'Teaspoon', 'tsp', ['tsp', 'tsps', 'teaspoon', 'teaspoons', '=t.'], USTSP * 1000, { k: 'v' }),
      u('usfloz', 'Fluid ounce (US)', 'fl oz', ['fl oz', 'floz', 'fl. oz', 'fl. oz.', 'fluid ounce', 'fluid ounces', 'us fl oz'], USFLOZ * 1000, { k: 'v' }),
      u('ml', 'Millilitre', 'mL', ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres', 'mls'], 1, { k: 'v' }),
      u('l', 'Litre', 'L', ['l', 'liter', 'liters', 'litre', 'litres'], 1000, { k: 'v' }),
      u('mcup', 'Metric cup (250 mL)', 'metric cup', ['metric cup', 'metric cups'], 250, { k: 'v' }),
      u('mtbsp', 'Metric tablespoon (15 mL)', 'metric tbsp', ['metric tbsp', 'metric tablespoon', 'metric tablespoons', 'uk tbsp'], 15, { k: 'v' }),
      u('uspt', 'Pint (US)', 'pt', ['pt', 'pint', 'pints', 'us pint'], USGAL / 8 * 1000, { k: 'v' }),
      u('usqt', 'Quart (US)', 'qt', ['qt', 'quart', 'quarts', 'us quart'], USGAL / 4 * 1000, { k: 'v' }),
      u('stick', 'Stick of butter', 'stick', ['stick', 'sticks', 'stick of butter', 'sticks of butter', 'butter stick', 'butter sticks'], USCUP * 500, { k: 'v' }),
      u('g', 'Gram', 'g', ['g', 'gram', 'grams', 'gramme', 'grammes'], 1, { k: 'm' }),
      u('kg', 'Kilogram', 'kg', ['kg', 'kilo', 'kilos', 'kilogram', 'kilograms'], 1000, { k: 'm' }),
      u('oz', 'Ounce (weight)', 'oz', ['oz', 'ounce', 'ounces'], OZ * 1000, { k: 'm' }),
      u('lb', 'Pound', 'lb', ['lb', 'lbs', 'pound', 'pounds'], LB * 1000, { k: 'm' }),
    ],
    pairs: { uscup: 'g', ustbsp: 'g', ustsp: 'g', usfloz: 'ml', ml: 'uscup', l: 'uscup', mcup: 'g', mtbsp: 'g', uspt: 'ml', usqt: 'l', stick: 'g', g: 'uscup', kg: 'lb', oz: 'g', lb: 'g' },
  },
  {
    id: 'angle', name: 'Angle', base: 'deg', def: ['deg', 'rad'],
    units: [
      u('deg', 'Degree', '°', ['deg', 'degs', 'degree', 'degrees', '°']),
      u('rad', 'Radian', 'rad', ['rad', 'rads', 'radian', 'radians'], 180 / Math.PI),
      u('grad', 'Gradian', 'gon', ['grad', 'grads', 'gon', 'gradian', 'gradians'], 0.9),
      u('turn', 'Turn', 'turn', ['turn', 'turns', 'rev', 'revs', 'revolution', 'revolutions', 'rotation', 'rotations'], 360),
      u('arcmin', 'Arcminute', '′', ['arcmin', 'arcmins', 'arcminute', 'arcminutes', 'moa'], 1 / 60),
      u('arcsec', 'Arcsecond', '″', ['arcsec', 'arcsecs', 'arcsecond', 'arcseconds'], 1 / 3600),
      u('mrad', 'Milliradian', 'mrad', ['mrad', 'milliradian', 'milliradians'], 0.18 / Math.PI),
      u('nato', 'NATO mil', 'mil', ['nato mil', 'nato mils', 'mil (nato)'], 360 / 6400),
    ],
    pairs: { deg: 'rad', rad: 'deg', grad: 'deg', turn: 'deg', arcmin: 'deg', arcsec: 'arcmin', mrad: 'deg', nato: 'deg' },
  },
  {
    id: 'base', name: 'Number base', base: 'b10', def: ['b10', 'b16'], kind: 'base',
    units: (() => {
      const named = { 2: ['Binary', 'bin', ['bin', 'binary', 'base 2', 'base2', 'b2']], 8: ['Octal', 'oct', ['oct', 'octal', 'base 8', 'base8', 'b8']], 10: ['Decimal', 'dec', ['dec', 'decimal', 'base 10', 'base10', 'b10']], 16: ['Hexadecimal', 'hex', ['hex', 'hexadecimal', 'base 16', 'base16', 'b16']] };
      const out = [];
      for (let b = 2; b <= 36; b++) {
        const n = named[b];
        out.push(u('b' + b, n ? n[0] : 'Base ' + b, n ? n[1] : 'base ' + b, n ? n[2] : ['base ' + b, 'base' + b, 'b' + b], 1, { radix: b, common: !!n || b === 3 || b === 12 || b === 32 || b === 36 }));
      }
      return out;
    })(),
    pairs: { b10: 'b16', b16: 'b10', b2: 'b10', b8: 'b10' },
  },
  {
    id: 'shoes', name: 'Shoe size', base: 'uk', def: ['usm', 'eu'], sizes: true,
    note: 'Adult sizes. Approximate: brands and lasts vary by about half a size.',
    units: [
      u('usm', "US men's", 'US M', ['us men', 'us mens', "us men's", 'mens us', "men's us", 'men us', 'us m', 'usm', 'men', 'mens', "men's", 'us'], lin(1, 1), { step: 0.5 }),
      u('usw', "US women's", 'US W', ['us women', 'us womens', "us women's", 'womens us', "women's us", 'women us', 'us w', 'usw', 'women', 'womens', "women's", 'ladies'], lin(1, 2), { step: 0.5 }),
      u('uk', 'UK', 'UK', ['uk', 'uk size', 'british'], 1, { step: 0.5 }),
      u('eu', 'EU', 'EU', ['eu', 'eur', 'euro', 'european', 'eu size'], { to: (x) => x / 1.27 - 25, from: (b) => (b + 25) * 1.27 }, { step: 0.5 }),
      u('jp', 'Mondopoint / JP (cm)', 'JP cm', ['jp', 'mondopoint', 'mondo', 'foot cm', 'foot length cm', 'japan'], { to: (x) => (x + 1) * 3 / 2.54 - 25, from: (b) => (b + 25) / 3 * 2.54 - 1 }, { step: 0.5 }),
      u('footin', 'Foot length (in)', 'foot in', ['foot length in', 'foot inches', 'foot length inches'], { to: (x) => (x * 2.54 + 1) * 3 / 2.54 - 25, from: (b) => ((b + 25) / 3 * 2.54 - 1) / 2.54 }, { step: 0.1 }),
    ],
    pairs: { usm: 'eu', usw: 'eu', uk: 'eu', eu: 'usm', jp: 'usm', footin: 'usm' },
  },
  {
    id: 'clothing', name: 'Clothing size', base: 'wd-us', def: ['wd-us', 'wd-eu'], sizes: true,
    note: 'Common charts. Fit varies by brand.',
    units: [
      u('wd-us', "Women's dress · US", 'US', ['us dress', 'dress us', 'us women dress', 'us womens dress', 'women dress us'], 1, { g: 'wd', gn: "Women's dresses & tops", step: 1 }),
      u('wd-uk', "Women's dress · UK / AU", 'UK', ['uk dress', 'dress uk', 'au dress', 'uk women dress'], lin(1, 4), { g: 'wd', step: 1 }),
      u('wd-eu', "Women's dress · EU (DE)", 'EU', ['eu dress', 'dress eu', 'de dress', 'eu women dress'], lin(1, 30), { g: 'wd', step: 1 }),
      u('wd-fr', "Women's dress · FR / ES", 'FR', ['fr dress', 'dress fr', 'es dress', 'french dress'], lin(1, 32), { g: 'wd', step: 1 }),
      u('wd-it', "Women's dress · IT", 'IT', ['it dress', 'dress it', 'italian dress'], lin(1, 36), { g: 'wd', step: 1 }),
      u('wd-jp', "Women's dress · JP", 'JP', ['jp dress', 'dress jp'], lin(1, 3), { g: 'wd', step: 1 }),
      u('ms-us', "Men's suit · US / UK (chest in)", 'US/UK', ['us suit', 'suit us', 'uk suit', 'suit uk', 'jacket us', 'us jacket'], 1, { g: 'ms', gn: "Men's suits & jackets", step: 1 }),
      u('ms-eu', "Men's suit · EU / IT", 'EU', ['eu suit', 'suit eu', 'it suit', 'eu jacket', 'jacket eu'], lin(1, 10), { g: 'ms', step: 1 }),
      u('mn-in', "Men's shirt · collar (in)", 'collar in', ['collar in', 'neck in', 'us shirt', 'shirt us', 'uk shirt', 'collar inches', 'neck inches'], 1, { g: 'mn', gn: "Men's shirts (collar)", step: 0.5 }),
      u('mn-cm', "Men's shirt · collar (cm)", 'collar cm', ['collar cm', 'neck cm', 'eu shirt', 'shirt eu'], lin(2.54), { g: 'mn', step: 1 }),
    ],
    pairs: { 'wd-us': 'wd-eu', 'wd-uk': 'wd-us', 'wd-eu': 'wd-us', 'wd-fr': 'wd-us', 'wd-it': 'wd-us', 'wd-jp': 'wd-us', 'ms-us': 'ms-eu', 'ms-eu': 'ms-us', 'mn-in': 'mn-cm', 'mn-cm': 'mn-in' },
  },
];

/* ---------- ingredients for cooking (grams per US cup) ---------- */
export const INGREDIENTS = [
  { id: 'water', name: 'Water', gpc: USCUP * 1000, a: ['water'] },
  { id: 'flour', name: 'Flour (all-purpose)', gpc: 120, a: ['all-purpose flour', 'all purpose flour', 'ap flour', 'plain flour', 'flour', 'white flour'] },
  { id: 'bread', name: 'Bread flour', gpc: 127, a: ['bread flour'] },
  { id: 'wwflour', name: 'Whole wheat flour', gpc: 113, a: ['whole wheat flour', 'wholemeal flour', 'whole-wheat flour'] },
  { id: 'almond', name: 'Almond flour', gpc: 96, a: ['almond flour', 'almond meal', 'ground almonds'] },
  { id: 'sugar', name: 'Sugar (granulated)', gpc: 200, a: ['granulated sugar', 'white sugar', 'caster sugar', 'sugar'] },
  { id: 'brown', name: 'Brown sugar (packed)', gpc: 213, a: ['brown sugar', 'packed brown sugar'] },
  { id: 'powdered', name: 'Powdered sugar', gpc: 113, a: ['powdered sugar', 'icing sugar', "confectioners sugar", "confectioners' sugar"] },
  { id: 'butter', name: 'Butter', gpc: LB * 500, a: ['butter'] },
  { id: 'oil', name: 'Vegetable oil', gpc: 218, a: ['vegetable oil', 'olive oil', 'oil', 'canola oil'] },
  { id: 'milk', name: 'Milk', gpc: 242, a: ['milk', 'whole milk'] },
  { id: 'cream', name: 'Heavy cream', gpc: 238, a: ['heavy cream', 'cream', 'double cream', 'whipping cream'] },
  { id: 'honey', name: 'Honey', gpc: 336, a: ['honey'] },
  { id: 'maple', name: 'Maple syrup', gpc: 312, a: ['maple syrup', 'syrup'] },
  { id: 'cocoa', name: 'Cocoa powder', gpc: 84, a: ['cocoa powder', 'cocoa', 'cacao'] },
  { id: 'oats', name: 'Rolled oats', gpc: 89, a: ['rolled oats', 'oats', 'oatmeal'] },
  { id: 'rice', name: 'Rice (uncooked)', gpc: 185, a: ['rice', 'uncooked rice', 'white rice'] },
  { id: 'salt', name: 'Table salt', gpc: 288, a: ['table salt', 'salt', 'fine salt'] },
  { id: 'chips', name: 'Chocolate chips', gpc: 170, a: ['chocolate chips', 'choc chips', 'chocolate chip'] },
];
export const ingredient = (id) => INGREDIENTS.find((x) => x.id === id) || INGREDIENTS[0];

/* ---------- lookups ---------- */
const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));
for (const c of CATS) { c.map = Object.fromEntries(c.units.map((x) => [x.id, x])); }
export const getCat = (id) => CAT[id] || null;
export const getUnit = (cat, id) => (CAT[cat] && CAT[cat].map[id]) || null;
export const groupOf = (cat, id) => { const x = getUnit(cat, id); return (x && x.g) || ''; };
/** units that can be converted to/from `id` (same group) */
export function unitsLike(cat, id) {
  const c = CAT[cat]; if (!c) return [];
  const g = groupOf(cat, id);
  return c.units.filter((x) => (x.g || '') === g);
}

/* ---------- conversion ---------- */
function toBase(x, v) { return x.to ? x.to(v) : v * x.f; }
function fromBase(x, b) { return x.from ? x.from(b) : b / x.f; }
const roundStep = (v, s) => { const r = Math.round(v / s) * s; return +r.toFixed(6); };

/**
 * convert(cat, from, to, value, opts) → number (string for number bases; NaN / null when impossible).
 * opts.ingredient: cooking ingredient id (volume ↔ mass), opts.raw: skip size rounding.
 */
export function convert(cat, from, to, value, opts = {}) {
  const c = CAT[cat]; if (!c) return NaN;
  if (c.kind === 'base') return convertBase(value, c.map[from] && c.map[from].radix, c.map[to] && c.map[to].radix);
  const a = c.map[from], b = c.map[to];
  if (!a || !b) return NaN;
  if ((a.g || '') !== (b.g || '')) return NaN;
  const v = typeof value === 'string' ? parseNumber(value) : value;
  if (typeof v !== 'number' || Number.isNaN(v)) return NaN;
  if (from === to) return v;
  if (c.cooking && a.k !== b.k) {
    const gpml = ingredient(opts.ingredient).gpc / (USCUP * 1000);
    const base = a.f * v;                        // ml or g
    const out = a.k === 'v' ? base * gpml / b.f : base / gpml / b.f;
    return isFinite(out) && !Number.isInteger(out) ? +out.toPrecision(15) : out;
  }
  // direct ratio of linear factors keeps exact pairs exact (12 in → 1 ft)
  let out = (a.f != null && b.f != null && !a.to && !b.to) ? v * a.f / b.f : fromBase(b, toBase(a, v));
  // trim binary noise (71 in → 180.33999999999997 cm): 15 significant digits is below double precision's floor
  if (isFinite(out) && !Number.isInteger(out)) out = +out.toPrecision(15);
  if (b.step && !opts.raw) out = roundStep(out, b.step);
  if (Object.is(out, -0)) out = 0;
  return out;
}

/* ---------- number bases (BigInt, exact) ---------- */
const DIG = '0123456789abcdefghijklmnopqrstuvwxyz';
/** parse "−0x1F_FF" style text in `radix` → BigInt, or null */
export function parseBase(str, radix) {
  if (typeof str === 'bigint') return str;
  if (typeof str === 'number') return Number.isSafeInteger(str) ? BigInt(str) : null;
  if (!radix || radix < 2 || radix > 36) return null;
  let s = String(str).trim().toLowerCase().replace(/[\s_,'  ]/g, '');
  let neg = false;
  if (s[0] === '-' || s[0] === '−' || s[0] === '+') { neg = s[0] !== '+'; s = s.slice(1); }
  if (radix === 16 && s.startsWith('0x')) s = s.slice(2);
  else if (radix === 2 && s.startsWith('0b')) s = s.slice(2);
  else if (radix === 8 && s.startsWith('0o')) s = s.slice(2);
  if (!s) return null;
  const R = BigInt(radix);
  let n = 0n;
  for (const ch of s) {
    const d = DIG.indexOf(ch);
    if (d < 0 || d >= radix) return null;
    n = n * R + BigInt(d);
  }
  return neg ? -n : n;
}
export function convertBase(value, fromRadix, toRadix) {
  const n = parseBase(value, fromRadix);
  if (n === null || !toRadix) return null;
  const s = (n < 0n ? -n : n).toString(toRadix).toUpperCase();
  return (n < 0n ? '-' : '') + s;
}
/** group digits for display: 4 for bin/hex, 3 otherwise */
export function groupDigits(s, radix, sep = ' ') {
  if (!s) return s;
  const neg = s[0] === '-', body = neg ? s.slice(1) : s;
  const n = radix === 2 || radix === 16 ? 4 : 3;
  let out = '';
  for (let i = body.length; i > 0; i -= n) out = body.slice(Math.max(0, i - n), i) + (out ? sep + out : '');
  return (neg ? '-' : '') + out;
}

/* ---------- smart default target ---------- */
const DATA_SI = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB'], DATA_BIN = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB'];
export function defaultTarget(cat, from, value) {
  const c = CAT[cat]; if (!c) return null;
  if (cat === 'data' && (from === 'B' || from === 'bit') && typeof value === 'number' && isFinite(value) && value !== 0) {
    const bits = Math.abs(value) * c.map[from].f;
    let best = 'B';
    for (const id of DATA_SI) if (bits >= c.map[id].f) best = id;
    if (best === 'B') return from === 'B' ? 'bit' : 'B';
    return best;
  }
  const p = c.pairs && c.pairs[from];
  if (p && p !== from) return p;
  const d = c.def.find((x) => x !== from && (c.map[x].g || '') === (c.map[from].g || ''));
  if (d) return d;
  const any = unitsLike(cat, from).find((x) => x.id !== from);
  return any ? any.id : from;
}

/* ---------- number formatting ---------- */
export function parseNumber(s) {
  if (typeof s === 'number') return s;
  if (s == null) return NaN;
  let t = String(s).trim().replace(/[−–]/g, '-').replace(/[\s_  ]/g, '');
  if (!t) return NaN;
  if (/^[-+]?(∞|inf|infinity)$/i.test(t)) return t[0] === '-' ? -Infinity : Infinity;
  if (/,/.test(t)) {
    if (/^[-+]?\d{1,3}(,\d{3})+(\.\d*)?(e[-+]?\d+)?$/i.test(t)) t = t.replace(/,/g, '');
    else if (/^[-+]?\d*,\d+$/.test(t)) t = t.replace(',', '.');
    else return NaN;
  }
  // fractions "1/2", "1 1/2" (spaces already removed: only plain a/b)
  const fr = /^([-+]?)(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(t);
  if (fr) { const v = +fr[2] / +fr[3]; return fr[1] === '-' ? -v : v; }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return NaN;
  return +t;
}

/**
 * formatNumber(x, { mode: 'auto'|'sig'|'dec', n, group }) → string ("1,234.5", "1.2346e+21", "∞").
 * auto: about 7 significant digits, never scientific between 1e-6 and 1e15, trailing zeros trimmed.
 */
export function formatNumber(x, opts = {}) {
  const { mode = 'auto', n = 6, group = true } = opts;
  if (typeof x !== 'number') return String(x);
  if (Number.isNaN(x)) return '—';
  if (!isFinite(x)) return x < 0 ? '-∞' : '∞';
  if (x === 0) return mode === 'dec' && n > 0 ? '0.' + '0'.repeat(Math.min(n, 20)) : '0';
  const ax = Math.abs(x), mag = Math.floor(Math.log10(ax));
  let s;
  if (mode === 'sig') {
    const p = Math.max(1, Math.min(n, 17));
    s = (ax >= 1e21 || ax < 1e-6) ? x.toExponential(p - 1) : x.toPrecision(p);
    if (/e/.test(s) && ax >= 1e-6 && ax < 1e21) s = Number(s).toFixed(Math.max(0, p - 1 - mag));
  } else if (mode === 'dec') {
    s = ax >= 1e21 ? x.toExponential(Math.min(n, 20)) : x.toFixed(Math.max(0, Math.min(n, 20)));
    if (Number(s) === 0 && x !== 0) s = x.toExponential(Math.min(Math.max(n, 2), 20) - 1).replace(/\.?0+e/, 'e');
  } else {
    if (ax >= 1e15 || ax < 1e-6) s = trimExp(x.toExponential(6));
    else {
      const d = Math.max(0, Math.min(12, 6 - mag));
      s = x.toFixed(d);
      if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
      if (Number(s) === 0) s = trimExp(x.toExponential(6));
    }
  }
  if (s === '-0') s = '0';
  return group ? addGroups(s) : s;
}
function trimExp(s) { return s.replace(/\.?0+e/, 'e'); }
function addGroups(s) {
  if (/e/i.test(s)) return s;
  const m = /^(-?)(\d+)(\.\d+)?$/.exec(s);
  if (!m) return s;
  return m[1] + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (m[3] || '');
}
/** true when the formatted text is not the exact value (show "≈") */
export function isRounded(x, text) {
  if (typeof x !== 'number' || !isFinite(x) || x === 0) return false;
  const v = parseNumber(String(text).replace(/,/g, ''));
  return !(Math.abs(v - x) <= Math.abs(x) * 1e-12);
}

/* ---------- smart parser ---------- */
const FRACS = { '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8' };
const SUP = { '²': '2', '³': '3' };

// alias index: lower-case map and exact-case map → [{cat, unit, len}]
const ALIAS_LO = new Map(), ALIAS_EX = new Map();
for (const c of CATS) {
  for (const x of c.units) {
    for (const al of x.a) {
      const exact = al[0] === '=' && al.length > 1;
      const key = exact ? al.slice(1) : al.toLowerCase();
      const m = exact ? ALIAS_EX : ALIAS_LO;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push({ cat: c.id, unit: x.id });
    }
  }
}
const ALIAS_KEYS_LO = [...ALIAS_LO.keys()].sort((a, b) => b.length - a.length);
const ALIAS_KEYS_EX = [...ALIAS_EX.keys()].sort((a, b) => b.length - a.length);
const ING_KEYS = INGREDIENTS.flatMap((g) => g.a.map((a) => [a, g.id])).sort((a, b) => b[0].length - a[0].length);
const isWordChar = (ch) => !!ch && /[a-z0-9µ]/i.test(ch);

function matchAt(s, i, keys, lower) {
  const hay = lower ? s.toLowerCase() : s;
  for (const k of keys) {
    if (hay.startsWith(k, i)) {
      const last = k[k.length - 1], next = s[i + k.length];
      if (/[a-z]/i.test(last) && next && /[a-z]/i.test(next)) continue;      // "mi" must not eat "min"
      return k;
    }
  }
  return null;
}
/** longest unit alias at position i → { len, cands:[{cat,unit}] } */
function unitAt(s, i) {
  const ex = matchAt(s, i, ALIAS_KEYS_EX, false);
  const lo = matchAt(s, i, ALIAS_KEYS_LO, true);
  if (ex && (!lo || ex.length >= lo.length)) {
    // exact-case match wins, but keep same-length lower-case readings as extra candidates
    const extra = lo && lo.length === ex.length ? ALIAS_LO.get(lo) : [];
    return { len: ex.length, cands: [...ALIAS_EX.get(ex), ...extra] };
  }
  if (lo) return { len: lo.length, cands: ALIAS_LO.get(lo) };
  return null;
}
function ingredientAt(s, i) {
  const lo = s.toLowerCase();
  for (const [k, id] of ING_KEYS) {
    if (lo.startsWith(k, i) && !isWordChar(s[i + k.length])) return { len: k.length, id };
  }
  return null;
}
const NUM_RE = /[-+]?(?:\d[\d,]*(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?/iy;
function numberAt(s, i) {
  NUM_RE.lastIndex = i;
  const m = NUM_RE.exec(s);
  if (!m) return null;
  let txt = m[0], end = i + txt.length;
  // don't swallow a trailing thousands comma ("5, 6")
  while (txt.endsWith(',')) { txt = txt.slice(0, -1); end--; }
  let v = parseNumber(txt);
  if (Number.isNaN(v)) return null;
  // fraction a/b
  let r = /\s*\/\s*(\d+(?:\.\d+)?)/y; r.lastIndex = end;
  let f = r.exec(s);
  if (f) { v = v / +f[1]; end = r.lastIndex; }
  else if (/^[-+]?\d+$/.test(txt)) {
    // mixed number "1 1/2"
    r = /\s+(\d+)\s*\/\s*(\d+)(?![\d.])/y; r.lastIndex = end;
    f = r.exec(s);
    if (f) { const add = +f[1] / +f[2]; v = v < 0 || txt[0] === '-' ? v - add : v + add; end = r.lastIndex; }
  }
  return { v, len: end - i };
}

const FILLER = /^(?:of|a|an|the|size|sizes|shoe|shoes|sz|by)\b/i;
function normalize(q) {
  let s = String(q || '').normalize('NFC');
  s = s.replace(/[−–—]/g, '-').replace(/[μ]/g, 'µ').replace(/º/g, '°');
  s = s.replace(/(\d)\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, '$1 $2');
  s = s.replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (m) => FRACS[m]);
  s = s.replace(/[²³]/g, (m) => SUP[m]);
  s = s.replace(/\bsq\.\s*/gi, 'sq ').replace(/\s+/g, ' ').trim();
  s = s.replace(/[?!]+$/, '').replace(/\s*\.$/, '').trim();
  return s;
}

/** tokenize a quantity side: [{v|null, cands|null}], ingredient, ok */
function readSide(s, allowNumbers) {
  const items = [];
  let ing = null, i = 0, pendingUnitFirst = null;
  while (i < s.length) {
    if (s[i] === ' ' || s[i] === ',' || s[i] === '+' && !/\d/.test(s[i + 1] || '')) { i++; continue; }
    const fl = FILLER.exec(s.slice(i));
    if (fl) { i += fl[0].length; continue; }
    const num = allowNumbers ? numberAt(s, i) : null;
    if (num) {
      i += num.len;
      while (s[i] === ' ') i++;
      const un = unitAt(s, i);
      if (un) { items.push({ v: num.v, cands: un.cands }); i += un.len; }
      else if (pendingUnitFirst) { items.push({ v: num.v, cands: pendingUnitFirst }); pendingUnitFirst = null; }
      else items.push({ v: num.v, cands: null });
      continue;
    }
    const ig = ingredientAt(s, i);
    const un = unitAt(s, i);
    if (ig && (!un || ig.len >= un.len)) { ing = ig.id; i += ig.len; continue; }
    if (un) {
      i += un.len;
      // unit then number ("us men 10", "eu 42")
      let j = i; while (s[j] === ' ') j++;
      const n2 = allowNumbers ? numberAt(s, j) : null;
      if (n2) {
        let k = j + n2.len; while (s[k] === ' ') k++;
        if (!unitAt(s, k)) { items.push({ v: n2.v, cands: un.cands }); i = k; continue; }
      }
      // number-less unit; merge with the next bare number if any ("size 10 us men" handled above)
      const last = items[items.length - 1];
      if (last && last.cands == null) { last.cands = un.cands; continue; }
      if (last && last.cands) {
        // "10 us men" → "us" then "men": refine by intersecting
        const inter = last.cands.filter((a) => un.cands.some((b) => a.cat === b.cat && a.unit === b.unit));
        if (inter.length) { last.cands = inter; continue; }
      }
      items.push({ v: null, cands: un.cands });
      continue;
    }
    return { ok: false };
  }
  if (pendingUnitFirst) items.push({ v: null, cands: pendingUnitFirst });
  return { ok: items.length > 0 || !!ing, items, ing };
}

const TO_METRIC_SMALL = { in: 'cm', ft: 'm', yd: 'm', mi: 'km' };
const SMALLER = { length: { ft: 'in', yd: 'ft', mi: 'yd', m: 'cm' }, mass: { lb: 'oz', st: 'lb', kg: 'g' }, time: { h: 'min', min: 's', d: 'h', wk: 'd' } };
const BASE_WORD = /^(?:(hex|hexadecimal)|(bin|binary)|(oct|octal)|(dec|decimal)|(?:base|b|radix)\s*-?\s*(\d{1,2}))$/i;
function baseWord(w) {
  const m = BASE_WORD.exec(String(w || '').trim());
  if (!m) return 0;
  const r = m[1] ? 16 : m[2] ? 2 : m[3] ? 8 : m[4] ? 10 : +m[5];
  return r >= 2 && r <= 36 ? r : 0;
}
function parseBaseQuery(lhs, rhs) {
  const to = rhs == null ? 0 : baseWord(rhs);
  if (rhs != null && !to) return null;
  let m, txt, from = 0;
  if ((m = /^([-+]?)0([xbo])([0-9a-z_ ]+)$/i.exec(lhs))) {
    from = { x: 16, b: 2, o: 8 }[m[2].toLowerCase()];
    txt = m[1] + m[3];
  } else if ((m = /^([-+]?[0-9a-z_]+(?: [0-9a-z]+)*?)\s*(?:\(\s*(?:base\s*)?(\d{1,2})\s*\)|_(\d{1,2})|\s+(?:in\s+)?([a-z]+(?:\s*\d{1,2})?))$/i.exec(lhs))) {
    from = m[2] ? +m[2] : m[3] ? +m[3] : baseWord(m[4]);
    txt = m[1];
  } else if (to && /^[-+]?\d[\d_ ]*$/.test(lhs)) {
    from = 10; txt = lhs;
  } else return null;
  if (!from || from < 2 || from > 36) return null;
  if (parseBase(txt, from) === null) return null;
  const toR = to || (from === 10 ? 16 : 10);
  return { ok: true, cat: 'base', from: 'b' + from, to: 'b' + toR, value: txt.replace(/\s+/g, ''), compound: false };
}

const SEP_RE = /\s+(?:to|in|into|as|en)(?=\s)|\s*(?:->|→|=>|=)/gi;

/**
 * parse(query, hint?) → { ok, cat, from, to, value, ingredient?, compound } or { ok:false, reason }.
 * value is a number (string for number bases); from/to/value may be null when the query omits them
 * (e.g. "42" or "to mph"); hint = { cat } breaks ties toward the current category.
 */
export function parse(query, hint = {}) {
  let s = normalize(query);
  if (!s) return { ok: false, reason: 'empty' };
  s = s.replace(/^(?:convert|conv|what is|what's|whats|how much is)\s+/i, '');
  // "how many cups in 200 g flour" → "200 g flour to cups"
  const hm = /^how (?:many|much)\s+(.+?)\s+(?:are |is )?(?:in|per)\s+(?:a |an |one )?(.+)$/i.exec(s);
  if (hm) s = (/^\s*[-+.\d]/.test(hm[2]) ? hm[2] : '1 ' + hm[2]) + ' to ' + hm[1];
  // "a mile in km" → "1 mile to km"
  s = s.replace(/^(?:a|an|one)\s+/i, '1 ');
  // only a target: "to mph", "→ hex"
  const only = /^(?:to|in|into|as|->|→|=>|=)\s*(.+)$/i.exec(s);
  if (only) {
    const r = resolve('', only[1].trim(), hint);
    return r.ok ? r : { ok: false, reason: 'rhs' };
  }

  // split candidates: try the last separator first
  const seps = [];
  SEP_RE.lastIndex = 0;
  let m;
  while ((m = SEP_RE.exec(s))) seps.push([m.index, m.index + m[0].length]);
  const tries = seps.reverse().map(([a, b]) => [s.slice(0, a).trim(), s.slice(b).trim()]).filter(([l, r]) => r);
  tries.push([s, null]);
  let fail = null;
  for (const [lhs, rhs] of tries) {
    const b = parseBaseQuery(lhs, rhs);
    if (b) return b;
    const r = resolve(lhs, rhs, hint);
    if (r.ok) return r;
    fail = fail || r;
  }
  return fail || { ok: false, reason: 'unknown' };
}

function resolve(lhs, rhs, hint) {
  if (!lhs && rhs == null) return { ok: false, reason: 'empty' };
  const L = lhs ? readSide(lhs, true) : { ok: true, items: [], ing: null };
  if (!L.ok) return { ok: false, reason: 'lhs' };
  let R = null;
  if (rhs != null) {
    R = readSide(rhs, false);
    if (!R.ok || R.items.length !== 1 || !R.items[0].cands) return { ok: false, reason: 'rhs' };
  }
  const ing = L.ing || (R && R.ing) || null;
  const unitItems = L.items.filter((x) => x.cands);
  // a lone number without a unit
  if (!unitItems.length && !R) {
    if (L.items.length === 1 && L.items[0].v != null && !ing) return { ok: true, cat: null, from: null, to: null, value: L.items[0].v, compound: false };
    if (ing && L.items.length <= 1) return { ok: true, cat: 'cooking', from: null, to: null, value: L.items[0] ? L.items[0].v : null, ingredient: ing, compound: false };
    return { ok: false, reason: 'nounit' };
  }
  // categories every side agrees on
  const sets = [...unitItems.map((x) => x.cands), ...(R ? [R.items[0].cands] : [])];
  let cats = CATS.map((c) => c.id).filter((id) => sets.every((cs) => cs.some((x) => x.cat === id)));
  if (!cats.length) return { ok: false, reason: 'mismatch' };
  let cat;
  if (ing && cats.includes('cooking')) cat = 'cooking';
  else if (hint.cat && cats.includes(hint.cat)) cat = hint.cat;
  else cat = cats[0];
  const pick = (cs) => cs.find((x) => x.cat === cat).unit;
  const c = CAT[cat];
  // bare trailing number after a compound ("5'11", "2 lb 3") → next smaller unit
  const items = [];
  for (const x of L.items) {
    if (x.cands) items.push({ v: x.v, unit: pick(x.cands) });
    else if (items.length && SMALLER[cat] && SMALLER[cat][items[items.length - 1].unit] && x.v != null) items.push({ v: x.v, unit: SMALLER[cat][items[items.length - 1].unit] });
    else if (!items.length && x.v != null) items.push({ v: x.v, unit: null });
    else return { ok: false, reason: 'lhs' };
  }
  let from = items.length ? items[0].unit : null;
  let value = items.length ? items[0].v : null;
  let compound = false;
  if (items.length > 1) {
    if (c.affine || c.sizes || c.kind === 'base' || items.some((x) => x.v == null || !x.unit)) return { ok: false, reason: 'compound' };
    const ks = new Set(items.map((x) => c.map[x.unit].k || ''));
    if (ks.size > 1) return { ok: false, reason: 'compound' };
    // express the total in the smallest unit given (5 ft 11 in → 71 in: exact, no 5.91666…)
    const small = items.reduce((m, x) => (toBase(c.map[x.unit], 1) < toBase(c.map[m.unit], 1) ? x : m), items[0]);
    from = small.unit;
    const sum = items.reduce((acc, x) => acc + toBase(c.map[x.unit], x.v), 0);
    value = fromBase(c.map[from], sum);
    const r = +value.toPrecision(12);
    if (Math.abs(r - value) < 1e-9 * Math.max(1, Math.abs(value))) value = r;
    compound = true;
  }
  let to = R ? pick(R.items[0].cands) : null;
  if (from && to && groupOf(cat, from) !== groupOf(cat, to)) return { ok: false, reason: 'mismatch' };
  if (from && !to) to = compound && cat === 'length' && from !== 'cm' && to !== 'cm' && TO_METRIC_SMALL[from] ? TO_METRIC_SMALL[from] : defaultTarget(cat, from, value);
  const out = { ok: true, cat, from, to, value, compound };
  if (cat === 'cooking') out.ingredient = ing || (from === 'stick' || to === 'stick' ? 'butter' : null);
  return out;
}

/* ---------- canonical query (shareable ?q=) ---------- */
export function queryAlias(cat, id) {
  const x = getUnit(cat, id);
  if (!x) return id;
  if (cat === 'base') return x.radix === 2 ? 'bin' : x.radix === 8 ? 'oct' : x.radix === 10 ? 'dec' : x.radix === 16 ? 'hex' : 'base' + x.radix;
  const a = x.a.find((s) => s[0] !== '=' && !/[()]/.test(s)) || x.a[0].replace(/^=/, '');
  return a;
}
export function toQuery({ cat, from, to, value, ingredient: ing }) {
  if (!cat || !from) return '';
  if (cat === 'base') return `${String(value ?? '').replace(/\s+/g, '') || '0'} ${queryAlias(cat, from)} to ${queryAlias(cat, to)}`;
  const v = typeof value === 'number' && isFinite(value) ? String(+value.toPrecision(15)) : String(value ?? 1);
  const ingTxt = cat === 'cooking' ? ' ' + (ingredient(ing).a[0]) : '';
  return `${v} ${queryAlias(cat, from)}${ingTxt} to ${queryAlias(cat, to)}`;
}
