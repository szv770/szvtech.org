// Smoke test: every page, on a phone, a phone with reduced motion, and desktop.
//
//   node tools/devserver.mjs 8790 &        # serves the repo + api/*.js
//   node tools/smoke.cjs [baseUrl] [--only=/time/,/learn/] [--skip=/qr/,/timer/]
//
// Pages are discovered automatically: "/", "/404.html" and every folder that
// has an index.html (skipping more/, api/, tools/, node_modules, dot-folders).
// Env: SMOKE_SKIP / SMOKE_ONLY (comma lists, same as the flags), SMOKE_WAIT
// (ms to let each page settle, default 2500), SMOKE_STRICT_API=1 (treat /api
// 5xx as failures; by default they are warnings because upstreams such as
// chabad.org may be unreachable from the sandbox).
//
// A page FAILS on: uncaught page errors, local requests that fail or return
// >= 400 (except the 404 page itself), horizontal overflow, or not loading
// /assets/theme.js (window.SZVTheme missing). Exit code 1 if anything failed.
const fs = require('fs');
const path = require('path');
const { launch } = require('./browser-harness.cjs');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const flag = (n) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : process.env['SMOKE_' + n.toUpperCase()] || ''; };
const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean).map((x) => (x === '/' || x.endsWith('.html') || x.endsWith('/') ? x : x + '/')).map((x) => (x.startsWith('/') ? x : '/' + x));
const BASE = (args.find((x) => !x.startsWith('--')) || 'http://localhost:8790').replace(/\/$/, '');
const WAIT = +process.env.SMOKE_WAIT || 2500;
const STRICT_API = process.env.SMOKE_STRICT_API === '1';
const SKIP_DIRS = new Set(['more', 'api', 'tools', 'node_modules']);

function discover() {
  const pages = ['/'];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
      const r = rel + e.name + '/';
      if (fs.existsSync(path.join(dir, e.name, 'index.html'))) pages.push('/' + r);
      walk(path.join(dir, e.name), r);
    }
  };
  walk(ROOT, '');
  if (fs.existsSync(path.join(ROOT, '404.html'))) pages.push('/404.html');
  return pages;
}

const only = list(flag('only')), skip = list(flag('skip'));
const PAGES = discover().filter((p) => (!only.length || only.includes(p)) && !skip.includes(p));
const MODES = [
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: 'phone-rm', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce' },
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
];

(async () => {
  console.log(`smoke: ${BASE}  pages: ${PAGES.join(' ')}${skip.length ? '  (skipped: ' + skip.join(' ') + ')' : ''}`);
  let failed = 0, warned = 0;
  for (const { name, ...opts } of MODES) {
    const { browser, ctx } = await launch(opts);
    for (const p of PAGES) {
      const pg = await ctx.newPage();
      const problems = [], warnings = [];
      const local = (url) => url.startsWith(BASE);
      const isApi = (url) => local(url) && new URL(url).pathname.startsWith('/api/');
      pg.on('pageerror', (e) => problems.push('error: ' + e.message.split('\n')[0]));
      pg.on('response', (r) => {
        const url = r.url();
        if (!local(url) || r.status() < 400) return;
        if (p === '/404.html' && new URL(url).pathname === '/404.html') return;
        const msg = r.status() + ' ' + url.slice(BASE.length);
        (isApi(url) && r.status() >= 500 && !STRICT_API ? warnings : problems).push(msg);
      });
      pg.on('requestfailed', (rq) => {
        const err = (rq.failure() || {}).errorText || '';
        if (local(rq.url()) && !/ERR_ABORTED/.test(err)) problems.push('failed ' + rq.url().slice(BASE.length) + ' ' + err);
      });
      await pg.goto(BASE + p, { waitUntil: 'load', timeout: 45000 }).catch((e) => problems.push('load: ' + e.message.split('\n')[0]));
      await pg.waitForTimeout(WAIT);
      const info = await pg.evaluate(() => ({
        over: document.documentElement.scrollWidth - innerWidth,
        theme: !!window.SZVTheme,
        themeTag: !!document.querySelector('head script[src^="/assets/theme.js"]'),
      })).catch((e) => ({ err: e.message }));
      if (info.err) problems.push('evaluate: ' + info.err);
      else {
        if (info.over > 1) problems.push('horizontal overflow ' + info.over + 'px');
        if (!info.theme || !info.themeTag) problems.push('theme.js not loaded (add <script src="/assets/theme.js"> first in <head>)');
      }
      const tag = problems.length ? 'FAIL ' : warnings.length ? 'warn ' : 'ok   ';
      console.log(tag + name.padEnd(9) + p + (problems.length ? '  ' + problems.join(' | ') : '') + (warnings.length ? '  [warn: ' + warnings.join(' | ') + ']' : ''));
      if (problems.length) failed++; else if (warnings.length) warned++;
      await pg.close();
    }
    await browser.close();
  }
  console.log(`\n${PAGES.length * MODES.length} checks: ${failed} failed, ${warned} with warnings`);
  process.exit(failed ? 1 : 0);
})();
