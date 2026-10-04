/**
 * What an entity page shows in its description block (CP-08).
 *
 * The rule, in one place so the three pages agree: a definition, when one
 * exists, replaces Easton's — never both. A `draft` row is marked as
 * AI-drafted with the model and date it came from; a `reviewed` row carries
 * no mark (invariant 7). Easton's is the labelled fallback until then.
 */
import type { Book, Definition } from '@theographic/core';
import { citationOf, type Citation } from './refs.js';

export interface DescriptionProps {
  markdown: string;
  source?: string;
  citations?: Citation[];
}

export function draftMark(d: Pick<Definition, 'model' | 'generatedAt'>): string {
  return `AI-drafted · ${d.model} · ${d.generatedAt}`;
}

export function describeWith(
  definition: Definition | undefined,
  easton: string | undefined,
  bookByOsis: (osis: string) => Book | undefined,
): DescriptionProps | undefined {
  if (definition) {
    const props: DescriptionProps = {
      markdown: definition.text,
      citations: definition.citations.map((c) => citationOf(c, bookByOsis)),
    };
    if (definition.status !== 'reviewed') props.source = draftMark(definition);
    return props;
  }
  if (easton) return { markdown: easton, source: "Easton's Bible Dictionary (1897)" };
  return undefined;
}
