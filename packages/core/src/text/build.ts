/**
 * Builds `verses.idx` + `verses.txt` from `{ id, text }` rows (format in
 * `format.ts`). Lives in `core` rather than the data pipeline so the same
 * code can build the index in a browser or the CLI as a fallback — and so
 * the goldens test the bytes the site ships, not a reimplementation.
 *
 * Deterministic: same rows in → same bytes out. No timestamps, no hashing
 * of object identity; terms are sorted by code point and docs by verse id.
 *
 * After writing, the build reads its own output back with `openTextIndex`,
 * decodes every verse, re-tokenizes it and rebuilds; the two byte arrays
 * must be identical and every term must resolve through the dictionary's
 * binary search. That is the round-trip assertion the design asks for: if
 * the tokenizer ever disagrees with itself between build and query, the
 * build fails rather than shipping an index that silently misses words.
 */
import {
  ByteWriter,
  DICT_BLOCK,
  FORMAT_VERSION,
  FUZZY_MIN_DF,
  FUZZY_MIN_LEN,
  IDX_HEADER,
  IDX_MAGIC,
  IdxField,
  TXT_HEADER,
  TXT_MAGIC,
  TxtField,
} from './format.js';
import { openTextIndex } from './index.js';
import { foldText, isPsalm119, stem, tokenize } from './tokenizer.js';

export interface TextRow {
  /** Verse id, BBCCCVVV. Rows must be in ascending id order. */
  id: number;
  text: string;
}

export interface TextIndexStats {
  docCount: number;
  termCount: number;
  postings: number;
  totalTokens: number;
  avgDocLen: number;
  maxDocLen: number;
  stemGroups: number;
  fuzzyCandidates: number;
  idxBytes: number;
  txtBytes: number;
}

export interface TextIndexBuild {
  idx: Uint8Array;
  txt: Uint8Array;
  stats: TextIndexStats;
}

export interface BuildTextIndexOptions {
  /** Skip the read-back round trip (the round trip itself uses this). */
  verify?: boolean;
}

export class TextIndexBuildError extends Error {}

function fail(msg: string): never {
  throw new TextIndexBuildError(msg);
}

