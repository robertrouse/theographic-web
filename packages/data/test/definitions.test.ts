/**
 * CP-08 pipeline against the synthetic fixture. No network: the batch client
 * is a fake that records what was submitted and replays canned results in a
 * scrambled order, which is exactly what the real API is allowed to do.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import type { Definition } from '@theographic/core';
import { afterAll, describe, expect, it } from 'vitest';
import { parseDefsArgs } from '../src/cli-defs.js';
import {
  CHECK_FAILED,
  checkDefinition,
  failureNotes,
  OutputShapeError,
  parseOutput,
  wordCount,
} from '../src/definitions/check.js';
import {
  buildGroundContext,
  evenIndices,
  ground,
  kindOf,
  MAX_PROMPT_TOKENS,
  selectVerses,
  trimEaston,
  verseIdOfOsis,
} from '../src/definitions/ground.js';
import {
  mergeDefinitions,
  parseDefinitionsFile,
  serializeDefinitions,
} from '../src/definitions/merge.js';
import { buildUserMessage, OUTPUT_SCHEMA, SYSTEM_PROMPT } from '../src/definitions/prompt.js';
import {
  allTargets,
  buildRequest,
  collect,
  dryRunSlugs,
  rowFromResult,
  selectTargets,
  submit,
  type BatchClient,
} from '../src/definitions/run.js';
import { gate } from '../src/gate.js';
import { normalize } from '../src/normalize.js';
import { makeSources } from './fixture.js';

const n = normalize(makeSources());
const ctx = buildGroundContext(n);

// ------------------------------------------------------------------ ground

describe('ground', () => {
  it('assembles a person from relationships, verses and Easton', () => {
    const g = ground('person', 'adam_2', ctx);
    expect(g.title).toBe('Adam');
    expect(Object.fromEntries(g.facts)).toMatchObject({
      Name: 'Adam',
      Gender: 'male',
      Partners: 'Eve (wife of Adam)',
      Groups: 'Apostles',
      Born: '4004 BC, Eden',
      Wrote: 'Genesis',
      Events: 'Creation (4004 BC)',
    });
    expect(g.verses.map((v) => v.osisRef)).toEqual(['Gen.2.1']);
    expect(g.verses[0]!.label).toBe('Genesis 2:1');
    expect(g.citable).toEqual(['Gen.2.1']);
    expect(g.totalVerses).toBe(1);
    expect(g.easton).toBeUndefined(); // Adam has no Easton entry in the fixture
  });

  it('carries the ambiguity flag and the Easton entry', () => {
    const eve = ground('person', 'eve_3', ctx);
    expect(eve.title).toBe('Eve (wife of Adam)');
    expect(Object.fromEntries(eve.facts)['Note']).toMatch(/shared by several people/);
    const god = ground('person', 'god_1', ctx);
    expect(god.easton).toBe('God. The Creator.');
    expect(god.eastonTruncated).toBeUndefined();
    expect(god.citable).toEqual(['Gen.1.1', 'John.1.1', 'John.1.2']);
  });

  it('assembles a place, saying when there is no coordinate', () => {
    const antioch = ground('place', 'antioch_2', ctx);
    const f = Object.fromEntries(antioch.facts);
    expect(f['Location']).toBe('no coordinates known');
    expect(f['Feature type']).toBe('City');
    expect(f['Events here']).toBe('Creation (4004 BC)');
    const eden = ground('place', 'eden_1', ctx);
    expect(Object.fromEntries(eden.facts)).toMatchObject({
      'Also called': 'Garden of Eden, Paradise',
      Location: '33, 44 (Rough)',
      'People born here': 'Adam',
    });
    expect(eden.easton).toBe('Eden. Delight.');
  });

  it('assembles an event from its passage', () => {
    const g = ground('event', 'creation_1', ctx);
    expect(Object.fromEntries(g.facts)).toMatchObject({
      Title: 'Creation',
      Date: '4004 BC',
      Duration: '7D',
      Participants: 'Adam',
      Groups: 'Apostles',
      Locations: 'Antioch (Syria)',
    });
    expect(g.citable).toEqual(['Gen.1.1', 'Gen.1.2']);
    expect(g.easton).toBeUndefined();
  });

  it('knows every slug it can define, and no other', () => {
    expect(kindOf('adam_2', ctx)).toBe('person');
    expect(kindOf('eden_1', ctx)).toBe('place');
    expect(kindOf('creation_1', ctx)).toBe('event');
    expect(kindOf('apostles', ctx)).toBeUndefined(); // a group
    expect(kindOf('nobody', ctx)).toBeUndefined();
    expect(() => ground('person', 'nobody', ctx)).toThrow(/unknown person/);
  });

  it('maps OSIS refs to verse ids only when the verse exists', () => {
    expect(verseIdOfOsis('Gen.2.1', ctx)).toBe(1002001);
    expect(verseIdOfOsis('John.1.3', ctx)).toBe(43001003);
    expect(verseIdOfOsis('Gen.3.1', ctx)).toBeUndefined(); // no chapter 3
    expect(verseIdOfOsis('Gen.1.9', ctx)).toBeUndefined(); // no verse 9
    expect(verseIdOfOsis('Rev.1.1', ctx)).toBeUndefined(); // no such book here
    expect(verseIdOfOsis('Genesis 1:1', ctx)).toBeUndefined();
  });
});

describe('selectVerses', () => {
  const id = (book: number, c: number, v: number): number => book * 1_000_000 + c * 1000 + v;

  it('returns everything, sorted, when under the cap', () => {
    expect(selectVerses([id(43, 1, 2), id(1, 1, 1)], 40)).toEqual([id(1, 1, 1), id(43, 1, 2)]);
  });

  it('keeps at least one verse per book and spreads the rest by weight', () => {
    const gen = Array.from({ length: 90 }, (_, i) => id(1, 1, i + 1));
    const heb = Array.from({ length: 10 }, (_, i) => id(58, 1, i + 1));
    const picked = selectVerses([...heb, ...gen], 10);
    expect(picked).toHaveLength(10);
    const fromHeb = picked.filter((v) => v >= id(58, 1, 1));
    expect(fromHeb.length).toBeGreaterThanOrEqual(1);
    expect(fromHeb.length).toBeLessThanOrEqual(2);
    // first and last of Genesis both survive
    expect(picked).toContain(id(1, 1, 1));
    expect(picked).toContain(id(1, 1, 90));
    expect(picked).toEqual([...picked].sort((a, b) => a - b));
  });

  it('with more books than slots keeps the most-mentioned books', () => {
    const ids = [
      ...Array.from({ length: 5 }, (_, i) => id(1, 1, i + 1)),
      id(2, 1, 1),
      id(3, 1, 1),
      id(4, 1, 1),
    ];
    expect(selectVerses(ids, 2)).toEqual([id(1, 1, 1), id(2, 1, 1)]);
  });

  it('evenIndices always keeps both ends', () => {
    expect(evenIndices(10, 3)).toEqual([0, 5, 9]);
    expect(evenIndices(3, 5)).toEqual([0, 1, 2]);
    expect(evenIndices(7, 1)).toEqual([0]);
    expect(evenIndices(0, 3)).toEqual([]);
  });
});

describe('token budget', () => {
  it('trims Easton at a paragraph boundary and flags it', () => {
    const text = ['a'.repeat(400), 'b'.repeat(400), 'c'.repeat(400)].join('\n\n');
    const t = trimEaston(text, 210);
    expect(t.truncated).toBe(true);
    expect(t.text).toBe(['a'.repeat(400), 'b'.repeat(400)].join('\n\n'));
    expect(trimEaston('short', 100)).toEqual({ text: 'short', truncated: false });
  });

  it('keeps a bloated entry under the prompt cap by cutting Easton first', () => {
    const src = makeSources();
    src.people[0]!.fields.dictText = [
      Array.from({ length: 60 }, (_, i) => `Paragraph ${i} ${'x'.repeat(600)}`).join('\n\n'),
    ];
    const g = ground('person', 'god_1', buildGroundContext(normalize(src)));
    expect(g.eastonTruncated).toBe(true);
    expect(g.verses).toHaveLength(3); // verses were not touched
    expect(Math.ceil(buildUserMessage(g).length / 4)).toBeLessThanOrEqual(MAX_PROMPT_TOKENS + 100);
  });
});

// ------------------------------------------------------------------ prompt

describe('prompt', () => {
  it('builds a user message with facts, labelled verses and the citable list', () => {
    const msg = buildUserMessage(ground('person', 'god_1', ctx));
    expect(msg).toContain('ENTITY: person\nTITLE: God');
    expect(msg).toContain('Also called: LORD, Lord');
    expect(msg).toContain('[Gen.1.1] Genesis 1:1 — In the beginning God created');
    expect(msg).toContain('CITABLE: Gen.1.1, John.1.1, John.1.2');
    expect(msg).toContain('legacy reference (1897), may be dated or conflate people');
    expect(msg).toContain('God. The Creator.');
    expect(msg).toMatch(/Write the definition of God as JSON\.$/);
  });

  it('says when the verses are a sample', () => {
    const g = ground('person', 'god_1', ctx);
    expect(buildUserMessage(g)).toContain('VERSES (all 3):');
    expect(buildUserMessage({ ...g, totalVerses: 900 })).toContain(
      'VERSES (3 of 900 that mention this person, chosen for spread across books):',
    );
    const e = ground('event', 'creation_1', ctx);
    expect(buildUserMessage({ ...e, totalVerses: 50 })).toContain(
      "VERSES (2 of 50 in this event's passage, sampled evenly):",
    );
  });

  it('is deterministic and the system prompt holds no per-run content', () => {
    const a = buildUserMessage(ground('place', 'eden_1', ctx));
    const b = buildUserMessage(ground('place', 'eden_1', ctx));
    expect(a).toBe(b);
    expect(SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(SYSTEM_PROMPT).toContain('At most 120 words');
  });

  it('builds a batch request with the cached system prompt and the JSON schema', () => {
    const r = buildRequest(ground('person', 'adam_2', ctx));
    expect(r.custom_id).toBe('adam_2');
    expect(r.params.model).toBe('claude-opus-5');
    expect(r.params.max_tokens).toBe(2000);
    expect(r.params).not.toHaveProperty('thinking'); // adaptive is the default; no budget_tokens
    const system = r.params.system as Anthropic.Messages.TextBlockParam[];
    expect(system[0]!.cache_control).toEqual({ type: 'ephemeral' });
    expect(system[0]!.text).toBe(SYSTEM_PROMPT);
    expect(r.params.output_config).toEqual({
      format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
    });
    expect(OUTPUT_SCHEMA.required).toEqual(['definition', 'citations', 'confidence']);
    expect(OUTPUT_SCHEMA.additionalProperties).toBe(false);
  });
});

// ------------------------------------------------------------------- check

describe('parseOutput', () => {
  it('accepts the schema shape, trimming empty notes', () => {
    expect(
      parseOutput('{"definition":"x","citations":["Gen.1.1"],"confidence":"high","notes":" "}'),
    ).toEqual({ definition: 'x', citations: ['Gen.1.1'], confidence: 'high' });
  });

  it.each([
    ['not json', 'not JSON'],
    ['[]', 'not an object'],
    ['{"definition":1,"citations":[],"confidence":"high"}', 'definition must be a string'],
    ['{"definition":"x","citations":"Gen.1.1","confidence":"high"}', 'citations must be'],
    ['{"definition":"x","citations":[1],"confidence":"high"}', 'citations must be'],
    ['{"definition":"x","citations":[],"confidence":"sure"}', 'confidence must be'],
    ['{"definition":"x","citations":[],"confidence":"high","notes":3}', 'notes must be'],
    ['{"definition":"x","citations":[],"confidence":"high","extra":1}', 'unexpected key'],
  ])('rejects %s', (text, message) => {
    expect(() => parseOutput(text)).toThrow(OutputShapeError);
    expect(() => parseOutput(text)).toThrow(message);
  });
});

describe('checkDefinition', () => {
  const row = (over: Partial<Definition>): Definition => ({
    slug: 'god_1',
    kind: 'person',
    text: 'God is the creator.',
    citations: ['Gen.1.1'],
    model: 'm',
    generatedAt: '2026-01-01',
    status: 'draft',
    ...over,
  });

  it('accepts a verse that mentions the person', () => {
    expect(checkDefinition(row({}), ctx)).toEqual({ ok: true, problems: [] });
    expect(checkDefinition(row({ citations: ['Gen.1.1', 'John.1.2'] }), ctx).ok).toBe(true);
  });

  it('rejects a real verse that does not mention the entity', () => {
    const c = checkDefinition(row({ citations: ['Gen.2.1'] }), ctx);
    expect(c.ok).toBe(false);
    expect(c.problems).toEqual(['citations: Gen.2.1 (does not mention god_1)']);
  });

  it('rejects a verse that does not exist, a duplicate, and an empty list', () => {
    expect(checkDefinition(row({ citations: ['Gen.9.9'] }), ctx).problems).toEqual([
      'citations: Gen.9.9 (not a verse)',
    ]);
    expect(checkDefinition(row({ citations: ['Gen.1.1', 'Gen.1.1'] }), ctx).problems).toEqual([
      'citations: Gen.1.1 (duplicate)',
    ]);
    expect(checkDefinition(row({ citations: [] }), ctx).problems).toEqual(['no citations']);
  });

  it('rejects empty text and over-long text', () => {
    expect(checkDefinition(row({ text: '  ' }), ctx).problems).toContain('empty text');
    const long = Array.from({ length: 131 }, () => 'word').join(' ');
    expect(checkDefinition(row({ text: long }), ctx).problems).toContain('131 words, cap 130');
    expect(wordCount('  a  b\nc ')).toBe(3);
  });

  it('checks a place against its own verses and an event against its passage', () => {
    expect(
      checkDefinition(row({ slug: 'antioch_2', kind: 'place', citations: ['John.1.3'] }), ctx).ok,
    ).toBe(true);
    expect(
      checkDefinition(row({ slug: 'antioch_2', kind: 'place', citations: ['Gen.2.1'] }), ctx)
        .problems,
    ).toEqual(['citations: Gen.2.1 (does not mention antioch_2)']);
    expect(
      checkDefinition(row({ slug: 'creation_1', kind: 'event', citations: ['Gen.1.2'] }), ctx).ok,
    ).toBe(true);
    expect(
      checkDefinition(row({ slug: 'creation_1', kind: 'event', citations: ['Gen.2.1'] }), ctx)
        .problems,
    ).toEqual(['citations: Gen.2.1 (outside the event passage)']);
  });

  it('never defines a group', () => {
    const c = checkDefinition(row({ slug: 'apostles', kind: 'group' }), ctx);
    expect(c.ok).toBe(false);
  });

  it('writes the failure into notes after any existing notes', () => {
    expect(failureNotes(undefined, ['a', 'b'])).toBe(`${CHECK_FAILED}: a; b`);
    expect(failureNotes('thin sources', ['a'])).toBe(`thin sources\n${CHECK_FAILED}: a`);
  });
});

// ------------------------------------------------------------------- merge

describe('mergeDefinitions', () => {
  const d = (slug: string, status: Definition['status'], text = slug): Definition => ({
    slug,
    kind: 'person',
    text,
    citations: ['Gen.1.1'],
    model: 'm',
    generatedAt: '2026-01-01',
    status,
  });

  it('adds, replaces drafts, never overwrites reviewed, and sorts by slug', () => {
    const existing = [d('zed', 'draft', 'old'), d('abe', 'reviewed', 'final')];
    const incoming = [
      d('zed', 'draft', 'new'),
      d('abe', 'draft', 'regenerated'),
      d('mid', 'draft'),
    ];
    const r = mergeDefinitions(existing, incoming);
    expect(r.merged.map((x) => x.slug)).toEqual(['abe', 'mid', 'zed']);
    expect(r.merged.find((x) => x.slug === 'abe')).toMatchObject({
      text: 'final',
      status: 'reviewed',
    });
    expect(r.merged.find((x) => x.slug === 'zed')!.text).toBe('new');
    expect(r).toMatchObject({ added: ['mid'], replaced: ['zed'], keptReviewed: ['abe'] });
  });

  it('forces incoming rows to draft even if they claim otherwise', () => {
    const r = mergeDefinitions([], [d('x', 'reviewed')]);
    expect(r.merged[0]!.status).toBe('draft');
  });

  it('round-trips the file shape and accepts a bare array', () => {
    const rows = [d('b', 'draft'), d('a', 'draft')];
    const text = serializeDefinitions(rows);
    expect(text.startsWith('{\n  "definitions": [')).toBe(true);
    expect(parseDefinitionsFile(text).map((x) => x.slug)).toEqual(['a', 'b']);
    expect(parseDefinitionsFile(JSON.stringify(rows))).toHaveLength(2);
    expect(() => parseDefinitionsFile('{"nope":1}')).toThrow(/expected/);
  });
});

// ------------------------------------------------------------- submit/collect

/** A batch client that never touches the network. */
function fakeClient(replies: Record<string, string | { error: string }>): BatchClient & {
  submitted: Anthropic.Messages.BatchCreateParams.Request[];
} {
  const submitted: Anthropic.Messages.BatchCreateParams.Request[] = [];
  const counts = { processing: 0, succeeded: 0, errored: 0, canceled: 0, expired: 0 };
  const batch = (status: 'in_progress' | 'ended'): Anthropic.Messages.MessageBatch => ({
    id: 'msgbatch_test',
    type: 'message_batch',
    processing_status: status,
    request_counts: counts,
    created_at: '2026-01-01T00:00:00Z',
    expires_at: '2026-01-02T00:00:00Z',
    archived_at: null,
    cancel_initiated_at: null,
    ended_at: null,
    results_url: null,
  });
  let polls = 0;
  return {
    submitted,
    async create(requests) {
      submitted.push(...requests);
      counts.processing = requests.length;
      return batch('in_progress');
    },
    async retrieve() {
      polls++;
      return batch(polls < 2 ? 'in_progress' : 'ended');
    },
    async results() {
      // Deliberately reversed: results may arrive in any order.
      const rows = Object.entries(replies).reverse();
      async function* gen(): AsyncGenerator<Anthropic.Messages.MessageBatchIndividualResponse> {
        for (const [custom_id, reply] of rows) {
          if (typeof reply !== 'string') {
            yield {
              custom_id,
              result: {
                type: 'errored',
                error: { type: 'error', error: { type: reply.error, message: reply.error } },
              } as unknown as Anthropic.Messages.MessageBatchErroredResult,
            };
            continue;
          }
          yield {
            custom_id,
            result: {
              type: 'succeeded',
              message: {
                id: 'msg_1',
                type: 'message',
                role: 'assistant',
                model: 'claude-opus-5',
                content: [{ type: 'text', text: reply, citations: null }],
                stop_reason: 'end_turn',
                stop_sequence: null,
                stop_details: null,
                usage: {
                  input_tokens: 100,
                  output_tokens: 20,
                  cache_creation_input_tokens: 10,
                  cache_read_input_tokens: 5,
                  cache_creation: null,
                  server_tool_use: null,
                  service_tier: null,
                  inference_geo: null,
                  iterations: null,
                  output_tokens_details: null,
                  speed: null,
                } as unknown as Anthropic.Messages.Usage,
                container: null,
                context_management: null,
              } as unknown as Anthropic.Messages.Message,
            },
          };
        }
      }
      return gen();
    },
  };
}

