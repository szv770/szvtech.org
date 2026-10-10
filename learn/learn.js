/* ==========================================================================
   SZVTECH — training terminal (/learn/)
   A pretend computer with real commands. Vanilla JS, no dependencies.
   ========================================================================== */
(() => {
'use strict';

const doc = document, root = doc.documentElement;
const $ = (s, r = doc) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RMQ = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => RMQ.matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TOUCH = matchMedia('(hover: none), (pointer: coarse)').matches;
const MOBILE = matchMedia('(max-width: 900px)');
// short haptic pulse on Android; no-op on iOS/desktop; never under reduced motion
const buzz = (pattern) => { if (reduced()) return; try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* ignore */ } };
const pad2 = (n) => String(n).padStart(2, '0');
const num = (n) => Number(n).toLocaleString('en-US');

/* --------------------------------------------------------------------------
   Saved state (localStorage, always wrapped)
   -------------------------------------------------------------------------- */
const KEY = 'szvtech-learn-v1';
function loadState() {
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); return d && typeof d === 'object' ? d : {}; } catch (e) { return {}; }
}
const S = Object.assign({ done: [], badges: [], read: [], used: [], visited: [], hist: [], twins: [], flags: {}, goal: null, sound: false, visits: 0 }, loadState());
['done', 'badges', 'read', 'used', 'visited', 'hist', 'twins'].forEach((k) => { if (!Array.isArray(S[k])) S[k] = []; });
if (!S.flags || typeof S.flags !== 'object') S.flags = {};
const RETURNING = S.visits > 0;
S.visits++;
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode: progress lives for this tab only */ } }

/* --------------------------------------------------------------------------
   Lines of the day (deterministic by date)
   -------------------------------------------------------------------------- */
const LINES = [
  'A little light pushes away a lot of darkness.',
  'Think good, and it will be good.',
  "If you know one thing, teach it to someone who doesn't.",
  "Don't wait for the world to change. Start with the person in the mirror.",
  "Time is the one thing you can't download more of.",
  'Every person has a job in this world that nobody else can do.',
  'Small steps, done every day, move mountains.',
  "Where you are is exactly where you're needed.",
  'Something done right now beats something perfect someday.',
  'Everything big started as something small.',
  'The best time to start was yesterday. The next best time is now.',
  "One kind word can change someone's whole day.",
  "Ask the question. Curiosity never wasted anyone's time.",
  'Falling down is part of learning to walk.',
  "You're not behind. You're right at the start of what's next.",
  "Make today count. It's the only one with today's date on it.",
  'Be the reason someone smiles today.',
  'Your future self is watching. Give them something to thank you for.',
  'A good habit is a gift you give yourself every single day.',
  'Quiet effort builds loud results.',
  'Each day is a blank file. What will you write in it?',
  'Help someone else, and your own problem gets a little smaller.',
  'Knowledge is the only thing that grows when you give it away.',
  'Hard things become easy things by doing them.',
  'You were made with something to add. Add it.',
  "Don't count the days. Make the days count.",
  "Mistakes are proof that you're actually trying.",
  'Joy is a great engine. Run on it.',
  'Put the phone down for a minute and look at the people around you.',
  'Today, do one thing your future self will be glad you did.',
];
const NOW = new Date();
const DAY_NO = Math.floor(Date.UTC(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()) / 864e5);
const LINE_OF_DAY = LINES[DAY_NO % LINES.length];

/* --------------------------------------------------------------------------
   The pretend file system
   -------------------------------------------------------------------------- */
const T0 = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), 9, 41).getTime();
const FS_SPEC = {
  'Program Files': {
    SZVTECH: {
      'trainer.exe': '\u0000BIN',
      'license.txt': 'SZVTECH Training Terminal\n\nYou may use this to learn, to play, and to show a friend.\nThat last one is strongly encouraged.\n',
    },
  },
  Users: {
    you: {
      Desktop: {
        'you-are-here.txt': "You are here.\n\nNot by accident.\nWhere you are is exactly where you're needed.\n",
      },
      games: {
        'jokes.txt': "Why do programmers prefer dark mode?\nBecause light attracts bugs.\n\nThere are 10 kinds of people in the world:\nthose who understand binary, and those who don't.\n\nA SQL query walks into a bar, goes up to two tables and asks:\n\"Can I join you?\"\n\nI'd tell you a UDP joke, but you might not get it.\n",
        'highscores.txt': 'HIGH SCORES\n\n1. you ......... still playing\n2. you ......... yesterday\n3. you ......... last week\n\nThe only score that matters: are you better than yesterday?\n',
        'secret.txt': "You opened the secret file. Respect.\n\nThree more secrets, since you asked nicely:\n  1. Some files are hidden. Try  dir /a  (or  ls -a ) in your home folder.\n  2. Type  matrix  and watch the screen.\n  3. Run  tasklist  (or  ps ). One of those programs deserves to be stopped.\n",
      },
      mission: {
        'briefing.txt': "MISSION BRIEFING\n\nEvery person has a job in this world that nobody else can do.\nWhat's yours? Start small. Write it down:\n\n  echo learn to build my own website > C:\\Users\\you\\mission\\goal.txt\n\n(Use your own goal, of course.)\nWritten goals have a funny habit of happening.\n",
      },
      notes: {
        'mirror.txt': "Don't wait for the world to change.\nStart with the person in the mirror.\n",
        'shortcuts.txt': 'USEFUL KEYS (work in real terminals too)\n\n  Tab ........ finishes a file or folder name for you\n  Up / Down .. scrolls through commands you already typed\n  Ctrl+C ..... stops whatever is running\n  Ctrl+L ..... clears the screen\n',
        'teach.txt': "If you know one thing, teach it to someone who doesn't.\n\nYou know  dir  now. Somebody out there doesn't.\n",
        'think.txt': 'Think good, and it will be good.\n\n(Computers do exactly what you tell them to.\nTurns out minds are a little like that too.)\n',
        'time.txt': "Time is the one thing you can't download more of.\n\nNo patch. No update. No premium plan.\nSpend it on things that make you better.\n",
      },
      potential: {
        'seed.txt': 'Everything big started as something small.\n\nTry this: type  tree  while you are inside this folder.\n',
        'steps.txt': "Small steps, done every day, move mountains.\n\nday 1 ..... one command\nday 2 ..... two commands\nday 30 .... you're the one people ask for help\n",
      },
      projects: {
        'hello.py': '# your first program (someday soon)\nname = input("What\'s your name? ")\nprint("Hello, " + name + "! You are a programmer now.")\n',
        'ideas.txt': 'IDEAS (no idea is too small)\n\n- a website about my favorite thing\n- a tiny game my friends can play\n- a script that tidies my downloads folder\n- show my little brother how  dir  works\n\nSomething done right now beats something perfect someday.\n',
        website: {
          'index.html': '<!doctype html>\n<title>My first site</title>\n<h1>Hello, world</h1>\n<p>Every website on earth started exactly like this.</p>\n',
        },
      },
      today: {
        'light.txt': 'A little light pushes away a lot of darkness.\n\n(One good thing today is enough to start.)\n',
        'todo.txt': 'TODO (today)\n\n[x] open a terminal\n[ ] learn one new command\n[ ] drink some water\n[ ] do one kind thing for someone\n[ ] go outside for ten minutes\n',
      },
      '.bonus': "You found a hidden file.\n\nReal computers are full of them: settings, caches, little secrets.\n dir /a  (Windows) and  ls -a  (Linux/Mac) show them.\n\nCuriosity: +1. Keep poking around.\n",
      'readme.txt': "WELCOME TO YOUR TRAINING COMPUTER\n\nThis is a pretend computer that lives in your browser.\nNothing you do here can break anything, here or on your real machine.\n\nIt has folders (also called directories) and files, like a real one.\nMove around with  cd , look around with  dir  (or  ls ),\nand read files with  type  (or  cat ).\n\nThe commands are real. The same ones work on your actual computer.\n\nLost? Type  hint .  Curious? Type  help .\n",
    },
  },
  Windows: {
    System32: {
      'cmd.exe': '\u0000BIN', 'notepad.exe': '\u0000BIN', 'ping.exe': '\u0000BIN', 'tree.com': '\u0000BIN',
      drivers: { etc: { hosts: '# This is the hosts file. It maps names to addresses.\n127.0.0.1       localhost\n' } },
    },
    'win.ini': '; for 16-bit app support\n[fonts]\n[extensions]\n[files]\n',
  },
};
function mk(name, spec) {
  const d = { t: 'd', n: name, c: new Map(), m: T0 };
  for (const k of Object.keys(spec)) {
    const v = spec[k];
    d.c.set(k.toLowerCase(), typeof v === 'string' ? { t: 'f', n: k, body: v, m: T0 } : mk(k, v));
  }
  return d;
}
const ROOT = mk('', FS_SPEC);
const HOME = ['Users', 'you'];
const GOAL = ['Users', 'you', 'mission', 'goal.txt'];
let cwd = HOME.slice(), prevCwd = HOME.slice();

const lc = (s) => s.toLowerCase();
const samePath = (a, b) => a.length === b.length && a.every((s, i) => lc(s) === lc(b[i]));
const under = (a, base) => a.length >= base.length && base.every((s, i) => lc(s) === lc(a[i]));
const fmt = (segs) => 'C:\\' + segs.join('\\');
const unquote = (s) => { s = String(s).trim(); return (s.length > 1 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))) ? s.slice(1, -1) : s; };
const isHidden = (n) => n.n.startsWith('.');
const sortKids = (d) => [...d.c.values()].sort((a, b) => (a.t === b.t ? 0 : a.t === 'd' ? -1 : 1) || lc(a.n).localeCompare(lc(b.n)));
const sortAlpha = (d) => [...d.c.values()].sort((a, b) => lc(a.n.replace(/^\./, '')).localeCompare(lc(b.n.replace(/^\./, ''))));
const sizeOf = (n) => (n.body.startsWith('\u0000') ? 24576 + (n.n.length * 1337) % 40000 : n.body.replace(/\n/g, '\r\n').length);

function parsePath(p) {
  p = unquote(p || '');
  if (!p) return { segs: cwd.slice() };
  let segs;
  if (/^~(?=$|[\\/])/.test(p)) { segs = HOME.slice(); p = p.slice(1); }
  else if (/^[a-z]:/i.test(p)) {
    if (lc(p[0]) !== 'c') return { err: 'drive' };
    p = p.slice(2);
    segs = /^[\\/]/.test(p) || p === '' ? [] : cwd.slice();
  }
  else if (/^[\\/]/.test(p)) segs = [];
  else segs = cwd.slice();
  for (const part of p.split(/[\\/]+/)) {
    if (!part || part === '.') continue;
    if (part === '..') segs.pop();
    else segs.push(part);
  }
  return { segs };
}
function walk(segs) {
  let n = ROOT; const real = [];
  for (const s of segs) {
    if (n.t !== 'd') return null;
    const k = n.c.get(lc(s));
    if (!k) return null;
    n = k; real.push(k.n);
  }
  return { node: n, segs: real };
}
function rel(from, to) {
  let i = 0;
  while (i < from.length && i < to.length && lc(from[i]) === lc(to[i])) i++;
  const parts = Array(from.length - i).fill('..').concat(to.slice(i));
  return parts.join('\\') || '.';
}
const relW = (to) => { const r = rel(cwd, to); return /\s/.test(r) ? `"${r}"` : r; };
const relL = (to) => relW(to).replace(/\\/g, '/');
const SYS = [['Windows'], ['Program Files']];
const readOnly = (segs) => segs.length <= 1 || SYS.some((b) => under(segs, b)) || (segs.length === 2 && lc(segs[0]) === 'users' && lc(segs[1]) !== 'you');
const precious = (segs) => samePath(segs, HOME) || samePath(segs, ['Users']) || under(segs, [...HOME, 'potential']) && segs.length <= 4 && (segs.length === 3 || lc(segs[3]) === 'seed.txt');

