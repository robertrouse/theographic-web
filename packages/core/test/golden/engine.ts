/**
 * Golden expectations that need the whole engine (CP-05): the cross-group
 * kinds, and the `verses`-group parts of the entity kinds (`top`, `inTop`,
 * `empty`, `nonEmpty`, `count`) for queries CP-04's `text.ts` does not own.
 * Every check runs `engine.searchSync` on the real bundle.
 *
 * Kinds implemented here:
 *   topGroup         all[0].group
 *   groupOrder       the first hit of each listed group appears in `all`
 *                    in that order
 *   scope            the first clause's resolved scope has these books /
 *                    testament / division
 *   allVerseIdsMatch every returned verse id matches the regex
 *   versesFirst      {mentions, in}: the leading verse hits are all verses
 *                    that both mention the entity and lie in the reference
 *   noCrash          searchSync returns a result
 *   perf             {maxMs}: a warm searchSync stays under maxMs (×3 in CI)
 *   top/inTop/empty/nonEmpty/count on group "verses" (verses group only)
 *
 * `timingSummary()` collects warm timings for every golden query so the test
 * can print p50/p95 and fail any query over the budget.
 */
import { openEngine, type SearchEngine } from '../../src/engine.js';
import type { Hit, SearchResult } from '../../src/query/types.js';
import { DATA_DIR, loadBooks, loadEntityIndexFile } from '../data.js';
import type { GoldenContext, GoldenQuery } from './runner.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ENGINE_KINDS: ReadonlySet<string> = new Set([
  'topGroup',
  'groupOrder',
  'scope',
  'allVerseIdsMatch',
  'versesFirst',
  'noCrash',
  'perf',
]);

/** Design budget for a warm query on a laptop; CI runners get 3× (see text/perf.test.ts). */
export const BUDGET_MS = 30;
export const GATE_MS = process.env['CI'] ? BUDGET_MS * 3 : BUDGET_MS;

/** The engine over the built bundle, all three layers, opened synchronously. */
export function openGoldenEngine(): SearchEngine | undefined {
  const books = loadBooks();
  const entities = loadEntityIndexFile();
  if (!books || !entities) return undefined;
  return openEngine({
    books: { books },
    entities,
    text: {
      idx: new Uint8Array(readFileSync(join(DATA_DIR, 'verses.idx'))),
      txt: new Uint8Array(readFileSync(join(DATA_DIR, 'verses.txt'))),
    },
    graph: new Uint8Array(readFileSync(join(DATA_DIR, 'graph.bin'))),
  });
}

const results = new Map<string, SearchResult>();

/** One search per query string, cached — the goldens ask several things of the same result. */
export function run(engine: SearchEngine, q: string): SearchResult {
  let r = results.get(q);
  if (!r) {
    r = engine.searchSync(q, { limitPerGroup: 10 });
    results.set(q, r);
  }
  return r;
}

function describeHit(h: Hit): string {
  return `${h.group}/${String(h.id)}@${h.score.toFixed(3)}`;
}

function isVerses(v: unknown): boolean {
  return typeof v === 'object' && v !== null && (v as { group?: string }).group === 'verses';
}

