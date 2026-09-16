/**
 * Airtable-export records → the bundle model in `@theographic/core` types.
 *
 * Rules that are easy to get wrong:
 * - Cross references arrive as Airtable record ids (`rec…`). Everything here
 *   is rekeyed to slugs (people/places/groups), OSIS (books) or ints (events,
 *   verses). A reference to an unknown record is an error, not a skip — the
 *   source has 0 dangling refs today and the gate keeps it that way.
 * - Numbers arrive as strings in several fields (lat/long, birthYear, verseNum,
 *   verseID). They are parsed here, once.
 * - Absent stays absent (invariant 6). We never emit `lat: 0` or `text: ""`.
 * - `verseCount` and `firstVerse` are recomputed from the verse links rather
 *   than copied, so the bundle is self-consistent even if the source's cached
 *   counts drift.
 */
import type {
  Book,
  BookOsis,
  EventEntity,
  FeatureType,
  GroupEntity,
  PersonDetail,
  PersonEntity,
  PlaceDetail,
  PlaceEntity,
  Slug,
  Status,
  VerseId,
  VerseRow,
} from '@theographic/core';
import { toVerseId, verseIdParts } from '@theographic/core';
import type { AirtableRecord, Sources } from './source.js';

export interface Overrides {
  dropAliases?: Record<Slug, string[]>;
}

export interface Normalized {
  books: Book[];
  /** Verses grouped by book OSIS, canonical order within each. */
  versesByBook: Map<BookOsis, VerseRow[]>;
  people: PersonEntity[];
  places: PlaceEntity[];
  groups: GroupEntity[];
  events: EventEntity[];
  personDetail: Map<Slug, PersonDetail>;
  placeDetail: Map<Slug, PlaceDetail>;
  /** Easton entries not matched to any person or place; kept for later use. */
  eastonTopics: { label: string; item: number; text: string }[];
}

export class NormalizeError extends Error {}

const FEATURE_TYPES: ReadonlySet<string> = new Set([
  'City',
  'Region',
  'Landmark',
  'Mountain',
  'Water',
  'Valley',
  'Island',
  'Path',
]);

export function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function byId<F>(rows: AirtableRecord<F>[]): Map<string, AirtableRecord<F>> {
  return new Map(rows.map((r) => [r.id, r]));
}

