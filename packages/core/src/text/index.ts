/**
 * Reader over `verses.idx` + `verses.txt` (layout in `format.ts`). Works on
 * the raw bytes: term lookup is a binary search over the front-coded
 * dictionary's block heads, postings are decoded on demand into caller
 * buffers, verse text is decoded per verse. The only load-time work is
 * computing idf per term, reading the stem groups and collecting the fuzzy
 * candidate ids — a few milliseconds, recorded in the CP-04 file.
 */
import {
  DICT_BLOCK,
  FORMAT_VERSION,
  IDX_HEADER,
  IDX_MAGIC,
  IdxField,
  TXT_HEADER,
  TXT_MAGIC,
  TxtField,
  asciiAt,
  readVarint,
  u32At,
} from './format.js';

export class TextIndexFormatError extends Error {}

export interface TextIndex {
  readonly docCount: number;
  readonly termCount: number;
  readonly totalTokens: number;
  /** Mean tokens per verse; BM25's avgdl. */
  readonly avgDocLen: number;
  /** Largest df in the index; sizes the postings buffers. */
  readonly maxDf: number;
  /** Term ids that are fuzzy candidates (df ≥ 3 ∧ len ≥ 4), ascending. */
  readonly fuzzyCandidates: Int32Array;

  /** Dictionary rank of `term`, or −1 when absent. */
  termId(term: string): number;
  termAt(id: number): string;
  /** Every term, decoded once on first call and cached (fuzzy scans want strings). */
  allTerms(): string[];
  df(id: number): number;
  /** ln(1 + (N − df + 0.5) / (df + 0.5)), precomputed. */
  idf(id: number): number;
  /** Terms sharing a stem with `id` (including it), or undefined when it is alone. */
  stemGroup(id: number): readonly number[] | undefined;
  /**
   * Decode term `id`'s postings into `docs`/`tfs` (each at least `maxDf`
   * long) and return how many were written.
   */
  readPostings(id: number, docs: Int32Array, tfs: Int32Array): number;

  docLen(doc: number): number;
  verseIdAt(doc: number): number;
  /** Doc index of a verse id, or −1. */
  docIndexOf(verseId: number): number;
  textAt(doc: number): string;
}

function checkHeader(bytes: Uint8Array, magic: string, headerLen: number, what: string): void {
  if (bytes.length < headerLen || asciiAt(bytes, 0, 4) !== magic) {
    throw new TextIndexFormatError(`${what}: not a ${magic} file`);
  }
  const version = u32At(bytes, 4);
  if (version !== FORMAT_VERSION) {
    throw new TextIndexFormatError(`${what}: format ${version}, reader expects ${FORMAT_VERSION}`);
  }
}

