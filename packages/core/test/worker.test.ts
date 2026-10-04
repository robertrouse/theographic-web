/**
 * The worker protocol over a fake engine and a fake scope: request ids,
 * latest-wins cancellation on both sides, ready and layer propagation,
 * errors, and the options that must not cross the boundary. No real
 * Worker is needed — `serveEngine` takes anything with `onmessage` and
 * `postMessage`, and so does `createWorkerEngine`.
 */
import { describe, expect, it, vi } from 'vitest';
import type { EngineStatus, SearchEngine } from '../src/engine.js';
import { createWorkerEngine, type WorkerLike } from '../src/worker/client.js';
import { AbortedError, isAborted, type WorkerInit } from '../src/worker/protocol.js';
import { serveEngine, type WorkerScopeLike } from '../src/worker/worker.js';
import type { SearchResult } from '../src/query/types.js';

/** Two ends of a message channel; delivery is a microtask, like a real port. */
function channel(): { page: WorkerLike; scope: WorkerScopeLike } {
  const page: WorkerLike = {
    onmessage: null,
    postMessage: (m) => queueMicrotask(() => scope.onmessage?.({ data: m })),
    terminate: vi.fn(),
  };
  const scope: WorkerScopeLike = {
    onmessage: null,
    postMessage: (m) => queueMicrotask(() => page.onmessage?.({ data: m })),
  };
  return { page, scope };
}

function fakeResult(q: string): SearchResult {
  const empty = { total: 0, hits: [] };
  return {
    query: q,
    plan: { query: q, clauses: [], why: [`fake plan for ${q}`], author: 'classifier' },
    groups: {
      passages: empty,
      verses: empty,
      people: { total: 1, hits: [{ group: 'people', id: q, score: 1, raw: 1, label: q }] },
      places: empty,
      events: empty,
      groups: empty,
      topics: empty,
    },
    all: [{ group: 'people', id: q, score: 1, raw: 1, label: q }],
    timings: {},
    ready: {
      passages: true,
      verses: false,
      people: true,
      places: true,
      events: true,
      groups: true,
      topics: false,
    },
  };
}

interface Fake {
  engine: SearchEngine;
  searched: string[];
  suggested: string[];
  finishText: () => void;
}

function fakeEngine(): Fake {
  const layers: EngineStatus['layers'] = { core: 'ready', text: 'absent', graph: 'absent' };
  const searched: string[] = [];
  const suggested: string[] = [];
  let finishText = (): void => {};
  const status = (): EngineStatus => ({
    layers: { ...layers },
    counts: { books: 66, entities: 3 },
  });
  const engine: SearchEngine = {
    search: async (q) => fakeResult(q),
    searchSync: (q) => {
      searched.push(q);
      return fakeResult(q);
    },
    suggest: (p) => {
      suggested.push(p);
      return [{ kind: 'entity', label: p, query: p, score: 1 }];
    },
    parseReference: () => ({ refs: [], consumed: [], errors: [] }),
    versesFor: () => {
      if (layers.text !== 'ready') throw new Error('versesFor: text layer not loaded');
      return [{ id: 43003016, text: 'For God so loved the world' }];
    },
    mentions: () => [],
    status,
    plan: (q) => ({ query: q, clauses: [], why: [], author: 'classifier' }),
    preload: (layer) => {
      if (layers[layer] === 'ready') return Promise.resolve();
      layers[layer] = 'loading';
      return new Promise<void>((res) => {
        finishText = () => {
          layers[layer] = 'ready';
          res();
        };
      });
    },
  };
  return { engine, searched, suggested, finishText: () => finishText() };
}

const INIT: WorkerInit = { baseUrl: '/data/', manifest: { files: {} } };

/** Wire a page to a served fake engine. `defer` runs drains only when `tick()` is called. */
function harness(opts: { manualDefer?: boolean; buildFails?: boolean } = {}) {
  const { page, scope } = channel();
  const fake = fakeEngine();
  const deferred: (() => void)[] = [];
  const inits: WorkerInit[] = [];
  serveEngine(scope, {
    createEngine: async (init) => {
      inits.push(init);
      if (opts.buildFails) throw new Error('manifest 404');
      return fake.engine;
    },
    ...(opts.manualDefer ? { defer: (fn: () => void) => deferred.push(fn) } : {}),
  });
  const client = createWorkerEngine(page, INIT);
  const tick = (): void => {
    const fns = deferred.splice(0);
    for (const fn of fns) fn();
  };
  return { client, fake, page, tick, inits, deferred };
}

const settle = () => new Promise((r) => setTimeout(r, 5));

