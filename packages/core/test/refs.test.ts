/**
 * Unit tests for the reference parser. These run against a frozen copy of
 * books.json (`fixtures/books.json`) so they need no built data; a separate
 * test checks the fixture still matches the live bundle when it is present.
 */
import { describe, expect, it } from 'vitest';
import { AMBIGUOUS_BOOKS } from '../src/refs/ambiguous.js';
import { aliasesWithPrefix, buildBookAliasTable } from '../src/refs/bookAliases.js';
import { normalizeAlias, ordinalValue } from '../src/refs/normalize.js';
import { parseReference } from '../src/refs/parseReference.js';
import type { Ref } from '../src/refs/types.js';
import { verseCountInRef, verseIdRange, versesInRef } from '../src/refs/verseIds.js';
import type { Book, BooksBundle } from '../src/types.js';
import fixture from './fixtures/books.json' with { type: 'json' };
import { loadBooks } from './data.js';

const books: Book[] = (fixture as BooksBundle).books;
const table = buildBookAliasTable(books);

/** Compact view of a Ref for assertions: "verse John.3:16-3:16 43003016-43003016". */
function brief(r: Ref): string {
  const v = (c: number, v?: number): string => (v === undefined ? `${c}` : `${c}:${v}`);
  return `${r.kind} ${r.bookOsis}.${v(r.chapterStart, r.verseStart)}-${v(r.chapterEnd, r.verseEnd)} ${r.verseIdStart}-${r.verseIdEnd}`;
}
const parse = (q: string): string[] => parseReference(q, table).refs.map(brief);

describe('fixture', () => {
  it('matches the live books.json when that is built', () => {
    const live = loadBooks();
    if (!live) return;
    expect(live).toEqual(books);
  });
});

describe('normalizeAlias', () => {
  it('lower-cases, drops dots, splits digits from letters and collapses space', () => {
    expect(normalizeAlias('1Sam.')).toBe('1 sam');
    expect(normalizeAlias('  Song  of   Solomon ')).toBe('song of solomon');
    expect(normalizeAlias('Jn3')).toBe('jn 3');
    expect(normalizeAlias('PHLM')).toBe('phlm');
    expect(normalizeAlias('...')).toBe('');
  });
  it('does not fold ordinal words on its own', () => {
    expect(normalizeAlias('I Sam')).toBe('i sam');
    expect(ordinalValue('III')).toBe('3');
    expect(ordinalValue('first')).toBe('1');
    expect(ordinalValue('2nd')).toBe('2');
    expect(ordinalValue('iv')).toBeUndefined();
  });
});

