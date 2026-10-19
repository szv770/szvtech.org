// /today — one-screen daily dashboard. Reads the other tools' data (read-only) and shows it as cards.
// Every card fails on its own: offline or missing data never blanks the page.
import { createClock } from '/zmanim/sync.js?v=0af1f5a734';
import { savedLoc, defaultLoc, getDays, todayIn, partsIn, hmText, nextItem, phaseAt, LABELS, SHORT, deviceTz, hasCoords, lsGet, lsSet, lsJSON, MIN } from '/zmanim/data.js?v=41d2c1bfa5';
import { effectiveDay, L } from '/tehillim/today.js?v=931afbade0';
import * as TL from '/tehillim/logic.js?v=5e5c47449c';
import * as Q from '/seder/logic.js?v=ff56013e90';
import { upcoming, load as loadRemind, splitMs, KEY as REMIND_KEY } from '/remind/remind.js?v=a8a7c39c62';
import { loadZmanSource } from '/remind/zsource.js?v=ae99534ce1';
import { TOOLS, ICONS } from '/assets/tools.js?v=aa1eac7a80';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clock = createClock();
const now = () => clock.now();
const pad2 = (n) => String(n).padStart(2, '0');
const LAYOUT = 'szv-today-layout', NOTE = 'szv-today-note';

/* ------------------------------------------------------------------ shared state */
let loc = null, tz = deviceTz, eff = null, days = [], daysErr = false, wx = null, wxErr = false, wxAt = 0;
const place = () => (loc && (loc.name || loc.label)) || '';
function readLoc() {
  try { loc = savedLoc() || defaultLoc(); } catch (e) { loc = null; }
  tz = (loc && loc.tz) || deviceTz;
}

/* ------------------------------------------------------------------ card registry */
const CARDS = {
  time: { name: 'Time', render: timeHTML, every: 1 },
  zmanim: { name: 'Zmanim', render: zmanimHTML, every: 1 },
  remind: { name: 'Reminders', render: remindHTML, every: 1 },
  weather: { name: 'Weather', render: weatherHTML, every: 30 },
  learn: { name: 'Learning', render: learnHTML, every: 30 },
  note: { name: 'Note', render: noteHTML, every: 0 },
  links: { name: 'Tools', render: linksHTML, every: 0 },
};
const DEFAULT_ORDER = ['time', 'zmanim', 'remind', 'weather', 'learn', 'note', 'links'];

let layout = readLayout();
function readLayout() {
  const j = lsJSON(LAYOUT, null);
  const ord = Array.isArray(j && j.order) ? j.order.filter((x, i, a) => CARDS[x] && a.indexOf(x) === i) : [];
  for (const id of DEFAULT_ORDER) if (!ord.includes(id)) ord.push(id);
  const hid = Array.isArray(j && j.hidden) ? j.hidden.filter((x, i, a) => CARDS[x] && a.indexOf(x) === i) : [];
  return { v: 1, order: ord, hidden: hid };
}
const saveLayout = () => lsSet(LAYOUT, JSON.stringify(layout));

