/**
 * Golden-set runner, shared by CP-02..CP-05. `queries.jsonl` holds one line
 * per query: `{ n, q, expect: { kind: value, … }, note, deferred? }`. Each
 * expectation *kind* is implemented by the checkpoint that owns it; the
 * others are reported as skipped BY NAME so nothing passes silently.
 *
 * Kinds implemented here (CP-02):
 *   refs      partial Ref[] in order; each expected key must equal the parsed
 *             value, except `ambiguousWith` (expected ids ⊆ actual ids) and
 *             `verseCount` (derived via versesInRef). `[]` asserts no refs.
 *   errors    ParseError reasons, in order.
 *   consumed  exact consumed spans.
 *
 * Every other kind is listed in `KIND_OWNER` with the checkpoint that will
 * implement it; the test file turns those into named skips.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BookAliasTable } from '../../src/refs/bookAliases.js';
import { parseReference } from '../../src/refs/parseReference.js';
import type { ParseReferenceResult } from '../../src/refs/types.js';
import { verseCountInRef } from '../../src/refs/verseIds.js';

export interface GoldenQuery {
  n: number;
  q: string;
  expect: Record<string, unknown>;
  note?: string;
  deferred?: boolean;
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
  count: 'CP-04',
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
    .filter(([, owner]) => owner === 'CP-02')
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

/** Run one expectation kind for one query. Returns failures, or `undefined` if the kind is not implemented here. */
export function runExpectation(
  kind: string,
  value: unknown,
  query: GoldenQuery,
  table: BookAliasTable,
): string[] | undefined {
  if (!IMPLEMENTED_KINDS.has(kind)) return undefined;
  const result = parseReference(query.q, table);
  switch (kind) {
    case 'refs':
      return checkRefs(result, value as Record<string, unknown>[], table);
    case 'errors':
      return checkErrors(result, value as string[]);
    case 'consumed':
      return checkConsumed(result, value as [number, number][]);
    default:
      return undefined;
  }
}
