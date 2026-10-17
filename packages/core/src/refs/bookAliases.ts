/**
 * Book alias table: every spelling a reader might use for a book, mapped to
 * its OSIS id. Built from `books.json` (osis, name, short, slug, unambiguous
 * 3/4-letter prefixes of the name) plus the curated list in `aliases.json`.
 *
 * Throws if one alias would reach two books — that is a data error to fix at
 * the source, never something to resolve by insertion order.
 */
import type { Book, BookOsis } from '../types.js';
import { AMBIGUOUS_BOOK_ENTITIES } from './ambiguous.js';
import curated from './aliases.json' with { type: 'json' };
import { ORDINALS, normalizeAlias } from './normalize.js';
import type { AmbiguousEntity } from './types.js';

export type AliasSource = 'osis' | 'name' | 'short' | 'slug' | 'prefix' | 'curated' | 'ordinal';

export interface BookAliasEntry {
  /** Normalized key, e.g. "1 sam", "song of songs". */
  alias: string;
  osis: BookOsis;
  source: AliasSource;
  /**
   * May stand alone as a whole-book reference ("John", "Ruth"). False for
   * short forms and prefixes ("Jn", "gene"), which need a chapter after them
   * — otherwise "so", "is" and "am" would read as Song, Isaiah and Amos.
   */
  bare: boolean;
}

export interface BookAliasTable {
  /** Normalized alias → OSIS. */
  byAlias: Map<string, BookOsis>;
  /** Every entry, sorted by alias — binary-searchable for prefix suggestions. */
  entries: BookAliasEntry[];
  /** Aliases that may stand alone as a book reference. */
  bare: Set<string>;
  books: Map<BookOsis, Book>;
  /** Longest alias in whitespace-separated words; bounds the scanner's lookahead. */
  maxWords: number;
  /** Books whose name is also an entity name (invariant 5: both readings are returned). */
  ambiguous: Map<BookOsis, AmbiguousEntity[]>;
}

function ordinalVariants(alias: string): string[] {
  const m = /^([123]) (.+)$/.exec(alias);
  if (!m) return [];
  const [, n, rest] = m;
  return Object.entries(ORDINALS)
    .filter(([word, value]) => value === n && word !== n)
    .map(([word]) => `${word} ${rest}`);
}

function letters(alias: string): number {
  return alias.replace(/[^a-z]/g, '').length;
}

/**
 * Unambiguous 3- and 4-letter prefixes of each book name ("gene" → Gen,
 * "1 samu" → 1Sam). A prefix shared by two names ("phi": Philippians and
 * Philemon; "jud": Judges and Jude) is dropped, not guessed.
 */
function namePrefixes(books: Book[]): Map<string, BookOsis> {
  const owners = new Map<string, Set<BookOsis>>();
  for (const b of books) {
    const name = normalizeAlias(b.name);
    const m = /^(?:([123]) )?([a-z]+)/.exec(name);
    if (!m) continue;
    const [, ordinal, word] = m;
    for (const len of [3, 4]) {
      if (word!.length <= len) continue; // the whole word is already the name
      const key = (ordinal ? `${ordinal} ` : '') + word!.slice(0, len);
      let set = owners.get(key);
      if (!set) owners.set(key, (set = new Set()));
      set.add(b.osis);
    }
  }
  const out = new Map<string, BookOsis>();
  for (const [key, set] of owners) if (set.size === 1) out.set(key, [...set][0]!);
  return out;
}

export interface BuildBookAliasTableOptions {
  /**
   * Book → entities sharing its name. Defaults to the constant derived from
   * `entities.json` (`refs/ambiguous.ts`); CP-03 passes the live entity index.
   */
  ambiguous?: Map<BookOsis, AmbiguousEntity[]>;
}

export function buildBookAliasTable(
  books: Book[],
  options: BuildBookAliasTableOptions = {},
): BookAliasTable {
  const byAlias = new Map<string, BookOsis>();
  const entries: BookAliasEntry[] = [];
  const bare = new Set<string>();
  const bookMap = new Map<BookOsis, Book>();

  const add = (raw: string, osis: BookOsis, source: AliasSource, isBare: boolean): void => {
    const alias = normalizeAlias(raw);
    if (!alias) throw new Error(`empty alias for ${osis} from ${source}: ${JSON.stringify(raw)}`);
    const existing = byAlias.get(alias);
    if (existing !== undefined) {
      if (existing !== osis) {
        throw new Error(`alias "${alias}" maps to both ${existing} and ${osis} (via ${source})`);
      }
      // Same book, already listed: keep the first entry but let the more
      // permissive `bare` win, so "Gen" the osis and "gen" the curated agree.
      if (isBare && !bare.has(alias)) {
        bare.add(alias);
        const e = entries.find((x) => x.alias === alias);
        if (e) e.bare = true;
      }
      return;
    }
    byAlias.set(alias, osis);
    entries.push({ alias, osis, source, bare: isBare });
    if (isBare) bare.add(alias);
    for (const variant of ordinalVariants(alias)) {
      if (byAlias.has(variant)) continue;
      byAlias.set(variant, osis);
      entries.push({ alias: variant, osis, source: 'ordinal', bare: isBare });
      if (isBare) bare.add(variant);
    }
  };

  for (const b of books) {
    bookMap.set(b.osis, b);
    add(b.osis, b.osis, 'osis', true);
    add(b.name, b.osis, 'name', true);
    add(b.slug, b.osis, 'slug', true);
    add(b.short, b.osis, 'short', false);
  }
  const curatedAliases = curated as unknown as Record<string, string[] | string>;
  for (const [osis, list] of Object.entries(curatedAliases)) {
    if (osis.startsWith('$')) continue;
    if (!bookMap.has(osis)) throw new Error(`aliases.json: unknown book ${osis}`);
    for (const raw of list as string[]) {
      const alias = normalizeAlias(raw);
      add(raw, osis, 'curated', letters(alias) >= 4);
    }
  }
  for (const [prefix, osis] of namePrefixes(books)) {
    if (byAlias.has(prefix)) continue; // an explicit alias already covers it
    add(prefix, osis, 'prefix', false);
  }

  entries.sort((a, b) => (a.alias < b.alias ? -1 : a.alias > b.alias ? 1 : 0));
  const maxWords = Math.max(...entries.map((e) => e.alias.split(' ').length));
  const ambiguous = options.ambiguous ?? defaultAmbiguity(bookMap);
  return { byAlias, entries, bare, books: bookMap, maxWords, ambiguous };
}

function defaultAmbiguity(books: Map<BookOsis, Book>): Map<BookOsis, AmbiguousEntity[]> {
  const out = new Map<BookOsis, AmbiguousEntity[]>();
  for (const [osis, list] of Object.entries(AMBIGUOUS_BOOK_ENTITIES)) {
    if (books.has(osis)) out.set(osis, list);
  }
  return out;
}

/**
 * Entries whose alias starts with `prefix` (normalized), in alias order.
 * Binary search over the sorted array; for suggest() in CP-05.
 */
export function aliasesWithPrefix(table: BookAliasTable, prefix: string): BookAliasEntry[] {
  const p = normalizeAlias(prefix);
  if (!p) return [];
  const { entries } = table;
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid]!.alias < p) lo = mid + 1;
    else hi = mid;
  }
  const out: BookAliasEntry[] = [];
  for (let i = lo; i < entries.length && entries[i]!.alias.startsWith(p); i++)
    out.push(entries[i]!);
  return out;
}
