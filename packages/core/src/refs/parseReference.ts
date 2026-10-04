/**
 * Scripture-reference scanner. Finds every reference in a query string and
 * validates it against the book's chapter and verse counts.
 *
 * Grammar (docs/search-design.md §"Query grammar"):
 *
 *   reference ::= ordinal? bookAlias (chapter (':' verses)? ('-' chapterEnd)?)?
 *   verses    ::= verse ('-' (chapter ':')? verse)? (',' verse)*
 *
 * plus the spellings people actually type: "Jn3:16" (alias glued to digits),
 * "Gen.1.1" (OSIS dots), "3:16–18" (en dash), "3:16f" / "3:16ff" (next verse /
 * to end of chapter), "Gen 1ff", "Ps 23:1-3,5". `;` and `,` separate
 * references; the scanner simply resumes after each one.
 *
 * Rules that are not obvious from the grammar:
 * - Out of range is an error, never a clamp, and an erroring reference is not
 *   consumed at all — "John 99" leaves "John 99" for the entity classifier
 *   (invariant 5).
 * - A bare book name that is also an entity name gets confidence 0.7 and
 *   `ambiguousWith`; the classifier returns both readings.
 * - Two-letter aliases and generated prefixes need a chapter after them
 *   ("Jn 3" yes, bare "so" no). See `BookAliasEntry.bare`.
 * - In a single-chapter book a lone number is a verse: "Phm 4" → Phlm.1.4.
 *   "Phm 1" is genuinely ambiguous, so it also emits the chapter reading at
 *   confidence 0.5.
 * - A comma list emits one Ref per item; they share `matchedText` and one
 *   consumed span. The `verseList` kind is reserved for a host that wants to
 *   collapse them; the parser itself never emits it.
 */
import { makeVerseId } from '../ids.js';
import type { Book, BookOsis } from '../types.js';
import type { BookAliasTable } from './bookAliases.js';
import type { ParseError, ParseErrorReason, ParseReferenceResult, Ref, RefKind } from './types.js';
import { verseIdRange, versesInChapter } from './verseIds.js';

// ------------------------------------------------------------------ tokens

interface Tok {
  kind: 'word' | 'num' | 'punct';
  /** Lower-cased NFKC text; dashes folded to "-", full-width colon to ":". */
  norm: string;
  start: number;
  end: number;
}

const TOKEN = /[0-9]+(?:st|nd|rd)(?![\p{L}])|\p{L}+|[0-9]+|\S/giu;
const PUNCT_FOLD: Record<string, string> = {
  '–': '-', // en dash
  '—': '-', // em dash
  '−': '-', // minus sign
  '‒': '-', // figure dash
  '：': ':', // full-width colon
  '，': ',', // full-width comma
  '；': ';', // full-width semicolon
};

function tokenize(input: string): Tok[] {
  const out: Tok[] = [];
  for (const m of input.matchAll(TOKEN)) {
    const raw = m[0];
    const start = m.index;
    const end = start + raw.length;
    const norm = raw.normalize('NFKC').toLowerCase();
    if (/^[0-9]/.test(norm)) out.push({ kind: 'num', norm, start, end });
    else if (/^\p{L}/u.test(norm)) out.push({ kind: 'word', norm, start, end });
    else out.push({ kind: 'punct', norm: PUNCT_FOLD[norm] ?? norm, start, end });
  }
  return out;
}

// ----------------------------------------------------------------- scanner

interface AliasMatch {
  osis: BookOsis;
  alias: string;
  /** Index of the token after the alias. */
  next: number;
}

interface Item {
  c1: number;
  v1?: number;
  c2: number;
  v2?: number;
}

class Scanner {
  private readonly toks: Tok[];
  private readonly refs: Ref[] = [];
  private readonly consumed: [number, number][] = [];
  private readonly errors: ParseError[] = [];

  constructor(
    private readonly input: string,
    private readonly table: BookAliasTable,
  ) {
    this.toks = tokenize(input);
  }

  run(): ParseReferenceResult {
    let i = 0;
    while (i < this.toks.length) {
      const m = this.toks[i]!.kind === 'punct' ? undefined : this.matchAlias(i);
      i = m ? this.reference(i, m) : i + 1;
    }
    return { refs: this.refs, consumed: this.consumed, errors: this.errors };
  }

  private at(i: number): Tok | undefined {
    return this.toks[i];
  }

  private isPunct(i: number, ch: string): boolean {
    const t = this.toks[i];
    return t !== undefined && t.kind === 'punct' && t.norm === ch;
  }

