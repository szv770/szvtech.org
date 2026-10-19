// Pure page logic for /dev (no DOM): tab registry, smart-paste routing, palettes, small formatters.
import { rgbToHsl, hslToRgb, rgbToOklch, oklchToRgb, toHex, contrast } from './lib/color.js?v=a4e78c5a3d';

/** Every tab, in display order. `icon` is a key into ICONS in ui.js. */
export const TABS = [
  { id: 'encode', label: 'Encode', blurb: 'Base64, URL, HTML, hex' },
  { id: 'json', label: 'JSON', blurb: 'Format, validate, minify' },
  { id: 'hash', label: 'Hash', blurb: 'MD5, SHA, HMAC' },
  { id: 'ids', label: 'IDs', blurb: 'UUID, ULID, passwords' },
  { id: 'color', label: 'Color', blurb: 'Picker, palette, contrast' },
  { id: 'regex', label: 'Regex', blurb: 'Test patterns live' },
  { id: 'text', label: 'Text', blurb: 'Diff, case, counts' },
  { id: 'time', label: 'Time', blurb: 'Timestamps and zones' },
  { id: 'jwt', label: 'JWT', blurb: 'Decode a token' },
  { id: 'cron', label: 'Cron', blurb: 'Explain a schedule' },
  { id: 'base', label: 'Bases', blurb: 'Binary, hex, decimal' },
];
export const TAB_IDS = TABS.map((t) => t.id);

/** Which tab (and which mode inside it) a detect() tool name should open. */
export function routeFor(tool) {
  switch (tool) {
    case 'jwt': return { tab: 'jwt' };
    case 'ids': return { tab: 'ids' };
    case 'json': return { tab: 'json' };
    case 'time': return { tab: 'time' };
    case 'cron': return { tab: 'cron' };
    case 'color': return { tab: 'color' };
    case 'url': return { tab: 'encode', mode: 'url', dir: 'decode' };
    case 'html': return { tab: 'encode', mode: 'html', dir: 'decode' };
    case 'base64': return { tab: 'encode', mode: 'base64', dir: 'decode' };
    case 'base': return { tab: 'base' };
    case 'hash': return { tab: 'hash' };
    case 'regex': return { tab: 'regex' };
    case 'yaml': return { tab: 'text', mode: 'count' };
    case 'case': return { tab: 'text', mode: 'case' };
    default: return null;
  }
}

/** Turn detect() output into suggestion chips with a route; unknown tools are dropped; max 4. */
export function suggestions(found) {
  const out = [];
  for (const f of found || []) {
    const r = routeFor(f.tool);
    if (!r) continue;
    out.push({ ...f, route: r, key: r.tab + (r.mode || '') });
    if (out.length >= 4) break;
  }
  return out;
}

/** Pick the starting tab: URL hash wins, then the remembered one, then the first. */
export function pickTab(hash, saved) {
  const h = String(hash || '').replace(/^#/, '');
  if (TAB_IDS.includes(h)) return h;
  if (TAB_IDS.includes(saved)) return saved;
  return TAB_IDS[0];
}

/* ---------------------------------------------------------------- palettes */
const hexOf = (c) => toHex({ r: c.r, g: c.g, b: c.b, a: 1 });

export const HARMONIES = [
  { id: 'complement', label: 'Complement', offsets: [0, 180] },
  { id: 'analogous', label: 'Analogous', offsets: [-30, 0, 30] },
  { id: 'triad', label: 'Triad', offsets: [0, 120, 240] },
  { id: 'split', label: 'Split', offsets: [0, 150, 210] },
  { id: 'tetrad', label: 'Tetrad', offsets: [0, 90, 180, 270] },
];

/** Hue-rotated companions of a colour (HSL), as hex strings. First item is the input colour. */
export function harmony(rgb, id) {
  const h = HARMONIES.find((x) => x.id === id);
  if (!h) throw new Error('Unknown harmony ' + id);
  const hsl = rgbToHsl(rgb);
  const offs = [...h.offsets];
  if (!offs.includes(0)) offs.unshift(0);
  return offs.map((o) => (o === 0 ? hexOf(rgb) : hexOf(hslToRgb(hsl.h + o, hsl.s, hsl.l))));
}

/** n steps from light to dark at constant hue/chroma (OKLCH lightness 0.96 -> 0.18). */
export function shades(rgb, n = 9) {
  const { C, h } = rgbToOklch(rgb);
  const out = [];
  for (let i = 0; i < n; i++) {
    const L = 0.96 - (0.78 * i) / (n - 1);
    // chroma eases off at the extremes so light/dark ends stay in gamut
    const k = Math.sin(Math.PI * (0.12 + 0.76 * (i / (n - 1))));
    out.push(hexOf(oklchToRgb(L, C * Math.min(1, k * 1.15), h)));
  }
  return out;
}

/** Black or white, whichever reads better on the colour. */
export function readableOn(rgb) {
  const w = contrast({ r: 255, g: 255, b: 255, a: 1 }, { ...rgb, a: 1 }).ratio;
  const b = contrast({ r: 0, g: 0, b: 0, a: 1 }, { ...rgb, a: 1 }).ratio;
  return w >= b ? '#ffffff' : '#000000';
}

/** Verdict label for a contrast ratio. */
export function contrastGrade(ratio) {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA Large';
  return 'Fail';
}

/* ---------------------------------------------------------------- small formatters */
export function fmtBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return n + ' B';
  const u = ['KB', 'MB', 'GB'];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (v < 10 ? v.toFixed(1) : Math.round(v)) + ' ' + u[i];
}

/** Reading time for a word count (200 wpm), e.g. "1 min", "< 1 min". */
export function readingTime(words) {
  if (!words) return '0 min';
  const m = words / 200;
  return m < 1 ? '< 1 min' : Math.round(m) + ' min';
}

/** Escape for innerHTML. */
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Quick lengths of the tokens a text diff/regex needs: trims huge inputs for display. */
export function clip(s, max = 4000) {
  const t = String(s);
  return t.length > max ? { text: t.slice(0, max), clipped: t.length - max } : { text: t, clipped: 0 };
}

/* ---------------------------------------------------------------- diff view */
/**
 * Rows for a line diff with long unchanged runs folded away.
 * chunks: [{op:'='|'-'|'+', items:[line]}] -> [{type:'same'|'add'|'del'|'gap', text, n?}]
 * A gap row has n = how many unchanged lines were folded.
 */
export function lineRows(chunks, context = 2) {
  const flat = [];
  for (const c of chunks) for (const t of c.items) flat.push({ type: c.op === '=' ? 'same' : c.op === '+' ? 'add' : 'del', text: t });
  const keep = new Array(flat.length).fill(false);
  flat.forEach((r, i) => {
    if (r.type === 'same') return;
    for (let k = Math.max(0, i - context); k <= Math.min(flat.length - 1, i + context); k++) keep[k] = true;
  });
  const out = [];
  let skipped = 0;
  const allSame = flat.every((r) => r.type === 'same');
  flat.forEach((r, i) => {
    if (keep[i] || allSame && flat.length <= 12) {
      if (skipped) { out.push({ type: 'gap', text: '', n: skipped }); skipped = 0; }
      out.push(r);
    } else skipped++;
  });
  if (skipped) out.push({ type: 'gap', text: '', n: skipped });
  return out;
}
