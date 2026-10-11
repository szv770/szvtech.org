// /net — what the browser reports about this device. Read-only, local only.
import { fmtBytes } from '/net/stats.js?v=df6c47bf1f';

const mq = (q) => { try { return matchMedia(q).matches; } catch { return false; } };
const NA = null;

export function gpuInfo() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return { renderer: NA, vendor: NA, webgl: 0 };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const ver = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? 2 : 1;
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    try { const lose = gl.getExtension('WEBGL_lose_context'); lose && lose.loseContext(); } catch {}
    return { renderer: String(renderer || ''), vendor: String(vendor || ''), webgl: ver, maxTex };
  } catch { return { renderer: NA, vendor: NA, webgl: 0 }; }
}

// Median frame interval over ~1 s of rAF -> Hz (rounded to common panel rates when close)
export function measureRefresh(ms = 1000) {
  return new Promise((resolve) => {
    if (document.hidden) return resolve(null);
    const d = [];
    let last = 0;
    const t0 = performance.now();
    const step = (t) => {
      if (last) d.push(t - last);
      last = t;
      if (t - t0 < ms) requestAnimationFrame(step);
      else {
        if (d.length < 10) return resolve(null);
        d.sort((a, b) => a - b);
        const hz = 1000 / d[d.length >> 1];
        const common = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];
        const near = common.find((c) => Math.abs(c - hz) / c < 0.04);
        resolve(near || Math.round(hz));
      }
    };
    requestAnimationFrame(step);
  });
}

function browserName() {
  const ua = navigator.userAgent;
  const uad = navigator.userAgentData;
  if (uad && uad.brands) {
    const b = uad.brands.find((x) => !/not.?a.?brand|chromium/i.test(x.brand)) || uad.brands.find((x) => /chromium/i.test(x.brand));
    if (b) return `${b.brand} ${b.version}`;
  }
  let m;
  if ((m = /Firefox\/(\d+)/.exec(ua))) return 'Firefox ' + m[1];
  if ((m = /Edg\/(\d+)/.exec(ua))) return 'Edge ' + m[1];
  if ((m = /SamsungBrowser\/(\d+)/.exec(ua))) return 'Samsung Internet ' + m[1];
  if ((m = /Chrome\/(\d+)/.exec(ua))) return 'Chrome ' + m[1];
  if ((m = /Version\/([\d.]+).*Safari/.exec(ua))) return 'Safari ' + m[1];
  return 'Unknown browser';
}
function osName() {
  const ua = navigator.userAgent;
  const uad = navigator.userAgentData;
  if (uad && uad.platform) return uad.platform;
  if (/Android/.test(ua)) return 'Android ' + ((/Android ([\d.]+)/.exec(ua) || [])[1] || '');
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS ' + ((/OS (\d+[_\d]*)/.exec(ua) || [])[1] || '').replace(/_/g, '.');
  if (/Mac OS X/.test(ua)) return navigator.maxTouchPoints > 1 ? 'iPadOS' : 'macOS';
  if (/Windows/.test(ua)) return 'Windows';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown OS';
}
export function shortAgent() { return `${browserName()} on ${osName()}`.trim(); }

export async function highEntropy() {
  try {
    const uad = navigator.userAgentData;
    if (!uad || !uad.getHighEntropyValues) return null;
    return await uad.getHighEntropyValues(['model', 'platformVersion', 'architecture', 'bitness', 'fullVersionList']);
  } catch { return null; }
}

const v = (x, suffix = '') => (x === NA || x === undefined || x === '' ? NA : String(x) + suffix);
const yn = (b) => (b ? 'yes' : 'no');