const out = (definition: string, citations: string[], notes?: string): string =>
  JSON.stringify({ definition, citations, confidence: 'medium', ...(notes ? { notes } : {}) });

describe('selectTargets', () => {
  it('lists people, places then events, and can be narrowed', () => {
    expect(allTargets(ctx).map((t) => t.slug)).toEqual([
      'adam_2',
      'eve_3',
      'god_1',
      'antioch_2',
      'eden_1',
      'creation_1',
    ]);
    expect(selectTargets(ctx, { kind: 'place' }).map((t) => t.slug)).toEqual([
      'antioch_2',
      'eden_1',
    ]);
    expect(selectTargets(ctx, { limit: 2 })).toHaveLength(2);
    expect(selectTargets(ctx, { slugs: ['creation_1', 'eve_3'] })).toEqual([
      { slug: 'creation_1', kind: 'event' },
      { slug: 'eve_3', kind: 'person' },
    ]);
    expect(() => selectTargets(ctx, { slugs: ['apostles'] })).toThrow(/unknown slug/);
  });

  it('skips slugs whose existing row is reviewed', () => {
    const existing: Definition[] = [
      {
        slug: 'adam_2',
        kind: 'person',
        text: 'x',
        citations: [],
        model: 'm',
        generatedAt: 'd',
        status: 'reviewed',
      },
      {
        slug: 'eve_3',
        kind: 'person',
        text: 'x',
        citations: [],
        model: 'm',
        generatedAt: 'd',
        status: 'draft',
      },
    ];
    expect(selectTargets(ctx, { kind: 'person', existing }).map((t) => t.slug)).toEqual([
      'eve_3',
      'god_1',
    ]);
  });

  it('dry-run picks an ambiguous person and an unlocated place first', () => {
    // Eve is the fixture's ambiguous person but has one verse; the sample wants
    // a duplicate name with something to say (≥ 3 verses), so flag God instead.
    const src = makeSources();
    src.people[0]!.fields.ambiguous = true;
    const picks = dryRunSlugs(buildGroundContext(normalize(src)), 6);
    expect(picks.map((t) => t.slug)).toEqual([
      'god_1', // ambiguous, 3 verses
      'adam_2',
      'antioch_2', // no coordinates
      'eden_1',
      'creation_1',
    ]);
    expect(dryRunSlugs(ctx, 6).map((t) => t.slug)).toEqual([
      'adam_2',
      'eve_3',
      'antioch_2',
      'eden_1',
      'creation_1',
    ]);
  });
});

