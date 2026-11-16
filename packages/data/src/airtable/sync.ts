/**
 * Two-way bridge between the definitions pipeline and the Airtable
 * `definitions` table, which is the source of truth (Robert, 2026-10-22).
 *
 * Out (`pushDefinitions`): upsert drafts by `slug`, linking the row to its
 * person / place / event record and its citations to verse records. Rows whose
 * Airtable status is `reviewed` or `rejected` are human decisions and are
 * never written (invariant 7, enforced against Airtable itself).
 *
 * In (`fromAirtable`): the metadata export writes the table to
 * `json/definitions.json` as Airtable records; turn them back into the
 * pipeline's `Definition` rows. `rejected` rows are not published.
 */
import type { Definition, EntityKind } from '@theographic/core';
import { slugify } from '../normalize.js';
import type { AirtableRecord, Sources } from '../source.js';
import { BASE_ID, TABLE_NAME } from './definitions-table.js';

export interface DefinitionFields {
  slug?: string;
  person?: string[];
  place?: string[];
  event?: string[];
  text?: string;
  citations?: string[];
  status?: 'draft' | 'reviewed' | 'rejected';
  confidence?: 'high' | 'medium' | 'low';
  model?: string;
  generatedAt?: string;
  batchId?: string;
  sources?: string[];
  checkProblems?: string;
  reviewNotes?: string;
  reviewedAt?: string;
}

/** Statuses the pipeline must not overwrite or regenerate. */
export const LOCKED = new Set(['reviewed', 'rejected']);

const SOURCE_NAMES: Record<string, string> = {
  easton: 'Easton',
  smith: 'Smith',
  isbe: 'ISBE',
  tipnr: 'TIPNR',
  hitchcock: 'Hitchcock',
};

// ------------------------------------------------------------ record ids

export interface LinkIndex {
  person: Map<string, string>;
  place: Map<string, string>;
  event: Map<string, string>;
  /** osisRef → verse record id. */
  verse: Map<string, string>;
}

/** Slug/osisRef → Airtable record id, from the exported source records. */
export function buildLinkIndex(src: Sources): LinkIndex {
  return {
    person: new Map(src.people.map((r) => [r.fields.slug, r.id])),
    place: new Map(src.places.map((r) => [r.fields.slug, r.id])),
    event: new Map(src.events.map((r) => [`${slugify(r.fields.title)}_${r.fields.eventID}`, r.id])),
    verse: new Map(src.verses.map((r) => [r.fields.osisRef, r.id])),
  };
}

export interface PushMeta {
  batchId?: string;
  /** Background sources that were in the prompt (`easton`, `smith`, …). */
  sources?: readonly string[];
}

/** One pipeline row → Airtable fields. Unresolvable links are reported, not guessed. */
export function toAirtableFields(
  row: Definition,
  links: LinkIndex,
  meta: PushMeta = {},
): { fields: DefinitionFields; problems: string[] } {
  const problems: string[] = [];
  const kind = row.kind as Exclude<EntityKind, 'group'>;
  const entity = links[kind]?.get(row.slug);
  if (!entity) problems.push(`no ${row.kind} record for ${row.slug}`);
  const citations: string[] = [];
  for (const ref of row.citations) {
    const id = links.verse.get(ref);
    if (id) citations.push(id);
    else problems.push(`no verse record for ${ref}`);
  }
  const fields: DefinitionFields = {
    slug: row.slug,
    ...(entity ? { [kind]: [entity] } : {}),
    text: row.text,
    citations,
    status: 'draft',
    model: row.model,
    generatedAt: row.generatedAt,
    checkProblems: row.notes ?? '',
  };
  if (row.confidence) fields.confidence = row.confidence;
  if (meta.batchId) fields.batchId = meta.batchId;
  if (meta.sources) fields.sources = meta.sources.map((s) => SOURCE_NAMES[s] ?? s);
  return { fields, problems };
}

