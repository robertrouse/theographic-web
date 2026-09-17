/**
 * Results for the query in the URL. Tabs are the non-empty groups (All
 * first); All shows three per group with "more →" that switches tab, a
 * group tab shows twenty with "load more". Verses render behind
 * "Searching verses…" until the text layer lands, and the search re-runs
 * when a layer becomes ready so the page fills in without a keystroke.
 *
 * The plan and every hit's `why` are one `?debug=1` away (invariant 3).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Group, Hit, SearchResult, WorkerEngine } from '@theographic/core';
import { isAborted } from '@theographic/core';
import { GROUP_LABEL, type BookIndex } from '../../search/hrefs';
import type { Tab } from '../../search/urlState';
import { DebugPanel } from './DebugPanel';
import { HitItem } from './hits';
import type { Layers } from './useEngine';

const PER_GROUP_ALL = 3;
const PAGE = 20;
const ALL_LIMIT = 10;

export interface SearchResultsProps {
  q: string;
  tab: Tab;
  onTab: (tab: Tab, focus?: boolean) => void;
  engine: WorkerEngine | undefined;
  layers: Layers;
  readyVersion: number;
  engineError: string | undefined;
  books: BookIndex;
  debug: boolean;
}

interface Timed {
  result: SearchResult;
  roundTripMs: number;
  at: number;
}

/** Groups in the order their best hit appears in `all`, then any non-empty stragglers. */
function displayOrder(r: SearchResult): Group[] {
  const seen: Group[] = [];
  for (const h of r.all) if (!seen.includes(h.group)) seen.push(h.group);
  for (const g of Object.keys(r.groups) as Group[])
    if (r.groups[g].total > 0 && !seen.includes(g)) seen.push(g);
  return seen;
}

