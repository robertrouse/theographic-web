# Checkpoints

**This is the pick-up point.** Any session — human or agent — starts here, opens
the first checkpoint that is not `done`, reads its file, runs its **Verify**
block, and continues from the first unchecked task. Update this table and the
checkpoint file _as you go_, not at the end: a session can be interrupted at any
moment and the next one must be able to resume from what is written down.

Status values: `todo` · `in-progress` · `blocked` · `done`.
One checkpoint = one branch `cp-NN-name` = one PR into `v2` = one tag `cp-NN` on
merge. `v2` merges to `master` at CP-11.

| #   | Checkpoint                                                      | Status      | Branch / PR   | Next action                                      |
| --- | --------------------------------------------------------------- | ----------- | ------------- | ------------------------------------------------ |
| 00  | [Scaffold + checkpoint system](checkpoints/CP-00-scaffold.md)   | done        | `v2` `6e33176` | —                                                |
| 01  | [Data pipeline + bundles](checkpoints/CP-01-data-pipeline.md)   | done        | [#83](https://github.com/robertrouse/theographic-web/pull/83) | —                                                |
| 02  | [Reference parser](checkpoints/CP-02-reference-parser.md)       | done        | [#84](https://github.com/robertrouse/theographic-web/pull/84) | —                                                |
| 03  | [Entity search](checkpoints/CP-03-entity-search.md)             | done        | [#86](https://github.com/robertrouse/theographic-web/pull/86) | 4 goldens pending Robert's review (see CP file) |
| 04  | [Verse text search](checkpoints/CP-04-verse-text-search.md)     | done        | [#87](https://github.com/robertrouse/theographic-web/pull/87) | phone timing to confirm in CP-07                 |
| 05  | [Unified search + suggest](checkpoints/CP-05-unified-search.md) | in-progress | `cp-05-search` | agent working; review PR when it lands |
| 06  | [Web pages](checkpoints/CP-06-web-pages.md)                     | done        | [#85](https://github.com/robertrouse/theographic-web/pull/85) | follow-up in CP-03: browse index shows sublabels for duplicate names |
| 07  | [Search UI island](checkpoints/CP-07-search-ui.md)              | todo        | —             |                                                  |
| 08  | [Generated definitions](checkpoints/CP-08-definitions.md)       | in-progress | [#88](https://github.com/robertrouse/theographic-web/pull/88) | pipeline + site done; needs Robert: API credential, run the 30-entity dry run, review |
| 09  | [PWA + offline](checkpoints/CP-09-pwa.md)                       | todo        | —             |                                                  |
| 10  | [Capacitor shells](checkpoints/CP-10-capacitor.md)              | todo        | —             |                                                  |
| 11  | [Cutover](checkpoints/CP-11-cutover.md)                         | todo        | —             | needs Robert: license decision                   |

## Dependencies

```
00 → 01 → 02 → 03 → 04 → 05 → 07
            01 ────────────→ 06 → 09 → 10
                   05, 06 ─→ 07
            01 ────────────→ 08 (independent of search; needs an API key + review)
                 all ─────→ 11
```

CP-06 (pages) can proceed in parallel with CP-02..05 (search core) once CP-01
lands; they touch different packages.

## Outside this repo (Robert)

- [ ] Rotate the Airtable PAT committed in `theographic-bible-metadata/scripts/airtable_etl.ipynb`.
- [ ] `theographic-bible-metadata`: pull (`cfb1c48` adds `geo/pauls_journeys_all.geojson`), push the 3 local commits, decide what to do with the untracked `geo/` work.
- [ ] License: repo `LICENSE` is CC BY-SA 4.0, readme/Notion/old About say CC BY 4.0. Pick one before CP-11.
- [ ] Netlify: confirm the site is linked to this repo and branch deploys are on for `v2` and `cp-*`.

## Protocol for a session

1. Read this file. Open the active checkpoint's file.
2. Run its Verify block. If it fails, that is the first task.
3. Work through unchecked tasks. Tick them as they are _verified_, not as they
   are written.
4. Before stopping — even mid-task — update **Where I left off** in the
   checkpoint file with what is half-done and what you would do next.
5. Commit with the checkpoint number in the subject (`CP-03: …`).
