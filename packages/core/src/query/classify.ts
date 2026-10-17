/**
 * The rule-based intent classifier: query string → `QueryPlan`, in the
 * order docs/search-design.md fixes (§"Query grammar", "Classifier order"):
 *
 *   filters → references (longest match, validated; out of range is an
 *   error and the words stay) → entity n-grams 3/2/1 (fuzzy only for
 *   unigrams of ≥ 4 chars; a span with only fuzzy/prefix/token evidence is
 *   `weak`: its hits are kept but it never consumes words or hops) → text
 *   terms → group activation.
 *
 * Every step appends to `plan.why` (invariant 3). The plan is plain data;
 * `plan.ts` executes it. Entity matching results are handed back in a
 * cache keyed by (kinds, text, fuzzy) so the executor does not repeat the
 * brute-force pass for spans the classifier already scored.
 *
 * Two rules worth knowing that the design leaves to the implementation:
 * - A strong span's words STAY in the text query. The verse layer sees the
 *   whole clause, and `merge.ts` ranks a verse that is both linked to the
 *   entity and names it ahead of one merely linked — that is what puts
 *   Acts 13:9 ("who also is called Paul") first for "Paul".
 * - A reference in a clause that also has words is a scope for that
 *   clause's verses as well as a passage hit ("Moses Exodus 3"), the same
 *   way "… in <book>" is — except the sugar emits no passage.
 */
import { matchEntities, type EntityHit, type EntityTier } from '../entities/match.js';
import type { EntityIndex } from '../entities/entityIndex.js';
import { NAME_STOPWORDS } from '../entities/normalizeName.js';
import type { EntityIndexType } from '../entities/types.js';
import type { BookAliasTable } from '../refs/bookAliases.js';
import { parseReference } from '../refs/parseReference.js';
import type { Ref } from '../refs/types.js';
import type { Book } from '../types.js';
import { blankSpans, parseQuery, type RawClause, type WordItem } from './grammar.js';
import {
  addRefToScope,
  describeScope,
  isScopeWords,
  mergeScopes,
  resolveScopeValue,
} from './scope.js';
import type { ClausePlan, EntitySpan, Group, QueryPlan, Scope, SearchOptions } from './types.js';

export interface ClassifyContext {
  table: BookAliasTable;
  entities: EntityIndex;
  books: readonly Book[];
}

/** Tiers that let a span consume its words and hop through the graph. */
export const STRONG_TIERS: ReadonlySet<EntityTier> = new Set<EntityTier>([
  'exact',
  'aliasExact',
  'multiToken',
]);

/** Bare book references at or above this confidence are consumed; below it the words stay for entities. */
export const CONSUMED_REF_CONFIDENCE = 0.9;

/** Unigram spans shorter than this never fuzz (design: "fuzzy only unigrams ≥ 4"). */
export const FUZZY_UNIGRAM_MIN = 4;

const KIND_OF_FILTER: Record<string, EntityIndexType> = {
  person: 'p',
  place: 'l',
  event: 'e',
  group: 'g',
};

const GROUP_OF_KIND: Record<EntityIndexType, Group> = {
  p: 'people',
  l: 'places',
  e: 'events',
  g: 'groups',
  b: 'passages',
};

const GROUP_ALIASES: Record<string, Group> = {
  passages: 'passages',
  passage: 'passages',
  books: 'passages',
  book: 'passages',
  verses: 'verses',
  verse: 'verses',
  text: 'verses',
  people: 'people',
  person: 'people',
  places: 'places',
  place: 'places',
  events: 'events',
  event: 'events',
  groups: 'groups',
  group: 'groups',
  topics: 'topics',
  topic: 'topics',
};

/** Groups a clause searches when nothing narrows it (topics is a seam only). */
export const DEFAULT_GROUPS: readonly Group[] = [
  'passages',
  'people',
  'places',
  'events',
  'groups',
  'verses',
];

export type MatchCache = Map<string, EntityHit[]>;

