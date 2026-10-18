// Shared code for the short-links tool: api/links.js (owner only) and api/go.js (public redirect).
// Not an endpoint (leading underscore). No dependencies; talks to Neon Postgres over its
// serverless HTTP SQL endpoint with global fetch. Every query is parameterized.
import crypto from 'node:crypto';

/* ------------------------------------------------------------------ constants */
export const CODE_RE = /^[A-Za-z0-9_-]{1,40}$/;
export const CUSTOM_CODE_RE = /^[A-Za-z0-9_-]{3,40}$/;
export const RESERVED = new Set(['admin', 'api', 'index', 'index.html', 'url', 'urls', 'link', 'links', 'new', 'login', 'logout', 'sys', 'assets', 'static', 'robots.txt', 'favicon.ico', 'www', 'szvtech', 'null', 'undefined']);
export const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0 O o 1 l I i
export const MAX_URL = 2048;
export const MAX_BODY = 8 * 1024;
export const MAX_NOTE = 200;
export const MAX_FAILS_IP = 5;       // wrong PINs per IP per window
export const MAX_FAILS_GLOBAL = 40;  // wrong PINs from anyone per window
export const WINDOW_MIN = 15;
export const FAIL_DELAY_MS = 700;
const DB_TIMEOUT_MS = 8000;

/* ------------------------------------------------------------------ URL validation */
const HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/;
const BAD_TLDS = new Set(['local', 'localhost', 'internal', 'lan', 'home', 'corp', 'intranet', 'private', 'test', 'invalid', 'example', 'arpa']);
const SELF = /(^|\.)szvtech\.org$/;

/** @returns {{ok:true,url:string}|{ok:false,error:string}} */
export function validateUrl(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'Paste a link first.' };
  let s = raw.trim();
  if (!s) return { ok: false, error: 'Paste a link first.' };
  if (s.length > MAX_URL) return { ok: false, error: 'That link is too long (2048 characters max).' };
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(s)) return { ok: false, error: 'Links cannot contain spaces or hidden characters.' };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    // "example.com/x" -> https://example.com/x ; "javascript:..." / "mailto:..." -> rejected
    if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(s) || s.startsWith('//')) return { ok: false, error: 'Only web links (https://) work here.' };
    s = 'https://' + s;
  }
  let u;
  try { u = new URL(s); } catch { return { ok: false, error: 'That does not look like a web link.' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, error: 'Only web links (https://) work here.' };
  if (u.username || u.password) return { ok: false, error: 'Links with a username or password are not allowed.' };
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host.startsWith('[') || /^[0-9.]+$/.test(host) || host.includes(':')) return { ok: false, error: 'Use a real website name, not a raw address.' };
  if (!HOST_RE.test(host) || BAD_TLDS.has(host.split('.').pop())) return { ok: false, error: 'That website name does not look real.' };
  if (SELF.test(host)) return { ok: false, error: 'That already points at szvtech.org, no need to shorten it.' };
  u.hostname = host;
  const href = u.href;
  if (href.length > MAX_URL) return { ok: false, error: 'That link is too long (2048 characters max).' };
  return { ok: true, url: href };
}

/* ------------------------------------------------------------------ codes */
export function randomCode(len = 6, randomInt = crypto.randomInt) {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
export const isReserved = (code) => RESERVED.has(String(code).toLowerCase());
/** @returns {{ok:true,code:string}|{ok:false,error:string}} */
export function validateCustomCode(code) {
  if (typeof code !== 'string' || !CUSTOM_CODE_RE.test(code)) return { ok: false, error: 'Custom endings use 3 to 40 letters, numbers, - or _.' };
  if (isReserved(code)) return { ok: false, error: 'That ending is reserved. Try another.' };
  return { ok: true, code };
}

/* ------------------------------------------------------------------ expiry / note */
/** @returns {{ok:true,at:string|null}|{ok:false,error:string}} at = ISO string or null */
export function parseExpiry(v, now = Date.now()) {
  if (v === undefined || v === null || v === '' || v === 'never') return { ok: true, at: null };
  const DAY = 86400000;
  const presets = { '1d': 1, '7d': 7, '30d': 30 };
  if (typeof v === 'string' && Object.prototype.hasOwnProperty.call(presets, v)) return { ok: true, at: new Date(now + presets[v] * DAY).toISOString() };
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/.test(v)) {
    let t = Date.parse(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) t = Date.parse(v + 'T23:59:59Z'); // a plain date = end of that day
    if (!Number.isFinite(t)) return { ok: false, error: 'That date does not look right.' };
    if (t <= now) return { ok: false, error: 'Pick a date in the future.' };
    if (t > now + 3660 * DAY) return { ok: false, error: 'Pick a date within 10 years.' };
    return { ok: true, at: new Date(t).toISOString() };
  }
  return { ok: false, error: 'That expiry is not valid.' };
}
export function cleanNote(v) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_NOTE);
  return s || null;
}