/* ------------------------------------------------------------------ time card */
function hebNow(t) {
  try {
    const p = partsIn(t, tz), civil = L.gregToAbs(p.y, p.m, p.d);
    const ymd = `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
    const after = !!(eff && eff.civilYmd === ymd && eff.sunsetMs && t >= eff.sunsetMs);
    const h = L.absToHebrew(civil + (after ? 1 : 0));
    return { h, after, en: L.hebrewDateEn(h, true), he: L.hebrewDateHe(h), known: !!(eff && eff.sunsetMs) };
  } catch (e) { return null; }
}
const fmtDate = (t) => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' }).format(t);
function tzAbbr(t) { try { return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(t).find((x) => x.type === 'timeZoneName').value; } catch (e) { return ''; } }
function timeHTML() {
  const t = now(), p = partsIn(t, tz);
  const h12 = p.H % 12 || 12, ap = p.H < 12 ? 'AM' : 'PM';
  const hb = hebNow(t);
  const tags = ((days[0] && days[0].special) || []).slice(0, 3).map((s) => `<span class="tag">${esc(s.name)}</span>`).join('');
  return `<div class="clk"><span class="hm grad-t" data-k="hm">${h12}:${pad2(p.M)}</span><span class="ss" data-k="ss">${pad2(p.S)}</span><span class="ap" data-k="ap">${ap}</span></div>
  <div class="dateline"><span data-k="date">${esc(fmtDate(t))}</span></div>
  ${hb ? `<div class="heb"><div><b data-k="heb">${esc(hb.en)}</b><small data-k="hebnote">${hb.after ? 'After sunset: the new Hebrew day has begun' : hb.known ? 'Until sunset' : 'By the daytime date'}</small></div><span class="he" lang="he" data-k="hebhe">${esc(hb.he)}</span></div>` : ''}
  ${tags ? `<div class="tags">${tags}</div>` : ''}
  <div class="place">${esc(place())}${place() ? ' · ' : ''}${esc(tzAbbr(t))} · ${clock.status().ok ? 'server-synced' : 'device clock'}</div>`;
}
function timeTick(el) {
  const t = now(), p = partsIn(t, tz);
  const set = (k, v) => { const n = el.querySelector(`[data-k=${k}]`); if (n && n.textContent !== v) n.textContent = v; };
  set('hm', `${p.H % 12 || 12}:${pad2(p.M)}`); set('ss', pad2(p.S)); set('ap', p.H < 12 ? 'AM' : 'PM');
  set('date', fmtDate(t));
  const hb = hebNow(t);
  if (hb) { set('heb', hb.en); set('hebhe', hb.he); set('hebnote', hb.after ? 'After sunset: the new Hebrew day has begun' : hb.known ? 'Until sunset' : 'By the daytime date'); }
}

/* ------------------------------------------------------------------ zmanim card */
const HIGHLIGHT = ['sunrise', 'sofZmanShma', 'chatzos', 'minchaGedola', 'candleLighting', 'sunset', 'shabbosEnds', 'holidayEnds', 'tzeis'];
function cd(ms) {
  const s = splitMs(ms);
  return s.d ? `${s.d}d ${s.h}h` : s.h ? `${s.h}:${pad2(s.m)}:${pad2(s.s)}` : `${pad2(s.m)}:${pad2(s.s)}`;
}
function zmanimHTML() {
  if (!days.length || !days[0]) return daysErr
    ? `<div class="lab">Zmanim</div><p class="err">Zmanim aren’t available right now${hasCoords(loc) ? '' : ' for this location'}. <a href="/zmanim/">Pick a city</a>.</p>`
    : `<div class="lab">Zmanim</div><div class="skel"></div>`;
  const t = now();
  const all = days.filter(Boolean).flatMap((d) => d.items);
  const nx = nextItem(all, t);
  const today = days[0];
  const picks = [];
  for (const k of HIGHLIGHT) { const it = today.items.find((i) => i.key === k); if (it && !(k === 'tzeis' && picks.some((p) => p.key === 'shabbosEnds'))) picks.push(it); }
  const tiles = picks.slice(0, 6).map((i) => `<div class="tile${i.at <= t ? ' past' : ''}${nx && nx.at === i.at && nx.key === i.key ? ' nx' : ''}${i.accent ? ' ac' : ''}" data-at="${i.at}"><b>${esc(hmText(i.at, tz))}</b><small>${esc(SHORT[i.key] || LABELS[i.key] || i.label)}</small></div>`).join('');
  return `<div class="lab">Zmanim<a href="/zmanim/">All</a></div>
  ${nx ? `<div class="next"><div><div class="nm">${esc(nx.label || LABELS[nx.key])}</div><div class="at">${esc(hmText(nx.at, tz))}${nx.at - t > 18 * 3600e3 ? ' tomorrow' : ''}</div></div><div class="cdn"><span data-k="zcd">${cd(nx.at - t)}</span><small>to go</small></div></div>` : '<p class="muted">No more zmanim in the data.</p>'}
  <div class="tiles">${tiles}</div>
  <div class="credit">${today.source === 'chabad' ? 'Zmanim courtesy of Chabad.org' : 'Calculated on this device'}${place() ? ' · ' + esc(place()) : ''}</div>`;
}
let zNext = 0;
function zmanimTick(el) {
  const t = now();
  const all = days.filter(Boolean).flatMap((d) => d.items);
  const nx = nextItem(all, t);
  if (nx && nx.at !== zNext) { if (zNext) return true; zNext = nx.at; }       // next zman changed: redraw
  const c = el.querySelector('[data-k=zcd]');
  if (c && nx) { const v = cd(nx.at - t); if (c.textContent !== v) c.textContent = v; }
  return false;
}

/* ------------------------------------------------------------------ weather card */
const WCOND = (c, day) => {
  if (c == null) return ['Cloudy', 'cloud'];
  if (c === 0) return [day ? 'Clear' : 'Clear night', 'clear'];
  if (c === 1) return [day ? 'Mostly sunny' : 'Mostly clear', 'clear'];
  if (c === 2) return ['Partly cloudy', 'partly'];
  if (c === 3) return ['Overcast', 'cloud'];
  if (c === 45 || c === 48) return ['Fog', 'fog'];
  if (c >= 51 && c <= 57) return ['Drizzle', 'rain'];
  if (c >= 61 && c <= 67) return ['Rain', 'rain'];
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return ['Snow', 'snow'];
  if (c >= 80 && c <= 82) return ['Rain showers', 'rain'];
  if (c >= 95) return ['Thunderstorm', 'storm'];
  return ['Cloudy', 'cloud'];
};
const cloudP = (dy = 0, f = '#e5e7f5', s = '#9ca3c9') => `<path transform="translate(0 ${dy})" d="M20 44h26a10 10 0 0 0 1.5-19.9A14 14 0 0 0 21 27.5 8.4 8.4 0 0 0 20 44z" fill="${f}" stroke="${s}" stroke-width="2.4" stroke-linejoin="round"/>`;
function wIcon(kind, day) {
  const sun = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fde68a" stroke="#fbbf24" stroke-width="2"/>`;
  const moon = (x, y, r) => `<path d="M${x + r * .35} ${y - r}a${r} ${r} 0 1 0 ${r * .9} ${r * 1.45}a${r * .85} ${r * .85} 0 0 1 -${r * .9} -${r * 1.45}z" fill="#e0e7ff" stroke="#a5b4fc" stroke-width="2"/>`;
  let g;
  switch (kind) {
    case 'clear': g = day ? sun(32, 32, 11) + '<path d="M32 12v-3M32 55v-3M12 32h-3M55 32h-3M18 18l-2-2M48 48l-2-2M46 18l2-2M16 48l2-2" stroke="#fcd34d" stroke-width="3" stroke-linecap="round"/>' : moon(30, 32, 14); break;
    case 'partly': g = (day ? sun(25, 23, 8) : moon(25, 23, 10)) + `<g transform="translate(8 6) scale(.85)">${cloudP()}</g>`; break;
    case 'fog': g = cloudP(-10, '#cfd3e6', '#8d93b5') + '<path d="M14 46h36M20 53h28" stroke="#cfd3e6" stroke-width="3" stroke-linecap="round"/>'; break;
    case 'rain': g = cloudP(-8, '#aeb8dd', '#7480b0') + '<path d="M24 42l-2.5 6M33 42l-2.5 6M42 42l-2.5 6" stroke="#67e8f9" stroke-width="3" stroke-linecap="round"/>'; break;
    case 'snow': g = cloudP(-8, '#d8def2', '#9aa6cf') + '<path d="M24 41v6M21.5 44h5M33 41v6M30.5 44h5M42 41v6M39.5 44h5" stroke="#e0f2fe" stroke-width="2" stroke-linecap="round"/>'; break;
    case 'storm': g = cloudP(-8, '#8e98c6', '#5f6a9c') + '<path d="M33 36l-6 10h6l-3 9 10-13h-6l4-6z" fill="#fde047" stroke="#f59e0b" stroke-width="1.5" stroke-linejoin="round"/>'; break;
    default: g = cloudP(-4);
  }
  return `<svg viewBox="0 0 64 64" aria-hidden="true">${g}</svg>`;
}
const wUnits = () => { const u = lsGet('szv-weather-units'); return u === 'us' || u === 'metric' ? u : (/^America\//.test(tz) && !/Sao_Paulo|Argentina|Bogota|Lima|Santiago|Caracas|Montevideo/.test(tz) ? 'us' : 'metric'); };
const wKey = () => `szv-weather:${hasCoords(loc) ? `${(+loc.lat).toFixed(2)},${(+loc.lon).toFixed(2)}` : 'zip' + loc.zip}:${wUnits()}`;
function weatherHTML() {
  if (!wx) return wxErr ? `<div class="lab">Weather</div><p class="err">No weather right now. It will try again, or <a href="/weather/">open Weather</a>.</p>` : `<div class="lab">Weather</div><div class="skel"></div>`;
  const c = wx.current, d0 = wx.days[0] || {};
  const [label, kind] = WCOND(c.code, c.day);
  const T = (v) => (v == null ? '--' : Math.round(v) + '°');
  const next = wx.hours.slice(1, 25).find((h) => (h.pop || 0) >= 50);
  return `<div class="lab">Weather<a href="/weather/">Open</a></div>
  <div class="wx">${wIcon(kind, c.day)}<div><div class="t">${c.temp == null ? '--' : Math.round(c.temp)}<sup>${esc((wx.units && wx.units.temp) || '°')}</sup></div><div class="c">${esc(label)}</div>
  <div class="s">${esc(wx.place || place())} · H <b>${T(d0.hi)}</b> L <b>${T(d0.lo)}</b>${c.feels != null ? ` · feels <b>${T(c.feels)}</b>` : ''}</div>
  ${next ? `<div class="s">Rain likely around <b>${esc(timeAt(next.time))}</b></div>` : ''}</div></div>`;
}
const timeAt = (iso) => { const h = +String(iso).slice(11, 13); return h === 0 ? '12 AM' : h < 12 ? h + ' AM' : h === 12 ? '12 PM' : (h - 12) + ' PM'; };
async function loadWeather(force) {
  if (!loc) return;
  const key = wKey();
  try { const c = JSON.parse(lsGet(key)); if (c && c.data && Date.now() - c.t < 6 * 3600e3) { if (!wx) { wx = c.data; wxAt = c.t; paint('weather'); } if (!force && Date.now() - c.t < 10 * 60e3) return; } } catch (e) {}
  try {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 12000);
    const r = await fetch(`/api/weather?${hasCoords(loc) ? `lat=${loc.lat}&lon=${loc.lon}` : `zip=${loc.zip}`}&units=${wUnits()}`, { signal: ctl.signal });
    clearTimeout(to);
    if (!r.ok) throw new Error('http');
    const j = await r.json();
    if (!j || !j.current || !Array.isArray(j.days)) throw new Error('shape');
    wx = j; wxAt = Date.now(); wxErr = false;
    lsSet(key, JSON.stringify({ t: wxAt, data: j }));
  } catch (e) { if (!wx) wxErr = true; }
  paint('weather');
}

/* ------------------------------------------------------------------ reminders card */
function remindIn(ms) {
  if (ms <= 0) return 'Due now';
  const s = splitMs(ms);
  return s.d ? `${s.d}d ${s.h}h` : s.h ? `${s.h}h ${pad2(s.m)}m` : s.m ? `${s.m}m ${pad2(s.s)}s` : `${s.s}s`;
}
let rList = [];
function remindHTML() {
  let list = [];
  try { list = upcoming(3, now()); } catch (e) { list = []; }
  rList = list;
  const body = list.length ? list.map((r) => `<a class="rrow${r.due ? ' due' : ''}" href="/remind/" data-at="${r.atMs}"><span class="e" aria-hidden="true">${esc(r.emoji || '•')}</span><span class="tt">${esc(r.title)}<small>${esc(new Intl.DateTimeFormat('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(r.atMs))}</small></span><span class="in" data-in>${esc(remindIn(r.atMs - now()))}</span></a>`).join('')
    : `<p class="muted" style="margin:0">Nothing set. <a href="/remind/#new" style="color:var(--a2)">Add a reminder</a></p>`;
  return `<div class="lab">Next up<a href="/remind/">Reminders</a></div>${body}`;
}
function remindTick(el) {
  const t = now();
  if (rList.some((r) => (r.atMs <= t) !== r.due)) return true;
  el.querySelectorAll('.rrow').forEach((a) => { const n = a.querySelector('[data-in]'), v = remindIn(+a.dataset.at - t); if (n && n.textContent !== v) n.textContent = v; });
  return false;
}

/* ------------------------------------------------------------------ learning card */
function learnHTML() {
  const hb = eff || null;
  let teh = '<p class="err">Tehillim by the Hebrew date will show once the date is known.</p>';
  if (hb) {
    try {
      const mode = lsGet('szv-tehillim-mode');
      const wk = mode === 'week';
      const us = wk ? TL.weeklyUnits(hb.wd) : TL.monthlyUnits(Math.min(30, hb.h.d), hb.monthLength);
      const data = lsJSON('szv-tehillim', {});
      const keys = (((data.prog || {})[hb.ymd] || {})[TL.planKey(wk ? 'week' : 'month', wk ? hb.wd : hb.h.d)]) || [];
      const done = TL.doneCount(us, keys), st = TL.streakOf(data.full || {}, hb.ymd);
      teh = `<a class="lk-card" href="/tehillim/"><div class="k">Tehillim today</div><div class="v">${esc(TL.rangeLabel(us))}</div>
        <div class="d">${done >= us.length ? 'All said' : done ? `${done} of ${us.length} said` : 'Not started'}${st.streak ? ` · <span class="flame">${st.streak}-day streak</span>` : ''}</div>
        <div class="bar"><i style="width:${us.length ? Math.round(100 * done / us.length) : 0}%"></i></div></a>`;
    } catch (e) { teh = '<a class="lk-card" href="/tehillim/"><div class="k">Tehillim today</div><div class="v">Open Tehillim</div></a>'; }
  }
  let sed = '';
  try {
    const S = Q.normalizeState(lsJSON('szv-seder', null));
    const dt = Q.dayTotals(S.sessions), t = Q.ymdOf(now());
    const st = Q.streakOf(dt, t, S.settings.dayMin * MIN), tot = (dt[t] || { total: 0 }).total, goal = S.settings.dayGoal * MIN;
    const run = S.active ? ' · timer running' : '';
    sed = `<a class="lk-card" href="/seder/"><div class="k">Seder today</div><div class="v">${tot ? esc(Q.fmtDur(tot)) : 'Not yet'}<span class="muted"> / ${esc(Q.fmtDur(goal))}</span></div>
      <div class="d">${st.streak ? `<span class="flame">${st.streak}-day streak</span>` : 'No streak yet'}${esc(run)}</div>
      <div class="bar"><i style="width:${Math.min(100, Math.round(100 * tot / Math.max(1, goal)))}%"></i></div></a>`;
  } catch (e) { sed = '<a class="lk-card" href="/seder/"><div class="k">Seder</div><div class="v">Open Seder</div></a>'; }
  return `<div class="lab">Learning</div><div class="duo">${teh}${sed}</div>`;
}

/* ------------------------------------------------------------------ note card */
function noteHTML() {
  return `<div class="lab">Pinned note<span class="saved" id="noteSaved" aria-live="polite"></span></div><textarea class="note-t" id="noteT" rows="3" maxlength="4000" placeholder="Anything you want to see first thing…" aria-label="Pinned note"></textarea>`;
}
function wireNote(el) {
  const ta = el.querySelector('#noteT'), sv = el.querySelector('#noteSaved');
  if (!ta) return;
  ta.value = lsGet(NOTE) || '';
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, innerHeight * .5) + 'px'; };
  grow();
  let t = 0;
  ta.addEventListener('input', () => {
    grow(); sv.textContent = '';
    clearTimeout(t);
    t = setTimeout(() => { lsSet(NOTE, ta.value); sv.textContent = 'Saved'; setTimeout(() => { if (sv.textContent === 'Saved') sv.textContent = ''; }, 1500); }, 400);
  });
  ta.addEventListener('blur', () => { clearTimeout(t); lsSet(NOTE, ta.value); });
}

