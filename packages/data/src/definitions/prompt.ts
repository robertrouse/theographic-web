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
  },
  required: ['definition', 'citations', 'confidence'],
  additionalProperties: false,
} as const;

export const SYSTEM_PROMPT = `You write short reference definitions of people, places and events in the Bible for a general audience. Each request gives you one entity with the facts recorded about it (names, relationships, dates, locations) and a sample of the King James verses that mention it.

Rules:
- At most ${MAX_WORDS} words. Plain modern English, no archaic phrasing, no headings, no bullet points.
- Begin the first sentence with the entity's given title.
- Base every claim on the supplied verses and facts. Where they leave something open, you may draw your own reasonable inference from context; say plainly that it is inferred ("probably", "by inference from the passage") and move on. For a place, you may add its likely modern identification (a present-day site, river or region) as a stated inference ("probably the modern Barada River"). Do not add other facts from outside the request, however well known.
- Dates and durations in the facts are estimates inferred from context, not stated in the text. If you mention one, present it that way ("about 1757 BC, by inference from context").
- Never refer to where the facts come from: no "the graph", "the data", "the record lists", "the dictionary", and do not name Easton's or any other dictionary, scholar or tradition.
- Do not argue with or weigh any source. Never say a source is wrong, unsupported, a guess or a later judgement; give your own reading and leave others unmentioned.
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
