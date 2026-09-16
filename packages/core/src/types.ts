/**
 * Bundle types — the contract between `packages/data` (which writes them),
 * the gate (which checks them), the site (which prerenders from them) and the
 * engine (which searches them). Change here first; both sides typecheck
 * against this file.
 *
 * Conventions
 * - Ids are slugs for people/places/groups (`moses_2108`), OSIS for books
 *   (`1Sam`), integers for events (the source `eventID`) and verses.
 * - Verse ids are BBCCCVVV as a number: Gen.1.1 = 1001001, Rev.22.21 = 66022021.
 *   They sort canonically.
 * - Years are ISO 8601 astronomical: 0 = 1 BC, -4003 = 4004 BC. Formatting is a
 *   display concern (`formatYear`).
 * - Absent means absent. No `0`, `""` or `null` stands in for "unknown"
 *   (invariant 6); optional fields are simply omitted.
 */

/** OSIS book abbreviation, e.g. "Gen", "1Sam", "John". */
export type BookOsis = string;

/** Eight-digit BBCCCVVV verse id as a number, e.g. 1001001 for Gen.1.1. */
export type VerseId = number;

/** Entity slug as used in URLs: "moses_2108", "jerusalem_636", "apostles". */
export type Slug = string;

export type EntityKind = 'person' | 'place' | 'event' | 'group';

export type Testament = 'OT' | 'NT';

/** Curation state carried over from Airtable. `publish` rows were checked. */
export type Status = 'publish' | 'wip';

// ---------------------------------------------------------------- manifest

export interface Manifest {
  /** Bundle format version; bump when a shape changes. */
  format: 1;
  /** Commit of theographic-bible-metadata the bundles were built from. */
  source: { repo: string; sha: string };
  /** ISO timestamp of the build. Not part of any content hash. */
  builtAt: string;
  /** Relative path → sha256 of every emitted file (except this one). */
  files: Record<string, string>;
  counts: {
    books: number;
    chapters: number;
    verses: number;
    people: number;
    places: number;
    events: number;
    groups: number;
  };
  /** Mean tokens per verse under the core tokenizer; BM25's avgdl. */
  avgVerseTokens?: number;
}

// ------------------------------------------------------------------- books

export interface Book {
  osis: BookOsis;
  name: string;
  /** Two–three letter short name from the source ("Ge", "1Sa", "Php"). */
  short: string;
  /** URL segment: lower-case osis ("1sam"). */
  slug: string;
  /** 1..66 canonical order. */
  order: number;
  testament: Testament;
  /** "Pentateuch", "Gospels", "Pauline Epistles", … */
  division: string;
  chapterCount: number;
  verseCount: number;
  /** Index c-1 → number of verses in chapter c. Length = chapterCount. */
  versesPerChapter: number[];
  /** Person slugs credited as writers, in source order. */
  writers: Slug[];
  /** ISO year the book was written, when the source has one. */
  yearWritten?: number;
}

export interface BooksBundle {
  books: Book[];
}

// ------------------------------------------------------------------ verses

export interface VerseRow {
  id: VerseId;
  /** Chapter and verse numbers within the book. */
  c: number;
  v: number;
  /** KJV plain text. This is what the text index is built from. */
  text: string;
  /**
   * KJV with entity links and italics as Markdown:
   * `[Jubal](/person/jubal_1748)`, `_was_`. A different edition from `text`
   * in places ("Beth-el" vs "Bethel"). Used for rendering, never indexing.
   */
  rich: string;
  people?: Slug[];
  places?: Slug[];
  /** Event ids described by this verse. */
  events?: number[];
  /** Traditional chronology year (ISO astronomical), when the source has one. */
  year?: number;
  status: Status;
}

/** One file per book: `verses/{osis}.json`. */
export interface VersesBundle {
  book: BookOsis;
  verses: VerseRow[];
}

// ---------------------------------------------------------------- entities

/** Fields every searchable entity carries; the light-weight index row. */
export interface EntityBase {
  kind: EntityKind;
  slug: Slug;
  /** Primary display name. People: KJV name; places: KJV name; events: title. */
  name: string;
  /**
   * Disambiguated title when the source has one that differs from `name`
   * ("Jacob (Israel)", "Antioch (Syria)"). Omitted when identical.
   */
  title?: string;
  /** Curated alternate names from the source, already split and trimmed. */
  aliases?: string[];
  /** Number of verses mentioning (or, for events, describing) the entity. */
  verseCount: number;
  /** Lowest verse id among `verseCount`; the canonical "first mention". */
  firstVerse?: VerseId;
  status?: Status;
}

