/**
 * Verse text ranking — the one place the formulas in
 * docs/search-design.md §"Ranking formulas › Verse text" are implemented
 * (invariant 4). Change the doc, then this file, then the goldens.
 *
 *   idf  = ln(1 + (N − df + 0.5) / (df + 0.5))
 *   tfn  = tf·(k1 + 1) / (tf + k1·(1 − b + b·L'/avgL))       L' = max(L, 8)
 *   bm25 = Σ_w  wt_w · idf_w · tfn_w        wt = weight of the best variant of w
 *   cov  = matched non-weak words / non-weak words          (1 when none)
 *   base = bm25 · cov^1.5
 *   phrase = +0.5·base   when every query word appears contiguously, in order
 *   prox   = 0.25·base / (1 + minSpan − m)   over the m ≥ 2 words the verse matched
 *   score  = base + phrase + prox            ties → verse id ascending
 *
 * Candidates come from the postings of non-weak words (df ≤ 0.5·N); weak
 * words add to the score of verses already there. When every word is weak,
 * the rarest one generates. Phrase and proximity are computed by
 * re-tokenizing the top `retokenizeTop` verses by base — the index stores no
 * positions — so a verse outside that window keeps its base score. Because
 * the boosts only add, the window's verses still sort ahead of the rest.
 *
 * `searchText` is a pure function of (query, opts, index bytes): no clock,
 * no randomness, stable ordering (invariant 9).
 */
import { expandWord, type ExpandedWord } from './expand.js';
import type { TextIndex } from './index.js';
import { highlight, type Snippet } from './snippet.js';
import { isPsalm119, terms, tokenize, type Token } from './tokenizer.js';

/**
 * BM25 and boost constants. `b = 0.4` with `L' = max(L, 8)` caps the
 * short-verse advantage at ~18% (b = 0.75 gave 55%); `cov^1.5` makes a
 * 1-of-3 match score 0.19× of a full one — the fix for "short verses and
 * partial matches over-ranked" in the 2020 backlog.
 */
export const BM25 = {
  k1: 1.2,
  b: 0.4,
  /** Verses shorter than this are scored as if they were this long. */
  minDocLen: 8,
  covExponent: 1.5,
  phraseBoost: 0.5,
  proxBoost: 0.25,
  /** How many top-by-base verses are re-tokenized for phrase/proximity. */
  retokenizeTop: 300,
  /** Longest query, in words, that is scored; extra words are ignored (word bits live in an int32). */
  maxWords: 30,
} as const;

export interface TextSearchOptions {
  /** Verse-id predicate applied while walking postings (`in:` scope). */
  scope?: (verseId: number) => boolean;
  /** Hits to return with snippet and `why`; `total` counts all matches. */
  limit?: number;
  explain?: boolean;
  fuzzy?: boolean;
  /**
   * Keep only verses containing the whole query as a contiguous phrase.
   * A query wrapped in double quotes sets this itself.
   */
  phrase?: boolean;
  retokenizeTop?: number;
  /**
   * Also return `ranked`: every matching verse in rank order with its score,
   * coverage and phrase flag, without snippets. The cross-group merge uses
   * it to combine text evidence with graph hops for verses beyond `limit`.
   */
  ranked?: boolean;
}

export interface TextHit {
  id: number;
  score: number;
  snippet: Snippet;
  why?: string[];
}

/** One entry of `TextSearchResult.ranked`. */
export interface RankedVerse {
  id: number;
  score: number;
  /** Matched non-weak words / non-weak words (1 when there are none). */
  cov: number;
  /** The whole query appears contiguously, in order. Only known inside the re-tokenized window. */
  phrase: boolean;
}

export interface TextSearchResult {
  query: string;
  /** Query words after tokenization, with their expansions. */
  words: ExpandedWord[];
  hits: TextHit[];
  /** Matching verses in total, not just the returned `hits`. */
  total: number;
  /** Every query word is weak (df > 0.5·N); the rarest one generated candidates. */
  allWeak: boolean;
  phrase: boolean;
  /** Present when `opts.ranked` is set: all `total` verses in rank order. */
  ranked?: RankedVerse[];
}

/** tf normalization; exported so `why` and the tests compute it from one place. */
export function tfNorm(tf: number, docLen: number, avgDocLen: number): number {
  const L = Math.max(docLen, BM25.minDocLen);
  return (tf * (BM25.k1 + 1)) / (tf + BM25.k1 * (1 - BM25.b + (BM25.b * L) / avgDocLen));
}

