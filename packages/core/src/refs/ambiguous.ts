/**
 * Books whose name is also an entity name. A bare "John" or "Ruth" must return
 * both readings (invariant 5), so the parser marks those refs `confidence 0.7`
 * and lists the entities in `ambiguousWith`.
 *
 * `AMBIGUOUS_BOOK_ENTITIES` is derived from `entities.json` by
 * `deriveAmbiguousBooks` and checked against the live data by
 * `test/ambiguous.test.ts`, so it cannot drift silently. Regenerate it by
 * running that test: on mismatch it prints the replacement literal.
 * From CP-03 the entity index supplies this at runtime instead.
 */
import type { Book, BookOsis, PersonEntity, PlaceEntity } from '../types.js';
import { normalizeAlias } from './normalize.js';
import type { AmbiguousEntity } from './types.js';

/**
 * The rule: a book collides with an entity when the book's name equals the
 * entity's primary name, surname (people) or a curated alias, compared after
 * `normalizeAlias`. Titles are not compared ("John Mark" ≠ "Mark"); the
 * surname is, which is how the book of Mark reaches mark_1679.
 */
export function deriveAmbiguousBooks(
  books: Book[],
  entities: { people: PersonEntity[]; places: PlaceEntity[] },
): Record<BookOsis, AmbiguousEntity[]> {
  const byName = new Map<string, AmbiguousEntity[]>();
  const register = (name: string | undefined, entity: AmbiguousEntity): void => {
    if (!name) return;
    const key = normalizeAlias(name);
    if (!key) return;
    let list = byName.get(key);
    if (!list) byName.set(key, (list = []));
    if (!list.some((e) => e.id === entity.id)) list.push(entity);
  };
  for (const p of entities.people) {
    const entity: AmbiguousEntity = { type: 'person', id: p.slug };
    register(p.name, entity);
    register(p.surname, entity);
    for (const a of p.aliases ?? []) register(a, entity);
  }
  for (const p of entities.places) {
    const entity: AmbiguousEntity = { type: 'place', id: p.slug };
    register(p.name, entity);
    for (const a of p.aliases ?? []) register(a, entity);
  }
  const out: Record<BookOsis, AmbiguousEntity[]> = {};
  for (const b of [...books].sort((x, y) => x.order - y.order)) {
    const hits = byName.get(normalizeAlias(b.name));
    if (hits?.length) {
      out[b.osis] = [...hits].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    }
  }
  return out;
}