describe('buildBookAliasTable', () => {
  it('knows every book by osis, name, short and slug', () => {
    for (const b of books) {
      for (const a of [b.osis, b.name, b.short, b.slug]) {
        expect(table.byAlias.get(normalizeAlias(a)), a).toBe(b.osis);
      }
    }
  });
  it('carries the curated spellings from the design doc', () => {
    const cases: Record<string, string> = {
      jn: 'John',
      jhn: 'John',
      jno: 'John',
      mt: 'Matt',
      matt: 'Matt',
      mk: 'Mark',
      lk: 'Luke',
      ps: 'Ps',
      psa: 'Ps',
      pss: 'Ps',
      psalm: 'Ps',
      psalms: 'Ps',
      prv: 'Prov',
      prov: 'Prov',
      eccl: 'Eccl',
      eccles: 'Eccl',
      qoh: 'Eccl',
      song: 'Song',
      sos: 'Song',
      cant: 'Song',
      canticles: 'Song',
      'song of songs': 'Song',
      phlm: 'Phlm',
      phm: 'Phlm',
      philem: 'Phlm',
      jas: 'Jas',
      jud: 'Jude',
      jdg: 'Judg',
      judg: 'Judg',
      rev: 'Rev',
      re: 'Rev',
      apoc: 'Rev',
      apocalypse: 'Rev',
    };
    for (const [alias, osis] of Object.entries(cases))
      expect(table.byAlias.get(alias), alias).toBe(osis);
  });
  it('registers ordinal variants only for ordinal books', () => {
    for (const a of [
      '1 sam',
      '1sam',
      'I Sam',
      'i sam',
      'First Samuel',
      '1st Samuel',
      'III John',
      'Third John',
      '3rd Jn',
    ]) {
      expect(table.byAlias.get(normalizeAlias(a)), a).toMatch(/^(1Sam|3John)$/);
    }
    expect(table.byAlias.has('i am')).toBe(false);
    expect(table.byAlias.has('first')).toBe(false);
  });
  it('generates unambiguous 3/4-letter prefixes and drops shared ones', () => {
    expect(table.byAlias.get('gene')).toBe('Gen');
    expect(table.byAlias.get('1 samu')).toBe('1Sam');
    expect(table.byAlias.get('reve')).toBe('Rev');
    expect(table.byAlias.has('phi')).toBe(false); // Philippians / Philemon
    expect(table.byAlias.has('phil')).toBe(true); // …but the OSIS "Phil" is Philippians
    expect(table.byAlias.get('phil')).toBe('Phil');
    expect(table.entries.find((e) => e.alias === 'gene')?.source).toBe('prefix');
  });
  it('lets full names and OSIS stand bare, but not two-letter forms or prefixes', () => {
    for (const a of ['john', 'ruth', 'gen', 'ps', 'song', 'psalms', 'cant', '1 john', 'jas'])
      expect(table.bare.has(a), a).toBe(true);
    for (const a of ['so', 'is', 'am', 'jn', 'mt', 'gene', 'son', 'sos', 'phm', 'jud'])
      expect(table.bare.has(a), a).toBe(false);
  });
  it('throws when an alias would reach two books', () => {
    const dup = books.map((b) => (b.osis === 'Mark' ? { ...b, short: 'Mt' } : b));
    expect(() => buildBookAliasTable(dup)).toThrow(/"mt" maps to both Matt and Mark/);
  });
  it('sorts entries for prefix lookup', () => {
    const aliases = table.entries.map((e) => e.alias);
    expect(aliases).toEqual([...aliases].sort());
    const hits = aliasesWithPrefix(table, 'Jo').map((e) => e.alias);
    expect(hits).toContain('john');
    expect(hits).toContain('jonah');
    expect(hits).toContain('job');
    expect(hits.every((a) => a.startsWith('jo'))).toBe(true);
    expect(aliasesWithPrefix(table, '')).toEqual([]);
  });
  it('defaults ambiguity to the derived constant', () => {
    expect(new Set(table.ambiguous.keys())).toEqual(AMBIGUOUS_BOOKS);
  });
});

