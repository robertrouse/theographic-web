import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { listOut, writeBundles } from '../src/bundles.js';
import { gate } from '../src/gate.js';
import { normalize, NormalizeError, slugify } from '../src/normalize.js';
import { makeSources } from './fixture.js';

describe('normalize', () => {
  const n = normalize(makeSources(), { dropAliases: { eden_1: ['Paradise'] } });

  it('rekeys references to slugs, OSIS and ints', () => {
    const gen21 = n.versesByBook.get('Gen')![2]!;
    expect(gen21).toMatchObject({
      id: 1002001,
      c: 2,
      v: 1,
      people: ['adam_2', 'eve_3'],
      places: ['eden_1'],
    });
    expect(n.versesByBook.get('Gen')![0]!.events).toEqual([1]);
    expect(n.personDetail.get('adam_2')).toMatchObject({
      partners: ['eve_3'],
      birthPlace: 'eden_1',
      birthYear: -4003,
      groups: ['apostles'],
      events: [1],
      wrote: ['Gen'],
    });
  });

  it('splits the comma-joined writers bug and alias strings', () => {
    expect(n.books[0]!.writers).toEqual(['adam_2', 'eve_3']);
    expect(n.people.find((p) => p.slug === 'god_1')!.aliases).toEqual(['LORD', 'Lord']);
    expect(n.places.find((p) => p.slug === 'eden_1')!.aliases).toEqual(['Garden of Eden']); // Paradise dropped by override
  });

  it('never emits half a coordinate or a title equal to the name', () => {
    const antioch = n.places.find((p) => p.slug === 'antioch_2')!;
    expect(antioch.lat).toBeUndefined();
    expect(antioch.lon).toBeUndefined();
    expect(antioch.precision).toBeUndefined();
    expect(antioch.title).toBe('Antioch (Syria)');
    expect(n.places.find((p) => p.slug === 'eden_1')!.title).toBeUndefined();
    expect(n.people.find((p) => p.slug === 'eve_3')!.title).toBe('Eve (wife of Adam)');
  });

  it('splits a disambiguation baked into the KJV name', () => {
    const src = makeSources();
    src.places[1]!.fields.kjvName = 'Antioch (Syria)';
    src.places[1]!.fields.displayTitle = 'Antioch (Syria)';
    src.places[1]!.fields.esvName = 'Antioch';
    const antioch = normalize(src).places.find((p) => p.slug === 'antioch_2')!;
    expect(antioch.name).toBe('Antioch');
    expect(antioch.title).toBe('Antioch (Syria)');
    expect(antioch.esvName).toBeUndefined(); // same as the bare name
  });

  it('recomputes verseCount and firstVerse from links', () => {
    const god = n.people.find((p) => p.slug === 'god_1')!;
    expect(god.verseCount).toBe(3);
    expect(god.firstVerse).toBe(1001001);
    expect(n.events[0]).toMatchObject({
      slug: 'creation_1',
      verseRange: [1001001, 1001002],
      verseCount: 2,
    });
  });

  it('keeps unmatched Easton topics that have text', () => {
    expect(n.eastonTopics).toEqual([{ label: 'Sabbath', item: 0, text: 'Rest.' }]);
  });

  it('omits undefined fields entirely', () => {
    const eve = n.people.find((p) => p.slug === 'eve_3')!;
    expect(Object.keys(eve)).not.toContain('surname');
    expect(JSON.stringify(eve)).not.toContain('undefined');
  });

  it('throws on an unknown record id', () => {
    const src = makeSources();
    src.verses[0]!.fields.people = ['recDOESNOTEXIST'];
    expect(() => normalize(src)).toThrow(NormalizeError);
  });

  it('slugifies like the source does', () => {
    expect(slugify('Apostles (The Eleven)')).toBe('apostles_the_eleven');
    expect(slugify("Paul's shipwreck")).toBe('paul_s_shipwreck');
  });
});

describe('gate', () => {
  it('passes the fixture', () => {
    const src = makeSources();
    const g = gate(normalize(src), src);
    expect(g.errors).toEqual([]);
    expect(g.ok).toBe(true);
  });

  const corruptions: [string, (n: ReturnType<typeof normalize>) => void, RegExp][] = [
    ['a book with no verses', (n) => n.versesByBook.set('John', []), /John: zero verses/],
    [
      'an entity referencing a missing verse',
      (n) => n.personDetail.get('god_1')!.verses.push(43009999),
      /god_1\.verses: dangling reference 43009999/,
    ],
    [
      'a verse with empty text',
      (n) => (n.versesByBook.get('Gen')![0]!.text = ''),
      /verse 1001001: empty text/,
    ],
    [
      'a place with a non-numeric latitude',
      (n) => (n.places[1]!.lat = Number.NaN),
      /latitude NaN out of range/,
    ],
    [
      'a dropped verse row',
      (n) => n.versesByBook.get('John')!.pop(),
      /verses: bundle has 5, source has 6/,
    ],
    ['a coordinate encoded as 0,0', (n) => ((n.places[1]!.lat = 0), (n.places[1]!.lon = 0)), /0,0/],
    [
      'a dangling father',
      (n) => (n.people[0]!.father = 'nobody_9'),
      /father: dangling reference nobody_9/,
    ],
    [
      'verseCount drifting from the verse list',
      (n) => (n.people[0]!.verseCount = 99),
      /verseCount 99/,
    ],
  ];
  for (const [name, corrupt, msg] of corruptions) {
    it(`rejects ${name}`, () => {
      const src = makeSources();
      const n = normalize(src);
      corrupt(n);
      const g = gate(n, src);
      expect(g.ok).toBe(false);
      expect(g.errors.join('\n')).toMatch(msg);
    });
  }
});

describe('writeBundles', () => {
  let dir: string;
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('writes every file, a manifest with hashes, and is deterministic', async () => {
    dir = await mkdtemp(join(tmpdir(), 'theographic-'));
    const src = makeSources();
    const source = { repo: 'x/y', sha: 'abc' };
    const a = await writeBundles(normalize(src), source, dir);
    const b = await writeBundles(normalize(src), source, dir);
    expect(a.manifest.files).toEqual(b.manifest.files);
    expect(Object.keys(a.manifest.files).length).toBe(a.files.length);
    expect(await listOut(dir)).toEqual([
      'books.json',
      'detail/person/adam_2.json',
      'detail/person/eve_3.json',
      'detail/person/god_1.json',
      'detail/place/antioch_2.json',
      'detail/place/eden_1.json',
      'entities.index.json',
      'entities.json',
      'events.json',
      'manifest.json',
      'verses.idx',
      'verses.txt',
      'verses/Gen.json',
      'verses/John.json',
    ]);
    const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
    expect(manifest.counts).toEqual({
      books: 2,
      chapters: 3,
      verses: 6,
      people: 3,
      places: 2,
      events: 1,
      groups: 1,
    });
    expect(manifest.avgVerseTokens).toBeGreaterThan(0);
    expect(a.files.find((f) => f.path === 'verses.idx')!.bytes).toBeGreaterThan(64);
  });
});
