/**
 * Every verse in the built data round-trips through the parser in three
 * spellings: OSIS "Book.C.V", full "<name> C:V" and short "<short> C:V".
 * Each must parse to exactly that one verse id with nothing left over.
 */
import { describe, expect, it } from 'vitest';
import { buildBookAliasTable } from '../src/refs/bookAliases.js';
import { parseReference } from '../src/refs/parseReference.js';
import { versesInRef } from '../src/refs/verseIds.js';
import { listVerseFiles, loadBooks, loadVerses, SKIP_REASON } from './data.js';

const books = loadBooks();

describe.skipIf(!books)('reference round-trip over every verse', () => {
  const table = buildBookAliasTable(books ?? []);
  const files = listVerseFiles();

  it('has a verse file for each of the 66 books', () => {
    expect(files.length).toBe(66);
  });

  it('parses osisRef, fullRef and shortRef of all 31,102 verses to that verse', () => {
    const t0 = performance.now();
    let verses = 0;
    let parses = 0;
    const failures: string[] = [];
    for (const osis of files) {
      const bundle = loadVerses(osis)!;
      const book = table.books.get(bundle.book)!;
      expect(book, `book ${bundle.book} missing from books.json`).toBeDefined();
      for (const row of bundle.verses) {
        verses++;
        const forms = [
          `${book.osis}.${row.c}.${row.v}`,
          `${book.name} ${row.c}:${row.v}`,
          `${book.short} ${row.c}:${row.v}`,
        ];
        for (const q of forms) {
          parses++;
          const r = parseReference(q, table);
          const ok =
            r.errors.length === 0 &&
            r.refs.length === 1 &&
            r.refs[0]!.verseIdStart === row.id &&
            r.refs[0]!.verseIdEnd === row.id &&
            r.refs[0]!.kind === 'verse' &&
            r.consumed.length === 1 &&
            r.consumed[0]![0] === 0 &&
            r.consumed[0]![1] === q.length;
          if (!ok && failures.length < 20) {
            failures.push(
              `${JSON.stringify(q)} → ${JSON.stringify(r.refs.map((x) => [x.kind, x.verseIdStart, x.verseIdEnd]))} errors=${JSON.stringify(r.errors)} consumed=${JSON.stringify(r.consumed)} (want ${row.id})`,
            );
          }
        }
      }
    }
    const ms = performance.now() - t0;
    console.info(
      `property: ${verses} verses × 3 forms = ${parses} parses in ${ms.toFixed(0)} ms (${((ms * 1000) / parses).toFixed(1)} µs each)`,
    );
    expect(failures).toEqual([]);
    expect(verses).toBe(31102);
  });

  it('enumerates every verse of every book from the whole-book ref', () => {
    let total = 0;
    for (const osis of files) {
      const bundle = loadVerses(osis)!;
      const book = table.books.get(bundle.book)!;
      const r = parseReference(book.name, table);
      const ref = r.refs.find((x) => x.kind === 'book');
      expect(ref, `${book.name} should parse as a bare book`).toBeDefined();
      const ids = versesInRef(ref!, table.books);
      expect(ids).toEqual(bundle.verses.map((v) => v.id));
      total += ids.length;
    }
    expect(total).toBe(31102);
  });
});

it.skipIf(books)(`property test skipped: ${SKIP_REASON}`, () => {});
