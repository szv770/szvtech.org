/* Shiurim data: the ONE place the numbers live.
   Every figure below was read from a published source (see SOURCES). Where no
   figure could be verified for an opinion the cell is simply absent and the UI
   shows "—". Nothing here is invented or "filled in".
   Volumes are millilitres (ml); lengths are centimetres (cm).
   Chabad.org treats 1 gram of water as 1 ml, so ml is shown as "g of water" too. */

export const SOURCES = {
  hp: { name: 'Halachipedia: Reference of Measurements in Halacha', url: 'https://halachipedia.com/index.php?title=Reference_of_Measurements_in_Halacha' },
  cbz: { name: 'Chabad.org: What is a Kezayit?', url: 'https://www.chabad.org/library/article_cdo/aid/7226278/jewish/What-is-a-Kezayit.htm' },
  cseder: { name: 'Chabad.org: Seder Preparations, Requirements, Measurements and Recommendations', url: 'https://www.chabad.org/library/article_cdo/aid/2833752/jewish/Seder-Preparations-Requirements-Measurements-And-Recommendations.htm' },
  sah: { name: 'Shulchan Aruch HaRav (shulchanaruchharav.com): How much is a Revius?', url: 'https://shulchanaruchharav.com/halacha/2-how-much-is-a-revius/' },
  ratio: { name: 'Standard Talmudic ratios (Wikipedia: Biblical and Talmudic units of measurement)', url: 'https://en.wikipedia.org/wiki/Biblical_and_Talmudic_units_of_measurement' },
};

export const OPINIONS = [
  { id: 'naeh', name: 'Rav Chaim Naeh', short: 'Chaim Naeh', sub: 'Shiurei Torah. The widespread custom.' },
  { id: 'chabad', name: 'Chabad.org guide', short: 'Chabad.org', sub: 'As Chabad.org publishes for the Seder.' },
  { id: 'chazon', name: 'Chazon Ish', short: 'Chazon Ish', sub: 'The larger, stricter measures.' },
  { id: 'moshe', name: 'Rav Moshe Feinstein', short: 'R. Moshe', sub: 'Lengths only (no verified volumes here).' },
];

/* Base figures that were published directly. */
const VOL_BASE = {
  kezayis: {
    naeh: { v: 27, s: ['hp', 'cseder'] },       // Halachipedia: 27 cc (28.8 cc in the earlier Shiurei Torah)
    chabad: { v: 27, s: ['cseder'] },           // Chabad.org Seder guide: 1 oz, 27 g
    chazon: { v: 33.3, s: ['hp'] },
  },
  kebeitza: {
    naeh: { v: 54, s: ['hp', 'cbz'] },          // about 54 cc without the shell
    chazon: { v: 100, s: ['hp', 'cbz'] },
  },
  revis: {
    naeh: { v: 86.4, s: ['sah'] },              // 86.4 ml = 2.92 fl oz
    chabad: { v: 86, s: ['cseder'] },           // 86 g, about 3 oz
    chazon: { v: 150, s: ['hp'] },              // 150 g
  },
};
/* Lengths (cm), the standard (smaller) measures. */
const LEN_BASE = {
  etzba: { naeh: 2, chazon: 2.41, moshe: 2.25 },
  tefach: { naeh: 8, chazon: 9.62, moshe: 9.0 },
  amah: { naeh: 48, chazon: 57.72, moshe: 53.98 },
};

