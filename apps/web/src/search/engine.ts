/**
 * One worker per page, shared by every search island on it. The first
 * caller starts it; the core layer (books + entity names, ~156 KB gz)
 * loads at once, and the text and graph layers follow on idle so the
 * first search is ready inside a second and verses arrive behind it.
 *
 * The islands receive the engine files' hashes as a prop (inlined at build
 * from `manifest.json`), so the worker makes no manifest request.
 */
import {
  createWorkerEngine,
  type EngineManifest,
  type WorkerEngine,
  type WorkerLike,
} from '@theographic/core';

export interface EngineInit {
  manifest: EngineManifest;
  baseUrl?: string;
}

let engine: WorkerEngine | undefined;
let idleScheduled = false;

/** User Timing marks (`search:*`) so a Lighthouse run or the debug panel can read the milestones. */
export function mark(name: string): void {
  try {
    performance.mark(`search:${name}`);
  } catch {
    // No User Timing here; nothing to record.
  }
}

export function getEngine(init: EngineInit): WorkerEngine {
  if (engine) return engine;
  const worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
  // `WorkerLike` names only `postMessage`/`onmessage`; the DOM's `onmessage`
  // signature carries a `this: Worker` that the structural type cannot, hence the cast.
  mark('worker-start');
  engine = createWorkerEngine(worker as unknown as WorkerLike, {
    baseUrl: init.baseUrl ?? '/data/',
    manifest: init.manifest,
    layers: ['core'],
  });
  void engine.ready.then(() => mark('core-ready'));
  engine.onLayer((layer, state) => {
    if (state === 'ready') mark(`${layer}-ready`);
  });
  return engine;
}

/** After first paint and once the core layer is open: graph (85 KB) then text (2.1 MB). */
export function preloadOnIdle(e: WorkerEngine): void {
  if (idleScheduled) return;
  idleScheduled = true;
  const go = (): void => {
    void e.ready
      .then(() => e.preload('graph').catch(() => undefined))
      .then(() => e.preload('text').catch(() => undefined));
  };
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback;
  if (ric) ric(go);
  else setTimeout(go, 200);
}
