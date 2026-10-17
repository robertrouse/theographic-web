# CP-02 — Reference parser (`packages/core/src/refs`)

## Goal

`parseReference("Jn 3:16-18; Ps 23:1,4")` → validated `Ref[]` with verseId
ranges, consumed spans, errors, and ambiguity flags. No guessing: out-of-range
is an error, book-vs-person names return both readings.

## Definition of done

- Golden queries 1–20 and 45 pass (see `docs/search-design.md` §golden).
- Property test: every verse's `osisRef`, `fullRef`, `shortRef` round-trips.
- Build check: no alias maps to two books.

## Tasks

- [x] `refs/aliases.json` — curated aliases per OSIS book (jn/jhn/jno, mt/matt,
      mk, lk, ps/psa/pss/psalm, prv, eccl/qoh, song/sos/cant/canticles,
      phlm/phm/philem, jas, jud→Jude, jdg/judg→Judges, rev/re/apoc, …).
      Every book has coverage; 573 aliases in the built table.
- [x] `refs/bookAliases.ts` — table built from `books.json` (osis, bookName,
      shortName, slug, unambiguous 3/4-letter prefixes) ∪ curated; normalization
      (`refs/normalize.ts`: lowercase, drop `.`, collapse spaces; `i/ii/iii`,
      `first/second/third`, `1st/2nd/3rd` registered as variants of every
      ordinal alias, so they fold only when followed by a known alias);
      duplicate check throws. `entries` is sorted for `aliasesWithPrefix()`.
- [x] `refs/parseReference.ts` — scanner per grammar: `ordinal? alias
  (chapter (':' verses)? ('-' chapterEnd)?)?`; verse lists `,`; `;`
      separators; en/em dash; "f"/"ff"; alias glued to digits ("Jn3:16");
      OSIS dots ("Gen.1.1"). Validates against `chapterCount` /
      `versesPerChapter`; single-chapter books treat a lone number as a verse.
- [x] `refs/verseIds.ts` — `verseIdRange(ref, book)`, `versesInRef(ref, books)`,
      `verseCountInRef`, `versesInChapter`.
- [x] Ambiguity: bare book that is also an entity name → `confidence 0.7`,
      `ambiguousWith[]`. `refs/ambiguous.ts` holds the constant derived from
      `entities.json` (30 books, 113 entities) and `deriveAmbiguousBooks()`;
      `test/ambiguous.test.ts` fails on drift and `test/gen-ambiguous.mts`
      regenerates it. `buildBookAliasTable(books, { ambiguous })` lets CP-03
      pass the live entity index instead.
- [x] Golden runner reading `test/golden/queries.jsonl` (all 48 queries, 55
      lines with spelling variants); implements `refs`, `errors`, `consumed`;
      every other expectation kind is a named skip with its owning checkpoint
      (`KIND_OWNER` in `test/golden/runner.ts`).

## Decisions made

- **Bare-book recognition is a property of the alias, not the parser.** Only
  the OSIS, full name, slug and curated aliases of four or more letters may
  stand alone as a book (`BookAliasEntry.bare`). Short forms ("Jn", "So",
  "Is", "Am") and generated prefixes ("gene", "son") need a chapter after
  them, otherwise "so loved" and "I am" would read as Song and Amos. Golden
  3/9/14/15/16/17 use full names, so nothing in the spec is lost.
- **A verse list is one span, many refs.** "Ps 23:1,4" consumes one span and
  emits one `Ref` per item (`verse` / `verseRange`), all sharing
  `matchedText`. The `verseList` kind stays in the union for a host that
  wants to collapse them; the parser never emits it. (Golden 10 says "two
  refs".) Later items inherit the last chapter named: "Gen 1:31-2:1,3" is
  Gen 2:3.
- **One bad item fails the whole reference.** "Ps 23:1,999" is a single
  `verseOutOfRange` error over the whole span; nothing from it is consumed
  or emitted. Simpler to explain than partial consumption, and it keeps
  invariant 5 literal.
- **No bare-book fallback on error.** "John 99" yields only the error. The
  reader clearly meant a chapter; emitting "the book of John" would be a
  guess. The unconsumed span is what lets the entity classifier still return
  the people (golden 20).
- **"Phm 1" emits both readings.** Verse 1 at 1.0 and the chapter at 0.5,
  as specified. Any other lone number, range or suffix in a single-chapter
  book is verses only.
- **Reversed ranges are `rangeReversed` errors**, never swapped.
- **Collision rule for `ambiguousWith`:** book name equals an entity's
  primary name, a person's surname, or a curated alias (normalized). Titles
  are not compared. That yields 30 books, not the 34 the design doc quotes;
  the doc's figure was an estimate and the constant is now pinned to data.
  Ordinal books ("1 John") never collide, by construction.
- **`normalizeAlias` keeps `1st/2nd/3rd` glued** so the table key and the
  scanner token agree; everything else splits letter runs from digit runs.
- **Unit tests run on a frozen `test/fixtures/books.json`**, so `refs.test.ts`
  needs no built data; `fixture › matches the live books.json` catches drift.
  The golden, property and ambiguity tests read the real bundles and skip by
  name when they are absent — except under `THEOGRAPHIC_REQUIRE_DATA=1`,
  which CI sets. CI now runs `npm test` after `npm run data` for this reason.
- The `ParseError` carries a `message` alongside the `reason` code ("John
  has 21 chapters, not 99") so the UI can show it without a lookup table.

## Where I left off

Complete. All tasks verified locally: 104 core tests pass, 69 named skips
(later checkpoints' golden kinds); property test covers 31,102 verses ×
3 forms in ~150 ms; typecheck, build and prettier clean. PR opened into `v2`
— see `docs/CHECKPOINTS.md` for the link and CI status.

Things a later checkpoint may want, none of which blocks this one:

- CP-05: a possessive glued to a bare book ("John's gospel") still parses as
  the book at 0.7; the classifier should treat `'s` after a consumed span as
  a text signal. Not handled here on purpose — the parser knows nothing about
  words around a reference.
- CP-05: `suggest()` can use `aliasesWithPrefix(table, prefix)`; entries
  carry `source` so ordinal variants and generated prefixes can be filtered
  out of the completion list.
- CP-03: replace the default ambiguity map with the live entity index via
  `buildBookAliasTable(books, { ambiguous })`, then `AMBIGUOUS_BOOK_ENTITIES`
  can go.

## Verify

```bash
npm test -w @theographic/core -- refs      # unit + property
npm test -w @theographic/core -- golden    # golden set; skipped kinds are listed by name
npm test -w @theographic/core -- ambiguous # constant vs entities.json
```

The property and golden tests need `npm run data` to have run; without it
they report one named skip each.
