/**
 * Where a hit links. Generic over the group (invariant 2): a new entity
 * kind with a page adds a line to `ENTITY_PATH`, nothing else changes.
 * Groups have no page yet, so a group hit renders as text.
 */
import type { Group, Hit, Ref } from '@theographic/core';

/** The slice of `Book` the islands need, inlined as a prop. */
export interface BookLite {
  order: number;
  osis: string;
  slug: string;
  name: string;
}

export interface BookIndex {
  byOrder: Map<number, BookLite>;
  byOsis: Map<string, BookLite>;
}

export function indexBooks(books: readonly BookLite[]): BookIndex {
  return {
    byOrder: new Map(books.map((b) => [b.order, b])),
    byOsis: new Map(books.map((b) => [b.osis, b])),
  };
}

/** `BBCCCVVV` → parts; a copy of core's `verseIdParts` kept local to avoid pulling the module graph. */
export function verseParts(id: number): { book: number; c: number; v: number } {
  return { book: Math.floor(id / 1_000_000), c: Math.floor(id / 1000) % 1000, v: id % 1000 };
}

export function verseHref(id: number, books: BookIndex): string | undefined {
  const { book, c, v } = verseParts(id);
  const b = books.byOrder.get(book);
  return b ? `/${b.slug}/${c}#v${v}` : undefined;
}

export function refHref(ref: Ref, books: BookIndex): string | undefined {
  const b = books.byOsis.get(ref.bookOsis);
  if (!b) return undefined;
  if (ref.kind === 'book') return `/${b.slug}`;
  if (ref.verseStart === undefined) return `/${b.slug}/${ref.chapterStart}`;
  return `/${b.slug}/${ref.chapterStart}#v${ref.verseStart}`;
}

const ENTITY_PATH: Partial<Record<Group, string>> = {
  people: '/person/',
  places: '/place/',
  events: '/event/',
};

export function hitHref(hit: Hit, books: BookIndex): string | undefined {
  if (hit.group === 'verses')
    return typeof hit.id === 'number' ? verseHref(hit.id, books) : undefined;
  if (hit.group === 'passages') {
    if (hit.ref) return refHref(hit.ref, books);
    const b = books.byOsis.get(String(hit.id));
    return b ? `/${b.slug}` : undefined;
  }
  const path = ENTITY_PATH[hit.group];
  return path ? `${path}${hit.id}` : undefined;
}

export const GROUP_LABEL: Record<Group, string> = {
  passages: 'Passages',
  verses: 'Verses',
  people: 'People',
  places: 'Places',
  events: 'Events',
  groups: 'Groups',
  topics: 'Topics',
};
