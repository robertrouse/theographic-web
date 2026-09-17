/**
 * Entity matcher units: the distance, the normalizer, every tier and the
 * score parts — on a synthetic index so each number is checkable by hand.
 * The real-data behaviour is the golden set; timing is `entities.perf.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { damerauLevenshtein } from '../src/damerau.js';
import { loadEntityIndex, prefixRange, rowsWithPrefix } from '../src/entities/entityIndex.js';
import { ENTITY_TIERS, matchEntities, type EntityHit } from '../src/entities/match.js';
import { nameTokens, normalizeName } from '../src/entities/normalizeName.js';
import type { EntityIndexFile, EntityIndexRow } from '../src/entities/types.js';

describe('damerauLevenshtein', () => {
  const dl = (a: string, b: string, max = 3): number => damerauLevenshtein(a, b, max);

  it('is zero for equal strings and the length for an empty one', () => {
    expect(dl('', '')).toBe(0);
    expect(dl('abc', 'abc')).toBe(0);
    expect(dl('', 'abc')).toBe(3);
    expect(dl('abc', '')).toBe(3);
  });

  it('counts insert, delete, substitute and adjacent transposition as 1 each', () => {
    expect(dl('jerusalm', 'jerusalem')).toBe(1); // insert
    expect(dl('nebuchadnezar', 'nebuchadnezzar')).toBe(1); // insert
    expect(dl('simon', 'simeon')).toBe(1);
    expect(dl('mark', 'mary')).toBe(1); // substitute
    expect(dl('abcd', 'abdc')).toBe(1); // transpose
    expect(dl('jude', 'judas')).toBe(2); // substitute + insert
    expect(dl('zechariah', 'zacharias')).toBe(2);
  });

  it('is symmetric', () => {
    for (const [a, b] of [
      ['kitten', 'sitting'],
      ['ca', 'abc'],
      ['abc', 'ca'],
      ['antioch', 'arioch'],
    ]) {
      expect(dl(a!, b!)).toBe(dl(b!, a!));
    }
  });

  it('is the restricted (OSA) variant: "ca"→"abc" is 3, not 2', () => {
    expect(dl('ca', 'abc')).toBe(3);
  });

  it('returns max+1 as soon as the distance exceeds max, including on length alone', () => {
    expect(dl('abc', 'abcdef', 2)).toBe(3);
    expect(dl('abc', 'xyz', 1)).toBe(2);
    expect(dl('abc', 'xyz', 2)).toBe(3);
    expect(dl('kitten', 'sitting', 2)).toBe(3);
    expect(dl('kitten', 'sitting', 3)).toBe(3);
  });

  it('matches an unbanded reference on random strings', () => {
    const ref = (a: string, b: string): number => {
      const d: number[][] = [];
      for (let i = 0; i <= a.length; i++) d[i] = [i];
      for (let j = 0; j <= b.length; j++) d[0]![j] = j;
      for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
          if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
            v = Math.min(v, d[i - 2]![j - 2]! + 1);
          }
          d[i]![j] = v;
        }
      }
      return d[a.length]![b.length]!;
    };
    // A fixed LCG keeps the test deterministic (invariant 9 applies to tests too).
    let seed = 12345;
    const rnd = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const word = (): string => {
      const len = 1 + rnd(9);
      let s = '';
      for (let i = 0; i < len; i++) s += 'abcd'[rnd(4)];
      return s;
    };
    for (let k = 0; k < 2000; k++) {
      const a = word();
      const b = word();
      const max = rnd(3);
      const exact = ref(a, b);
      const got = dl(a, b, max);
      expect(got, `${a} ${b} max=${max}`).toBe(exact > max ? max + 1 : exact);
    }
  });
});

describe('normalizeName', () => {
  it('lower-cases, folds NFKC, drops possessives and emphasis, spaces punctuation', () => {
    expect(normalizeName("Jerusalem's")).toBe('jerusalem');
    expect(normalizeName('Jerusalem’s')).toBe('jerusalem');
    expect(normalizeName("Diviners' Oak")).toBe('diviners oak');
    expect(normalizeName('_Simon_ *Peter*')).toBe('simon peter');
    expect(normalizeName("_God's_")).toBe('god');
    expect(normalizeName('Beth-el')).toBe('beth el');
    expect(normalizeName('Antioch (Syria)')).toBe('antioch syria');
    expect(normalizeName('  1 Samuel ')).toBe('1 samuel');
    expect(normalizeName('ﬁg')).toBe('fig'); // NFKC ligature
    expect(normalizeName('')).toBe('');
    expect(nameTokens('')).toEqual([]);
    expect(nameTokens('tower of babel')).toEqual(['tower', 'of', 'babel']);
  });
});

// ------------------------------------------------------------ synthetic index

function row(
  partial: Partial<EntityIndexRow> & Pick<EntityIndexRow, 't' | 'id' | 'name'>,
): EntityIndexRow {
  return {
    norm: normalizeName(partial.name),
    aliases: [],
    vc: 0,
    sub: '',
    dupCount: 1,
    ...partial,
  };
}

const ROWS: EntityIndexRow[] = [
  row({
    t: 'p',
    id: 'simon_1',
    name: 'Simon',
    title: 'Simon Peter',
    aliases: [
      ['cephas', 1, 'alias'],
      ['peter', 1, 'surname'],
      ['simeon', 0.02, 'alias'],
    ],
    vc: 175,
    order: 40004018,
    sub: 'Simon Peter',
    dupCount: 2,
  }),
  row({
    t: 'p',
    id: 'simon_2',
    name: 'Simon',
    vc: 4,
    order: 40010004,
    sub: 'Simon Zelotes',
    dupCount: 2,
  }),
  row({
    t: 'p',
    id: 'paul_1',
    name: 'Paul',
    aliases: [['saul', 0.0718, 'alias+mined']],
    vc: 179,
    order: 44007058,
    sub: '',
  }),
  row({ t: 'p', id: 'saul_1', name: 'Saul', vc: 265, order: 9009002, sub: 'father: Kish' }),
  row({
    t: 'p',
    id: 'israel_1',
    name: 'Israel',
    title: 'Jacob (Israel)',
    aliases: [['jacob', 0.9947, 'title+mined']],
    vc: 1009,
    order: 1025026,
  }),
  row({ t: 'p', id: 'jacob_2', name: 'Jacob', vc: 2, order: 40001015 }),
  row({
    t: 'l',
    id: 'jerusalem_1',
    name: 'Jerusalem',
    aliases: [['zion', 0.6, 'alias']],
    vc: 754,
    order: 6010001,
    ft: 'City',
  }),
  row({ t: 'l', id: 'babel_1', name: 'Babel', vc: 2, order: 1010010, ft: 'City' }),
  row({ t: 'e', id: 'tower_of_babel_53', name: 'Tower of Babel', vc: 9, order: 1011001 }),
  row({ t: 'b', id: 'John', name: 'John', aliases: [['jn', 1, 'short']], vc: 879, order: 43 }),
  row({
    t: 'p',
    id: 'john_1',
    name: 'John',
    title: 'John the Baptist',
    aliases: [['baptist', 1, 'title']],
    vc: 89,
    order: 40003001,
  }),
  row({ t: 'g', id: 'apostles', name: 'Apostles', vc: 0 }),
  row({ t: 'p', id: 'mary_1', name: 'Mary', vc: 50, order: 40001016 }),
  row({ t: 'l', id: 'nowhere_1', name: 'Nowhere', vc: 1 }),
];

function file(rows: EntityIndexRow[]): EntityIndexFile {
  const names: [string, number, number][] = [];
  rows.forEach((r, i) => {
    names.push([r.norm, i, -1]);
    r.aliases.forEach(([a], j) => names.push([a, i, j]));
  });
  names.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1] || a[2] - b[2]));
  return { format: 1, maxVc: Math.max(...rows.map((r) => r.vc)), rows, names };
}

const index = loadEntityIndex(file(ROWS));
const T = ENTITY_TIERS;
const prom = (vc: number): number => (T.prom * Math.log(1 + vc)) / Math.log(1 + index.maxVc);
const ids = (hits: EntityHit[]): string[] => hits.map((h) => h.id);

describe('matchEntities tiers', () => {
  it('exact: band 1.00 + prominence, ordered by prominence then group, order, id', () => {
    const hits = matchEntities('Simon', index).filter((h) => h.tier === 'exact');
    expect(ids(hits)).toEqual(['simon_1', 'simon_2']);
    expect(hits[0]!.raw).toBeCloseTo(T.exact + prom(175), 6);
    expect(hits[0]!.score).toBe(1); // clamped for cross-group use
    expect(hits[0]!.why[0]).toBe('exact: name "simon"');
    expect(hits[0]!.sublabel).toBe('Simon Peter');
  });

  it('aliasExact: a strong alias (w ≥ 0.5) scores 0.95', () => {
    const [top] = matchEntities('Cephas', index);
    expect(top).toMatchObject({ id: 'simon_1', tier: 'aliasExact' });
    expect(top!.raw).toBeCloseTo(T.aliasExact + prom(175), 6); // Δlen 0 against the alias
    expect(top!.why[0]).toContain('alias "cephas" w=1.00');
  });

  it('aliasWeak: 0.55 + 0.30·w, and why names the weight', () => {
    const hits = matchEntities('Saul', index);
    expect(ids(hits)).toEqual(['saul_1', 'paul_1']);
    const paul = hits[1]!;
    expect(paul.tier).toBe('aliasWeak');
    expect(paul.raw).toBeCloseTo(T.aliasWeak + T.aliasWeakSpan * 0.0718 + prom(179), 6);
    expect(paul.why[0]).toContain('alias "saul" w=0.07');
  });

  it('multiToken: every query token found in name, title or strong-alias tokens', () => {
    const [top] = matchEntities('Simon Peter', index);
    expect(top).toMatchObject({ id: 'simon_1', tier: 'multiToken' });
    expect(top!.why[0]).toContain('multiToken');
    // Order-insensitive.
    expect(matchEntities('Peter Simon', index)[0]).toMatchObject({
      id: 'simon_1',
      tier: 'multiToken',
    });
    // Weak alias tokens do not count: "Simon Simeon" is not a multiToken hit.
    expect(matchEntities('Simon Simeon', index)[0]!.tier).not.toBe('multiToken');
    // Title tokens count even when they are not aliases ("Israel Jacob").
    expect(matchEntities('the Baptist John', index)[0]).toMatchObject({
      id: 'john_1',
      tier: 'multiToken',
    });
  });

  it('prefix: 0.80 + 0.10·len ratio on the name or a strong alias', () => {
    const [top] = matchEntities('Jerus', index);
    expect(top).toMatchObject({ id: 'jerusalem_1', tier: 'prefix' });
    expect(top!.raw).toBeCloseTo(
      T.prefix + T.prefixSpan * (5 / 9) + prom(754) - T.len * (4 / 5),
      6,
    );
    expect(matchEntities('Ceph', index)[0]).toMatchObject({ id: 'simon_1', tier: 'prefix' });
    // A longer prefix scores higher.
    expect(matchEntities('Jerusa', index)[0]!.raw).toBeGreaterThan(top!.raw);
  });

  it('token: a content token of the query equals a token of a multi-word name, or vice versa', () => {
    const hits = matchEntities('Babel', index);
    expect(hits.map((h) => [h.id, h.tier])).toEqual([
      ['babel_1', 'exact'],
      ['tower_of_babel_53', 'token'],
    ]);
    const multi = matchEntities('Paul Babel', index);
    expect(new Set(ids(multi))).toEqual(new Set(['paul_1', 'babel_1', 'tower_of_babel_53']));
    expect(multi.every((h) => h.tier === 'token')).toBe(true);
    // Stopwords never match: "of" alone finds nothing.
    expect(matchEntities('of', index)).toEqual([]);
    expect(matchEntities('Tower of', index).map((h) => h.id)).toEqual(['tower_of_babel_53']);
  });

  it('fuzzy: DL ≤ 1 under 6 chars, ≤ 2 from 6; whole single-word query; why names the edit count', () => {
    const hits = matchEntities('Mark', index);
    expect(hits.map((h) => [h.id, h.tier])).toEqual([['mary_1', 'fuzzy1']]);
    expect(hits[0]!.raw).toBeCloseTo(T.fuzzy1 + prom(50), 6);
    expect(hits[0]!.why[0]).toBe('fuzzy1: "mark" is 1 edit from name "mary"');
    expect(matchEntities('Jerusalm', index)[0]).toMatchObject({
      id: 'jerusalem_1',
      tier: 'fuzzy1',
    });
    expect(matchEntities('Jerusalxx', index)[0]).toMatchObject({
      id: 'jerusalem_1',
      tier: 'fuzzy2',
    });
    expect(matchEntities('Jerusxxx', index)).toEqual([]); // 3 edits
    expect(matchEntities('Sxmon', index).some((h) => h.tier === 'fuzzy2')).toBe(false); // 5 chars → DL ≤ 1 only
    expect(matchEntities('Sxmxn', index)).toEqual([]);
  });

  it('fuzzy runs for every single word, but for a multi-word query only when lexical hits < 3', () => {
    // Single word with plenty of exact hits still fuzzes (the design's "or single-word").
    expect(matchEntities('Simon', index).some((h) => h.tier === 'fuzzy1')).toBe(false); // nothing within 1
    expect(matchEntities('Jacob', index).map((h) => h.tier)).toEqual(['aliasExact', 'exact']);
    // Multi-word: "Tower of Babl" has 1 lexical hit (token "tower") → whole-query fuzzy adds nothing
    // closer than 2 edits from a multi-word name… but "Towr of Babel" is 1 edit away.
    const hits = matchEntities('Towr of Babel', index);
    expect(hits.map((h) => [h.id, h.tier])).toEqual([
      ['tower_of_babel_53', 'token'],
      ['babel_1', 'token'],
    ]);
    expect(matchEntities('Towr of Babl', index).map((h) => [h.id, h.tier])).toEqual([
      ['tower_of_babel_53', 'fuzzy2'],
    ]);
    expect(matchEntities('Mark', index, { fuzzy: false })).toEqual([]);
  });

  it('never fuzzes a query shorter than fuzzyMinLen', () => {
    expect(matchEntities('Mx', index)).toEqual([]); // 1 edit from "ma…" but too short
    expect(matchEntities('Ma', index).map((h) => h.tier)).toEqual(['prefix']);
  });

  it('alias-driven ranking: Jacob → Israel (w 0.99, vc 1009) beats the minor Jacob (exact, vc 2)', () => {
    const hits = matchEntities('Jacob', index);
    expect(ids(hits)).toEqual(['israel_1', 'jacob_2']);
    expect(hits[0]!.raw).toBeCloseTo(T.aliasExact + prom(1009), 6);
    expect(hits[1]!.raw).toBeCloseTo(T.exact + prom(2), 6);
  });

  it('length penalty: −0.01·min(Δlen,5)/5 against the matched string', () => {
    const [top] = matchEntities('Jn', index);
    expect(top).toMatchObject({ id: 'John', tier: 'aliasExact' });
    expect(top!.raw).toBeCloseTo(T.aliasExact + prom(879), 6); // alias "jn" matched: Δ 0
    const [john] = matchEntities('J', index).filter((h) => h.id === 'John');
    expect(john!.tier).toBe('prefix');
    // The best prefix is the short alias "jn" (ratio 1/2, Δlen 1), not "john" (1/4, Δlen 3).
    expect(john!.raw).toBeCloseTo(
      T.prefix + T.prefixSpan * (1 / 2) + prom(879) - T.len * (1 / 5),
      6,
    );
    expect(john!.why[0]).toContain('starts alias "jn"');
  });

  it('kinds restricts the row types; strictTiers orders by tier before score', () => {
    expect(ids(matchEntities('John', index, { kinds: ['p'] }))).toEqual(['john_1']);
    expect(ids(matchEntities('John', index, { kinds: ['b'] }))).toEqual(['John']);
    const loose = matchEntities('Jacob', index);
    const strict = matchEntities('Jacob', index, { strictTiers: true });
    expect(ids(loose)).toEqual(['israel_1', 'jacob_2']);
    expect(ids(strict)).toEqual(['jacob_2', 'israel_1']);
    expect(matchEntities('Simon', index, { limit: 1 })).toHaveLength(1);
  });

  it('is deterministic and pure: same input, same output; empty query, no hits', () => {
    const a = matchEntities('Simon Peter', index);
    const b = matchEntities('Simon Peter', index);
    expect(a).toEqual(b);
    expect(matchEntities('', index)).toEqual([]);
    expect(matchEntities('   ', index)).toEqual([]);
    expect(matchEntities('!!!', index)).toEqual([]);
  });

  it('every hit explains itself: tier, band, prominence, length, raw', () => {
    for (const h of matchEntities('Simon Peter', index)) {
      expect(h.why).toHaveLength(5);
      expect(h.why[0]).toMatch(new RegExp(`^${h.tier}: `));
      expect(h.why[1]).toMatch(/^band \d\.\d{3}$/);
      expect(h.why[2]).toMatch(/^prom \+\d\.\d{3} \(vc \d+\)$/);
      expect(h.why[3]).toMatch(/^len −\d\.\d{3} \(Δ\d+\)$/);
      expect(h.why[4]).toBe(`raw ${h.raw.toFixed(3)}`);
    }
  });
});

describe('entityIndex', () => {
  it('rejects an unknown format', () => {
    expect(() => loadEntityIndex({ ...file(ROWS), format: 2 as 1 })).toThrow(/format/);
  });

  it('prefixRange finds the half-open range of names starting with a prefix', () => {
    const [lo, hi] = prefixRange(index, 'ja');
    expect(index.names.slice(lo, hi).map((n) => n[0])).toEqual(['jacob', 'jacob']);
    expect(rowsWithPrefix(index, 'ja').map((i) => index.rows[i]!.id)).toEqual([
      'israel_1',
      'jacob_2',
    ]);
    expect(prefixRange(index, 'zzz')).toEqual([index.names.length, index.names.length]);
    expect(prefixRange(index, '')).toEqual([0, index.names.length]);
    expect(rowsWithPrefix(index, 's', 1)).toHaveLength(1);
  });

  it('builds token vocabularies from name, title and strong aliases', () => {
    const i = index.byId.get('simon_1')!;
    expect(index.nameTokens[i]).toEqual(['simon']);
    expect(index.strongTokens[i]).toEqual(['simon', 'peter', 'cephas']);
  });
});
