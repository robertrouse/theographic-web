/**
 * Per-entity grounding: everything the model is allowed to know about one
 * person, place or event, assembled from the normalized model and nothing
 * else. The definition must be supportable from this block alone, and every
 * citation must come from the `citable` list it carries — `check.ts` enforces
 * both, so what is *not* here matters as much as what is.
 *
 * Verse selection favours spread across books over the first N mentions: a
 * person who appears in Genesis and Hebrews should be seen from both. Within a
 * book, verses are sampled evenly so the first and last mention survive.
 *
 * Token budget: the whole user message is kept under `MAX_PROMPT_TOKENS`
 * (estimated at 4 characters per token). Easton's text is the one input that
 * can be very long (Moses runs to 3,000 words) and is the first thing cut,
 * at a paragraph boundary; verses are trimmed only if that is not enough.
 */
import type {
  Book,
  EventEntity,
  GroupEntity,
  PersonEntity,
  PlaceEntity,
  Slug,
  VerseId,
  VerseRow,
} from '@theographic/core';
import { formatYear, verseIdParts } from '@theographic/core';
import type { Normalized } from '../normalize.js';

export const MAX_VERSES = 40;
export const MAX_PROMPT_TOKENS = 6000;
/** Easton is a secondary source; never let it crowd out the verses. */
export const MAX_EASTON_TOKENS = 2000;

export const EASTON_LABEL =
  "Easton's Bible Dictionary — legacy reference (1897), may be dated or conflate people";

export type GroundKind = 'person' | 'place' | 'event';

export interface GroundedVerse {
  /** OSIS reference, e.g. "Gen.12.1" — the form citations must use. */
  osisRef: string;
  /** Human label, e.g. "Genesis 12:1". */
  label: string;
  text: string;
}

export interface Grounding {
  slug: Slug;
  kind: GroundKind;
  /** Display title: `title` when the source has one, else `name`. */
  title: string;
  /** Labelled facts, in display order. Absent facts are absent (invariant 6). */
  facts: [label: string, value: string][];
  verses: GroundedVerse[];
  /** How many verses exist in total, so the model knows when it sees a sample. */
  totalVerses: number;
  /** Easton text after budget trimming; `eastonTruncated` says if it was cut. */
  easton?: string;
  eastonTruncated?: boolean;
  /** The only osisRefs a citation may use: exactly `verses[].osisRef`. */
  citable: string[];
}

/** Lookups built once from a `Normalized` model and shared across entities. */
export interface GroundContext {
  bookByOrder: Map<number, Book>;
  bookByOsis: Map<string, Book>;
  verseById: Map<VerseId, VerseRow>;
  personBySlug: Map<Slug, PersonEntity>;
  placeBySlug: Map<Slug, PlaceEntity>;
  groupBySlug: Map<Slug, GroupEntity>;
  eventById: Map<number, EventEntity>;
  eventBySlug: Map<Slug, EventEntity>;
  n: Normalized;
}

export function buildGroundContext(n: Normalized): GroundContext {
  const verseById = new Map<VerseId, VerseRow>();
  for (const rows of n.versesByBook.values()) for (const r of rows) verseById.set(r.id, r);
  return {
    bookByOrder: new Map(n.books.map((b) => [b.order, b])),
    bookByOsis: new Map(n.books.map((b) => [b.osis, b])),
    verseById,
    personBySlug: new Map(n.people.map((p) => [p.slug, p])),
    placeBySlug: new Map(n.places.map((p) => [p.slug, p])),
    groupBySlug: new Map(n.groups.map((g) => [g.slug, g])),
    eventById: new Map(n.events.map((e) => [e.id, e])),
    eventBySlug: new Map(n.events.map((e) => [e.slug, e])),
    n,
  };
}

export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

export function osisRefOf(id: VerseId, ctx: Pick<GroundContext, 'bookByOrder'>): string {
  const { book, c, v } = verseIdParts(id);
  const b = ctx.bookByOrder.get(book);
  if (!b) throw new Error(`verse ${id}: unknown book order ${book}`);
  return `${b.osis}.${c}.${v}`;
}

