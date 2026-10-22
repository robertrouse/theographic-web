/**
 * Readers for CrossWire SWORD lexicon/dictionary modules (RawLD and zLD).
 *
 * RawLD: `.idx` holds (offset u32, size u16) records into `.dat`; each `.dat`
 * record is `KEY\n` followed by the entry text.
 * zLD: `.idx` holds (offset u32, size u32) into `.dat`, whose records are
 * `KEY\n` followed by (block u32, entry u32). `.zdx` holds (offset u32,
 * size u32) of zlib-compressed blocks in `.zdt`; a decompressed block is
 * (count u32) then `count` × (offset u32, size u32) into the block itself.
 * All integers are little-endian.
 */
import { inflateSync } from 'node:zlib';
import { unzipSync } from 'fflate';

export type SwordEntries = Map<string, string>;

type Decode = (b: Uint8Array) => string;

const utf8: Decode = (b) => Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString('utf8');

/** 0x80–0x9F in windows-1252 (Node's latin1 maps them to C1 controls). */
const CP1252_HIGH =
  '\u20ac\ufffd\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\ufffd\u017d\ufffd' +
  '\ufffd\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\ufffd\u017e\u0178';

const cp1252: Decode = (b) => {
  let out = '';
  for (const byte of b) {
    out += byte >= 0x80 && byte <= 0x9f ? CP1252_HIGH[byte - 0x80] : String.fromCharCode(byte);
  }
  return out;
};

function u32(b: Uint8Array, at: number): number {
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(at, true);
}

function u16(b: Uint8Array, at: number): number {
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getUint16(at, true);
}

function splitKey(rec: Uint8Array, decode: Decode): [key: string, rest: Uint8Array] {
  const nl = rec.indexOf(0x0a);
  const end = nl < 0 ? rec.length : nl;
  return [decode(rec.subarray(0, end)).replace(/\r$/, '').trim(), rec.subarray(end + 1)];
}

export function readRawLD(idx: Uint8Array, dat: Uint8Array, decode: Decode = utf8): SwordEntries {
  const out: SwordEntries = new Map();
  for (let i = 0; i + 6 <= idx.length; i += 6) {
    const off = u32(idx, i);
    const size = u16(idx, i + 4);
    const [key, rest] = splitKey(dat.subarray(off, off + size), decode);
    if (key) out.set(key, decode(rest));
  }
  return out;
}

export function readZLD(
  idx: Uint8Array,
  dat: Uint8Array,
  zdx: Uint8Array,
  zdt: Uint8Array,
  decode: Decode = utf8,
): SwordEntries {
  const out: SwordEntries = new Map();
  const blocks = new Map<number, Uint8Array>();
  for (let i = 0; i + 8 <= idx.length; i += 8) {
    const [key, rest] = splitKey(dat.subarray(u32(idx, i), u32(idx, i) + u32(idx, i + 4)), decode);
    if (!key || rest.length < 8) continue;
    const blockNo = u32(rest, 0);
    const entryNo = u32(rest, 4);
    let block = blocks.get(blockNo);
    if (!block) {
      const off = u32(zdx, blockNo * 8);
      block = new Uint8Array(inflateSync(zdt.subarray(off, off + u32(zdx, blockNo * 8 + 4))));
      blocks.set(blockNo, block);
    }
    const eOff = u32(block, 4 + entryNo * 8);
    const eSize = u32(block, 8 + entryNo * 8);
    out.set(key, decode(block.subarray(eOff, eOff + eSize)).replace(/\0+$/, ''));
  }
  return out;
}

/**
 * Read a module zip as fetched from CrossWire's `rawzip` directory. SWORD text
 * is Latin-1 unless the module's `.conf` says `Encoding=UTF-8`.
 */
export function readSwordZip(
  zip: Uint8Array,
  stem: string,
  kind: 'rawld' | 'zld',
  encoding: 'utf-8' | 'windows-1252' = 'utf-8',
): SwordEntries {
  const decode = encoding === 'windows-1252' ? cp1252 : utf8;
  const files = unzipSync(zip);
  const get = (ext: string): Uint8Array => {
    const f = files[`${stem}.${ext}`];
    if (!f) throw new Error(`SWORD module: ${stem}.${ext} not in zip`);
    return f;
  };
  return kind === 'rawld'
    ? readRawLD(get('idx'), get('dat'), decode)
    : readZLD(get('idx'), get('dat'), get('zdx'), get('zdt'), decode);
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** ThML/TEI markup → plain text; keeps the words of references and terms. */
export function swordToText(s: string): string {
  return s
    .replace(/<br\s*\/?>|<\/p>|<p[^>]*>|<lb\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|[a-z]+);/gi, (m, e: string) =>
      e.startsWith('#')
        ? String.fromCodePoint(Number(e.slice(1)))
        : (ENTITIES[e.toLowerCase()] ?? m),
    )
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n[ \n]*/g, '\n')
    .trim();
}
