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
