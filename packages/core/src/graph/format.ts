/**
 * Binary layout of `graph.bin`, shared by `build.ts` (the writer) and
 * `adjacency.ts` (the reader). Little-endian; the reader uses a DataView
 * over the file bytes and nothing else, so it runs anywhere `core` runs.
 *
 * Nodes are people, then places, then events, each block sorted by slug.
 * A node's index is its position in that order; `indexOf(slug)` is a Map
 * built at open time (≈4,800 entries, well under a millisecond).
 *
 * ── graph.bin ──────────────────────────────────────────────────────────────
 *   40-byte header, u32 fields:
 *     0  magic "TGGR"     4  version      8  nodeCount    12  peopleCount
 *    16  placesCount     20  eventsCount 24  namesOff     28  versesOff
 *    32  participantsOff 36  locationsOff
 *   names   per node: varint len + ASCII slug bytes (slugs are [a-z0-9_-])
 *   verses  CSR over ALL nodes: u32 rows, u32[rows+1] byte offsets (relative
 *           to the first data byte), then per row the node's verse ids as
 *           varint deltas (first delta from 0). People and places carry every
 *           verse that links them; events carry the verses that describe them.
 *   participants  CSR over EVENT nodes only (row i = event node
 *           peopleCount + placesCount + i): sorted node indices of the
 *           event's participants, varint deltas.
 *   locations     same shape: the event's location nodes.
 */

export const GRAPH_MAGIC = 'TGGR';
/** Bump when the layout changes in a way a reader cannot detect. */
export const GRAPH_FORMAT_VERSION = 1;
export const GRAPH_HEADER = 40;

export const GraphField = {
  version: 4,
  nodeCount: 8,
  peopleCount: 12,
  placesCount: 16,
  eventsCount: 20,
  namesOff: 24,
  versesOff: 28,
  participantsOff: 32,
  locationsOff: 36,
} as const;

export type GraphNodeKind = 'person' | 'place' | 'event';
