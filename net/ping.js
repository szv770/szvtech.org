// /net — one timed round trip to /api/now (latency monitor + clock offset).
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