interface Scored {
  doc: number;
  base: number;
  matched: number;
}

export function searchText(
  query: string,
  index: TextIndex,
  opts: TextSearchOptions = {},
): TextSearchResult {
  const trimmed = query.trim();
  const quoted = /^"[^"]*"$/.test(trimmed);
  const phrase = opts.phrase ?? quoted;
  const rawWords = terms(quoted ? trimmed.slice(1, -1) : trimmed);
  const wordList = [...new Set(rawWords)].slice(0, BM25.maxWords);
  const words = wordList.map((w) => expandWord(w, index, { fuzzy: opts.fuzzy ?? true }));
  const empty: TextSearchResult = { query, words, hits: [], total: 0, allWeak: false, phrase };
  if (opts.ranked) empty.ranked = [];
  const usable = words.filter((w) => w.variants.length > 0);
  if (usable.length === 0) return empty;

  const N = index.docCount;
  const avgL = index.avgDocLen;
  const nonWeak = words.filter((w) => !w.weak);
  const allWeak = nonWeak.length === 0;
  let generators = nonWeak.filter((w) => w.variants.length > 0);
  if (generators.length === 0) {
    // Every word is weak: the rarest one generates (design: "if all weak, use rarest").
    generators = [usable.reduce((a, b) => (b.df < a.df ? b : a))];
  }
  const generating = new Set(generators);
  const ordered = [...generators, ...words.filter((w) => !generating.has(w) && w.variants.length)];
  const wordBit = new Map<ExpandedWord, number>(words.map((w, i) => [w, 1 << i]));
  const nonWeakMask = nonWeak.reduce((m, w) => m | wordBit.get(w)!, 0);
  const allMask = words.reduce((m, w) => m | wordBit.get(w)!, 0);
  const nonWeakCount = nonWeak.length;

  // --- scoring pass over postings -------------------------------------------
  const score = new Float64Array(N);
  const matched = new Uint32Array(N);
  const isCand = new Uint8Array(N);
  const candList: number[] = [];
  const wordBest = new Float64Array(N);
  const touched = new Int32Array(N);
  const docs = new Int32Array(index.maxDf);
  const tfs = new Int32Array(index.maxDf);
  const scope = opts.scope;

  for (const w of ordered) {
    const generates = generating.has(w);
    const bit = wordBit.get(w)!;
    let nTouched = 0;
    for (const v of w.variants) {
      const n = index.readPostings(v.termId, docs, tfs);
      for (let k = 0; k < n; k++) {
        const doc = docs[k]!;
        if (!isCand[doc]) {
          if (!generates) continue;
          if (scope && !scope(index.verseIdAt(doc))) continue;
          isCand[doc] = 1;
          candList.push(doc);
        }
        const val = v.weight * tfNorm(tfs[k]!, index.docLen(doc), avgL);
        if (wordBest[doc] === 0) touched[nTouched++] = doc;
        if (val > wordBest[doc]!) wordBest[doc] = val;
      }
    }
    for (let i = 0; i < nTouched; i++) {
      const doc = touched[i]!;
      score[doc] = score[doc]! + w.idf * wordBest[doc]!;
      matched[doc] = matched[doc]! | bit;
      wordBest[doc] = 0;
    }
  }

  // --- coverage, ordering -----------------------------------------------------
  const scored: Scored[] = [];
  for (const doc of candList) {
    const m = matched[doc]!;
    if (phrase && (m & allMask) !== allMask) continue;
    const cov = nonWeakCount === 0 ? 1 : popcount(m & nonWeakMask) / nonWeakCount;
    scored.push({ doc, base: score[doc]! * Math.pow(cov, BM25.covExponent), matched: m });
  }
  scored.sort((a, b) => b.base - a.base || a.doc - b.doc);

  // --- phrase / proximity over the top window ---------------------------------
  const top = Math.min(scored.length, opts.retokenizeTop ?? BM25.retokenizeTop);
  const variantWord = new Map<string, number>(); // term → word bit
  for (const w of words) {
    for (const v of w.variants) {
      variantWord.set(v.term, (variantWord.get(v.term) ?? 0) | wordBit.get(w)!);
    }
  }
  const tokensOf = new Map<number, Token[]>();
  const finalScore = new Map<number, number>();
  const boosts = new Map<number, { phrase: boolean; span: number; m: number }>();
  const head: Scored[] = [];
  for (let i = 0; i < top; i++) {
    const s = scored[i]!;
    const id = index.verseIdAt(s.doc);
    const toks = tokenize(index.textAt(s.doc), { acrostic: isPsalm119(id) });
    tokensOf.set(s.doc, toks);
    const bits = toks.map((t) => variantWord.get(t.term) ?? 0);
    const hasPhrase =
      words.length >= 2 &&
      containsPhrase(
        bits,
        words.map((w) => wordBit.get(w)!),
      );
    if (phrase && !hasPhrase) continue;
    let total = s.base;
    let span = 0;
    const m = popcount(s.matched);
    if (hasPhrase) total += BM25.phraseBoost * s.base;
    if (m >= 2) {
      span = minSpan(bits, s.matched);
      total += (BM25.proxBoost * s.base) / (1 + span - m);
    }
    finalScore.set(s.doc, total);
    boosts.set(s.doc, { phrase: hasPhrase, span, m });
    head.push(s);
  }
  head.sort((a, b) => finalScore.get(b.doc)! - finalScore.get(a.doc)! || a.doc - b.doc);
  const tail = phrase ? [] : scored.slice(top);
  const total = head.length + tail.length;

  // --- hits --------------------------------------------------------------------
  const limit = opts.limit ?? 50;
  const hits: TextHit[] = [];
  const out = [...head, ...tail].slice(0, limit);
  for (const s of out) {
    const id = index.verseIdAt(s.doc);
    const text = index.textAt(s.doc);
    const toks = tokensOf.get(s.doc) ?? tokenize(text, { acrostic: isPsalm119(id) });
    const hit: TextHit = {
      id,
      score: finalScore.get(s.doc) ?? s.base,
      snippet: highlight(text, toks, variantWord),
    };
    if (opts.explain) hit.why = explain(s, toks, words, index, boosts.get(s.doc), nonWeakCount);
    hits.push(hit);
  }

  const result: TextSearchResult = { query, words, hits, total, allWeak, phrase };
  if (opts.ranked) {
    const covOf = (m: number): number =>
      nonWeakCount === 0 ? 1 : popcount(m & nonWeakMask) / nonWeakCount;
    result.ranked = [...head, ...tail].map((s) => ({
      id: index.verseIdAt(s.doc),
      score: finalScore.get(s.doc) ?? s.base,
      cov: covOf(s.matched),
      phrase: boosts.get(s.doc)?.phrase ?? false,
    }));
  }
  return result;
}

