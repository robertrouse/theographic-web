# @theographic/core

The Theographic search engine and data model, in pure TypeScript. One
engine runs identically in a Web Worker, Node, the CLI, a Capacitor shell
and (later) an MCP server; the golden tests only mean something because it
is one engine. The spec is [`docs/search-design.md`](../../docs/search-design.md).

```ts
import { createEngine } from '@theographic/core';
import { fsSource } from '@theographic/core/node'; // Node only

const engine = await createEngine(fsSource('apps/web/public/data'));
const r = engine.searchSync('Paul Antioch');
r.all[0]; // { group: 'events', id: 'disciples_first_called_christians_332', score: 0.9, why: [...] }
```

## Layers

| layer   | files                            | gz      | answers                                                     |
| ------- | -------------------------------- | ------- | ----------------------------------------------------------- |
| `core`  | `books.json`, `entities.index.json` | ~156 KB | references, entities (people, places, events, groups, books), `suggest` |
| `text`  | `verses.idx`, `verses.txt`       | ~2.2 MB | verse text search, `versesFor`                              |
| `graph` | `graph.bin`                      | ~85 KB  | mention hops, co-mentions, events by participants ∩ locations |

`createEngine(source)` loads all three by default. A browser host that
wants a first search inside a second passes `{ layers: ['core'] }` and calls
`preload('text')` / `preload('graph')` on idle; a query that needs a layer
that is not there returns `ready.<group> = false` and no hits from that
group — never a throw, never an empty group pretending to be a real zero.
`status()` reports every layer as `absent | loading | ready | failed`.

## Loading

**In a worker (browser).** Implement `IndexSource` over `fetch` (plus the
Cache API if you want offline) and hand it to `createEngine`; the engine
never touches the DOM or Node. CP-07 adds the worker protocol.

```ts
import { createEngine, type IndexSource } from '@theographic/core';
const source: IndexSource = {
  read: async (path) => new Uint8Array(await (await fetch(`/data/${path}`)).arrayBuffer()),
};
const engine = await createEngine(source, { layers: ['core'] });
void engine.preload('text');
```

**In Node.** `@theographic/core/node` adds `fsSource(dir)`. It is a separate
entry point compiled with its own tsconfig (`node/tsconfig.json`, `types:
["node"]`) so the browser entry keeps `types: []` and cannot pick up a Node
import by accident (invariant 1 in `CLAUDE.md`).

**From bytes you already have.** `openEngine({ books, entities, text?,
graph? })` is synchronous — the tests and a browser fallback build use it.

## Public API

```ts
interface SearchEngine {
  search(q, opts?): Promise<SearchResult>;   // searchSync + optional rewriter
  searchSync(q, opts?): SearchResult;        // pure: (query, opts, index bytes)
  suggest(prefix, { limit?, recent? }): Suggestion[];  // sync, core layer only
  parseReference(q): ParseReferenceResult;
  versesFor(ref): { id, text }[];            // text layer; throws if not loaded
  mentions(entityId): VerseId[];             // graph layer; throws if not loaded
  plan(q, opts?): QueryPlan;                 // the classifier's plan, unexecuted
  status(): EngineStatus;
  preload(layer: 'core' | 'text' | 'graph'): Promise<void>;
}

interface SearchOptions {
  groups?: Group[];               // restrict; default all but topics
  limitPerGroup?: number;         // default 10
  scope?: { books?, testament?, division? };
  sort?: 'relevance' | 'canonical';
  fuzzy?: boolean;                // default true
  explain?: boolean;              // default true: every hit carries why[]
  signals?: RankSignal[];         // blended into verse scores, λ = 0.3
  rewriter?: QueryRewriter;       // search() only
}

interface SearchResult {
  query; plan: QueryPlan;         // plan.why: one line per classification step
  groups: Record<Group, { total; hits: Hit[] }>;
  all: Hit[];                     // every returned hit, cross-group order
  timings: Record<string, number>;
  ready: Record<Group, boolean>;
}

interface Hit { group; id; score /* 0..1 */; raw; label; sublabel?; snippet?; ref?; why?: string[] }
```

`Group` is `passages | verses | people | places | events | groups | topics`
(`topics` is a seam: always empty, `ready.topics = false`).

### Query grammar