/* ------------------------------------------------------------------ PIN */
const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest();
/** Constant-time PIN check against SZV_LINK_PIN or SZV_LINK_PIN_SHA256 (hex). */
export function pinMatches(input, env) {
  if (typeof input !== 'string' || !input || input.length > 200) return false;
  const given = sha256(input);
  let want = null;
  const hex = env && env.SZV_LINK_PIN_SHA256;
  if (hex && /^[0-9a-f]{64}$/i.test(hex.trim())) want = Buffer.from(hex.trim(), 'hex');
  else if (env && env.SZV_LINK_PIN) want = sha256(env.SZV_LINK_PIN);
  if (!want) return false;
  return crypto.timingSafeEqual(given, want);
}
export const pinConfigured = (env) => !!(env && (env.SZV_LINK_PIN || (env.SZV_LINK_PIN_SHA256 && /^[0-9a-f]{64}$/i.test(env.SZV_LINK_PIN_SHA256.trim()))));
export const ipKey = (ip) => 'ip:' + crypto.createHash('sha256').update('szv-links|' + ip).digest('hex').slice(0, 32);

/* ------------------------------------------------------------------ database (Neon HTTP SQL) */
const SCHEMA = [
  'create table if not exists links (code text primary key, url text not null, created_at timestamptz default now(), hits bigint default 0, last_hit timestamptz, expires_at timestamptz, note text)',
  'create table if not exists link_attempts (key text not null, at timestamptz not null default now())',
  'create index if not exists link_attempts_key_at on link_attempts (key, at)',
];

/**
 * Build a db handle from the environment, or null when not configured.
 * `endpoint` (arg or NEON_SQL_ENDPOINT env) is for local tests only.
 */
export function dbFromEnv(env = process.env, opts = {}) {
  const cs = env.DATABASE_URL;
  if (!cs || !pinConfigured(env)) return null;
  let host;
  try {
    const u = new URL(cs);
    if (!/^postgres(ql)?:$/.test(u.protocol)) return null;
    host = u.hostname;
  } catch { return null; }
  if (!host) return null;
  return createDb({ connectionString: cs, endpoint: opts.endpoint || env.NEON_SQL_ENDPOINT || `https://${host}/sql`, fetch: opts.fetch });
}

export class DbError extends Error {}

export function createDb({ connectionString, endpoint, fetch: fetchImpl }) {
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  let ready = null;
  async function query(text, params = []) {
    let res;
    try {
      res = await doFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': connectionString, 'Neon-Raw-Text-Output': 'true', 'Neon-Array-Mode': 'false' },
        body: JSON.stringify({ query: text, params }),
        signal: AbortSignal.timeout(DB_TIMEOUT_MS),
      });
    } catch { throw new DbError('db unreachable'); }
    let data = null;
    try { data = await res.json(); } catch { /* handled below */ }
    if (!res.ok || !data) throw new DbError('db error ' + res.status + (data && data.code ? ' ' + data.code : ''));
    let rows = Array.isArray(data.rows) ? data.rows : [];
    if (rows.length && Array.isArray(rows[0]) && Array.isArray(data.fields)) {
      const names = data.fields.map((f) => f.name);
      rows = rows.map((r) => Object.fromEntries(names.map((n, i) => [n, r[i]])));
    }
    return { rows, rowCount: typeof data.rowCount === 'number' ? data.rowCount : rows.length };
  }
  function ensure() {
    if (!ready) ready = (async () => { for (const s of SCHEMA) await query(s); })().catch((e) => { ready = null; throw e; });
    return ready;
  }
  return { query, ensure };
}

/* ------------------------------------------------------------------ small helpers */
const bool = (v) => v === true || v === 't' || v === 'true';
export function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}
function commonHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}
export function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || String(req.headers['x-real-ip'] || '') || (req.socket && req.socket.remoteAddress) || 'unknown';
}
async function readJson(req) {
  const len = Number(req.headers['content-length'] || 0);
  if (len > MAX_BODY) return { error: 413 };
  let raw;
  if (req.body !== undefined && req.body !== null) { // Vercel already parsed it
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return JSON.stringify(req.body).length > MAX_BODY ? { error: 413 } : { value: req.body };
    raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
    if (raw.length > MAX_BODY) return { error: 413 };
  } else {
    const chunks = []; let n = 0;
    try {
      for await (const c of req) { n += c.length; if (n > MAX_BODY) return { error: 413 }; chunks.push(c); }
    } catch { return { error: 400 }; }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? { value: v } : { error: 400 };
  } catch { return { error: 400 }; }
}

