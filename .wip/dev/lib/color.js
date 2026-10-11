// Color parsing/conversion: hex, rgb, hsl, hwb, oklab, oklch + WCAG contrast. Pure. Colors are {r,g,b,a} with r,g,b in 0..255 (floats).

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const round = (x, d = 0) => { const p = 10 ** d; return Math.round(x * p) / p; };

export const NAMED = {
  black: '#000000', white: '#ffffff', red: '#ff0000', lime: '#00ff00', green: '#008000', blue: '#0000ff', yellow: '#ffff00',
  cyan: '#00ffff', aqua: '#00ffff', magenta: '#ff00ff', fuchsia: '#ff00ff', gray: '#808080', grey: '#808080', silver: '#c0c0c0',
  maroon: '#800000', olive: '#808000', purple: '#800080', teal: '#008080', navy: '#000080', orange: '#ffa500', pink: '#ffc0cb',
  gold: '#ffd700', indigo: '#4b0082', violet: '#ee82ee', coral: '#ff7f50', salmon: '#fa8072', tomato: '#ff6347', crimson: '#dc143c',
  turquoise: '#40e0d0', skyblue: '#87ceeb', steelblue: '#4682b4', slategray: '#708090', rebeccapurple: '#663399', hotpink: '#ff69b4',
  chocolate: '#d2691e', tan: '#d2b48c', beige: '#f5f5dc', ivory: '#fffff0', lavender: '#e6e6fa', khaki: '#f0e68c', orchid: '#da70d6',
  plum: '#dda0dd', mintcream: '#f5fffa', dodgerblue: '#1e90ff', royalblue: '#4169e1', seagreen: '#2e8b57', forestgreen: '#228b22',
  firebrick: '#b22222', darkorange: '#ff8c00', deeppink: '#ff1493', midnightblue: '#191970', transparent: '#00000000',
};

function num(s, scale = 1, pctOf = 100) {
  s = String(s).trim();
  if (s.endsWith('%')) return parseFloat(s) / 100 * pctOf;
  if (s === 'none') return 0;
  const v = parseFloat(s);
  if (!Number.isFinite(v)) throw new Error(`"${s}" isn't a number`);
  return v * scale;
}
function hue(s) {
  s = String(s).trim();
  const v = parseFloat(s);
  if (!Number.isFinite(v)) { if (s === 'none') return 0; throw new Error(`Bad hue "${s}"`); }
  if (s.endsWith('turn')) return v * 360;
  if (s.endsWith('grad')) return v * 0.9;
  if (s.endsWith('rad') && !s.endsWith('grad')) return v * 180 / Math.PI;
  return v;
}
function args(body) {
  const [main, alpha] = body.split('/');
  const parts = main.trim().split(/[\s,]+/).filter(Boolean);
  if (alpha !== undefined) parts.push(alpha.trim());
  return parts;
}

export function parseColor(input) {
  let s = String(input).trim().toLowerCase();
  if (!s) throw new Error('Empty');
  if (NAMED[s]) s = NAMED[s];
  if (/^#?[0-9a-f]{3,8}$/.test(s) && [3, 4, 6, 8].includes(s.replace('#', '').length)) {
    let h = s.replace('#', '');
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  }
  const m = s.match(/^([a-z]+)\(\s*(.*?)\s*\)$/);
  if (!m) throw new Error('Try #8b5cf6, rgb(…), hsl(…), oklch(…) or a color name');
  const [, fn, body] = m;
  const p = args(body);
  const alpha = (i) => p[i] !== undefined ? clamp(num(p[i], 1, 1)) : 1;
  if (fn === 'rgb' || fn === 'rgba') {
    if (p.length < 3) throw new Error('rgb() needs 3 values');
    return { r: clamp(num(p[0], 1, 255), 0, 255), g: clamp(num(p[1], 1, 255), 0, 255), b: clamp(num(p[2], 1, 255), 0, 255), a: alpha(3) };
  }
  if (fn === 'hsl' || fn === 'hsla') {
    if (p.length < 3) throw new Error('hsl() needs 3 values');
    return { ...hslToRgb(hue(p[0]), clamp(num(p[1]) / 100), clamp(num(p[2]) / 100)), a: alpha(3) };
  }
  if (fn === 'hwb') {
    return { ...hwbToRgb(hue(p[0]), clamp(num(p[1]) / 100), clamp(num(p[2]) / 100)), a: alpha(3) };
  }
  if (fn === 'oklch') {
    const L = p[0].endsWith('%') ? parseFloat(p[0]) / 100 : num(p[0]);
    const C = p[1].endsWith('%') ? parseFloat(p[1]) / 100 * 0.4 : num(p[1]);
    return { ...oklchToRgb(L, C, hue(p[2])), a: alpha(3) };
  }
  if (fn === 'oklab') {
    const L = p[0].endsWith('%') ? parseFloat(p[0]) / 100 : num(p[0]);
    const A = p[1].endsWith('%') ? parseFloat(p[1]) / 100 * 0.4 : num(p[1]);
    const B = p[2].endsWith('%') ? parseFloat(p[2]) / 100 * 0.4 : num(p[2]);
    return { ...oklabToRgb(L, A, B), a: alpha(3) };
  }
  throw new Error(`${fn}() isn't supported here`);
}

