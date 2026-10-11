// /net — canvas drawing: ping sparkline + histogram.
import { clamp } from '/net/stats.js?v=df6c47bf1f';

export function rgba(rgb, a) { return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`; }

const ctxs = new WeakMap();
// Size a canvas to its CSS box at device resolution. Returns {ctx, w, h} in CSS px.
// Sizes come from a ResizeObserver, so drawing never forces a synchronous layout
// (cheap redraws, no layout thrash).
const sizes = new WeakMap();
const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((es) => {
  for (const e of es) { sizes.set(e.target, { width: e.contentRect.width, height: e.contentRect.height }); const cb = onResize.get(e.target); if (cb) cb(); }
}) : null;
const onResize = new WeakMap();
export function watchSize(cv, cb) { if (ro) { onResize.set(cv, cb); ro.observe(cv); } }
export function fit(cv) {
  const r = sizes.get(cv) || cv.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  }
  let ctx = ctxs.get(cv);
  if (!ctx) { ctx = cv.getContext('2d'); ctxs.set(cv, ctx); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function grid(ctx, w, h, rows) {
  ctx.strokeStyle = 'rgba(255,255,255,0.045)'; ctx.lineWidth = 1;
  for (let i = 1; i < rows; i++) { const y = Math.round(h * i / rows) + 0.5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
}

// Ping sparkline: samples [{rtt|null, loaded}], newest last; fixed capacity cap.
export function drawSpark(cv, { samples, cap = 90, pal }) {
  const { ctx, w, h } = fit(cv);
  grid(ctx, w, h, 4);
  const vals = samples.filter((s) => s.rtt != null).map((s) => s.rtt);
  if (!vals.length) return;
  const sorted = [...vals].sort((a, b) => a - b);
  const vmax = Math.max(20, sorted[Math.floor(sorted.length * 0.98)] * 1.25);
  const bw = w / cap, n = samples.length;
  for (let i = 0; i < n; i++) {
    const s = samples[i], x = w - (n - i) * bw;
    if (s.rtt == null) { ctx.fillStyle = 'rgba(251,113,133,0.75)'; ctx.fillRect(x + bw * 0.2, h - 6, Math.max(1, bw * 0.6), 6); continue; }
    const v = Math.min(s.rtt, vmax), bh = Math.max(2, (h - 8) * v / vmax);
    const rgb = s.loaded ? pal.rgb.a3 : pal.rgb.a2;
    const g = ctx.createLinearGradient(0, h - bh, 0, h);
    g.addColorStop(0, rgba(rgb, 0.85)); g.addColorStop(1, rgba(rgb, 0.12));
    ctx.fillStyle = g;
    ctx.fillRect(x + bw * 0.18, h - bh, Math.max(1, bw * 0.64), bh);
  }
  // avg line
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const y = h - (h - 8) * Math.min(avg, vmax) / vmax;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); ctx.setLineDash([]);
  ctx.font = '500 9.5px "JetBrains Mono", monospace'; ctx.fillStyle = 'rgba(226,224,255,0.45)'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(Math.round(vmax) + ' ms', 6, 5);
}

export function drawHisto(cv, { samples, pal }) {
  const { ctx, w, h } = fit(cv);
  const vals = samples.filter((s) => s.rtt != null).map((s) => s.rtt);
  if (vals.length < 2) return null;
  const s = [...vals].sort((a, b) => a - b);
  const lo = Math.floor(s[0]), hi = Math.ceil(Math.max(s[Math.floor(s.length * 0.98)], lo + 4));
  const bins = Math.max(8, Math.min(40, Math.floor(w / 9)));
  const counts = new Array(bins).fill(0);
  for (const v of vals) counts[clamp(Math.floor((v - lo) / (hi - lo) * bins), 0, bins - 1)]++;
  const cmax = Math.max(...counts), bw = w / bins;
  for (let i = 0; i < bins; i++) {
    if (!counts[i]) continue;
    const bh = Math.max(2, (h - 6) * counts[i] / cmax);
    const t = i / (bins - 1);
    const rgb = mix(pal.rgb.a2, pal.rgb.a3, t);
    ctx.fillStyle = rgba(rgb, 0.85);
    ctx.fillRect(i * bw + 1, h - bh, Math.max(1, bw - 2), bh);
  }
  return { lo, hi };
}
function mix(a, b, t) { return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)); }
