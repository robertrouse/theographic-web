/**
 * Verse references in dictionary sources, as VerseIds — the evidence the
 * matcher uses to tell one Abiel from another. Read from markup, not prose:
 *
 * - ISBE (TEI):  `<ref osisRef="Bible:1Chr.4.2">`, ranges `Bible:Gen.26.22-Gen.26.24`
 * - Smith (ThML): `<scripRef passage="1sa 9:1">`, `passage="1ch 23:10,11"`
 * - TIPNR:        `1Sa.9.1; 14.51; 1Ch.9.35` (a bare "C.V" keeps the last book)
 *
 * A reference that does not resolve to a real verse is dropped, never
 * clamped (invariant 5): an unknown book or out-of-range verse is noise here,
 * not evidence.
 */
import type { Book, BookAliasTable, VerseId } from '@theographic/core';
import { makeVerseId, normalizeAlias, versesInChapter } from '@theographic/core';

/** STEPBible abbreviations the shared alias table does not carry. */
const STEP_EXTRA: Record<string, string> = {
  rut: 'Ruth',
  sng: 'Song',
  jol: 'Joel',
  amo: 'Amos',
  oba: 'Obad',
  nam: 'Nah',
  jam: 'Jas',
};

export function resolveBook(raw: string, table: BookAliasTable): Book | undefined {
  const key = normalizeAlias(raw);
  const osis =
    table.byAlias.get(key) ?? (table.books.has(raw) ? raw : STEP_EXTRA[key.replace(/\s+/g, '')]);
  return osis ? table.books.get(osis) : undefined;
}

function addRange(out: Set<VerseId>, book: Book, c: number, from: number, to = from): void {
  const max = versesInChapter(book, c);
  if (max === undefined) return;
  const hi = Math.min(to, max, from + 200);
  for (let v = Math.max(1, from); v <= hi; v++) out.add(makeVerseId(book.order, c, v));
}

/** "Gen.26.22" or "Gen.26.22-Gen.26.24" (OSIS, as in ISBE's osisRef). */
function addOsis(out: Set<VerseId>, ref: string, table: BookAliasTable): void {
  const [a, b] = ref.split('-');
  const pa = /^([1-3]?[A-Za-z]+)\.(\d+)(?:\.(\d+))?$/.exec(a ?? '');
  if (!pa) return;
  const book = resolveBook(pa[1]!, table);
  if (!book || pa[3] === undefined) return; // whole-chapter refs are too coarse to be evidence
  const pb = b ? /(?:^|\.)(\d+)\.(\d+)$/.exec(b) : null;
  const sameChapter = pb && Number(pb[1]) === Number(pa[2]);
  addRange(out, book, Number(pa[2]), Number(pa[3]), sameChapter ? Number(pb![2]) : undefined);
}

/** "1sa 9:1", "1ch 23:10,11", "ge 26:22-24", "ex 6:14; 7:1" (Smith's passage attribute). */
function addPassage(out: Set<VerseId>, passage: string, table: BookAliasTable): void {
  const m = /^\s*([1-3]?\s?[A-Za-z]+)\.?\s+(.*)$/.exec(passage);
  if (!m) return;
  const book = resolveBook(m[1]!, table);
  if (!book) return;
  let c: number | undefined;
  for (const group of m[2]!.split(';')) {
    for (const part of group.split(',')) {
      const cv = /^\s*(\d+):(\d+)(?:\s*[-–]\s*(\d+))?/.exec(part);
      const v = /^\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*$/.exec(part);
      if (cv) {
        c = Number(cv[1]);
        addRange(out, book, c, Number(cv[2]), cv[3] ? Number(cv[3]) : undefined);
      } else if (v && c !== undefined) {
        addRange(out, book, c, Number(v[1]), v[2] ? Number(v[2]) : undefined);
      }
    }
  }
}

/** Every verse a dictionary entry's markup cites (ISBE osisRef, Smith passage). */
export function refsInMarkup(markup: string, table: BookAliasTable): Set<VerseId> {
  const out = new Set<VerseId>();
  for (const m of markup.matchAll(/osisRef="(?:Bible:)?([^"]+)"/g)) {
    for (const r of m[1]!.split(/\s+/)) addOsis(out, r, table);
  }
  for (const m of markup.matchAll(/passage="([^"]+)"/g)) addPassage(out, m[1]!, table);
  return out;
}

/** TIPNR "1Sa.9.1; 14.51; 1Ch.9.35" → verses. */
export function refsInTipnr(list: string, table: BookAliasTable): Set<VerseId> {
  const out = new Set<VerseId>();
  let book: Book | undefined;
  for (const raw of list.split(/[;,]\s*/)) {
    const t = raw.trim();
    const full = /^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)/.exec(t);
    const short = /^(\d+)\.(\d+)/.exec(t);
    if (full) {
      book = resolveBook(full[1]!, table);
      if (book) addRange(out, book, Number(full[2]), Number(full[3]));
    } else if (short && book) {
      addRange(out, book, Number(short[1]), Number(short[2]));
    }
  }
  return out;
}
