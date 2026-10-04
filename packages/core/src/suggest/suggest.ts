/**
 * Typeahead (docs/search-design.md §"Suggest"): synchronous, core layer
 * only, never touches verse text. Order of sources is the design's:
 *
 *   1. book aliases and partial-reference completions ("Jn 3" → John 3)
 *   2. entity prefix range — binary search over the sorted `names` table,
 *      at most `READ` entries read, ranked exact → prefix ratio → prominence
 *   3. host-supplied recent queries (prefix ≥ 3)
 *   4. a Damerau-Levenshtein ≤ 1 prefix fallback, only when fewer than 3
 *      suggestions were found and the prefix has ≥ 4 chars
 *
 * Triggers at 2 characters. Dedupe by id, sublabels from the index, limit 8,
 * and people sharing one name are collapsed to 3 so eight Simons do not fill
 * the list. Deterministic: ties break on label then id.
 */
import { damerauLevenshtein } from '../damerau.js';
import { ENTITY_GROUP, prefixRange, type EntityIndex } from '../entities/entityIndex.js';
import { ENTITY_TIERS } from '../entities/match.js';
import { normalizeName } from '../entities/normalizeName.js';
import type { EntityIndexRow } from '../entities/types.js';
import { aliasesWithPrefix, type BookAliasTable } from '../refs/bookAliases.js';
import { normalizeAlias } from '../refs/normalize.js';
import { parseReference } from '../refs/parseReference.js';
import type { Ref } from '../refs/types.js';
import type { Book } from '../types.js';
import type { Suggestion, SuggestOptions } from '../query/types.js';

export const SUGGEST = {
  trigger: 2,
  limit: 8,
  /** Entries of `names` read per prefix. */
  read: 50,
  recentMinPrefix: 3,
  fuzzyMinPrefix: 4,
  fuzzyBelowResults: 3,
  samePeopleCap: 3,
} as const;

export interface SuggestContext {
  table: BookAliasTable;
  entities: EntityIndex;
  books: readonly Book[];
}

function refText(ref: Ref, book: Book): string {
  if (ref.kind === 'book') return book.name;
  let s = `${book.name} ${ref.chapterStart}`;
  if (ref.verseStart !== undefined) s += `:${ref.verseStart}`;
  if (ref.chapterEnd !== ref.chapterStart) {
    s += `-${ref.chapterEnd}`;
    if (ref.verseEnd !== undefined) s += `:${ref.verseEnd}`;
  } else if (ref.verseEnd !== undefined && ref.verseEnd !== ref.verseStart) s += `-${ref.verseEnd}`;
  return s;
}

function rowScore(row: EntityIndexRow, matched: string, q: string, index: EntityIndex): number {
  const T = ENTITY_TIERS;
  const band = matched === q ? T.exact : T.prefix + (T.prefixSpan * q.length) / matched.length;
  const prom = index.logMaxVc > 0 ? Math.log(1 + row.vc) / index.logMaxVc : 0;
  return band + T.prom * prom;
}

function entitySuggestion(row: EntityIndexRow, score: number, why: string): Suggestion {
  return {
    kind: 'entity',
    label: row.name,
    sublabel: row.sub,
    query: row.name,
    id: row.id,
    group: ENTITY_GROUP[row.t],
    score,
    why,
  };
}

