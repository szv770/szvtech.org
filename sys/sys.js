/* ==========================================================================
   SZV-OPS decoy runtime.

   This is a HONEYPOT / DECOY. It is 100% inert, client-side theatre:
   - No network requests (besides the Google Fonts stylesheet in <head>).
   - No tracking, fingerprinting, storage of anyone's data, or exfiltration.
   - No heavy loops, mining, or resource abuse. CPU/memory stay trivial.
   Every "secret", "credential", "user", "key" and "file" below is OBVIOUSLY
   fake dummy data (hunter2, DEADBEEF, example.com...). Nothing points at a
   real target. The "exploits" and "logs" are flavor gibberish that do nothing.
   The only payload is time + a warm nudge toward ethical hacking at the end.
   ========================================================================== */
(() => {
  'use strict';
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const mk = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, RM ? Math.min(ms, 40) : ms));
  const rint = (seed) => { let x = Math.sin(seed) * 10000; return x - Math.floor(x); };

  /* ---- state (never leaves this tab, never stored) ---- */
  const state = {
    reached: new Set(), flags: new Set(),
    frag: { A: false, B: false, C: false },
    logPaused: false, consoleUsed: false,
  };
  const FRAG = {
    A: 'KEY-A::7F3A-c0ffee-NOPE',
    B: 'KEY-B::DEADBEEF-not-real',
    C: 'KEY-C::1337-hunter2-fake',
  };

  /* ---- level / crumbs ---- */
  const CRUMBS = [
    '// you shouldn’t be here',
    '// huh. it actually let you in',
    '// deeper than most people go',
    '// ok, you’re good at this',
    '// almost nobody reaches here',
    '// one lock left. nearly there…',
    '// the bottom of the rabbit hole',
  ];
  function level() { return Math.min(6, 1 + state.reached.size); }
  function bump(key, crumb) {
    const had = state.reached.has(key);
    state.reached.add(key);
    const lvl = level();
    const el = $('#accLvl'); if (el) el.textContent = lvl;
    const pill = $('#accessPill'); if (pill && !had) { pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump'); }
    const cr = $('#crumbs'); if (cr) cr.textContent = crumb || CRUMBS[Math.min(lvl - 1, CRUMBS.length - 1)];
    if (!had && crumb) toast(crumb.replace(/^\/\/\s*/, ''));
    updateVaultNav();
  }
  function updateVaultNav() {
    const got = state.frag.A && state.frag.B && state.frag.C;
    const n = $('.nav--locked i'); if (n) n.innerHTML = got ? '&#128275;' : '&#128274;';
    const fc = $('#flagCount'); if (fc) fc.textContent = state.flags.size;
  }

  /* ---- toast ---- */
  let toastT;
  function toast(msg) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---- modal ---- */
  function modal(title, bodyHTML) {
    const m = $('#modal'); $('#modalTitle').textContent = title; $('#modalBody').innerHTML = bodyHTML;
    m.hidden = false;
  }
  function closeModal() { $('#modal').hidden = true; }
  $('#modalX').addEventListener('click', closeModal);
  $('#modalBack').addEventListener('click', closeModal);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

  /* ======================================================================= */
  /* LOGIN GATE                                                              */
  /* ======================================================================= */
  const gate = $('#gate'), gout = $('#gateOut');
  let authing = false;

  function gline(html, cls = '') { const d = mk('div', 'ln ' + cls, html); gout.append(d); return d; }

  $('#sqlBtn').addEventListener('click', () => {
    $('#user').value = "admin'--";
    $('#pass').value = "' OR '1'='1";
    toast('classic. let’s see if the box falls for it');
  });

  $('#loginForm').addEventListener('submit', (e) => { e.preventDefault(); authenticate(); });

  async function authenticate() {
    if (authing) return; authing = true;
    const u = ($('#user').value || 'anonymous').slice(0, 40);
    const p = $('#pass').value || '';
    $('#loginBtn').disabled = true; $('#sqlBtn').disabled = true;
    gout.innerHTML = '';

    const injection = /('|--|\bor\b|=|union|select)/i.test(p + u);
    gline(`<span class="c2">&rsaquo;</span> POST /auth as <b>${esc(u)}</b>`);
    await sleep(380);
    gline('resolving szv-ops-01.internal … 10.0.0.<span class="c2">7</span>');
    await sleep(420);

    if (injection) {
      gline('<span class="warn">input not sanitized</span> &mdash; query built with raw string', 'warn');
      await sleep(460);
      gline('db: <span class="dim">SELECT * FROM users WHERE pass=\'\' OR \'1\'=\'1\' LIMIT 1</span>');
      await sleep(520);
      gline('<span class="err">!! parameterization missing (CVE-0000-FAKE)</span>', 'err');
      await sleep(400);
      gline('<span class="ok">✓ bypass accepted — returned row[0] = root</span>', 'ok');
    } else {
      gline('hash mismatch — entering recovery mode …', 'warn');
      await sleep(360);
      const bar = gline('<span class="dim">brute-forcing session token</span>');
      const prog = mk('div', 'bar', '<i></i>'); bar.append(prog);
      const words = ['hunter2', 'letmein', 'P@ssw0rd', 'correct-horse', 'swordfish', 'root'];
      for (let i = 1; i <= 24; i++) {
        await sleep(RM ? 8 : 70);
        prog.firstChild.style.width = (i / 24 * 100) + '%';
        if (i % 4 === 0) gline(`try <span class="dim">${words[(i / 4 | 0) % words.length]}</span> … ${i < 24 ? 'nope' : '<span class="ok">hit</span>'}`);
      }
      await sleep(300);
      gline('<span class="ok">✓ token forged. no 2FA on staging (oops)</span>', 'ok');
    }
    await sleep(520);
    gline('<span class="c2">&rsaquo;</span> dropping you at the console…');
    await sleep(RM ? 120 : 760);
    enterConsole();
  }

  /* ======================================================================= */
  /* CONSOLE                                                                 */
  /* ======================================================================= */
  function enterConsole() {
    gate.hidden = true;
    const c = $('#console'); c.hidden = false;
    document.body.classList.remove('is-locked');
    $('#accLvl').textContent = 1;
    $('#crumbs').textContent = CRUMBS[1];
    $$('.nav').forEach((b) => b.addEventListener('click', () => select(b.dataset.view)));
    $('#logoutBtn').addEventListener('click', () => location.reload());
    render('overview');
    $('#main').focus();
  }

  function select(view) {
    $$('.nav').forEach((b) => b.setAttribute('aria-current', b.dataset.view === view ? 'true' : 'false'));
    render(view);
  }

  function render(view) {
    const main = $('#main');
    main.innerHTML = '';
    const v = VIEWS[view] ? VIEWS[view]() : VIEWS.overview();
    main.append(v);
    main.scrollIntoView ? null : null;
  }

  const head = (kick, title, sub) =>
    `<div class="vhead"><div class="vkick">${kick}</div><h2 class="vtitle">${title}</h2><p class="vsub">${sub}</p></div>`;

  /* ---------------------------------------------------------------- VIEWS */
  const VIEWS = {};

  VIEWS.overview = () => {
    const v = mk('section', 'view');
    v.innerHTML = head('// system status', 'Welcome back, root.',
      'This panel was flagged <b>internal-only</b> and never meant to be reachable from outside. Someone left it wired to prod. Poke around — it’s all here.')
      + `<div class="grid cols" style="margin-bottom:16px">
        <div class="panel kpi"><span class="kpi__n c2">14,802</span><span class="kpi__k">user records</span></div>
        <div class="panel kpi"><span class="kpi__n err">3</span><span class="kpi__k">exposed secrets</span></div>
        <div class="panel kpi"><span class="kpi__n warn">OPEN</span><span class="kpi__k">firewall :22 :5432</span></div>
        <div class="panel kpi"><span class="kpi__n ok">root</span><span class="kpi__k">your effective uid</span></div>
      </div>
      <div class="note note--warn" style="margin-bottom:14px"><span>&#9888;</span><span>The <b>master vault</b> is sealed with a 3-part key. Fragments are scattered across the panel — the user DB, the file store, and the live log feed all leaked one. Find all three and the vault opens.</span></div>
      <div class="grid cols">
        <div class="panel"><h3>&#9783; User database</h3><p>14k rows, unpaginated, no auth on export. Rumor says an admin token sits in plain text on one row.</p><button class="go" data-go="users">open database &rarr;</button></div>
        <div class="panel"><h3>&#9707; File browser</h3><p>Backups, env files, a wallet someone forgot. Half of it is &ldquo;encrypted&rdquo; (it is not).</p><button class="go" data-go="files">browse files &rarr;</button></div>
        <div class="panel"><h3>&#9776; Live logs</h3><p>The feed streams real-time events. Watch long enough and a one-time code drifts past.</p><button class="go" data-go="logs">tail logs &rarr;</button></div>
      </div>`;
    v.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => select(b.dataset.go)));
    return v;
  };

  /* -------- USERS: big paginated dummy table -------- */
  const FIRST = ['alex', 'sam', 'jordan', 'riley', 'casey', 'morgan', 'taylor', 'jamie', 'devon', 'quinn', 'avery', 'noah', 'mila', 'leo', 'ivy', 'omar', 'nina', 'theo', 'zoe', 'kai'];
  const LAST = ['stone', 'frost', 'vega', 'nash', 'cole', 'reed', 'blair', 'cruz', 'lane', 'wolfe', 'hart', 'moon', 'knox', 'pike', 'rhodes', 'shaw', 'vance', 'wren', 'york', 'ash'];
  const ROLES = [['user', 'tag--user'], ['user', 'tag--user'], ['user', 'tag--user'], ['svc', 'tag--svc'], ['admin', 'tag--admin']];
  const USERS = (() => {
    const rows = [];
    // The one tempting "admin" row with the fake token — row 0, pinned.
    rows.push({ id: 1, name: 'admin', email: 'admin@example.com', role: ['admin', 'tag--admin'], last: '2026-10-09 03:14', token: FRAG.A, flag: true });
    for (let i = 2; i <= 480; i++) {
      const r = rint(i * 7.13), r2 = rint(i * 3.91), r3 = rint(i * 1.77);
      const f = FIRST[(r * FIRST.length) | 0], l = LAST[(r2 * LAST.length) | 0];
      const role = ROLES[(r3 * ROLES.length) | 0];
      const d = 1 + ((i * 3) % 28);
      rows.push({ id: i, name: `${f}.${l}`, email: `${f}.${l}@example.com`, role, last: `2026-${String(1 + (i % 9)).padStart(2, '0')}-${String(d).padStart(2, '0')} ${String(i % 24).padStart(2, '0')}:${String(i * 7 % 60).padStart(2, '0')}` });
    }
    return rows;
  })();
  let usersPage = 0, usersQuery = '';
  const PER = 20;

  VIEWS.users = () => {
    const v = mk('section', 'view');
    v.innerHTML = head('// table: public.users', 'User database',
      'No row-level security. No export limit. 480 of 14,802 rows cached locally for &ldquo;performance&rdquo;. Everything here is dummy data on <b>example.com</b>.')
      + `<div class="toolbar">
          <input class="search mono" id="userSearch" placeholder="filter by name, email, role…" value="${esc(usersQuery)}">
          <button class="go go--ghost" id="exportBtn">&#8681; export all (CSV)</button>
        </div>
        <div class="tablewrap"><div class="tscroll"><table>
          <thead><tr><th>id</th><th>name</th><th>email</th><th>role</th><th>last seen</th><th>secret</th></tr></thead>
          <tbody id="userBody"></tbody>
        </table></div>
        <div class="pager"><span id="pageInfo"></span><span><button id="prevP">&larr; prev</button> <button id="nextP">next &rarr;</button></span></div>
        </div>
        <div class="note note--cta" style="margin-top:14px"><span>&#128161;</span><span>The <b>admin</b> row is pinned to the top. Open it.</span></div>`;
    const body = v.querySelector('#userBody');
    const paint = () => {
      const q = usersQuery.toLowerCase();
      const filtered = q ? USERS.filter((u) => (u.name + u.email + u.role[0]).toLowerCase().includes(q)) : USERS;
      const pages = Math.max(1, Math.ceil(filtered.length / PER));
      usersPage = Math.min(usersPage, pages - 1);
      const slice = filtered.slice(usersPage * PER, usersPage * PER + PER);
      body.innerHTML = '';
      slice.forEach((u) => {
        const tr = mk('tr');
        tr.innerHTML = `<td class="mono">${u.id}</td><td>${esc(u.name)}</td><td class="mono">${esc(u.email)}</td>
          <td><span class="tag ${u.role[1]}">${u.role[0]}</span></td><td class="mono">${u.last}</td>
          <td class="mono">${u.flag ? '<span style="color:var(--err)">&#9888; exposed</span>' : '<span class="dim">—</span>'}</td>`;
        tr.addEventListener('click', () => openUser(u));
        body.append(tr);
      });
      v.querySelector('#pageInfo').textContent = `page ${usersPage + 1} / ${pages} — ${filtered.length} rows`;
      v.querySelector('#prevP').disabled = usersPage === 0;
      v.querySelector('#nextP').disabled = usersPage >= pages - 1;
    };
    v.querySelector('#prevP').addEventListener('click', () => { usersPage--; paint(); });
    v.querySelector('#nextP').addEventListener('click', () => { usersPage++; paint(); });
    v.querySelector('#userSearch').addEventListener('input', (e) => { usersQuery = e.target.value; usersPage = 0; paint(); });
    v.querySelector('#exportBtn').addEventListener('click', () => {
      bump('export', '// 14,802 rows exported to nowhere');
      modal('export — users_dump.csv', `<span class="c2">streaming 14,802 rows…</span>\n<span class="dim">id,name,email,role,token</span>\n1,admin,admin@example.com,admin,<span class="err">${esc(FRAG.A)}</span>\n2,sam.frost,sam.frost@example.com,user,-\n3,leo.vega,leo.vega@example.com,svc,-\n<span class="dim">… 14,799 more rows …</span>\n\n<span class="warn">download blocked:</span> this is a decoy. there is no file, and that token is fake.\n<span class="dim">but hey — you found fragment A without even clicking the row. nice.</span>`);
      grabFragA();
    });
    paint();
    return v;
  };

  function grabFragA() {
    if (!state.frag.A) { state.frag.A = true; state.flags.add('users'); bump('user-admin', '// fragment A secured'); }
  }
  function openUser(u) {
    if (!u.flag) {
      modal(`user #${u.id}`, `name:  <b>${esc(u.name)}</b>\nemail: ${esc(u.email)}\nrole:  ${u.role[0]}\nlast:  ${u.last}\ntoken: <span class="dim">none — just a normal (fake) person</span>\n\n<span class="dim">keep looking. the juicy one is the admin row.</span>`);
      return;
    }
    grabFragA();
    modal('user #1 — admin', `name:   <b>admin</b>\nemail:  admin@example.com\nrole:   <span class="err">superuser</span>\n2fa:    <span class="err">disabled</span>\npass:   <span class="err">hunter2</span>  <span class="dim">(stored in plaintext, of course)</span>\n\n<span class="warn">// exposed vault fragment A:</span>\n<span class="ok">${esc(FRAG.A)}</span>\n\n<span class="c2">FLAG{curiosity_opened_the_first_door}</span>\n\n<span class="dim">1 of 3 fragments. two more hiding in Files and Logs.</span>`);
  }

  /* -------- FILES -------- */
  const FILES = [
    { ic: '&#128273;', nm: 'passwords.txt', sz: '2.1 KB', locked: false, act: 'pw' },
    { ic: '&#128230;', nm: 'backup.sql', sz: '1.4 GB', locked: true, act: 'sql' },
    { ic: '&#9881;', nm: 'prod.env', sz: '812 B', locked: false, act: 'env' },
    { ic: '&#128176;', nm: 'wallet.dat', sz: '96 KB', locked: true, act: 'wallet' },
    { ic: '&#128196;', nm: 'id_rsa', sz: '3.2 KB', locked: false, act: 'rsa' },
    { ic: '&#128451;', nm: 'customers_2026.xlsx', sz: '44 MB', locked: true, act: 'xls' },
    { ic: '&#128221;', nm: 'TODO-ops.md', sz: '640 B', locked: false, act: 'todo' },
  ];
  VIEWS.files = () => {
    const v = mk('section', 'view');
    v.innerHTML = head('// mount: /srv/secret (0777)', 'File browser',
      'A directory that should never have shipped. Tempting names, world-readable. Spoiler: the valuable-looking ones are bait, and the &ldquo;encryption&rdquo; is a <code>&lt;div&gt;</code>.')
      + '<div class="files" id="fileList"></div>';
    const list = v.querySelector('#fileList');
    FILES.forEach((f) => {
      const el = mk('div', 'file');
      el.innerHTML = `<i class="file__ic">${f.ic}</i><span class="file__nm">${f.nm}</span>
        <span class="file__meta">${f.sz}<br>${f.locked ? '<span class="file__lock">&#128274; encrypted</span>' : 'rw-r--r--'}</span>`;
      el.addEventListener('click', () => { el.classList.add('is-open'); openFile(f); });
      list.append(el);
    });
    return v;
  };
  function openFile(f) {
    switch (f.act) {
      case 'pw':
        modal('passwords.txt', `# do NOT commit this (committed 14 months ago)\nroot:hunter2\npostgres:postgres\nbackup_svc:${esc('changeme123')}\njenkins:letmein\nwifi:"pretty fly for a wifi"\n\n<span class="dim">every one of these is a joke password. none unlock anything. you know that, right?</span>`);
        break;
      case 'env':
        if (!state.frag.B) { state.frag.B = true; state.flags.add('files'); bump('file-env', '// fragment B secured'); }
        modal('prod.env', `NODE_ENV=production\nDATABASE_URL=postgres://root:hunter2@127.0.0.1:5432/app\nAPI_KEY=DEADBEEF-NOT-REAL-0000\nSTRIPE_SECRET=sk_live_totally_fake_do_not_bill\nJWT_SIGNING=changeme\n\n<span class="warn"># vault fragment B (left here by mistake):</span>\n<span class="ok">${esc(FRAG.B)}</span>\n\n<span class="c2">FLAG{you_read_the_dotenv_like_a_pro}</span>\n\n<span class="dim">2 of 3. last fragment is drifting through the live log feed.</span>`);
        break;
      case 'sql':
      case 'xls':
        bump('file-locked', '// decryption attempted');
        decryptTheatre(f.nm);
        break;
      case 'wallet':
        bump('file-locked', '// cold wallet accessed');
        modal('wallet.dat', `<span class="c2">opening cold wallet…</span>\nseed phrase: <span class="dim">correct horse battery staple (everyone's example)</span>\nbalance:     <b>0.00000000 BTC</b>\nbalance:     <b>0.00 ETH</b>\nlast tx:     never\n\n<span class="warn">this wallet has always been empty and always will be.</span>\n<span class="dim">it is a .dat file full of the word &ldquo;nope&rdquo;.</span>`);
        break;
      case 'rsa':
        modal('id_rsa', `-----BEGIN FAKE PRIVATE KEY-----\n<span class="dim">bm90IGEgcmVhbCBrZXkuIGp1c3QgdmliZXMuIGdvIG91dHNpZGUu\naG9uZXN0bHkgdGhpcyBpcyBqdXN0IGJhc2U2NCBmb3IgYSBuaWNl\nbWVzc2FnZS4ga2VlcCBnb2luZyB0aG91Z2gsIHlvdSdyZSBjbG9zZS4=</span>\n-----END FAKE PRIVATE KEY-----\n\n<span class="warn">this key authenticates to exactly nothing.</span>`);
        break;
      case 'todo':
        modal('TODO-ops.md', `# ops todo\n- [x] wire staging panel to prod (why did we do this)\n- [ ] <b>remove /sys/ before launch</b>  &lt;-- still here. whoops.\n- [ ] rotate the keys in prod.env (they're fake anyway)\n- [ ] stop leaving the master-key fragments lying around\n- [ ] touch grass\n\n<span class="dim">if you're reading this: the vault key is in 3 parts — users, prod.env, logs.</span>`);
        break;
    }
  }
  async function decryptTheatre(name) {
    modal('decrypting…', `<div id="decArea"><span class="c2">AES-256 brute decrypt — ${esc(name)}</span>\n<span class="dim">this will definitely work</span>\n</div>`);
    const area = $('#decArea');
    const bar = mk('div', 'bar', '<i></i>'); area.append(bar);
    for (let i = 1; i <= 20; i++) {
      await sleep(RM ? 8 : 90);
      bar.firstChild.style.width = (i * 5) + '%';
    }
    const extra = mk('div', '', `\n<span class="err">decryption failed at 100% (classic).</span>\n<span class="dim">turns out there was nothing inside. just this message, and a shrug.</span>\n<span class="warn">¯\\_(ツ)_/¯</span>`);
    area.append(extra);
  }

  /* -------- LIVE LOGS -------- */
  const LOG_VERBS = [
    ['info', 'GET /api/health <b>200</b> 3ms'],
    ['info', 'session refreshed for svc-worker-<b>7</b>'],
    ['info', 'cache hit ratio <b>0.94</b>'],
    ['warn', 'slow query <b>812ms</b> on public.users'],
    ['info', 'cron: nightly backup queued'],
    ['err', 'failed login from 10.0.0.<b>13</b> (ignored)'],
    ['info', 'rate-limit bucket refilled'],
    ['ok', 'deploy staging-0.9.3 <b>healthy</b>'],
    ['warn', 'disk /srv at <b>81%</b>'],
    ['info', 'websocket ping/pong ok'],
    ['err', 'npm audit: <b>42</b> vulns (nobody will fix)'],
    ['info', 'gc pause <b>4ms</b>'],
    ['warn', 'cert expires in <b>9</b> days'],
    ['info', 'user avery.nash viewed dashboard'],
  ];
  let logTimer = null;
  VIEWS.logs = () => {
    const v = mk('section', 'view');
    v.innerHTML = head('// tail -f /var/log/szv-ops', 'Live logs',
      'Real-time event feed, unfiltered. It occasionally prints things it really shouldn’t — like a one-time vault code. Keep an eye on it (or hit force-leak).')
      + `<div class="logbox"><div class="logbar"><span class="live"></span> streaming <span class="dim">· szv-ops-01</span>
          <span style="margin-left:auto;display:flex;gap:6px">
            <button class="chip" id="pauseLog">pause</button>
            <button class="chip" id="leakLog">force-leak OTP</button>
          </span></div>
        <div class="logstream" id="logStream"></div></div>`;
    const stream = v.querySelector('#logStream');
    const addLog = (lv, msg, flag) => {
      const now = new Date();
      const t = now.toTimeString().slice(0, 8);
      const ln = mk('div', 'logln ' + lv + (flag ? ' flagline' : ''),
        `<span class="t">${t}</span><span class="lv">[${lv.toUpperCase()}]</span><span class="m">${msg}</span>`);
      stream.append(ln);
      while (stream.children.length > 80) stream.firstChild.remove(); // cap memory
      stream.scrollTop = stream.scrollHeight;
    };
    // seed a few
    for (let i = 0; i < 8; i++) { const r = LOG_VERBS[(rint(i * 2.3) * LOG_VERBS.length) | 0]; addLog(r[0], r[1]); }
    let tick = 0;
    const run = () => {
      if (state.logPaused) return;
      tick++;
      const r = LOG_VERBS[(Math.random() * LOG_VERBS.length) | 0];
      addLog(r[0], r[1]);
      if (tick === 9) leak(addLog); // leak after a bit of watching
    };
    clearInterval(logTimer);
    logTimer = setInterval(run, RM ? 1400 : 900);
    v.querySelector('#pauseLog').addEventListener('click', (e) => {
      state.logPaused = !state.logPaused; e.target.textContent = state.logPaused ? 'resume' : 'pause';
    });
    v.querySelector('#leakLog').addEventListener('click', () => leak(addLog));
    return v;
  };
  function leak(addLog) {
    if (state.frag.C) { addLog('warn', 'OTP already captured — check the vault', false); return; }
    state.frag.C = true; state.flags.add('logs'); bump('log-otp', '// fragment C captured mid-stream');
    addLog('err', `<b>LEAK</b> master OTP printed to stdout: <span style="color:var(--ok)">${esc(FRAG.C)}</span>`, true);
    addLog('err', `<b>FLAG{you_watched_the_logs_like_a_hawk}</b>`, true);
    addLog('warn', 'all 3 fragments gathered — the vault is unsealed', true);
  }

  /* -------- ROOT CONSOLE -------- */
  VIEWS.console = () => {
    bump('console-open');
    const v = mk('section', 'view');
    v.innerHTML = head('// shell: root@szv-ops-01', 'Root console',
      'A &ldquo;live&rdquo; root shell. It echoes commands and prints convincing nonsense. None of it runs. Try the suggestions.')
      + `<div class="rootterm">
          <div class="rootterm__body" id="rootBody"></div>
          <form class="rootterm__in" id="rootForm"><span class="rootterm__p">root@szv-ops-01:~#</span>
            <input class="rootterm__field" id="rootField" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="type a command…" aria-label="root console"></form>
        </div>
        <div class="suggest">
          <button data-cmd="whoami">whoami</button><button data-cmd="ls -la /root">ls -la /root</button>
          <button data-cmd="cat /etc/shadow">cat /etc/shadow</button><button data-cmd="decrypt vault">decrypt vault</button>
          <button data-cmd="nmap 10.0.0.0/24">nmap 10.0.0.0/24</button><button data-cmd="help">help</button>
        </div>`;
    const bodyEl = v.querySelector('#rootBody');
    const pr = (html, cls = '') => { bodyEl.append(mk('div', 'ln ' + cls, html)); bodyEl.scrollTop = bodyEl.scrollHeight; };
    pr('<span class="grad">SZV-OPS</span> <span class="dim">root shell — everything you type is logged to /dev/null</span>');
    pr('<span class="dim">type</span> <span class="c2">help</span> <span class="dim">for the (fake) command list</span>');
    const runCmd = (raw) => {
      const line = raw.trim(); if (!line) return;
      state.consoleUsed = true;
      pr(`<span class="c2">root@szv-ops-01:~#</span> ${esc(line)}`);
      const c = line.toLowerCase();
      if (c === 'help') pr('<span class="dim">whoami  ls  cat  decrypt  nmap  sudo  rm  exit — all cosmetic.</span>');
      else if (c === 'whoami') pr('root <span class="dim">(effectively nobody)</span>');
      else if (c.startsWith('ls')) pr('<span class="c2">.ssh/  .bash_history  nothing_here/  seriously_nothing/</span>  <span class="dim">(empty, every one)</span>');
      else if (c.startsWith('cat') && c.includes('shadow')) pr('root:$6$<span class="dim">totally.fake.hash.go.home</span>:19000:0:99999:7:::');
      else if (c.startsWith('cat')) pr('<span class="dim">file is 0 bytes. it was always 0 bytes.</span>');
      else if (c.startsWith('nmap')) { pr('<span class="dim">scanning 10.0.0.0/24 …</span>'); pr('10.0.0.7  <span class="c2">open</span> 22,5432  <span class="dim">(this box, waving at you)</span>'); pr('<span class="dim">everything else: filtered / imaginary</span>'); }
      else if (c.startsWith('decrypt')) decryptVaultCmd(pr);
      else if (c.startsWith('sudo')) pr('<span class="err">[sudo]</span> you are already root and it still got you nowhere. poetic.');
      else if (c.startsWith('rm')) pr('<span class="warn">rm: refusing to delete a decoy. protecting you from yourself.</span>');
      else if (c === 'exit') pr('<span class="dim">there is no exit. only the vault. (just kidding — click lock up top.)</span>');
      else pr(`<span class="err">command not found:</span> ${esc(line.split(' ')[0])} <span class="dim">— it is fake anyway</span>`);
    };
    v.querySelector('#rootForm').addEventListener('submit', (e) => { e.preventDefault(); const f = v.querySelector('#rootField'); runCmd(f.value); f.value = ''; });
    v.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => { runCmd(b.dataset.cmd); v.querySelector('#rootField').focus(); }));
    return v;
  };
  async function decryptVaultCmd(pr) {
    const got = state.frag.A && state.frag.B && state.frag.C;
    if (!got) {
      pr('<span class="warn">decrypt: need all 3 key fragments.</span>');
      pr(`<span class="dim">have: A[${state.frag.A ? '✓' : ' '}] B[${state.frag.B ? '✓' : ' '}] C[${state.frag.C ? '✓' : ' '}] — find the rest in Users / Files / Logs.</span>`);
      return;
    }
    pr('<span class="c2">assembling master key…</span>');
    await sleep(500); pr(`A <span class="ok">${esc(FRAG.A)}</span>`);
    await sleep(350); pr(`B <span class="ok">${esc(FRAG.B)}</span>`);
    await sleep(350); pr(`C <span class="ok">${esc(FRAG.C)}</span>`);
    await sleep(500); pr('<span class="grad">key assembled. opening the master vault…</span>');
    await sleep(RM ? 150 : 900); openVault();
  }

  /* -------- VAULT -------- */
  VIEWS.vault = () => {
    const got = state.frag.A && state.frag.B && state.frag.C;
    const v = mk('section', 'view');
    const fr = (k, have) => `<div class="frag ${have ? 'have' : ''}"><div class="frag__k">fragment ${k}</div><div class="frag__v">${have ? esc(FRAG[k]) : '&bull;&bull;&bull; locked &bull;&bull;&bull;'}</div></div>`;
    v.innerHTML = head('// vault: master (sealed)', 'Master vault',
      'The last door. The jackpot everyone digs for lives behind this. Three fragments, one key.')
      + `<div class="vault"><div class="vaultlock">
          <div class="vaultlock__ic">${got ? '&#128275;' : '&#128274;'}</div>
          <h3 style="font-family:var(--f-display);margin:0 0 4px">${got ? 'Key complete' : 'Key incomplete'}</h3>
          <p class="vsub" style="margin:0 auto">${got ? 'All three fragments gathered. Turn the key.' : 'Collect the fragments from the User DB, prod.env, and the live logs.'}</p>
          <div class="frags">${fr('A', state.frag.A)}${fr('B', state.frag.B)}${fr('C', state.frag.C)}</div>
          <button class="go" id="openVaultBtn" ${got ? '' : 'disabled style="opacity:.4;cursor:not-allowed"'}>${got ? '&#128273; UNSEAL THE VAULT' : 'missing fragments'}</button>
        </div></div>`;
    const btn = v.querySelector('#openVaultBtn');
    if (got) btn.addEventListener('click', () => openVault());
    else btn.addEventListener('click', () => toast('find all 3 fragments first'));
    return v;
  };

  async function openVault() {
    if (logTimer) clearInterval(logTimer);
    const main = $('#main');
    main.innerHTML = `<section class="view"><div class="vault"><div class="vaultlock" id="unseal">
      <div class="vaultlock__ic">&#128273;</div>
      <h3 style="font-family:var(--f-display)">Unsealing master vault</h3>
      <div class="vaultlock__bar bar"><i></i></div>
      <p class="vsub" id="unsealMsg" style="margin:8px auto 0">reticulating splines…</p>
    </div></div></section>`;
    const bar = $('#unseal .bar>i'), msg = $('#unsealMsg');
    const steps = ['decrypting layer 7/7…', 'bypassing final HMAC…', 'verifying master key…', 'opening…', 'wait…'];
    for (let i = 1; i <= 20; i++) { await sleep(RM ? 10 : 110); bar.style.width = (i * 5) + '%'; if (i % 4 === 0) msg.textContent = steps[(i / 4 | 0) - 1]; }
    await sleep(RM ? 150 : 700);
    showEnding();
  }

  /* ======================================================================= */
  /* THE ENDING                                                              */
  /* ======================================================================= */
  function showEnding() {
    const flags = state.flags.size;
    document.querySelector('.console').innerHTML = `
    <section class="ending"><div class="ending__in">
      <div class="ending__kick">access level 7 / 7 &middot; you reached the bottom</div>
      <h2>There was <span class="is-grad">nothing</span> here.</h2>
      <p class="ending__lead">But <b>you</b> &mdash; you are the real find.</p>

      <p class="ending__body">You picked the lock, read the <code>.env</code>, watched the logs, assembled the key, and crawled all the way down just to see what was at the bottom. That took <b>patience</b>, <b>pattern-sense</b>, and a stubborn kind of <b>curiosity</b> most people never use. Every &ldquo;secret&rdquo; you dug up was dummy data. The maze was the whole point &mdash; and you solved it.</p>

      <div class="ending__rule"></div>

      <p class="ending__body">Here&rsquo;s the thing: that exact instinct &mdash; <i>&ldquo;I wonder if I can get in&rdquo;</i> &mdash; is one of the most valuable skills on earth. The only question is which side of the door you point it at. The world has more than enough people trying to <b>break</b> things. What it&rsquo;s desperately short on is people like you who learn to <b>defend</b> them.</p>

      <p class="ending__body"><b>Come build on the bright side.</b> It&rsquo;s legal, it pays, it&rsquo;s respected, and it scratches the exact same itch &mdash; with real targets that <i>want</i> you to try:</p>

      <div class="ending__paths">
        <a class="pathcard" href="https://tryhackme.com" target="_blank" rel="noopener noreferrer"><div class="pathcard__n">TryHackMe <span>start here</span></div><div class="pathcard__d">Guided, beginner-friendly rooms. Learn by doing, zero setup.</div></a>
        <a class="pathcard" href="https://hackthebox.com" target="_blank" rel="noopener noreferrer"><div class="pathcard__n">Hack The Box <span>level up</span></div><div class="pathcard__d">Real machines to pop, legally, in a sandbox built for it.</div></a>
        <a class="pathcard" href="https://owasp.org" target="_blank" rel="noopener noreferrer"><div class="pathcard__n">OWASP <span>learn deep</span></div><div class="pathcard__d">The open playbook for how web apps actually break &mdash; and hold.</div></a>
        <a class="pathcard" href="https://hackerone.com" target="_blank" rel="noopener noreferrer"><div class="pathcard__n">HackerOne <span>get paid</span></div><div class="pathcard__d">Bug bounties: real companies pay you to find real holes. Ethically.</div></a>
      </div>

      <p class="ending__bless">Go be a white hat. The world needs your kind of curious on the defending side. We&rsquo;re genuinely cheering for you. <span class="spark">&#10022;</span></p>

      <p class="ending__sig">// stay sharp, stay kind &mdash; SZVTECH &middot; flags found: ${flags}/3 &middot; FLAG{the_real_treasure_was_you}</p>
      <div class="ending__home"><a class="go go--ghost" href="/" style="display:inline-flex;text-decoration:none">&larr; back to the surface</a></div>
    </div></section>`;
    window.scrollTo(0, 0);
  }

  /* boot: focus operator field */
  const uf = $('#user'); if (uf) setTimeout(() => uf.focus(), 400);
})();
