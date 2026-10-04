/**
 * `searchText` behaviour on a small corpus where every number can be
 * checked by hand, plus the invariants that hold on any index: purity,
 * stable ties, scope applied during traversal, quoted phrases.
 */
import { describe, expect, it } from 'vitest';
import { BM25, searchText, tfNorm } from '../../src/text/bm25.js';
import { buildTextIndex } from '../../src/text/build.js';
import { damerauLevenshtein } from '../../src/damerau.js';
import { EXPANSION, expandWord } from '../../src/text/expand.js';
import { openTextIndex } from '../../src/text/index.js';
import { loadTextIndex, SKIP_REASON } from '../data.js';

const ROWS = [
  { id: 1001001, text: 'In the beginning God created the heaven and the earth.' },
  {
    id: 1001002,
    text: 'And the earth was without form, and void; and darkness was upon the face of the deep.',
  },
  {
    id: 1001004,
    text: 'And God saw the light, that it was good: and God divided the light from the darkness.',
  },
  { id: 19119105, text: 'NUN. Thy word is a lamp unto my feet, and a light unto my path.' },
  {
    id: 43001001,
    text: 'In the beginning was the Word, and the Word was with God, and the Word was God.',
  },
  { id: 43011035, text: 'Jesus wept.' },
  { id: 43011036, text: 'Then said the Jews, Behold how he loved him!' },
  { id: 62004008, text: 'He that loveth not knoweth not God; for God is love.' },
  {
    id: 62004016,
    text: 'God is love; and he that dwelleth in love dwelleth in God, and God in him.',
  },
  { id: 66022021, text: 'The grace of our Lord Jesus Christ be with you all. Amen.' },
];
const built = buildTextIndex(ROWS);
const index = openTextIndex(built.idx, built.txt);
const N = ROWS.length;
const idf = (df: number): number => Math.log(1 + (N - df + 0.5) / (df + 0.5));

