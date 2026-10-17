/**
 * Merge freshly generated rows into the definitions file.
 *
 * - A `reviewed` row is never overwritten (invariant 7). An incoming row for
 *   a reviewed slug is dropped and reported, not applied.
 * - Every incoming row lands as `draft`, whatever the caller says.
 * - Output is sorted by slug so a diff of the file is a diff of the data.
 *
 * Where the file lives: `THEOGRAPHIC_METADATA_DIR/json/definitions.json` when
 * that variable points at a local clone of the metadata repo (the committed
 * home of the data), otherwise `packages/data/.cache/definitions/` — a
 * scratch location the site build also picks up, so a run can be previewed
 * before it is committed anywhere.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Definition } from '@theographic/core';
import { CACHE_ROOT } from '../fetch.js';

export const DEFINITIONS_CACHE_DIR = join(CACHE_ROOT, 'definitions');

export function definitionsPath(env: NodeJS.ProcessEnv = process.env): string {
  const dir = env['THEOGRAPHIC_METADATA_DIR'];
  return dir
    ? join(dir, 'json', 'definitions.json')
    : join(DEFINITIONS_CACHE_DIR, 'definitions.json');
}

export interface MergeReport {
  merged: Definition[];
  added: string[];
  replaced: string[];
  /** Incoming rows dropped because the existing row is `reviewed`. */
  keptReviewed: string[];
}

export function mergeDefinitions(
  existing: readonly Definition[],
  incoming: readonly Definition[],
): MergeReport {
  const bySlug = new Map(existing.map((d) => [d.slug, d]));
  const added: string[] = [];
  const replaced: string[] = [];
  const keptReviewed: string[] = [];
  for (const row of incoming) {
    const prev = bySlug.get(row.slug);
    if (prev?.status === 'reviewed') {
      keptReviewed.push(row.slug);
      continue;
    }
    (prev ? replaced : added).push(row.slug);
    bySlug.set(row.slug, { ...row, status: 'draft' });
  }
  const merged = [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  return { merged, added, replaced, keptReviewed };
}

export async function readDefinitions(path: string): Promise<Definition[]> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  return parseDefinitionsFile(text);
}

/** Accepts the committed shape `{ definitions: [...] }` or a bare array. */
export function parseDefinitionsFile(text: string): Definition[] {
  const raw = JSON.parse(text) as unknown;
  const rows = Array.isArray(raw)
    ? raw
    : ((raw as { definitions?: unknown })?.definitions ?? undefined);
  if (!Array.isArray(rows)) throw new Error('definitions file: expected { definitions: [...] }');
  return rows as Definition[];
}

export function serializeDefinitions(rows: readonly Definition[]): string {
  const sorted = [...rows].sort((a, b) => a.slug.localeCompare(b.slug));
  return JSON.stringify({ definitions: sorted }, null, 2) + '\n';
}

export async function writeDefinitions(path: string, rows: readonly Definition[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serializeDefinitions(rows));
}
