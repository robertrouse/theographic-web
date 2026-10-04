/**
 * The entity index build: alias mining and weighting, sublabels, dupCount,
 * the sorted names table. Fixture-driven; the last block re-derives the
 * documented "Saul"→Paul number from the real sources when the fetch cache
 * holds them (always in CI, after `npm run data`).
 */
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadEntityIndex, matchEntities, prefixRange, rowsWithPrefix } from '@theographic/core';
import { cacheDir, readSource, SOURCE_FILES } from '../src/fetch.js';
import {
  buildEntityIndexDetailed,
  COLLISION_DEFAULT,
  documentFrequency,
  mineLinkAliases,
} from '../src/index-entities.js';
import { readLock } from '../src/lock.js';
import { normalize } from '../src/normalize.js';
import type { Sources } from '../src/source.js';
import { makeSources } from './fixture.js';

function withRich(edit: (src: Sources) => void): Sources {
  const src = makeSources();
  edit(src);
  return src;
}

describe('mineLinkAliases', () => {
  it('counts every person/place link by normalized label and slug', () => {
    const n = normalize(makeSources());
    const m = mineLinkAliases(n);
    expect(m.links).toBe(6);
    expect(m.counts.get('god')?.get('god_1')).toBe(2);
    expect(m.counts.get('eden')?.get('eden_1')).toBe(1);
    expect(m.unresolved.size).toBe(0);
  });

  it('normalizes labels: possessive, emphasis, case, curly apostrophe', () => {
    const n = normalize(
      withRich((s) => {
        s.verses[0]!.fields.richText = "[_God’s_](/person/god_1) [Adam's](/person/adam_2) x";
      }),
    );
    const m = mineLinkAliases(n);
    expect(m.counts.get('god')?.get('god_1')).toBe(2);
    expect(m.counts.get('adam')?.get('adam_2')).toBe(2);
  });

  it('records links to slugs that are not a person or place instead of throwing', () => {
    const n = normalize(
      withRich((s) => {
        s.verses[1]!.fields.richText = '[Lot](/person/daughter_of_lot_-_younger_984) void.';
      }),
    );
    expect([...mineLinkAliases(n).unresolved]).toEqual([['daughter_of_lot_-_younger_984', 1]]);
  });
});

describe('documentFrequency', () => {
  it('counts verses, not occurrences', () => {
    const df = documentFrequency(normalize(makeSources()));
    expect(df.get('the')).toBe(4); // "the" appears three times in Gen.1.1 but once per verse
    expect(df.get('antioch')).toBe(1);
  });
});