export function SearchResults({
  q,
  tab,
  onTab,
  engine,
  layers,
  readyVersion,
  engineError,
  books,
  debug,
}: SearchResultsProps) {
  const [timed, setTimed] = useState<Timed>();
  const [limit, setLimit] = useState(PAGE);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const tabRefs = useRef(new Map<Tab, HTMLButtonElement>());
  const focusTab = useRef(false);

  // A new query or tab starts the page count over.
  useEffect(() => {
    setLimit(PAGE);
  }, [q, tab]);

  useEffect(() => {
    if (!engine || !q) {
      setTimed(undefined);
      return;
    }
    let alive = true;
    setPending(true);
    const t0 = performance.now();
    engine
      .search(q, { limitPerGroup: tab === 'all' ? ALL_LIMIT : Math.max(limit, ALL_LIMIT) })
      .then(
        (result) => {
          if (!alive) return;
          setTimed({ result, roundTripMs: performance.now() - t0, at: Date.now() });
          setError(undefined);
          setPending(false);
        },
        (err: unknown) => {
          if (!alive || isAborted(err)) return;
          setError(err instanceof Error ? err.message : String(err));
          setPending(false);
        },
      );
    return () => {
      alive = false;
    };
  }, [engine, q, tab, limit, readyVersion]);

  // Focus the selected tab after a switch the user asked for via "more →" or the arrow keys.
  useEffect(() => {
    if (!focusTab.current) return;
    focusTab.current = false;
    tabRefs.current.get(tab)?.focus();
  }, [tab]);

  const result = timed?.result;
  const order = useMemo(() => (result ? displayOrder(result) : []), [result]);
  const textReady = layers.text === 'ready';
  const total = result ? order.reduce((s, g) => s + result.groups[g].total, 0) : 0;
  const allReady = result ? order.every((g) => result.ready[g]) && result.ready.verses : false;
  const empty = result !== undefined && total === 0;

  if (!q) return null;

  if (engineError) {
    return (
      <section className="results" aria-live="polite">
        <p className="results__error">Search could not start: {engineError}</p>
      </section>
    );
  }

  const tabs: Tab[] = ['all', ...order];
  const current: Tab = tabs.includes(tab) ? tab : 'all';
  const announce = !result
    ? `Searching for ${q}`
    : `${total} result${total === 1 ? '' : 's'} for ${q}${result.ready.verses ? '' : ', verses still loading'}`;

  const switchTab = (t: Tab, focus: boolean): void => {
    focusTab.current = focus;
    onTab(t, focus);
  };

  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>, i: number): void => {
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    switchTab(tabs[next]!, true);
  };

  const list = (group: Group, hits: Hit[]) => (
    <ul className="hits">
      {hits.map((h) => (
        <HitItem
          key={`${group}:${h.id}`}
          hit={h}
          books={books}
          engine={engine!}
          textReady={textReady}
          debug={debug}
        />
      ))}
    </ul>
  );

  return (
    <section className="results" aria-busy={pending}>
      <p className="visually-hidden" role="status" aria-live="polite">
        {announce}
      </p>
      {debug && result && (
        <DebugPanel result={result} roundTripMs={timed!.roundTripMs} layers={layers} />
      )}
      {result && !empty && (
        <div className="results__tabs" role="tablist" aria-label="Result groups">
          {tabs.map((t, i) => {
            const n = t === 'all' ? total : result.groups[t].total;
            return (
              <button
                key={t}
                ref={(el) => {
                  if (el) tabRefs.current.set(t, el);
                  else tabRefs.current.delete(t);
                }}
                type="button"
                role="tab"
                id={`tab-${t}`}
                aria-selected={t === current}
                aria-controls={`panel-${t}`}
                tabIndex={t === current ? 0 : -1}
                className="results__tab"
                onClick={() => switchTab(t, false)}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                {t === 'all' ? 'All' : GROUP_LABEL[t]} <span className="results__n">{n}</span>
              </button>
            );
          })}
        </div>
      )}
      {result && (
        <div
          role="tabpanel"
          id={`panel-${current}`}
          aria-labelledby={`tab-${current}`}
          className="results__panel"
        >
          {current === 'all' &&
            order.map((g) => {
              const gr = result.groups[g];
              const shown = gr.hits.slice(0, PER_GROUP_ALL);
              return (
                <section className="results__group" key={g}>
                  <h2 className="results__h">
                    {GROUP_LABEL[g]}
                    {gr.total > shown.length && (
                      <button
                        type="button"
                        className="results__more"
                        onClick={() => switchTab(g, true)}
                      >
                        {gr.total} {GROUP_LABEL[g].toLowerCase()} →
                      </button>
                    )}
                  </h2>
                  {list(g, shown)}
                </section>
              );
            })}
          {current !== 'all' &&
            (() => {
              const gr = result.groups[current];
              return (
                <section className="results__group">
                  {list(current, gr.hits)}
                  {gr.total > gr.hits.length && (
                    <p className="results__load">
                      <button
                        type="button"
                        className="results__more"
                        onClick={() => setLimit((l) => l + PAGE)}
                      >
                        Load more ({gr.hits.length} of {gr.total})
                      </button>
                    </p>
                  )}
                </section>
              );
            })()}
          {!result.ready.verses && (current === 'all' || current === 'verses') && (
            <p className="results__wait muted" aria-live="off">
              <span className="results__spinner" aria-hidden="true" /> Searching verses…
            </p>
          )}
          {empty && allReady && <NoResults q={q} result={result} />}
        </div>
      )}
      {error && <p className="results__error">{error}</p>}
    </section>
  );
}

/** Why nothing matched: the reference errors first, then the plan's own lines. */
function NoResults({ q, result }: { q: string; result: SearchResult }) {
  const errors = result.plan.clauses.flatMap((c) => c.refErrors.map((e) => e.reason));
  const why = result.plan.why.filter((w) => !w.startsWith('groups:')).slice(0, 4);
  return (
    <div className="results__none">
      <p className="lead">No results for “{q}”.</p>
      {errors.length > 0 && (
        <ul className="results__why">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {errors.length === 0 && why.length > 0 && (
        <ul className="results__why muted">
          {why.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