/** "Gen.12.1" → 1012001, or undefined when the book or shape is unknown. */
export function verseIdOfOsis(
  ref: string,
  ctx: Pick<GroundContext, 'bookByOsis'>,
): VerseId | undefined {
  const m = /^([1-5]?[A-Za-z]+)\.(\d{1,3})\.(\d{1,3})$/.exec(ref);
  if (!m) return undefined;
  const b = ctx.bookByOsis.get(m[1]!);
  if (!b) return undefined;
  const c = Number.parseInt(m[2]!, 10);
  const v = Number.parseInt(m[3]!, 10);
  const perChapter = b.versesPerChapter[c - 1];
  if (perChapter === undefined || v < 1 || v > perChapter) return undefined;
  return b.order * 1_000_000 + c * 1000 + v;
}

/** k of n indices, evenly spaced, always including 0 and n-1 when k ≥ 2. */
export function evenIndices(n: number, k: number): number[] {
  if (k <= 0 || n <= 0) return [];
  if (k >= n) return Array.from({ length: n }, (_, i) => i);
  if (k === 1) return [0];
  const out = new Set<number>();
  for (let i = 0; i < k; i++) out.add(Math.round((i * (n - 1)) / (k - 1)));
  return [...out].sort((a, b) => a - b);
}

/**
 * Choose up to `cap` verse ids spread across books. Every book keeps at least
 * one verse (its first mention); the rest of the quota is split in proportion
 * to how often the entity appears there, largest remainders first. Within a
 * book the picks are evenly spaced so the first and last mention both survive.
 */
export function selectVerses(ids: readonly VerseId[], cap: number = MAX_VERSES): VerseId[] {
  const sorted = [...ids].sort((a, b) => a - b);
  if (sorted.length <= cap) return sorted;

  const byBook = new Map<number, VerseId[]>();
  for (const id of sorted) {
    const b = verseIdParts(id).book;
    (byBook.get(b) ?? byBook.set(b, []).get(b)!).push(id);
  }
  const books = [...byBook.entries()].sort(([a], [b]) => a - b);

  // More books than slots: one verse from each of the most-mentioned books.
  if (books.length >= cap) {
    return books
      .slice()
      .sort(([, a], [, b]) => b.length - a.length || a[0]! - b[0]!)
      .slice(0, cap)
      .map(([, vs]) => vs[0]!)
      .sort((a, b) => a - b);
  }

  const total = sorted.length;
  const spare = cap - books.length;
  const shares = books.map(([, vs]) => (spare * vs.length) / total);
  const quota = shares.map((s) => 1 + Math.floor(s));
  let left = cap - quota.reduce((s, q) => s + q, 0);
  const byRemainder = shares
    .map((s, i) => [s - Math.floor(s), i] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of byRemainder) {
    if (left <= 0) break;
    if (quota[i]! < books[i]![1].length) {
      quota[i]!++;
      left--;
    }
  }

  const out: VerseId[] = [];
  books.forEach(([, vs], i) => {
    for (const idx of evenIndices(vs.length, Math.min(quota[i]!, vs.length))) out.push(vs[idx]!);
  });
  return out.sort((a, b) => a - b);
}

function verseLabel(id: VerseId, ctx: GroundContext): string {
  const { book, c, v } = verseIdParts(id);
  const b = ctx.bookByOrder.get(book);
  return b ? `${b.name} ${c}:${v}` : `${book}:${c}:${v}`;
}

function groundVerses(ids: readonly VerseId[], ctx: GroundContext): GroundedVerse[] {
  return ids.flatMap((id) => {
    const row = ctx.verseById.get(id);
    if (!row) return [];
    return [{ osisRef: osisRefOf(id, ctx), label: verseLabel(id, ctx), text: row.text }];
  });
}

function displayTitle(e: { name: string; title?: string }): string {
  return e.title ?? e.name;
}

function personNames(slugs: readonly Slug[] | undefined, ctx: GroundContext): string | undefined {
  const names = (slugs ?? []).flatMap((s) => {
    const p = ctx.personBySlug.get(s);
    return p ? [displayTitle(p)] : [];
  });
  return names.length ? names.join('; ') : undefined;
}

function placeName(slug: Slug | undefined, ctx: GroundContext): string | undefined {
  if (slug === undefined) return undefined;
  const p = ctx.placeBySlug.get(slug);
  return p ? displayTitle(p) : undefined;
}

function placeNames(slugs: readonly Slug[] | undefined, ctx: GroundContext): string | undefined {
  const names = (slugs ?? []).flatMap((s) => {
    const p = ctx.placeBySlug.get(s);
    return p ? [displayTitle(p)] : [];
  });
  return names.length ? names.join('; ') : undefined;
}

