# CP-11 — Cutover

## Goal

`v2` becomes `master`; the canonical domain serves the new site with old URLs
intact.

## Definition of done

- Live at the canonical domain; smoke script hits 20 old URLs and gets 200s.
- README rewritten; About/license text per Robert's decision; ROADMAP updated
  with the pinned metadata SHA and the backlog.

## Tasks

- [ ] Merge `v2` → `master`; tag `v2.0.0`.
- [ ] Netlify production build; `_redirects` verified; sitemap submitted.
- [x] `scripts/smoke.mjs` over the old-URL list — 33 checks, all clear against the `v2` branch deploy (2026-09-18).
- [x] README and ROADMAP updated.
- [x] About page license text: data CC BY-SA 4.0 (About, footer, README, `LICENSE-DATA`); code stays GPL-3.0.

## Decisions made

- License: data CC BY-SA 4.0, code GPL-3.0 (Robert, 2026-10-04)

## Where I left off

_(not started)_

## Verify

```bash
node scripts/smoke.mjs https://theographic.netlify.app
```
