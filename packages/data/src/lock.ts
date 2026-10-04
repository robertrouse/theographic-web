import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export interface DataLock {
  repo: string;
  sha: string;
  /** file name → sha256 hex, filled on first fetch and verified after. */
  files: Record<string, string>;
}

export const LOCK_PATH = fileURLToPath(new URL('../data.lock', import.meta.url));

export async function readLock(): Promise<DataLock> {
  return JSON.parse(await readFile(LOCK_PATH, 'utf8')) as DataLock;
}

export async function writeLock(lock: DataLock): Promise<void> {
  const files = Object.fromEntries(
    Object.entries(lock.files).sort(([a], [b]) => a.localeCompare(b)),
  );
  await writeFile(LOCK_PATH, JSON.stringify({ ...lock, files }, null, 2) + '\n');
}
