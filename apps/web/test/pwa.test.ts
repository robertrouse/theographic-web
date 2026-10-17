import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DATA_CACHE_PREFIX as CORE_PREFIX } from '@theographic/core';
import {
  ASSETS_CACHE,
  DATA_CACHE_PREFIX,
  PAGES_CACHE,
  TILES_CACHE,
  TILES_LRU_KEY,
  isDataCache,
  isStaleCache,
  shellCache,
  tilesCache,
} from '../src/pwa/caches';
import { pageKey, routeFor } from '../src/pwa/routes';
import {
  TILE_ORIGIN,
  TILES_MAX_BYTES,
  TILES_MAX_ENTRIES,
  TileLru,
  storableTile,
  tileKey,
} from '../src/pwa/tiles';

const origin = 'https://theographic.netlify.app';
const get = (url: string, mode = 'no-cors') => ({ url, method: 'GET', mode });
const nav = (path: string) => get(`${origin}${path}`, 'navigate');

describe('cache buckets', () => {
  it('names the data bucket from the one constant fetchSource exports', () => {
    expect(DATA_CACHE_PREFIX).toBe(CORE_PREFIX);
    // Belt and braces: nothing under src/pwa or sw.ts spells the prefix out.
    for (const f of ['src/pwa/caches.ts', 'src/pwa/routes.ts', 'src/sw.ts']) {
      const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/theographic-data/);
    }
  });

  it('never prunes the engine data buckets, only its own shell from other builds', () => {
    expect(isStaleCache(`${CORE_PREFIX}-1a2b3c4d`, 'b1')).toBe(false);
    expect(isStaleCache(shellCache('b0'), 'b1')).toBe(true);
    expect(isStaleCache(shellCache('b1'), 'b1')).toBe(false);
    expect(isStaleCache(PAGES_CACHE, 'b1')).toBe(false);
    expect(isStaleCache(ASSETS_CACHE, 'b1')).toBe(false);
    expect(isStaleCache('unrelated', 'b1')).toBe(false);
    expect(isStaleCache(TILES_CACHE, 'b1')).toBe(false);
    expect(isStaleCache(tilesCache('v0'), 'b1')).toBe(true);
    expect(isDataCache(`${CORE_PREFIX}-1a2b3c4d`)).toBe(true);
    expect(isDataCache(PAGES_CACHE)).toBe(false);
  });
});

describe('routeFor', () => {
  it('leaves /data/* to fetchSource', () => {
    expect(routeFor(get(`${origin}/data/entities.index.json?v=bff88e95e12b`), origin)).toBe(
      'bypass',
    );
    expect(routeFor(get(`${origin}/data/verses/Gen.json`), origin)).toBe('bypass');
  });
  it('leaves other cross-origin (Netlify toolbar), /.netlify/ and sw.js alone', () => {
    expect(routeFor(get('https://openfreemap.org/tos/'), origin)).toBe('bypass');
    expect(routeFor(get('https://example.org/tiles/1/2/3.pbf'), origin)).toBe('bypass');
    expect(routeFor(get('https://app.netlify.com/scripts/cdp'), origin)).toBe('bypass');
    expect(routeFor(get(`${origin}/.netlify/functions/x`), origin)).toBe('bypass');
    expect(routeFor(get(`${origin}/sw.js`), origin)).toBe('bypass');
    expect(routeFor({ url: `${origin}/`, method: 'POST', mode: 'cors' }, origin)).toBe('bypass');
  });
  it('routes navigations as pages, hashed chunks as assets, the rest as static', () => {
    expect(routeFor(nav('/'), origin)).toBe('page');
    expect(routeFor(nav('/person/moses_2108/'), origin)).toBe('page');
    expect(routeFor(nav('/?q=Saul'), origin)).toBe('page');
    expect(routeFor(get(`${origin}/_astro/client.Buyw3Q1S.js`, 'cors'), origin)).toBe('asset');
    expect(routeFor(get(`${origin}/_astro/Base.D2iIX8VM.css`), origin)).toBe('asset');
    expect(routeFor(get(`${origin}/brand/theographic-logo.png`), origin)).toBe('static');
    expect(routeFor(get(`${origin}/manifest.webmanifest`), origin)).toBe('static');
  });
});

describe('pageKey', () => {
  it('drops the query and normalises to the slash form', () => {
    expect(pageKey(`${origin}/?q=Saul&debug=1`)).toBe(`${origin}/`);
    expect(pageKey(`${origin}/person/moses_2108`)).toBe(`${origin}/person/moses_2108/`);
    expect(pageKey(`${origin}/john/3/#v16`)).toBe(`${origin}/john/3/`);
    expect(pageKey(`${origin}/404.html`)).toBe(`${origin}/404.html`);
  });
});

const T = TILE_ORIGIN;
const tile = (path: string) => get(`${T}${path}`, 'cors');

