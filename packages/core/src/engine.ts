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
 * `searchSync` is a pure function of (query, options, index bytes); `search`
 * is the same plus an optional `rewriter` that may author the plan.
 */
import { loadEntityIndex, type EntityIndex } from './entities/entityIndex.js';
import type { EntityIndexFile } from './entities/types.js';
import { openGraph, type Graph } from './graph/adjacency.js';
import type { IndexSource } from './io/IndexSource.js';
import { classify, type ClassifyContext } from './query/classify.js';
import { executePlan } from './query/plan.js';
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
  preload(layer: Layer): Promise<void>;
  /** The plan the rule classifier would execute, without executing it. */
  plan(q: string, opts?: SearchOptions): QueryPlan;
}

const decoder = new TextDecoder('utf-8');

function json<T>(bytes: Uint8Array): T {
  return JSON.parse(decoder.decode(bytes)) as T;
}

export async function createEngine(
  source: IndexSource,
  opts: EngineOptions = {},
): Promise<SearchEngine> {
  const wanted = new Set<Layer>(opts.layers ?? ['core', 'text', 'graph']);
  wanted.add('core');
  const state: EngineStatus['layers'] = { core: 'absent', text: 'absent', graph: 'absent' };

  let books: Book[] = [];
  let table: BookAliasTable | undefined;
  let entities: EntityIndex | undefined;
  let text: TextIndex | undefined;
  let graph: Graph | undefined;
  let manifest: EngineStatus['manifest'];
  const pending = new Map<Layer, Promise<void>>();

  const load = (layer: Layer): Promise<void> => {
    if (state[layer] === 'ready') return Promise.resolve();
    const have = pending.get(layer);
    if (have) return have;
    state[layer] = 'loading';
    const p = (async () => {
      switch (layer) {
        case 'core': {
          const [b, e] = await Promise.all([
            source.read('books.json'),
            source.read('entities.index.json'),
          ]);
          books = json<BooksBundle>(b).books;
          entities = loadEntityIndex(json<EntityIndexFile>(e));
          table = buildBookAliasTable(books);
          try {
            const m = json<Manifest>(await source.read('manifest.json'));
            manifest = { format: m.format, source: m.source, counts: m.counts };
          } catch {
            manifest = undefined;
          }
          break;
        }
        case 'text': {
          const [idx, txt] = await Promise.all([
            source.read('verses.idx'),
            source.read('verses.txt'),
          ]);
          text = openTextIndex(idx, txt);
          break;
        }
        case 'graph': {
          graph = openGraph(await source.read('graph.bin'));
          break;
        }
        default:
          break;
      }
    })();
    pending.set(layer, p);
    return p.then(
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
  };

  await load('core');
  await Promise.all([...wanted].filter((l) => l !== 'core').map(load));

  const classifyContext = (): ClassifyContext => ({ table: table!, entities: entities!, books });
  const executeContext = () => ({
    table: table!,
    entities: entities!,
    books,
    ...(text ? { text } : {}),
    ...(graph ? { graph } : {}),
  });

  const searchSync = (q: string, o: SearchOptions = {}): SearchResult => {
    const { plan, cache } = classify(q, classifyContext(), o);
    return executePlan(plan, executeContext(), o, cache);
  };

  const search = async (q: string, o: SearchOptions = {}): Promise<SearchResult> => {
    if (!o.rewriter) return searchSync(q, o);
    const { plan, cache } = classify(q, classifyContext(), o);
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

  const suggestContext = (): SuggestContext => ({ table: table!, entities: entities!, books });

  return {
    search,
    searchSync,
    plan: (q, o = {}) => classify(q, classifyContext(), o).plan,
    suggest: (prefix, o = {}) => runSuggest(prefix, suggestContext(), o),
    parseReference: (q) => parseReference(q, table!),
    versesFor: (ref) => {
      if (!text) throw new Error('versesFor: text layer not loaded (preload("text"))');
      const out: { id: VerseId; text: string }[] = [];
      let doc = text.docIndexOf(ref.verseIdStart);
      if (doc < 0) {
        // The first verse may be absent only if the ref is hand-built; walk to the range.
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
      ...(source.description ? { source: source.description } : {}),
      counts: {
        books: books.length,
        entities: entities?.rows.length ?? 0,
        ...(text ? { verses: text.docCount } : {}),
        ...(graph ? { graphNodes: graph.nodeCount } : {}),
      },
    }),
    preload: load,
  };
}
