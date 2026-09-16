/**
 * `AMBIGUOUS_BOOK_ENTITIES` is a constant derived from `entities.json`. This
 * test re-derives it from the built data and fails, printing the replacement
 * literal, if the two differ — so a data refresh cannot leave it stale.
 */
import { describe, expect, it } from 'vitest';
import {
  AMBIGUOUS_BOOK_ENTITIES,
  AMBIGUOUS_BOOKS,
  deriveAmbiguousBooks,
} from '../src/refs/ambiguous.js';
import { loadBooks, loadEntities, renderAmbiguousLiteral, SKIP_REASON } from './data.js';

const books = loadBooks();
const entities = loadEntities();

describe.skipIf(!books || !entities)('ambiguous book constant', () => {
  it('matches what entities.json says today', () => {
    const derived = deriveAmbiguousBooks(books!, entities!);
    if (JSON.stringify(derived) !== JSON.stringify(AMBIGUOUS_BOOK_ENTITIES)) {
      console.error(
        `src/refs/ambiguous.ts is stale. Run \`npx tsx packages/core/test/gen-ambiguous.mts\`, or paste:\n${renderAmbiguousLiteral(derived)}`,
      );
    }
    expect(derived).toEqual(AMBIGUOUS_BOOK_ENTITIES);
  });

  it('covers the collisions the design doc names', () => {
    for (const osis of ['John', 'Zech', 'Jas', 'Jude', 'Phlm', 'Ruth', 'Job', 'Joel', 'Mark']) {
      expect(AMBIGUOUS_BOOKS.has(osis), osis).toBe(true);
    }
    expect(AMBIGUOUS_BOOK_ENTITIES['John']!.map((e) => e.id)).toEqual(
      expect.arrayContaining(['john_1676', 'john_1677', 'mark_1679']),
    );
    expect(AMBIGUOUS_BOOK_ENTITIES['Mark']!.map((e) => e.id)).toEqual(['mark_1679']);
    expect(AMBIGUOUS_BOOK_ENTITIES['Zech']!.length).toBeGreaterThanOrEqual(26);
  });

  it('never lists an ordinal book: "1 John" is not a person', () => {
    for (const osis of AMBIGUOUS_BOOKS) expect(osis).not.toMatch(/^[123]/);
  });
});

it.skipIf(books && entities)(`ambiguity check skipped: ${SKIP_REASON}`, () => {});
