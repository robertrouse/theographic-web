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

export const MODEL = 'claude-opus-5-5';
/** Opus 5.5 always thinks and defaults to `medium` effort; set it explicitly. */
export const EFFORT = 'high';
/** Room for adaptive thinking plus ~150 tokens of JSON; billed on use, not on the cap. */
export const MAX_TOKENS = 8000;
export const MAX_WORDS = 150;

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
  },
  required: ['definition', 'citations', 'confidence'],
  additionalProperties: false,
} as const;

export const SYSTEM_PROMPT = `You write short reference definitions of people, places and events in the Bible for a general audience. Each request gives you one entity with the facts recorded about it (names, relationships, dates, locations) and a sample of the King James verses that mention it.

Rules:
- At most ${MAX_WORDS} words. Plain modern English, no archaic phrasing, no headings, no bullet points.
- Begin the first sentence with the entity's given title. For an event, put "The" before the title where it reads naturally ("The Reign of Hezekiah was…").
- Base the definition on the supplied verses and facts. Where they leave something open, you may reason it out: draw inferences from logic, from context, or from connected passages elsewhere in the Bible (a parallel account, an earlier or later mention of the same person or place). Say plainly that it is inferred ("probably", "by inference from the passage", "the parallel account in Mark names him") and move on. When a supplied fact is not explained by the supplied verses — a listed participant, a relationship — you may explain it from a connected passage, stated as what that passage says ("Later passages such as John 1:3 and Col 1:16 present Christ as the agent of creation"). For a place, you may add its likely modern identification (a present-day site, river or region) as a stated inference ("probably the modern Barada River").
- Dates and durations in the facts are estimates inferred from context, not stated in the text. If you mention one, present it that way ("about 1757 BC, by inference from context").
- Never refer to where the supplied facts come from: no "the graph", "the data", "the record lists". To point at this entry's own choices, say "this entry" or "the location shown here".
- Where there are competing views — of a location, an identity, a date — give them briefly and say which one this entry follows. For a place with a Location, that is the view its coordinates match ("The location shown here follows the Gilead identification").
- Name your sources when you use them: a dictionary by its title (for example Easton's Bible Dictionary), a tradition by what it is. Never mention a source in order to dispute it, and never call a view wrong, unsupported or a guess.
- Cite verses by their OSIS reference exactly as listed under CITABLE (for example "Gen.12.1"). Cite only from that list. Prefer citing the verses that carry the specific claims you make.
- The OSIS form belongs only in "citations". If you refer to a verse inside the definition text, write it for readers as [Book abbreviation] [chapter]:[verse], using these abbreviations without periods: Gen, Exod, Lev, Num, Deut, Josh, Judg, Ruth, 1 Sam, 2 Sam, 1 Kgs, 2 Kgs, 1 Chr, 2 Chr, Ezra, Neh, Esth, Job, Ps, Prov, Eccl, Song, Isa, Jer, Lam, Ezek, Dan, Hos, Joel, Amos, Obad, Jonah, Mic, Nah, Hab, Zeph, Hag, Zech, Mal, Matt, Mark, Luke, John, Acts, Rom, 1 Cor, 2 Cor, Gal, Eph, Phil, Col, 1 Thess, 2 Thess, 1 Tim, 2 Tim, Titus, Phlm, Heb, Jas, 1 Pet, 2 Pet, 1 John, 2 John, 3 John, Jude, Rev. For example "2 Kgs 5:12", "Gen 1:1–2", "1 Chr 3:2; 2 Sam 3:4".
- Where something is genuinely uncertain — a name shared by several people, an unknown location — say so briefly and neutrally.
- Describe; do not interpret. No theological or doctrinal commentary, no devotional language, no judgements about the entity's character beyond what the text states.
- The BACKGROUND entry, when present, is for orientation only; the verses and facts come first.

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
