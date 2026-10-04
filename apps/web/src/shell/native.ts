/**
 * What the page does differently inside a Capacitor shell (CP-10). Loaded
 * by `Base.astro` only when the native bridge is present, so the site
 * itself never downloads `@capacitor/*`. Every page is a full document
 * load (the site is prerendered), so this runs once per page.
 *
 *   - status bar text follows the colour scheme (light page → dark text)
 *   - Android hardware back: history when there is one, else leave the app
 *   - deep links (`theographic://…`, Universal / App Links to the site) go
 *     to the matching page via `shellPathFor`, on cold start and while open
 *
 * Safe-area padding needs no JS: `global.css` reads `env(safe-area-inset-*)`
 * (and the `--safe-area-inset-*` variables Capacitor injects on Android).
 */
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { shellPathFor } from './links';

function navigateTo(url: string): void {
  const path = shellPathFor(url);
  if (path === undefined) return;
  const here = location.pathname + location.search + location.hash;
  if (path !== here) location.assign(path);
}

function syncStatusBar(dark: boolean): void {
  // Style.Light = light background, dark text; Style.Dark the reverse.
  void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined);
}

export function initShell(): void {
  if (!Capacitor.isNativePlatform()) return;
  document.documentElement.dataset['shell'] = Capacitor.getPlatform();

  const scheme = matchMedia('(prefers-color-scheme: dark)');
  syncStatusBar(scheme.matches);
  scheme.addEventListener('change', (e) => syncStatusBar(e.matches));

  void App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) history.back();
    else void App.exitApp();
  });

  void App.addListener('appUrlOpen', ({ url }) => navigateTo(url));
  // A cold start from a link: the page that loaded is the home page and the
  // event above may have fired before this listener existed.
  void App.getLaunchUrl()
    .then((launch) => {
      if (launch?.url && !sessionStorage.getItem('shell:launch-handled')) {
        sessionStorage.setItem('shell:launch-handled', '1');
        navigateTo(launch.url);
      }
    })
    .catch(() => undefined);
}

initShell();
