# CP-04 — Verse text search (`packages/core/src/text` + `packages/data/src/index-text.ts`)

## Goal

BM25 over KJV `verseText` from a prebuilt binary index, with archaic-form and
stem expansion, bounded fuzzy, phrase and proximity boosts, and highlight
offsets — tuned so short verses do not dominate.

## Definition of done

- Goldens 21–25, 47, 48 pass.
- Index sizes within ±20% of estimates (`verses.idx` ~1.85 MB raw / ~1.0 MB
  brotli; `verses.txt` 5.4 MB / 1.5 MB gz); recorded here.
- Warm query <30 ms on Node for every golden; a phone measurement recorded.

## Tasks

- [ ] `tokenizer.ts` (shared build/query): NFKC → lowercase → `’`→`'` → strip
      possessive → split `[^a-z0-9'-]+` → hyphen twin for entity names only →
      drop the 22 Ps 119 acrostic headers → no stopword removal. Records
      char offsets.
- [ ] Build: `verses.txt` (UTF-8 blob + Uint32 offsets + verseID Uint32);
      `verses.idx` with `TGIX` header, front-coded termDict, termMeta
      (df, offset), varint gap+tf postings, Uint8 docLen, stemGroups,
      fuzzy-candidate bitset (df ≥ 3 ∧ len ≥ 4). Build asserts the tokenizer
      round-trips the term ids it wrote.
- [ ] `text/index.ts` reader (DataView, no parse step); `text/expand.ts`
      (exact 1.0, archaic map 0.9 — curated ~120 pairs, stem 0.7, fuzzy 0.6/0.4
      top-5 by df); `text/bm25.ts` (k1 1.2, b 0.4, L'=max(L,8), cov^1.5,
      phrase +0.5, prox 0.25/(1+minSpan−m); weak words df > 0.5N score but do
      not generate candidates; re-tokenize top-300 for phrase/prox); `snippet.ts`.
- [ ] `in:` scope as a verseID-range predicate during postings traversal.
- [ ] In-browser `buildIndex(verseRows)` sharing the build code (dev/CLI fallback).
- [ ] Record sizes and timings.

## Decisions made

_(fill in)_

## Where I left off

_(not started)_

## Verify

```bash
npm run data && npm test -w @theographic/core -- text
```
