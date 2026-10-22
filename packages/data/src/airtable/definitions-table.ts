/**
 * The Airtable `definitions` table (CP-08): the source of truth for generated
 * definitions, their review status and edits (Robert, 2026-10-22). The
 * pipeline upserts by `slug` and never overwrites a row whose status is
 * `reviewed`; the metadata export carries the table to
 * `theographic-bible-metadata/json/definitions.json`.
 *
 * `ensureDefinitionsTable` creates the table when it is missing and otherwise
 * leaves it alone — schema edits made in Airtable are Robert's.
 */

export const BASE_ID = 'app5UK4s70d5PwupX';
export const TABLE_NAME = 'definitions';

/** Linked tables in the Theographic base. */
export const TABLES = {
  people: 'tbliTAO8s4RbxYWTk',
  places: 'tblrUnh4Q79pmELgB',
  events: 'tblz1RnViDPiyLkpq',
  verses: 'tblR9l4lQ1vCtRed2',
} as const;

const iso = { dateFormat: { name: 'iso' } };
const choices = (...names: string[]): { choices: { name: string }[] } => ({
  choices: names.map((name) => ({ name })),
});

export const DEFINITIONS_FIELDS = [
  {
    name: 'slug',
    type: 'singleLineText',
    description: "Entity slug, e.g. abiel_23. The pipeline's key; do not edit.",
  },
  {
    name: 'person',
    type: 'multipleRecordLinks',
    options: { linkedTableId: TABLES.people },
    description: 'Set when the definition is of a person (exactly one of person/place/event).',
  },
  {
    name: 'place',
    type: 'multipleRecordLinks',
    options: { linkedTableId: TABLES.places },
    description: 'Set when the definition is of a place.',
  },
  {
    name: 'event',
    type: 'multipleRecordLinks',
    options: { linkedTableId: TABLES.events },
    description: 'Set when the definition is of an event.',
  },
  {
    name: 'text',
    type: 'multilineText',
    description: 'The definition text. Edit freely; set status to reviewed when done.',
  },
  {
    name: 'citations',
    type: 'multipleRecordLinks',
    options: { linkedTableId: TABLES.verses },
    description: 'Verses the definition cites.',
  },
  {
    name: 'status',
    type: 'singleSelect',
    options: choices('draft', 'reviewed', 'rejected'),
    description:
      'draft = generated, not reviewed (the site labels it AI-drafted). reviewed = never overwritten by a regeneration. rejected = not published.',
  },
  {
    name: 'confidence',
    type: 'singleSelect',
    options: choices('high', 'medium', 'low'),
    description: 'As reported by the model.',
  },
  {
    name: 'model',
    type: 'singleLineText',
    description: 'Model that generated the text, e.g. claude-opus-5-5.',
  },
  { name: 'generatedAt', type: 'date', options: iso, description: 'Date the text was generated.' },
  {
    name: 'batchId',
    type: 'singleLineText',
    description: 'Message Batches id the text came from.',
  },
  {
    name: 'sources',
    type: 'multipleSelects',
    options: choices('Easton', 'Smith', 'ISBE', 'TIPNR', 'Hitchcock'),
    description: 'Reference works included in the prompt as background.',
  },
  {
    name: 'checkProblems',
    type: 'multilineText',
    description: 'Automatic check failures (word cap, citations). Written by the pipeline.',
  },
  { name: 'reviewNotes', type: 'multilineText', description: 'Reviewer notes.' },
  { name: 'reviewedAt', type: 'date', options: iso, description: 'Date of review.' },
] as const;

const API = 'https://api.airtable.com/v0';

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const body = (await res.json()) as T & { error?: unknown };
  if (!res.ok)
    throw new Error(
      `Airtable ${init.method ?? 'GET'} ${path}: ${res.status} ${JSON.stringify(body.error ?? body)}`,
    );
  return body;
}

/** Create the table if missing; returns its id and whether it was created. */
export async function ensureDefinitionsTable(
  token: string,
): Promise<{ id: string; created: boolean }> {
  const meta = await call<{ tables: { id: string; name: string }[] }>(
    token,
    `/meta/bases/${BASE_ID}/tables`,
  );
  const existing = meta.tables.find((t) => t.name === TABLE_NAME);
  if (existing) return { id: existing.id, created: false };
  const made = await call<{ id: string }>(token, `/meta/bases/${BASE_ID}/tables`, {
    method: 'POST',
    body: JSON.stringify({
      name: TABLE_NAME,
      description:
        'Generated, verse-cited definitions of people, places and events (Theographic CP-08). Source of truth for review status and edits. The pipeline upserts by slug and never overwrites a row whose status is reviewed.',
      fields: DEFINITIONS_FIELDS,
    }),
  });
  return { id: made.id, created: true };
}
