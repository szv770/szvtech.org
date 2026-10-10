# szvtech.org — playbook for Claude

Read this first. It is how the owner wants this site built, so they never have
to re-explain it.

## 1. What this is

- **szvtech.org** is the owner's personal playground: a premium, motion-rich,
  playful site (particles, glass, gradients, secret terminal, easter eggs).
- It is also the home for **"tools I'd normally use another site for, but
  perfect for me"** — e.g. `/time` is their own time.is (NYC clock, server-synced,
  Chabad.org zmanim, bedside mode). New tool pages follow that model: do one
  job beautifully, mobile-first, with personality.
- **Private.** Every page is `noindex` (meta tag + `X-Robots-Tag` header in
  `vercel.json`). No SEO, no analytics, no sharing widgets.

## 2. How the owner likes to work (important)

- **Ask first for anything non-trivial.** Use the AskUserQuestion tool with 2–4
  concrete options and mark a recommended default, a few questions at most.
  Skip this when they say "just do it" or the request is already specific.
- **Parallelize.** Split bigger work into background agents, each owning
  separate files/folders (never two agents on the same file). Shared files
  (`assets/main.js`, `vercel.json`, `index.html`) get one owner, or are edited
  by you after the agents finish.
- **Ship live when done** unless told otherwise. They often just say "send
  live" — that means: commit, PR, merge, verify on www (see §9).
- **Plain language.** The owner is non-technical and mostly on an **Android
  phone with "Remove animations" ON** (= `prefers-reduced-motion: reduce`).
  Explain what changed in terms of what they will see/tap, not code.
- **Keep them posted briefly** during long work (one line per milestone).
- **Never claim untested things.** Say exactly what was verified and how:
  "tested in phone emulation (390×844, touch, reduced motion)" is not "tested
  on your phone". Flag what only a real device can confirm.
- **Quality bar:** "feel native and premium on my phone". Mobile first, then
  make desktop great too.

## 3. Site map