const globRe = (pat) => new RegExp('^' + (pat === '*.*' ? '*' : pat).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
function glob(str) {
  if (!/[*?]/.test(str)) {
    const pp = parsePath(str);
    if (pp.err) return { err: pp.err, items: [] };
    const w = walk(pp.segs);
    return w ? { items: [w], literal: true } : { items: [], missing: true, segs: pp.segs };
  }
  const i = Math.max(str.lastIndexOf('\\'), str.lastIndexOf('/'));
  const dirPart = i >= 0 ? str.slice(0, i + 1) : '', pat = str.slice(i + 1);
  if (/[*?]/.test(dirPart)) return { items: [] };
  const pp = parsePath(dirPart || '.');
  const w = pp.err ? null : walk(pp.segs);
  if (!w || w.node.t !== 'd') return { items: [], missing: true };
  const re = globRe(pat);
  return { items: sortAlpha(w.node).filter((n) => re.test(n.n) && !(isHidden(n) && !pat.startsWith('.'))).map((n) => ({ node: n, segs: [...w.segs, n.n] })), dir: w };
}
function allFiles(w, re) {
  const res = [];
  (function rec(n, segs) {
    for (const k of sortKids(n)) {
      const s = [...segs, k.n];
      if (k.t === 'd') rec(k, s); else if (!re || re.test(k.n)) res.push({ node: k, segs: s });
    }
  })(w.node, w.segs);
  return res;
}
function deepClone(n) {
  if (n.t === 'f') return { t: 'f', n: n.n, body: n.body, m: Date.now() };
  const d = { t: 'd', n: n.n, c: new Map(), m: Date.now() };
  n.c.forEach((v, k) => d.c.set(k, deepClone(v)));
  return d;
}
function writeFile(segs, body, append) {
  const parent = walk(segs.slice(0, -1));
  if (!parent || parent.node.t !== 'd') return 'nopath';
  if (readOnly(segs)) return 'denied';
  const name = segs[segs.length - 1];
  const ex = parent.node.c.get(lc(name));
  if (ex && ex.t === 'd') return 'isdir';
  if (ex) { ex.body = append ? ex.body + body : body; ex.m = Date.now(); return ex; }
  const f = { t: 'f', n: name, body, m: Date.now() };
  parent.node.c.set(lc(name), f);
  return f;
}
// a saved goal lives in the file system on every visit
if (S.goal && S.goal.text) writeFile(GOAL, S.goal.text + '\n');

/* --------------------------------------------------------------------------
   DOM refs and output helpers
   -------------------------------------------------------------------------- */
const out = $('#out'), screen = $('#screen'), input = $('#cmd'), preEl = $('#pre'), caretEl = $('#caret'), postEl = $('#post');
const promptEl = $('#prompt'), lineEl = $('#line'), term = $('#term'), crt = $('#crt'), chipsEl = $('#chips');
let cap = null; // when set, output is captured as text (for > redirection and | pipes)
let failed = false;
const tmpDiv = doc.createElement('div');
const strip = (html) => { tmpDiv.innerHTML = html; return tmpDiv.textContent; };
function addLine(html, cls) {
  const d = doc.createElement('div');
  d.className = 'tl' + (cls ? ' ' + cls : '') + ' in'; // reduced motion: CSS turns this into a plain fade
  d.innerHTML = html;
  out.appendChild(d);
  while (out.childElementCount > 800) out.firstElementChild.remove();
  scrollDown();
  return d;
}
function p(text = '', cls) { if (cap) { cap.push(String(text)); return null; } return addLine(esc(text), cls); }
function ph(html, cls) { if (cap) { cap.push(strip(html)); return null; } return addLine(html, cls); }
function lines(text, cls) { String(text).replace(/\n$/, '').split('\n').forEach((l) => p(l, cls)); }
function err(text) { failed = true; p(text, 'err'); }
function note(html) { if (!cap) addLine(html, 'note'); }
function scrollDown() { screen.scrollTop = screen.scrollHeight; }
const k = (s) => `<span class="k">${esc(s)}</span>`;

/* --------------------------------------------------------------------------
   Events -> missions / badges
   -------------------------------------------------------------------------- */
let pending = [];
const emit = (ev) => pending.push(ev);
const used = (key) => { if (key && !S.used.includes(key)) S.used.push(key); };

/* twins: always show the other spelling, once per pair */
const TWIN = {
  ls: ['dir', 'ls', 1], dir: ['dir', 'ls', 0], clear: ['cls', 'clear', 1], cls: ['cls', 'clear', 0],
  cat: ['type', 'cat', 1], type: ['type', 'cat', 0], cp: ['copy', 'cp', 1], copy: ['copy', 'cp', 0],
  mv: ['move', 'mv', 1], move: ['move', 'mv', 0], rm: ['del', 'rm', 1], del: ['del', 'rm', 0], erase: ['del', 'rm', 0],
  pwd: ['cd', 'pwd', 1], uname: ['ver', 'uname -a', 1], ver: ['ver', 'uname -a', 0],
  ip: ['ipconfig', 'ip a', 1], ifconfig: ['ipconfig', 'ifconfig', 1], ipconfig: ['ipconfig', 'ip a', 0],
  ps: ['tasklist', 'ps', 1], tasklist: ['tasklist', 'ps', 0], grep: ['findstr', 'grep', 1], findstr: ['findstr', 'grep', 0],
  man: ['help', 'man', 1], kill: ['taskkill', 'kill', 1], pkill: ['taskkill', 'pkill', 1], killall: ['taskkill', 'killall', 1], taskkill: ['taskkill', 'kill', 0],
  md: ['md', 'mkdir', 0], rd: ['rd /s', 'rm -r', 0], ren: ['ren', 'mv', 0], rename: ['ren', 'mv', 0],
  touch: ['type nul > file.txt', 'touch file.txt', 1], env: ['set', 'env', 1], printenv: ['set', 'printenv', 1], set: ['set', 'env', 0],
  tput: ['color 0a', 'tput setaf 2', 1], color: ['color 0a', 'tput setaf 2', 0], history: ['doskey /history', 'history', 1], doskey: ['doskey /history', 'history', 0],
};
function twinNote(name) {
  const t = TWIN[name];
  if (!t || S.twins.includes(t[0])) return;
  S.twins.push(t[0]);
  const [w, l, isLinux] = t;
  note(isLinux
    ? `<span class="tw">(on Linux/Mac this is <code>${esc(l)}</code>; on Windows <code>${esc(w)}</code>, both work here)</span>`
    : `<span class="tw">(on Windows this is <code>${esc(w)}</code>; on Linux/Mac <code>${esc(l)}</code>, both work here)</span>`);
}

/* --------------------------------------------------------------------------
   Commands
   -------------------------------------------------------------------------- */
const CMDS = new Map();
const LIST = []; // order for help
function def(names, o) { o.names = names; names.forEach((n) => CMDS.set(n, o)); if (o.list) LIST.push(o); return o; }
const isWFlag = (a) => /^\/[a-z?](:.*)?$/i.test(a) || /^\/(grow|history|all|im|pid)$/i.test(a);
const isLFlag = (a) => /^--?[a-z][a-z-]*$/i.test(a);
const hasF = (c, ...f) => c.args.some((a) => (isWFlag(a) && f.includes(lc(a.slice(1)))) || (/^-[a-z]+$/i.test(a) && f.some((x) => x.length === 1 && a.slice(1).includes(x))) || (/^--/.test(a) && f.includes(lc(a.slice(2)))));
const posArgs = (c) => c.args.filter((a) => !isWFlag(a) && !(isLFlag(a) && a.length > 1));
const fstr = (d) => `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()}`;
const tstr = (d) => { let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${pad2(h)}:${pad2(d.getMinutes())} ${ap}`; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const nameHtml = (n) => (n.t === 'd' ? `<span class="dir">${esc(n.n)}</span>` : esc(n.n));

/* ----- where am I ----- */
def(['cd', 'chdir'], {
  key: 'cd', list: true, win: 'cd folder', lin: 'cd folder', desc: 'go into a folder (cd .. goes up)',
  syn: 'cd [folder]   cd ..   cd \\   cd ~', more: 'Changes the current folder. On Windows, cd with nothing after it prints where you are. .. means one level up, \\ (or /) means the top of the drive, ~ means your home folder.', ex: ['cd notes', 'cd ..', 'cd C:\\Users\\you\\projects'],
  fn(c) {
    let a = c.raw.replace(/^\s*\/d\s+/i, '').trim();
    if (!a) { p(fmt(cwd)); emit({ type: 'pwd' }); used('pwd'); if (!S.twins.includes('cd')) { S.twins.push('cd'); note('<span class="tw">(on Windows, <code>cd</code> alone shows where you are; on Linux/Mac that is <code>pwd</code>, both work here)</span>'); } return; }
    a = unquote(a);
    let target;
    if (a === '-') target = { segs: prevCwd.slice() };
    else target = parsePath(a);
    if (target.err) return err('The system cannot find the drive specified.');
    const w = walk(target.segs);
    if (!w) return err('The system cannot find the path specified.');
    if (w.node.t !== 'd') return err('The directory name is invalid.');
    const from = cwd.slice();
    prevCwd = from; cwd = w.segs;
    const key = lc(fmt(cwd));
    if (!S.visited.includes(key)) S.visited.push(key);
    used(cwd.length < from.length ? 'cdup' : 'cd');
    if (samePath(cwd, HOME) && !samePath(from, HOME) && a !== '..') used('cdhome');
    emit({ type: 'cd', from, to: cwd.slice() });
  },
});
def(['pwd'], {
  key: 'pwd', desc: 'print where you are', syn: 'pwd', more: 'Print Working Directory: the folder you are standing in. Windows twin: cd (with nothing after it).', ex: ['pwd'],
  fn() { p(fmt(cwd)); emit({ type: 'pwd' }); },
});

/* ----- looking around ----- */
function dirHeader(segs) { p(' Volume in drive C is SZVTECH'); p(' Volume Serial Number is 5A2V-1E0C'); p(''); p(' Directory of ' + fmt(segs)); p(''); }
const termCols = () => { const fs = parseFloat(getComputedStyle(screen).fontSize) || 13; return Math.floor((screen.clientWidth - 24) / (fs * 0.6)); };
function dirRow(n, name) {
  const d = new Date(n.m);
  const w = termCols() < 50 ? 12 : 18;
  const mid = n.t === 'd' ? '    <DIR>' + ' '.repeat(w - 8) : String(num(sizeOf(n))).padStart(w) + ' ';
  return `${fstr(d)}  ${tstr(d)}${esc(mid)}${n.t === 'd' ? `<span class="dir">${esc(name || n.n)}</span>` : esc(name || n.n)}`;
}
def(['dir'], {
  key: 'ls', list: true, win: 'dir', lin: 'ls', desc: 'list files and folders',
  syn: 'dir [folder] [/a] [/b] [/w]', more: 'Lists what is inside a folder: names, sizes and dates. /a also shows hidden files, /b shows bare names, /w lists them wide. Linux/Mac twin: ls.', ex: ['dir', 'dir notes', 'dir /a', 'dir *.txt'],
  fn(c) {
    const all = hasF(c, 'a'), bare = hasF(c, 'b'), wide = hasF(c, 'w');
    const target = posArgs(c).join(' ') || '.';
    const g = glob(target);
    if (g.err) return err('The system cannot find the drive specified.');
    let dirW, entries, full = false;
    if (g.literal && g.items[0].node.t === 'd') { dirW = g.items[0]; entries = sortAlpha(dirW.node); full = true; }
    else if (g.literal) { dirW = walk(g.items[0].segs.slice(0, -1)); entries = [g.items[0].node]; }
    else { if (g.missing) { dirHeader(parsePath(target).segs.slice(0, -1)); return err('File Not Found'); } dirW = g.dir || walk(cwd); entries = g.items.map((x) => x.node); }
    if (!all) entries = entries.filter((n) => !isHidden(n));
    if (!entries.length && !full) { if (!bare) dirHeader(dirW.segs); return err('File Not Found'); }
    emit({ type: 'ls' });
    if (bare) { entries.forEach((n) => ph(nameHtml(n))); return; }
    dirHeader(dirW.segs);
    if (wide) {
      ph(entries.map((n) => (n.t === 'd' ? `<span class="dir">[${esc(n.n)}]</span>` : esc(n.n))).join('   '));
    } else {
      if (full) { ph(dirRow({ t: 'd', m: dirW.node.m }, '.')); if (dirW.segs.length) ph(dirRow({ t: 'd', m: T0 }, '..')); }
      entries.forEach((n) => ph(dirRow(n)));
    }
    const files = entries.filter((n) => n.t === 'f'), dirs = entries.length - files.length + (full ? (dirW.segs.length ? 2 : 1) : 0);
    const sp = termCols() < 52 ? 8 : 16;
    p(`${String(files.length).padStart(sp)} File(s) ${num(files.reduce((s, n) => s + sizeOf(n), 0)).padStart(14)} bytes`);
    p(`${String(dirs).padStart(sp)} Dir(s)  420,069,133,312 bytes free`);
    if (!all && dirW.node.c && [...dirW.node.c.values()].some(isHidden) && !S.read.includes('users/you/.bonus')) note('<span class="dim">(psst: something in here is hidden. dir /a shows everything.)</span>');
  },
});
def(['ls'], {
  key: 'ls', desc: 'list files and folders', syn: 'ls [-a] [-l] [folder]', more: 'Lists what is inside a folder. -a shows hidden files (names starting with a dot), -l shows the long version with sizes and dates. Windows twin: dir.', ex: ['ls', 'ls -la', 'ls notes'],
  fn(c) {
    const all = hasF(c, 'a'), long = hasF(c, 'l'), one = hasF(c, '1');
    const targets = posArgs(c);
    if (!targets.length) targets.push('.');
    let shown = false;
    targets.forEach((t, ti) => {
      const g = glob(t);
      if (!g.items.length) { err(`ls: cannot access '${t}': No such file or directory`); return; }
      let entries, dot = false;
      if (g.literal && g.items[0].node.t === 'd') { entries = sortAlpha(g.items[0].node); dot = all; if (targets.length > 1) p((ti ? '\n' : '') + t + ':'); }
      else entries = g.items.map((x) => x.node);
      if (!all) entries = entries.filter((n) => !isHidden(n));
      shown = true;
      if (long) {
        p('total ' + Math.max(4, entries.length * 4));
        const rows = (dot ? [{ t: 'd', n: '.', m: T0 }, { t: 'd', n: '..', m: T0 }] : []).concat(entries);
        rows.forEach((n) => {
          const d = new Date(n.m);
          const sz = n.t === 'd' ? 4096 : sizeOf(n);
          ph(`${n.t === 'd' ? 'drwxr-xr-x' : '-rw-r--r--'} 1 you you ${String(sz).padStart(6)} ${MON[d.getMonth()]} ${String(d.getDate()).padStart(2)} ${pad2(d.getHours())}:${pad2(d.getMinutes())} ${nameHtml(n)}`);
        });
      } else {
        const names = (dot ? ['<span class="dir">.</span>', '<span class="dir">..</span>'] : []).concat(entries.map(nameHtml));
        if (one) names.forEach((h) => ph(h)); else if (names.length) ph(names.join('  '));
      }
    });
    if (shown) emit({ type: 'ls' });
  },
});
def(['tree'], {
  key: 'tree', list: true, win: 'tree', lin: 'tree', desc: 'draw a map of all folders below you',
  syn: 'tree [folder] [/f] [/grow]', more: 'Draws every folder (and file) below the current one as a tree. Classic, fast, oddly satisfying. On Mac/Linux it may need installing first; find . lists the same things plainly.', ex: ['tree', 'tree projects', 'tree /grow'],
  async fn(c) {
    const grow = hasF(c, 'grow');
    const t = posArgs(c).join(' ');
    const pp = parsePath(t || '.');
    const w = pp.err ? null : walk(pp.segs);
    if (!w || w.node.t !== 'd') return err('Invalid path - ' + (t || '.'));
    const out1 = [];
    let nd = 0, nf = 0;
    out1.push(esc('Folder PATH listing for volume SZVTECH'), esc('Volume serial number is 5A2V-1E0C'), `<b>${esc(fmt(w.segs).toUpperCase())}</b>`);
    (function rec(n, prefix) {
      const kids = sortKids(n).filter((x) => !isHidden(x));
      kids.forEach((x, i) => {
        const last = i === kids.length - 1;
        out1.push(`<span class="dim">${esc(prefix + (last ? '\u2514\u2500\u2500\u2500' : '\u251C\u2500\u2500\u2500'))}</span>${x.t === 'd' ? `<span class="dir">${esc(x.n)}</span>` : `<span class="mut">${esc(x.n)}</span>`}`);
        if (x.t === 'd') { nd++; rec(x, prefix + (last ? '    ' : '\u2502   ')); } else nf++;
      });
    })(w.node, '');
    out1.push('', `<span class="dim">${nd} folders, ${nf} files</span>`);
    for (const l of out1) {
      if (abort) return;
      ph(l);
      if (!cap) await sleep(24);
    }
    const inPotential = under(w.segs, [...HOME, 'potential']) || under(cwd, [...HOME, 'potential']);
    if (grow || inPotential) { await growTree(); S.flags.grew = true; }
    else if (!S.flags.grew) note('<span class="dim">(something in potential\\ is waiting to grow. try tree in there, or tree /grow)</span>');
    emit({ type: 'tree', grow: grow || inPotential });
  },
});

/* ----- clean screen + colors ----- */
function clearScreen() { if (cap) return; out.innerHTML = ''; }
def(['cls'], { key: 'clear', list: true, win: 'cls', lin: 'clear', desc: 'wipe the screen (files stay safe)', syn: 'cls', more: 'Clears the screen. Nothing is deleted, only the text you can see. Linux/Mac twin: clear (or Ctrl+L).', ex: ['cls'], fn() { clearScreen(); emit({ type: 'clear' }); } });
def(['clear'], { key: 'clear', desc: 'wipe the screen', syn: 'clear', more: 'Clears the screen. Windows twin: cls. Shortcut: Ctrl+L.', ex: ['clear'], fn() { clearScreen(); emit({ type: 'clear' }); } });

const PAL = { 0: '#0c0c0c', 1: '#2346d8', 2: '#16a312', 3: '#2b9ec4', 4: '#cc1f2c', 5: '#9a2aa8', 6: '#c9a400', 7: '#cccccc', 8: '#7a7a7a', 9: '#4c86ff', a: '#3dff6e', b: '#6bf4f4', c: '#ff5f6d', d: '#ff70ec', e: '#fff28a', f: '#f8f8f8' };
const PAL_NAMES = ['Black', 'Blue', 'Green', 'Aqua', 'Red', 'Purple', 'Yellow', 'White', 'Gray', 'Light Blue', 'Light Green', 'Light Aqua', 'Light Red', 'Light Purple', 'Light Yellow', 'Bright White'];
let colorCode = '';
function applyColor(code) {
  colorCode = code;
  if (!code) {
    term.classList.remove('is-colored', 'is-crt');
    ['--t-bg', '--t-fg', '--t-glow'].forEach((v) => term.style.removeProperty(v));
    return;
  }
  const bg = code.length === 2 ? code[0] : '0', fg = code[code.length - 1];
  term.style.setProperty('--t-bg', bg === '0' ? '#020403' : PAL[bg]);
  term.style.setProperty('--t-fg', PAL[fg]);
  term.style.setProperty('--t-glow', PAL[fg]);
  term.classList.add('is-colored');
  term.classList.toggle('is-crt', bg === '0');
}
function colorHelp() {
  lines('Sets the default console foreground and background colors.\n\nCOLOR [attr]\n\n  attr        Specifies color attribute of console output\n\nColor attributes are specified by TWO hex digits -- the first\ncorresponds to the background; the second the foreground.  Each digit\ncan be any of the following values:\n');
  for (let i = 0; i < 8; i++) p(`    ${i.toString(16).toUpperCase()} = ${PAL_NAMES[i].padEnd(12)}${(i + 8).toString(16).toUpperCase()} = ${PAL_NAMES[i + 8]}`);
  lines('\nIf no argument is given, this command restores the color to what it was\nwhen CMD.EXE started.\n\nThe COLOR command sets ERRORLEVEL to 1 if an attempt is made to execute\nthe COLOR command with a foreground and background color that are the\nsame.\n\nExample: "COLOR fc" produces light red on bright white');
}
def(['color'], {
  key: 'color', list: true, win: 'color 0a', lin: 'tput setaf 2', desc: 'recolor the terminal (color alone resets)',
  syn: 'color [background][text]', more: 'Two hex digits: the first is the background, the second the text. 0a = black background, light green text. color with nothing after it resets.', ex: ['color 0a', 'color 1f', 'color'],
  help: colorHelp,
  fn(c) {
    const a = lc(posArgs(c)[0] || '');
    if (!a) { applyColor(''); emit({ type: 'color', code: '' }); return; }
    if (!/^[0-9a-f]{1,2}$/.test(a)) { failed = true; colorHelp(); return; }
    if (a.length === 2 && a[0] === a[1]) { failed = true; note('<span class="dim">(same color for text and background would make everything invisible, so CMD refuses. smart.)</span>'); return; }
    applyColor(a);
    emit({ type: 'color', code: a.length === 1 ? '0' + a : a });
    if (a !== '0a' && a !== 'a' && !S.done.includes('green')) note('<span class="dim">(nice. now try color 0a for the classic look.)</span>');
  },
});
def(['tput'], {
  key: 'color', desc: 'terminal colors (Linux/Mac)', syn: 'tput setaf <0-7> | tput sgr0', more: 'Asks the terminal to change text color. setaf 2 = green, 1 = red, 4 = blue... tput sgr0 resets.', ex: ['tput setaf 2', 'tput sgr0'],
  fn(c) {
    const [sub, n] = posArgs(c);
    if (sub === 'sgr0' || sub === 'reset') { applyColor(''); emit({ type: 'color', code: '' }); return; }
    if (sub === 'setaf' && /^[0-7]$/.test(n || '')) { const code = '0' + ['8', 'c', 'a', 'e', '9', 'd', 'b', 'f'][+n]; applyColor(code); emit({ type: 'color', code }); return; }
    err('usage: tput setaf <0-7>   or   tput sgr0');
  },
});
def(['title'], {
  key: 'title', list: true, win: 'title text', lin: '(terminal settings)', desc: 'rename the terminal window',
  syn: 'title [text]', more: 'Sets the text in the window title bar. Handy when you have five terminals open and need to know which is which.', ex: ['title My hacker lab'],
  fn(c) { const t = c.raw.trim(); $('#termTitle').textContent = t || 'Command Prompt \u2014 training'; },
});

/* ----- reading ----- */
const BIN_MSG = 'This is a program, not a text file. Programs are written for the computer to read, not us.';
function readFiles(c, style) {
  const targets = posArgs(c);
  if (!targets.length) { if (c.stdin != null) { lines(c.stdin); return; } return err(style === 'type' ? 'The syntax of the command is incorrect.' : `${c.name}: missing file name`); }
  for (const t of targets) {
    if (lc(t) === 'nul' || t === '/dev/null') continue;
    const g = glob(t);
    if (!g.items.length) { err(style === 'type' ? 'The system cannot find the file specified.' : `${c.name}: ${t}: No such file or directory`); emit({ type: 'cat', ok: false }); continue; }
    for (const it of g.items) {
      if (it.node.t === 'd') { err(style === 'type' ? 'Access is denied.' : `${c.name}: ${t}: Is a directory`); continue; }
      if (g.items.length > 1 && style === 'type') { p(''); p(it.node.n); p(''); }
      if (it.node.body.startsWith('\u0000')) { p('MZ\u00900\u0003\u0004\u00ff\u00ff\u00b8@\u000e\u001f\u00ba\u000e\u00b4\t\u00cd!\u00b8\u0001L\u00cd!'.replace(/[\u0000-\u001f]/g, '.')); note(`<span class="dim">(${esc(BIN_MSG)})</span>`); continue; }
      lines(it.node.body);
      markRead(it.segs);
      emit({ type: 'cat', ok: true, segs: it.segs });
    }
  }
}
def(['type'], { key: 'cat', list: true, win: 'type file', lin: 'cat file', desc: 'print what is inside a file', syn: 'type <file>', more: 'Prints the contents of a text file right in the terminal. No app needed. Linux/Mac twin: cat.', ex: ['type readme.txt', 'type notes\\think.txt'], fn(c) { readFiles(c, 'type'); } });
def(['cat'], { key: 'cat', desc: 'print what is inside a file', syn: 'cat <file>...', more: 'Prints files (cat is short for concatenate: give it several and it glues them together). Windows twin: type.', ex: ['cat readme.txt', 'cat notes/*.txt'], fn(c) { readFiles(c, 'cat'); } });
def(['more', 'less'], { key: 'cat', desc: 'show a file one page at a time', syn: 'more <file>', more: 'Shows a file page by page on a real computer. Here every file fits, so it simply prints it.', ex: ['more readme.txt'], fn(c) { readFiles(c, 'cat'); } });
def(['head', 'tail'], {
  key: 'cat', desc: 'first / last lines of a file', syn: 'head -n 5 <file>', more: 'head prints the first lines of a file, tail the last ones. -n picks how many.', ex: ['head -n 3 readme.txt', 'tail -n 2 notes/time.txt'],
  fn(c) {
    let n = 10; const files = [];
    for (let i = 0; i < c.args.length; i++) { const a = c.args[i]; if (a === '-n') { n = parseInt(c.args[++i], 10) || 10; } else if (/^-\d+$/.test(a)) n = +a.slice(1); else files.push(a); }
    const take = (txt) => { const ls = txt.replace(/\n$/, '').split('\n'); (c.name === 'head' ? ls.slice(0, n) : ls.slice(-n)).forEach((l) => p(l)); };
    if (!files.length && c.stdin != null) return take(c.stdin);
    for (const f of files) { const g = glob(f); const it = g.items[0]; if (!it || it.node.t !== 'f') { err(`${c.name}: cannot open '${f}' for reading: No such file or directory`); continue; } take(it.node.body); markRead(it.segs); emit({ type: 'cat', ok: true, segs: it.segs }); }
  },
});
def(['sort'], { desc: 'sort lines', syn: 'dir /b | sort', more: 'Sorts lines alphabetically. Most useful after a pipe: dir /b | sort.', ex: ['type notes\\shortcuts.txt | sort'], fn(c) { const src = c.stdin != null ? c.stdin : (glob(posArgs(c)[0] || '').items[0] || { node: { body: '' } }).node.body || ''; src.replace(/\n$/, '').split('\n').sort((a, b) => a.localeCompare(b)).forEach((l) => p(l)); } });

/* ----- making and changing things ----- */
function denied(segs) { if (readOnly(segs)) { err('Access is denied.'); return true; } return false; }
def(['md', 'mkdir'], {
  key: 'mkdir', list: true, win: 'md name', lin: 'mkdir name', desc: 'make a new folder',
  syn: 'mkdir <name>', more: 'Makes a new, empty folder. md is the short Windows version. Folders in between are created too (on Linux/Mac add -p for that).', ex: ['md projects\\game', 'mkdir -p projects/game/levels'],
  fn(c) {
    const targets = posArgs(c);
    if (!targets.length) return err('The syntax of the command is incorrect.');
    for (const t of targets) {
      const pp = parsePath(t);
      if (pp.err) { err('The system cannot find the drive specified.'); continue; }
      if (walk(pp.segs)) { err(c.name === 'mkdir' && !t.includes('\\') ? `mkdir: cannot create directory '${t}': File exists` : `A subdirectory or file ${t} already exists.`); continue; }
      if (denied(pp.segs)) continue;
      let n = ROOT;
      for (const s of pp.segs) {
        let nx = n.c.get(lc(s));
        if (!nx) { nx = { t: 'd', n: s, c: new Map(), m: Date.now() }; n.c.set(lc(s), nx); }
        if (nx.t !== 'd') { err('The system cannot find the path specified.'); break; }
        n = nx;
      }
      emit({ type: 'mkdir', segs: pp.segs });
    }
  },
});
def(['touch'], {
  key: 'write', desc: 'create an empty file', syn: 'touch <file>', more: 'Creates an empty file (or updates its date). Windows twin: type nul > file.txt', ex: ['touch notes.txt'],
  fn(c) {
    for (const t of posArgs(c)) {
      const pp = parsePath(t); const w = walk(pp.segs);
      if (w) { w.node.m = Date.now(); continue; }
      const r = writeFile(pp.segs, '', false);
      if (r === 'nopath') err(`touch: cannot touch '${t}': No such file or directory`); else if (r === 'denied') err('Access is denied.');
      else emit({ type: 'write', segs: pp.segs, text: '' });
    }
  },
});
function removeNode(segs) { const parent = walk(segs.slice(0, -1)); parent.node.c.delete(lc(segs[segs.length - 1])); }
function guardRemove(segs, isRm) {
  if (readOnly(segs)) { err(isRm ? `${isRm}: cannot remove '${segs[segs.length - 1]}': Permission denied` : 'Access is denied.'); return false; }
  if (precious(segs)) { err('Access is denied.'); note('<span class="dim">(some things are worth keeping.)</span>'); return false; }
  if (under(cwd, segs)) { err('The process cannot access the file because it is being used by another process.'); note('<span class="dim">(you are standing inside it. cd .. first.)</span>'); return false; }
  return true;
}
def(['del', 'erase'], {
  key: 'del', list: true, win: 'del file', lin: 'rm file', desc: 'delete a file (careful on real computers!)',
  syn: 'del <file>', more: 'Deletes files. On a real computer there is NO recycle bin for this: deleted means gone. Wildcards work: del *.tmp', ex: ['del hello.txt', 'del *.log'],
  fn(c) {
    const targets = posArgs(c);
    if (!targets.length) return err('The syntax of the command is incorrect.');
    for (const t of targets) {
      const g = glob(t);
      if (!g.items.length) { const pp = parsePath(t); err('Could Not Find ' + fmt(pp.segs || cwd)); continue; }
      for (const it of g.items) {
        if (it.node.t === 'd') { err(`${fmt(it.segs)}\\*, Are you sure (Y/N)? N`); note('<span class="dim">(to remove a whole folder use rd /s name, or rm -r name on Linux/Mac)</span>'); continue; }
        if (guardRemove(it.segs)) { removeNode(it.segs); emit({ type: 'del' }); }
      }
    }
  },
});
def(['rm'], {
  key: 'del', desc: 'delete files (rm -r for folders)', syn: 'rm [-r] [-f] <path>', more: 'Removes files. Add -r to remove a folder and everything inside it. There is no undo. Windows twins: del, and rd /s for folders.', ex: ['rm hello.txt', 'rm -r projects/old'],
  fn(c) {
    const r = hasF(c, 'r', 'recursive'), f = hasF(c, 'f');
    const targets = posArgs(c);
    if (!targets.length) return err('rm: missing operand');
    if (r && targets.some((t) => t === '/' || t === '\\' || /^[a-z]:\\?$/i.test(t))) { err("rm: it is dangerous to operate recursively on '/'"); note('<span class="dim">(nice try. this computer has seen that one before.)</span>'); return; }
    for (const t of targets) {
      const g = glob(t);
      if (!g.items.length) { if (!f) err(`rm: cannot remove '${t}': No such file or directory`); continue; }
      for (const it of g.items) {
        if (it.node.t === 'd' && !r) { err(`rm: cannot remove '${t}': Is a directory`); continue; }
        if (guardRemove(it.segs, 'rm')) { removeNode(it.segs); emit({ type: 'del' }); used(it.node.t === 'd' ? 'rmdir' : 'del'); }
      }
    }
  },
});
def(['rd', 'rmdir'], {
  key: 'rmdir', list: true, win: 'rd /s folder', lin: 'rm -r folder', desc: 'remove a folder',
  syn: 'rd [/s] [/q] <folder>', more: 'Removes a folder. Without /s it only works on empty folders. /s removes everything inside too (Linux/Mac: rm -r).', ex: ['rd emptyfolder', 'rd /s /q oldproject'],
  fn(c) {
    const s = hasF(c, 's');
    for (const t of posArgs(c)) {
      const pp = parsePath(t); const w = pp.err ? null : walk(pp.segs);
      if (!w) { err(c.name === 'rmdir' && !s ? `rmdir: failed to remove '${t}': No such file or directory` : 'The system cannot find the file specified.'); continue; }
      if (w.node.t !== 'd') { err('The directory name is invalid.'); continue; }
      if (w.node.c.size && !s) { err('The directory is not empty.'); continue; }
      if (guardRemove(w.segs)) { removeNode(w.segs); emit({ type: 'del' }); }
    }
  },
});
function copyMove(c, mode) {
  const a = posArgs(c);
  const isWin = c.name === 'copy' || c.name === 'move' || c.name === 'ren' || c.name === 'rename';
  if (a.length < 2) return err(isWin ? 'The syntax of the command is incorrect.' : `${c.name}: missing destination file operand after '${a[0] || ''}'`);
  const dstStr = a.pop();
  let srcs = [];
  for (const s of a) { const g = glob(s); if (!g.items.length) { err(isWin ? 'The system cannot find the file specified.' : `${c.name}: cannot stat '${s}': No such file or directory`); return; } srcs = srcs.concat(g.items); }
  let count = 0, dirs = 0;
  for (const src of srcs) {
    let dst;
    if (mode === 'ren') {
      if (/[\\/]/.test(dstStr)) return err('The syntax of the command is incorrect.');
      dst = [...src.segs.slice(0, -1), dstStr];
    } else {
      const dp = parsePath(dstStr);
      if (dp.err) return err('The system cannot find the drive specified.');
      const dw = walk(dp.segs);
      dst = dw && dw.node.t === 'd' ? [...dw.segs, src.node.n] : dp.segs;
    }
    if (samePath(dst, src.segs)) { err('The file cannot be copied onto itself.'); continue; }
    const parent = walk(dst.slice(0, -1));
    if (!parent || parent.node.t !== 'd') { err('The system cannot find the path specified.'); continue; }
    if (readOnly(dst)) { err('Access is denied.'); continue; }
    if (src.node.t === 'd' && mode === 'copy' && !hasF(c, 'r', 'recursive')) { err(isWin ? 'The syntax of the command is incorrect.' : `cp: -r not specified; omitting directory '${src.node.n}'`); if (isWin) note('<span class="dim">(copy works on files. for whole folders, Linux/Mac use cp -r)</span>'); continue; }
    if (mode !== 'copy' && !guardRemove(src.segs)) continue;
    if (src.node.t === 'd' && under(dst, src.segs)) { err('The process cannot access the file because it is being used by another process.'); continue; }
    const ex = parent.node.c.get(lc(dst[dst.length - 1]));
    if (ex && mode === 'ren') { err('A duplicate file name exists, or the file cannot be found.'); continue; }
    if (ex && ex.t === 'd') { err('Access is denied.'); continue; }
    const node = mode === 'copy' ? deepClone(src.node) : src.node;
    if (mode !== 'copy') removeNode(src.segs);
    node.n = dst[dst.length - 1];
    parent.node.c.set(lc(node.n), node);
    if (src.node.t === 'd') dirs++; else count++;
  }
  if (isWin && (count || dirs)) {
    if (mode === 'copy') p(`        ${count} file(s) copied.`);
    else if (mode === 'move') p(dirs ? `        ${dirs} dir(s) moved.` : `        ${count} file(s) moved.`);
  }
  if (count || dirs) emit({ type: mode });
}
def(['copy'], { key: 'copy', list: true, win: 'copy a b', lin: 'cp a b', desc: 'copy a file', syn: 'copy <source> <destination>', more: 'Makes a copy of a file. If the destination is a folder, the copy keeps its name. Linux/Mac twin: cp (cp -r for folders).', ex: ['copy readme.txt backup.txt', 'copy notes\\time.txt Desktop'], fn(c) { copyMove(c, 'copy'); } });
def(['cp'], { key: 'copy', desc: 'copy files (cp -r for folders)', syn: 'cp [-r] <source> <destination>', more: 'Copies files. -r copies whole folders. Windows twin: copy.', ex: ['cp readme.txt backup.txt', 'cp -r projects projects-backup'], fn(c) { copyMove(c, 'copy'); } });
def(['move'], { key: 'move', list: true, win: 'move a b', lin: 'mv a b', desc: 'move a file or folder', syn: 'move <source> <destination>', more: 'Moves a file or folder somewhere else. Linux/Mac twin: mv (which also renames).', ex: ['move hello.txt notes', 'move notes\\time.txt Desktop'], fn(c) { copyMove(c, 'move'); } });
def(['mv'], { key: 'move', desc: 'move or rename', syn: 'mv <source> <destination>', more: 'Moves or renames files and folders. Windows twins: move and ren.', ex: ['mv hello.txt notes/', 'mv old.txt new.txt'], fn(c) { copyMove(c, 'move'); } });
def(['ren', 'rename'], { key: 'ren', list: true, win: 'ren a b', lin: 'mv a b', desc: 'rename a file or folder', syn: 'ren <file> <newname>', more: 'Gives a file or folder a new name in the same place. Linux/Mac twin: mv old new.', ex: ['ren hello.txt hi.txt'], fn(c) { copyMove(c, 'ren'); } });

/* ----- echo (and redirects are handled by the runner) ----- */
let echoOn = true;
def(['echo'], {
  key: 'echo', list: true, win: 'echo text > file', lin: 'echo text > file', desc: 'say something (> saves it into a file, >> adds a line)',
  syn: 'echo <text>   echo <text> > file.txt   echo <text> >> file.txt', more: 'Prints text. On its own it seems useless, but add > and the text goes into a file instead of the screen. > replaces the file, >> adds a new line at the end.', ex: ['echo hello', 'echo hello > hello.txt', 'echo one more line >> hello.txt'],
  fn(c) {
    const raw = c.raw.trim();
    if (!raw) { p(echoOn ? 'ECHO is on.' : 'ECHO is off.'); return; }
    if (/^(on|off)$/i.test(raw)) { echoOn = lc(raw) === 'on'; return; }
    p(unquote(raw.replace(/^-[neE]\s+/, '')));
  },
});
def(['echo.'], { hidden: true, fn() { p(''); } });

/* ----- search ----- */
function search(c, style) {
  let ci = false, rec = false, numb = false, listOnly = false, inv = false, literal = null, nameRe = null; const pos = [];
  for (let i = 0; i < c.args.length; i++) {
    const a = c.args[i];
    if (style !== 'grep' && /^\/[a-z]+(:.*)?$/i.test(a)) {
      const f = lc(a.slice(1));
      if (f === 'i') ci = true; else if (f === 's') rec = true; else if (f === 'n') numb = true; else if (f === 'v') inv = true; else if (f === 'm' || f === 'l') listOnly = true; else if (f.startsWith('c:')) literal = a.slice(3);
      continue;
    }
    if (style === 'grep' && /^-[a-zA-Z]+$/.test(a)) { for (const ch of a.slice(1)) { if (ch === 'i') ci = true; else if ('rR'.includes(ch)) rec = true; else if (ch === 'n') numb = true; else if (ch === 'v') inv = true; else if (ch === 'l') listOnly = true; } continue; }
    if (style === 'grep' && a === '--include' && c.args[i + 1]) { nameRe = globRe(c.args[++i]); continue; }
    pos.push(a);
  }
  let pats;
  if (literal != null) pats = [literal];
  else {
    const pt = pos.shift();
    if (pt == null || pt === '') return err(style === 'grep' ? 'usage: grep [-irnlv] pattern [file...]' : style === 'find' ? 'FIND: Parameter format not correct' : 'FINDSTR: Bad command line');
    pats = style === 'findstr' ? pt.split(/\s+/).filter(Boolean) : [pt];
  }
  let re;
  const flags = ci ? 'gi' : 'g';
  if (style === 'grep') { try { re = new RegExp(pats[0], flags); } catch (e) { re = new RegExp(pats[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags); } }
  else re = new RegExp(pats.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), flags);
  const test = (l) => { re.lastIndex = 0; const r = re.test(l); return inv ? !r : r; };
  const hl = (l) => {
    if (inv) return esc(l);
    let h = '', last = 0; re.lastIndex = 0; let m;
    while ((m = re.exec(l)) && m[0] !== '') { h += esc(l.slice(last, m.index)) + `<span class="hit">${esc(m[0])}</span>`; last = m.index + m[0].length; }
    return h + esc(l.slice(last));
  };
  let sources = [];
  if (!pos.length) {
    if (c.stdin != null) sources.push({ label: null, body: c.stdin });
    else if (style === 'grep' && rec) pos.push('.');
    else return err(style === 'grep' ? 'grep: (standard input): give me a file to search, e.g. grep -i light notes/*.txt' : style === 'find' ? 'FIND: Parameter format not correct' : 'FINDSTR: No search strings / no files given');
  }
  const sep = style === 'grep' ? '/' : '\\';
  const label = (segs) => rel(cwd, segs).replace(/\\/g, sep);
  for (const a of pos) {
    if (rec) {
      const pp = parsePath(a); const w = pp.err ? null : walk(pp.segs);
      if (w && w.node.t === 'd') { allFiles(w, nameRe).forEach((f) => sources.push({ label: label(f.segs), node: f.node, segs: f.segs })); continue; }
      const i = Math.max(a.lastIndexOf('\\'), a.lastIndexOf('/'));
      const base = walk((parsePath(i >= 0 ? a.slice(0, i + 1) : '.').segs) || cwd);
      if (base && base.node.t === 'd') allFiles(base, globRe(a.slice(i + 1))).forEach((f) => sources.push({ label: label(f.segs), node: f.node, segs: f.segs }));
      continue;
    }
    const g = glob(a);
    if (!g.items.length) { err(style === 'grep' ? `grep: ${a}: No such file or directory` : style === 'find' ? `File not found - ${a.toUpperCase()}` : `FINDSTR: Cannot open ${a}`); continue; }
    g.items.forEach((it) => { if (it.node.t === 'd') { if (style === 'grep') p(`grep: ${a}: Is a directory`); return; } sources.push({ label: label(it.segs), node: it.node, segs: it.segs }); });
  }
  sources = sources.filter((s) => s.body != null || !s.node.body.startsWith('\u0000'));
  const multi = rec || sources.length > 1;
  let matches = 0;
  for (const s of sources) {
    const body = s.body != null ? s.body : s.node.body;
    const ls = body.replace(/\n$/, '').split('\n');
    if (style === 'find' && s.label) p(''), p('---------- ' + s.label.toUpperCase());
    let fileHits = 0;
    ls.forEach((l, i) => {
      if (!test(l)) return;
      matches++; fileHits++;
      if (listOnly) return;
      const pre = (multi && s.label && style !== 'find' ? `<span class="c1">${esc(s.label)}</span><span class="dim">:</span>` : '') + (numb ? `<span class="ok">${i + 1}</span><span class="dim">:</span>` : '');
      ph(pre + hl(l));
    });
    if (listOnly && fileHits) ph(`<span class="c1">${esc(s.label)}</span>`);
  }
  if (!matches && !cap) note(`<span class="dim">(no matches${ci ? '' : '. search is case-sensitive unless you add ' + (style === 'grep' ? '-i' : '/i')})</span>`);
  if (!matches) failed = true;
  emit({ type: 'search', matches });
}
def(['findstr'], {
  key: 'search', list: true, win: 'findstr "word" *.txt', lin: 'grep word *.txt', desc: 'search for text inside files',
  syn: 'findstr [/i] [/s] [/n] "words" <files>', more: 'Finds lines that contain a word. /i ignores UPPER/lower case, /s searches every folder below too, /n shows line numbers. Several words = any of them. Linux/Mac twin: grep.', ex: ['findstr /i "time" notes\\*.txt', 'findstr /s /i "light" *.txt', 'dir /b | findstr txt'],
  fn(c) { search(c, 'findstr'); },
});
def(['grep'], {
  key: 'search', desc: 'search for text inside files', syn: 'grep [-i] [-r] [-n] pattern [files]', more: 'The legendary search tool. -i ignores case, -r searches every folder below, -n shows line numbers, -l lists only file names. Windows twin: findstr.', ex: ['grep -i time notes/*.txt', 'grep -ri light .', 'ls | grep txt'],
  fn(c) { search(c, 'grep'); },
});
def(['find'], {
  key: 'search', desc: 'find text (Windows) or files (Linux)', syn: 'find "text" <file>   |   find . -name "*.txt"', more: 'Two different commands share this name! On Windows, find "text" file searches inside a file. On Linux/Mac, find . -name "*.txt" lists files by name.', ex: ['find "good" notes\\think.txt', 'find . -name "*.txt"'],
  fn(c) {
    if (c.raw.trim().startsWith('"') || /^\/(i|v|c|n)$/i.test(c.args[0] || '')) return search(c, 'find');
    const a = c.args.slice();
    let start = '.', re = null;
    if (a[0] && !a[0].startsWith('-')) start = a.shift();
    const ni = a.findIndex((x) => x === '-name' || x === '-iname');
    if (ni >= 0 && a[ni + 1]) re = globRe(a[ni + 1]);
    const pp = parsePath(start); const w = pp.err ? null : walk(pp.segs);
    if (!w) return err(`find: '${start}': No such file or directory`);
    const base = start.replace(/[\\/]+$/, '') || '.';
    const res = [];
    if (!re) res.push(base);
    (function rec(n, pfx) { for (const x of sortKids(n)) { const pth = pfx + '/' + x.n; if (!re || re.test(x.n)) res.push(x.t === 'd' ? `<span class="dir">${esc(pth)}</span>` : esc(pth)); if (x.t === 'd') rec(x, pth); } })(w.node, base);
    res.forEach((l) => ph(l === base ? esc(l) : l));
    if (!S.twins.includes('find')) { S.twins.push('find'); note('<span class="tw">(this is Linux find, which lists files. Windows find searches text: <code>find "good" notes\\think.txt</code>)</span>'); }
  },
});

/* ----- network ----- */
const KNOWN_HOSTS = { 'szvtech.org': '76.76.21.21', 'www.szvtech.org': '76.76.21.21', 'google.com': '142.250.74.46', 'www.google.com': '142.250.74.68', 'localhost': '127.0.0.1', 'example.com': '93.184.215.14', 'github.com': '140.82.121.4', 'wikipedia.org': '185.15.59.224' };
const hashStr = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
let abort = false;
def(['ping'], {
  key: 'ping', list: true, win: 'ping host', lin: 'ping -c 4 host', desc: 'check if a computer answers, and how fast',
  syn: 'ping <host> [-n count] [-t]', more: 'Sends tiny "are you there?" packets and times the replies (in milliseconds). The first thing to try when "the internet is broken". -n sets how many (Linux: -c), -t keeps going until Ctrl+C.', ex: ['ping szvtech.org', 'ping -n 6 google.com', 'ping 127.0.0.1'],
  async fn(c) {
    let count = 4, forever = false; const pos = [];
    for (let i = 0; i < c.args.length; i++) {
      const a = c.args[i];
      if (/^[-/][nc]$/i.test(a)) { count = Math.max(1, Math.min(20, parseInt(c.args[++i], 10) || 4)); continue; }
      if (/^[-/]t$/i.test(a)) { forever = true; continue; }
      if (/^[-/]/.test(a)) continue;
      pos.push(a);
    }
    const host = (pos[0] || '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    if (!host) { lines('\nUsage: ping [-t] [-n count] target_name\n\nOptions:\n    -t             Ping the specified host until stopped (Ctrl+C).\n    -n count       Number of echo requests to send.'); failed = true; return; }
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    const ip = isIp ? host : KNOWN_HOSTS[lc(host)] || (host.includes('.') ? `104.${hashStr(host) % 200 + 16}.${hashStr(host + 'x') % 250}.${hashStr(host + 'y') % 250 + 1}` : null);
    if (!ip) { p(`Ping request could not find host ${host}. Please check the name and try again.`); failed = true; return; }
    const local = ip.startsWith('127.') || lc(host) === 'localhost';
    const base = local ? 0 : 6 + (hashStr(host) % 34);
    const ttl = local ? 128 : 52 + (hashStr(host) % 9);
    p('');
    p(isIp ? `Pinging ${ip} with 32 bytes of data:` : `Pinging ${host} [${ip}] with 32 bytes of data:`);
    const times = [];
    const n = forever ? 60 : count;
    for (let i = 0; i < n; i++) {
      if (!cap) await sleep(i ? 640 : 380);
      if (abort) break;
      const t = local ? 0 : Math.max(1, base + Math.round((Math.random() - 0.3) * Math.max(4, base * 0.35)));
      times.push(t);
      const l = ph(`Reply from ${ip}: bytes=32 ${local ? 'time&lt;1ms' : 'time=' + t + 'ms'} TTL=${ttl}`);
      if (l) l.classList.add('ping-in');
    }
    const sent = times.length;
    p('');
    p(`Ping statistics for ${ip}:`);
    p(`    Packets: Sent = ${sent}, Received = ${sent}, Lost = 0 (0% loss),`);
    if (sent) {
      p('Approximate round trip times in milli-seconds:');
      p(`    Minimum = ${Math.min(...times)}ms, Maximum = ${Math.max(...times)}ms, Average = ${Math.round(times.reduce((a, b) => a + b, 0) / sent)}ms`);
    }
    if (abort) p('Control-C');
    if (sent) emit({ type: 'ping', replies: sent });
    if (sent && !S.flags.pingTip) { S.flags.pingTip = true; note('<span class="dim">(each reply crossed the network and came back. time = how long the round trip took.)</span>'); }
  },
});
def(['ipconfig'], {
  key: 'ipconfig', list: true, win: 'ipconfig', lin: 'ip a  /  ifconfig', desc: 'show your address on the network',
  syn: 'ipconfig [/all]', more: 'Shows your network adapters and their IP addresses. Your IPv4 address is how other devices on your Wi-Fi find you. Linux twin: ip a. Mac: ifconfig.', ex: ['ipconfig', 'ipconfig /all'],
  fn(c) {
    const all = hasF(c, 'all');
    p(''); p('Windows IP Configuration'); p('');
    if (all) { p('   Host Name . . . . . . . . . . . . : TRAINING-PC'); p('   Primary Dns Suffix  . . . . . . . : '); p('   Node Type . . . . . . . . . . . . : Hybrid'); p('   IP Routing Enabled. . . . . . . . : No'); p(''); }
    p(''); p('Wireless LAN adapter Wi-Fi:'); p('');
    p('   Connection-specific DNS Suffix  . : home');
    if (all) { p('   Description . . . . . . . . . . . : Wireless Network Adapter'); p('   Physical Address. . . . . . . . . : 3C-22-FB-7A-10-42'); p('   DHCP Enabled. . . . . . . . . . . : Yes'); }
    p('   IPv6 Address. . . . . . . . . . . : fd00::1c2b:5e7f:9a41:ee10');
    p('   Link-local IPv6 Address . . . . . : fe80::b1d4:7c2e:3f19:a6b0%12');
    ph('   IPv4 Address. . . . . . . . . . . : <span class="c2">192.168.1.42</span>');
    p('   Subnet Mask . . . . . . . . . . . : 255.255.255.0');
    p('   Default Gateway . . . . . . . . . : 192.168.1.1');
    if (all) { p('   DNS Servers . . . . . . . . . . . : 192.168.1.1'); }
    p(''); p('Ethernet adapter Ethernet:'); p('');
    p('   Media State . . . . . . . . . . . : Media disconnected');
    p('   Connection-specific DNS Suffix  . :');
    ipNote();
    emit({ type: 'ipconfig' });
  },
});
function ipNote() { note('<span class="dim">(pretend, but realistic. 192.168.x.x is a private address: it only exists inside your home network. your router holds the public one.)</span>'); }
def(['ip'], {
  key: 'ipconfig', desc: 'network addresses (Linux)', syn: 'ip a', more: 'ip a (short for ip address) lists your network interfaces and their addresses. Windows twin: ipconfig.', ex: ['ip a'],
  fn(c) {
    const sub = lc(posArgs(c)[0] || '');
    if (!/^a(ddr(ess)?)?$/.test(sub)) { lines('Usage: ip [ OPTIONS ] OBJECT { COMMAND | help }\nwhere  OBJECT := { address | link | route | neigh | ... }\ntry: ip a'); failed = true; return; }
    lines('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000\n    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n    inet 127.0.0.1/8 scope host lo\n       valid_lft forever preferred_lft forever\n2: wlan0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP group default qlen 1000\n    link/ether 3c:22:fb:7a:10:42 brd ff:ff:ff:ff:ff:ff');
    ph('    inet <span class="c2">192.168.1.42</span>/24 brd 192.168.1.255 scope global dynamic wlan0');
    lines('       valid_lft 86124sec preferred_lft 86124sec\n    inet6 fe80::b1d4:7c2e:3f19:a6b0/64 scope link\n       valid_lft forever preferred_lft forever');
    ipNote();
    emit({ type: 'ipconfig' });
  },
});
def(['ifconfig'], {
  key: 'ipconfig', desc: 'network addresses (Mac / older Linux)', syn: 'ifconfig', more: 'The classic way to see network interfaces. Still the go-to on Mac. Windows twin: ipconfig.', ex: ['ifconfig'],
  fn() {
    lines('lo0: flags=8049<UP,LOOPBACK,RUNNING,MULTICAST> mtu 16384\n\tinet 127.0.0.1 netmask 0xff000000\nen0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500\n\tether 3c:22:fb:7a:10:42');
    ph('\tinet <span class="c2">192.168.1.42</span> netmask 0xffffff00 broadcast 192.168.1.255');
    lines('\tstatus: active');
    ipNote();
    emit({ type: 'ipconfig' });
  },
});

/* ----- system info ----- */
const BOOT_T = Date.now();
def(['whoami'], { key: 'whoami', list: true, win: 'whoami', lin: 'whoami', desc: 'which user you are logged in as', syn: 'whoami', more: 'Prints the user you are logged in as. Same command on Windows, Mac and Linux.', ex: ['whoami'], fn() { p('training-pc\\you'); note('<span class="dim">(on Linux/Mac you would just see: you)</span>'); } });
def(['hostname'], { key: 'hostname', list: true, win: 'hostname', lin: 'hostname', desc: "this computer's name", syn: 'hostname', more: 'Prints the name of the computer. Same on every system.', ex: ['hostname'], fn() { p('TRAINING-PC'); } });
def(['ver', 'winver'], { key: 'ver', list: true, win: 'ver', lin: 'uname -a', desc: 'which system version this is', syn: 'ver', more: 'Shows the operating system version. On your real Windows PC it shows the Windows version. Linux/Mac twin: uname -a.', ex: ['ver'], fn() { p(''); p('SZVTECH Training OS [Version 10.0.2026.1009]'); note('<span class="dim">(on a real PC this shows your Windows version)</span>'); } });
def(['uname'], { key: 'ver', desc: 'system name and version', syn: 'uname [-a]', more: 'Prints the system name. -a prints everything it knows. Windows twin: ver.', ex: ['uname -a'], fn(c) { p(hasF(c, 'a') ? 'TrainingOS training-pc 6.9.0-szvtech #1 SMP PREEMPT x86_64 GNU/Linux' : 'TrainingOS'); } });
def(['date'], {
  key: 'date', list: true, win: 'date /t', lin: 'date', desc: "today's date", syn: 'date [/t]', more: 'Shows the date. On Windows, plain date then asks for a new one (just press Enter); /t only shows it. Linux/Mac: date shows date and time.', ex: ['date /t', 'date'],
  fn(c) {
    const d = new Date(); const s = `${DAYS[d.getDay()]} ${fstr(d)}`;
    if (hasF(c, 't')) { p(s); return; }
    p('The current date is: ' + s);
    note('<span class="dim">(a real CMD would now ask for a new date. press Enter to keep it, or use date /t to skip the question)</span>');
  },
});
def(['time'], {
  key: 'date', desc: 'the current time', syn: 'time [/t]', more: 'Shows the time. /t only shows it without asking for a new one.', ex: ['time /t'],
  fn(c) { const d = new Date(); if (hasF(c, 't')) { p(tstr(d)); return; } p(`The current time is: ${d.getHours()}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad2(Math.floor(d.getMilliseconds() / 10))}`); note('<span class="dim">(a real CMD would now ask for a new time. Enter keeps it.)</span>'); },
});
const PROCS = [['System Idle Process', 0, 'Services', 0, 8], ['System', 4, 'Services', 0, 1204], ['explorer.exe', 4120, 'Console', 1, 98312], ['cmd.exe', 7788, 'Console', 1, 4096], ['curiosity.exe', 1337, 'Console', 1, 42000], ['focus.exe', 2048, 'Console', 1, 12288], ['music.exe', 3141, 'Console', 1, 61440], ['procrastination.exe', 6666, 'Console', 1, 512000], ['tasklist.exe', 9001, 'Console', 1, 7168]];
def(['tasklist'], {
  key: 'tasklist', list: true, win: 'tasklist', lin: 'ps', desc: 'list the programs running right now', syn: 'tasklist', more: 'Lists running programs (processes) with their ID (PID) and memory. Linux/Mac twin: ps (ps aux shows everything).', ex: ['tasklist', 'tasklist | findstr exe'],
  fn() {
    p(''); p('Image Name                     PID Session Name        Session#    Mem Usage'); p('========================= ======== ================ =========== ============');
    PROCS.filter((x) => !(x[0] === 'procrastination.exe' && S.flags.killed)).forEach(([n, pid, sn, s, m]) => {
      const row = `${n.padEnd(25)} ${String(pid).padStart(8)} ${sn.padEnd(16)} ${String(s).padStart(11)} ${(num(m) + ' K').padStart(12)}`;
      ph(n === 'procrastination.exe' ? `<span class="c3">${esc(row)}</span>` : esc(row));
    });
    if (!S.flags.killed) note('<span class="dim">(512 MB for procrastination.exe? taskkill /im procrastination.exe might help.)</span>');
  },
});
def(['ps'], {
  key: 'tasklist', desc: 'list running programs', syn: 'ps [aux]', more: 'Shows running processes. ps aux shows every process on the system. Windows twin: tasklist.', ex: ['ps', 'ps aux'],
  fn() { p('  PID TTY          TIME CMD'); PROCS.slice(2).filter((x) => !(x[0] === 'procrastination.exe' && S.flags.killed)).forEach(([n, pid]) => p(`${String(pid).padStart(5)} pts/0    00:00:${pad2(pid % 60)} ${n.replace(/\.exe$/, '')}`)); },
});
function killProc(nameOrPid, style) {
  const q = lc(String(nameOrPid || '')).replace(/\.exe$/, '');
  const proc = PROCS.find((x) => lc(x[0]).replace(/\.exe$/, '') === q || String(x[1]) === q);
  if (!proc || (proc[0] === 'procrastination.exe' && S.flags.killed)) { p(style === 'win' ? `ERROR: The process "${nameOrPid}" not found.` : `kill: (${nameOrPid}) - No such process`); failed = true; return; }
  const n = proc[0];
  if (n === 'procrastination.exe') {
    if (style === 'win') ph(`<span class="ok">SUCCESS:</span> The process "procrastination.exe" with PID 6666 has been terminated.`);
    S.flags.killed = true;
    ph('<span class="grad">Something done right now beats something perfect someday.</span>', 'wisdom');
    emit({ type: 'kill' });
    return;
  }
  if (n === 'curiosity.exe') { p('ERROR: The process "curiosity.exe" could not be terminated.'); note("<span class=\"dim\">(that one can't be stopped. it's a feature.)</span>"); return; }
  if (n === 'cmd.exe') { p('ERROR: The process "cmd.exe" could not be terminated.'); note("<span class=\"dim\">(you'd be closing the very window you're learning in.)</span>"); return; }
  p(`ERROR: The process "${n}" with PID ${proc[1]} could not be terminated.`); p('Reason: Access is denied.'); failed = true;
}
def(['taskkill'], {
  key: 'taskkill', list: true, win: 'taskkill /im name.exe', lin: 'kill <pid>', desc: 'stop a running program', syn: 'taskkill /im <name> | /pid <id> [/f]', more: 'Stops a running program by name (/im) or by its process ID (/pid). /f forces it. Linux/Mac twins: kill <pid>, pkill <name>.', ex: ['taskkill /im notepad.exe', 'taskkill /pid 6666 /f'],
  fn(c) {
    const i = c.args.findIndex((a) => /^\/(im|pid)$/i.test(a));
    if (i < 0 || !c.args[i + 1]) { p('ERROR: Invalid syntax. Neither /FI nor /PID nor /IM were specified.'); p('Type "TASKKILL /?" for usage.'); failed = true; return; }
    killProc(c.args[i + 1], 'win');
  },
});
def(['kill', 'pkill', 'killall'], {
  key: 'taskkill', desc: 'stop a running program', syn: 'kill <pid>   pkill <name>', more: 'kill stops a process by its number (PID, see ps). pkill and killall use the name. Windows twin: taskkill.', ex: ['kill 6666', 'pkill procrastination'],
  fn(c) { const a = posArgs(c).filter((x) => !/^-\d+$/.test(x)); if (!a.length) { err(`${c.name}: usage: ${c.name} ${c.name === 'kill' ? '<pid>' : '<name>'}`); return; } killProc(a[0], 'nix'); },
});

/* ----- environment ----- */
const ENV = { USERNAME: 'you', USER: 'you', COMPUTERNAME: 'TRAINING-PC', HOSTNAME: 'training-pc', OS: 'SZVTECH_Training_OS', PROMPT: '$P$G', SHELL: 'cmd+bash', LANG: 'en_US.UTF-8' };
const envGet = (k) => {
  const u = k.toUpperCase();
  if (u === 'CD' || u === 'PWD') return fmt(cwd);
  if (u === 'USERPROFILE' || u === 'HOME') return fmt(HOME);
  if (u === 'HOMEPATH') return '\\Users\\you';
  if (u === 'DATE') { const d = new Date(); return `${DAYS[d.getDay()]} ${fstr(d)}`; }
  if (u === 'TIME') { const d = new Date(); return `${d.getHours()}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.00`; }
  if (u === 'RANDOM') return String(Math.floor(Math.random() * 32768));
  return Object.prototype.hasOwnProperty.call(ENV, u) ? ENV[u] : null;
};
function expandVars(s) {
  return s.replace(/%([A-Za-z_][\w]*)%/g, (m, k) => { const v = envGet(k); return v == null ? m : v; })
    .replace(/\$\{?([A-Za-z_]\w*)\}?/g, (m, k) => { const v = envGet(k); return v == null ? '' : v; });
}
def(['set', 'env', 'printenv', 'export'], {
  key: 'set', list: true, win: 'set', lin: 'env', desc: 'see (or set) environment variables', syn: 'set [NAME=value]', more: 'Environment variables are little named settings every program can read, like USERNAME or PATH. set NAME=value creates one, and %NAME% (or $NAME on Linux) reads it.', ex: ['set', 'set CITY=Tel Aviv', 'echo %CITY%'],
  fn(c) {
    const raw = c.raw.trim();
    const m = raw.match(/^([A-Za-z_]\w*)=(.*)$/);
    if (m) { ENV[m[1].toUpperCase()] = unquote(m[2]); return; }
    const keys = ['COMPUTERNAME', 'HOMEPATH', 'LANG', 'OS', 'PROMPT', 'USERNAME', 'USERPROFILE', ...Object.keys(ENV).filter((x) => !['COMPUTERNAME', 'LANG', 'OS', 'PROMPT', 'USERNAME', 'USER', 'HOSTNAME', 'SHELL'].includes(x))];
    [...new Set(keys)].sort().forEach((x) => { if (!raw || x.startsWith(raw.toUpperCase())) p(`${x}=${envGet(x)}`); });
  },
});

/* ----- help ----- */
function manPage(d, name) {
  if (d.help && name !== 'man') { d.help(); return; }
  const w = d.win || TWIN[name]?.[0] || name, l = d.lin || TWIN[name]?.[1] || name;
  ph('<b>NAME</b>');
  ph(`    ${esc(name)} <span class="dim">\u2014</span> ${esc(d.desc || '')}`);
  ph(`    <span class="dim">Windows:</span> <span class="c2">${esc(w)}</span>   <span class="dim">Linux/Mac:</span> <span class="c1">${esc(l)}</span>`);
  if (d.syn) { ph('<b>USAGE</b>'); p('    ' + d.syn); }
  if (d.more) { ph('<b>DETAILS</b>'); wrap(d.more, 64).forEach((x) => p('    ' + x)); }
  if (d.ex && d.ex.length) { ph('<b>EXAMPLES</b>'); d.ex.forEach((x) => ph(`    <span class="c2">${esc(x)}</span>`)); }
}
function wrap(text, w) { const out2 = []; let cur = ''; text.split(' ').forEach((word) => { if ((cur + ' ' + word).trim().length > w) { out2.push(cur.trim()); cur = word; } else cur += ' ' + word; }); if (cur.trim()) out2.push(cur.trim()); return out2; }
function helpAll() {
  p('Every command this training computer understands. Both spellings work.');
  ph(`For details on one: ${k('help dir')} or ${k('man ls')} or ${k('dir /?')}`);
  const rows = LIST.map((d) => `<span class="w">${esc(d.win)}</span><span class="l">${esc(d.lin)}</span><span class="d">${esc(d.desc)}</span>`).join('');
  if (cap) { LIST.forEach((d) => cap.push(`${d.win.padEnd(22)} ${d.lin.padEnd(18)} ${d.desc}`)); }
  else { const g = addLine('', ''); g.innerHTML = `<div class="tgrid"><span class="h">WINDOWS</span><span class="h l">LINUX / MAC</span><span class="h d">WHAT IT DOES</span>${rows}</div>`; }
  ph(`<span class="dim">Training extras:</span> ${['hint', 'missions', 'progress', '?', 'history', 'neofetch', 'fortune', 'matrix', 'sound on', 'reset progress'].map(k).join(' ')}`);
  ph(`<span class="dim">Keys:</span> ${k('Tab')} completes names, ${k('\u2191')} ${k('\u2193')} replay commands, ${k('Ctrl+C')} stops, ${k('Ctrl+L')} clears.`);
}
def(['help'], {
  key: 'help', list: true, win: 'help  /  cmd /?', lin: 'man cmd  /  cmd --help', desc: 'ask the computer how a command works', syn: 'help [command]', more: 'Lists commands, or explains one. The single most useful skill: knowing how to ask the computer itself. Linux/Mac twin: man (press q to leave a real man page).', ex: ['help', 'help ping', 'dir /?'],
  fn(c) {
    const a = lc(posArgs(c)[0] || '');
    if (!a) helpAll();
    else { const d = CMDS.get(a); if (!d || d.hidden) { p(`This command is not supported by the help utility.  Try "${a} /?".`); failed = true; return; } manPage(d, a); }
    emit({ type: 'help' });
  },
});
def(['man'], {
  key: 'help', desc: 'the manual for a command', syn: 'man <command>', more: 'Opens the manual page for a command. Every real Linux/Mac command has one. Windows twin: help <command> or <command> /?.', ex: ['man ls', 'man grep'],
  fn(c) {
    const a = lc(posArgs(c)[0] || '');
    if (!a) { p('What manual page do you want?'); p("For example, try 'man man'."); failed = true; return; }
    const d = CMDS.get(a);
    if (!d || d.hidden) { p(`No manual entry for ${a}`); failed = true; return; }
    manPage(d, a); emit({ type: 'help' });
  },
});
def(['history'], {
  key: 'history', desc: 'commands you typed before', syn: 'history [-c]', more: 'Lists the commands you already typed. Even faster: press the Up arrow. Windows twin: doskey /history.', ex: ['history'],
  fn(c) { if (hasF(c, 'c')) { S.hist = []; return; } S.hist.forEach((h, i) => p(`${String(i + 1).padStart(5)}  ${h}`)); },
});
def(['doskey'], {
  key: 'history', list: true, win: 'doskey /history', lin: 'history', desc: 'list commands you already typed', syn: 'doskey /history', more: 'Lists the commands typed in this window. Up/Down arrows scroll through them. Linux/Mac twin: history.', ex: ['doskey /history'],
  fn(c) { if (!hasF(c, 'history', 'h')) { p('Try: doskey /history'); return; } S.hist.forEach((h) => p(h)); },
});

/* ----- training extras ----- */
def(['hint'], { hidden: true, fn() { printHint(); } });
def(['missions'], {
  hidden: true,
  fn() { MISSIONS.forEach((m, i) => ph(`${S.done.includes(m.id) ? '<span class="ok">\u2713</span>' : '<span class="dim">\u00B7</span>'} <span class="dim">${pad2(i + 1)}</span> ${esc(m.title)}`)); ph(`<span class="dim">${S.done.length}/${MISSIONS.length} done. ${k('hint')} explains the current one.</span>`); },
});
def(['progress', 'xp', 'level'], {
  hidden: true,
  fn() { const L = level(); ph(`Level <b>${L.i + 1}</b> \u00B7 <span class="grad">${esc(L.name)}</span>   <span class="dim">${xp()} XP${L.next ? ` \u00B7 ${L.next - xp()} to ${esc(LEVELS[L.i + 1][1])}` : ''}</span>`); p(`Missions ${S.done.length}/${MISSIONS.length} \u00B7 Badges ${S.badges.length}/${BADGES.length} \u00B7 Files discovered ${S.read.length}`); },
});
def(['?', 'cheatsheet'], { hidden: true, fn() { if (!cap) openSheet(); } });
def(['sound'], { hidden: true, fn(c) { const a = lc(posArgs(c)[0] || ''); setSound(a ? a === 'on' : !S.sound); p('Sound effects ' + (S.sound ? 'on.' : 'off.')); } });
/* site theme (shared with every SZVTECH page) — separate from `color`, which only recolors this terminal */
def(['theme'], {
  hidden: true,
  fn(c) {
    const T = window.SZVTheme;
    if (!T) { err('theme: not available on this page'); failed = true; return; }
    const names = T.list(), a = lc(posArgs(c)[0] || '');
    const dots = (n) => { const q = T.palette(n); return `<span style="color:${q.a1}">\u25CF</span><span style="color:${q.a3}">\u25CF</span><span style="color:${q.a2}">\u25CF</span>`; };
    if (!a) {
      p(`usage: theme <${names.join('|')}>`);
      names.forEach((n) => ph(`  ${dots(n)}  ${n === T.get() ? `<span class="c2">${n}</span> <span class="dim">(current)</span>` : esc(n)}`));
      note('<span class="dim">(recolors the whole site, every page. not a real command — color is the real one, and it only recolors this terminal.)</span>');
      return;
    }
    const n = a === 'next' ? names[(names.indexOf(T.get()) + 1) % names.length] : a;
    if (!names.includes(n)) { err(`theme: unknown theme '${a}'. try: ${names.join(', ')}`); failed = true; return; }
    T.set(n);
    ph(`${dots(n)}  accent shifted to <span class="c2">${esc(n)}</span> <span class="dim">— site-wide</span>`);
  },
});
def(['fortune'], { hidden: true, fn() { ph(`<span class="grad">${esc(LINES[Math.floor(Math.random() * LINES.length)])}</span>`, 'wisdom'); } });
def(['reset'], {
  hidden: true,
  fn(c) {
    const a = c.raw.trim().toLowerCase();
    if (a.startsWith('progress')) {
      if (!/--yes|\/y\b/.test(a)) { p('This wipes your missions, XP, badges and your saved goal.'); ph(`To really do it, type: ${k('reset progress --yes')}`); return; }
      wipe(); return;
    }
    clearScreen(); applyColor(''); echoOn = true; $('#termTitle').textContent = 'Command Prompt \u2014 training';
  },
});
def(['exit', 'logout', 'quit'], { hidden: true, fn() { p(''); p('In a real terminal, exit closes the window.'); p('This one stays open. It likes having you around.'); note('<span class="dim">(the SZVTECH logo up top takes you home)</span>'); } });
def(['cmd', 'bash', 'sh', 'powershell', 'zsh'], { hidden: true, fn(c) { p('SZVTECH Training Terminal [Version 1.0.2026]'); p("(c) SZVTECH. You're already inside one. It understands both CMD and bash words."); if (c.name === 'powershell') note('<span class="dim">(PowerShell is Windows\u2019 newer, more powerful shell. Most commands here work in it too.)</span>'); } });
def(['sudo'], { hidden: true, fn(c) { if (/^\s*rm\b/.test(c.raw)) { err('Nice try. This computer has seen that one before.'); return; } p('you is not in the sudoers file. This incident will be reported.'); note("<span class=\"dim\">(kidding. you're already the admin of your own learning.)</span>"); } });
def(['start', 'open', 'explorer', 'notepad', 'calc', 'code', 'mspaint', 'xdg-open'], { hidden: true, fn(c) { p(`${c.name}: there are no windows to open on the training computer.`); note('<span class="dim">(that is kind of the point. everything here happens in text. to write a file, try echo text > file.txt)</span>'); } });
def(['python', 'python3', 'node', 'npm', 'git', 'java', 'pip', 'gcc', 'ruby', 'go'], { hidden: true, fn(c) { p(`'${c.name}' is not installed on the training computer.`); note(`<span class="dim">(on your real one it is free to install, and then ${esc(c.name)} in a terminal opens a whole new world. projects\\hello.py is waiting for that day.)</span>`); } });
def(['shutdown', 'reboot', 'halt', 'poweroff'], { hidden: true, fn() { p('Shutting down is disabled on the training computer.'); note('<span class="dim">(but a break is a great idea. stretch, drink water, come back.)</span>'); } });
def(['matrix'], { hidden: true, async fn() { await matrix(); } });
def(['neofetch', 'systeminfo', 'fastfetch'], {
  hidden: true,
  fn() {
    const up = Math.max(1, Math.round((Date.now() - BOOT_T) / 60000));
    const L = level();
    const logo = ['  .-----------.  ', '  | >_        |  ', '  |           |  ', "  '-----------'  ", '      _|_|_      ', '                 ', '                 ', '                 '];
    const info = [`<span class="c2">you</span>@<span class="c2">TRAINING-PC</span>`, '<span class="dim">----------------</span>', '<span class="c1">OS</span>: SZVTECH Training OS 2026', '<span class="c1">Shell</span>: cmd + bash (both!)', `<span class="c1">Uptime</span>: ${up} min`, `<span class="c1">Level</span>: ${esc(L.name)} (${xp()} XP)`, `<span class="c1">Missions</span>: ${S.done.length}/${MISSIONS.length}`, '<span class="c1">Memory</span>: plenty for big ideas'];
    logo.forEach((l, i) => ph(`<span class="grad">${esc(l)}</span>${info[i] || ''}`));
  },
});

/* --------------------------------------------------------------------------
   The runner: variables, pipes, redirects, dispatch
   -------------------------------------------------------------------------- */
function tokenize(s) {
  const t = []; let cur = '', q = null, has = false;
  for (const ch of s) {
    if (q) { if (ch === q) q = null; else cur += ch; }
    else if (ch === '"' || (ch === "'" && !cur)) { q = ch; has = true; }
    else if (/\s/.test(ch)) { if (cur || has) { t.push(cur); cur = ''; has = false; } }
    else cur += ch;
  }
  if (cur || has) t.push(cur);
  return t;
}
function splitUnquoted(s, sep) {
  const parts = []; let q = false, cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') q = !q;
    if (!q && ch === sep) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}
function findUnquoted(s, ch) { let q = false; for (let i = 0; i < s.length; i++) { if (s[i] === '"') q = !q; else if (!q && s[i] === ch) return i; } return -1; }

const levenshtein = (a, b) => {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
};

async function runSegment(seg, stdin) {
  let s = seg.trim();
  if (!s) return;
  // CMD quirks: cd.. / cd\ / echo.
  s = s.replace(/^(cd|chdir)(?=[.\\/])/i, '$1 ');
  s = s.replace(/^(dir|ls)\/(?=[a-z?])/i, '$1 /');
  // input redirection: CMD treats < as "read from file"
  const lt = findUnquoted(s, '<');
  if (lt >= 0) {
    err('The system cannot find the file specified.');
    note('<span class="dim">(&lt; and &gt; are special characters in a terminal. if you meant your own words, drop the brackets: echo learn to code &gt; goal.txt)</span>');
    return;
  }
  // output redirection
  let redirect = null;
  const gt = findUnquoted(s, '>');
  if (gt >= 0) {
    const append = s[gt + 1] === '>';
    const target = unquote(s.slice(gt + (append ? 2 : 1)).trim());
    s = s.slice(0, gt).replace(/\s[12]$/, '').trimEnd();
    if (!target) { err('The syntax of the command is incorrect.'); return; }
    redirect = { target, append };
  }
  const m = s.match(/^(\S+)\s?([\s\S]*)$/);
  if (!m) return;
  let name = lc(m[1]).replace(/\.(exe|com)$/, '');
  const raw = m[2] || '';
  if (/^[a-z]:\\?$/.test(name)) { if (name[0] !== 'c') err('The system cannot find the drive specified.'); return; }
  if (/^echo[.:]$/.test(name)) name = 'echo.';
  const d = CMDS.get(name);
  const args = tokenize(raw);
  if (!d) {
    if (redirect && !cap) { /* fall through to error */ }
    const words = s.split(/\s+/).length;
    p(`'${m[1]}' is not recognized as an internal or external command,`);
    p('operable program or batch file.');
    failed = true;
    let best = null, bd = 3;
    for (const n of CMDS.keys()) { if (n.length < 2 || CMDS.get(n).hidden && !['hint', 'matrix', 'missions'].includes(n)) continue; const dd = levenshtein(name, n); if (dd < bd) { bd = dd; best = n; } }
    if (best && bd <= (name.length > 4 ? 2 : 1)) ph(`<span class="dim">Did you mean</span> ${k(best)}<span class="dim">?</span>`);
    else if (words > 3 || /\?$/.test(s)) note('<span class="dim">(terminals only understand commands, not sentences. try help, or hint for your mission.)</span>');
    return;
  }
  const c = { name, raw, args, stdin };
  if (args.some((a) => a === '/?' || a === '--help') && !d.hidden) { manPage(d, name); emit({ type: 'help' }); used('help'); return; }
  const prevFailed = failed;
  failed = false;
  if (redirect) {
    const pp = parsePath(redirect.target);
    if (pp.err) { err('The system cannot find the drive specified.'); return; }
    const outer = cap; cap = [];
    try { await d.fn(c); } finally { var captured = cap; cap = outer; }
    if (lc(redirect.target) === 'nul' || redirect.target === '/dev/null') return;
    const body = captured.length ? captured.join('\n') + '\n' : (name === 'type' || name === 'cat' || name === 'touch' ? '' : '');
    const r = writeFile(pp.segs, body, redirect.append);
    if (r === 'nopath') return err('The system cannot find the path specified.');
    if (r === 'denied') return err('Access is denied.');
    if (r === 'isdir') return err('Access is denied.');
    const isGoal = samePath(pp.segs, GOAL);
    let goalText = '';
    if (isGoal) {
      goalText = r.body.trim().split('\n').map((x) => x.trim()).filter(Boolean).join(' ').slice(0, 280);
      if (goalText && !/^(<?\s*your goal\s*>?|ECHO is (on|off)\.)$/i.test(goalText)) S.goal = { text: goalText, ts: Date.now() };
      else goalText = '';
    }
    used(redirect.append ? 'append' : 'write');
    emit({ type: 'write', segs: pp.segs, goal: !!goalText, text: captured.join('\n') });
    if (!S.flags.writeTip) { S.flags.writeTip = true; note(`<span class="dim">(saved to ${esc(rel(cwd, walk(pp.segs).segs))}. read it back with type, or cat on Linux/Mac)</span>`); }
  } else {
    twinNote(name);
    await d.fn(c);
  }
  if (!failed) used(d.key);
  failed = prevFailed || failed;
}

async function runLine(line) {
  let l = line.trim();
  if (!l) return;
  if (/^(rem|::|#)/i.test(l)) return;
  l = expandVars(l);
  const segs = splitUnquoted(l, '|').filter((x, i, a) => x.trim() || i === a.length - 1);
  if (segs.length > 1) {
    let stdin = null;
    for (let i = 0; i < segs.length; i++) {
      if (i < segs.length - 1) {
        const outer = cap; cap = [];
        try { await runSegment(segs[i], stdin); } finally { stdin = cap.join('\n') + '\n'; cap = outer; }
      } else await runSegment(segs[i], stdin);
    }
    if (!S.flags.pipeTip) { S.flags.pipeTip = true; note('<span class="dim">(that | is a pipe: the output of the left command became the input of the right one. very pro.)</span>'); }
    return;
  }
  await runSegment(l, null);
}

/* --------------------------------------------------------------------------
   Discovery XP
   -------------------------------------------------------------------------- */
function markRead(segs, quiet) {
  const key = segs.join('/').toLowerCase();
  if (S.read.includes(key)) return;
  S.read.push(key);
  if (!quiet) toast(`+10 XP \u00B7 discovered ${segs[segs.length - 1]}`);
  if (key === 'users/you/games/secret.txt' || key === 'users/you/.bonus') S.flags[key.endsWith('bonus') ? 'hidden' : 'secret'] = true;
}

/* --------------------------------------------------------------------------
   Missions
   -------------------------------------------------------------------------- */
const P = (...s) => [...HOME, ...s];
const atHome = () => samePath(cwd, HOME);
const safeCwd = () => !readOnly(cwd);
const MISSIONS = [
  {
    id: 'where', title: 'Where am I?', win: 'cd', lin: 'pwd',
    why: 'Every command happens <em>somewhere</em>. Before you go anywhere, find out where you are standing.',
    real: 'Press <b>Win+R</b>, type <code>cmd</code>, press Enter, then type <code>cd</code>. On Mac: <b>Cmd+Space</b>, type Terminal, then <code>pwd</code>.',
    chips: () => ['cd', 'pwd'], check: (e) => e.type === 'pwd',
    msg: "You're in C:\\Users\\you, your home folder. On Mac/Linux it would be /home/you, or just ~.",
  },
  {
    id: 'look', title: 'Look around', win: 'dir', lin: 'ls',
    why: 'Picture this: three years from now you need to ask an AI how to see the files in your current folder. It is two letters: <code>ls</code>. (On Windows, three: <code>dir</code>.) Learn it once, own it forever.',
    real: 'Same window as before: <code>dir</code> on Windows, <code>ls</code> on Mac/Linux. Those are your real files.',
    chips: () => ['dir', 'ls'], check: (e) => e.type === 'ls',
    msg: 'You just did what a file explorer does, without touching the mouse. Folders are the names in blue.',
  },
  {
    id: 'clean', title: 'Clean slate', win: 'cls', lin: 'clear',
    why: 'A messy screen is a messy mind. Wipe it. Your files stay exactly where they are; only the text on screen goes.',
    real: '<code>cls</code> on Windows, <code>clear</code> on Mac/Linux. Most terminals also clear with <b>Ctrl+L</b>.',
    chips: () => ['cls', 'clear'], check: (e) => e.type === 'clear',
    msg: 'Fresh screen. Nothing deleted, just tidied.',
  },
  {
    id: 'green', title: 'Hacker green', win: 'color 0a', lin: 'tput setaf 2',
    why: 'The look every movie hacker has. Two digits: the first is the background, the second is the text. <code>0</code> = black, <code>a</code> = light green.',
    real: 'Works in real CMD exactly like this. <code>color</code> alone resets. On Mac/Linux colors live in the Terminal settings (or <code>tput setaf 2</code>).',
    chips: () => ['color 0a', 'tput setaf 2'], check: (e) => e.type === 'color' && e.code === '0a',
    msg: 'Welcome to the green screen. Type color (nothing after it) whenever you want the default back.',
  },
  {
    id: 'movein', title: 'Move in', win: 'cd notes', lin: 'cd notes',
    why: 'Folders are rooms. <code>cd</code> stands for <em>change directory</em>: walk into a room.',
    real: 'Try <code>cd Desktop</code> on your real computer, then <code>dir</code> / <code>ls</code> to peek inside.',
    chips: () => { const t = samePath(cwd, P('notes')) ? P('projects') : P('notes'); const w = relW(t), l = relL(t); return w === l ? ['cd ' + w] : ['cd ' + w, 'cd ' + l]; },
    check: (e) => e.type === 'cd' && e.to.length > e.from.length,
    msg: 'You are inside. Notice the prompt changed: it always tells you where you are.',
  },
  {
    id: 'back', title: 'Go back', win: 'cd ..', lin: 'cd ..',
    why: '<code>..</code> always means "one level up". Two dots, every system, forever.',
    real: '<code>cd ..</code> works the same on Windows, Mac and Linux. <code>cd \\</code> (or <code>cd /</code>) jumps all the way to the top.',
    chips: () => (cwd.length ? ['cd ..'] : ['cd ' + relW(P('notes'))]), check: (e) => e.type === 'cd' && e.to.length < e.from.length,
    msg: '.. is the universal "up" button. You will use it a thousand times.', light: 'Going one step back is sometimes how you move forward.',
  },
  {
    id: 'read', title: 'Read a file', win: 'type notes\\think.txt', lin: 'cat notes/think.txt',
    why: 'No double-clicking, no waiting for an app to open. Pros read files straight from the terminal.',
    real: 'Make a note on your Desktop, then: <code>cd Desktop</code> and <code>type note.txt</code> (<code>cat note.txt</code> on Mac).',
    chips: () => ['type ' + relW(P('notes', 'think.txt')), 'cat ' + relL(P('notes', 'think.txt'))], check: (e) => e.type === 'cat' && e.ok,
    msg: 'Reading without opening anything. Fast, right?',
  },
  {
    id: 'tree', title: 'See the whole picture', win: 'tree', lin: 'tree',
    why: 'One command, the whole map: every folder and file below you. And something in <code>potential\\</code> is waiting to grow.',
    real: 'Windows has <code>tree</code> built in (add <code>/f</code> for files). On Mac/Linux it may need installing; <code>find .</code> shows a plain version.',
    chips: () => ['tree', 'tree /grow'], check: (e) => e.type === 'tree',
    msg: 'The whole map at once. Big projects look exactly like this, just with more branches.',
  },
  {
    id: 'build', title: 'Build something', win: 'md projects\\game', lin: 'mkdir projects/game',
    why: 'Every app you have ever used started as an empty folder. Make yours.',
    real: '<code>mkdir</code> works on all three systems. <code>md</code> is the short Windows version.',
    chips: () => { const nm = ['game', 'my-site', 'lab', 'app', 'idea'].find((x) => !walk(P('projects', x))) || 'thing' + (Date.now() % 100); const t = P('projects', nm); return ['md ' + relW(t), 'mkdir ' + relL(t)]; },
    check: (e) => e.type === 'mkdir',
    msg: 'A brand-new folder, made by you. Every project starts exactly like this.', light: 'Small steps, done every day, move mountains.',
  },
  {
    id: 'mark', title: 'Leave a mark', win: 'echo hello > hello.txt', lin: 'echo hello > hello.txt',
    why: '<code>&gt;</code> takes what a command says and saves it into a file instead of the screen. <code>&gt;&gt;</code> adds a line to the end instead of replacing.',
    real: 'Careful on your real computer: <code>&gt;</code> replaces the file if it already exists. <code>&gt;&gt;</code> is the gentle one.',
    chips: () => { const base = safeCwd() ? '' : relW(HOME) + '\\'; return [`echo hello world > ${base}hello.txt`, `echo one more line >> ${base}hello.txt`]; },
    check: (e) => e.type === 'write',
    msg: 'You wrote a file with one line of text. That is basically how programs save things.',
  },
  {
    id: 'search', title: 'Search', win: 'findstr /s /i "light" *.txt', lin: 'grep -ri light .',
    why: 'Lost a sentence somewhere in a pile of files? Search the text <em>inside</em> them, not just the names.',
    real: 'Windows: <code>findstr</code>. Mac/Linux: <code>grep</code>, one of the most loved tools ever made.',
    chips: () => (atHome() ? ['findstr /s /i "light" *.txt', 'grep -ri light .'] : [`findstr /s /i "light" ${relW(HOME)}\\*.txt`, `grep -ri light ${relL(HOME)}`]),
    check: (e) => e.type === 'search' && e.matches > 0,
    msg: 'Found it. Developers search code exactly like this all day long.', light: 'A little light pushes away a lot of darkness.',
  },
  {
    id: 'ping', title: 'Talk to the network', win: 'ping szvtech.org', lin: 'ping -c 4 szvtech.org',
    why: '<code>ping</code> sends a tiny "are you there?" and times the answer. It is the first thing to try when "the internet is broken".',
    real: 'Try <code>ping google.com</code> in your real terminal. On Mac/Linux it keeps going until you press <b>Ctrl+C</b>.',
    chips: () => ['ping szvtech.org', 'ping -c 4 szvtech.org'], check: (e) => e.type === 'ping',
    msg: 'Pong! Every reply crossed the network and came back in a few milliseconds.',
  },
  {
    id: 'ip', title: 'Who am I on the net?', win: 'ipconfig', lin: 'ip a',
    why: 'Your computer has an address on the network. Useful the day a game server, a printer or a friend asks for "your IP".',
    real: '<code>ipconfig</code> on Windows, <code>ifconfig</code> on Mac, <code>ip a</code> on Linux. Look for the line that says IPv4 / inet.',
    chips: () => ['ipconfig', 'ip a', 'ifconfig'], check: (e) => e.type === 'ipconfig',
    msg: 'That is your address on the local network. (127.0.0.1 always means "this computer".)',
  },
  {
    id: 'help', title: 'Get help yourself', win: 'help', lin: 'man ls',
    why: 'The most important command of all: asking the computer itself. Pros do not memorize everything; they know how to look it up.',
    real: 'Every real command has a manual: <code>dir /?</code> on Windows, <code>man ls</code> on Mac/Linux (press <b>q</b> to leave).',
    chips: () => ['help', 'man ls', 'dir /?'], check: (e) => e.type === 'help',
    msg: 'Now you can teach yourself any command.', light: "If you know one thing, teach it to someone who doesn't.",
  },
  {
    id: 'goal', title: 'Your mission', win: 'echo <your goal> > C:\\Users\\you\\mission\\goal.txt', lin: 'echo <your goal> > ~/mission/goal.txt',
    why: 'Last one. Write one real thing you want to build or learn, in your own words. It stays here, and it will be waiting for you next time.',
    real: 'Want it on your real computer too? The same line works there: <code>echo your goal &gt; goal.txt</code>.',
    chips: () => [{ label: 'echo <your goal> > ...\\mission\\goal.txt', insert: 'echo  > C:\\Users\\you\\mission\\goal.txt', caret: 5 }, 'type ' + relW(P('mission', 'briefing.txt'))],
    check: (e) => e.type === 'write' && e.goal,
    msg: 'Saved to mission\\goal.txt. It will be here when you come back.', light: 'Something done right now beats something perfect someday.',
  },
];
const isDone = (id) => S.done.includes(id);
let focusId = null;
const curMission = () => { const f = focusId && MISSIONS.find((m) => m.id === focusId); if (f) return f; return MISSIONS.find((m) => !isDone(m.id)) || null; };
const nextMission = () => MISSIONS.find((m) => !isDone(m.id)) || null;
const activeMission = () => { const m = curMission(); return m && !isDone(m.id) ? m : nextMission(); };

const BADGES = [
  { id: 'first', icon: '>_', name: 'Hello, world', desc: 'Typed your very first command.', test: () => S.hist.length > 0 },
  { id: 'green', icon: '0a', name: 'Hacker green', desc: 'Turned the screen green.', test: () => isDone('green') },
  { id: 'explorer', icon: 'cd', name: 'Explorer', desc: 'Visited 5 different folders.', test: () => S.visited.length >= 5 },
  { id: 'bookworm', icon: 'txt', name: 'Bookworm', desc: 'Read 5 different files.', test: () => S.read.length >= 5 },
  { id: 'architect', icon: 'md', name: 'Architect', desc: 'Built a folder out of nothing.', test: () => isDone('build') },
  { id: 'gardener', icon: '/|\\', name: 'Gardener', desc: 'Watched something small grow.', test: () => !!S.flags.grew },
  { id: 'detective', icon: 'grep', name: 'Detective', desc: 'Found words hidden inside files.', test: () => isDone('search') },
  { id: 'net', icon: 'ping', name: 'Networker', desc: 'Pinged a server and found your IP.', test: () => isDone('ping') && isDone('ip') },
  { id: 'selfhelp', icon: '?', name: 'Self-taught', desc: 'Asked the computer for help.', test: () => isDone('help') },
  { id: 'xray', icon: '.*', name: 'X-ray eyes', desc: 'Found a hidden file.', test: () => !!S.flags.hidden },
  { id: 'focus', icon: 'kill', name: 'Unstoppable', desc: 'Ended procrastination.exe.', test: () => !!S.flags.killed },
  { id: 'goal', icon: 'goal', name: 'Mission set', desc: 'Wrote down a real goal.', test: () => isDone('goal') },
  { id: 'grad', icon: '15', name: 'Graduate', desc: 'Finished all 15 missions.', test: () => MISSIONS.every((m) => isDone(m.id)) },
];
const LEVELS = [[0, 'Curious'], [150, 'Explorer'], [400, 'Apprentice'], [750, 'Operator'], [1100, 'Shell whisperer'], [1500, 'Builder'], [1900, 'Teacher']];
const xp = () => S.done.length * 100 + S.read.length * 10 + S.badges.length * 25;
function level() {
  const x = xp(); let i = 0;
  while (i < LEVELS.length - 1 && x >= LEVELS[i + 1][0]) i++;
  return { i, name: LEVELS[i][1], from: LEVELS[i][0], next: LEVELS[i + 1] ? LEVELS[i + 1][0] : null };
}

let badgeQueue = [], badgeShowing = false;
function processEvents() {
  const lvBefore = level().i;
  const evs = pending; pending = [];
  const completed = [];
  for (const e of evs) {
    for (const m of MISSIONS) {
      if (isDone(m.id) || completed.includes(m)) continue;
      try { if (m.check(e)) completed.push(m); } catch (x) { /* ignore */ }
    }
  }
  completed.forEach((m) => { S.done.push(m.id); if (focusId === m.id) focusId = null; });
  completed.forEach((m) => printComplete(m));
  const newBadges = BADGES.filter((b) => !S.badges.includes(b.id) && b.test());
  newBadges.forEach((b) => S.badges.push(b.id));
  const lv = level();
  renderPanel(completed, newBadges);
  if (completed.length) {
    chime('mission');
    const r = (MOBILE.matches ? $('#mstrip') : $('#mcard')).getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + Math.min(r.height / 2, 60), 46);
  }
  if (lv.i > lvBefore) setTimeout(() => { toast(`Level up \u00B7 ${lv.name}`); chime('level'); const n = $('#lvNum'); n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop'); const r = n.getBoundingClientRect(); if (!MOBILE.matches) burst(r.left + r.width / 2, r.top + r.height / 2, 30); }, completed.length ? 700 : 100);
  newBadges.forEach((b) => badgeQueue.push(b));
  if (!badgeShowing && badgeQueue.length) setTimeout(showNextBadge, completed.length ? 650 : 150);
  save();
}
function printComplete(m) {
  const i = MISSIONS.indexOf(m);
  const nx = MISSIONS.find((x) => !isDone(x.id));
  const d = addLine(`<div class="mdone__t"><b class="ok">\u2713 MISSION ${pad2(i + 1)} COMPLETE</b><span>${esc(m.title)}</span><span class="mdone__xp">+100 XP</span></div>`
    + `<div class="mdone__msg">${esc(m.msg)}</div>`
    + (m.light ? `<div class="mdone__light c3">${esc(m.light)}</div>` : '')
    + (nx ? `<div class="mdone__next">\u2192 Next up: ${pad2(MISSIONS.indexOf(nx) + 1)} \u00B7 ${esc(nx.title)}  <span class="dim">(stuck? type hint)</span></div>` : `<div class="mdone__next">\u2192 All ${MISSIONS.length} missions done. The whole machine is yours now.</div>`), 'mdone');
  d.classList.remove('in');
  if (m.id === 'goal' && S.goal) addLine(`<span class="dim">your goal:</span> <span class="grad">${esc(S.goal.text)}</span>`);
}
function printHint() {
  const m = activeMission();
  if (!m) { p('All missions are done. Free play: try matrix, neofetch, tasklist, tree /grow, or explore with dir and type.'); return; }
  const i = MISSIONS.indexOf(m);
  ph(`<span class="c3">MISSION ${pad2(i + 1)}</span> \u00B7 <b>${esc(m.title)}</b>`);
  p(strip(m.why));
  ph(`<span class="dim">Windows:</span> <span class="c2">${esc(m.win)}</span>   <span class="dim">Linux/Mac:</span> <span class="c1">${esc(m.lin)}</span>`);
  ph(`<span class="dim">Type it, or ${TOUCH ? 'tap' : 'click'} a suggestion under the terminal.</span>`);
}

/* --------------------------------------------------------------------------
   UI rendering: panel, chips, prompt, input
   -------------------------------------------------------------------------- */
function renderPanel(justDone = [], newBadges = []) {
  const L = level(), x = xp();
  const pct = L.next ? Math.min(100, ((x - L.from) / (L.next - L.from)) * 100) : 100;
  $('#lvNum').textContent = L.i + 1; $('#lvName').textContent = L.name;
  $('#xpNow').textContent = x; $('#xpNext').textContent = L.next || x;
  $('#xpFill').style.width = pct + '%';
  $('#hdrLv').textContent = L.i + 1; $('#hdrName').textContent = L.name; $('#hdrBar').style.width = pct + '%';
  $('#mCount').textContent = `${S.done.length}/${MISSIONS.length}`;
  $('#bCount').textContent = `${S.badges.length}/${BADGES.length}`;
  const m = curMission();
  const card = $('#mcard');
  const sig = (m ? m.id : 'all') + ':' + (m && isDone(m.id));
  if (card.dataset.sig !== sig) {
    card.dataset.sig = sig;
    if (m) {
      const i = MISSIONS.indexOf(m), dn = isDone(m.id);
      card.innerHTML = `<div class="mcard__top mono"><span>Mission ${pad2(i + 1)} / ${MISSIONS.length}</span>${dn ? '<span class="ok">\u2713 done</span>' : '<span>+100 XP</span>'}</div>`
        + `<h3 class="mcard__title">${esc(m.title)}</h3>`
        + `<p class="mcard__why">${m.why}</p>`
        + `<div class="twin"><button type="button" class="twin__col" data-tw="${m.id}:0" title="Run it in the terminal"><span class="twin__os mono">Windows</span><code>${esc(m.win)}</code></button><button type="button" class="twin__col" data-tw="${m.id}:1" title="Run it in the terminal"><span class="twin__os mono">Linux / Mac</span><code>${esc(m.lin)}</code></button></div>`
        + `<p class="mcard__real"><span class="mono">On your real computer</span>${m.real}</p>`;
    } else {
      card.innerHTML = `<div class="mcard__top mono"><span>All ${MISSIONS.length} missions</span><span class="ok">\u2713 complete</span></div>`
        + `<h3 class="mcard__title">You speak terminal now.</h3>`
        + (S.goal ? `<div class="mcard__goal"><span class="mono">Your goal</span>${esc(S.goal.text)}</div>` : '')
        + `<p class="mcard__why">Free play is yours. Poke around: <code>tasklist</code>, <code>tree /grow</code>, <code>neofetch</code>, <code>matrix</code>, <code>type games\\secret.txt</code>. And then open a real terminal and do it there.</p>`;
    }
    card.classList.remove('enter'); void card.offsetWidth; card.classList.add('enter');
  }
  if (justDone.length) { card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); }
  const cur = curMission();
  $('#mlist').innerHTML = MISSIONS.map((mm, i) => `<li class="${isDone(mm.id) ? 'is-done' : ''}${cur === mm ? ' is-cur' : ''}${justDone.includes(mm) ? ' just' : ''}"><button type="button" data-mid="${mm.id}"><span class="n">${pad2(i + 1)}</span><span>${esc(mm.title)}</span><span class="st" aria-label="${isDone(mm.id) ? 'done' : 'not done yet'}"></span></button></li>`).join('');
  $('#badges').innerHTML = BADGES.map((b) => `<div class="badge${S.badges.includes(b.id) ? ' is-on' : ''}${newBadges.includes(b) ? ' is-new' : ''}" title="${esc(b.name + ': ' + b.desc)}"><span class="badge__i">${S.badges.includes(b.id) ? esc(b.icon) : '?'}</span><span class="badge__n">${S.badges.includes(b.id) ? esc(b.name) : 'Locked'}</span></div>`).join('');
  // mobile strip
  const nm = nextMission();
  $('#msN').textContent = nm ? `M${pad2(MISSIONS.indexOf(nm) + 1)}` : '\u2713';
  $('#msT').textContent = nm ? nm.title : 'All missions complete';
  $('#msBar').style.width = (S.done.length / MISSIONS.length) * 100 + '%';
  renderChips();
}
function renderChips() {
  let items;
  if (busy) items = [{ label: 'Stop (Ctrl+C)', stop: true }];
  else {
    const m = activeMission();
    if (m) items = m.chips().concat([{ label: 'hint', ghost: true }]);
    else items = ['tree /grow', 'tasklist', 'neofetch', 'matrix', 'type ' + relW(P('games', 'jokes.txt')), { label: 'help', ghost: true }];
  }
  chipsEl.innerHTML = `<span class="chips__lbl mono" aria-hidden="true">${busy ? 'running' : 'try'}</span>` + items.map((it, i) => {
    const o = typeof it === 'string' ? { label: it } : it;
    const cls = o.stop ? 'chip chip--stop' : o.insert ? 'chip chip--ins' : o.ghost ? 'chip chip--ghost' : i === 0 ? 'chip chip--main' : 'chip';
    return `<button type="button" class="${cls}" ${o.stop ? 'data-stop="1"' : o.insert ? `data-ins="${esc(o.insert)}" data-caret="${o.caret || 0}"` : `data-cmd="${esc(o.cmd || o.label)}"`}>${esc(o.label)}</button>`;
  }).join('');
}
function renderPrompt() { promptEl.textContent = echoOn ? fmt(cwd) + '>' : ''; }
function renderInput() {
  const v = input.value;
  const s = input.selectionStart == null ? v.length : input.selectionStart;
  preEl.textContent = v.slice(0, s); caretEl.textContent = v[s] || ' '; postEl.textContent = v.slice(s + 1);
}
let busy = false;
function setBusy(b) {
  busy = b;
  lineEl.classList.toggle('is-hidden', b);
  renderChips();
}

/* --------------------------------------------------------------------------
   Submitting
   -------------------------------------------------------------------------- */
let histIdx = null;
let busyTimer = 0;
async function submit(line) {
  if (busy) return;
  input.value = ''; renderInput();
  ph(`${echoOn ? `<span class="pr">${esc(fmt(cwd) + '>')}</span>` : ''}${esc(line)}`, 'echo');
  histIdx = null;
  if (line.trim()) { S.hist.push(line); if (S.hist.length > 200) S.hist.splice(0, S.hist.length - 200); }
  busy = true; abort = false; failed = false;
  busyTimer = setTimeout(() => { if (busy) setBusy(true); }, 80);
  try { await runLine(line); } catch (e) { console.error(e); cap = null; p('Something glitched inside the training computer. Try that again?'); }
  clearTimeout(busyTimer);
  setBusy(false);
  if (line.trim()) emit({ type: 'any' });
  processEvents();
  renderPrompt(); renderInput();
  if (!TOUCH && $('#sheet').hidden && !root.classList.contains('panel-open')) input.focus({ preventScroll: true });
  if (line.trim() && lc(line.trim()) !== 'cls' && lc(line.trim()) !== 'clear' && out.lastElementChild && !out.lastElementChild.classList.contains('mdone') && !/^\s*$/.test(out.lastElementChild.textContent)) p('');
  scrollDown();
}
async function typeAndRun(cmd) {
  if (busy || booting) return;
  input.value = '';
  for (let i = 1; i <= cmd.length; i++) { input.value = cmd.slice(0, i); input.setSelectionRange(i, i); renderInput(); await sleep(cmd.length > 24 ? 9 : 22); }
  input.value = cmd; renderInput();
  await sleep(90);
  await submit(cmd);
  if (!TOUCH) input.focus({ preventScroll: true });
}
function insertCmd(text, caret) {
  input.value = text; input.focus({ preventScroll: true });
  const c = caret || text.length;
  input.setSelectionRange(c, c); renderInput(); scrollDown();
}

/* tab completion */
function complete() {
  const v = input.value, s = input.selectionStart;
  const before = v.slice(0, s), after = v.slice(s);
  const m = before.match(/(^|\s)("?)([^\s"]*)$/);
  const word = m ? m[3] : '';
  const isFirst = !before.slice(0, before.length - word.length - (m && m[2] ? 1 : 0)).trim();
  let options = [], dirPart = '', sepCh = '\\';
  if (!isFirst && /^\s*theme\s+\S*$/i.test(before) && window.SZVTheme) {
    options = window.SZVTheme.list().filter((n) => n.startsWith(lc(word))).map((n) => ({ n, d: false }));
  } else if (isFirst) {
    options = [...CMDS.keys()].filter((n) => n.startsWith(lc(word)) && n !== 'echo.' && n !== '?' && !(CMDS.get(n).hidden && !['hint', 'missions', 'matrix', 'neofetch', 'progress', 'fortune', 'theme'].includes(n))).sort().map((n) => ({ n, d: false }));
  } else {
    const i = Math.max(word.lastIndexOf('\\'), word.lastIndexOf('/'));
    dirPart = i >= 0 ? word.slice(0, i + 1) : '';
    if (i >= 0) sepCh = word[i];
    const pref = word.slice(i + 1);
    const pp = parsePath(dirPart || '.');
    const w = pp.err ? null : walk(pp.segs);
    if (w && w.node.t === 'd') options = sortAlpha(w.node).filter((n) => lc(n.n).startsWith(lc(pref)) && (!isHidden(n) || pref.startsWith('.'))).map((n) => ({ n: n.n, d: n.t === 'd' }));
  }
  if (!options.length) return;
  const head = before.slice(0, before.length - word.length - (m && m[2] ? 1 : 0));
  const build = (txt, final) => {
    const needsQ = /\s/.test(dirPart + txt);
    return head + (needsQ ? '"' : '') + dirPart + txt + (needsQ && final ? '"' : '');
  };
  if (options.length === 1) {
    const o = options[0];
    const nv = build(o.n + (o.d ? sepCh : ''), !o.d) + (o.d ? '' : ' ');
    input.value = nv + after.replace(/^\s/, ''); input.setSelectionRange(nv.length, nv.length);
  } else {
    let common = options[0].n;
    for (const o of options) { while (!lc(o.n).startsWith(lc(common))) common = common.slice(0, -1); }
    const cur = word.slice(dirPart.length);
    if (common.length > cur.length) { const nv = build(common, false); input.value = nv + after; input.setSelectionRange(nv.length, nv.length); }
    else { ph(`<span class="pr">${esc(fmt(cwd) + '>')}</span>${esc(v)}`, 'echo'); ph(options.map((o) => (o.d ? `<span class="dir">${esc(o.n)}</span>` : esc(o.n))).join('   ')); }
  }
  used('tab');
  renderInput();
}

/* --------------------------------------------------------------------------
   Tree growth (ascii)
   -------------------------------------------------------------------------- */
const h2 = (x, y) => { let h = Math.imul(x * 374761393 + y * 668265263, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
function treeFrame(t, fruit) {
  const W = 37, H = 16, cx = 18, g = H - 1;
  const ch = Array.from({ length: H }, () => Array(W).fill(' '));
  const cl = Array.from({ length: H }, () => Array(W).fill(''));
  const set = (x, y, c, k) => { if (x >= 0 && x < W && y >= 0 && y < H) { ch[y][x] = c; cl[y][x] = k; } };
  for (let x = 3; x < W - 3; x++) { const r = h2(x, 99); set(x, g, r < 0.12 ? ',' : r < 0.24 ? '.' : '_', 'gr'); }
  if (t < 0.1) { set(cx, g - 1, t < 0.05 ? '.' : 'o', 'seed'); }
  else {
    const e = 1 - Math.pow(1 - Math.min(1, (t - 0.1) / 0.9), 2.2);
    const th = Math.max(1, Math.round(1 + e * 5));
    const top = g - th;
    if (e < 0.12) {
      for (let i = 1; i <= th; i++) set(cx, g - i, '|', 'leaf2');
      set(cx - 1, top - 0, '\\', 'leaf'); set(cx + 1, top - 0, '/', 'leaf');
      if (e > 0.06) set(cx, top - 1, 'v', 'leaf');
    } else {
      const rx = 1.5 + e * 14.5, ry = 0.9 + e * 5.1, cy = top - ry * 0.62;
      const LEAF = ['&', '&', '&', '%', '&', '@', '&', '%'];
      for (let y = 0; y < top + 1; y++) for (let x = 0; x < W; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry, d = dx * dx + dy * dy;
        const n = h2(x, y);
        if (d < 1 - n * 0.32 && !(y === top && Math.abs(x - cx) > rx * 0.55)) {
          const fr = fruit && h2(y * 7, x * 3) < 0.06 && d < 0.75;
          set(x, y, fr ? 'o' : LEAF[Math.floor(h2(y + 31, x + 17) * LEAF.length)], fr ? 'fruit' : (h2(x + 5, y + 9) < 0.35 ? 'leaf2' : 'leaf'));
        }
      }
      for (let i = 1; i <= th; i++) set(cx, g - i, '|', 'trunk');
      if (e > 0.4) { set(cx - 1, g - 1, '/', 'trunk'); set(cx + 1, g - 1, '\\', 'trunk'); }
      const nb = Math.round(e * 3);
      for (let kk = 1; kk <= nb; kk++) { set(cx - kk, top - kk + 1, '\\', 'trunk'); set(cx + kk, top - kk + 1, '/', 'trunk'); if (kk < nb) set(cx, top - kk + 1, '|', 'trunk'); }
    }
  }
  return ch.map((row, y) => {
    let s = '', curK = null;
    row.forEach((c, x) => { const kk = cl[y][x] || null; if (kk !== curK) { if (curK) s += '</span>'; if (kk) s += `<span class="${kk}">`; curK = kk; } s += esc(c); });
    if (curK) s += '</span>';
    return s.replace(/\s+$/, '');
  }).join('\n');
}
async function growTree() {
  if (cap) { cap.push(strip(treeFrame(1, true))); cap.push('Everything big started as something small.'); return; }
  ph('<span class="dim">planting a seed\u2026</span>');
  const pre = doc.createElement('pre');
  pre.className = 't-art'; pre.setAttribute('role', 'img'); pre.setAttribute('aria-label', 'ASCII art: a tree grows from a tiny seed');
  out.appendChild(pre);
  { // ASCII frames are text, not vestibular motion: plays under reduced motion too
    const N = 44;
    for (let i = 0; i <= N; i++) { if (abort) break; pre.innerHTML = treeFrame(i / N, false); scrollDown(); await sleep(i < 6 ? 140 : 52); }
    await sleep(160);
  }
  pre.innerHTML = treeFrame(1, true); scrollDown();
  await sleep(260);
  ph('<span class="grad">Everything big started as something small.</span>', 'wisdom');
}

/* --------------------------------------------------------------------------
   Matrix rain
   -------------------------------------------------------------------------- */
async function matrix() {
  if (cap) return;
  if (reduced()) { p('(Matrix rain skipped: your device asks for reduced motion. The code is still there, just quieter.)'); return; }
  const cv = doc.createElement('canvas'); cv.className = 'matrix';
  crt.appendChild(cv);
  const r = crt.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = r.width * dpr; cv.height = r.height * dpr;
  const x = cv.getContext('2d'); x.scale(dpr, dpr);
  const fs = 15, cols = Math.ceil(r.width / fs);
  const drops = Array.from({ length: cols }, () => Math.random() * -12);
  const col = colorCode ? PAL[colorCode[colorCode.length - 1]] : '#3dff6e';
  const glyphs = '01<>/{}[]=+*#$%&ABCDEFGHJKLMNPQRSTUVWXYZdirlscatcdpingecho';
  const t0 = performance.now();
  p('follow the green rain\u2026', 'dim');
  await new Promise((res) => {
    (function frame(now) {
      const el = now - t0;
      x.fillStyle = 'rgba(2, 4, 3, .16)'; x.fillRect(0, 0, r.width, r.height);
      x.font = `500 ${fs}px "JetBrains Mono", monospace`;
      drops.forEach((d, i) => {
        const ch = glyphs[Math.floor(Math.random() * glyphs.length)];
        x.fillStyle = Math.random() < 0.08 ? '#eafff0' : col;
        x.fillText(ch, i * fs, d * fs);
        drops[i] = d * fs > r.height && Math.random() > 0.96 ? 0 : d + 0.55;
      });
      if (el > 3600 || abort) { cv.style.opacity = '0'; setTimeout(() => { cv.remove(); res(); }, 600); return; }
      requestAnimationFrame(frame);
    })(t0);
  });
  ph('<span class="grad">You saw the code. Now go write some.</span>', 'wisdom');
}

/* --------------------------------------------------------------------------
   Effects: particles, background, sound, toast, badge unlock
   -------------------------------------------------------------------------- */
/* Site theme (/assets/theme.js): canvas colors come from the shared palette. */
const THEME = window.SZVTheme || null;
const themePal = () => (THEME ? THEME.palette() : { a1: '#8b5cf6', a2: '#22d3ee', a3: '#e879f9', rgb: { a1: [139, 92, 246], a2: [34, 211, 238], a3: [232, 121, 249] } });
const fx = $('#fx'), fctx = fx.getContext('2d');
let parts = [], fxOn = false;
function sizeFx() { const d = Math.min(2, devicePixelRatio || 1); fx.width = innerWidth * d; fx.height = innerHeight * d; fctx.setTransform(d, 0, 0, d, 0, 0); }
function burst(x, y, n = 50) {
  if (reduced()) return;
  const tp = themePal();
  const cols = [tp.a1, tp.a3, tp.a2, '#7dffb3', '#ffffff'];
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 6.5; parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2.4, life: 1, d: 0.012 + Math.random() * 0.016, r: 1.2 + Math.random() * 2.6, c: cols[i % cols.length], sq: Math.random() < 0.4 }); }
  if (!fxOn) { fxOn = true; requestAnimationFrame(fxLoop); }
}
function fxLoop() {
  fctx.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter((q) => q.life > 0);
  for (const q of parts) {
    q.vx *= 0.975; q.vy = q.vy * 0.975 + 0.16; q.x += q.vx; q.y += q.vy; q.life -= q.d;
    fctx.globalAlpha = Math.max(0, q.life); fctx.fillStyle = q.c;
    if (q.sq) fctx.fillRect(q.x, q.y, q.r * 1.6, q.r * 1.6); else { fctx.beginPath(); fctx.arc(q.x, q.y, q.r, 0, 6.283); fctx.fill(); }
  }
  fctx.globalAlpha = 1;
  if (parts.length) requestAnimationFrame(fxLoop); else { fxOn = false; fctx.clearRect(0, 0, innerWidth, innerHeight); }
}
function bgInit() {
  const cv = $('#bg'), x = cv.getContext('2d');
  let W = 0, H = 0, dots = [], last = 0, raf = 0;
  const size = () => {
    const d = Math.min(1.5, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight; cv.width = W * d; cv.height = H * d; x.setTransform(d, 0, 0, d, 0, 0);
    const n = Math.round(Math.min(70, (W * H) / 22000));
    dots = Array.from({ length: n }, (_, i) => ({ x: Math.random() * W, y: Math.random() * H, r: 0.4 + Math.random() * 1.4, s: 0.06 + Math.random() * 0.22, ph: Math.random() * 6.28, c: i % 3 === 0 ? 'a2' : i % 3 === 1 ? 'a1' : 'a3' }));
  };
  let rgbs = {};
  const setRgbs = () => { const r = themePal().rgb; rgbs = { a1: r.a1.join(','), a2: r.a2.join(','), a3: r.a3.join(',') }; };
  setRgbs();
  if (THEME) THEME.on(() => { setRgbs(); if (reduced()) draw(0); });
  const draw = (t) => {
    x.clearRect(0, 0, W, H);
    for (const d of dots) {
      const a = 0.18 + 0.32 * (0.5 + 0.5 * Math.sin(t / 1400 + d.ph));
      x.fillStyle = `rgba(${rgbs[d.c]},${a})`;
      x.beginPath(); x.arc(d.x, d.y, d.r, 0, 6.283); x.fill();
    }
  };
  const loop = (t) => {
    raf = requestAnimationFrame(loop);
    if (t - last < 33) return;
    const dt = Math.min(60, t - last); last = t;
    for (const d of dots) { d.y -= d.s * dt / 16; d.x += Math.sin(t / 3000 + d.ph) * 0.08; if (d.y < -4) { d.y = H + 4; d.x = Math.random() * W; } }
    draw(t);
  };
  size();
  addEventListener('resize', () => { size(); if (reduced()) draw(0); });
  if (reduced()) draw(0); else raf = requestAnimationFrame(loop);
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) cancelAnimationFrame(raf); else if (!reduced()) raf = requestAnimationFrame(loop); });
}

let AC = null;
function chime(kind) {
  if (!S.sound) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const seq = kind === 'badge' ? [523.25, 659.25, 783.99, 1046.5] : kind === 'level' ? [392, 523.25, 659.25, 783.99, 1046.5] : kind === 'tick' ? [880] : [659.25, 987.77];
    const t0 = AC.currentTime + 0.01;
    seq.forEach((f, i) => {
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = kind === 'tick' ? 'square' : 'triangle'; o.frequency.value = f;
      const st = t0 + i * (kind === 'level' ? 0.07 : 0.085), dur = kind === 'tick' ? 0.04 : 0.32;
      g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(kind === 'tick' ? 0.02 : 0.07, st + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, st + dur);
      o.connect(g).connect(AC.destination); o.start(st); o.stop(st + dur + 0.03);
    });
  } catch (e) { /* audio not available */ }
}
function setSound(on) {
  S.sound = !!on; save();
  const b = $('#soundBtn');
  b.setAttribute('aria-pressed', String(S.sound)); b.title = `Sound effects (${S.sound ? 'on' : 'off'})`;
  if (S.sound) chime('tick');
}

let toastT = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('is-on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('is-on'), 2300);
}
function showNextBadge() {
  const b = badgeQueue.shift();
  if (!b) { badgeShowing = false; return; }
  badgeShowing = true;
  const u = $('#unlock');
  $('#unIcon').textContent = b.icon; $('#unName').textContent = b.name; $('#unDesc').textContent = b.desc;
  u.classList.remove('is-out', 'is-on'); void u.offsetWidth; u.classList.add('is-on');
  chime('badge');
  buzz([35, 55, 70]);
  setTimeout(() => { const r = $('.unlock__ring').getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, 70); }, 260);
  const hold = badgeQueue.length ? 1700 : 2500;
  setTimeout(() => { u.classList.remove('is-on'); u.classList.add('is-out'); }, hold);
  setTimeout(() => { u.classList.remove('is-out'); showNextBadge(); }, hold + 500);
}

/* --------------------------------------------------------------------------
   Cheat sheet
   -------------------------------------------------------------------------- */
const CHEAT = [
  ['Moving around'],
  ['pwd', 'cd', 'pwd', 'show where you are'],
  ['ls', 'dir', 'ls', 'list files and folders'],
  ['cd', 'cd folder', 'cd folder', 'go into a folder'],
  ['cdup', 'cd ..', 'cd ..', 'go up one level'],
  ['cdhome', 'cd %USERPROFILE%', 'cd ~', 'jump to your home folder'],
  ['tree', 'tree', 'tree', 'draw the folder map'],
  ['Files'],
  ['cat', 'type file', 'cat file', 'print what is inside a file'],
  ['mkdir', 'md name', 'mkdir name', 'make a folder'],
  ['write', 'echo text > file', 'echo text > file', 'write text into a file (replaces it)'],
  ['append', 'echo text >> file', 'echo text >> file', 'add a line to the end of a file'],
  ['copy', 'copy a b', 'cp a b', 'copy a file'],
  ['move', 'move a b', 'mv a b', 'move a file or folder'],
  ['ren', 'ren a b', 'mv a b', 'rename'],
  ['del', 'del file', 'rm file', 'delete a file (no recycle bin!)'],
  ['rmdir', 'rd /s folder', 'rm -r folder', 'delete a folder and everything in it'],
  ['Screen & searching'],
  ['clear', 'cls', 'clear', 'wipe the screen'],
  ['color', 'color 0a', 'tput setaf 2', 'recolor the terminal'],
  ['title', 'title text', '(terminal settings)', 'rename the window'],
  ['search', 'findstr /i "word" *.txt', 'grep -i word *.txt', 'search text inside files'],
  ['history', 'doskey /history', 'history', 'commands you typed before'],
  ['help', 'help  /  cmd /?', 'man cmd', 'ask the computer for help'],
  ['Network & system'],
  ['ping', 'ping host', 'ping -c 4 host', 'is that computer there? how fast?'],
  ['ipconfig', 'ipconfig', 'ip a  /  ifconfig', 'your address on the network'],
  ['whoami', 'whoami', 'whoami', 'which user you are'],
  ['hostname', 'hostname', 'hostname', "this computer's name"],
  ['ver', 'ver', 'uname -a', 'system version'],
  ['date', 'date /t', 'date', "today's date"],
  ['tasklist', 'tasklist', 'ps', 'running programs'],
  ['taskkill', 'taskkill /im name.exe', 'kill pid', 'stop a program'],
  ['set', 'set', 'env', 'environment variables'],
  ['Keys (same everywhere)'],
  ['*', 'Tab', 'Tab', 'finish a file or command name'],
  ['*', '\u2191 / \u2193', '\u2191 / \u2193', 'scroll through earlier commands'],
  ['*', 'Ctrl+C', 'Ctrl+C', 'stop what is running'],
  ['*', 'Ctrl+L', 'Ctrl+L', 'clear the screen'],
];
let sheetReturn = null;
function openSheet() {
  const rows = CHEAT.map((r) => {
    if (r.length === 1) return `<div class="srow srow--sub"><span>${esc(r[0])}</span></div>`;
    const on = r[0] === '*' || S.used.includes(r[0]);
    return `<div class="srow${on ? '' : ' is-locked'}"><span><code>${esc(r[1])}</code></span><span><code class="lx">${esc(r[2])}</code></span><span>${on ? esc(r[3]) : 'locked \u00B7 use it once to unlock'}</span></div>`;
  }).join('');
  const learned = CHEAT.filter((r) => r.length > 1 && r[0] !== '*' && S.used.includes(r[0])).length;
  const total = CHEAT.filter((r) => r.length > 1 && r[0] !== '*').length;
  $('#sheetH').textContent = `What you know so far \u00B7 ${learned}/${total}`;
  $('#sheetTable').innerHTML = `<div class="srow srow--h"><span>Windows</span><span>Linux / Mac</span><span>What it does</span></div>${rows}`;
  const sh = $('#sheet');
  sheetReturn = doc.activeElement;
  sh.hidden = false; sh.classList.remove('is-on'); void sh.offsetWidth; sh.classList.add('is-on');
  $('#sheetClose').focus();
}
function closeSheet() {
  const sh = $('#sheet');
  if (sh.hidden) return;
  sh.hidden = true;
  if (sheetReturn && sheetReturn !== doc.body && sheetReturn.focus) sheetReturn.focus({ preventScroll: true });
}

/* --------------------------------------------------------------------------
   Panel (drawer on mobile, toggle in free play)
   -------------------------------------------------------------------------- */
function setPanel(open) {
  root.classList.toggle('panel-open', open);
  $('#mstrip').setAttribute('aria-expanded', String(open && MOBILE.matches));
  $('#panelBtn').setAttribute('aria-expanded', String(open || !root.classList.contains('is-free')));
  if (open && MOBILE.matches) $('#panelClose').focus({ preventScroll: true });
}

function wipe() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  location.hash = ''; location.reload();
}

/* --------------------------------------------------------------------------
   Wiring
   -------------------------------------------------------------------------- */
let booting = !root.classList.contains('no-boot');
function wire() {
  ['input', 'keyup', 'click', 'select', 'focus'].forEach((ev) => input.addEventListener(ev, () => requestAnimationFrame(renderInput)));
  input.addEventListener('focus', () => screen.classList.add('is-focus'));
  input.addEventListener('blur', () => screen.classList.remove('is-focus'));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (!busy) submit(input.value); return; }
    if (e.key === 'Tab') { e.preventDefault(); complete(); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!S.hist.length) return;
      if (e.key === 'ArrowUp') histIdx = histIdx == null ? S.hist.length - 1 : Math.max(0, histIdx - 1);
      else { if (histIdx == null) return; histIdx++; if (histIdx >= S.hist.length) { histIdx = null; input.value = ''; renderInput(); return; } }
      input.value = S.hist[histIdx];
      const L = input.value.length;
      requestAnimationFrame(() => { input.setSelectionRange(L, L); renderInput(); });
      used('hist');
      return;
    }
    if (e.ctrlKey && !e.shiftKey && !e.altKey && lc(e.key) === 'l') { e.preventDefault(); if (!busy) { clearScreen(); emit({ type: 'clear' }); used('clear'); processEvents(); } return; }
    if (e.ctrlKey && lc(e.key) === 'c' && input.selectionStart === input.selectionEnd) {
      e.preventDefault();
      if (busy) { abort = true; p('^C'); return; }
      ph(`<span class="pr">${esc(fmt(cwd) + '>')}</span>${esc(input.value)}^C`, 'echo'); input.value = ''; renderInput(); return;
    }
    if (e.key === 'Escape') { input.value = ''; renderInput(); }
  });
  // global: typing anywhere goes to the terminal; Ctrl+C stops
  addEventListener('keydown', (e) => {
    if (!$('#sheet').hidden) { if (e.key === 'Escape') { e.preventDefault(); closeSheet(); } return; }
    if (e.key === 'Escape' && root.classList.contains('panel-open') && MOBILE.matches) { setPanel(false); return; }
    if (booting) return;
    if (busy && e.ctrlKey && lc(e.key) === 'c') { e.preventDefault(); abort = true; p('^C'); return; }
    const t = e.target;
    if (t === input) return;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '?' && !busy) { e.preventDefault(); openSheet(); return; }
    if (e.key.length === 1 && !(t && t.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter'))) input.focus({ preventScroll: true });
  });
  screen.addEventListener('click', (e) => {
    if (busy) return;
    const sel = getSelection();
    if (sel && String(sel).length) return;
    if (e.target.closest('a, button')) return;
    input.focus({ preventScroll: true });
    requestAnimationFrame(scrollDown);
  });
  // chips + mission card commands
  doc.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cmd], [data-ins], [data-stop], [data-mid], [data-tw]');
    if (!b) return;
    if (b.dataset.tw) {
      const [id, ix] = b.dataset.tw.split(':');
      const m = MISSIONS.find((x) => x.id === id);
      if (!m) return;
      const ch = m.chips();
      const pick = ch[+ix === 1 && m.lin !== m.win && ch[1] != null ? 1 : 0];
      if (MOBILE.matches) setPanel(false);
      if (typeof pick === 'object') insertCmd(pick.insert, pick.caret); else typeAndRun(pick);
      return;
    }
    if (b.dataset.stop) { abort = true; p('^C'); return; }
    if (b.dataset.mid) {
      const m = MISSIONS.find((x) => x.id === b.dataset.mid);
      focusId = m ? m.id : null;
      renderPanel();
      return;
    }
    if (b.dataset.ins) { if (MOBILE.matches) setPanel(false); insertCmd(b.dataset.ins, +b.dataset.caret || 0); return; }
    if (b.dataset.cmd) {
      if (MOBILE.matches) setPanel(false);
      typeAndRun(b.dataset.cmd);
    }
  });
  $('#soundBtn').addEventListener('click', () => setSound(!S.sound));
  $('#cheatBtn').addEventListener('click', openSheet);
  $('#sheetClose').addEventListener('click', closeSheet);
  $('#sheet').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeSheet(); });
  $('#sheet').addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = [...$('#sheet').querySelectorAll('button, [tabindex]:not([tabindex="-1"])')];
    if (f.length <= 1) { e.preventDefault(); return; }
  });
  $('#mstrip').addEventListener('click', () => setPanel(true));
  $('#panelClose').addEventListener('click', () => { setPanel(false); $('#mstrip').focus({ preventScroll: true }); });
  $('#scrim').addEventListener('click', () => setPanel(false));
  $('#panelBtn').addEventListener('click', () => setPanel(!root.classList.contains('panel-open')));
  $('#resetBtn').addEventListener('click', () => { if (confirm('Start over? This wipes missions, XP, badges and your saved goal.')) wipe(); });
  addEventListener('resize', sizeFx);
  addEventListener('hashchange', () => { if (location.hash === '#free') { root.classList.add('is-free'); setPanel(false); } });
  MOBILE.addEventListener && MOBILE.addEventListener('change', () => setPanel(false));
}

/* --------------------------------------------------------------------------
   Boot + welcome
   -------------------------------------------------------------------------- */
async function boot() {
  const el = $('#bootLines'), bootEl = $('#boot');
  $('#bootDay p').textContent = LINE_OF_DAY;
  if (!booting) return;
  if (TOUCH) { const sk = $('.boot__skip'); if (sk) sk.textContent = 'tap to skip'; }
  let skip = false;
  const onSkip = (e) => { if (e.type === 'keydown' && (e.ctrlKey || e.metaKey || e.key === 'Tab')) return; skip = true; };
  addEventListener('keydown', onSkip, true); addEventListener('pointerdown', onSkip, true);
  const dots = (s, w = 34) => s + ' ' + '.'.repeat(Math.max(2, w - s.length)) + ' ';
  const L = [
    `${dots('CPU: Curiosity Core @ 4.20 GHz')}<span class="ok">OK</span>`,
    `${dots('Memory test')}<span class="ok">16384 MB OK</span>`,
    `${dots('Detecting drives')}<span class="c2">C:\\ SZVTECH</span>`,
    `${dots('loading curiosity.sys')}<span class="ok">OK</span>`,
    `${dots('loading patience.dll')}<span class="ok">OK</span>`,
    `${dots('loading focus.drv')}<span class="ok">OK</span>`,
    `${dots('mounting C:\\Users\\you')}<span class="ok">OK</span>`,
    'starting training terminal\u2026',
  ];
  let html = '';
  for (const l of L) { if (skip) break; html += l + '\n'; el.innerHTML = html; await sleep(72 + Math.random() * 30); } // same pace under reduced motion
  if (!skip) {
    $('#bootDay').classList.add('is-on');
    const t0 = performance.now();
    while (!skip && performance.now() - t0 < 1000) await sleep(40);
  }
  removeEventListener('keydown', onSkip, true); removeEventListener('pointerdown', onSkip, true);
  bootEl.classList.add('is-done');
  booting = false;
}
async function welcome() {
  const free = root.classList.contains('is-free');
  const ls = [
    ['<b>SZVTECH Training Terminal</b> <span class="dim">[Version 1.0.2026]</span>'],
    ['<span class="dim">(c) SZVTECH. Nothing you type here can break anything. Promise.</span>'],
    [''],
    [`<span class="dim">line of the day \u00B7</span> <span class="grad">${esc(LINE_OF_DAY)}</span>`],
    [''],
  ];
  if (S.goal && S.goal.text) {
    ls.push([`<span class="c3">Your goal is still here:</span> <b>${esc(S.goal.text)}</b>`]);
    ls.push(['<span class="mut">Did you move one step closer today?</span>']);
    ls.push(['']);
  }
  if (free) {
    ls.push(['Free play. No missions on screen, just you and the machine.']);
    ls.push([`Type ${k('help')} to see everything it understands. ${k('dir')} is a good first move.`]);
  } else if (RETURNING && S.done.length) {
    const nm = nextMission();
    ls.push([`Welcome back. <span class="ok">${S.done.length}/${MISSIONS.length}</span> missions done \u00B7 level <b>${esc(level().name)}</b>.`]);
    if (nm) ls.push([`Next up: <b>${esc(nm.title)}</b>. Type ${k('hint')} if you need a nudge.`]);
  } else {
    ls.push(['This is a pretend computer that understands real commands, Windows and Linux.']);
    ls.push([`Type a command and press Enter. Your first mission is ${MOBILE.matches ? 'right above the terminal' : 'on the right'}. Stuck? Type ${k('hint')}.`]);
  }
  ls.push(['']);
  for (const [h] of ls) { addLine(h); await sleep(45); }
}

async function start() {
  if (S.sound) $('#soundBtn').setAttribute('aria-pressed', 'true');
  renderPrompt(); renderInput();
  renderPanel();
  setPanel(false);
  sizeFx();
  bgInit();
  wire();
  await boot();
  await welcome();
  if (!TOUCH) input.focus({ preventScroll: true });
  save();
  try {
    const q = new URLSearchParams(location.search).get('cmd');
    if (q && q.length < 200) typeAndRun(q);
  } catch (e) { /* ignore */ }
}
start();
})();
