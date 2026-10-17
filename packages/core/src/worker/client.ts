/**
 * The main-thread side of the worker protocol. `createWorkerEngine(worker,
 * init)` returns the engine's API with every method asynchronous — a
 * worker cannot answer synchronously, so this is `SearchEngine` minus
 * `searchSync`, with promises where the in-process engine returns values.
 *
 * Search and suggest are latest-wins on this side too: issuing a new one
 * rejects the previous in-flight promise with `AbortedError` at once and
 * tells the worker to drop it if it has not run. Callers treat an
 * `AbortError` as "ignore", never as a failure.
 *
 * The client never constructs the `Worker`: bundlers need the
 * `new Worker(new URL('./x', import.meta.url))` form in host code to emit
 * the chunk, so the host passes the instance in. Anything with
 * `postMessage` and `onmessage` will do, including a `MessagePort` or a
 * test fake wired straight to `serveEngine`.
 */
import type { EngineStatus, Layer } from '../engine.js';
import type { ParseReferenceResult, Ref } from '../refs/types.js';
import type {
  QueryPlan,
  SearchOptions,
  SearchResult,
  Suggestion,
  SuggestOptions,
} from '../query/types.js';
import type { VerseId } from '../types.js';
import {
  AbortedError,
  isEvent,
  type ResultByType,
  type WireSearchOptions,
  type WorkerInit,
  type WorkerMessage,
  type WorkerRequest,
} from './protocol.js';

export interface WorkerLike {
  postMessage(message: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  terminate?(): void;
}

export type LayerState = EngineStatus['layers'][Layer];
export type LayerListener = (layer: Layer, state: LayerState, status: EngineStatus) => void;

export interface WorkerEngine {
  search(q: string, opts?: SearchOptions): Promise<SearchResult>;
  suggest(prefix: string, opts?: SuggestOptions): Promise<Suggestion[]>;
  plan(q: string, opts?: SearchOptions): Promise<QueryPlan>;
  parseReference(q: string): Promise<ParseReferenceResult>;
  versesFor(ref: Ref): Promise<{ id: VerseId; text: string }[]>;
  mentions(entityId: string): Promise<VerseId[]>;
  status(): Promise<EngineStatus>;
  preload(layer: Layer): Promise<void>;
  /** Resolves when the core layer is open; rejects if the worker could not load it. */
  readonly ready: Promise<EngineStatus>;
  /** The most recent status the worker reported, or undefined before `ready`. */
  readonly lastStatus: EngineStatus | undefined;
  /** Layer status changes (loading → ready | failed). Returns the unsubscribe. */
  onLayer(listener: LayerListener): () => void;
  terminate(): void;
}

/** Drop the parts of `SearchOptions` that cannot cross a structured clone. */
export function wireOptions(o: SearchOptions | undefined): WireSearchOptions | undefined {
  if (!o) return undefined;
  const { signals: _s, rewriter: _r, abort: _a, ...rest } = o;
  return rest;
}

type Settle = { resolve: (v: unknown) => void; reject: (e: unknown) => void };
type LatestKind = 'search' | 'suggest';

export function createWorkerEngine(worker: WorkerLike, init: WorkerInit): WorkerEngine {
  let nextId = 1;
  const waiting = new Map<number, Settle>();
  const inflight = new Map<LatestKind, number>();
  const listeners = new Set<LayerListener>();
  let lastStatus: EngineStatus | undefined;

  const send = <T extends WorkerRequest['type']>(
    req: Omit<Extract<WorkerRequest, { type: T }>, 'id'>,
  ): Promise<ResultByType[T]> => {
    const id = nextId++;
    return new Promise<ResultByType[T]>((resolve, reject) => {
      waiting.set(id, { resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage({ id, ...req });
    });
  };

  const latest = <T extends LatestKind>(
    req: Omit<Extract<WorkerRequest, { type: T }>, 'id'>,
  ): Promise<ResultByType[T]> => {
    const kind = req.type;
    const old = inflight.get(kind);
    if (old !== undefined) {
      const s = waiting.get(old);
      if (s) {
        waiting.delete(old);
        worker.postMessage({ id: nextId++, type: 'cancel', target: old } satisfies WorkerRequest);
        s.reject(new AbortedError());
      }
    }
    const id = nextId++;
    inflight.set(kind, id);
    return new Promise<ResultByType[T]>((resolve, reject) => {
      waiting.set(id, {
        resolve: (v) => {
          if (inflight.get(kind) === id) inflight.delete(kind);
          resolve(v as ResultByType[T]);
        },
        reject: (e) => {
          if (inflight.get(kind) === id) inflight.delete(kind);
          reject(e);
        },
      });
      worker.postMessage({ id, ...req });
    });
  };

  worker.onmessage = (ev) => {
    const m = ev.data as WorkerMessage;
    if (isEvent(m)) {
      lastStatus = m.status;
      if (m.event === 'layer') for (const l of listeners) l(m.layer, m.state, m.status);
      return;
    }
    const s = waiting.get(m.id);
    if (!s) return; // already settled locally (superseded)
    waiting.delete(m.id);
    if (m.ok) s.resolve(m.result);
    else s.reject(m.aborted ? new AbortedError() : new Error(m.error));
  };

  const ready = send<'init'>({ type: 'init', init }).then((status) => {
    lastStatus = status;
    return status;
  });
  ready.catch(() => {
    // Surfaced through `ready` to whoever awaits it; not an unhandled rejection here.
  });

  const remember = (s: EngineStatus): EngineStatus => {
    lastStatus = s;
    return s;
  };

  return {
    search: (q, opts) => {
      const w = wireOptions(opts);
      return latest<'search'>({ type: 'search', q, ...(w ? { opts: w } : {}) });
    },
    suggest: (prefix, opts) =>
      latest<'suggest'>({ type: 'suggest', prefix, ...(opts ? { opts } : {}) }),
    plan: (q, opts) => {
      const w = wireOptions(opts);
      return send<'plan'>({ type: 'plan', q, ...(w ? { opts: w } : {}) });
    },
    parseReference: (q) => send<'parseReference'>({ type: 'parseReference', q }),
    versesFor: (ref) => send<'versesFor'>({ type: 'versesFor', ref }),
    mentions: (entityId) => send<'mentions'>({ type: 'mentions', entityId }),
    status: () => send<'status'>({ type: 'status' }).then(remember),
    preload: (layer) =>
      send<'preload'>({ type: 'preload', layer }).then((s) => {
        remember(s);
      }),
    ready,
    get lastStatus() {
      return lastStatus;
    },
    onLayer: (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    terminate: () => {
      for (const s of waiting.values()) s.reject(new AbortedError('terminated'));
      waiting.clear();
      inflight.clear();
      worker.terminate?.();
    },
  };
}