```
query  ::= clause (';' clause)*
item   ::= filter | "quoted phrase" | reference | word
filter ::= (in|book|person|place|event|group|type|mentions|sort) ':' value
```

Sugar: a trailing `in <book|ot|nt|division>` is `in:`; `verses mentioning X`
is `mentions:X`. The classifier runs filters → references (longest match,
validated; out of range is an error and the words stay) → entity n-grams
3/2/1 (fuzzy only for unigrams of ≥ 4 chars; a span with only fuzzy/prefix/
token evidence is *weak*: its hits are kept but its words stay in the text
query and it never hops) → text terms → group activation. `plan.why` lists
each decision.

### Ranking

Every formula lives in one place: entity tiers in `entities/match.ts`
(`ENTITY_TIERS`), BM25 in `text/bm25.ts` (`BM25`), the cross-group
normalization in `query/merge.ts` (`MERGE`). The doc paragraph
"Ranking formulas › Cross-group" in the design spec is the source of
truth; change it, then the code, then the goldens.

In short: references are pinned first; entities score `min(1, raw)` times a
coverage factor when the span covers only part of the clause; verses take
the best band they earned — co-mention 0.90, mention+text 0.90·q, text
0.80·(score/top)·q, mention-only 0.70 — and events reached through the
graph score 0.90. Ties break by group order → canonical position → id.

## Determinism contract

`searchSync` is a pure function of (query, options, index bytes). No clock,
no randomness, no dependence on load order; two engines over the same bytes
return byte-identical results (`timings` excepted), and the CLI's `all[]`
equals an in-process search for every golden query — `test/engine.test.ts`
checks both. `RankSignal`s must be deterministic too; the engine blends
them but cannot make an unstable one stable.

## CLI

```bash
npm run build -w @theographic/core
npx theographic search "Paul Antioch" [--json] [--debug] [--limit 5] [--data <dir>]
npx theographic suggest "jerus"
npx theographic plan "love in John"
npx theographic status
```

`--debug` prints the plan and every hit's `why`; `--json` prints the whole
`SearchResult`. The data directory defaults to `apps/web/public/data`
(`THEOGRAPHIC_DATA_DIR` overrides).

## Extension seams

- **`RankSignal { name, layer: 'verses', score(candidates, ctx) }`** — scored
  0..1 per candidate, combined as `(1 − λ)·lex + λ·signal` with λ = 0.3 on
  verses only. A no-op signal leaves order and scores unchanged (tested).
- **`QueryRewriter: (q, { plan }) => Promise<QueryPlan | string>`** — an LLM
  may author the same `QueryPlan` the rule classifier produces, or hand back
  a rewritten string; `plan.ts` executes either and `why` starts with
  `plan: rewriter`.

## Adding a golden

`test/golden/queries.jsonl`, one line per query:

```json
{"n":49,"q":"Elijah Carmel","expect":{"inTop":[{"group":"verses","ids":[11018019],"why":"co-mention"}],"nonEmpty":["events"]},"note":"1 Kings 18 on Carmel"}
```

Expectation kinds and their owners are in `test/golden/runner.ts`
(`KIND_OWNER`); the entity kinds run in `runner.ts`, text kinds in
`text.ts`, cross-group kinds in `engine.ts`. Run
`THEOGRAPHIC_REQUIRE_DATA=1 npx vitest run --project core test/golden.test.ts`.
If the data or the formula disagrees with the line, do not bend the formula:
add `"pendingReview": {"<kind>": "<what you measured>"}` to the line and
record the numbers in the checkpoint file. The runner skips a pending
expectation while it fails and **fails the moment it passes**, so the flag
cannot go stale.

## Layout

```
src/
  refs/       book aliases, reference scanner, verse-id ranges
  entities/   entity index, tiers, disambiguation
  text/       tokenizer, binary index build + reader, BM25, expansion, snippets
  graph/      graph.bin format, build, DataView reader (hops)
  query/      grammar, classify (→ QueryPlan), plan (execute), merge (normalize), scope
  suggest/    typeahead
  io/         IndexSource + memorySource
  engine.ts   openEngine / createEngine
node/         fsSource — the @theographic/core/node entry
bin/          theographic CLI
test/golden/  queries.jsonl and the three runners
```
