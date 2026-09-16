import { describe, expect, it } from 'vitest';
import { formatYear, makeVerseId, toVerseId, verseIdParts } from '../src/ids.js';

describe('verse ids', () => {
  it('parses the zero-padded source form', () => {
    expect(toVerseId('01001001')).toBe(1001001);
    expect(toVerseId('66022021')).toBe(66022021);
  });
  it('round-trips parts', () => {
    expect(verseIdParts(43003016)).toEqual({ book: 43, c: 3, v: 16 });
    expect(makeVerseId(43, 3, 16)).toBe(43003016);
  });
  it('rejects nonsense', () => {
    expect(() => toVerseId('abc')).toThrow(RangeError);
    expect(() => toVerseId(0)).toThrow(RangeError);
  });
});

describe('formatYear', () => {
  it('uses the astronomical convention', () => {
    expect(formatYear(-4003)).toBe('4004 BC');
    expect(formatYear(0)).toBe('1 BC');
    expect(formatYear(30)).toBe('AD 30');
  });
});