describe('buildEntityIndex', () => {
  const { file, stats } = buildEntityIndexDetailed(normalize(makeSources()));
  const row = (id: string) => file.rows.find((r) => r.id === id)!;

  it('emits one row per person, place, group, event and book', () => {
    expect(file.rows.map((r) => r.t)).toEqual(['p', 'p', 'p', 'l', 'l', 'g', 'e', 'b', 'b']);
    expect(stats.rows).toBe(9);
    expect(file.maxVc).toBe(3);
  });

  it('gives a curated alias weight 1 when nothing collides', () => {
    expect(row('eden_1').aliases).toEqual([
      ['garden of eden', 1, 'alias'],
      ['paradise', 1, 'alias'],
    ]);
  });

  it('drops a curated alias that duplicates the primary name after normalization', () => {
    // "LORD" and "Lord" both normalize to "lord" — one alias, not two.
    expect(row('god_1').aliases).toEqual([['lord', 1, 'alias']]);
  });

  it('keeps a mined label only when linked twice or also curated', () => {
    const n = normalize(
      withRich((s) => {
        s.verses[0]!.fields.richText = '[Creator](/person/god_1) made [Jehovah](/person/god_1).';
        s.verses[3]!.fields.richText = 'the [Creator](/person/god_1) and [LORD](/person/god_1).';
      }),
    );
    const aliases = buildEntityIndexDetailed(n).file.rows.find((r) => r.id === 'god_1')!.aliases;
    expect(aliases).toEqual([
      ['creator', 1, 'mined'], // ×2 → kept, share 2/2
      ['lord', 1, 'alias+mined'], // curated, linked once
    ]);
    expect(aliases.find((a) => a[0] === 'jehovah')).toBeUndefined(); // ×1, not curated
  });

  it('gives a colliding curated alias the text link share, or the default when never linked', () => {
    const n = normalize(
      withRich((s) => {
        // "Adam" is also curated as an alias of Eve; the text links "Adam" 1× to Adam, 1× to Eve.
        s.people[2]!.fields.alsoCalled = 'Adam,Helper';
        s.verses[2]!.fields.richText =
          '[Adam](/person/adam_2) and [Adam](/person/eve_3) were in [Eden](/place/eden_1).';
        // "Helper" is a common word (df > 200 is impossible here, so force a name collision instead).
        s.people[1]!.fields.alsoCalled = 'Helper';
      }),
    );
    const { file } = buildEntityIndexDetailed(n);
    const eve = file.rows.find((r) => r.id === 'eve_3')!;
    expect(eve.aliases.find((a) => a[0] === 'adam')).toEqual([
      'adam',
      0.5,
      'alias+title+mined', // 1 of 2 "Adam" links mean Eve; also a token of "Eve (wife of Adam)"
    ]);
    // "helper" is curated for both Adam and Eve, collides with nobody's primary
    // name and is never linked: weight 1 for both.
    expect(eve.aliases.find((a) => a[0] === 'helper')?.[1]).toBe(1);
  });

  it('drops a colliding curated alias with zero link share and applies the default when unlinked', () => {
    const n = normalize(
      withRich((s) => {
        // Antioch gets a curated alias "Eden": Eden is a primary name, and the
        // text links "Eden" only to eden_1 → share 0 → dropped.
        s.places[1]!.fields.aliases = 'Eden, Nowhere';
        // Eve gets a curated alias "Creation": the event's primary name, and
        // the text never links that label → the default weight.
        s.people[2]!.fields.alsoCalled = 'Creation';
      }),
    );
    const { file, stats } = buildEntityIndexDetailed(n);
    const antioch = file.rows.find((r) => r.id === 'antioch_2')!;
    expect(antioch.aliases.map((a) => a[0])).toEqual(['nowhere', 'syria']);
    const eve = file.rows.find((r) => r.id === 'eve_3')!;
    expect(eve.aliases.find((a) => a[0] === 'creation')).toEqual([
      'creation',
      COLLISION_DEFAULT,
      'alias',
    ]);
    // "Eden" on Antioch, plus the "adam" title token on Eve (linked only to Adam).
    expect(stats.droppedZeroShare).toBe(2);
  });

  it('adds title tokens as aliases, minus the name itself and function words', () => {
    // Eve (wife of Adam): "wife" kept at 1; "of" is a stopword; "adam" is
    // Adam's primary name and the text links "Adam" only to Adam → dropped.
    expect(row('eve_3').aliases).toEqual([['wife', 1, 'title']]);
    // Antioch (Syria): "syria" collides with nothing here → 1.
    expect(row('antioch_2').aliases).toEqual([['syria', 1, 'title']]);
  });

  it('adds the un-hyphenated twin of a hyphenated name', () => {
    const n = normalize(
      withRich((s) => {
        s.places[0]!.fields.kjvName = 'Beth-el';
        s.places[0]!.fields.displayTitle = 'Beth-el';
        s.places[0]!.fields.esvName = 'Bethel';
      }),
    );
    const eden = buildEntityIndexDetailed(n).file.rows.find((r) => r.id === 'eden_1')!;
    expect(eden.norm).toBe('beth el');
    expect(eden.aliases.find((a) => a[0] === 'bethel')).toEqual(['bethel', 1, 'esv+hyphen']);
  });

  it('carries a book short name as an alias', () => {
    expect(row('Gen').aliases).toEqual([['ge', 1, 'short']]);
  });

  describe('sublabels', () => {
    it('person: title parenthetical → whole title → surname → father → verses', () => {
      expect(row('eve_3').sub).toBe('wife of Adam');
      expect(row('adam_2').sub).toBe('1 verse · first in Genesis 2:1');
      expect(row('god_1').sub).toBe('3 verses · first in Genesis 1:1');
      const n = normalize(
        withRich((s) => {
          s.people[1]!.fields.displayTitle = 'Adam the First';
          s.people[2]!.fields.displayTitle = 'Eve';
          s.people[2]!.fields.surname = 'Ish';
          s.people[0]!.fields.father = [s.people[1]!.id];
        }),
      );
      const rows = buildEntityIndexDetailed(n).file.rows;
      expect(rows.find((r) => r.id === 'adam_2')!.sub).toBe('Adam the First');
      expect(rows.find((r) => r.id === 'eve_3')!.sub).toBe('Eve Ish');
      expect(rows.find((r) => r.id === 'god_1')!.sub).toBe('father: Adam');
    });

    it('place: parenthetical · feature type · verse count', () => {
      expect(row('antioch_2').sub).toBe('Syria · City · 1 verse');
      expect(row('eden_1').sub).toBe('Region · 1 verse');
    });

    it('group, event, book', () => {
      expect(row('apostles').sub).toBe('1 member');
      expect(row('creation_1').sub).toBe('4004 BC · 2 verses');
      expect(row('Gen').sub).toBe('Pentateuch · 2 chapters');
      expect(row('John').sub).toBe('Gospels · 1 chapter');
    });

    it('never prints a verse count of zero as if it were data', () => {
      const n = normalize(
        withRich((s) => {
          s.people[2]!.fields.verses = [];
          s.people[2]!.fields.displayTitle = 'Eve';
          s.verses[2]!.fields.people = [s.people[1]!.id];
        }),
      );
      expect(buildEntityIndexDetailed(n).file.rows.find((r) => r.id === 'eve_3')!.sub).toBe(
        'no verses',
      );
    });
  });

  it('counts rows of any type sharing a normalized name', () => {
    // The book of John and no person John here; make God a book to see 2.
    const n = normalize(
      withRich((s) => {
        s.people[0]!.fields.name = 'John';
        s.people[0]!.fields.displayTitle = 'John';
      }),
    );
    const rows = buildEntityIndexDetailed(n).file.rows;
    expect(rows.find((r) => r.id === 'god_1')!.dupCount).toBe(2);
    expect(rows.find((r) => r.id === 'John')!.dupCount).toBe(2);
    expect(rows.find((r) => r.id === 'adam_2')!.dupCount).toBe(1);
  });

  it('emits names sorted by string then row for prefix lookup', () => {
    const strings = file.names.map((n) => n[0]);
    expect([...strings].sort()).toEqual(strings);
    expect(file.names.length).toBe(
      file.rows.length + file.rows.reduce((s, r) => s + r.aliases.length, 0),
    );
    const index = loadEntityIndex(file);
    const [lo, hi] = prefixRange(index, 'e');
    expect(file.names.slice(lo, hi).map((n) => n[0])).toEqual(['eden', 'eve']);
    expect(rowsWithPrefix(index, 'ge').map((i) => file.rows[i]!.id)).toEqual(['Gen']);
  });

  it('round-trips into the matcher', () => {
    const index = loadEntityIndex(file);
    expect(matchEntities('Antioch Syria', index)[0]).toMatchObject({
      id: 'antioch_2',
      tier: 'multiToken',
    });
    expect(matchEntities('Lord', index)[0]).toMatchObject({ id: 'god_1', tier: 'aliasExact' });
  });
});

