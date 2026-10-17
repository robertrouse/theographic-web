/**
 * Query-word expansion (docs/search-design.md §Ranking, "Verse text"). The
 * index holds surface forms only; the *query* is widened to weighted
 * variants so "show" finds "shew" and "love" finds "loveth", and every
 * variant carries a kind the hit's `why` can name.
 *
 *   exact         1.0   the word itself, when in the dictionary
 *   archaic       0.9   curated pair from `archaic.json` (× the pair's weight)
 *   stem          0.7   the exact term's stem group
 *   archaic+stem  0.63  an archaic variant's stem group — so "show" reaches
 *                       "shewed" the way "shew" does (0.9 × 0.7)
 *   fuzzy1/2      0.6 / 0.4   Damerau-Levenshtein ≤ 1 (len < 6) or ≤ 2, over
 *                       the candidate bitset (df ≥ 3 ∧ len ≥ 4), top-5 by df;
 *                       only when the word is absent or df < 3 AND nothing
 *                       archaic matched, and only for words of ≥ 4 chars
 *
 * A term reached by several routes keeps its highest weight. A word's idf is
 * taken from its exact df, or, when it is not in the dictionary, from its
 * most common variant — so the 0.7 on a stem variant really is "70% of an
 * exact match" rather than being inflated by the variant's own rarity.
 */
import pairs from './archaic.json' with { type: 'json' };
import { damerauLevenshtein } from '../damerau.js';
import type { TextIndex } from './index.js';

export type VariantKind = 'exact' | 'archaic' | 'stem' | 'archaic-stem' | 'fuzzy1' | 'fuzzy2';

export interface Variant {
  termId: number;
  term: string;
  weight: number;
  kind: VariantKind;
}

export interface ExpandedWord {
  word: string;
  /** Sorted by weight desc, then term. Empty when nothing in the index matches. */
  variants: Variant[];
  /** df the idf is computed from: the exact term's, else the top variant's. */
  df: number;
  idf: number;
  /** df > WEAK_DF_RATIO · N: scores but never generates candidates. */
  weak: boolean;
}

export const EXPANSION = {
  exact: 1.0,
  archaic: 0.9,
  stem: 0.7,
  fuzzy1: 0.6,
  fuzzy2: 0.4,
  fuzzyTop: 5,
  fuzzyMinLen: 4,
  /** Fuzzy fires only when the word's exact df is below this. */
  fuzzyMaxDf: 3,
  /** Words present in more than this share of verses are "weak". */
  weakDfRatio: 0.5,
} as const;

/** Both directions of every curated pair: word → [[other, weight]]. */
const ARCHAIC: Map<string, [string, number][]> = (() => {
  const m = new Map<string, [string, number][]>();
  const add = (from: string, to: string, w: number): void => {
    const list = m.get(from) ?? [];
    if (!list.some(([t]) => t === to)) list.push([to, w]);
    m.set(from, list);
  };
  for (const p of pairs.pairs as (string | number)[][]) {
    const [a, b, w = 1] = p as [string, string, number?];
    add(a, b, w);
    add(b, a, w);
  }
  return m;
})();

export function archaicForms(word: string): readonly [string, number][] {
  return ARCHAIC.get(word) ?? [];
}

export interface ExpandOptions {
  fuzzy?: boolean;
}

export function expandWord(word: string, index: TextIndex, opts: ExpandOptions = {}): ExpandedWord {
  const best = new Map<number, Variant>();
  const offer = (termId: number, weight: number, kind: VariantKind): void => {
    if (termId < 0) return;
    const have = best.get(termId);
    if (!have || have.weight < weight) {
      best.set(termId, { termId, term: index.termAt(termId), weight, kind });
    }
  };

  const exactId = index.termId(word);
  offer(exactId, EXPANSION.exact, 'exact');

  const archaicIds: number[] = [];
  for (const [form, w] of archaicForms(word)) {
    const id = index.termId(form);
    if (id >= 0) {
      archaicIds.push(id);
      offer(id, EXPANSION.archaic * w, 'archaic');
    }
  }

  if (exactId >= 0) {
    for (const id of index.stemGroup(exactId) ?? []) {
      if (id !== exactId) offer(id, EXPANSION.stem, 'stem');
    }
  }
  for (const aid of archaicIds) {
    const w = best.get(aid)!.weight;
    for (const id of index.stemGroup(aid) ?? []) {
      if (id !== aid) offer(id, w * EXPANSION.stem, 'archaic-stem');
    }
  }

  const exactDf = exactId >= 0 ? index.df(exactId) : 0;
  const wantFuzzy =
    opts.fuzzy !== false &&
    word.length >= EXPANSION.fuzzyMinLen &&
    exactDf < EXPANSION.fuzzyMaxDf &&
    archaicIds.length === 0;
  if (wantFuzzy) {
    const maxDl = word.length < 6 ? 1 : 2;
    const terms = index.allTerms();
    const found: { id: number; dl: number; df: number }[] = [];
    const cands = index.fuzzyCandidates;
    for (let i = 0; i < cands.length; i++) {
      const id = cands[i]!;
      if (id === exactId) continue;
      const term = terms[id]!;
      if (Math.abs(term.length - word.length) > maxDl) continue;
      const dl = damerauLevenshtein(word, term, maxDl);
      if (dl <= maxDl) found.push({ id, dl, df: index.df(id) });
    }
    found.sort((a, b) => b.df - a.df || a.id - b.id);
    for (const f of found.slice(0, EXPANSION.fuzzyTop)) {
      offer(
        f.id,
        f.dl === 1 ? EXPANSION.fuzzy1 : EXPANSION.fuzzy2,
        f.dl === 1 ? 'fuzzy1' : 'fuzzy2',
      );
    }
  }

  const variants = [...best.values()].sort(
    (a, b) => b.weight - a.weight || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0),
  );
  let df = exactDf;
  if (exactId < 0) for (const v of variants) df = Math.max(df, index.df(v.termId));
  const N = index.docCount;
  return {
    word,
    variants,
    df,
    idf: Math.log(1 + (N - df + 0.5) / (df + 0.5)),
    weak: df > EXPANSION.weakDfRatio * N,
  };
}
