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
- [ ] `scripts/smoke.mjs` over the old-URL list.
- [ ] README, About, ROADMAP.

## Decisions made

_(fill in)_

## Where I left off

_(not started)_

## Verify

```bash
node scripts/smoke.mjs https://theographic.netlify.app
```
