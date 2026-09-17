/**
 * The worker body: `serveEngine(self)` installs `onmessage` and answers
 * the protocol over one engine. The host's worker entry is one line —
 *
 *   import { serveEngine } from '@theographic/core';
 *   serveEngine(self);
 *
 * — and the page talks to it through `createWorkerEngine` (client.ts).
 *
 * Nothing here needs a DOM; the scope is typed narrowly (`onmessage`,
 * `postMessage`) so the same function serves a real `DedicatedWorkerGlobalScope`,
 * a `MessagePort`, or a fake in tests.
 *
 * Latest-wins requests (search, suggest) are deferred one macrotask before
 * they run. That is the whole cancellation mechanism: a burst of keystrokes
 * queued behind a busy worker collapses to the newest one, and every
 * request it replaced is answered `aborted` without running. Requests that
 * arrive before `init` wait for it.
 */
import { createEngine, type SearchEngine } from '../engine.js';
import { fetchSource } from '../io/fetchSource.js';
import type { WorkerInit, WorkerMessage, WorkerRequest, WorkerResponse } from './protocol.js';

export interface WorkerScopeLike {
  onmessage: ((ev: { data: unknown }) => void) | null;
  postMessage(message: unknown): void;
}

export interface ServeOptions {
  /** Build the engine for an `init`; defaults to `createEngine(fetchSource(init))`. */
  createEngine?: (init: WorkerInit) => Promise<SearchEngine>;
  /** Defer a callback one macrotask; defaults to `setTimeout(fn, 0)`. */
  defer?: (fn: () => void) => void;
}

// Module-scoped declaration: the package compiles with `types: []`, and
// every host this runs in has a global `setTimeout`.
declare const setTimeout: (fn: () => void, ms: number) => unknown;

type LatestKind = 'search' | 'suggest';

export function serveEngine(scope: WorkerScopeLike, opts: ServeOptions = {}): void {
  const build =
    opts.createEngine ??
    ((init: WorkerInit) =>
      createEngine(
        fetchSource({
          baseUrl: init.baseUrl,
          ...(init.manifest !== undefined ? { manifest: init.manifest } : {}),
        }),
        { layers: init.layers ?? ['core'] },
      ));
  const defer = opts.defer ?? ((fn) => setTimeout(fn, 0));

  const post = (m: WorkerMessage): void => scope.postMessage(m);
  const reply = (r: WorkerResponse): void => post(r);
  const fail = (id: number, err: unknown): void =>
    reply({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  const abort = (id: number): void => reply({ id, ok: false, error: 'aborted', aborted: true });

  // The engine, resolved by `init`. Everything else waits on it.
  let resolveEngine!: (e: SearchEngine) => void;
  let rejectEngine!: (err: unknown) => void;
  const engine = new Promise<SearchEngine>((res, rej) => {
    resolveEngine = res;
    rejectEngine = rej;
  });
  engine.catch(() => {
    // Handled per request; this keeps the deferred rejection from being "unhandled".
  });
  let initialised = false;

  const pending = new Map<LatestKind, WorkerRequest & { type: LatestKind }>();
  let drainScheduled = false;

  const run = async (req: WorkerRequest): Promise<void> => {
    const e = await engine;
    switch (req.type) {
      case 'search':
        reply({ id: req.id, ok: true, result: e.searchSync(req.q, req.opts) });
        return;
      case 'suggest':
        reply({ id: req.id, ok: true, result: e.suggest(req.prefix, req.opts) });
        return;
      case 'status':
        reply({ id: req.id, ok: true, result: e.status() });
        return;
      case 'plan':
        reply({ id: req.id, ok: true, result: e.plan(req.q, req.opts) });
        return;
      case 'parseReference':
        reply({ id: req.id, ok: true, result: e.parseReference(req.q) });
        return;
      case 'versesFor':
        reply({ id: req.id, ok: true, result: e.versesFor(req.ref) });
        return;
      case 'mentions':
        reply({ id: req.id, ok: true, result: e.mentions(req.entityId) });
        return;
      case 'preload': {
        const before = e.status().layers[req.layer];
        // `preload` marks the layer `loading` synchronously; report after the call.
        const loading = e.preload(req.layer);
        if (before !== 'ready') {
          post({ event: 'layer', layer: req.layer, state: 'loading', status: e.status() });
        }
        try {
          await loading;
        } finally {
          const status = e.status();
          if (before !== 'ready') {
            post({ event: 'layer', layer: req.layer, state: status.layers[req.layer], status });
          }
        }
        reply({ id: req.id, ok: true, result: e.status() });
        return;
      }
      case 'init':
      case 'cancel':
        return;
    }
  };

  const drain = (): void => {
    drainScheduled = false;
    const batch = [...pending.values()];
    pending.clear();
    for (const req of batch) void run(req).catch((err) => fail(req.id, err));
  };

  const enqueueLatest = (req: WorkerRequest & { type: LatestKind }): void => {
    const old = pending.get(req.type);
    if (old) abort(old.id);
    pending.set(req.type, req);
    if (!drainScheduled) {
      drainScheduled = true;
      defer(drain);
    }
  };

  const init = async (id: number, i: WorkerInit): Promise<void> => {
    if (initialised) {
      fail(id, 'init: already initialised');
      return;
    }
    initialised = true;
    try {
      const e = await build(i);
      resolveEngine(e);
      const status = e.status();
      reply({ id, ok: true, result: status });
      post({ event: 'ready', status });
    } catch (err) {
      rejectEngine(err);
      fail(id, err);
    }
  };

  scope.onmessage = (ev) => {
    const req = ev.data as WorkerRequest;
    switch (req.type) {
      case 'init':
        void init(req.id, req.init);
        return;
      case 'search':
      case 'suggest':
        enqueueLatest(req);
        return;
      case 'cancel': {
        for (const [kind, p] of pending) {
          if (p.id === req.target) {
            pending.delete(kind);
            abort(p.id);
          }
        }
        return;
      }
      default:
        void run(req).catch((err) => fail(req.id, err));
    }
  };
}
