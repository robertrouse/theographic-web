/**
 * Submit and collect Message Batches of definition requests.
 *
 *   submit  — ground every selected entity, build one request per slug
 *             (`custom_id` = slug), create the batch, and write a record to
 *             `.cache/definitions/<batchId>.json` so `collect` can run in a
 *             later session.
 *   collect — poll until `processing_status` is `ended`, stream the results
 *             (they arrive in any order — always keyed by `custom_id`), parse
 *             and check each one, and merge the rows into the definitions file.
 *
 * The SDK is reached through the small `BatchClient` interface so the whole
 * path is testable with a fake and no network. `sdkBatchClient()` is the only
 * place that touches `@anthropic-ai/sdk`.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import type { Definition } from '@theographic/core';
import { checkDefinition, failureNotes, OutputShapeError, parseOutput } from './check.js';
import type { GroundContext, GroundKind, Grounding } from './ground.js';
import { ground, kindOf } from './ground.js';
import {
  definitionsPath,
  DEFINITIONS_CACHE_DIR,
  mergeDefinitions,
  readDefinitions,
  writeDefinitions,
  type MergeReport,
} from './merge.js';
import { buildUserMessage, MAX_TOKENS, MODEL, OUTPUT_SCHEMA, SYSTEM_PROMPT } from './prompt.js';

type Request = Anthropic.Messages.BatchCreateParams.Request;
type MessageBatch = Anthropic.Messages.MessageBatch;
type IndividualResponse = Anthropic.Messages.MessageBatchIndividualResponse;

export interface BatchClient {
  create(requests: Request[]): Promise<MessageBatch>;
  retrieve(id: string): Promise<MessageBatch>;
  results(id: string): Promise<AsyncIterable<IndividualResponse>>;
}

/** The real thing. `new Anthropic()` resolves credentials from the environment. */
export function sdkBatchClient(client: Anthropic = new Anthropic()): BatchClient {
  return {
    create: (requests) => client.messages.batches.create({ requests }),
    retrieve: (id) => client.messages.batches.retrieve(id),
    results: (id) => client.messages.batches.results(id),
  };
}

// ---------------------------------------------------------------- requests

const CUSTOM_ID = /^[a-zA-Z0-9_-]{1,64}$/;

export function buildRequest(g: Grounding): Request {
  if (!CUSTOM_ID.test(g.slug)) throw new Error(`slug ${g.slug} is not a valid batch custom_id`);
  return {
    custom_id: g.slug,
    params: {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: buildUserMessage(g) }],
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    },
  };
}

export interface SelectOptions {
  kind?: GroundKind;
  slugs?: string[];
  limit?: number;
  /** N entities split evenly across kinds; see `dryRunSlugs`. */
  dryRun?: number;
  /** Slugs whose existing row is `reviewed` are skipped. */
  existing?: readonly Definition[];
}

/** Every definable slug with its kind, in a stable order: people, places, events. */
export function allTargets(ctx: GroundContext): { slug: string; kind: GroundKind }[] {
  return [
    ...ctx.n.people.map((p) => ({ slug: p.slug, kind: 'person' as const })),
    ...ctx.n.places.map((p) => ({ slug: p.slug, kind: 'place' as const })),
    ...ctx.n.events.map((e) => ({ slug: e.slug, kind: 'event' as const })),
  ];
}

/**
 * The dry-run sample: N/3 of each kind, chosen so the awkward cases are in
 * the first review — one person whose name is shared by others (`ambiguous`),
 * one place with no coordinates — and the rest spread evenly across the list
 * so it is not just the A's.
 */
export function dryRunSlugs(ctx: GroundContext, n: number): { slug: string; kind: GroundKind }[] {
  const per = Math.max(1, Math.floor(n / 3));
  const spread = <T>(xs: T[], k: number): T[] => {
    if (xs.length <= k) return xs;
    const step = xs.length / k;
    return Array.from({ length: k }, (_, i) => xs[Math.floor(i * step)]!);
  };
  const ambiguousPerson = ctx.n.people.find((p) => p.ambiguous && p.verseCount >= 3);
  const noCoordPlace = ctx.n.places.find((p) => p.lat === undefined && p.verseCount >= 2);
  const people = [
    ...(ambiguousPerson ? [ambiguousPerson] : []),
    ...spread(
      ctx.n.people.filter((p) => p !== ambiguousPerson),
      per - (ambiguousPerson ? 1 : 0),
    ),
  ];
  const places = [
    ...(noCoordPlace ? [noCoordPlace] : []),
    ...spread(
      ctx.n.places.filter((p) => p !== noCoordPlace),
      per - (noCoordPlace ? 1 : 0),
    ),
  ];
  const events = spread(ctx.n.events, n - people.length - places.length);
  return [
    ...people.map((p) => ({ slug: p.slug, kind: 'person' as const })),
    ...places.map((p) => ({ slug: p.slug, kind: 'place' as const })),
    ...events.map((e) => ({ slug: e.slug, kind: 'event' as const })),
  ];
}