describe('submit + collect (mocked SDK)', () => {
  let tmp: string;
  afterAll(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it('submits one request per target, records the batch, and merges checked rows', async () => {
    tmp = await mkdtemp(join(tmpdir(), 'defs-'));
    const client = fakeClient({
      god_1: out('God is the creator of heaven and earth.', ['Gen.1.1', 'John.1.1']),
      adam_2: out('Adam was in Eden with Eve.', ['Gen.1.1']), // Gen.1.1 does not mention Adam
      eve_3: out('Eve was the wife of Adam.', ['Gen.2.1'], 'only one verse'),
      antioch_2: { error: 'api_error' },
    });
    const { record } = await submit(client, ctx, {
      slugs: ['god_1', 'adam_2', 'eve_3', 'antioch_2'],
      recordDir: tmp,
    });
    expect(client.submitted.map((r) => r.custom_id)).toEqual([
      'god_1',
      'adam_2',
      'eve_3',
      'antioch_2',
    ]);
    expect(record.batchId).toBe('msgbatch_test');
    const saved = JSON.parse(await readFile(join(tmp, 'msgbatch_test.json'), 'utf8'));
    expect(saved.targets).toHaveLength(4);

    const file = join(tmp, 'definitions.json');
    const r = await collect(client, ctx, record, {
      pollMs: 1,
      mergeInto: file,
      now: () => new Date('2026-09-16T12:00:00Z'),
    });
    expect(r.rows.map((x) => x.slug)).toEqual(['adam_2', 'eve_3', 'god_1']);
    expect(r.missing).toEqual([{ slug: 'antioch_2', reason: 'api_error: api_error' }]);
    expect(r.failed).toEqual([
      { slug: 'adam_2', problems: ['citations: Gen.1.1 (does not mention adam_2)'] },
    ]);
    const adam = r.rows.find((x) => x.slug === 'adam_2')!;
    expect(adam.status).toBe('draft');
    expect(adam.notes).toBe(`${CHECK_FAILED}: citations: Gen.1.1 (does not mention adam_2)`);
    const eve = r.rows.find((x) => x.slug === 'eve_3')!;
    expect(eve).toMatchObject({
      kind: 'person',
      confidence: 'medium',
      model: 'claude-opus-5',
      generatedAt: '2026-09-16',
      status: 'draft',
      notes: 'only one verse',
    });
    expect(r.usage).toEqual({ input: 300, output: 60, cacheRead: 15, cacheWrite: 30 });
    expect(r.merge).toMatchObject({ added: ['adam_2', 'eve_3', 'god_1'], keptReviewed: [] });

    const written = parseDefinitionsFile(await readFile(file, 'utf8'));
    expect(written.map((x) => x.slug)).toEqual(['adam_2', 'eve_3', 'god_1']);

    // A second run must not overwrite a row that was reviewed in between.
    const reviewed = written.map((x) =>
      x.slug === 'god_1' ? { ...x, status: 'reviewed' as const, text: 'FINAL' } : x,
    );
    const { serializeDefinitions: ser } = await import('../src/definitions/merge.js');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, ser(reviewed));
    const again = await collect(
      fakeClient({ god_1: out('regenerated', ['Gen.1.1']) }),
      ctx,
      {
        ...record,
        targets: [{ slug: 'god_1', kind: 'person' }],
      },
      { pollMs: 1, mergeInto: file },
    );
    expect(again.merge!.keptReviewed).toEqual(['god_1']);
    const after = parseDefinitionsFile(await readFile(file, 'utf8'));
    expect(after.find((x) => x.slug === 'god_1')!.text).toBe('FINAL');
  });

  it('reports unusable results instead of inventing rows', () => {
    const meta = { model: 'm', generatedAt: 'd' };
    const target = { slug: 'god_1', kind: 'person' as const };
    const succeeded = (message: Partial<Anthropic.Messages.Message>) =>
      ({
        custom_id: 'god_1',
        result: { type: 'succeeded', message },
      }) as Anthropic.Messages.MessageBatchIndividualResponse;
    expect(
      rowFromResult({ custom_id: 'god_1', result: { type: 'expired' } }, target, ctx, meta),
    ).toEqual({ reason: 'expired' });
    expect(
      rowFromResult(succeeded({ content: [], stop_reason: 'end_turn' }), target, ctx, meta),
    ).toEqual({ reason: 'no text block' });
    expect(
      rowFromResult(
        succeeded({
          content: [{ type: 'text', text: '{oops', citations: null }],
          stop_reason: 'end_turn',
        }),
        target,
        ctx,
        meta,
      ),
    ).toMatchObject({ reason: expect.stringMatching(/^bad shape: not JSON/) });
    expect(
      rowFromResult(succeeded({ content: [], stop_reason: 'refusal' }), target, ctx, meta),
    ).toEqual({ reason: 'refusal' });
    const truncated = rowFromResult(
      succeeded({
        content: [{ type: 'text', text: out('cut', ['Gen.1.1']), citations: null }],
        stop_reason: 'max_tokens',
        model: 'claude-opus-5',
      }),
      target,
      ctx,
      meta,
    );
    expect(truncated).toMatchObject({
      row: { notes: `${CHECK_FAILED}: output truncated at max_tokens` },
    });
  });
});

