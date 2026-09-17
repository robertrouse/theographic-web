/**
 * Entity-index types — the contract between `packages/data/src/index-entities.ts`
 * (which writes `entities.index.json`) and `entities/match.ts` (which searches
 * it). See `docs/search-design.md` §"Build outputs" (02-entities) and
 * §"Ranking formulas" (Entity).
 */
import type { VerseId } from '../types.js';

/** Row type: person · place (location) · group · event · book. */
export type EntityIndexType = 'p' | 'l' | 'g' | 'e' | 'b';

/** Search-result group an index row lands in (books are passages). */
export type EntityGroup = 'people' | 'places' | 'events' | 'groups' | 'passages';

/**
 * Where an alias came from. Curated sources get weight 1 unless the alias
 * collides with another entity's primary name or is a common word, in which
 * case the text decides (`mined` link share). A source may be a `+`-joined
 * pair such as `alias+mined` when both applied.
 */
export type EntityAliasSource =
  'alias' | 'surname' | 'esv' | 'title' | 'hyphen' | 'short' | 'mined';

/** `[normalized alias, weight 0..1, source]`. */
export type IndexAlias = [norm: string, weight: number, source: string];

export interface EntityIndexRow {
  t: EntityIndexType;
  /** Slug for p/l/g/e (events use their URL slug), OSIS for books. */
  id: string;
  /** Primary display name; the bare name for rows whose title disambiguates. */
  name: string;
  /** `normalizeName(name)`. Rows sharing a `norm` share a `dupCount`. */
  norm: string;
  /** Disambiguated title when the source has one ("Antioch (Syria)"). */
  title?: string;
  aliases: IndexAlias[];
  /** Verse count; the prominence signal. 0 means none, never a stand-in. */
  vc: number;
  /** First verse id for entities, canonical order for books. Absent when unknown. */
  order?: VerseId | number;
  /** Precomputed disambiguation sublabel; always present. */
  sub: string;
  /** Rows (of any type) whose `norm` equals this one's, including itself. */
  dupCount: number;
  /** Places only: feature type ("City", "Region", …). */
  ft?: string;
}

export interface EntityIndexFile {
  format: 1;
  /** Highest `vc` in `rows`; the prominence denominator. */
  maxVc: number;
  rows: EntityIndexRow[];
  /**
   * Every searchable string — each row's `norm` and each alias — sorted by
   * string then row, for prefix lookup by binary search.
   * `[string, rowIndex, aliasIndex]`, `aliasIndex` −1 for the primary name.
   */
  names: [string, number, number][];
}
