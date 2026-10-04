/**
 * Public search types (docs/search-design.md §"Public API") and the
 * `QueryPlan` the classifier produces and `plan.ts` executes. The plan is
 * plain data — no closures, no index handles — so a `QueryRewriter` (an
 * LLM, a test) can author one and the executor cannot tell the difference.
 */
import type { EntityIndexType } from '../entities/types.js';
import type { ParseError, Ref } from '../refs/types.js';
import type { Snippet } from '../text/snippet.js';
import type { BookOsis, Testament, VerseId } from '../types.js';

export type Group = 'passages' | 'verses' | 'people' | 'places' | 'events' | 'groups' | 'topics';

/** Cross-group tie-break order (design: "passages, people, places, events, verses, topics, groups"). */
export const GROUP_ORDER: readonly Group[] = [
  'passages',
  'people',
  'places',
  'events',
  'verses',
  'topics',
  'groups',
];

export const GROUP_RANK: Record<Group, number> = Object.fromEntries(
  GROUP_ORDER.map((g, i) => [g, i]),
) as Record<Group, number>;

export type FilterKey =
  'in' | 'book' | 'person' | 'place' | 'event' | 'group' | 'type' | 'mentions' | 'sort';

export interface Filter {
  key: FilterKey;
  /** As typed, quotes removed. */
  value: string;
  /** `[start, end)` character span in the clause text, or absent for sugar-derived filters. */
  span?: [number, number];
  /** How the filter was written: `key:value`, or the "… in <book>" / "verses mentioning X" sugar. */
  source: 'filter' | 'sugar';
}

/** Verse scope, resolved to books and id ranges at plan time. */
export interface Scope {
  books?: BookOsis[];
  testament?: Testament;
  division?: string;
  /** Inclusive verse-id ranges from references narrower than a book. */
  ranges?: [VerseId, VerseId][];
}

/** A run of query words the classifier read as an entity name. */
export interface EntitySpan {
  /** The words as typed, space-joined. */
  text: string;
  /** `[start, end)` in the clause text. */
  span: [number, number];
  words: number;
  /**
   * Only fuzzy, prefix or token evidence: the entity hits are still
   * returned, but the words stay in the text query and the span never hops.
   */
  weak: boolean;
  /** Row types allowed (from a `person:`/`place:`… filter). */
  kinds?: EntityIndexType[];
  /** Strong candidates (exact / aliasExact / multiToken) — the ids that hop. */
  ids: string[];
}

export interface ClausePlan {
  /** The clause as typed. */
  text: string;
  filters: Filter[];
  scope?: Scope;
  sort: 'relevance' | 'canonical';
  refs: Ref[];
  refErrors: ParseError[];
  /** Emit a passage hit per ref (false when the book came in through "in <book>"). */
  refPassages: boolean;
  entities: EntitySpan[];
  /** What the text layer searches; '' when nothing is left. */
  textQuery: string;
  /** `textQuery` is one double-quoted phrase: only contiguous matches count. */
  phrase: boolean;
  /** Entity queries from `mentions:` — their verses are the clause's verse candidates. */
  mentions: string[];
  /** Words that are neither filters nor consumed references: the coverage denominator. */
  contentWords: number;
  /** Groups this clause searches. */
  groups: Group[];
}

export interface QueryPlan {
  query: string;
  clauses: ClausePlan[];
  /** One line per classification step (invariant 3). */
  why: string[];
  author: 'classifier' | 'rewriter';
}

// ------------------------------------------------------------- search API

export interface RankSignal {
  name: string;
  /** Only `verses` is combined today. */
  layer: 'verses';
  /**
   * Score each candidate 0..1. Must be deterministic for the same inputs;
   * returned array is index-aligned with `candidates`.
   */
  score(candidates: readonly { id: VerseId; lex: number }[], ctx: { query: string }): number[];
}

export interface SearchOptions {
  groups?: Group[];
  /** Default 10. */
  limitPerGroup?: number;
  scope?: Pick<Scope, 'books' | 'testament' | 'division'>;
  sort?: 'relevance' | 'canonical';
  /** Default true. */
  fuzzy?: boolean;
  /** Attach `why[]` to every hit. Default true. */
  explain?: boolean;
  signals?: RankSignal[];
  /** Async only: author the plan instead of the rule classifier. */
  rewriter?: QueryRewriter;
  abort?: { aborted: boolean };
}

export interface Hit {
  group: Group;
  /** Slug, OSIS reference string, or verse id. */
  id: string | number;
  /** Cross-group score 0..1. */
  score: number;
  /** The layer's own unclamped value (entity raw, bm25, ref confidence). */
  raw: number;
  label: string;
  sublabel?: string;
  snippet?: Snippet;
  ref?: Ref;
  /** Entities only: verses linking the entity (`vc`). Informational; never a ranking input here. */
  verseCount?: number;
  why?: string[];
}

export interface GroupResult {
  total: number;
  hits: Hit[];
}

export interface SearchResult {
  query: string;
  plan: QueryPlan;
  groups: Record<Group, GroupResult>;
  /** Every returned hit across groups, cross-group order. */
  all: Hit[];
  /** Milliseconds per phase; informational, never part of the deterministic output. */
  timings: Record<string, number>;
  /** False for a group whose layer is not loaded — its hits are empty, not zero. */
  ready: Record<Group, boolean>;
}

export type QueryRewriter = (q: string, ctx: { plan: QueryPlan }) => Promise<QueryPlan | string>;

export interface Suggestion {
  kind: 'book' | 'reference' | 'entity' | 'recent';
  label: string;
  sublabel?: string;
  /** What to put in the box when chosen. */
  query: string;
  id?: string;
  group?: Group;
  score: number;
  why?: string;
}

export interface SuggestOptions {
  /** Default 8. */
  limit?: number;
  /** Host-supplied recent queries, most recent first. */
  recent?: readonly string[];
}
