/**
 * Suggest: the source order, the 2-char trigger, dedupe, the same-name cap,
 * recent and fuzzy fallbacks, and the latency budget — < 2 ms p95 on Node
 * over every 2–6 character prefix of every golden query (design: sub-16 ms
 * on a phone; the runner is ~5× slower than a laptop, so the local gate
 * is 2 ms and CI gets 3×).
 */
import { describe, expect, it } from 'vitest';
import { SUGGEST } from '../src/suggest/suggest.js';
import { hasData } from './data.js';
import { openGoldenEngine } from './golden/engine.js';
import { loadGoldenQueries } from './golden/runner.js';

const engine = hasData() ? openGoldenEngine() : undefined;
const BUDGET_MS = 2;
const GATE_MS = process.env['CI'] ? BUDGET_MS * 3 : BUDGET_MS;

describe.skipIf(!engine)('suggest', () => {
  const e = engine!;

  it('triggers at 2 characters and never exceeds the limit', () => {
    expect(e.suggest('j')).toEqual([]);
    expect(e.suggest(' j ')).toEqual([]);
    expect(e.suggest('jo').length).toBeGreaterThan(0);
    expect(e.suggest('jo').length).toBeLessThanOrEqual(SUGGEST.limit);
    expect(e.suggest('jo', { limit: 3 })).toHaveLength(3);
  });

  it('completes books and partial references first', () => {
    const s = e.suggest('jn 3');
    expect(s[0]).toMatchObject({ kind: 'reference', label: 'John 3', query: 'John 3' });
    const gen = e.suggest('gene');
    expect(gen[0]).toMatchObject({ kind: 'book', label: 'Genesis', id: 'Gen' });
    expect(e.suggest('1 sa')[0]).toMatchObject({ kind: 'book', id: '1Sam' });
  });

  it('ranks the entity prefix range exact → prefix ratio → prominence, with sublabels', () => {
    const s = e.suggest('jerus');
    expect(s[0]).toMatchObject({ kind: 'entity', id: 'jerusalem_636', group: 'places' });
    expect(s[0]!.sublabel).toContain('City');
    const paul = e.suggest('paul');
    expect(paul[0]).toMatchObject({ id: 'paul_2479' });
    expect(paul[0]!.why).toContain('exact');
  });

  it('collapses people sharing a name to three and dedupes by id', () => {
    const s = e.suggest('simon');
    const simons = s.filter((x) => x.label === 'Simon' && x.group === 'people');
    expect(simons.length).toBe(SUGGEST.samePeopleCap);
    expect(new Set(simons.map((x) => x.sublabel)).size).toBe(simons.length);
    expect(new Set(s.map((x) => x.id ?? x.query)).size).toBe(s.length);
  });

  it('offers recent queries from 3 characters, after entities', () => {
    const recent = ['jerusalem council notes', 'jerusalem cistern'];
    expect(e.suggest('je', { recent }).some((x) => x.kind === 'recent')).toBe(false);
    // Entities come first in the source order, so with a broad prefix they fill
    // the list; a narrow prefix leaves room and the recent queries follow them.
    expect(e.suggest('jer', { recent }).some((x) => x.kind === 'recent')).toBe(false);
    const s = e.suggest('jerusalem c', { recent });
    const r = s.filter((x) => x.kind === 'recent').map((x) => x.label);
    expect(r).toEqual(recent);
    expect(s.findIndex((x) => x.kind === 'recent')).toBeGreaterThan(
      s.findIndex((x) => x.kind === 'entity'),
    );
  });

  it('falls back to a DL≤1 prefix only when fewer than 3 results and ≥ 4 chars', () => {
    const typo = e.suggest('jerusalm');
    expect(typo[0]).toMatchObject({ id: 'jerusalem_636' });
    expect(typo[0]!.why).toContain('fuzzy1');
    expect(e.suggest('jru')).toEqual([]); // 3 chars: no fuzzy
  });

  it('is deterministic', () => {
    for (const p of ['jo', 'sim', 'beth', 'jerusalm']) expect(e.suggest(p)).toEqual(e.suggest(p));
  });

  it(`answers every 2–6 char prefix of the golden queries in < ${BUDGET_MS} ms p95`, () => {
    const prefixes = new Set<string>();
    for (const q of loadGoldenQueries()) {
      for (let n = 2; n <= Math.min(6, q.q.length); n++) prefixes.add(q.q.slice(0, n));
    }
    for (const p of prefixes) e.suggest(p); // warm
    const times: [string, number][] = [];
    for (const p of prefixes) {
      let best = Infinity;
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        e.suggest(p, { recent: ['jerusalem council'] });
        best = Math.min(best, performance.now() - t0);
      }
      times.push([p, best]);
    }
    times.sort((a, b) => a[1] - b[1]);
    const p50 = times[Math.floor(times.length / 2)]![1];
    const p95 = times[Math.floor(times.length * 0.95)]![1];
    const worst = times[times.length - 1]!;
    console.info(
      `suggest latency over ${times.length} prefixes (best of 5): p50 ${p50.toFixed(3)} ms · p95 ${p95.toFixed(3)} ms · max ${worst[1].toFixed(3)} ms (${JSON.stringify(worst[0])})`,
    );
    expect(p95, `p95 over the gate (${GATE_MS} ms)`).toBeLessThan(GATE_MS);
  });
});
