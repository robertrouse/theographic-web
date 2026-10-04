/// <reference lib="webworker" />
/**
 * The service worker. Hand-rolled rather than Workbox: the routing table
 * is five rules (`pwa/routes.ts`), the precache list is written by the
 * build hook in `astro.config.mjs`, and Workbox would add ~6 KB of
 * `workbox-window` to a main-thread budget that has 6 KB of headroom.
 *
 * Built by esbuild in `astro:build:done` to `dist/sw.js`; `__PRECACHE__`
 * and `__BUILD__` are defined there. Not served in `astro dev`.
 *
 * Caches (names in `pwa/caches.ts`):
 *   shell-<build>  the app shell, filled on install, replaced per build
 *   pages          visited HTML, stale-while-revalidate, ≤ PAGES_MAX
 *   assets         `/_astro/*` not in the shell (MapLibre), ≤ ASSETS_MAX
 *   tiles-v1       OpenFreeMap responses the reader's maps fetched, LRU,
 *                  ≤ TILES_MAX_ENTRIES and ≤ TILES_MAX_BYTES (`pwa/tiles.ts`)
 * `/data/*` is never intercepted — `fetchSource` owns that bucket.
 *
 * Update flow: a new build installs alongside the old one and waits; the
 * page shows "Update available" and only a tap sends SKIP_WAITING.
 */
import {
  ASSETS_CACHE,
  ASSETS_MAX,
  PAGES_CACHE,
  PAGES_MAX,
  TILES_CACHE,
  TILES_LRU_KEY,
  isStaleCache,
  shellCache,
} from './pwa/caches';
import { pageKey, routeFor } from './pwa/routes';
import { TILES_MAX_BYTES, TILES_MAX_ENTRIES, TileLru, storableTile, tileKey } from './pwa/tiles';

declare const self: ServiceWorkerGlobalScope;
declare const __PRECACHE__: string[];
declare const __BUILD__: string;

const SHELL = shellCache(__BUILD__);
const OFFLINE_URL = '/offline/';
const origin = self.location.origin;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await Promise.all(
        __PRECACHE__.map(async (url) => {
          // Hashed chunks may come from the HTTP cache; HTML and unhashed
          // files are re-fetched so a new build never installs a stale page.
          const req = new Request(url, {
            cache: url.startsWith('/_astro/') ? 'default' : 'reload',
          });
          const res = await fetch(req);
          if (!res.ok) throw new Error(`precache ${url} → HTTP ${res.status}`);
          await cache.put(req, res);
        }),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (isStaleCache(name, __BUILD__)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const route = routeFor(event.request, origin);
  if (route === 'bypass') return;
  if (route === 'page') event.respondWith(page(event));
  else if (route === 'asset') event.respondWith(asset(event.request));
  else if (route === 'tile') event.respondWith(tile(event));
  else event.respondWith(fromShellOrNetwork(event.request));
});

/** A cached response for `key` in the shell bucket, if the shell has it. */
async function fromShell(key: string): Promise<Response | undefined> {
  const shell = await caches.open(SHELL);
  return shell.match(key);
}

async function fromShellOrNetwork(req: Request): Promise<Response> {
  return (await fromShell(req.url)) ?? fetch(req);
}

/** `/_astro/*`: shell → assets bucket → network, stored on the way back. */
async function asset(req: Request): Promise<Response> {
  const hit = (await fromShell(req.url)) ?? (await (await caches.open(ASSETS_CACHE)).match(req));
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) void store(ASSETS_CACHE, req, res.clone(), ASSETS_MAX);
  return res;
}

/**
 * A navigation. The shell answers `/`, `/browse/`, `/about/` and
 * `/offline/` without the network. Any other page: the cached copy at
 * once while the network refreshes it; the network when there is no
 * copy; `/offline/` when there is neither. When a page is shown from
 * cache because the network failed, the new client is told so it can
 * say "saved copy" (`pwa/register.ts`).
 */
async function page(event: FetchEvent): Promise<Response> {
  const key = pageKey(event.request.url);
  const shell = await fromShell(key);
  if (shell) return shell;

  const pages = await caches.open(PAGES_CACHE);
  const cached = await pages.match(key);
  const refresh = fetch(event.request).then((res) => {
    // Only a real, final HTML answer is worth keeping: a 301 (Netlify's
    // slash redirect) cannot be replayed for a navigation, and a 404 is
    // not the page.
    if (res.ok && !res.redirected && res.type === 'basic') {
      void store(PAGES_CACHE, key, res.clone(), PAGES_MAX);
    }
    return res;
  });

  if (cached) {
    event.waitUntil(
      refresh.catch(() => tell(event.resultingClientId, { type: 'offline-copy', url: key })),
    );
    return cached;
  }
  try {
    return await refresh;
  } catch {
    const offline = await fromShell(`${origin}${OFFLINE_URL}`);
    if (offline) {
      void tell(event.resultingClientId, { type: 'offline-copy', url: key, fallback: true });
      return offline;
    }
    return new Response('Offline, and this page has not been saved.', {
      status: 503,
      headers: { 'content-type': 'text/plain' },
    });
  }
}

