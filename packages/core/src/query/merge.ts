/**
 * Cross-group normalization and ordering — THE place the All-tab formulas
 * live (invariant 4; docs/search-design.md §"Ranking formulas › Cross-group").
 * `plan.ts` collects raw evidence per group and calls in here for every
 * score; nothing else assigns a cross-group number.
 *
 *   passages   pinned first: 1.0 explicit · 0.9 bare book · 0.85 bare book
 *              that is also an entity name · the ref's own confidence for an
 *              alternative reading ("Phm 1" as chapter 1, 0.5)
 *   entities   min(1, raw) × span coverage factor — see `entityScore`
 *   verses     the best of the bands the verse earned:
 *                coMention    0.90        linked to entities from ≥ 2 spans
 *                mentionText  0.90 · q    linked to a span's entity AND a
 *                                         text hit with full coverage
 *                text         0.80 · (score / score_top) · q
 *                mentionOnly  0.70        linked, but the text did not match
 *              q = 1 if cov = 1 ∧ phrase · 0.9 if cov = 1 · 0.75 · cov otherwise
 *   events     0.90 when reached through participants ∩ locations
 *
 * Span coverage: an entity read from PART of a clause is a partial reading.
 * Its score is multiplied by `spanFloor + (1 − spanFloor) · words/contentWords`
 * — at half coverage 0.775, which sits below a perfect-phrase verse (0.80)
 * and above a mention-only verse (0.70). That is what lets "Jesus wept" put
 * John 11:35 ahead of Jesus the person while "Paul" still leads with Paul.
 *
 * Guarantees the numbers give: a reference is always first; an exact
 * whole-query entity (≥ 0.95) beats any text-only hit (≤ 0.80); a perfect
 * phrase (0.80) beats prefix/fuzzy entities; a fuzzy entity interleaves
 * with partial-coverage text by score. Ties: group order → canonical → id.
 *
 * Signals (`SearchOptions.signals`) blend into verse scores only, as
 * (1 − λ)·lex + λ·signal with λ = `signalLambda`, before the sort.
 */
import type { Ref } from '../refs/types.js';
import { GROUP_RANK, type Group, type Hit, type RankSignal } from './types.js';

export const MERGE = {
  passageExplicit: 1.0,
  passageBare: 0.9,
  passageAmbiguous: 0.85,
  coMention: 0.9,
  mentionText: 0.9,
  text: 0.8,
  mentionOnly: 0.7,
  eventByGraph: 0.9,
  qPhrase: 1.0,
  qFull: 0.9,
  qPartial: 0.75,
  /** Coverage factor floor for an entity matched by part of the clause. */
  spanFloor: 0.55,
  /** Weight of an external rank signal on verses. */
  signalLambda: 0.3,
  /** Strong candidates per span that hop through the graph. */
  hopCandidates: 20,
} as const;

/** A hit plus the sort keys merge needs; `pinned` puts references first regardless of score. */
export interface Scored extends Hit {
  pinned: boolean;
  /** Canonical position: verse id start for passages and verses, first verse for entities. */
  canonical: number;
}

export function passageScore(ref: Ref): number {
  if (ref.kind === 'book') return ref.ambiguousWith ? MERGE.passageAmbiguous : MERGE.passageBare;
  return ref.confidence >= 1 ? MERGE.passageExplicit : ref.confidence;
}

/** The coverage factor for a span of `words` words in a clause of `contentWords`. */
export function coverageFactor(words: number, contentWords: number): number {
  if (contentWords <= 0 || words >= contentWords) return 1;
  return MERGE.spanFloor + (1 - MERGE.spanFloor) * (words / contentWords);
}

export function entityScore(raw: number, words: number, contentWords: number): number {
  return Math.min(1, raw) * coverageFactor(words, contentWords);
}

/** The text quality factor q. */
export function textQuality(cov: number, phrase: boolean): number {
  if (cov >= 1) return phrase ? MERGE.qPhrase : MERGE.qFull;
  return MERGE.qPartial * cov;
}