// Builds the sections. `live` holds async results (refresh, battery, storage, he).
export function collect(live = {}) {
  const s = screen, dpr = window.devicePixelRatio || 1;
  const vv = window.visualViewport;
  const gamut = mq('(color-gamut: rec2020)') ? 'Rec. 2020' : mq('(color-gamut: p3)') ? 'Display P3' : mq('(color-gamut: srgb)') ? 'sRGB' : NA;
  const orient = (s.orientation && s.orientation.type) ? `${s.orientation.type.replace('-primary', '').replace('-secondary', ' (flipped)')} · ${s.orientation.angle}°` : (innerWidth > innerHeight ? 'landscape' : 'portrait');
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const he = live.he || {};
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  const hour12 = (() => { try { return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle; } catch { return NA; } })();
  const gpu = live.gpu || {};
  const bat = live.battery;
  const st = live.storage;

  return [
    { id: 'display', title: 'Display', rows: [
      ['Screen', `${s.width} × ${s.height}`, 'CSS px'],
      ['Physical', `${Math.round(s.width * dpr)} × ${Math.round(s.height * dpr)}`, 'px'],
      ['Pixel ratio', `${+dpr.toFixed(3)}×`],
      ['Viewport', `${innerWidth} × ${innerHeight}`, vv && (Math.abs(vv.width - innerWidth) > 1 || Math.abs(vv.height - innerHeight) > 1 || vv.scale !== 1) ? `visual ${Math.round(vv.width)} × ${Math.round(vv.height)}${vv.scale !== 1 ? ' @' + vv.scale.toFixed(2) : ''}` : ''],
      ['Orientation', orient],
      ['Refresh rate', live.refresh ? `≈ ${live.refresh} Hz` : (live.refresh === null ? 'couldn’t measure' : 'measuring…')],
      ['Color', `${v(gamut) || '—'}`, `${s.colorDepth}-bit`],
      ['HDR', mq('(dynamic-range: high)') ? 'yes' : 'no'],
    ] },
    { id: 'hardware', title: 'Hardware', rows: [
      ['CPU cores', v(navigator.hardwareConcurrency), 'logical'],
      ['Memory', navigator.deviceMemory ? `≥ ${navigator.deviceMemory} GB` : NA, navigator.deviceMemory ? 'rounded, capped by browser' : ''],
      ['GPU', v(gpu.renderer)],
      ['GPU vendor', v(gpu.vendor)],
      ['WebGL', gpu.webgl ? `${gpu.webgl}.0` : NA, gpu.maxTex ? `max texture ${gpu.maxTex}` : ''],
      ['Touch points', String(navigator.maxTouchPoints || 0)],
      ['Pointer', mq('(pointer: coarse)') ? 'coarse (finger)' : mq('(pointer: fine)') ? 'fine (mouse/pen)' : 'none', mq('(hover: hover)') ? 'can hover' : 'no hover'],
      ['Model', v(he.model), he.architecture ? `${he.architecture}${he.bitness ? ' ' + he.bitness + '-bit' : ''}` : ''],
    ] },
    { id: 'browser', title: 'Browser', rows: [
      ['Browser', browserName()],
      ['System', osName() + (he.platformVersion ? ' ' + he.platformVersion : '')],
      ['Language', navigator.language, (navigator.languages || []).slice(1, 4).join(', ')],
      ['Locale', locale, hour12 ? (hour12 === 'h23' || hour12 === 'h24' ? '24-hour clock' : '12-hour clock') : ''],
      ['Time zone', tz, utcOffset()],
      ['Cookies', yn(navigator.cookieEnabled)],
      ['Do Not Track', navigator.doNotTrack === '1' ? 'on' : 'off', navigator.globalPrivacyControl ? 'GPC on' : ''],
      ['User agent', navigator.userAgent],
    ] },
    { id: 'network', title: 'Network', rows: [
      ['Online', navigator.onLine ? 'yes' : 'no'],
      ['Type', conn && conn.type ? conn.type : NA],
      ['Effective type', conn && conn.effectiveType ? conn.effectiveType : NA, conn ? 'browser estimate' : ''],
      ['Downlink', conn && conn.downlink != null ? `${conn.downlink} Mbps` : NA, conn && conn.downlinkMax && conn.downlinkMax !== Infinity ? `max ${conn.downlinkMax}` : ''],
      ['RTT', conn && conn.rtt != null ? `${conn.rtt} ms` : NA],
      ['Data saver', conn && 'saveData' in conn ? (conn.saveData ? 'on' : 'off') : NA],
    ] },
    { id: 'prefs', title: 'Preferences', rows: [
      ['Color scheme', mq('(prefers-color-scheme: dark)') ? 'dark' : mq('(prefers-color-scheme: light)') ? 'light' : 'no preference'],
      ['Reduced motion', mq('(prefers-reduced-motion: reduce)') ? 'on' : 'off'],
      ['Contrast', mq('(prefers-contrast: more)') ? 'more' : mq('(prefers-contrast: less)') ? 'less' : mq('(forced-colors: active)') ? 'forced colors' : 'normal'],
      ['Reduced transparency', mq('(prefers-reduced-transparency: reduce)') ? 'on' : 'off'],
      ['Reduced data', mq('(prefers-reduced-data: reduce)') ? 'on' : 'off'],
      ['Display mode', mq('(display-mode: standalone)') ? 'installed app' : mq('(display-mode: fullscreen)') ? 'fullscreen' : 'browser tab'],
    ] },
    { id: 'power', title: 'Storage & power', rows: [
      ['Battery', bat ? `${Math.round(bat.level * 100)}%` : (bat === null ? NA : '…'), bat ? (bat.charging ? 'charging' + (Number.isFinite(bat.chargingTime) && bat.chargingTime > 0 ? ` · full in ${mins(bat.chargingTime)}` : '') : 'on battery' + (Number.isFinite(bat.dischargingTime) ? ` · ${mins(bat.dischargingTime)} left` : '')) : ''],
      ['Storage quota', st && st.quota ? fmtBytes(st.quota) : (st === null ? NA : '…'), st && st.quota ? `${fmtBytes(st.usage || 0)} used by this site` : ''],
      ['Persistent', st && st.persisted != null ? yn(st.persisted) : NA],
    ] },
  ];
}
function mins(sec) { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; }
function utcOffset() {
  const o = -new Date().getTimezoneOffset(), a = Math.abs(o);
  return `UTC${o >= 0 ? '+' : '−'}${Math.floor(a / 60)}${a % 60 ? ':' + String(a % 60).padStart(2, '0') : ''}`;
}

