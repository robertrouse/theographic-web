import type { VerseId } from './types.js';

/** "01001001" → 1001001. Accepts the source's zero-padded string or a number. */
export function toVerseId(raw: string | number): VerseId {
  const n = typeof raw === 'number' ? raw : Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1001001 || n > 66999999) {
    throw new RangeError(`not a verse id: ${String(raw)}`);
  }
  return n;
}

/** 1001001 → { book: 1, c: 1, v: 1 }. `book` is canonical order 1..66. */
export function verseIdParts(id: VerseId): { book: number; c: number; v: number } {
  return { book: Math.floor(id / 1_000_000), c: Math.floor(id / 1000) % 1000, v: id % 1000 };
}

export function makeVerseId(bookOrder: number, c: number, v: number): VerseId {
  return bookOrder * 1_000_000 + c * 1000 + v;
}

/**
 * ISO 8601 astronomical year → human. 0 is 1 BC, -4003 is 4004 BC, 30 is AD 30.
 * The source uses this convention throughout (birthYear, yearNum, event dates).
 */
export function formatYear(year: number): string {
  return year <= 0 ? `${1 - year} BC` : `AD ${year}`;
}