describe('parseReference — grammar', () => {
  it('single verse, chapter, whole book', () => {
    expect(parse('John 3:16')).toEqual(['verse John.3:16-3:16 43003016-43003016']);
    expect(parse('John 3')).toEqual(['chapter John.3-3 43003001-43003036']);
    expect(parse('Genesis')).toEqual(['book Gen.1-50 1001001-1050026']);
  });
  it('verse range, cross-chapter verse range, chapter range', () => {
    expect(parse('John 3:16-18')).toEqual(['verseRange John.3:16-3:18 43003016-43003018']);
    expect(parse('Gen 1:1-2:3')).toEqual(['verseRange Gen.1:1-2:3 1001001-1002003']);
    expect(parse('Gen 1-3')).toEqual(['chapterRange Gen.1-3 1001001-1003024']);
  });
  it('verse lists emit one ref per item, sharing one span', () => {
    const r = parseReference('Ps 23:1,4', table);
    expect(r.refs.map(brief)).toEqual([
      'verse Ps.23:1-23:1 19023001-19023001',
      'verse Ps.23:4-23:4 19023004-19023004',
    ]);
    expect(r.consumed).toEqual([[0, 9]]);
    expect(r.refs.map((x) => x.matchedText)).toEqual(['Ps 23:1,4', 'Ps 23:1,4']);
    expect(parse('Ps 23:1-3, 5')).toEqual([
      'verseRange Ps.23:1-23:3 19023001-19023003',
      'verse Ps.23:5-23:5 19023005-19023005',
    ]);
    // later items follow the last chapter named
    expect(parse('Gen 1:31-2:1,3')).toEqual([
      'verseRange Gen.1:31-2:1 1001031-1002001',
      'verse Gen.2:3-2:3 1002003-1002003',
    ]);
  });
  it('semicolons and commas separate references', () => {
    const r = parseReference('Gen 1:1; John 1:1', table);
    expect(r.refs.map(brief)).toEqual([
      'verse Gen.1:1-1:1 1001001-1001001',
      'verse John.1:1-1:1 43001001-43001001',
    ]);
    expect(r.consumed).toEqual([
      [0, 7],
      [9, 17],
    ]);
    expect(parse('Jn 3:16-18; Ps 23:1,4')).toHaveLength(3);
    // a comma item that starts a new reference is not a verse of the old one
    expect(parse('Ps 23:1, 1 John 3')).toEqual([
      'verse Ps.23:1-23:1 19023001-19023001',
      'chapter 1John.3-3 62003001-62003024',
    ]);
  });
  it('alias glued to digits, OSIS dots, en and em dashes', () => {
    expect(parse('Jn3:16')).toEqual(['verse John.3:16-3:16 43003016-43003016']);
    expect(parse('Gen1')).toEqual(['chapter Gen.1-1 1001001-1001031']);
    expect(parse('1Sam17')).toEqual(['chapter 1Sam.17-17 9017001-9017058']);
    expect(parse('Gen.1.1')).toEqual(['verse Gen.1:1-1:1 1001001-1001001']);
    expect(parse('Ps. 23:1')).toEqual(['verse Ps.23:1-23:1 19023001-19023001']);
    expect(parse('John 3:16–18')).toEqual(['verseRange John.3:16-3:18 43003016-43003018']);
    expect(parse('John 3:16—18')).toEqual(['verseRange John.3:16-3:18 43003016-43003018']);
    expect(parse('Gen 1–3')).toEqual(['chapterRange Gen.1-3 1001001-1003024']);
  });
  it('f and ff suffixes', () => {
    expect(parse('John 3:16f')).toEqual(['verseRange John.3:16-3:17 43003016-43003017']);
    expect(parse('John 3:16ff')).toEqual(['verseRange John.3:16-3:36 43003016-43003036']);
    expect(parse('Gen 1f')).toEqual(['chapterRange Gen.1-2 1001001-1002025']);
    expect(parse('Gen 49ff')).toEqual(['chapterRange Gen.49-50 1049001-1050026']);
    expect(parse('Phm 20ff')).toEqual(['verseRange Phlm.1:20-1:25 57001020-57001025']);
    // a suffix must be glued: "John 3 f" is chapter 3 and a stray word
    expect(parse('John 3 f')).toEqual(['chapter John.3-3 43003001-43003036']);
  });
  it('ordinal books in every spelling', () => {
    for (const q of [
      '1 Sam 17',
      '1Sam 17',
      '1Sa 17',
      'I Sam 17',
      'I Samuel 17',
      'First Samuel 17',
      '1st Samuel 17',
      '1st Sam 17',
      '1 Samuel 17',
    ]) {
      expect(parse(q), q).toEqual(['chapter 1Sam.17-17 9017001-9017058']);
    }
    expect(parse('III John 1:3')).toEqual(['verse 3John.1:3-1:3 64001003-64001003']);
    expect(parse('2 Chronicles 7:14')).toEqual(['verse 2Chr.7:14-7:14 14007014-14007014']);
  });
  it('finds references inside other text and reports spans', () => {
    const r = parseReference('Moses Exodus 3', table);
    expect(r.refs.map(brief)).toEqual(['chapter Exod.3-3 2003001-2003022']);
    expect(r.consumed).toEqual([[6, 14]]);
    expect(r.refs[0]!.matchedText).toBe('Exodus 3');
    expect(parseReference('love in John', table).consumed).toEqual([[8, 12]]);
    expect(parseReference('love 1 John', table).refs.map(brief)).toEqual([
      'book 1John.1-5 62001001-62005021',
    ]);
  });
  it('is case-insensitive and tolerant of extra whitespace', () => {
    expect(parse('  JOHN   3 : 16  ')).toEqual(['verse John.3:16-3:16 43003016-43003016']);
    expect(parse('song OF songs 2:1')).toEqual(['verse Song.2:1-2:1 22002001-22002001']);
  });
});

