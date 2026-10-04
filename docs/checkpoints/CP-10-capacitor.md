# CP-10 — Capacitor shells

## Goal

iOS and Android apps wrapping `apps/web/dist`, store-ready structure.

## Definition of done

- Runs in the iOS Simulator (verified with the simulator tool) and an Android
  emulator; deep links open entity pages.
- Store-readiness checklist below completed or explicitly deferred.

## Tasks

- [x] `apps/mobile` with `@capacitor/core|cli|ios|android` 8.5.2, `@capacitor/app`,
      `status-bar`, `splash-screen`; `webDir` → `../web/dist`; iOS via SPM.
- [x] ~~`core/io/capacitorSource.ts`~~ — not needed. The WebView serves the
      bundle at `capacitor://localhost` / `https://localhost`, so the worker's
      root-relative `/data/*?v=…` fetches and the Cache API work unchanged.
      What the shells DID need was a page router (see decisions).
- [x] Status bar / safe area; hardware back; `theographic://` scheme +
      universal links / app links with `.well-known` placeholders.
- [x] Icons/splash from the mark (`apps/mobile/resources/`, generated with
      `@capacitor/assets` via npx).
- [x] Checklist: `apps/mobile/README.md` — each item done or "needs Robert".
- [ ] **Run on the iOS Simulator** — blocked on this Mac (see Verify).
- [ ] **Run on an Android emulator** — blocked, no Android tooling.

## What was built

```
apps/mobile/package.json                  workspace; sync / ios / android / assets scripts
apps/mobile/capacitor.config.ts           appId bible.viz.theographic (provisional), webDir,
                                          androidScheme https, SystemBars insetsHandling css
apps/mobile/ios/App/…                     Xcode project (SPM), ViewController.swift router,
                                          Info.plist URL scheme, App.entitlements applinks
apps/mobile/android/…                     Gradle project, MainActivity.java router,
                                          intent filters (scheme + https autoVerify)
apps/mobile/resources/                    icon-only, icon-foreground/background, splash(-dark)
apps/mobile/README.md                     build/run, what needs Robert, store checklist
apps/web/src/shell/links.ts               shellPathFor(): deep link → in-app path (tested)
apps/web/src/shell/native.ts              status bar, back button, appUrlOpen / launch URL
apps/web/src/layouts/Base.astro           0.2 KB gate: window.Capacitor → import('../shell/native')
apps/web/src/styles/{tokens,global}.css   --inset-* safe areas on header, bottom nav, sticky heads
apps/web/public/.well-known/              apple-app-site-association, assetlinks.json (TODO ids)
apps/web/public/_headers                  Content-Type: application/json for both
apps/web/test/shellLinks.test.ts
```

## Environment (2026-09-17, Robert's Mac)

| tool                    | state                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Xcode                   | 26.2 (17C52) at `/Applications/Xcode.app`, but `xcode-select -p` is the Command Line Tools. Used `DEVELOPER_DIR=` per command; `sudo xcode-select -s` needs Robert. |
| iOS SDK                 | `iphoneos26.2` and `iphonesimulator26.2` present                                                                                                                   |
| iOS platform / runtime  | **not installed** — `simctl list runtimes` is empty, `xcodebuild` reports "iOS 26.2 is not installed" and offers no destination, simulator or device. ~8 GB download from Apple (Xcode → Settings → Components). |
| Simulator MCP tool      | refuses to attach for the same reason (needs the full Xcode selected)                                                                                              |
| CocoaPods               | absent — irrelevant, iOS uses SPM                                                                                                                                  |
| Android                 | no `adb`, no `sdkmanager`, `$ANDROID_HOME` unset, no JDK (`java -version` → "Unable to locate a Java Runtime")                                                     |
| Node / npm              | 22.22.0 / 10.9.4                                                                                                                                                   |

## Verify

```bash
npm run typecheck && THEOGRAPHIC_REQUIRE_DATA=1 npm test && npm run build && node scripts/size-budget.mjs && npx prettier --check .
cd apps/mobile && npx cap sync                                   # copies dist into both shells
```

What was verified on 2026-09-17, and how:

- **Web gates green**: typecheck, 401 tests (4 new), build (6,299 pages),
  size budgets unchanged in spirit — main-thread JS on `/` 74.2 → 74.5 KB gz
  (the gate script), the shell chunk `native.*.js` is 3.7 KB gz and is only
  fetched when `window.Capacitor` is present (not counted: no page references
  it). Prettier clean with the native dirs ignored.
- **`cap sync ios` / `cap add android`** complete; SPM resolves
  `capacitor-swift-pm` 8.5.2 from GitHub (`Package.resolved` committed).
- **Swift type-checks** against the real simulator framework:
  `swiftc -typecheck -target arm64-apple-ios15.0-simulator` over
  `ViewController.swift`, `AppDelegate.swift`, `SceneDelegate.swift` with
  `-F` pointing at the resolved `Capacitor.xcframework` / `Cordova.xcframework`
  simulator slices — exit 0, no diagnostics. This is the closest thing to a
  build the machine allows; a link and a launch are not possible without the
  iOS platform.
