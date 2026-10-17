/**
 * Golden-set runner, shared by CP-02..CP-05. `queries.jsonl` holds one line
 * per query: `{ n, q, expect: { kind: value, … }, note, deferred?,
 * pendingReview? }`. Each expectation *kind* is implemented by the checkpoint
 * that owns it; the others are reported as skipped BY NAME so nothing passes
 * silently.
 *
 * Kinds implemented here (CP-02):
 *   refs      partial Ref[] in order; each expected key must equal the parsed
 *             value, except `ambiguousWith` (expected ids ⊆ actual ids) and
 *             `verseCount` (derived via versesInRef). `[]` asserts no refs.
 *   errors    ParseError reasons, in order.
 *   consumed  exact consumed spans.
 *
 * Kinds implemented here (CP-03), evaluated over `matchEntities` on the
 * *entity query* — the input minus leading `key:value` filters (a
 * person/place/event/group/book filter restricts the row types) and minus
 * the spans the reference parser consumed, except a bare ambiguous book
 * (confidence < 0.9), which the design says emits both readings:
 *   empty / nonEmpty   group names; entity groups are checked, `verses` is deferred
 *   top                {group, id | namedHighestVc}
 *   inTop              [{group, n=10, ids | names, subset?, why?, kind?, featureType?}]
 *                      group "all" is every entity hit in rank order
 *   order              {group, ids} appear in that relative order
 *   exactly            {group, ids} are the group's hits, in order
 *   sublabels          {group, distinct | distinctMin | values} over the hits
 *                      sharing the top hit's label — the same-name set the
 *                      sublabel exists to tell apart
 *   scoreBelow         [{group, idPrefix, max, why?}] — every such hit scores
 *                      below max (and names `why`); at least one must exist
 *   why                strings the top entity hit's why[] must contain; a
 *                      non-entity tier name ("phrase") is deferred to CP-04
 *   count              {group, equals | min}; verses deferred to CP-04
 *
 * CP-04's text kinds live in `text.ts` and are routed there per query by
 * `ownsTextExpectation` before anything below runs. CP-05's cross-group
 * kinds live in `engine.ts`, which also answers the `verses` parts of
 * `empty` / `nonEmpty` / `top` / `inTop` / `count` on the queries `text.ts`
 * does not own; the entity parts stay here, and both sets of failures are
 * joined so one expectation line is still one test.
 *
 * A `pendingReview` map on a line names kinds whose expectation disagrees
 * with the real data or the formula; the test runs them and skips with the
 * note while they still fail, and fails loudly once they pass so the flag
 * gets removed.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SearchEngine } from '../../src/engine.js';
import type { EntityIndex } from '../../src/entities/entityIndex.js';
import { matchEntities, TIER_RANK, type EntityHit } from '../../src/entities/match.js';
import type { EntityGroup, EntityIndexType } from '../../src/entities/types.js';
import type { BookAliasTable } from '../../src/refs/bookAliases.js';
import { parseReference } from '../../src/refs/parseReference.js';
import type { ParseReferenceResult } from '../../src/refs/types.js';
import { verseCountInRef } from '../../src/refs/verseIds.js';
import { ENGINE_KINDS, runEngineExpectation } from './engine.js';
import { ownsTextExpectation, runTextExpectation } from './text.js';

export interface GoldenQuery {
  n: number;
  q: string;
  expect: Record<string, unknown>;
  note?: string;
  deferred?: boolean;
  /** kind → why it is expected to fail today. */
  pendingReview?: Record<string, string>;
}

export const KIND_OWNER: Record<string, string> = {
  refs: 'CP-02',
  errors: 'CP-02',
  consumed: 'CP-02',
  empty: 'CP-03',
  nonEmpty: 'CP-03',
  top: 'CP-03',
  inTop: 'CP-03',
  order: 'CP-03',
  exactly: 'CP-03',
  sublabels: 'CP-03',
  scoreBelow: 'CP-03',
  why: 'CP-03',
  count: 'CP-03 (entity groups) / CP-04, CP-05 (verses)',
  sameSetAs: 'CP-04',
  rankBelow: 'CP-04',
  snippet: 'CP-04',
  expansion: 'CP-04',
  notSurfacedBy: 'CP-04',
  allWeak: 'CP-04',
  topGroup: 'CP-05',
  groupOrder: 'CP-05',
  scope: 'CP-05',
  allVerseIdsMatch: 'CP-05',
  versesFirst: 'CP-05',
  noCrash: 'CP-05',
  perf: 'CP-05',
};

