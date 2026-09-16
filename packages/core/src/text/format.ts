/**
 * Binary layout of `verses.idx` and `verses.txt`, shared by `build.ts` (the
 * writer) and `index.ts` (the reader). Everything is little-endian and read
 * with a DataView over the file bytes; nothing here needs Node.
 *
 * ── verses.idx ─────────────────────────────────────────────────────────────
 *   64-byte header, u32 fields unless noted:
 *     0  magic "TGIX"        4  version         8  docCount N     12 termCount T
 *    16  dictOff            20  dictLen        24  metaOff        28  metaLen
 *    32  postOff            36  postLen        40  docLenOff      44  docIdOff
 *    48  stemOff            52  stemLen        56  bitsetOff      60  totalTokens
 *   dict    front-coded term dictionary, blocks of DICT_BLOCK terms:
 *             u32 blockCount, u32[blockCount] block offsets (relative to dict)
 *             block: first term = varint len + bytes; each next term =
 *                    varint sharedPrefixLen, varint suffixLen, suffix bytes
 *           Terms are ASCII (the tokenizer only emits [a-z0-9'-]) and sorted;
 *           a term's id is its rank in that order.
 *   meta    per term: u32 df, u32 postings offset (relative to postOff)
 *   post    per term: df × (varint docGap, varint tf); docGap is docIndex −
 *           previousDocIndex, with the first gap measured from −1
 *   docLen  u8 per doc: token count, capped at 255 (longest KJV verse is 90)
 *   docId   u32 per doc: verse id (BBCCCVVV); 4-byte aligned
 *   stem    u32 groupCount, then per group varint size + varint term-id
 *           deltas (ascending). Only groups of ≥2 terms are written.
 *   bitset  ceil(T/8) bytes, bit t set when term t is a fuzzy candidate
 *           (df ≥ 3 ∧ len ≥ 4)
 *
 * ── verses.txt ─────────────────────────────────────────────────────────────
 *   32-byte header:
 *     0  magic "TGTX"   4  version   8  docCount N   12  offsetsOff (u32 × N+1)
 *    16  idsOff (u32 × N)   20  blobOff   24  blobLen   28  reserved
 *   Doc i's UTF-8 text is blob[offsets[i], offsets[i+1]). Doc order is the
 *   same as in verses.idx (ascending verse id), so postings' doc indexes
 *   address both files.
 */

export const IDX_MAGIC = 'TGIX';
export const TXT_MAGIC = 'TGTX';
/** Bump when the tokenizer or either layout changes in a way a reader can't detect. */
export const FORMAT_VERSION = 1;
export const IDX_HEADER = 64;
export const TXT_HEADER = 32;
/** Terms per front-coded block; the binary search compares block heads only. */
export const DICT_BLOCK = 16;
/** A term is a fuzzy candidate when df ≥ FUZZY_MIN_DF and length ≥ FUZZY_MIN_LEN. */
export const FUZZY_MIN_DF = 3;
export const FUZZY_MIN_LEN = 4;

export const IdxField = {
  version: 4,
  docCount: 8,
  termCount: 12,
  dictOff: 16,
  dictLen: 20,
  metaOff: 24,
  metaLen: 28,
  postOff: 32,
  postLen: 36,
  docLenOff: 40,
  docIdOff: 44,
  stemOff: 48,
  stemLen: 52,
  bitsetOff: 56,
  totalTokens: 60,
} as const;

export const TxtField = {
  version: 4,
  docCount: 8,
  offsetsOff: 12,
  idsOff: 16,
  blobOff: 20,
  blobLen: 24,
} as const;

/** Growable byte buffer with LEB128 varints; the only writer primitive the build needs. */
export class ByteWriter {
  private buf = new Uint8Array(1 << 16);
  length = 0;

  private ensure(n: number): void {
    if (this.length + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.length + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
  }

  u8(v: number): void {
    this.ensure(1);
    this.buf[this.length++] = v & 0xff;
  }

  u32(v: number): void {
    this.ensure(4);
    this.buf[this.length++] = v & 0xff;
    this.buf[this.length++] = (v >>> 8) & 0xff;
    this.buf[this.length++] = (v >>> 16) & 0xff;
    this.buf[this.length++] = (v >>> 24) & 0xff;
  }

  varint(v: number): void {
    if (v < 0 || !Number.isInteger(v)) throw new RangeError(`varint: ${v}`);
    while (v >= 0x80) {
      this.u8((v & 0x7f) | 0x80);
      v = Math.floor(v / 128);
    }
    this.u8(v);
  }

  bytes(b: Uint8Array): void {
    this.ensure(b.length);
    this.buf.set(b, this.length);
    this.length += b.length;
  }

  /** Terms are ASCII by construction; one byte per char. */
  ascii(s: string): void {
    this.ensure(s.length);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c > 0x7f) throw new RangeError(`non-ASCII term: ${s}`);
      this.buf[this.length++] = c;
    }
  }

  /** Zero-pad to a multiple of `n` (4 for the u32 arrays). */
  align(n: number): void {
    while (this.length % n !== 0) this.u8(0);
  }

  /** Overwrite a u32 written earlier (header fields are patched at the end). */
  patchU32(at: number, v: number): void {
    this.buf[at] = v & 0xff;
    this.buf[at + 1] = (v >>> 8) & 0xff;
    this.buf[at + 2] = (v >>> 16) & 0xff;
    this.buf[at + 3] = (v >>> 24) & 0xff;
  }

  finish(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

/** Read an LEB128 varint at `pos`; returns [value, nextPos]. Hot path: kept branch-light. */
export function readVarint(b: Uint8Array, pos: number): [number, number] {
  let v = 0;
  let shift = 0;
  for (;;) {
    const byte = b[pos++]!;
    if (shift < 28) v |= (byte & 0x7f) << shift;
    else v += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return [v >>> 0, pos];
    shift += 7;
  }
}

/** Little-endian u32 straight from the byte array (avoids DataView churn in loops). */
export function u32At(b: Uint8Array, pos: number): number {
  return (b[pos]! | (b[pos + 1]! << 8) | (b[pos + 2]! << 16) | (b[pos + 3]! << 24)) >>> 0;
}

export function asciiAt(b: Uint8Array, pos: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(b[pos + i]!);
  return s;
}
