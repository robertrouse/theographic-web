/**
 * Ref ↔ BBCCCVVV verse-id ranges. The ids themselves come from `ids.ts`;
 * this module only knows how a validated reference maps onto them.
 */
import { makeVerseId, verseIdParts } from '../ids.js';
import type { Book, VerseId } from '../types.js';
import type { Ref } from './types.js';

/** Number of verses in chapter `c` (1-based) of `book`; undefined when the chapter does not exist. */
export function versesInChapter(book: Book, c: number): number | undefined {
  return c >= 1 && c <= book.chapterCount ? book.versesPerChapter[c - 1] : undefined;
}

/**
 * Inclusive verse-id range a reference covers, computed from its chapters and
 * verses. A chapter-level end runs to that chapter's last verse. Throws if
 * the reference names a chapter the book lacks — `parseReference` validates
 * first, so this only fires on hand-built refs.
 */
export function verseIdRange(
  ref: Pick<Ref, 'chapterStart' | 'chapterEnd' | 'verseStart' | 'verseEnd'>,
  book: Book,
): [VerseId, VerseId] {
  const lastVerse = versesInChapter(book, ref.chapterEnd);
  if (versesInChapter(book, ref.chapterStart) === undefined || lastVerse === undefined) {
    throw new RangeError(
      `${book.osis} has ${book.chapterCount} chapters; ref asks for ${ref.chapterStart}-${ref.chapterEnd}`,
    );
  }
  const start = makeVerseId(book.order, ref.chapterStart, ref.verseStart ?? 1);
  const end = makeVerseId(book.order, ref.chapterEnd, ref.verseEnd ?? lastVerse);
  return [start, end];
}

/**
 * Every verse id in `ref`, canonical order. Walks `versesPerChapter` so a
 * chapter boundary inside the range is honoured (Gen 1:1-2:3 is 34 ids, not
 * 1003 of them).
 */
export function versesInRef(ref: Ref, books: Book[] | Map<string, Book>): VerseId[] {
  const book =
    books instanceof Map ? books.get(ref.bookOsis) : books.find((b) => b.osis === ref.bookOsis);
  if (!book) throw new RangeError(`unknown book ${ref.bookOsis}`);
  const out: VerseId[] = [];
  const first = verseIdParts(ref.verseIdStart);
  const last = verseIdParts(ref.verseIdEnd);
  for (let c = first.c; c <= last.c; c++) {
    const count = versesInChapter(book, c);
    if (count === undefined) throw new RangeError(`${book.osis} has no chapter ${c}`);
    const vFrom = c === first.c ? first.v : 1;
    const vTo = c === last.c ? last.v : count;
    for (let v = vFrom; v <= vTo; v++) out.push(makeVerseId(book.order, c, v));
  }
  return out;
}

/** How many verses `ref` covers, without materialising them. */
export function verseCountInRef(ref: Ref, books: Book[] | Map<string, Book>): number {
  const book =
    books instanceof Map ? books.get(ref.bookOsis) : books.find((b) => b.osis === ref.bookOsis);
  if (!book) throw new RangeError(`unknown book ${ref.bookOsis}`);
  const first = verseIdParts(ref.verseIdStart);
  const last = verseIdParts(ref.verseIdEnd);
  let n = 0;
  for (let c = first.c; c <= last.c; c++) {
    const count = versesInChapter(book, c);
    if (count === undefined) throw new RangeError(`${book.osis} has no chapter ${c}`);
    const vFrom = c === first.c ? first.v : 1;
    const vTo = c === last.c ? last.v : count;
    n += vTo - vFrom + 1;
  }
  return n;
}
