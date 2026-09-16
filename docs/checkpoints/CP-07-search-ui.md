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

- [ ] `core/io/fetchSource.ts` (fetch + Cache API, immutable hashed URLs) and
      `core/worker/{protocol,worker,client}.ts`.
- [ ] React island `SearchBox` + `SearchResults`: input, debounce 150 ms,
      `suggest` on keyup, `/?q=` via `replaceState` (encoded), tabs All /
      Passages / Verses / People / Places / Events, load more, highlighted
      snippets, hints panel when empty, "searching verses…" while text layer
      loads.
- [ ] Prefetch text layer on idle after first paint.
- [ ] Size budgets set for real in `scripts/size-budget.mjs` (core layer ≤ 200
      KB gz incl. engine).
- [ ] Throttled measurement recorded.

## Decisions made

_(fill in)_

## Where I left off

_(not started)_

## Verify

```bash
npm run build && npm run preview   # browse /?q=Saul, /?q=John%203:16, /?q=Paul%20Antioch&debug=1
```
