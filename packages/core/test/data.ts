/**
 * Test-side access to the built bundles under `apps/web/public/data/`
 * (gitignored; produced by `npm run data`). Node I/O lives here, never in
 * `src/` (invariant 1). Loaders return `undefined` when the data is absent so
 * a test can skip with a clear message — unless `THEOGRAPHIC_REQUIRE_DATA` is
 * set, as it is in CI, in which case absence is a failure.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Book, BooksBundle, EntitiesBundle, VersesBundle } from '../src/types.js';
import type { EntityIndexFile } from '../src/entities/types.js';
import type { deriveAmbiguousBooks } from '../src/refs/ambiguous.js';

export const DATA_DIR = fileURLToPath(new URL('../../../apps/web/public/data/', import.meta.url));

export function hasData(): boolean {
  const present = existsSync(join(DATA_DIR, 'books.json'));
  if (!present && process.env['THEOGRAPHIC_REQUIRE_DATA']) {
    throw new Error(`THEOGRAPHIC_REQUIRE_DATA is set but ${DATA_DIR}books.json is missing`);
  }
  return present;
}

export const SKIP_REASON = `no built data under ${DATA_DIR} — run \`npm run data\` first`;

function readJson<T>(rel: string): T | undefined {
  const p = join(DATA_DIR, rel);
  if (!existsSync(p)) return undefined;
  return JSON.parse(readFileSync(p, 'utf8')) as T;
}

export function loadBooks(): Book[] | undefined {
  if (!hasData()) return undefined;
  return readJson<BooksBundle>('books.json')?.books;
}

export function loadEntities(): EntitiesBundle | undefined {
  if (!hasData()) return undefined;
  return readJson<EntitiesBundle>('entities.json');
}

export function loadEntityIndexFile(): EntityIndexFile | undefined {
  if (!hasData()) return undefined;
  return readJson<EntityIndexFile>('entities.index.json');
}

export function loadVerses(osis: string): VersesBundle | undefined {
  return readJson<VersesBundle>(join('verses', `${osis}.json`));
}

export function listVerseFiles(): string[] {
  const dir = join(DATA_DIR, 'verses');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
}

/** The TypeScript literal for the GENERATED block in `src/refs/ambiguous.ts`. */
export function renderAmbiguousLiteral(record: ReturnType<typeof deriveAmbiguousBooks>): string {
  return Object.entries(record)
    .map(
      ([osis, list]) =>
        `  ${/^\d/.test(osis) ? `'${osis}'` : osis}: [\n${list
          .map((e) => `    { type: '${e.type}', id: '${e.id}' },`)
          .join('\n')}\n  ],`,
    )
    .join('\n');
}
