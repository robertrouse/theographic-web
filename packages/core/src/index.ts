/**
 * @theographic/core — the search engine and data model.
 *
 * Invariant 1: nothing in this package may import the DOM, React, Astro, or
 * Node-only modules. `tsconfig.json` sets `lib: ["ES2022"]` and `types: []` so
 * a stray `document` or `process` fails typecheck rather than a phone.
 */
export const VERSION = '0.1.0';

export * from './types.js';
export * from './ids.js';
export * from './refs/types.js';
export * from './refs/normalize.js';
export * from './refs/bookAliases.js';
export * from './refs/ambiguous.js';
export * from './refs/parseReference.js';
export * from './refs/verseIds.js';
export * from './damerau.js';
export * from './text/tokenizer.js';
export * from './text/format.js';
export * from './text/build.js';
export * from './text/index.js';
export * from './text/expand.js';
export * from './text/snippet.js';
export * from './text/bm25.js';
export * from './entities/types.js';
export * from './entities/normalizeName.js';
export * from './entities/entityIndex.js';
export * from './entities/disambiguate.js';
export * from './entities/match.js';
export * from './graph/format.js';
export * from './graph/build.js';
export * from './graph/adjacency.js';
export * from './query/types.js';
export * from './query/grammar.js';
export * from './query/scope.js';
export * from './query/classify.js';
export * from './query/merge.js';
export * from './query/plan.js';
export * from './suggest/suggest.js';
export * from './io/IndexSource.js';
export * from './io/fetchSource.js';
export * from './worker/protocol.js';
export * from './worker/client.js';
export * from './worker/worker.js';
export * from './engine.js';
