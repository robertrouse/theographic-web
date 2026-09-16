/**
 * Brute-force entity matching over the full built index, timed on every
 * golden query (definition of done: p95 < 5 ms on Node; the phone target of
 * 1–3 ms is measured separately on a throttled profile, not here). Each query
 * is run several times and the best-of-N per query is kept, so the numbers
 * describe the algorithm rather than GC pauses or a cold JIT; the first pass
 * is reported too because that is what a cold search costs.
 */
import { describe, expect, it } from 'vitest';
import { loadEntityIndex } from '../src/entities/entityIndex.js';
import { matchEntities } from '../src/entities/match.js';
import { loadBooks, loadEntityIndexFile, SKIP_REASON } from './data.js';
import { buildBookAliasTable } from '../src/refs/bookAliases.js';
import { entityQueryOf, loadGoldenQueries } from './golden/runner.js';

const books = loadBooks();
const file = loadEntityIndexFile();

const P95_BUDGET_MS = 5;
const ROUNDS = 11;

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

describe.skipIf(!books || !file)('entity match timing', () => {
  if (!books || !file) return;
  const table = buildBookAliasTable(books);
  const index = loadEntityIndex(file);
  const queries = loadGoldenQueries()
    .filter((q) => !q.deferred)
    .map((q) => entityQueryOf(q.q, table))
    .filter((eq) => eq.text !== '');

  it(`runs every golden query under ${P95_BUDGET_MS} ms at p95`, () => {
    const cold: number[] = [];
    const best: number[] = [];
    for (const eq of queries) {
      let min = Number.POSITIVE_INFINITY;
      for (let r = 0; r < ROUNDS; r++) {
        const t0 = performance.now();
        matchEntities(eq.text, index, eq.kinds ? { kinds: eq.kinds } : {});
        const ms = performance.now() - t0;
        if (r === 0) cold.push(ms);
        if (ms < min) min = ms;
      }
      best.push(min);
    }
    const sb = [...best].sort((a, b) => a - b);
    const sc = [...cold].sort((a, b) => a - b);
    const fuzzy = queries
      .map((eq, i) => [eq.text, best[i]!] as const)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([q, ms]) => `${JSON.stringify(q)} ${ms.toFixed(2)} ms`);
    console.info(
      `entity match: ${queries.length} golden queries over ${index.rows.length} rows / ${index.names.length} strings — ` +
        `best-of-${ROUNDS} p50 ${percentile(sb, 0.5).toFixed(2)} ms, p95 ${percentile(sb, 0.95).toFixed(2)} ms, max ${sb[sb.length - 1]!.toFixed(2)} ms; ` +
        `first pass p50 ${percentile(sc, 0.5).toFixed(2)} ms, p95 ${percentile(sc, 0.95).toFixed(2)} ms\n` +
        `  slowest: ${fuzzy.join(' · ')}`,
    );
    expect(percentile(sb, 0.95)).toBeLessThan(P95_BUDGET_MS);
  });

  it('loads the index in well under the core-layer readiness budget', () => {
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) loadEntityIndex(file);
    const ms = (performance.now() - t0) / 5;
    console.info(`entity index: load ${ms.toFixed(1)} ms (${index.rows.length} rows)`);
    expect(ms).toBeLessThan(100);
  });
});

it.skipIf(books && file)(`entity match timing skipped: ${SKIP_REASON}`, () => {});
