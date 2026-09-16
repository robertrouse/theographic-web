/**
 * Entity name matching: brute force over every row of the entity index,
 * one match tier per row, one score formula. This file is the only place
 * the entity ranking constants live (invariant 4); the same numbers are in
 * `docs/search-design.md` §"Ranking formulas" (Entity).
 *
 *   s = band + PROM · ln(1+vc)/ln(1+maxVc) − LEN · min(Δlen, LEN_CAP)/LEN_CAP
 *
 * Every hit carries `why[]` naming the tier, the matched string and each
 * score part (invariant 3). Deterministic: rows are visited in index order
 * and ties break by group order → first verse → id (invariant 9).
 */
import { damerauLevenshtein } from './damerau.js';
import { labelFor, sublabelFor } from './disambiguate.js';
import { ALIAS_STRONG, ENTITY_GROUP, ENTITY_GROUP_ORDER, type EntityIndex } from './entityIndex.js';
import { NAME_STOPWORDS, nameTokens, normalizeName } from './normalizeName.js';
import type { EntityGroup, EntityIndexType } from './types.js';

/**
 * Score bands per match tier and the blend weights. Tiers are tried in this
 * order and a row keeps its highest band.
 *
 * - `exact`       query equals the primary name
 * - `aliasExact`  query equals an alias of weight ≥ `ALIAS_STRONG`
 * - `multiToken`  every query token (≥ 2) is a name, title or strong-alias token
 * - `prefix`      query is a proper prefix of the name or a strong alias;
 *                 band + `prefixSpan` · |query| / |name|
 * - `token`       a query token equals a token of the name (multi-word query
 *                 or multi-word name; stopwords never count)
 * - `aliasWeak`   query equals an alias of weight w < `ALIAS_STRONG`;
 *                 band + `aliasWeakSpan` · w
 * - `fuzzy1/2`    Damerau-Levenshtein 1 / 2 from the name or a strong alias;
 *                 only when the lexical tiers found fewer than `fuzzyBelowHits`
 *                 rows; distance ≤ 1 for queries shorter than `fuzzyShortLen`,
 *                 else ≤ 2; queries shorter than `fuzzyMinLen` never fuzz.
 */
export const ENTITY_TIERS = {
  exact: 1.0,
  aliasExact: 0.95,
  multiToken: 0.85,
  prefix: 0.8,
  prefixSpan: 0.1,
  token: 0.75,
  aliasWeak: 0.55,
  aliasWeakSpan: 0.3,
  fuzzy1: 0.6,
  fuzzy2: 0.45,
  /** Weight of prominence `ln(1+vc)/ln(1+maxVc)`. */
  prom: 0.09,
  /** Penalty at `lenCap` characters of length difference. */
  len: 0.01,
  lenCap: 5,
  fuzzyBelowHits: 3,
  fuzzyShortLen: 6,
  fuzzyMinLen: 3,
} as const;

export type EntityTier =
  'exact' | 'aliasExact' | 'multiToken' | 'prefix' | 'token' | 'aliasWeak' | 'fuzzy1' | 'fuzzy2';

/** Lexicographic tier order for `strictTiers`. Lower is better. */
export const TIER_RANK: Record<EntityTier, number> = {
  exact: 0,
  aliasExact: 1,
  multiToken: 2,
  prefix: 3,
  token: 4,
  aliasWeak: 5,
  fuzzy1: 6,
  fuzzy2: 7,
};

export interface EntityHit {
  group: EntityGroup;
  id: string;
  kind: EntityIndexType;
  /** Row index into the index, for callers that need the row. */
  row: number;
  /** `min(1, raw)` — the cross-group score. */
  score: number;
  /** The unclamped formula value; ranks entities among themselves. */
  raw: number;
  tier: EntityTier;
  label: string;
  sublabel: string;
  why: string[];
}

export interface MatchOptions {
  /** Restrict to these row types (`person:` filters pass `['p']`). */
  kinds?: readonly EntityIndexType[];
  /** Order by tier first, then score; default orders by score alone. */
  strictTiers?: boolean;
  /** Default true. */
  fuzzy?: boolean;
  /** Keep the first `limit` hits after ranking. */
  limit?: number;
}

interface Candidate {
  tier: EntityTier;
  band: number;
  /** The index string the query matched; its length feeds the Δlen penalty. */
  matched: string;
  detail: string;
}

function better(a: Candidate | undefined, b: Candidate): Candidate {
  return a === undefined || b.band > a.band ? b : a;
}

const FUZZY_TIER: Record<number, EntityTier> = { 1: 'fuzzy1', 2: 'fuzzy2' };