/* ------------------------------------------------------------------ links card */
const BELL = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2.5h-15zM10 21h4"/></svg>';
function linksHTML() {
  const ids = ['time', 'zmanim', 'luach', 'weather', 'tehillim', 'seder', 'timer', 'world'];
  const out = [`<a class="lk" href="/remind/">${BELL}<span>Remind</span></a>`];
  for (const id of ids) {
    const t = TOOLS.find((x) => x.id === id && x.live);
    if (t) out.push(`<a class="lk" href="${esc(t.path)}">${ICONS[t.icon] || ICONS.tool}<span>${esc(t.name)}</span></a>`);
  }
  return `<div class="lab">Tools</div><div class="lks">${out.join('')}</div>`;
}

/* ------------------------------------------------------------------ board */
const board = $('board');
const UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>', DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
let editing = false;

function paint(id) {
  const host = board.querySelector(`[data-card="${id}"] .cb`);
  if (!host) return;
  const was = host.querySelector('#noteT');
  if (was) return;                                   // never rebuild the note under the cursor
  host.innerHTML = CARDS[id].render();
  if (id === 'zmanim') zNext = 0;
}
function buildBoard() {
  const vis = layout.order.filter((id) => !layout.hidden.includes(id));
  board.className = 'board' + (editing ? ' editing' : '');
  board.innerHTML = vis.map((id, i) => `<section class="card" data-card="${id}" aria-label="${esc(CARDS[id].name)}">
    <div class="tools"><span class="nm">${esc(CARDS[id].name)}</span>
      <button class="ib" type="button" data-mv="-1" aria-label="Move ${esc(CARDS[id].name)} up"${i === 0 ? ' disabled' : ''}>${UP}</button>
      <button class="ib" type="button" data-mv="1" aria-label="Move ${esc(CARDS[id].name)} down"${i === vis.length - 1 ? ' disabled' : ''}>${DOWN}</button>
      <button class="ib hide" type="button" data-hide aria-label="Hide ${esc(CARDS[id].name)}">Hide</button></div>
    <div class="cb">${CARDS[id].render()}</div></section>`).join('');
  const nt = board.querySelector('[data-card=note] .cb');
  if (nt) wireNote(nt);
  const hid = layout.hidden;
  $('shelf').hidden = !(editing && hid.length);
  $('shelfRow').innerHTML = hid.map((id) => `<button class="shelf-b" type="button" data-show="${id}">+ ${esc(CARDS[id].name)}</button>`).join('');
  $('editBar').hidden = !editing;
  zNext = 0;
}
board.addEventListener('click', (e) => {
  const card = e.target.closest('[data-card]'); if (!card) return;
  const id = card.dataset.card;
  const mv = e.target.closest('[data-mv]');
  if (mv) {
    const vis = layout.order.filter((x) => !layout.hidden.includes(x)), i = vis.indexOf(id), j = i + +mv.dataset.mv;
    if (j < 0 || j >= vis.length) return;
    const other = vis[j];
    const a = layout.order.indexOf(id), b = layout.order.indexOf(other);
    [layout.order[a], layout.order[b]] = [layout.order[b], layout.order[a]];
    saveLayout(); buildBoard();
    const nb = board.querySelector(`[data-card="${id}"] [data-mv="${mv.dataset.mv}"]`) || board.querySelector(`[data-card="${id}"] .ib`);
    if (nb) { nb.focus({ preventScroll: true }); nb.closest('.card').scrollIntoView({ block: 'nearest', behavior: 'auto' }); }
    return;
  }
  if (e.target.closest('[data-hide]')) { layout.hidden.push(id); saveLayout(); buildBoard(); }
});
$('shelfRow').addEventListener('click', (e) => {
  const b = e.target.closest('[data-show]'); if (!b) return;
  layout.hidden = layout.hidden.filter((x) => x !== b.dataset.show); saveLayout(); buildBoard();
});
$('editBtn').addEventListener('click', () => {
  editing = !editing;
  $('editBtn').setAttribute('aria-pressed', String(editing));
  $('editBtn').textContent = editing ? 'Done' : 'Arrange';
  buildBoard();
});
$('resetLayout').addEventListener('click', () => { layout = { v: 1, order: DEFAULT_ORDER.slice(), hidden: [] }; saveLayout(); buildBoard(); });

