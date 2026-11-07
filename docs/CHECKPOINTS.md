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
| 05  | [Unified search + suggest](checkpoints/CP-05-unified-search.md) | done        | [#89](https://github.com/robertrouse/theographic-web/pull/89) | 10 goldens pending Robert (CP-03/04/05 files) |
| 06  | [Web pages](checkpoints/CP-06-web-pages.md)                     | done        | [#85](https://github.com/robertrouse/theographic-web/pull/85) | follow-up in CP-03: browse index shows sublabels for duplicate names |
| 07  | [Search UI island](checkpoints/CP-07-search-ui.md)              | done        | [#90](https://github.com/robertrouse/theographic-web/pull/90) | Preact swapped ([#94](https://github.com/robertrouse/theographic-web/pull/94), ADR-0002): main-thread JS 75.2 → 14.8 KB |
| 08  | [Generated definitions](checkpoints/CP-08-definitions.md)       | in-progress | branch `cp-08-dryrun` (no PR yet) | full run done 2026-10-23: 4,815 drafts in Airtable `definitions` (23 flagged); needs Robert: review in Airtable, merge metadata PR #57, export + pin |
| 09  | [PWA + offline](checkpoints/CP-09-pwa.md)                       | done        | [#92](https://github.com/robertrouse/theographic-web/pull/92) | map tiles cached offline ([#95](https://github.com/robertrouse/theographic-web/pull/95)): viewed tiles only, 40 MB LRU cap |
| 10  | [Capacitor shells](checkpoints/CP-10-capacitor.md)              | blocked     | [#91](https://github.com/robertrouse/theographic-web/pull/91), [#98](https://github.com/robertrouse/theographic-web/pull/98) | paused by Robert; iOS runs on the iOS 27 simulator (router fix #98); needs bundle id, Team ID, real-device test, Android |
| 11  | [Cutover](checkpoints/CP-11-cutover.md)                         | done        | [#97](https://github.com/robertrouse/theographic-web/pull/97) | v2 merged to master 2026-10-17 as a working replacement; design iteration continues (DESIGN-WORKFLOW.md) |

## Design track

Post-cutover UI work. Process: [DESIGN-WORKFLOW.md](DESIGN-WORKFLOW.md). Style
changes run on `design/*` branches without a row; in-depth sections get a
`D-NN` file and a row here.

| #   | Section | Status | Branch / PR | Next action |
| --- | ------- | ------ | ----------- | ----------- |
| D-01 | [Brand alignment with Viz.Bible](checkpoints/D-01-brand-alignment.md) | in-progress | `design/brand-vizbible` | Phases 0–1 in review on the PR preview; Robert: decisions 1–4 in the brief (logo blocks Phase 2) |

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

- [ ] Data-quality ledger: theographic-bible-metadata PR #59 (`data-quality/issues.yaml`); DQ-0010..0023 added from this project (issue #49 items + CP-08 findings). Fixes happen in Airtable.

- [ ] Rotate the Airtable PAT that was hard-coded in `theographic-bible-metadata/scripts/airtable_etl.ipynb` (never committed: `scripts/` is gitignored). Since 2026-10-13 the notebook is deprecated in favour of `etl/export_airtable.py` and reads `AIRTABLE_TOKEN` from the environment; after rotating, update the metadata repo's `AIRTABLE_TOKEN` Actions secret and revoke the old token.
- [x] `theographic-bible-metadata`: pulled, local commits and the `geo/` work pushed as [metadata#55](https://github.com/robertrouse/theographic-bible-metadata/pull/55) (2026-10-13); `data.lock` pins its `d811458`. Merge #55 before this repo's data PR.
- [x] License: data CC BY-SA 4.0 (matches the metadata repo), code GPL-3.0 — decided 2026-10-04; [#93](https://github.com/robertrouse/theographic-web/pull/93).
- [x] Netlify: linked; branch deploys on.
- [ ] CP-10: `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`, install the iOS platform in Xcode, then `cd apps/mobile && npm run sync && npx cap open ios`; supply Apple Team ID / bundle id / Android package + signing SHA-256 (`apps/mobile/README.md`).
- [ ] CP-08 dry run (needs `ANTHROPIC_API_KEY` in a plain shell): `cd packages/data && npm run data:definitions -- submit --dry-run 30`, then `… collect <batchId>`; review the 30 drafts; decide on the full run (~$50–130 at Opus 5 batch rates).

## Protocol for a session

1. Read this file. Open the active checkpoint's file.
2. Run its Verify block. If it fails, that is the first task.
3. Work through unchecked tasks. Tick them as they are _verified_, not as they
   are written.
4. Before stopping — even mid-task — update **Where I left off** in the
   checkpoint file with what is half-done and what you would do next.
5. Commit with the checkpoint number in the subject (`CP-03: …`).