describe('parseReference — confidence and ambiguity', () => {
  it('explicit chapter or verse is 1.0', () => {
    expect(parseReference('John 3:16', table).refs[0]!.confidence).toBe(1);
    expect(parseReference('John 3', table).refs[0]!.confidence).toBe(1);
  });
  it('a bare book that is not an entity name is 0.9 with no ambiguity', () => {
    const [ref] = parseReference('Genesis', table).refs;
    expect(ref!.confidence).toBe(0.9);
    expect(ref!.ambiguousWith).toBeUndefined();
  });
  it('a bare book that is also an entity name is 0.7 and lists the entities', () => {
    const [ref] = parseReference('John', table).refs;
    expect(ref!.confidence).toBe(0.7);
    expect(ref!.ambiguousWith!.map((e) => e.id)).toEqual(
      expect.arrayContaining(['john_1676', 'john_1677', 'mark_1679']),
    );
    expect(ref!.ambiguousWith!.every((e) => e.type === 'person')).toBe(true);
    expect(parseReference('Ruth', table).refs[0]!.ambiguousWith).toEqual([
      { type: 'person', id: 'ruth_2450' },
    ]);
    expect(parseReference('Mark', table).refs[0]!.ambiguousWith).toEqual([
      { type: 'person', id: 'mark_1679' },
    ]);
  });
  it('with a chapter present the entity reading is dropped', () => {
    const [ref] = parseReference('John 3', table).refs;
    expect(ref!.ambiguousWith).toBeUndefined();
    expect(ref!.confidence).toBe(1);
  });
  it('a caller can supply its own ambiguity map', () => {
    const t2 = buildBookAliasTable(books, { ambiguous: new Map() });
    expect(parseReference('John', t2).refs[0]!.confidence).toBe(0.9);
  });
});

describe('parseReference — non-references', () => {
  it('ignores two-letter aliases and prefixes without a chapter', () => {
    for (const q of ['so loved', 'I am', 'is', 'he said', 'the son of man', 'a gene', 'ps']) {
      // "ps" is the OSIS of Psalms and may stand bare; the rest may not
      const n = parseReference(q, table).refs.length;
      expect(n, q).toBe(q === 'ps' ? 1 : 0);
    }
  });
  it('does not match inside longer words', () => {
    expect(parse('johnny 3')).toEqual([]);
    expect(parse('genesis2')).toEqual(['chapter Gen.2-2 1002001-1002025']); // digits are a boundary
    expect(parse('marks')).toEqual([]);
  });
  it('returns nothing for plain text', () => {
    for (const q of [
      'Jesus wept',
      'in the beginning',
      'the',
      '',
      '   ',
      'Simon Peter',
      'Tower of Babel',
      '3:16',
    ]) {
      const r = parseReference(q, table);
      expect(r.refs, q).toEqual([]);
      expect(r.errors, q).toEqual([]);
      expect(r.consumed, q).toEqual([]);
    }
  });
});