describe('worker protocol', () => {
  it('init resolves ready with the status and passes the host init through', async () => {
    const { client, inits } = harness();
    const status = await client.ready;
    expect(status.layers).toEqual({ core: 'ready', text: 'absent', graph: 'absent' });
    expect(client.lastStatus).toEqual(status);
    expect(inits).toEqual([INIT]);
  });

  it('answers search, suggest, plan, status and parseReference by id', async () => {
    const { client, fake } = harness();
    const [a, b, s] = await Promise.all([
      client.search('Saul'),
      client.parseReference('John 3:16'),
      client.status(),
    ]);
    expect(a.query).toBe('Saul');
    expect(a.all[0]?.id).toBe('Saul');
    expect(b.refs).toEqual([]);
    expect(s.counts.books).toBe(66);
    expect(await client.suggest('sa')).toEqual([
      { kind: 'entity', label: 'sa', query: 'sa', score: 1 },
    ]);
    expect((await client.plan('x')).query).toBe('x');
    expect(fake.searched).toEqual(['Saul']);
  });

  it('requests issued before init wait for it rather than failing', async () => {
    const { client } = harness();
    const r = client.search('early');
    expect(await r).toMatchObject({ query: 'early' });
  });

  it('a newer search rejects the older one with AbortError on the client at once', async () => {
    const { client, fake } = harness({ manualDefer: true });
    await client.ready;
    const first = client.search('Sa');
    const second = client.search('Sau');
    const third = client.search('Saul');
    await expect(first).rejects.toBeInstanceOf(AbortedError);
    await expect(second).rejects.toSatisfy(isAborted);
    expect(fake.searched).toEqual([]);
    // Nothing has run yet; only the newest is pending in the worker.
    await settle();
    expect(fake.searched).toEqual([]);
  });

  it('the worker runs only the newest queued search and answers the rest aborted', async () => {
    const { client, fake, tick } = harness({ manualDefer: true });
    await client.ready;
    const p1 = client.search('Sa').catch((e: unknown) => e);
    const p2 = client.search('Sau').catch((e: unknown) => e);
    const p3 = client.search('Saul');
    await settle(); // let the three messages reach the worker
    tick(); // one drain for the burst
    const r3 = await p3;
    expect(r3.query).toBe('Saul');
    expect(fake.searched).toEqual(['Saul']);
    expect(isAborted(await p1)).toBe(true);
    expect(isAborted(await p2)).toBe(true);
  });

  it('search and suggest are independent latest-wins channels', async () => {
    const { client, fake, tick } = harness({ manualDefer: true });
    await client.ready;
    const s = client.suggest('sa');
    const q = client.search('Saul');
    await settle();
    tick();
    expect(await s).toHaveLength(1);
    expect((await q).query).toBe('Saul');
    expect(fake.searched).toEqual(['Saul']);
    expect(fake.suggested).toEqual(['sa']);
  });

  it('an explicit cancel drops a queued request without running it', async () => {
    const { client, fake, page, tick } = harness({ manualDefer: true });
    await client.ready;
    const p = client.search('Saul').catch((e: unknown) => e);
    await settle();
    // Reach past the client: the id is the one it just sent.
    page.postMessage({ id: 999, type: 'cancel', target: 2 });
    await settle();
    tick();
    expect(isAborted(await p)).toBe(true);
    expect(fake.searched).toEqual([]);
  });

  it('propagates layer readiness: loading then ready, with status on each', async () => {
    const { client, fake } = harness();
    await client.ready;
    const seen: string[] = [];
    const off = client.onLayer((layer, state, status) => {
      seen.push(`${layer}:${state}:${status.layers.text}`);
    });
    const p = client.preload('text');
    await settle();
    expect(seen).toEqual(['text:loading:loading']);
    fake.finishText();
    await p;
    expect(seen).toEqual(['text:loading:loading', 'text:ready:ready']);
    expect(client.lastStatus?.layers.text).toBe('ready');
    // versesFor works once the layer is there.
    expect(await client.versesFor({ verseIdStart: 43003016 } as never)).toEqual([
      { id: 43003016, text: 'For God so loved the world' },
    ]);
    off();
    fake.finishText();
    await client.preload('text'); // already ready: no event, resolves at once
    expect(seen).toHaveLength(2);
  });

  it('turns an engine throw into a rejected promise with the message', async () => {
    const { client } = harness();
    await client.ready;
    await expect(client.versesFor({ verseIdStart: 1 } as never)).rejects.toThrow(
      /text layer not loaded/,
    );
    await expect(client.search('ok')).resolves.toMatchObject({ query: 'ok' });
  });

  it('a failed init rejects ready and every request', async () => {
    const { client } = harness({ buildFails: true });
    await expect(client.ready).rejects.toThrow(/manifest 404/);
    await expect(client.search('x')).rejects.toThrow(/manifest 404/);
  });

  it('strips signals, rewriter and abort from the options before posting', async () => {
    const { page } = channel();
    const posted: unknown[] = [];
    page.postMessage = (m) => posted.push(m);
    const client = createWorkerEngine(page, INIT);
    void client
      .search('x', {
        limitPerGroup: 3,
        signals: [{ name: 's', layer: 'verses', score: () => [] }],
        rewriter: async () => 'y',
        abort: { aborted: false },
      })
      .catch(() => {});
    expect(posted[1]).toEqual({ id: 2, type: 'search', q: 'x', opts: { limitPerGroup: 3 } });
  });

  it('terminate rejects everything outstanding and terminates the worker', async () => {
    const { client, page } = harness({ manualDefer: true });
    await client.ready;
    const p = client.search('x');
    client.terminate();
    await expect(p).rejects.toSatisfy(isAborted);
    expect(page.terminate).toHaveBeenCalled();
  });
});
