// Fake Neon-compatible HTTP SQL server for tests/dev. NOT deployed (leading underscore).
// Understands only the handful of statements api/_links-lib.js sends.
//   node api/_fake-neon.mjs 8793     (dev: DATABASE_URL=postgresql://u:p@127.0.0.1:8793/db NEON_SQL_ENDPOINT=http://127.0.0.1:8793/sql)
import http from 'node:http';
import { pathToFileURL } from 'node:url';

export function startFakeNeon(port = 0) {
  const state = { links: new Map(), attempts: [], queries: [], expectConn: null, fail: false };
  const iso = (d) => (d ? new Date(d).toISOString().replace(/\.\d+Z$/, 'Z') : null);
  function run(q, p) {
    const s = q.replace(/\s+/g, ' ').trim();
    if (/^create (table|index)/i.test(s)) return { rows: [] };
    if (/^insert into links/i.test(s)) {
      if (state.links.has(p[0])) return { rows: [] };
      state.links.set(p[0], { code: p[0], url: p[1], created_at: Date.now(), hits: 0, last_hit: null, expires_at: p[2] ? Date.parse(p[2]) : null, note: p[3] });
      return { rows: [{ code: p[0] }] };
    }
    if (/^update links set hits/i.test(s)) {
      const l = state.links.get(p[0]);
      if (!l || (l.expires_at && l.expires_at <= Date.now())) return { rows: [] };
      l.hits++; l.last_hit = Date.now();
      return { rows: [{ url: l.url }] };
    }
    if (/^select code, url, note, hits/i.test(s)) {
      const rows = [...state.links.values()].sort((a, b) => b.created_at - a.created_at).map((l) => ({
        code: l.code, url: l.url, note: l.note, hits: String(l.hits), created_at: iso(l.created_at), last_hit: iso(l.last_hit), expires_at: iso(l.expires_at),
        expired: l.expires_at && l.expires_at <= Date.now() ? 't' : 'f' }));
      return { rows };
    }
    if (/^delete from links/i.test(s)) { const had = state.links.delete(p[0]); return { rows: had ? [{ code: p[0] }] : [] }; }
    if (/^select \(select count\(\*\) from link_attempts/i.test(s)) {
      const cut = Date.now() - 15 * 60000;
      const n = (k) => state.attempts.filter((a) => a.key === k && a.at > cut).length;
      return { rows: [{ ipn: String(n(p[0])), gn: String(n('global')) }] };
    }
    if (/^insert into link_attempts/i.test(s)) { for (const k of p) state.attempts.push({ key: k, at: Date.now() }); return { rows: [] }; }
    if (/^delete from link_attempts/i.test(s)) return { rows: [] };
    throw Object.assign(new Error('fake neon: unsupported query ' + s.slice(0, 60)), { code: '42601' });
  }
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        if (req.method !== 'POST' || req.url !== '/sql') { res.statusCode = 404; return res.end('{"message":"no"}'); }
        if (!req.headers['neon-connection-string']) { res.statusCode = 400; return res.end('{"message":"missing connection string"}'); }
        if (state.expectConn && req.headers['neon-connection-string'] !== state.expectConn) { res.statusCode = 401; return res.end('{"message":"bad conn"}'); }
        if (state.fail) { res.statusCode = 500; return res.end('{"message":"boom secret detail"}'); }
        const { query, params } = JSON.parse(body);
        if (typeof query !== 'string' || !Array.isArray(params)) { res.statusCode = 400; return res.end('{"message":"bad body"}'); }
        state.queries.push({ query, params });
        const r = run(query, params);
        res.end(JSON.stringify({ command: 'SELECT', rowCount: r.rows.length, rows: r.rows, fields: [], rowAsArray: false }));
      } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ message: e.message, code: e.code || '42000' })); }
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ state, server, port: server.address().port, close: () => new Promise((r) => server.close(r)) })));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const f = await startFakeNeon(+process.argv[2] || 8793);
  console.log('fake neon on', f.port);
}