export function selectTargets(
  ctx: GroundContext,
  opts: SelectOptions,
): { slug: string; kind: GroundKind }[] {
  let targets: { slug: string; kind: GroundKind }[];
  if (opts.slugs) {
    targets = opts.slugs.map((slug) => {
      const kind = kindOf(slug, ctx);
      if (!kind) throw new Error(`unknown slug ${slug}`);
      return { slug, kind };
    });
  } else if (opts.dryRun !== undefined) {
    targets = dryRunSlugs(ctx, opts.dryRun);
  } else {
    targets = allTargets(ctx);
  }
  if (opts.kind) targets = targets.filter((t) => t.kind === opts.kind);
  const reviewed = new Set(
    (opts.existing ?? []).filter((d) => d.status === 'reviewed').map((d) => d.slug),
  );
  targets = targets.filter((t) => !reviewed.has(t.slug));
  if (opts.limit !== undefined) targets = targets.slice(0, opts.limit);
  return targets;
}

// ------------------------------------------------------------------ submit

/** What `collect` needs to know about a batch it did not submit itself. */
export interface BatchRecord {
  batchId: string;
  model: string;
  submittedAt: string;
  targets: { slug: string; kind: GroundKind }[];
  /** Estimated input tokens across all requests (4 chars/token). */
  estimatedInputTokens: number;
}

export function recordPath(batchId: string, dir: string = DEFINITIONS_CACHE_DIR): string {
  return join(dir, `${batchId}.json`);
}

export interface SubmitResult {
  record: BatchRecord;
  requests: Request[];
}

export async function submit(
  client: BatchClient,
  ctx: GroundContext,
  opts: SelectOptions & { recordDir?: string; log?: (s: string) => void },
): Promise<SubmitResult> {
  const log = opts.log ?? (() => {});
  const targets = selectTargets(ctx, opts);
  if (targets.length === 0) throw new Error('nothing to submit');
  const requests = targets.map((t) => buildRequest(ground(t.kind, t.slug, ctx)));
  const estimatedInputTokens = requests.reduce(
    (s, r) =>
      s +
      Math.ceil(
        (SYSTEM_PROMPT.length +
          r.params.messages.reduce(
            (t, m) => t + (typeof m.content === 'string' ? m.content.length : 0),
            0,
          )) /
          4,
      ),
    0,
  );
  log(`submitting ${requests.length} requests (~${estimatedInputTokens} input tokens)`);
  const batch = await client.create(requests);
  const record: BatchRecord = {
    batchId: batch.id,
    model: MODEL,
    submittedAt: new Date().toISOString(),
    targets,
    estimatedInputTokens,
  };
  const dir = opts.recordDir ?? DEFINITIONS_CACHE_DIR;
  await mkdir(dir, { recursive: true });
  await writeFile(recordPath(batch.id, dir), JSON.stringify(record, null, 2) + '\n');
  log(`batch ${batch.id} ${batch.processing_status}; record at ${recordPath(batch.id, dir)}`);
  return { record, requests };
}

// ----------------------------------------------------------------- collect

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface CollectResult {
  rows: Definition[];
  /** Slugs that came back but failed a check; their rows are kept as drafts with notes. */
  failed: { slug: string; problems: string[] }[];
  /** Slugs with no usable result (errored, expired, canceled, no text). */
  missing: { slug: string; reason: string }[];
  usage: Usage;
  merge?: MergeReport;
}

export async function readRecord(
  batchId: string,
  dir: string = DEFINITIONS_CACHE_DIR,
): Promise<BatchRecord> {
  return JSON.parse(await readFile(recordPath(batchId, dir), 'utf8')) as BatchRecord;
}

function firstText(message: Anthropic.Messages.Message): string | undefined {
  for (const block of message.content) if (block.type === 'text') return block.text;
  return undefined;
}