export function suggest(
  prefix: string,
  ctx: SuggestContext,
  opts: SuggestOptions = {},
): Suggestion[] {
  const raw = prefix.trim();
  if (raw.length < SUGGEST.trigger) return [];
  const limit = opts.limit ?? SUGGEST.limit;
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const push = (s: Suggestion): void => {
    const key = s.id ?? `${s.kind}:${s.query.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };

  // --- 1. books and references ------------------------------------------------
  const parsed = parseReference(raw, ctx.table);
  const bookById = ctx.table.books;
  for (const ref of parsed.refs) {
    if (ref.confidence < 0.9 && ref.kind !== 'book') continue;
    const book = bookById.get(ref.bookOsis)!;
    const text = refText(ref, book);
    push({
      kind: ref.kind === 'book' ? 'book' : 'reference',
      label: text,
      sublabel:
        ref.kind === 'book' ? `${book.division} · ${book.chapterCount} chapters` : book.name,
      query: text,
      id: ref.kind === 'book' ? book.osis : `${book.osis}:${text}`,
      group: 'passages',
      score: ref.confidence >= 1 ? 1 : 0.9,
      why: `reference ${ref.kind}`,
    });
  }
  if (parsed.refs.length === 0) {
    const normalized = normalizeAlias(raw);
    const seenBooks = new Set<string>();
    for (const e of aliasesWithPrefix(ctx.table, normalized)) {
      if (seenBooks.has(e.osis)) continue;
      if (!e.bare && normalized.replace(/[^a-z]/g, '').length < 3) continue;
      seenBooks.add(e.osis);
      const book = bookById.get(e.osis)!;
      push({
        kind: 'book',
        label: book.name,
        sublabel: `${book.division} · ${book.chapterCount} chapters`,
        query: book.name,
        id: book.osis,
        group: 'passages',
        score: 0.8 + (0.1 * normalized.length) / Math.max(normalized.length, e.alias.length),
        why: `book alias "${e.alias}" (${e.source})`,
      });
    }
  }

  // --- 2. entity prefix range --------------------------------------------------
  const q = normalizeName(raw);
  const entityHits: { row: EntityIndexRow; score: number; why: string }[] = [];
  if (q !== '') {
    const [lo, hi] = prefixRange(ctx.entities, q);
    const best = new Map<number, { score: number; why: string }>();
    for (let i = lo; i < hi && i - lo < SUGGEST.read; i++) {
      const [name, rowIndex, aliasIndex] = ctx.entities.names[i]!;
      const row = ctx.entities.rows[rowIndex]!;
      if (row.t === 'b') continue; // books came through the alias table above
      const score = rowScore(row, name, q, ctx.entities);
      const have = best.get(rowIndex);
      if (!have || have.score < score) {
        best.set(rowIndex, {
          score,
          why: `${name === q ? 'exact' : 'prefix'} ${aliasIndex < 0 ? 'name' : 'alias'} "${name}"`,
        });
      }
    }
    for (const [rowIndex, s] of best) {
      entityHits.push({ row: ctx.entities.rows[rowIndex]!, score: s.score, why: s.why });
    }
    entityHits.sort(
      (a, b) =>
        b.score - a.score ||
        (a.row.name < b.row.name ? -1 : a.row.name > b.row.name ? 1 : 0) ||
        (a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0),
    );
    const perName = new Map<string, number>();
    for (const h of entityHits) {
      if (h.row.t === 'p') {
        const n = perName.get(h.row.norm) ?? 0;
        if (n >= SUGGEST.samePeopleCap) continue;
        perName.set(h.row.norm, n + 1);
      }
      push(entitySuggestion(h.row, h.score, h.why));
    }
  }

  // --- 3. recent ----------------------------------------------------------------
  if (opts.recent && raw.length >= SUGGEST.recentMinPrefix) {
    const lower = raw.toLowerCase();
    for (const r of opts.recent) {
      if (r.toLowerCase().startsWith(lower) && r.toLowerCase() !== lower) {
        push({ kind: 'recent', label: r, query: r, score: 0.5, why: 'recent query' });
      }
    }
  }

  // --- 4. fuzzy prefix fallback --------------------------------------------------
  if (out.length < SUGGEST.fuzzyBelowResults && q.length >= SUGGEST.fuzzyMinPrefix) {
    const names = ctx.entities.names;
    const found = new Map<number, { score: number; why: string }>();
    const q0 = q.charCodeAt(0);
    for (let i = 0; i < names.length; i++) {
      const [name, rowIndex] = names[i]!;
      if (name.length < q.length) continue;
      // A typo in the first letter is rare and the check halves the work.
      if (name.charCodeAt(0) !== q0 && name.charCodeAt(1) !== q0) continue;
      const head = name.slice(0, q.length);
      if (head === q) continue; // an exact prefix was already read above
      if (damerauLevenshtein(q, head, 1) > 1) continue;
      const row = ctx.entities.rows[rowIndex]!;
      if (row.t === 'b') continue;
      const score =
        ENTITY_TIERS.fuzzy1 +
        (ENTITY_TIERS.prom * Math.log(1 + row.vc)) / (ctx.entities.logMaxVc || 1);
      const have = found.get(rowIndex);
      if (!have || have.score < score)
        found.set(rowIndex, { score, why: `fuzzy1 prefix "${head}" of "${name}"` });
    }
    const list = [...found]
      .map(([rowIndex, s]) => ({ row: ctx.entities.rows[rowIndex]!, ...s }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          (a.row.name < b.row.name ? -1 : a.row.name > b.row.name ? 1 : 0) ||
          (a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0),
      );
    for (const h of list) push(entitySuggestion(h.row, h.score, h.why));
  }

  return out.slice(0, limit);
}
