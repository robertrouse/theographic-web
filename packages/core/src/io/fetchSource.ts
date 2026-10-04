/**
 * `IndexSource` over `fetch()` and the Cache API — the browser host, in
 * a Web Worker or on a page.
 *
 * Why this lives in `core` despite invariant 1: `fetch`, `Response` and
 * `caches` are *browser* APIs, not *DOM* APIs. They exist identically in
 * a Worker, a WebView and a page, and none of them touches `document` or
 * `window`. The rule keeps the engine off the document tree so it can run
 * anywhere; a source that reads bytes over HTTP is exactly as portable as
 * one that reads them from `fs`. What stays out is anything that needs a
 * DOM to exist. The types are declared narrowly below (the package
 * compiles with `types: []`), so nothing here can reach for a DOM global
 * by accident.
 *
 * Caching contract:
 *
 *   - Every file URL carries `?v=<sha256 prefix>` from the manifest, so the
 *     HTTP layer can mark the file `immutable` and a rebuild never serves
 *     a stale byte under a URL the engine has seen before.
 *   - One named cache per data version, `theographic-data-<version>`,
 *     where `<version>` is a digest of the engine files' hashes. A hit is
 *     answered without the network; a miss fetches and stores. Other
 *     versions' caches are deleted on open, best-effort — a quota error or
 *     a private window never stops a read, it only means no cache.
 *   - The manifest may be given as an object (the host inlined the five
 *     engine hashes at build time — zero extra round trips) or as a URL to
 *     fetch first. The full `manifest.json` lists every bundle and is
 *     large; hosts should inline `engineManifest()`'s subset instead.
 */
import type { Manifest } from '../types.js';
import type { IndexSource } from './IndexSource.js';

/** The files the engine reads, and so the only hashes the worker needs. */
export const ENGINE_FILES = [
  'books.json',
  'entities.index.json',
  'verses.idx',
  'verses.txt',
  'graph.bin',
] as const;

/**
 * The subset of `Manifest` a browser source needs: the engine files'
 * hashes, plus what `status()` reports. The full manifest lists every
 * bundle (~200 KB); this is under a kilobyte and is inlined by the host,
 * so the engine's `read('manifest.json')` is answered from memory.
 */
export interface EngineManifest extends Partial<Pick<Manifest, 'format' | 'source' | 'counts'>> {
  files: Record<string, string>;
}

/** Pick the engine files' hashes and the status fields out of a full manifest. */
export function engineManifest(
  full: { files: Record<string, string> } & Partial<Pick<Manifest, 'format' | 'source' | 'counts'>>,
): EngineManifest {
  const files: Record<string, string> = {};
  for (const f of ENGINE_FILES) {
    const h = full.files[f];
    if (h !== undefined) files[f] = h;
  }
  return {
    files,
    ...(full.format !== undefined ? { format: full.format } : {}),
    ...(full.source !== undefined ? { source: full.source } : {}),
    ...(full.counts !== undefined ? { counts: full.counts } : {}),
  };
}

/**
 * Data version: FNV-1a over the engine files' hashes, as 8 hex digits.
 * Deterministic and dependency-free; only has to differ between builds
 * whose engine files differ, which sha256 inputs guarantee in practice.
 */
export function dataVersion(m: EngineManifest): string {
  let h = 0x811c9dc5;
  for (const f of ENGINE_FILES) {
    const s = `${f}=${m.files[f] ?? ''};`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).padStart(8, '0');
}

// ----------------------------------------------------- narrow browser types

export interface ResponseLike {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  clone(): ResponseLike;
}
export interface CacheLike {
  match(url: string): Promise<ResponseLike | undefined>;
  put(url: string, response: ResponseLike): Promise<void>;
}
export interface CacheStorageLike {
  open(name: string): Promise<CacheLike>;
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
}
export type FetchLike = (url: string) => Promise<ResponseLike>;

