# ADR-0001 — Stack for v2

**Status:** accepted 2026-09-15

## Decision

- Monorepo (npm workspaces) continuing the `theographic-web` repository.
- `packages/core`: pure TypeScript (no DOM, no Node APIs) — data model,
  reference parser, entity and text search, graph hops.
- `packages/data`: Node build pipeline from the metadata JSON to static bundles
  and binary indexes; also the Claude batch pipeline for definitions.
- `apps/web`: Astro 7 with React 19 islands; fully prerendered; search runs in a
  Web Worker from static index files.
- `apps/mobile`: Capacitor shells over the web build.
- Hosting: Netlify. Maps: MapLibre GL with open tiles.

## Why

- The dataset is small enough (8 MB gz whole; ~1 MB for the search index) that a
  server buys nothing and costs an ops surface. Static means offline, cheap, and
  identical behaviour in every host.
- Astro prerenders ~4,500 entity pages as HTML (SEO, instant load) and only
  hydrates the search island, which is the only interactive part.
- A pure core is what makes the CLI, the tests, the native shells and a future
  MCP server the _same_ engine; drift between them would make the golden tests
  meaningless.
- MapLibre removes a paid dependency and a token in source; the 2020 site's
  custom Mapbox style is a loss accepted for now.

## Alternatives considered

- Vite + React SPA (simpler, but no prerendered HTML without extra tooling).
- Next.js static export (heavier than needed).
- Static site + serverless search (lifts the bundle ceiling we do not hit).
