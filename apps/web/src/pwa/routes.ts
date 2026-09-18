/**
 * Which caching strategy a request gets. Pure function so the routing table
 * is testable without a worker; `../sw.ts` applies it.
 *
 *   bypass  the worker does not touch it: non-GET; cross-origin (map tiles
 *           from openfreemap.org, the Netlify deploy-preview toolbar and its
 *           API); `/.netlify/*`; the worker script itself; and `/data/*`,
 *           which `fetchSource` serves from its own Cache API bucket before
 *           the request exists, so intercepting it would double the storage
 *   page    a navigation: precached shell → visited-pages cache
 *           (stale-while-revalidate) → network → `/offline/`
 *   asset   `/_astro/*`, content-hashed and immutable: cache-first, stored
 *           in a bounded bucket when not precached
 *   static  anything else on this origin (brand images, icons, manifest,
 *           sitemap): precached shell → network. Not stored at runtime.
 */
export type Route = 'bypass' | 'page' | 'asset' | 'static';

export interface RequestLike {
  url: string;
  method: string;
  mode: string;
}

export function routeFor(req: RequestLike, origin: string): Route {
  if (req.method !== 'GET') return 'bypass';
  const url = new URL(req.url);
  if (url.origin !== origin) return 'bypass';
  const p = url.pathname;
  if (p.startsWith('/data/') || p.startsWith('/.netlify/') || p === '/sw.js') return 'bypass';
  if (req.mode === 'navigate') return 'page';
  if (p.startsWith('/_astro/')) return 'asset';
  return 'static';
}

/**
 * The cache key for a page: path only. `/?q=Saul` and `/?debug=1` are the
 * home page; `/person/moses_2108` (Netlify 301s it to the slash form, and
 * a redirected response must not be cached for a navigation) is looked up
 * as `/person/moses_2108/`.
 */
export function pageKey(url: string): string {
  const u = new URL(url);
  let p = u.pathname;
  if (!p.endsWith('/') && !/\.[a-z0-9]+$/i.test(p)) p += '/';
  return `${u.origin}${p}`;
}
