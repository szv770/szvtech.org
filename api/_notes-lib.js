// Shared code for the Notes tool: api/notes.js. Not an endpoint (leading underscore).
//
// Shared notes are PUBLIC-WRITE on purpose: anyone who has the link (a long random code) can read AND edit.
// That is the whole product ("the link is also the editor"), so the protection is: an unguessable id
// (24 base64url chars = 144 bits from crypto.randomBytes, generated here, never by the client), a size cap,
// per-IP rate limits (link_attempts table, same pattern as links/sync), strict validation, JSON only,
// no-store, nothing logged, and content is only ever stored and returned as data (never rendered here).
//
// Versioning: every save inserts a note_versions row and bumps notes.version in ONE atomic UPDATE that only
// matches when the caller's `base` equals the current head. A stale base -> 409 with the latest content.
// Only the last KEEP_VERSIONS versions are kept. Expiry renews on every save (except 'keep') and expired notes
// are deleted lazily (on read, and by a random purge on create).
//
// Tables are created lazily (see api/_schema.sql). Public, no PIN, so it builds its own db handle
// (dbFromEnv in _links-lib.js needs the links PIN). Reuses createDb/send/clientIp from there.
import crypto from 'node:crypto';
import { createDb, send, clientIp } from './_links-lib.js';

/* ------------------------------------------------------------------ constants */
export const MAX_CONTENT_BYTES = 200 * 1024;
export const MAX_TITLE = 120;
export const KEEP_VERSIONS = 50;
export const MAX_BODY = 640 * 1024;          // JSON escaping can inflate 200 KB of text; this bounds the raw body
export const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
export const LANGS = ['plain', 'json', 'markdown', 'javascript', 'typescript', 'html', 'css', 'python', 'shell', 'sql', 'yaml', 'xml', 'c', 'java', 'go', 'rust', 'php', 'ruby', 'diff', 'log'];
export const EXPIRIES = { '1d': 1, '7d': 7, '30d': 30, keep: null };
export const DEFAULT_EXPIRY = '30d';
export const LIMITS = {
  create: { max: 30, windowMin: 60 },        // new shared notes per IP per hour
  createAll: { max: 400, windowMin: 60 },    // new shared notes from anyone per hour
  save: { max: 120, windowMin: 10 },         // saves / settings / deletes per IP
  read: { max: 240, windowMin: 10 },         // opens, history views per IP
};
export const POLL_PER_MIN = 60;              // cheap version-number polls per IP, per server instance
export const FAIL_DELAY_MS = 300;
const DAY = 86400000;

/* ------------------------------------------------------------------ database */
const SCHEMA = [
  `create table if not exists notes (id text primary key, title text not null default '', lang text not null default 'plain', content text not null default '', version integer not null default 1, expiry text not null default '30d', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), expires_at timestamptz)`,
  'create index if not exists notes_expires on notes (expires_at)',
  `create table if not exists note_versions (id text not null, version integer not null, title text not null default '', lang text not null default 'plain', content text not null, created_at timestamptz not null default now(), primary key (id, version))`,
  'create table if not exists link_attempts (key text not null, at timestamptz not null default now())',
  'create index if not exists link_attempts_key_at on link_attempts (key, at)',
];
const ready = new WeakMap();
/** Create the tables once per db handle (lazy, like links). */
export function ensureNotes(db) {
  if (!ready.has(db)) ready.set(db, (async () => { for (const s of SCHEMA) await db.query(s); })().catch((e) => { ready.delete(db); throw e; }));
  return ready.get(db);
}

/** db handle from DATABASE_URL, or null. No PIN needed. `endpoint` / NEON_SQL_ENDPOINT is for local tests only. */
export function notesDbFromEnv(env = process.env, opts = {}) {
  const cs = env.DATABASE_URL;
  if (!cs) return null;
  let host;
  try {
    const u = new URL(cs);
    if (!/^postgres(ql)?:$/.test(u.protocol)) return null;
    host = u.hostname;
  } catch { return null; }
  if (!host) return null;
  return createDb({ connectionString: cs, endpoint: opts.endpoint || env.NEON_SQL_ENDPOINT || `https://${host}/sql`, fetch: opts.fetch });
}

/* ------------------------------------------------------------------ ids / expiry */
export const newId = (bytes = crypto.randomBytes) => bytes(18).toString('base64url'); // 24 chars, 144 bits
export function expiresAt(preset, now = Date.now()) {
  const d = EXPIRIES[preset];
  return d ? new Date(now + d * DAY).toISOString() : null;
}

/* ------------------------------------------------------------------ validation */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
const bad = (status, error, message) => ({ ok: false, status, error, message });
export const cleanTitle = (t) => (typeof t === 'string' ? t.replace(LONE_SURROGATE, '�').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE) : '');

