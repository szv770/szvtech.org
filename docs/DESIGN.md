# SZVTECH — design & build guide (start here for any new page or homepage change)

For a Claude session with **zero context**. Read `CLAUDE.md` first (rules, process, shipping),
then this file (what it should *look and feel* like, plus the homepage recipe).
Theme internals: `assets/THEME.md`. Test tooling: `tools/README.md`.

> **Fastest start:** copy the closest existing page, then change it.
> - Simple tool, one scroll column → `/weather/` (small, modern, follows every rule)
> - Full-screen, gesture-owned, widgets → `/time/`, `/zmanim/`
> - Embeddable module (`mount(el, opts)`) → `/timer/`, `/world/`, `/qr/`, `/convert/`
> - Heavy graphics (WebGL globe, canvas) → `/sky/`
> - Homepage → `index.html` + `assets/style.css` + `assets/main.js` (big; see §6)

---

## 1. The feeling (one paragraph)

A dark, quiet, expensive-feeling playground. Near-black canvas, one glowing violet→magenta→cyan
accent, frosted glass panels, fine hairlines, big confident display type, tiny mono labels like
instrument readouts. Motion is smooth and purposeful (springy easing, soft glows), never noisy.
Every page does **one job beautifully**, with a bit of personality. It must feel *native on an
Android phone first*, then great on desktop. If it looks like a generic dashboard or a template,
it is wrong.

## 2. Design tokens (copy these, don't invent new ones)

| token | value | use |
| --- | --- | --- |
| `--bg` | `#05050a` | page background (also `<meta theme-color>`) |
| `--bg-2` | `#0a0a14` | slightly lifted surfaces |
| `--fg` | `#f3f1ff` | primary text |
| `--muted` / `--dim` | `rgba(226,224,255,.56)` / `.34` | secondary / tertiary text |
| `--line` | `rgba(255,255,255,.09)` | hairline borders |
| `--glass` / `-2` / `-b` | `rgba(255,255,255,.04)` / `.07` / `.11` | panel fills / hover / strong border |
| `--a1` `--a2` `--a3` | violet `#8b5cf6`, cyan `#22d3ee`, magenta `#e879f9` (default) | **theme accent; set by `theme.js`, user can switch among 6 palettes** |
| `--grad` | `linear-gradient(100deg, a1, a3 45%, a2)` | signature gradient (text, bars, buttons) |
| `--ease` | `cubic-bezier(.16, 1, .3, 1)` | **all** transitions |
| `--f-display` | Syne 600/700 | big numbers, titles, place names |
| `--f-body` | Inter 400/500/600 | paragraphs, rows |
| `--f-mono` | JetBrains Mono 500–700 | micro-labels, times, chips (UPPERCASE, `letter-spacing .04–.14em`, 10–13px) |

Rules: never hardcode accent hex; use `var(--a1…)` and `color-mix(in srgb, var(--a1) 20%, transparent)`.
Put fallback values for `--a1/2/3/--grad` in your page's `:root` (theme.js overrides them).
Colours that are *not* the accent (weather sky tints, ISS yellow, UV scale) are fine, but keep them
muted/dark so the accent still reads as the brand.

## 3. Components (the visual vocabulary)

- **Glass card:** `border:1px solid var(--line); background:rgba(255,255,255,.055); border-radius:22–24px; backdrop-filter:blur(16–18px)`. Optional inner top highlight `inset 0 1px 0 rgba(255,255,255,.1)` and a big soft drop shadow. Padding 14–24px.
- **Section label:** mono, uppercase, muted, with a 22px gradient hairline before it (`.label` on the homepage), often numbered `(02) Tools`.
- **Big display text:** Syne 700, tight tracking (`-.035em`), `clamp()` sizes; hero numbers use a white→accent text gradient.
- **Gradient text/bars:** `background: var(--grad)` + `-webkit-background-clip:text` or on a 6px rounded bar (see weather 7-day range bars).
- **Chips / pills:** 44px min tap size, round, glass fill, mono 13px, `:active{transform:scale(.94)}`.
- **Bottom sheet (pickers/settings on phones):** `position:fixed` bottom, 26px top radius, dark glass `rgba(14,12,28,.94)` + blur, grab handle, dimmed backdrop, slides up with `--ease`; Escape + backdrop close; focus returns. Copy `/weather/` (`#sheet`).
- **Skeleton:** shimmering glass blocks while loading (calm pulse under reduced motion).
- **Live dot:** tiny pulsing accent dot = "live/active" (`.live-dot`).
- **Background atmosphere:** radial glows in accent colours (`radial-gradient(… color-mix(a1 18–22%) … transparent)`), film grain, and sometimes a context tint (weather sky gradient, sky starfield). Never flat grey.
- **Icons:** hand-drawn inline SVG, 24×24 grid, `stroke="currentColor"`, `stroke-width 1.6`, round caps/joins, no fills (see `ICONS` in `assets/tools.js`). Illustrative icons (weather) may use soft fills but stay simple and flat with a subtle glow `drop-shadow`.
- **Copy voice:** short, warm, a little witty; plain words ("Looks like it sticks around."). Mono micro-labels are terse nouns. No marketing fluff, no exclamation spam.