export function matchKey(
  text: string,
  kinds: readonly EntityIndexType[] | undefined,
  fuzzy: boolean,
): string {
  return `${kinds ? kinds.join('') : '*'}|${fuzzy ? 'f' : 'x'}|${text}`;
}

/** Whether a span of `words` words is typo-checked (design: unigrams of ≥ 4 chars only). */
export function spanFuzzy(words: number, text: string, fuzzy: boolean): boolean {
  return fuzzy && words === 1 && text.length >= FUZZY_UNIGRAM_MIN;
}

export function cachedMatch(
  cache: MatchCache,
  text: string,
  kinds: readonly EntityIndexType[] | undefined,
  fuzzy: boolean,
  index: EntityIndex,
): EntityHit[] {
  const key = matchKey(text, kinds, fuzzy);
  let hits = cache.get(key);
  if (!hits) {
    hits = matchEntities(text, index, { fuzzy, ...(kinds ? { kinds } : {}) });
    cache.set(key, hits);
  }
  return hits;
}

function refLabel(ref: Ref): string {
  const c = ref.chapterStart;
  const v = ref.verseStart;
  let s = ref.bookOsis;
  if (ref.kind === 'book') return s;
  s += `.${c}`;
  if (v !== undefined) s += `.${v}`;
  if (ref.chapterEnd !== c || (ref.verseEnd !== undefined && ref.verseEnd !== v)) {
    s += '-';
    if (ref.chapterEnd !== c) s += `${ref.chapterEnd}${ref.verseEnd !== undefined ? '.' : ''}`;
    if (ref.verseEnd !== undefined) s += `${ref.verseEnd}`;
  }
  return s;
}

/** Canonical id of a reference: "John.3.16", "Gen.1.1-2.3", "John" (bare). */
export function refId(ref: Ref): string {
  return refLabel(ref);
}

function isContentWord(w: string): boolean {
  return /[\p{L}\p{N}]/u.test(w);
}

function adjacent(text: string, a: WordItem, b: WordItem): boolean {
  return text.slice(a.span[1], b.span[0]).trim() === '';
}

interface ClassifyClauseResult {
  clause: ClausePlan;
  why: string[];
}

