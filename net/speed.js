// /net — speed test engine (talks to /api/speed and /api/now).
// PARKED: nothing imports this file; see net/SPEED.md to turn the speed test back on.
//
// Phases: ping (sequential small requests) -> download (parallel streams of
// GET /api/speed?bytes=N, counted as the bytes arrive) -> upload (parallel
// XHR POSTs, counted from upload progress events). Every phase stops at its
// time limit or byte budget, whichever comes first. Throughput is measured by
// difference after the ramp-up (see stats.throughput), sampled every 100 ms.
import { median, jitter, throughput, windowRate, nextChunk } from '/net/stats.js';

export const PRESETS = {
  quick:    { pings: 8,  down: { ms: 5000, budget: 15e6, streams: 3 }, up: { ms: 5000, budget: 6e6, streams: 2 } },
  standard: { pings: 14, down: { ms: 8000, budget: 50e6, streams: 4 }, up: { ms: 8000, budget: 20e6, streams: 3 } },
};
const MAX_DOWN = 25 * 1024 * 1024;   // api/speed.js cap
const MAX_UP = 4_000_000;            // Vercel rejects request bodies over ~4.5 MB
const SAFE_DOWN = 4 * 1024 * 1024;   // fallback if big responses fail
const pnow = () => performance.now();
const rnd = () => Math.random().toString(36).slice(2, 10);

// RTT of one tiny request, ms (headers in). Resource Timing when available
// (excludes queueing), fetch timing otherwise. null on failure.
export async function pingOnce(timeout = 3000, signal) {
  const url = new URL('/api/now?r=' + rnd(), location.href).href;
  const ctl = new AbortController();
  const kill = setTimeout(() => ctl.abort(), timeout);
  const onAbort = () => ctl.abort();
  if (signal) signal.addEventListener('abort', onAbort, { once: true });
  try {
    const d0 = Date.now(), p0 = pnow();
    const r = await fetch(url, { cache: 'no-store', signal: ctl.signal });
    const p1 = pnow();
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    let rtt = p1 - p0;
    try {
      const e = performance.getEntriesByName(url).pop();
      if (e && e.responseStart > 0 && e.requestStart > 0 && e.responseStart >= e.requestStart) rtt = Math.min(rtt, Math.max(0.1, e.responseStart - e.requestStart));
      if (performance.getEntriesByType('resource').length > 150) performance.clearResourceTimings();
    } catch { /* no resource timing */ }
    const offset = j && Number.isFinite(j.t) ? j.t + 0.5 - (d0 + (p1 - p0) / 2) : null;
    return { rtt, offset, wire: p1 - p0 };
  } catch { return null; } finally {
    clearTimeout(kill);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

let upBlob = null;
function uploadBody(size) {
  if (!upBlob) {
    const buf = new Uint8Array(1 << 20);
    for (let i = 0; i < buf.length; i += 65536) crypto.getRandomValues(buf.subarray(i, i + 65536));
    upBlob = buf;
  }
  const parts = [];
  let left = size;
  while (left > 0) { const n = Math.min(left, upBlob.length); parts.push(n === upBlob.length ? upBlob : upBlob.subarray(0, n)); left -= n; }
  return new Blob(parts, { type: 'application/octet-stream' });
}

function xhrUpload(size, onDelta, register) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    let sent = 0;
    register(() => x.abort());
    x.open('POST', '/api/speed?r=' + rnd());
    x.setRequestHeader('Content-Type', 'application/octet-stream');
    x.upload.onprogress = (e) => { const d = e.loaded - sent; if (d > 0) { sent = e.loaded; onDelta(d); } };
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) { if (size > sent) { onDelta(size - sent); sent = size; } resolve(sent); }
      else reject(Object.assign(new Error('HTTP ' + x.status), { status: x.status, sent }));
    };
    x.onerror = () => reject(Object.assign(new Error('network'), { sent }));
    x.onabort = () => reject(Object.assign(new Error('abort'), { abort: true, sent }));
    x.send(uploadBody(size));
  });
}

async function fetchDown(size, onDelta, register) {
  const ctl = new AbortController();
  register(() => ctl.abort());
  let got = 0;
  try {
    const r = await fetch(`/api/speed?bytes=${size}&r=${rnd()}`, { cache: 'no-store', signal: ctl.signal });
    if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status });
    if (r.body && r.body.getReader) {
      const rd = r.body.getReader();
      for (;;) { const { done, value } = await rd.read(); if (done) break; got += value.length; onDelta(value.length); }
    } else {
      const b = await r.arrayBuffer(); got = b.byteLength; onDelta(got);
    }
    return got;
  } catch (e) { e.sent = got; if (ctl.signal.aborted) e.abort = true; throw e; }
}

