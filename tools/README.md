# tools/

Dev helpers. None of these are part of the site; they only run locally / in a
Claude Code session.

| file | what it does |
| --- | --- |
| `cache-bust.py` | Stamps every local CSS/JS URL (and local ES-module imports inside JS) with `?v=<content hash>`. **Run before every commit that touches CSS/JS:** `python3 tools/cache-bust.py`. Idempotent. |
| `devserver.mjs` | Local stand-in for Vercel: static files + `api/*.js` functions + `vercel.json` rewrites/headers + `404.html`. |
| `browser-harness.cjs` | `launch(contextOptions)` for Playwright in the cloud sandbox. Routes every external `https://` request through `curl` (the sandbox Chromium does not trust the proxy CA), cached in `$TMPDIR/szvtech-harness-cache`. |
| `smoke.cjs` | Loads every page on phone (390x844 touch), phone + reduced motion, and desktop (1440x900). Fails on page errors, failing local requests, horizontal overflow, or a page that doesn't load `/assets/theme.js`. |

## Quick start

```sh
node tools/devserver.mjs 8790 &          # http://localhost:8790
node tools/smoke.cjs                     # all pages, 3 modes
node tools/smoke.cjs --only=/time/       # one page
node tools/smoke.cjs --skip=/qr/,/timer/ # leave out half-built pages (or SMOKE_SKIP=...)
```

Smoke options: first positional arg = base URL (default `http://localhost:8790`);
`--only=` / `--skip=` (or `SMOKE_ONLY` / `SMOKE_SKIP`) take comma lists of
paths; `SMOKE_WAIT=4000` lets slow pages settle longer; `SMOKE_STRICT_API=1`
turns `/api/*` 5xx responses from warnings into failures.

Pages are discovered automatically: `/`, `/404.html` and every folder with an
`index.html` (skipping `more/`, `api/`, `tools/`, `node_modules`). A new page
is covered the moment its folder exists.

## devserver details

- `/api/<name>` runs the default export of `api/<name>.js` as `(req, res)`,
  re-imported when the file changes. `_*.js` / `_*.mjs` (tests) are never
  routed, same as on Vercel. `req.query`, `res.status()`, `res.json()`,
  `res.send()` exist for Vercel-style handlers.
- Functions that fetch the internet (e.g. `api/zmanim.js` -> chabad.org) need
  the agent proxy. If they fail, start the server with
  `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node tools/devserver.mjs`.
- Everything is served `Cache-Control: no-store`.

## Writing your own checks

```js
const { launch } = require('/home/user/szvtech.org/tools/browser-harness.cjs');
const { browser, ctx } = await launch({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto('http://localhost:8790/time/');
await page.screenshot({ path: process.env.SCRATCH + '/time-phone.png' }); // scratchpad, never the repo
```

Real touch (synthetic `tap()` skips the hold/jitter paths that break on real
phones):

```js
const cdp = await ctx.newCDPSession(page);
const pt = (x, y) => [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }];
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(200, 400) });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(202, 401) }); // finger jitter
await page.waitForTimeout(600);                                                               // long-press
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
```

Env overrides for the harness: `PLAYWRIGHT_MODULE` (default
`/opt/node22/lib/node_modules/playwright`), `CHROMIUM_PATH` (default
`/opt/pw-browsers/chromium`).
