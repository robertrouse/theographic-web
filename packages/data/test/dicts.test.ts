/**
 * Reference-work background (CP-08): SWORD readers, TIPNR parsing, verse
 * references from markup, and the matching rules that keep one person's
 * dictionary entry away from another person of the same name.
 */
import { deflateSync } from 'node:zlib';
import type { BookAliasTable } from '@theographic/core';
import { makeVerseId } from '@theographic/core';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { Background } from '../src/dicts/match.js';
import {
  buildNameIndex,
  matchHeadwords,
  matchHitchcock,
  matchTipnr,
  parseHeadword,
  splitSenses,
} from '../src/dicts/match.js';
import { refsInMarkup, refsInTipnr } from '../src/dicts/refs.js';
import { readRawLD, readSwordZip, readZLD, swordToText } from '../src/dicts/sword.js';
import { parseTipnr } from '../src/dicts/tipnr.js';
import { buildGroundContext, ground } from '../src/definitions/ground.js';
import { buildUserMessage } from '../src/definitions/prompt.js';
import { normalize } from '../src/normalize.js';
import { makeSources } from './fixture.js';

const n = normalize(makeSources());
// The fixture has two books; the shared alias table insists on all 66.
const table: BookAliasTable = {
  byAlias: new Map([
    ['gen', 'Gen'],
    ['ge', 'Gen'],
    ['john', 'John'],
    ['jhn', 'John'],
  ]),
  entries: [],
  bare: new Set(),
  books: new Map(n.books.map((b) => [b.osis, b])),
  maxWords: 1,
  ambiguous: new Map(),
};
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

