/**
 * Build ↔ read round trip on a synthetic corpus, then the real bundle:
 * the shipped files must be byte-identical to a fresh build from
 * `verses/*.json` (invariant 9) and within the design's size estimates.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildTextIndex, TextIndexBuildError } from '../../src/text/build.js';
import { FUZZY_MIN_DF, FUZZY_MIN_LEN } from '../../src/text/format.js';
import { openTextIndex, TextIndexFormatError } from '../../src/text/index.js';
import { isPsalm119, tokenize } from '../../src/text/tokenizer.js';
import { DATA_DIR, listVerseFiles, loadTextIndex, loadVerses, SKIP_REASON } from '../data.js';

const ROWS = [
  { id: 1001001, text: 'In the beginning God created the heaven and the earth.' },
  {
    id: 1001002,
    text: 'And the earth was without form, and void; and darkness was upon the face of the deep.',
  },
  { id: 19119105, text: 'NUN. Thy word is a lamp unto my feet, and a light unto my path.' },
  { id: 43011035, text: 'Jesus wept.' },
  { id: 43011036, text: 'Then said the Jews, Behold how he loved him!' },
  { id: 62004008, text: 'He that loveth not knoweth not God; for God is love.' },
  {
    id: 62004016,
    text: 'God is love; and he that dwelleth in love dwelleth in God, and God in him.',
  },
  { id: 66022021, text: 'The grace of our Lord Jesus Christ be with you all. Amen.' },
];

describe('buildTextIndex + openTextIndex (synthetic)', () => {
  const built = buildTextIndex(ROWS);
  const index = openTextIndex(built.idx, built.txt);

  it('is deterministic', () => {
    const again = buildTextIndex(ROWS);
    expect(Buffer.from(again.idx).equals(Buffer.from(built.idx))).toBe(true);
    expect(Buffer.from(again.txt).equals(Buffer.from(built.txt))).toBe(true);
  });

  it('reports counts that match the corpus', () => {
    expect(index.docCount).toBe(ROWS.length);
    expect(built.stats.docCount).toBe(ROWS.length);
    const expectedTokens = ROWS.reduce(
      (s, r) => s + tokenize(r.text, { acrostic: isPsalm119(r.id) }).length,
      0,
    );
    expect(index.totalTokens).toBe(expectedTokens);
    expect(index.avgDocLen).toBeCloseTo(expectedTokens / ROWS.length, 10);
    expect(index.docLen(index.docIndexOf(43011035))).toBe(2);
    expect(index.docLen(index.docIndexOf(19119105))).toBe(14); // "NUN." is not a token
  });

  it('looks terms up by binary search and reports df', () => {
    expect(index.termId('nope')).toBe(-1);
    expect(index.termId('')).toBe(-1);
    expect(index.termId('zzzz')).toBe(-1);
    expect(index.termId('aa')).toBe(-1);
    expect(index.termId('a')).toBe(0); // first term in sort order
    const god = index.termId('god');
    expect(god).toBeGreaterThanOrEqual(0);
    expect(index.termAt(god)).toBe('god');
    expect(index.df(god)).toBe(3);
    expect(index.df(index.termId('love'))).toBe(2);
    expect(index.termId('nun')).toBe(-1); // the acrostic header is never indexed
    // Every term resolves to its own id.
    const all = index.allTerms();
    expect(all.length).toBe(index.termCount);
    all.forEach((t, i) => expect(index.termId(t), t).toBe(i));
    expect([...all].sort()).toEqual(all);
  });

  it('decodes postings in doc order with term frequencies', () => {
    const docs = new Int32Array(index.maxDf);
    const tfs = new Int32Array(index.maxDf);
    const n = index.readPostings(index.termId('god'), docs, tfs);
    expect(n).toBe(3);
    const got = [...docs.subarray(0, n)].map((d, k) => [index.verseIdAt(d), tfs[k]]);
    expect(got).toEqual([
      [1001001, 1],
      [62004008, 2],
      [62004016, 3],
    ]);
    expect(index.readPostings(index.termId('wept'), docs, tfs)).toBe(1);
    expect(index.verseIdAt(docs[0]!)).toBe(43011035);
  });

  it('round-trips text and verse ids', () => {
    ROWS.forEach((r, i) => {
      expect(index.verseIdAt(i)).toBe(r.id);
      expect(index.docIndexOf(r.id)).toBe(i);
      expect(index.textAt(i)).toBe(r.text);
    });
    expect(index.docIndexOf(5)).toBe(-1);
  });

  it('writes stem groups and the fuzzy-candidate bitset', () => {
    const love = index.termId('love');
    const group = index.stemGroup(love)!.map((id) => index.termAt(id));
    expect(group).toEqual(['love', 'loved', 'loveth']);
    // A lone term is not a group.
    expect(index.stemGroup(index.termId('jesus'))).toBeUndefined();
    expect(index.stemGroup(index.termId('wept'))).toBeUndefined();
    const expected = index
      .allTerms()
      .map((t, id) => id)
      .filter((id) => index.df(id) >= FUZZY_MIN_DF && index.termAt(id).length >= FUZZY_MIN_LEN);
    expect([...index.fuzzyCandidates]).toEqual(expected);
    expect(built.stats.fuzzyCandidates).toBe(expected.length);
    expect(built.stats.stemGroups).toBeGreaterThan(0);
  });

  it('rejects unsorted rows, empty input and foreign bytes', () => {
    expect(() => buildTextIndex([])).toThrow(TextIndexBuildError);
    expect(() => buildTextIndex([ROWS[1]!, ROWS[0]!])).toThrow(/ascending/);
    expect(() => openTextIndex(built.txt, built.idx)).toThrow(TextIndexFormatError);
    expect(() => openTextIndex(new Uint8Array(10), built.txt)).toThrow(/not a TGIX/);
  });
});

describe.skipIf(!loadTextIndex())(`real bundle (${SKIP_REASON})`, () => {
  const index = loadTextIndex()!;
  const ESTIMATE = {
    idxRaw: 1.85e6,
    idxBrotli: 1.0e6,
    txtRaw: 5.4e6,
    txtGzip: 1.5e6,
  };

  it('is byte-identical to a fresh build from verses/*.json', () => {
    const rows = listVerseFiles()
      .flatMap((osis) => loadVerses(osis)!.verses.map((v) => ({ id: v.id, text: v.text })))
      .sort((a, b) => a.id - b.id);
    const fresh = buildTextIndex(rows);
    const idx = readFileSync(join(DATA_DIR, 'verses.idx'));
    const txt = readFileSync(join(DATA_DIR, 'verses.txt'));
    expect(idx.equals(Buffer.from(fresh.idx))).toBe(true);
    expect(txt.equals(Buffer.from(fresh.txt))).toBe(true);
    expect(index.docCount).toBe(31102);
  });

  it('matches the design measurements', () => {
    expect(index.termCount).toBeGreaterThan(12000);
    expect(index.termCount).toBeLessThan(13000);
    expect(index.avgDocLen).toBeGreaterThan(25);
    expect(index.avgDocLen).toBeLessThan(26);
    expect(index.fuzzyCandidates.length).toBeGreaterThan(6000);
    expect(index.df(index.termId('shew'))).toBe(218);
    expect(index.df(index.termId('love'))).toBe(281);
    expect(index.termId('show')).toBe(-1);
  });

  it('every verse re-tokenizes to dictionary terms and its recorded docLen', () => {
    for (let doc = 0; doc < index.docCount; doc++) {
      const toks = tokenize(index.textAt(doc), { acrostic: isPsalm119(index.verseIdAt(doc)) });
      expect(toks.length).toBe(index.docLen(doc));
      for (const t of toks) if (index.termId(t.term) < 0) throw new Error(`${t.term} missing`);
    }
  });

  // brotli at its default quality takes ~8 s over the 4 MB text blob.
  it('stays within the size estimates (raw ±20%, compressed ≤ +20%)', { timeout: 60_000 }, () => {
    const idx = readFileSync(join(DATA_DIR, 'verses.idx'));
    const txt = readFileSync(join(DATA_DIR, 'verses.txt'));
    const sizes = {
      idxRaw: idx.length,
      idxGzip: gzipSync(idx).length,
      idxBrotli: brotliCompressSync(idx).length,
      txtRaw: txt.length,
      txtGzip: gzipSync(txt).length,
      txtBrotli: brotliCompressSync(txt).length,
    };
    const mb = (n: number): string => `${(n / 1e6).toFixed(2)} MB`;
    console.info(
      `verses.idx ${mb(sizes.idxRaw)} raw / ${mb(sizes.idxGzip)} gz / ${mb(sizes.idxBrotli)} br` +
        ` (est ${mb(ESTIMATE.idxRaw)} / ~${mb(ESTIMATE.idxBrotli)} br)\n` +
        `verses.txt ${mb(sizes.txtRaw)} raw / ${mb(sizes.txtGzip)} gz / ${mb(sizes.txtBrotli)} br` +
        ` (est ${mb(ESTIMATE.txtRaw)} / ${mb(ESTIMATE.txtGzip)} gz)`,
    );
    expect(sizes.idxRaw).toBeGreaterThan(ESTIMATE.idxRaw * 0.8);
    expect(sizes.idxRaw).toBeLessThan(ESTIMATE.idxRaw * 1.2);
    expect(sizes.txtRaw).toBeGreaterThan(ESTIMATE.txtRaw * 0.8);
    expect(sizes.txtRaw).toBeLessThan(ESTIMATE.txtRaw * 1.2);
    expect(sizes.idxBrotli).toBeLessThan(ESTIMATE.idxBrotli * 1.2);
    expect(sizes.txtGzip).toBeLessThan(ESTIMATE.txtGzip * 1.2);
  });
});