export const IMPLEMENTED_KINDS: ReadonlySet<string> = new Set(
  Object.entries(KIND_OWNER)
    .filter(([, owner]) => /CP-0[2345]/.test(owner))
    .map(([kind]) => kind),
);

export function loadGoldenQueries(): GoldenQuery[] {
  const path = fileURLToPath(new URL('./queries.jsonl', import.meta.url));
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, i) => {
      try {
        return JSON.parse(line) as GoldenQuery;
      } catch (e) {
        throw new Error(`queries.jsonl line ${i + 1}: ${(e as Error).message}`);
      }
    });
}

// ----------------------------------------------------------------- CP-02

/** Returns failure messages; empty means the expectation held. */
export function checkRefs(
  result: ParseReferenceResult,
  expected: Record<string, unknown>[],
  table: BookAliasTable,
): string[] {
  const failures: string[] = [];
  if (result.refs.length !== expected.length) {
    failures.push(
      `expected ${expected.length} ref(s), got ${result.refs.length}: ${JSON.stringify(
        result.refs.map((r) => `${r.kind} ${r.bookOsis} ${r.verseIdStart}-${r.verseIdEnd}`),
      )}`,
    );
    return failures;
  }
  expected.forEach((exp, i) => {
    const ref = result.refs[i]!;
    for (const [key, want] of Object.entries(exp)) {
      if (key === 'ambiguousWith') {
        const actualIds = new Set((ref.ambiguousWith ?? []).map((e) => e.id));
        for (const id of want as string[]) {
          if (!actualIds.has(id)) failures.push(`ref[${i}].ambiguousWith lacks ${id}`);
        }
      } else if (key === 'verseCount') {
        const got = verseCountInRef(ref, table.books);
        if (got !== want)
          failures.push(`ref[${i}].verseCount: expected ${String(want)}, got ${got}`);
      } else {
        const got = (ref as unknown as Record<string, unknown>)[key];
        if (JSON.stringify(got) !== JSON.stringify(want)) {
          failures.push(
            `ref[${i}].${key}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`,
          );
        }
      }
    }
  });
  return failures;
}

export function checkErrors(result: ParseReferenceResult, expected: string[]): string[] {
  const got = result.errors.map((e) => e.reason);
  return JSON.stringify(got) === JSON.stringify(expected)
    ? []
    : [`errors: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`];
}

export function checkConsumed(
  result: ParseReferenceResult,
  expected: [number, number][],
): string[] {
  return JSON.stringify(result.consumed) === JSON.stringify(expected)
    ? []
    : [`consumed: expected ${JSON.stringify(expected)}, got ${JSON.stringify(result.consumed)}`];
}

// ----------------------------------------------------------------- CP-03

const ENTITY_GROUPS: ReadonlySet<string> = new Set([
  'people',
  'places',
  'events',
  'groups',
  'passages',
  'all',
]);

const FILTER_KINDS: Record<string, EntityIndexType> = {
  person: 'p',
  place: 'l',
  event: 'e',
  group: 'g',
  book: 'b',
};

/** Ambiguous bare books keep their text for entity matching (design: "emits both"). */
const BARE_BOOK_CONFIDENCE = 0.9;

export interface EntityQuery {
  text: string;
  kinds?: EntityIndexType[];
}

/** What the entity matcher sees for a golden query: filters and consumed references removed. */
export function entityQueryOf(q: string, table: BookAliasTable): EntityQuery {
  let text = q;
  let kinds: EntityIndexType[] | undefined;
  for (;;) {
    const m = /^(\w+):(\S+)\s*/.exec(text);
    if (!m) break;
    const kind = FILTER_KINDS[m[1]!.toLowerCase()];
    if (kind !== undefined) kinds = [...(kinds ?? []), kind];
    text = text.slice(m[0].length);
  }
  const parsed = parseReference(text, table);
  const keep = parsed.refs.every((r) => r.confidence < BARE_BOOK_CONFIDENCE);
  if (!keep) {
    const chars = [...text];
    for (const [s, e] of parsed.consumed) for (let i = s; i < e; i++) chars[i] = ' ';
    text = chars.join('');
  }
  return kinds ? { text: text.trim(), kinds } : { text: text.trim() };
}