export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
}
export function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s, l };
}
function hwbToRgb(h, w, bl) {
  if (w + bl >= 1) { const g = w / (w + bl) * 255; return { r: g, g, b: g }; }
  const c = hslToRgb(h, 1, 0.5);
  const f = (x) => (x / 255 * (1 - w - bl) + w) * 255;
  return { r: f(c.r), g: f(c.g), b: f(c.b) };
}

const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const fromLin = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function rgbToOklab({ r, g, b }) {
  const R = toLin(r), G = toLin(g), B = toLin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  };
}
/** -> {r,g,b, inGamut} (clipped) */
export function oklabToRgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
  const inGamut = lin.every((x) => x >= -1e-4 && x <= 1 + 1e-4);
  const [R, G, B] = lin.map((x) => clamp(fromLin(clamp(x)), 0, 255));
  return { r: R, g: G, b: B, inGamut };
}
export function rgbToOklch(c) {
  const { L, a, b } = rgbToOklab(c);
  const C = Math.sqrt(a * a + b * b);
  let h = Math.atan2(b, a) * 180 / Math.PI; if (h < 0) h += 360;
  return { L, C, h: C < 1e-4 ? 0 : h };
}
export function oklchToRgb(L, C, h) {
  const r = h * Math.PI / 180;
  return oklabToRgb(L, C * Math.cos(r), C * Math.sin(r));
}

const hx = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
export function toHex(c, { alpha = 'auto' } = {}) {
  const base = '#' + hx(c.r) + hx(c.g) + hx(c.b);
  return (alpha === true || (alpha === 'auto' && c.a < 1)) ? base + hx(c.a * 255) : base;
}
const aStr = (a) => a < 1 ? ` / ${round(a * 100)}%` : '';
export function formats(c) {
  const hsl = rgbToHsl(c);
  const lch = rgbToOklch(c);
  const lab = rgbToOklab(c);
  return {
    hex: toHex(c),
    rgb: `rgb(${Math.round(c.r)} ${Math.round(c.g)} ${Math.round(c.b)}${aStr(c.a)})`,
    hsl: `hsl(${round(hsl.h)} ${round(hsl.s * 100)}% ${round(hsl.l * 100)}%${aStr(c.a)})`,
    oklch: `oklch(${round(lch.L * 100, 1)}% ${round(lch.C, 3)} ${round(lch.h, 1)}${aStr(c.a)})`,
    oklab: `oklab(${round(lab.L * 100, 1)}% ${round(lab.a, 3)} ${round(lab.b, 3)}${aStr(c.a)})`,
    rgbLegacy: c.a < 1 ? `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${round(c.a, 2)})` : `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`,
  };
}

export function luminance({ r, g, b }) { return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b); }
/** blend fg (with alpha) over an opaque bg */
export function over(fg, bg) { const a = fg.a ?? 1; return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 }; }
export function contrast(fg, bg) {
  const f = over(fg, bg);
  const L1 = luminance(f), L2 = luminance(bg);
  const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  return { ratio, aa: ratio >= 4.5, aaLarge: ratio >= 3, aaa: ratio >= 7, aaaLarge: ratio >= 4.5, ui: ratio >= 3 };
}
export function looksLikeColor(s) {
  const t = String(s).trim();
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(t)) return true;
  if (/^(rgba?|hsla?|hwb|oklch|oklab)\(.*\)$/i.test(t)) { try { parseColor(t); return true; } catch { return false; } }
  return false;
}