/* ------------------------------------------------------------------ PIN gate with persistent throttling */
/**
 * @returns {Promise<{ok:true}|{ok:false,status:number,body:object}>}
 * Failed tries are stored in link_attempts so limits survive serverless cold starts.
 */
export async function checkPin(db, env, pin, ip, deps = {}) {
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const wrong = { ok: false, status: 401, body: { error: 'wrong_pin', message: 'That PIN is not right.' } };
  if (typeof pin !== 'string' || !pin) return wrong; // nothing to guess, nothing recorded
  const key = ipKey(ip);
  const { rows } = await db.query(
    `select (select count(*) from link_attempts where key = $1 and at > now() - interval '${WINDOW_MIN} minutes') as ipn,
            (select count(*) from link_attempts where key = 'global' and at > now() - interval '${WINDOW_MIN} minutes') as gn`, [key]);
  const ipn = Number(rows[0] && rows[0].ipn) || 0, gn = Number(rows[0] && rows[0].gn) || 0;
  if (ipn >= MAX_FAILS_IP || gn >= MAX_FAILS_GLOBAL) {
    await sleep(FAIL_DELAY_MS);
    return { ok: false, status: 429, body: { error: 'locked', message: 'Too many wrong tries. Take a break and try again in about 15 minutes.', retryAfter: WINDOW_MIN * 60 } };
  }
  if (pinMatches(pin, env)) return { ok: true };
  await db.query('insert into link_attempts (key) values ($1), ($2)', [key, 'global']);
  if (Math.random() < 0.05) await db.query(`delete from link_attempts where at < now() - interval '1 day'`).catch(() => {});
  await sleep(FAIL_DELAY_MS);
  return wrong;
}

/* ------------------------------------------------------------------ create / list / delete */
export async function createLink(db, input, deps = {}) {
  const now = deps.now ? deps.now() : Date.now();
  const v = validateUrl(input.url);
  if (!v.ok) return { status: 400, body: { error: 'bad_url', message: v.error } };
  const ex = parseExpiry(input.expires, now);
  if (!ex.ok) return { status: 400, body: { error: 'bad_expiry', message: ex.error } };
  const note = cleanNote(input.note);
  const custom = input.code !== undefined && input.code !== null && input.code !== '';
  const insert = 'insert into links (code, url, expires_at, note) values ($1, $2, $3::timestamptz, $4) on conflict (code) do nothing returning code';
  if (custom) {
    const c = validateCustomCode(input.code);
    if (!c.ok) return { status: 400, body: { error: 'bad_code', message: c.error } };
    const r = await db.query(insert, [c.code, v.url, ex.at, note]);
    if (!r.rows.length) return { status: 409, body: { error: 'taken', message: 'That ending is already taken. Try another.' } };
    return { status: 201, body: { code: c.code, path: '/url/' + c.code, url: v.url, expires_at: ex.at } };
  }
  const gen = deps.randomCode || randomCode;
  for (let i = 0; i < 8; i++) {
    const code = gen(i < 5 ? 6 : 7);
    if (isReserved(code)) continue;
    const r = await db.query(insert, [code, v.url, ex.at, note]);
    if (r.rows.length) return { status: 201, body: { code, path: '/url/' + code, url: v.url, expires_at: ex.at } };
  }
  return { status: 503, body: { error: 'busy', message: 'Could not find a free code. Try again.' } };
}

