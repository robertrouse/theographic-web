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
export * from './text/tokenizer.js';
export * from './text/format.js';
export * from './text/build.js';
export * from './text/index.js';
export * from './text/damerau.js';
export * from './text/expand.js';
export * from './text/snippet.js';
export * from './text/bm25.js';
