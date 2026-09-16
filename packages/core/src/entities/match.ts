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
 * - `fuzzy1/2`    Damerau-Levenshtein 1 / 2 from the name or a strong alias,
 *                 on rows no lexical tier hit; always for a single-word query,
 *                 for a multi-word query only when the lexical tiers found
 *                 fewer than `fuzzyBelowHits` rows; distance ≤ 1 for queries
 *                 shorter than `fuzzyShortLen`, else ≤ 2; queries shorter than
 *                 `fuzzyMinLen` never fuzz.
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
  const qLen = q.length;
  const q0 = q.charCodeAt(0);
  const prefixCeiling = T.prefix + T.prefixSpan;

  const rows = index.rows;
  const strongAliases = index.strongAliases;
  const found: (Candidate | undefined)[] = new Array(rows.length);
  let lexicalHits = 0;

  // The hot loop: one pass over every row, no closures, no allocation unless
  // the row is a hit. ~5,000 rows in well under a millisecond.
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (kinds && !kinds.has(r.t)) continue;
    const norm = r.norm;
    let c: Candidate | undefined;

    if (norm === q) {
      c = { tier: 'exact', band: T.exact, matched: norm, detail: `name "${norm}"` };
    }

    const aliases = r.aliases;
    for (let j = 0; j < aliases.length; j++) {
      const a = aliases[j]!;
      if (a[0] !== q) continue;
      const w = a[1];
      const strong = w >= ALIAS_STRONG;
      c = better(c, {
        tier: strong ? 'aliasExact' : 'aliasWeak',
        band: strong ? T.aliasExact : T.aliasWeak + T.aliasWeakSpan * w,
        matched: a[0],
        detail: `alias "${a[0]}" w=${w.toFixed(2)} from ${a[2]}`,
      });
    }

    if (multi && (c === undefined || c.band < T.multiToken)) {
      const vocab = index.strongTokens[i]!;
      let all = true;
      for (let k = 0; k < qTokens.length; k++) {
        if (!vocab.includes(qTokens[k]!)) {
          all = false;
          break;
        }
      }
      if (all) {
        c = better(c, {
          tier: 'multiToken',
          band: T.multiToken,
          matched: norm,
          detail: `all of [${qTokens.join(' ')}] in name/title/alias tokens`,
        });
      }
    }

    if (c === undefined || c.band < prefixCeiling) {
      let bestS: string | undefined;
      let bestWhat = 'name';
      if (norm.length > qLen && norm.charCodeAt(0) === q0 && norm.startsWith(q)) bestS = norm;
      const strong = strongAliases[i]!;
      for (let j = 0; j < strong.length; j++) {
        const s = strong[j]!;
        if (
          s.length > qLen &&
          s.charCodeAt(0) === q0 &&
          (bestS === undefined || s.length < bestS.length) &&
          s.startsWith(q)
        ) {
          bestS = s;
          bestWhat = 'alias';
        }
      }
      if (bestS !== undefined) {
        c = better(c, {
          tier: 'prefix',
          band: T.prefix + (T.prefixSpan * qLen) / bestS.length,
          matched: bestS,
          detail: `"${q}" starts ${bestWhat} "${bestS}" (${qLen}/${bestS.length})`,
        });
      }
    }

    if (contentTokens.length > 0 && (c === undefined || c.band < T.token)) {
      const own = index.nameTokens[i]!;
      if (multi || own.length >= 2) {
        for (let k = 0; k < contentTokens.length; k++) {
          const t = contentTokens[k]!;
          if (own.includes(t)) {
            c = better(c, {
              tier: 'token',
              band: T.token,
              matched: norm,
              detail: `token "${t}" in name "${norm}"`,
            });
            break;
          }
        }
      }
    }

    if (c !== undefined) {
      found[i] = c;
      lexicalHits++;
    }
  }

  // Design: "fuzzy only when exact/prefix yield <3 hits OR the query is a
  // single word". A single word is always worth a typo check; a multi-word
  // query is compared whole, and only when the lexical tiers came up short.
  const fuzz =
    opts.fuzzy !== false && qLen >= T.fuzzyMinLen && (!multi || lexicalHits < T.fuzzyBelowHits);
  if (fuzz) {
    const maxD = qLen < T.fuzzyShortLen ? 1 : 2;
    for (let i = 0; i < rows.length; i++) {
      if (found[i] !== undefined) continue;
      const r = rows[i]!;
      if (kinds && !kinds.has(r.t)) continue;
      let bestD = maxD + 1;
      let bestS = '';
      let bestWhat = 'name';
      const norm = r.norm;
      const dn = norm.length - qLen;
      if (dn <= maxD && dn >= -maxD) {
        const d = damerauLevenshtein(q, norm, maxD);
        if (d < bestD) {
          bestD = d;
          bestS = norm;
        }
      }
      if (bestD > 1) {
        const strong = strongAliases[i]!;
        for (let j = 0; j < strong.length; j++) {
          const s = strong[j]!;
          const ds = s.length - qLen;
          if (ds > maxD || ds < -maxD) continue; // length band
          const d = damerauLevenshtein(q, s, maxD);
          if (d < bestD) {
            bestD = d;
            bestS = s;
            bestWhat = 'alias';
            if (d === 1) break;
          }
        }
      }
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