function u32s(...xs: number[]): Uint8Array {
  const b = new Uint8Array(xs.length * 4);
  const dv = new DataView(b.buffer);
  xs.forEach((x, i) => dv.setUint32(i * 4, x, true));
  return b;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function rawld(entries: [string, Uint8Array][]): { idx: Uint8Array; dat: Uint8Array } {
  const recs = entries.map(([k, v]) => concat(enc(`${k}\n`), v));
  const idx = new Uint8Array(entries.length * 6);
  const dv = new DataView(idx.buffer);
  let off = 0;
  recs.forEach((r, i) => {
    dv.setUint32(i * 6, off, true);
    dv.setUint16(i * 6 + 4, r.length, true);
    off += r.length;
  });
  return { idx, dat: concat(...recs) };
}

describe('SWORD readers', () => {
  it('reads RawLD keys and entries', () => {
    const { idx, dat } = rawld([
      ['ABIEL', enc('God my father')],
      ['ATAD', enc('a thorn')],
    ]);
    expect([...readRawLD(idx, dat)]).toEqual([
      ['ABIEL', 'God my father'],
      ['ATAD', 'a thorn'],
    ]);
  });

  it('reads zLD through the compressed block index', () => {
    const e1 = enc('first');
    const e2 = enc('second');
    const head = 4 + 2 * 8;
    const block = concat(u32s(2, head, e1.length, head + e1.length, e2.length), e1, e2);
    const zdt = new Uint8Array(deflateSync(block));
    const zdx = u32s(0, zdt.length);
    const r1 = concat(enc('A\n'), u32s(0, 0));
    const r2 = concat(enc('B\n'), u32s(0, 1));
    const dat = concat(r1, r2);
    const idx = u32s(0, r1.length, r1.length, r2.length);
    expect([...readZLD(idx, dat, zdx, zdt)]).toEqual([
      ['A', 'first'],
      ['B', 'second'],
    ]);
  });

  it('decodes Latin-1 modules as windows-1252 (curly quotes survive)', () => {
    const { idx, dat } = rawld([['SAUL', new Uint8Array([0x53, 0x61, 0x75, 0x6c, 0x92, 0x73])]]);
    const zip = zipSync({ 'm/x.idx': idx, 'm/x.dat': dat });
    expect(readSwordZip(zip, 'm/x', 'rawld', 'windows-1252').get('SAUL')).toBe('Saul’s');
  });

  it('turns ThML/TEI markup into plain text', () => {
    expect(
      swordToText('(<i>thorn</i>) &amp; <scripRef passage="ge 50:10">Genesis 50:10</scripRef>'),
    ).toBe('(thorn) & Genesis 50:10');
  });
});

describe('verse references', () => {
  const gen = (c: number, v: number): number => makeVerseId(1, c, v);
  const john = (c: number, v: number): number => makeVerseId(43, c, v);

  it('reads ISBE osisRef and Smith passage attributes, dropping verses that do not exist', () => {
    const refs = refsInMarkup(
      '<ref osisRef="Bible:Gen.1.1">Ge 1:1</ref> <scripRef passage="john 1:2,3">John 1:2,3</scripRef>' +
        ' <ref osisRef="Bible:Gen.9.9">Ge 9:9</ref>',
      table,
    );
    expect([...refs].sort()).toEqual([gen(1, 1), john(1, 2), john(1, 3)].sort());
    expect([...refsInMarkup('<scripRef passage="ge 1:1-2">x</scripRef>', table)]).toEqual([
      gen(1, 1),
      gen(1, 2),
    ]);
  });

  it('reads TIPNR lists where a bare C.V keeps the last book', () => {
    expect([...refsInTipnr('Gen.1.1; 1.2; Jhn.1.3', table)]).toEqual([
      gen(1, 1),
      gen(1, 2),
      john(1, 3),
    ]);
  });
});

describe('TIPNR parsing', () => {
  it('reads names, the Total reference list and the short description', () => {
    const text = [
      '$========== PERSON(s)\t\t',
      'Abiel@1Sa.9.1-1Ch=H0022G\tMan living at the time of United Monarchy\t',
      '– Named\tAbiel@1Sa.9.1-1Ch\tH0022G\tAbiel\t1Sa.9.1; 1Sa.14.51',
      '– Total\tAbiel or Jeiel or Jehiel or Ner\tAbiel, Jeiel, Ner\tH0022G\t1Sa.9.1; 14.51\t7',
      '@Brief= Father of Kish',
      '@Short= Abiel was the <strong="H7027G">father</strong> of Kish.',
      '$========== EXCLUDED OTHER\t',
      'Skip@Gen.1.1=H1\tignored\t',
      '– Total\tSkip\tSkip\tH1\tGen.1.1\t1',
    ].join('\n');
    expect(parseTipnr(text)).toEqual([
      {
        id: 'Abiel@1Sa.9.1-1Ch',
        kind: 'person',
        names: ['Abiel', 'Jeiel', 'Jehiel', 'Ner'],
        refs: '1Sa.9.1; 14.51',
        text: 'Abiel was the father of Kish.',
      },
    ]);
  });
});

describe('headwords and senses', () => {
  it('splits alternatives and spots entries about something else', () => {
    expect(parseHeadword('ABIA, ABIAH, OR ABIJAH')).toEqual({
      names: ['ABIA', 'ABIAH', 'ABIJAH'],
      qualified: false,
    });
    expect(parseHeadword('CHERITH, THE BROOK')).toEqual({ names: ['CHERITH'], qualified: false });
    expect(parseHeadword('TABOR, MOUNT')).toEqual({ names: ['TABOR'], qualified: false });
    expect(parseHeadword('TABOR, THE PLAIN OF')).toEqual({ names: ['TABOR'], qualified: true });
  });

  it("splits Smith's <li> senses and ISBE's (1) (2) senses", () => {
    expect(splitSenses('(<i>x</i>). <ol><li>One</li><li>Two</li></ol>')).toEqual({
      preamble: '(<i>x</i>). ',
      senses: ['One', 'Two'],
    });
    const isbe = splitSenses('<p>ab-i-el:</p><p>(1) First</p><p>(2) Second</p>');
    expect(isbe.preamble).toBe('<p>ab-i-el:</p>');
    expect(isbe.senses).toEqual(['(1) First</p>', '(2) Second</p>']);
  });
});

describe('matching', () => {
  const index = buildNameIndex(n);

  it('gives each sense to the same-named entity whose verses it cites, and nothing else', () => {
    const bg: Background = new Map();
    const entries = new Map([
      [
        'ADAM',
        '(<i>red earth</i>). <ol><li>The first man. (<scripRef passage="ge 2:1">Genesis 2:1</scripRef>)</li>' +
          '<li>A city. (<scripRef passage="john 1:3">John 1:3</scripRef>)</li></ol>',
      ],
      ['EDEN', 'The garden.'],
      ['LORD', 'A title.'],
    ]);
    const stats = matchHeadwords('smith', entries, index, table, bg);
    expect(bg.get('adam_2')).toEqual([
      { source: 'smith', key: 'ADAM', text: '(red earth).\nThe first man. (Genesis 2:1)' },
    ]);
    expect(bg.get('eden_1')?.[0]?.text).toBe('The garden.'); // unique primary name, no refs
    expect(bg.get('god_1')).toBeUndefined(); // "Lord" is only an alias of God
    expect(stats).toMatchObject({ entities: 2 });
  });

  it('refuses a TIPNR record whose verses tie between two candidates', () => {
    const bg: Background = new Map();
    const rec = {
      id: 'X@Gen.2.1',
      kind: 'person' as const,
      names: ['Adam', 'Eve'],
      refs: 'Gen.2.1',
      text: 't',
    };
    expect(matchTipnr([rec], index, table, bg)).toMatchObject({ ambiguous: 1, entities: 0 });
    expect(bg.size).toBe(0);
  });

  it('attaches name meanings by primary name only', () => {
    const bg: Background = new Map();
    matchHitchcock(
      new Map([
        ['ADAM', 'earthy; red'],
        ['LORD', 'master'],
      ]),
      index,
      bg,
    );
    expect([...bg.keys()]).toEqual(['adam_2']);
  });

  it('labels each source in the prompt, after Easton', () => {
    const ctx = buildGroundContext(n);
    ctx.background = new Map([
      [
        'god_1',
        [
          { source: 'hitchcock', key: 'GOD', text: 'good' },
          { source: 'smith', key: 'GOD', text: 'The Creator, in Smith.' },
        ],
      ],
    ]);
    const msg = buildUserMessage(ground('person', 'god_1', ctx));
    const at = (s: string): number => msg.indexOf(s);
    expect(at("BACKGROUND (Easton's Bible Dictionary, 1897):")).toBeGreaterThan(0);
    expect(
      at("BACKGROUND (Smith's Bible Dictionary, 1863):\nThe Creator, in Smith."),
    ).toBeGreaterThan(at("BACKGROUND (Easton's"));
    expect(
      at("BACKGROUND (Hitchcock's Bible Names, 1869; meaning of the name):\ngood"),
    ).toBeGreaterThan(at("BACKGROUND (Smith's"));
  });
});