// --------------------------------------------------------------------- gate

describe('gate with definitions', () => {
  const good: Definition = {
    slug: 'god_1',
    kind: 'person',
    text: 'God created.',
    citations: ['Gen.1.1'],
    model: 'm',
    generatedAt: '2026-01-01',
    status: 'reviewed',
  };
  const run = (defs: Definition[]) => {
    const src = makeSources();
    src.definitions = defs;
    return gate(normalize(src), src);
  };

  it('passes good rows and counts them', () => {
    const g = run([good, { ...good, slug: 'creation_1', kind: 'event', status: 'draft' }]);
    expect(g.ok).toBe(true);
    expect(g.facts).toContain('2 definitions (1 reviewed, 1 draft)');
  });

  it('rejects an unknown slug, a kind mismatch, a duplicate and a reviewed row with bad citations', () => {
    expect(run([{ ...good, slug: 'nobody' }]).errors).toEqual([
      'definition nobody: no such entity',
    ]);
    expect(run([{ ...good, kind: 'place' }]).errors).toEqual([
      'definition god_1: kind place, entity is a person',
    ]);
    expect(run([good, good]).errors).toEqual(['definition god_1: duplicate row']);
    expect(run([{ ...good, citations: ['Gen.2.1'] }]).errors).toEqual([
      'definition god_1: reviewed but citations: Gen.2.1 (does not mention god_1)',
    ]);
  });

  it('lets a draft through when the failure is already written into its notes', () => {
    const flagged = {
      ...good,
      status: 'draft' as const,
      citations: ['Gen.2.1'],
      notes: failureNotes(undefined, ['citations: Gen.2.1 (does not mention god_1)']),
    };
    const g = run([flagged]);
    expect(g.ok).toBe(true);
    expect(g.facts).toContain(
      '1 definitions (0 reviewed, 1 draft, 1 flagged by the citation check)',
    );
    expect(run([{ ...flagged, notes: undefined } as Definition]).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------- cli

describe('parseDefsArgs', () => {
  it('parses subcommands and options', () => {
    expect(parseDefsArgs(['submit', '--kind', 'place', '--limit', '5', '--dry-run', '30'])).toEqual(
      {
        command: 'submit',
        positional: [],
        kind: 'place',
        limit: 5,
        dryRun: 30,
        preview: false,
      },
    );
    expect(parseDefsArgs(['submit', '--slugs', 'a, b,,c', '--preview'])).toMatchObject({
      slugs: ['a', 'b', 'c'],
      preview: true,
    });
    expect(parseDefsArgs(['collect', 'msgbatch_1', '--poll-ms', '10', '--out', 'x.json'])).toEqual({
      command: 'collect',
      positional: ['msgbatch_1'],
      pollMs: 10,
      out: 'x.json',
      preview: false,
    });
    expect(parseDefsArgs([])).toMatchObject({ command: 'help' });
  });

  it('rejects bad values', () => {
    expect(() => parseDefsArgs(['submit', '--kind', 'group'])).toThrow(/--kind/);
    expect(() => parseDefsArgs(['submit', '--limit', '0'])).toThrow(/--limit/);
    expect(() => parseDefsArgs(['submit', '--dry-run', 'x'])).toThrow(/--dry-run/);
    expect(() => parseDefsArgs(['submit', '--bogus'])).toThrow();
  });
});

// ----------------------------------------------------------------- bundles

describe('writeBundles with definitions', () => {
  it('emits definitions.json only when the source had one', async () => {
    const { listOut, writeBundles } = await import('../src/bundles.js');
    const dir = await mkdtemp(join(tmpdir(), 'bundles-'));
    try {
      const src = makeSources();
      const without = await writeBundles(normalize(src), { repo: 'r', sha: 's' }, dir);
      expect(await listOut(dir)).not.toContain('definitions.json');
      expect(Object.keys(without.manifest.files)).not.toContain('definitions.json');

      src.definitions = [
        {
          slug: 'god_1',
          kind: 'person',
          text: 'God created.',
          citations: ['Gen.1.1'],
          model: 'm',
          generatedAt: '2026-01-01',
          status: 'draft',
        },
      ];
      const withDefs = await writeBundles(normalize(src), { repo: 'r', sha: 's' }, dir);
      expect(await listOut(dir)).toContain('definitions.json');
      expect(withDefs.manifest.files['definitions.json']).toMatch(/^[0-9a-f]{64}$/);
      const written = JSON.parse(await readFile(join(dir, 'definitions.json'), 'utf8'));
      expect(written).toEqual({ definitions: src.definitions });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