export interface FetchSourceOptions {
  /** Directory the files live under, with or without a trailing slash: `/data/`. */
  baseUrl: string;
  /** Inlined engine hashes, or the URL of a manifest to fetch first. */
  manifest?: EngineManifest | string;
  /** Defaults to `globalThis.fetch`. */
  fetch?: FetchLike;
  /** Defaults to `globalThis.caches`; pass `null` to disable caching. */
  caches?: CacheStorageLike | null;
  /** Prefix of the named cache; `theographic-data` by default. */
  cachePrefix?: string;
}

/**
 * Prefix of the Cache API bucket the engine files live in:
 * `theographic-data-<version>`. Exported so the site's service worker
 * can (a) leave these buckets alone when it prunes its own and (b) tell
 * the offline page whether the index is on the device — from this one
 * constant, never a second copy of the string.
 */
export const DATA_CACHE_PREFIX = 'theographic-data';
const CACHE_PREFIX = DATA_CACHE_PREFIX;

function globals(): { fetch?: FetchLike; caches?: CacheStorageLike } {
  return globalThis as unknown as { fetch?: FetchLike; caches?: CacheStorageLike };
}

export interface FetchSource extends IndexSource {
  /** Resolves once the manifest is known; the data version, or '' without one. */
  readonly version: Promise<string>;
  /** The URL `read(path)` fetches, hash and all — for prefetch links and tests. */
  urlFor(path: string): Promise<string>;
}

export function fetchSource(opts: FetchSourceOptions): FetchSource {
  const base = opts.baseUrl.endsWith('/') ? opts.baseUrl : `${opts.baseUrl}/`;
  const g = globals();
  const doFetch = opts.fetch ?? g.fetch;
  if (!doFetch) throw new Error('fetchSource: no fetch() in this host');
  const caches = opts.caches === undefined ? g.caches : opts.caches;
  const prefix = opts.cachePrefix ?? CACHE_PREFIX;

  const manifest: Promise<EngineManifest | undefined> = (async () => {
    const m = opts.manifest;
    if (m === undefined) return undefined;
    if (typeof m !== 'string') return m;
    const r = await doFetch(m);
    if (!r.ok) throw new Error(`fetchSource: manifest ${m} → HTTP ${r.status}`);
    return engineManifest(JSON.parse(new TextDecoder().decode(await r.arrayBuffer())));
  })();

  const version = manifest.then((m) => (m ? dataVersion(m) : ''));

  const urlFor = async (path: string): Promise<string> => {
    const m = await manifest;
    const h = m?.files[path];
    return h ? `${base}${path}?v=${h.slice(0, 12)}` : `${base}${path}`;
  };

  // Open our cache once and prune the others; any failure means "no cache".
  const cache: Promise<CacheLike | undefined> = (async () => {
    if (!caches) return undefined;
    const v = await version;
    if (!v) return undefined;
    const name = `${prefix}-${v}`;
    try {
      const c = await caches.open(name);
      void (async () => {
        try {
          for (const k of await caches.keys())
            if (k.startsWith(`${prefix}-`) && k !== name) await caches.delete(k);
        } catch {
          // Pruning is housekeeping; a failure here changes nothing.
        }
      })();
      return c;
    } catch {
      return undefined;
    }
  })();

  const read = async (path: string): Promise<Uint8Array> => {
    if (path === 'manifest.json') {
      // The engine reads the manifest for `status()`; the inlined copy is it.
      const m = await manifest;
      if (m) return new TextEncoder().encode(JSON.stringify(m));
    }
    const url = await urlFor(path);
    const c = await cache;
    if (c) {
      try {
        const hit = await c.match(url);
        if (hit) return new Uint8Array(await hit.arrayBuffer());
      } catch {
        // Fall through to the network.
      }
    }
    const r = await doFetch(url);
    if (!r.ok) throw new Error(`fetchSource: ${path} → HTTP ${r.status}`);
    if (c) {
      try {
        await c.put(url, r.clone());
      } catch {
        // Quota or private mode: served, just not stored.
      }
    }
    return new Uint8Array(await r.arrayBuffer());
  };

  return { description: `fetch:${base}`, version, urlFor, read };
}
