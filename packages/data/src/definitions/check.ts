/**
 * Two checks on the way from a model result to a definition row.
 *
 * 1. `parseOutput` — the JSON has the shape `OUTPUT_SCHEMA` promised. The API
 *    enforces this on the wire; re-checking costs nothing and means a hand-
 *    edited or older file cannot smuggle a bad row in.
 * 2. `checkDefinition` — the claims are anchored: every citation is a real
 *    verse that mentions the entity (people, places) or lies in the event's
 *    passage; the text is non-empty and within the word cap; the citations
 *    are not empty.
 *
 * A failure is never silent and never "fixed": the row is kept with
 * `status: 'draft'` and a `notes` line naming what failed, so a reviewer sees
 * the problem next to the text (invariant 7).
 */
import type { Definition, VerseId } from '@theographic/core';
import type { GroundContext, GroundKind } from './ground.js';
import { verseIdOfOsis } from './ground.js';
import { MAX_WORDS } from './prompt.js';

/** The generous ceiling on the check; the prompt asks for `MAX_WORDS`. */
export const MAX_WORDS_HARD = 130;

export interface ModelOutput {
  definition: string;
  citations: string[];
  confidence: 'high' | 'medium' | 'low';
  notes?: string;
}

export class OutputShapeError extends Error {}

const CONFIDENCE = new Set(['high', 'medium', 'low']);

/** Parse and shape-check a model's JSON text. Throws `OutputShapeError`. */
export function parseOutput(text: string): ModelOutput {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new OutputShapeError(`not JSON: ${(e as Error).message}`);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new OutputShapeError('not an object');
  }
  const o = raw as Record<string, unknown>;
  const allowed = new Set(['definition', 'citations', 'confidence', 'notes']);
  for (const k of Object.keys(o)) {
    if (!allowed.has(k)) throw new OutputShapeError(`unexpected key ${JSON.stringify(k)}`);
  }
  if (typeof o['definition'] !== 'string')
    throw new OutputShapeError('definition must be a string');
  if (!Array.isArray(o['citations']) || !o['citations'].every((c) => typeof c === 'string')) {
    throw new OutputShapeError('citations must be an array of strings');
  }
  if (typeof o['confidence'] !== 'string' || !CONFIDENCE.has(o['confidence'])) {
    throw new OutputShapeError('confidence must be high | medium | low');
  }
  if (o['notes'] !== undefined && typeof o['notes'] !== 'string') {
    throw new OutputShapeError('notes must be a string when present');
  }
  const out: ModelOutput = {
    definition: o['definition'],
    citations: o['citations'] as string[],
    confidence: o['confidence'] as ModelOutput['confidence'],
  };
  const notes = (o['notes'] as string | undefined)?.trim();
  if (notes) out.notes = notes;
  return out;
}

export function wordCount(s: string): number {
  return s
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

/** The verse ids a citation for this entity may point at. */
export function allowedVerses(kind: GroundKind, slug: string, ctx: GroundContext): Set<VerseId> {
  switch (kind) {
    case 'person':
      return new Set(ctx.n.personDetail.get(slug)?.verses ?? []);
    case 'place':
      return new Set(ctx.n.placeDetail.get(slug)?.verses ?? []);
    case 'event':
      return new Set(ctx.eventBySlug.get(slug)?.verses ?? []);
  }
}

export interface CheckResult {
  ok: boolean;
  /** Human-readable reasons; empty when ok. */
  problems: string[];
}

/**
 * Anchor check for one row. Does not need the grounding that produced it:
 * the rule is "a verse that mentions the entity", which is a property of
 * the data, not of the sample the model happened to see.
 */
export function checkDefinition(
  row: Pick<Definition, 'kind' | 'slug' | 'text' | 'citations'>,
  ctx: GroundContext,
): CheckResult {
  const problems: string[] = [];
  const text = row.text.trim();
  if (text.length === 0) problems.push('empty text');
  const words = wordCount(text);
  if (words > MAX_WORDS_HARD) problems.push(`${words} words, cap ${MAX_WORDS_HARD}`);
  if (row.citations.length === 0) problems.push('no citations');
  if (row.kind === 'group') {
    problems.push('groups are not defined by this pipeline');
    return { ok: false, problems };
  }
  const allowed = allowedVerses(row.kind, row.slug, ctx);
  const bad: string[] = [];
  const seen = new Set<string>();
  for (const c of row.citations) {
    if (seen.has(c)) {
      bad.push(`${c} (duplicate)`);
      continue;
    }
    seen.add(c);
    const id = verseIdOfOsis(c, ctx);
    if (id === undefined) bad.push(`${c} (not a verse)`);
    else if (!allowed.has(id)) {
      bad.push(
        `${c} (${row.kind === 'event' ? 'outside the event passage' : `does not mention ${row.slug}`})`,
      );
    }
  }
  if (bad.length) problems.push(`citations: ${bad.join(', ')}`);
  return { ok: problems.length === 0, problems };
}

/** Prefix used in `notes` for a failed check; `merge` and tests look for it. */
export const CHECK_FAILED = 'citation check failed';

/** The `notes` line for a failed row: the original notes, then the failure. */
export function failureNotes(existing: string | undefined, problems: string[]): string {
  const line = `${CHECK_FAILED}: ${problems.join('; ')}`;
  return existing ? `${existing}\n${line}` : line;
}

export { MAX_WORDS };
