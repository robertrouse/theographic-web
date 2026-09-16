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

- [ ] `refs/aliases.json` — curated aliases per OSIS book (jn/jhn/jno, mt/matt,
      mk, lk, ps/psa/pss/psalm, prv, eccl/qoh, song/sos/cant/canticles,
      phlm/phm/philem, jas, jud→Jude, jdg/judg→Judges, rev/re/apoc, …).
- [ ] `refs/bookAliases.ts` — table built from `books.json` (osis, bookName,
      shortName, slug, unambiguous 3/4-letter prefixes) ∪ curated; normalization
      (lowercase, drop `.`, collapse spaces, `i/ii/iii`, `first/second/third`,
      `1st/2nd/3rd` → `1/2/3` when followed by a known alias); duplicate check.
- [ ] `refs/parseReference.ts` — scanner per grammar: `ordinal? alias
  (chapter (':' verses)? ('-' chapterEnd)?)?`; verse lists `,`; `;`
      separators; en-dash; "f"/"ff"; alias glued to digits ("Jn3:16").
      Validate against `chapterCount` / `versesPerChapter`; single-chapter
      books treat a lone number as a verse.
- [ ] `refs/verseIds.ts` — `Ref ↔ BBCCCVVV` ranges; `versesFor(ref)`.
- [ ] Ambiguity: bare book that is also an entity name → `confidence 0.7`,
      `ambiguousWith[]` (list built at CP-03 from the entity index; until then a
      static list of the 34 collisions).
- [ ] Golden runner skeleton reading `test/golden/queries.jsonl` (shared with
      CP-03..05); implement the `refs` expectation.

## Decisions made

_(fill in)_

## Where I left off

_(not started)_

## Verify

```bash
npm test -w @theographic/core -- refs
```
