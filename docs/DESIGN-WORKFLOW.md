# Design workflow

How UI design iterates on v2 now that the foundation (CP-00..11) is in place.
Agents read this before touching anything under `apps/web/src`. The loop is
the one that already works: **branch → PR into `v2` → Netlify deploy preview →
review → merge**. Every PR gets a preview at
`https://deploy-preview-<PR#>--theographic.netlify.app` in about a minute, and
`v2` itself deploys to `https://v2--theographic.netlify.app`.

Work runs in one of two lanes, sized to the change.

## Lane 1 — style changes (minutes per round)

For colour, type, spacing, rule weights, small layout tweaks.

1. **Start in the tokens.** `apps/web/src/styles/tokens.css` is the one place
   colours, type sizes, widths and radii are set; components never name a
   colour directly. Most style requests should be a token edit. If one can't
   be, that is a hard-coded value that should become a token — make it one in
   the same PR.
2. **One running branch per theme**, not per tweak: `design/<theme>` (e.g.
   `design/type-scale`). Keep one session on it; each push updates the same
   deploy preview.
3. **Feedback where Robert is looking.** PR comments or the Netlify review
   toolbar on the preview. The agent reads those (`gh pr view <n> --comments`)
   instead of asking for the context again.
4. **Before/after on the reference pages** (below), phone and desktop, posted
   in the PR. Look at screenshots, not the diff.

## Lane 2 — in-depth sections (events, passage layouts, anything new)

1. **Brief first.** Add `docs/checkpoints/D-NN-<section>.md` using the CP file
   shape (Goal · Definition of done · Tasks · Decisions made · Where I left off
   · Verify) and a row in a "Design track" table in `docs/CHECKPOINTS.md`. The
   brief says what the page must communicate, what data actually exists for it
   (check `packages/core/src/types.ts` and a real bundle — not what we wish
   existed), and what is out of scope. This is what lets a fresh session pick
   the work up.
2. **Diverge in parallel.** Two or three agents, each in its own worktree,
   each builds one distinct direction as a route under `apps/web/src/pages/lab/`
   (`/lab/events-a/`, `/lab/events-b/` …) rendering real entities from the
   bundles. Put all the variants on one PR so a single preview shows them side
   by side. Parallel agents are for genuine alternatives, not for polishing one
   idea three times.
3. **Converge.** Robert picks one (and names what to steal from the others);
   one session folds it into the real page and iterates Lane-1 style.
4. **Delete `/lab/` before merge.** Lab routes never reach `master`; the smoke
   script and sitemap must not see them.

Throwaway sketches before any code are fine — a quick HTML mock or design
canvas is cheaper than wiring components. Move into the repo once a direction
is chosen.

## Reference pages

Every design PR checks these at 375 px and 1280 px, light and dark:

| Page                                             | Why                                                  |
| ------------------------------------------------ | ---------------------------------------------------- |
| `/person/david_994`                              | many relations, long verse list                      |
| `/person/jesus_904`                              | the densest person; aliases ("Lord", "Word")          |
| `/place/bethlehem_218`                           | map, two same-name places                            |
| a place with no coordinates                      | "no data" ≠ `0,0` (invariant 6) — pick one, add here |
| `/event/crucifixion_and_burial_459/`             | dense event                                          |
| `/event/exodus_from_egypt_125/`                  | event spanning a long passage                        |
| `/period/creation_of_all_things_1`               | period page                                          |
| `/ps/119/`                                       | longest chapter; acrostic headers                    |
| `/gen/1/`                                        | the canonical chapter                                |
| `/?q=Paul` and `/?q=John&debug=1`                | results groups, ambiguity, the why panel             |
| `/browse/`                                       | duplicate-name sublabels                             |

A screenshot script over this list (`scripts/shots.mjs`, headless Chrome as
CP-09 used) is the first thing to add when Lane 2 starts.

## Guardrails that still apply

- **Invariant 2:** layouts are built from generic components. An events
  layout that needs `if (kind === 'event')` in a shared component means the
  abstraction leaked — fix the data shape or the component instead.
- **Invariant 6:** absent data renders as absent, never as zero or empty
  string.
- **Size budget:** `node scripts/size-budget.mjs` gates main-thread JS. A
  timeline or charting library has to fit, be lazy-loaded behind the island
  that needs it, or come with an ADR.
- **Old URLs:** `node scripts/smoke.mjs <preview-url>` before merge.
- **Islands are Preact** (ADR-0002). No React or `preact/compat` without an ADR.

## Parallel agents — avoid collisions

- Split parallel work by page or section, never by file. Two agents editing
  `tokens.css` or `Base.astro` at once is a merge conflict, not a speed-up.
- Shared files (`tokens.css`, `global.css`, `Base.astro`, `docs/CHECKPOINTS.md`)
  have one owner per round; other agents propose changes in their report.
- Each agent ends with: PR URL, preview URL, screenshots, what it did not
  verify.
