/** Bundle-level types. Filled in during CP-01; kept here so the data gate and
 *  the site share one definition. */

/** OSIS book abbreviation, e.g. "Gen", "1Sam", "John". */
export type BookOsis = string;

/** Eight-digit BBCCCVVV verse id as a number, e.g. 1001001 for Gen.1.1. */
export type VerseId = number;

/** Entity slug as used in URLs: "moses_2108", "jerusalem_636". */
export type Slug = string;

export type EntityKind = 'person' | 'place' | 'event' | 'group';