/* ------------------------------------------------------------------ data loading */
async function loadDay(force) {
  readLoc();
  try {
    const t = now();
    const today = todayIn(t, tz);
    const [e, r] = await Promise.all([effectiveDay(t), getDays(loc, today, 2, t)]);
    eff = e; days = r.days || []; daysErr = !days[0];
  } catch (e) { daysErr = true; }
  const ph = days[0] ? phaseAt(days[0], now()) : 'night';
  document.querySelector('.atmos').dataset.ph = ph;
  for (const id of ['time', 'zmanim', 'learn']) paint(id);
}
async function loadRemindZ() {
  try { if (loadRemind().items.some((i) => i.kind === 'zman')) { const ok = await loadZmanSource(now()); if (ok) paint('remind'); } } catch (e) {}
}

/* ------------------------------------------------------------------ tick */
let lastDay = '', tickN = 0;
function tick() {
  tickN++;
  const t = now();
  const dkey = todayIn(t, tz);
  if (lastDay && dkey !== lastDay) { lastDay = dkey; loadDay(); loadRemindZ(); }
  lastDay = dkey;
  for (const id of Object.keys(CARDS)) {
    const el = board.querySelector(`[data-card="${id}"] .cb`);
    if (!el || editing) continue;
    if (id === 'time') timeTick(el);
    else if (id === 'zmanim') { if (zmanimTick(el)) paint('zmanim'); }
    else if (id === 'remind') { if (remindTick(el)) paint('remind'); }
    else if (id === 'learn' && tickN % 30 === 0) paint('learn');
  }
}

/* ------------------------------------------------------------------ start */
readLoc();
clock.start();
document.body.classList.add('intro');
buildBoard();
setTimeout(() => document.body.classList.remove('intro'), 1200);
loadDay(); loadWeather(); loadRemindZ();
setInterval(tick, 1000);
setInterval(() => loadWeather(), 10 * 60e3);
setInterval(() => loadDay(), 5 * 60e3);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { loadDay(); loadWeather(); paint('remind'); paint('learn'); } });
addEventListener('storage', (e) => {
  if (e.key === LAYOUT) { layout = readLayout(); buildBoard(); }
  else if (e.key === NOTE) { const ta = $('noteT'); if (ta && document.activeElement !== ta) ta.value = lsGet(NOTE) || ''; }
  else if (e.key === REMIND_KEY) paint('remind');
  else if (e.key && /^szv-(tehillim|seder)/.test(e.key)) paint('learn');
  else if (e.key === 'szv-time-loc') { loadDay(); wx = null; loadWeather(true); loadRemindZ(); }
});