export function matchEntities(
  query: string,
  index: EntityIndex,
  opts: MatchOptions = {},
): EntityHit[] {
  const q = normalizeName(query);
  if (q === '') return [];
  const qTokens = nameTokens(q);
  const multi = qTokens.length >= 2;
  const contentTokens = qTokens.filter((t) => t.length >= 2 && !NAME_STOPWORDS.has(t));
  const kinds = opts.kinds ? new Set(opts.kinds) : undefined;
  const T = ENTITY_TIERS;

  const rows = index.rows;
  const found: (Candidate | undefined)[] = new Array(rows.length);
  let lexicalHits = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (kinds && !kinds.has(r.t)) continue;
    let c: Candidate | undefined;

    if (r.norm === q) {
      c = { tier: 'exact', band: T.exact, matched: r.norm, detail: `name "${r.norm}"` };
    }

    for (const [alias, w, source] of r.aliases) {
      if (alias !== q) continue;
      const strong = w >= ALIAS_STRONG;
      c = better(c, {
        tier: strong ? 'aliasExact' : 'aliasWeak',
        band: strong ? T.aliasExact : T.aliasWeak + T.aliasWeakSpan * w,
        matched: alias,
        detail: `alias "${alias}" w=${w.toFixed(2)} from ${source}`,
      });
    }

    if (multi && (c === undefined || c.band < T.multiToken)) {
      const vocab = index.strongTokens[i]!;
      if (qTokens.every((t) => vocab.includes(t))) {
        c = better(c, {
          tier: 'multiToken',
          band: T.multiToken,
          matched: r.norm,
          detail: `all of [${qTokens.join(' ')}] in name/title/alias tokens`,
        });
      }
    }

    if (c === undefined || c.band < T.prefix + T.prefixSpan) {
      let best: Candidate | undefined;
      const consider = (s: string, what: string): void => {
        if (s.length > q.length && s.startsWith(q)) {
          const ratio = q.length / s.length;
          const band = T.prefix + T.prefixSpan * ratio;
          if (best === undefined || band > best.band) {
            best = {
              tier: 'prefix',
              band,
              matched: s,
              detail: `"${q}" starts ${what} "${s}" (${q.length}/${s.length})`,
            };
          }
        }
      };
      consider(r.norm, 'name');
      for (const [alias, w] of r.aliases) if (w >= ALIAS_STRONG) consider(alias, 'alias');
      if (best) c = better(c, best);
    }

    if (contentTokens.length > 0 && (c === undefined || c.band < T.token)) {
      const own = index.nameTokens[i]!;
      if (multi || own.length >= 2) {
        const hit = contentTokens.find((t) => own.includes(t));
        if (hit !== undefined) {
          c = better(c, {
            tier: 'token',
            band: T.token,
            matched: r.norm,
            detail: `token "${hit}" in name "${r.norm}"`,
          });
        }
      }
    }

    if (c !== undefined) {
      found[i] = c;
      lexicalHits++;
    }
  }

  if (opts.fuzzy !== false && lexicalHits < T.fuzzyBelowHits && q.length >= T.fuzzyMinLen) {
    const maxD = q.length < T.fuzzyShortLen ? 1 : 2;
    const qLen = q.length;
    for (let i = 0; i < rows.length; i++) {
      if (found[i] !== undefined) continue;
      const r = rows[i]!;
      if (kinds && !kinds.has(r.t)) continue;
      let bestD = maxD + 1;
      let bestS = '';
      let bestWhat = '';
      const tryString = (s: string, what: string): void => {
        const dl = s.length - qLen;
        if (dl > maxD || dl < -maxD) return; // length band
        const d = damerauLevenshtein(q, s, maxD);
        if (d < bestD) {
          bestD = d;
          bestS = s;
          bestWhat = what;
        }
      };
      tryString(r.norm, 'name');
      for (const [alias, w] of r.aliases) if (w >= ALIAS_STRONG) tryString(alias, 'alias');
      if (bestD <= maxD) {
        const tier = FUZZY_TIER[bestD]!;
        found[i] = {
          tier,
          band: T[tier],
          matched: bestS,
          detail: `"${q}" is ${bestD} edit${bestD === 1 ? '' : 's'} from ${bestWhat} "${bestS}"`,
        };
      }
    }
  }

  const hits: EntityHit[] = [];
  for (let i = 0; i < rows.length; i++) {
    const c = found[i];
    if (c === undefined) continue;
    const r = rows[i]!;
    const prom = index.logMaxVc > 0 ? Math.log(1 + r.vc) / index.logMaxVc : 0;
    const dLen = Math.abs(q.length - c.matched.length);
    const promPart = T.prom * prom;
    const lenPart = (T.len * Math.min(dLen, T.lenCap)) / T.lenCap;
    const raw = c.band + promPart - lenPart;
    hits.push({
      group: ENTITY_GROUP[r.t],
      id: r.id,
      kind: r.t,
      row: i,
      score: Math.min(1, raw),
      raw,
      tier: c.tier,
      label: labelFor(r),
      sublabel: sublabelFor(r),
      why: [
        `${c.tier}: ${c.detail}`,
        `band ${c.band.toFixed(3)}`,
        `prom +${promPart.toFixed(3)} (vc ${r.vc})`,
        `len −${lenPart.toFixed(3)} (Δ${dLen})`,
        `raw ${raw.toFixed(3)}`,
      ],
    });
  }

  const strict = opts.strictTiers === true;
  hits.sort((a, b) => {
    if (strict && a.tier !== b.tier) return TIER_RANK[a.tier] - TIER_RANK[b.tier];
    if (a.raw !== b.raw) return b.raw - a.raw;
    if (a.group !== b.group) return ENTITY_GROUP_ORDER[a.group] - ENTITY_GROUP_ORDER[b.group];
    const oa = rows[a.row]!.order ?? Number.POSITIVE_INFINITY;
    const ob = rows[b.row]!.order ?? Number.POSITIVE_INFINITY;
    if (oa !== ob) return oa < ob ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return opts.limit !== undefined ? hits.slice(0, opts.limit) : hits;
}
