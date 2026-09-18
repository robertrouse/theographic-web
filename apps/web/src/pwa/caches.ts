/**
 * Cache API bucket names shared by the service worker (`../sw.ts`), the
 * offline page and the tests. Pure module: no DOM, no worker globals.
 *
 * The engine's data files are NOT here: `fetchSource` in `@theographic/core`
 * owns `theographic-data-<version>` and answers `/data/*` reads from it
 * before any request reaches the network, so the worker never intercepts
 * `/data/` (see `routes.ts`) and never deletes those buckets. Both facts
 * hang off the one exported constant.
 */
import { DATA_CACHE_PREFIX } from '@theographic/core';

export { DATA_CACHE_PREFIX };

/** Everything the service worker creates starts with this. */
export const SW_PREFIX = 'theographic-sw';

/** The precached app shell, one bucket per build; older builds' are deleted on activate. */
export const shellCache = (build: string): string => `${SW_PREFIX}-shell-${build}`;

/** Visited HTML pages, stale-while-revalidate, bounded. */
export const PAGES_CACHE = `${SW_PREFIX}-pages`;
export const PAGES_MAX = 200;

/** `/_astro/*` fetched at runtime (MapLibre, chunks of an older build a cached page still names), bounded. */
export const ASSETS_CACHE = `${SW_PREFIX}-assets`;
export const ASSETS_MAX = 60;

/**
 * Whether `activate` for build `build` should delete the bucket `name`.
 * Only this worker's own shell buckets from other builds qualify; the
 * pages and assets buckets carry across builds, and the engine's data
 * buckets are `fetchSource`'s to prune.
 */
export function isStaleCache(name: string, build: string): boolean {
  if (name.startsWith(`${DATA_CACHE_PREFIX}-`)) return false;
  if (!name.startsWith(`${SW_PREFIX}-shell-`)) return false;
  return name !== shellCache(build);
}

/** Whether `name` is one of the engine's data buckets (any version). */
export function isDataCache(name: string): boolean {
  return name.startsWith(`${DATA_CACHE_PREFIX}-`);
}
