# CLAUDE.md — working notes for agents on Theographic v2

**Start at [`docs/CHECKPOINTS.md`](docs/CHECKPOINTS.md).** It says which checkpoint
is active and where the last session stopped. Run that checkpoint's Verify block
before doing anything else, and update its "Where I left off" before you stop —
even mid-task. Nothing about the state of the work should live only in a chat
transcript.

Spec for the search engine: [`docs/search-design.md`](docs/search-design.md).
Why the stack is what it is: [`docs/adr/`](docs/adr/). What is in and out of
scope: [`docs/ROADMAP.md`](docs/ROADMAP.md).

## What this is

A knowledge graph of the Bible — people, places, events, periods, passages —
as a fully static site with the search engine running in the browser. The data
comes from [theographic-bible-metadata](https://github.com/robertrouse/theographic-bible-metadata)
(Airtable exports, KJV text with per-verse entity links). The 2020 site's Neo4j
backend is gone; this is the rebuild. Robert Rouse owns both repos.

## Layout

```
packages/core   @theographic/core — pure TS: types, refs, entities, text, graph, query, suggest
packages/data   build pipeline: metadata JSON @ pinned SHA → apps/web/public/data/*; definitions batch
apps/web        Astro + React islands; prerenders every page; search island in a worker
apps/mobile     Capacitor shells (CP-10)
docs/           CHECKPOINTS, checkpoints/CP-NN, search-design, ROADMAP, adr/
scripts/        CI helpers (size budget, smoke)
```

## Invariants — do not break these without writing an ADR first

1. **`core` never imports the DOM, React, Astro, or Node-only modules.** Its
   tsconfig has `lib: ["ES2022"]` and `types: []` so a stray `document` or
   `process` fails typecheck. It must run identically in a Web Worker, Node
   tests, the CLI, Capacitor, and an MCP server — the golden tests only mean
   something if it is one engine.
2. **Adding data is a data change.** New fields or entity kinds flow through
   `packages/data` and `core/types.ts` into generic components. If adding an
   entity kind forces a per-kind branch in UI, the abstraction leaked; fix that.
3. **Every search hit is explainable.** `Hit.why[]` names the matched field, the
   match tier and the score parts. The debug panel (`?debug=1`) shows it; golden
   tests assert on it. A ranking change you cannot express in `why` is not done.
4. **Ranking formulas live in one place** (`core/src/query/merge.ts` and the
   tier/BM25 constants in `entities/match.ts`, `text/bm25.ts`), documented
   inline and in `docs/search-design.md`. Change the doc, then the code, then
   the goldens — never the goldens alone.
5. **Reference resolution never guesses silently.** Out-of-range chapters are
   errors, not clamps; a bare "John" returns both the book and the people,
   ranked. Ambiguity is data the UI shows, not a coin flip.
6. **"No data" is distinct from zero.** No coordinates ≠ `0,0`; no definition ≠
   `""`; no verses ≠ verseCount 0 rendered as a ranking signal.
7. **Generated definitions are labelled until reviewed.** Rows carry `model`,
   `generatedAt`, `status: draft|reviewed`; every claim cites a verse; a
   regeneration never overwrites a `reviewed` row; the site marks drafts.
8. **Old URLs keep working.** `/{book}`, `/{book}/#Book.C.V`, `/person/{slug}`,
   `/place/{slug}`, `/period/{slug}`, `/browse/`, `/about/`, `/?q=`. The redirect
   table is `apps/web/src/redirects.ts`; test it in CP-11's smoke script.
9. **Determinism.** `searchSync` is a pure function of (query, options, index
   bytes). No `Date`, no `Math.random`, stable tie-breaks. Bundles are
   content-hashed and a rebuild from the same `data.lock` must be byte-identical.

## Data facts that bite

- `verses.richText` and `verses.verseText` are different KJV editions
  ("Beth-el" vs "Bethel"; Ps 119 acrostic headers only in `verseText`). Index
  `verseText`; mine aliases from `richText` link labels; never use `mdText`
  (its links have a `([` typo).
- `people."Disambiguation (temp)"` is misaligned across rows. Do not use it for
  labels. Sublabels come from `displayTitle`, father, or first verse.
- `alsoCalled` splits on `,` (no space); places `aliases` on `, `. Jesus's
  `alsoCalled` includes "Lord", "Son", "King", "Word" — aliases are weighted,
  never trusted.
- `verseID` is `BBCCCVVV` (string in source, number in bundles). Years are ISO
  astronomical: `-4003` = 4004 BC; `0` = 1 BC.
- `books.writers` is a comma-joined string on 1Sam/2Sam. 34 book names are also
  person names.

## Working style

Robert is a professional data-visualization practitioner and the author of the
data. Direct, evidence-grounded answers; show what changed and why; do not
narrate routine steps. When something is unverified, say so. Measure phone
budgets on a throttled profile, not a laptop, and write the number down.

## Verifying

```bash
npm ci && npm run typecheck && npm test && npm run build && node scripts/size-budget.mjs
npm run data            # rebuild bundles from the pinned metadata SHA (CP-01+)
npm run dev             # http://localhost:8001
```

CI runs the first line on every push to `master`, `v2`, `cp-*` and on PRs.
