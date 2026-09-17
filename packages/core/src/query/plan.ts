/**
 * Executes a `QueryPlan` against whatever layers are loaded and returns a
 * `SearchResult`. Pure: same plan, same options, same index bytes → same
 * hits in the same order (invariant 9). Executes any plan — the rule
 * classifier's or a rewriter's — the same way.
 *
 * Per clause:
 *   passages  one pinned hit per reference (unless it came in as scope sugar)
 *   entities  the span's entity hits, normalized by `merge.entityScore`
 *   events    title matches from the spans, plus participants ∩ locations
 *             through the graph when the clause named people and places
 *   verses    text search over the clause words, scoped; ∪ graph hops from
 *             every strong span (and `mentions:`); each verse scored by the
 *             best band it earned (`merge.verseBand`), then signals, then
 *             sorted; snippets and `why` only for the returned window
 * Clauses joined by ";" are unioned per group, higher score winning a tie
 * on id. Layers that are not loaded contribute nothing and clear `ready`.
 */
import type { EntityIndex } from '../entities/entityIndex.js';
import type { EntityHit } from '../entities/match.js';
import type { EntityIndexRow } from '../entities/types.js';
import type { Graph } from '../graph/adjacency.js';
import { verseIdParts } from '../ids.js';
import type { BookAliasTable } from '../refs/bookAliases.js';
import type { Ref } from '../refs/types.js';
import { verseCountInRef } from '../refs/verseIds.js';
import { searchText, verseDetail, type RankedVerse } from '../text/bm25.js';
import type { ExpandedWord } from '../text/expand.js';
import type { TextIndex } from '../text/index.js';
import type { Book } from '../types.js';
import { cachedMatch, refId, spanFuzzy, STRONG_TIERS, type MatchCache } from './classify.js';
import {
  applySignals,
  compareAcrossGroups,
  compareInGroup,
  entityScore,
  MERGE,
  passageScore,
  toHit,
  verseBand,
  type Scored,
  type VerseEvidence,
} from './merge.js';
import { scopePredicate } from './scope.js';
import {
  GROUP_ORDER,
  type ClausePlan,
  type Group,
  type GroupResult,
  type QueryPlan,
  type SearchOptions,
  type SearchResult,
} from './types.js';

export interface ExecuteContext {
  table: BookAliasTable;
  entities: EntityIndex;
  books: readonly Book[];
  text?: TextIndex;
  graph?: Graph;
}

export const DEFAULT_LIMIT = 10;

const FAR = Number.MAX_SAFE_INTEGER;

declare const performance: { now(): number } | undefined;
function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

type GroupMap = Map<Group, Map<string, Scored>>;

function keyOf(id: string | number): string {
  return typeof id === 'number' ? `v${id}` : id;
}

/** Add a hit; on a duplicate keep the higher score and union the explanations. */
function add(groups: GroupMap, s: Scored): void {
  let g = groups.get(s.group);
  if (!g) groups.set(s.group, (g = new Map()));
  const k = keyOf(s.id);
  const have = g.get(k);
  if (!have) {
    g.set(k, s);
    return;
  }
  // A pinned hit (a parsed reference) keeps its own score; otherwise the
  // higher score wins. Explanations are unioned either way.
  const keep =
    have.pinned !== s.pinned ? (have.pinned ? have : s) : have.score >= s.score ? have : s;
  const other = keep === have ? s : have;
  if (other.why && other.why.length) {
    keep.why = [...new Set([...(keep.why ?? []), ...other.why])];
  }
  g.set(k, keep);
}

function bookLookup(books: readonly Book[]): {
  byOsis: Map<string, Book>;
  byOrder: Map<number, Book>;
} {
  const byOsis = new Map<string, Book>();
  const byOrder = new Map<number, Book>();
  for (const b of books) {
    byOsis.set(b.osis, b);
    byOrder.set(b.order, b);
  }
  return { byOsis, byOrder };
}

function refLabel(ref: Ref, book: Book): string {
  if (ref.kind === 'book') return book.name;
  let s = `${book.name} ${ref.chapterStart}`;
  if (ref.verseStart !== undefined) s += `:${ref.verseStart}`;
  if (ref.chapterEnd !== ref.chapterStart) {
    s += `–${ref.chapterEnd}`;
    if (ref.verseEnd !== undefined) s += `:${ref.verseEnd}`;
  } else if (ref.verseEnd !== undefined && ref.verseEnd !== ref.verseStart) {
    s += `–${ref.verseEnd}`;
  }
  return s;
}

