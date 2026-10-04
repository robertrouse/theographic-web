import { describe, expect, it } from 'vitest';
import type { Book, Definition } from '@theographic/core';
import { describeWith, draftMark } from '../src/lib/definitions';
import { citationOf, osisRefParts } from '../src/lib/refs';

const books: Partial<Book>[] = [
  { osis: 'Gen', name: 'Genesis', slug: 'gen', chapterCount: 50 },
  { osis: '1Sam', name: '1 Samuel', slug: '1sam', chapterCount: 31 },
];
const byOsis = (osis: string) => books.find((b) => b.osis === osis) as Book | undefined;

const draft: Definition = {
  slug: 'moses_2108',
  kind: 'person',
  text: 'Moses led Israel out of Egypt.',
  citations: ['Gen.12.1', '1Sam.30.27'],
  confidence: 'high',
  model: 'claude-opus-5',
  generatedAt: '2026-09-16',
  status: 'draft',
};

describe('citations', () => {
  it('parses OSIS refs and nothing else', () => {
    expect(osisRefParts('1Sam.30.27')).toEqual({ osis: '1Sam', c: 30, v: 27 });
    expect(osisRefParts('Genesis 1:1')).toBeUndefined();
    expect(osisRefParts('Gen.1')).toBeUndefined();
  });

  it('links a citation to the reader anchor', () => {
    expect(citationOf('Gen.12.1', byOsis)).toEqual({ label: 'Genesis 12:1', href: '/gen/12#v1' });
    expect(citationOf('1Sam.30.27', byOsis)).toEqual({
      label: '1 Samuel 30:27',
      href: '/1sam/30#v27',
    });
  });

  it('degrades to text rather than a broken link', () => {
    expect(citationOf('Rev.1.1', byOsis)).toEqual({ label: 'Rev.1.1' });
    expect(citationOf('Gen.99.1', byOsis)).toEqual({ label: 'Genesis 99:1' });
    expect(citationOf('nonsense', byOsis)).toEqual({ label: 'nonsense' });
  });
});

describe('describeWith', () => {
  it('prefers a definition over Easton and marks a draft', () => {
    const p = describeWith(draft, 'Easton text', byOsis)!;
    expect(p.markdown).toBe(draft.text);
    expect(p.source).toBe('AI-drafted · claude-opus-5 · 2026-09-16');
    expect(p.citations).toEqual([
      { label: 'Genesis 12:1', href: '/gen/12#v1' },
      { label: '1 Samuel 30:27', href: '/1sam/30#v27' },
    ]);
    expect(draftMark(draft)).toBe(p.source);
  });

  it('marks nothing on a reviewed row', () => {
    const p = describeWith({ ...draft, status: 'reviewed' }, undefined, byOsis)!;
    expect(p.source).toBeUndefined();
    expect(p.citations).toHaveLength(2);
  });

  it('falls back to Easton, labelled, and to nothing at all', () => {
    expect(describeWith(undefined, 'Easton text', byOsis)).toEqual({
      markdown: 'Easton text',
      source: "Easton's Bible Dictionary (1897)",
    });
    expect(describeWith(undefined, undefined, byOsis)).toBeUndefined();
  });
});
