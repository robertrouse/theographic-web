/**
 * `in:` scope: what a value names, and the verse-id predicate a scope
 * becomes. A scope is the UNION of everything it names — books, a
 * testament, a division, and the id ranges of any references the clause
 * used as scope — applied during the text layer's postings traversal and to
 * every graph hop, so a scoped clause never sees an out-of-scope verse.
 */
import type { BookAliasTable } from '../refs/bookAliases.js';
import { normalizeAlias } from '../refs/normalize.js';
import type { Ref } from '../refs/types.js';
import type { Book, Testament, VerseId } from '../types.js';
import type { Scope } from './types.js';

const TESTAMENTS: Record<string, Testament> = {
  nt: 'NT',
  new: 'NT',
  'new testament': 'NT',
  ot: 'OT',
  old: 'OT',
  'old testament': 'OT',
};

export interface ScopeContext {
  table: BookAliasTable;
  books: readonly Book[];
}

/** Lower-cased division names present in the data. */
export function divisionsOf(books: readonly Book[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const b of books) m.set(normalizeAlias(b.division), b.division);
  return m;
}

/**
 * Resolve one `in:` value (comma-separated parts allowed) to a scope, or
 * undefined when no part is understood. A book alias counts only when it
 * may stand bare or has at least three letters, so "in so" is not Song of
 * Solomon. Unknown parts are reported so the plan can say what was ignored.
 */
export function resolveScopeValue(
  value: string,
  ctx: ScopeContext,
): { scope: Scope; ignored: string[] } | undefined {
  const divisions = divisionsOf(ctx.books);
  const scope: Scope = {};
  const ignored: string[] = [];
  let any = false;
  for (const raw of value.split(',')) {
    const part = normalizeAlias(raw);
    if (part === '') continue;
    const t = TESTAMENTS[part];
    if (t) {
      scope.testament = t;
      any = true;
      continue;
    }
    const osis = ctx.table.byAlias.get(part);
    if (
      osis !== undefined &&
      (ctx.table.bare.has(part) || part.replace(/[^a-z]/g, '').length >= 3)
    ) {
      scope.books = [...(scope.books ?? []), osis];
      any = true;
      continue;
    }
    const div = divisions.get(part);
    if (div !== undefined) {
      scope.division = div;
      any = true;
      continue;
    }
    ignored.push(raw.trim());
  }
  return any ? { scope, ignored } : undefined;
}

/** True when `words` name a scope — the "… in <scope>" sugar's test. */
export function isScopeWords(words: readonly string[], ctx: ScopeContext): boolean {
  const r = resolveScopeValue(words.join(' '), ctx);
  return r !== undefined && r.ignored.length === 0;
}

/** Add a reference to a scope: a whole book joins `books`, anything narrower joins `ranges`. */
export function addRefToScope(scope: Scope, ref: Ref): void {
  if (ref.kind === 'book') scope.books = [...(scope.books ?? []), ref.bookOsis];
  else scope.ranges = [...(scope.ranges ?? []), [ref.verseIdStart, ref.verseIdEnd]];
}

export function mergeScopes(...scopes: (Scope | undefined)[]): Scope | undefined {
  let out: Scope | undefined;
  for (const s of scopes) {
    if (!s) continue;
    out ??= {};
    if (s.books) out.books = [...new Set([...(out.books ?? []), ...s.books])];
    if (s.testament) out.testament = s.testament;
    if (s.division) out.division = s.division;
    if (s.ranges) out.ranges = [...(out.ranges ?? []), ...s.ranges];
  }
  return out;
}

/** Inclusive verse-id ranges a scope covers, merged and sorted. */
export function scopeRanges(scope: Scope, books: readonly Book[]): [VerseId, VerseId][] {
  const ranges: [VerseId, VerseId][] = [];
  const bookRange = (b: Book): [VerseId, VerseId] => [
    b.order * 1_000_000,
    b.order * 1_000_000 + 999_999,
  ];
  for (const osis of scope.books ?? []) {
    const b = books.find((x) => x.osis === osis);
    if (b) ranges.push(bookRange(b));
  }
  if (scope.testament)
    for (const b of books) if (b.testament === scope.testament) ranges.push(bookRange(b));
  if (scope.division)
    for (const b of books) if (b.division === scope.division) ranges.push(bookRange(b));
  for (const r of scope.ranges ?? []) ranges.push(r);
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [VerseId, VerseId][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

/** A predicate over verse ids for `scope`, or undefined for "everything". */
export function scopePredicate(
  scope: Scope | undefined,
  books: readonly Book[],
): ((verseId: VerseId) => boolean) | undefined {
  if (!scope) return undefined;
  const ranges = scopeRanges(scope, books);
  if (ranges.length === 0) return () => false;
  if (ranges.length === 1) {
    const [lo, hi] = ranges[0]!;
    return (id) => id >= lo && id <= hi;
  }
  return (id) => {
    let lo = 0;
    let hi = ranges.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const r = ranges[mid]!;
      if (id < r[0]) hi = mid - 1;
      else if (id > r[1]) lo = mid + 1;
      else return true;
    }
    return false;
  };
}

export function describeScope(scope: Scope): string {
  const parts: string[] = [];
  if (scope.testament) parts.push(scope.testament);
  if (scope.division) parts.push(scope.division);
  if (scope.books) parts.push(...scope.books);
  if (scope.ranges) parts.push(...scope.ranges.map(([a, b]) => `${a}–${b}`));
  return parts.join(', ');
}