describe('searchText (synthetic)', () => {
  it('scores a single exact word by idf × tfn and orders ties by verse id', () => {
    const r = searchText('god', index, { explain: true });
    // "god" is in 5 of 10 verses: not weak (df ≤ 0.5·N).
    expect(r.words[0]!.weak).toBe(false);
    expect(r.total).toBe(5);
    const top = r.hits[0]!;
    expect(top.id).toBe(62004016); // tf 3
    expect(top.score).toBeCloseTo(
      idf(5) * tfNorm(3, index.docLen(index.docIndexOf(62004016)), index.avgDocLen),
      10,
    );
    expect(top.why).toEqual([
      `bm25 ${top.score.toFixed(2)} = god(idf ${idf(5).toFixed(2)}, tf 3)`,
      'cov 1.00',
    ]);
    expect(top.snippet.highlights.length).toBe(3);
  });

  it('is a pure function of its inputs', () => {
    const a = searchText('god is love', index, { explain: true });
    const b = searchText('god is love', index, { explain: true });
    expect(b).toEqual(a);
  });

  it('boosts a contiguous in-order phrase by 50% and adjacency by 25%', () => {
    const r = searchText('jesus wept', index, { explain: true });
    expect(r.hits[0]!.id).toBe(43011035);
    expect(r.hits[0]!.why).toContain('phrase +50%');
    expect(r.hits[0]!.why).toContain('prox +25% (span 2)');
    const base = r.hits[0]!.score / (1 + BM25.phraseBoost + BM25.proxBoost);
    const L = Math.max(2, BM25.minDocLen);
    expect(base).toBeCloseTo(
      idf(2) * tfNorm(1, L, index.avgDocLen) + idf(1) * tfNorm(1, L, index.avgDocLen),
      10,
    );
    // Rev 22:21 has "jesus" only: cov 0.5 → ×0.35, no boosts.
    const rev = r.hits.find((h) => h.id === 66022021)!;
    expect(rev.why).toContain('cov 0.50 → ×0.35');
    expect(rev.why.some((w) => w.startsWith('phrase'))).toBe(false);
  });

  it('measures proximity over the smallest window holding every matched word', () => {
    const r = searchText('word god', index, { explain: true, retokenizeTop: 10 });
    const john = r.hits.find((h) => h.id === 43001001)!;
    // "…the Word was God." → span 3 → 0.25/(1+3−2) = 12.5%
    expect(john.why).toContain('prox +13% (span 3)');
    expect(john.why.some((w) => w.startsWith('phrase'))).toBe(false);
  });

  it('lets weak words score without generating candidates', () => {
    // "the" is in 6 of 10 verses → weak; "beginning" generates.
    const r = searchText('the beginning', index, { explain: true });
    expect(r.words.map((w) => w.weak)).toEqual([true, false]);
    expect(r.allWeak).toBe(false);
    expect(r.total).toBe(2);
    expect(r.hits.map((h) => h.id).sort()).toEqual([1001001, 43001001]);
    expect(r.hits[0]!.why![0]).toMatch(/the\(idf .*, tf \d, weak\)/);
    expect(r.hits[0]!.why).toContain('phrase +50%');
  });

  it('falls back to the rarest weak word when every word is weak', () => {
    const r = searchText('the and', index, { explain: true });
    expect(r.allWeak).toBe(true);
    expect(r.total).toBe(index.df(index.termId('the')));
    expect(r.hits.every((h) => h.why![1] === 'cov 1.00')).toBe(true);
  });

  it('applies the scope predicate while walking postings', () => {
    const nt = (id: number): boolean => id >= 40000000;
    const r = searchText('god', index, { scope: nt });
    expect(r.total).toBe(3);
    expect(r.hits.every((h) => nt(h.id))).toBe(true);
    // A weak word cannot smuggle an out-of-scope verse in.
    const r2 = searchText('the god', index, { scope: nt });
    expect(r2.hits.every((h) => nt(h.id))).toBe(true);
  });

  it('treats a double-quoted query as phrase-only', () => {
    const r = searchText('"god is love"', index, { explain: true });
    expect(r.phrase).toBe(true);
    expect(r.total).toBe(2);
    expect(r.hits.map((h) => h.id)).toEqual([62004016, 62004008]);
    expect(r.hits.every((h) => h.why!.includes('phrase +50%'))).toBe(true);
    // "love god" in that order is nowhere contiguous.
    expect(searchText('"love god"', index).total).toBe(0);
  });

  it('expands through stem groups at 0.7 and names the variant in why', () => {
    const r = searchText('love', index, { explain: true });
    expect(r.words[0]!.variants.map((v) => [v.term, v.weight, v.kind])).toEqual([
      ['love', 1, 'exact'],
      ['loved', 0.7, 'stem'],
      ['loveth', 0.7, 'stem'],
    ]);
    const jews = r.hits.find((h) => h.id === 43011036)!;
    expect(jews.why![0]).toMatch(/love~loved\(stem 0\.70, idf/);
    // Same idf for the variant as for the exact form; the 0.7 is the whole difference.
    const exactTf1 = r.hits.find((h) => h.id === 62004008)!; // "loveth … love": exact wins
    expect(exactTf1.why![0]).toMatch(/= love\(idf/);
    expect(jews.score).toBeLessThan(exactTf1.score);
  });

  it('respects the limit while still counting everything', () => {
    const r = searchText('god', index, { limit: 2 });
    expect(r.hits.length).toBe(2);
    expect(r.total).toBe(5);
  });

  it('returns nothing for empty input or words the index lacks', () => {
    expect(searchText('', index).hits).toEqual([]);
    expect(searchText('   ', index).total).toBe(0);
    expect(searchText('zzzzzz', index).total).toBe(0);
    expect(searchText('...', index).total).toBe(0);
  });

  it('highlights every variant occurrence with offsets into the verse text', () => {
    const r = searchText('love', index);
    const h = r.hits.find((x) => x.id === 62004008)!;
    expect(h.snippet.text).toBe('He that loveth not knoweth not God; for God is love.');
    expect(h.snippet.highlights.map(([s, e]) => h.snippet.text.slice(s, e))).toEqual([
      'loveth',
      'love',
    ]);
  });
});

describe('expandWord', () => {
  it('archaic map, then the archaic form’s stem group at 0.63', () => {
    const rows = [
      { id: 1, text: 'shew me thy glory' },
      { id: 2, text: 'he shewed them' },
      { id: 3, text: 'she sheweth mercy' },
    ];
    const b = buildTextIndex(rows);
    const ix = openTextIndex(b.idx, b.txt);
    const show = expandWord('show', ix);
    expect(show.variants.map((v) => [v.term, +v.weight.toFixed(2), v.kind])).toEqual([
      ['shew', 0.9, 'archaic'],
      ['shewed', 0.63, 'archaic-stem'],
      ['sheweth', 0.63, 'archaic-stem'],
    ]);
    // idf comes from the most common variant when the word itself is absent.
    expect(show.df).toBe(1);
    expect(expandWord('shew', ix).variants.map((v) => v.term)).toEqual([
      'shew',
      'shewed',
      'sheweth',
    ]);
    // An archaic hit suppresses fuzzy.
    expect(show.variants.some((v) => v.kind.startsWith('fuzzy'))).toBe(false);
  });

  it('fuzzy: DL ≤ 1 under six letters, ≤ 2 from six, top-5 by df, candidates only', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      text: `jerusalem jerusalem judah ${i < 3 ? 'salem' : 'shalem'} ${i < 2 ? 'jerusalems' : ''}`,
    }));
    const ix = openTextIndex(...(({ idx, txt }) => [idx, txt] as const)(buildTextIndex(rows)));
    const w = expandWord('jerusalm', ix);
    expect(w.variants.map((v) => [v.term, v.kind])).toEqual([['jerusalem', 'fuzzy1']]);
    expect(w.variants[0]!.weight).toBe(EXPANSION.fuzzy1);
    // "jerusalems" has df 2 < 3: not a candidate, so DL 2 never reaches it.
    expect(expandWord('jerusalemz', ix).variants.map((v) => v.term)).toEqual(['jerusalem']);
    // Short words never fuzz.
    expect(expandWord('jud', ix).variants).toEqual([]);
    expect(expandWord('judah', ix, { fuzzy: false }).variants.map((v) => v.term)).toEqual([
      'judah',
    ]);
  });
});

