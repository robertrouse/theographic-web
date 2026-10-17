/**
 * Build-time access to the CP-01 bundles in `public/data`. Every page reads
 * through here; nothing in `src/pages` touches the filesystem directly.
 *
 * Node `fs` is fine in Astro frontmatter — the DOM-free rule (invariant 1)
 * applies to `packages/core`, not to the site's build code. Bundles are read
 * once per build and cached in module scope.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  Book,
  BooksBundle,
  Definition,
  EntitiesBundle,
  EntityIndexFile,
  EntityIndexRow,
  EventEntity,
  EventsBundle,
  GroupEntity,
  Manifest,
  PersonDetail,
  PersonEntity,
  PlaceDetail,
  PlaceEntity,
  VerseRow,
  VersesBundle,
} from '@theographic/core';

declare const __DATA_DIR__: string;
/** Set by `vite.define` in astro.config.mjs: `apps/web/public/data/`. */
const DATA_DIR = __DATA_DIR__;

function readJson<T>(rel: string): T {
  const path = join(DATA_DIR, rel);
  if (!existsSync(path)) {
    throw new Error(
      `missing bundle ${rel} — run \`npm run data\` first (writes apps/web/public/data)`,
    );
  }
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function memo<T>(fn: () => T): () => T {
  let value: T | undefined;
  let done = false;
  return () => {
    if (!done) {
      value = fn();
      done = true;
    }
    return value as T;
  };
}

export const getManifest = memo(() => readJson<Manifest>('manifest.json'));

// ------------------------------------------------------------------- books

export const getBooks = memo(() => readJson<BooksBundle>('books.json').books);

const booksBySlug = memo(() => new Map(getBooks().map((b) => [b.slug, b])));
const booksByOsis = memo(() => new Map(getBooks().map((b) => [b.osis, b])));
const booksByOrder = memo(() => new Map(getBooks().map((b) => [b.order, b])));

export function getBook(slug: string): Book | undefined {
  return booksBySlug().get(slug);
}
export function getBookByOsis(osis: string): Book | undefined {
  return booksByOsis().get(osis);
}
export function getBookByOrder(order: number): Book | undefined {
  return booksByOrder().get(order);
}

// ------------------------------------------------------------------ verses

const versesCache = new Map<string, VerseRow[]>();

/** All verses of a book, canonical order. */
export function getVerses(osis: string): VerseRow[] {
  let rows = versesCache.get(osis);
  if (!rows) {
    rows = readJson<VersesBundle>(`verses/${osis}.json`).verses;
    versesCache.set(osis, rows);
  }
  return rows;
}

export function getChapter(osis: string, c: number): VerseRow[] {
  return getVerses(osis).filter((r) => r.c === c);
}

// ---------------------------------------------------------------- entities

export const getEntities = memo(() => readJson<EntitiesBundle>('entities.json'));
export const getPeople = memo(() => getEntities().people);
export const getPlaces = memo(() => getEntities().places);
export const getGroups = memo(() => getEntities().groups);
export const getEvents = memo(() => readJson<EventsBundle>('events.json').events);

const peopleBySlug = memo(() => new Map(getPeople().map((p) => [p.slug, p])));
const placesBySlug = memo(() => new Map(getPlaces().map((p) => [p.slug, p])));
const groupsBySlug = memo(() => new Map(getGroups().map((g) => [g.slug, g])));
const eventsById = memo(() => new Map(getEvents().map((e) => [e.id, e])));
const eventsBySlug = memo(() => new Map(getEvents().map((e) => [e.slug, e])));

export function getPerson(slug: string): PersonEntity | undefined {
  return peopleBySlug().get(slug);
}
export function getPlace(slug: string): PlaceEntity | undefined {
  return placesBySlug().get(slug);
}
export function getGroup(slug: string): GroupEntity | undefined {
  return groupsBySlug().get(slug);
}
export function getEvent(id: number): EventEntity | undefined {
  return eventsById().get(id);
}
export function getEventBySlug(slug: string): EventEntity | undefined {
  return eventsBySlug().get(slug);
}

// ------------------------------------------------------------ entity index

/** `entities.index.json` (CP-03): search rows with precomputed sublabels. */
export const getEntityIndex = memo(() => readJson<EntityIndexFile>('entities.index.json'));

const indexRowsById = memo(() => new Map(getEntityIndex().rows.map((r) => [r.id, r])));

/** The index row for an entity slug (or book OSIS), when it has one. */
export function getIndexRow(id: string): EntityIndexRow | undefined {
  return indexRowsById().get(id);
}

/**
 * The line that tells same-named entities apart: the index `sub`, only when
 * another row shares the name (`dupCount > 1`). Unique names get nothing —
 * the list is not the place for a verse count on every row.
 */
export function disambiguator(id: string): string | undefined {
  const row = getIndexRow(id);
  return row !== undefined && row.dupCount > 1 ? row.sub : undefined;
}

/** Events with no parent, in chronology order — what the site calls periods. */
export const getTopLevelEvents = memo(() =>
  getEvents()
    .filter((e) => e.partOf === undefined)
    .sort((a, b) => a.sortKey - b.sortKey),
);

const childEvents = memo(() => {
  const m = new Map<number, EventEntity[]>();
  for (const e of getEvents()) {
    if (e.partOf === undefined) continue;
    const list = m.get(e.partOf) ?? [];
    list.push(e);
    m.set(e.partOf, list);
  }
  for (const list of m.values()) list.sort((a, b) => a.sortKey - b.sortKey);
  return m;
});

export function getChildEvents(id: number): EventEntity[] {
  return childEvents().get(id) ?? [];
}

/** Books whose `writers` include this person, canonical order. */
export function getBooksWrittenBy(slug: string): Book[] {
  return getBooks().filter((b) => b.writers.includes(slug));
}

// ------------------------------------------------------------------ detail

export function getPersonDetail(slug: string): PersonDetail {
  return readJson<PersonDetail>(`detail/person/${slug}.json`);
}
export function getPlaceDetail(slug: string): PlaceDetail {
  return readJson<PlaceDetail>(`detail/place/${slug}.json`);
}

// ------------------------------------------------------------- definitions

/**
 * `definitions.json` (CP-08) is optional: the bundle is only written when the
 * metadata repo has the file. A missing file means "no definitions yet", not
 * an error, so this is the one bundle read through `existsSync` rather than
 * `readJson` (invariant 6).
 */
const definitionsBySlug = memo(() => {
  const path = join(DATA_DIR, 'definitions.json');
  if (!existsSync(path)) return new Map<string, Definition>();
  const { definitions } = JSON.parse(readFileSync(path, 'utf8')) as {
    definitions: Definition[];
  };
  return new Map(definitions.map((d) => [d.slug, d]));
});

export function getDefinition(slug: string): Definition | undefined {
  return definitionsBySlug().get(slug);
}

// ---------------------------------------------------------------- helpers

/** Resolve a list of slugs to entity rows, dropping unknown ones (never a blank row). */
export function resolvePeople(slugs: readonly string[] | undefined): PersonEntity[] {
  return (slugs ?? []).flatMap((s) => {
    const p = getPerson(s);
    return p ? [p] : [];
  });
}
export function resolvePlaces(slugs: readonly string[] | undefined): PlaceEntity[] {
  return (slugs ?? []).flatMap((s) => {
    const p = getPlace(s);
    return p ? [p] : [];
  });
}
export function resolveGroups(slugs: readonly string[] | undefined): GroupEntity[] {
  return (slugs ?? []).flatMap((s) => {
    const g = getGroup(s);
    return g ? [g] : [];
  });
}
export function resolveEvents(ids: readonly number[] | undefined): EventEntity[] {
  return (ids ?? []).flatMap((id) => {
    const e = getEvent(id);
    return e ? [e] : [];
  });
}