export function capabilities() {
  const has = (f) => { try { return !!f(); } catch { return false; } };
  return [
    ['WebGPU', has(() => navigator.gpu)],
    ['WebGL 2', has(() => typeof WebGL2RenderingContext !== 'undefined')],
    ['WebAssembly', has(() => typeof WebAssembly === 'object')],
    ['Service worker', has(() => 'serviceWorker' in navigator)],
    ['WebRTC', has(() => typeof RTCPeerConnection !== 'undefined')],
    ['Bluetooth', has(() => navigator.bluetooth)],
    ['USB', has(() => navigator.usb)],
    ['NFC', has(() => 'NDEFReader' in window)],
    ['Share', has(() => navigator.share)],
    ['Vibration', has(() => navigator.vibrate)],
    ['Wake lock', has(() => 'wakeLock' in navigator)],
    ['Clipboard', has(() => navigator.clipboard)],
    ['Geolocation', has(() => 'geolocation' in navigator)],
    ['Motion sensors', has(() => 'DeviceMotionEvent' in window)],
    ['Gamepad', has(() => navigator.getGamepads)],
    ['WebXR', has(() => navigator.xr)],
    ['Speech', has(() => 'speechSynthesis' in window)],
    ['Payment', has(() => 'PaymentRequest' in window)],
  ];
}

export function asText(sections, caps) {
  const lines = ['Device report · szvtech.org/net · ' + new Date().toISOString(), ''];
  for (const s of sections) {
    lines.push(s.title.toUpperCase());
    for (const [k, val, sub] of s.rows) lines.push(`  ${k}: ${val == null ? 'n/a' : val}${sub ? ` (${sub})` : ''}`);
    lines.push('');
  }
  lines.push('CAPABILITIES');
  lines.push('  ' + caps.map(([k, y]) => `${k} ${y ? '✓' : '✗'}`).join(' · '));
  return lines.join('\n');
}
