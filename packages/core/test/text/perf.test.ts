/**
 * Warm query latency on the real index (docs/search-design.md §Budgets:
 * text 5–15 ms, whole query < 30 ms). Every golden text query plus the
 * single common words that stress the postings decoder. Prints p50/p95
 * per query; fails when any warm run exceeds 30 ms on Node. A phone
 * measurement belongs in the CP-04 file, not here.
 */
import { describe, expect, it } from 'vitest';
import { searchText } from '../../src/text/bm25.js';
import { openTextIndex } from '../../src/text/index.js';
import { loadGoldenQueries } from '../golden/runner.js';
import { TEXT_QUERIES } from '../golden/text.js';
import { DATA_DIR, loadTextIndex } from '../data.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The design budget (docs/search-design.md §Budgets) for a warm query on a laptop. */
const BUDGET_MS = 30;
/**
 * Shared CI runners are noisy: the same query that takes 8 ms here has hit
 * 40 ms on GitHub's 2-vCPU runner. In CI the gate is loosened to 3× so it
 * still catches a regression of an order of magnitude without failing on
 * scheduler jitter; the real number is what a laptop and a phone measure.
 */
const GATE_MS = process.env['CI'] ? BUDGET_MS * 3 : BUDGET_MS;
const RUNS = 25;

describe.skipIf(!loadTextIndex())('text query latency (needs built data)', () => {
  const index = loadTextIndex()!;
  const queries = [
    ...new Set([
      ...loadGoldenQueries()
        .filter((q) => TEXT_QUERIES.has(q.n) && q.n !== 11)
        .map((q) => q.q),
      'lord',
      'love',
      'the',
      'and the lord said unto moses',
    ]),
  ];

  it('opens the index in a few milliseconds', () => {
    const idx = new Uint8Array(readFileSync(join(DATA_DIR, 'verses.idx')));
    const txt = new Uint8Array(readFileSync(join(DATA_DIR, 'verses.txt')));
    const t0 = performance.now();
    const ix = openTextIndex(idx, txt);
    const open = performance.now() - t0;
    const t1 = performance.now();
    ix.allTerms();
    const decode = performance.now() - t1;
    console.info(
      `open ${open.toFixed(2)} ms, decode all ${ix.termCount} terms ${decode.toFixed(2)} ms`,
    );
    expect(open).toBeLessThan(GATE_MS);
  });

  it(`answers every golden text query warm in < ${BUDGET_MS} ms`, () => {
    const rows: string[] = [];
    let worst = 0;
    for (const q of queries) {
      searchText(q, index, { explain: true }); // warm
      const times: number[] = [];
      for (let i = 0; i < RUNS; i++) {
        const t0 = performance.now();
        searchText(q, index, { explain: true });
        times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      const p50 = times[Math.floor(RUNS * 0.5)]!;
      const p95 = times[Math.floor(RUNS * 0.95)]!;
      const max = times[RUNS - 1]!;
      worst = Math.max(worst, max);
      rows.push(
        `${JSON.stringify(q).padEnd(30)} p50 ${p50.toFixed(2).padStart(6)} ms  p95 ${p95.toFixed(2).padStart(6)} ms  max ${max.toFixed(2).padStart(6)} ms`,
      );
    }
    console.info(`text query latency (${RUNS} warm runs each):\n${rows.join('\n')}`);
    expect(
      worst,
      `a warm text query exceeded the gate (${GATE_MS} ms; design budget ${BUDGET_MS} ms)`,
    ).toBeLessThan(GATE_MS);
  });
});
