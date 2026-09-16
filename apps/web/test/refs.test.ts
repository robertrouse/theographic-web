import { describe, expect, it } from 'vitest';
import type { Book } from '@theographic/core';
import {
  formatDate,
  formatDuration,
  groupByLetter,
  indexLetter,
  rangeLabel,
  subtitleOf,
  verseHref,
  verseLabel,
  yearOf,
} from '../src/lib/refs';

const books: Partial<Book>[] = [
  { order: 1, name: 'Genesis', slug: 'gen' },
  { order: 43, name: 'John', slug: 'john' },
];
const book = (order: number) => books.find((b) => b.order === order) as Book | undefined;

describe('verse labels and links', () => {
  it('formats Book C:V and the reader anchor', () => {
    expect(verseLabel(43003016, book)).toBe('John 3:16');
    expect(verseHref(43003016, book)).toBe('/john/3#v16');
  });
  it('never renders a blank for an unknown book', () => {
    expect(verseLabel(66022021, book)).toBe('66:22:21');
    expect(verseHref(66022021, book)).toBeUndefined();
  });
  it('collapses ranges to the shortest unambiguous form', () => {
    expect(rangeLabel([43003016, 43003016], book)).toBe('John 3:16');
    expect(rangeLabel([43003016, 43003021], book)).toBe('John 3:16–21');
    expect(rangeLabel([1001001, 1002003], book)).toBe('Genesis 1:1 – 2:3');
    expect(rangeLabel([1001001, 43001001], book)).toBe('Genesis 1:1 – John 1:1');
  });
});

describe('dates', () => {
  it('reads the leading astronomical year', () => {
    expect(yearOf('-4003')).toBe(-4003);
    expect(yearOf('0029-10-9')).toBe(29);
    expect(yearOf('')).toBeUndefined();
  });
  it('formats BC/AD and keeps month and day when present', () => {
    expect(formatDate('-4003')).toBe('4004 BC');
    expect(formatDate('0')).toBe('1 BC');
    expect(formatDate('0057')).toBe('AD 57');
    expect(formatDate('0029-10-9')).toBe('9 October, AD 29');
    expect(formatDate('0030-03')).toBe('March, AD 30');
  });
  it('spells out durations', () => {
    expect(formatDuration('7D')).toBe('7 days');
    expect(formatDuration('1Y')).toBe('1 year');
    expect(formatDuration('40Y')).toBe('40 years');
    expect(formatDuration('P1Y')).toBe('P1Y');
  });
});

describe('subtitles', () => {
  it('shows only the disambiguator when the title repeats the name', () => {
    expect(subtitleOf({ name: 'Abimelech', title: 'Abimelech (King of Gerar)' })).toBe(
      'King of Gerar',
    );
  });
  it('shows the whole title when it differs from the name', () => {
    expect(subtitleOf({ name: 'Israel', title: 'Jacob (Israel)' })).toBe('Jacob (Israel)');
    expect(subtitleOf({ name: 'Adar', title: 'Addar' })).toBe('Addar');
  });
  it('is absent when there is nothing to add', () => {
    expect(subtitleOf({ name: 'Moses' })).toBeUndefined();
    expect(subtitleOf({ name: 'Moses', title: 'Moses' })).toBeUndefined();
  });
});

describe('letter index', () => {
  it('files lower-case names under their capital and others under #', () => {
    expect(indexLetter('mount Zion')).toBe('M');
    expect(indexLetter('Ézion')).toBe('#');
  });
  it('groups and sorts', () => {
    const g = groupByLetter([{ name: 'brook Eshcol' }, { name: 'Aaron' }, { name: 'Abel' }]);
    expect(g.map(([k, v]) => [k, v.map((x) => x.name)])).toEqual([
      ['A', ['Aaron', 'Abel']],
      ['B', ['brook Eshcol']],
    ]);
  });
});
