import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STATE,
  encodeQuery,
  readSearchState,
  searchHref,
  writeSearchState,
} from '../src/search/urlState.js';

describe('search URL state', () => {
  it('reads the 2020 hint form and both space encodings', () => {
    expect(readSearchState('?q=Prov%2025:2')).toEqual({ q: 'Prov 25:2', tab: 'all', debug: false });
    expect(readSearchState('q=in+the+beginning').q).toBe('in the beginning');
    expect(readSearchState('?q=John%203%3A16-18').q).toBe('John 3:16-18');
  });

  it('falls back field by field: unknown tab → all, tab without q → all, debug only when 1/true', () => {
    expect(readSearchState('?q=Saul&tab=verses')).toMatchObject({ tab: 'verses' });
    expect(readSearchState('?q=Saul&tab=nonsense')).toMatchObject({ tab: 'all' });
    expect(readSearchState('?tab=verses')).toEqual(DEFAULT_STATE);
    expect(readSearchState('?q=Saul&debug=1').debug).toBe(true);
    expect(readSearchState('?q=Saul&debug=true').debug).toBe(true);
    expect(readSearchState('?q=Saul&debug=0').debug).toBe(false);
    expect(readSearchState('')).toEqual(DEFAULT_STATE);
  });

  it('omits defaults when writing, so a clean state is a clean URL', () => {
    expect(writeSearchState(DEFAULT_STATE)).toBe('');
    expect(writeSearchState({ q: '  ', tab: 'verses', debug: false })).toBe('');
    expect(writeSearchState({ q: 'Saul', tab: 'all', debug: false })).toBe('?q=Saul');
    expect(writeSearchState({ q: 'Saul', tab: 'verses', debug: false })).toBe('?q=Saul&tab=verses');
    expect(writeSearchState({ q: 'Saul', tab: 'all', debug: true })).toBe('?q=Saul&debug=1');
  });

  it('keeps colons and commas literal and spaces as %20', () => {
    expect(encodeQuery('Prov 25:2')).toBe('Prov%2025:2');
    expect(encodeQuery('Ps 23:1,4')).toBe('Ps%2023:1,4');
    expect(encodeQuery('"search the scriptures"')).toBe('%22search%20the%20scriptures%22');
    expect(encodeQuery('Gen 1:1; John 1:1')).toBe('Gen%201:1%3B%20John%201:1');
  });

  it('round-trips every hint query and the CP-07 extras', () => {
    for (const q of [
      'Prov 25:2',
      'Acts 13',
      'John 3:16',
      'in the beginning',
      'search the scriptures',
      'Abraham',
      'Saul',
      'Zechariah',
      'Bethlehem',
      'Antioch',
      'Paul Antioch',
      'love in John',
      'John 3:16-18',
      'Jerusalm',
      'in:nt Jerusalem',
    ]) {
      expect(readSearchState(writeSearchState({ q, tab: 'all', debug: false })).q).toBe(q);
    }
  });

  it('searchHref builds a home link', () => {
    expect(searchHref('Prov 25:2')).toBe('/?q=Prov%2025:2');
    expect(searchHref('Saul', 'people')).toBe('/?q=Saul&tab=people');
  });
});