export function openTextIndex(idx: Uint8Array, txt: Uint8Array): TextIndex {
  checkHeader(idx, IDX_MAGIC, IDX_HEADER, 'verses.idx');
  checkHeader(txt, TXT_MAGIC, TXT_HEADER, 'verses.txt');

  const N = u32At(idx, IdxField.docCount);
  const T = u32At(idx, IdxField.termCount);
  const totalTokens = u32At(idx, IdxField.totalTokens);
  const dictOff = u32At(idx, IdxField.dictOff);
  const metaOff = u32At(idx, IdxField.metaOff);
  const postOff = u32At(idx, IdxField.postOff);
  const docLenOff = u32At(idx, IdxField.docLenOff);
  const docIdOff = u32At(idx, IdxField.docIdOff);
  const stemOff = u32At(idx, IdxField.stemOff);
  const bitsetOff = u32At(idx, IdxField.bitsetOff);
  if (u32At(txt, TxtField.docCount) !== N) {
    throw new TextIndexFormatError('verses.txt and verses.idx disagree on the verse count');
  }
  const offsetsOff = u32At(txt, TxtField.offsetsOff);
  const blobOff = u32At(txt, TxtField.blobOff);

  // --- dictionary -----------------------------------------------------------
  const blockCount = u32At(idx, dictOff);
  const blockStart = (b: number): number => dictOff + u32At(idx, dictOff + 4 + b * 4);
  const heads: string[] = new Array<string>(blockCount);
  for (let b = 0; b < blockCount; b++) {
    const [len, pos] = readVarint(idx, blockStart(b));
    heads[b] = asciiAt(idx, pos, len);
  }
  /** Decode block `b` fully; returns its terms in order. */
  const decodeBlock = (b: number): string[] => {
    const out: string[] = [];
    let [len, pos] = readVarint(idx, blockStart(b));
    let prev = asciiAt(idx, pos, len);
    pos += len;
    out.push(prev);
    const n = Math.min(DICT_BLOCK, T - b * DICT_BLOCK);
    for (let i = 1; i < n; i++) {
      let shared: number;
      [shared, pos] = readVarint(idx, pos);
      [len, pos] = readVarint(idx, pos);
      prev = prev.slice(0, shared) + asciiAt(idx, pos, len);
      pos += len;
      out.push(prev);
    }
    return out;
  };
  let allTerms: string[] | undefined;
  const terms = (): string[] => {
    if (!allTerms) {
      allTerms = [];
      for (let b = 0; b < blockCount; b++) allTerms.push(...decodeBlock(b));
    }
    return allTerms;
  };

  const termId = (term: string): number => {
    if (blockCount === 0) return -1;
    // Last block whose head ≤ term.
    let lo = 0;
    let hi = blockCount - 1;
    if (term < heads[0]!) return -1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (heads[mid]! <= term) lo = mid;
      else hi = mid - 1;
    }
    if (heads[lo] === term) return lo * DICT_BLOCK;
    // Walk the block. Same decode as decodeBlock, stopping early.
    let [len, pos] = readVarint(idx, blockStart(lo));
    let prev = asciiAt(idx, pos, len);
    pos += len;
    const n = Math.min(DICT_BLOCK, T - lo * DICT_BLOCK);
    for (let i = 1; i < n; i++) {
      let shared: number;
      [shared, pos] = readVarint(idx, pos);
      [len, pos] = readVarint(idx, pos);
      prev = prev.slice(0, shared) + asciiAt(idx, pos, len);
      pos += len;
      if (prev === term) return lo * DICT_BLOCK + i;
      if (prev > term) return -1;
    }
    return -1;
  };

  const termAt = (id: number): string => {
    if (id < 0 || id >= T) throw new RangeError(`term id ${id} out of range`);
    if (allTerms) return allTerms[id]!;
    return decodeBlock(Math.floor(id / DICT_BLOCK))[id % DICT_BLOCK]!;
  };

  // --- term meta, idf -------------------------------------------------------
  const df = (id: number): number => u32At(idx, metaOff + id * 8);
  const idfs = new Float64Array(T);
  let maxDf = 0;
  for (let t = 0; t < T; t++) {
    const d = df(t);
    if (d > maxDf) maxDf = d;
    idfs[t] = Math.log(1 + (N - d + 0.5) / (d + 0.5));
  }

  // --- stem groups ----------------------------------------------------------
  const groupOf = new Int32Array(T).fill(-1);
  const groups: number[][] = [];
  {
    const count = u32At(idx, stemOff);
    let pos = stemOff + 4;
    for (let g = 0; g < count; g++) {
      let size: number;
      [size, pos] = readVarint(idx, pos);
      const ids: number[] = [];
      let prev = -1;
      for (let i = 0; i < size; i++) {
        let gap: number;
        [gap, pos] = readVarint(idx, pos);
        prev += gap;
        ids.push(prev);
        groupOf[prev] = g;
      }
      groups.push(ids);
    }
  }

  // --- fuzzy candidates -----------------------------------------------------
  const cand: number[] = [];
  for (let t = 0; t < T; t++) if (idx[bitsetOff + (t >> 3)]! & (1 << (t & 7))) cand.push(t);
  const fuzzyCandidates = Int32Array.from(cand);

  // --- postings -------------------------------------------------------------
  const readPostings = (id: number, docs: Int32Array, tfs: Int32Array): number => {
    const n = df(id);
    let pos = postOff + u32At(idx, metaOff + id * 8 + 4);
    let doc = -1;
    for (let k = 0; k < n; k++) {
      // Inlined LEB128 ×2: this loop is the whole cost of a common-word query.
      let gap = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = idx[pos++]!;
        gap |= (byte & 0x7f) << shift;
        shift += 7;
      } while (byte & 0x80);
      let tf = 0;
      shift = 0;
      do {
        byte = idx[pos++]!;
        tf |= (byte & 0x7f) << shift;
        shift += 7;
      } while (byte & 0x80);
      doc += gap;
      docs[k] = doc;
      tfs[k] = tf;
    }
    return n;
  };

  // --- docs -----------------------------------------------------------------
  const verseIdAt = (doc: number): number => u32At(idx, docIdOff + doc * 4);
  const docIndexOf = (verseId: number): number => {
    let lo = 0;
    let hi = N - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = verseIdAt(mid);
      if (v === verseId) return mid;
      if (v < verseId) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  };
  const decoder = new TextDecoder('utf-8');
  const textAt = (doc: number): string => {
    const start = u32At(txt, offsetsOff + doc * 4);
    const end = u32At(txt, offsetsOff + doc * 4 + 4);
    return decoder.decode(txt.subarray(blobOff + start, blobOff + end));
  };

  return {
    docCount: N,
    termCount: T,
    totalTokens,
    avgDocLen: totalTokens / N,
    maxDf,
    fuzzyCandidates,
    termId,
    termAt,
    df,
    idf: (id) => idfs[id]!,
    stemGroup: (id) => (groupOf[id]! >= 0 ? groups[groupOf[id]!] : undefined),
    readPostings,
    docLen: (doc) => idx[docLenOff + doc]!,
    verseIdAt,
    docIndexOf,
    textAt,
    allTerms: terms,
  };
}
