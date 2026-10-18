// Tests for api/_links-lib.js, api/links.js, api/go.js. Run:  node api/_links.test.mjs
import http from 'node:http';
import { startFakeNeon } from './_fake-neon.mjs';
import * as L from './_links-lib.js';
import linksHandler from './links.js';
import goHandler from './go.js';

export default function notAFunction(req, res) { res.statusCode = 404; res.end('Not found'); }
let passes = 0, failures = 0;
function check(name, ok, detail) {
  if (ok) { passes++; console.log('  ok  ', name); } else { failures++; console.log('  FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); }
}

console.log('validateUrl');
const good = (u) => L.validateUrl(u).ok;
check('https ok', good('https://example.com/a?b=1#c'));
check('http ok', good('http://example.com'));
check('bare domain gets https', L.validateUrl('example.com/x').url === 'https://example.com/x');
check('normalizes host case', L.validateUrl('https://EXAMPLE.com/Path').url === 'https://example.com/Path');
for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'ftp://example.com', 'mailto:a@b.com', 'vbscript:x', '//example.com', 'https://user:pw@example.com', 'https://user@example.com',
  'http://localhost', 'http://localhost:3000', 'https://127.0.0.1', 'http://192.168.1.1/x', 'http://10.0.0.1', 'http://0x7f.1', 'http://2130706433', 'http://[::1]/', 'http://[fd00::1]',
  'https://intranet', 'https://printer.local', 'https://foo.internal', 'https://szvtech.org/x', 'https://www.szvtech.org', 'https://a.b.szvtech.org.', 'https://exa mple.com', 'https://example.com/a b',
  'https://-bad.com', 'https://bad_host.com', '', '   ', 'https://', 'https://example.123', null, undefined, 5, {}, ['https://example.com']]) {
  check('rejects ' + JSON.stringify(bad), !good(bad));
}
check('rejects > 2048', !good('https://example.com/' + 'a'.repeat(2100)));
check('accepts exactly <= 2048', good('https://example.com/' + 'a'.repeat(2000)));
check('lookalike szvtech.org.evil.com allowed', good('https://szvtech.org.evil.com'));
check('notszvtech.org allowed', good('https://notszvtech.org'));
check('punycode ok', good('https://xn--bcher-kva.example.net/'));

