/**
 * `fetchSource` over a fake fetch and a fake Cache API: hashed URLs from
 * the manifest, cache hits skipping the network, pruning of older data
 * versions, graceful degradation without `caches`, and HTTP errors.
 */
import { describe, expect, it } from 'vitest';
import {
  ENGINE_FILES,
  dataVersion,
  engineManifest,
  fetchSource,
  type CacheLike,
  type CacheStorageLike,
  type ResponseLike,
} from '../src/io/fetchSource.js';

const enc = new TextEncoder();

function response(body: string, status = 200): ResponseLike {
  const bytes = enc.encode(body);
  const r: ResponseLike = {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    clone: () => r,
  };
  return r;
}

function fakeCaches(): CacheStorageLike & { store: Map<string, Map<string, ResponseLike>> } {
  const store = new Map<string, Map<string, ResponseLike>>();
  const open = async (name: string): Promise<CacheLike> => {
    let m = store.get(name);
    if (!m) {
      m = new Map();
      store.set(name, m);
    }
    const bucket = m;
    return {
      match: async (url) => bucket.get(url),
      put: async (url, r) => {
        bucket.set(url, r);
      },
    };
  };
  return {
    store,
    open,
    keys: async () => [...store.keys()],
    delete: async (name) => store.delete(name),
  };
}

const MANIFEST = {
  format: 1 as const,
  source: { repo: 'r/m', sha: 'abc' },
  counts: { books: 66, chapters: 1189, verses: 31102, people: 1, places: 1, events: 1, groups: 1 },
  files: {
    'books.json': 'aaaaaaaaaaaaaaaaaaaaaaaa',
    'entities.index.json': 'bbbbbbbbbbbbbbbbbbbbbbbb',
    'verses.idx': 'cccccccccccccccccccccccc',
    'verses.txt': 'dddddddddddddddddddddddd',
    'graph.bin': 'eeeeeeeeeeeeeeeeeeeeeeee',
    'detail/person/aaron_1.json': 'ffffffffffffffffffffffff',
  },
};

describe('fetchSource', () => {
  it('engineManifest keeps only the five engine files; dataVersion is stable and sensitive', () => {
    const m = engineManifest(MANIFEST);
    expect(Object.keys(m.files).sort()).toEqual([...ENGINE_FILES].sort());
    expect(m.counts?.verses).toBe(31102);
    expect(m.source?.sha).toBe('abc');
    expect(dataVersion(m)).toMatch(/^[0-9a-f]{8}$/);
    expect(dataVersion(m)).toBe(dataVersion(engineManifest(MANIFEST)));
    const changed = engineManifest({ files: { ...MANIFEST.files, 'graph.bin': '0000' } });
    expect(dataVersion(changed)).not.toBe(dataVersion(m));
  });

  it('requests hashed URLs and stores them in a versioned cache; a second read is served from it', async () => {
    const calls: string[] = [];
    const caches = fakeCaches();
    const src = fetchSource({
      baseUrl: '/data',
      manifest: engineManifest(MANIFEST),
      caches,
      fetch: async (url) => {
        calls.push(url);
        return response(`body of ${url}`);
      },
    });
    expect(await src.urlFor('books.json')).toBe('/data/books.json?v=aaaaaaaaaaaa');
    const a = new TextDecoder().decode(await src.read('books.json'));
    expect(a).toBe('body of /data/books.json?v=aaaaaaaaaaaa');
    const b = new TextDecoder().decode(await src.read('books.json'));
    expect(b).toBe(a);
    expect(calls).toEqual(['/data/books.json?v=aaaaaaaaaaaa']);
    const version = await src.version;
    expect([...caches.store.keys()]).toEqual([`theographic-data-${version}`]);
  });

  it('prunes caches of other data versions on open', async () => {
    const caches = fakeCaches();
    await caches.open('theographic-data-00000000');
    await caches.open('unrelated');
    const src = fetchSource({
      baseUrl: '/data/',
      manifest: engineManifest(MANIFEST),
      caches,
      fetch: async (url) => response(url),
    });
    await src.read('graph.bin');
    await new Promise((r) => setTimeout(r, 0));
    const version = await src.version;
    expect([...caches.store.keys()].sort()).toEqual(
      [`theographic-data-${version}`, 'unrelated'].sort(),
    );
  });

  it('answers manifest.json from the inlined manifest without a request', async () => {
    const calls: string[] = [];
    const src = fetchSource({
      baseUrl: '/data/',
      manifest: engineManifest(MANIFEST),
      caches: null,
      fetch: async (url) => {
        calls.push(url);
        return response('x');
      },
    });
    const m = JSON.parse(new TextDecoder().decode(await src.read('manifest.json')));
    expect(m.counts.verses).toBe(31102);
    expect(Object.keys(m.files)).toHaveLength(5);
    expect(calls).toEqual([]);
  });

  it('works without a Cache API and without a manifest', async () => {
    const calls: string[] = [];
    const src = fetchSource({
      baseUrl: '/data/',
      caches: null,
      fetch: async (url) => {
        calls.push(url);
        return response('x');
      },
    });
    expect(await src.version).toBe('');
    await src.read('books.json');
    await src.read('books.json');
    expect(calls).toEqual(['/data/books.json', '/data/books.json']);
  });

  it('fetches a manifest URL first when given one', async () => {
    const calls: string[] = [];
    const src = fetchSource({
      baseUrl: '/data/',
      manifest: '/data/manifest.json',
      caches: null,
      fetch: async (url) => {
        calls.push(url);
        return response(url.endsWith('manifest.json') ? JSON.stringify(MANIFEST) : 'x');
      },
    });
    await src.read('verses.idx');
    expect(calls).toEqual(['/data/manifest.json', '/data/verses.idx?v=cccccccccccc']);
  });

  it('turns an HTTP error into a rejection naming the file', async () => {
    const src = fetchSource({
      baseUrl: '/data/',
      caches: null,
      fetch: async () => response('', 404),
    });
    await expect(src.read('graph.bin')).rejects.toThrow(/graph\.bin → HTTP 404/);
  });
});