export async function listLinks(db) {
  const ts = (c) => `to_char(${c} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
  const { rows } = await db.query(
    `select code, url, note, hits, ${ts('created_at')} as created_at, ${ts('last_hit')} as last_hit, ${ts('expires_at')} as expires_at,
            (expires_at is not null and expires_at <= now()) as expired
       from links order by created_at desc limit 500`);
  return rows.map((r) => ({ code: r.code, url: r.url, note: r.note || null, hits: Number(r.hits) || 0, created_at: r.created_at || null, last_hit: r.last_hit || null, expires_at: r.expires_at || null, expired: bool(r.expired) }));
}

/* ------------------------------------------------------------------ /api/links */
export async function handleLinks(req, res, deps = {}) {
  commonHeaders(res);
  const env = deps.env || process.env;
  const db = deps.db !== undefined ? deps.db : dbFromEnv(env);
  const method = req.method || 'GET';
  try {
    if (!db) return send(res, 503, { configured: false, error: 'not_configured', message: 'Short links are not set up yet.' });
    if (!['GET', 'POST', 'DELETE'].includes(method)) { res.setHeader('Allow', 'GET, POST, DELETE'); return send(res, 405, { error: 'method' }); }
    const origin = req.headers.origin;
    if (origin) { // same-origin only, no CORS
      let oh = ''; try { oh = new URL(origin).host; } catch { /* bad */ }
      if (oh !== req.headers.host) return send(res, 403, { error: 'forbidden' });
    }
    let pin, body;
    if (method === 'POST') {
      const b = await readJson(req);
      if (b.error) return send(res, b.error, { error: b.error === 413 ? 'too_large' : 'bad_request', message: b.error === 413 ? 'Request too large.' : 'Bad request.' });
      body = b.value; pin = typeof body.pin === 'string' ? body.pin : '';
    } else {
      const h = req.headers['x-szv-pin']; pin = Array.isArray(h) ? h[0] : h || '';
    }
    if (method === 'GET' && !pin) return send(res, 200, { configured: true, locked: true }); // status probe, nothing to check
    await db.ensure();
    const auth = await checkPin(db, env, pin, clientIp(req), deps);
    if (!auth.ok) {
      if (auth.status === 429) res.setHeader('Retry-After', String(WINDOW_MIN * 60));
      return send(res, auth.status, auth.body);
    }
    if (method === 'GET') return send(res, 200, { configured: true, links: await listLinks(db) });
    if (method === 'POST') {
      const r = await createLink(db, body, deps);
      return send(res, r.status, r.body);
    }
    // DELETE ?code=
    const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    const code = String(q.code || '');
    if (!CODE_RE.test(code)) return send(res, 400, { error: 'bad_code', message: 'Bad code.' });
    const r = await db.query('delete from links where code = $1 returning code', [code]);
    return send(res, r.rows.length ? 200 : 404, r.rows.length ? { deleted: code } : { error: 'not_found', message: 'That link is already gone.' });
  } catch {
    return send(res, 503, { error: 'unavailable', message: 'Could not reach the database. Try again in a moment.' });
  }
}

/* ------------------------------------------------------------------ /url/<code> redirect */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function notFoundPage(title, line) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex, nofollow"><title>${esc(title)} · SZVTECH</title><meta name="theme-color" content="#05050a"><meta name="color-scheme" content="dark"><script src="/assets/theme.js"></script>
<style>:root{--a1:#8b5cf6;--a2:#22d3ee;--a3:#e879f9;--grad:linear-gradient(100deg,var(--a1),var(--a3) 45%,var(--a2))}*{box-sizing:border-box;margin:0}html{background:#05050a}body{min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:24px max(20px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-left));color:#f3f1ff;font:400 16px/1.5 Inter,system-ui,sans-serif;text-align:center;background:radial-gradient(70% 50% at 50% 0,color-mix(in srgb,var(--a1) 20%,transparent),transparent 70%),#05050a}h1{font:700 clamp(44px,14vw,84px)/1 Syne,Inter,system-ui,sans-serif;letter-spacing:-.035em;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:14px}p{color:rgba(226,224,255,.6);max-width:30ch;margin:0 auto 26px}a{display:inline-flex;align-items:center;min-height:48px;padding:0 22px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#f3f1ff;text-decoration:none;font:600 13px 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.06em;-webkit-tap-highlight-color:transparent}</style></head>
<body><main><h1>${esc(title)}</h1><p>${esc(line)}</p><a href="/">&larr; SZVTECH</a></main></body></html>`;
}
function page(res, status, title, line) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(notFoundPage(title, line));
}

export async function handleGo(req, res, deps = {}) {
  commonHeaders(res);
  const env = deps.env || process.env;
  const db = deps.db !== undefined ? deps.db : dbFromEnv(env);
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const code = typeof q.c === 'string' ? q.c : '';
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return page(res, 405, 'Nope', 'This link only opens in a browser.'); }
  if (!db || !CODE_RE.test(code)) return page(res, 404, '404', 'This short link does not lead anywhere. It may have been mistyped.');
  try {
    await db.ensure();
    // look up AND count the visit in one round trip
    const r = await db.query('update links set hits = hits + 1, last_hit = now() where code = $1 and (expires_at is null or expires_at > now()) returning url', [code]);
    const row = r.rows[0];
    const v = row ? validateUrl(row.url) : null;
    if (!v || !v.ok) return page(res, 404, '404', 'This short link has expired or never existed.');
    res.statusCode = 302;
    res.setHeader('Location', v.url);
    res.end();
  } catch {
    page(res, 503, 'Hiccup', 'Something went wrong on our side. Try again in a moment.');
  }
}