describe('map tiles: routing and keys', () => {
  it('routes everything on the tile host as a tile, and only GETs', () => {
    expect(routeFor(tile('/styles/liberty'), origin)).toBe('tile');
    expect(routeFor(tile('/planet'), origin)).toBe('tile');
    expect(routeFor(tile('/planet/20260927_080001_pt/7/76/51.pbf'), origin)).toBe('tile');
    expect(routeFor(tile('/natural_earth/ne2sr/5/19/12.png'), origin)).toBe('tile');
    expect(routeFor(tile('/fonts/Noto%20Sans%20Regular/0-255.pbf'), origin)).toBe('tile');
    expect(routeFor({ url: `${T}/planet`, method: 'HEAD', mode: 'cors' }, origin)).toBe('bypass');
  });

  it('is the host PlaceMap actually draws from', () => {
    const src = readFileSync(new URL('../src/components/PlaceMap.astro', import.meta.url), 'utf8');
    const style = /style:\s*'([^']+)'/.exec(src)?.[1];
    expect(style && new URL(style).origin).toBe(T);
  });

  it('keys planet tiles without the weekly date, and records the date', () => {
    const a = tileKey(`${T}/planet/20260927_080001_pt/7/76/51.pbf`);
    const b = tileKey(`${T}/planet/20261004_080001_pt/7/76/51.pbf`);
    expect(a).toEqual({
      key: `${T}/planet/7/76/51.pbf`,
      version: '20260927_080001_pt',
      policy: 'cache-first',
    });
    expect(b.key).toBe(a.key);
    expect(b.version).toBe('20261004_080001_pt');
  });

  it('revalidates the style and TileJSON; everything else is cache-first by URL', () => {
    expect(tileKey(`${T}/styles/liberty`)).toEqual({
      key: `${T}/styles/liberty`,
      version: null,
      policy: 'swr',
    });
    expect(tileKey(`${T}/planet?x=1`)).toEqual({
      key: `${T}/planet`,
      version: null,
      policy: 'swr',
    });
    for (const p of [
      '/natural_earth/ne2sr/5/19/12.png',
      '/sprites/ofm_f384/ofm@2x.png',
      '/fonts/Noto%20Sans%20Regular/0-255.pbf',
    ]) {
      expect(tileKey(`${T}${p}`)).toEqual({
        key: `${T}${p}`,
        version: null,
        policy: 'cache-first',
      });
    }
  });

  it('stores only readable 200s, never opaque responses', () => {
    expect(storableTile({ ok: true, status: 200, type: 'cors' })).toBe(true);
    expect(storableTile({ ok: false, status: 0, type: 'opaque' })).toBe(false);
    expect(storableTile({ ok: true, status: 200, type: 'opaque' })).toBe(false);
    expect(storableTile({ ok: true, status: 206, type: 'cors' })).toBe(false);
    expect(storableTile({ ok: false, status: 404, type: 'cors' })).toBe(false);
  });

  it('keeps the LRU index under a key no tile request can have', () => {
    expect(new URL(TILES_LRU_KEY).origin).not.toBe(T);
    expect(routeFor(get(TILES_LRU_KEY), origin)).toBe('bypass');
  });

  it('caps at 1500 entries and 40 MB', () => {
    expect(TILES_MAX_ENTRIES).toBe(1500);
    expect(TILES_MAX_BYTES).toBe(40 * 1024 * 1024);
  });
});

describe('map tiles: LRU eviction', () => {
  it('evicts least recently used first, by count', () => {
    const lru = new TileLru();
    for (const k of ['a', 'b', 'c', 'd']) lru.set(k, 10, null);
    lru.touch('a'); // order now b c d a
    expect(lru.evict(2, Infinity)).toEqual(['b', 'c']);
    expect(lru.toJSON().map(([k]) => k)).toEqual(['d', 'a']);
    expect(lru.bytes).toBe(20);
  });

  it('evicts by bytes, including an entry that alone exceeds the cap', () => {
    const lru = new TileLru();
    lru.set('a', 30, null);
    lru.set('b', 50, null);
    lru.set('c', 40, null);
    expect(lru.evict(100, 90)).toEqual(['a']);
    expect(lru.bytes).toBe(90);
    lru.set('huge', 500, null);
    expect(lru.evict(100, 90)).toEqual(['huge']);
    expect(lru.size).toBe(2);
    expect(lru.bytes).toBe(90);
  });

  it('replacing a key (new planet date) moves it to the end and fixes the byte total', () => {
    const lru = new TileLru();
    lru.set('t', 100, 'w1');
    lru.set('u', 10, null);
    lru.set('t', 60, 'w2');
    expect(lru.get('t')).toEqual({ bytes: 60, version: 'w2' });
    expect(lru.bytes).toBe(70);
    expect(lru.evict(1, Infinity)).toEqual(['u']);
  });

  it('does nothing under the caps; touch and delete of unknown keys are no-ops', () => {
    const lru = new TileLru();
    lru.set('a', 1, null);
    lru.touch('zz');
    lru.delete('zz');
    expect(lru.evict(1, 1)).toEqual([]);
    expect(lru.size).toBe(1);
  });

  it('round-trips through JSON in recency order and ignores junk rows', () => {
    const lru = new TileLru();
    lru.set('a', 5, 'w1');
    lru.set('b', 7, null);
    lru.touch('a');
    const back = TileLru.fromJSON(JSON.parse(JSON.stringify(lru)));
    expect(back.toJSON()).toEqual([
      ['b', 7, null],
      ['a', 5, 'w1'],
    ]);
    expect(back.bytes).toBe(12);
    expect(TileLru.fromJSON({ nope: 1 }).size).toBe(0);
    expect(TileLru.fromJSON([['x', -1, null], ['y', 'big'], 3, ['z', 2, 4]]).toJSON()).toEqual([
      ['z', 2, null],
    ]);
  });
});