/* Rows. `from` = derived from another row by `mult` (a Talmudic ratio). */
export const ROWS = [
  { id: 'kezayis', kind: 'vol', en: 'Kezayis', he: 'כזית', hint: 'olive-size', base: VOL_BASE.kezayis },
  { id: 'kebeitza', kind: 'vol', en: 'Kebeitza', he: 'כביצה', hint: 'egg-size, without the shell', base: VOL_BASE.kebeitza },
  { id: 'revis', kind: 'vol', en: 'Revi’is', he: 'רביעית', hint: 'a cup of wine or grape juice', base: VOL_BASE.revis },
  { id: 'log', kind: 'vol', en: 'Log', he: 'לוג', hint: '4 revi’is', from: 'revis', mult: 4 },
  { id: 'kav', kind: 'vol', en: 'Kav', he: 'קב', hint: '4 log', from: 'revis', mult: 16 },
  { id: 'omer', kind: 'vol', en: 'Omer (Issaron)', he: 'עומר', hint: '¹⁄₁₀ ephah', from: 'revis', mult: 28.8 },
  { id: 'seah', kind: 'vol', en: 'Seah', he: 'סאה', hint: '6 kav', from: 'revis', mult: 96 },
  { id: 'ephah', kind: 'vol', en: 'Ephah', he: 'איפה', hint: '3 seah', from: 'revis', mult: 288 },
  { id: 'etzba', kind: 'len', en: 'Etzba', he: 'אצבע', hint: 'thumb-width', lenBase: LEN_BASE.etzba },
  { id: 'tefach', kind: 'len', en: 'Tefach', he: 'טפח', hint: 'handbreadth', lenBase: LEN_BASE.tefach },
  { id: 'amah', kind: 'len', en: 'Amah', he: 'אמה', hint: 'cubit, 6 tefachim', lenBase: LEN_BASE.amah },
  { id: 'ris', kind: 'len', en: 'Ris', he: 'ריס', hint: '²⁄₁₅ mil', fromLen: 'amah', mult: 2000 * 2 / 15 },
  { id: 'mil', kind: 'len', en: 'Mil', he: 'מיל', hint: '2,000 amos', fromLen: 'amah', mult: 2000 },
  { id: 'parsah', kind: 'len', en: 'Parsah', he: 'פרסה', hint: '4 mil', fromLen: 'amah', mult: 8000 },
];

/* Time-based measures (not tied to one opinion). */
export const TIMES = [
  { en: 'Walking a mil', val: '18 min', alt: '22.5 min (Gra) · 24 min (Rambam, in Korban Pesach)', src: ['hp'], note: '18 min per Shulchan Aruch, Rambam and Trumas HaDeshen.' },
  { en: 'Eating a kezayis at the Seder', val: 'under 4 min', alt: 'up to 6–7 min if that is hard', src: ['cseder'], note: 'The practical guidance Chabad.org gives for matzah, maror and the cups.' },
];

export const NOTES = [
  'The published figures for Rav Chaim Naeh differ slightly between sources (for example a kebeitza of about 54 cc without the shell, and about 57.6 cc with it; a revi’is of 86 to 86.4 ml). We show each as published.',
  'Grams of water: 1 ml of water weighs 1 gram. Other liquids and foods differ.',
  'Chabad customs for the revi’is are recorded in a range of larger figures too (published as roughly 99 to 123 ml). We could not tie each number to a named source, so they are not shown as a column. Ask your Rav which to follow.',
  'Rav Moshe Feinstein: only the length measures were verified here, so volumes show —.',
];

NOTES.push('Ratios used for calculated cells: log = 4 revi\u2019is, kav = 4 log, seah = 6 kav, ephah = 3 seah, omer = \u00b9\u2044\u2081\u2080 ephah; amah = 6 tefach = 24 etzba, mil = 2,000 amos, ris = \u00b2\u2044\u2081\u2085 mil, parsah = 4 mil.');

const RM = Object.fromEntries(ROWS.map((r) => [r.id, r]));
export const row = (id) => RM[id];

/** A cell: { v, derived, src: [keys] } or null when nothing verified. */
export function cell(rowId, opId) {
  const r = RM[rowId]; if (!r) return null;
  if (r.base) { const b = r.base[opId]; return b ? { v: b.v, derived: false, src: b.s } : null; }
  if (r.lenBase) { const v = r.lenBase[opId]; return v == null ? null : { v, derived: false, src: opId === 'moshe' || opId === 'naeh' || opId === 'chazon' ? ['hp'] : [] }; }
  if (r.from) { const b = cell(r.from, opId); return b ? { v: b.v * r.mult, derived: true, src: [...b.src, 'ratio'] } : null; }
  if (r.fromLen) { const b = cell(r.fromLen, opId); return b ? { v: b.v * r.mult, derived: true, src: [...b.src, 'ratio'] } : null; }
  return null;
}