function groupNames(slugs: readonly Slug[] | undefined, ctx: GroundContext): string | undefined {
  const names = (slugs ?? []).flatMap((s) => {
    const g = ctx.groupBySlug.get(s);
    return g ? [g.name] : [];
  });
  return names.length ? names.join('; ') : undefined;
}

function eventLine(e: EventEntity): string {
  const y = eventYear(e);
  return y === undefined ? e.name : `${e.name} (${y})`;
}

function eventYear(e: EventEntity): string | undefined {
  const m = /^(-?\d+)/.exec(e.startDate);
  if (m) return formatYear(Number.parseInt(m[1]!, 10));
  return Number.isFinite(e.sortKey) ? formatYear(Math.floor(e.sortKey)) : undefined;
}

function eventLines(ids: readonly number[] | undefined, ctx: GroundContext): string | undefined {
  const lines = (ids ?? []).flatMap((id) => {
    const e = ctx.eventById.get(id);
    return e ? [eventLine(e)] : [];
  });
  return lines.length ? lines.join('; ') : undefined;
}

function bookNames(osis: readonly string[] | undefined, ctx: GroundContext): string | undefined {
  const names = (osis ?? []).flatMap((o) => {
    const b = ctx.bookByOsis.get(o);
    return b ? [b.name] : [];
  });
  return names.length ? names.join(', ') : undefined;
}

function whenWhere(
  year: number | undefined,
  place: string | undefined,
  ctx: GroundContext,
): string | undefined {
  const parts = [year !== undefined ? formatYear(year) : undefined, placeName(place, ctx)].filter(
    (x): x is string => x !== undefined,
  );
  return parts.length ? parts.join(', ') : undefined;
}

function push(facts: [string, string][], label: string, value: string | undefined): void {
  if (value !== undefined && value !== '') facts.push([label, value]);
}

/** Cut Markdown text to `maxTokens` at a paragraph boundary (or hard, if one paragraph). */
export function trimEaston(
  text: string,
  maxTokens: number = MAX_EASTON_TOKENS,
): { text: string; truncated: boolean } {
  if (estimateTokens(text) <= maxTokens) return { text, truncated: false };
  const paras = text.split(/\n\s*\n/);
  let out = '';
  for (const p of paras) {
    const next = out ? `${out}\n\n${p}` : p;
    if (estimateTokens(next) > maxTokens) break;
    out = next;
  }
  if (!out) out = text.slice(0, maxTokens * 4);
  return { text: out, truncated: true };
}

export function groundPerson(slug: Slug, ctx: GroundContext): Grounding {
  const p = ctx.personBySlug.get(slug);
  const d = ctx.n.personDetail.get(slug);
  if (!p || !d) throw new Error(`unknown person ${slug}`);
  const facts: [string, string][] = [];
  push(facts, 'Name', displayTitle(p));
  push(facts, 'Also called', p.aliases?.join(', '));
  push(facts, 'Gender', p.gender);
  if (p.ambiguous) push(facts, 'Note', 'this name is shared by several people in the Bible');
  push(facts, 'Father', personNames(p.father ? [p.father] : undefined, ctx));
  push(facts, 'Mother', personNames(d.mother ? [d.mother] : undefined, ctx));
  push(facts, 'Partners', personNames(d.partners, ctx));
  push(facts, 'Children', personNames(d.children, ctx));
  push(facts, 'Siblings', personNames(d.siblings, ctx));
  push(facts, 'Half-siblings', personNames(d.halfSiblings, ctx));
  push(facts, 'Groups', groupNames(d.groups, ctx));
  push(facts, 'Born', whenWhere(d.birthYear, d.birthPlace, ctx));
  push(facts, 'Died', whenWhere(d.deathYear, d.deathPlace, ctx));
  push(facts, 'Wrote', bookNames(d.wrote, ctx));
  push(facts, 'Events', eventLines(d.events, ctx));
  return finish({ slug, kind: 'person', title: displayTitle(p), facts }, d.verses, d.easton, ctx);
}

