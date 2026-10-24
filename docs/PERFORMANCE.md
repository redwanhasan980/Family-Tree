# Performance

Measured results for the performance requirements (SRS §6, NFR-PERF-\*). Rerun them when a view's rendering changes; P8-07 repeats them before release.

## Tree view benchmark (P4-13, NFR-PERF-03, risk R-04)

**Target:** a 500-person tree renders in under 1 s once its data is loaded, and pan and zoom run at 50 fps or more on a mid-range phone. 2,000 people are supported with viewport culling.

**Method.** `pnpm bench:tree [tree] [phone|desktop] [throttle]` (`scripts/bench-tree.ts`) drives the production build (`pnpm build && pnpm start --port 3100`) against the emulators' demo trees (`pnpm seed`), with Chromium's CPU slowed down 4× to stand in for a mid-range phone, as the plan asks. "Phone" is a Pixel 7 viewport (412 × 915) and "desktop" is 1440 × 900. For each tree it measures:

- **Render:** from clicking *Expand all* (the whole tree laid out and drawn) to the next painted frame, the longest task while fitting it to the screen, and switching the direction (every card moves).
- **Pan and zoom:** frames per second during a 1 s drag and 30 wheel steps in and out, with the longest frame.

The data load times are for the local emulators, which are much slower than Firestore for big trees. They are recorded but say nothing about production (NFR-PERF-02 is measured in P8).

**Results** (2026-10-23, 4 × Intel Xeon 2.1 GHz cloud VM, Chromium 4× throttled):

| | 500 · phone | 2,000 · phone | 500 · desktop | 2,000 · desktop |
| --- | --- | --- | --- | --- |
| Expand all → painted | 112 ms | 245 ms | 194 ms | 401 ms |
| Fit to screen, longest task | 97 ms | 165 ms | 118 ms | 188 ms |
| Cards drawn at fit (10% zoom) | 111 | 121 | 185 | 200 |
| Switch direction → painted | 693 ms | 268 ms | 407 ms | 217 ms |
| Pan at fit | 60 fps | 60 fps | 59 fps | 59 fps |
| Zoom in | 57 fps | 49 fps | 53 fps | 52 fps |
| Pan zoomed in | 60 fps | 60 fps | 60 fps | 60 fps |
| Zoom out | 59 fps | 59 fps | 55 fps | 51 fps |
| Longest frame in a gesture | 50 ms | 183 ms | 150 ms | 133 ms |
| Data loaded (emulator) | 5.0 s | 15.9 s | 4.7 s | 15.8 s |

**Decision: the Canvas2D fallback (R-04) is not needed.** On the 500-person fixture every render finishes well under 1 s and every gesture runs at 53–60 fps. The 2,000-person tree stays usable (49–60 fps). Its slowest moment is a single frame of up to about 180 ms when a gesture ends and the cards that came into view are drawn.

**Changes the benchmark led to:**

- Connector lines are not culled, so they are drawn by a memoized component: re-rendering after a pan no longer compares thousands of paths. This cut the largest script task at the end of a zoom from 196 ms to 126 ms.
- Cards and expand/collapse toggles are memoized, so only the cards that come into view render.
- `formatYear` reuses one `Intl.NumberFormat` per language instead of creating two per card.

**Worth revisiting** (P8-07): switching the direction of a 500-person tree on a phone animates every visible card (about 0.5 s of style work at 4×); animations are already off above 300 cards. The end-of-gesture frame on the biggest trees could be split across frames if real phones show it.

## Circle view (P6-05)

**Method.** A Playwright script against the production build and the demo trees (as above, Chromium 4× throttled): change the depth control between 5 and 8 rings and time it to the next painted frame, then double-tap an arc and count animation frames while it zooms.

**Results** (2026-10-23, same machine):

| | 500 · phone | 500 · desktop | 2,000 · desktop |
| --- | --- | --- | --- |
| Arcs drawn (8 rings) | 379 | 379 | 1,512 |
| One ring more or less → painted | 0.2–0.3 s | 0.2–0.3 s | about 0.8 s |
| Zoom into a person | about 25 fps | about 27 fps | no animation (over 400 arcs) |

**Changes the measurements led to:** while zooming, the arcs are drawn by one light layer of plain paths (no labels, handlers or per-arc hooks); the full, labelled arcs return when the zoom ends. That raised the zoom from about 10 to about 25 frames per second on the throttled 500-person circle. Above 400 arcs re-centring jumps without animating.

**Worth revisiting** (P8-07): changing the ring count re-renders every arc; on the 2,000-person tree at 8 rings that is about 0.8 s at 4× throttle (about 0.2 s unthrottled).

## List and Family card views (P6 exit check)

**Method.** A Playwright script against the production build and the 500-person demo tree, Chromium at 4× CPU throttle: open a child's family four times and time it to the next painted frame; switch to the List view and time it the same way; then scroll the list 80 px per frame for 60 frames and count the frames drawn.

**Results** (2026-10-24):

| | 500 · phone (360×740) | 500 · desktop (1440×900) |
| --- | --- | --- |
| Family card: open a child's family → painted | 0.2–0.4 s | 0.3–0.5 s |
| Switch to the List view → painted | about 0.5 s | about 0.8 s |
| List: 60 scroll steps | 60 frames in 0.97 s (about 60 fps), 72 rows in the page | 60 frames in 0.98 s |

Nothing needed changing. The List draws only the rows on screen above 200 rows (LV-05); with the default three generations open, the 500-person tree has fewer.

