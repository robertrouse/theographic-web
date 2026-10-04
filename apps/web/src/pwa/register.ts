/**
 * Registers the service worker and owns the two bits of PWA chrome:
 *
 *   - "Update available" toast when a new build has installed and is
 *     waiting. Tapping it sends SKIP_WAITING; the page reloads on
 *     `controllerchange`. Nothing reloads on its own.
 *   - "Offline · saved copy" marker when this page came out of the cache
 *     because the network failed (the worker says so with `offline-copy`),
 *     or when the browser reports no connection. Hidden again on `online`.
 *
 * Loaded from `Base.astro` on every page, so it counts toward the
 * main-thread budget: plain DOM, no imports. Registered after `load` so it
 * never competes with the search island's critical path.
 */
const sw = navigator.serviceWorker;

function note(cls: string, text: string, action?: { label: string; run: () => void }): HTMLElement {
  const el = document.createElement('div');
  el.className = `pwa-note ${cls}`;
  el.setAttribute('role', 'status');
  el.append(text);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.label;
    b.addEventListener('click', action.run);
    el.append(' ', b);
  }
  document.body.append(el);
  return el;
}

let offlineNote: HTMLElement | undefined;
function showOffline(): void {
  if (offlineNote || location.pathname === '/offline/') return;
  offlineNote = note('pwa-note--offline', 'Offline · saved copy');
}
function hideOffline(): void {
  offlineNote?.remove();
  offlineNote = undefined;
}

if (sw && import.meta.env.PROD) {
  let updateShown = false;
  const offerUpdate = (waiting: ServiceWorker): void => {
    if (updateShown) return;
    updateShown = true;
    note('pwa-note--update', 'A new version is available.', {
      label: 'Reload',
      run: () => waiting.postMessage({ type: 'SKIP_WAITING' }),
    });
  };

  sw.addEventListener('message', (e: MessageEvent<{ type?: string }>) => {
    if (e.data?.type === 'offline-copy') showOffline();
  });
  let reloading = false;
  sw.addEventListener('controllerchange', () => {
    if (reloading || !updateShown) return;
    reloading = true;
    location.reload();
  });

  addEventListener('load', () => {
    sw.register('/sw.js')
      .then((reg) => {
        if (reg.waiting && sw.controller) offerUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const next = reg.installing;
          if (!next) return;
          next.addEventListener('statechange', () => {
            // `controller` set = an old build is serving this page, so
            // "installed" is an update, not the first install.
            if (next.state === 'installed' && sw.controller) offerUpdate(next);
          });
        });
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update();
        });
      })
      .catch(() => {
        // No worker (private mode, unsupported): the site is the site.
      });
  });
}

if (!navigator.onLine) showOffline();
addEventListener('offline', showOffline);
addEventListener('online', hideOffline);