export interface PersonEntity extends EntityBase {
  kind: 'person';
  gender: 'male' | 'female';
  surname?: string;
  /** Person slug of the father, when known — used for disambiguation labels. */
  father?: Slug;
  /** Source flags this name as shared by several people. */
  ambiguous?: boolean;
}

export type FeatureType =
  'City' | 'Region' | 'Landmark' | 'Mountain' | 'Water' | 'Valley' | 'Island' | 'Path';

export interface PlaceEntity extends EntityBase {
  kind: 'place';
  /** ESV spelling when it differs from the KJV name ("Forum of Appius"). */
  esvName?: string;
  featureType?: FeatureType;
  featureSubType?: string;
  /** Both present or both absent. */
  lat?: number;
  lon?: number;
  /** Source's confidence in the coordinate ("Rough", "Center", "Unlocated", …). */
  precision?: string;
  ambiguous?: boolean;
}

export interface EventEntity extends EntityBase {
  kind: 'event';
  /** Source eventID; stable across rebuilds. */
  id: number;
  /** Year + sequence/100; orders the chronology. */
  sortKey: number;
  /** ISO 8601 date or year as the source gives it ("-2245", "0054-05-03"). */
  startDate: string;
  /** ISO 8601 duration-ish as the source gives it ("1D", "40Y"). */
  duration?: string;
  participants?: Slug[];
  locations?: Slug[];
  groups?: Slug[];
  /** Parent event id. */
  partOf?: number;
  predecessor?: number;
  /** Inclusive verse-id range covered, plus the exact list. */
  verseRange?: [VerseId, VerseId];
  verses: VerseId[];
  notes?: string;
}

export interface GroupEntity extends EntityBase {
  kind: 'group';
  members?: Slug[];
  partOf?: Slug;
}

export type Entity = PersonEntity | PlaceEntity | EventEntity | GroupEntity;

/** `entities.json`: everything the search index and list pages need. */
export interface EntitiesBundle {
  people: PersonEntity[];
  places: PlaceEntity[];
  groups: GroupEntity[];
}

/** `events.json`: events are small enough to ship whole. */
export interface EventsBundle {
  events: EventEntity[];
}

// ------------------------------------------------------------------ detail

/** `detail/person/{slug}.json` — what a person page needs beyond the entity row. */
export interface PersonDetail {
  slug: Slug;
  mother?: Slug;
  children?: Slug[];
  siblings?: Slug[];
  halfSiblings?: Slug[];
  partners?: Slug[];
  groups?: Slug[];
  birthPlace?: Slug;
  deathPlace?: Slug;
  birthYear?: number;
  deathYear?: number;
  /** Books (OSIS) credited to this person. */
  wrote?: BookOsis[];
  /** Event ids this person participated in, in chronology order. */
  events?: number[];
  /** Every verse mentioning the person, canonical order. */
  verses: VerseId[];
  /** Easton's Bible Dictionary (1897) text, Markdown. Hidden source for the
   *  generated definition; may be shown as a labelled fallback until then. */
  easton?: string;
}

/** `detail/place/{slug}.json`. */
export interface PlaceDetail {
  slug: Slug;
  events?: number[];
  peopleBorn?: Slug[];
  peopleDied?: Slug[];
  /** People who lived at, visited or passed through. */
  hasBeenHere?: Slug[];
  /** Books (OSIS) written here. */
  booksWritten?: BookOsis[];
  /** Place whose coordinate this one inherits. */
  rootOf?: Slug;
  duplicateOf?: Slug;
  /** OpenBible editorial comment. */
  comment?: string;
  verses: VerseId[];
  easton?: string;
}

// ------------------------------------------------------------- definitions

/** A generated (or hand-written) definition. Lives in the metadata repo. */
export interface Definition {
  slug: Slug;
  kind: EntityKind;
  text: string;
  /** OSIS refs cited; every one must be a real verse tied to the entity. */
  citations: string[];
  confidence?: 'high' | 'medium' | 'low';
  model: string;
  generatedAt: string;
  status: 'draft' | 'reviewed';
  notes?: string;
}
