/**
 * `createEngine(source, opts)` — the one search engine, hosted anywhere
 * (docs/search-design.md §"Public API"). Three layers:
 *
 *   core   books.json + entities.index.json → references, entities, suggest
 *   text   verses.idx + verses.txt          → verse text search, versesFor
 *   graph  graph.bin                        → mention hops, co-mentions,
 *                                             events by participants ∩ locations
 *
 * `core` is loaded by `createEngine`; the others load eagerly by default or
 * on `preload()` when the host stages them (a browser wants the ~150 KB
 * core layer first and the ~2 MB text layer behind it). A query that needs
 * a layer that is not there returns `ready.<group> = false` for that group
 * and no hits from it — never a throw, never a zero pretending to be a
 * count (invariant 6).
 *
 * `openEngine(files)` is the synchronous core: hand it bytes already in
 * memory (tests, a browser fallback build) and it is ready at once.
 * `searchSync` is a pure function of (query, options, index bytes);
 * `search` is the same plus an optional `rewriter` that may author the plan.
 */
import { loadEntityIndex, type EntityIndex } from './entities/entityIndex.js';
import type { EntityIndexFile } from './entities/types.js';
import { openGraph, type Graph } from './graph/adjacency.js';
import type { IndexSource } from './io/IndexSource.js';
import { classify, type ClassifyContext } from './query/classify.js';
import { executePlan, type ExecuteContext } from './query/plan.js';
import type {
  QueryPlan,
  SearchOptions,
  SearchResult,
  Suggestion,
  SuggestOptions,
} from './query/types.js';
import { buildBookAliasTable, type BookAliasTable } from './refs/bookAliases.js';
import { parseReference } from './refs/parseReference.js';
import type { ParseReferenceResult, Ref } from './refs/types.js';
import { suggest as runSuggest, type SuggestContext } from './suggest/suggest.js';
import { openTextIndex, type TextIndex } from './text/index.js';
import type { Book, BooksBundle, Manifest, VerseId } from './types.js';

export type Layer = 'core' | 'text' | 'graph';

export interface EngineOptions {
  /** Layers to load before `createEngine` resolves. Default: all three. */
  layers?: Layer[];
}

export interface EngineStatus {
  layers: Record<Layer, 'absent' | 'loading' | 'ready' | 'failed'>;
  /** From `manifest.json` when the source has one. */
  manifest?: Pick<Manifest, 'format' | 'source' | 'counts'>;
  source?: string;
  counts: { books: number; entities: number; verses?: number; graphNodes?: number };
}

export interface SearchEngine {
  search(q: string, opts?: SearchOptions): Promise<SearchResult>;
  searchSync(q: string, opts?: SearchOptions): SearchResult;
  suggest(prefix: string, opts?: SuggestOptions): Suggestion[];
  parseReference(q: string): ParseReferenceResult;
  /** Verse text for a reference from the text layer; throws if it is not loaded. */
  versesFor(ref: Ref): { id: VerseId; text: string }[];
  /** Verse ids linking an entity, canonical order; throws if the graph layer is not loaded. */
  mentions(entityId: string): VerseId[];
  status(): EngineStatus;
  /** Load a layer from the source; resolves at once if it is already there. */
  preload(layer: Layer): Promise<void>;
  /** The plan the rule classifier would execute, without executing it. */
  plan(q: string, opts?: SearchOptions): QueryPlan;
}

/** Bytes already in memory. `text` and `graph` may be added later through `preload`. */
export interface EngineFiles {
  books: BooksBundle;
  entities: EntityIndexFile;
  manifest?: Manifest;
  text?: { idx: Uint8Array; txt: Uint8Array };
  graph?: Uint8Array;
}

const decoder = new TextDecoder('utf-8');

function json<T>(bytes: Uint8Array): T {
  return JSON.parse(decoder.decode(bytes)) as T;
}

/**
 * Open an engine over files already in memory. Synchronous. Without a
 * `source`, `preload` of a missing layer rejects.
 */
