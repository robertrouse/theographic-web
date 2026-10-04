/**
 * Golden expectations for the verse-text queries (CP-04): #11's snippet,
 * the text-search kinds on #21–25, #47, #48, and `expansion` on any query.
 * The runner (`runner.ts`) asks `ownsTextExpectation` and hands those here;
 * every other query and kind stays with its owner.
 *
 * The text layer alone answers these — there is no cross-group merge yet
 * (CP-05) — so `group: "verses"` expectations are evaluated against
 * `searchText` directly and the other groups are ignored here.
 *
 * Kinds implemented (all evaluated on the real bundle):
 *   top           hits[0].id === id
 *   inTop         the first `n` (default 10) ids ⊇ ids; with `subset: true`,
 *                 the first `n` ids ⊆ ids instead
 *   why           the top hit's why[] mentions each substring
 *   count         total equals / ≥ min
 *   sameSetAs     the same verse ids as searching the other query
 *   rankBelow     a verse matched only through one of `forms` scores below
 *                 what the exact `below` form would score at the same tf and
 *                 length — the 0.7 is the whole difference — and, among hits
 *                 with equal (tf, L'), every exact hit ranks above every
 *                 variant hit
 *   notSurfacedBy the other query's hits never include the verse
 *   allWeak       every query word is weak; the search still returns hits
 *   snippet       the verse's snippet keeps `unhighlighted` outside every
 *                 highlight span for a query made of that verse's own words
 *   expansion     (any query) each listed term is a variant of some query word
 */
import { BM25, searchText, tfNorm, type TextHit } from '../../src/text/bm25.js';
import type { TextIndex } from '../../src/text/index.js';
import { isPsalm119, tokenize } from '../../src/text/tokenizer.js';
import { loadTextIndex } from '../data.js';
import type { GoldenQuery } from './runner.js';

/** Golden query numbers whose text-search expectations CP-04 owns. */
export const TEXT_QUERIES: ReadonlySet<number> = new Set([11, 21, 22, 23, 24, 25, 47, 48]);

export const TEXT_KINDS: ReadonlySet<string> = new Set([
  'top',
  'inTop',
  'why',
  'count',
  'sameSetAs',
  'rankBelow',
  'notSurfacedBy',
  'allWeak',
  'snippet',
]);

/** Kinds this file answers for every golden query, not just TEXT_QUERIES. */
const ANY_QUERY_KINDS: ReadonlySet<string> = new Set(['expansion']);

export function ownsTextExpectation(kind: string, query: GoldenQuery): boolean {
  return ANY_QUERY_KINDS.has(kind) || (TEXT_QUERIES.has(query.n) && TEXT_KINDS.has(kind));
}

let cached: TextIndex | undefined;
function index(): TextIndex {
  cached ??= loadTextIndex();
  if (!cached) throw new Error('golden text expectations need the built data — run `npm run data`');
  return cached;
}

const ALL = 1_000_000; // every hit; the goldens count and compare whole sets

function ids(q: string): number[] {
  return searchText(q, index(), { limit: ALL }).hits.map((h) => h.id);
}

function isVerses(v: unknown): boolean {
  return typeof v === 'object' && v !== null && (v as { group?: string }).group === 'verses';
}

