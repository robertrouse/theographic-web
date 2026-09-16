# CP-06 — Web pages (parity + reader)

## Goal

Every page type the 2020 site had, prerendered by Astro from the CP-01 bundles,
plus a chapter reader, with the old URLs still resolving.

## Definition of done

- Old routes resolve: `/{book}`, `/{book}/#Book.C.V` anchors, `/person/{slug}`,
  `/place/{slug}`, `/period/{slug}`, `/browse/`, `/about/`, `/?q=`.
- All 66 books × 1,189 chapters, 3,067 people, 1,274 places, periods, events
  prerender; build time recorded.
- Lighthouse ≥ 90 performance and accessibility on a person page and a chapter.
- Place map renders with MapLibre and no Mapbox dependency.

## Tasks

- [x] Data access layer `apps/web/src/lib/data.ts` reading `public/data` at build.
- [x] Layout: one header with the search box slot (island lands in CP-07),
      bottom nav on mobile (Search · Index · About), footer attribution.
- [x] `/browse/` tabs Bible / People / Places / Periods with letter groups.
- [x] `/{book}` chapter index (+ full text for single-chapter books);
      `/{book}/{chapter}` reader: verse anchors `#v16`, `richText` → entity links,
      italics, prev/next chapter, people/places in this chapter.