function popcount(x: number): number {
  let n = 0;
  while (x) {
    x &= x - 1;
    n++;
  }
  return n;
}

/** True when some run of tokens carries the word bits in query order. */
function containsPhrase(bits: number[], order: number[]): boolean {
  outer: for (let p = 0; p + order.length <= bits.length; p++) {
    for (let j = 0; j < order.length; j++) if (!(bits[p + j]! & order[j]!)) continue outer;
    return true;
  }
  return false;
}

/**
 * Smallest token window containing every word in `mask` at least once.
 * Sliding window over the token stream; a token carrying several words'
 * bits (the same variant reached from two words) counts for all of them.
 */
function minSpan(bits: number[], mask: number): number {
  const need = popcount(mask);
  const count = new Map<number, number>();
  let have = 0;
  let best = Infinity;
  let left = 0;
  for (let right = 0; right < bits.length; right++) {
    const b = bits[right]! & mask;
    if (!b) continue;
    for (let bit = 1; bit <= b; bit <<= 1) {
      if (b & bit) {
        const c = (count.get(bit) ?? 0) + 1;
        count.set(bit, c);
        if (c === 1) have++;
      }
    }
    while (have === need) {
      best = Math.min(best, right - left + 1);
      const lb = bits[left]! & mask;
      for (let bit = 1; bit <= lb; bit <<= 1) {
        if (lb & bit) {
          const c = count.get(bit)! - 1;
          count.set(bit, c);
          if (c === 0) have--;
        }
      }
      left++;
    }
  }
  return best === Infinity ? bits.length : best;
}

