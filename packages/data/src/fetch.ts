/**
 * Pull the metadata JSON at the pinned commit into `.cache/<sha>/`.
 *
 * Every file's sha256 is recorded in `data.lock` the first time it is seen and
 * verified on every later run, so a rebuild from the same lock is guaranteed
 * to start from the same bytes. `THEOGRAPHIC_METADATA_DIR` points the fetch at
 * a local clone instead of GitHub (offline builds); the hashes still apply.
 */
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './hash.js';
import { readLock, writeLock, type DataLock } from './lock.js';

export const SOURCE_FILES = [
  'books',
  'chapters',
  'verses',
  'people',
  'places',
  'events',
  'peopleGroups',
  'easton',
] as const;
export type SourceFile = (typeof SOURCE_FILES)[number];

export const CACHE_ROOT = fileURLToPath(new URL('../.cache/', import.meta.url));

export function cacheDir(lock: DataLock): string {
  return join(CACHE_ROOT, lock.sha);
}

async function exists(p: string): Promise<boolean> {
  return stat(p).then(
    () => true,
    () => false,
  );
}

export async function fetchSources(opts: { log?: (s: string) => void } = {}): Promise<{
  lock: DataLock;
  dir: string;
}> {
  const log = opts.log ?? (() => {});
  const lock = await readLock();
  const dir = cacheDir(lock);
  await mkdir(dir, { recursive: true });
  const localDir = process.env['THEOGRAPHIC_METADATA_DIR'];
  let lockChanged = false;

  for (const name of SOURCE_FILES) {
    const file = `${name}.json`;
    const dest = join(dir, file);
    if (!(await exists(dest))) {
      if (localDir) {
        await copyFile(join(localDir, 'json', file), dest);
        log(`copied ${file} from ${localDir}`);
      } else {
        const url = `https://raw.githubusercontent.com/${lock.repo}/${lock.sha}/json/${file}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`fetch ${url}: ${res.status} ${res.statusText}`);
        await writeFile(dest, Buffer.from(await res.arrayBuffer()));
        log(`fetched ${file}`);
      }
    }
    const hash = sha256(await readFile(dest));
    const expected = lock.files[file];
    if (expected === undefined) {
      lock.files[file] = hash;
      lockChanged = true;
    } else if (expected !== hash) {
      throw new Error(
        `${file} does not match data.lock (expected ${expected.slice(0, 12)}…, got ${hash.slice(0, 12)}…). ` +
          `Delete ${dest} to refetch, or update data.lock deliberately.`,
      );
    }
  }
  if (lockChanged) {
    await writeLock(lock);
    log('data.lock updated with file hashes');
  }
  return { lock, dir };
}

export async function readSource<T = unknown>(dir: string, name: SourceFile): Promise<T> {
  return JSON.parse(await readFile(join(dir, `${name}.json`), 'utf8')) as T;
}