/** Airtable records (as exported) → pipeline rows; `rejected` rows are dropped. */
export function fromAirtable(
  records: readonly AirtableRecord<DefinitionFields>[],
  src: Sources,
): { rows: Definition[]; problems: string[] } {
  const slugOf = new Map<string, { slug: string; kind: EntityKind }>();
  for (const r of src.people) slugOf.set(r.id, { slug: r.fields.slug, kind: 'person' });
  for (const r of src.places) slugOf.set(r.id, { slug: r.fields.slug, kind: 'place' });
  for (const r of src.events) {
    slugOf.set(r.id, { slug: `${slugify(r.fields.title)}_${r.fields.eventID}`, kind: 'event' });
  }
  const osisOf = new Map(src.verses.map((r) => [r.id, r.fields.osisRef]));
  const rows: Definition[] = [];
  const problems: string[] = [];
  for (const r of records) {
    const f = r.fields;
    if (f.status === 'rejected' || !f.text?.trim()) continue;
    const links = [...(f.person ?? []), ...(f.place ?? []), ...(f.event ?? [])];
    const entity = links.length === 1 ? slugOf.get(links[0]!) : undefined;
    if (!entity) {
      problems.push(
        `${r.id} (${f.slug ?? 'no slug'}): needs exactly one known person/place/event link`,
      );
      continue;
    }
    if (f.slug && f.slug !== entity.slug) {
      problems.push(
        `${r.id}: slug ${f.slug} does not match its link (${entity.slug}); using the link`,
      );
    }
    const row: Definition = {
      slug: entity.slug,
      kind: entity.kind,
      text: f.text.trim(),
      citations: (f.citations ?? []).flatMap((id) => {
        const ref = osisOf.get(id);
        if (!ref) problems.push(`${entity.slug}: citation ${id} is not a known verse`);
        return ref ? [ref] : [];
      }),
      model: f.model ?? 'unknown',
      generatedAt: f.generatedAt ?? '',
      status: f.status === 'reviewed' ? 'reviewed' : 'draft',
    };
    if (f.confidence) row.confidence = f.confidence;
    if (f.checkProblems?.trim()) row.notes = f.checkProblems.trim();
    rows.push(row);
  }
  return { rows, problems };
}

/** True when a parsed definitions file is the Airtable export, not pipeline rows. */
export function isAirtableExport(raw: unknown): raw is AirtableRecord<DefinitionFields>[] {
  return (
    Array.isArray(raw) &&
    raw.length > 0 &&
    raw.every((r) => typeof r === 'object' && r !== null && 'id' in r && 'fields' in r)
  );
}

// ------------------------------------------------------------------- HTTP

const API = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE_NAME)}`;

async function request<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 30_000)); // Airtable asks for a 30 s pause
      continue;
    }
    const body = (await res.json()) as T & { error?: unknown };
    if (!res.ok)
      throw new Error(
        `Airtable ${init.method ?? 'GET'}: ${res.status} ${JSON.stringify(body.error ?? body)}`,
      );
    return body;
  }
  throw new Error('Airtable kept rate-limiting');
}

const pause = (): Promise<void> => new Promise((r) => setTimeout(r, 220)); // < 5 requests/s

/** Slug → status for every row in the table. */
export async function fetchStatuses(token: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let offset: string | undefined;
  do {
    const q = new URLSearchParams({ pageSize: '100' });
    q.append('fields[]', 'slug');
    q.append('fields[]', 'status');
    if (offset) q.set('offset', offset);
    const page = await request<{ records: AirtableRecord<DefinitionFields>[]; offset?: string }>(
      token,
      `${API}?${q}`,
    );
    for (const r of page.records) if (r.fields.slug) out.set(r.fields.slug, r.fields.status ?? '');
    offset = page.offset;
    await pause();
  } while (offset);
  return out;
}

export interface PushReport {
  written: number;
  locked: string[];
  problems: string[];
}

export async function pushDefinitions(
  token: string,
  rows: readonly Definition[],
  links: LinkIndex,
  metaBySlug: ReadonlyMap<string, PushMeta> = new Map(),
  log: (s: string) => void = () => {},
): Promise<PushReport> {
  const statuses = await fetchStatuses(token);
  const report: PushReport = { written: 0, locked: [], problems: [] };
  const pending: { fields: DefinitionFields }[] = [];
  for (const row of rows) {
    if (LOCKED.has(statuses.get(row.slug) ?? '')) {
      report.locked.push(row.slug);
      continue;
    }
    const { fields, problems } = toAirtableFields(row, links, metaBySlug.get(row.slug));
    report.problems.push(...problems);
    pending.push({ fields });
  }
  for (let i = 0; i < pending.length; i += 10) {
    await request(token, API, {
      method: 'PATCH',
      body: JSON.stringify({
        performUpsert: { fieldsToMergeOn: ['slug'] },
        records: pending.slice(i, i + 10),
      }),
    });
    report.written += Math.min(10, pending.length - i);
    if (report.written % 500 < 10) log(`airtable: ${report.written}/${pending.length} written`);
    await pause();
  }
  return report;
}
