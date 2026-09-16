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

- [ ] Data access layer `apps/web/src/lib/data.ts` reading `public/data` at build.
- [ ] Layout: one header with the search box slot (island lands in CP-07),
      bottom nav on mobile (Search · Index · About), footer attribution.
- [ ] `/browse/` tabs Bible / People / Places / Periods with letter groups.
- [ ] `/{book}` chapter index (+ full text for single-chapter books);
      `/{book}/{chapter}` reader: verse anchors `#v16`, `richText` → entity links,
      italics, prev/next chapter, people/places in this chapter.
- [ ] `/person/{slug}`: definition (CP-08; placeholder until then), aliases,
      family, born/died, groups, wrote, timeline.
- [ ] `/place/{slug}`: MapLibre map (zoom by featureType: Region/Water 4,
      Island 5, else 7.5), definition, events here, people here.
- [ ] `/period/{slug}` (event groups by `partOf`) and `/event/{slug}`;
      year formatting: ISO astronomical → "1446 BC" / "AD 57".
- [ ] `/about/` (license text pending Robert's decision).
- [ ] Redirects: `apps/web/src/redirects.ts` → generated `public/_redirects`;
      client script maps `/{book}/#Book.C.V` to `/{book}/{C}#vV`.
- [ ] Design tokens; type ≥ 16px; dark mode via `prefers-color-scheme`.
- [ ] Lighthouse runs recorded here.

## Decisions made

_(fill in)_

## Where I left off

_(not started)_

## Verify

```bash
npm run build && npm run preview
# then: /john/3, /person/moses_2108, /place/jerusalem_636, /browse/, /john/#John.3.16
```
