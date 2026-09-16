# CP-03 — Entity search (`packages/core/src/entities` + `packages/data/src/index-entities.ts`)

## Goal

Name lookup over people, places, events, groups, books with alias weights,
typo tolerance, prominence ranking and precomputed disambiguation sublabels.

## Definition of done

- Goldens 3, 9, 14–17, 29–40, 44, 46 pass — **21 of 25 expectations green;
  4 pending review with numbers** (see below).
- Brute-force fuzzy over the full table measured and recorded (<5 ms on Node;
  target 1–3 ms on a mid phone) — **p50 0.72 ms · p95 1.32 ms · max 1.36 ms**
  on Node 22 (M-series), 34 golden queries, best-of-7; first pass p95 1.33 ms.
  Phone: not measured (no throttled profile in this session).

## Tasks

- [x] Build (`packages/data/src/index-entities.ts`): mine `rich` link labels →
      `(slug, label, count)`; keep count ≥ 2 or curated; `w = count/Σ`;
      curated aliases `w=1` unless they equal another primary name or are a
      word with df>200 (then link share, or 0.25). Emits
      `entities.index.json` rows `{t, id, name, norm, title?, aliases:[[norm,w,source]],
  vc, order?, sub, dupCount, ft?}` + `names` sorted `[string, row, alias]`.
      **860 KB raw · 152 KB gz** (rows 119 KB, `names` 33 KB, `sub` 22 KB).
- [x] Sublabel rule (see Decisions).
- [x] `entities/damerau.ts` — banded restricted DL with early exit, typed-array
      buffers, verified against an unbanded reference on 2,000 random pairs.
- [x] `entities/match.ts` — tiers exact 1.00 · aliasExact 0.95 · multiToken
      0.85 · prefix 0.80+0.10·ratio · token 0.75 · aliasWeak 0.55+0.30w ·
      fuzzy1 0.60 · fuzzy2 0.45; `s = band + 0.09·prom − 0.01·min(Δlen,5)/5`;
      `strictTiers`, `kinds`, `fuzzy`, `limit` options. Constants in one
      exported object `ENTITY_TIERS`.
- [x] `entities/entityIndex.ts` — load, per-row token vocabularies, id map,
      `prefixRange`/`rowsWithPrefix` by binary search over `names`.
- [x] `why[]` on every hit (tier + matched string, band, prom, len, raw);
      golden runner: `empty`, `nonEmpty`, `top`, `inTop`, `order`, `exactly`,
      `sublabels`, `scoreBelow`, `why`, `count` (entity groups).
- [x] Perf test `test/entities.perf.test.ts` printing p50/p95, failing at p95 ≥ 5 ms.
- [x] Follow-up from CP-06: `/browse/#people` and `#places` show the index
      `sub` next to names with `dupCount > 1` (`disambiguator()` in
      `apps/web/src/lib/data.ts`); unique names unchanged; type stays 15px.

## Golden results (real data, metadata `cfb1c48`)