/** Validate title / lang / content / expiry from a request body. */
export function validateNote(b, { expiryRequired = false } = {}) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return bad(400, 'bad_request', 'Bad request.');
  if (typeof b.content !== 'string') return bad(400, 'bad_content', 'A note needs some text.');
  if (b.title !== undefined && b.title !== null && typeof b.title !== 'string') return bad(400, 'bad_title', 'That title does not look right.');
  if (typeof b.title === 'string' && b.title.length > MAX_TITLE * 4) return bad(400, 'bad_title', `Titles can be ${MAX_TITLE} characters at most.`);
  let content = b.content.replace(/\r\n?/g, '\n');
  if (content.includes('\u0000')) return bad(400, 'bad_content', 'Notes have to be plain text (that looks like a binary file).');
  content = content.replace(LONE_SURROGATE, '�');
  if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT_BYTES) return bad(413, 'too_large', 'That note is too big to share (200 KB max).');
  let lang = 'plain';
  if (b.lang !== undefined && b.lang !== null) {
    if (typeof b.lang !== 'string' || !LANGS.includes(b.lang)) return bad(400, 'bad_lang', 'Unknown language.');
    lang = b.lang;
  }
  let expiry = DEFAULT_EXPIRY;
  if (b.expiry !== undefined && b.expiry !== null) {
    if (typeof b.expiry !== 'string' || !Object.prototype.hasOwnProperty.call(EXPIRIES, b.expiry)) return bad(400, 'bad_expiry', 'That expiry is not valid.');
    expiry = b.expiry;
  } else if (expiryRequired) return bad(400, 'bad_expiry', 'That expiry is not valid.');
  return { ok: true, note: { title: cleanTitle(b.title), lang, content, expiry } };
}

/* ------------------------------------------------------------------ rate limits */
const ipHash = (ip, kind) => `notes-${kind}:` + crypto.createHash('sha256').update('szv-notes|' + ip).digest('hex').slice(0, 32);

/** Count recent attempts for `key`; record one if allowed. Returns true when allowed. */
async function allow(db, key, { max, windowMin }) {
  const { rows } = await db.query(`select count(*) as n from link_attempts where key = $1 and at > now() - interval '${windowMin | 0} minutes'`, [key]);
  if ((Number(rows[0] && rows[0].n) || 0) >= max) return false;
  await db.query('insert into link_attempts (key) values ($1)', [key]);
  if (Math.random() < 0.05) await db.query(`delete from link_attempts where at < now() - interval '1 day'`).catch(() => {});
  return true;
}

// Version-number polls are many and tiny, so they are limited in memory (per server instance) instead of
// writing a database row each time. Not a hard guarantee across instances; the reads they trigger are limited in the DB.
const pollHits = new Map();
export function pollAllowed(ip, now = Date.now(), perMin = POLL_PER_MIN) {
  const minute = Math.floor(now / 60000);
  const e = pollHits.get(ip);
  if (!e || e.minute !== minute) {
    if (pollHits.size > 5000) pollHits.clear();
    pollHits.set(ip, { minute, n: 1 });
    return true;
  }
  return ++e.n <= perMin;
}

/* ------------------------------------------------------------------ http helpers */
function commonHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
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

