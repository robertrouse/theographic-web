/**
 * Shared loading for the two CLIs: fetch (or reuse) the pinned sources, read
 * `overrides.json`, and normalize. `cli.ts` adds the gate and the bundle
 * writer; `cli-defs.ts` only needs the model.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fetchSources, readSource, SOURCE_FILES } from './fetch.js';
import { normalize, type Normalized, type Overrides } from './normalize.js';
import type { Sources } from './source.js';

export async function loadAll(
  log: (s: string) => void = () => {},
): Promise<{ src: Sources; sha: string; repo: string }> {
  const { lock, dir } = await fetchSources({ log });
  const src = Object.fromEntries(
    await Promise.all(SOURCE_FILES.map(async (name) => [name, await readSource(dir, name)])),
  ) as unknown as Sources;
  return { src, sha: lock.sha, repo: lock.repo };
}

export async function loadOverrides(): Promise<Overrides> {
  const p = fileURLToPath(new URL('../overrides.json', import.meta.url));
  const { $comment: _c, ...rest } = JSON.parse(await readFile(p, 'utf8')) as Overrides & {
    $comment?: string;
  };
  return rest;
}

/** Sources → normalized model, without the gate. Throws `NormalizeError`. */
export async function loadNormalized(
  log: (s: string) => void = () => {},
): Promise<{ n: Normalized; src: Sources; sha: string; repo: string }> {
  const { src, sha, repo } = await loadAll(log);
  const n = normalize(src, await loadOverrides());
  return { n, src, sha, repo };
}