| #   | q               | result                                                                                                                                                |
| --- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3   | John            | ✓ people john_1676 1.045, john_1677 1.036, mark_1679 1.024 (all exact; book John 1.067)                                                              |
| 9   | Ruth            | ✓                                                                                                                                                     |
| 14  | Philemon        | ✓                                                                                                                                                     |
| 15  | Jude            | ✓ top jude_1756 · **scoreBelow pending review**: no Judas hit. DL(jude, judas) = 2 (e→a, +s) and a 4-char query allows DL ≤ 1                          |
| 16  | Mark            | ✓ mark_1679 via aliasExact surname (w 1) 0.974                                                                                                         |
| 17  | James           | ✓ 3 James, sublabels "Son of Zebedee" / "Son of Alphaeus" / "Brother of Jesus"                                                                         |
| 29  | Jerusalm        | ✓ fuzzy1 jerusalem_636 0.664                                                                                                                           |
| 30  | Nebuchadnezar   | ✓ fuzzy1 nebuchadnezzar_2167 (the only one; vc 88)                                                                                                     |
| 31  | Saul            | ✓ saul_2478 1.055; paul_2479 2nd in people at 0.623 (aliasWeak, w = 25/348 = 0.072); shaul_2477 0.568 (w 2/348)                                        |
| 32  | Paul            | ✓                                                                                                                                                     |
| 33  | Antioch         | ✓ places exactly [antioch_68 1.027, antioch_69 1.016]; subs "Syria · City · 14 verses", "Pisidia · City · 4 verses"                                    |
| 34  | Paul Antioch    | ✓ events non-empty (token hits: Paul's Journey to Rome, Mission to Antioch in Pisidia, …)                                                              |
| 35  | Simon           | ✓ peter_2745 1st (1.051); 8 Simons with 8 distinct subs · **count pending review**: 17 people hits = 8 exact + 2 token (Wife of Simon, Mother of the Wife of Simon) + 7 fuzzy1 (Simeon ×4, Sihon, Zion via "sion", Simri) |
| 36  | person:Simon    | ✓ other entity groups empty (`verses` deferred to CP-05)                                                                                               |
| 37  | Simon Peter     | ✓ peter_2745 multiToken 0.891                                                                                                                          |
| 38  | Zechariah       | ✓ ≥20 distinct subs (26 exact) · **count pending review**: 33 = 26 exact + 2 aliasWeak (zacharias_3011, zacher_2972: curated alias, linked once each) + 1 fuzzy1 + 4 fuzzy2 |
| 39  | Jacob           | ✓ israel_682 1.019 (aliasExact, w 375/377 = 0.995) > jacob_683 1.011 (exact, vc 2). Margin 0.008 — it is the prominence term that decides              |
| 40  | Bethlehem       | ✓ bethlehem_218 1.035 > bethlehem_219 1.007                                                                                                            |
| 44  | Apostles        | ✓ groups: 3 exact (group names are split like places: "Apostles" + title "Apostles (The Eleven)")                                                      |
| 46  | Israel          | ✓ israel_682 All #1 · **inTop pending review**: no place named Israel exists in the data (nearest: group "Nation of Israel", event "Northern Kingdom (Israel)") |

Also green through the entity path: #1, #2 (people empty once the reference is
consumed), #20 (people non-empty with an out-of-range chapter), #41 (moses_2108
top), #42 (places has Babel; event exact 1.023).

The four pending-review lines carry a `pendingReview` note in `queries.jsonl`;
the golden test runs them, skips while they fail, and **fails once they pass**
so the flag cannot go stale. None was fixed by weakening the formula. Robert's
call on each: #15 relax DL for 4–5-char queries or drop the Judas clause; #35
and #38 either mean "exact-tier count" (then the expectation kind should say
so) or the numbers should be 17 and 33; #46 needs a place row.

## Decisions made

- **Fuzzy trigger read literally: `<3 lexical hits OR single word`.** A single
  word is always typo-checked (this is what puts Judas-like near-misses on
  "Jude" — except DL forbids it, see #15); a multi-word query is compared
  whole, only when the lexical tiers found fewer than 3 rows. The stricter
  AND reading would not have rescued #35/#38 (they fail on token and
  aliasWeak hits, not fuzzy) and would have removed "Mark"→Mary-style
  tolerance, so there was no reason to depart from the text.
- **A curated alias with link share 0 is dropped** (doc updated). The rule
  "then link share" would otherwise put James at 0.55 for "Zebedee" and every
  "(Brother of Jesus)" at 0.55 for "Jesus". 144 of 354 collisions went this
  way. A share that is merely small is kept (Paul for "Saul" at 0.072).