- [x] `/person/{slug}`: definition (CP-08; Easton's labelled until then), aliases,
      family, born/died, groups, wrote, timeline.
- [x] `/place/{slug}`: MapLibre map (zoom by featureType: Region/Water 4,
      Island 5, else 7.5), definition, events here, people here.
- [x] `/period/{slug}` (event groups by `partOf`) and `/event/{slug}`;
      year formatting: ISO astronomical → "1446 BC" / "AD 57".
- [x] `/about/` (license text pending Robert's decision).
- [x] Redirects: `apps/web/src/redirects.ts` → generated `public/_redirects`;
      client script maps `/{book}/#Book.C.V` to `/{book}/{C}#vV`.
- [x] Design tokens; type ≥ 15px; dark mode via `prefers-color-scheme`.
- [x] Lighthouse runs recorded here.

## Measurements (2026-09-16, Robert's Mac, M-series)

**Build:** `astro build` — 6,299 pages in 4.3 s (Vite step ~1 s before it;
`npm run build` end to end incl. core + data packages 5.5 s wall). Page count:
1 home + 66 books + 1,189 chapters + 3,067 people + 1,274 places + 450 events +
249 periods + browse + about + 404 = 6,299. `dist/` is 71 MB uncompressed;
13.6 MB gz across loaded files (`scripts/size-budget.mjs`).

**Lighthouse 13.4.1** against `astro preview`, headless Chrome:

| page                  | mode    | perf | a11y | best-practices | seo | LCP   | TBT      |
| --------------------- | ------- | ---- | ---- | -------------- | --- | ----- | -------- |
| `/person/moses_2108`  | desktop | 100  | 100  | 100            | 100 | 0.2 s | 0 ms     |
| `/person/moses_2108`  | mobile  | 100  | 100  | 100            | 100 | 0.9 s | 0 ms     |
| `/john/3`             | desktop | 100  | 100  | 100            | 100 | 0.2 s | 0 ms     |
| `/john/3`             | mobile  | 100  | 100  | 100            | 100 | 0.9 s | 0 ms     |
| `/place/jerusalem_636` | mobile | 71   | 97   | 100            | 100 | 2.6 s | 1,390 ms |

The place page is outside the definition of done but worth knowing: on the
throttled mobile profile MapLibre's WebGL set-up is 1.4 s of main-thread
blocking. It is already lazy (dynamic import, only on pages with coordinates);
a further step would be to defer `new Map()` to `requestIdleCallback` or an
intersection observer, which moves the cost rather than removing it. Left for
CP-09 to weigh against the offline budget.

Two accessibility findings were fixed on the way: verse numbers were 3.05:1
(now use the muted token, 5.9:1) and links in running text relied on colour
alone at 2.7:1 against body text (now underlined, quietly, with navigation and
chips opting out).

**Client JS on the budget:** 1.3 KB gz (the place-page script). MapLibre's
chunk (270 KB gz) and its worker (141 KB gz) are dynamic imports that only
place pages with coordinates fetch; `size-budget.mjs` counts only JS referenced
from HTML, so they are outside the 200 KB budget by construction, not by
accident — say so if the budget is ever tightened to cover them.

**Visual checks (Browser pane):** home, `/john/3#v16`, `/person/moses_2108`,
`/place/jerusalem_636` (City, zoom 7.5), `/place/egypt_362` (Region, zoom 4),
`/place/abel-mizraim_9` (no coordinates → "No coordinates", no map, no script),
`/browse/` all four tabs, `/event/…`, `/period/lifetime_of_moses_121`, `/phlm`
(single chapter inline), `/john/#John.3.16` → `/john/3#v16` with the verse
targeted. Desktop, 375 px (no horizontal scroll: `scrollWidth === 375` on the
chapter and place pages), and dark mode on home and a person page.

## Decisions made

- **`apps/web/src/lib/` holds helpers that may belong in core later.**
  `refs.ts` (`verseLabel`, `verseHref`, `rangeLabel`, `formatDate`,
  `formatDuration`, `subtitleOf`, `groupByLetter`) is pure and DOM-free; it
  stayed here because `packages/core` is being edited concurrently. Move when
  CP-02..05 have landed. `markdown.ts` (the renderer) is presentation and stays.
- **Data dir is injected by `vite.define`.** A built chunk's `import.meta.url`
  points into `dist/.prerender/`, so `src/lib/data.ts` reads `__DATA_DIR__`
  set in `astro.config.mjs`. `npm run data` must have run first; the error
  says so.
- **MapLibre 6.x, not 5.x.** The brief said latest 5.x, but every 5.x release
  carries GHSA-jrc7-96c5-q579 (critical, XSS in `DOM.sanitize`), fixed in
  6.4.1; `npm audit` would fail CI on 5.x. The API we use (`Map`, `Marker`,
  `Popup`, `NavigationControl`) is unchanged. Two 6.x consequences: the package
  has named exports only (no default), and its worker is a sibling module
  resolved from `import.meta.url`, which does not survive bundling — the map
  silently loads no tiles. `PlaceMap.astro` imports the worker with Vite's
  `?worker&url` and calls `setWorkerUrl()`; `vite.worker.format` is `es`.
- **Map CSS is injected on demand** (`?url` import + a `<link>` created before
  the map mounts), so pages without a map carry none of MapLibre's CSS (81 KB, 10 KB gz).
- **The definition block shows one paragraph and folds the rest.** Easton on
  Moses runs to ~3,000 words and pushed the timeline and verses off the page.
  `Definition.astro` renders the first paragraph and puts the remainder behind
  "Read more" — summary at the point of use, complete one click down. CP-08
  swaps the source by changing the `source`/`markdown` props; nothing else.
- **Verse lists show the first 10 and the count.** "God" has 8,587 verses; a
  full list is the search island's job (CP-07). The count is in the summary so
  the reader knows what is there before opening it.
- **The link resolver normalises the source's mess.** Verse `rich` contains
  `http:///place/x`, `http://person/x` and `/people/x`; Easton links verses
  the 2020 way (`/gen#Gen.45.17`, `/lev#Lev.8`, `1chr/#1Chr.8.12`). `links.ts`
  maps all of these to site paths and drops targets that do not exist in the
  bundles, so a typo'd slug renders as text rather than a 404. Nothing is
  fixed in the data (that is `packages/data`'s job).
- **Periods are top-level events (`partOf` absent), addressed by event slug.**
  The 2020 site's period slugs came from a Neo4j `EventGroup` label that the
  metadata repo does not carry, so old `/period/…` URLs resolve to the route
  but not necessarily to the same slug. 249 periods.
- **`/browse/` is one page, four `:target` panels, no JS.** Bible is the
  default panel (`:has()`); every entry is in the HTML (509 KB, ~60 KB gz) so
  find-in-page and crawlers see it all. Bible groups by division globally, not
  by consecutive run (Lamentations sits with Poetry-Wisdom).
- **`rootOf` is labelled "Coordinate from".** The field means "place whose
  coordinate this one inherits" (Egypt → On), not containment.
- **Family labels come from the data's cardinality**, no per-kind branches:
  father from the entity row, the rest from `PersonDetail`; empty rows are
  omitted rather than printed blank (invariant 6).
- **About page:** ported minus the license paragraph (now "Data license: to be
  confirmed"). The 2020 "Developers: use a GraphQL API" bullet was rewritten —
  there is no API any more — and the Mailchimp sign-up link was dropped rather
  than shipped dead. KJV 1769 and Easton's (1897) are credited as public domain.
- **Dates keep month and day as words** ("9 October, AD 29") with the raw ISO
  in `<time datetime>`; the brief said "keep the raw date visible", and the
  precision is what matters, not the format.
- **Header search stays on mobile**; only the text nav collapses into the
  bottom bar. Removing the box on small screens would have made every search
  a tap on "Search" first.
- **404 page added** (`src/pages/404.astro`); Netlify serves `404.html`.
- **Unit tests** for `markdown.ts` and `refs.ts` under `apps/web/test`, run by
  the root vitest as the `web` project. They need no bundles, so they run
  before `npm run data` in CI.

## Data issues noticed, not fixed here

- "Death of Moses" (event 406) lists verse `01034001` (Genesis 34:1) alongside
  Deuteronomy 34; its range renders as "Genesis 34:1 – Deuteronomy 34:12".
  Almost certainly `05034001` mistyped. Belongs in the metadata repo.
- Moses: event "Birth of Moses" is dated −1570 (1571 BC) while
  `PersonDetail.birthYear` is −1571 (1572 BC). Same class of thing.
- OpenFreeMap's `liberty` style logs one MapLibre warning
  (`highway-shield-us-interstate` filter has a `null`). Theirs, harmless.

## Where I left off

Done and PR'd. Everything in the task list is ticked and verified. Nothing is
half-done. Follow-ups that belong to other checkpoints:

- CP-07 replaces `src/components/SearchSlot.astro` (a plain `GET /?q=` form)
  with the React island; keep the `class`/`compact`/`value` props.
- CP-08 passes generated definitions to `Definition.astro` (`source`,
  `markdown`, `status: 'draft'`) in place of `detail.easton`.
- CP-09 should decide whether to defer the map's `new Map()` on mobile.
- CP-11's smoke script should test `src/redirects.ts` and the anchor hop.

## Verify

```bash
npm run build && npm run preview
# then: /john/3, /person/moses_2108, /place/jerusalem_636, /browse/, /john/#John.3.16
npm test                      # includes the web project
node scripts/size-budget.mjs
```