export function textScore(score: number, top: number, cov: number, phrase: boolean): number {
  if (top <= 0) return 0;
  return MERGE.text * (score / top) * textQuality(cov, phrase);
}

export interface VerseEvidence {
  /** Number of distinct spans whose entities link the verse. */
  spans: number;
  /** Text hit, when the verse matched the text query. */
  text?: { score: number; top: number; cov: number; phrase: boolean };
}

export interface VerseBand {
  band: 'coMention' | 'mentionText' | 'text' | 'mentionOnly';
  score: number;
  why: string;
}

/** The best band a verse earned from its evidence. */
export function verseBand(e: VerseEvidence): VerseBand {
  if (e.spans >= 2) {
    return { band: 'coMention', score: MERGE.coMention, why: `band co-mention ${MERGE.coMention}` };
  }
  if (e.spans === 1 && e.text && e.text.cov >= 1) {
    const q = textQuality(e.text.cov, e.text.phrase);
    const score = MERGE.mentionText * q;
    return {
      band: 'mentionText',
      score,
      why: `band mention+text ${MERGE.mentionText} × q ${q.toFixed(2)} = ${score.toFixed(3)}`,
    };
  }
  const text = e.text ? textScore(e.text.score, e.text.top, e.text.cov, e.text.phrase) : 0;
  if (e.spans === 1 && text < MERGE.mentionOnly) {
    return {
      band: 'mentionOnly',
      score: MERGE.mentionOnly,
      why: `band mention ${MERGE.mentionOnly}`,
    };
  }
  const t = e.text!;
  const q = textQuality(t.cov, t.phrase);
  return {
    band: 'text',
    score: text,
    why: `band text ${MERGE.text} × ${(t.score / t.top).toFixed(3)} (score/top) × q ${q.toFixed(2)} = ${text.toFixed(3)}`,
  };
}

/**
 * Blend external signals into verse scores: (1 − λ)·lex + λ·mean(signals).
 * Returns the input untouched when there are no signals for the layer.
 */
export function applySignals(
  candidates: { id: number; lex: number }[],
  signals: readonly RankSignal[] | undefined,
  ctx: { query: string },
): number[] {
  const verseSignals = (signals ?? []).filter((s) => s.layer === 'verses');
  if (verseSignals.length === 0) return candidates.map((c) => c.lex);
  const sums = new Float64Array(candidates.length);
  for (const s of verseSignals) {
    const out = s.score(candidates, ctx);
    if (out.length !== candidates.length) {
      throw new Error(
        `signal ${s.name} returned ${out.length} scores for ${candidates.length} candidates`,
      );
    }
    for (let i = 0; i < out.length; i++) sums[i] = sums[i]! + Math.min(1, Math.max(0, out[i]!));
  }
  const λ = MERGE.signalLambda;
  return candidates.map((c, i) => (1 - λ) * c.lex + λ * (sums[i]! / verseSignals.length));
}

function idKey(id: string | number): string {
  return typeof id === 'number' ? String(id).padStart(8, '0') : id;
}

/** Within-group order: pinned → score → canonical → id. */
export function compareInGroup(a: Scored, b: Scored): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  if (a.score !== b.score) return b.score - a.score;
  if (a.canonical !== b.canonical) return a.canonical - b.canonical;
  const ka = idKey(a.id);
  const kb = idKey(b.id);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/** Cross-group order: pinned → score → group order → canonical → id. */
export function compareAcrossGroups(a: Scored, b: Scored): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  if (a.score !== b.score) return b.score - a.score;
  if (a.group !== b.group) return GROUP_RANK[a.group] - GROUP_RANK[b.group];
  if (a.canonical !== b.canonical) return a.canonical - b.canonical;
  const ka = idKey(a.id);
  const kb = idKey(b.id);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/** Strip the sort keys for the public result. */
export function toHit(s: Scored): Hit {
  const { pinned: _p, canonical: _c, ...hit } = s;
  return hit;
}

export type { Group };
