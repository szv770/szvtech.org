// zmanim/sync.js — server-synced "now" for /zmanim (same approach as /time/ui.js).
//
// now() = Date.now() + offset. The offset is measured NTP-style against /api/now:
// several round trips, the lowest-latency samples win (their error is at most
// half the round trip), and small corrections are slewed over 1–2 s so the
// clock never jumps a second. Re-syncs every 5 min, on `online`, on returning
// to the tab, and when the device clock jumps (sleep / manual change).

const SYNC = { samples: 6, maxRtt: 1500, every: 5 * 60000, slewMax: 200, timeout: 3000 };
const pnow = () => performance.now();
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function createClock() {
  const s = {
    ok: false, busy: false, from: 0, to: 0, t0: 0, dur: 0,
    err: null, at: -1e9, fails: 0, retryT: 0, timer: 0, stale: false,
  };
  const listeners = new Set();
  let running = false;
  let jumpRef = { d: Date.now(), p: pnow() };

  function offsetNow(p = pnow()) {
    if (!s.dur || p >= s.t0 + s.dur) return s.to;
    return s.from + (s.to - s.from) * Math.max(0, p - s.t0) / s.dur;
  }
  const now = () => Date.now() + offsetNow();

  async function sample() {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const kill = setTimeout(() => ctl && ctl.abort(), SYNC.timeout);
    try {
      const d0 = Date.now(), p0 = pnow();
      const r = await fetch('/api/now?r=' + Math.random().toString(36).slice(2), { cache: 'no-store', signal: ctl && ctl.signal });
      const p1 = pnow();
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || !Number.isFinite(j.t)) return null;
      const rtt = p1 - p0;
      if (rtt > SYNC.maxRtt) return null;
      return { rtt, offset: j.t + 0.5 - (d0 + rtt / 2) };
    } catch (e) { return null; } finally { clearTimeout(kill); }
  }

  function apply(offset, err) {
    const p = pnow(), cur = offsetNow(p), delta = offset - cur;
    if (s.ok && Math.abs(delta) < SYNC.slewMax) {
      s.from = cur; s.to = offset; s.t0 = p; s.dur = clamp(Math.abs(delta) * 10, 1000, 2000);
    } else {
      s.from = s.to = offset; s.dur = 0;
    }
    s.err = err;
    s.ok = err != null;
    listeners.forEach((f) => { try { f(status()); } catch (e) {} });
  }

  async function sync() {
    if (s.busy || !running) return s.ok;
    s.busy = true;
    clearTimeout(s.retryT);
    const got = [];
    for (let i = 0; i < SYNC.samples; i++) {
      const x = await sample();
      if (!x) { if (!got.length && i >= 1) break; continue; }
      got.push(x);
    }
    s.busy = false;
    if (!got.length) {
      s.fails++;
      if (s.stale) { apply(0, null); s.ok = false; }
      if (running) s.retryT = setTimeout(sync, Math.min(SYNC.every, 15000 * 2 ** Math.min(4, s.fails - 1)));
      return false;
    }
    s.fails = 0; s.stale = false;
    got.sort((a, b) => a.rtt - b.rtt);
    const best = got.slice(0, Math.min(3, got.length)).map((g) => g.offset).sort((a, b) => a - b);
    const offset = best.length === 2 ? (best[0] + best[1]) / 2 : best[Math.floor(best.length / 2)];
    apply(offset, got[0].rtt / 2 + 1);
    s.at = pnow();
    return true;
  }

  function tick() {
    const d = Date.now(), p = pnow();
    const drift = (d - jumpRef.d) - (p - jumpRef.p);
    jumpRef = { d, p };
    if (Math.abs(drift) > 1000) { s.stale = true; if (document.visibilityState === 'visible') sync(); return; }
    if (document.visibilityState === 'visible' && !s.busy && s.ok && pnow() - s.at > SYNC.every) sync();
  }
  const onVis = () => { if (document.visibilityState === 'visible') tick(); };
  const onOnline = () => sync();

  function start() {
    if (running) return;
    running = true;
    jumpRef = { d: Date.now(), p: pnow() };
    s.timer = setInterval(tick, 2000);
    document.addEventListener('visibilitychange', onVis);
    addEventListener('online', onOnline);
    if (!s.ok || pnow() - s.at > SYNC.every) sync();
  }
  function stop() {
    running = false;
    clearInterval(s.timer);
    clearTimeout(s.retryT);
    document.removeEventListener('visibilitychange', onVis);
    removeEventListener('online', onOnline);
  }
  function status() { return { ok: s.ok, offset: s.to, err: s.err, busy: s.busy }; }
  function onChange(f) { listeners.add(f); return () => listeners.delete(f); }
  return { now, start, stop, status, onChange, sync };
}