/** Longest common prefix length of two ASCII strings. */
function lcp(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

export function buildTextIndex(
  rows: readonly TextRow[],
  opts: BuildTextIndexOptions = {},
): TextIndexBuild {
  const N = rows.length;
  if (N === 0) fail('no rows');

  // --- pass 1: tokenize, collect per-doc term frequencies -------------------
  const docLen = new Uint8Array(N);
  const docTf: Map<string, number>[] = new Array<Map<string, number>>(N);
  const df = new Map<string, number>();
  let totalTokens = 0;
  let maxDocLen = 0;
  for (let i = 0; i < N; i++) {
    const row = rows[i]!;
    if (i > 0 && row.id <= rows[i - 1]!.id) fail(`rows not in ascending id order at ${row.id}`);
    if (foldText(row.text).length !== row.text.length) {
      fail(`verse ${row.id}: normalization changes the text length; offsets would drift`);
    }
    const toks = tokenize(row.text, { acrostic: isPsalm119(row.id) });
    if (toks.length > 255) fail(`verse ${row.id}: ${toks.length} tokens exceeds the u8 docLen`);
    docLen[i] = toks.length;
    totalTokens += toks.length;
    if (toks.length > maxDocLen) maxDocLen = toks.length;
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t.term, (tf.get(t.term) ?? 0) + 1);
    docTf[i] = tf;
    for (const term of tf.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  }

  // --- dictionary: sorted terms; id = rank ----------------------------------
  const terms = [...df.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const T = terms.length;
  const idOf = new Map<string, number>(terms.map((t, i) => [t, i]));

  // --- postings: per term, (docIndex, tf) in doc order ----------------------
  const postDocs: number[][] = terms.map(() => []);
  const postTfs: number[][] = terms.map(() => []);
  for (let i = 0; i < N; i++) {
    for (const [term, tf] of docTf[i]!) {
      const id = idOf.get(term)!;
      postDocs[id]!.push(i);
      postTfs[id]!.push(tf);
    }
  }

  // --- idx --------------------------------------------------------------------
  const w = new ByteWriter();
  w.ascii(IDX_MAGIC);
  while (w.length < IDX_HEADER) w.u8(0);
  w.patchU32(IdxField.version, FORMAT_VERSION);
  w.patchU32(IdxField.docCount, N);
  w.patchU32(IdxField.termCount, T);

  // dict
  const dictOff = w.length;
  const blockCount = Math.ceil(T / DICT_BLOCK);
  w.u32(blockCount);
  const blockTable = w.length;
  for (let b = 0; b < blockCount; b++) w.u32(0);
  for (let b = 0; b < blockCount; b++) {
    w.patchU32(blockTable + b * 4, w.length - dictOff);
    const first = terms[b * DICT_BLOCK]!;
    w.varint(first.length);
    w.ascii(first);
    let prev = first;
    for (let i = b * DICT_BLOCK + 1; i < Math.min(T, (b + 1) * DICT_BLOCK); i++) {
      const term = terms[i]!;
      const shared = lcp(prev, term);
      w.varint(shared);
      w.varint(term.length - shared);
      w.ascii(term.slice(shared));
      prev = term;
    }
  }
  w.patchU32(IdxField.dictOff, dictOff);
  w.patchU32(IdxField.dictLen, w.length - dictOff);

  // postings first into a scratch writer so meta can carry offsets
  const post = new ByteWriter();
  const postOffsets = new Uint32Array(T);
  let postingsCount = 0;
  for (let t = 0; t < T; t++) {
    postOffsets[t] = post.length;
    const docs = postDocs[t]!;
    const tfs = postTfs[t]!;
    let prev = -1;
    for (let k = 0; k < docs.length; k++) {
      post.varint(docs[k]! - prev);
      post.varint(tfs[k]!);
      prev = docs[k]!;
      postingsCount++;
    }
  }

  // meta
  w.align(4);
  const metaOff = w.length;
  for (let t = 0; t < T; t++) {
    w.u32(df.get(terms[t]!)!);
    w.u32(postOffsets[t]!);
  }
  w.patchU32(IdxField.metaOff, metaOff);
  w.patchU32(IdxField.metaLen, w.length - metaOff);

  const postOff = w.length;
  w.bytes(post.finish());
  w.patchU32(IdxField.postOff, postOff);
  w.patchU32(IdxField.postLen, w.length - postOff);

  // docLen, docId
  const docLenOff = w.length;
  w.bytes(docLen);
  w.patchU32(IdxField.docLenOff, docLenOff);
  w.align(4);
  const docIdOff = w.length;
  for (let i = 0; i < N; i++) w.u32(rows[i]!.id);
  w.patchU32(IdxField.docIdOff, docIdOff);

  // stem groups
  const byStem = new Map<string, number[]>();
  for (let t = 0; t < T; t++) {
    const s = stem(terms[t]!);
    const g = byStem.get(s);
    if (g) g.push(t);
    else byStem.set(s, [t]);
  }
  const groups = [...byStem.entries()]
    .filter(([, ids]) => ids.length >= 2)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, ids]) => ids);
  const stemOff = w.length;
  w.u32(groups.length);
  for (const ids of groups) {
    w.varint(ids.length);
    let prev = -1;
    for (const id of ids) {
      w.varint(id - prev);
      prev = id;
    }
  }
  w.patchU32(IdxField.stemOff, stemOff);
  w.patchU32(IdxField.stemLen, w.length - stemOff);

  // fuzzy-candidate bitset
  const bitsetOff = w.length;
  const bits = new Uint8Array(Math.ceil(T / 8));
  let fuzzyCandidates = 0;
  for (let t = 0; t < T; t++) {
    const term = terms[t]!;
    if (df.get(term)! >= FUZZY_MIN_DF && term.length >= FUZZY_MIN_LEN) {
      bits[t >> 3]! |= 1 << (t & 7);
      fuzzyCandidates++;
    }
  }
  w.bytes(bits);
  w.patchU32(IdxField.bitsetOff, bitsetOff);
  w.patchU32(IdxField.totalTokens, totalTokens);
  const idx = w.finish();

  // --- txt --------------------------------------------------------------------
  const enc = new TextEncoder();
  const encoded = rows.map((r) => enc.encode(r.text));
  const tw = new ByteWriter();
  tw.ascii(TXT_MAGIC);
  while (tw.length < TXT_HEADER) tw.u8(0);
  tw.patchU32(TxtField.version, FORMAT_VERSION);
  tw.patchU32(TxtField.docCount, N);
  const offsetsOff = tw.length;
  let running = 0;
  for (const e of encoded) {
    tw.u32(running);
    running += e.length;
  }
  tw.u32(running);
  const idsOff = tw.length;
  for (const r of rows) tw.u32(r.id);
  const blobOff = tw.length;
  for (const e of encoded) tw.bytes(e);
  tw.patchU32(TxtField.offsetsOff, offsetsOff);
  tw.patchU32(TxtField.idsOff, idsOff);
  tw.patchU32(TxtField.blobOff, blobOff);
  tw.patchU32(TxtField.blobLen, running);
  const txt = tw.finish();

  const stats: TextIndexStats = {
    docCount: N,
    termCount: T,
    postings: postingsCount,
    totalTokens,
    avgDocLen: totalTokens / N,
    maxDocLen,
    stemGroups: groups.length,
    fuzzyCandidates,
    idxBytes: idx.length,
    txtBytes: txt.length,
  };

  if (opts.verify !== false) verifyRoundTrip(idx, txt, stats);
  return { idx, txt, stats };
}

/**
 * Read the freshly written files back, re-tokenize every decoded verse
 * through the reader's own dictionary lookup, and rebuild; the bytes must
 * match exactly.
 */
function verifyRoundTrip(idx: Uint8Array, txt: Uint8Array, stats: TextIndexStats): void {
  const index = openTextIndex(idx, txt);
  if (index.docCount !== stats.docCount || index.termCount !== stats.termCount) {
    fail('round trip: header counts differ from what was written');
  }
  const rows: TextRow[] = [];
  for (let i = 0; i < index.docCount; i++) {
    const id = index.verseIdAt(i);
    const text = index.textAt(i);
    for (const tok of tokenize(text, { acrostic: isPsalm119(id) })) {
      if (index.termId(tok.term) === -1) {
        fail(`round trip: verse ${id}: term "${tok.term}" is not in the dictionary`);
      }
    }
    rows.push({ id, text });
  }
  const again = buildTextIndex(rows, { verify: false });
  if (!sameBytes(again.idx, idx))
    fail('round trip: rebuilding from the decoded text changed verses.idx');
  if (!sameBytes(again.txt, txt))
    fail('round trip: rebuilding from the decoded text changed verses.txt');
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
