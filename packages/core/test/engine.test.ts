/**
 * The engine's contract on the real bundle: layers and `ready` flags,
 * determinism (invariant 9), the `RankSignal` seam, the `QueryRewriter`
 * seam, `versesFor` / `mentions`, and the CLI producing the same ids as an
 * in-process search for every golden query.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createEngine, openEngine, type SearchEngine } from '../src/engine.js';
import { memorySource } from '../src/io/IndexSource.js';
import { MERGE } from '../src/query/merge.js';
import type { QueryPlan, RankSignal, SearchResult } from '../src/query/types.js';
import { fsSource } from '../node/fsSource.js';
import { DATA_DIR, hasData, loadBooks, loadEntityIndexFile } from './data.js';
import { loadGoldenQueries } from './golden/runner.js';

const has = hasData();

function ids(r: SearchResult): (string | number)[] {
  return r.all.map((h) => h.id);
}

describe.skipIf(!has)('engine layers and readiness', () => {
  it('answers references and entities with the core layer alone; verses wait for the text layer', async () => {
    const e = await createEngine(fsSource(DATA_DIR), { layers: ['core'] });
    expect(e.status().layers).toEqual({ core: 'ready', text: 'absent', graph: 'absent' });
    const r = e.searchSync('Jesus wept');
    expect(r.ready.verses).toBe(false);
    expect(r.ready.people).toBe(true);
    expect(r.groups.verses).toEqual({ total: 0, hits: [] });
    expect(r.groups.people.hits[0]?.id).toBe('jesus_905');
    expect(e.searchSync('John 3:16').groups.passages.hits[0]?.id).toBe('John.3.16');
    expect(() => e.versesFor(e.parseReference('John 3:16').refs[0]!)).toThrow(/text layer/);
    expect(() => e.mentions('paul_2479')).toThrow(/graph layer/);

    await e.preload('text');
    expect(e.status().layers.text).toBe('ready');
    const r2 = e.searchSync('Jesus wept');
    expect(r2.ready.verses).toBe(true);
    expect(r2.groups.verses.hits[0]?.id).toBe(43011035);
    // Without the graph the plan says so and there are no hops.
    expect(r2.plan.why.some((w) => w.includes('graph layer not loaded'))).toBe(true);
    expect(e.versesFor(e.parseReference('John 3:16').refs[0]!)).toEqual([
      { id: 43003016, text: expect.stringContaining('For God so loved the world') },
    ]);

    await e.preload('graph');
    expect(e.status().layers.graph).toBe('ready');
    expect(e.mentions('paul_2479')[0]).toBe(44007058);
    const r3 = e.searchSync('Paul');
    expect(r3.groups.verses.hits[0]?.why?.join(' ')).toContain('mention: paul_2479');
    expect(e.status().counts).toMatchObject({ books: 66, verses: 31102 });
  });

  it('createEngine loads every layer by default and preload is idempotent', async () => {
    const e = await createEngine(fsSource(DATA_DIR));
    expect(e.status().layers).toEqual({ core: 'ready', text: 'ready', graph: 'ready' });
    await e.preload('text');
    expect(e.status().manifest?.counts.verses).toBe(31102);
  });

  it('a failed layer is reported, not thrown from search', async () => {
    const books = readFileSync(join(DATA_DIR, 'books.json'));
    const entities = readFileSync(join(DATA_DIR, 'entities.index.json'));
    const e = await createEngine(
      memorySource({
        'books.json': new Uint8Array(books),
        'entities.index.json': new Uint8Array(entities),
      }),
      { layers: ['core'] },
    );
    await expect(e.preload('graph')).rejects.toThrow(/no file graph.bin/);
    expect(e.status().layers.graph).toBe('failed');
    expect(e.searchSync('Paul').ready.verses).toBe(false);
  });

  it('versesFor walks a multi-chapter range in canonical order', async () => {
    const e = await createEngine(fsSource(DATA_DIR), { layers: ['core', 'text'] });
    const v = e.versesFor(e.parseReference('Gen 1:30-2:2').refs[0]!);
    expect(v.map((x) => x.id)).toEqual([1001030, 1001031, 1002001, 1002002]);
  });
});

describe.skipIf(!has)('determinism', () => {
  let engine: SearchEngine;
  const get = async (): Promise<SearchEngine> =>
    (engine ??= await createEngine(fsSource(DATA_DIR)));

  it('two engines over the same bytes return identical results for every golden query', async () => {
    const a = await get();
    const b = openEngine({
      books: { books: loadBooks()! },
      entities: loadEntityIndexFile()!,
      text: {
        idx: new Uint8Array(readFileSync(join(DATA_DIR, 'verses.idx'))),
        txt: new Uint8Array(readFileSync(join(DATA_DIR, 'verses.txt'))),
      },
      graph: new Uint8Array(readFileSync(join(DATA_DIR, 'graph.bin'))),
    });
    for (const q of loadGoldenQueries().filter((x) => !x.deferred)) {
      const ra = a.searchSync(q.q);
      const rb = b.searchSync(q.q);
      const strip = (r: SearchResult) => ({ ...r, timings: undefined });
      expect(strip(rb), q.q).toEqual(strip(ra));
      expect(strip(a.searchSync(q.q)), `${q.q} twice`).toEqual(strip(ra));
    }
  });

  it('the CLI returns the same all[] ids as an in-process search for every golden query', async () => {
    const e = await get();
    const bin = fileURLToPath(new URL('../bin/theographic.mjs', import.meta.url));
    const queries = [
      ...new Set(
        loadGoldenQueries()
          .filter((x) => !x.deferred)
          .map((x) => x.q),
      ),
    ];
    for (const q of queries) {
      const out = execFileSync(process.execPath, [bin, 'search', q, '--json', '--data', DATA_DIR], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
      const cli = JSON.parse(out) as SearchResult;
      expect(ids(cli), q).toEqual(ids(e.searchSync(q)));
      expect(cli.plan.why, q).toEqual(e.searchSync(q).plan.why);
    }
  }, 120_000);
});

describe.skipIf(!has)('RankSignal seam', () => {
  it('a no-op signal (returning the lexical score) leaves order and scores unchanged', async () => {
    const e = await createEngine(fsSource(DATA_DIR));
    const seen: number[] = [];
    const noop: RankSignal = {
      name: 'noop',
      layer: 'verses',
      score: (cands) => {
        seen.push(cands.length);
        return cands.map((c) => c.lex);
      },
    };
    const plain = e.searchSync('Paul Antioch');
    const signalled = e.searchSync('Paul Antioch', { signals: [noop] });
    expect(seen.length).toBe(1);
    expect(seen[0]).toBe(plain.groups.verses.total);
    expect(ids(signalled)).toEqual(ids(plain));
    for (const [i, h] of signalled.groups.verses.hits.entries()) {
      expect(h.score).toBeCloseTo(plain.groups.verses.hits[i]!.score, 12);
      expect(h.why?.join(' ')).toContain('signals: noop');
    }
    // Entities are untouched by a verses-layer signal.
    expect(signalled.groups.people).toEqual(plain.groups.people);
  });

  it('combines as (1−λ)·lex + λ·signal and stays deterministic', async () => {
    const e = await createEngine(fsSource(DATA_DIR));
    const constant: RankSignal = { name: 'one', layer: 'verses', score: (c) => c.map(() => 1) };
    const plain = e.searchSync('love in John');
    const a = e.searchSync('love in John', { signals: [constant] });
    const b = e.searchSync('love in John', { signals: [constant] });
    expect(ids(a)).toEqual(ids(b));
    const λ = MERGE.signalLambda;
    for (const [i, h] of a.groups.verses.hits.entries()) {
      expect(h.score).toBeCloseTo((1 - λ) * plain.groups.verses.hits[i]!.score + λ, 12);
    }
    // A signal that singles out the last returned verse lifts it to the top (it is not ignored):
    // 0.7·lex + 0.3 for one verse beats 0.7·0.72 for the rest.
    const last = plain.groups.verses.hits[plain.groups.verses.hits.length - 1]!.id;
    const pick: RankSignal = {
      name: 'pick',
      layer: 'verses',
      score: (c) => c.map((x) => (x.id === last ? 1 : 0)),
    };
    const picked = e.searchSync('love in John', { signals: [pick] });
    expect(picked.groups.verses.hits[0]?.id).toBe(last);
    expect(ids(picked)).toEqual(ids(e.searchSync('love in John', { signals: [pick] })));
  });
});

describe.skipIf(!has)('QueryRewriter seam', () => {
  it('search() executes a plan authored by the rewriter and says so in why', async () => {
    const e = await createEngine(fsSource(DATA_DIR));
    const base = e.plan('Paul');
    const rewriter = async (_q: string, ctx: { plan: QueryPlan }): Promise<QueryPlan> => ({
      ...ctx.plan,
      clauses: ctx.plan.clauses.map((c) => ({ ...c, groups: ['people'] })),
      why: [...ctx.plan.why, 'rewriter: people only'],
    });
    const r = await e.search('Paul', { rewriter });
    expect(base.author).toBe('classifier');
    expect(r.plan.author).toBe('rewriter');
    expect(r.plan.why[0]).toBe('plan: rewriter');
    expect(r.plan.why).toContain('rewriter: people only');
    expect(r.groups.verses.total).toBe(0);
    expect(r.groups.people.hits[0]?.id).toBe('paul_2479');
  });

  it('a rewriter may return a query string instead', async () => {
    const e = await createEngine(fsSource(DATA_DIR));
    const r = await e.search('Paul', { rewriter: async () => 'person:Paul' });
    expect(r.plan.why[0]).toContain('rewriter rewrote "Paul" → "person:Paul"');
    expect(r.groups.verses.total).toBe(0);
  });

  it('search() without a rewriter equals searchSync', async () => {
    const e = await createEngine(fsSource(DATA_DIR));
    const a = await e.search('Jesus wept');
    expect(ids(a)).toEqual(ids(e.searchSync('Jesus wept')));
  });
});
