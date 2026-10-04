/**
 * Map tiles offline: which OpenFreeMap requests the worker keeps, under
 * what key, and the LRU bookkeeping that holds the bucket to a hard cap.
 * Pure module (no worker globals) so the rules and the eviction order are
 * unit-tested; `../sw.ts` does the Cache API I/O.
 *
 * Terms (checked 2026-10-04): OpenFreeMap's public instance has no keys
 * and no request limits; its ToS forbids collecting data "in automated
 * ways without permission". Keeping what a reader's own map already
 * fetched is ordinary caching — the server itself sends tiles with
 * `max-age=315360000` and `access-control-allow-origin: *`. Pre-fetching
 * tiles nobody looked at would be automated collection, so there is none.
 *
 * Keys. Vector tiles live under a dated path that moves weekly
 * (`/planet/20260927_080001_pt/7/76/51.pbf`), and the dated path comes
 * from the TileJSON at `/planet`. If tiles were keyed by full URL, the
 * first online visit after a planet rebuild would point the cached
 * TileJSON at a new date and every saved tile would become unreachable
 * offline. So planet tiles are keyed without the date (`/planet/7/76/51.pbf`)
 * and the LRU records which date is stored: same date → served from
 * cache; different date → refetched online, the stored one served if the
 * network fails. One copy per z/x/y, never a dead week's worth.
 *
 * Policies:
 *   swr          style JSON and the TileJSON: small, unversioned, carry
 *                the attribution — cached copy at once, refreshed behind
 *   cache-first  everything else (tiles, Natural Earth raster, sprites,
 *                glyph ranges): immutable or near enough
 */

/** The one tile host. `PlaceMap.astro`'s style URL must be on it (tested). */
export const TILE_ORIGIN = 'https://tiles.openfreemap.org';

/**
 * Hard caps for the tiles bucket. One place page at its default zoom
 * costs ~25 requests and 1.5–3 MB (vector tiles 50–250 KB, a Natural Earth
 * raster up to ~320 KB); places cluster in the Levant, so neighbours share
 * tiles. 40 MB holds a few dozen distinct place views — enough for a
 * reading session's worth of maps — without being a noticeable share of a
 * phone's storage. The entry cap bounds bookkeeping, not storage.
 */
export const TILES_MAX_ENTRIES = 1500;
export const TILES_MAX_BYTES = 40 * 1024 * 1024;

export type TilePolicy = 'swr' | 'cache-first';

export interface TileKey {
  /** Cache key (URL string, no query). */
  key: string;
  /** Planet build date for vector tiles; `null` for everything else. */
  version: string | null;
  policy: TilePolicy;
}

const PLANET_TILE = /^\/planet\/([^/]+)\/(\d+\/\d+\/\d+\.pbf)$/;

/** How `url` (on `TILE_ORIGIN`) is cached. */
export function tileKey(url: string): TileKey {
  const u = new URL(url);
  const p = u.pathname;
  const m = PLANET_TILE.exec(p);
  if (m) return { key: `${u.origin}/planet/${m[2]}`, version: m[1] ?? null, policy: 'cache-first' };
  const key = `${u.origin}${p}`;
  if (p === '/planet' || p.startsWith('/styles/')) return { key, version: null, policy: 'swr' };
  return { key, version: null, policy: 'cache-first' };
}

export interface TileEntry {
  bytes: number;
  version: string | null;
}

/** Serialised form: least recently used first. */
export type TileLruJson = [key: string, bytes: number, version: string | null][];

/**
 * Least-recently-used index over the tiles bucket. A `Map` keeps insertion
 * order, so "used" is delete-then-set and the eviction order is the
 * iteration order. No clocks: recency is order, which keeps it testable.
 */
export class TileLru {
  private readonly entries = new Map<string, TileEntry>();
  private total = 0;

  static fromJSON(json: unknown): TileLru {
    const lru = new TileLru();
    if (!Array.isArray(json)) return lru;
    for (const row of json) {
      if (!Array.isArray(row)) continue;
      const [key, bytes, version] = row as unknown[];
      if (typeof key !== 'string' || typeof bytes !== 'number' || !(bytes >= 0)) continue;
      lru.set(key, bytes, typeof version === 'string' ? version : null);
    }
    return lru;
  }

  toJSON(): TileLruJson {
    return [...this.entries].map(([k, e]) => [k, e.bytes, e.version]);
  }

  get size(): number {
    return this.entries.size;
  }

  get bytes(): number {
    return this.total;
  }

  get(key: string): TileEntry | undefined {
    return this.entries.get(key);
  }

  /** Mark `key` most recently used. */
  touch(key: string): void {
    const e = this.entries.get(key);
    if (!e) return;
    this.entries.delete(key);
    this.entries.set(key, e);
  }

  /** Record (or replace) `key` as most recently used. */
  set(key: string, bytes: number, version: string | null): void {
    this.delete(key);
    this.entries.set(key, { bytes, version });
    this.total += bytes;
  }

  delete(key: string): void {
    const e = this.entries.get(key);
    if (!e) return;
    this.entries.delete(key);
    this.total -= e.bytes;
  }

  /**
   * Drop least-recently-used entries until both caps hold; returns the
   * dropped keys so the caller deletes them from the Cache API too. An
   * entry larger than `maxBytes` on its own goes first, whatever its
   * recency — keeping it would empty the rest of the bucket for one tile.
   */
  evict(maxEntries: number, maxBytes: number): string[] {
    const out: string[] = [];
    const drop = (key: string): void => {
      out.push(key);
      this.delete(key);
    };
    // Deleting the current key while iterating a Map is safe.
    for (const [key, e] of this.entries) if (e.bytes > maxBytes) drop(key);
    for (const key of this.entries.keys()) {
      if (this.entries.size <= maxEntries && this.total <= maxBytes) break;
      drop(key);
    }
    return out;
  }
}

/**
 * Only a readable, complete answer is stored. `type === 'cors'` rules out
 * opaque responses, which Chrome pads to ~7 MB each in quota accounting
 * and whose real size cannot be measured; MapLibre fetches in CORS mode
 * and the host answers `access-control-allow-origin: *`.
 */
export function storableTile(res: { ok: boolean; status: number; type: string }): boolean {
  return res.ok && res.status === 200 && res.type === 'cors';
}
