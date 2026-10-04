/**
 * The graph layer: build → bytes → open round trip on a synthetic graph,
 * the set operations, and — when the real bundle is built — a few facts
 * measured against the JSON detail bundles so `graph.bin` cannot drift from
 * the data it was written from.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGraph } from '../src/graph/build.js';
import { intersectSorted, openGraph, unionSorted } from '../src/graph/adjacency.js';
import { DATA_DIR, hasData } from './data.js';

const rows = {
  people: [
    { slug: 'paul', verses: [44013009, 44013001, 44007058, 44013001] },
    { slug: 'barnabas', verses: [44013001, 44011025] },
  ],
  places: [
    { slug: 'antioch', verses: [44011026, 44013001] },
    { slug: 'tarsus', verses: [44011025] },
  ],
  events: [
    {
      slug: 'first_journey',
      verses: [44013001, 44013002],
      participants: ['paul', 'barnabas'],
      locations: ['antioch'],
    },
    { slug: 'nameless', verses: [] },
  ],
};

describe('graph build + open', () => {
  const { bytes, stats } = buildGraph(rows);
  const g = openGraph(bytes);

  it('is deterministic and self-verifying', () => {
    expect(buildGraph(rows).bytes).toEqual(bytes);
    expect(stats).toMatchObject({ nodes: 6, people: 2, places: 2, events: 2, verseLinks: 10 });
  });

  it('orders nodes people → places → events, each by slug', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => g.slugAt(i))).toEqual([
      'barnabas',
      'paul',
      'antioch',
      'tarsus',
      'first_journey',
      'nameless',
    ]);
    expect(g.kindAt(1)).toBe('person');
    expect(g.kindAt(2)).toBe('place');
    expect(g.kindAt(5)).toBe('event');
    expect(g.indexOf('nobody')).toBe(-1);
  });

  it('returns sorted, deduplicated verse lists', () => {
    expect(g.mentions('paul')).toEqual([44007058, 44013001, 44013009]);
    expect(g.mentions('nameless')).toEqual([]);
    expect(g.mentions('nobody')).toEqual([]);
  });

  it('intersects and unions', () => {
    expect(g.coMentions(['paul'], ['antioch'])).toEqual([44013001]);
    expect(g.coMentions(['paul', 'barnabas'], ['antioch', 'tarsus'])).toEqual([44011025, 44013001]);
    expect(g.mentionsAny(['paul', 'tarsus'])).toEqual([44007058, 44011025, 44013001, 44013009]);
    expect(intersectSorted([1, 2, 3], [2, 3, 4])).toEqual([2, 3]);
    expect(unionSorted([[3, 1], [2]])).toEqual([1, 2, 3]);
  });

  it('finds events by participants ∩ locations', () => {
    expect(g.eventsFor({ people: ['paul'], places: ['antioch'] })).toEqual(['first_journey']);
    expect(g.eventsFor({ people: ['paul'], places: ['tarsus'] })).toEqual([]);
    expect(g.eventsFor({ people: ['barnabas'] })).toEqual(['first_journey']);
    expect(g.eventsFor({ places: ['antioch'] })).toEqual(['first_journey']);
    expect(g.eventsFor({})).toEqual([]);
    expect(g.participantsOf(4)).toEqual([0, 1]);
    expect(g.locationsOf(4)).toEqual([2]);
    expect(g.participantsOf(0)).toEqual([]);
  });

  it('rejects other files', () => {
    expect(() => openGraph(new Uint8Array(10))).toThrow(/truncated/);
    const bad = bytes.slice();
    bad[0] = 0x58;
    expect(() => openGraph(bad)).toThrow(/not a TGGR/);
  });
});

describe.skipIf(!hasData() || !existsSync(join(DATA_DIR, 'graph.bin')))('real graph.bin', () => {
  const g = openGraph(new Uint8Array(readFileSync(join(DATA_DIR, 'graph.bin'))));
  const detail = (kind: string, slug: string): { verses: number[]; events?: number[] } =>
    JSON.parse(readFileSync(join(DATA_DIR, 'detail', kind, `${slug}.json`), 'utf8'));

  it('matches the detail bundles', () => {
    expect(g.mentions('paul_2479')).toEqual(detail('person', 'paul_2479').verses);
    expect(g.mentions('antioch_68')).toEqual(detail('place', 'antioch_68').verses);
    expect(g.coMentions(['paul_2479'], ['antioch_68'])).toEqual([44013001, 44015022, 44015035]);
    expect(g.eventsFor({ people: ['paul_2479'], places: ['antioch_68', 'antioch_69'] })).toContain(
      'mission_to_antioch_in_pisidia_340',
    );
    const t0 = performance.now();
    openGraph(new Uint8Array(readFileSync(join(DATA_DIR, 'graph.bin'))));
    console.info(`graph.bin open ${(performance.now() - t0).toFixed(2)} ms, ${g.nodeCount} nodes`);
  });
});