export interface EntityRun {
  hits: EntityHit[];
  byGroup: Map<string, EntityHit[]>;
  index: EntityIndex;
}

export function runEntityQuery(q: string, table: BookAliasTable, index: EntityIndex): EntityRun {
  const eq = entityQueryOf(q, table);
  const hits = matchEntities(eq.text, index, eq.kinds ? { kinds: eq.kinds } : {});
  const byGroup = new Map<string, EntityHit[]>();
  for (const h of hits) byGroup.set(h.group, [...(byGroup.get(h.group) ?? []), h]);
  byGroup.set('all', hits);
  return { hits, byGroup, index };
}

export interface RunResult {
  failures: string[];
  /** Parts of the expectation this checkpoint does not verify, with their owner. */
  deferred?: string;
}

const ok = (): RunResult => ({ failures: [] });
const fail = (...failures: string[]): RunResult => ({ failures });

function groupHits(run: EntityRun, group: string): EntityHit[] {
  return run.byGroup.get(group) ?? [];
}

function describe(h: EntityHit): string {
  return `${h.id}@${h.raw.toFixed(3)}[${h.tier}]`;
}

function checkGroupsEmpty(run: EntityRun, groups: string[], wantEmpty: boolean): RunResult {
  const failures: string[] = [];
  for (const g of groups) {
    if (!ENTITY_GROUPS.has(g)) continue; // verses/topics: engine.ts
    const hits = groupHits(run, g);
    if (wantEmpty && hits.length > 0)
      failures.push(`${g} not empty: ${hits.slice(0, 5).map(describe).join(', ')}`);
    if (!wantEmpty && hits.length === 0) failures.push(`${g} empty`);
  }
  return { failures };
}

function checkTop(run: EntityRun, value: Record<string, unknown>): RunResult {
  const group = value['group'] as string;
  if (!ENTITY_GROUPS.has(group)) return ok(); // verses: engine.ts
  const hits = groupHits(run, group);
  const top = hits[0];
  if (!top) return fail(`${group} has no hits`);
  if (typeof value['id'] === 'string' && top.id !== value['id']) {
    return fail(`${group} top is ${describe(top)}, expected ${value['id']}`);
  }
  if (typeof value['namedHighestVc'] === 'string') {
    const name = value['namedHighestVc'];
    if (top.label !== name)
      return fail(`${group} top is ${describe(top)} (${top.label}), expected a ${name}`);
    const maxVc = Math.max(
      ...hits.filter((h) => h.label === name).map((h) => run.index.rows[h.row]!.vc),
    );
    if (run.index.rows[top.row]!.vc !== maxVc) {
      return fail(
        `${group} top ${describe(top)} has vc ${run.index.rows[top.row]!.vc}, not the highest ${maxVc}`,
      );
    }
  }
  return ok();
}

function checkInTop(run: EntityRun, items: Record<string, unknown>[]): RunResult {
  const failures: string[] = [];
  for (const item of items) {
    const group = item['group'] as string;
    if (!ENTITY_GROUPS.has(group)) continue; // verses: engine.ts
    const n = typeof item['n'] === 'number' ? item['n'] : 10;
    const top = groupHits(run, group).slice(0, n);
    const topIds = new Set(top.map((h) => h.id));
    if (Array.isArray(item['ids'])) {
      const ids = item['ids'] as string[];
      if (item['subset'] === true) {
        for (const h of top)
          if (!ids.includes(h.id))
            failures.push(`${group} top-${n} has ${describe(h)} ∉ ${JSON.stringify(ids)}`);
      } else {
        for (const id of ids) {
          if (!topIds.has(id))
            failures.push(`${group} top-${n} lacks ${id}: ${top.map(describe).join(', ')}`);
        }
      }
      if (typeof item['why'] === 'string') {
        for (const h of top) {
          if (ids.includes(h.id) && !h.why.join(' ').includes(item['why'])) {
            failures.push(`${describe(h)} why lacks "${item['why']}": ${JSON.stringify(h.why)}`);
          }
        }
      }
    }
    if (Array.isArray(item['names'])) {
      for (const name of item['names'] as string[]) {
        const match = top.find((h) => {
          if (h.label !== name) return false;
          const row = run.index.rows[h.row]!;
          if (typeof item['kind'] === 'string' && row.t !== FILTER_KINDS[item['kind']])
            return false;
          if (typeof item['featureType'] === 'string' && row.ft !== item['featureType'])
            return false;
          return true;
        });
        if (!match) {
          failures.push(
            `${group} top-${n} has no ${JSON.stringify(item['kind'] ?? '')} named "${name}"${
              typeof item['featureType'] === 'string' ? ` (${item['featureType']})` : ''
            }: ${top.map((h) => `${h.label}/${describe(h)}`).join(', ')}`,
          );
        }
      }
    }
  }
  return { failures };
}