console.log('codes');
const seen = new Set();
let allOk = true;
for (let i = 0; i < 500; i++) { const c = L.randomCode(); seen.add(c); if (!/^[abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(c)) allOk = false; }
check('random code: 6 chars, unambiguous alphabet', allOk);
check('random codes vary', seen.size > 490);
check('alphabet has no 0 O 1 l I', !/[0O1lI]/.test(L.ALPHABET));
check('custom ok', L.validateCustomCode('my-link_2').ok);
for (const bad of ['ab', 'a'.repeat(41), 'has space', 'ünï', 'a/b', 'a.b', 'admin', 'API', 'Index', '', null, 5]) check('custom rejects ' + JSON.stringify(bad), !L.validateCustomCode(bad).ok);
check('reserved is case-insensitive', L.isReserved('ADMIN') && L.isReserved('index.html') && !L.isReserved('hello'));
check('CODE_RE', L.CODE_RE.test('aB3_-') && !L.CODE_RE.test('a b') && !L.CODE_RE.test('') && !L.CODE_RE.test('a'.repeat(41)) && !L.CODE_RE.test('a\n'));

console.log('expiry / note');
const NOW = Date.parse('2026-10-18T12:00:00Z');
check('never', L.parseExpiry('never', NOW).at === null && L.parseExpiry(undefined, NOW).at === null && L.parseExpiry(null, NOW).at === null);
check('1d', L.parseExpiry('1d', NOW).at === '2026-10-19T12:00:00.000Z');
check('7d / 30d', L.parseExpiry('7d', NOW).at === '2026-10-25T12:00:00.000Z' && L.parseExpiry('30d', NOW).at === '2026-11-17T12:00:00.000Z');
check('custom date = end of day', L.parseExpiry('2026-12-01', NOW).at === '2026-12-01T23:59:59.000Z');
check('past date rejected', !L.parseExpiry('2026-10-01', NOW).ok);
check('too far rejected', !L.parseExpiry('2099-01-01', NOW).ok);
check('junk rejected', !L.parseExpiry('tomorrow', NOW).ok && !L.parseExpiry('__proto__', NOW).ok && !L.parseExpiry(5, NOW).ok && !L.parseExpiry('2026-13-45', NOW).ok);
check('note trimmed/clipped', L.cleanNote('  hi\nthere ') === 'hi there' && L.cleanNote('x'.repeat(500)).length === 200 && L.cleanNote('  ') === null && L.cleanNote(5) === null);

console.log('PIN');
check('plain pin match', L.pinMatches('1234', { SZV_LINK_PIN: '1234' }));
check('plain pin mismatch', !L.pinMatches('1235', { SZV_LINK_PIN: '1234' }));
check('empty/non-string/long rejected', !L.pinMatches('', { SZV_LINK_PIN: '' }) && !L.pinMatches(1234, { SZV_LINK_PIN: '1234' }) && !L.pinMatches('x'.repeat(500), { SZV_LINK_PIN: 'x'.repeat(500) }));
const h = (await import('node:crypto')).createHash('sha256').update('hunter22').digest('hex');
check('sha256 pin', L.pinMatches('hunter22', { SZV_LINK_PIN_SHA256: h }) && !L.pinMatches('hunter23', { SZV_LINK_PIN_SHA256: h }));
check('sha256 wins over plain', !L.pinMatches('1234', { SZV_LINK_PIN: '1234', SZV_LINK_PIN_SHA256: h }));
check('no env -> never matches', !L.pinMatches('x', {}));
check('dbFromEnv null when unset', L.dbFromEnv({}) === null && L.dbFromEnv({ DATABASE_URL: 'postgresql://u:p@h/db' }) === null && L.dbFromEnv({ SZV_LINK_PIN: '1' }) === null);
check('dbFromEnv rejects non-postgres url', L.dbFromEnv({ DATABASE_URL: 'https://x.y/z', SZV_LINK_PIN: '1' }) === null);
check('dbFromEnv builds with pin', !!L.dbFromEnv({ DATABASE_URL: 'postgresql://u:p@ep-x-pooler.neon.tech/db?sslmode=require', SZV_LINK_PIN: '1' }));

// ---------------------------------------------------------------- full flow against fake Neon
const fake = await startFakeNeon();
const CONN = `postgresql://szv:secretpw@127.0.0.1:${fake.port}/db?sslmode=require`;
fake.state.expectConn = CONN;
const ENV = { DATABASE_URL: CONN, SZV_LINK_PIN: '482913', NEON_SQL_ENDPOINT: `http://127.0.0.1:${fake.port}/sql` };
Object.assign(process.env, ENV);

// real handlers (production default exports) behind a tiny http server
const noSleepDeps = { sleep: async () => {} };
const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  req.query = Object.fromEntries(u.searchParams);
  if (u.pathname === '/api/links') return L.handleLinks(req, res, { ...noSleepDeps, ...(globalThis.__deps || {}) });
  if (u.pathname === '/api/links-prod') return linksHandler(req, res);
  if (u.pathname === '/api/go') return goHandler(req, res);
  res.statusCode = 404; res.end();
}).listen(0);
await new Promise((r) => srv.once('listening', r));
const base = `http://127.0.0.1:${srv.address().port}`;
const call = async (path, o = {}) => {
  const r = await fetch(base + path, { redirect: 'manual', ...o, headers: { ...(o.headers || {}) } });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* html */ }
  return { s: r.status, j, t, h: r.headers };
};
const post = (body, headers = {}) => call('/api/links', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const PIN = '482913';

console.log('flow: auth');
let r = await call('/api/links');
check('GET without pin -> locked probe (200, no links), no-store', r.s === 200 && r.j.locked === true && !r.j.links && r.h.get('cache-control') === 'no-store', r);
check('no-pin attempt not recorded', fake.state.attempts.length === 0);
check('no CORS header', !r.h.get('access-control-allow-origin'));
r = await call('/api/links?pin=' + PIN);
check('pin in query string is ignored', r.j.locked === true && !r.j.links);
r = await call('/api/links', { headers: { 'X-Szv-Pin': PIN } });
check('GET with pin -> 200 empty list', r.s === 200 && Array.isArray(r.j.links) && r.j.links.length === 0, r);
r = await call('/api/links', { method: 'PUT', headers: { 'X-Szv-Pin': PIN } });
check('PUT -> 405', r.s === 405);
r = await call('/api/links', { headers: { 'X-Szv-Pin': PIN, Origin: 'https://evil.example' } });
check('foreign Origin -> 403', r.s === 403);
r = await call('/api/links', { headers: { 'X-Szv-Pin': PIN, Origin: `http://127.0.0.1:${srv.address().port}` } });
check('same Origin allowed', r.s === 200);

console.log('flow: create');
r = await post({ pin: PIN, url: 'https://example.com/long/path?x=1' });
check('create -> 201 with 6-char code', r.s === 201 && /^[A-Za-z0-9]{6}$/.test(r.j.code) && r.j.path === '/url/' + r.j.code, r);
const code1 = r.j.code;
r = await post({ pin: PIN, url: 'example.org', code: 'my-site', expires: '7d', note: 'for mom' });
check('custom code + expiry + note', r.s === 201 && r.j.code === 'my-site' && !!r.j.expires_at, r);
r = await post({ pin: PIN, url: 'https://example.net', code: 'my-site' });
check('duplicate custom code -> 409', r.s === 409, r);
r = await post({ pin: PIN, url: 'https://example.net', code: 'admin' });
check('reserved code -> 400', r.s === 400, r);
r = await post({ pin: PIN, url: 'javascript:alert(1)' });
check('javascript: -> 400', r.s === 400 && r.j.error === 'bad_url', r);
r = await post({ pin: PIN, url: 'https://szvtech.org/x' });
check('self link -> 400', r.s === 400);
r = await post({ pin: PIN, url: 'https://example.net', expires: 'soon' });
check('bad expiry -> 400', r.s === 400 && r.j.error === 'bad_expiry');
r = await post('{not json');
check('malformed JSON -> 400', r.s === 400);
r = await post('[1,2]');
check('JSON array -> 400', r.s === 400);
r = await post({ pin: PIN, url: 'https://example.com/' + 'a'.repeat(9000) });
check('oversize body -> 413', r.s === 413, r.s);
r = await post({ pin: { $ne: 1 }, url: 'https://example.com' });
check('non-string pin -> 401', r.s === 401);
r = await post({ url: 'https://example.com' });
check('missing pin -> 401', r.s === 401);

console.log('flow: redirect');
r = await call('/api/go?c=' + code1);
check('302 to destination, no-store', r.s === 302 && r.h.get('location') === 'https://example.com/long/path?x=1' && r.h.get('cache-control') === 'no-store', r);
await call('/api/go?c=' + code1);
r = await call('/api/links', { headers: { 'X-Szv-Pin': PIN } });
const mine = r.j.links.find((l) => l.code === code1);
check('hits counted (2)', mine && mine.hits === 2 && !!mine.last_hit && !mine.expired, mine);
check('list newest first with note', r.j.links[0].code === 'my-site' && r.j.links[0].note === 'for mom');
r = await call('/api/go?c=nope123');
check('unknown -> branded 404 html', r.s === 404 && /text\/html/.test(r.h.get('content-type')) && r.t.includes('SZVTECH'), r.s);
r = await call('/api/go?c=' + encodeURIComponent('a b'));
check('malformed code -> 404', r.s === 404);
r = await call('/api/go');
check('missing code -> 404', r.s === 404);
r = await call('/api/go?c=' + code1, { method: 'POST' });
check('POST to redirect -> 405', r.s === 405);
fake.state.links.get('my-site').expires_at = Date.now() - 1000;
r = await call('/api/go?c=my-site');
check('expired -> 404', r.s === 404);
r = await call('/api/links', { headers: { 'X-Szv-Pin': PIN } });
check('expired flagged in list', r.j.links.find((l) => l.code === 'my-site').expired === true);
fake.state.links.set('evil', { code: 'evil', url: 'javascript:alert(1)', created_at: Date.now(), hits: 0, expires_at: null });
r = await call('/api/go?c=evil');
check('stored bad scheme never redirected', r.s === 404 && !r.h.get('location'));

console.log('flow: delete');
r = await call('/api/links?code=' + code1, { method: 'DELETE' });
check('DELETE without pin -> 401', r.s === 401);
r = await call('/api/links?code=' + code1, { method: 'DELETE', headers: { 'X-Szv-Pin': PIN } });
check('DELETE -> 200', r.s === 200 && r.j.deleted === code1);
r = await call('/api/links?code=' + code1, { method: 'DELETE', headers: { 'X-Szv-Pin': PIN } });
check('DELETE again -> 404', r.s === 404);
r = await call('/api/links?code=a%20b', { method: 'DELETE', headers: { 'X-Szv-Pin': PIN } });
check('DELETE bad code -> 400', r.s === 400);
r = await call('/api/go?c=' + code1);
check('deleted link no longer redirects', r.s === 404);

console.log('flow: brute-force throttle (persistent in DB)');
fake.state.attempts.length = 0;
let last;
for (let i = 0; i < 5; i++) last = await post({ pin: '00000' + i });
check('5 wrong tries all 401', last.s === 401);
check('failures persisted (ip + global rows)', fake.state.attempts.length === 10);
r = await post({ pin: PIN });
check('6th try locked (429) even with the RIGHT pin', r.s === 429 && r.h.get('retry-after') === '900' && !r.j.links, r);
r = await call('/api/links', { headers: { 'X-Szv-Pin': PIN } });
check('GET also locked', r.s === 429);
r = await call('/api/links');
check('probe without pin still answers while locked (nothing to guess)', r.s === 200 && r.j.locked === true);
check('lock message does not leak pin', !JSON.stringify(r.j).includes(PIN));
// other IP unaffected (per-IP), via x-forwarded-for
r = await call('/api/links', { headers: { 'X-Szv-Pin': PIN, 'X-Forwarded-For': '203.0.113.9' } });
check('different IP still works', r.s === 200, r);
// window expiry
for (const a of fake.state.attempts) a.at -= 16 * 60000;
r = await call('/api/links', { headers: { 'X-Szv-Pin': PIN } });
check('lock lifts after 15 minutes', r.s === 200);
// global
fake.state.attempts.length = 0;
for (let i = 0; i < L.MAX_FAILS_GLOBAL; i++) fake.state.attempts.push({ key: 'global', at: Date.now() });
r = await call('/api/links', { headers: { 'X-Szv-Pin': PIN, 'X-Forwarded-For': '198.51.100.7' } });
check('global cap locks everyone', r.s === 429);
fake.state.attempts.length = 0;
const keys = new Set(); await post({ pin: 'bad' }); fake.state.attempts.forEach((a) => keys.add(a.key));
check('IP stored hashed, not raw', [...keys].every((k) => k === 'global' || /^ip:[0-9a-f]{32}$/.test(k)) && !JSON.stringify([...keys]).includes('127.0.0.1'));
fake.state.attempts.length = 0;

console.log('failure delay');
{
  let slept = 0;
  const db = L.createDb({ connectionString: CONN, endpoint: ENV.NEON_SQL_ENDPOINT });
  const res = await L.checkPin(db, ENV, 'wrong', '1.2.3.4', { sleep: async (ms) => { slept = ms; } });
  check('wrong pin sleeps before answering', res.status === 401 && slept >= 300, slept);
  slept = 0;
  const ok = await L.checkPin(db, ENV, PIN, '1.2.3.4', { sleep: async (ms) => { slept = ms; } });
  check('right pin does not sleep', ok.ok && slept === 0);
  fake.state.attempts.length = 0;
}

console.log('flow: failures and not-set-up');
fake.state.fail = true;
r = await call('/api/links', { headers: { 'X-Szv-Pin': PIN } });
check('db down -> 503 generic, no details', r.s === 503 && !r.t.includes('boom') && !r.t.includes('secretpw') && !/at .*\.js/.test(r.t), r.t);
r = await call('/api/go?c=abc123');
check('db down redirect -> friendly 503 page', r.s === 503 && r.t.includes('<html') && !r.t.includes('boom'));
fake.state.fail = false;
{
  const saved = { ...process.env };
  delete process.env.DATABASE_URL;
  r = await call('/api/links-prod');
  check('unset env -> 503 {configured:false}', r.s === 503 && r.j.configured === false);
  r = await call('/api/go?c=abc123');
  check('unset env redirect -> 404 page, no stack', r.s === 404 && r.t.includes('<html') && !/Error|at /.test(r.t.replace(/Hiccup|<style>[\s\S]*<\/style>/g, '')));
  Object.assign(process.env, saved);
  delete process.env.SZV_LINK_PIN;
  r = await call('/api/links-prod');
  check('missing PIN env -> not configured', r.s === 503 && r.j.configured === false);
  process.env.SZV_LINK_PIN = ENV.SZV_LINK_PIN;
}
r = await call('/api/links-prod', { headers: { 'X-Szv-Pin': PIN } });
check('production default export works end to end', r.s === 200 && r.j.configured === true, r);
check('every SQL statement was parameterized (no user text in SQL)', fake.state.queries.every((q) => !/example\.|my-site|482913|javascript/i.test(q.query)));
check('connection string sent as header only', fake.state.queries.length > 0);

srv.close(); await fake.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