/** Failure messages, or undefined when the kind is not ours for this query. */
export function runEngineExpectation(
  kind: string,
  value: unknown,
  query: GoldenQuery,
  ctx: Pick<GoldenContext, 'engine'>,
): string[] | undefined {
  const e = ctx.engine;
  switch (kind) {
    case 'topGroup': {
      const r = run(e, query.q);
      const top = r.all[0];
      if (!top) return [`topGroup: no hits at all`];
      return top.group === value
        ? []
        : [
            `topGroup: expected ${String(value)}, got ${describeHit(top)}; all: ${r.all.slice(0, 5).map(describeHit).join(', ')}`,
          ];
    }
    case 'groupOrder': {
      const r = run(e, query.q);
      const want = value as string[];
      const positions = want.map((g) => r.all.findIndex((h) => h.group === g));
      const failures: string[] = [];
      want.forEach((g, i) => {
        if (positions[i]! < 0) failures.push(`groupOrder: no ${g} hit in all[]`);
      });
      for (let i = 1; i < positions.length && failures.length === 0; i++) {
        if (positions[i]! < positions[i - 1]!) {
          failures.push(
            `groupOrder: expected ${want.join(' < ')}, first hits at ${positions.join(', ')}: ${r.all.slice(0, 6).map(describeHit).join(', ')}`,
          );
        }
      }
      return failures;
    }
    case 'scope': {
      const r = run(e, query.q);
      const want = value as { books?: string[]; testament?: string; division?: string };
      const got = r.plan.clauses[0]?.scope;
      const failures: string[] = [];
      if (!got) return [`scope: plan has no scope (why: ${r.plan.why.join(' | ')})`];
      if (
        want.books &&
        JSON.stringify([...(got.books ?? [])].sort()) !== JSON.stringify([...want.books].sort())
      ) {
        failures.push(
          `scope.books: expected ${JSON.stringify(want.books)}, got ${JSON.stringify(got.books)}`,
        );
      }
      if (want.testament && got.testament !== want.testament) {
        failures.push(`scope.testament: expected ${want.testament}, got ${String(got.testament)}`);
      }
      if (want.division && got.division !== want.division) {
        failures.push(`scope.division: expected ${want.division}, got ${String(got.division)}`);
      }
      return failures;
    }
    case 'allVerseIdsMatch': {
      const r = run(e, query.q);
      const re = new RegExp(value as string);
      const bad = r.groups.verses.hits
        .filter((h) => !re.test(String(h.id)))
        .map((h) => String(h.id));
      const failures = bad.length
        ? [`allVerseIdsMatch: ${bad.join(', ')} do not match ${String(value)}`]
        : [];
      if (r.groups.verses.hits.length === 0)
        failures.push('allVerseIdsMatch: no verse hits to check');
      return failures;
    }
    case 'versesFirst': {
      const r = run(e, query.q);
      const { mentions, in: inRef } = value as { mentions: string; in: string };
      const parsed = e.parseReference(inRef);
      const ref = parsed.refs[0];
      if (!ref) return [`versesFirst: "${inRef}" is not a reference`];
      const [lo, hi] = [ref.verseIdStart, ref.verseIdEnd];
      const expected = new Set(e.mentions(mentions).filter((v) => v >= lo && v <= hi));
      if (expected.size === 0) return [`versesFirst: ${mentions} has no verses in ${inRef}`];
      const hits = r.groups.verses.hits;
      const lead = hits.slice(0, Math.min(expected.size, hits.length));
      const wrong = lead.filter((h) => !expected.has(h.id as number));
      const failures: string[] = [];
      if (lead.length === 0) failures.push('versesFirst: no verse hits');
      if (wrong.length) {
        failures.push(
          `versesFirst: ${wrong.map(describeHit).join(', ')} lead the verses but are not ${mentions} mentions in ${inRef} (${[...expected].join(', ')})`,
        );
      }
      return failures;
    }
    case 'noCrash': {
      try {
        const r = run(e, query.q);
        return r ? [] : ['noCrash: no result'];
      } catch (err) {
        return [`noCrash: threw ${(err as Error).message}`];
      }
    }
    case 'perf': {
      const { maxMs } = value as { maxMs: number };
      const gate = process.env['CI'] ? maxMs * 3 : maxMs;
      const ms = warmTime(e, query.q);
      return ms < gate
        ? []
        : [`perf: warm searchSync took ${ms.toFixed(1)} ms, budget ${maxMs} ms (gate ${gate})`];
    }
    case 'top': {
      if (!isVerses(value)) return undefined;
      const { id } = value as { id: number };
      const hits = run(e, query.q).groups.verses.hits;
      return hits[0]?.id === id
        ? []
        : [`top verses: expected ${id}, got ${hits.slice(0, 3).map(describeHit).join(', ')}`];
    }
    case 'inTop': {
      const items = (value as Record<string, unknown>[]).filter(isVerses);
      if (items.length === 0) return undefined;
      const failures: string[] = [];
      for (const item of items) {
        const n = typeof item['n'] === 'number' ? item['n'] : 10;
        const r = e.searchSync(query.q, { limitPerGroup: n });
        const top = r.groups.verses.hits.slice(0, n);
        const ids = item['ids'] as number[];
        if (item['subset'] === true) {
          for (const h of top)
            if (!ids.includes(h.id as number))
              failures.push(`verses top-${n} has ${describeHit(h)} ∉ ${JSON.stringify(ids)}`);
        } else {
          for (const id of ids) {
            const h = top.find((x) => x.id === id);
            if (!h)
              failures.push(`verses top-${n} lacks ${id}: ${top.map(describeHit).join(', ')}`);
            else if (
              typeof item['why'] === 'string' &&
              !(h.why ?? []).join(' ').includes(item['why'])
            ) {
              failures.push(
                `${describeHit(h)} why lacks "${item['why']}": ${JSON.stringify(h.why)}`,
              );
            }
          }
        }
      }
      return failures;
    }
    case 'empty':
    case 'nonEmpty': {
      const groups = (value as string[]).filter((g) => g === 'verses' || g === 'topics');
      if (groups.length === 0) return undefined;
      const r = run(e, query.q);
      const failures: string[] = [];
      for (const g of groups) {
        const res = r.groups[g as 'verses' | 'topics'];
        if (kind === 'empty' && res.total > 0)
          failures.push(
            `${g} not empty: ${res.hits.slice(0, 3).map(describeHit).join(', ')} (${res.total})`,
          );
        if (kind === 'nonEmpty' && res.total === 0) failures.push(`${g} empty`);
      }
      return failures;
    }
    case 'count': {
      if (!isVerses(value)) return undefined;
      const { equals, min } = value as { equals?: number; min?: number };
      const total = run(e, query.q).groups.verses.total;
      const failures: string[] = [];
      if (equals !== undefined && total !== equals)
        failures.push(`verses count: expected ${equals}, got ${total}`);
      if (min !== undefined && total < min)
        failures.push(`verses count: expected ≥ ${min}, got ${total}`);
      return failures;
    }
    default:
      return undefined;
  }
}

const timings = new Map<string, number>();

/** Median of `runs` warm `searchSync` calls, cached per query. */
export function warmTime(e: SearchEngine, q: string, runs = 5): number {
  const have = timings.get(q);
  if (have !== undefined) return have;
  e.searchSync(q); // warm
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    e.searchSync(q);
    t.push(performance.now() - t0);
  }
  t.sort((a, b) => a - b);
  const ms = t[Math.floor(runs / 2)]!;
  timings.set(q, ms);
  return ms;
}

export function timingSummary(
  e: SearchEngine,
  queries: string[],
): { p50: number; p95: number; worst: [string, number]; rows: string[] } {
  const list = queries.map((q): [string, number] => [q, warmTime(e, q)]);
  const sorted = [...list].sort((a, b) => a[1] - b[1]);
  const p50 = sorted[Math.floor(sorted.length * 0.5)]![1];
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]![1];
  const worst = sorted[sorted.length - 1]!;
  const rows = [...sorted]
    .reverse()
    .slice(0, 8)
    .map(([q, ms]) => `  ${JSON.stringify(q).padEnd(28)} ${ms.toFixed(2).padStart(6)} ms`);
  return { p50, p95, worst, rows };
}