export function openEngine(files: EngineFiles, source?: IndexSource): SearchEngine {
  const state: EngineStatus['layers'] = { core: 'ready', text: 'absent', graph: 'absent' };
  const books: Book[] = files.books.books;
  const table: BookAliasTable = buildBookAliasTable(books);
  const entities: EntityIndex = loadEntityIndex(files.entities);
  const manifest = files.manifest
    ? {
        format: files.manifest.format,
        source: files.manifest.source,
        counts: files.manifest.counts,
      }
    : undefined;
  let text: TextIndex | undefined;
  let graph: Graph | undefined;
  if (files.text) {
    text = openTextIndex(files.text.idx, files.text.txt);
    state.text = 'ready';
  }
  if (files.graph) {
    graph = openGraph(files.graph);
    state.graph = 'ready';
  }
  const pending = new Map<Layer, Promise<void>>();

  const preload = (layer: Layer): Promise<void> => {
    if (state[layer] === 'ready') return Promise.resolve();
    const have = pending.get(layer);
    if (have) return have;
    if (!source) return Promise.reject(new Error(`preload(${layer}): engine has no source`));
    state[layer] = 'loading';
    const p = (async () => {
      if (layer === 'text') {
        const [idx, txt] = await Promise.all([
          source.read('verses.idx'),
          source.read('verses.txt'),
        ]);
        text = openTextIndex(idx, txt);
      } else if (layer === 'graph') {
        graph = openGraph(await source.read('graph.bin'));
      }
    })().then(
      () => {
        state[layer] = 'ready';
        pending.delete(layer);
      },
      (err: unknown) => {
        state[layer] = 'failed';
        pending.delete(layer);
        throw err;
      },
    );
    pending.set(layer, p);
    return p;
  };

  const classifyContext: ClassifyContext = { table, entities, books };
  const executeContext = (): ExecuteContext => ({
    table,
    entities,
    books,
    ...(text ? { text } : {}),
    ...(graph ? { graph } : {}),
  });

  const searchSync = (q: string, o: SearchOptions = {}): SearchResult => {
    const { plan, cache } = classify(q, classifyContext, o);
    return executePlan(plan, executeContext(), o, cache);
  };

  const search = async (q: string, o: SearchOptions = {}): Promise<SearchResult> => {
    if (!o.rewriter) return searchSync(q, o);
    const { plan, cache } = classify(q, classifyContext, o);
    const rewritten = await o.rewriter(q, { plan });
    if (typeof rewritten === 'string') {
      const r = searchSync(rewritten, o);
      r.plan = {
        ...r.plan,
        why: [`plan: rewriter rewrote "${q}" → "${rewritten}"`, ...r.plan.why],
      };
      return r;
    }
    const authored: QueryPlan = {
      ...rewritten,
      author: 'rewriter',
      why: ['plan: rewriter', ...rewritten.why],
    };
    return executePlan(authored, executeContext(), o, cache);
  };

  const suggestContext: SuggestContext = { table, entities, books };

  return {
    search,
    searchSync,
    plan: (q, o = {}) => classify(q, classifyContext, o).plan,
    suggest: (prefix, o = {}) => runSuggest(prefix, suggestContext, o),
    parseReference: (q) => parseReference(q, table),
    versesFor: (ref) => {
      if (!text) throw new Error('versesFor: text layer not loaded (preload("text"))');
      const out: { id: VerseId; text: string }[] = [];
      let doc = text.docIndexOf(ref.verseIdStart);
      if (doc < 0) {
        // Only a hand-built ref can start on a missing id; walk to the range.
        doc = 0;
        while (doc < text.docCount && text.verseIdAt(doc) < ref.verseIdStart) doc++;
      }
      for (; doc < text.docCount; doc++) {
        const id = text.verseIdAt(doc);
        if (id > ref.verseIdEnd) break;
        out.push({ id, text: text.textAt(doc) });
      }
      return out;
    },
    mentions: (id) => {
      if (!graph) throw new Error('mentions: graph layer not loaded (preload("graph"))');
      return graph.mentions(id);
    },
    status: () => ({
      layers: { ...state },
      ...(manifest ? { manifest } : {}),
      ...(source?.description ? { source: source.description } : {}),
      counts: {
        books: books.length,
        entities: entities.rows.length,
        ...(text ? { verses: text.docCount } : {}),
        ...(graph ? { graphNodes: graph.nodeCount } : {}),
      },
    }),
    preload,
  };
}

export async function createEngine(
  source: IndexSource,
  opts: EngineOptions = {},
): Promise<SearchEngine> {
  const wanted = new Set<Layer>(opts.layers ?? ['core', 'text', 'graph']);
  const [b, e] = await Promise.all([source.read('books.json'), source.read('entities.index.json')]);
  const files: EngineFiles = {
    books: json<BooksBundle>(b),
    entities: json<EntityIndexFile>(e),
  };
  try {
    files.manifest = json<Manifest>(await source.read('manifest.json'));
  } catch {
    // A source without a manifest is fine; status() just has no counts from it.
  }
  const engine = openEngine(files, source);
  await Promise.all(
    [...wanted].filter((l): l is 'text' | 'graph' => l !== 'core').map((l) => engine.preload(l)),
  );
  return engine;
}
