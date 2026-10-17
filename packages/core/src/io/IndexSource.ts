/**
 * Where the engine reads its files from. One method: bytes by relative
 * path under the data directory (`books.json`, `entities.index.json`,
 * `verses.idx`, `verses.txt`, `graph.bin`, `manifest.json`). Hosts supply
 * fetch + Cache API (web), `fs` (Node — `@theographic/core/node`), or the
 * Capacitor filesystem; the engine never knows which.
 */
export interface IndexSource {
  read(path: string): Promise<Uint8Array>;
  /** Optional: a hint the engine passes through to `status()`. */
  readonly description?: string;
}

/** A source over an in-memory map — tests and the browser fallback build use it. */
export function memorySource(files: Record<string, Uint8Array | string>): IndexSource {
  const enc = new TextEncoder();
  return {
    description: 'memory',
    read: (path) => {
      const v = files[path];
      if (v === undefined) return Promise.reject(new Error(`memorySource: no file ${path}`));
      return Promise.resolve(typeof v === 'string' ? enc.encode(v) : v);
    },
  };
}
