/**
 * Attach dictionary entries to people and places — automatically, so the
 * rules are strict. A wrong attachment would put another Abiel's biography in
 * front of the model, which is worse than no background at all.
 *
 * Every match needs a name: the entry's headword (or TIPNR's name forms)
 * must equal the entity's name, title or one of its aliases. Then:
 *
 * - TIPNR records list every verse: the candidate with the most shared verses
 *   wins, and a tie is no match.
 * - Smith and ISBE entries are split into senses ("1. Father of Kish…",
 *   "(2) One of David's mighty men…"); each sense goes to the same-named
 *   candidate whose verses it cites most, if those verses are mostly that
 *   candidate's (≥ 40%) and the best is unique.
 * - Name-only matches (no shared verses) are taken only for a single-sense
 *   entry whose name belongs to exactly one entity, by its primary name —
 *   never through an alias ("Lord", "Word" are aliases of Jesus).
 * - Hitchcock gives the meaning of a name, not a person, so it attaches by
 *   primary name to every entity that bears it.
 */
import type { BookAliasTable, Slug, VerseId } from '@theographic/core';
import type { Normalized } from '../normalize.js';
import type { DictId } from './sources.js';
import { refsInMarkup, refsInTipnr } from './refs.js';
import type { SwordEntries } from './sword.js';
import { swordToText } from './sword.js';
import type { TipnrRecord } from './tipnr.js';

export interface BackgroundEntry {
  source: DictId;
  /** Headword or TIPNR id it came from, for the report and debugging. */
  key: string;
  text: string;
}

export type Background = Map<Slug, BackgroundEntry[]>;

export interface MatchStats {
  source: DictId;
  entities: number;
  entries: number;
  unmatched: number;
  ambiguous: number;
}

interface Candidate {
  slug: Slug;
  kind: 'person' | 'place';
  verses: ReadonlySet<VerseId>;
  primary: boolean;
}