const TS = (c) => `to_char(${c} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
const isTrue = (v) => v === true || v === 't' || v === 'true';
const publicNote = (r) => ({
  id: r.id, title: r.title || '', lang: r.lang || 'plain', content: r.content, version: Number(r.version), expiry: r.expiry || DEFAULT_EXPIRY,
  created_at: r.created_at || null, updated_at: r.updated_at || null, expires_at: r.expires_at || null,
});

/** Full head row, or null when missing / expired (expired rows are deleted on the spot). */
async function getNote(db, id) {
  const { rows } = await db.query(
    `select id, title, lang, content, version, expiry, ${TS('created_at')} as created_at, ${TS('updated_at')} as updated_at, ${TS('expires_at')} as expires_at, (expires_at is not null and expires_at <= now()) as expired from notes where id = $1`, [id]);
  const r = rows[0];
  if (!r) return null;
  if (isTrue(r.expired)) { await purgeOne(db, id).catch(() => {}); return null; }
  return r;
}
async function purgeOne(db, id) {
  await db.query('delete from note_versions where id = $1', [id]);
  await db.query('delete from notes where id = $1', [id]);
}
async function purgeExpired(db) {
  await db.query('delete from note_versions where id in (select id from notes where expires_at is not null and expires_at <= now())');
  await db.query('delete from notes where expires_at is not null and expires_at <= now()');
}

const NOT_FOUND = { error: 'not_found', message: 'This note has expired or never existed. Check the link.' };

/* ------------------------------------------------------------------ /api/notes */
//   GET  /api/notes?id=ID                -> 200 note {id,title,lang,content,version,expiry,expires_at,...} | 404
//   GET  /api/notes?id=ID&head=1         -> 200 {version, expires_at}           (cheap poll)
//   GET  /api/notes?id=ID&versions=1     -> 200 {versions:[{version,title,lang,size,created_at}]}   newest first
//   GET  /api/notes?id=ID&v=N            -> 200 one old version with content
//   POST {op:'create', title,lang,content,expiry}          -> 201 {id,version:1,expires_at}
//   POST {op:'save', id, base, title,lang,content,expiry}  -> 200 {version,...} | 409 {error:'conflict', latest}
//   POST {op:'settings', id, expiry}                       -> 200 {version, expiry, expires_at}  (no new version)
//   POST {op:'delete', id}                                 -> 200 {deleted:true}
export async function handleNotes(req, res, deps = {}) {
  commonHeaders(res);
  const env = deps.env || process.env;
  const db = deps.db !== undefined ? deps.db : notesDbFromEnv(env);
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const method = req.method || 'GET';
  const limited = async (win) => { res.setHeader('Retry-After', String(win * 60)); await sleep(FAIL_DELAY_MS); return send(res, 429, { error: 'rate_limited', message: 'Slow down a little, then try again in a few minutes.', retryAfter: win * 60 }); };
  try {
    if (!db) return send(res, 503, { configured: false, error: 'not_configured', message: 'Sharing notes is not set up yet. Your notes still work on this device.' });
    if (!['GET', 'POST'].includes(method)) { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'method' }); }
    const origin = req.headers.origin;
    if (origin) { // same-origin only, no CORS
      let oh = ''; try { oh = new URL(origin).host; } catch { /* bad */ }
      if (oh !== req.headers.host) return send(res, 403, { error: 'forbidden' });
    }
    const ip = clientIp(req);
    const now = deps.now ? deps.now() : Date.now();

    /* ---------- reads ---------- */
    if (method === 'GET') {
      const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
      const id = typeof q.id === 'string' ? q.id : '';
      if (!ID_RE.test(id)) return send(res, 400, { error: 'bad_request', message: 'That does not look like a note link.' });
      if (q.head === '1') { // cheap poll: one tiny query, limited in memory
        if (!(deps.pollAllowed || pollAllowed)(ip, now)) return limited(1);
        await ensureNotes(db);
        const { rows } = await db.query(`select version, ${TS('expires_at')} as expires_at, (expires_at is not null and expires_at <= now()) as expired from notes where id = $1`, [id]);
        const r = rows[0];
        if (!r || isTrue(r.expired)) return send(res, 404, NOT_FOUND);
        return send(res, 200, { version: Number(r.version), expires_at: r.expires_at || null });
      }
      await ensureNotes(db);
      if (!(await allow(db, ipHash(ip, 'read'), LIMITS.read))) return limited(LIMITS.read.windowMin);
      const note = await getNote(db, id);
      if (!note) { await sleep(FAIL_DELAY_MS); return send(res, 404, NOT_FOUND); }
      if (q.versions === '1') {
        const { rows } = await db.query(`select version, title, lang, octet_length(content) as size, ${TS('created_at')} as created_at from note_versions where id = $1 order by version desc limit ${KEEP_VERSIONS}`, [id]);
        return send(res, 200, { id, head: Number(note.version), versions: rows.map((r) => ({ version: Number(r.version), title: r.title || '', lang: r.lang || 'plain', size: Number(r.size) || 0, created_at: r.created_at || null })) });
      }
      if (q.v !== undefined) {
        const v = /^\d{1,9}$/.test(String(q.v)) ? Number(q.v) : 0;
        if (!v) return send(res, 400, { error: 'bad_request', message: 'Bad version.' });
        const { rows } = await db.query(`select version, title, lang, content, ${TS('created_at')} as created_at from note_versions where id = $1 and version = $2`, [id, v]);
        const r = rows[0];
        if (!r) return send(res, 404, { error: 'no_version', message: 'That version is gone (only the last 50 are kept).' });
        return send(res, 200, { id, head: Number(note.version), version: Number(r.version), title: r.title || '', lang: r.lang || 'plain', content: r.content, created_at: r.created_at || null });
      }
      return send(res, 200, publicNote(note));
    }

    /* ---------- writes ---------- */
    const ct = String(req.headers['content-type'] || '').toLowerCase();
    if (!ct.startsWith('application/json')) return send(res, 415, { error: 'bad_request', message: 'JSON only.' });
    const b = await readJson(req);
    if (b.error) return send(res, b.error, b.error === 413 ? { error: 'too_large', message: 'That note is too big to share (200 KB max).' } : { error: 'bad_request', message: 'Bad request.' });
    const body = b.value;
    const op = body.op;

    if (op === 'create') {
      const v = validateNote(body);
      if (!v.ok) return send(res, v.status, { error: v.error, message: v.message });
      await ensureNotes(db);
      if (!(await allow(db, ipHash(ip, 'new'), LIMITS.create)) || !(await allow(db, 'notes-new:global', LIMITS.createAll))) return limited(LIMITS.create.windowMin);
      if ((deps.random || Math.random)() < 0.1) await purgeExpired(db).catch(() => {});
      const { title, lang, content, expiry } = v.note;
      const exp = expiresAt(expiry, now);
      for (let i = 0; i < 4; i++) {
        const id = (deps.newId || newId)();
        const r = await db.query(
          `insert into notes (id, title, lang, content, version, expiry, expires_at) values ($1, $2, $3, $4, 1, $5, $6::timestamptz) on conflict (id) do nothing returning id, ${TS('updated_at')} as updated_at, ${TS('expires_at')} as expires_at`,
          [id, title, lang, content, expiry, exp]);
        if (!r.rows.length) continue;
        await db.query('insert into note_versions (id, version, title, lang, content) values ($1, 1, $2, $3, $4) on conflict do nothing', [id, title, lang, content]);
        return send(res, 201, { id, version: 1, expiry, expires_at: r.rows[0].expires_at || null, updated_at: r.rows[0].updated_at || null });
      }
      return send(res, 503, { error: 'busy', message: 'Could not make a link. Try again.' });
    }

    if (op === 'save' || op === 'settings' || op === 'delete') {
      const id = typeof body.id === 'string' ? body.id : '';
      if (!ID_RE.test(id)) return send(res, 400, { error: 'bad_request', message: 'That does not look like a note link.' });
      let v = null;
      if (op === 'save') {
        v = validateNote(body, { expiryRequired: true });
        if (!v.ok) return send(res, v.status, { error: v.error, message: v.message });
        if (!Number.isInteger(body.base) || body.base < 1 || body.base > 1e9) return send(res, 400, { error: 'bad_base', message: 'Missing version number.' });
      } else if (op === 'settings' && !(typeof body.expiry === 'string' && Object.prototype.hasOwnProperty.call(EXPIRIES, body.expiry))) {
        return send(res, 400, { error: 'bad_expiry', message: 'That expiry is not valid.' });
      }
      await ensureNotes(db);
      if (!(await allow(db, ipHash(ip, 'save'), LIMITS.save))) return limited(LIMITS.save.windowMin);

      if (op === 'delete') {
        const had = await getNote(db, id);
        if (!had) return send(res, 404, NOT_FOUND);
        await purgeOne(db, id);
        return send(res, 200, { deleted: true });
      }
      if (op === 'settings') {
        const r = await db.query(
          `update notes set expiry = $2, expires_at = $3::timestamptz where id = $1 and (expires_at is null or expires_at > now()) returning version, expiry, ${TS('expires_at')} as expires_at`,
          [id, body.expiry, expiresAt(body.expiry, now)]);
        if (!r.rows.length) return send(res, 404, NOT_FOUND);
        return send(res, 200, { version: Number(r.rows[0].version), expiry: r.rows[0].expiry, expires_at: r.rows[0].expires_at || null });
      }
      // save: one atomic statement that only matches when `base` is still the head
      const { title, lang, content, expiry } = v.note;
      const r = await db.query(
        `update notes set title = $2, lang = $3, content = $4, expiry = $5, version = version + 1, updated_at = now(), expires_at = $6::timestamptz where id = $1 and version = $7 and (expires_at is null or expires_at > now()) returning version, ${TS('updated_at')} as updated_at, ${TS('expires_at')} as expires_at`,
        [id, title, lang, content, expiry, expiresAt(expiry, now), body.base]);
      if (!r.rows.length) {
        const head = await getNote(db, id);
        if (!head) return send(res, 404, NOT_FOUND);
        return send(res, 409, { error: 'conflict', message: 'Someone saved since you opened this.', latest: publicNote(head) });
      }
      const nv = Number(r.rows[0].version);
      await db.query('insert into note_versions (id, version, title, lang, content) values ($1, $2, $3, $4, $5) on conflict do nothing', [id, nv, title, lang, content]);
      if (nv > KEEP_VERSIONS) await db.query('delete from note_versions where id = $1 and version <= $2', [id, nv - KEEP_VERSIONS]);
      return send(res, 200, { version: nv, expiry, expires_at: r.rows[0].expires_at || null, updated_at: r.rows[0].updated_at || null });
    }
    return send(res, 400, { error: 'bad_request', message: 'Bad request.' });
  } catch {
    return send(res, 503, { error: 'unavailable', message: 'Could not reach the database. Try again in a moment.' });
  }
}