- **Title tokens are aliases; the whole title is not.** "Simon Peter" must be a
  multiToken hit (golden #37 asks for that why), which an alias "simon peter"
  at 0.95 would pre-empt. Tokens skip the name's own tokens and 14 function
  words; the df>200 rule catches the rest ("son" → 234 links to Jesus, w 1).
  Consequence worth knowing: `king`→jesus_905 carries w 1 from a single
  link, because the share formula has no support floor. Not changed —
  that is a formula decision for Robert.
- **multiToken vocabulary includes every title token regardless of alias
  weight**, so "Antioch Syria" reaches Antioch (Syria) even though "syria"
  was dropped as an alias (it is Syria's own name).
- **Sublabel rule**, people: title parenthetical when the title is
  `<name> (…)` → the whole title when it differs from the name ("John the
  Baptist", "Jacob (Israel)" on Israel — the original rule would have shown
  "Israel" under Israel) → `<name> <surname>` → `father: <name>` →
  `<n> verses · first in <Book c:v>` → `no verses`. Places: `[lead ·]
  <featureType> · <n> verses`, lead being the parenthetical or differing
  title. Groups: parenthetical or `<m> members · <n> verses`. Events:
  `<year> · <n> verses`. Books: `<division> · <n> chapters`. A zero verse
  count is never printed as a fact (invariant 6): the part is omitted or
  reads "no verses".
- **Group names are split like places** ("Apostles (The Eleven)" → name
  "Apostles", title kept) so the three Apostles groups are exact hits with
  distinguishing sublabels rather than one exact and two prefixes.
- **Events are indexed under their URL slug** (`tower_of_babel_53`), not the
  bare integer, so `EntityHit.id` is a string for every row type.
- **Books are rows** (`t: 'b'`, group `passages`) with the short name as a
  w=1 alias. The CP-02 alias table stays the reference parser's; suggest can
  use both.
- **`dupCount` counts across all row types**: the 26 Zechariahs and the book
  make 27, the three James people and the epistle 4. 2,158 of 4,880 rows
  share a name with something. `raw` is unclamped and is the within-entity
  sort key; `score = min(1, raw)`.
- **`names` is shipped** as the design says (33 KB gz of the 152). It is
  fully derivable in ~1 ms at load; if the core-layer budget tightens, drop
  it from the file and build it in `loadEntityIndex` — no other change.
- `count` on an entity group is checked here; on `verses` it is deferred to
  CP-04 (`KIND_OWNER` says both).
- `EntityAliasSource` rather than `AliasSource`, which `refs/bookAliases.ts`
  already exports.

## Measurements

- `entities.index.json`: 860 KB raw, **152 KB gz**; rows alone 119 KB gz;
  `names` 33 KB gz; `sub` strings 22 KB gz. Core layer so far (books 4 +
  entities 152) ≈ 156 KB gz of the ~180 budget.
- Load: 1.1 ms (4,880 rows). Match: p50 0.72 ms, p95 1.32 ms, max 1.36 ms
  (`npx vitest run --project core test/entities.perf.test.ts` prints them).
- Mining: 40,690 links; 649 (slug, label) pairs kept; 891 curated
  candidates, 354 collided, 144 dropped at share 0; 1,090 aliases in the
  file (199 mined-only, 450 curated+mined, 441 curated-only); 3 unresolved
  link slugs: `daughter_of_lot_-_younger_984` ×8, `daughter_of_lot_-_older_985`
  ×4, `timna_2859` ×2 (upstream ticket already listed in search-design.md).

## Where I left off

Done and pushed as PR (see CHECKPOINTS). Not done: phone timing on a
throttled profile (CP-07/09 have a device); the four pending-review goldens
need Robert. `apps/web` does not yet load the index at runtime — CP-05/07.

## Verify

```bash
npm run data
THEOGRAPHIC_REQUIRE_DATA=1 npx vitest run --project core test/entities.test.ts test/entities.perf.test.ts test/golden.test.ts
THEOGRAPHIC_REQUIRE_DATA=1 npx vitest run --project data test/index-entities.test.ts
```