## 4. Motion, touch, and "reduced motion" (the owner has it ON)

- Easing is always `--ease`. Durations: taps 200–300ms, panels 350–500ms, ambient loops 6–60s.
- **Reduced motion = calmer, not dead.** Under `@media (prefers-reduced-motion: reduce)`: keep loading cues, pacing, colour/fade changes and slow ambient loops (slower/smaller); drop shake, particle bursts, parallax, big slides, spinning. Sheets crossfade instead of slide. Canvas particles (rain/snow) simply don't start. Wrap decorative animation in `@media (prefers-reduced-motion: no-preference)`.
- Touch: ≥44px targets, `-webkit-tap-highlight-color:transparent`, `user-select:none; -webkit-touch-callout:none` on tappable/long-press things (but keep result text selectable), pointer events with ~10px slop, handle `touchcancel`, `touch-action` only where you own the gesture, no hover-only features, inputs ≥16px font.
- Layout: `100dvh`, `env(safe-area-inset-*)`, no horizontal scroll at 360px, landscape phones handled (`@media (max-height:460px) and (orientation:landscape)`), 2–3 column grids on desktop (`min-width:700px`), content max-width ~760px for single-column tools.

## 5. New page, step by step (extends `CLAUDE.md` §5)

1. `mkdir <name>`; create `index.html`, `<name>.css`, `<name>.js` (ES module). Copy the `<head>` from `/weather/index.html` (robots noindex, `viewport-fit=cover`, theme-color, SVG favicon, **`/assets/theme.js` before any stylesheet**, Google Fonts, absolute asset paths).
2. Shell: fixed tint/background layer → `<header>` with `← SZVTECH` link (+ small chips top-right) → `<main>` with hero (big thing the user came for) → glass cards → small footer/credit.
3. State: location = shared `szv-time-loc` via `/zmanim/data.js` (`savedLoc, saveLoc, CITIES, locFromParams, zipLoc…`). Prefs → `localStorage` in try/catch. Last good data cached so it opens instantly/offline.
4. External data: new `api/<name>.js` (see `api/weather.js`, `api/zmanim.js`): fixed upstream URL, validated params, timeout, size cap, normalized JSON, `s-maxage` + SWR; tests in `api/_<name>.test.mjs`. No keys in the repo.
5. Escape every dynamic string (`esc()`), or use `textContent`.
6. Add the page to the homepage (§6), run `python3 tools/cache-bust.py`, run tests + smoke (§7), screenshot and *look*.

## 6. Homepage recipe

The homepage is `index.html` (markup) + `assets/style.css` + `assets/main.js` (GSAP/ScrollTrigger, Lenis smooth scroll, Three.js hero, terminal). **One owner at a time** for these files.

Section order: Hero → Morph (sticky scroll-morph, 4 stages) → **Tools** → Kinetic type → Bands → Obsessions (horizontal cards) → Numbers (stats) → Learn teaser → Outro/footer. Nav/menu items are numbered 01–06.

