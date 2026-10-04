# CP-09 — PWA + offline

## Goal

Installable, works offline after first use: app shell precached, data/index
cached on first search, pages cached as visited.

## Definition of done

- Airplane-mode test passes for a visited page and for a search.
- Lighthouse PWA checks pass; manifest + icons from the brand mark.

## Tasks

- [x] Service worker (hand-rolled, see decisions): precache shell; runtime
      cache for `/_astro/*` (immutable) and pages; `/data/*` left to
      `fetchSource`.
- [x] "Available offline" indicator; update prompt on new version.
- [x] `manifest.webmanifest`, icons, theme colour.
- [x] `/offline/` page listing what is on the device.
- [x] Offline verified in Chrome with the server stopped (below).
- [x] Installability verified (Chrome's own check, below — Lighthouse 13 has
      no PWA audits left).
- [x] Verified on the Netlify deploy preview (PR #92, below).

## What was built

```
apps/web/src/sw.ts                 the worker: install/activate/fetch/message
apps/web/src/pwa/caches.ts         bucket names; isStaleCache(); re-exports DATA_CACHE_PREFIX
apps/web/src/pwa/routes.ts         routeFor() — bypass | page | asset | static | tile; pageKey()
apps/web/src/pwa/tiles.ts          tile host, tileKey() (date-less planet keys), caps, TileLru, storableTile()
apps/web/src/pwa/register.ts       registration, update toast, offline marker (0.6 KB gz, no imports)
apps/web/src/pages/offline.astro   navigation fallback; lists cached pages + index state
apps/web/public/manifest.webmanifest
apps/web/public/icons/             icon.svg (the mark, vector) → 192, 512, maskable-512, apple-touch 180
apps/web/astro.config.mjs          serviceWorker() hook: esbuild sw.ts → dist/sw.js with __PRECACHE__/__BUILD__
apps/web/public/_headers           /sw.js max-age=0, must-revalidate
apps/web/test/pwa.test.ts          routing table; the data-bucket constant is shared, not copied
scripts/size-budget.mjs            "service worker (report)" line
scripts/pwa-icons.mjs              re-renders the PNGs from icon.svg (sharp)
packages/core/src/io/fetchSource.ts  exports DATA_CACHE_PREFIX (the only core change)
```

Caches, all under `theographic-sw-*` except the last:

| bucket           | holds                                                        | policy                                   |
| ---------------- | ------------------------------------------------------------ | ---------------------------------------- |
| `shell-<build>`  | `/`, `/browse/`, `/about/`, `/offline/`, every `/_astro/*` except MapLibre, brand, icons, manifest — 21 URLs | filled on install; other builds' deleted on activate |
| `pages`          | visited HTML, keyed by path (query dropped, slash-normalised) | stale-while-revalidate, ≤ 200 entries    |
| `assets`         | `/_astro/*` not in the shell (MapLibre, an old build's chunk a cached page still names) | cache-first, ≤ 60 entries |
| `tiles-v1`       | OpenFreeMap responses the reader's maps fetched, plus the LRU index | cache-first (style/TileJSON: SWR); LRU, ≤ 1,500 entries **and** ≤ 40 MB; other `tiles-v*` deleted on activate |
| `theographic-data-<v>` | the five engine files                                  | **`fetchSource`'s; the worker never touches it** |

Routing (`routeFor`): anything on `tiles.openfreemap.org` is a `tile` (see
"Map tiles"); non-GET, other cross-origin (the Netlify toolbar),
`/.netlify/*`, `/sw.js` and `/data/*` are not intercepted. Navigations:
shell → pages → network (stored if 200, final, same-origin) → `/offline/`.
When a page is served from cache because the network failed, the worker
posts `offline-copy` to the new client and `register.ts` shows
"Offline · saved copy"; `navigator.onLine`/`offline`/`online` cover the
case where the worker did not get a say.

Update flow: a new `sw.js` (any byte change — `__BUILD__` is a digest of
the shell HTML and the precache list) installs beside the old one and
waits; `register.ts` shows "A new version is available. Reload"; the tap
posts `SKIP_WAITING`, `controllerchange` reloads. Nothing reloads on its
own. `reg.update()` runs when the tab becomes visible.

## Measurements (2026-09-17)

`node scripts/size-budget.mjs`, gzip:

| gate                        | before  | after       | budget |
| --------------------------- | ------- | ----------- | ------ |
| main-thread JS on `/`       | 74.2 KB | **74.9 KB** | 80 KB  |
| — registration (`register.ts`) | —    | 0.6 KB      |        |
| service worker `sw.js`      | —       | 1.4 KB (3,110 raw) | report |
| all loaded JS               | 75.9 KB | 76.5 KB     | 200 KB |

Precache on install: 21 URLs, ~1.02 MB raw (the `/browse/` index is 659 KB
of it; the rest is the island chunks, 213 KB of react-dom, CSS, images).
Nothing from `/data/` — the index (2.4 MB raw across five files) lands in
`fetchSource`'s bucket on the first visit as before. Icons: 3.1 / 8.1 /
4.9 / 2.9 KB.

### Offline test (Chrome 152 via the extension, `astro preview`, then `kill` the server)

Online first: `/`, `/?q=Saul`, `/person/moses_2108/`, `/john/3/`. Buckets
after: `theographic-data-d7014f58` (5 files), `theographic-sw-shell-94ffdfd1`
(21), `theographic-sw-pages` (2). Server killed, `curl` confirms 000. Then:

| request                     | result                                                     |
| --------------------------- | ---------------------------------------------------------- |
| `/`                         | renders from the shell                                     |
| `/?q=Saul`                  | **359 results, same groups and first hits as online**      |
| `/person/moses_2108/`       | renders; "Offline · saved copy" marker                     |
| `/john/3/`                  | renders, 36 verses; marker                                 |
| `/person/david_2090/` (unvisited) | `/offline/`: lists John 3, Moses, "Search: … verse text are all on this device" |

Update test: `sw.js` edited by one token, server restarted, `/about/`
loaded → `reg.waiting = installed`, toast shown, both shell buckets
present. Tap Reload → `navigationType = reload`, old shell deleted, data
and pages buckets kept, no toast.

### Installability

Lighthouse 13.4.1 has no PWA category and no manifest/installability
audits (`--list-all-audits | grep -i manifest` is empty), so the check is
Chrome's own: headless Chrome 152 (puppeteer-core) with a
`beforeinstallprompt` listener installed before navigation, two loads of
`/` (the first registers the worker). **`beforeinstallprompt` fired,
`platforms: ["web"]`** — Chrome's installability criteria (manifest with
name, start_url, display, 192 + 512 icons; a service worker with a fetch
handler; secure origin) are met. Not re-run through Lighthouse's
best-practices category, which has nothing to say about it.

### Deploy preview ([PR #92](https://github.com/robertrouse/theographic-web/pull/92))

`deploy-preview-92--theographic.netlify.app`, headless Chrome 152 via
puppeteer-core. Headers: `/sw.js` comes back `cache-control:
public,max-age=0,must-revalidate`, `content-type: application/javascript`.
`beforeinstallprompt` fires (`platforms: ["web"]`). Online walk: `/`,
`/?q=Saul`, `/person/moses_2108/`, `/john/3/`, `/place/bethlehem_218/`
(18 tile requests to openfreemap.org, none intercepted). Buckets after:
data 5, shell 21, pages 3, assets 3 (MapLibre's js, worker and css).

**A CDP "offline" is per target.** `page.setOfflineMode(true)` alone left
the worker online — its `fetch()` still reached Netlify and an unvisited
page came back 200 "from the service worker". The worker target has to be
taken offline through its own CDP session as well; with both offline:

| request                    | result                                                        |
| -------------------------- | ------------------------------------------------------------- |
| `/`, `/?q=Saul`            | render; **359 results for Saul**                              |
| `/person/moses_2108/`, `/john/3/`, `/place/bethlehem_218/` | render with the marker; Bethlehem's map is empty (tiles are not cached — decision below) |
| `/person/david_994/` (unvisited) | `/offline/`, listing Bethlehem, John 3, Moses           |

Netlify served `manifest.webmanifest` as `application/octet-stream`; Chrome
parsed it regardless, and a `_headers` rule now sets
`application/manifest+json`. The deploy-preview toolbar only appears for a
logged-in Netlify user, so its bypass is covered by the cross-origin rule
and its unit test rather than observed.

## Decisions made

- **Hand-rolled worker, not `@vite-pwa/astro`.** The routing table is four
  rules and the precache list is a directory listing at build time.
  Workbox would add `workbox-window` (~6 KB gz) to a main-thread budget with
  5 KB of headroom, and its precache manifest would want to own `/data/*`,
  which is exactly the fight to avoid. The worker is 1.4 KB gz.
- **`/data/*` is not intercepted.** `fetchSource` answers a read from its
  own bucket before any request exists, so a worker route would only ever
  see misses and would store a second copy. The shared constant
  `DATA_CACHE_PREFIX` is exported from core so `isStaleCache()` cannot
  delete those buckets and `/offline/` can report them; the test asserts
  the string appears nowhere else in `src/pwa` or `sw.ts`.
- **Map tiles: cached, bounded** (Robert, 2026-10-04; was "uncached" at
  first merge). Details and verification under "Map tiles" below.
- **Pages are stale-while-revalidate, bounded, never cleared on update.**
  A new build does not drop what the reader has visited. A stale page can
  name an old chunk; that chunk is in `assets` if it was ever fetched, and
  `assets` is bounded by count, not pruned by build, for that reason. The
  one gap: a chunk the stale page loads lazily and never did (MapLibre)
  404s after a deploy until the page is revisited online.
- **Registration is a hashed file, not inlined.** Astro inlines a sub-4 KB
  script into every page; on 6,300 pages that is 1.3 KB apiece outside the
  budget. `assetsInlineLimit` is overridden for that one chunk.
- **Redirected responses are not cached.** Netlify 301s `/x` → `/x/`; a
  replayed redirect for a navigation is a security error in Chrome, so
  `pageKey` looks up the slash form and `store` requires `!redirected`.
- **`skipWaiting` only on the tap.** Reloading under the reader is the
  failure mode; the toast is the whole UI.
- **Icon is redrawn as SVG**, not upscaled: `og-square-100.png` is 100 px.
  Same three-link mark, page background behind it; maskable variant at 60%.
- `/offline/` carries `noindex` and is filtered from the sitemap.

## Deviations from the brief

- No Lighthouse PWA score to report — that category no longer exists in
  13.x. Chrome's `beforeinstallprompt` is the check, above.
- `/404.html` is not precached: offline, an unknown URL cannot be told
  from an unsaved one, so `/offline/` is the honest answer for both.
- The offline marker is a fixed pill, not an inline badge: it has to work
  on pages that were rendered before this checkpoint existed (they come
  out of the cache unchanged).

## Map tiles (decided 2026-10-04: cache them)

**Provider and terms.** One provider: OpenFreeMap's public instance,
style `https://tiles.openfreemap.org/styles/liberty` (`PlaceMap.astro`; a
test asserts the worker's tile host is the one the component draws from).
Read 2026-10-04: no keys, no request limits; the
[ToS](https://openfreemap.org/tos/) (updated 2026-09-09) says nothing on
caching and forbids collecting "data from the service in automated ways
without permission"; attribution is required and MapLibre renders it from
the TileJSON. The server itself sends tiles, Natural Earth rasters and
sprites with `cache-control: public, max-age=315360000` (10 years), the
style and TileJSON with `max-age=86400`, glyphs with `max-age=604800`, all
with `access-control-allow-origin: *`. **Keeping what the reader's own map
fetched is allowed; pre-fetching tiles nobody viewed is the "automated"
case, so there is no precache of low zooms.** If Robert wants the region
available before any map is opened, the route is self-hosting: OpenFreeMap
publishes weekly planet MBTiles, and a Levant/Mediterranean extract at
z0–8 could ship from our own origin. Not sized or built here.

**Keys.** Vector tiles live under a weekly-dated path
(`/planet/20260927_080001_pt/7/76/51.pbf`) named by the TileJSON at
`/planet`. Keyed by full URL, the first online visit after a planet
rebuild would point the cached TileJSON at a new date and orphan every
saved tile. So `tileKey()` drops the date (`/planet/7/76/51.pbf`) and the
LRU records which date is stored. Same date → cache; different date →
network, stored copy if the network fails. One copy per z/x/y.

**Policies.** Style and TileJSON (small, unversioned, carry the
attribution): stale-while-revalidate. Everything else on the host: cache-
first. Only `type === 'cors'` 200s are stored — MapLibre fetches in CORS
mode, so nothing opaque (Chrome pads opaque entries to ~7 MB of quota and
their size cannot be measured; `storableTile()` refuses them).

**Caps: 1,500 entries and 40 MB, LRU.** The index (`TileLru`, a `Map` in
recency order, no clocks) lives in the tiles bucket at
`https://theographic.invalid/tiles-lru.json`, is loaded once per worker
life (rebuilt from the bucket if missing), updated on every hit and
store through one promise chain, saved 1 s after the last change.
Eviction drops oversize entries first, then least recently used until
both caps hold. A stored entry missing from the index (worker stopped
before a save) is adopted on its next hit. Sizing: Bethlehem at its
default zoom is 24 files, 1.9 MB (vector tiles 50–250 KB, the Natural
Earth raster up to ~320 KB); places cluster in the Levant and share tiles,
so 40 MB is a few dozen distinct place views. Bumping `TILES_VERSION`
drops the whole bucket on activate.

`sw.js`: 2.7 KB gz (6,383 raw), was 1.4 KB. Main-thread JS on `/` 75.2 KB
(gate 80); `/offline/`'s script is not on `/`.

**`/offline/`** gains one line: "Maps: 24 map files saved (1.9 MB) from
places you have viewed." The offline marker is unchanged — a place page
from cache already shows "Offline · saved copy", and its map now draws.

### Verified (2026-10-04, headless Chrome via puppeteer-core, `astro preview`)

The Claude browser pane cannot register a service worker ("unknown error
when fetching the script" on any origin), so this ran in headless Chrome
with a fresh profile, SwiftShader WebGL, and every target — page,
service worker, MapLibre's worker — taken offline over CDP (the per-target
lesson above).

| step | result |
| ---- | ------ |
| `/place/bethlehem_218/` online, then reload | 24 tile-host responses, **24 from the worker**; `tiles-v1` holds 24 entries, all `type: cors`, + the index; index 24 rows, 1,999,242 bytes |
| offline reload | **24/24 tile-host responses 200 from the worker**, map draws (screenshot), attribution "OpenFreeMap © OpenMapTiles Data from OpenStreetMap", marker "Offline · saved copy" |
| offline, a tile never fetched | `fetch` rejects (no fabricated response) |
| offline, cached TileJSON rewritten to a new planet date | 6/6 tile requests for the new date answered 200 with the stored copies; map draws |
| offline, unvisited page → `/offline/` | "Maps: 24 map files saved (1.9 MB) …" |
| eviction, caps temporarily 10 entries / 1 MB (reverted, not committed): Bethlehem, Bethlehem again, Babylon, Rome | bucket at 10 entries every step (817–937 KB), bucket keys == index keys, a revisit reorders the index, each new place's files displace the oldest |

Not verified: a real phone, iOS Safari (its Cache API quota and worker
lifetime differ), the deploy preview, and a real weekly planet rebuild
(simulated by rewriting the TileJSON). Panning or zooming beyond what was
viewed online shows blank squares offline, by design.

## Where I left off

Everything in the task list is done and measured, locally and on the
deploy preview. [PR #92](https://github.com/robertrouse/theographic-web/pull/92)
into `v2` was merged. Map tiles: decided "cache", built and verified on
branch `cp-09-map-tiles` (section above), PR into `v2` awaiting review.

## Verify

```bash
npm run build && npm run preview       # Chrome: load /, /?q=Saul, a person page, a chapter
# stop the server, reload each: home + search work, visited pages show
# "Offline · saved copy", an unvisited page shows /offline/
node scripts/size-budget.mjs           # sw.js on the "service worker (report)" line
npx vitest run --project web test/pwa.test.ts
# map tiles: open a place page online twice, go offline in DevTools
# (Application → Service workers → Offline also covers the worker), reload:
# the map draws; /offline/ shows the "Maps: N map files saved" line
```
