/**
 * Sanity gate. Runs over the normalized model before anything is written.
 * Every expectation is derived
 * from the source or from the model itself — nothing here hardcodes "31,102"
 * — so a data refresh that legitimately changes a count still passes, while a
 * pipeline bug that drops or duplicates rows does not.
 *
 * Returns every failure rather than throwing on the first, so a broken build
 * reports the whole picture.
 */
import { verseIdParts } from '@theographic/core';
import { CHECK_FAILED, checkDefinition } from './definitions/check.js';
import { buildGroundContext, kindOf } from './definitions/ground.js';
import type { Normalized } from './normalize.js';
import type { Sources } from './source.js';

export interface GateResult {
  ok: boolean;
  errors: string[];
  /** Human-readable facts worth printing with a passing run. */
  facts: string[];
}

export function gate(
  n: Normalized,
  src: Pick<
    Sources,
    'books' | 'chapters' | 'verses' | 'people' | 'places' | 'events' | 'peopleGroups'
  >,
): GateResult {
  const errors: string[] = [];
  const fail = (msg: string): void => {
    errors.push(msg);
  };

  // --- counts match the source exactly --------------------------------------
  const verseTotal = [...n.versesByBook.values()].reduce((s, v) => s + v.length, 0);
  const expect = (what: string, got: number, want: number): void => {
    if (got !== want) fail(`${what}: bundle has ${got}, source has ${want}`);
  };
  expect('books', n.books.length, src.books.length);
  expect('verses', verseTotal, src.verses.length);
  expect('people', n.people.length, src.people.length);
  expect('places', n.places.length, src.places.length);
  expect('events', n.events.length, src.events.length);
  expect('groups', n.groups.length, src.peopleGroups.length);
  expect(
    'chapters',
    n.books.reduce((s, b) => s + b.versesPerChapter.length, 0),
    src.chapters.length,
  );

  // --- books ----------------------------------------------------------------
  const orders = new Set<number>();
  for (const b of n.books) {
    if (orders.has(b.order)) fail(`book ${b.osis}: duplicate order ${b.order}`);
    orders.add(b.order);
    const rows = n.versesByBook.get(b.osis);
    if (!rows) {
      fail(`book ${b.osis}: no verse bundle`);
      continue;
    }
    if (rows.length === 0) fail(`book ${b.osis}: zero verses`);
    const sum = b.versesPerChapter.reduce((s, x) => s + x, 0);
    if (sum !== b.verseCount)
      fail(`book ${b.osis}: versesPerChapter sums to ${sum}, verseCount ${b.verseCount}`);
    if (rows.length !== b.verseCount)
      fail(`book ${b.osis}: ${rows.length} verse rows, verseCount ${b.verseCount}`);
    // canonical order, chapter/verse within bounds, every verse present
    let prev = 0;
    const seen = new Map<number, number>(); // chapter → verses seen
    for (const v of rows) {
      if (v.id <= prev) fail(`book ${b.osis}: verse ids not strictly increasing at ${v.id}`);
      prev = v.id;
      const p = verseIdParts(v.id);
      if (p.book !== b.order) fail(`book ${b.osis}: verse ${v.id} belongs to book order ${p.book}`);
      if (p.c !== v.c || p.v !== v.v)
        fail(`book ${b.osis}: verse ${v.id} c/v fields disagree with id`);
      const perCh = b.versesPerChapter[v.c - 1];
      if (perCh === undefined || v.v < 1 || v.v > perCh)
        fail(`book ${b.osis}: verse ${v.id} outside chapter bounds`);
      if (v.text.length === 0) fail(`verse ${v.id}: empty text`);
      if (v.rich.length === 0) fail(`verse ${v.id}: empty richText`);
      seen.set(v.c, (seen.get(v.c) ?? 0) + 1);
    }
    b.versesPerChapter.forEach((count, i) => {
      if (seen.get(i + 1) !== count)
        fail(
          `book ${b.osis}: chapter ${i + 1} has ${seen.get(i + 1) ?? 0} verses, expected ${count}`,
        );
    });
  }
  for (const osis of n.versesByBook.keys()) {
    if (!n.books.some((b) => b.osis === osis)) fail(`verse bundle ${osis} has no book`);
  }

  // --- referential integrity -----------------------------------------------
  const personSlugs = new Set(n.people.map((p) => p.slug));
  const placeSlugs = new Set(n.places.map((p) => p.slug));
  const groupSlugs = new Set(n.groups.map((g) => g.slug));
  const eventIds = new Set(n.events.map((e) => e.id));
  const bookOsis = new Set(n.books.map((b) => b.osis));
  const verseIds = new Set<number>();
  for (const rows of n.versesByBook.values()) for (const v of rows) verseIds.add(v.id);

  const allSlugs = [...n.people, ...n.places, ...n.groups, ...n.events].map((e) => e.slug);
  if (new Set(allSlugs).size !== allSlugs.length) {
    const dupes = allSlugs.filter((s, i) => allSlugs.indexOf(s) !== i);
    fail(`entity slugs collide across kinds: ${[...new Set(dupes)].slice(0, 5).join(', ')}`);
  }

  const check = (
    what: string,
    xs: (string | number)[] | undefined,
    set: Set<string | number>,
  ): void => {
    for (const x of xs ?? []) if (!set.has(x)) fail(`${what}: dangling reference ${String(x)}`);
  };

  for (const rows of n.versesByBook.values()) {
    for (const v of rows) {
      check(`verse ${v.id}.people`, v.people, personSlugs);
      check(`verse ${v.id}.places`, v.places, placeSlugs);
      check(`verse ${v.id}.events`, v.events, eventIds);
    }
  }
  for (const b of n.books) check(`book ${b.osis}.writers`, b.writers, personSlugs);

  for (const p of n.people) {
    const d = n.personDetail.get(p.slug);
    if (!d) {
      fail(`person ${p.slug}: no detail`);
      continue;
    }
    if (p.verseCount !== d.verses.length)
      fail(`person ${p.slug}: verseCount ${p.verseCount} ≠ ${d.verses.length} verses`);
    if (d.verses.length > 0 && p.firstVerse !== d.verses[0])
      fail(`person ${p.slug}: firstVerse ≠ min verse`);
    if (d.verses.length === 0 && p.firstVerse !== undefined)
      fail(`person ${p.slug}: firstVerse without verses`);
    check(`person ${p.slug}.verses`, d.verses, verseIds);
    check(`person ${p.slug}.father`, p.father ? [p.father] : [], personSlugs);
    check(`person ${p.slug}.mother`, d.mother ? [d.mother] : [], personSlugs);
    check(`person ${p.slug}.children`, d.children, personSlugs);
    check(`person ${p.slug}.siblings`, d.siblings, personSlugs);
    check(`person ${p.slug}.halfSiblings`, d.halfSiblings, personSlugs);
    check(`person ${p.slug}.partners`, d.partners, personSlugs);
    check(`person ${p.slug}.groups`, d.groups, groupSlugs);
    check(`person ${p.slug}.birthPlace`, d.birthPlace ? [d.birthPlace] : [], placeSlugs);
    check(`person ${p.slug}.deathPlace`, d.deathPlace ? [d.deathPlace] : [], placeSlugs);
    check(`person ${p.slug}.wrote`, d.wrote, bookOsis);
    check(`person ${p.slug}.events`, d.events, eventIds);
    if (p.name.trim().length === 0) fail(`person ${p.slug}: empty name`);
    if (p.title !== undefined && p.title === p.name)
      fail(`person ${p.slug}: title duplicates name`);
  }

  for (const p of n.places) {
    const d = n.placeDetail.get(p.slug);
    if (!d) {
      fail(`place ${p.slug}: no detail`);
      continue;
    }
    if (p.verseCount !== d.verses.length)
      fail(`place ${p.slug}: verseCount ${p.verseCount} ≠ ${d.verses.length} verses`);
    if (d.verses.length > 0 && p.firstVerse !== d.verses[0])
      fail(`place ${p.slug}: firstVerse ≠ min verse`);
    check(`place ${p.slug}.verses`, d.verses, verseIds);
    check(`place ${p.slug}.events`, d.events, eventIds);
    check(`place ${p.slug}.peopleBorn`, d.peopleBorn, personSlugs);
    check(`place ${p.slug}.peopleDied`, d.peopleDied, personSlugs);
    check(`place ${p.slug}.hasBeenHere`, d.hasBeenHere, personSlugs);
    check(`place ${p.slug}.booksWritten`, d.booksWritten, bookOsis);
    check(`place ${p.slug}.rootOf`, d.rootOf ? [d.rootOf] : [], placeSlugs);
    check(`place ${p.slug}.duplicateOf`, d.duplicateOf ? [d.duplicateOf] : [], placeSlugs);
    const hasLat = p.lat !== undefined;
    const hasLon = p.lon !== undefined;
    if (hasLat !== hasLon) fail(`place ${p.slug}: latitude without longitude (or vice versa)`);
    if (hasLat && !(Number.isFinite(p.lat!) && Math.abs(p.lat!) <= 90))
      fail(`place ${p.slug}: latitude ${p.lat} out of range`);
    if (hasLon && !(Number.isFinite(p.lon!) && Math.abs(p.lon!) <= 180))
      fail(`place ${p.slug}: longitude ${p.lon} out of range`);
    if (p.lat === 0 && p.lon === 0)
      fail(`place ${p.slug}: coordinate 0,0 — missing data encoded as zero`);
    if (p.name.trim().length === 0) fail(`place ${p.slug}: empty name`);
  }

  for (const e of n.events) {
    check(`event ${e.id}.participants`, e.participants, personSlugs);
    check(`event ${e.id}.locations`, e.locations, placeSlugs);
    check(`event ${e.id}.groups`, e.groups, groupSlugs);
    check(`event ${e.id}.partOf`, e.partOf !== undefined ? [e.partOf] : [], eventIds);
    check(
      `event ${e.id}.predecessor`,
      e.predecessor !== undefined ? [e.predecessor] : [],
      eventIds,
    );
    check(`event ${e.id}.verses`, e.verses, verseIds);
    if (e.verses.length === 0) fail(`event ${e.id}: no verses`);
    if (e.verseCount !== e.verses.length) fail(`event ${e.id}: verseCount mismatch`);
    if (!Number.isFinite(e.sortKey)) fail(`event ${e.id}: sortKey not a number`);
  }
  for (const g of n.groups) {
    check(`group ${g.slug}.members`, g.members, personSlugs);
    check(`group ${g.slug}.partOf`, g.partOf ? [g.partOf] : [], groupSlugs);
  }

  // --- inverse consistency: verse.people ⇔ person.verses ----------------------
  const mentionsFromVerses = new Map<string, number>();
  for (const rows of n.versesByBook.values()) {
    for (const v of rows) {
      for (const s of v.people ?? [])
        mentionsFromVerses.set(s, (mentionsFromVerses.get(s) ?? 0) + 1);
      for (const s of v.places ?? [])
        mentionsFromVerses.set(s, (mentionsFromVerses.get(s) ?? 0) + 1);
    }
  }
  let inverseMismatch = 0;
  for (const p of [...n.people, ...n.places]) {
    if ((mentionsFromVerses.get(p.slug) ?? 0) !== p.verseCount) inverseMismatch++;
  }
  if (inverseMismatch > 0)
    fail(`${inverseMismatch} entities whose verse list disagrees with verse→entity links`);

  // --- definitions (CP-08): every row names a real entity and cites it -------
  // The file is optional, but once present it must be consistent with THIS
  // model: a slug that no longer exists or a citation that does not mention
  // the entity is a data error, not something to drop quietly (invariant 7).
  let definitionFacts: string | undefined;
  if (n.definitions) {
    const ctx = buildGroundContext(n);
    const seen = new Set<string>();
    let drafts = 0;
    let reviewed = 0;
    let flagged = 0;
    for (const d of n.definitions) {
      const where = `definition ${d.slug}`;
      if (seen.has(d.slug)) fail(`${where}: duplicate row`);
      seen.add(d.slug);
      const kind = kindOf(d.slug, ctx);
      if (kind === undefined) {
        fail(`${where}: no such entity`);
        continue;
      }
      if (d.kind !== kind) fail(`${where}: kind ${d.kind}, entity is a ${kind}`);
      if (d.status !== 'draft' && d.status !== 'reviewed')
        fail(`${where}: status ${String(d.status)}`);
      if (typeof d.model !== 'string' || d.model.length === 0) fail(`${where}: no model`);
      if (typeof d.generatedAt !== 'string' || d.generatedAt.length === 0)
        fail(`${where}: no generatedAt`);
      if (d.status === 'reviewed') reviewed++;
      else drafts++;
      // A draft may carry a failed check in its notes — that is the reviewer's
      // cue, and the row stays. A reviewed row must pass outright.
      const c = checkDefinition(d, ctx);
      if (!c.ok) {
        if (d.status === 'reviewed') fail(`${where}: reviewed but ${c.problems.join('; ')}`);
        else if (d.notes?.includes(CHECK_FAILED)) flagged++;
        else fail(`${where}: ${c.problems.join('; ')}`);
      }
    }
    definitionFacts = `${n.definitions.length} definitions (${reviewed} reviewed, ${drafts} draft${flagged ? `, ${flagged} flagged by the citation check` : ''})`;
  }

  const withCoords = n.places.filter((p) => p.lat !== undefined).length;
  const facts = [
    `${n.books.length} books, ${src.chapters.length} chapters, ${verseTotal} verses`,
    `${n.people.length} people, ${n.places.length} places (${withCoords} with coordinates), ${n.events.length} events, ${n.groups.length} groups`,
    `${n.eastonTopics.length} unmatched Easton topics retained for later`,
    ...(definitionFacts ? [definitionFacts] : []),
  ];
  return { ok: errors.length === 0, errors, facts };
}
