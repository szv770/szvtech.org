# Site theme

One accent palette for every page. A theme picked anywhere is saved once and
every page, including new ones, paints itself with it **before first paint**.
Tabs that are already open recolor live.

Source of truth: [`/assets/theme.js`](theme.js). It is a small classic script
with no dependencies.

## Adding a new page

```html
<head>
  <meta charset="utf-8">
  <meta name="theme-color" content="#05050a">   <!-- optional; theme.js tints it -->
  <script src="/assets/theme.js"></script>       <!-- FIRST, before any stylesheet -->
  <link rel="stylesheet" href="/your/page.css">
</head>
```

```css
:root {                      /* fallbacks only (no JS); theme.js overrides them */
  --a1: #8b5cf6; --a2: #22d3ee; --a3: #e879f9;
  --grad: linear-gradient(100deg, var(--a1), var(--a3) 45%, var(--a2));
}
.button { background: var(--grad); }
.glow   { box-shadow: 0 0 40px color-mix(in srgb, var(--a1) 40%, transparent); }
.link   { color: var(--a2); }
```

Don't hardcode accent hex or `rgba(139,92,246,…)`. For translucency, use
`color-mix(in srgb, var(--a1) N%, transparent)`, which also cross-fades, or
`rgba(var(--a1-rgb), .N)`, which doesn't animate.

Optional extras:

| Want | Do |
| --- | --- |
| Theme dots on the page | `<span data-szv-theme-dots></span>` (auto-mounted, styled by theme.js) |
| Page owns the keyboard (terminal, game) | `<html data-theme-keys="off">` turns off `t` cycling |
| Canvas / WebGL / JS colors | read `SZVTheme.palette()`, repaint in `SZVTheme.on(cb)` |
| Your own gradient | give it its own name (`--grad404`, `--tgrad`); `--grad` is set by theme.js |
| A mode that must ignore the theme (e.g. /time bedside) | override the vars with `html.your-mode:root { --a1: … }` (beats theme.js) |

## Palettes

| name | a1 | a2 | a3 | a1-hi | a2-hi | a3-hi | a12 | a1-lo | meta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **violet** (default, original look) | `#8b5cf6` | `#22d3ee` | `#e879f9` | `#a78bfa` | `#67e8f9` | `#f0abfc` | `#5b8cff` | `#5b3cc8` | `#05050a` |
| cyan | `#22d3ee` | `#3b82f6` | `#5eead4` | `#67e8f9` | `#93c5fd` | `#99f6e4` | `#2ea9f2` | `#0e6a86` | `#03080b` |
| magenta | `#ff2fa0` | `#8b5cf6` | `#ffb86b` | `#ff7cc4` | `#a78bfa` | `#ffd4a3` | `#c546cb` | `#a3125f` | `#0a0408` |
| lime | `#a3e635` | `#22d3ee` | `#fde047` | `#bef264` | `#67e8f9` | `#fef08a` | `#62dd92` | `#4d7c0f` | `#060903` |
| ember | `#fb7185` | `#fbbf24` | `#fb923c` | `#fda4af` | `#fde68a` | `#fdba74` | `#fa9858` | `#9f1239` | `#0a0505` |
| ice | `#60a5fa` | `#e2e8f0` | `#a5b4fc` | `#93c5fd` | `#f8fafc` | `#c7d2fe` | `#a1c6f5` | `#1e3a8a` | `#05070b` |

`meta` is written to `<meta name="theme-color">` only when the page uses the
shared `#05050a`. /time keeps its pure black.

## CSS variables (set on `html:root`)

| variable | meaning |
| --- | --- |
| `--a1` `--a2` `--a3` | accents: primary, secondary, tertiary |
| `--a1-rgb` `--a2-rgb` `--a3-rgb` | `r, g, b` triplets for `rgba(var(--a1-rgb), .3)` |
| `--a1-hi` `--a2-hi` `--a3-hi` | lighter tints |
| `--a12` | blend between a1 and a2 |
| `--a1-lo` | deep, dark a1 |
| `--grad` | `linear-gradient(100deg, a1, a3 45%, a2)` |
| `html[data-theme="lime"]` | the current theme name, for selectors |

The color variables are registered as `<color>`, so a change cross-fades over
0.8s. Under `prefers-reduced-motion` it swaps instantly, and a hidden tab
always swaps instantly.

## JavaScript API: `window.SZVTheme`

```js
SZVTheme.get()            // 'violet'
SZVTheme.set('lime')      // saves, applies, fires `szv:theme`; returns false for unknown names
SZVTheme.list()           // ['violet','cyan','magenta','lime','ember','ice']
SZVTheme.on((name, palette, source) => {})  // every change (here or another tab); returns off()
SZVTheme.palette()        // { name, label, a1, a2, a3, a1hi, a2hi, a3hi, a12, a1lo, meta,
                          //   rgb: { a1: [139,92,246], ... } }
SZVTheme.cycle(±1)        // next/previous theme
SZVTheme.mount(el)        // render theme dots into el (done automatically for [data-szv-theme-dots])
window.addEventListener('szv:theme', (e) => e.detail /* { name, palette, previous, source } */)
```

`source` is `'local'`, `'cycle'` or `'storage'` (the change came from another
tab).

## How the choice travels

- **Saved:** `localStorage['szv-theme']`. This is the key the homepage terminal
  already used, so existing picks carry over. A few legacy key names are
  migrated.
- **Other tabs:** the `storage` event re-applies the theme live, with no
  reload.
- **Share link:** `?theme=cyan` on any URL. It applies to that tab's session
  (`sessionStorage`) without overwriting the visitor's saved choice. An explicit
  pick replaces it.
- **Ways to change it:** `theme <name>` in the homepage terminal and in the
  /learn terminal (both tab-complete names; `theme next` also works), the dots
  (homepage menu and footer, /time location sheet, /learn cheat sheet, /hack,
  /contact, /404 footers, /sys gate and sidebar), and the `t` key (Shift+T goes
  backwards). The `t` key is ignored while typing in a field.
