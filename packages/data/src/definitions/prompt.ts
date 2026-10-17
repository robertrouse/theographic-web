/**
 * The system prompt and the per-entity user message.
 *
 * The system prompt is byte-stable across the whole run so it is served from
 * the prompt cache (`cache_control` on the block); anything that varies goes
 * in the user message. Do not put dates, counts or entity names in here.
 *
 * The output schema is what `output_config.format` enforces on the wire and
 * what `check.ts` validates again on the way in — the API guarantees shape,
 * not truth, so the second check is not redundant.
 */
import type { Grounding } from './ground.js';
import { EASTON_LABEL } from './ground.js';

export const MODEL = 'claude-opus-5';
export const MAX_TOKENS = 2000;
export const MAX_WORDS = 120;

export const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    definition: {
      type: 'string',
      description: `The definition, at most ${MAX_WORDS} words of plain modern English.`,
    },
    citations: {
      type: 'array',
      items: { type: 'string' },
      description:
        'OSIS verse references supporting the definition, e.g. "Gen.12.1". Only refs from the CITABLE list.',
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    notes: {
      type: 'string',
      description: 'What is uncertain, thin or conflicting in the sources. Omit when nothing is.',
    },
  },
  required: ['definition', 'citations', 'confidence'],
  additionalProperties: false,
} as const;

export const SYSTEM_PROMPT = `You write short reference definitions for a knowledge graph of the Bible. Each request gives you one entity — a person, a place or an event — with the facts the graph records about it and a sample of the King James verses that mention it.

Rules:
- At most ${MAX_WORDS} words. Plain modern English, no archaic phrasing, no headings, no bullet points.
- Name the entity as its given title in the first sentence.
- Make only claims that the supplied verses or the supplied relationships support. Do not add anything from outside the request, however well known. If the sources are thin, say so in "notes" and keep the definition to what is known — a short, well-supported definition is better than a fuller guessed one.
- Cite verses by their OSIS reference exactly as listed under CITABLE (for example "Gen.12.1"). Cite only from that list. Prefer citing the verses that carry the specific claims you make.
- Where the sources disagree or are ambiguous — a name shared by several people, an uncertain location, a dictionary entry that seems to conflate people — say what is uncertain rather than picking one.
- Describe; do not interpret. No theological or doctrinal commentary, no devotional language, no judgements about the entity's character beyond what the text states.
- The Easton's entry, when present, is a legacy source from 1897: use it for orientation, but the verses and relationships outrank it, and do not repeat its judgements or its etymologies as fact.

Report your confidence: "high" when the definition rests on several clear verses, "medium" when it rests on a few or on relationships alone, "low" when the sources barely support anything beyond the name.`;

function facts(g: Grounding): string {
  return g.facts.map(([k, v]) => `${k}: ${v}`).join('\n');
}

function verses(g: Grounding): string {
  const what =
    g.kind === 'event'
      ? `in this event's passage, sampled evenly`
      : `that mention this ${g.kind}, chosen for spread across books`;
  const head =
    g.totalVerses > g.verses.length
      ? `VERSES (${g.verses.length} of ${g.totalVerses} ${what}):`
      : `VERSES (all ${g.verses.length}${g.kind === 'event' ? ' in the passage' : ''}):`;
  const body = g.verses.map((v) => `[${v.osisRef}] ${v.label} — ${v.text}`).join('\n');
  return `${head}\n${body}`;
}

/** The user message for one entity. Deterministic for a given grounding. */
export function buildUserMessage(g: Grounding): string {
  const parts = [
    `ENTITY: ${g.kind}\nTITLE: ${g.title}`,
    `FACTS:\n${facts(g)}`,
    verses(g),
    `CITABLE: ${g.citable.join(', ')}`,
  ];
  if (g.easton !== undefined) {
    parts.push(`${EASTON_LABEL}${g.eastonTruncated ? ' (truncated)' : ''}:\n${g.easton}`);
  }
  parts.push(`Write the definition of ${g.title} as JSON.`);
  return parts.join('\n\n');
}
