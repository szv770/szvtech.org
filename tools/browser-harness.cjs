// Playwright harness for Claude Code cloud sessions.
// The sandbox Chromium does not trust the HTTPS proxy's CA, so every external
// https:// request (CDN libs, Google Fonts, the live site) is fetched with curl
// (which does) and cached on disk, then handed to the page.
// Usage: const { launch } = require('./browser-harness.cjs');
//        const { browser, ctx, external } = await launch({ viewport: {...}, isMobile: true, hasTouch: true });
//        `opts` are Playwright newContext options (viewport, isMobile, hasTouch,
//        deviceScaleFactor, reducedMotion: 'reduce', ...). `external` lists
//        [status, url] for every external request served through curl.
// Env: PLAYWRIGHT_MODULE (path to the playwright package), CHROMIUM_PATH.
// Cache: os.tmpdir()/szvtech-harness-cache (delete it to refetch CDN files).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const CACHE = path.join(os.tmpdir(), 'szvtech-harness-cache');
fs.mkdirSync(CACHE, { recursive: true });

function fetchCached(url, ua) {
  const h = crypto.createHash('md5').update(url).digest('hex');
  const body = path.join(CACHE, h + '.bin'), meta = path.join(CACHE, h + '.json');
  if (!fs.existsSync(body)) {
    const hdr = path.join(CACHE, h + '.hdr');
    execFileSync('curl', ['-sSL', '-A', ua, '-D', hdr, '-o', body, url], { timeout: 30000 });
    const raw = fs.readFileSync(hdr, 'utf8');
    const m = [...raw.matchAll(/^content-type:\s*(.+)$/gim)].pop();
    const st = [...raw.matchAll(/^HTTP\/[\d.]+\s+(\d+)/gm)].pop();
    fs.writeFileSync(meta, JSON.stringify({ ct: m ? m[1].trim() : 'application/octet-stream', status: st ? +st[1] : 200 }));
  }
  const { ct, status } = JSON.parse(fs.readFileSync(meta, 'utf8'));
  return { status, contentType: ct, body: fs.readFileSync(body) };
}

async function launch(opts = {}) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const ctx = await browser.newContext(opts);
  const ua = opts.userAgent || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
  const external = [];
  await ctx.route(/^https:\/\//, async (route) => {
    const url = route.request().url();
    try {
      const r = fetchCached(url, ua);
      external.push([r.status, url]);
      await route.fulfill({ status: r.status, contentType: r.contentType, body: r.body, headers: { 'access-control-allow-origin': '*' } });
    } catch (e) { external.push(['ERR', url]); await route.abort(); }
  });
  return { browser, ctx, external };
}

module.exports = { launch };
