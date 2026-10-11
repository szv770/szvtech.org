// explain.js — the ⓘ "How time works" sheet on /time.
// Plain-language explanations with live bits that run on the page's
// server-synced clock (ctx.now). Everything is computed in the browser.
import * as T from '/time/tz.js?v=75921ea087';

const { MIN, DAY, MINUS } = T;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const pad = (n) => String(n).padStart(2, '0');
const WDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WDAY_L = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// a few well-known places to label the world strip with
const STRIP_LABELS = [
  ['Pacific/Pago_Pago', 'Pago Pago'], ['Pacific/Honolulu', 'Honolulu'], ['America/Los_Angeles', 'Los Angeles'],
  ['America/Chicago', 'Chicago'], ['America/New_York', 'New York'], ['America/Sao_Paulo', 'São Paulo'],
  ['America/St_Johns', 'Newfoundland'], ['Europe/London', 'London'], ['Europe/Paris', 'Paris'],
  ['Asia/Jerusalem', 'Jerusalem'], ['Asia/Dubai', 'Dubai'], ['Asia/Tehran', 'Tehran'], ['Asia/Kolkata', 'Mumbai'],
  ['Asia/Kathmandu', 'Kathmandu'], ['Asia/Bangkok', 'Bangkok'], ['Asia/Shanghai', 'Beijing'], ['Asia/Tokyo', 'Tokyo'],
  ['Australia/Adelaide', 'Adelaide'], ['Australia/Sydney', 'Sydney'], ['Pacific/Auckland', 'Auckland'],
  ['Pacific/Chatham', 'Chatham Is.'], ['Pacific/Kiritimati', 'Kiritimati'], ['America/Anchorage', 'Anchorage'],
  ['America/Denver', 'Denver'], ['Atlantic/Azores', 'Azores'], ['Europe/Moscow', 'Moscow'],
];
const FAMOUS = new Set(STRIP_LABELS.map(([tz]) => T.canonTz(tz)));

const FACTS = [
  ['China', 'China is about 5,000 km wide but runs on one clock, Beijing Time (UTC+8). In the far west, winter sunrise comes around 10 AM.'],
  ['Spain', 'Spain lies mostly west of Greenwich, roughly in line with Britain, yet has used Central European Time since 1940, one reason dinner there runs late.'],
  ['23 and 25', 'The day the clocks spring forward has 23 hours. The day they fall back has 25, and 1 AM happens twice.'],
  ['Leap seconds', 'Earth’s spin isn’t perfectly steady. Since 1972, 27 leap seconds have been added to keep UTC in step with it, and they’re due to be phased out by 2035.'],
  ['First and last', 'Kiritimati (Kiribati) is UTC+14, the first clocks to reach midnight. American Samoa at UTC−11 is among the last, a full day behind.'],
  ['Odd offsets', 'Nepal is UTC+5:45. New Zealand’s Chatham Islands are +12:45, and +13:45 in summer.'],
  ['Antarctica', 'Research stations usually keep their supply country’s time. The South Pole station runs on New Zealand time.'],
  ['France', 'Counting its overseas territories, France spans 12 time zones, more than any other country.'],
  ['Two noons', 'Before 1883 every US town kept its own sun time. On Nov 18, 1883, the railroads switched to standard zones: “the day of two noons.”'],
  ['India', 'All of India, about 3,000 km east to west, shares one zone at a half-hour offset: UTC+5:30.'],
];