| path | what | how people find it |
| --- | --- | --- |
| `/` | Homepage: Three.js particle hero that morphs on scroll, GSAP/ScrollTrigger + Lenis, kinetic type, touchable glass cards, stats, learn teaser | — |
| hidden terminal (on `/`) | Fake shell in `assets/main.js` (`Term`): `help`, `whoami`, `about`, `date`, `ls`, `echo`, `theme <name>`, `matrix`, `party`, `learn`, `exit`; **secret** (not in `help`): `hack`, `more`, `contact`, `sys`, `admin`, `sudo`, `snake`; real shell commands (`dir`, `cd`, …) hint toward /learn | Backtick or Ctrl/Cmd+K; floating `>_` button + footer link on touch; console message |
| `/learn/` | Training terminal: missions, XP, real Windows/Linux commands | Nav item 05 + menu, teaser section, footer `cd learn`, `learn` command, typing `cmd`/`learn` anywhere on `/`, 404 link |
| `/time/` | Full-screen NYC clock synced to `/api/now`; ~180 cities, ZIP, zmanim (Chabad.org), Hebrew date, live sky, bedside mode (long-press) | Direct URL (owner's bookmark) |
| `/hack/` | Parody "breach console" that ends in a gotcha → /learn | secret `hack` command |
| `/contact/` | Gag "transmission into the void" — sends nothing | secret `contact` command |
| `/more/` | Old legacy "Access Console" page (not themed; smoke test skips it) | secret `more` command |
| `/sys/` | **Inert honeypot decoy**: fake 7-level "internal control panel" maze for snoopers, ends by pointing them to ethical hacking (TryHackMe, HTB, OWASP, HackerOne). All data fake | `vercel.json` rewrites tempting paths (`/admin`, `/wp-admin`, `/.env`, `/login`, `/phpmyadmin`, `/.git/config`, …) → `/sys/index.html`; `sys`/`admin` commands; a "TODO(ops)" breadcrumb comment in `index.html` |
| `/404.html` | Animated particle 404 with a hidden mini-game | any bad URL |
| `/api/now` | Server time JSON (no-store) for clock sync | used by /time |
| `/api/zmanim` | Validated Chabad.org zmanim RSS → JSON (`zip` or `cityid`, `date`, `days`) | used by /time |

Hidden pages (`hack`, `more`, `contact`, `sys`) are **never linked visibly**;
discovery is part of the fun. New tool pages may be in the open (nav/menu) or
hidden — ask the owner which.

## 4. Stack & conventions

- **Static files on Vercel, no build step.** HTML/CSS/JS served as-is.
  Zero-config Node functions: `api/<name>.js` with `export default function
  handler(req, res)` (plain Node `res.setHeader/statusCode/end`, ES modules,
  no dependencies, Node 18+ global `fetch`).
- **CDN libraries only, pinned to exact versions** (cdnjs or jsdelivr), e.g.
  `three@0.160.0` via importmap, `gsap/3.12.5`, `lenis@1.1.13`. No npm installs
  for the site.
- **Fonts:** Syne (display), Inter (body), JetBrains Mono (mono) from Google Fonts.
- **Look:** near-black `#05050a` background, accent gradient
  `var(--grad)` (violet→magenta→cyan by default), film grain, glass panels
  (`rgba(255,255,255,.04–.07)` + `backdrop-filter: blur()` + hairline
  `rgba(255,255,255,.09)` borders), soft glows, `cubic-bezier(.16,1,.3,1)`
  easing, mono micro-labels. Motion everywhere, but purposeful.
- **Layout per page:** `/<page>/index.html` + optional `/<page>/<page>.css`,
  `/<page>/<page>.js` (or `ui.js`, data modules…). **Always absolute asset
  paths** (`/time/time.css`), never relative. ES modules where useful.
- **Theme system** (`assets/theme.js`, docs in `assets/THEME.md`): six
  palettes, chosen anywhere, applied site-wide before first paint. Every page
  must use it (see checklist). Don't hardcode accent hex values.

## 5. New page checklist (the recipe)

When building a new page, do all of this:

1. **One folder** `/<name>/index.html` (+ css/js in the same folder). Don't touch other pages' folders.
2. **Head**, in this order: `charset`; `viewport` with `viewport-fit=cover`;
   `<meta name="robots" content="noindex, nofollow">`; `<title>X · SZVTECH</title>`;
   `<meta name="theme-color" content="#05050a">`; inline SVG data-URI favicon
   (copy the homepage one); **`<script src="/assets/theme.js"></script>` before any
   stylesheet**; fonts; your CSS.
3. **Theme:** use `var(--a1/--a2/--a3/--grad)` (fallback values in `:root`),
   `color-mix(in srgb, var(--a1) N%, transparent)` for translucency. Canvas/WebGL:
   read `SZVTheme.palette()` and repaint in `SZVTheme.on(cb)` (or `szv:theme`
   event). Optional theme dots: `<span data-szv-theme-dots></span>`. If the page
   owns the keyboard, `<html data-theme-keys="off">`.
4. **Fits every screen:** phone portrait + landscape, tablet, desktop. Measure,
   don't guess: no horizontal scroll, `env(safe-area-inset-*)` padding, `100dvh`
   not `100vh`, inputs ≥ 16px font (stops iOS zoom), tap targets ≥ 44px, no
   hover-only interactions, `-webkit-tap-highlight-color: transparent`, and
   `user-select: none; -webkit-touch-callout: none` on interactive/long-press
   areas (Android long-press selects text otherwise) — but keep real content
   (results, codes) selectable/copyable.
5. **Reduced motion = calmer, not dead.** Keep timed sequences, feedback and
   pacing; drop heavy motion (shake, particles bursts, parallax, big transforms),
   crossfade instead of slide. The owner always has it on — design for it.
6. **Real touch handling:** pointer/touch events with movement slop (~10px), hold
   vs scroll vs tap distinguished, `touchcancel` handled, `touch-action` set only
   where you own the gesture. Test with CDP `Input.dispatchTouchEvent` incl.
   jitter (see `tools/README.md`) — Playwright `tap()` lies.
7. **Feature-detect** wake lock (`'wakeLock' in navigator`), haptics
   (`navigator.vibrate`, skipped under reduced motion), clipboard, share, etc.
   Wrap in try/catch; the page must work without them.
8. **`← SZVTECH` link home** (`<a href="/">&larr; SZVTECH</a>`, subtle, top corner).
9. **Discovery path:** add a terminal command in `assets/main.js` (in `PUBLIC`
   with a `help` line, or in `SECRET` via `portal('/name/')`), and nav/menu/footer
   entries if the owner wants it visible.
10. **Escape user input**; persist prefs in `localStorage` with try/catch.
11. **Run `python3 tools/cache-bust.py`** after the last CSS/JS edit — required
    (see §10). Then run the smoke test (§8).

## 6. Time & data

- Anything clock-precise uses **server-synced time**: copy the `/api/now` sync
  from `time/ui.js` (NTP-style samples, lowest-RTT median, slewed offset,
  re-sync on visibility/online). Never trust `Date.now()` alone for display.
- External data that needs CORS goes through a **small `api/` function**:
  fixed upstream URL, strict parameter validation (regex/whitelist, length
  limits), timeout, size cap, normalized JSON out, sensible caching headers
  (`s-maxage` + `stale-while-revalidate` for stable data, `no-store` for live
  data). **Never an open proxy.** Model: `api/zmanim.js`.
- **Zmanim follow Chabad.org:** `/api/zmanim` (ZIP or Chabad city id) first;
  `time/zmanim.js` is the offline fallback calibrated to Chabad.org rounding.
  Use Chabad terms (Alos, Netz, Sof Zman Shema, Shkiah, Tzeis, Shabbos…).
- Add unit tests for logic; API tests live in `api/_<name>.test.mjs` (the `_`
  keeps Vercel from deploying them).

## 7. Safety rules

- Everything is **inert and harmless to every visitor**, including would-be
  attackers poking at `/sys`. No real exploits, no payloads, no scanning back.
- **No tracking, analytics, fingerprinting** or third-party beacons. No data
  leaves the browser except for explicit features (e.g. a ZIP sent to
  `/api/zmanim`).
- Decoy/parody data is always **obviously fake** (no real-looking creds,
  people, or orgs).
- **Religious content** only where the owner asked (zmanim/Hebrew date on
  `/time` is fine). The main site stays universal. The quiet inspiration in
  `/learn` (line of the day, lines hidden in the pretend files) is inspired by the
  Rebbe's teachings but must never mention religion, Judaism or any figure —
  keep it universal and subtle, never preachy.
- `innerHTML` only with escaped text (copy an `esc()` helper, e.g. from `assets/main.js` or `time/ui.js`), otherwise `textContent`.
- **No secrets in the repo**, no API keys in client code.

## 8. Testing & verification

- Start the local server: `node tools/devserver.mjs 8790 &` (static + `api/*.js` + rewrites).
- **Smoke test:** `node tools/smoke.cjs` — auto-discovers every page; phone
  390×844 touch, phone reduced-motion, desktop 1440×900; fails on page errors,
  failed local requests, horizontal overflow, missing theme.js. Use
  `--skip=/x/` only for pages someone else is still building, and say so.
- **Per-page Playwright checks** with `tools/browser-harness.cjs` (external
  https goes through curl because sandbox Chromium distrusts the proxy CA).
  Sizes to cover: 360×740, 390×844, 412×915 (Android), 844×390 landscape,
  768×1024, 1024×768, 1440×900, 1920×1080; plus `reducedMotion: 'reduce'`.
- **Screenshots go to the session scratchpad, never into the repo.** Actually
  look at them, critically, and iterate until it looks premium.
- Test real touch (CDP touch events with jitter, long-press, swipe vs scroll),
  theme switching (`?theme=lime`, `SZVTheme.set()`), and keyboard focus.
- Unit tests: `node time/zmanim.test.mjs`, `node api/_zmanim.test.mjs`,
  `node api/_now.test.mjs` (+ any new ones). All must pass.
- Report honestly: emulation ≠ the owner's real phone.

## 9. Shipping

- Work on the session's designated branch (`claude/…`); clear commit messages
  (what the owner will notice, then key technical points).
- Before committing: cache-bust, smoke test, unit tests. Never commit
  screenshots, scratch scripts, or half-finished agent output.
- Open a PR (body: what changed + how it was tested), and when the owner wants
  it live, **merge with a merge commit**. Vercel auto-deploys `main` to
  production in ~1 minute.
- **Verify live** with curl against `https://www.szvtech.org/<page>/`
  (Cloudflare is in front): check the page returns 200 and serves the **new
  `?v=` hashes**; fetch a changed asset to confirm its content.
- Vercel is the host. Cloudflare Workers/Pages builds were disconnected —
  ignore any Cloudflare build ideas.
- A stop hook expects work to be committed and pushed at the end of a session.

## 10. Gotchas learned

- **Cloudflare caches browser assets ~4h.** Without `tools/cache-bust.py` the
  owner's phone runs stale CSS/JS. Always run it (it also stamps module imports).
- **Relative asset paths break** under `vercel.json` rewrites (`/admin` serves
  `/sys/index.html`). Always absolute.
- **Android long-press selects text / opens menus** — handle it on anything
  holdable.
- **Emulation passing ≠ real phone.** Synthetic taps skip jitter, `touchcancel`,
  scroll intent. Use CDP touch with jitter and say what wasn't device-tested.
- **The owner has reduced motion on.** If a feature only works with animation,
  it's broken for them.
- Files in `api/` that aren't endpoints (tests) **must start with `_`**.
- `100vh` lies on mobile (use `dvh`); iOS zooms inputs < 16px.
- Don't commit screenshots or test output.

## 11. Ideas backlog (ideas only — ask before building)

Weather for the saved city · zmanim/Shabbos widget or compact zmanim page ·
unit converter · currency converter (via a small cached `api/` function) ·
QR generator/scanner · timers/stopwatch/countdowns · world clock board ·
quick notes (local only) · personal link shortener · color picker/palette tool ·
Hebrew calendar / date converter · daily dashboard combining time, weather, zmanim.
