import { describe, expect, it } from 'vitest';
import { archaicForms } from '../../src/text/expand.js';
import { highlight } from '../../src/text/snippet.js';
import {
  ACROSTIC_HEADERS,
  NO_STEM,
  isPsalm119,
  stem,
  terms,
  tokenize,
} from '../../src/text/tokenizer.js';
import { loadTextIndex, SKIP_REASON } from '../data.js';

const PS119_105 = 'NUN. Thy word is a lamp unto my feet, and a light unto my path.';

describe('tokenize', () => {
  it('lower-cases, splits on punctuation and keeps offsets into the source', () => {
    const toks = tokenize('Jesus wept.');
    expect(toks).toEqual([
      { term: 'jesus', start: 0, end: 5 },
      { term: 'wept', start: 6, end: 10 },
    ]);
  });

  it('strips possessives, folding the curly apostrophe first', () => {
    expect(terms('Abraham’s concubine')).toEqual(['abraham', 'concubine']);
    expect(terms("the priests' office; the LORD’S")).toEqual([
      'the',
      'priests',
      'office',
      'the',
      'lord',
    ]);
    const [abraham] = tokenize('Abraham’s concubine');
    expect(abraham).toEqual({ term: 'abraham', start: 0, end: 7 });
  });

  it('keeps internal hyphens and drops edge punctuation', () => {
    expect(terms('to God-ward: and Sin-- and joint-heirs')).toEqual([
      'to',
      'god-ward',
      'and',
      'sin',
      'and',
      'joint-heirs',
    ]);
  });

  it('keeps digits', () => {
    expect(terms('Psalm 119:105')).toEqual(['psalm', '119', '105']);
  });

  it('drops the Psalm 119 acrostic header only when asked and only when it is one', () => {
    expect(terms(PS119_105, { acrostic: true })[0]).toBe('thy');
    expect(terms(PS119_105)[0]).toBe('nun');
    // "He" the pronoun is not the letter HE.
    expect(terms('He. said unto them', { acrostic: true })[0]).toBe('he');
    expect(terms('HE. Teach me, O LORD', { acrostic: true })[0]).toBe('teach');
    // Not followed by a period → not a header.
    expect(terms('NUN thy word', { acrostic: true })[0]).toBe('nun');
    expect(ACROSTIC_HEADERS.size).toBe(22);
    expect(isPsalm119(19119105)).toBe(true);
    expect(isPsalm119(19118029)).toBe(false);
    expect(isPsalm119(19120001)).toBe(false);
  });

  it('a snippet of Ps 119:105 never highlights "NUN."', () => {
    const toks = tokenize(PS119_105, { acrostic: true });
    const snip = highlight(
      PS119_105,
      toks,
      new Map([
        ['nun', 1],
        ['lamp', 1],
      ]),
    );
    expect(snip.text.startsWith('NUN.')).toBe(true);
    expect(snip.highlights).toEqual([[19, 23]]);
    expect(snip.text.slice(19, 23)).toBe('lamp');
  });

  it('returns nothing for empty or punctuation-only input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('... ; --')).toEqual([]);
  });
});

describe('stem', () => {
  it('groups inflections of a verb', () => {
    for (const w of ['love', 'loved', 'loveth', 'lovest', 'loves', 'loving', 'lovely']) {
      expect(stem(w), w).toBe('love');
    }
    for (const w of ['shew', 'shewed', 'sheweth', 'shewest', 'shewing'])
      expect(stem(w), w).toBe('shew');
    for (const w of ['bless', 'blessed', 'blesseth', 'blessing']) expect(stem(w), w).toBe('bless');
    expect(stem('cities')).toBe('city');
    expect(stem('carried')).toBe('carry');
    expect(stem('coming')).toBe('come');
    expect(stem('eating')).toBe('eat');
    expect(stem('saying')).toBe('say');
  });

  it('keeps three-letter words apart from four-letter words ending in e', () => {
    expect(stem('thee')).toBe('thee');
    expect(stem('the')).toBe('the');
    expect(stem('made')).toBe('made');
    expect(stem('mad')).toBe('mad');
    expect(stem('gates')).toBe('gate');
    expect(stem('gat')).toBe('gat');
    expect(stem('forest')).toBe('fore');
    expect(stem('for')).toBe('for');
    expect(stem('bars')).toBe('bar');
    expect(stem('bare')).toBe('bare');
  });

  it('never strips below three letters', () => {
    expect(stem('was')).toBe('was');
    expect(stem('goes')).toBe('goe');
    expect(stem('is')).toBe('is');
    expect(stem('less')).toBe('less');
  });

  it('leaves the auxiliaries alone', () => {
    for (const w of NO_STEM) expect(stem(w)).toBe(w);
  });
});

describe('archaic map', () => {
  it('is symmetric and carries the you-family weight', () => {
    expect(archaicForms('show')).toEqual([['shew', 1]]);
    expect(archaicForms('shew')).toEqual([['show', 1]]);
    expect(archaicForms('you')).toEqual([
      ['ye', 0.5],
      ['thee', 0.5],
      ['thou', 0.5],
    ]);
    expect(archaicForms('nothing-here')).toEqual([]);
  });

  const index = loadTextIndex();
  it.skipIf(!index)(`every archaic side is a KJV dictionary term (${SKIP_REASON})`, async () => {
    const { default: json } = await import('../../src/text/archaic.json', {
      with: { type: 'json' },
    });
    const missing = (json.pairs as string[][]).filter(([, archaic]) => index!.termId(archaic!) < 0);
    expect(missing).toEqual([]);
    expect(json.pairs.length).toBeGreaterThanOrEqual(120);
  });
});