- **Routing emulation** over the real build: the rule both native routers
  implement (extension → as-is; otherwise `<path>/index.html` if it exists,
  else `404.html`) applied to every root-relative `href`/`src` in 900 sampled
  pages — 31,425 links, 0 unresolved, 0 missing files. Spot: `/person/moses_2108`
  and `/person/moses_2108/` → `person/moses_2108/index.html`; `/browse` and
  `/browse/` → `browse/index.html`; `/1chr` → `1chr/index.html`; `/?q=Saul` →
  `index.html`; `/john/#John.3.16` → `john/index.html`; `/nope` → `404.html`.
- **Safe areas** in Chrome at 393×852 on `/person/moses_2108/` with the
  variables Capacitor injects set by hand (`--safe-area-inset-top: 59px`,
  `--safe-area-inset-bottom: 34px`): header 56 → 115 px with the brand row
  at y 59+; bottom nav 56 → 90 px, links still 55 px tall and ending at 818 =
  852 − 34. Without the variables both stay 56 px.
- **Deep-link router**: `shellLinks.test.ts` — custom scheme (host as first
  segment, with/without trailing slash, root, `?q=`), site URLs with query
  and fragment, foreign hosts and `mailto:` rejected, old-URL table applied.

**Not verified** (needs the iOS platform / Android SDK on this Mac; the
simulator tool and `xcodebuild` both refuse until then): the app launching,
home rendering, search in the shell, the place map, status-bar style, the
hardware back button, `appUrlOpen` end to end, Android at all. The Android
Java has not been compiled. Once Robert installs the platform, the README's
"without an IDE" block is the checklist; the first things to look at are
`/person/moses_2108` (proves the router) and `?q=Saul` (proves the worker and
`/data/*` fetches under `capacitor://`).

## Decisions made

- **A page router in each shell, not a `capacitorSource`.** Capacitor's
  default iOS `Router` and Android `html5mode` answer every extension-less
  path with the ROOT `index.html` — SPA semantics. The site is prerendered
  with `format: 'directory'`, so `/person/moses_2108` would have shown the
  home page. iOS: `StaticSiteRouter` via `CAPBridgeViewController.router()`
  (`ViewController.swift`, set as the storyboard's class). Android: a
  `BridgeWebViewClient` subclass rewrites the request URL before the local
  server sees it, because `RouteProcessor` is handed the literal
  `/index.html` and never the requested path. Both fall back to the site's
  `404.html`. Data fetches are unaffected (they carry extensions), so `core`
  is untouched.
- **The shell module is loaded, never bundled into pages.** A 0.2 KB script
  in `Base.astro` checks `window.Capacitor?.isNativePlatform?.()` (the native
  bridge defines it before any page script) and dynamic-imports
  `shell/native.ts`. The site's main-thread budget moves by 0.3 KB; the
  3.7 KB `@capacitor/*` chunk never reaches a browser.
- **Safe areas are CSS, on both platforms.** `viewport-fit=cover` was
  already in `Base.astro`. `tokens.css` defines `--inset-*` as
  `var(--safe-area-inset-*, env(safe-area-inset-*, 0px))`: iOS and Chromium
  ≥ 140 fill `env()`; Capacitor 8's `SystemBars` plugin (`insetsHandling:
  'css'`) injects the variables for older Android WebViews. Fixed a latent
  bug on the way: the bottom nav's `padding-bottom` was taken out of its
  border-box height, squeezing the links on a notched phone; the inset is now
  added to the height.
- **Deep links are routed by a pure function** (`shellPathFor`) so the
  old-URL table (invariant 8) applies inside the app too — nothing else
  would, since Netlify's `_redirects` is not in the bundle.
- **`androidScheme: https`** (Capacitor's default): a custom scheme cannot
  carry a path on Android since WebView 117 and the site is path-routed. iOS
  keeps `capacitor://`, a secure context for Workers and the Cache API.
- **SPM, not CocoaPods** — nothing to install, and `Pods/` never exists.
- **`@capacitor/assets` via `npx`, not a dependency**: it nests
  `@capacitor/cli` 8.4 and a `sharp` with open advisories. Remaining `npm
  audit` noise is `uuid` under the CLI's `xcode` dep (moderate, dev-only).
- **Icon from a 259 px crop.** The only mark above 100 px is the chain in
  `theographic-logo.png`; the 1024 icon is a 2.9× Lanczos upscale and reads
  soft. Recorded as needing a vector.
- **CP-09 note:** service workers do not run under `capacitor://` on iOS.
  The shell serves everything from the bundle and does not need one;
  registration in CP-09 must tolerate failure (or skip when
  `Capacitor.isNativePlatform()`).

## Where I left off

Everything buildable on this machine is built and pushed on
`cp-10-capacitor`; the PR against `v2` is open. The two unchecked tasks are
the simulator/emulator runs, blocked on tooling Robert has to install (see
Environment). After `sudo xcode-select -s …` and the iOS platform download:
`npm run sync -w @theographic/mobile`, then the `xcodebuild` / `simctl` block
in `apps/mobile/README.md`, screenshots of `/`, `?q=Saul`,
`/person/moses_2108`, a place page, and `simctl openurl` for the scheme.
Android: install Android Studio, `./gradlew assembleDebug` — the Java in
`MainActivity.java` has not been compiled yet.
