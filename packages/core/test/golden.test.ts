/**
 * Golden acceptance set (docs/search-design.md §"Golden set"). One test per
 * (query, expectation kind). Kinds a later checkpoint owns are skipped by
 * name — look for "skipped" in the report, never for a quiet green. An
 * expectation flagged `pendingReview` is run and skipped with its note while
 * it still fails; the moment it passes the test fails so the flag is removed.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { loadEntityIndex } from '../src/entities/entityIndex.js';
import { buildBookAliasTable } from '../src/refs/bookAliases.js';
import { loadBooks, loadEntityIndexFile, loadTextIndex, SKIP_REASON } from './data.js';
import {
  IMPLEMENTED_KINDS,
  KIND_OWNER,
  loadGoldenQueries,
  runExpectation,
} from './golden/runner.js';

const books = loadBooks();
const indexFile = loadEntityIndexFile();
const textIndex = loadTextIndex();
const queries = loadGoldenQueries();
const skipped = new Map<string, number[]>();
const partial: string[] = [];
const pending: string[] = [];

describe.skipIf(!books || !indexFile || !textIndex)(`golden set (${queries.length} lines)`, () => {
  if (!books || !indexFile || !textIndex) return; // the body still runs when skipped
  const ctx = { table: buildBookAliasTable(books), index: loadEntityIndex(indexFile) };

  for (const query of queries) {
    describe(`#${query.n} ${JSON.stringify(query.q)}`, () => {
      if (query.deferred) {
        it.skip(`deferred — ${query.note ?? ''}`, () => {});
        return;
      }
      for (const [kind, value] of Object.entries(query.expect)) {
        const owner = KIND_OWNER[kind];
        if (owner === undefined) {
          it(`${kind}: unknown expectation kind`, () => {
            throw new Error(
              `queries.jsonl #${query.n}: expectation kind "${kind}" is not in KIND_OWNER`,
            );
          });
          continue;
        }
        if (!IMPLEMENTED_KINDS.has(kind)) {
          skipped.set(kind, [...(skipped.get(kind) ?? []), query.n]);
          it.skip(`${kind} — implemented in ${owner}`, () => {});
          continue;
        }
        const review = query.pendingReview?.[kind];
        it(review ? `${kind} (pending review)` : kind, (t) => {
          const result = runExpectation(kind, value, query, ctx);
          if (result === undefined) throw new Error(`#${query.n} ${kind}: runner returned nothing`);
          if (result.deferred) partial.push(`#${query.n} ${kind}: ${result.deferred}`);
          const label = `#${query.n} ${query.q}: ${query.note ?? ''}`;
          if (review) {
            if (result.failures.length === 0) {
              throw new Error(
                `${label} — pendingReview.${kind} now PASSES; remove the flag ("${review}")`,
              );
            }
            pending.push(
              `#${query.n} ${kind}: ${review}\n      ${result.failures.join('\n      ')}`,
            );
            t.skip(`pending review — ${review}`);
            return;
          }
          expect(result.failures, label).toEqual([]);
        });
      }
    });
  }

  afterAll(() => {
    const lines = [...skipped]
      .sort(([a], [b]) =>
        KIND_OWNER[a]! < KIND_OWNER[b]! ? -1 : KIND_OWNER[a]! > KIND_OWNER[b]! ? 1 : 0,
      )
      .map(
        ([kind, ns]) =>
          `  ${kind.padEnd(16)} ${KIND_OWNER[kind]}  ×${ns.length} (#${[...new Set(ns)].join(', #')})`,
      );
    console.info(
      `golden: skipped expectation kinds pending later checkpoints:\n${lines.join('\n')}`,
    );
    if (partial.length) {
      console.info(`golden: parts deferred to a later checkpoint:\n  ${partial.join('\n  ')}`);
    }
    if (pending.length) {
      console.info(`golden: expectations pending review:\n  ${pending.join('\n  ')}`);
    }
  });
});

it.skipIf(books && indexFile && textIndex)(`golden set skipped: ${SKIP_REASON}`, () => {});
