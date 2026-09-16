# CP-01 — Data pipeline + bundles

## Goal
`npm run data` turns the metadata repo's JSON (at a pinned commit) into compact,
typed, content-hashed bundles under `apps/web/public/data/`, and refuses to
emit anything that fails the sanity gate.

## Definition of done
- [x] `npm run data` is deterministic: same `data.lock` SHA → identical file hashes
      (verified: two builds, 4,410 files, 0 differing hashes).
- [x] Gate rejects deliberate corruptions with an accurate message (8 in tests).
- [x] Bundle sizes recorded below; `packages/core/src/types.ts` defines every bundle
      and the gate imports those types.
- [x] Upstream data tickets filed: robertrouse/theographic-bible-metadata#49.

## Inputs
`https://raw.githubusercontent.com/robertrouse/theographic-bible-metadata/<SHA>/json/{books,chapters,verses,people,places,events,peopleGroups,easton}.json`
Pinned SHA in `packages/data/data.lock`: `cfb1c48` (origin/master 2026-04-21;
`json/` identical to Robert's local HEAD). `THEOGRAPHIC_METADATA_DIR=<clone>`
builds from a local checkout instead of the network; hashes still apply.

## Tasks
- [x] `data.lock` with SHA + sha256 per file (filled on first fetch, verified after).
- [x] `src/fetch.ts` — network or local copy into `.cache/<sha>/`, hash check.
- [x] `src/source.ts` — typed Airtable shape (only fields we read).
- [x] `src/normalize.ts` — rec ids → slugs/OSIS/ints; strings → numbers; alias
      splitting; writers join bug; `Antioch (Syria)` name/title split; absent stays
      absent; verseCount/firstVerse recomputed from links; Easton kept as
      `detail.easton` (hidden source for CP-08).
- [x] `src/gate.ts` — counts derived from source; canonical order; chapter bounds;
      0 dangling refs across every relationship; coordinates both-or-none, in range,
      never 0,0; entity verse lists ⇔ verse→entity links.
- [x] `src/bundles.ts` — deterministic writer, manifest with sha256 per file.
- [x] `src/cli.ts` — `fetch | build | gate`; build writes only if the gate passes.
- [x] Tests: synthetic fixture (2 books / 6 verses / 3 people / 2 places / 1 event /
      1 group); 24 tests incl. 8 corruptions and a determinism check.
- [x] CI runs `npm run data` (source files cached by lock hash); Netlify build
      command is `npm run data && npm run build`.

## Bundle sizes (from `cfb1c48`)
| file | count | raw | gzip |
|---|---|---|---|
| `books.json` | 1 | 16.5 KB | 3.9 KB |
| `entities.json` (people+places+groups) | 1 | 675 KB | 99 KB |
| `events.json` | 1 | 295 KB | 65 KB |
| `verses/{osis}.json` | 66 | 12.2 MB | 2.2 MB |
| `detail/person/{slug}.json` | 3,067 | 1.2 MB | 783 KB |
| `detail/place/{slug}.json` | 1,274 | 720 KB | 458 KB |
| total | 4,410 | 15.1 MB | 3.6 MB |

Verses carry both `text` and `rich`; the search index (CP-04) builds from `text`
only and ships separately, so a search never needs a verses file.

## Decisions made
- **No `mentions.json`.** Verse rows already carry `people/places/events`, and
  entity detail carries verse lists; the compact graph file is CP-05's job
  (`graph.bin`), built from the same data.
- **Easton text is bundled in `detail/*` as `easton`**, not shown by default.
  It is the grounding source for CP-08 and a labelled fallback the site may use
  until definitions exist.
- **Group slugs are `slugify(groupName)`** (`apostles_the_eleven`); event slugs
  are `slugify(title)_<eventID>` (`tower_of_babel_11`) so they read like
  person/place slugs and stay unique.
- **`Disambiguation (temp)` is dropped entirely** (misaligned rows, see #49).
- **Bundles are gitignored and rebuilt in CI/Netlify** from the pinned SHA
  rather than committed (15 MB raw, 4,410 files).
- **`splitName`**: a trailing parenthetical in `kjvName` becomes `title`.

## Where I left off
Done. Next: CP-02 (reference parser) and CP-06 (pages) can proceed in parallel.

## Verify
```bash
npm run data && npm test -w @theographic/data
```
Expect: `gate passed`, size table totalling ~3.6 MB gz, 24 tests green.
Spot checks (node): God 8,587 verses · Jesus 1,831 · Jerusalem 754 at
31.7767, 35.2342 · Paul aliases `["Saul","Mercurius"]`, first verse Acts 7:58 ·
`1Sam` writers `[samuel_2469, gad_1263, nathan_2153]` · Ps 119 has 176 verses ·
first event "Creation of all things" sortKey −4002.99 · 27 places without coordinates.
