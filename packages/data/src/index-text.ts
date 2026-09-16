/**
 * Adapter from the normalized model to `buildTextIndex` in `@theographic/core`.
 * Nothing here knows the index format; it turns `versesByBook` into
 * `{ id, text }` rows in canonical order and hands back the bytes plus the
 * stats `bundles.ts` records in the manifest.
 */
import { buildTextIndex, type TextIndexBuild, type TextRow } from '@theographic/core';
import type { Normalized } from './normalize.js';

export function textRows(n: Normalized): TextRow[] {
  const rows: TextRow[] = [];
  for (const b of n.books) {
    for (const v of n.versesByBook.get(b.osis) ?? []) rows.push({ id: v.id, text: v.text });
  }
  return rows.sort((a, b) => a.id - b.id);
}

export function buildVerseTextIndex(n: Normalized): TextIndexBuild {
  return buildTextIndex(textRows(n));
}