function classifyClause(
  raw: RawClause,
  ctx: ClassifyContext,
  opts: SearchOptions,
  cache: MatchCache,
): ClassifyClauseResult {
  const why: string[] = [];
  const fuzzyOpt = opts.fuzzy !== false;
  let groups: Group[] | undefined;
  let kinds: EntityIndexType[] | undefined;
  let sort: ClausePlan['sort'] = opts.sort ?? 'relevance';
  const mentions: string[] = [];
  let filterScope: Scope | undefined;
  const extraWords: WordItem[] = [];
  const kindGroups: Group[] = [];

  const restrict = (to: Group[]): void => {
    groups = groups ? groups.filter((g) => to.includes(g)) : to;
  };

  // --- 1. filters -------------------------------------------------------------
  for (const f of raw.filters) {
    const show =
      f.source === 'sugar'
        ? `sugar "${raw.text.slice(f.span![0], f.span![1])}"`
        : `filter ${f.key}:${f.value}`;
    switch (f.key) {
      case 'in':
      case 'book': {
        const r = resolveScopeValue(f.value, ctx);
        if (!r) {
          why.push(`${show} → no book, testament or division named "${f.value}"; ignored`);
          break;
        }
        filterScope = mergeScopes(filterScope, r.scope);
        why.push(
          `${show} → scope ${describeScope(r.scope)}${r.ignored.length ? ` (ignored: ${r.ignored.join(', ')})` : ''}`,
        );
        break;
      }
      case 'person':
      case 'place':
      case 'event':
      case 'group': {
        const kind = KIND_OF_FILTER[f.key]!;
        kinds = [...new Set([...(kinds ?? []), kind])];
        kindGroups.push(GROUP_OF_KIND[kind]);
        if (f.value !== '') {
          let at = f.span ? f.span[0] + f.key.length + 1 : raw.text.length;
          for (const w of f.value.split(/\s+/).filter((x) => x !== '')) {
            extraWords.push({ kind: 'word', text: w, span: [at, at + w.length] });
            at += w.length + 1;
          }
        }
        why.push(
          `${show} → ${GROUP_OF_KIND[kind]} only${f.value ? `, entity query "${f.value}"` : ''}`,
        );
        break;
      }
      case 'type': {
        const wanted = f.value
          .split(',')
          .map((v) => GROUP_ALIASES[v.trim().toLowerCase()])
          .filter((g): g is Group => g !== undefined);
        if (wanted.length === 0) {
          why.push(`${show} → unknown group; ignored`);
          break;
        }
        restrict(wanted);
        why.push(`${show} → ${wanted.join(', ')} only`);
        break;
      }
      case 'mentions': {
        if (f.value === '') break;
        mentions.push(f.value);
        restrict(['verses']);
        why.push(`${show} → verses linked to "${f.value}"`);
        break;
      }
      case 'sort': {
        const v = f.value.toLowerCase();
        if (v === 'canonical' || v === 'relevance') {
          sort = v;
          why.push(`${show}`);
        } else why.push(`${show} → expected canonical|relevance; ignored`);
        break;
      }
      default:
        break;
    }
  }

  if (kindGroups.length > 0) restrict(kindGroups);

  // --- 2. references -----------------------------------------------------------
  const blankedFilters = blankSpans(raw.text, [
    ...raw.filters.filter((f) => f.span !== undefined).map((f) => f.span!),
    ...raw.quoted.map((q) => q.span),
  ]);
  const parsed = parseReference(blankedFilters, ctx.table);
  const consumedSpans: [number, number][] = [];
  for (const ref of parsed.refs) {
    const consumed = ref.confidence >= CONSUMED_REF_CONFIDENCE;
    const kindNote =
      ref.kind === 'book'
        ? ref.ambiguousWith
          ? `bare book, ambiguous with ${ref.ambiguousWith.map((e) => e.id).join(', ')}`
          : 'bare book'
        : ref.confidence < 1
          ? 'alternative reading'
          : 'explicit';
    why.push(
      `ref ${refId(ref)} ${kindNote} (${ref.confidence}) → passage${consumed ? '' : '; words kept for entities'}`,
    );
  }
  for (const [s, e] of parsed.consumed) {
    const refsHere = parsed.refs.filter((r) => r.matchedText === blankedFilters.slice(s, e));
    if (refsHere.some((r) => r.confidence >= CONSUMED_REF_CONFIDENCE)) consumedSpans.push([s, e]);
  }
  for (const err of parsed.errors) why.push(`ref error: ${err.message} → words kept as text`);
  const blanked = blankSpans(blankedFilters, consumedSpans);

  // --- words remaining ---------------------------------------------------------
  const words: WordItem[] = [
    ...raw.words.filter((w) => {
      const seg = blanked.slice(w.span[0], w.span[1]);
      return seg.trim() !== '' && isContentWord(seg);
    }),
    ...extraWords,
  ];
  const hasContent = words.length > 0 || raw.quoted.length > 0 || mentions.length > 0;
  // Only a consumed reference scopes the clause: a bare ambiguous book keeps
  // its word for the entities, and that word is the clause's content.
  const scopingRefs = parsed.refs.filter((r) => r.confidence >= CONSUMED_REF_CONFIDENCE);
  const refScope: Scope | undefined = hasContent && scopingRefs.length > 0 ? {} : undefined;
  if (refScope) {
    for (const ref of scopingRefs) addRefToScope(refScope, ref);
    why.push(`refs scope the verses: ${describeScope(refScope)}`);
  }
  const scope = mergeScopes(filterScope, refScope, opts.scope);

  // --- 3. entity n-grams -------------------------------------------------------
  const entities: EntitySpan[] = [];
  let i = 0;
  while (i < words.length) {
    let taken = 0;
    for (let n = Math.min(3, words.length - i); n >= 1; n--) {
      const run = words.slice(i, i + n);
      if (run.some((w, k) => k > 0 && !adjacent(raw.text, run[k - 1]!, w))) continue;
      const text = run.map((w) => w.text).join(' ');
      if (n === 1) {
        const lower = text.toLowerCase();
        if (lower.length < 2 || NAME_STOPWORDS.has(lower) || /^\d+$/.test(lower)) continue;
      }
      const fuzzy = spanFuzzy(n, text, fuzzyOpt);
      const hits = cachedMatch(cache, text, kinds, fuzzy, ctx.entities);
      if (hits.length === 0) continue;
      const strong = hits.filter((h) => STRONG_TIERS.has(h.tier));
      if (strong.length === 0 && n > 1) continue;
      const span: EntitySpan = {
        text,
        span: [run[0]!.span[0], run[n - 1]!.span[1]],
        words: n,
        weak: strong.length === 0,
        ids: strong.map((h) => h.id),
        ...(kinds ? { kinds } : {}),
      };
      entities.push(span);
      const top = hits[0]!;
      if (span.weak) {
        why.push(
          `entity "${text}" weak: best ${top.tier} ${top.id} (${top.raw.toFixed(3)}); ${n === 1 ? 'word stays' : 'words stay'} in the text query`,
        );
        taken = 1;
      } else {
        why.push(
          `entity "${text}" (${n} word${n === 1 ? '' : 's'}) → ${strong
            .slice(0, 3)
            .map((h) => `${h.id} ${h.tier}`)
            .join(
              ', ',
            )}${strong.length > 3 ? ` +${strong.length - 3}` : ''}; ${hits.length} hit${hits.length === 1 ? '' : 's'}`,
        );
        taken = n;
      }
      break;
    }
    i += taken || 1;
  }

  // --- 4. text terms -----------------------------------------------------------
  const textWords = words.filter((w) => !extraWords.includes(w)).map((w) => w.text);
  let textQuery = '';
  let phrase = false;
  if (textWords.length === 0 && raw.quoted.length === 1) {
    textQuery = `"${raw.quoted[0]!.text}"`;
    phrase = true;
  } else {
    textQuery = [...textWords, ...raw.quoted.map((q) => q.text)].join(' ');
  }
  why.push(
    textQuery
      ? `text ${phrase ? 'phrase ' : ''}"${textQuery.replace(/^"|"$/g, '')}"`
      : 'text: none',
  );

  // --- 5. group activation -----------------------------------------------------
  let active: Group[] = groups ?? [...DEFAULT_GROUPS];
  if (opts.groups) active = active.filter((g) => opts.groups!.includes(g));
  if (parsed.refs.length > 0 && !hasContent) {
    // A bare reference is a passage, not a text search (golden #18: "Acts 13" has no verse hits).
    active = active.filter((g) => g !== 'verses');
  }
  why.push(`groups: ${active.join(', ')}${groups || opts.groups ? '' : ' (default)'}`);

  const clause: ClausePlan = {
    text: raw.text,
    filters: raw.filters,
    ...(scope ? { scope } : {}),
    sort,
    refs: parsed.refs,
    refErrors: parsed.errors,
    refPassages: parsed.refs.length > 0,
    entities,
    textQuery,
    phrase,
    mentions,
    contentWords: words.length,
    groups: active,
  };
  return { clause, why };
}

export interface Classified {
  plan: QueryPlan;
  cache: MatchCache;
}

export function classify(
  query: string,
  ctx: ClassifyContext,
  opts: SearchOptions = {},
): Classified {
  const cache: MatchCache = new Map();
  const raw = parseQuery(query, { isScope: (words) => isScopeWords(words, ctx) });
  const why: string[] = [];
  const clauses: ClausePlan[] = [];
  raw.forEach((rc, k) => {
    const r = classifyClause(rc, ctx, opts, cache);
    clauses.push(r.clause);
    const prefix = raw.length > 1 ? `[${k + 1}] ` : '';
    for (const line of r.why) why.push(prefix + line);
  });
  if (raw.length > 1) why.unshift(`${raw.length} clauses joined by ";"`);
  if (raw.length === 0) why.push('empty query');
  return { plan: { query, clauses, why, author: 'classifier' }, cache };
}
