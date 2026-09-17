# CP-07 — Search UI island

## Goal

The one search box: typeahead, worker-hosted engine, lazy index load, URL
state, grouped tabs, highlights, hints, and a debug panel showing `why`.

## Definition of done

- The ten hint queries (Prov 25:2, Acts 13, John 3:16, in the beginning, search
  the scriptures, Abraham, Saul, Zechariah, Bethlehem, Antioch) work end to end
  in the browser.
- First search ready < 1 s after cold load on a throttled mid-phone profile
  (4× CPU, Slow 4G) — measured, recorded here. No main-thread jank.
- Keyboard accessible; `?debug=1` shows the plan and `why`.

## Tasks

- [x] `core/io/fetchSource.ts` (fetch + Cache API, immutable hashed URLs) and
      `core/worker/{protocol,worker,client}.ts`.
- [x] React island `SearchBox` + `SearchResults`: input, debounce 150 ms,
      `suggest` on keyup, `/?q=` via `replaceState` (encoded), tabs All /
      Passages / Verses / People / Places / Events, load more, highlighted
      snippets, hints panel when empty, "searching verses…" while text layer
      loads.
- [x] Prefetch text layer on idle after first paint.
- [x] Size budgets set for real in `scripts/size-budget.mjs` (core layer ≤ 200
      KB gz incl. engine).
- [x] Throttled measurement recorded.

## What was built

```
packages/core/src/io/fetchSource.ts      IndexSource over fetch + Cache API
packages/core/src/worker/protocol.ts     messages, AbortedError, latest-wins contract
packages/core/src/worker/worker.ts       serveEngine(scope) — the worker body
packages/core/src/worker/client.ts       createWorkerEngine(worker, init) — async API
packages/core/test/{worker,fetchSource}.test.ts
apps/web/src/search/                     search.worker.ts, engine.ts (singleton + idle
                                         preload + User Timing marks), urlState.ts,
                                         recent.ts, hrefs.ts
apps/web/src/components/search/          SearchPage, HeaderSearch, SearchBox,
                                         SearchResults, hits, DebugPanel, useEngine
apps/web/src/styles/search.css
apps/web/public/_headers                 immutable caching for hashed assets
apps/web/astro.config.mjs                preloadIslandChunks() post-build hook
apps/web/test/urlState.test.ts
scripts/size-budget.mjs                  the gates below
```

- `/` mounts `SearchPage` `client:load` with the engine files' hashes and a
  slim book table inlined as props; every other page mounts `HeaderSearch`
  `client:idle` (typeahead in place, submit navigates to `/?q=`). Both share
  one worker per page (`getEngine`).
- Worker: `init` opens the core layer; `preload('graph')` then
  `preload('text')` on `requestIdleCallback` (timeout 1 s) after hydration.
  Results re-run when a layer lands (`readyVersion`), so a `?q=` load shows
  entities first and fills in verses without a keystroke.
- URL: `/?q=<q>&tab=<group>&debug=1`, `replaceState` only, defaults omitted,
  `:` and `,` literal (`/?q=Prov%2025:2` — the 2020 hint form — reads and
  writes the same).
