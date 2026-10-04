/**
 * Reader over `graph.bin` (layout in `format.ts`): entity → verses,
 * event → verses, event → participants / locations, all as CSR lists of
 * varint deltas decoded on demand. The only load-time work is the slug →
 * node map and the reverse participant/location → events lists (450
 * events; microseconds).
 *
 * This is the graph-hop layer (docs/search-design.md §"Graph hops"):
 *   mentions(X)        → the verse ids linking X, canonical order
 *   coMentions(A, B)   → sorted intersection of A's and B's verse unions
 *   eventsFor(...)     → events whose participants meet `people` and whose
 *                        locations meet `places` (each side only if given)
 */
import { GRAPH_FORMAT_VERSION, GRAPH_HEADER, GRAPH_MAGIC, GraphField } from './format.js';
import type { GraphNodeKind } from './format.js';

export class GraphFormatError extends Error {}

export interface Graph {
  readonly nodeCount: number;
  readonly peopleCount: number;
  readonly placesCount: number;
  readonly eventsCount: number;
  /** Node index of a slug, or −1. */
  indexOf(slug: string): number;
  slugAt(i: number): string;
  kindAt(i: number): GraphNodeKind;
  /** Sorted verse ids of node `i`. */
  versesOf(i: number): number[];
  /** Sorted node indices of an event node's participants; empty for non-events. */
  participantsOf(i: number): number[];
  locationsOf(i: number): number[];
  /** Sorted verse ids linking `slug`; empty for an unknown slug. */
  mentions(slug: string): number[];
  /** Sorted union of the verse lists of `slugs`. */
  mentionsAny(slugs: readonly string[]): number[];
  /** Sorted intersection of the two sides' verse unions. */
  coMentions(slugsA: readonly string[], slugsB: readonly string[]): number[];
  /**
   * Event slugs, in node order, whose participants include one of `people`
   * and whose locations include one of `places`. A side left undefined or
   * empty is not a constraint; with neither, the result is empty.
   */
  eventsFor(q: { people?: readonly string[]; places?: readonly string[] }): string[];
}

/** Sorted intersection of two ascending arrays. */
export function intersectSorted(a: readonly number[], b: readonly number[]): number[] {
  const out: number[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const x = a[i]!;
    const y = b[j]!;
    if (x === y) {
      out.push(x);
      i++;
      j++;
    } else if (x < y) i++;
    else j++;
  }
  return out;
}

/** Sorted union of ascending arrays, duplicates removed. */
export function unionSorted(lists: readonly (readonly number[])[]): number[] {
  if (lists.length === 0) return [];
  if (lists.length === 1) return [...lists[0]!];
  const seen = new Set<number>();
  for (const l of lists) for (const v of l) seen.add(v);
  return [...seen].sort((a, b) => a - b);
}

