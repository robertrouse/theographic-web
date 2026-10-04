/**
 * A verse hit's snippet is the whole verse — they are short — with
 * half-open highlight spans for every token that is a variant of any query
 * word, so what `why` credits and what the UI marks are the same tokens.
 * Offsets come from the tokenizer and index the source text directly; the
 * Psalm 119 acrostic header is never a token, so "NUN." stays plain.
 */
import type { Token } from './tokenizer.js';

export interface Snippet {
  text: string;
  /** [start, end) char offsets into `text`, ascending, non-overlapping. */
  highlights: [number, number][];
}

/** `variantTerms` maps a dictionary term to a non-zero value when it should light up. */
export function highlight(
  text: string,
  tokens: readonly Token[],
  variantTerms: ReadonlyMap<string, number>,
): Snippet {
  const highlights: [number, number][] = [];
  for (const t of tokens) if (variantTerms.get(t.term)) highlights.push([t.start, t.end]);
  return { text, highlights };
}
