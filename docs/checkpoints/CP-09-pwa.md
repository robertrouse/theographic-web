# CP-09 — PWA + offline

## Goal

Installable, works offline after first use: app shell precached, data/index
cached on first search, pages cached as visited.

## Definition of done

- Airplane-mode test passes for a visited page and for a search.
- Lighthouse PWA checks pass; manifest + icons from the brand mark.

## Tasks

- [ ] Service worker (Workbox via an Astro integration or hand-rolled): precache
      shell + core data layer; runtime cache for `/data/*` (immutable) and pages.
- [ ] "Available offline" indicator; update prompt on new version.
- [ ] `manifest.webmanifest`, icons, theme colour.

## Decisions made

_(fill in)_

## Where I left off

_(not started)_

## Verify

Built-in browser: load, search, toggle offline, reload, search again.
