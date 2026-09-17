/**
 * `IndexSource` over the local filesystem — the Node host (CLI, tests, a
 * future MCP server). Lives outside `src/` on purpose: `src/` compiles with
 * `types: []` and must stay free of Node imports (invariant 1). This
 * directory has its own tsconfig with `types: ["node"]` and is published as
 * the `@theographic/core/node` entry point.
 */
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { IndexSource } from '../src/io/IndexSource.js';

export function fsSource(dir: string): IndexSource {
  const root = resolve(dir);
  return {
    description: `fs:${root}`,
    read: async (path) => new Uint8Array(await readFile(join(root, path))),
  };
}
