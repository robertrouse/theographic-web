/**
 * What a hit shows. The label is the primary name; the sublabel is the
 * build-time `sub` (title parenthetical, father, feature type, first verse —
 * see `packages/data/src/index-entities.ts`), which is what tells eight
 * Simons apart. Both are precomputed so the query side does no string work.
 */
import type { EntityIndexRow } from './types.js';

export function labelFor(row: EntityIndexRow): string {
  return row.name;
}

export function sublabelFor(row: EntityIndexRow): string {
  return row.sub;
}

/** True when another row shares this name, so the sublabel is load-bearing. */
export function needsDisambiguation(row: EntityIndexRow): boolean {
  return row.dupCount > 1;
}
