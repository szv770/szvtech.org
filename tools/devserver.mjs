// Local stand-in for Vercel: serves the repo as static files AND runs the
// zero-config serverless functions in api/*.js, so /api/now, /api/zmanim, ...
// work locally exactly like production.
//
//   node tools/devserver.mjs [port]          (default 8790)
//
// Mirrors the parts of Vercel this site relies on:
//   - /api/<name>  -> default export of api/<name>.js, called as (req, res).
//     Files starting with "_" (tests) are never routed, like on Vercel.
//     req.query is filled in; res.status()/json()/send() helpers exist.
//   - "rewrites" from vercel.json (e.g. /admin -> /sys/index.html)
//   - the site-wide headers from vercel.json (X-Robots-Tag: noindex)
//   - /folder and /folder/ -> folder/index.html; unknown paths -> 404.html (status 404)
// Everything is sent with Cache-Control: no-store so edits show up on reload.
//
// External fetches inside api functions (e.g. chabad.org) need the proxy in a
// Claude Code cloud sandbox:
//   NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node tools/devserver.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +process.argv[2] || +process.env.PORT || 8790;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};

// vercel.json: rewrites (path-to-regexp subset: literal paths and "(.*)") and headers
let vercel = {};
try { vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')); } catch { /* none */ }
const toRe = (src) => new RegExp('^' + src.split('(.*)').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.*)') + '$');
const REWRITES = (vercel.rewrites || []).map((r) => ({ re: toRe(r.source), dest: r.destination }));
const HEADERS = (vercel.headers || []).map((h) => ({ re: toRe(h.source), headers: h.headers }));

const apiCache = new Map(); // name -> { mtime, handler }
async function apiHandler(name) {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name) || name.startsWith('_')) return null;
  const file = path.join(ROOT, 'api', name + '.js');
  let st; try { st = fs.statSync(file); } catch { return null; }
  const hit = apiCache.get(name);
  if (hit && hit.mtime === st.mtimeMs) return hit.handler;
  const mod = await import(pathToFileURL(file).href + '?t=' + st.mtimeMs); // re-import after edits
  apiCache.set(name, { mtime: st.mtimeMs, handler: mod.default });
  return mod.default;
}

function addVercelHelpers(req, res, u) {
  req.query = Object.fromEntries(u.searchParams);
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); return res; };
  res.send = (b) => { res.end(typeof b === 'object' && !Buffer.isBuffer(b) ? JSON.stringify(b) : b); return res; };
}

function resolveStatic(pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return null; }
  const p = path.resolve(ROOT, '.' + rel);
  if (p !== ROOT && !p.startsWith(ROOT + path.sep)) return null;   // no path traversal
  if (p.split(path.sep).some((s) => s === '.git' || s === 'node_modules')) return null;
  try {
    const st = fs.statSync(p);
    if (st.isDirectory()) { const i = path.join(p, 'index.html'); return fs.existsSync(i) ? i : null; }
    return p;
  } catch { return null; }
}

function sendFile(res, file, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(file).pipe(res);
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  let pathname = u.pathname;
  for (const h of HEADERS) if (h.re.test(pathname)) for (const { key, value } of h.headers) res.setHeader(key, value);
  try {
    // rewrites first (Vercel applies them when no file matches; the rewritten paths here never exist as files)
    for (const r of REWRITES) if (r.re.test(pathname) && !resolveStatic(pathname)) { pathname = r.dest; break; }

    const api = /^\/api\/([^/]+?)(?:\.js)?\/?$/.exec(pathname);
    if (api) {
      const handler = await apiHandler(api[1]);
      if (handler) { addVercelHelpers(req, res, u); return await handler(req, res); }
    }
    const file = resolveStatic(pathname);
    if (file) return sendFile(res, file);
    const nf = path.join(ROOT, '404.html');
    if (fs.existsSync(nf)) return sendFile(res, nf, 404);
    res.statusCode = 404; res.end('not found');
  } catch (e) {
    console.error(req.method, req.url, e);
    if (!res.headersSent) { res.statusCode = 500; res.setHeader('Content-Type', 'text/plain'); }
    res.end('devserver error: ' + e.message);
  }
}).listen(PORT, () => console.log(`szvtech devserver on http://localhost:${PORT}  (root ${ROOT})`));
