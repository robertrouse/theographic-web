/**
 * Golden acceptance set (docs/search-design.md §"Golden set"). One test per
 * (query, expectation kind). Kinds a later checkpoint owns are skipped by
 * name — look for "skipped" in the report, never for a quiet green.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { buildBookAliasTable } from '../src/refs/bookAliases.js';
import { loadBooks, SKIP_REASON } from './data.js';
import {
  IMPLEMENTED_KINDS,
  KIND_OWNER,
  loadGoldenQueries,
  runExpectation,
} from './golden/runner.js';

const books = loadBooks();
const queries = loadGoldenQueries();
const skipped = new Map<string, number[]>();

describe.skipIf(!books)(`golden set (${queries.length} lines)`, () => {
  if (!books) return; // the body still runs when skipped
  const table = buildBookAliasTable(books);

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
        it(kind, () => {
          const failures = runExpectation(kind, value, query, table);
          expect(failures, `#${query.n} ${query.q}: ${query.note ?? ''}`).toEqual([]);
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
  });
});

it.skipIf(books)(`golden set skipped: ${SKIP_REASON}`, () => {});
