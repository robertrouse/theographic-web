/**
 * 02-entities: `entities.index.json` — every person, place, group, event and
 * book as one searchable row with weighted aliases and a precomputed
 * disambiguation sublabel. Spec: `docs/search-design.md` §"Build outputs"
 * (02-entities and the alias-mining paragraph).
 *
 * Alias weights, in one place:
 * - Mined from `rich` link labels: for each `[label](/person|place/slug)`,
 *   count per (slug, normalized label). A label is kept as an alias of a slug
 *   when its count is ≥ 2 or the label is also curated for that slug, with
 *   `w = count(label→slug) / Σ count(label→any slug)` — the share of the
 *   text's uses of that name that mean this entity ("Saul"→Paul 25/348).
 * - Curated (`aliases`, `surname`, `esvName`, title tokens, the un-hyphenated
 *   twin of a hyphenated name, a book's short name) get `w = 1`, unless the
 *   alias equals another entity's primary name or is a single word found in
 *   more than `COMMON_DF` verses. Then the text decides: the link share as
 *   above, or `COLLISION_DEFAULT` when the label is never linked at all.
 * - A curated alias whose link share is 0 is dropped: the text uses that
 *   name for other entities and never for this one (James is "son of
 *   Zebedee", but "Zebedee" is not a name for James).
 */
import {
  formatYear,
  nameTokens,
  NAME_STOPWORDS,
  normalizeName,
  verseIdParts,
  type EntityIndexFile,
  type EntityIndexRow,
  type IndexAlias,
  type Slug,
} from '@theographic/core';
import type { Normalized } from './normalize.js';

/** A single-word alias in more verses than this is a common word, not a name. */
export const COMMON_DF = 200;
/** Weight for a colliding curated alias the text never links under that label. */
export const COLLISION_DEFAULT = 0.25;
/** Minimum link count for a mined label that is not also curated. */
export const MINED_MIN_COUNT = 2;

export interface MinedLinks {
  /** normalized label → slug → link count. */
  counts: Map<string, Map<Slug, number>>;
  /** Link target slugs that are not a person or place, with their counts. */
  unresolved: Map<string, number>;
  /** Total `[label](/person|place/slug)` links seen. */
  links: number;
}

const LINK_RE = /\[([^\]]+)\]\(\/(?:person|place)\/([^)\s]+)\)/g;

/** Count every `[label](/person|place/slug)` link in `rich` by (label, slug). */
export function mineLinkAliases(n: Normalized): MinedLinks {
  const known = new Set<Slug>([...n.people, ...n.places].map((e) => e.slug));
  const counts = new Map<string, Map<Slug, number>>();
  const unresolved = new Map<string, number>();
  let links = 0;
  for (const rows of n.versesByBook.values()) {
    for (const v of rows) {
      for (const m of v.rich.matchAll(LINK_RE)) {
        links++;
        const slug = m[2]!;
        if (!known.has(slug)) {
          unresolved.set(slug, (unresolved.get(slug) ?? 0) + 1);
          continue;
        }
        const label = normalizeName(m[1]!);
        if (label === '') continue;
        let per = counts.get(label);
        if (!per) counts.set(label, (per = new Map()));
        per.set(slug, (per.get(slug) ?? 0) + 1);
      }
    }
  }
  return { counts, unresolved, links };
}

/** Number of verses whose `text` contains each normalized word. */
export function documentFrequency(n: Normalized): Map<string, number> {
  const df = new Map<string, number>();
  for (const rows of n.versesByBook.values()) {
    for (const v of rows) {
      for (const w of new Set(nameTokens(normalizeName(v.text)))) {
        df.set(w, (df.get(w) ?? 0) + 1);
      }
    }
  }
  return df;
}

export interface EntityIndexStats {
  links: number;
  unresolved: Map<string, number>;
  /** Distinct (slug, label) pairs kept from link mining; every label differs from the primary name. */
  minedAliases: number;
  curatedAliases: number;
  /** Curated aliases dropped because their link share was 0. */
  droppedZeroShare: number;
  /** Curated aliases that collided and took the link share or the default. */
  collided: number;
  rows: number;
}

/** "Antioch (Syria)" → ["Antioch", "Syria"]; anything else → [name]. */
function parenthetical(name: string): [string, string | undefined] {
  const m = /^(.*\S)\s+\(([^()]+)\)$/.exec(name);
  return m ? [m[1]!, m[2]!] : [name, undefined];
}

/**
 * The disambiguating part of a title: the parenthetical when the title is
 * "<name> (…)", otherwise the whole title when it differs from the name
 * ("Jacob (Israel)" on Israel; "John the Baptist" on John). Undefined when
 * there is nothing to add.
 */
function titleLead(name: string, title: string | undefined): string | undefined {
  if (title === undefined || title === name) return undefined;
  const [bare, paren] = parenthetical(title);
  return bare === name && paren !== undefined ? paren : title;
}

