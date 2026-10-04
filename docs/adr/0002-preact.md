# ADR-0002 — Preact for the islands

**Status:** accepted 2026-10-04 (amends ADR-0001's "React 19 islands")

## Context

The search islands (`SearchPage` on `/`, `HeaderSearch` everywhere else) are
the only hydrated code on the site. CP-07 measured the main-thread JS on `/`
at **74.2 KB gz**, of which react-dom/client is 64.3 KB and the React runtime
3.0 KB; the islands themselves are ~7 KB. The brief's 60 KB gate could not be
met with React, so it was set at 80 KB with a note. On the Slow 4G profile
react-dom is the last download before hydration — it gates the first search
by ~0.2–0.25 s — and the islands use nothing from React beyond function
components and the basic hooks (`useState`, `useEffect`, `useRef`,
`useCallback`, `useMemo`, `useId`).

## Decision

- Render the islands with **Preact 10** via `@astrojs/preact`, using
  `preact` and `preact/hooks` directly. **No `preact/compat`**: nothing in the
  islands needs a React-only API or a third-party React component, and
  `compat` would add its event-normalisation layer back for no benefit.
- The islands are written to Preact's DOM semantics: `onInput` (not React's
  synthetic per-keystroke `onChange`), `class`/`for`, lowercase HTML
  attributes, and `preact`'s `TargetedEvent` types.
- `apps/web/tsconfig.json` sets `jsxImportSource: "preact"`.
- `packages/core` is unaffected and still imports no UI library (invariant 1).
- If a future island needs a React library (a chart, a map wrapper), enable
  `compat: true` in the integration for that case and record it here; do not
  reintroduce React alongside Preact.

## Consequences

- Main-thread JS on `/` falls from ~75 KB to the size of Preact plus the
  islands (measured and recorded in `docs/checkpoints/CP-07-search-ui.md`,
  "Preact swap"); the budget in `scripts/size-budget.mjs` tightens to the
  original 60 KB brief or below.
- React's synthetic `onChange` habit is the one trap: an `onChange` on a text
  input in Preact fires on commit, not per keystroke. Typeahead uses
  `onInput`.
- The ecosystem of React components is not directly available; for this site
  (one search island, everything else prerendered Astro) that is a cost we do
  not currently pay.

## Alternatives considered

- Keep React 19 (no change; leaves the 80 KB gate and the ~0.25 s on the
  critical path).
- Preact with `compat: true` and the islands unchanged (smallest diff, but
  ~5 KB more main-thread JS and a React-shaped layer that nothing needs).
- Vanilla custom elements (smallest of all, but rewrites ~1,000 lines of
  hooks-based UI for a few KB more).