/** Book OSIS → entities sharing its name. Derived; see `deriveAmbiguousBooks`. */
export const AMBIGUOUS_BOOK_ENTITIES: Record<BookOsis, AmbiguousEntity[]> = {
  /* GENERATED-START */
  Josh: [
    { type: 'person', id: 'joshua_1727' },
    { type: 'person', id: 'joshua_1728' },
    { type: 'person', id: 'joshua_1729' },
    { type: 'person', id: 'joshua_893' },
  ],
  Ruth: [{ type: 'person', id: 'ruth_2450' }],
  Ezra: [
    { type: 'person', id: 'ezra_1244' },
    { type: 'person', id: 'ezra_1245' },
    { type: 'person', id: 'ezra_1246' },
  ],
  Neh: [
    { type: 'person', id: 'nehemiah_2171' },
    { type: 'person', id: 'nehemiah_2172' },
    { type: 'person', id: 'nehemiah_2173' },
  ],
  Esth: [{ type: 'person', id: 'esther_1343' }],
  Job: [
    { type: 'person', id: 'jashub_1638' },
    { type: 'person', id: 'job_1639' },
  ],
  Isa: [{ type: 'person', id: 'isaiah_617' }],
  Jer: [
    { type: 'person', id: 'jeremiah_848' },
    { type: 'person', id: 'jeremiah_849' },
    { type: 'person', id: 'jeremiah_850' },
    { type: 'person', id: 'jeremiah_851' },
    { type: 'person', id: 'jeremiah_852' },
    { type: 'person', id: 'jeremiah_853' },
    { type: 'person', id: 'jeremiah_854' },
    { type: 'person', id: 'jeremiah_855' },
  ],
  Ezek: [{ type: 'person', id: 'ezekiel_1237' }],
  Dan: [
    { type: 'person', id: 'daniel_939' },
    { type: 'person', id: 'daniel_974' },
    { type: 'person', id: 'daniel_975' },
  ],
  Hos: [{ type: 'person', id: 'hosea_1555' }],
  Joel: [
    { type: 'person', id: 'joel_1647' },
    { type: 'person', id: 'joel_1648' },
    { type: 'person', id: 'joel_1649' },
    { type: 'person', id: 'joel_1650' },
    { type: 'person', id: 'joel_1651' },
    { type: 'person', id: 'joel_1652' },
    { type: 'person', id: 'joel_1653' },
    { type: 'person', id: 'joel_1654' },
    { type: 'person', id: 'joel_1655' },
    { type: 'person', id: 'joel_1656' },
    { type: 'person', id: 'joel_1657' },
    { type: 'person', id: 'joel_1658' },
    { type: 'person', id: 'joel_1659' },
    { type: 'person', id: 'joel_1660' },
    { type: 'person', id: 'shaul_2563' },
  ],
  Amos: [
    { type: 'person', id: 'amos_238' },
    { type: 'person', id: 'amos_239' },
  ],
  Obad: [
    { type: 'person', id: 'obadiah_2215' },
    { type: 'person', id: 'obadiah_2216' },
    { type: 'person', id: 'obadiah_2217' },
    { type: 'person', id: 'obadiah_2218' },
    { type: 'person', id: 'obadiah_2219' },
    { type: 'person', id: 'obadiah_2220' },
    { type: 'person', id: 'obadiah_2221' },
    { type: 'person', id: 'obadiah_2222' },
    { type: 'person', id: 'obadiah_2223' },
    { type: 'person', id: 'obadiah_2224' },
    { type: 'person', id: 'obadiah_2225' },
    { type: 'person', id: 'obadiah_2226' },
  ],
  Jonah: [{ type: 'person', id: 'jonah_1689' }],
  Mic: [
    { type: 'person', id: 'micah_2049' },
    { type: 'person', id: 'micah_2050' },
    { type: 'person', id: 'micah_2053' },
    { type: 'person', id: 'micah_2055' },
    { type: 'person', id: 'micha_2051' },
    { type: 'person', id: 'michaiah_2069' },
  ],
  Nah: [{ type: 'person', id: 'nahum_2145' }],
  Hab: [{ type: 'person', id: 'habakkuk_1334' }],
  Zeph: [
    { type: 'person', id: 'uriel_2900' },
    { type: 'person', id: 'zephaniah_3039' },
    { type: 'person', id: 'zephaniah_3040' },
    { type: 'person', id: 'zephaniah_3041' },
  ],
  Hag: [{ type: 'person', id: 'haggai_1349' }],
  Zech: [
    { type: 'person', id: 'zacharias_3011' },
    { type: 'person', id: 'zacher_2972' },
    { type: 'person', id: 'zechariah_2970' },
    { type: 'person', id: 'zechariah_3003' },
    { type: 'person', id: 'zechariah_3004' },
    { type: 'person', id: 'zechariah_3005' },
    { type: 'person', id: 'zechariah_3006' },
    { type: 'person', id: 'zechariah_3007' },
    { type: 'person', id: 'zechariah_3008' },
    { type: 'person', id: 'zechariah_3009' },
    { type: 'person', id: 'zechariah_3010' },
    { type: 'person', id: 'zechariah_3012' },
    { type: 'person', id: 'zechariah_3013' },
    { type: 'person', id: 'zechariah_3014' },
    { type: 'person', id: 'zechariah_3015' },
    { type: 'person', id: 'zechariah_3016' },
    { type: 'person', id: 'zechariah_3017' },
    { type: 'person', id: 'zechariah_3018' },
    { type: 'person', id: 'zechariah_3019' },
    { type: 'person', id: 'zechariah_3020' },
    { type: 'person', id: 'zechariah_3021' },
    { type: 'person', id: 'zechariah_3022' },
    { type: 'person', id: 'zechariah_3023' },
    { type: 'person', id: 'zechariah_3024' },
    { type: 'person', id: 'zechariah_3025' },
    { type: 'person', id: 'zechariah_3026' },
    { type: 'person', id: 'zechariah_3027' },
    { type: 'person', id: 'zechariah_3028' },
  ],
  Mal: [{ type: 'person', id: 'malachi_1899' }],
  Matt: [{ type: 'person', id: 'matthew_1971' }],
  Mark: [{ type: 'person', id: 'mark_1679' }],
  Luke: [{ type: 'person', id: 'luke_1836' }],
  John: [
    { type: 'person', id: 'john_1676' },
    { type: 'person', id: 'john_1677' },
    { type: 'person', id: 'john_1678' },
    { type: 'person', id: 'mark_1679' },
  ],
  Titus: [{ type: 'person', id: 'titus_2869' }],
  Phlm: [{ type: 'person', id: 'philemon_2342' }],
  Jas: [
    { type: 'person', id: 'james_717' },
    { type: 'person', id: 'james_718' },
    { type: 'person', id: 'james_719' },
  ],
  Jude: [{ type: 'person', id: 'jude_1756' }],
  /* GENERATED-END */
};

export const AMBIGUOUS_BOOKS: ReadonlySet<BookOsis> = new Set(Object.keys(AMBIGUOUS_BOOK_ENTITIES));