export const nameKey = (s: string): string =>
  s
    .normalize('NFKD')
    .replace(/\(.*?\)/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');

export function buildNameIndex(n: Normalized): Map<string, Candidate[]> {
  const index = new Map<string, Candidate[]>();
  const add = (key: string, c: Candidate): void => {
    if (!key) return;
    const list = index.get(key) ?? [];
    const same = list.find((x) => x.slug === c.slug);
    if (same) same.primary ||= c.primary;
    else list.push({ ...c });
    index.set(key, list);
  };
  const entities = [
    ...n.people.map((e) => ({ e, kind: 'person' as const, d: n.personDetail.get(e.slug) })),
    ...n.places.map((e) => ({ e, kind: 'place' as const, d: n.placeDetail.get(e.slug) })),
  ];
  for (const { e, kind, d } of entities) {
    const verses = new Set(d?.verses ?? []);
    const base = { slug: e.slug, kind, verses };
    add(nameKey(e.name), { ...base, primary: true });
    if (e.title) add(nameKey(e.title), { ...base, primary: true });
    const alts = [...(e.aliases ?? []), ...('esvName' in e && e.esvName ? [e.esvName] : [])];
    for (const a of alts) add(nameKey(a), { ...base, primary: false });
  }
  return index;
}

function overlap(a: ReadonlySet<VerseId>, b: ReadonlySet<VerseId>): number {
  let n = 0;
  for (const v of a) if (b.has(v)) n++;
  return n;
}

function candidatesFor(names: string[], index: Map<string, Candidate[]>): Candidate[] {
  const out = new Map<Slug, Candidate>();
  for (const name of names) {
    for (const c of index.get(nameKey(name)) ?? []) {
      const prev = out.get(c.slug);
      if (!prev || (c.primary && !prev.primary)) out.set(c.slug, c);
    }
  }
  return [...out.values()];
}

type Pick = { slug: Slug; score: number } | 'ambiguous' | undefined;

/** The candidate citing the most of `refs`, if unique and at least `minShare` of them. */
function bestByVerses(cands: Candidate[], refs: ReadonlySet<VerseId>, minShare: number): Pick {
  if (refs.size === 0) return undefined;
  const scored = cands
    .map((c) => ({ slug: c.slug, score: overlap(refs, c.verses) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return undefined;
  if (scored.length > 1 && scored[0]!.score === scored[1]!.score) return 'ambiguous';
  return scored[0]!.score >= minShare * refs.size ? scored[0] : 'ambiguous';
}

function push(bg: Background, slug: Slug, entry: BackgroundEntry): void {
  const list = bg.get(slug) ?? [];
  if (!list.some((x) => x.source === entry.source && x.text === entry.text)) list.push(entry);
  bg.set(slug, list);
}

// ------------------------------------------------------------------ TIPNR

export function matchTipnr(
  records: TipnrRecord[],
  index: Map<string, Candidate[]>,
  table: BookAliasTable,
  bg: Background,
): MatchStats {
  const stats: MatchStats = {
    source: 'tipnr',
    entities: 0,
    entries: 0,
    unmatched: 0,
    ambiguous: 0,
  };
  const best = new Map<Slug, { score: number; rec: TipnrRecord }>();
  for (const rec of records) {
    if (rec.kind === 'other' || !rec.text) continue;
    stats.entries++;
    const cands = candidatesFor(rec.names, index).filter((c) => c.kind === rec.kind);
    const pick = bestByVerses(cands, refsInTipnr(rec.refs, table), 0);
    if (pick === 'ambiguous') stats.ambiguous++;
    else if (!pick) stats.unmatched++;
    else if ((best.get(pick.slug)?.score ?? 0) < pick.score)
      best.set(pick.slug, { score: pick.score, rec });
  }
  for (const [slug, { rec }] of best)
    push(bg, slug, { source: 'tipnr', key: rec.id, text: rec.text });
  stats.entities = best.size;
  return stats;
}

// ------------------------------------------------------------ Smith, ISBE

const QUALIFIERS = new Set([
  'MOUNT',
  'RIVER',
  'BROOK',
  'VALLEY',
  'WILDERNESS',
  'SEA',
  'POOL',
  'WELL',
]);

/** "ABIA, ABIAH, OR ABIJAH" → names; "TABOR, THE PLAIN OF" → qualified (about something else). */
export function parseHeadword(key: string): { names: string[]; qualified: boolean } {
  const names: string[] = [];
  let qualified = false;
  for (const seg of key.split(/\s*,\s*/)) {
    const s = seg.replace(/^OR\s+/, '').trim();
    if (!s) continue;
    if (/\bOF$/.test(s) || /^THE\s+\w+\s+OF\b/.test(s)) qualified = true;
    else if (/^THE\s/.test(s) || QUALIFIERS.has(s)) continue;
    else names.push(...s.split(/\s+OR\s+/).map((x) => x.trim()));
  }
  return { names: [...new Set(names)], qualified };
}

/** Preamble (pronunciation, meaning) and the numbered senses, in markup. */
export function splitSenses(markup: string): { preamble: string; senses: string[] } {
  if (/<li\b/i.test(markup)) {
    const preamble = markup.split(/<ol\b|<li\b/i)[0] ?? '';
    const senses = [...markup.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1]!);
    return { preamble, senses };
  }
  const parts = markup.split(/<p>\s*(?=\(\d{1,2}\)\s)/);
  if (parts.length > 1) return { preamble: parts[0]!, senses: parts.slice(1) };
  return { preamble: '', senses: [markup] };
}

const SEE_ONLY = /^(?:[^.]*?\)\s*[:.]?\s*)?See\s+([A-Z][A-Z' -]+[A-Z])\.?$/;

export function matchHeadwords(
  source: 'smith' | 'isbe',
  entries: SwordEntries,
  index: Map<string, Candidate[]>,
  table: BookAliasTable,
  bg: Background,
): MatchStats {
  const stats: MatchStats = { source, entities: 0, entries: 0, unmatched: 0, ambiguous: 0 };
  const hit = new Set<Slug>();
  for (const [key, raw] of entries) {
    const { names, qualified } = parseHeadword(key);
    const cands = candidatesFor(names, index);
    if (cands.length === 0) continue;
    stats.entries++;
    let markup = raw;
    const see = SEE_ONLY.exec(swordToText(raw));
    if (see && entries.has(see[1]!.trim())) markup = entries.get(see[1]!.trim())!;
    const { preamble, senses } = splitSenses(markup);
    const lead = swordToText(preamble);
    let matched = false;
    for (const sense of senses) {
      const refs = refsInMarkup(sense, table);
      let pick = bestByVerses(cands, refs, senses.length > 1 ? 0.4 : 0);
      if (pick === undefined && senses.length === 1 && !qualified) {
        const primary = cands.filter((c) => c.primary);
        if (primary.length === 1 && cands.length === 1) pick = { slug: primary[0]!.slug, score: 0 };
      }
      if (pick === 'ambiguous') {
        stats.ambiguous++;
        continue;
      }
      if (!pick) continue;
      const body = swordToText(sense);
      const text = lead && !body.startsWith(lead) ? `${lead}\n${body}` : body;
      push(bg, pick.slug, { source, key, text });
      hit.add(pick.slug);
      matched = true;
    }
    if (!matched) stats.unmatched++;
  }
  stats.entities = hit.size;
  return stats;
}

// --------------------------------------------------------------- Hitchcock

export function matchHitchcock(
  entries: SwordEntries,
  index: Map<string, Candidate[]>,
  bg: Background,
): MatchStats {
  const stats: MatchStats = {
    source: 'hitchcock',
    entities: 0,
    entries: entries.size,
    unmatched: 0,
    ambiguous: 0,
  };
  const hit = new Set<Slug>();
  for (const [key, raw] of entries) {
    const text = swordToText(raw);
    const cands = (index.get(nameKey(key)) ?? []).filter((c) => c.primary);
    if (!text || cands.length === 0) {
      stats.unmatched++;
      continue;
    }
    for (const c of cands) {
      push(bg, c.slug, { source: 'hitchcock', key, text });
      hit.add(c.slug);
    }
  }
  stats.entities = hit.size;
  return stats;
}
