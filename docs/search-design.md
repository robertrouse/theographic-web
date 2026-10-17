# Search engine design

The specification for `packages/core`. Checkpoints CP-02..CP-05 implement it;
the golden set at the bottom is their acceptance test. Change the formulas here
first, then the code, then the goldens — never the goldens alone.

Measured from the real JSON: 31,102 verses, 791k tokens, **12,760 unique terms**,
616,216 (term, verse) postings; verse length p50 = 24 tokens, min 2 ("Jesus
wept."); 4,857 primary entity names + ~4,100 alias strings. 40,690 `richText`
links → 4,281 entities; 979 link labels differ from the primary name (lord→God
×6,971, jacob→Israel ×356, simon→Peter ×45, saul→Paul ×25, abram→Abraham ×54).

Additional data facts the implementation must respect:

- `verseText` ≠ `richText` edition: `verseText` has "Bethel" and the 22 Ps 119
  acrostic headers ("NUN. Thy word…"); `richText` has "Beth-el", italics, links.
  Index `verseText`; strip acrostic headers at tokenization; harvest hyphenated
  variants from `richText` labels as entity aliases.
- `Disambiguation (temp)` is **misaligned across rows** (john_1676 carries
  "John (son of Zebedee)"; judas_1757 carries Iscariot's text). Never use it for
  labels; low-weight searchable text only. Raise upstream.
- Curated `alsoCalled` collides with common words (Jesus: Lord, Son, King, Word,
  Light…) → aliases carry a weight, not trust. Exclusion list for junk
  (`mount_of_olives_828.aliases` is a comment).
- 34 books collide with person names (John ×4, Zechariah ×26, James ×3, Jude,
  Philemon, Ruth, Job, Joel ×14); "Mark" collides via surname/displayTitle.

### Decisions

| Decision         | Choice                                                                                                                                                                   | Why                                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verse index      | Prebuilt binary inverted index shipped as a static file                                                                                                                  | ~1.85 MB raw / ~1.0 MB brotli; zero cold-load CPU; byte-identical across web/Capacitor/CLI/MCP so goldens are deterministic. In-browser build kept only as dev/CLI fallback (same code path). |
| Positions        | None in postings; phrase/proximity by re-tokenizing top-300 candidates                                                                                                   | 300 × 25 tokens ≈ 1 ms; saves ~0.8 MB                                                                                                                                                         |
| Entity matching  | Brute force over ~9,000 strings, banded Damerau-Levenshtein; sorted array + binary search for prefix                                                                     | 1–3 ms on a mid phone; a trigram index would save ~2 ms for +200 KB                                                                                                                           |
| Archaic KJV      | Index surface forms; expand the _query_ (show→shew, has→hath, stem groups) with weights                                                                                  | Phrase matching stays literal; `why` explainable                                                                                                                                              |
| Cross-group rank | Score bands per match class, prominence blended within band, references pinned first                                                                                     | Fixes "exact must beat text" and "short verses over-ranked"                                                                                                                                   |
| Runtime          | Pure TS, `IndexSource` abstraction (fetch+Cache API / fs / Capacitor); web wraps it in a Worker                                                                          | One package for all hosts                                                                                                                                                                     |
| Readiness        | Core layer (~180 KB gz: engine + books + entity names) → refs/entities/suggest ready <1 s; text layer (~2.5 MB gz) streams behind with `ready.verses=false` until loaded | Meets the phone budget                                                                                                                                                                        |

### Module layout

```
core/src/
  types.ts  normalize.ts  tokenizer.ts        (tokenizer shared by build + query; build asserts round-trip)
  refs/      bookAliases.ts parseReference.ts verseIds.ts
  entities/  entityIndex.ts match.ts disambiguate.ts damerau.ts
  text/      index.ts (binary reader) bm25.ts expand.ts snippet.ts
  graph/     adjacency.ts (CSR, varint deltas)
  query/     grammar.ts classify.ts plan.ts merge.ts
  suggest/   suggest.ts
  engine.ts  createEngine(source, opts)
io/  IndexSource.ts fetchSource.ts fsSource.ts capacitorSource.ts
worker/ protocol.ts worker.ts client.ts   (host-only; core never imports it)
```

### Public API

```ts
type Group = 'passages'|'verses'|'people'|'places'|'events'|'groups'|'topics'; // topics: seam only in v1
interface Ref { bookOsis; chapterStart; verseStart?; chapterEnd; verseEnd?; verseIdStart; verseIdEnd;
  kind:'book'|'chapter'|'chapterRange'|'verse'|'verseRange'|'verseList'; matchedText; confidence;
  ambiguousWith?: {type:'person'|'place'; id}[] }
parseReference(input, table): { refs: Ref[]; consumed: [number,number][]; errors: {span, reason}[] }
interface SearchOptions { groups?; limitPerGroup?=10; scope?: {books?, testament?, division?};
  sort?:'relevance'|'canonical'; fuzzy?=true; explain?; signals?: RankSignal[]; abort? }
interface Hit { group; id; score/*0..1*/; raw; label; sublabel?; snippet?:{text, highlights:[s,e][]}; ref?; why?: string[] }
interface SearchResult { query; plan: QueryPlan; groups: Record<Group,{total; hits}>; all: Hit[];
  timings; ready: Record<Group, boolean> }
interface SearchEngine { search(q, opts): Promise<SearchResult>; searchSync(q, opts); suggest(prefix, {limit, recent});
  parseReference(q); versesFor(ref); mentions(entityId); status(); preload(layer) }
createEngine(source: IndexSource, opts?): Promise<SearchEngine>
```

Determinism contract: `searchSync` is a pure function of (query, opts, index
bytes); no Date/random; ties break by group order → verseID → id.

### Build outputs (`packages/data`)

| Step        | Output                                                                                                                                                                                                        | Est. size           | Layer |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----- |
| 01-books    | books + alias table (osis, name, short, order, versesPerChapter[])                                                                                                                                            | ~7 KB gz            | core  |
| 02-entities | `entities.index.json` rows `{t, id, name, norm, title?, aliases:[[norm, w, source]], vc, order?, sub, dupCount, ft?}` + `names` sorted `[string, row, alias]`                                                | 152 KB gz (measured; 119 without `names`) | core  |
| 03-verses   | `verses.txt` (UTF-8 blob + Uint32 offsets + verseID array) + `verses.idx` (`TGIX` header; front-coded termDict; termMeta df/offset; varint gap+tf postings; Uint8 docLen; stemGroups; fuzzy-candidate bitset) | 1.5 MB + ~1.0 MB gz | text  |
| 04-graph    | `graph.bin` CSR: entity→verseIDs, event→verseIDs, event→participants/locations                                                                                                                                | ~70 KB gz (measured 85)           | graph |
| 05-manifest | `{version, files, hashes, counts, avgDocLen}`                                                                                                                                                                 | 1 KB                | core  |

Alias mining: for each `[label](/person|place/slug)` in `richText`, normalize
(strip possessive, `_`/`*`), count per (slug,label); keep count ≥ 2 or present in
`alsoCalled`; `w = count(label→slug)/Σcount(label→any)`. Curated aliases
(`alsoCalled`/`aliases`, `surname`, `esvName`, each title token that is not
the name itself or a function word, the un-hyphenated twin of a hyphenated
name, a book's short name) get `w=1` unless they equal another entity's
primary name or are a single word with df>200 (then link share, or 0.25 when
the label is never linked). A curated alias whose link share is 0 is dropped
— the text uses that name only for other entities ("Zebedee" on James). Every
name and alias is normalized by `core/entities/normalizeName` (NFKC, lower,
emphasis and possessive stripped, punctuation → space) so build and query
agree byte for byte. Precompute `sub` (disambiguation sublabel) and
`dupCount` per name (across all row types) at build. Measured on cfb1c48:
4,880 rows (3,067 p · 1,274 l · 23 g · 450 e · 66 b), 2,158 with a duplicate
name; 1,090 aliases (199 mined only, 450 curated+mined, 441 curated only;
354 curated collisions of which 144 dropped at share 0); 40,690 links, 3 of
whose target slugs resolve to nothing
(`daughter_of_lot_-_younger_984` ×8, `daughter_of_lot_-_older_985` ×4,
`timna_2859` ×2).

Tokenizer: NFKC → lowercase → `’`→`'` → strip possessive → split `[^a-z0-9'-]+`
→ keep hyphens (emit un-hyphenated twin for entity names only) → drop Ps 119
acrostic headers → no stopword removal in the index.

### Query grammar

```
query ::= clause (';' clause)*      clause ::= item+
item  ::= filter | quoted | reference | word
filter::= ('in'|'book'|'person'|'place'|'event'|'group'|'type'|'mentions'|'sort') ':' value
reference ::= ordinal? bookAlias (chapter (':' verses)? ('-' chapterEnd)?)?
verses ::= verse ('-' (chapter ':')? verse)? (',' verse)*
```

Sugar: trailing "in <book>" → `in:`; "verses mentioning X" → `mentions:X`.
Classifier order (each step records `why`): filters → references (longest match,
validated against chapter/verse counts, out-of-range → error + not consumed) →
entity n-grams (3,2,1; fuzzy only unigrams ≥4 chars; fuzzy-only spans flagged
`weak` and their words stay in the text query) → text terms → group activation.
Bare book that is also an entity name emits both (Ref confidence 0.7 with
`ambiguousWith`, plus entity span); with chapter/verse present the entity
reading is dropped. Single-chapter books: "Phm 4" → verse 4.

Book alias table: one line per book `Osis|alias|alias…` from books.json +
curated (`refs/aliases.json`: jn/jhn/jno, mt/matt, mk, lk, ps/psa/pss, prv,
eccl/qoh, song/sos/cant/canticles, phlm/phm/philem, jas, jud→Jude, jdg/judg→Judges,
rev/re/apoc, roman/ordinal-word prefixes). Build fails on duplicate aliases.

### Ranking formulas

Entity: tiers exact 1.00 · aliasExact(w≥.5) 0.95 · multiToken 0.85 · prefix
0.80+0.10·len ratio · token 0.75 · aliasWeak 0.55+0.30·w · fuzzy1 0.60 · fuzzy2
0.45; `s = band + 0.09·prom − 0.01·min(Δlen,5)/5`, `prom = ln(1+vc)/ln(1+8587)`.
Fuzzy only when exact/prefix yield <3 hits or single-word query; DL ≤1 for
len<6 else ≤2; length-banded with early exit. `strictTiers` option for pure
lexicographic tier order.

Tier definitions (`core/entities/match.ts`, `ENTITY_TIERS`; a row keeps its
highest band): _exact_ query = `norm` · _aliasExact_ query = alias with w ≥ 0.5
· _multiToken_ ≥ 2 query tokens, every one a token of the name, the title or
a strong alias · _prefix_ query is a proper prefix of the name or a strong
alias, ratio = |query|/|matched| · _token_ a query token (≥ 2 chars, not a
function word) equals a name token, where either side is multi-word ·
_aliasWeak_ query = alias with w < 0.5 · _fuzzy_ whole query within DL of the
name or a strong alias, tried only on rows no lexical tier hit, never for
queries under 3 chars; "single-word" is read literally, so a single word is
always typo-checked and a multi-word query only when the lexical tiers found
fewer than 3 rows. Δlen is measured against the matched string. `raw` is the
unclamped value (ranks entities among themselves; 1.019 beats 1.011);
`score = min(1, raw)` is what merge sees. Ties: group order → first verse → id.

Verse text: expansions per query word — exact 1.0, archaic map 0.9, stem group
0.7, fuzzy 0.6/0.4 (only if not in dictionary or df<3, len≥4, over the 6,610
candidate terms, top-5 by df). Candidates from postings of words with
df ≤ 0.5·N (weak words score but don't generate; if all weak, use rarest).

```
idf  = ln(1 + (N−df+0.5)/(df+0.5))          N=31102
tfn  = tf(k1+1) / (tf + k1(1−b+b·L'/avgL))   k1=1.2 b=0.4 L'=max(L,8) avgL=25.45
bm25 = Σ_w wt·idf·tfn ;  cov = matched non-weak words / non-weak words
base = bm25·cov^1.5 ; phrase = +0.5·base if full phrase contiguous ; prox = 0.25·base/(1+minSpan−m)
score = base + phrase + prox ; tie → verseID
```

`b=0.4` and `L'=max(L,8)` cap the short-verse advantage at ~18% (was 55% at
b=.75); `cov^1.5` makes a 1-of-3 match score 0.19× — the fix for the backlog
complaint. Snippet = full `verseText` with highlight offsets for every matched
variant (so `why` and highlight agree).

Points the formula leaves open, settled in CP-04 (`core/src/text/bm25.ts`,
`expand.ts`):

- `idf_w` is per _query word_, from the exact term's df, or the most common
  variant's df when the word is not in the dictionary. `wt` is the weight of
  the best-scoring variant in that verse (one variant per word). This is what
  makes "loveth/loved rank below equal-tf love" true by construction — with
  per-variant idf a rarer inflection would outrank the exact form.
- An archaic variant's stem group is reached at 0.9 × 0.7 = 0.63, so `show`
  and `shew` return the same set.
- Fuzzy fires only when the word is absent (or df < 3) **and** no archaic form
  matched; a resolved word never fuzzes.
- Phrase and proximity need ≥ 2 query words; `m` counts words the verse
  matched (weak ones included), `minSpan` is the smallest token window holding
  each of them. A query wrapped in double quotes keeps only phrase matches.
- Weak means df > 0.5·N on the word's idf df; a weak word's variants add to
  the score of existing candidates only.

Cross-group (All tab), normalized 0..1: passages 1.0 explicit / 0.9 bare / 0.85
bare-ambiguous, **pinned first**; entities `min(1, s)`; text verses
`0.80·(score/score_top)·q` (q = 1 if cov=1 ∧ phrase, 0.9 if cov=1, else
0.75·cov); co-mention verses 0.90; mention-hop-only verses 0.70 canonical.
Guarantees: reference first; exact entity (≥0.95) beats any text hit (≤0.80);
perfect phrase (0.80) beats prefix/fuzzy entities; fuzzy entity interleaves with
partial-coverage text by score. Stable sort by score → group order → canonical.

Points the paragraph leaves open, settled in CP-05 (`core/src/query/merge.ts`,
`MERGE`; measured against the goldens, not tuned to them):

- **Span coverage.** An entity read from part of a clause is a partial
  reading: its score is `min(1, s) · (0.55 + 0.45 · words/contentWords)`,
  where `contentWords` excludes filters and consumed references. At half
  coverage that is 0.775 — below a perfect-phrase verse (0.80), above a
  mention-only verse (0.70) — which is what puts John 11:35 ahead of Jesus
  for "Jesus wept" while "Paul" still leads with Paul (coverage 1).
- **Strong-span words stay in the text query** (weak-span words do too, as
  written above). The verse layer sees the whole clause, and a verse that is
  both linked to a span's entity and a full-coverage text hit earns the
  **mention+text** band `0.90·q`, ordered canonically within the band. That is
  the concordance reading — "Paul" answers with Acts 13:9, the first verse
  that calls him Paul, then every verse naming him in order — and it is what
  the golden's "Acts 13:9 via mention hop" needs: by hop alone (0.70,
  canonical) that verse is 19th behind the Saul verses. Bands, best wins:
  co-mention 0.90 (linked from ≥ 2 spans) · mention+text 0.90·q · text
  0.80·(score/top)·q · mention-only 0.70.
- **Events through the graph** (participants ∩ locations, only when the
  clause named both a person and a place) score 0.90, the same evidence
  class as a co-mention; title matches keep their entity score.
- **Passages are pinned by a flag**, not by score: an exact entity at 1.0
  never sorts above a bare-ambiguous book at 0.85. Within the pinned set,
  explicit > bare > ambiguous > alternative reading (its own confidence).
- A reference in a clause that also has words is a **scope** for that
  clause's verses as well as a passage ("Moses Exodus 3"); "… in <book>" is
  scope only. A bare ambiguous book ("John", "Ruth") is neither consumed nor
  a scope — its word is the clause's content.
- **A clause that is only a reference has no verse hits** (#18): the passage
  carries the reference; `versesFor` shows the text.
- Strong candidates per span that hop: 20. Weak spans never hop.

Graph hops: `mentions(X)` → verseIDs canonical; co-mention = sorted intersection
of each span's candidate entities' verse lists; events by participants ∩
locations; `in:` scope applied as a verseID-range predicate during postings
traversal. `graph.bin` measured on cfb1c48: 4,791 nodes (3,067 people ·
1,274 places · 450 events), **170 KB raw · 85 KB gz**, opens in ~1 ms.

Suggest: trigger at 2 chars; book aliases + partial-reference completions →
entity prefix range (binary search, ≤50 read) ranked tier→prom → recent (host
supplied, prefix ≥3) → fuzzy DL≤1 only if <3 results and prefix ≥4. Dedupe by
id, sublabels, limit 8, collapse duplicate-name people to 3. Never triggers
text search (host debounces submit 150 ms).

### Budgets

Core layer ~180 KB gz → first search ready ≈0.4–0.6 s on mid Android/4G; text
layer ~2.5 MB prefetched on idle. Warm: entity 1–3 ms, ref <0.5 ms, text 5–15
ms, merge <1 ms → <30 ms. Memory ≈10–12 MB. Golden runner reports p50/p95 and
fails a query >30 ms warm in CI.

### Golden set (`core/test/golden/queries.jsonl`)

Format `{"q", "expect": {refs?, topGroup?, top?, inTop?, absent?, why?}}`.
Acceptance list (implement as written; ids are the metadata slugs):
1 `John 3:16` → refs John.3.16 only; people empty · 2 `John 3` → John.3, no John
entity · 3 `John` → Book of John (bare) + people john_1676, john_1677, mark_1679
· 4 `1 John 3` → 1John.3 · 5 `I Sam 17`/`1Sa 17`/`1 Samuel 17` → 1Sam.17 · 6
`Jn 3:16-18` verseRange · 7 `Gen 1:1-2:3` ids 1001001–1002003 · 8 `Gen 1-3`
80 verses · 9 `Ruth` book + ruth_2450 · 10 `Ps 23:1,4` two refs · 11 `Ps 119:105`
snippet keeps "NUN." unhighlighted · 12 `Song 2:1`/`SoS 2:1`/`Cant 2:1` · 13
`Phm 1:4`/`Phlm 4`/`Philemon 4` → Phlm.1.4 · 14 `Philemon` book + philemon_2342
· 15 `Jude` book; jude_1756 first; Judas via fuzzy <0.7 · 16 `Mark` book +
mark_1679 · 17 `James` book + 3 James with distinct sublabels · 18 `Acts 13` no
text hits · 19 `Prov 25:2` · 20 `John 99` → chapterOutOfRange error, people
still returned · 21 `Jesus wept` → John.11.35 first, verses group above people
· 22 `in the beginning` → top-2 ⊆ {Gen.1.1, John.1.1} with phrase in why · 23
`"search the scriptures"` → John.5.39 · 24 `shew` = 218 verses; `show` same
set via archaic map · 25 `love` ≥280; "loveth/loved" rank below equal-tf "love"
· 26 `love in John` → in:[John], all verse ids 43xxxxxx · 27 `love 1 John` scoped
1John · 28 `in:nt Jerusalem` → jerusalem_636; NT only · 29 `Jerusalm` → fuzzy1
jerusalem_636 · 30 `Nebuchadnezar` → highest-vc Nebuchadnezzar; Dan.1.1;
expansion includes nebuchadrezzar · 31 `Saul` → saul_2478 first, paul_2479
top-3 with alias why · 32 `Paul` → paul_2479; Acts.13.9 via mention hop · 33
`Antioch` → exactly [antioch_68, antioch_69] with sublabels Syria/Pisidia · 34
`Paul Antioch` → Acts.11.26, Acts.13.1 co-mention; events non-empty · 35
`Simon` → 8 Simons, peter_2745 top-2, distinct sublabels · 36 `person:Simon` →
other groups empty · 37 `Simon Peter` → peter_2745 first (multiToken) · 38
`Zechariah` → book + 26 people, ≥20 distinct sublabels · 39 `Jacob` →
israel_682 then jacob_683 · 40 `Bethlehem` → bethlehem_218 first · 41 `Moses
Exodus 3` → Exod.3 + moses_2108 + Moses mentions in Exod.3 first · 42 `Tower of
Babel` → event first; places has Babel · 43 (topics; deferred) · 44 `Apostles`
→ groups ≥3 · 45 `Gen 1:1; John 1:1` two refs · 46 `Israel` → israel_682 and
region Israel both in All top-3 · 47 `charity` → 1Cor.13.13 in top; `love` does
NOT surface it (no synonyms — documented non-goal of the deterministic layer) ·
48 `the` → all-weak; no crash; <30 ms.

### Extension seams

- `QueryRewriter: (q, ctx) => Promise<QueryPlan|string>` — an LLM can author the
  same `QueryPlan` the rule classifier produces; `plan.ts` executes either;
  `why` records `plan: llm-rewrite`.
- `toolSchemas()` exports JSON-schema descriptions of search/parseReference/
  versesFor/mentions/suggest → `packages/mcp` is a thin adapter (backlog).
- `RankSignal { name; layer; score(candidates, ctx) }` combined in `merge.ts`
  as `(1−λ)·lex + λ·signal` (λ=0.3, verses only, only when loaded). Future
  `verses.emb` 31,102 × 256-d int8 = 8 MB (or PQ 32 B → 1 MB), on-device query
  embedding opt-in. Present as a no-op-tested seam from CP-05.

### Upstream data tickets to file in the metadata repo (during CP-01)

Realign `Disambiguation (temp)`; strip the comment in `mount_of_olives_828.aliases`;
review common-word `alsoCalled` on jesus_905/god_1324; 3 unresolved `richText`
link slugs; `books.writers` join bug on 1Sam/2Sam; `mdText` `([` typo.