export function groundPlace(slug: Slug, ctx: GroundContext): Grounding {
  const p = ctx.placeBySlug.get(slug);
  const d = ctx.n.placeDetail.get(slug);
  if (!p || !d) throw new Error(`unknown place ${slug}`);
  const facts: [string, string][] = [];
  push(facts, 'Name', displayTitle(p));
  push(facts, 'Also called', p.aliases?.join(', '));
  push(facts, 'Modern spelling (ESV)', p.esvName);
  push(
    facts,
    'Feature type',
    [p.featureType, p.featureSubType].filter((x) => x !== undefined).join(' — ') || undefined,
  );
  if (p.ambiguous) push(facts, 'Note', 'this name is shared by several places in the Bible');
  push(
    facts,
    'Location',
    p.lat !== undefined && p.lon !== undefined
      ? `${p.lat}, ${p.lon}${p.precision ? ` (${p.precision})` : ''}`
      : 'no coordinates known',
  );
  push(facts, 'Events here', eventLines(d.events, ctx));
  push(facts, 'People born here', personNames(d.peopleBorn, ctx));
  push(facts, 'People who died here', personNames(d.peopleDied, ctx));
  push(facts, 'Books written here', bookNames(d.booksWritten, ctx));
  push(facts, 'Editorial comment', d.comment);
  return finish({ slug, kind: 'place', title: displayTitle(p), facts }, d.verses, d.easton, ctx);
}

export function groundEvent(slug: Slug, ctx: GroundContext): Grounding {
  const e = ctx.eventBySlug.get(slug);
  if (!e) throw new Error(`unknown event ${slug}`);
  const facts: [string, string][] = [];
  push(facts, 'Title', e.name);
  push(facts, 'Date', eventYear(e));
  push(facts, 'Duration', e.duration);
  push(facts, 'Participants', personNames(e.participants, ctx));
  push(facts, 'Groups', groupNames(e.groups, ctx));
  push(facts, 'Locations', placeNames(e.locations, ctx));
  const parent = e.partOf !== undefined ? ctx.eventById.get(e.partOf) : undefined;
  push(facts, 'Part of', parent ? eventLine(parent) : undefined);
  const pred = e.predecessor !== undefined ? ctx.eventById.get(e.predecessor) : undefined;
  push(facts, 'Preceded by', pred ? eventLine(pred) : undefined);
  push(facts, 'Notes', e.notes);
  // An event's verses are its passage; sample evenly rather than by book.
  const picked = evenIndices(e.verses.length, MAX_VERSES).map((i) => e.verses[i]!);
  return finish(
    { slug, kind: 'event', title: e.name, facts },
    picked,
    undefined,
    ctx,
    e.verses.length,
  );
}

function finish(
  base: Pick<Grounding, 'slug' | 'kind' | 'title' | 'facts'>,
  verseIds: readonly VerseId[],
  easton: string | undefined,
  ctx: GroundContext,
  totalVerses: number = verseIds.length,
): Grounding {
  const picked = base.kind === 'event' ? [...verseIds] : selectVerses(verseIds);
  let verses = groundVerses(picked, ctx);
  const g: Grounding = {
    ...base,
    verses,
    totalVerses,
    citable: verses.map((v) => v.osisRef),
  };
  if (easton) {
    const t = trimEaston(easton);
    g.easton = t.text;
    if (t.truncated) g.eastonTruncated = true;
  }
  // Fit the token budget: shrink Easton first, then the verse sample.
  const fixed = estimateTokens(JSON.stringify(base.facts)) + 200;
  const versesTokens = (): number => verses.reduce((s, v) => s + estimateTokens(v.text) + 8, 0);
  if (g.easton !== undefined) {
    const room = MAX_PROMPT_TOKENS - fixed - versesTokens();
    if (estimateTokens(g.easton) > room) {
      const t = trimEaston(g.easton, Math.max(0, room));
      g.easton = t.text;
      g.eastonTruncated = true;
      if (g.easton === '') {
        delete g.easton;
        delete g.eastonTruncated;
      }
    }
  }
  while (
    verses.length > 4 &&
    fixed + versesTokens() + estimateTokens(g.easton ?? '') > MAX_PROMPT_TOKENS
  ) {
    const keep = evenIndices(verses.length, verses.length - 4);
    verses = keep.map((i) => verses[i]!);
  }
  g.verses = verses;
  g.citable = verses.map((v) => v.osisRef);
  return g;
}

export function ground(kind: GroundKind, slug: Slug, ctx: GroundContext): Grounding {
  switch (kind) {
    case 'person':
      return groundPerson(slug, ctx);
    case 'place':
      return groundPlace(slug, ctx);
    case 'event':
      return groundEvent(slug, ctx);
  }
}

/** Which kind a slug belongs to, or undefined when no entity has it. */
export function kindOf(slug: Slug, ctx: GroundContext): GroundKind | undefined {
  if (ctx.personBySlug.has(slug)) return 'person';
  if (ctx.placeBySlug.has(slug)) return 'place';
  if (ctx.eventBySlug.has(slug)) return 'event';
  return undefined;
}