describe('damerauLevenshtein', () => {
  it('counts substitutions, insertions, deletions and adjacent transpositions', () => {
    expect(damerauLevenshtein('abc', 'abc', 2)).toBe(0);
    expect(damerauLevenshtein('jerusalm', 'jerusalem', 2)).toBe(1);
    expect(damerauLevenshtein('nebuchadnezar', 'nebuchadnezzar', 2)).toBe(1);
    expect(damerauLevenshtein('nebuchadnezar', 'nebuchadrezzar', 2)).toBe(2);
    expect(damerauLevenshtein('ab', 'ba', 2)).toBe(1);
    expect(damerauLevenshtein('shew', 'show', 1)).toBe(1);
  });

  it('stops early past the cap', () => {
    expect(damerauLevenshtein('abcdef', 'xyzuvw', 2)).toBe(3);
    expect(damerauLevenshtein('short', 'muchlongerword', 2)).toBe(3);
    expect(damerauLevenshtein('', 'ab', 2)).toBe(2);
  });
});

describe.skipIf(!loadTextIndex())(`searchText (real bundle; ${SKIP_REASON})`, () => {
  const real = loadTextIndex()!;

  it('never lets phrase or proximity change the order between the window and the tail', () => {
    const r = searchText('love', real, { limit: 1000, retokenizeTop: 5 });
    const scores = r.hits.map((h) => h.score);
    for (let i = 1; i < scores.length; i++) expect(scores[i]!).toBeLessThanOrEqual(scores[i - 1]!);
  });

  it('keeps every verse id unique and every highlight inside its verse', () => {
    const r = searchText('the lord is my shepherd', real, { limit: 200 });
    expect(new Set(r.hits.map((h) => h.id)).size).toBe(r.hits.length);
    for (const h of r.hits) {
      for (const [s, e] of h.snippet.highlights) {
        expect(s).toBeLessThan(e);
        expect(e).toBeLessThanOrEqual(h.snippet.text.length);
      }
    }
    expect(r.hits[0]!.id).toBe(19023001);
  });
});