  /** Longest alias starting at token `i`; dots between alias words are skipped ("1. Sam."). */
  private matchAlias(i: number): AliasMatch | undefined {
    const words: string[] = [];
    const ends: number[] = [];
    let j = i;
    while (words.length < this.table.maxWords && j < this.toks.length) {
      const t = this.toks[j]!;
      if (t.kind === 'punct') {
        if (t.norm === '.' && words.length > 0) {
          j++;
          continue;
        }
        break;
      }
      words.push(t.norm);
      ends.push(j + 1);
      j++;
    }
    for (let k = words.length; k >= 1; k--) {
      const alias = words.slice(0, k).join(' ');
      const osis = this.table.byAlias.get(alias);
      if (osis !== undefined) return { osis, alias, next: ends[k - 1]! };
    }
    return undefined;
  }

  /** Parse one reference whose alias starts at token `i`. Returns the token index to resume at. */
  private reference(i: number, m: AliasMatch): number {
    const book = this.table.books.get(m.osis)!;
    const start = this.toks[i]!.start;
    let j = m.next;
    // "Gen.1.1", "Ps. 23" — a dot directly after the alias.
    if (this.isPunct(j, '.') && this.at(j + 1)?.kind === 'num') j++;

    const numTok = this.at(j);
    if (numTok?.kind !== 'num') {
      // Bare book.
      if (!this.table.bare.has(m.alias)) return m.next;
      const end = this.toks[m.next - 1]!.end;
      const ambiguousWith = this.table.ambiguous.get(m.osis);
      const ref = this.makeRef(
        book,
        { c1: 1, c2: book.chapterCount },
        'book',
        start,
        end,
        ambiguousWith ? 0.7 : 0.9,
      );
      if (ambiguousWith) ref.ambiguousWith = ambiguousWith;
      this.refs.push(ref);
      this.consumed.push([start, end]);
      return m.next;
    }

    const single = book.chapterCount === 1;
    const explicitChapter = this.verseSeparator(j + 1);
    const items: Item[] = [];
    let end: number;
    let chapterOnlyReading: Item | undefined;

    if (single && !explicitChapter) {
      // "Phm 4", "Jude 3-5", "Obad 1,3": lone numbers are verses of chapter 1.
      const list = this.verseList(j, 1);
      if (!list) return m.next;
      items.push(...list.items);
      end = list.end;
      const [only] = items;
      if (items.length === 1 && only!.v1 === 1 && only!.v2 === 1) {
        chapterOnlyReading = { c1: 1, c2: 1 };
      }
    } else {
      const c = Number.parseInt(numTok.norm, 10);
      let k = j + 1;
      end = numTok.end;
      const suffix = this.suffix(k);
      if (suffix) {
        k++;
        end = suffix.end;
      }
      if (this.verseSeparator(k) && !suffix) {
        const list = this.verseList(k + 1, c);
        if (!list) return m.next;
        items.push(...list.items);
        end = list.end;
      } else if (this.isPunct(k, '-') && this.at(k + 1)?.kind === 'num' && !suffix) {
        const endTok = this.at(k + 1)!;
        items.push({ c1: c, c2: Number.parseInt(endTok.norm, 10) });
        end = endTok.end;
      } else if (suffix?.norm === 'ff') {
        items.push({ c1: c, c2: book.chapterCount });
      } else if (suffix?.norm === 'f') {
        items.push({ c1: c, c2: c + 1 });
      } else {
        items.push({ c1: c, c2: c });
      }
    }

    const error = this.validate(book, items);
    const resume = this.tokenAfter(end);
    if (error) {
      this.errors.push({ span: [start, end], reason: error.reason, message: error.message });
      return resume;
    }
    for (const item of items) this.refs.push(this.makeRef(book, item, kindOf(item), start, end, 1));
    if (chapterOnlyReading) {
      this.refs.push(this.makeRef(book, chapterOnlyReading, 'chapter', start, end, 0.5));
    }
    this.consumed.push([start, end]);
    return resume;
  }

  /** ":" or "." followed by a number — the chapter/verse separator. */
  private verseSeparator(k: number): boolean {
    return (this.isPunct(k, ':') || this.isPunct(k, '.')) && this.at(k + 1)?.kind === 'num';
  }

  /** "f"/"ff" glued to the preceding number. */
  private suffix(k: number): Tok | undefined {
    const t = this.at(k);
    const prev = this.at(k - 1);
    if (t?.kind === 'word' && (t.norm === 'f' || t.norm === 'ff') && prev && prev.end === t.start) {
      return t;
    }
    return undefined;
  }