/**
 * Recomputes the parts from the verse's own tokens, which the build's
 * round-trip check guarantees agree with the postings:
 *   bm25 8.05 = beginning(idf 5.70, tf 1) + in(idf 0.91, tf 1) + the(idf 0.26, tf 3)
 *   cov 1.00
 *   phrase +50%
 *   prox +25% (span 3)
 */
function explain(
  s: Scored,
  toks: Token[],
  words: readonly ExpandedWord[],
  index: TextIndex,
  boost: { phrase: boolean; span: number; m: number } | undefined,
  nonWeakCount: number,
): string[] {
  const tf = new Map<string, number>();
  for (const t of toks) tf.set(t.term, (tf.get(t.term) ?? 0) + 1);
  const L = toks.length;
  const parts: string[] = [];
  let bm25 = 0;
  let matchedNonWeak = 0;
  for (const w of words) {
    let bestVal = 0;
    let bestV: { term: string; weight: number; kind: string; tf: number } | undefined;
    for (const v of w.variants) {
      const n = tf.get(v.term) ?? 0;
      if (n === 0) continue;
      const val = v.weight * tfNorm(n, L, index.avgDocLen);
      if (val > bestVal) {
        bestVal = val;
        bestV = { term: v.term, weight: v.weight, kind: v.kind, tf: n };
      }
    }
    if (!bestV) continue;
    if (!w.weak) matchedNonWeak++;
    bm25 += w.idf * bestVal;
    const via =
      bestV.kind === 'exact'
        ? `${w.word}(`
        : `${w.word}~${bestV.term}(${bestV.kind} ${bestV.weight.toFixed(2)}, `;
    parts.push(`${via}idf ${w.idf.toFixed(2)}, tf ${bestV.tf}${w.weak ? ', weak' : ''})`);
  }
  const cov = nonWeakCount === 0 ? 1 : matchedNonWeak / nonWeakCount;
  const why = [`bm25 ${bm25.toFixed(2)} = ${parts.join(' + ')}`, `cov ${cov.toFixed(2)}`];
  if (cov < 1) why[1] += ` → ×${Math.pow(cov, BM25.covExponent).toFixed(2)}`;
  if (boost?.phrase) why.push(`phrase +${Math.round(BM25.phraseBoost * 100)}%`);
  if (boost && boost.m >= 2) {
    const pct = (BM25.proxBoost * 100) / (1 + boost.span - boost.m);
    why.push(`prox +${pct.toFixed(0)}% (span ${boost.span})`);
  }
  return why;
}

export interface VerseDetail {
  snippet: Snippet;
  why: string[];
  /** Words the verse matched (weak included) and whether they appear as a contiguous phrase. */
  matched: number;
  phrase: boolean;
}

/**
 * Snippet and `why` for any verse against an already-expanded query — the
 * cross-group merge needs this for verses it reaches through the graph, which
 * may sit outside the text layer's returned window. Recomputes the same
 * parts `explain` does from the verse's own tokens; a verse matching no
 * query word gets a plain snippet and an empty `why`.
 */
export function verseDetail(
  index: TextIndex,
  words: readonly ExpandedWord[],
  verseId: number,
): VerseDetail {
  const doc = index.docIndexOf(verseId);
  if (doc < 0) throw new RangeError(`verse ${verseId} is not in the text index`);
  const text = index.textAt(doc);
  const toks = tokenize(text, { acrostic: isPsalm119(verseId) });
  const variantWord = new Map<string, number>();
  words.forEach((w, i) => {
    for (const v of w.variants) variantWord.set(v.term, (variantWord.get(v.term) ?? 0) | (1 << i));
  });
  const snippet = highlight(text, toks, variantWord);
  const bits = toks.map((t) => variantWord.get(t.term) ?? 0);
  let matched = 0;
  for (const b of bits) matched |= b;
  if (matched === 0) return { snippet, why: [], matched: 0, phrase: false };
  const m = popcount(matched);
  const hasPhrase =
    words.length >= 2 &&
    containsPhrase(
      bits,
      words.map((_, i) => 1 << i),
    );
  const span = m >= 2 ? minSpan(bits, matched) : 0;
  const nonWeakCount = words.filter((w) => !w.weak).length;
  const scored: Scored = { doc, base: 0, matched };
  const why = explain(scored, toks, words, index, { phrase: hasPhrase, span, m }, nonWeakCount);
  return { snippet, why, matched, phrase: hasPhrase };
}