- Tabs are the non-empty groups in `all[]` order; All shows 3 per group with
  "N group →"; a group tab pages by 20; one non-empty group renders without
  the strip. Verses render the whole verse with `<mark>` from the snippet
  offsets and link to `/{book}/{c}#v{v}`; passages show the reference and
  its first three verses via `versesFor`; entities show label · sublabel ·
  verse count (`Hit.verseCount`, additive). Reference errors ("John has 21
  chapters, not 99") print above whatever the rest of the query still earns
  (invariant 5). "No results" quotes the plan's `why`.
- Keyboard: combobox/listbox with `aria-activedescendant`; ↑/↓ Enter Escape
  (close, then clear); Tab closes; `⌘K`/`Ctrl+K`/`/` focus; tabs are a
  `tablist` with ←/→/Home/End and focus follows "more →". Results announce
  through a visually-hidden `role="status"` (`aria-live="polite"`).
- Recent searches: `localStorage` (try/catch), last 10, passed to `suggest`
  as `recent`, and the last 5 listed beneath an EMPTY box on focus.
- `?debug=1`: layer status, `ready` flags, engine timings per phase and the
  worker round trip, `plan.why`, the clauses, and every hit's `why[]`.

## Measurements (2026-09-17, Lighthouse 13.4.1, `--throttling-method=devtools`, mobile emulation)

Served from a local static server that gzips and sends the `_headers`
`Cache-Control` rules (the Astro preview server does neither: without
`immutable` every preloaded file was re-validated on a ~580 ms round trip,
which is what Netlify's headers remove). Cold cache each run, `/?q=Saul`.
User Timing marks are what the page itself records (`search:*`).

| profile (4× CPU)            | FCP    | worker start | **core ready** | first results | graph ready | **verses shown** | long tasks | TBT |
| --------------------------- | ------ | ------------ | -------------- | ------------- | ----------- | ---------------- | ---------- | --- |
| Slow 4G (150 ms RTT, 1.6 Mbps) | 1.30 s | 2.74 s       | **2.81 s**     | 2.82 s        | 3.87 s      | **16.1 s**       | 0          | 0 ms |
| 4G (70 ms RTT, 9 Mbps)      | —      | 0.97 s       | **1.01 s**     | 1.01 s        | 2.33 s      | **4.7 s**        | 0          | 0 ms |

(4G FCP is omitted: with the custom throttle Lighthouse reported FCP = LCP =
2.37 s while every asset had landed by 0.94 s — a measurement artifact of that
configuration, not something the page does. Before the idle cap the graph
layer waited on `requestIdleCallback` until 2.72 s and verses came at 5.1 s.)

Reading the Slow 4G waterfall: every asset now starts at the first byte
(0.59 s) — the HTML carries `preload` for the two core files, `modulepreload`
for the island entry, renderer and their deps, and `prefetch` for the worker
chunk. The critical path is then bandwidth: `entities.index.json` (156 KB)
lands at 2.58 s and `react-dom` (66 KB) at 2.66 s; hydration posts `init` at
2.74 s and the engine opens 70 ms later. The **< 1 s target is not reachable
on Slow 4G by arithmetic** — 270 KB before the first search at 1.47 Mbps is
1.45 s of transfer after a 0.56 s first byte — and it is met on the 4G
profile the design's estimate was written against ("≈0.4–0.6 s on mid
Android/4G": we are at 1.0 s, of which ~0.25 s is react-dom's download
gating hydration). Verses on Slow 4G are the 2.1 MB text layer at 1.47 Mbps.

Before the loading fixes the same page measured core-ready **6.3 s** on Slow
4G: the engine fetched the whole 206 KB `manifest.json` for `status()` before
declaring ready, and HTML → island JS → its deps → worker → data were five
serial round trips. Those are the two things the loading plan changed.

Main thread: 0 long tasks, TBT 0 ms in every run; main-thread work 140–290 ms
per page load; `bootup` 4–95 ms. The engine's `JSON.parse` of the 860 KB
entity index and every search run in the worker.

Unthrottled (M-series Mac, Chrome): worker start 24 ms after hydration, core
ready +37 ms, first results +13 ms, graph +84 ms, text +7 ms after that;
search round trip 3–4 ms for "Saul".

**Browser vs CLI**: the fourteen queries (ten hints + `Paul Antioch`, `love in
John`, `John 3:16-18`, `Jerusalm`) run through the built worker in Chrome
return **byte-identical `all[]` ids and group totals** to
`node packages/core/bin/theographic.mjs search "…" --json` (14/14).

## Budgets (`node scripts/size-budget.mjs`, gzip)

| gate                    | measured | budget |
| ----------------------- | -------- | ------ |
| main-thread JS on `/`   | 74.2 KB  | 80 KB  |
| — react-dom (`client.js`) | 64.3 KB |        |
| — react runtime         | 3.0 KB   |        |
| — islands (SearchPage + shared) | 7.0 KB |    |
| search worker chunk     | 22.5 KB  | 60 KB  |
| core data layer         | 155.7 KB | 200 KB |
| text data layer         | 2137 KB  | report |
| graph data layer        | 84.9 KB  | report |
| all loaded JS (site)    | 75.9 KB  | 200 KB |

The task asked for a 60 KB main-thread gate. **react-dom/client alone is
64.3 KB gz** (React 19.3), so 60 cannot be met with React; the gate is set at
80 and the script says why. Preact + `preact/compat` (~5 KB) would bring the
main thread to ~15 KB and take ~0.2–0.25 s off the critical path on both
profiles (react-dom is the last download before hydration); the islands are
plain hooks and would run unchanged. That is a change to ADR-0001, not a
budget tweak — Robert's call.

## Decisions made

- **`fetchSource` lives in `core`.** `fetch`, `Response` and `caches` are
  browser APIs, not DOM APIs: identical in a Worker, a WebView and a page,
  none needs `document`. The file declares them narrowly (the package
  compiles with `types: []`) and says so in its header.
- **The worker never fetches the manifest.** The islands receive
  `engineManifest(manifest)` — the five engine hashes plus
  `format/source/counts` — as a prop, `fetchSource` answers
  `read('manifest.json')` from it, and every data URL is `?v=<sha prefix>`.
  One named Cache API bucket per data version; older buckets are pruned;
  any Cache API failure degrades to plain fetch.
- **Latest-wins on both sides.** The worker defers `search`/`suggest` one
  macrotask so a keystroke burst collapses to the newest; the client rejects
  the superseded promise with `AbortError` at once and sends `cancel`. The UI
  treats `AbortError` as "ignore".
- **Recent queries under an empty box, not reserved slots.** CP-05 noted
  `recent` only surfaces on narrow prefixes; the box shows the last five on
  focus when empty, and `suggest` keeps its design order otherwise.
- **`Hit.verseCount`** (additive) so entity hits can show a count without a
  regex over the sublabel; places' sublabels already carry one, so the count
  is shown only when the sublabel does not mention verses.
- **Reference errors print above results** (invariant 5), not only on the
  empty state.
- **Preload from the HTML, not the island.** A post-build Astro hook reads
  the emitted chunk graph and injects the `modulepreload`/`prefetch` links;
  Chrome does not implement `preload as="worker"`, so the worker chunk is
  `prefetch`ed and served to `new Worker` from the HTTP cache.
- **`_headers`: immutable only for what is always requested with a hash.**
  `/_astro/*` and the five engine files; `verses/*.json`, `detail/*` and
  `manifest.json` are fetched by path and keep revalidation.
- `sideEffects: false` on `@theographic/core` — without it the main-thread
  chunk carried the book-alias tables (16 KB) through re-exports.

## Deviations from the brief

- Main-thread budget 80 KB, not 60 (above).
- "First search ready < 1 s" holds on 4G (1.01 s), not on Slow 4G (2.81 s):
  the bytes do not fit. Both numbers are in the table.
- Not measured on a physical phone; Lighthouse devtools throttling on a Mac
  is the stand-in, as `CLAUDE.md` asks for a throttled profile rather than a
  laptop number.

## Where I left off

Everything in the task list is done and measured; PR open into `v2`.
Follow-ups: Preact decision (above); the Netlify deploy preview must be
checked for `Cache-Control: immutable` on `/data/books.json?v=…` and for the
worker starting (CSP is not set, so no `worker-src` issue expected).

## Verify

```bash
npm run build && npm run preview   # browse /?q=Saul, /?q=John%203:16, /?q=Paul%20Antioch&debug=1
node scripts/size-budget.mjs
npx vitest run --project core test/worker.test.ts test/fetchSource.test.ts
npx vitest run --project web test/urlState.test.ts
```
