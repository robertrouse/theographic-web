/**
 * The message protocol between a page and the engine worker. Every
 * message is plain data — structured-clone safe — so nothing here can
 * carry a function, an `AbortSignal` or an index handle across the
 * boundary. `SearchOptions.signals` and `rewriter` therefore never reach
 * the worker; the client strips them (see `client.ts`).
 *
 * Request / response by id, plus two unsolicited events the worker sends:
 * `layer` when a layer's status changes (the page re-renders when the text
 * layer lands), and `ready` once the core layer is open.
 *
 * Cancellation: search and suggest are "latest wins". The worker keeps at
 * most one pending request of each kind; a newer one replaces it and the
 * older is answered `{ ok: false, error: 'aborted' }` without running. The
 * page never shows a stale result for the query it replaced.
 */
import type { EngineStatus, Layer } from '../engine.js';
import type { ParseReferenceResult, Ref } from '../refs/types.js';
import type { SearchOptions, SearchResult, Suggestion, SuggestOptions } from '../query/types.js';
import type { QueryPlan } from '../query/types.js';
import type { VerseId } from '../types.js';
import type { EngineManifest } from '../io/fetchSource.js';

export const PROTOCOL_VERSION = 1;

/** The transferable subset of `SearchOptions`. */
export type WireSearchOptions = Omit<SearchOptions, 'signals' | 'rewriter' | 'abort'>;

/** What the page tells the worker before anything else. */
export interface WorkerInit {
  /** Where the bundles are served from: `/data/`. */
  baseUrl: string;
  /** The engine files' hashes, or a manifest URL to fetch first. */
  manifest?: EngineManifest | string;
  /** Layers to open before `ready`; default `['core']`. */
  layers?: Layer[];
}

export type WorkerRequest =
  | { id: number; type: 'init'; init: WorkerInit }
  | { id: number; type: 'search'; q: string; opts?: WireSearchOptions }
  | { id: number; type: 'suggest'; prefix: string; opts?: SuggestOptions }
  | { id: number; type: 'preload'; layer: Layer }
  | { id: number; type: 'status' }
  | { id: number; type: 'plan'; q: string; opts?: WireSearchOptions }
  | { id: number; type: 'parseReference'; q: string }
  | { id: number; type: 'versesFor'; ref: Ref }
  | { id: number; type: 'mentions'; entityId: string }
  /** Drop a queued request; no reply beyond the target's own `aborted`. */
  | { id: number; type: 'cancel'; target: number };

export type WorkerRequestType = WorkerRequest['type'];

export interface ResultByType {
  init: EngineStatus;
  search: SearchResult;
  suggest: Suggestion[];
  preload: EngineStatus;
  status: EngineStatus;
  plan: QueryPlan;
  parseReference: ParseReferenceResult;
  versesFor: { id: VerseId; text: string }[];
  mentions: VerseId[];
  cancel: undefined;
}

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string; aborted?: true };

export type WorkerEvent =
  | { event: 'layer'; layer: Layer; state: EngineStatus['layers'][Layer]; status: EngineStatus }
  | { event: 'ready'; status: EngineStatus };

export type WorkerMessage = WorkerResponse | WorkerEvent;

export function isEvent(m: WorkerMessage): m is WorkerEvent {
  return 'event' in m;
}

/** The error a superseded request rejects with; `name` mirrors `DOMException`. */
export class AbortedError extends Error {
  override readonly name = 'AbortError';
  constructor(message = 'aborted') {
    super(message);
  }
}

export function isAborted(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: unknown }).name === 'AbortError'
  );
}
