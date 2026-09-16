# CP-05 — Unified search, intent, suggest (`packages/core/src/query`, `suggest`, `engine.ts`)

## Goal

One `search()` over all groups with an explainable rule-based plan, filters,
graph hops, cross-group ranking, and a sub-16 ms `suggest()`. Public API frozen.

## Definition of done

- All goldens green (43 deferred). p50/p95 printed; any query >30 ms fails.
- `packages/core/README.md` documents the API; `npx theographic search "…"` CLI
  (`packages/core/bin`) runs the same engine over `fsSource`.
- `SearchOptions.signals` seam exists with a no-op signal test.

## Tasks

- [ ] `query/grammar.ts` — filters (`in|book|person|place|event|group|type|mentions|sort`),
      quoted phrases, `;` clauses; sugar "… in <book>", "verses mentioning X".
- [ ] `query/classify.ts` — order: filters → references (longest match) →
      entity n-grams 3/2/1 (fuzzy unigrams ≥4 only, `weak` spans keep words) →
      text terms → group activation; every step appends `why`.
- [ ] `graph/adjacency.ts` + build `graph.bin` (CSR varint): entity→verses,
      event→verses, event→participants/locations; `mentions()`, co-mention
      intersection, events by participants ∩ locations.
- [ ] `query/plan.ts` executes; `query/merge.ts` normalizes (passages pinned;
      entities min(1,s); text 0.80·score/top·q; co-mention 0.90; hop 0.70) and
      interleaves with stable ties (group order → verseID → id).
- [ ] `suggest/suggest.ts` — 2-char trigger; book/reference completions; entity
      prefix range; recent; fuzzy fallback; dedupe; limit 8.
- [ ] `engine.ts` — `createEngine(source)`, layers `core|text|graph`, `ready`
      flags, `preload()`, `searchSync`; `io/fsSource.ts`; determinism test
      (same result twice, CLI vs in-process).
- [ ] Freeze API; write README.

## Decisions made

_(fill in)_

## Where I left off

_(not started)_

## Verify

```bash
npm test -w @theographic/core && npx theographic search "Paul Antioch" --json | head -40
```
