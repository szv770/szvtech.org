// /net — small pure helpers (no DOM), shared by the page and its tests.

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function median(a) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function mean(a) {
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
}

// linear-interpolated percentile, p in [0, 1]
export function percentile(a, p) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const i = clamp(p, 0, 1) * (s.length - 1), lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

// jitter = mean absolute difference between consecutive samples (RFC 3550 style, unsmoothed)
export function jitter(a) {
  if (a.length < 2) return 0;
  let s = 0;
  for (let i = 1; i < a.length; i++) s += Math.abs(a[i] - a[i - 1]);
  return s / (a.length - 1);
}

export function fmtBytes(n) {
  if (!Number.isFinite(n)) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return (i ? n.toFixed(n >= 100 ? 0 : 1) : n) + ' ' + u[i];
}

export function fmtTtl(s) {
  if (!Number.isFinite(s)) return '—';
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm' + (s % 60 ? ' ' + (s % 60) + 's' : '');
  if (s < 86400) return Math.floor(s / 3600) + 'h' + (s % 3600 >= 60 ? ' ' + Math.floor((s % 3600) / 60) + 'm' : '');
  return Math.floor(s / 86400) + 'd' + (s % 86400 >= 3600 ? ' ' + Math.floor((s % 86400) / 3600) + 'h' : '');
}

// "example.com" / "https://Example.com/path" / "bücher.de" -> ASCII hostname, or null
export function normDomain(input) {
  let s = String(input || '').trim();
  if (!s || s.length > 300) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/[/?#].*$/, '').replace(/^.*@/, '').replace(/:\d+$/, '').replace(/\.$/, '');
  if (!s) return null;
  let host;
  try { host = new URL('http://' + s).hostname; } catch { return null; }
  host = host.toLowerCase();
  if (host.length > 253 || !/^[a-z0-9_.-]+$/.test(host)) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {   // an IPv4 -> reverse lookup name
    return host.split('.').reverse().join('.') + '.in-addr.arpa';
  }
  const labels = host.split('.');
  if (labels.some((l) => !l || l.length > 63 || /^-|-$/.test(l))) return null;
  return host;
}

export const DNS_TYPES = { 1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 12: 'PTR', 15: 'MX', 16: 'TXT', 28: 'AAAA', 33: 'SRV', 46: 'RRSIG', 65: 'HTTPS', 257: 'CAA' };
export const DNS_STATUS = { 0: 'NOERROR', 1: 'FORMERR', 2: 'SERVFAIL', 3: 'NXDOMAIN', 4: 'NOTIMP', 5: 'REFUSED' };

/* ---- speed-test helpers (used by the parked net/speed.js + net/speed-card.js) ---- */

// Throughput from a timeline of cumulative byte counts [{t (ms), b (bytes)}].
// Skips the ramp-up (TCP slow start, first-request latency): measures from
// `skip` (fraction of the duration, capped at maxSkipMs) to the end, by
// difference, so a constant offset (e.g. bytes parked in the upload socket
// buffer) cancels out. Returns bits per second.
export function throughput(tl, { skip = 0.25, maxSkipMs = 1500 } = {}) {
  if (!tl || tl.length < 2) return 0;
  const t0 = tl[0].t, t1 = tl[tl.length - 1].t, dur = t1 - t0;
  if (dur <= 0) return 0;
  const cut = t0 + Math.min(dur * skip, maxSkipMs);
  let a = tl[0];
  for (const p of tl) { if (p.t <= cut) a = p; else break; }
  const z = tl[tl.length - 1];
  if (z.t - a.t < Math.max(150, dur * 0.3)) a = tl[0];   // too short to trim: use it all
  const dt = (z.t - a.t) / 1000;
  return dt > 0 ? ((z.b - a.b) * 8) / dt : 0;
}

// Rate over the trailing window ending at the last point (bits/s), for the live gauge.
export function windowRate(tl, winMs = 1000) {
  if (!tl || tl.length < 2) return 0;
  const z = tl[tl.length - 1];
  let a = tl[0];
  for (let i = tl.length - 1; i >= 0; i--) { if (z.t - tl[i].t >= winMs) { a = tl[i]; break; } a = tl[i]; }
  const dt = (z.t - a.t) / 1000;
  return dt > 0 ? ((z.b - a.b) * 8) / dt : 0;
}

// Next request size for one stream: aim for ~targetMs per request at the
// rate this stream just saw, within [min, max] and never past the budget.
export function nextChunk(bytesPerSec, { targetMs = 900, min = 128 * 1024, max = 25 * 1024 * 1024, left = Infinity } = {}) {
  const want = Number.isFinite(bytesPerSec) && bytesPerSec > 0 ? bytesPerSec * targetMs / 1000 : min;
  return Math.max(0, Math.min(Math.round(clamp(want, min, max)), Math.floor(left)));
}

export function fmtMbps(bps) {
  const m = bps / 1e6;
  if (!Number.isFinite(m) || m <= 0) return '0';
  if (m >= 1000) return (m / 1000).toFixed(m >= 10000 ? 1 : 2);
  if (m >= 100) return m.toFixed(0);
  if (m >= 10) return m.toFixed(1);
  return m.toFixed(2);
}
export const unitMbps = (bps) => (bps / 1e6 >= 1000 ? 'Gbps' : 'Mbps');

// Gauge scale: piecewise-linear between these marks (Mbps), like the speed-test dials people know.
export const MARKS = [0, 1, 5, 10, 25, 50, 100, 250, 500, 1000];
export function gaugePos(mbps) {
  if (!(mbps > 0)) return 0;
  const n = MARKS.length - 1;
  for (let i = 1; i <= n; i++) {
    if (mbps <= MARKS[i]) return (i - 1 + (mbps - MARKS[i - 1]) / (MARKS[i] - MARKS[i - 1])) / n;
  }
  return 1;
}
