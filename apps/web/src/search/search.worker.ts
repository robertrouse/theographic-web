/**
 * The search worker entry. Everything the worker does is in
 * `@theographic/core`'s `serveEngine`; this file exists so Vite emits the
 * worker chunk from `new Worker(new URL('./search.worker.ts', import.meta.url))`.
 */
import { serveEngine, type WorkerScopeLike } from '@theographic/core';

serveEngine(self as unknown as WorkerScopeLike);
