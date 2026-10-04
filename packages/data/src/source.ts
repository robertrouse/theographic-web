import type { Definition } from '@theographic/core';

/**
 * Shape of the Airtable exports as they arrive. Only the fields the pipeline
 * reads are typed; everything else is ignored on purpose.
 */
export interface AirtableRecord<F> {
  id: string;
  createdTime: string;
  fields: F;
}

export interface BookFields {
  osisName: string;
  bookName: string;
  shortName: string;
  slug: string;
  bookOrder: number;
  chapterCount: number;
  verseCount: number;
  bookDiv: string;
  testament: 'Old Testament' | 'New Testament';
  chapters: string[];
  verses: string[];
  /** Person slugs — but 1Sam/2Sam carry one comma-joined string. */
  writers: string[];
  yearWritten?: string;
  placeWritten?: string[];
}

export interface ChapterFields {
  osisRef: string;
  chapterNum: number;
  book: string[];
  verses: string[];
  slug: string;
  writer?: string[];
}

export interface VerseFields {
  osisRef: string;
  verseID: string;
  verseNum: string;
  verseText: string;
  richText: string;
  mdText: string;
  book: string[];
  chapter: string[];
  people?: string[];
  places?: string[];
  event?: string[];
  peopleGroups?: string[];
  yearNum?: number;
  status: 'publish' | 'wip';
}

export interface PersonFields {
  personLookup: string;
  slug: string;
  personID: number;
  name: string;
  displayTitle: string;
  alsoCalled?: string;
  surname?: string;
  gender: 'Male' | 'Female';
  ambiguous?: boolean;
  status: 'publish' | 'wip';
  verseCount: number;
  verses: string[];
  father?: string[];
  mother?: string[];
  children?: string[];
  siblings?: string[];
  halfSiblingsSameFather?: string[];
  halfSiblingsSameMother?: string[];
  partners?: string[];
  memberOf?: string[];
  birthPlace?: string[];
  deathPlace?: string[];
  birthYear?: string;
  deathYear?: string;
  chaptersWritten?: string[];
  timeline?: string[];
  dictText?: string[];
  dictionaryText?: string;
}

export interface PlaceFields {
  placeLookup: string;
  slug: string;
  placeID: number;
  kjvName: string;
  esvName: string;
  displayTitle: string;
  aliases?: string;
  featureType?: string;
  featureSubType?: string;
  latitude?: string;
  longitude?: string;
  precision?: string;
  ambiguous?: boolean;
  status: 'publish' | 'wip';
  verseCount: number;
  verses?: string[];
  eventsHere?: string[];
  peopleBorn?: string[];
  peopleDied?: string[];
  booksWritten?: string[];
  /** Comma-separated person slugs. */
  hasBeenHere?: string;
  rootID?: string[];
  duplicate_of?: string[];
  comment?: string;
  dictText?: string[];
  dictionaryText?: string;
}

export interface EventFields {
  title: string;
  eventID: number;
  startDate: string;
  duration: string;
  sortKey: number;
  verseSort: string;
  verses: string[];
  participants?: string[];
  locations?: string[];
  groups?: string[];
  partOf?: string[];
  predecessor?: string[];
  notes?: string;
}

export interface GroupFields {
  groupName: string;
  members?: string[];
  partOf?: string[];
  verses?: string[];
}

export interface EastonFields {
  dictLookup: string;
  termLabel: string;
  itemNum: number;
  dictText?: string;
  matchType: 'person' | 'place' | 'multi' | 'unmatched';
  personLookup?: string[];
  placeLookup?: string[];
}

export interface Sources {
  books: AirtableRecord<BookFields>[];
  chapters: AirtableRecord<ChapterFields>[];
  verses: AirtableRecord<VerseFields>[];
  people: AirtableRecord<PersonFields>[];
  places: AirtableRecord<PlaceFields>[];
  events: AirtableRecord<EventFields>[];
  peopleGroups: AirtableRecord<GroupFields>[];
  easton: AirtableRecord<EastonFields>[];
  /**
   * Optional ninth source (CP-08): generated definitions as committed in the
   * metadata repo. Absent when no file exists — never an empty array standing
   * in for "none".
   */
  definitions?: Definition[];
}
