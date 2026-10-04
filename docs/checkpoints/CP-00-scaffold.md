# CP-00 — Scaffold + checkpoint system

## Goal

A repo any session can build, test, and resume from, with the Gatsby tree gone
and the v2 structure in place.

## Definition of done

- `npm ci && npm run typecheck && npm test && npm run build` green locally and in CI.
- Netlify branch deploy of `v2` serves the placeholder home page.
- `docs/CHECKPOINTS.md` lists CP-00..CP-11 with a file each.
- `CLAUDE.md` states the invariants and the checkpoint protocol.

## Tasks

- [x] Clone `theographic-web`, branch `v2` from `master` (`c4fdea24`).
- [x] Remove the Gatsby tree; keep `LICENSE`, brand PNGs → `apps/web/public/brand/`.
- [x] Root: npm workspaces, `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), vitest projects, prettier, `.gitignore`.
- [x] `packages/core` — `lib: ["ES2022"]`, `types: []` so DOM/Node usage fails typecheck (invariant 1). Smoke test.
- [x] `packages/data` — CLI stub (`fetch | build | gate`), `tsx` runner, references core.
- [x] `apps/web` — Astro 7 + React 19 islands + sitemap; `Base.astro` layout; tokens/global CSS; placeholder `index.astro`.
- [x] `netlify.toml` (publish `apps/web/dist`, Node 22).
- [x] `.github/workflows/ci.yml` — typecheck, test, build, size budget.
- [x] `scripts/size-budget.mjs` — counts only JS referenced from HTML (Astro emits an unreferenced React renderer chunk).
- [x] Docs: CHECKPOINTS.md, all CP files, ROADMAP.md, ADR-0001.
- [x] CLAUDE.md.
- [x] Commit on `v2` (`6e33176`), push; CI run 35052979406 green (typecheck, test, build, budget).
- [x] Netlify branch deploy live at https://v2--theographic.netlify.app/ (site already linked; production still serves the old build until CP-11).

## Decisions made

- TypeScript pinned to 5.9.x, not 7.0 (the native compiler) — tooling compatibility
  (Astro check, vitest) is not worth verifying on a scaffold. Revisit at CP-05.
- `apps/web/public/data/` is gitignored: bundles are built by `npm run data`.
  CI will build them from the pinned metadata SHA (CP-01) rather than commit ~8 MB.
- Astro `build.format: 'directory'` so every entity page is `/path/index.html`
  and Netlify needs no rewrite for clean URLs.

## Where I left off

Done. Next checkpoint: CP-01.

## Verify

```bash
npm ci && npm run typecheck && npm test && npm run build && node scripts/size-budget.mjs
```

Expect: 2 tests pass, 1 page built, `ok ^_astro/.*\.js$`.
