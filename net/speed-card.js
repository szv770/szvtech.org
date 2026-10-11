// /net — the speed test card. PARKED: nothing imports this file (see net/SPEED.md).
//
// Self-contained: mountSpeedCard() injects the card's markup and CSS as the
// first card of the board, draws the dial + throughput graph, runs
// net/speed.js against /api/speed, keeps a local history and handles the
// G / Esc keys. It talks to the latency monitor in net.js through window
// events ('net:speed' {running}, 'net:ping' {rtt, loaded}) and reads the
// server route from window.NET_EDGE (set by net.js after /api/ip).
import { median, jitter, clamp, fmtBytes, fmtMbps, unitMbps, gaugePos, MARKS } from '/net/stats.js';
import { runSpeedTest, PRESETS } from '/net/speed.js';
import { fit, rgba, watchSize } from '/net/gfx.js';

const DEFAULT_PAL = { a1: '#8b5cf6', a2: '#22d3ee', a3: '#e879f9', rgb: { a1: [139, 92, 246], a2: [34, 211, 238], a3: [232, 121, 249] } };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('net-' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('net-' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const fmtMs = (v) => (v == null || !Number.isFinite(v) ? '—' : v < 10 ? v.toFixed(1) : String(Math.round(v)));

/* ------------------------------------------------------------------ markup */
const HTML = `
  <section class="card speed" id="speed" aria-labelledby="speedH">
    <div class="card-head">
      <span class="tag">00</span>
      <h2 id="speedH">Speed test</h2>
      <div class="seg" role="radiogroup" aria-label="Test length" id="modeSeg">
        <button type="button" role="radio" data-mode="quick" aria-checked="false">Quick</button>
        <button type="button" role="radio" data-mode="standard" aria-checked="true">Standard</button>
      </div>
    </div>
    <div class="gauge-wrap idle" id="gaugeWrap">
      <canvas id="gauge" aria-hidden="true"></canvas>
      <div class="gauge-read" id="gaugeRead" aria-live="polite">
        <span class="g-phase" id="gPhase">ready</span>
        <span class="g-val" id="gVal">&mdash;</span>
        <span class="g-unit" id="gUnit">Mbps</span>
      </div>
      <button type="button" class="go" id="goBtn" aria-describedby="speedNote">
        <span class="go-ring" aria-hidden="true"></span>
        <span class="go-txt">GO</span>
        <kbd class="kb">G</kbd>
      </button>
      <button type="button" class="stop" id="stopBtn" hidden>Stop <kbd class="kb">Esc</kbd></button>
    </div>
    <div class="tiles" id="tiles">
      <div class="tile" data-k="down"><span class="t-lbl"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v10M3.8 8.6 8 12.8l4.2-4.2"/></svg>Download</span><span class="t-val" id="rDown">&mdash;</span><span class="t-unit" id="rDownU">Mbps</span></div>
      <div class="tile" data-k="up"><span class="t-lbl"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13.5v-10M3.8 7.4 8 3.2l4.2 4.2"/></svg>Upload</span><span class="t-val" id="rUp">&mdash;</span><span class="t-unit" id="rUpU">Mbps</span></div>
      <div class="tile" data-k="ping"><span class="t-lbl"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8h3l1.8-4 3.4 8 1.8-4h3"/></svg>Ping</span><span class="t-val" id="rPing">&mdash;</span><span class="t-unit">ms</span></div>
      <div class="tile" data-k="jitter"><span class="t-lbl"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 9.5 4 6l2.5 5L9 4l2.5 6 2-3"/></svg>Jitter</span><span class="t-val" id="rJit">&mdash;</span><span class="t-unit">ms</span></div>
    </div>
    <div class="chart">
      <div class="chart-lbl"><span>throughput</span><span class="legend"><i class="lg-d"></i>down <i class="lg-u"></i>up</span></div>
      <canvas id="tput" aria-hidden="true"></canvas>
    </div>
    <p class="meta" id="speedMeta">&nbsp;</p>
    <p class="note" id="speedNote">Measures the path from you to <b>this site&rsquo;s server</b> (Vercel&rsquo;s network, through Cloudflare) &mdash; the way Cloudflare&rsquo;s test measures to Cloudflare. <span id="budgetNote"></span></p>
    <div class="hist" id="speedHist" hidden>
      <div class="hist-head"><span class="micro">history</span><button type="button" class="link-btn" id="histClear">clear</button></div>
      <ol class="hist-list" id="histList"></ol>
    </div>
  </section>`;

/* ------------------------------------------------------------------ styles */
const CSS = `
.gauge-wrap, .tiles, .go, .stop { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
.gauge-wrap { position: relative; width: 100%; max-width: 520px; margin: 0 auto; aspect-ratio: 1 / .78; }
#gauge { position: absolute; inset: 0; width: 100%; height: 100%; }
.gauge-read { position: absolute; left: 0; right: 0; top: var(--cy, 58%); transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; gap: 4px; pointer-events: none; transition: opacity .35s var(--ease); }
.g-phase { font: 600 10.5px/1 var(--mono); letter-spacing: .26em; text-transform: uppercase; color: var(--a2-hi); }
.g-val { font: 800 clamp(48px, 16vw, 86px)/.9 var(--mono); letter-spacing: -.05em; font-variant-numeric: tabular-nums; background: var(--hgrad); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 0 22px color-mix(in srgb, var(--a3) 35%, transparent)); }
.g-unit { font: 500 12px/1 var(--mono); color: var(--muted); letter-spacing: .12em; }
.gauge-wrap.idle .gauge-read { opacity: 0; }
.gauge-wrap.done .gauge-read { transform: translateY(-62%); }
.go { position: absolute; left: 50%; top: var(--cy, 58%); transform: translate(-50%, -50%); width: clamp(112px, 34%, 150px); aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center;
  background: radial-gradient(circle at 50% 35%, rgba(255,255,255,.1), rgba(255,255,255,.02) 70%), rgba(8,8,16,.7);
  box-shadow: 0 0 0 1px rgba(255,255,255,.08), 0 0 60px -10px color-mix(in srgb, var(--a3) 55%, transparent), inset 0 0 30px color-mix(in srgb, var(--a1) 25%, transparent);
  transition: transform .4s var(--ease), opacity .3s, box-shadow .3s; }
.go-ring { position: absolute; inset: -3px; border-radius: 50%; padding: 3px; background: conic-gradient(from 200deg, var(--a1), var(--a3), var(--a2), var(--a1));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
  animation: net-spin 6s linear infinite; }
.go::after { content: ""; position: absolute; inset: -14px; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--a2) 40%, transparent); animation: net-pulse 2.6s var(--ease) infinite; pointer-events: none; }
.go-txt { font: 800 clamp(30px, 9vw, 42px)/1 var(--display); letter-spacing: .04em; background: var(--hgrad); -webkit-background-clip: text; background-clip: text; color: transparent; }
.go .kb { position: absolute; bottom: 18%; }
.go:active { transform: translate(-50%, -50%) scale(.96); }
.go.again { width: auto; aspect-ratio: auto; height: 44px; padding: 0 16px; border-radius: 999px; top: auto; bottom: -4px; transform: translate(-50%, 0); }
.go.again .go-ring { border-radius: 999px; animation: none; background: linear-gradient(100deg, var(--a1), var(--a3), var(--a2)); }
.go.again .go-txt { font-size: 13px; letter-spacing: .16em; }
.go.again .kb, .go.again::after { display: none; }
.go.again:active { transform: translate(-50%, 0) scale(.96); }
@keyframes net-spin { to { transform: rotate(360deg); } }
@keyframes net-pulse { 0% { transform: scale(.92); opacity: .9; } 100% { transform: scale(1.18); opacity: 0; } }
.stop { position: absolute; left: 50%; bottom: 0; transform: translateX(-50%); min-height: 44px; padding: 0 18px; border-radius: 999px; font: 600 12px/1 var(--mono); letter-spacing: .1em; color: var(--muted); border: 1px solid var(--line2); background: rgba(8,8,16,.6); display: inline-flex; align-items: center; gap: 8px; }
.tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 14px; }
.tile { padding: 11px 10px 10px; border-radius: 14px; min-width: 0; background: var(--field); border: 1px solid var(--line); display: grid; grid-template-columns: auto 1fr; align-items: baseline; column-gap: 4px; transition: border-color .3s, background .3s; }
.t-lbl { grid-column: 1 / -1; display: flex; align-items: center; gap: 5px; margin-bottom: 6px; font: 500 10px/1 var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--dim); white-space: nowrap; overflow: hidden; }
.t-lbl svg { width: 12px; height: 12px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.t-val { font: 700 24px/1 var(--mono); font-variant-numeric: tabular-nums; letter-spacing: -.03em; white-space: nowrap; }
.t-unit { font: 500 10px/1 var(--mono); color: var(--dim); white-space: nowrap; }
.tile[data-k="down"] .t-lbl { color: var(--a2-hi); } .tile[data-k="up"] .t-lbl { color: var(--a3-hi); }
.tile.active { border-color: color-mix(in srgb, var(--a2) 55%, transparent); background: color-mix(in srgb, var(--a2) 9%, var(--field)); }
.tile[data-k="up"].active { border-color: color-mix(in srgb, var(--a3) 55%, transparent); background: color-mix(in srgb, var(--a3) 9%, var(--field)); }
.speed .chart canvas { height: 92px; }
.legend { display: inline-flex; align-items: center; gap: 6px; } .legend i { width: 10px; height: 3px; border-radius: 2px; display: inline-block; }
.lg-d { background: var(--a2); } .lg-u { background: var(--a3); margin-left: 6px; }
.speed .meta { margin-top: 12px; font: 500 11.5px/1.5 var(--mono); color: var(--muted); min-height: 1.5em; overflow-wrap: anywhere; }
.speed .meta b { color: var(--fg); font-weight: 600; }
.speed .note { margin-top: 8px; font-size: 12.5px; line-height: 1.5; color: var(--dim); } .speed .note b { color: var(--muted); font-weight: 600; }
.hist { margin-top: 14px; border-top: 1px solid var(--line); padding-top: 10px; }
.hist-list { list-style: none; display: grid; gap: 4px; margin-top: 6px; max-height: 260px; overflow-y: auto; overscroll-behavior: contain; }
.hist-list li { display: grid; grid-template-columns: minmax(0, 1.4fr) repeat(3, minmax(0, 1fr)); gap: 8px; align-items: center; padding: 8px 10px; border-radius: 10px; background: rgba(255,255,255,.025); font: 500 12px/1.2 var(--mono); font-variant-numeric: tabular-nums; }
.hist-list .h-when { color: var(--dim); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hist-list .h-d { color: var(--a2-hi); } .hist-list .h-u { color: var(--a3-hi); } .hist-list .h-p { color: var(--muted); } .hist-list small { color: var(--dim); font-size: 10px; }
@media (max-width: 380px) { .t-lbl { font-size: 9px; letter-spacing: .06em; } .t-lbl svg { display: none; } .tile { padding: 9px 7px 8px; } }
@media (orientation: landscape) and (max-height: 520px), (min-width: 720px) {
  .speed { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: auto auto auto auto auto 1fr auto; column-gap: 24px; align-items: start; }
  .speed > .card-head { grid-column: 1 / -1; }
  .speed .gauge-wrap { grid-row: 2 / span 5; }
  .speed .tiles { margin-top: 0; }
  .speed .chart, .speed .meta, .speed .note { grid-column: 2; }
  .speed .hist { grid-row: 7; grid-column: 1 / -1; }
}
@media (min-width: 1100px) {
  .board.has-speed { grid-template-areas: "sp sp sp sp sp sp sp yo yo yo yo yo" "la la la la la la la la la la la la" "dn dn dn dn dn dn dv dv dv dv dv dv"; }
  .speed { grid-area: sp; display: block; }
  .speed .tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-top: 16px; }
}
@media (prefers-reduced-motion: reduce) { .go-ring, .go::after { animation: none; } .go::after { opacity: .5; transform: scale(1.06); } }
`;

/* ------------------------------------------------------------------ canvas */
const A0 = Math.PI * 0.75, SWEEP = Math.PI * 1.5; // 270° dial, opening at the bottom

function drawGauge(cv, { pos = 0, phase = 'idle', pal, idle = false }) {
  const { ctx, w, h } = fit(cv);
  const cx = w / 2, R = Math.min(w / 2 - 6, (h - 8) / 1.72), cy = R + 4 + Math.max(0, (h - 8 - R * 1.72) / 2);
  const main = phase === 'up' ? pal.rgb.a3 : pal.rgb.a2;
  const lw = Math.max(8, R * 0.075);
  ctx.lineCap = 'round';
  ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath(); ctx.arc(cx, cy, R - lw, A0, A0 + SWEEP); ctx.stroke();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.beginPath(); ctx.arc(cx, cy, R - 1, A0, A0 + SWEEP); ctx.stroke();
  for (let i = 0; i <= 54; i++) {
    const a = A0 + SWEEP * i / 54, major = i % 6 === 0;
    const r1 = R - lw * 2 - 4, r0 = r1 - (major ? 9 : 4);
    const lit = i / 54 <= pos + 1e-6 && !idle;
    ctx.strokeStyle = lit ? rgba(main, major ? 0.95 : 0.6) : `rgba(255,255,255,${major ? 0.32 : 0.12})`;
    ctx.lineWidth = major ? 1.6 : 1;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke();
  }
  ctx.font = `500 ${Math.max(9, Math.round(R * 0.068))}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const rl = R - lw * 2 - 4 - 9 - R * 0.09;
  MARKS.forEach((m, i) => {
    const a = A0 + SWEEP * i / (MARKS.length - 1);
    const lit = i / (MARKS.length - 1) <= pos + 1e-6 && !idle;
    ctx.fillStyle = lit ? 'rgba(243,241,255,0.92)' : 'rgba(226,224,255,0.38)';
    ctx.fillText(m >= 1000 ? '1G' : String(m), cx + Math.cos(a) * rl, cy + Math.sin(a) * rl);
  });
  if (pos > 0.0005 && !idle) {
    const a1 = A0 + SWEEP * pos;
    let grad;
    if (ctx.createConicGradient) {
      grad = ctx.createConicGradient(A0 - 0.2, cx, cy);
      grad.addColorStop(0, pal.a1); grad.addColorStop(0.45, pal.a3); grad.addColorStop(0.8, phase === 'up' ? pal.a3 : pal.a2); grad.addColorStop(1, pal.a1);
    } else {
      grad = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
      grad.addColorStop(0, pal.a1); grad.addColorStop(0.5, pal.a3); grad.addColorStop(1, pal.a2);
    }
    ctx.save();
    ctx.shadowColor = rgba(main, 0.8); ctx.shadowBlur = lw * 1.8;
    ctx.strokeStyle = grad; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.arc(cx, cy, R - lw, A0, a1); ctx.stroke();
    ctx.restore();
    const nl = R - lw * 2 - 14, nx = cx + Math.cos(a1) * nl, ny = cy + Math.sin(a1) * nl;
    const px = Math.cos(a1 + Math.PI / 2), py = Math.sin(a1 + Math.PI / 2);
    ctx.save();
    const ng = ctx.createLinearGradient(cx, cy, nx, ny);
    ng.addColorStop(0, rgba(main, 0)); ng.addColorStop(0.35, rgba(main, 0.35)); ng.addColorStop(1, 'rgba(255,255,255,0.95)');
    ctx.fillStyle = ng; ctx.shadowColor = rgba(main, 0.9); ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(cx + px * 5, cy + py * 5); ctx.lineTo(nx, ny); ctx.lineTo(cx - px * 5, cy - py * 5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(nx, ny, 3, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.restore();
  }
  return { cx, cy, R, w, h };
}

function drawTput(cv, { down = [], up = [], pal, tMax = 8000 }) {
  const { ctx, w, h } = fit(cv);
  const pad = 6, all = down.concat(up);
  const vmax = Math.max(1e6, ...all.map((p) => p.v)) * 1.15;
  ctx.strokeStyle = 'rgba(255,255,255,0.045)'; ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) { const y = Math.round(h * i / 4) + 0.5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  const plot = (pts, rgb, x0, x1) => {
    if (pts.length < 2) return;
    const X = (t) => x0 + (x1 - x0) * clamp(t / tMax, 0, 1), Y = (v) => h - pad - (h - pad * 2) * (v / vmax);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, rgba(rgb, 0.35)); g.addColorStop(1, rgba(rgb, 0));
    ctx.beginPath(); ctx.moveTo(X(pts[0].t), h);
    pts.forEach((p) => ctx.lineTo(X(p.t), Y(p.v)));
    ctx.lineTo(X(pts[pts.length - 1].t), h); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(X(p.t), Y(p.v)) : ctx.moveTo(X(p.t), Y(p.v))));
    ctx.strokeStyle = rgba(rgb, 1); ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
    ctx.save(); ctx.shadowColor = rgba(rgb, 0.8); ctx.shadowBlur = 8; ctx.stroke(); ctx.restore();
  };
  ctx.font = '500 11px "JetBrains Mono", monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  if (!all.length) { ctx.fillStyle = 'rgba(226,224,255,0.3)'; ctx.fillText('download', w / 4, h / 2); ctx.fillText('upload', w * 3 / 4, h / 2); }
  plot(down, pal.rgb.a2, 0, w / 2 - 3);
  plot(up, pal.rgb.a3, w / 2 + 3, w);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(w / 2, 4); ctx.lineTo(w / 2, h - 4); ctx.stroke(); ctx.setLineDash([]);
  if (all.length) {
    const m = vmax / 1.15 / 1e6;
    ctx.font = '500 9.5px "JetBrains Mono", monospace'; ctx.fillStyle = 'rgba(226,224,255,0.4)'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillText(m >= 1000 ? (m / 1000).toFixed(1) + ' Gbps' : (m >= 10 ? m.toFixed(0) : m.toFixed(1)) + ' Mbps', 6, 5);
  }
}

/* ------------------------------------------------------------------ controller */
export function mountSpeedCard(board = document.querySelector('.board')) {
  if (!board || document.getElementById('speed')) return;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  board.insertAdjacentHTML('afterbegin', HTML);
  board.classList.add('has-speed');

  const $ = (id) => document.getElementById(id);
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  let pal = (window.SZVTheme && SZVTheme.palette()) || DEFAULT_PAL;
  const params = new URLSearchParams(location.search);
  const sp = {
    mode: PRESETS[params.get('mode')] ? params.get('mode') : store.get('mode', 'standard'),
    running: false, ctl: null, phase: 'idle', pos: 0, target: 0, raf: 0, n: 0,
    down: [], up: [], pings: [],
  };
  if (!PRESETS[sp.mode]) sp.mode = 'standard';
  const gaugeWrap = $('gaugeWrap');
  const emit = (name, detail) => dispatchEvent(new CustomEvent(name, { detail }));
  const toast = (msg) => { const t = $('toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); };
  const buzz = (ms) => { try { if (!RM.matches && navigator.vibrate) navigator.vibrate(ms); } catch {} };

  function setMode(m) {
    sp.mode = m; store.set('mode', m);
    document.querySelectorAll('#modeSeg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === m)));
    const P = PRESETS[m];
    $('budgetNote').textContent = `${m === 'quick' ? 'Quick' : 'Standard'} uses up to ${Math.round(P.down.budget / 1e6)} MB down / ${Math.round(P.up.budget / 1e6)} MB up (≈${Math.round((P.down.ms + P.up.ms) / 1000) + 4} s).`;
  }
  function gaugeFrame() {
    sp.raf = 0;
    sp.pos += (sp.target - sp.pos) * (RM.matches ? 1 : 0.16);
    if (Math.abs(sp.target - sp.pos) < 0.0008) sp.pos = sp.target;
    const g = drawGauge($('gauge'), { pos: sp.pos, phase: sp.phase === 'upload' ? 'up' : 'down', pal, idle: sp.phase === 'idle' });
    if (g) gaugeWrap.style.setProperty('--cy', ((g.cy / g.h) * 100).toFixed(2) + '%');
    if (sp.pos !== sp.target) sp.raf = requestAnimationFrame(gaugeFrame);
  }
  function gauge(target) {
    if (target !== undefined) sp.target = clamp(target, 0, 1);
    if (!sp.raf) sp.raf = requestAnimationFrame(gaugeFrame);
  }
  const drawTputNow = () => { const P = PRESETS[sp.mode]; drawTput($('tput'), { down: sp.down, up: sp.up, pal, tMax: Math.max(P.down.ms, P.up.ms) }); };
  const setRead = (phase, val, unit) => { $('gPhase').textContent = phase; $('gVal').textContent = val; $('gUnit').textContent = unit; };
  function setTile(k, val, unit) {
    const el = { down: 'rDown', up: 'rUp', ping: 'rPing', jitter: 'rJit' }[k];
    $(el).textContent = val;
    if (unit && (k === 'down' || k === 'up')) $(el + 'U').textContent = unit;
  }
  const activeTile = (k) => document.querySelectorAll('#tiles .tile').forEach((t) => t.classList.toggle('active', t.dataset.k === k));
  function serverLabel() {
    const edge = window.NET_EDGE;
    if (!edge) return 'this site’s server';
    return [edge.vercelRegion ? `Vercel <b>${esc(edge.vercelRegion)}</b>` : 'Vercel', edge.cf ? `via Cloudflare <b>${esc(edge.cf)}</b>` : ''].filter(Boolean).join(' ');
  }

  async function startTest() {
    if (sp.running) return;
    sp.running = true;
    sp.ctl = new AbortController();
    sp.down = []; sp.up = []; sp.pings = []; sp.n = 0;
    buzz(15);
    gaugeWrap.classList.remove('idle', 'done');
    $('goBtn').hidden = true; $('stopBtn').hidden = false;
    document.querySelectorAll('#modeSeg button').forEach((b) => { b.disabled = true; });
    ['down', 'up', 'ping', 'jitter'].forEach((k) => setTile(k, '—'));
    $('speedMeta').innerHTML = `Testing to ${serverLabel()}…`;
    emit('net:speed', { running: true });
    drawTputNow();
    sp.phase = 'ping'; setRead('latency', '—', 'ms'); gauge(0);
    try {
      const r = await runSpeedTest({
        mode: sp.mode, signal: sp.ctl.signal,
        onPhase(p) {
          sp.phase = p;
          if (p === 'ping') activeTile('ping');
          if (p === 'download') { activeTile('down'); setRead('download', '0', 'Mbps'); gauge(0); }
          if (p === 'upload') { activeTile('up'); setRead('upload', '0', 'Mbps'); gauge(0); }
        },
        onPing({ rtt, loaded }) {
          emit('net:ping', { rtt, loaded });
          if (loaded) return;
          sp.pings.push(rtt);
          const m = median(sp.pings);
          setRead('latency', fmtMs(m), 'ms'); setTile('ping', fmtMs(m));
          if (sp.pings.length > 1) setTile('jitter', fmtMs(jitter(sp.pings)));
          gauge(Math.min(0.12, rtt / 1500));
        },
        onSample({ dir, bps, tl }) {
          (dir === 'down' ? sp.down : sp.up).push({ t: tl[tl.length - 1].t, v: bps });
          setRead(dir === 'down' ? 'download' : 'upload', fmtMbps(bps), unitMbps(bps));
          setTile(dir, fmtMbps(bps), unitMbps(bps));
          gauge(gaugePos(bps / 1e6));
          if (++sp.n % 3 === 0) drawTputNow(); // ~3 redraws/s keeps the main thread free for the transfer
        },
      });
      drawTputNow();
      finish(r);
    } catch (e) {
      const aborted = e && e.name === 'AbortError';
      resetIdle();
      if (!aborted) { toast('Speed test failed: ' + (e && e.message || 'network error')); setRead('error', '—', ''); } else toast('Test stopped');
    } finally {
      sp.running = false; sp.ctl = null;
      emit('net:speed', { running: false });
      $('stopBtn').hidden = true;
      document.querySelectorAll('#modeSeg button').forEach((b) => { b.disabled = false; });
    }
  }
  function finish(r) {
    activeTile(null);
    setTile('down', fmtMbps(r.down), unitMbps(r.down)); setTile('up', fmtMbps(r.up), unitMbps(r.up));
    setTile('ping', fmtMs(r.ping)); setTile('jitter', fmtMs(r.jitter));
    setRead('download', fmtMbps(r.down), unitMbps(r.down));
    sp.phase = 'download'; gauge(gaugePos(r.down / 1e6));
    gaugeWrap.classList.add('done');
    const go = $('goBtn');
    go.hidden = false; go.classList.add('again');
    go.querySelector('.go-txt').textContent = 'AGAIN'; go.setAttribute('aria-label', 'Run the speed test again');
    const edge = window.NET_EDGE;
    r.server = edge ? { region: edge.vercelRegion, cf: edge.cf } : null;
    const loaded = [r.loadedDown != null ? `↓ ${fmtMs(r.loadedDown)} ms` : '', r.loadedUp != null ? `↑ ${fmtMs(r.loadedUp)} ms` : ''].filter(Boolean).join(' · ');
    $('speedMeta').innerHTML = `To ${serverLabel()} · ${fmtBytes(r.downBytes)} down · ${fmtBytes(r.upBytes)} up` +
      (loaded ? `<br>Ping while busy: <b>${loaded}</b> <span style="color:var(--dim)">(idle ${fmtMs(r.ping)} ms)</span>` : '');
    saveHist(r); buzz(25);
  }
  function resetIdle() {
    sp.phase = 'idle'; activeTile(null);
    gaugeWrap.classList.add('idle'); gaugeWrap.classList.remove('done');
    const go = $('goBtn');
    go.hidden = false; go.classList.remove('again');
    go.querySelector('.go-txt').textContent = 'GO'; go.removeAttribute('aria-label');
    setRead('ready', '—', 'Mbps'); gauge(0);
  }
  const stopTest = () => { if (sp.ctl) sp.ctl.abort(); };
  function saveHist(r) {
    const h = store.get('hist', []);
    h.unshift({ at: r.at, mode: r.mode, down: Math.round(r.down), up: Math.round(r.up), ping: +r.ping.toFixed(1), jitter: +r.jitter.toFixed(1), ld: r.loadedDown != null ? Math.round(r.loadedDown) : null, lu: r.loadedUp != null ? Math.round(r.loadedUp) : null, srv: r.server && r.server.region || null });
    store.set('hist', h.slice(0, 30));
    renderHist();
  }
  function renderHist() {
    const h = store.get('hist', []);
    $('speedHist').hidden = !h.length;
    const when = (t) => {
      const d = new Date(t), today = new Date().toDateString() === d.toDateString();
      const hm = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      return today ? hm : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + hm;
    };
    $('histList').innerHTML = h.map((x) =>
      `<li><span class="h-when">${esc(when(x.at))} <small>${x.mode === 'quick' ? 'Q' : 'S'}</small></span>` +
      `<span class="h-d">↓ ${esc(fmtMbps(x.down))}<small> ${unitMbps(x.down) === 'Gbps' ? 'G' : 'M'}</small></span>` +
      `<span class="h-u">↑ ${esc(fmtMbps(x.up))}<small> ${unitMbps(x.up) === 'Gbps' ? 'G' : 'M'}</small></span>` +
      `<span class="h-p">${esc(fmtMs(x.ping))}<small> ms</small></span></li>`).join('');
  }

  setMode(sp.mode); resetIdle(); renderHist(); drawTputNow();
  $('modeSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !b.disabled) setMode(b.dataset.mode); });
  $('goBtn').addEventListener('click', startTest);
  $('stopBtn').addEventListener('click', stopTest);
  $('histClear').addEventListener('click', () => { store.set('hist', []); renderHist(); toast('History cleared'); });
  const redraw = () => { gauge(); if (sp.raf === 0) gaugeFrame(); drawTputNow(); };
  watchSize($('gauge'), redraw); watchSize($('tput'), redraw);
  if (window.SZVTheme && SZVTheme.on) SZVTheme.on((n, p) => { pal = p || SZVTheme.palette(); redraw(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) return;
    const k = e.key.toLowerCase();
    if (k === 'g' && !sp.running) { e.preventDefault(); startTest(); }
    else if (k === 'escape' && sp.running) stopTest();
  });
}
