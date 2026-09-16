/**
 * Pure helpers for labels, links and dates. Nothing here reads a file; the
 * book lookup is injected so the same code can run against any `Book[]`.
 *
 * Candidates for `packages/core` later (`formatDate`, `formatDuration`,
 * `verseIdParts` already lives there); kept here for CP-06 because core is
 * being edited concurrently.
 */
import { formatYear, verseIdParts } from '@theographic/core';
import type { Book, EntityBase, EventEntity, VerseId } from '@theographic/core';

export type BookLookup = (order: number) => Book | undefined;

/** 43003016 → "John 3:16". Unknown book order → "43:3:16" rather than a blank. */
export function verseLabel(id: VerseId, book: BookLookup): string {
  const { book: order, c, v } = verseIdParts(id);
  const b = book(order);
  return b ? `${b.name} ${c}:${v}` : `${order}:${c}:${v}`;
}

/** 43003016 → "/john/3#v16". */
export function verseHref(id: VerseId, book: BookLookup): string | undefined {
  const { book: order, c, v } = verseIdParts(id);
  const b = book(order);
  return b ? `/${b.slug}/${c}#v${v}` : undefined;
}

/** Inclusive verse-id range → "John 3:16–21" / "Gen 1:1 – 2:3" / "Gen 1:1 – Exod 2:3". */
export function rangeLabel(range: readonly [VerseId, VerseId], book: BookLookup): string {
  const [a, z] = range;
  if (a === z) return verseLabel(a, book);
  const pa = verseIdParts(a);
  const pz = verseIdParts(z);
  if (pa.book !== pz.book) return `${verseLabel(a, book)} – ${verseLabel(z, book)}`;
  if (pa.c !== pz.c) return `${verseLabel(a, book)} – ${pz.c}:${pz.v}`;
  return `${verseLabel(a, book)}–${pz.v}`;
}

export function chapterHref(bookSlug: string, c: number): string {
  return `/${bookSlug}/${c}`;
}

export function entityHref(e: Pick<EntityBase, 'kind' | 'slug'>): string {
  return `/${e.kind}/${e.slug}`;
}

/**
 * The line under a name. `title` usually repeats the name with a
 * disambiguator — "Abimelech (King of Gerar)" — so only the disambiguator is
 * shown; a title that does not start with the name ("Jacob (Israel)" on
 * Israel) is shown whole.
 */
export function subtitleOf(e: Pick<EntityBase, 'name' | 'title'>): string | undefined {
  const t = e.title;
  if (!t || t === e.name) return undefined;
  const m = t.match(/^(.*) \((.+)\)$/);
  if (m && m[1] === e.name) return m[2];
  return t;
}

// ------------------------------------------------------------------- dates

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Leading (possibly negative) year of an ISO-ish date: "-2245" → -2245, "0029-10-9" → 29. */
export function yearOf(startDate: string): number | undefined {
  const m = startDate.match(/^(-?\d+)/);
  return m ? Number.parseInt(m[1]!, 10) : undefined;
}

/**
 * "-2245" → "2246 BC"; "0029-10-9" → "9 October, AD 29". Month and day are
 * kept when the source has them — that precision is data, not decoration.
 */
export function formatDate(startDate: string): string | undefined {
  const m = startDate.match(/^(-?\d+)(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/);
  if (!m) return startDate || undefined;
  const year = formatYear(Number.parseInt(m[1]!, 10));
  const month = m[2] ? MONTHS[Number.parseInt(m[2], 10) - 1] : undefined;
  const day = m[3] ? Number.parseInt(m[3], 10) : undefined;
  if (month && day) return `${day} ${month}, ${year}`;
  if (month) return `${month}, ${year}`;
  return year;
}

/** "7D" → "7 days"; "1Y" → "1 year"; anything else returned as given. */
export function formatDuration(d: string): string {
  const m = d.match(/^(\d+)([DMY])$/);
  if (!m) return d;
  const n = Number.parseInt(m[1]!, 10);
  const unit = { D: 'day', M: 'month', Y: 'year' }[m[2] as 'D' | 'M' | 'Y'];
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

export function eventYear(e: Pick<EventEntity, 'startDate' | 'sortKey'>): string | undefined {
  const y = yearOf(e.startDate) ?? (Number.isFinite(e.sortKey) ? Math.floor(e.sortKey) : undefined);
  return y === undefined ? undefined : formatYear(y);
}

// ------------------------------------------------------------------ groups

/** Upper-case first letter for A–Z index groups; "mount Zion" files under M. */
export function indexLetter(name: string): string {
  const c = name.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
}

export function groupByLetter<T extends { name: string }>(rows: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const r of [...rows].sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const k = indexLetter(r.name);
    const list = groups.get(k) ?? [];
    list.push(r);
    groups.set(k, list);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}
