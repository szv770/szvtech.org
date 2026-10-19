// Tests for api/_notes-lib.js + api/notes.js. Run:  node api/_notes.test.mjs
// Uses its own tiny fake Neon (the shared _fake-neon.mjs only knows the links statements).
// Dev server for browser tests:  node api/_notes.test.mjs --serve 8797   (fake neon + /api/notes handler)
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import * as N from './_notes-lib.js';
import notesHandler from './notes.js';

export default function notAFunction(req, res) { res.statusCode = 404; res.end('Not found'); }

/* ---------------------------------------------------------------- fake neon for notes statements */
export function startFakeNotesNeon(port = 0) {
  const state = { notes: new Map(), versions: [], attempts: [], queries: [], skew: 0, fail: false };
  const now = () => Date.now() + state.skew;
  const iso = (t) => (t ? new Date(t).toISOString().replace(/\.\d+Z$/, 'Z') : null);
  const expired = (n) => !!(n.expires_at && n.expires_at <= now());
  function run(q, p) {
    const s = q.replace(/\s+/g, ' ').trim();
    let m;
    if (/^create (table|index)/i.test(s)) return { rows: [] };
    if ((m = /^select count\(\*\) as n from link_attempts where key = \$1 and at > now\(\) - interval '(\d+) minutes'$/i.exec(s))) {
      const cut = now() - +m[1] * 60000;
      return { rows: [{ n: String(state.attempts.filter((a) => a.key === p[0] && a.at > cut).length) }] };
    }
    if (/^insert into link_attempts/i.test(s)) { state.attempts.push({ key: p[0], at: now() }); return { rows: [] }; }
    if (/^delete from link_attempts/i.test(s)) return { rows: [] };

    if (/^insert into notes /i.test(s)) {
      if (state.notes.has(p[0])) return { rows: [] };
      const n = { id: p[0], title: p[1], lang: p[2], content: p[3], version: 1, expiry: p[4], created_at: now(), updated_at: now(), expires_at: p[5] ? Date.parse(p[5]) : null };
      state.notes.set(p[0], n);
      return { rows: [{ id: n.id, updated_at: iso(n.updated_at), expires_at: iso(n.expires_at) }] };
    }
    if (/^insert into note_versions/i.test(s)) {
      const create = /values \(\$1, 1,/.test(s);
      const row = create ? { id: p[0], version: 1, title: p[1], lang: p[2], content: p[3] } : { id: p[0], version: +p[1], title: p[2], lang: p[3], content: p[4] };
      if (state.versions.some((v) => v.id === row.id && v.version === row.version)) return { rows: [] };
      state.versions.push({ ...row, created_at: now() });
      return { rows: [] };
    }
    if (/^select id, title, lang, content, version, expiry/i.test(s)) {
      const n = state.notes.get(p[0]);
      if (!n) return { rows: [] };
      return { rows: [{ id: n.id, title: n.title, lang: n.lang, content: n.content, version: String(n.version), expiry: n.expiry, created_at: iso(n.created_at), updated_at: iso(n.updated_at), expires_at: iso(n.expires_at), expired: expired(n) ? 't' : 'f' }] };
    }
    if (/^select version, to_char\(expires_at/i.test(s)) {
      const n = state.notes.get(p[0]);
      return { rows: n ? [{ version: String(n.version), expires_at: iso(n.expires_at), expired: expired(n) ? 't' : 'f' }] : [] };
    }
    if (/^select version, title, lang, octet_length/i.test(s)) {
      const lim = +/limit (\d+)$/.exec(s)[1];
      return { rows: state.versions.filter((v) => v.id === p[0]).sort((a, b) => b.version - a.version).slice(0, lim).map((v) => ({ version: String(v.version), title: v.title, lang: v.lang, size: String(Buffer.byteLength(v.content)), created_at: iso(v.created_at) })) };
    }
    if (/^select version, title, lang, content/i.test(s)) {
      const v = state.versions.find((x) => x.id === p[0] && x.version === +p[1]);
      return { rows: v ? [{ version: String(v.version), title: v.title, lang: v.lang, content: v.content, created_at: iso(v.created_at) }] : [] };
    }
    if (/^update notes set title = \$2/i.test(s)) { // save, atomic compare-and-set on version
      const n = state.notes.get(p[0]);
      if (!n || n.version !== +p[6] || expired(n)) return { rows: [] };
      Object.assign(n, { title: p[1], lang: p[2], content: p[3], expiry: p[4], version: n.version + 1, updated_at: now(), expires_at: p[5] ? Date.parse(p[5]) : null });
      return { rows: [{ version: String(n.version), updated_at: iso(n.updated_at), expires_at: iso(n.expires_at) }] };
    }
    if (/^update notes set expiry = \$2/i.test(s)) {
      const n = state.notes.get(p[0]);
      if (!n || expired(n)) return { rows: [] };
      n.expiry = p[1]; n.expires_at = p[2] ? Date.parse(p[2]) : null;
      return { rows: [{ version: String(n.version), expiry: n.expiry, expires_at: iso(n.expires_at) }] };
    }
    if (/^delete from note_versions where id = \$1 and version <= \$2$/i.test(s)) { state.versions = state.versions.filter((v) => !(v.id === p[0] && v.version <= +p[1])); return { rows: [] }; }
    if (/^delete from note_versions where id = \$1$/i.test(s)) { state.versions = state.versions.filter((v) => v.id !== p[0]); return { rows: [] }; }
    if (/^delete from note_versions where id in \(select id from notes where expires_at/i.test(s)) {
      const dead = new Set([...state.notes.values()].filter(expired).map((n) => n.id));
      state.versions = state.versions.filter((v) => !dead.has(v.id));
      return { rows: [] };
    }
    if (/^delete from notes where id = \$1$/i.test(s)) { state.notes.delete(p[0]); return { rows: [] }; }
    if (/^delete from notes where expires_at/i.test(s)) { for (const [k, n] of state.notes) if (expired(n)) state.notes.delete(k); return { rows: [] }; }
    throw Object.assign(new Error('fake neon: unsupported query ' + s.slice(0, 80)), { code: '42601' });
  }
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        if (req.method !== 'POST' || req.url !== '/sql') { res.statusCode = 404; return res.end('{"message":"no"}'); }
        if (!req.headers['neon-connection-string']) { res.statusCode = 400; return res.end('{"message":"missing connection string"}'); }
        if (state.fail) { res.statusCode = 500; return res.end('{"message":"boom secret detail"}'); }
        const { query, params } = JSON.parse(body);
        state.queries.push({ query, params });
        const r = run(query, params);
        res.end(JSON.stringify({ command: 'SELECT', rowCount: r.rows.length, rows: r.rows, fields: [], rowAsArray: false }));
      } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ message: e.message, code: e.code || '42000' })); }
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ state, server, port: server.address().port, close: () => new Promise((r) => server.close(r)) })));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--serve') {
    const f = await startFakeNotesNeon();
    process.env.DATABASE_URL = `postgresql://u:p@127.0.0.1:${f.port}/db`;
    process.env.NEON_SQL_ENDPOINT = `http://127.0.0.1:${f.port}/sql`;
    const port = +process.argv[3] || 8797;
    http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      req.query = Object.fromEntries(u.searchParams);
      if (u.pathname === '/api/notes') return N.handleNotes(req, res, { sleep: async () => {} });
      if (u.pathname === '/__skew') { f.state.skew += +u.searchParams.get('ms') || 0; res.end('ok'); return; }
      res.statusCode = 404; res.end();
    }).listen(port, '127.0.0.1', () => console.log('notes api + fake neon on', port));
  } else await runTests();
}