function verseLabel(id: number, byOrder: Map<number, Book>): string {
  const { book, c, v } = verseIdParts(id);
  const b = byOrder.get(book);
  return `${b ? b.name : book} ${c}:${v}`;
}

interface HopSpan {
  /** Entity ids that hop (strong candidates). */
  ids: string[];
  label: string;
}

function entityToScored(
  h: EntityHit,
  rows: EntityIndexRow[],
  words: number,
  contentWords: number,
  explain: boolean,
): Scored {
  const factor = entityScore(h.raw, words, contentWords) / Math.min(1, h.raw);
  const score = entityScore(h.raw, words, contentWords);
  const why = explain
    ? [
        ...h.why,
        factor < 1
          ? `span covers ${words}/${contentWords} words → ×${factor.toFixed(3)} = ${score.toFixed(3)}`
          : `merge min(1, raw) = ${score.toFixed(3)}`,
      ]
    : undefined;
  const row = rows[h.row]!;
  return {
    group: h.group,
    id: h.id,
    score,
    raw: h.raw,
    label: h.label,
    sublabel: h.sublabel,
    ...(why ? { why } : {}),
    pinned: false,
    canonical: row.order ?? FAR,
  };
}

function executeClause(
  clause: ClausePlan,
  ctx: ExecuteContext,
  opts: SearchOptions,
  cache: MatchCache,
  groups: GroupMap,
  totals: Map<Group, number>,
  timings: Record<string, number>,
  notes: string[],
): void {
  const explain = opts.explain !== false;
  const fuzzy = opts.fuzzy !== false;
  const limit = opts.limitPerGroup ?? DEFAULT_LIMIT;
  const active = new Set(clause.groups);
  const { byOsis, byOrder } = bookLookup(ctx.books);
  const inScope = scopePredicate(clause.scope, ctx.books);
  const rows = ctx.entities.rows;

  // --- passages ---------------------------------------------------------------
  let t = now();
  if (active.has('passages') && clause.refPassages) {
    for (const ref of clause.refs) {
      const book = byOsis.get(ref.bookOsis);
      if (!book) continue;
      const score = passageScore(ref);
      const s: Scored = {
        group: 'passages',
        id: refId(ref),
        score,
        raw: ref.confidence,
        label: refLabel(ref, book),
        ref,
        pinned: true,
        canonical: ref.verseIdStart,
      };
      if (ref.kind === 'book') s.sublabel = `${book.division} · ${book.chapterCount} chapters`;
      else {
        const n = verseCountInRef(ref, byOsis);
        s.sublabel = `${book.name} · ${n} verse${n === 1 ? '' : 's'}`;
      }
      if (ref.kind === 'verse' && ctx.text) {
        const doc = ctx.text.docIndexOf(ref.verseIdStart);
        if (doc >= 0) s.snippet = { text: ctx.text.textAt(doc), highlights: [] };
      }
      if (explain) {
        const how =
          ref.kind === 'book'
            ? ref.ambiguousWith
              ? `bare book that is also an entity name → pinned ${score}`
              : `bare book → pinned ${score}`
            : ref.confidence >= 1
              ? `explicit reference → pinned ${score}`
              : `alternative reading → pinned ${score}`;
        s.why = [`reference "${ref.matchedText}" = ${refId(ref)}: ${how}`];
      }
      add(groups, s);
    }
  }
  timings['passages'] = (timings['passages'] ?? 0) + (now() - t);

  // --- entities ---------------------------------------------------------------
  t = now();
  const hopSpans: HopSpan[] = [];
  const people = new Set<string>();
  const places = new Set<string>();
  for (const span of clause.entities) {
    const hits = cachedMatch(
      cache,
      span.text,
      span.kinds,
      spanFuzzy(span.words, span.text, fuzzy),
      ctx.entities,
    );
    for (const h of hits) {
      if (!active.has(h.group)) continue;
      add(groups, entityToScored(h, rows, span.words, clause.contentWords, explain));
    }
    if (!span.weak) {
      const ids = span.ids.slice(0, MERGE.hopCandidates);
      hopSpans.push({ ids, label: span.text });
      for (const id of ids) {
        const row = rows[ctx.entities.byId.get(id) ?? -1];
        if (row?.t === 'p') people.add(id);
        else if (row?.t === 'l') places.add(id);
      }
    }
  }
  for (const m of clause.mentions) {
    const hits = cachedMatch(cache, m, undefined, spanFuzzy(1, m, fuzzy), ctx.entities);
    const ids = hits
      .filter((h) => STRONG_TIERS.has(h.tier))
      .slice(0, MERGE.hopCandidates)
      .map((h) => h.id);
    if (ids.length === 0) notes.push(`mentions:${m} names no entity exactly; nothing to hop from`);
    else hopSpans.push({ ids, label: m });
  }
  timings['entities'] = (timings['entities'] ?? 0) + (now() - t);

  // --- events through the graph -----------------------------------------------
  t = now();
  if (active.has('events') && ctx.graph && people.size > 0 && places.size > 0) {
    const ps = [...people];
    const ls = [...places];
    for (const slug of ctx.graph.eventsFor({ people: ps, places: ls })) {
      const ri = ctx.entities.byId.get(slug);
      if (ri === undefined) continue;
      const row = rows[ri]!;
      add(groups, {
        group: 'events',
        id: slug,
        score: MERGE.eventByGraph,
        raw: MERGE.eventByGraph,
        label: row.name,
        sublabel: row.sub,
        ...(explain
          ? {
              why: [
                `graph: participant ∈ {${ps.join(', ')}} ∧ location ∈ {${ls.join(', ')}} → ${MERGE.eventByGraph}`,
              ],
            }
          : {}),
        pinned: false,
        canonical: row.order ?? FAR,
      });
    }
  }
  timings['events'] = (timings['events'] ?? 0) + (now() - t);

  // --- verses -----------------------------------------------------------------
  t = now();
  if (active.has('verses') && ctx.text) {
    const text = ctx.text;
    let words: readonly ExpandedWord[] = [];
    let ranked: RankedVerse[] = [];
    let top = 0;
    if (clause.textQuery !== '') {
      const r = searchText(clause.textQuery, text, {
        ...(inScope ? { scope: inScope } : {}),
        limit: 0,
        ranked: true,
        fuzzy,
        ...(clause.phrase ? { phrase: true } : {}),
      });
      words = r.words;
      ranked = r.ranked ?? [];
      top = ranked[0]?.score ?? 0;
    }

    // Graph hops: verse → which spans link it, and through which entities.
    const linked = new Map<number, { spans: number; via: string[] }>();
    if (ctx.graph && hopSpans.length > 0) {
      hopSpans.forEach((span, k) => {
        const bit = 1 << k;
        for (const id of span.ids) {
          for (const v of ctx.graph!.mentions(id)) {
            if (inScope && !inScope(v)) continue;
            let e = linked.get(v);
            if (!e) linked.set(v, (e = { spans: 0, via: [] }));
            if (!(e.spans & bit)) e.spans |= bit;
            e.via.push(id);
          }
        }
      });
    } else if (!ctx.graph && hopSpans.length > 0) {
      notes.push('graph layer not loaded: no mention hops');
    }

    const popcount = (x: number): number => {
      let n = 0;
      while (x) {
        x &= x - 1;
        n++;
      }
      return n;
    };

    const canonical = clause.sort === 'canonical' || opts.sort === 'canonical';
    const signals = (opts.signals ?? []).filter((s) => s.layer === 'verses');
    const fastPath = linked.size === 0 && signals.length === 0 && !canonical;

    interface Cand {
      id: number;
      lex: number;
      evidence: VerseEvidence;
      via: string[];
    }
    let chosen: Cand[];
    let total: number;

    if (fastPath) {
      // Text only: the text ranking is the verse ranking (a monotone map), so
      // only the returned window is normalized. This is the all-weak "the" path.
      total = ranked.length;
      chosen = ranked.slice(0, limit).map((r) => ({
        id: r.id,
        lex: 0,
        evidence: { spans: 0, text: { score: r.score, top, cov: r.cov, phrase: r.phrase } },
        via: [],
      }));
      for (const c of chosen) c.lex = verseBand(c.evidence).score;
    } else {
      const byId = new Map<number, RankedVerse>();
      for (const r of ranked) byId.set(r.id, r);
      const cands: Cand[] = [];
      for (const r of ranked) {
        const l = linked.get(r.id);
        const evidence: VerseEvidence = {
          spans: l ? popcount(l.spans) : 0,
          text: { score: r.score, top, cov: r.cov, phrase: r.phrase },
        };
        cands.push({ id: r.id, lex: verseBand(evidence).score, evidence, via: l ? l.via : [] });
      }
      for (const [id, l] of linked) {
        if (byId.has(id)) continue;
        const evidence: VerseEvidence = { spans: popcount(l.spans) };
        cands.push({ id, lex: verseBand(evidence).score, evidence, via: l.via });
      }
      const final = applySignals(cands, signals, { query: clause.text });
      cands.forEach((c, i) => {
        c.lex = final[i]!;
      });
      cands.sort(canonical ? (a, b) => a.id - b.id : (a, b) => b.lex - a.lex || a.id - b.id);
      total = cands.length;
      chosen = cands.slice(0, limit);
    }

    totals.set('verses', (totals.get('verses') ?? 0) + total);
    for (const c of chosen) {
      const detail = verseDetail(text, words, c.id);
      const band = verseBand(c.evidence);
      const why: string[] = [];
      if (explain) {
        why.push(band.why);
        if (c.via.length) {
          const via = [...new Set(c.via)];
          why.push(
            `${c.evidence.spans >= 2 ? 'co-mention' : 'mention'}: ${via.join(' ∩ ')}${
              c.evidence.spans >= 2 ? ` (${c.evidence.spans} spans)` : ''
            }`,
          );
        }
        for (const line of detail.why) why.push(`text: ${line}`);
        if (signals.length)
          why.push(`signals: ${signals.map((s) => s.name).join(', ')} λ ${MERGE.signalLambda}`);
      }
      add(groups, {
        group: 'verses',
        id: c.id,
        score: c.lex,
        raw: c.evidence.text?.score ?? 0,
        label: verseLabel(c.id, byOrder),
        snippet: detail.snippet,
        ...(explain ? { why } : {}),
        pinned: false,
        canonical: c.id,
      });
    }
  }
  timings['verses'] = (timings['verses'] ?? 0) + (now() - t);
}

