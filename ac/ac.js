(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const KEY = 'szv-ac';
  const MODES = {
    cool: { name: 'Cool', icon: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5"/>', color: 'var(--a2)' },
    heat: { name: 'Heat', icon: '<path d="M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-1.7.8-2.8 1.8-3.8.2 1.2.8 1.8 1.5 2C11.5 7.5 11.5 5 12 3z"/><path d="M12 21a2 2 0 0 0 2-2"/>', color: '#fb923c' },
    fan:  { name: 'Fan',  icon: '<circle cx="12" cy="12" r="1.6"/><path d="M12 10.4C12 6 14.5 4 17 5s2 4-1.6 6M13.6 12c4.4 0 6.4 2.5 5.4 5s-4 2-7.4-1.6M12 13.6C12 18 9.5 20 7 19s-2-4 1.6-6M10.4 12C6 12 4 9.5 5 7s4-2 7.4 1.6"/>', color: 'var(--a1)' },
    dry:  { name: 'Dry',  icon: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>', color: 'var(--a3)' },
    eco:  { name: 'Eco',  icon: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19c3-4 6-6 9-8"/>', color: '#4ade80' },
    auto: { name: 'Auto', icon: '<path d="M12 4l3.2 8h-6.4zM6 20l6-13 6 13M8.5 15h7"/>', color: 'var(--a1)' }
  };
  const MODE_KEYS = Object.keys(MODES);
  const FANS = ['auto', 1, 2, 3, 4];
  const RANGE = { F: [60, 90], C: [16, 32] };
  const DEFAULTS = { room: 'Living Room', target: 72, roomT: 78, unit: 'F', mode: 'cool', fan: 'auto', on: true, status: '', drift: true };

  let S = Object.assign({}, DEFAULTS);
  try { const raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw && typeof raw === 'object') S = Object.assign(S, raw); } catch (e) {}
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  const buzz = (n) => { try { if (!reduced && navigator.vibrate) navigator.vibrate(n); } catch (e) {} };
  const clamp = (v) => Math.max(RANGE[S.unit][0], Math.min(RANGE[S.unit][1], v));
  const toC = (f) => Math.round((f - 32) * 5 / 9);
  const toF = (c) => Math.round(c * 9 / 5 + 32);
  // sanity-check anything that came out of storage
  S.unit = S.unit === 'C' ? 'C' : 'F';
  S.target = clamp(Math.round(Number(S.target)) || DEFAULTS.target);
  S.roomT = Math.round(Number(S.roomT)) || DEFAULTS.roomT;
  if (!MODES[S.mode]) S.mode = 'cool';
  if (!FANS.includes(S.fan)) S.fan = 'auto';
  S.room = String(S.room).slice(0, 24); S.status = String(S.status).slice(0, 40);

  function autoStatus() {
    const t = S.target + '°';
    if (!S.on) return 'Standby';
    if (S.mode === 'fan') return 'Circulating air';
    if (S.mode === 'dry') return 'Dehumidifying';
    if (S.mode === 'eco') return 'Eco · holding ' + t;
    if (S.mode === 'auto') return 'Auto · holding ' + t;
    if (S.mode === 'heat') return S.roomT < S.target ? 'Heating to ' + t : 'Holding ' + t;
    return S.roomT > S.target ? 'Cooling to ' + t : 'Holding ' + t;
  }

  function render() {
    const m = MODES[S.mode];
    document.body.classList.toggle('off', !S.on);
    document.body.classList.toggle('fan0', false);
    document.documentElement.style.setProperty('--mode', m.color);
    $('modeIcon').innerHTML = m.icon;
    $('modeName').textContent = m.name.toUpperCase();
    $('modeBtnV').textContent = m.name;
    $('roomName').textContent = S.room || ' ';
    $('target').textContent = S.target;
    $('unitLabel').textContent = '°' + S.unit;
    $('roomT').textContent = S.roomT + '°';
    const lvl = S.fan === 'auto' ? 2 : S.fan;
    [...$('fanBars').children].forEach((el, i) => el.classList.toggle('on', S.on && i < lvl));
    $('fanName').textContent = String(S.fan).toUpperCase();
    $('fanBtnV').textContent = S.fan === 'auto' ? 'Auto' : 'Speed ' + S.fan;
    $('status').textContent = S.status.trim() || autoStatus();
    $('power').setAttribute('aria-pressed', S.on);
    ['down', 'up'].forEach((id) => { $(id).disabled = !S.on; $(id).style.opacity = S.on ? '' : '.35'; });
    $('modeBtn').disabled = $('fanBtn').disabled = !S.on;
    $('modeBtn').style.opacity = $('fanBtn').style.opacity = S.on ? '' : '.35';
    if ($('sheet').classList.contains('on')) renderSheet();
  }

  function setTarget(v) { const n = clamp(v); if (n !== S.target) { S.target = n; buzz(8); } render(); save(); }
  function cycle(list, cur, dir) { return list[(list.indexOf(cur) + (dir || 1) + list.length) % list.length]; }
  const nextMode = () => { S.mode = cycle(MODE_KEYS, S.mode); buzz(10); render(); save(); };
  const nextFan = () => { S.fan = cycle(FANS, S.fan); buzz(10); render(); save(); };
  function setPower(on) { S.on = on; buzz(on ? [12, 40, 12] : 20); render(); save(); wake(); }

  // press-and-hold repeat for the +/- buttons (tap = one step; 10px slop so scroll/jitter doesn't misfire)
  function holdable(btn, fn) {
    let t1, t2, sx, sy, active = false;
    const stop = () => { active = false; clearTimeout(t1); clearInterval(t2); };
    btn.addEventListener('pointerdown', (e) => {
      if (btn.disabled) return;
      sx = e.clientX; sy = e.clientY; active = true; fn();
      t1 = setTimeout(() => { t2 = setInterval(fn, 110); }, 420);
    });
    btn.addEventListener('pointermove', (e) => { if (active && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) stop(); });
    ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture', 'blur'].forEach((ev) => btn.addEventListener(ev, stop));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
  }
  holdable($('up'), () => setTarget(S.target + 1));
  holdable($('down'), () => setTarget(S.target - 1));
  $('power').addEventListener('click', () => setPower(!S.on));
  $('modeBtn').addEventListener('click', nextMode);
  $('fanBtn').addEventListener('click', nextFan);

  // room temperature slowly meanders toward the target while on (cool/heat/eco/auto)
  setInterval(() => {
    if (!S.on || !S.drift || S.mode === 'fan' || S.mode === 'dry') return;
    if (S.mode === 'cool' && S.roomT <= S.target) return;
    if (S.mode === 'heat' && S.roomT >= S.target) return;
    if (S.roomT === S.target) return;
    S.roomT += S.roomT > S.target ? -1 : 1; render(); save();
  }, 90000);

  // keep the screen awake while on (it lives on a big screen)
  let lock = null;
  async function wake() {
    try {
      if (!('wakeLock' in navigator)) return;
      if (S.on && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
      else if (!S.on && lock) { await lock.release(); lock = null; }
    } catch (e) { lock = null; }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake(); });
  addEventListener('pointerdown', wake, { once: true });

  // ---- edit sheet ----
  const sheet = $('sheet'), back = $('back');
  function chips(el, items, cur, onPick) {
    el.textContent = '';
    items.forEach(([val, label]) => {
      const b = document.createElement('button');
      b.className = 'btn chip'; b.type = 'button'; b.textContent = label;
      b.setAttribute('aria-pressed', String(val === cur));
      b.addEventListener('click', () => { onPick(val); buzz(8); });
      el.appendChild(b);
    });
  }
  function renderSheet() {
    $('eTVal').textContent = S.target + '°' + S.unit;
    $('eRVal').textContent = S.roomT + '°' + S.unit;
    $('eStatus').placeholder = autoStatus();
    $('eDrift').checked = !!S.drift;
    chips($('eUnit'), [['F', '°F'], ['C', '°C']], S.unit, (u) => {
      if (u === S.unit) return;
      S.target = u === 'C' ? toC(S.target) : toF(S.target);
      S.roomT = u === 'C' ? toC(S.roomT) : toF(S.roomT);
      S.unit = u; S.target = clamp(S.target); render(); save();
    });
    chips($('eMode'), MODE_KEYS.map((k) => [k, MODES[k].name]), S.mode, (k) => { S.mode = k; render(); save(); });
    chips($('eFan'), FANS.map((f) => [f, f === 'auto' ? 'Auto' : String(f)]), S.fan, (f) => { S.fan = f; render(); save(); });
  }
  let lastFocus = null;
  function openSheet() {
    lastFocus = document.activeElement;
    $('eRoom').value = S.room; $('eStatus').value = S.status;
    renderSheet();
    sheet.hidden = back.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => { sheet.classList.add('on'); back.classList.add('on'); }));
    setTimeout(() => $('eDone').focus({ preventScroll: true }), 50);
  }
  function closeSheet() {
    sheet.classList.remove('on'); back.classList.remove('on');
    setTimeout(() => { sheet.hidden = back.hidden = true; }, reduced ? 260 : 460);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  $('pencil').addEventListener('click', openSheet);
  $('eDone').addEventListener('click', closeSheet);
  back.addEventListener('click', closeSheet);
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheet.classList.contains('on')) { closeSheet(); return; }
    if (sheet.classList.contains('on') || /^(INPUT|TEXTAREA)$/.test((e.target || {}).tagName || '')) return;
    if (e.key === 'ArrowUp' && S.on) { e.preventDefault(); setTarget(S.target + 1); }
    else if (e.key === 'ArrowDown' && S.on) { e.preventDefault(); setTarget(S.target - 1); }
    else if (e.key === 'm' && S.on) nextMode();
    else if (e.key === 'f' && S.on) nextFan();
    else if (e.key === 'p') setPower(!S.on);
  });
  $('eRoom').addEventListener('input', (e) => { S.room = e.target.value.slice(0, 24); render(); save(); });
  $('eStatus').addEventListener('input', (e) => { S.status = e.target.value.slice(0, 40); render(); save(); });
  $('eDrift').addEventListener('change', (e) => { S.drift = e.target.checked; save(); });
  holdable($('eTUp'), () => setTarget(S.target + 1));
  holdable($('eTDown'), () => setTarget(S.target - 1));
  holdable($('eRUp'), () => { S.roomT = Math.min(S.roomT + 1, 120); render(); save(); });
  holdable($('eRDown'), () => { S.roomT = Math.max(S.roomT - 1, -20); render(); save(); });
  $('eReset').addEventListener('click', () => {
    S = Object.assign({}, DEFAULTS); $('eRoom').value = S.room; $('eStatus').value = ''; render(); save();
  });

  render();
  wake();
})();