/** Returns failure messages, or `undefined` when the kind/query is not ours. */
export function runTextExpectation(
  kind: string,
  value: unknown,
  query: GoldenQuery,
): string[] | undefined {
  if (!ownsTextExpectation(kind, query)) return undefined;
  const ix = index();
  switch (kind) {
    case 'expansion': {
      const variants = new Set(
        searchText(query.q, ix, { limit: 0 }).words.flatMap((w) => w.variants.map((v) => v.term)),
      );
      return (value as string[])
        .filter((term) => !variants.has(term))
        .map((term) => `expansion: ${term} not among ${JSON.stringify([...variants])}`);
    }
    case 'top': {
      if (!isVerses(value)) return [];
      const { id } = value as { id: number };
      const hits = searchText(query.q, ix, { explain: true, limit: 3 }).hits;
      return hits[0]?.id === id
        ? []
        : [
            `top: expected ${id}, got ${hits.map((h) => `${h.id} (${h.score.toFixed(2)})`).join(', ')}`,
          ];
    }
    case 'inTop': {
      const failures: string[] = [];
      for (const spec of (value as Record<string, unknown>[]).filter(isVerses)) {
        const {
          ids: want,
          n = 10,
          subset = false,
        } = spec as {
          ids: number[];
          n?: number;
          subset?: boolean;
        };
        const got = searchText(query.q, ix, { limit: n }).hits.map((h) => h.id);
        if (subset) {
          const extra = got.filter((id) => !want.includes(id));
          if (extra.length)
            failures.push(`inTop: top-${n} ${JSON.stringify(got)} ⊄ ${JSON.stringify(want)}`);
        } else {
          const missing = want.filter((id) => !got.includes(id));
          if (missing.length)
            failures.push(
              `inTop: ${JSON.stringify(missing)} not in top-${n} ${JSON.stringify(got)}`,
            );
        }
      }
      return failures;
    }
    case 'why': {
      const top = searchText(query.q, ix, { explain: true, limit: 1 }).hits[0];
      if (!top) return ['why: no hits'];
      return (value as string[])
        .filter((needle) => !top.why!.some((w) => w.includes(needle)))
        .map((needle) => `why: "${needle}" not in ${JSON.stringify(top.why)}`);
    }
    case 'count': {
      if (!isVerses(value)) return [];
      const { equals, min } = value as { equals?: number; min?: number };
      const total = searchText(query.q, ix, { limit: 0 }).total;
      const failures: string[] = [];
      if (equals !== undefined && total !== equals)
        failures.push(`count: expected ${equals}, got ${total}`);
      if (min !== undefined && total < min) failures.push(`count: expected ≥ ${min}, got ${total}`);
      return failures;
    }
    case 'sameSetAs': {
      const a = ids(query.q).sort((x, y) => x - y);
      const b = ids(value as string).sort((x, y) => x - y);
      return JSON.stringify(a) === JSON.stringify(b)
        ? []
        : [
            `sameSetAs: ${a.length} verses for ${JSON.stringify(query.q)} vs ${b.length} for ${JSON.stringify(value)}`,
          ];
    }
    case 'rankBelow':
      return checkRankBelow(query.q, value as { forms: string[]; below: string }, ix);
    case 'notSurfacedBy': {
      const { q, id } = value as { q: string; id: number };
      return ids(q).includes(id) ? [`notSurfacedBy: ${JSON.stringify(q)} surfaces ${id}`] : [];
    }
    case 'allWeak': {
      const r = searchText(query.q, ix, { limit: 1 });
      const failures: string[] = [];
      if (r.allWeak !== value)
        failures.push(`allWeak: expected ${String(value)}, got ${r.allWeak}`);
      if (r.hits.length === 0)
        failures.push('allWeak: the rarest weak word should still generate hits');
      return failures;
    }
    case 'snippet': {
      const { verse, unhighlighted } = value as { verse: number; unhighlighted: string };
      const doc = ix.docIndexOf(verse);
      if (doc < 0) return [`snippet: verse ${verse} is not in the index`];
      const text = ix.textAt(doc);
      const at = text.indexOf(unhighlighted);
      if (at < 0)
        return [`snippet: ${JSON.stringify(unhighlighted)} is not in ${JSON.stringify(text)}`];
      // Search for the verse's own words, header included, and look for the verse.
      const words = tokenize(text)
        .map((t) => t.term)
        .join(' ');
      const hit = searchText(words, ix, { limit: 50 }).hits.find((h) => h.id === verse);
      if (!hit) return [`snippet: searching the verse's own words did not return it`];
      const overlap = hit.snippet.highlights.filter(
        ([s, e]) => s < at + unhighlighted.length && e > at,
      );
      const covered = tokenize(text, { acrostic: isPsalm119(verse) }).length;
      const failures: string[] = [];
      if (overlap.length)
        failures.push(
          `snippet: ${JSON.stringify(unhighlighted)} is highlighted ${JSON.stringify(overlap)}`,
        );
      if (hit.snippet.highlights.length !== covered) {
        failures.push(`snippet: ${hit.snippet.highlights.length} highlights for ${covered} tokens`);
      }
      return failures;
    }
    default:
      return undefined;
  }
}

function checkRankBelow(
  q: string,
  { forms, below }: { forms: string[]; below: string },
  ix: TextIndex,
): string[] {
  const r = searchText(q, ix, { explain: true, limit: ALL });
  const idf = r.words.find((w) => w.word === below)?.idf;
  if (idf === undefined) return [`rankBelow: ${JSON.stringify(below)} is not a query word`];
  const failures: string[] = [];
  const byTfLen = new Map<string, { exact: TextHit[]; variant: TextHit[] }>();
  for (const h of r.hits) {
    const m = /^bm25 [\d.]+ = (\S+?)(?:~(\S+?))?\((?:\w+ [\d.]+, )?idf [\d.]+, tf (\d+)\)$/.exec(
      h.why![0]!,
    );
    if (!m) continue;
    const [, word, variant, tf] = m;
    if (word !== below) continue;
    const L = Math.max(ix.docLen(ix.docIndexOf(h.id)), BM25.minDocLen);
    const key = `${tf}/${L}`;
    const bucket = byTfLen.get(key) ?? { exact: [], variant: [] };
    if (variant === undefined) bucket.exact.push(h);
    else if (forms.includes(variant)) {
      bucket.variant.push(h);
      const exactWould = idf * tfNorm(Number(tf), L, ix.avgDocLen);
      if (!(h.score < exactWould)) {
        failures.push(
          `rankBelow: ${h.id} via ${variant} scores ${h.score.toFixed(3)} ≥ exact ${exactWould.toFixed(3)}`,
        );
      }
    }
    byTfLen.set(key, bucket);
  }
  let compared = 0;
  for (const [key, { exact, variant }] of byTfLen) {
    for (const e of exact) {
      for (const v of variant) {
        compared++;
        if (!(v.score < e.score))
          failures.push(
            `rankBelow: at tf/L' ${key}, ${v.id} (${v.score.toFixed(3)}) ≥ ${e.id} (${e.score.toFixed(3)})`,
          );
      }
    }
  }
  if (compared === 0) failures.push('rankBelow: no equal-tf pairs to compare');
  return failures;
}
