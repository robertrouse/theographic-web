# CP-01 — Data pipeline + bundles

## Goal

`npm run data` turns the metadata repo's JSON (at a pinned commit) into compact,
typed, content-hashed bundles under `apps/web/public/data/`, and refuses to
emit anything that fails the sanity gate.

## Definition of done

- `npm run data` is deterministic: same `data.lock` SHA → identical file hashes.
- Gate rejects 5 deliberate corruptions (see Verify) with an accurate message.
- Bundle sizes recorded below; `packages/core/src/types.ts` defines every bundle
  and the gate imports those types.
- Upstream data tickets filed (see list at the bottom).

## Inputs

`https://raw.githubusercontent.com/robertrouse/theographic-bible-metadata/<SHA>/json/{books,chapters,verses,people,places,events,peopleGroups,easton}.json`
Airtable-export shape: `[{ id: "rec…", createdTime, fields: {…} }]`. Local
clone for reference: `~/Documents/GitHub/theographic-bible-metadata`.

## Tasks

- [ ] `data.lock` — `{ repo, sha, fetchedAt, files: { name: sha256 } }`. Start at the
      current `origin/master` of the metadata repo (after Robert pushes; else the
      local HEAD `9497ac2`).
- [ ] `src/fetch.ts` — download the 8 files into `packages/data/.cache/<sha>/`,
      verify sha256 against the lock, skip if present.
- [ ] `src/normalize.ts` — Airtable → domain records keyed by slug / int id:
  - rec ids → slugs (people/places/events/groups/books/chapters); drop
    `createdTime`, `modified`, `Disambiguation (temp)` (misaligned rows).
  - strings → numbers: lat/long, birthYear/deathYear, verseNum, verseID.
  - split `alsoCalled` on `,`; `aliases` on `, `; strip the comment alias on
    `mount_of_olives_828`; fix `books.writers` comma-joined string (1Sam/2Sam).
  - verses: keep `verseText` + `richText` (mdText dropped); derive `fullRef`
    ("John 3:16"), `shortRef` (shortName-based), chapter/verse ints.
  - ISO astronomical years kept as ints; formatting is a core helper.
- [ ] `src/bundles.ts` — emit (gz sizes recorded here when measured):
  | file                        | contents                                                                                                           | target       |
  | --------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------ |
  | `manifest.json`             | version, metadata SHA, file → hash, counts, avgDocLen                                                              | 1 KB         |
  | `books.json`                | 66 books + chapters with `versesPerChapter[]`                                                                      | ~20 KB       |
  | `entities.json`             | people+places+groups+events: slug, kind, name, displayTitle, aliases, verseCount, coords, featureType, first verse | ~400 KB      |
  | `verses/{osis}.json`        | per-book verse rows `{id, c, v, text, rich, people[], places[], events[]}`                                         | 5.4 MB total |
  | `detail/{kind}/{slug}.json` | relationships + verse list for entity pages                                                                        | per entity   |
  | `events.json`               | title, sortKey, startDate, duration, participants, locations, verses range, partOf                                 | ~300 KB      |
  | `mentions.json`             | verseId → entity slugs (or CSR)                                                                                    | ~600 KB      |
- [ ] `src/gate.ts` — counts derived from source (not hardcoded), 0 dangling
      refs, every book has chapters and verses, coords numeric or absent, every
      verse has text, every entity has ≥1 verse or is flagged.
- [ ] `src/cli.ts` — `fetch | build | gate`; `build` = fetch → normalize → bundle
      → gate → write (write only if gate passes); prints a size table.
- [ ] Tests: normalize on fixtures (10 records each); gate on the 5 corruptions.
- [ ] Record sizes in this file; file the upstream tickets.

## Decisions made

_(fill in)_

## Where I left off

_(not started)_

## Verify

```bash
npm run data && ls -la apps/web/public/data | head && npm test -w @theographic/data
```

Corruptions the gate must reject (test fixtures): a book with no verses; an
entity referencing a missing verse; a verse with empty text; a place with
`latitude: "abc"`; total verse count ≠ 31,102.

## Upstream tickets to file (theographic-bible-metadata)

- `Disambiguation (temp)` misaligned across rows (john_1676 / judas_1757 / simon_2749).
- `mount_of_olives_828.aliases` contains a comment, not an alias.
- Common-word `alsoCalled` on jesus_905 / god_1324.
- 3 unresolved `richText` link slugs.
- `books.writers` comma-joined on 1Sam/2Sam.
- `mdText` links have a `([` typo.