**Add a tool (the common case, one line):** in `assets/tools.js` add
`{ id, path:'/x/', name, blurb, icon, live:true }` (reuse an icon from `ICONS` or add a 24×24 stroke icon). It then appears in the Tools grid, mobile menu chips, footer row, and terminal automatically. `live:false` shows a "soon" chip.
- The grid is a bento: first card is 2×2; layout changes by live count (`.tools__grid[data-n="6"|"7"]` rules in `style.css`). **After adding tools, look at the grid at 390px and 1440px**; add a `data-n` rule if the last row looks orphaned (currently ≥10 tools use the default 4-column bento).
- **Make the card alive (optional, nice):** a tool without a widget shows a glowing glyph. Add a tiny live element in `WIDGETS` in `assets/main.js` (keyed by tool id; returns `{ tick(ms) }`) like Time (live clock), Zmanim (sun arc), Luach (Hebrew date), Timer (ring), or give `tools.js` a `demo:[…]` list to cycle text (Convert). Style under `.tw-*` in `style.css`. Good candidates not done yet: **Weather** (temp + icon from `/api/weather`, cached) and **Sky** (ISS lat/lon or Moon phase).

**Add/modify a homepage section:**
- Markup: `<section class="x" id="x"><span class="label mono">(07) Name</span><h2 class="h2 split-words">…</h2><p data-reveal>…</p></section>`. `split-words` = word-by-word title reveal; `data-reveal` = fade/rise on scroll; `data-tilt` = glass tilt; `data-magnetic` = magnetic hover; `data-scramble` = text scramble on mono labels; `data-cursor="Label"` = custom cursor text.
- CSS: add a commented block in `style.css` (`/* ===== Name ===== */`), give the section generous padding (`~12–16vh var(--gut)`), an ambient `::before` with two soft accent radial glows, and a `@media (max-width:…)` + reduced-motion tail. Use `--gut` for side padding.
- JS: register ScrollTrigger animations in `main.js`; there is a no-GSAP fallback that shows everything, and reduced motion must still show content.
- If you add a numbered section, update the desktop nav (`.nav__links`) **and** the mobile menu (`.menu__nav`) numbers/links.
- Hidden pages never get visible links (use `SECRET` + `portal('/name/')` in `main.js`).
- Keep the homepage fast on phones: no new heavy libs, no layout thrash, lazy canvas work, pause when off-screen/hidden tab.

## 7. Verify like the owner would (and be honest)

```sh
node tools/devserver.mjs 8790 &     # APIs that call the internet need:
# NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node tools/devserver.mjs 8790
python3 tools/cache-bust.py          # after the LAST css/js edit
node tools/smoke.cjs                 # slow (several minutes with many pages): run in background, or --only=/x/
node <area>/…test.mjs                # all unit tests: time/zmanim.test.mjs, api/_*.test.mjs, sky/sky.test.mjs, luach
```
- Screenshots → scratchpad (never the repo). Check 360×740, 390×844 (+ reduced motion), 844×390 landscape, 768×1024, 1440×900. **Look at them critically** and iterate; common catches: oversized inline SVG (needs explicit width/height), `[hidden]` overridden by `display:flex`, text wrapping at 360px, orphan grid cells.
- Tooling gotchas: Playwright `waitUntil:'networkidle'` never settles (fonts) → use `'load'` + `waitForTimeout`. Don't `pkill -f` a pattern that appears in your own command line (it kills the shell). `/luach/` has a known 10px desktop overflow on `main` (not new).
- Say exactly what was verified ("phone emulation 390×844, reduced motion") vs what only the owner's real Android phone can confirm (touch feel, sensors, permissions, GPU smoothness).

## 8. Quality checklist (don't ship until all true)

- [ ] Looks like the same site: tokens, glass, Syne/Inter/Mono, accent via variables, theme switch works (`?theme=lime`)
- [ ] Phone-first: no horizontal scroll at 360px, tap targets ≥44px, safe areas, `dvh`, inputs ≥16px
- [ ] Reduced motion is calm but complete (nothing important needs animation)
- [ ] Loading, empty, error and offline states designed (skeleton, retry button, cached data)
- [ ] `← SZVTECH` link, `noindex`, no tracking, user input escaped, no secrets
- [ ] On the homepage Tools grid/menu (and grid still looks balanced), cache-busted, tests + smoke pass
- [ ] Plain-language summary for the owner: what they will see/tap; what was and wasn't tested