describe('parseReference — errors (invariant 5: never clamp)', () => {
  it('chapter out of range: error, nothing consumed, no bare-book fallback', () => {
    const r = parseReference('John 99', table);
    expect(r.refs).toEqual([]);
    expect(r.consumed).toEqual([]);
    expect(r.errors).toEqual([
      { span: [0, 7], reason: 'chapterOutOfRange', message: 'John has 21 chapters, not 99' },
    ]);
  });
  it('verse out of range, including via a suffix or a range end', () => {
    expect(parseReference('John 3:99', table).errors[0]).toMatchObject({
      reason: 'verseOutOfRange',
      message: 'John 3 has 36 verses, not 99',
    });
    expect(parseReference('Rev 22:21f', table).errors[0]!.reason).toBe('verseOutOfRange');
    expect(parseReference('John 3:16-99', table).errors[0]!.reason).toBe('verseOutOfRange');
    expect(parseReference('Gen 1:1-99:1', table).errors[0]!.reason).toBe('chapterOutOfRange');
    expect(parseReference('Gen 0', table).errors[0]!.reason).toBe('chapterOutOfRange');
    expect(parseReference('Gen 1:0', table).errors[0]!.reason).toBe('verseOutOfRange');
  });
  it('reversed ranges are errors, not silently swapped', () => {
    expect(parseReference('Gen 3-1', table).errors[0]!.reason).toBe('rangeReversed');
    expect(parseReference('John 3:18-16', table).errors[0]!.reason).toBe('rangeReversed');
    expect(parseReference('Gen 2:1-1:31', table).errors[0]!.reason).toBe('rangeReversed');
  });
  it('one bad item fails the whole reference; the rest of the query still parses', () => {
    const r = parseReference('Ps 23:1,999; John 1:1', table);
    expect(r.errors.map((e) => [e.reason, e.span])).toEqual([['verseOutOfRange', [0, 11]]]);
    expect(r.refs.map(brief)).toEqual(['verse John.1:1-1:1 43001001-43001001']);
    expect(r.consumed).toEqual([[13, 21]]);
  });
});

describe('parseReference — single-chapter books', () => {
  it('a lone number is a verse', () => {
    for (const q of ['Phm 4', 'Phlm 4', 'Philemon 4', 'Phm 1:4', 'Phlm.1.4']) {
      expect(parse(q), q).toEqual(['verse Phlm.1:4-1:4 57001004-57001004']);
    }
    expect(parse('Jude 3-5')).toEqual(['verseRange Jude.1:3-1:5 65001003-65001005']);
    expect(parse('Obad 1,3')).toEqual([
      'verse Obad.1:1-1:1 31001001-31001001',
      'verse Obad.1:3-1:3 31001003-31001003',
    ]);
  });
  it('"Phm 1" is verse 1 at 1.0 plus the chapter reading at 0.5', () => {
    const r = parseReference('Phm 1', table);
    expect(r.refs.map((x) => [brief(x), x.confidence])).toEqual([
      ['verse Phlm.1:1-1:1 57001001-57001001', 1],
      ['chapter Phlm.1-1 57001001-57001025', 0.5],
    ]);
    expect(r.consumed).toEqual([[0, 5]]);
    // but not when the verse reading is anything other than a bare "1"
    expect(parseReference('Phm 2', table).refs).toHaveLength(1);
    expect(parseReference('Phm 1-2', table).refs).toHaveLength(1);
    expect(parseReference('Phm 1:1', table).refs).toHaveLength(1);
  });
  it('a number past the last verse is an error', () => {
    expect(parseReference('Phm 26', table).errors[0]).toMatchObject({
      reason: 'verseOutOfRange',
      message: 'Philemon 1 has 25 verses, not 26',
    });
  });
});

describe('verseIds', () => {
  const gen = books[0]!;
  it('verseIdRange fills in first and last verses', () => {
    expect(verseIdRange({ chapterStart: 1, chapterEnd: 50 }, gen)).toEqual([1001001, 1050026]);
    expect(verseIdRange({ chapterStart: 2, chapterEnd: 2, verseStart: 3 }, gen)).toEqual([
      1002003, 1002025,
    ]);
    expect(() => verseIdRange({ chapterStart: 1, chapterEnd: 51 }, gen)).toThrow(RangeError);
  });
  it('versesInRef walks chapter boundaries', () => {
    const [ref] = parseReference('Gen 1:30-2:2', table).refs;
    expect(versesInRef(ref!, books)).toEqual([1001030, 1001031, 1002001, 1002002]);
    expect(verseCountInRef(ref!, table.books)).toBe(4);
    const [chapters] = parseReference('Gen 1-3', table).refs;
    expect(versesInRef(chapters!, table.books)).toHaveLength(80);
    expect(verseCountInRef(chapters!, books)).toBe(80);
  });
});
