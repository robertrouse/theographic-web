/**
 * Serialize the normalized model to `apps/web/public/data/` and write the
 * manifest. Output is deterministic: arrays are sorted upstream, keys are
 * emitted in declaration order, and only `manifest.builtAt` varies between
 * two builds of the same lock — it is excluded from the hashes.
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import type {
  BooksBundle,
  EntitiesBundle,
  EventsBundle,
  Manifest,
  VersesBundle,
} from '@theographic/core';
import { sha256 } from './hash.js';
import { buildEntityIndex } from './index-entities.js';
import type { Normalized } from './normalize.js';

export const OUT_DIR = fileURLToPath(new URL('../../../apps/web/public/data/', import.meta.url));

export interface WrittenFile {
  path: string;
  bytes: number;
  gzip: number;
  sha256: string;
}

export interface BuildReport {
  manifest: Manifest;
  files: WrittenFile[];
}

export async function writeBundles(
  n: Normalized,
  source: Manifest['source'],
  outDir: string = OUT_DIR,
): Promise<BuildReport> {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(join(outDir, 'verses'), { recursive: true });
  await mkdir(join(outDir, 'detail', 'person'), { recursive: true });
  await mkdir(join(outDir, 'detail', 'place'), { recursive: true });

  const files: WrittenFile[] = [];
  const emit = async (rel: string, value: unknown): Promise<void> => {
    const json = JSON.stringify(value);
    await writeFile(join(outDir, rel), json);
    files.push({
      path: rel,
      bytes: Buffer.byteLength(json),
      gzip: gzipSync(json).length,
      sha256: sha256(json),
    });
  };

  const books: BooksBundle = { books: n.books };
  await emit('books.json', books);

  for (const b of n.books) {
    const bundle: VersesBundle = { book: b.osis, verses: n.versesByBook.get(b.osis)! };
    await emit(`verses/${b.osis}.json`, bundle);
  }

  const entities: EntitiesBundle = { people: n.people, places: n.places, groups: n.groups };
  await emit('entities.json', entities);

  const events: EventsBundle = { events: n.events };
  await emit('events.json', events);

  await emit('entities.index.json', buildEntityIndex(n));

  for (const [slug, d] of n.personDetail) await emit(`detail/person/${slug}.json`, d);
  for (const [slug, d] of n.placeDetail) await emit(`detail/place/${slug}.json`, d);

  const chapters = n.books.reduce((s, b) => s + b.versesPerChapter.length, 0);
  const verses = [...n.versesByBook.values()].reduce((s, v) => s + v.length, 0);
  const manifest: Manifest = {
    format: 1,
    source,
    builtAt: new Date().toISOString(),
    files: Object.fromEntries(
      [...files]
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((f) => [f.path, f.sha256] as const),
    ),
    counts: {
      books: n.books.length,
      chapters,
      verses,
      people: n.people.length,
      places: n.places.length,
      events: n.events.length,
      groups: n.groups.length,
    },
  };
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { manifest, files };
}

/** Summarize a report as a table of totals per top-level group of files. */
export function sizeTable(files: WrittenFile[]): string {
  const groups = new Map<string, { n: number; bytes: number; gzip: number }>();
  for (const f of files) {
    const key = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) + '/*' : f.path;
    const g = groups.get(key) ?? { n: 0, bytes: 0, gzip: 0 };
    g.n++;
    g.bytes += f.bytes;
    g.gzip += f.gzip;
    groups.set(key, g);
  }
  const kb = (x: number): string => (x / 1024).toFixed(x > 1024 * 100 ? 0 : 1).padStart(8);
  const lines = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([k, g]) =>
        `${k.padEnd(20)} ${String(g.n).padStart(5)} files ${kb(g.bytes)} KB ${kb(g.gzip)} KB gz`,
    );
  const total = files.reduce((s, f) => s + f.gzip, 0);
  lines.push(
    `${'total'.padEnd(20)} ${String(files.length).padStart(5)} files ${''.padStart(11)} ${kb(total)} KB gz`,
  );
  return lines.join('\n');
}

export async function listOut(outDir: string = OUT_DIR): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, prefix: string): Promise<void> => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory()) await walk(join(dir, e.name), `${prefix}${e.name}/`);
      else out.push(`${prefix}${e.name}`);
    }
  };
  await walk(outDir, '');
  return out.sort();
}