interface Draft {
  t: EntityIndexRow['t'];
  id: string;
  name: string;
  norm: string;
  title?: string;
  /** Curated alias candidates before weighting: [raw string, source]. */
  curated: [string, string][];
  vc: number;
  order?: number;
  sub: string;
  ft?: string;
  slug?: Slug;
}

export function buildEntityIndexDetailed(n: Normalized): {
  file: EntityIndexFile;
  stats: EntityIndexStats;
} {
  const mined = mineLinkAliases(n);
  const df = documentFrequency(n);
  const bookByOrder = new Map(n.books.map((b) => [b.order, b]));
  const personName = new Map(n.people.map((p) => [p.slug, p.name]));

  const firstIn = (id: number): string => {
    const { book, c, v } = verseIdParts(id);
    const b = bookByOrder.get(book);
    return `${b ? b.name : String(book)} ${c}:${v}`;
  };
  const verses = (vc: number, first: number | undefined): string =>
    first === undefined
      ? 'no verses'
      : `${vc} verse${vc === 1 ? '' : 's'} · first in ${firstIn(first)}`;
  const twin = (name: string): [string, string][] =>
    name.includes('-') ? [[name.replace(/-/g, ''), 'hyphen']] : [];

  const drafts: Draft[] = [];

  for (const p of n.people) {
    const sub =
      titleLead(p.name, p.title) ??
      (p.surname ? `${p.name} ${p.surname}` : undefined) ??
      (p.father ? `father: ${personName.get(p.father) ?? p.father}` : undefined) ??
      verses(p.verseCount, p.firstVerse);
    const curated: [string, string][] = [
      ...(p.aliases ?? []).map((a): [string, string] => [a, 'alias']),
      ...(p.surname ? [[p.surname, 'surname'] as [string, string]] : []),
      ...(p.title ? [[p.title, 'title'] as [string, string]] : []),
      ...twin(p.name),
    ];
    drafts.push({
      t: 'p',
      id: p.slug,
      slug: p.slug,
      name: p.name,
      norm: normalizeName(p.name),
      ...(p.title !== undefined ? { title: p.title } : {}),
      curated,
      vc: p.verseCount,
      ...(p.firstVerse !== undefined ? { order: p.firstVerse } : {}),
      sub,
    });
  }

  for (const p of n.places) {
    const parts: string[] = [];
    const lead = titleLead(p.name, p.title);
    if (lead !== undefined) parts.push(lead);
    if (p.featureType !== undefined) parts.push(p.featureType);
    parts.push(
      p.firstVerse === undefined
        ? 'no verses'
        : `${p.verseCount} verse${p.verseCount === 1 ? '' : 's'}`,
    );
    const curated: [string, string][] = [
      ...(p.aliases ?? []).map((a): [string, string] => [a, 'alias']),
      ...(p.esvName ? [[p.esvName, 'esv'] as [string, string]] : []),
      ...(p.title ? [[p.title, 'title'] as [string, string]] : []),
      ...twin(p.name),
    ];
    drafts.push({
      t: 'l',
      id: p.slug,
      slug: p.slug,
      name: p.name,
      norm: normalizeName(p.name),
      ...(p.title !== undefined ? { title: p.title } : {}),
      curated,
      vc: p.verseCount,
      ...(p.firstVerse !== undefined ? { order: p.firstVerse } : {}),
      sub: parts.join(' · '),
      ...(p.featureType !== undefined ? { ft: p.featureType } : {}),
    });
  }

  for (const g of n.groups) {
    const [bare, paren] = parenthetical(g.name);
    const members = g.members?.length ?? 0;
    const facts = [
      ...(members > 0 ? [`${members} member${members === 1 ? '' : 's'}`] : []),
      ...(g.verseCount > 0 ? [`${g.verseCount} verse${g.verseCount === 1 ? '' : 's'}`] : []),
    ];
    const sub = paren ?? (facts.length > 0 ? facts.join(' · ') : 'no members or verses');
    drafts.push({
      t: 'g',
      id: g.slug,
      name: bare,
      norm: normalizeName(bare),
      ...(paren !== undefined ? { title: g.name } : {}),
      curated: [
        ...(paren !== undefined ? [[g.name, 'title'] as [string, string]] : []),
        ...twin(bare),
      ],
      vc: g.verseCount,
      ...(g.firstVerse !== undefined ? { order: g.firstVerse } : {}),
      sub,
    });
  }

  for (const e of n.events) {
    const y = /^(-?\d+)/.exec(e.startDate);
    const when = y ? formatYear(Number.parseInt(y[1]!, 10)) : undefined;
    const count =
      e.verseCount > 0 ? `${e.verseCount} verse${e.verseCount === 1 ? '' : 's'}` : 'no verses';
    drafts.push({
      t: 'e',
      id: e.slug,
      name: e.name,
      norm: normalizeName(e.name),
      curated: twin(e.name),
      vc: e.verseCount,
      ...(e.firstVerse !== undefined ? { order: e.firstVerse } : {}),
      sub: when !== undefined ? `${when} · ${count}` : count,
    });
  }

  for (const b of n.books) {
    drafts.push({
      t: 'b',
      id: b.osis,
      name: b.name,
      norm: normalizeName(b.name),
      curated: [[b.short, 'short']],
      vc: b.verseCount,
      order: b.order,
      sub: `${b.division} · ${b.chapterCount} chapter${b.chapterCount === 1 ? '' : 's'}`,
    });
  }

  // --- weights ----------------------------------------------------------
  const primaryCount = new Map<string, number>();
  for (const d of drafts) primaryCount.set(d.norm, (primaryCount.get(d.norm) ?? 0) + 1);

  const stats: EntityIndexStats = {
    links: mined.links,
    unresolved: mined.unresolved,
    minedAliases: 0,
    curatedAliases: 0,
    droppedZeroShare: 0,
    collided: 0,
    rows: drafts.length,
  };

  const share = (label: string, slug: Slug | undefined): number | undefined => {
    const per = mined.counts.get(label);
    if (!per) return undefined; // never linked under this label
    let sigma = 0;
    for (const k of per.values()) sigma += k;
    return slug === undefined ? 0 : (per.get(slug) ?? 0) / sigma;
  };

  const rows: EntityIndexRow[] = drafts.map((d) => {
    const own = new Set(nameTokens(d.norm));
    const byNorm = new Map<string, { w: number; sources: string[] }>();

    // Curated candidates: whole strings, plus each title token that is not
    // part of the name itself.
    const candidates: [string, string][] = [];
    for (const [raw, source] of d.curated) {
      if (source === 'title') {
        for (const t of nameTokens(normalizeName(raw))) {
          if (t.length >= 2 && !own.has(t) && !NAME_STOPWORDS.has(t)) candidates.push([t, source]);
        }
      } else {
        candidates.push([normalizeName(raw), source]);
      }
    }
    for (const [norm, source] of candidates) {
      if (norm === '' || norm === d.norm) continue;
      const single = !norm.includes(' ');
      const collides = primaryCount.has(norm) || (single && (df.get(norm) ?? 0) > COMMON_DF);
      let w = 1;
      if (collides) {
        stats.collided++;
        w = share(norm, d.slug) ?? COLLISION_DEFAULT;
        if (w === 0) {
          stats.droppedZeroShare++;
          continue;
        }
      }
      const prev = byNorm.get(norm);
      if (prev) {
        if (!prev.sources.includes(source)) prev.sources.push(source);
        prev.w = Math.max(prev.w, w);
      } else {
        byNorm.set(norm, { w, sources: [source] });
        stats.curatedAliases++;
      }
    }

    // Mined labels for this slug.
    if (d.slug !== undefined) {
      for (const [label, per] of mined.counts) {
        const k = per.get(d.slug);
        if (k === undefined || label === d.norm) continue;
        const prev = byNorm.get(label);
        if (k < MINED_MIN_COUNT && !prev) continue;
        const w = share(label, d.slug)!;
        stats.minedAliases++;
        if (prev) {
          if (!prev.sources.includes('mined')) prev.sources.push('mined');
          // A colliding curated alias already carries the share; a
          // non-colliding one keeps its curated 1.
        } else {
          byNorm.set(label, { w, sources: ['mined'] });
        }
      }
    }

    const aliases: IndexAlias[] = [...byNorm.entries()]
      .map(([norm, { w, sources }]): IndexAlias => [norm, round(w), sources.join('+')])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

    const row: EntityIndexRow = {
      t: d.t,
      id: d.id,
      name: d.name,
      norm: d.norm,
      ...(d.title !== undefined ? { title: d.title } : {}),
      aliases,
      vc: d.vc,
      ...(d.order !== undefined ? { order: d.order } : {}),
      sub: d.sub,
      dupCount: primaryCount.get(d.norm)!,
      ...(d.ft !== undefined ? { ft: d.ft } : {}),
    };
    return row;
  });

  // --- sorted names -------------------------------------------------------
  const names: [string, number, number][] = [];
  rows.forEach((r, i) => {
    names.push([r.norm, i, -1]);
    r.aliases.forEach(([a], j) => names.push([a, i, j]));
  });
  names.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1] || a[2] - b[2]));

  const maxVc = rows.reduce((m, r) => (r.vc > m ? r.vc : m), 0);
  return { file: { format: 1, maxVc, rows, names }, stats };
}

export function buildEntityIndex(n: Normalized): EntityIndexFile {
  return buildEntityIndexDetailed(n).file;
}

/** Four decimals is plenty for a 0.30·w term and keeps the JSON short. */
function round(w: number): number {
  return Math.round(w * 10000) / 10000;
}