export function executePlan(
  plan: QueryPlan,
  ctx: ExecuteContext,
  opts: SearchOptions = {},
  cache: MatchCache = new Map(),
): SearchResult {
  const t0 = now();
  const timings: Record<string, number> = {};
  const groups: GroupMap = new Map();
  const totals = new Map<Group, number>();
  const notes: string[] = [];
  for (const clause of plan.clauses) {
    executeClause(clause, ctx, opts, cache, groups, totals, timings, notes);
  }

  const t = now();
  const limit = opts.limitPerGroup ?? DEFAULT_LIMIT;
  const result: Record<Group, GroupResult> = {} as Record<Group, GroupResult>;
  const all: Scored[] = [];
  for (const g of GROUP_ORDER) {
    const list = [...(groups.get(g)?.values() ?? [])].sort(compareInGroup);
    const hits = g === 'verses' ? list : list.slice(0, limit);
    // Verses were already windowed per clause; their total is the candidate count.
    const total = g === 'verses' ? Math.max(totals.get('verses') ?? 0, list.length) : list.length;
    result[g] = { total, hits: hits.slice(0, limit).map(toHit) };
    all.push(...hits.slice(0, limit));
  }
  all.sort(compareAcrossGroups);
  timings['merge'] = now() - t;
  timings['total'] = now() - t0;

  const ready: Record<Group, boolean> = {
    passages: true,
    people: true,
    places: true,
    events: true,
    groups: true,
    verses: ctx.text !== undefined,
    topics: false,
  };
  const outPlan: QueryPlan =
    notes.length === 0 ? plan : { ...plan, why: [...plan.why, ...notes.map((n) => `note: ${n}`)] };
  return { query: plan.query, plan: outPlan, groups: result, all: all.map(toHit), timings, ready };
}
