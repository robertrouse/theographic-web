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
 * Map tiles the reader's maps fetched from OpenFreeMap (`tiles.ts` has the
 * keys, caps and LRU). Versioned: bump the suffix when the key scheme or
 * the provider changes and `activate` drops the old bucket whole. Carried
 * across site builds otherwise — a deploy does not change a tile.
 */
export const TILES_VERSION = 'v1';
export const tilesCache = (version: string = TILES_VERSION): string =>
  `${SW_PREFIX}-tiles-${version}`;
export const TILES_CACHE = tilesCache();
/**
 * The LRU index is stored in the tiles bucket itself, under a key no tile
 * can have, so the two are deleted together.
 */
export const TILES_LRU_KEY = 'https://theographic.invalid/tiles-lru.json';

/**
 * Whether `activate` for build `build` should delete the bucket `name`.
 * This worker's own shell buckets from other builds qualify, and tiles
 * buckets of another `TILES_VERSION`; the pages, assets and current tiles
 * buckets carry across builds, and the engine's data buckets are
 * `fetchSource`'s to prune.
 */
export function isStaleCache(name: string, build: string): boolean {
  if (name.startsWith(`${DATA_CACHE_PREFIX}-`)) return false;
  if (name.startsWith(`${SW_PREFIX}-tiles-`)) return name !== TILES_CACHE;
  if (!name.startsWith(`${SW_PREFIX}-shell-`)) return false;
  return name !== shellCache(build);
}

/** Whether `name` is one of the engine's data buckets (any version). */
export function isDataCache(name: string): boolean {
  return name.startsWith(`${DATA_CACHE_PREFIX}-`);
}