export function openGraph(bytes: Uint8Array): Graph {
  if (bytes.length < GRAPH_HEADER) throw new GraphFormatError('graph.bin: truncated header');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  if (magic !== GRAPH_MAGIC) throw new GraphFormatError(`graph.bin: not a ${GRAPH_MAGIC} file`);
  const u32 = (pos: number): number => view.getUint32(pos, true);
  const version = u32(GraphField.version);
  if (version !== GRAPH_FORMAT_VERSION) {
    throw new GraphFormatError(
      `graph.bin: format ${version}, reader expects ${GRAPH_FORMAT_VERSION}`,
    );
  }
  const nodeCount = u32(GraphField.nodeCount);
  const peopleCount = u32(GraphField.peopleCount);
  const placesCount = u32(GraphField.placesCount);
  const eventsCount = u32(GraphField.eventsCount);
  const namesOff = u32(GraphField.namesOff);
  const versesOff = u32(GraphField.versesOff);
  const participantsOff = u32(GraphField.participantsOff);
  const locationsOff = u32(GraphField.locationsOff);
  const eventBase = peopleCount + placesCount;

  // --- names ----------------------------------------------------------------
  const slugs: string[] = new Array<string>(nodeCount);
  const indexOf = new Map<string, number>();
  {
    let pos = namesOff;
    for (let i = 0; i < nodeCount; i++) {
      let len = 0;
      let shift = 0;
      let b: number;
      do {
        b = view.getUint8(pos++);
        len |= (b & 0x7f) << shift;
        shift += 7;
      } while (b & 0x80);
      let s = '';
      for (let k = 0; k < len; k++) s += String.fromCharCode(view.getUint8(pos + k));
      pos += len;
      slugs[i] = s;
      indexOf.set(s, i);
    }
  }

  // --- CSR sections ---------------------------------------------------------
  const csr = (sectionOff: number): ((row: number) => number[]) => {
    const rows = u32(sectionOff);
    const offsetsAt = sectionOff + 4;
    const dataAt = offsetsAt + (rows + 1) * 4;
    return (row: number): number[] => {
      if (row < 0 || row >= rows) return [];
      let pos = dataAt + u32(offsetsAt + row * 4);
      const end = dataAt + u32(offsetsAt + (row + 1) * 4);
      const out: number[] = [];
      let prev = 0;
      while (pos < end) {
        let v = 0;
        let shift = 0;
        let b: number;
        do {
          b = view.getUint8(pos++);
          if (shift < 28) v |= (b & 0x7f) << shift;
          else v += (b & 0x7f) * 2 ** shift;
          shift += 7;
        } while (b & 0x80);
        prev += v >>> 0;
        out.push(prev);
      }
      return out;
    };
  };
  const versesOf = csr(versesOff);
  const participantsRow = csr(participantsOff);
  const locationsRow = csr(locationsOff);
  const participantsOf = (i: number): number[] => participantsRow(i - eventBase);
  const locationsOf = (i: number): number[] => locationsRow(i - eventBase);

  // --- reverse index: node → events it participates in / is a location of --
  const eventsByParticipant = new Map<number, number[]>();
  const eventsByLocation = new Map<number, number[]>();
  for (let k = 0; k < eventsCount; k++) {
    const ev = eventBase + k;
    for (const p of participantsRow(k)) {
      const l = eventsByParticipant.get(p);
      if (l) l.push(ev);
      else eventsByParticipant.set(p, [ev]);
    }
    for (const p of locationsRow(k)) {
      const l = eventsByLocation.get(p);
      if (l) l.push(ev);
      else eventsByLocation.set(p, [ev]);
    }
  }

  const kindAt = (i: number): GraphNodeKind =>
    i < peopleCount ? 'person' : i < eventBase ? 'place' : 'event';

  const mentions = (slug: string): number[] => {
    const i = indexOf.get(slug);
    return i === undefined ? [] : versesOf(i);
  };
  const mentionsAny = (list: readonly string[]): number[] =>
    unionSorted(list.map(mentions).filter((l) => l.length > 0));

  const eventsFor = (q: { people?: readonly string[]; places?: readonly string[] }): string[] => {
    const side = (
      slugsIn: readonly string[] | undefined,
      rev: Map<number, number[]>,
    ): Set<number> | undefined => {
      if (!slugsIn || slugsIn.length === 0) return undefined;
      const set = new Set<number>();
      for (const s of slugsIn) {
        const i = indexOf.get(s);
        if (i === undefined) continue;
        for (const ev of rev.get(i) ?? []) set.add(ev);
      }
      return set;
    };
    const byPeople = side(q.people, eventsByParticipant);
    const byPlaces = side(q.places, eventsByLocation);
    if (!byPeople && !byPlaces) return [];
    let ids: number[];
    if (byPeople && byPlaces) ids = [...byPeople].filter((ev) => byPlaces.has(ev));
    else ids = [...(byPeople ?? byPlaces)!];
    return ids.sort((a, b) => a - b).map((i) => slugs[i]!);
  };

  return {
    nodeCount,
    peopleCount,
    placesCount,
    eventsCount,
    indexOf: (slug) => indexOf.get(slug) ?? -1,
    slugAt: (i) => {
      const s = slugs[i];
      if (s === undefined) throw new RangeError(`graph node ${i} out of range`);
      return s;
    },
    kindAt,
    versesOf,
    participantsOf,
    locationsOf,
    mentions,
    mentionsAny,
    coMentions: (a, b) => intersectSorted(mentionsAny(a), mentionsAny(b)),
    eventsFor,
  };
}