function checkOrder(run: EntityRun, value: { group: string; ids: string[] }): RunResult {
  const hits = groupHits(run, value.group);
  const positions = value.ids.map((id) => hits.findIndex((h) => h.id === id));
  const missing = value.ids.filter((_, i) => positions[i]! < 0);
  if (missing.length) return fail(`${value.group} lacks ${missing.join(', ')}`);
  for (let i = 1; i < positions.length; i++) {
    if (positions[i]! < positions[i - 1]!) {
      return fail(
        `${value.group} order: ${value.ids.join(' > ')} expected, got ${hits
          .filter((h) => value.ids.includes(h.id))
          .map(describe)
          .join(' > ')}`,
      );
    }
  }
  return ok();
}

function checkExactly(run: EntityRun, value: { group: string; ids: string[] }): RunResult {
  const got = groupHits(run, value.group).map((h) => h.id);
  return JSON.stringify(got) === JSON.stringify(value.ids)
    ? ok()
    : fail(
        `${value.group}: expected exactly ${JSON.stringify(value.ids)}, got ${JSON.stringify(got)}`,
      );
}

function checkSublabels(run: EntityRun, value: Record<string, unknown>): RunResult {
  const group = value['group'] as string;
  const hits = groupHits(run, group);
  const top = hits[0];
  if (!top) return fail(`${group} has no hits`);
  const sameName = hits.filter((h) => h.label === top.label);
  const subs = sameName.map((h) => h.sublabel);
  const distinct = new Set(subs).size;
  const failures: string[] = [];
  if (typeof value['distinct'] === 'number' && distinct !== value['distinct']) {
    failures.push(
      `${sameName.length} "${top.label}" hits carry ${distinct} distinct sublabels, expected ${value['distinct']}: ${JSON.stringify(subs)}`,
    );
  }
  if (typeof value['distinctMin'] === 'number' && distinct < value['distinctMin']) {
    failures.push(
      `${sameName.length} "${top.label}" hits carry ${distinct} distinct sublabels, expected ≥ ${value['distinctMin']}: ${JSON.stringify(subs)}`,
    );
  }
  if (Array.isArray(value['values'])) {
    for (const v of value['values'] as string[]) {
      if (!subs.some((s) => s.includes(v)))
        failures.push(`no "${top.label}" sublabel contains "${v}": ${JSON.stringify(subs)}`);
    }
  }
  return { failures };
}

function checkScoreBelow(run: EntityRun, items: Record<string, unknown>[]): RunResult {
  const failures: string[] = [];
  for (const item of items) {
    const group = item['group'] as string;
    const prefix = item['idPrefix'] as string;
    const max = item['max'] as number;
    const hits = groupHits(run, group).filter((h) => h.id.startsWith(prefix));
    if (hits.length === 0) {
      failures.push(`${group} has no hit with id prefix "${prefix}"`);
      continue;
    }
    for (const h of hits) {
      if (!(h.score < max))
        failures.push(`${describe(h)} scores ${h.score.toFixed(3)}, not below ${max}`);
      if (typeof item['why'] === 'string' && !h.why.join(' ').includes(item['why'])) {
        failures.push(`${describe(h)} why lacks "${item['why']}": ${JSON.stringify(h.why)}`);
      }
    }
  }
  return { failures };
}