// ---- map tiles -----------------------------------------------------------

/**
 * Every read-modify-write of the tiles bucket and its LRU index goes
 * through this chain, so concurrent tile fetches (a map asks for ~20 at
 * once) never interleave their bookkeeping. The index is loaded once per
 * worker lifetime and saved after each change, debounced.
 */
let tilesQueue: Promise<unknown> = Promise.resolve();
let lru: TileLru | undefined;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function tilesOp<T>(fn: (cache: Cache, lru: TileLru) => Promise<T>): Promise<T> {
  const run = tilesQueue.then(async () => {
    const cache = await caches.open(TILES_CACHE);
    return fn(cache, lru ?? (lru = await loadLru(cache)));
  });
  tilesQueue = run.catch(() => undefined);
  return run;
}

/** The stored index, or one rebuilt from the bucket if it is missing. */
async function loadLru(cache: Cache): Promise<TileLru> {
  const saved = await cache.match(TILES_LRU_KEY);
  if (saved) {
    try {
      return TileLru.fromJSON(await saved.json());
    } catch {
      // fall through and rebuild
    }
  }
  const rebuilt = new TileLru();
  for (const req of await cache.keys()) {
    if (req.url === TILES_LRU_KEY) continue;
    const res = await cache.match(req);
    if (res) rebuilt.set(req.url, (await res.blob()).size, versionOf(res.url));
  }
  return rebuilt;
}

function versionOf(url: string): string | null {
  return url ? tileKey(url).version : null;
}

/** Persist the index ~1 s after the last change; the event keeps the worker up. */
let saveWaiters: (() => void)[] = [];
function scheduleSave(event: FetchEvent): void {
  if (saveTimer) clearTimeout(saveTimer);
  event.waitUntil(new Promise<void>((resolve) => saveWaiters.push(resolve)));
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    const waiters = saveWaiters;
    saveWaiters = [];
    void tilesOp(async (cache, index) => {
      await cache.put(
        TILES_LRU_KEY,
        new Response(JSON.stringify(index), { headers: { 'content-type': 'application/json' } }),
      );
    })
      .catch(() => undefined)
      .then(() => waiters.forEach((w) => w()));
  }, 1000);
}

/**
 * An OpenFreeMap request (`pwa/tiles.ts` decides key and policy).
 *   cache-first  a stored copy of the same planet date is served and
 *                touched in the LRU, no network; otherwise the network,
 *                stored if readable, with the stored copy of an older
 *                date as the fallback when the network fails
 *   swr          the stored copy at once, refreshed behind; the network
 *                when there is no copy
 */
async function tile(event: FetchEvent): Promise<Response> {
  const req = event.request;
  const { key, version, policy } = tileKey(req.url);
  const cached = await tilesOp(async (cache, index) => {
    const hit = await cache.match(key);
    if (!hit) {
      index.delete(key);
      return undefined;
    }
    // Stored but not indexed: the worker stopped before the index was
    // saved. Adopt it so the caps still count it.
    if (!index.get(key)) index.set(key, (await hit.clone().blob()).size, versionOf(hit.url));
    const stored = index.get(key)?.version ?? null;
    const fresh = policy === 'swr' || stored === version;
    if (fresh) index.touch(key);
    return { res: hit, fresh };
  }).catch(() => undefined);

  if (cached?.fresh) {
    scheduleSave(event);
    if (policy === 'swr')
      event.waitUntil(fromTileNetwork(event, key, version).catch(() => undefined));
    return cached.res;
  }
  try {
    return await fromTileNetwork(event, key, version);
  } catch (err) {
    if (cached) return cached.res; // an older planet date beats an empty square
    throw err;
  }
}

/** Fetch, and store a readable 200 under `key`, evicting to the caps. */
async function fromTileNetwork(
  event: FetchEvent,
  key: string,
  version: string | null,
): Promise<Response> {
  const res = await fetch(event.request);
  if (!storableTile(res)) return res;
  const copy = res.clone();
  event.waitUntil(
    (async () => {
      const bytes = (await copy.clone().blob()).size;
      await tilesOp(async (cache, index) => {
        await cache.put(key, copy);
        index.set(key, bytes, version);
        for (const old of index.evict(TILES_MAX_ENTRIES, TILES_MAX_BYTES)) await cache.delete(old);
      });
      scheduleSave(event);
    })().catch(() => {
      // Quota or private mode: served, just not stored.
    }),
  );
  return res;
}

/** Put, then trim the bucket to `max` entries (oldest first). */
async function store(
  name: string,
  key: string | Request,
  res: Response,
  max: number,
): Promise<void> {
  try {
    const cache = await caches.open(name);
    await cache.put(key, res);
    const keys = await cache.keys();
    for (const k of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(k);
  } catch {
    // Quota or private mode: served, just not stored.
  }
}

/** Post to the client a navigation is creating; it may not exist for a moment. */
async function tell(clientId: string, msg: Record<string, unknown>): Promise<void> {
  if (!clientId) return;
  for (let i = 0; i < 10; i++) {
    const c = await self.clients.get(clientId);
    if (c) {
      c.postMessage(msg);
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}
