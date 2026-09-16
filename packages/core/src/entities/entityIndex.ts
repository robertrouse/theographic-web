/**
 * In-memory form of `entities.index.json`. Loading is a plain-object walk
 * plus a few derived arrays (per-row token sets, id lookup); nothing is
 * re-sorted, so a load is byte-deterministic and costs well under the
 * "ready < 1 s" core-layer budget.
 */
import { nameTokens, normalizeName } from './normalizeName.js';
import type { EntityGroup, EntityIndexFile, EntityIndexRow, EntityIndexType } from './types.js';

export const ENTITY_GROUP: Record<EntityIndexType, EntityGroup> = {
  p: 'people',
  l: 'places',
  e: 'events',
  g: 'groups',
  b: 'passages',
};

/** Tie-break order between groups (design: "group order → verseID → id"). */
export const ENTITY_GROUP_ORDER: Record<EntityGroup, number> = {
  passages: 0,
  people: 1,
  places: 2,
  events: 3,
  groups: 4,
};

export interface EntityIndex {
  rows: EntityIndexRow[];
  names: EntityIndexFile['names'];
  maxVc: number;
  /** `ln(1 + maxVc)`, the prominence denominator. */
  logMaxVc: number;
  /** Per row: tokens of `norm` (what the token and multiToken tiers match). */
  nameTokens: string[][];
  /**
   * Per row: tokens of `norm`, of `title` and of every alias with weight ≥
   * `ALIAS_STRONG`, deduplicated — the multiToken tier's vocabulary. Title
   * tokens are included whole so "Antioch Syria" reaches Antioch (Syria)
   * even though "syria" alone is Syria's name, not Antioch's alias.
   */
  strongTokens: string[][];
  /** Per row: alias strings with weight ≥ `ALIAS_STRONG` (prefix and fuzzy candidates). */
  strongAliases: string[][];
  byId: Map<string, number>;
}

/** Aliases at or above this weight count as the entity's own name. */
export const ALIAS_STRONG = 0.5;

export function loadEntityIndex(file: EntityIndexFile): EntityIndex {
  if (file.format !== 1)
    throw new Error(`entities.index: unsupported format ${String(file.format)}`);
  const rows = file.rows;
  const nameToks: string[][] = new Array(rows.length);
  const strongToks: string[][] = new Array(rows.length);
  const strongAliases: string[][] = new Array(rows.length);
  const byId = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const own = nameTokens(r.norm);
    nameToks[i] = own;
    const set = new Set(own);
    if (r.title !== undefined) for (const t of nameTokens(normalizeName(r.title))) set.add(t);
    const strong: string[] = [];
    for (const [alias, w] of r.aliases) {
      if (w >= ALIAS_STRONG) {
        strong.push(alias);
        for (const t of nameTokens(alias)) set.add(t);
      }
    }
    strongToks[i] = [...set];
    strongAliases[i] = strong;
    byId.set(r.id, i);
  }
  return {
    rows,
    names: file.names,
    maxVc: file.maxVc,
    logMaxVc: Math.log(1 + file.maxVc),
    nameTokens: nameToks,
    strongTokens: strongToks,
    strongAliases,
    byId,
  };
}

/**
 * Half-open range `[lo, hi)` of `names` entries starting with `prefix`
 * (already normalized). Two binary searches; `hi - lo` entries, in
 * string-then-row order. Empty prefix returns the whole table.
 */
export function prefixRange(index: EntityIndex, prefix: string): [number, number] {
  const names = index.names;
  let lo = 0;
  let hi = names.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (names[mid]![0] < prefix) lo = mid + 1;
    else hi = mid;
  }
  const start = lo;
  hi = names.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (names[mid]![0].startsWith(prefix) || names[mid]![0] < prefix) lo = mid + 1;
    else hi = mid;
  }
  return [start, lo];
}

/** Rows whose primary name or an alias starts with `prefix`, deduplicated, index order of first hit. */
export function rowsWithPrefix(index: EntityIndex, prefix: string, limit = 50): number[] {
  const [lo, hi] = prefixRange(index, prefix);
  const seen = new Set<number>();
  const out: number[] = [];
  for (let i = lo; i < hi && out.length < limit; i++) {
    const row = index.names[i]![1];
    if (!seen.has(row)) {
      seen.add(row);
      out.push(row);
    }
  }
  return out;
}