/** One batch result → one definition row (or a reason it cannot be one). */
export function rowFromResult(
  res: IndividualResponse,
  target: { slug: string; kind: GroundKind },
  ctx: GroundContext,
  meta: { model: string; generatedAt: string },
): { row: Definition; problems: string[] } | { reason: string } {
  if (res.result.type !== 'succeeded') {
    const detail =
      res.result.type === 'errored'
        ? `${res.result.error.error.type}: ${res.result.error.error.message}`
        : res.result.type;
    return { reason: detail };
  }
  const message = res.result.message;
  if (message.stop_reason === 'refusal') return { reason: 'refusal' };
  const text = firstText(message);
  if (text === undefined) return { reason: 'no text block' };
  let out;
  try {
    out = parseOutput(text);
  } catch (e) {
    if (e instanceof OutputShapeError) return { reason: `bad shape: ${e.message}` };
    throw e;
  }
  const row: Definition = {
    slug: target.slug,
    kind: target.kind,
    text: out.definition.trim(),
    citations: out.citations,
    confidence: out.confidence,
    model: message.model || meta.model,
    generatedAt: meta.generatedAt,
    status: 'draft',
  };
  if (out.notes) row.notes = out.notes;
  if (message.stop_reason === 'max_tokens') {
    row.notes = failureNotes(row.notes, ['output truncated at max_tokens']);
  }
  const check = checkDefinition(row, ctx);
  if (!check.ok) row.notes = failureNotes(row.notes, check.problems);
  return { row, problems: check.ok ? [] : check.problems };
}

export async function collect(
  client: BatchClient,
  ctx: GroundContext,
  record: BatchRecord,
  opts: {
    pollMs?: number;
    log?: (s: string) => void;
    /** When set, merge into this definitions file; otherwise only return rows. */
    mergeInto?: string;
    now?: () => Date;
  } = {},
): Promise<CollectResult> {
  const log = opts.log ?? (() => {});
  const pollMs = opts.pollMs ?? 30_000;
  let batch = await client.retrieve(record.batchId);
  while (batch.processing_status !== 'ended') {
    const c = batch.request_counts;
    log(`batch ${record.batchId}: ${batch.processing_status}, ${c.processing} processing`);
    await new Promise((r) => setTimeout(r, pollMs));
    batch = await client.retrieve(record.batchId);
  }
  const c = batch.request_counts;
  log(
    `batch ended: ${c.succeeded} succeeded, ${c.errored} errored, ${c.expired} expired, ${c.canceled} canceled`,
  );

  const targetBySlug = new Map(record.targets.map((t) => [t.slug, t]));
  const generatedAt = (opts.now?.() ?? new Date()).toISOString().slice(0, 10);
  const rows: Definition[] = [];
  const failed: CollectResult['failed'] = [];
  const missing: CollectResult['missing'] = [];
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const seen = new Set<string>();

  for await (const res of await client.results(record.batchId)) {
    const target = targetBySlug.get(res.custom_id);
    if (!target) {
      log(`  ignoring result for unknown custom_id ${res.custom_id}`);
      continue;
    }
    seen.add(res.custom_id);
    if (res.result.type === 'succeeded') {
      const u = res.result.message.usage;
      usage.input += u.input_tokens;
      usage.output += u.output_tokens;
      usage.cacheRead += u.cache_read_input_tokens ?? 0;
      usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
    }
    const r = rowFromResult(res, target, ctx, { model: record.model, generatedAt });
    if ('reason' in r) {
      missing.push({ slug: target.slug, reason: r.reason });
      continue;
    }
    rows.push(r.row);
    if (r.problems.length) failed.push({ slug: target.slug, problems: r.problems });
  }
  for (const t of record.targets) {
    if (!seen.has(t.slug)) missing.push({ slug: t.slug, reason: 'no result in batch' });
  }
  rows.sort((a, b) => a.slug.localeCompare(b.slug));

  const result: CollectResult = { rows, failed, missing, usage };
  if (opts.mergeInto) {
    const existing = await readDefinitions(opts.mergeInto);
    const merge = mergeDefinitions(existing, rows);
    await writeDefinitions(opts.mergeInto, merge.merged);
    result.merge = merge;
    log(
      `merged into ${opts.mergeInto}: ${merge.added.length} added, ${merge.replaced.length} replaced, ${merge.keptReviewed.length} kept (reviewed)`,
    );
  }
  return result;
}

export { definitionsPath };
