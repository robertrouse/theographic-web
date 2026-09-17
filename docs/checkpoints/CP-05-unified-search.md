# CP-05 — Unified search, intent, suggest (`packages/core/src/query`, `suggest`, `engine.ts`)

## Goal

One `search()` over all groups with an explainable rule-based plan, filters,
graph hops, cross-group ranking, and a sub-16 ms `suggest()`. Public API frozen.

## Definition of done

- All goldens green except pending review — **114 pass, 10 pending review
  (6 inherited from CP-03/04, 2 new, see below), 1 deferred (#43 topics),
  zero kinds skipped by name.** p50/p95 printed by `golden.test.ts`; any
  query > 30 ms fails (3× in CI).
- `packages/core/README.md` documents the API; `npx theographic search "…"`
  runs the same engine over `fsSource` (`packages/core/bin/theographic.mjs`).
- `SearchOptions.signals` seam exists with a no-op signal test
  (`test/engine.test.ts`).

## Tasks

- [x] `query/grammar.ts` — filters (`in|book|person|place|event|group|type|mentions|sort`),
      quoted phrases, `;` clauses; sugar "… in <book>", "verses mentioning X".
- [x] `query/classify.ts` — order: filters → references (longest match) →
      entity n-grams 3/2/1 (fuzzy unigrams ≥4 only, `weak` spans keep words) →
      text terms → group activation; every step appends `why`.
- [x] `graph/adjacency.ts` + build `graph.bin` (CSR varint): entity→verses,
      event→verses, event→participants/locations; `mentions()`, co-mention
      intersection, events by participants ∩ locations. Build lives in
      `core/src/graph/build.ts` (like the text index); `packages/data/src/index-graph.ts`
      is the adapter; one `emitBinary` in `bundles.ts`.
- [x] `query/plan.ts` executes; `query/merge.ts` normalizes (passages pinned;
      entities min(1,s) × coverage; verses by band; events 0.90 via graph)
      and interleaves with stable ties (pinned → score → group order →
      canonical → id). Constants in ONE exported object `MERGE`.
- [x] `suggest/suggest.ts` — 2-char trigger; book/reference completions; entity
      prefix range; recent; fuzzy fallback; dedupe; limit 8; ≤ 3 same-name people.
- [x] `engine.ts` — `openEngine(files)` (sync) + `createEngine(source, {layers})`,
      layers `core|text|graph`, `ready` flags, `preload()`, `status()`,
      `searchSync`, `versesFor` (from the text blob), `mentions`;
      `io/IndexSource.ts` + `memorySource`; `node/fsSource.ts` behind
      `@theographic/core/node`; determinism tests (two engines, same result
      twice, CLI vs in-process for every golden).
- [x] Seams: `RankSignal` blended `(1−λ)·lex + λ·signal` on verses (λ 0.3),
      no-op and combination tests; `QueryRewriter` honoured by `search()`,
      `why` starts `plan: rewriter`.
- [x] CLI `packages/core/bin/theographic.mjs` (`search|suggest|plan|status`,
      `--json --debug --limit --data`), `"bin"` in package.json.
- [x] Golden runner: `test/golden/engine.ts` implements the CP-05 kinds and
      the `verses` parts of the shared kinds; `IMPLEMENTED_KINDS` covers
      CP-02..05; latency summary + gate in `golden.test.ts`.
- [x] Freeze API; write README.

## Golden results (real data, metadata `cfb1c48`)

| #   | q                     | CP-05 kinds                          | result                                                                                              |
| --- | --------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 18  | Acts 13               | empty verses                         | ✓ a bare reference is a passage only                                                                |
| 21  | Jesus wept            | topGroup, groupOrder                 | ✓ John.11.35 0.900 (mention+text, phrase) > Matt.26.75/Mark.14.72 0.810 > Jesus 0.775 (½ coverage) |
| 26  | love in John          | scope, allVerseIdsMatch              | ✓ sugar → `in:John`; 38 verses, all 43xxxxxx; no passage                                             |
| 27  | love 1 John           | scope                                | ✓ 1John consumed at 0.9 → passage pinned + scope                                                    |
| 28  | in:nt Jerusalem       | scope, top places                    | ✓ NT; 141 verses                                                                                    |
| 30  | Nebuchadnezar         | inTop verses Dan.1.1                 | **pending review** — 14th; see below                                                                |
| 32  | Paul                  | inTop verses Acts.13.9 why "mention" | ✓ Acts.13.9 is verses #1 (mention+text band, canonical)                                             |
| 34  | Paul Antioch          | inTop verses co-mention; events      | ✓ 13:1, 14:19, 15:22, 15:35 at 0.900; 8 events at 0.900 · **44011026 pending review** (see below)   |
| 36  | person:Simon          | empty verses (+ other groups)        | ✓ `person:` restricts groups to people                                                              |
| 41  | Moses Exodus 3        | versesFirst                          | ✓ 8 Moses verses in Exod 3, mention+text, canonical                                                 |
| 42  | Tower of Babel        | topGroup events                      | ✓ event 1.000 (3-word exact span); places Babel 0.751 via the token tier of the same span           |
| 45  | Gen 1:1; John 1:1     | refs                                 | ✓ two clauses, two pinned passages                                                                  |
| 46  | Israel                | inTop all israel_682                 | ✓ All #1 (the place clause stays pending from CP-03)                                                |
| 48  | the                   | noCrash, allWeak, perf               | ✓ 24,091 verses, 8.5 ms warm (fast path: no graph evidence → the text ranking is the ranking)       |

### New pending review (numbers, no formula bent)

1. **#30 `Nebuchadnezar` → Dan.1.1 in verses top-10.** Under the formula
   Dan 1:1 is **14th** (0.535). The span is weak (fuzzy1), so it does not
   hop, and the text fuzzy expansion (nebuchadnezzar 0.6, nebuchadrezzar 0.4)
   ranks tf-2 verses (Dan 2:1 5.23, 3:2, 3:3, 4:28) and shorter tf-1 verses
   ahead of Dan 1:1 (tf 1, 22 tokens, bm25 3.89). Letting weak spans hop
   would not help: mention+text is a fixed band ordered canonically, which
   puts 2 Kgs 24:1 first and Dan 1:1 around 60th. Robert: is this a
   prominence expectation (famous first verse — the same question as #22), or
   should the id change?
2. **#34 `Paul Antioch` → Acts 11:26 as a co-mention.** Acts 11:26 links
   `antioch_68` and event 332 only; Paul's links in Acts 11 are 11:25 and
   11:30 ("he brought him" is unlinked). The Paul ∩ Antioch intersection is
   {13:1, 14:19, 15:22, 15:35}, all in the top 4 — a companion #34 line keeps
   that tested. 11:26 is reachable only through the event (participants ∩
   locations → its verses), which the design does not list as a verse source.
   Robert: add "event verses" as a verse band (evidence class like
   co-mention), or drop 44011026.

## Decisions made

- **Span coverage factor** `0.55 + 0.45·words/contentWords` on entity scores
  (`MERGE.spanFloor`). Without it #21 cannot hold: "jesus" is an exact
  entity (1.0) and the literal design has nothing that lets a phrase verse
  (0.80) outrank it. At half coverage 0.775 sits between the perfect phrase
  (0.80) and a mention-only verse (0.70). Recorded in `docs/search-design.md`.
- **Strong-span words stay in the text query; mention+text is a band
  (0.90·q, canonical).** The design's "mention-hop-only verses 0.70
  canonical" alone puts Acts 13:9 19th for "Paul" (behind every Saul verse),
  and text alone puts it 17th (short "Paul, an apostle…" verses first). The
  band is the concordance reading and it is the only ordering under which
  #21 (phrase first, q = 1) and #32 (13:9 first, the first verse naming Paul)
  both hold. Text-only hits keep the design's `0.80·(score/top)·q`.
- **Events via graph score 0.90**, same class as co-mention, only when both
  a person and a place span exist ("Paul" alone lists Paul's events by title
  match, not all 50 by participation). Group order puts them before the
  co-mention verses at equal score.
- **Pinned is a sort flag**, so a bare-ambiguous passage (0.85) stays above
  exact entities (1.0). When the entity path returns the same book row, the
  pinned hit keeps the reference's score and unions the `why`.
- **Only a consumed reference (≥ 0.9) scopes a clause.** A bare ambiguous
  book's word IS the content ("John", "Ruth", "Zechariah") — the first
  version scoped "John" to the Gospel of John by accident.
- **A reference-only clause has no verse hits** (#18). `versesFor(ref)`
  reads the text from the text layer's blob, never from the JSON bundles.
- **`verses.total` for "the" is 24,091 without materialising it**: `searchText`
  gained a `ranked` option (id/score/cov/phrase per verse, no snippets) and
  `verseDetail()` to explain any verse the merge picks; when a clause has no
  graph evidence, the text ranking is the verse ranking and only the returned
  window is normalized.
- **`;` clauses are unioned per group** (dedupe by id, higher score wins);
  `verses.total` is the sum of clause totals.
- **`in:` values** resolve to a testament (`nt|ot|new|old [testament]`), a book
  alias (bare, or ≥ 3 letters — "in so" is not Song), or a division name;
  comma lists allowed; a scope is the union of what it names. `book:` is a
  synonym of `in:`.
- **Kind filters union** (`person:X place:Y` → people and places), and a
  kind filter's value becomes entity words with that kind restriction.
- **Suggest's source order is the design's** (refs/books → entities → recent →
  fuzzy), so with a broad prefix the 50-entry entity range fills the eight
  slots and `recent` only surfaces on narrow prefixes. If CP-07 wants recent
  queries visible, reserve slots — a UI decision, not changed here.
- **Node entry point**: `packages/core/node/` (fsSource + re-export of
  `src/index.js`) with its own tsconfig (`types: ["node"]`, excludes
  `src/text/encoding.d.ts` to avoid the duplicate TextDecoder), emitted to
  `dist-node/` (gitignored) and exported as `@theographic/core/node`.
  `src/` stays `types: []`.
- `performance.now()` is declared narrowly in `plan.ts` for `timings`, with
  a fallback of 0 — timings are informational and never part of the output
  the determinism tests compare.

## Measurements (2026-09-16, M-series Mac, Node 22)

- `graph.bin`: 4,791 nodes, 50,152 verse links, **170 KB raw · 85 KB gz**
  (design estimate ~70 KB gz, +21%); opens in ~1–3 ms.
- Golden engine latency, 54 queries, median of 5 warm runs:
  **p50 0.49 ms · p95 2.94 ms · max 8.67 ms** ("in the beginning"; "the"
  8.48 ms). Gate 30 ms locally, 90 ms in CI.
- Suggest, 196 prefixes (2–6 chars of every golden query), best of 5:
  **p50 0.020 ms · p95 0.074 ms · max 0.43 ms**. Gate 2 ms.
- GitHub's 2-vCPU runner (run 35224199410, PR #89), the usual ~4–5× slower
  and a fair stand-in for a mid phone: engine **p50 1.82 ms · p95 14.76 ms
  · max 44.73 ms ("the")**; suggest p50 0.08 ms · p95 0.32 ms; graph.bin
  open 22 ms (cold, first call). "the" is the all-weak case CP-04 already
  flagged (its text layer alone measured 27–35 ms there); the CP-05 merge
  adds little on top because it takes the fast path. The CI gate is 3× the
  budget for this reason; the phone measurement in CP-07 decides whether
  weak-word scoring needs the cap CP-04 describes.
- Full `npm test`: 331 tests, 317 pass, 14 skipped (10 pending review, 1 deferred, 3 data-gated); core golden 125 = 114 pass + 11 skipped.

## Where I left off

Everything in the task list is done; [PR #89](https://github.com/robertrouse/theographic-web/pull/89)
into `v2` is green in CI (typecheck, data, tests, build, size budget). Follow-ups for later checkpoints: the two new pending-review
goldens need Robert; CP-07 decides whether `recent` needs reserved suggest
slots; phone timing still unmeasured (CP-07 has the worker).

## Verify

```bash
npm run build -w @theographic/core
THEOGRAPHIC_REQUIRE_DATA=1 npx vitest run --project core test/golden.test.ts test/engine.test.ts test/suggest.test.ts test/graph.test.ts
npx theographic search "Paul Antioch" --debug --limit 3
```