describe('real sources', async () => {
  const lock = await readLock();
  const dir = cacheDir(lock);
  const present = SOURCE_FILES.every((f) => existsSync(`${dir}/${f}.json`));
  if (!present && process.env['THEOGRAPHIC_REQUIRE_DATA']) {
    throw new Error(`THEOGRAPHIC_REQUIRE_DATA is set but ${dir} lacks the source files`);
  }

  it.skipIf(!present)(
    '"Saul" reaches paul_2479 through link mining with the documented count',
    async () => {
      const src = Object.fromEntries(
        await Promise.all(SOURCE_FILES.map(async (name) => [name, await readSource(dir, name)])),
      ) as unknown as Sources;
      const n = normalize(src);
      const mined = mineLinkAliases(n);
      const saul = mined.counts.get('saul')!;
      expect(saul.get('paul_2479')).toBe(25);
      expect(saul.get('saul_2478')).toBe(321);
      expect(saul.get('shaul_2477')).toBe(2);
      const sigma = [...saul.values()].reduce((a, b) => a + b, 0);
      expect(sigma).toBe(348);

      const { file, stats } = buildEntityIndexDetailed(n);
      const paul = file.rows.find((r) => r.id === 'paul_2479')!;
      expect(paul.aliases.find((a) => a[0] === 'saul')).toEqual([
        'saul',
        Math.round((25 / 348) * 10000) / 10000,
        'alias+mined',
      ]);
      // The three link targets that are not a person or place in this vintage.
      expect([...mined.unresolved.keys()].sort()).toEqual([
        'daughter_of_lot_-_older_985',
        'daughter_of_lot_-_younger_984',
        'timna_2859',
      ]);
      expect(stats.links).toBe(40690);
    },
  );
});
