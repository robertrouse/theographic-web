/**
 * `npm run data` entry point.
 *   fetch  — pull json/ from theographic-bible-metadata at the SHA in data.lock
 *   build  — fetch → normalize → gate → write apps/web/public/data/ (default)
 *   gate   — normalize and gate without writing anything
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sizeTable, writeBundles } from './bundles.js';
import { fetchSources, readSource, SOURCE_FILES } from './fetch.js';
import { gate } from './gate.js';
import { normalize, NormalizeError, type Overrides } from './normalize.js';
import type { Sources } from './source.js';

const [, , command = 'build'] = process.argv;
const log = (s: string): void => console.log(s);

async function loadAll(): Promise<{ src: Sources; sha: string; repo: string }> {
  const { lock, dir } = await fetchSources({ log });
  const src = Object.fromEntries(
    await Promise.all(SOURCE_FILES.map(async (name) => [name, await readSource(dir, name)])),
  ) as unknown as Sources;
  return { src, sha: lock.sha, repo: lock.repo };
}

async function loadOverrides(): Promise<Overrides> {
  const p = fileURLToPath(new URL('../overrides.json', import.meta.url));
  const { $comment: _c, ...rest } = JSON.parse(await readFile(p, 'utf8')) as Overrides & {
    $comment?: string;
  };
  return rest;
}

async function main(): Promise<number> {
  switch (command) {
    case 'fetch': {
      await fetchSources({ log });
      return 0;
    }
    case 'gate':
    case 'build': {
      const t0 = performance.now();
      const { src, sha, repo } = await loadAll();
      const overrides = await loadOverrides();
      let n;
      try {
        n = normalize(src, overrides);
      } catch (e) {
        if (e instanceof NormalizeError) {
          console.error(`normalize: ${e.message}`);
          return 1;
        }
        throw e;
      }
      const g = gate(n, src);
      for (const f of g.facts) log(`  ${f}`);
      if (!g.ok) {
        console.error(`gate FAILED with ${g.errors.length} error(s):`);
        for (const e of g.errors.slice(0, 40)) console.error(`  - ${e}`);
        if (g.errors.length > 40) console.error(`  … ${g.errors.length - 40} more`);
        return 1;
      }
      log(`gate passed (${((performance.now() - t0) / 1000).toFixed(1)}s)`);
      if (command === 'gate') return 0;
      const report = await writeBundles(n, { repo, sha });
      log(sizeTable(report.files));
      log(`wrote ${report.files.length} files from ${repo}@${sha.slice(0, 7)}`);
      return 0;
    }
    default:
      console.error(`unknown command: ${command}`);
      return 2;
  }
}

process.exitCode = await main();