async function runTests() {
  let passes = 0, failures = 0;
  const check = (name, ok, detail) => { if (ok) { passes++; console.log('  ok  ', name); } else { failures++; console.log('  FAIL', name, detail === undefined ? '' : JSON.stringify(detail).slice(0, 300)); } };

  console.log('ids / validation');
  const ids = new Set();
  let idsOk = true;
  for (let i = 0; i < 300; i++) { const id = N.newId(); ids.add(id); if (!/^[A-Za-z0-9_-]{24}$/.test(id)) idsOk = false; }
  check('ids: 24 base64url chars, all unique', idsOk && ids.size === 300);
  check('ID_RE accepts good, rejects bad', N.ID_RE.test('a'.repeat(16)) && N.ID_RE.test(N.newId()) && !N.ID_RE.test('a'.repeat(15)) && !N.ID_RE.test('a'.repeat(65)) && !N.ID_RE.test('a'.repeat(15) + '/') && !N.ID_RE.test('a'.repeat(15) + '\n') && !N.ID_RE.test('../'.repeat(8)));
  check('expiresAt presets', N.expiresAt('1d', 0) === '1970-01-02T00:00:00.000Z' && N.expiresAt('7d', 0) === '1970-01-08T00:00:00.000Z' && N.expiresAt('30d', 0) === '1970-01-31T00:00:00.000Z' && N.expiresAt('keep', 0) === null);
  const ok = (b, o) => N.validateNote(b, o);
  check('valid note', ok({ content: 'hi', title: 'T', lang: 'json', expiry: '7d' }).ok);
  check('defaults', (() => { const r = ok({ content: '' }); return r.ok && r.note.lang === 'plain' && r.note.expiry === '30d' && r.note.title === ''; })());
  check('CRLF normalized', ok({ content: 'a\r\nb\rc' }).note.content === 'a\nb\nc');
  check('title cleaned + capped', ok({ content: 'x', title: '  a\n\tb  ' + 'z'.repeat(300) }).note.title.length === N.MAX_TITLE && ok({ content: 'x', title: ' a\nb ' }).note.title === 'a b');
  for (const [n, b] of Object.entries({
    'no content': {}, 'content number': { content: 5 }, 'content null byte': { content: 'a\u0000b' }, 'title object': { content: 'x', title: {} }, 'title huge': { content: 'x', title: 'a'.repeat(1000) },
    'lang unknown': { content: 'x', lang: 'cobol' }, 'lang object': { content: 'x', lang: {} }, 'lang proto': { content: 'x', lang: '__proto__' }, 'expiry unknown': { content: 'x', expiry: '1y' },
    'expiry proto': { content: 'x', expiry: 'constructor' }, 'expiry number': { content: 'x', expiry: 5 },
  })) check('rejects ' + n, !ok(b).ok, ok(b));
  check('expiry required for save', !ok({ content: 'x' }, { expiryRequired: true }).ok);
  check('size cap boundary', ok({ content: 'a'.repeat(N.MAX_CONTENT_BYTES) }).ok && ok({ content: 'a'.repeat(N.MAX_CONTENT_BYTES + 1) }).status === 413);
  check('size cap counts bytes not chars', ok({ content: 'é'.repeat(N.MAX_CONTENT_BYTES / 2 + 1) }).status === 413 && ok({ content: 'é'.repeat(N.MAX_CONTENT_BYTES / 2) }).ok);
  check('lone surrogate replaced', ok({ content: 'a\ud800b' }).note.content === 'a�b');
  check('notesDbFromEnv: null w/o url or non-postgres, no PIN needed', N.notesDbFromEnv({}) === null && N.notesDbFromEnv({ DATABASE_URL: 'https://x.y/z' }) === null && !!N.notesDbFromEnv({ DATABASE_URL: 'postgresql://u:p@h.neon.tech/db' }));
  check('pollAllowed limits per minute per ip', (() => { const t = 5 * 60000; let a = 0; for (let i = 0; i < 70; i++) if (N.pollAllowed('9.9.9.9', t)) a++; return a === N.POLL_PER_MIN && N.pollAllowed('9.9.9.9', t + 61000) && N.pollAllowed('8.8.8.8', t); })());

  const fake = await startFakeNotesNeon();
  const CONN = `postgresql://u:p@127.0.0.1:${fake.port}/db`;
  const db = N.notesDbFromEnv({ DATABASE_URL: CONN, NEON_SQL_ENDPOINT: `http://127.0.0.1:${fake.port}/sql` });

  const mkDeps = () => ({ db, sleep: async () => {}, pollAllowed: () => true, now: () => Date.now() + fake.state.skew });
  let ipOverride = null, deps = mkDeps();
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    req.query = Object.fromEntries(u.searchParams);
    if (ipOverride) req.headers['x-forwarded-for'] = ipOverride;
    if (u.pathname === '/api/notes') return N.handleNotes(req, res, deps);
    if (u.pathname === '/api/notes-prod') { process.env.DATABASE_URL = CONN; process.env.NEON_SQL_ENDPOINT = `http://127.0.0.1:${fake.port}/sql`; return notesHandler(req, res); }
    res.statusCode = 404; res.end();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (method, path, body, headers = {}) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    let j = null; try { j = await r.json(); } catch { /* none */ }
    return { status: r.status, j, h: r.headers };
  };
  const post = (b, h) => call('POST', '/api/notes', b, h);
  const get = (qs) => call('GET', '/api/notes?' + qs);
  const reset = () => { fake.state.notes.clear(); fake.state.versions.length = 0; fake.state.attempts.length = 0; fake.state.skew = 0; fake.state.fail = false; ipOverride = null; deps = mkDeps(); };

  console.log('create + read');
  let r = await post({ op: 'create', title: 'Hello', lang: 'json', content: '{"a":1}', expiry: '7d' });
  check('create 201 with long random id + v1', r.status === 201 && /^[A-Za-z0-9_-]{24}$/.test(r.j.id) && r.j.version === 1 && r.j.expiry === '7d', r);
  check('headers: no-store, nosniff, json', r.h.get('cache-control') === 'no-store' && r.h.get('x-content-type-options') === 'nosniff' && /^application\/json/.test(r.h.get('content-type')));
  const id1 = r.j.id;
  check('expiry ~7 days out', Math.abs(Date.parse(r.j.expires_at) - (Date.now() + 7 * 86400000)) < 5000, r.j);
  r = await get('id=' + id1);
  check('read returns the note', r.status === 200 && r.j.content === '{"a":1}' && r.j.title === 'Hello' && r.j.lang === 'json' && r.j.version === 1 && r.j.expiry === '7d', r.j);
  check('version 1 stored in history', fake.state.versions.length === 1 && fake.state.versions[0].version === 1);
  r = await get('id=' + id1 + '&head=1');
  check('head poll returns only version + expiry', r.status === 200 && r.j.version === 1 && Object.keys(r.j).sort().join() === 'expires_at,version', r.j);
  r = await post({ op: 'create', content: 'plain one' });
  check('create defaults: plain, 30d', r.status === 201 && r.j.expiry === '30d' && Math.abs(Date.parse(r.j.expires_at) - (Date.now() + 30 * 86400000)) < 5000);
  r = await post({ op: 'create', content: 'forever', expiry: 'keep' });
  check('keep -> no expiry', r.status === 201 && r.j.expires_at === null && r.j.expiry === 'keep');
  check('unknown id 404 (valid shape)', (await get('id=' + 'Z'.repeat(24))).status === 404);
  check('empty content is allowed', (await post({ op: 'create', content: '' })).status === 201);
  check('unicode round trip', await (async () => { const c = 'héllo \u{1F600} 日本語\n\ttab'; const c1 = (await post({ op: 'create', content: c })).j; return (await get('id=' + c1.id)).j.content === c; })());

  console.log('save + versions + conflict');
  r = await post({ op: 'save', id: id1, base: 1, title: 'Hello 2', lang: 'json', content: '{"a":2}', expiry: '7d' });
  check('save from head -> v2', r.status === 200 && r.j.version === 2, r);
  r = await get('id=' + id1);
  check('head now v2 with new content, same id', r.j.version === 2 && r.j.content === '{"a":2}' && r.j.title === 'Hello 2');
  r = await post({ op: 'save', id: id1, base: 1, title: 'mine', lang: 'json', content: '{"a":"stale"}', expiry: '7d' });
  check('stale base -> 409 with latest content', r.status === 409 && r.j.error === 'conflict' && r.j.latest.version === 2 && r.j.latest.content === '{"a":2}' && /saved since/i.test(r.j.message), r);
  check('409 did not change the note or add a version', (await get('id=' + id1)).j.version === 2 && fake.state.versions.filter((v) => v.id === id1).length === 2);
  r = await post({ op: 'save', id: id1, base: 2, title: 'mine', lang: 'json', content: '{"a":"overwrite"}', expiry: '7d' });
  check('overwrite = resend with the latest base -> v3', r.status === 200 && r.j.version === 3);
  r = await get('id=' + id1 + '&versions=1');
  check('versions list newest first, no content', r.status === 200 && r.j.head === 3 && r.j.versions.map((v) => v.version).join() === '3,2,1' && r.j.versions.every((v) => v.created_at && !('content' in v) && v.size > 0), r.j);
  r = await get('id=' + id1 + '&v=2');
  check('read an old version', r.status === 200 && r.j.version === 2 && r.j.content === '{"a":2}' && r.j.head === 3, r.j);
  check('missing version 404', (await get('id=' + id1 + '&v=99')).status === 404 && (await get('id=' + id1 + '&v=abc')).status === 400 && (await get('id=' + id1 + '&v=0')).status === 400);
  r = await post({ op: 'save', id: id1, base: 3, title: 'Hello 2', lang: 'json', content: '{"a":2}', expiry: '7d' });
  check('restore = save old content as a NEW version (v4)', r.status === 200 && r.j.version === 4 && (await get('id=' + id1)).j.content === '{"a":2}' && fake.state.versions.filter((v) => v.id === id1).length === 4);
  check('save needs integer base', (await post({ op: 'save', id: id1, title: 'x', content: 'x', expiry: '7d' })).status === 400 && (await post({ op: 'save', id: id1, base: '4', content: 'x', expiry: '7d' })).status === 400 && (await post({ op: 'save', id: id1, base: 0, content: 'x', expiry: '7d' })).status === 400);
  check('save to unknown note 404', (await post({ op: 'save', id: 'Q'.repeat(24), base: 1, content: 'x', expiry: '7d' })).status === 404);
  check('concurrent saves from the same base: exactly one wins', await (async () => {
    const c = (await post({ op: 'create', content: 'start' })).j;
    const rs = await Promise.all([1, 2, 3, 4].map((i) => post({ op: 'save', id: c.id, base: 1, content: 'writer ' + i, expiry: '30d' })));
    const wins = rs.filter((x) => x.status === 200), losses = rs.filter((x) => x.status === 409);
    return wins.length === 1 && losses.length === 3 && (await get('id=' + c.id)).j.version === 2;
  })());

  console.log('versions prune');
  reset();
  const pc = (await post({ op: 'create', content: 'v1' })).j;
  let last = 1;
  for (let i = 2; i <= 60; i++) { const s = await post({ op: 'save', id: pc.id, base: last, content: 'v' + i, expiry: '30d' }); if (s.status !== 200) { check('save ' + i, false, s); break; } last = s.j.version; }
  const kept = fake.state.versions.filter((v) => v.id === pc.id).map((v) => v.version).sort((a, b) => a - b);
  check('head is v60', last === 60 && (await get('id=' + pc.id)).j.version === 60);
  check('only the last 50 versions are kept (11..60)', kept.length === 50 && kept[0] === 11 && kept[49] === 60, kept.length);
  r = await get('id=' + pc.id + '&versions=1');
  check('list shows 50', r.j.versions.length === 50 && r.j.versions[0].version === 60 && r.j.versions[49].version === 11);
  check('pruned version is gone (404), kept one reads', (await get('id=' + pc.id + '&v=10')).status === 404 && (await get('id=' + pc.id + '&v=11')).j.content === 'v11');

  console.log('expiry');
  reset();
  const e1 = (await post({ op: 'create', content: 'short', expiry: '1d' })).j;
  fake.state.skew = 23 * 3600 * 1000;
  r = await get('id=' + e1.id);
  check('still alive at 23h', r.status === 200);
  r = await post({ op: 'save', id: e1.id, base: 1, content: 'renewed', expiry: '1d' });
  check('save renews the expiry (1 day from the edit)', r.status === 200 && Math.abs(Date.parse(r.j.expires_at) - (Date.now() + fake.state.skew + 24 * 3600 * 1000)) < 5000, r.j);
  fake.state.skew = 23 * 3600 * 1000 + 20 * 3600 * 1000;
  check('alive 43h after create thanks to the renewal', (await get('id=' + e1.id)).status === 200);
  fake.state.skew = 23 * 3600 * 1000 + 26 * 3600 * 1000;
  r = await get('id=' + e1.id);
  check('expired note -> 404', r.status === 404);
  check('expired note deleted lazily (note + versions)', !fake.state.notes.has(e1.id) && !fake.state.versions.some((v) => v.id === e1.id));
  check('head poll + save on expired -> 404', (await get('id=' + e1.id + '&head=1')).status === 404 && (await post({ op: 'save', id: e1.id, base: 2, content: 'x', expiry: '1d' })).status === 404);
  reset();
  const k = (await post({ op: 'create', content: 'forever', expiry: 'keep' })).j;
  fake.state.skew = 400 * 86400000;
  check('keep never expires', (await get('id=' + k.id)).status === 200);
  check('save on keep stays keep', (await post({ op: 'save', id: k.id, base: 1, content: 'still', expiry: 'keep' })).j.expires_at === null);
  r = await post({ op: 'settings', id: k.id, expiry: '1d' });
  check('settings changes expiry without a new version', r.status === 200 && r.j.version === 2 && r.j.expiry === '1d' && !!r.j.expires_at && fake.state.versions.filter((v) => v.id === k.id).length === 2, r.j);
  check('settings rejects bad expiry / unknown note', (await post({ op: 'settings', id: k.id, expiry: 'x' })).status === 400 && (await post({ op: 'settings', id: 'Q'.repeat(24), expiry: '7d' })).status === 404);
  reset();
  const old1 = (await post({ op: 'create', content: 'old', expiry: '1d' })).j;
  fake.state.skew = 3 * 86400000;
  deps.random = () => 0; // force the 10% purge branch
  await post({ op: 'create', content: 'trigger purge' });
  check('random purge on create removes other expired notes', !fake.state.notes.has(old1.id) && !fake.state.versions.some((v) => v.id === old1.id));

  console.log('fork (create from existing content)');
  reset();
  const orig = (await post({ op: 'create', title: 'Original', content: 'shared text', lang: 'markdown' })).j;
  const forked = (await post({ op: 'create', title: 'Original (copy)', content: 'shared text', lang: 'markdown' })).j;
  check('fork = new id, v1, same content, original untouched', forked.id !== orig.id && forked.version === 1 && (await get('id=' + forked.id)).j.content === 'shared text' && (await get('id=' + orig.id)).j.version === 1);

  console.log('delete');
  r = await post({ op: 'delete', id: forked.id });
  check('delete removes note and history', r.status === 200 && r.j.deleted && !fake.state.notes.has(forked.id) && !fake.state.versions.some((v) => v.id === forked.id));
  check('delete again 404, link dead', (await post({ op: 'delete', id: forked.id })).status === 404 && (await get('id=' + forked.id)).status === 404);

  console.log('abuse protection');
  reset();
  for (const bad of ['', 'short', 'a'.repeat(65), '../../etc/passwd', 'a'.repeat(23) + ' ', 'a'.repeat(23) + '%', '<script>alert(1)</script>']) {
    check('GET bad id rejected: ' + JSON.stringify(bad).slice(0, 30), (await get('id=' + encodeURIComponent(bad))).status === 400);
  }
  check('GET without id 400', (await get('x=1')).status === 400);
  check('POST bad id rejected', (await post({ op: 'save', id: 'short', base: 1, content: 'x', expiry: '7d' })).status === 400 && (await post({ op: 'delete', id: 5 })).status === 400);
  check('unknown op / no op -> 400', (await post({ op: 'drop table' })).status === 400 && (await post({ content: 'x' })).status === 400);
  const queriesBefore = fake.state.queries.length;
  check('validation failures never touch the database', (await post({ op: 'create', content: 'a\u0000' })).status === 400 && (await post({ op: 'create', content: 'x', lang: 'nope' })).status === 400 && fake.state.queries.length === queriesBefore);
  r = await post({ op: 'create', content: 'a'.repeat(N.MAX_CONTENT_BYTES + 1) });
  check('over 200 KB -> 413 (note too big)', r.status === 413 && r.j.error === 'too_large' && fake.state.queries.length === queriesBefore, r);
  r = await post({ op: 'create', content: 'a'.repeat(N.MAX_CONTENT_BYTES) });
  check('exactly 200 KB is accepted', r.status === 201);
  r = await call('POST', '/api/notes', JSON.stringify({ op: 'create', content: '\u0001'.repeat(N.MAX_BODY) }));
  check('huge body -> 413', r.status === 413, r.status);
  check('malformed JSON / array / string -> 400', (await call('POST', '/api/notes', '{nope')).status === 400 && (await call('POST', '/api/notes', '[1]')).status === 400 && (await call('POST', '/api/notes', '"hi"')).status === 400);
  check('non-JSON content-type -> 415', (await call('POST', '/api/notes', JSON.stringify({ op: 'create', content: 'x' }), { 'content-type': 'text/plain' })).status === 415);
  r = await fetch(base + '/api/notes', { method: 'PUT' }); const pj = await r.json();
  check('PUT/DELETE -> 405', r.status === 405 && (await fetch(base + '/api/notes', { method: 'DELETE' })).status === 405 && pj.error === 'method');
  check('cross-origin write -> 403, same-origin ok', (await post({ op: 'create', content: 'x' }, { origin: 'https://evil.example' })).status === 403 && (await post({ op: 'create', content: 'x' }, { origin: base })).status === 201);
  check('hostile content stored as inert data and returned as JSON', await (async () => { const evil = '<img src=x onerror=alert(1)><script>alert(1)</script>'; const c = (await post({ op: 'create', content: evil, title: '<b>t</b>' })).j; const g = await get('id=' + c.id); return g.j.content === evil && /^application\/json/.test(g.h.get('content-type')) && g.h.get('x-content-type-options') === 'nosniff'; })());
  check('queries are parameterized (content never in SQL text)', !fake.state.queries.some((q) => /onerror|alert\(1\)/.test(q.query)));

  console.log('rate limits');
  reset();
  let created = 0, limitedAt = 0;
  for (let i = 0; i < N.LIMITS.create.max + 3; i++) { const x = await post({ op: 'create', content: 'n' + i }); if (x.status === 201) created++; else if (!limitedAt) { limitedAt = i; r = x; } }
  check(`create limited at ${N.LIMITS.create.max} per IP`, created === N.LIMITS.create.max && r.status === 429 && r.j.error === 'rate_limited' && !!r.h.get('retry-after'), { created, r: r.status });
  ipOverride = '203.0.113.9';
  check('another IP can still create', (await post({ op: 'create', content: 'other ip' })).status === 201);
  ipOverride = null;
  check('rate-limited IP can still be read-limited separately (save bucket independent)', (await post({ op: 'save', id: 'Q'.repeat(24), base: 1, content: 'x', expiry: '7d' })).status === 404);
  reset();
  const rl = (await post({ op: 'create', content: 'x' })).j;
  let saves = 0, base_ = 1, saveLimited = null;
  for (let i = 0; i < N.LIMITS.save.max + 3; i++) { const x = await post({ op: 'save', id: rl.id, base: base_, content: 's' + i, expiry: '30d' }); if (x.status === 200) { saves++; base_ = x.j.version; } else { saveLimited = x; break; } }
  check(`save limited at ${N.LIMITS.save.max} per IP`, saves === N.LIMITS.save.max && saveLimited && saveLimited.status === 429, { saves });
  check('reads still allowed while save-limited', (await get('id=' + rl.id)).status === 200);
  reset();
  const rr = (await post({ op: 'create', content: 'x' })).j;
  let reads = 0, readLimited = null;
  for (let i = 0; i < N.LIMITS.read.max + 3; i++) { const x = await get('id=' + rr.id); if (x.status === 200) reads++; else { readLimited = x; break; } }
  check(`read limited at ${N.LIMITS.read.max} per IP`, reads === N.LIMITS.read.max && readLimited && readLimited.status === 429, { reads });
  check('head polls are not DB-rate-limited (separate in-memory limiter)', (await get('id=' + rr.id + '&head=1')).status === 200);
  reset();
  deps = { ...mkDeps(), pollAllowed: (ip, now) => N.pollAllowed(ip, now, 3) };
  const pids = [];
  for (let i = 0; i < 5; i++) pids.push((await get('id=' + 'P'.repeat(24) + '&head=1')).status);
  check('poll limiter answers 429 after the per-minute budget', pids.filter((s) => s === 404).length === 3 && pids.filter((s) => s === 429).length === 2, pids);
  reset();
  for (let i = 0; i < N.LIMITS.createAll.max; i++) fake.state.attempts.push({ key: 'notes-new:global', at: Date.now() });
  check('global create cap protects the database from many IPs', (await post({ op: 'create', content: 'x' })).status === 429);

  console.log('database trouble / config');
  reset();
  fake.state.fail = true;
  r = await get('id=' + 'A'.repeat(24));
  check('db down -> 503 with a calm message, no internals leaked', r.status === 503 && r.j.error === 'unavailable' && !/boom|secret|postgres/i.test(JSON.stringify(r.j)), r);
  fake.state.fail = false;
  const noDb = { status: 0, body: null };
  await N.handleNotes({ method: 'GET', headers: {}, query: {} }, { statusCode: 0, setHeader() {}, end(b) { noDb.body = JSON.parse(b); } }, { db: null });
  check('no DATABASE_URL -> not_configured, local notes still fine', noDb.body.error === 'not_configured' && noDb.body.configured === false);
  r = await call('POST', '/api/notes-prod', { op: 'create', content: 'via real handler', title: 'prod' });
  check('production default export works end to end', r.status === 201 && (await call('GET', '/api/notes-prod?id=' + r.j.id)).j.content === 'via real handler');
  check('only the documented tables are used', fake.state.queries.every((q) => /\b(notes|note_versions|link_attempts)\b/.test(q.query)));

  srv.close(); await fake.close();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}