// One transfer direction. Returns { bps, bytes, ms, timeline }.
async function transfer(dir, cfg, { signal, onSample }) {
  const tl = [{ t: 0, b: 0 }];
  const t0 = pnow(), deadline = t0 + cfg.ms;
  let total = 0, issued = 0, errors = 0, maxChunk = dir === 'down' ? MAX_DOWN : MAX_UP, stopped = false, fatal = null;
  const killers = new Set();
  const stopAll = () => { stopped = true; killers.forEach((k) => { try { k(); } catch {} }); };
  const timer = setTimeout(stopAll, cfg.ms);
  const onAbort = () => stopAll();
  signal.addEventListener('abort', onAbort, { once: true });
  const sampler = setInterval(() => {
    tl.push({ t: pnow() - t0, b: total });
    onSample({ dir, bps: windowRate(tl, 1000), bytes: total, frac: Math.min(1, (pnow() - t0) / cfg.ms), tl });
  }, 100);

  async function stream(i) {
    if (i) await new Promise((r) => setTimeout(r, i * 120)); // stagger stream start
    let rate = null;
    while (!stopped && pnow() < deadline - 150 && issued < cfg.budget) {
      const size = nextChunk(rate, { min: rate === null ? 256 * 1024 : 128 * 1024, max: maxChunk, left: cfg.budget - issued, targetMs: 900 });
      if (size < 1024) break;
      issued += size;
      const s0 = pnow();
      let kill;
      const register = (k) => { kill = k; killers.add(k); };
      try {
        const n = dir === 'down' ? await fetchDown(size, (d) => { total += d; }, register)
                                 : await xhrUpload(size, (d) => { total += d; }, register);
        rate = n / Math.max(0.001, (pnow() - s0) / 1000);
      } catch (e) {
        issued -= size - (e.sent || 0);
        if (e.abort || stopped) break;
        errors++;
        if (dir === 'down' && size > SAFE_DOWN) maxChunk = SAFE_DOWN;
        if (dir === 'up' && e.status === 413) maxChunk = Math.max(256 * 1024, maxChunk >> 1);
        if (errors > 6) { fatal = e; stopAll(); break; }
        await new Promise((r) => setTimeout(r, 200));
      } finally { killers.delete(kill); }
    }
  }
  try {
    await Promise.all(Array.from({ length: cfg.streams }, (_, i) => stream(i)));
  } finally {
    clearTimeout(timer); clearInterval(sampler);
    signal.removeEventListener('abort', onAbort);
  }
  const ms = pnow() - t0;
  tl.push({ t: ms, b: total });
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');
  if (fatal && total < 64 * 1024) throw fatal;
  return { bps: throughput(tl), bytes: total, ms, timeline: tl };
}

// Pings at a steady pace while `until` is pending; used for loaded latency.
async function loadedPings(until, signal, onPing, phase) {
  const out = [];
  let done = false;
  until.then(() => { done = true; }, () => { done = true; });
  await new Promise((r) => setTimeout(r, 600));
  while (!done && !signal.aborted) {
    const s = await pingOnce(2500, signal);
    if (done) break;
    if (s) { out.push(s.rtt); onPing && onPing({ rtt: s.rtt, loaded: phase }); }
    await new Promise((r) => setTimeout(r, 350));
  }
  return out;
}

export async function runSpeedTest({ mode = 'standard', signal, onPhase = () => {}, onSample = () => {}, onPing = () => {} }) {
  const P = PRESETS[mode] || PRESETS.standard;
  const res = { mode, at: Date.now() };

  onPhase('ping');
  const rtts = [];
  await pingOnce(3000, signal); // warm the connection (TLS, DNS) — not counted
  for (let i = 0; i < P.pings && !signal.aborted; i++) {
    const s = await pingOnce(3000, signal);
    if (s) { rtts.push(s.rtt); onPing({ rtt: s.rtt, loaded: null, i, n: P.pings }); }
  }
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');
  if (!rtts.length) throw new Error('Can’t reach the test server');
  res.ping = median(rtts);
  res.jitter = jitter(rtts);
  res.pingMin = Math.min(...rtts);

  onPhase('download');
  const dP = transfer('down', P.down, { signal, onSample });
  const dL = loadedPings(dP, signal, onPing, 'down');
  const d = await dP;
  const dl = await dL;
  res.down = d.bps; res.downBytes = d.bytes; res.downMs = d.ms;
  res.loadedDown = dl.length ? median(dl) : null;

  onPhase('upload');
  const uP = transfer('up', P.up, { signal, onSample });
  const uL = loadedPings(uP, signal, onPing, 'up');
  const u = await uP;
  const ul = await uL;
  res.up = u.bps; res.upBytes = u.bytes; res.upMs = u.ms;
  res.loadedUp = ul.length ? median(ul) : null;

  onPhase('done');
  return res;
}
