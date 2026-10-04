/**
 * Reference-parser types. See `docs/search-design.md` §"Public API".
 */
import type { BookOsis, Slug, VerseId } from '../types.js';

export type RefKind = 'book' | 'chapter' | 'chapterRange' | 'verse' | 'verseRange' | 'verseList';

/** An entity whose name is also a book name; the reader may have meant either. */
export interface AmbiguousEntity {
  type: 'person' | 'place';
  id: Slug;
}

/**
 * A validated scripture reference. Every chapter and verse is known to exist
 * in the book (invariant 5: out-of-range is an error, never a clamp), so
 * `verseIdStart..verseIdEnd` is a real, inclusive range of BBCCCVVV ids.
 *
 * `chapterStart..chapterEnd` is always populated (a whole book is chapter 1 to
 * the last chapter). `verseStart`/`verseEnd` are present only when the text
 * named a verse.
 */
export interface Ref {
  bookOsis: BookOsis;
  chapterStart: number;
  verseStart?: number;
  chapterEnd: number;
  verseEnd?: number;
  verseIdStart: VerseId;
  verseIdEnd: VerseId;
  kind: RefKind;
  /** The source text this reference was read from (the whole span, for list items too). */
  matchedText: string;
  /**
   * 1.0 explicit chapter/verse · 0.9 bare book · 0.7 bare book that is also
   * an entity name · 0.5 the "chapter 1" reading of "Phlm 1".
   */
  confidence: number;
  ambiguousWith?: AmbiguousEntity[];
}

export type ParseErrorReason = 'chapterOutOfRange' | 'verseOutOfRange' | 'rangeReversed';

export interface ParseError {
  /** `[start, end)` character offsets into the input. Never consumed. */
  span: [number, number];
  reason: ParseErrorReason;
  /** Human-readable detail: "John has 21 chapters, not 99". */
  message: string;
}

export interface ParseReferenceResult {
  refs: Ref[];
  /** `[start, end)` character spans the parser claimed; the classifier skips them. */
  consumed: [number, number][];
  errors: ParseError[];
}
