# /net speed test — parked

The speed test is built and tested but switched off: each run moves ~20–70 MB
through Vercel, and strangers could burn the free bandwidth allowance.
Nothing on the live page loads it or calls `/api/speed`.

## Parked pieces

| file | what |
| --- | --- |
| `api/_speed.js` | The endpoint (GET streams N random bytes ≤ 25 MiB, POST counts and discards ≤ 25 MiB). The leading `_` stops Vercel deploying it. |
| `api/_speed.test.mjs` | Its tests: `node api/_speed.test.mjs` (they import `./_speed.js`). |
| `net/speed.js` | The engine: ping, then parallel download/upload streams with byte budgets (Quick 15/6 MB, Standard 50/20 MB) and time limits. |
| `net/speed-card.js` | The whole card: markup, CSS (injected), dial and throughput canvases, history (`localStorage` key `net-hist`, plus `net-mode`), and the G / Esc keys. |
| `net/stats.js` | Its helpers stay there: `throughput`, `windowRate`, `nextChunk`, `fmtMbps`, `unitMbps`, `gaugePos`, `MARKS`. |
| `net/net.js` | Already has the hooks the card uses: the `net:speed` / `net:ping` window events (the latency monitor pauses during a test and plots the test's pings) and `window.NET_EDGE` (route shown under the result). |

## Turning it back on

1. `git mv api/_speed.js api/speed.js`. In `api/_speed.test.mjs`, change the
   import to `./speed.js`. Then run `node api/_speed.test.mjs`.
2. In `net/net.js`, inside `init()`, add:
   ```js
   import('/net/speed-card.js').then((m) => m.mountSpeedCard());
   ```
   The card inserts itself as the first card of `.board`. It adds the
   `has-speed` class, which switches the 12-column desktop grid to: speed + you,
   then latency full width, then DNS + device.
3. Update the copy: in `net/index.html`, add "a speed test" back to the meta
   description and `<kbd>G</kbd> test` to the footer keys. Change the footer
   line to "Your speed & DNS history stay on this device."
4. Run `python3 tools/cache-bust.py` and the smoke test, then check a run on a
   phone.

## Last verified (before parking)

Against a 20 / 5 Mbps, 30 ms emulated link, the full page measured 20.0 down
and 4.72–4.74 up (six runs, phone and desktop). Vercel caps request bodies at
~4.5 MB, so uploads go in 4 MB chunks. If big downloads fail, the engine drops
to 4 MiB requests.
