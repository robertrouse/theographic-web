# D-01 — Brand alignment with Viz.Bible

## Goal

Theographic and [Viz.Bible](https://viz.bible) should read as two parts of one
project. Step one, this checkpoint: Theographic adopts Viz.Bible's visual
language (type, palette, page texture, header/footer pattern, card and button
treatment) without losing anything Theographic needs that Viz.Bible doesn't
have: a search box on every page, dense data layouts, long reading text, a
mobile bottom nav, and the accessibility floors already set in `tokens.css`.

Merging the two sites under one name is a later decision (see "Later" below).
Nothing here should make it harder.

## Reference: what Viz.Bible actually is

Read from `robertrouse/vizdotbible@master` (`8217540`, 2026-10-12) and the live
site on 2026-10-17. Gatsby 5 + Tailwind 3; all styling is Tailwind utilities
plus a small `src/styles/style.css`.

| Element         | Viz.Bible                                                                                          | Theographic v2 today                                         |
| --------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Body font       | **PT Sans** (`@fontsource/pt-sans`, 400 only, so bold is faux-bold), antialiased                   | Helvetica Neue / system stack                                |
| Display font    | Georgia italic for `h1`, 30px, **centred**                                                         | Georgia italic for `h1`, left-aligned: **already shared**    |
| Body size       | `p` = 18px, `tracking-wide` (0.025em), slate-700                                                   | 17px, no tracking, `#1f2328`                                 |
| Neutrals        | Tailwind **slate** (`gray` is remapped to `slate`)                                                 | warm off-white `#fbfaf7`, warm rules                         |
| Page background | slate-100 + `handmadepaper.png` (6.5 KB) · dark: slate-900 + `congruent_outline.png` (8.4 KB, 60px) | flat `#fbfaf7` · dark: flat `#15171a`                        |
| Link colour     | sky-500 `#0ea5e9`, hover sky-700 · dark sky-400                                                    | indigo `#3d5ccc` · dark `#93a6ff`                            |
| Brand accent    | logo red `#90181B` (light) / `#D01B1F` (dark), on the `(viz.` paren only                           | none                                                         |
| Header          | transparent over the texture; centred SVG logo; nav below in UPPERCASE, `tracking-widest`, `\|` separators | sticky white bar; italic wordmark left, search, nav right    |
| Cards           | white / slate-700, `border-8 border-double border-gray-300`, `rounded-lg`, `shadow-xl`, hover sky-100 | white surface, 1px rule, 8px radius, faint shadow           |
| Buttons         | outline: 1px sky-500 border, `rounded-md`, sky text, hover sky-100 fill                            | chips: filled `surface-2` pills                              |
| Small labels    | UPPERCASE `text-xs tracking-wide font-medium` (card author, feature label)                         | UPPERCASE kicker above `h1` ("PERSON"): **already close**    |
| Footer          | circular outline social icons (email, Facebook, X, YouTube) + "© Robert Rouse"                     | one line of data attribution and licences                    |
| Dark mode       | `prefers-color-scheme` (Tailwind `darkMode: "media"`)                                              | `prefers-color-scheme`: **same mechanism**                   |
| Maps            | Mapbox GL v3, custom styles on the `bibleviz` account                                              | MapLibre + OpenFreeMap tiles (CP-09, #95)                    |

### Contrast check (WCAG 2.1, measured, not estimated)

| Pair                                   | Ratio | AA body (4.5) |
| -------------------------------------- | ----- | ------------- |
| sky-500 `#0ea5e9` on slate-100         | 2.53  | **fails**     |
| sky-600 `#0284c7` on slate-100         | 3.74  | fails         |
| sky-700 `#0369a1` on slate-100         | 5.42  | passes        |
| slate-700 `#334155` on slate-100       | 9.45  | passes        |
| slate-500 `#64748b` on slate-100       | 4.34  | **fails**     |
| slate-600 `#475569` on slate-100       | 6.92  | passes        |
| red `#90181B` on slate-100             | 8.22  | passes        |
| sky-400 `#38bdf8` on slate-900         | 8.33  | passes        |
| sky-400 on slate-700 (dark card)       | 4.83  | passes        |
| slate-400 `#94a3b8` on slate-900       | 6.96  | passes        |
| red `#D01B1F` on slate-900             | 3.28  | fails for text; fine for a logo mark |

So Theographic takes Viz.Bible's **hues** but not always its **steps**. Links
use sky-700 in light mode, muted text uses slate-600, and the brand red is a
mark colour, never text in dark mode. Viz.Bible should eventually move to the
same steps; see "Later".

## Definition of done

- All reference pages in `DESIGN-WORKFLOW.md` at 375 px and 1280 px, light and
  dark, look like they belong next to viz.bible. Robert's call, on the deploy
  preview.
- Every colour, font and texture comes from `tokens.css`; no component names a
  hex value or font stack (`grep` check in Verify).
- Every text/background pair in the new tokens is ≥ 4.5:1 (≥ 3:1 for ≥ 24px
  display text), recorded in the token comments.
- Font cost measured on a throttled phone profile and written down here. Target:
  ≤ 60 KB of woff2 on first load, `font-display: swap`, no layout shift from
  the swap that Lighthouse flags.
- `npm run typecheck && npm test && npm run build && node scripts/size-budget.mjs`
  green; `node scripts/smoke.mjs <preview>` clear.
- Viz.Bible and Theographic link to each other in the header or footer.

## Tasks

Lane 1 work runs on one branch, `design/brand-vizbible`, one PR into `v2`
(per DESIGN-WORKFLOW). Phases are commits on that branch, each pushed so the
preview updates. Phase 3 depends on the decisions below.

**Phase 0: before shots**

- [x] Add `scripts/shots.mjs`: reference pages × {375, 1280} × {light, dark}
      → `shots/<label>/` (gitignored). Drives the installed Chrome over the
      DevTools protocol with Node's built-in WebSocket, so it adds no
      dependency. `--set=vizbible` captures viz.bible `/`, `/bible-data/` and
      `/about/` as the target. 2026-10-19: `before` (48 shots) and `vizbible`
      (12) taken.
- [x] "Place with no coordinates" reference page: `/place/eden_354` (15
      verses, no coordinates), added to `DESIGN-WORKFLOW.md` and the shots set.

**Phase 1: tokens (no layout changes)**

- [x] Fonts: PT Sans 400, 700 and 400 italic in `apps/web/src/fonts/`,
      subset from `@fontsource/pt-sans` 5.3.0's latin files with hinting
      dropped (recipe in `styles/fonts.css`): **10.3 / 10.5 / 11.1 KB**
      (fontsource's are 45.5 / 47.2 / 42.6 KB). `font-display: swap`; 400 is
      preloaded. Imported from `src/`, so Vite hashes them into `/_astro/`
      (immutable cache, service-worker precache). A real 700 ships, so bold is
      not faux-bold as it is on viz.bible.
- [x] Palette → slate neutrals + sky links, light and dark, with every text
      token ≥ 4.5:1 against the worst texture pixel, `--color-surface` and
      `--color-surface-2` (ratios in `tokens.css`). New role tokens:
      `--color-heading`, `--color-brand` (defined, unused until the logo
      decision), `--color-mark`, `--color-popup-text`, `--shadow-pop`,
      `--font-mono`, `--tracking`, `--page-texture(-size)`. `--color-secondary`
      was unused and is gone. The last hard-coded colours (map popup text,
      search highlight, two shadows, the mono stack) now use tokens.
- [x] Body 18px with `letter-spacing: 0.025em` (on `html`; Georgia headings
      reset to `normal`). Keep the 15px floor for small text. Check whether
      `tracking-wide` hurts long reading on `/ps/119/`; if it does, apply it to
      UI prose only and not to verse text. Note the result here.
- [x] Page texture: viz.bible's `handmadepaper.png` / `congruent_outline.png`
      as `src/assets/paper-light.png` / `paper-dark.png`, set on `html` and on
      the sticky letter headings in `/browse/`. **Finding:** viz.bible's dark
      pattern is opaque and neutral (#313131–#3d3d3d), so its dark page is
      grey, not slate-900; `--color-bg` dark is `#343434` to match.
      Check verse text and the map edges over it at 375 px.
- [x] `theme-color` metas and `manifest.webmanifest` → `#f0f2f3` / `#343434`.
      The PWA icons still have the old `#fbfaf7` ground; they get redrawn
      with the logo decision (Phase 2).

**Phase 2: frame (Base.astro, global.css)**

- [ ] Header: viz.bible pattern (transparent over the texture, logo, UPPERCASE
      `tracking-widest` nav with `|` separators) while keeping header search on
      inner pages and the sticky behaviour on phones. Likely: desktop = logo
      left + search + uppercase nav right; home = centred logo with nav
      beneath, as on viz.bible. Mobile bottom nav keeps its job and takes the
      uppercase label style.
- [ ] Nav gains a **Viz.Bible** link; viz.bible's nav gains **Theographic**
      (separate PR in `vizdotbible`).
- [ ] Footer: viz.bible's circular social icons (inline SVG, no
      `react-icons`), then the existing data attribution and licences. Keep the
      CC BY-SA attribution; it is a licence requirement, not decoration.

**Phase 3: components**

- [ ] Card treatment (double border, `rounded-lg`, `shadow-xl`) on the framed
      blocks: the definition panel, the map frame, home-page entry points. Not
      on every list row, since dense data needs quiet containers.
- [ ] Buttons and links: viz.bible outline-button style for primary actions
      ("Browse the full index", pager). Entity chips: decide between outline
      pills (matches buttons) and keeping filled pills restyled to slate.
- [ ] `h1`: keep entity pages left-aligned (kicker + title + data grid read
      top-to-bottom); centre `h1` on home, about, browse and 404 as viz.bible
      does. Confirm with Robert on the preview.
- [ ] Search UI (`search.css`): tabs, result groups and the debug panel take
      the new tokens; check `?debug=1` legibility in dark mode.
- [ ] Map: restyle the OpenFreeMap style's land, water and label colours
      toward viz.bible's map palette. Do not switch providers (CP-09 decision).

**Phase 4: verify and hand back**

- [ ] After shots of every reference page; before/after pairs in the PR.
- [ ] Throttled-phone font timing written into this file.
- [ ] Robert's review on the preview; iterate Lane-1 style on the same branch.

## Decisions needed from Robert

1. **Logo.** Viz.Bible's mark is `(viz.BIBLE`: a red italic parenthesis-and-
   "viz." with roman caps. Theographic has its own chain-`g` wordmark. Options:
   (a) keep the chain-`g` logo, restyled into the palette; (b) a sibling lockup
   in the viz.bible construction (red italic lead + roman caps); (c) "Theographic"
   set as a product under the Viz.Bible mark ("Viz.Bible · Theographic"). This
   choice decides how far the header in Phase 2 goes and pre-empts some of the
   naming question.
2. **Paper texture under reading text.** Viz.Bible puts prose straight on the
   texture. Keep that for chapters and Ps 119, or set long verse text on a flat
   card surface?
3. **Link blue.** Accept sky-700 (passes AA) instead of viz.bible's sky-500
   (fails at 2.5:1)? If yes, fix viz.bible the same way later.
4. **Chips.** Outline pills (consistent with viz.bible buttons) or filled pills?

## Decisions made

- 2026-10-17: Theographic takes Viz.Bible's hues and type but keeps its own
  contrast floors; where they conflict the accessible step wins (table above).
- 2026-10-17: Georgia italic display stays. It is already the shared element
  between the two sites.
- 2026-10-17: Fonts are self-hosted; no font CDN (offline/PWA, CP-09) and no
  runtime font package. 2026-10-19: they live in `src/fonts/`, not
  `public/fonts/`, so they are content-hashed and precached.
- 2026-10-19: Fonts ship unhinted (~10 KB/face instead of ~45 KB). Hinting
  only matters for Windows at small sizes. If text looks soft there, restore
  it for 400 only (+35 KB).
- 2026-10-19: Dark chips (`--color-surface-2`) are slate-800, darker than the
  slate-700 surfaces: sky-400 links on a lighter chip fall to 4.4:1.
- 2026-10-19: Body text is slate-700 (viz.bible's paragraph colour) and
  headings slate-900, not the old near-black for everything.
- 2026-10-17: Maps stay on MapLibre + OpenFreeMap; alignment is via style
  colours only.

## Later (not this checkpoint)

- **Shared brand tokens.** One `brand.css` of custom properties that both sites
  consume. Theographic directly, viz.bible through `tailwind.config.js`
  `theme.extend.colors` mapped to `var(--…)`. Worth doing once the palette
  settles here, so it is extracted from something proven.
- **One name.** If the sites merge (e.g. Theographic at `viz.bible/explore/` or
  `theographic.viz.bible`), every old Theographic URL needs a redirect
  (invariant 8). `redirects.ts` and CP-11's smoke script already cover the
  shapes, so plan it as a redirect-table change plus a canonical-URL change,
  with an ADR.
- Viz.Bible's own accessibility fixes (link step, muted step, faux-bold).

## Where I left off

2026-10-19: Phases 0 and 1 done on `design/brand-vizbible`; PR into `v2` opened
for the deploy preview. Typecheck and tests pass locally (417). **Not verified
locally:** `npm run build` and the size budget. The local build stalls copying
`public/data` because this checkout lives in iCloud-synced `~/Documents` (see
below); the PR's CI run and Netlify preview are the build check. Still open in
Phase 1: the `/ps/119/` tracking check and the map-edge check at 375 px, both
from `after` shots of the preview
(`node scripts/shots.mjs https://deploy-preview-<PR>--theographic.netlify.app after`).
Then Phase 2 waits on decision 1 (logo).

**Local build environment.** `~/Documents` syncs to iCloud Drive with
Optimize Mac Storage on, so the file provider throttles the build's ~15k file
writes (`cp` of 1,298 small files: 482 in 5 min) and leaves conflict copies
(`public/data/detail/place/* 3.json`, 1,274 of them). Moving the checkout
outside `~/Documents` (or renaming it `*.nosync`) fixes both.

## Verify

```bash
npm run typecheck && npm test && npm run build && node scripts/size-budget.mjs
# no hard-coded colours or font stacks outside tokens.css
grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(|font-family:[[:space:]]*[^v[:space:]]" apps/web/src --include='*.css' --include='*.astro' --include='*.tsx' \
  | grep -vE 'styles/(tokens|fonts)\.css|theme-color|://'
node scripts/shots.mjs https://deploy-preview-<PR>--theographic.netlify.app after
node scripts/smoke.mjs https://deploy-preview-<PR>--theographic.netlify.app
```
