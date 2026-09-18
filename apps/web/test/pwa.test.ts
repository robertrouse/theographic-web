import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DATA_CACHE_PREFIX as CORE_PREFIX } from '@theographic/core';
import {
  ASSETS_CACHE,
  DATA_CACHE_PREFIX,
  PAGES_CACHE,
  isDataCache,
  isStaleCache,
  shellCache,
} from '../src/pwa/caches';
import { pageKey, routeFor } from '../src/pwa/routes';

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
  it('leaves cross-origin (tiles, Netlify toolbar), /.netlify/ and sw.js alone', () => {
    expect(routeFor(get('https://tiles.openfreemap.org/styles/liberty'), origin)).toBe('bypass');
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
