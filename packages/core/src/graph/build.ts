/**
 * Builds `graph.bin` (layout in `format.ts`) from plain rows. Lives in
 * `core` beside the reader for the same reason the text index build does:
 * the bytes the site ships are produced by the code the goldens test, and a
 * CLI or browser can rebuild them from the JSON bundles as a fallback.
 *
 * Deterministic: nodes are sorted by slug within each kind, verse lists and
 * neighbour lists are sorted and deduplicated, and nothing depends on
 * insertion order. After writing, the build reads its own bytes back and
 * checks every list decodes to what went in.
 */
import { ByteWriter } from '../text/format.js';
import { openGraph } from './adjacency.js';
import { GRAPH_FORMAT_VERSION, GRAPH_HEADER, GRAPH_MAGIC, GraphField } from './format.js';

export interface GraphEntityRow {
  slug: string;
  /** Verse ids (BBCCCVVV) linking the entity; any order, duplicates allowed. */
  verses: readonly number[];
}

export interface GraphEventRow extends GraphEntityRow {
  /** Person slugs. Unknown slugs are dropped (the data gate already rejects dangling refs). */
  participants?: readonly string[];
  /** Place slugs. */
  locations?: readonly string[];
}

export interface GraphRows {
  people: readonly GraphEntityRow[];
  places: readonly GraphEntityRow[];
  events: readonly GraphEventRow[];
}

export interface GraphBuildStats {
  nodes: number;
  people: number;
  places: number;
  events: number;
  /** Total (node, verse) pairs written. */
  verseLinks: number;
  participantLinks: number;
  locationLinks: number;
  bytes: number;
}

export interface GraphBuild {
  bytes: Uint8Array;
  stats: GraphBuildStats;
}

function sortedUnique(xs: readonly number[]): number[] {
  return [...new Set(xs)].sort((a, b) => a - b);
}

function bySlug<T extends { slug: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** Write a CSR section: u32 rows, u32[rows+1] offsets, then delta-varint data. */
function writeCsr(w: ByteWriter, lists: readonly (readonly number[])[]): void {
  const data = new ByteWriter();
  const offsets: number[] = [0];
  for (const list of lists) {
    let prev = 0;
    for (const v of list) {
      if (v < prev) throw new RangeError('graph build: list not sorted');
      data.varint(v - prev);
      prev = v;
    }
    offsets.push(data.length);
  }
  w.u32(lists.length);
  for (const o of offsets) w.u32(o);
  w.bytes(data.finish());
}

export function buildGraph(rows: GraphRows, opts: { verify?: boolean } = {}): GraphBuild {
  const people = bySlug(rows.people);
  const places = bySlug(rows.places);
  const events = bySlug(rows.events);
  const nodes = [...people, ...places, ...events];
  const indexOf = new Map<string, number>();
  nodes.forEach((n, i) => {
    if (indexOf.has(n.slug)) throw new Error(`graph build: duplicate slug ${n.slug}`);
    indexOf.set(n.slug, i);
  });

  const verseLists = nodes.map((n) => sortedUnique(n.verses));
  const resolve = (slugs: readonly string[] | undefined): number[] =>
    sortedUnique(
      (slugs ?? []).map((s) => indexOf.get(s)).filter((i): i is number => i !== undefined),
    );
  const participantLists = events.map((e) => resolve(e.participants));
  const locationLists = events.map((e) => resolve(e.locations));

  const header = new ByteWriter();
  header.ascii(GRAPH_MAGIC);
  header.u32(GRAPH_FORMAT_VERSION);
  header.u32(nodes.length);
  header.u32(people.length);
  header.u32(places.length);
  header.u32(events.length);
  header.u32(0); // namesOff
  header.u32(0); // versesOff
  header.u32(0); // participantsOff
  header.u32(0); // locationsOff
  if (header.length !== GRAPH_HEADER) throw new Error('graph build: header size drift');

  const body = new ByteWriter();
  const namesOff = GRAPH_HEADER + body.length;
  for (const n of nodes) {
    body.varint(n.slug.length);
    body.ascii(n.slug);
  }
  body.align(4);
  const versesOff = GRAPH_HEADER + body.length;
  writeCsr(body, verseLists);
  body.align(4);
  const participantsOff = GRAPH_HEADER + body.length;
  writeCsr(body, participantLists);
  body.align(4);
  const locationsOff = GRAPH_HEADER + body.length;
  writeCsr(body, locationLists);

  header.patchU32(GraphField.namesOff, namesOff);
  header.patchU32(GraphField.versesOff, versesOff);
  header.patchU32(GraphField.participantsOff, participantsOff);
  header.patchU32(GraphField.locationsOff, locationsOff);

  const file = new ByteWriter();
  file.bytes(header.finish());
  file.bytes(body.finish());
  const bytes = file.finish();

  const stats: GraphBuildStats = {
    nodes: nodes.length,
    people: people.length,
    places: places.length,
    events: events.length,
    verseLinks: verseLists.reduce((s, l) => s + l.length, 0),
    participantLinks: participantLists.reduce((s, l) => s + l.length, 0),
    locationLinks: locationLists.reduce((s, l) => s + l.length, 0),
    bytes: bytes.length,
  };

  if (opts.verify !== false) {
    const g = openGraph(bytes);
    if (g.nodeCount !== nodes.length) throw new Error('graph build: node count round trip');
    nodes.forEach((n, i) => {
      if (g.slugAt(i) !== n.slug || g.indexOf(n.slug) !== i) {
        throw new Error(`graph build: slug round trip failed at ${n.slug}`);
      }
      const got = g.versesOf(i);
      const want = verseLists[i]!;
      if (got.length !== want.length || got.some((v, k) => v !== want[k])) {
        throw new Error(`graph build: verse list round trip failed for ${n.slug}`);
      }
    });
    events.forEach((e, k) => {
      const i = people.length + places.length + k;
      const p = g.participantsOf(i);
      const l = g.locationsOf(i);
      const wp = participantLists[k]!;
      const wl = locationLists[k]!;
      if (p.length !== wp.length || p.some((v, j) => v !== wp[j])) {
        throw new Error(`graph build: participants round trip failed for ${e.slug}`);
      }
      if (l.length !== wl.length || l.some((v, j) => v !== wl[j])) {
        throw new Error(`graph build: locations round trip failed for ${e.slug}`);
      }
    });
  }

  return { bytes, stats };
}