export function mountExplain(root, ctx) {
  let sel = null;          // selected offset in the world strip
  let lastMinute = -1;
  let syncing = false;

  /* ---------- formatting ---------- */
  const fcache = new Map();
  function fmt(tz, key, opts) {
    const k = tz + '|' + key;
    let f = fcache.get(k);
    if (!f) { f = new Intl.DateTimeFormat(opts.locale || 'en-US', { ...opts, locale: undefined, timeZone: tz }); fcache.set(k, f); }
    return f;
  }
  function clockStr(ms, tz, h24, secs = true) {
    const f = fmt(tz, 'c' + (h24 ? 24 : 12) + secs, { hour: h24 ? '2-digit' : 'numeric', minute: '2-digit', ...(secs ? { second: '2-digit' } : {}), hourCycle: h24 ? 'h23' : 'h12' });
    const p = {};
    for (const { type, value } of f.formatToParts(new Date(ms))) p[type] = value;
    const main = `${h24 ? pad(+p.hour % 24) : p.hour}:${p.minute}${secs ? ':' + p.second : ''}`;
    return { main, ap: h24 ? '' : (p.dayPeriod || '').toUpperCase() };
  }
  const timeHTML = (ms, tz, h24, secs) => { const c = clockStr(ms, tz, h24, secs); return esc(c.main) + (c.ap ? `<small>${c.ap}</small>` : ''); };
  const hmText = (ms, tz) => { const c = clockStr(ms, tz, ctx.h24(), false); return c.main + (c.ap ? ' ' + c.ap : ''); };
  // wall-clock text for "UTC + offset" at an instant (used around clock changes)
  function wall(at, off) {
    const d = new Date(at + off * MIN), h = d.getUTCHours(), m = d.getUTCMinutes();
    if (ctx.h24()) return `${pad(h)}:${pad(m)}`;
    return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
  }
  const dateText = (ms, tz, o = { weekday: 'short', month: 'short', day: 'numeric' }) => fmt(tz, 'd' + JSON.stringify(o), o).format(new Date(ms));
  function inWords(ms) {
    const m = Math.max(0, Math.round(ms / MIN));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), r = m % 60;
    if (h < 48) return `${h} h${r ? ' ' + r + ' min' : ''}`;
    return `${Math.round(ms / DAY)} days`;
  }
  const deltaText = (off) => off === 0 ? '±0' : `${off < 0 ? MINUS : '+'}${Math.floor(Math.abs(off) / 60)} h${Math.abs(off) % 60 ? ' ' + (Math.abs(off) % 60) + ' m' : ''}`;
  const offShort = (off) => T.fmtOffset(off, true).replace(/^UTC/, '') || '0';
  const dur = (ms) => { const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h} h ${m} min` : `${m} min ${x} s`; };

  /* ---------- 2: the world strip ---------- */
  function stripData(n) {
    const by = new Map();
    for (const tz of T.zones()) {
      const off = T.offsetMin(tz, n);
      let o = by.get(off);
      if (!o) by.set(off, (o = { off, zones: [] }));
      o.zones.push(tz);
    }
    for (const [tz, label] of STRIP_LABELS) {
      if (!T.validTz(tz)) continue;
      const o = by.get(T.offsetMin(tz, n));
      if (o && !o.label) o.label = label;
    }
    return [...by.values()].sort((a, b) => a.off - b.off);
  }
  function stripHTML(n) {
    const loc = ctx.loc(), me = T.offsetMin(loc.tz, n), h24 = ctx.h24();
    let prevDay = null;
    return stripData(n).map((c) => {
      const d = new Date(n + c.off * MIN);
      const h = d.getUTCHours() + d.getUTCMinutes() / 60;
      const f = (0.5 - 0.5 * Math.cos(2 * Math.PI * (h - 1) / 24)).toFixed(3); // 0 at 1 AM, 1 at 1 PM
      const wd = d.getUTCDay();
      const nd = prevDay != null && wd !== prevDay;
      prevDay = wd;
      const t = h24 ? `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : `${d.getUTCHours() % 12 || 12}:${pad(d.getUTCMinutes())}`;
      const ap = h24 ? '' : `<small>${d.getUTCHours() < 12 ? 'am' : 'pm'}</small>`;
      const lab = c.off === me ? 'You' : c.label || '';
      return `<button type="button" class="tx-col${c.off === me ? ' me' : ''}${nd ? ' nd' : ''}${sel === c.off ? ' sel' : ''}" data-off="${c.off}" style="--f:${f}" ` +
        `aria-pressed="${sel === c.off}" aria-label="${esc(T.fmtOffset(c.off, true))}: ${esc(t)}${h24 ? '' : d.getUTCHours() < 12 ? ' AM' : ' PM'} ${WDAY_L[wd]}${c.label ? ', ' + esc(c.label) : ''}">` +
        `${nd ? `<span class="tx-nd">${WDAY[wd]}</span>` : ''}<span class="tx-wd">${WDAY[wd]}</span><b>${t}${ap}</b><span class="tx-o">${esc(offShort(c.off))}</span><em>${esc(lab)}</em></button>`;
    }).join('');
  }
  function pickHTML(n) {
    if (sel == null) return '<p class="tx-hint">Tap any column to see what time it is there, and where.</p>';
    const col = stripData(n).find((c) => c.off === sel);
    if (!col) return '';
    const d = new Date(n + sel * MIN);
    // real zone names only (ICU falls back to "<city> Time" when a zone has no name of its own)
    const cityish = new Set(col.zones.map((z) => (z.split('/').pop() || '').replace(/_/g, ' ') + ' Time'));
    const names = [...new Set(col.zones.map((z) => T.genericName(z, n)).filter((g) => !/ time$/.test(g) && !cityish.has(g)))].slice(0, 3);
    const famous = col.zones.filter((z) => FAMOUS.has(T.canonTz(z)));
    const places = [...new Set([...famous, ...col.zones].map((z) => T.prettyTz(z)).filter((p) => p !== 'UTC'))].slice(0, 7);
    const t = ctx.h24() ? `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : `${d.getUTCHours() % 12 || 12}:${pad(d.getUTCMinutes())} ${d.getUTCHours() < 12 ? 'AM' : 'PM'}`;
    return `<div class="tx-pk"><b>${esc(T.fmtOffset(sel))}</b><span>${esc(t)} · ${WDAY_L[d.getUTCDay()]}</span></div>` +
      (names.length ? `<p>${esc(names.join(' · '))}</p>` : '') +
      `<p class="tx-places">${esc(places.join(', '))}${col.zones.length > places.length ? ` and ${col.zones.length - places.length} more` : ''}</p>`;
  }

  /* ---------- 3: daylight saving ---------- */
  function dstHTML(n) {
    const loc = ctx.loc(), tz = loc.tz, yi = T.yearInfo(tz, n), g = T.genericName(tz, n);
    const now = T.offsetMin(tz, n);
    let out = '';
    if (!yi.observes) {
      out += `<p><b>${esc(g)}</b> doesn’t change its clocks. It’s <b>${esc(T.fmtOffset(now, true))}</b> all year, so there’s no daylight saving to remember.</p>`;
    } else {
      const y = new Date(n).getUTCFullYear();
      const winter = yi.southern ? Date.UTC(y, 6, 1) : Date.UTC(y, 0, 1), summer = yi.southern ? Date.UTC(y, 0, 1) : Date.UTC(y, 6, 1);
      const sN = T.longName(tz, winter), dN = T.longName(tz, summer), sA = T.abbr(tz, winter), dA = T.abbr(tz, summer);
      const on = now === yi.dst;
      out += `<p>Daylight saving time moves the clocks an hour ahead for the warm months, so the sun rises and sets an hour “later” and evenings stay light longer. ` +
        `In winter this zone is on <b>${esc(sN || 'standard time')}</b>${sA ? ` (${esc(sA)})` : ''}, ${esc(T.fmtOffset(yi.std, true))}. In summer it’s <b>${esc(dN || 'daylight time')}</b>${dA ? ` (${esc(dA)})` : ''}, ${esc(T.fmtOffset(yi.dst, true))}. ` +
        `${sA && dA ? `That’s why ${esc(sA)} becomes ${esc(dA)}: same place, clocks an hour ahead.` : ''} Right now it’s on <b>${on ? 'daylight' : 'standard'} time</b>.</p>`;
      // year bar
      const ym = T.yearMap(tz, n);
      const segs = [];
      let st = -1;
      ym.days.forEach((v, i) => { if (v && st < 0) st = i; if ((!v || i === ym.days.length - 1) && st >= 0) { segs.push([st, v ? i + 1 : i]); st = -1; } });
      const N = ym.days.length, today = Math.floor((n - Date.UTC(ym.year, 0, 1)) / DAY);
      out += `<div class="tx-year" aria-hidden="true"><div class="tx-ybar">${segs.map(([a, b]) => `<i style="left:${(a / N * 100).toFixed(2)}%;width:${((b - a) / N * 100).toFixed(2)}%"></i>`).join('')}` +
        `<b style="left:${(clamp(today, 0, N - 1) / N * 100).toFixed(2)}%"></b></div><div class="tx-ym">${'JFMAMJJASOND'.split('').map((m) => `<span>${m}</span>`).join('')}</div>` +
        `<p class="tx-leg"><i></i>daylight saving in ${ym.year} · <b></b>today</p></div>`;
      const nt = T.nextTransition(tz, n);
      if (nt) {
        const fwd = nt.to > nt.from, diff = Math.abs(nt.to - nt.from);
        const dayLen = 24 * 60 - (nt.to - nt.from);
        const dayLenTxt = dayLen % 60 ? `${Math.floor(dayLen / 60)}½` : String(dayLen / 60);
        out += `<div class="tx-next"><span class="tx-kk">Next change · in ${esc(inWords(nt.at - n))}</span>` +
          `<p><b>${esc(dateText(nt.at + MIN, tz, { weekday: 'long', month: 'long', day: 'numeric' }))}</b>: at ${esc(wall(nt.at, nt.from))} the clocks ${fwd ? 'spring forward' : 'fall back'} ${diff === 60 ? 'an hour' : T.spanWords(diff)} to ${esc(wall(nt.at, nt.to))}, ` +
          `onto ${esc(T.longName(tz, nt.at + MIN) || T.fmtOffset(nt.to, true))} (${esc(T.fmtOffset(nt.to, true))}). That day is ${dayLenTxt} hours long.</p></div>`;
      }
    }
    out += `<ul class="tx-list">` +
      `<li>Plenty of places skip it: <b>Arizona</b> (except the Navajo Nation), <b>Hawaii</b>, and most of <b>Asia</b>, <b>Africa</b> and South America never change clocks.</li>` +
      `<li><b>Israel</b> has its own rule: forward on the Friday before the last Sunday of March, back on the last Sunday of October. So the New York–Jerusalem gap drops from 7 hours to 6 for a few weeks each spring and about a week each fall.</li>` +
      `<li>South of the equator it’s flipped: <b>Sydney</b> and <b>Auckland</b> spring forward in September or October.</li></ul>`;
    return out;
  }

  /* ---------- 4: device clock ---------- */
  function syncHTML() {
    const s = ctx.sync();
    let head, gauge = '';
    if (s.ok) {
      const o = s.offset, a = Math.abs(o), acc = '±' + Math.max(0.01, s.err / 1000).toFixed(2) + ' s';
      head = a < 100
        ? `Your device clock is spot on: within <b>${Math.max(1, Math.round(a))} ms</b> of true time (measured to <b>${acc}</b>). Not every device is this lucky; this page corrects the ones that aren’t.`
        : `Your device clock is <b>${(a / 1000).toFixed(a < 10000 ? 1 : 0)} s ${o > 0 ? 'behind' : 'ahead'}</b>. This page corrects every second it shows to <b>${acc}</b>.`;
      const S = Math.max(1000, a * 1.3);
      const x = clamp(50 - (o / S) * 50, 2, 98), w = clamp(s.err / S * 50, .6, 50);
      gauge = `<div class="tx-gauge" aria-hidden="true"><div class="tx-gt"><i class="band" style="left:${(50 - w).toFixed(2)}%;width:${(2 * w).toFixed(2)}%"></i><i class="true"></i><i class="dev" style="left:${x.toFixed(2)}%"></i></div>` +
        `<div class="tx-gl"><span>${MINUS}${(S / 1000).toFixed(1)} s</span><span>true time</span><span>+${(S / 1000).toFixed(1)} s</span></div>` +
        `<p class="tx-leg"><b class="d"></b>your device <b class="t"></b>true time <b class="b"></b>uncertainty</p></div>`;
    } else head = s.busy ? 'Measuring your clock against the time server…' : 'Couldn’t reach the time server, so this page is showing your device’s own clock.';
    return `<p>${head}</p>${gauge}<button type="button" class="tx-btn" data-act="resync"${syncing ? ' disabled' : ''}>${syncing ? 'Measuring…' : 'Measure again'}</button>`;
  }

  /* ---------- 5: zmanim and the sun ---------- */
  function sunHTML(n) {
    const sn = ctx.sun(), loc = sn.loc, tz = loc.tz;
    let out = `<p>Clocks follow a time zone, but zmanim follow <b>the sun where you are</b>. A time zone is a band hundreds of miles wide, and sunrise and sunset shift about 4 minutes for every degree of longitude. Across one zone, sunset can differ by most of an hour. That’s why zmanim need a city, not just a zone.</p>`;
    if (!sn.coords) {
      return out + `<button type="button" class="tx-btn" data-act="city">Choose your city for zmanim</button>`;
    }
    if (sn.rep) out += `<p class="tx-rep">These numbers are for <b>${esc(sn.rep.name)}</b>, standing in for your time zone. <button type="button" class="tx-link" data-act="city">Set your city</button></p>`;
    const sd = sn.sd;
    if (!sd) return out;
    const rise = +sd.rise, set = +sd.set, span = set - rise, hour = span / 12;
    const at = (k) => { const i = sn.items.find((x) => x.key === k); return i ? +i.at : null; };
    const marks = [['Shema', 3, at('sofZmanShma')], ['Chatzos', 6, at('chatzos')], ['Plag', 10.75, at('plagHamincha')]];
    const pos = (h) => (h / 12 * 100).toFixed(2);
    const nowF = (n - rise) / span;
    out += `<div class="tx-day" aria-hidden="true"><div class="tx-hours">${Array.from({ length: 12 }, (_, i) => `<span>${i + 1}</span>`).join('')}</div>` +
      marks.map(([lb, h]) => `<i class="mk" style="left:${pos(h)}%"><em>${lb}</em></i>`).join('') +
      (nowF >= 0 && nowF <= 1 ? `<b class="now" style="left:${(nowF * 100).toFixed(2)}%"></b>` : '') +
      `</div><div class="tx-dl"><span>Netz ${esc(hmText(rise, tz))}</span><span>Shkiah ${esc(hmText(set, tz))}</span></div>`;
    out += `<p>A halachic hour (<i>sha’ah zmanis</i>) is daylight ÷ 12, not 60 minutes. ${esc(sn.where)} has <b>${esc(dur(span))}</b> of daylight today, so each halachic hour is <b>${esc(dur(hour))}</b>. ` +
      `Sof Zman Shema is the end of hour 3${marks[0][2] ? ` (${esc(hmText(marks[0][2], tz))})` : ''}, Chatzos is the middle of the day${marks[1][2] ? ` (${esc(hmText(marks[1][2], tz))})` : ''}, and Plag Hamincha is 1¼ hours before sunset${marks[2][2] ? ` (${esc(hmText(marks[2][2], tz))})` : ''}.</p>`;
    const Z = ctx.Z();
    if (Z && Z.sunTimes && loc.lat != null && isFinite(loc.lat)) {
      try {
        const y = new Date(n).getUTCFullYear();
        const len = (m, d) => { const st = Z.sunTimes({ y, m, d }, loc); return st && st.sunrise && st.sunset ? (st.sunset - st.sunrise) / 12 : null; };
        const jun = len(6, 21), dec = len(12, 21);
        if (jun && dec) out += `<p class="tx-small">Halachic hours stretch and shrink with the seasons: around June 21 they’re about <b>${Math.round(jun / MIN)} min</b> here, around December 21 about <b>${Math.round(dec / MIN)} min</b>.</p>`;
      } catch (e) {}
    }
    return out;
  }

  /* ---------- 6: the Hebrew day ---------- */
  function hebHTML(n) {
    const h = ctx.hebrew(), tz = ctx.loc().tz;
    if (!h.text) return '<p>The Hebrew day begins at nightfall, not midnight.</p>';
    const ss = h.sunset ? +h.sunset : null;
    let p;
    if (!ss) p = `Today is <b>${esc(h.text)}</b>. Without a city there’s no sunset time, so this page switches the Hebrew date at midnight. Choose a city to have it switch at shkiah.`;
    else if (h.after) p = `Since shkiah at <b>${esc(hmText(ss, tz))}</b> it’s already <b>${esc(h.text)}</b>, though the wall calendar still says ${esc(dateText(n, tz, { month: 'short', day: 'numeric' }))}. It changes again at tomorrow’s shkiah.`;
    else p = `Today is <b>${esc(h.text)}</b>. At shkiah (<b>${esc(hmText(ss, tz))}</b>, in ${esc(inWords(ss - n))}) it becomes <b>${esc(h.next || 'the next day')}</b>.`;
    let bars = '';
    if (ss) {
      // a 36-hour window from 6 AM yesterday-ish: civil midnight vs Hebrew sunset boundary
      const off = T.offsetMin(tz, n);
      const locMs = n + off * MIN, midnight = Math.floor(locMs / DAY) * DAY - off * MIN; // today's local midnight (UTC ms)
      const w0 = midnight - 6 * 3600000, W = 36 * 3600000;
      const P = (t) => clamp((t - w0) / W * 100, 0, 100).toFixed(2);
      bars = `<div class="tx-days" aria-hidden="true">` +
        `<div class="tx-row"><span>Calendar day</span><div class="tx-tr"><i style="left:${P(midnight)}%;width:${(P(midnight + DAY) - P(midnight)).toFixed(2)}%"></i><b style="left:${P(n)}%"></b></div></div>` +
        `<div class="tx-row"><span>Hebrew day</span><div class="tx-tr heb"><i style="left:${P(h.after ? ss : ss - DAY)}%;width:${(P(h.after ? ss + DAY : ss) - P(h.after ? ss : ss - DAY)).toFixed(2)}%"></i><b style="left:${P(n)}%"></b></div></div>` +
        `<div class="tx-row"><span></span><div class="tx-axis"><em style="left:${P(midnight)}%">midnight</em><em style="left:${P(ss)}%">shkiah</em>${Math.abs(P(midnight + DAY) - P(ss)) > 22 ? `<em style="left:${P(midnight + DAY)}%">midnight</em>` : ''}</div></div></div>`;
    }
    return `<p>The Hebrew day starts in the evening, as in “there was evening and there was morning.” So this page flips the Hebrew date at shkiah (sunset), not at midnight.</p>` + bars + `<p>${p}</p>`;
  }

  /* ---------- assembly ---------- */
  function build() {
    const n = ctx.now(), loc = ctx.loc(), tz = loc.tz;
    const off = T.offsetMin(tz, n), g = T.genericName(tz, n), ab = T.abbr(tz, n), yi = T.yearInfo(tz, n), dst = T.isDST(tz, n);
    const mine = loc.auto || T.canonTz(tz) === T.canonTz(ctx.deviceTz);
    const who = mine ? `You’re on <b>${esc(g)}</b>` : `This clock is set to <b>${esc(loc.kind === 'zone' ? g : loc.name)}</b>${loc.kind === 'zone' ? '' : `, on ${esc(g)}`}`;
    const paren = [ab, yi.observes ? (dst ? 'daylight saving time' : 'standard time') : ''].filter(Boolean).join(', ');
    const rel = off === 0 ? 'Your clocks read exactly UTC.' : `${mine ? 'Your' : 'Its'} clocks read <b>UTC ${off < 0 ? 'minus' : 'plus'} ${esc(T.spanWords(off))}</b>.`;
    const noonTxt = wall(Date.UTC(2000, 0, 1, 12), off);
    // compare with Israel, or with New York when you're on Israel's offset already
    const cmpIL = T.offsetMin('Asia/Jerusalem', n) !== off;
    const il = T.offsetMin(cmpIL ? 'Asia/Jerusalem' : 'America/New_York', n), ilNoon = wall(Date.UTC(2000, 0, 1, 12), il);
    const devNote = !mine ? `<p class="tx-small">Your device itself is on ${esc(T.genericName(ctx.deviceTz, n))} (${esc(T.fmtOffset(T.offsetMin(ctx.deviceTz, n), true))}).</p>` : '';
    const kir = T.validTz('Pacific/Kiritimati') ? 'Pacific/Kiritimati' : null, sam = 'Pacific/Pago_Pago';
    const facts = FACTS.map(([k, v]) => `<li><b>${esc(k)}</b><span>${esc(v)}</span></li>`).join('');

    return `<article class="tx">
<section class="tx-s"><p class="tx-k">01 · Right now</p><h3>Your time, right now</h3>
  <div class="tx-duo">
    <div class="tx-clk"><small>UTC · world reference</small><b data-live="utc"></b></div>
    <div class="tx-arrow" aria-hidden="true"><span>${esc(deltaText(off))}</span><svg viewBox="0 0 40 10"><path d="M1 5h36M33 1.5L37 5l-4 3.5"/></svg></div>
    <div class="tx-clk me"><small>${esc(T.shortGeneric(tz, n))}${ab ? ' · ' + esc(ab) : ''}</small><b data-live="local"></b></div>
  </div>
  <p>${who}, which is <b>${esc(T.fmtOffset(off, true))}</b> right now${paren ? ` (${esc(paren)})` : ''}. ${rel}</p>
  <p><b>UTC</b>, Coordinated Universal Time, is the world’s reference clock. It’s kept by hundreds of atomic clocks in labs around the world, never changes for daylight saving, and every time zone is defined as an offset from it.</p>
  ${devNote}
</section>

<section class="tx-s"><p class="tx-k">02 · Offsets</p><h3>What “${esc(T.fmtOffset(off))}” means</h3>
  <p>The number after UTC is how far a clock is from the world clock. <b>Minus</b> means behind and <b>plus</b> means ahead. When it’s noon in UTC, it’s ${esc(noonTxt)} on ${esc(T.shortGeneric(tz, n))} time and ${esc(ilNoon)} in ${cmpIL ? 'Israel' : 'New York'}.</p>
  <p>The Earth turns 15° an hour, so going east the sun rises earlier. The Americas sit west of Greenwich, so their offsets are minus. Israel and Asia sit east, so theirs are plus.</p>
  <div class="tx-strip" role="group" aria-label="Every UTC offset in use right now"><div class="tx-cols" data-live="strip"></div></div>
  <div class="tx-pick" data-live="pick" aria-live="polite"></div>
  <p class="tx-small">Not every zone is a whole hour. India is +5:30, Nepal +5:45, and Newfoundland −3:30 (−2:30 in summer).${kir ? ` Across the date line it can be two days at once: right now it’s <b data-live="kir"></b> in Kiritimati (+14) and <b data-live="sam"></b> in American Samoa (−11).` : ''}</p>
</section>

<section class="tx-s"><p class="tx-k">03 · Daylight saving</p><h3>Why the clocks jump</h3><div data-live="dst"></div></section>

<section class="tx-s"><p class="tx-k">04 · Exact time</p><h3>Why your device clock is off</h3>
  <div data-live="sync"></div>
  <p>Phones and computers keep time with a tiny quartz crystal that vibrates 32,768 times a second. It’s good but not perfect: temperature and age make it drift, and a few seconds a week is normal. So devices regularly check with a time server.</p>
  <p>That check is <b>NTP</b>, the Network Time Protocol. Ask a server the time, measure how long the answer took, and assume it spent half that trip on the way back. This page does the same thing from your browser and keeps the fastest of several tries. At the top of the chain are <b>atomic clocks</b>: one second is officially 9,192,631,770 vibrations of a cesium-133 atom.</p>
</section>

<section class="tx-s"><p class="tx-k">05 · The sun</p><h3>Zmanim come from the sun</h3><div data-live="sun"></div></section>

<section class="tx-s"><p class="tx-k">06 · Hebrew date</p><h3>The Hebrew day starts at night</h3><div data-live="heb"></div></section>

<section class="tx-s"><p class="tx-k">07 · Fun facts</p><h3>Strange but true</h3><ul class="tx-facts">${facts}</ul></section>
</article>`;
  }

  const q = (k) => root.querySelector(`[data-live="${k}"]`);
  function paintMinute(n) {
    const strip = q('strip');
    if (strip) strip.innerHTML = stripHTML(n);
    const pk = q('pick'); if (pk) pk.innerHTML = pickHTML(n);
    const d = q('dst'); if (d) d.innerHTML = dstHTML(n);
    const s = q('sun'); if (s) s.innerHTML = sunHTML(n);
    const h = q('heb'); if (h) h.innerHTML = hebHTML(n);
    const kir = q('kir'), sam = q('sam');
    if (kir) kir.textContent = `${hmText(n, 'Pacific/Kiritimati')} ${dateText(n, 'Pacific/Kiritimati', { weekday: 'long' })}`;
    if (sam) sam.textContent = `${hmText(n, 'Pacific/Pago_Pago')} ${dateText(n, 'Pacific/Pago_Pago', { weekday: 'long' })}`;
  }
  function tick(force) {
    const n = ctx.now(), tz = ctx.loc().tz;
    const u = q('utc'), l = q('local');
    if (u) u.innerHTML = timeHTML(n, 'UTC', true, true);
    if (l) l.innerHTML = timeHTML(n, tz, ctx.h24(), true);
    const sy = q('sync');
    if (sy && !syncing) { const h = syncHTML(); if (sy.dataset.h !== h) { sy.innerHTML = h; sy.dataset.h = h; } }
    const m = Math.floor(n / MIN);
    if (force || m !== lastMinute) { lastMinute = m; paintMinute(n); }
  }
  function centerStrip(smooth) {
    const strip = root.querySelector('.tx-strip'), me = root.querySelector('.tx-col.me');
    if (!strip || !me) return;
    const x = me.offsetLeft - (strip.clientWidth - me.offsetWidth) / 2;
    try { strip.scrollTo({ left: Math.max(0, x), behavior: smooth && !ctx.reduce() ? 'smooth' : 'auto' }); } catch (e) { strip.scrollLeft = Math.max(0, x); }
  }

  root.addEventListener('click', async (e) => {
    const col = e.target.closest('.tx-col');
    if (col) {
      const off = +col.dataset.off;
      sel = sel === off ? null : off;
      root.querySelectorAll('.tx-col').forEach((c) => { const on = +c.dataset.off === sel; c.classList.toggle('sel', on); c.setAttribute('aria-pressed', String(on)); });
      const pk = q('pick'); if (pk) pk.innerHTML = pickHTML(ctx.now());
      return;
    }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'city') ctx.openPicker('cities');
    else if (act.dataset.act === 'resync' && !syncing) {
      syncing = true;
      const sy = q('sync');
      if (sy) { sy.innerHTML = syncHTML(); sy.dataset.h = ''; }
      try { await ctx.resync(); } catch (err) {}
      syncing = false;
      if (sy) { const h = syncHTML(); sy.innerHTML = h; sy.dataset.h = h; }
    }
  });

  function render() {
    sel = null;
    root.innerHTML = build();
    lastMinute = -1;
    tick(true);
    requestAnimationFrame(() => centerStrip(false));
  }
  return { render, tick };
}
