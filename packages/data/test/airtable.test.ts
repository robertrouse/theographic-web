/**
 * The Airtable `definitions` table round trip (CP-08): pipeline rows → linked
 * Airtable fields, and the metadata export → pipeline rows.
 */
import type { Definition } from '@theographic/core';
import { describe, expect, it } from 'vitest';
import {
  buildLinkIndex,
  fromAirtable,
  isAirtableExport,
  toAirtableFields,
} from '../src/airtable/sync.js';
import { buildGroundContext } from '../src/definitions/ground.js';
import { selectTargets } from '../src/definitions/run.js';
import { normalize } from '../src/normalize.js';
import { makeSources } from './fixture.js';

const src = makeSources();
const links = buildLinkIndex(src);
const recOf = (slug: string): string => src.people.find((r) => r.fields.slug === slug)!.id;
const verseRec = (osis: string): string => src.verses.find((r) => r.fields.osisRef === osis)!.id;

const row: Definition = {
  slug: 'god_1',
  kind: 'person',
  text: 'God made the heavens and the earth (Gen 1:1).',
  citations: ['Gen.1.1', 'John.1.1'],
  confidence: 'high',
  model: 'claude-opus-5-5',
  generatedAt: '2026-10-22',
  status: 'draft',
};

describe('pipeline row → Airtable fields', () => {
  it('links the entity and the cited verses by record id', () => {
    const { fields, problems } = toAirtableFields(row, links, {
      batchId: 'msgbatch_1',
      sources: ['easton', 'smith', 'tipnr'],
    });
    expect(problems).toEqual([]);
    expect(fields).toEqual({
      slug: 'god_1',
      person: [recOf('god_1')],
      text: row.text,
      citations: [verseRec('Gen.1.1'), verseRec('John.1.1')],
      status: 'draft',
      confidence: 'high',
      model: 'claude-opus-5-5',
      generatedAt: '2026-10-22',
      batchId: 'msgbatch_1',
      sources: ['Easton', 'Smith', 'TIPNR'],
      checkProblems: '',
    });
  });

  it('reports links it cannot resolve instead of guessing', () => {
    const { fields, problems } = toAirtableFields(
      { ...row, slug: 'nobody_9', citations: ['Gen.1.1', 'Rev.22.21'] },
      links,
    );
    expect(problems).toEqual(['no person record for nobody_9', 'no verse record for Rev.22.21']);
    expect(fields.person).toBeUndefined();
    expect(fields.citations).toEqual([verseRec('Gen.1.1')]);
  });
});

describe('Airtable export → pipeline rows', () => {
  const exported = [
    {
      id: 'recDEF1',
      createdTime: '2026-10-22T00:00:00.000Z',
      fields: {
        slug: 'god_1',
        person: [recOf('god_1')],
        text: '  Edited by a reviewer.  ',
        citations: [verseRec('Gen.1.1')],
        status: 'reviewed' as const,
        confidence: 'high' as const,
        model: 'claude-opus-5-5',
        generatedAt: '2026-10-22',
      },
    },
    {
      id: 'recDEF2',
      createdTime: '2026-10-22T00:00:00.000Z',
      fields: {
        slug: 'adam_2',
        person: [recOf('adam_2')],
        text: 'No.',
        status: 'rejected' as const,
      },
    },
    {
      id: 'recDEF3',
      createdTime: '2026-10-22T00:00:00.000Z',
      fields: { slug: 'stray', text: 'Unlinked.', status: 'draft' as const },
    },
  ];

  it('recognises the export shape', () => {
    expect(isAirtableExport(exported)).toBe(true);
    expect(isAirtableExport({ definitions: [] })).toBe(false);
    expect(isAirtableExport([row])).toBe(false);
  });

  it('keeps reviewed edits, drops rejected rows, and reports rows without a link', () => {
    const { rows, problems } = fromAirtable(exported, src);
    expect(rows).toEqual([
      {
        slug: 'god_1',
        kind: 'person',
        text: 'Edited by a reviewer.',
        citations: ['Gen.1.1'],
        confidence: 'high',
        model: 'claude-opus-5-5',
        generatedAt: '2026-10-22',
        status: 'reviewed',
      },
    ]);
    expect(problems).toEqual(['recDEF3 (stray): needs exactly one known person/place/event link']);
  });
});

describe('submit skips rows decided in Airtable', () => {
  it('leaves out slugs that are reviewed or rejected there', () => {
    const ctx = buildGroundContext(normalize(src));
    const all = selectTargets(ctx, {}).map((t) => t.slug);
    const some = selectTargets(ctx, { skip: new Set(['god_1']) }).map((t) => t.slug);
    expect(all).toContain('god_1');
    expect(some).toEqual(all.filter((s) => s !== 'god_1'));
  });
});