function checkWhy(run: EntityRun, values: string[]): RunResult {
  const entityTiers = values.filter((v) => v in TIER_RANK);
  const failures: string[] = [];
  if (entityTiers.length) {
    const top = run.hits[0];
    if (!top) failures.push('no entity hits');
    else {
      for (const v of entityTiers) {
        if (!top.why.join(' ').includes(v))
          failures.push(`top hit ${describe(top)} why lacks "${v}": ${JSON.stringify(top.why)}`);
      }
    }
  }
  return { failures };
}

function checkCount(run: EntityRun, value: Record<string, unknown>): RunResult {
  const group = value['group'] as string;
  if (!ENTITY_GROUPS.has(group)) return ok(); // verses: text.ts or engine.ts
  const hits = groupHits(run, group);
  const failures: string[] = [];
  if (typeof value['equals'] === 'number' && hits.length !== value['equals']) {
    const tiers = new Map<string, number>();
    for (const h of hits) tiers.set(h.tier, (tiers.get(h.tier) ?? 0) + 1);
    failures.push(
      `${group} has ${hits.length} hits, expected ${value['equals']} (${[...tiers].map(([t, c]) => `${t} ×${c}`).join(', ')})`,
    );
  }
  if (typeof value['min'] === 'number' && hits.length < value['min']) {
    failures.push(`${group} has ${hits.length} hits, expected ≥ ${value['min']}`);
  }
  return { failures };
}

export interface GoldenContext {
  table: BookAliasTable;
  index: EntityIndex;
  /** The whole engine over the same bundle, for the CP-05 kinds. */
  engine: SearchEngine;
}

/** Run one expectation kind for one query. `undefined` if the kind is not implemented here. */
export function runExpectation(
  kind: string,
  value: unknown,
  query: GoldenQuery,
  ctx: GoldenContext,
): RunResult | undefined {
  // CP-04 owns the text kinds for text queries (and `expansion` everywhere).
  if (ownsTextExpectation(kind, query)) {
    const failures = runTextExpectation(kind, value, query);
    return failures === undefined ? undefined : { failures };
  }
  if (!IMPLEMENTED_KINDS.has(kind)) return undefined;
  if (ENGINE_KINDS.has(kind)) {
    const failures = runEngineExpectation(kind, value, query, ctx);
    return failures === undefined ? undefined : { failures };
  }
  // The verses parts of the shared kinds: engine.ts answers them, the entity parts run below.
  const engineFailures = runEngineExpectation(kind, value, query, ctx) ?? [];
  const { table, index } = ctx;
  switch (kind) {
    case 'refs':
      return {
        failures: checkRefs(
          parseReference(query.q, table),
          value as Record<string, unknown>[],
          table,
        ),
      };
    case 'errors':
      return { failures: checkErrors(parseReference(query.q, table), value as string[]) };
    case 'consumed':
      return {
        failures: checkConsumed(parseReference(query.q, table), value as [number, number][]),
      };
    default:
      break;
  }
  const run = runEntityQuery(query.q, table, index);
  let r: RunResult | undefined;
  switch (kind) {
    case 'empty':
      r = checkGroupsEmpty(run, value as string[], true);
      break;
    case 'nonEmpty':
      r = checkGroupsEmpty(run, value as string[], false);
      break;
    case 'top':
      r = checkTop(run, value as Record<string, unknown>);
      break;
    case 'inTop':
      r = checkInTop(run, value as Record<string, unknown>[]);
      break;
    case 'order':
      r = checkOrder(run, value as { group: string; ids: string[] });
      break;
    case 'exactly':
      r = checkExactly(run, value as { group: string; ids: string[] });
      break;
    case 'sublabels':
      r = checkSublabels(run, value as Record<string, unknown>);
      break;
    case 'scoreBelow':
      r = checkScoreBelow(run, value as Record<string, unknown>[]);
      break;
    case 'why':
      r = checkWhy(run, value as string[]);
      break;
    case 'count':
      r = checkCount(run, value as Record<string, unknown>);
      break;
    default:
      return undefined;
  }
  return { failures: [...r.failures, ...engineFailures] };
}

export type { EntityGroup };
