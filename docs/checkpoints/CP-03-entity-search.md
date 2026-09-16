# CP-03 — Entity search (`packages/core/src/entities` + `packages/data/src/index-entities.ts`)

## Goal

Name lookup over people, places, events, groups, books with alias weights,
typo tolerance, prominence ranking and precomputed disambiguation sublabels.

## Definition of done

- Goldens 3, 9, 14–17, 29–40, 44, 46 pass.
- Brute-force fuzzy over the full table measured and recorded (<5 ms on Node;
  target 1–3 ms on a mid phone).

## Tasks

- [ ] Build (`packages/data`): mine `richText` link labels → `(slug, label,
  count)`; keep count ≥ 2 or in `alsoCalled`; weight `w = count/Σ`; curated
      aliases `w=1` unless they equal another primary name or are a word with
      df>200 (then link share, or 0.25). Emit `entities.bin`/`entities.json`
      rows `{t, id, name, norm, aliases:[[norm,w,source]], vc, order, sub,
  dupCount}` and `names.sorted`.
- [ ] Sublabel rule: displayTitle parenthetical → `father: X` → "n verses ·
      first in Gen.4.1"; places: `featureType · n verses` + parenthetical.
- [ ] `entities/damerau.ts` — banded restricted DL with early exit.
- [ ] `entities/match.ts` — tiers exact 1.00 · aliasExact 0.95 · multiToken
      0.85 · prefix 0.80+0.10·ratio · token 0.75 · aliasWeak 0.55+0.30w ·
      fuzzy1 0.60 · fuzzy2 0.45; `s = band + 0.09·prom − 0.01·min(Δlen,5)/5`;
      fuzzy only when exact/prefix < 3 hits or single-word; `strictTiers` opt.
- [ ] `entities/entityIndex.ts` — load, sorted prefix array, binary search.
- [ ] `why[]` strings per hit; golden runner: `top`, `inTop`, `absent`, `why`.
- [ ] Perf test printing p50/p95 over all golden queries.

## Decisions made

_(fill in)_

## Where I left off

_(not started)_

## Verify

```bash
npm run data && npm test -w @theographic/core -- entities
```