  /**
   * verse ('-' (chapter ':')? verse)? suffix? (',' …)* starting at token `k`
   * (which must be a number), in chapter `c`. Later items inherit the last
   * chapter named. Stops before a comma that does not lead to another verse
   * — or that leads into a new reference ("Ps 23:1, 1 John 3").
   */
  private verseList(k: number, c: number): { items: Item[]; end: number } | undefined {
    const items: Item[] = [];
    let end = 0;
    let chapter = c;
    for (;;) {
      const vTok = this.at(k);
      if (vTok?.kind !== 'num') break;
      const v = Number.parseInt(vTok.norm, 10);
      const item: Item = { c1: chapter, v1: v, c2: chapter, v2: v };
      end = vTok.end;
      k++;
      if (this.isPunct(k, '-') && this.at(k + 1)?.kind === 'num') {
        const a = this.at(k + 1)!;
        if (this.verseSeparator(k + 2)) {
          const b = this.at(k + 3)!;
          item.c2 = Number.parseInt(a.norm, 10);
          item.v2 = Number.parseInt(b.norm, 10);
          end = b.end;
          k += 4;
        } else {
          item.v2 = Number.parseInt(a.norm, 10);
          end = a.end;
          k += 2;
        }
      }
      const suffix = this.suffix(k);
      if (suffix && item.v2 === v && item.c2 === chapter) {
        // "16f" → 16-17; "16ff" → 16 to the chapter's end, resolved in validate.
        item.v2 = suffix.norm === 'f' ? v + 1 : Number.POSITIVE_INFINITY;
        end = suffix.end;
        k++;
      }
      items.push(item);
      chapter = item.c2;
      if (!this.isPunct(k, ',') || this.at(k + 1)?.kind !== 'num') break;
      if (this.matchAlias(k + 1)) break;
      k++;
    }
    return items.length ? { items, end } : undefined;
  }

  private validate(
    book: Book,
    items: Item[],
  ): { reason: ParseErrorReason; message: string } | undefined {
    for (const item of items) {
      for (const c of [item.c1, item.c2]) {
        if (versesInChapter(book, c) === undefined) {
          return {
            reason: 'chapterOutOfRange',
            message: `${book.name} has ${book.chapterCount} chapter${book.chapterCount === 1 ? '' : 's'}, not ${c}`,
          };
        }
      }
      if (item.v2 === Number.POSITIVE_INFINITY) item.v2 = versesInChapter(book, item.c2)!;
      for (const [c, v] of [
        [item.c1, item.v1],
        [item.c2, item.v2],
      ] as const) {
        if (v === undefined) continue;
        const n = versesInChapter(book, c)!;
        if (v < 1 || v > n) {
          return {
            reason: 'verseOutOfRange',
            message: `${book.name} ${c} has ${n} verses, not ${v}`,
          };
        }
      }
      const a = makeVerseId(book.order, item.c1, item.v1 ?? 1);
      const b = makeVerseId(book.order, item.c2, item.v2 ?? versesInChapter(book, item.c2)!);
      if (b < a) {
        return {
          reason: 'rangeReversed',
          message: `range ends before it starts (${fmt(item)})`,
        };
      }
    }
    return undefined;
  }

  private makeRef(
    book: Book,
    item: Item,
    kind: RefKind,
    start: number,
    end: number,
    confidence: number,
  ): Ref {
    const partial = { chapterStart: item.c1, chapterEnd: item.c2 } as Pick<
      Ref,
      'chapterStart' | 'chapterEnd' | 'verseStart' | 'verseEnd'
    >;
    if (item.v1 !== undefined) partial.verseStart = item.v1;
    if (item.v2 !== undefined) partial.verseEnd = item.v2;
    const [verseIdStart, verseIdEnd] = verseIdRange(partial, book);
    return {
      bookOsis: book.osis,
      ...partial,
      verseIdStart,
      verseIdEnd,
      kind,
      matchedText: this.input.slice(start, end),
      confidence,
    };
  }

  /** Index of the first token starting at or after character offset `pos`. */
  private tokenAfter(pos: number): number {
    let i = 0;
    while (i < this.toks.length && this.toks[i]!.start < pos) i++;
    return i;
  }
}

function kindOf(item: Item): RefKind {
  if (item.v1 === undefined) return item.c1 === item.c2 ? 'chapter' : 'chapterRange';
  return item.c1 === item.c2 && item.v1 === item.v2 ? 'verse' : 'verseRange';
}

function fmt(item: Item): string {
  const a = item.v1 === undefined ? `${item.c1}` : `${item.c1}:${item.v1}`;
  const b = item.v2 === undefined ? `${item.c2}` : `${item.c2}:${item.v2}`;
  return `${a}-${b}`;
}

/**
 * Find and validate every scripture reference in `input`. Pure and
 * deterministic; the only state is the alias table.
 */
export function parseReference(input: string, table: BookAliasTable): ParseReferenceResult {
  return new Scanner(input, table).run();
}
