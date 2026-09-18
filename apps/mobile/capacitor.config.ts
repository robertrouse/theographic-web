import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The native shells wrap the static web build unchanged: `cap sync` copies
 * `apps/web/dist` (every prerendered page, the search worker, the data
 * bundles) into the app and the WebView serves it from the bundle over
 * `capacitor://localhost` (iOS) / `https://localhost` (Android). Same
 * root-relative URLs as the site, so `/data/*?v=…` fetches and every
 * in-app link work without a rewrite layer.
 *
 * `appId` is provisional — Robert confirms the bundle id / package name
 * before the first store upload; it is the one thing here that cannot be
 * changed afterwards.
 */
const config: CapacitorConfig = {
  appId: 'bible.viz.theographic',
  appName: 'Theographic',
  webDir: '../web/dist',
  server: {
    // Android: a custom scheme cannot carry a path since WebView 117, and
    // the site is path-routed, so it must be http(s). iOS keeps the default
    // `capacitor://`, which WKWebView treats as a secure context (Workers,
    // Cache API and `crypto.subtle` all available).
    androidScheme: 'https',
  },
  ios: {
    // The page decides its own top padding from env(safe-area-inset-top)
    // (`viewport-fit=cover` in Base.astro); a contentInset would add a
    // second, blank one above the header.
    contentInset: 'never',
    backgroundColor: '#fbfaf7',
  },
  android: {
    backgroundColor: '#fbfaf7',
  },
  plugins: {
    SplashScreen: {
      // The prerendered HTML paints in well under a second from the bundle;
      // hide as soon as the first page is up rather than after a fixed wait.
      launchAutoHide: true,
      launchShowDuration: 0,
      backgroundColor: '#fbfaf7',
      androidScaleType: 'CENTER_INSIDE',
      splashFullScreen: false,
      splashImmersive: false,
    },
    SystemBars: {
      // Android: edge-to-edge with `env(safe-area-inset-*)` populated on
      // Chromium ≥ 140, and `--safe-area-inset-*` CSS variables injected
      // for older WebViews; the layout reads both (global.css).
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