function num(s: string | undefined): number | undefined {
  if (s === undefined || s.trim() === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function intYear(s: string | undefined): number | undefined {
  if (s === undefined || s.trim() === '') return undefined;
  const n = Number.parseInt(s, 10);
  return Number.isInteger(n) ? n : undefined;
}

function splitList(s: string | undefined, sep: RegExp): string[] {
  if (!s) return [];
  return s
    .split(sep)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/** Same keys as T but each may be `undefined` — what a builder naturally produces. */
type Loose<T> = { [K in keyof T]: T[K] | undefined };

function defined<T extends object>(o: Loose<T>): T {
  // Drop `undefined` values so bundles never carry explicit nulls/undefineds,
  // which is also what makes the object satisfy T under exactOptionalPropertyTypes.
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o as T;
}

function nonEmpty<T>(xs: T[]): T[] | undefined {
  return xs.length > 0 ? xs : undefined;
}

/**
 * Four places arrive with the disambiguation baked into the KJV name
 * ("Antioch (Syria)"). Search and labels want the bare name plus a title, the
 * same shape every other disambiguated entity has.
 */
function splitName(
  name: string,
  displayTitle: string,
): { name: string; title: string | undefined } {
  const m = /^(.*\S)\s+\(([^()]+)\)$/.exec(name);
  const bare = m ? m[1]! : name;
  const title = displayTitle !== bare ? displayTitle : m ? name : undefined;
  return { name: bare, title };
}

export function normalize(src: Sources, overrides: Overrides = {}): Normalized {
  const books = byId(src.books);
  const chapters = byId(src.chapters);
  const verses = byId(src.verses);
  const people = byId(src.people);
  const places = byId(src.places);
  const events = byId(src.events);
  const groups = byId(src.peopleGroups);

  // --- resolvers: record id → key, throwing on unknown ids ------------------
  const resolver =
    <F>(table: Map<string, AirtableRecord<F>>, key: (f: F) => string | number, what: string) =>
    (id: string): string | number => {
      const r = table.get(id);
      if (!r) throw new NormalizeError(`unknown ${what} record ${id}`);
      return key(r.fields);
    };
  const personSlug = resolver(people, (f) => f.slug, 'person') as (id: string) => Slug;
  const placeSlug = resolver(places, (f) => f.slug, 'place') as (id: string) => Slug;
  const groupSlug = resolver(groups, (f) => slugify(f.groupName), 'group') as (id: string) => Slug;
  const eventId = resolver(events, (f) => f.eventID, 'event') as (id: string) => number;
  const bookOsis = resolver(books, (f) => f.osisName, 'book') as (id: string) => BookOsis;
  const verseId = resolver(verses, (f) => toVerseId(f.verseID), 'verse') as (id: string) => VerseId;

  const ids = (xs: string[] | undefined, f: (id: string) => Slug): Slug[] =>
    xs ? uniq(xs.map(f)).sort() : [];
  const verseIds = (xs: string[] | undefined): VerseId[] =>
    xs ? uniq(xs.map(verseId)).sort((a, b) => a - b) : [];

  // --- books ----------------------------------------------------------------
  const bookRows: Book[] = src.books
    .map((r) => {
      const f = r.fields;
      const versesPerChapter: number[] = [];
      for (const cid of f.chapters) {
        const ch = chapters.get(cid);
        if (!ch) throw new NormalizeError(`book ${f.osisName}: unknown chapter ${cid}`);
        versesPerChapter[ch.fields.chapterNum - 1] = ch.fields.verses.length;
      }
      if (versesPerChapter.length !== f.chapterCount || versesPerChapter.some((n) => !(n > 0))) {
        throw new NormalizeError(`book ${f.osisName}: chapter list inconsistent with chapterCount`);
      }
      // 1Sam/2Sam carry "samuel_2469, gad_1263, nathan_2153" as ONE element.
      const writers = uniq(f.writers.flatMap((w) => splitList(w, /,/)));
      return defined<Book>({
        osis: f.osisName,
        name: f.bookName,
        short: f.shortName,
        slug: f.slug,
        order: f.bookOrder,
        testament: f.testament === 'Old Testament' ? 'OT' : 'NT',
        division: f.bookDiv,
        chapterCount: f.chapterCount,
        verseCount: f.verseCount,
        versesPerChapter,
        writers,
        yearWritten: intYear(f.yearWritten),
      });
    })
    .sort((a, b) => a.order - b.order);

  const orderByOsis = new Map(bookRows.map((b) => [b.osis, b.order]));

  // --- verses ---------------------------------------------------------------
  const versesByBook = new Map<BookOsis, VerseRow[]>(bookRows.map((b) => [b.osis, []]));
  for (const r of src.verses) {
    const f = r.fields;
    const id = toVerseId(f.verseID);
    const osis = f.osisRef.slice(0, f.osisRef.indexOf('.'));
    const { book, c, v } = verseIdParts(id);
    if (orderByOsis.get(osis) !== book) {
      throw new NormalizeError(
        `verse ${f.osisRef}: verseID ${f.verseID} disagrees with book order`,
      );
    }
    if (Number(f.verseNum) !== v) {
      throw new NormalizeError(`verse ${f.osisRef}: verseNum ${f.verseNum} ≠ id verse ${v}`);
    }
    const text = f.verseText.trim();
    if (text.length === 0) throw new NormalizeError(`verse ${f.osisRef}: empty text`);
    const row = defined<VerseRow>({
      id,
      c,
      v,
      text,
      rich: f.richText.trim(),
      people: nonEmpty(ids(f.people, personSlug)),
      places: nonEmpty(ids(f.places, placeSlug)),
      events: nonEmpty(f.event ? uniq(f.event.map(eventId)).sort((a, b) => a - b) : []),
      year: f.yearNum,
      status: f.status as Status,
    });
    versesByBook.get(osis)!.push(row);
  }
  for (const rows of versesByBook.values()) rows.sort((a, b) => a.id - b.id);

  // --- writers inverse: person slug → books ---------------------------------
  const wroteBy = new Map<Slug, BookOsis[]>();
  for (const b of bookRows)
    for (const w of b.writers) (wroteBy.get(w) ?? wroteBy.set(w, []).get(w)!).push(b.osis);

  // --- events ---------------------------------------------------------------
  const eventRows: EventEntity[] = src.events
    .map((r) => {
      const f = r.fields;
      const vs = verseIds(f.verses);
      return defined<EventEntity>({
        kind: 'event',
        slug: `${slugify(f.title)}_${f.eventID}`,
        id: f.eventID,
        name: f.title,
        sortKey: f.sortKey,
        startDate: f.startDate,
        duration: f.duration || undefined,
        participants: nonEmpty(ids(f.participants, personSlug)),
        locations: nonEmpty(ids(f.locations, placeSlug)),
        groups: nonEmpty(ids(f.groups, groupSlug)),
        partOf: f.partOf?.[0] ? eventId(f.partOf[0]) : undefined,
        predecessor: f.predecessor?.[0] ? eventId(f.predecessor[0]) : undefined,
        verseRange: vs.length ? [vs[0]!, vs[vs.length - 1]!] : undefined,
        verses: vs,
        verseCount: vs.length,
        firstVerse: vs[0],
        notes: f.notes?.trim() || undefined,
      });
    })
    .sort((a, b) => a.sortKey - b.sortKey || a.id - b.id);
  const eventSortKey = new Map(eventRows.map((e) => [e.id, e.sortKey]));
  const eventOrder = (xs: string[] | undefined): number[] | undefined =>
    nonEmpty(
      xs
        ? uniq(xs.map(eventId)).sort((a, b) => eventSortKey.get(a)! - eventSortKey.get(b)! || a - b)
        : [],
    );

  // --- groups ---------------------------------------------------------------
  const groupRows: GroupEntity[] = src.peopleGroups
    .map((r) => {
      const f = r.fields;
      const vs = verseIds(f.verses);
      return defined<GroupEntity>({
        kind: 'group',
        slug: slugify(f.groupName),
        name: f.groupName,
        members: nonEmpty(ids(f.members, personSlug)),
        partOf: f.partOf?.[0] ? groupSlug(f.partOf[0]) : undefined,
        verseCount: vs.length,
        firstVerse: vs[0],
      });
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
  if (new Set(groupRows.map((g) => g.slug)).size !== groupRows.length) {
    throw new NormalizeError('group names do not slugify to unique slugs');
  }

  // --- people ---------------------------------------------------------------
  const personRows: PersonEntity[] = [];
  const personDetail = new Map<Slug, PersonDetail>();
  for (const r of src.people) {
    const f = r.fields;
    const vs = verseIds(f.verses);
    const aliases = uniq(splitList(f.alsoCalled, /,/)).filter(
      (a) => !overrides.dropAliases?.[f.slug]?.includes(a),
    );
    personRows.push(
      defined<PersonEntity>({
        kind: 'person',
        slug: f.slug,
        name: f.name,
        title: f.displayTitle !== f.name ? f.displayTitle : undefined,
        aliases: nonEmpty(aliases),
        verseCount: vs.length,
        firstVerse: vs[0],
        status: f.status,
        gender: f.gender === 'Female' ? 'female' : 'male',
        surname: f.surname?.trim() || undefined,
        father: f.father?.[0] ? personSlug(f.father[0]) : undefined,
        ambiguous: f.ambiguous ? true : undefined,
      }),
    );
    personDetail.set(
      f.slug,
      defined<PersonDetail>({
        slug: f.slug,
        mother: f.mother?.[0] ? personSlug(f.mother[0]) : undefined,
        children: nonEmpty(ids(f.children, personSlug)),
        siblings: nonEmpty(ids(f.siblings, personSlug)),
        halfSiblings: nonEmpty(
          ids(
            [...(f.halfSiblingsSameFather ?? []), ...(f.halfSiblingsSameMother ?? [])],
            personSlug,
          ),
        ),
        partners: nonEmpty(ids(f.partners, personSlug)),
        groups: nonEmpty(ids(f.memberOf, groupSlug)),
        birthPlace: f.birthPlace?.[0] ? placeSlug(f.birthPlace[0]) : undefined,
        deathPlace: f.deathPlace?.[0] ? placeSlug(f.deathPlace[0]) : undefined,
        birthYear: intYear(f.birthYear),
        deathYear: intYear(f.deathYear),
        wrote: wroteBy.get(f.slug),
        events: eventOrder(f.timeline),
        verses: vs,
        easton: (f.dictText?.[0] ?? f.dictionaryText)?.trim() || undefined,
      }),
    );
  }
  personRows.sort((a, b) => a.slug.localeCompare(b.slug));

  // --- places ---------------------------------------------------------------
  const placeRows: PlaceEntity[] = [];
  const placeDetail = new Map<Slug, PlaceDetail>();
  for (const r of src.places) {
    const f = r.fields;
    const vs = verseIds(f.verses);
    const lat = num(f.latitude);
    const lon = num(f.longitude);
    const hasCoord = lat !== undefined && lon !== undefined;
    const aliases = uniq(splitList(f.aliases, /,\s*/)).filter(
      (a) => !overrides.dropAliases?.[f.slug]?.includes(a),
    );
    const featureType =
      f.featureType && FEATURE_TYPES.has(f.featureType)
        ? (f.featureType as FeatureType)
        : undefined;
    if (f.featureType && !featureType) {
      throw new NormalizeError(`place ${f.slug}: unknown featureType ${f.featureType}`);
    }
    const { name, title } = splitName(f.kjvName, f.displayTitle);
    placeRows.push(
      defined<PlaceEntity>({
        kind: 'place',
        slug: f.slug,
        name,
        title,
        aliases: nonEmpty(aliases),
        verseCount: vs.length,
        firstVerse: vs[0],
        status: f.status,
        esvName: f.esvName && f.esvName !== name ? f.esvName : undefined,
        featureType,
        featureSubType: f.featureSubType?.trim() || undefined,
        lat: hasCoord ? lat : undefined,
        lon: hasCoord ? lon : undefined,
        precision: hasCoord ? f.precision?.trim() || undefined : undefined,
        ambiguous: f.ambiguous ? true : undefined,
      }),
    );
    placeDetail.set(
      f.slug,
      defined<PlaceDetail>({
        slug: f.slug,
        events: eventOrder(f.eventsHere),
        peopleBorn: nonEmpty(ids(f.peopleBorn, personSlug)),
        peopleDied: nonEmpty(ids(f.peopleDied, personSlug)),
        hasBeenHere: nonEmpty(uniq(splitList(f.hasBeenHere, /,/)).sort()),
        booksWritten: nonEmpty(uniq((f.booksWritten ?? []).map(bookOsis))),
        rootOf: f.rootID?.[0] ? placeSlug(f.rootID[0]) : undefined,
        duplicateOf: f.duplicate_of?.[0] ? placeSlug(f.duplicate_of[0]) : undefined,
        comment: f.comment?.trim() || undefined,
        verses: vs,
        easton: (f.dictText?.[0] ?? f.dictionaryText)?.trim() || undefined,
      }),
    );
  }
  placeRows.sort((a, b) => a.slug.localeCompare(b.slug));

  // --- easton topics (unmatched entries only) --------------------------------
  const eastonTopics = src.easton
    .filter((r) => r.fields.matchType === 'unmatched' && r.fields.dictText?.trim())
    .map((r) => ({
      label: r.fields.termLabel,
      item: r.fields.itemNum,
      text: r.fields.dictText!.trim(),
    }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.item - b.item);

  return {
    books: bookRows,
    versesByBook,
    people: personRows,
    places: placeRows,
    groups: groupRows,
    events: eventRows,
    personDetail,
    placeDetail,
    eastonTopics,
  };
}
