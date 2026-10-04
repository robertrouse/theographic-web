/**
 * A tiny but complete synthetic source set: two books, three chapters, six
 * verses, three people, two places, one event, one group, one Easton entry.
 * Every cross-reference is valid so `normalize` + `gate` pass; tests corrupt
 * copies of it to prove the gate catches each class of error.
 */
import type { AirtableRecord, Sources } from '../src/source.js';

let seq = 0;
function rec<F>(fields: F): AirtableRecord<F> {
  seq++;
  return {
    id: `rec${String(seq).padStart(14, '0')}`,
    createdTime: '2020-01-01T00:00:00.000Z',
    fields,
  };
}

export function makeSources(): Sources {
  seq = 0;
  // ids are fixed strings so the fixture is readable
  const B = { gen: 'recBOOKGEN000001', john: 'recBOOKJOHN00002' };
  const C = { gen1: 'recCHAPGEN100001', gen2: 'recCHAPGEN200002', john1: 'recCHAPJOHN10003' };
  const V = {
    gen11: 'recVGEN1100000001',
    gen12: 'recVGEN1200000002',
    gen21: 'recVGEN2100000003',
    john11: 'recVJOHN110000004',
    john12: 'recVJOHN120000005',
    john13: 'recVJOHN130000006',
  };
  const P = { god: 'recPGOD000000001', adam: 'recPADAM00000002', eve: 'recPEVE000000003' };
  const L = { eden: 'recLEDEN00000001', antioch: 'recLANTIOCH00002' };
  const E = { creation: 'recECREATION0001' };
  const G = { apostles: 'recGAPOSTLES0001' };

  const withId = <F>(id: string, fields: F): AirtableRecord<F> => ({ ...rec(fields), id });

  return {
    books: [
      withId(B.gen, {
        osisName: 'Gen',
        bookName: 'Genesis',
        shortName: 'Ge',
        slug: 'gen',
        bookOrder: 1,
        chapterCount: 2,
        verseCount: 3,
        bookDiv: 'Pentateuch',
        testament: 'Old Testament',
        chapters: [C.gen1, C.gen2],
        verses: [V.gen11, V.gen12, V.gen21],
        writers: ['adam_2, eve_3'], // the 1Sam-style comma-joined bug, on purpose
      }),
      withId(B.john, {
        osisName: 'John',
        bookName: 'John',
        shortName: 'Jn',
        slug: 'john',
        bookOrder: 43,
        chapterCount: 1,
        verseCount: 3,
        bookDiv: 'Gospels',
        testament: 'New Testament',
        chapters: [C.john1],
        verses: [V.john11, V.john12, V.john13],
        writers: [],
        yearWritten: '90',
      }),
    ],
    chapters: [
      withId(C.gen1, {
        osisRef: 'Gen.1',
        chapterNum: 1,
        book: [B.gen],
        verses: [V.gen11, V.gen12],
        slug: 'gen_1',
      }),
      withId(C.gen2, {
        osisRef: 'Gen.2',
        chapterNum: 2,
        book: [B.gen],
        verses: [V.gen21],
        slug: 'gen_2',
      }),
      withId(C.john1, {
        osisRef: 'John.1',
        chapterNum: 1,
        book: [B.john],
        verses: [V.john11, V.john12, V.john13],
        slug: 'john_1',
      }),
    ],
    verses: [
      withId(V.gen11, {
        osisRef: 'Gen.1.1',
        verseID: '01001001',
        verseNum: '1',
        verseText: 'In the beginning God created the heaven and the earth.',
        richText: 'In the beginning [God](/person/god_1) created the heaven and the earth.\n',
        mdText: '',
        book: [B.gen],
        chapter: [C.gen1],
        people: [P.god],
        event: [E.creation],
        yearNum: -4003,
        status: 'publish',
      }),
      withId(V.gen12, {
        osisRef: 'Gen.1.2',
        verseID: '01001002',
        verseNum: '2',
        verseText: 'And the earth was without form, and void.',
        richText: 'And the earth was without form, and void.\n',
        mdText: '',
        book: [B.gen],
        chapter: [C.gen1],
        event: [E.creation],
        status: 'wip',
      }),
      withId(V.gen21, {
        osisRef: 'Gen.2.1',
        verseID: '01002001',
        verseNum: '1',
        verseText: 'And Adam and Eve were in Eden.',
        richText:
          'And [Adam](/person/adam_2) and [Eve](/person/eve_3) were in [Eden](/place/eden_1).\n',
        mdText: '',
        book: [B.gen],
        chapter: [C.gen2],
        people: [P.adam, P.eve],
        places: [L.eden],
        status: 'wip',
      }),
      withId(V.john11, {
        osisRef: 'John.1.1',
        verseID: '43001001',
        verseNum: '1',
        verseText: 'In the beginning was the Word.',
        richText: 'In the beginning was the Word.\n',
        mdText: '',
        book: [B.john],
        chapter: [C.john1],
        people: [P.god],
        status: 'wip',
      }),
      withId(V.john12, {
        osisRef: 'John.1.2',
        verseID: '43001002',
        verseNum: '2',
        verseText: 'The same was in the beginning with God.',
        richText: 'The same was in the beginning with [God](/person/god_1).\n',
        mdText: '',
        book: [B.john],
        chapter: [C.john1],
        people: [P.god],
        status: 'wip',
      }),
      withId(V.john13, {
        osisRef: 'John.1.3',
        verseID: '43001003',
        verseNum: '3',
        verseText: 'They went to Antioch.',
        richText: 'They went to [Antioch](/place/antioch_2).\n',
        mdText: '',
        book: [B.john],
        chapter: [C.john1],
        places: [L.antioch],
        status: 'wip',
      }),
    ],
    people: [
      withId(P.god, {
        personLookup: 'god_1',
        slug: 'god_1',
        personID: 1,
        name: 'God',
        displayTitle: 'God',
        alsoCalled: 'LORD,Lord',
        gender: 'Male',
        status: 'publish',
        verseCount: 3,
        verses: [V.gen11, V.john11, V.john12],
        dictText: ['God. The Creator.'],
      }),
      withId(P.adam, {
        personLookup: 'adam_2',
        slug: 'adam_2',
        personID: 2,
        name: 'Adam',
        displayTitle: 'Adam',
        gender: 'Male',
        status: 'wip',
        verseCount: 1,
        verses: [V.gen21],
        partners: [P.eve],
        birthPlace: [L.eden],
        birthYear: '-4003',
        memberOf: [G.apostles],
        timeline: [E.creation],
      }),
      withId(P.eve, {
        personLookup: 'eve_3',
        slug: 'eve_3',
        personID: 3,
        name: 'Eve',
        displayTitle: 'Eve (wife of Adam)',
        gender: 'Female',
        status: 'wip',
        verseCount: 1,
        verses: [V.gen21],
        partners: [P.adam],
        ambiguous: true,
      }),
    ],
    places: [
      withId(L.eden, {
        placeLookup: 'eden_1',
        slug: 'eden_1',
        placeID: 1,
        kjvName: 'Eden',
        esvName: 'Eden',
        displayTitle: 'Eden',
        featureType: 'Region',
        latitude: '33.0',
        longitude: '44.0',
        precision: 'Rough',
        status: 'wip',
        verseCount: 1,
        verses: [V.gen21],
        peopleBorn: [P.adam],
        aliases: 'Garden of Eden, Paradise',
        dictText: ['Eden. Delight.'],
      }),
      withId(L.antioch, {
        placeLookup: 'antioch_2',
        slug: 'antioch_2',
        placeID: 2,
        kjvName: 'Antioch',
        esvName: 'Antioch',
        displayTitle: 'Antioch (Syria)',
        featureType: 'City',
        latitude: '36.2',
        // longitude deliberately missing: must yield NO coordinate
        status: 'wip',
        verseCount: 1,
        verses: [V.john13],
        eventsHere: [E.creation],
        hasBeenHere: 'adam_2',
      }),
    ],
    events: [
      withId(E.creation, {
        title: 'Creation',
        eventID: 1,
        startDate: '-4003',
        duration: '7D',
        sortKey: -4002.99,
        verseSort: '01001001',
        verses: [V.gen11, V.gen12],
        participants: [P.adam],
        locations: [L.antioch],
        groups: [G.apostles],
      }),
    ],
    peopleGroups: [withId(G.apostles, { groupName: 'Apostles', members: [P.adam] })],
    easton: [
      rec({
        dictLookup: 'Sabbath 0',
        termLabel: 'Sabbath',
        itemNum: 0,
        dictText: 'Rest.',
        matchType: 'unmatched',
      }),
      rec({ dictLookup: 'Nothing 0', termLabel: 'Nothing', itemNum: 0, matchType: 'unmatched' }),
    ],
  };
}
