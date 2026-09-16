# CP-10 — Capacitor shells

## Goal

iOS and Android apps wrapping `apps/web/dist`, store-ready structure.

## Definition of done

- Runs in the iOS Simulator (verified with the simulator tool) and an Android
  emulator; deep links open entity pages.
- Store-readiness checklist below completed or explicitly deferred.

## Tasks

- [ ] `apps/mobile` with `@capacitor/core|cli|ios|android`; `webDir` → web dist.
- [ ] `core/io/capacitorSource.ts` (bundled assets); status bar / safe area;
      hardware back; `theographic://` scheme + universal links for `/person/…`.
- [ ] Icons/splash from the mark.
- [ ] Checklist: bundle ids, privacy manifest, screenshots, listing copy, signing.

## Decisions made

_(fill in)_

## Where I left off

_(not started)_

## Verify

```bash
npm run build && npx cap sync && npx cap open ios
```
