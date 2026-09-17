/**
 * The home page island: the big search box, the hints when it is empty,
 * the results when it is not. Typing searches after a 150 ms pause;
 * Enter or a suggestion searches at once. The query and tab live in the
 * URL (`replaceState`) so a view can be pasted into a message, and a
 * load with `?q=` searches as soon as the core layer is open.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EngineManifest } from '@theographic/core';
import { indexBooks, type BookLite } from '../../search/hrefs';
import { readRecent, rememberRecent } from '../../search/recent';
import {
  DEFAULT_STATE,
  readSearchState,
  searchHref,
  writeSearchState,
  type SearchUrlState,
  type Tab,
} from '../../search/urlState';
import { SearchBox } from './SearchBox';
import { SearchResults } from './SearchResults';
import { useEngine } from './useEngine';

export interface SearchPageProps {
  manifest: EngineManifest;
  books: BookLite[];
  hints: string[];
}

const DEBOUNCE_MS = 150;

export default function SearchPage({ manifest, books, hints }: SearchPageProps) {
  const [state, setState] = useState<SearchUrlState>(DEFAULT_STATE);
  const [value, setValue] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { engine, layers, readyVersion, error } = useEngine(manifest);
  const bookIndex = useMemo(() => indexBooks(books), [books]);

  // The URL is read once, at hydration; the writer waits for that.
  useEffect(() => {
    const s = readSearchState(location.search);
    setState(s);
    setValue(s.q);
    setRecent(readRecent());
    if (s.q) setRecent(rememberRecent(s.q));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const next = `${location.pathname}${writeSearchState(state)}${location.hash}`;
    if (next !== `${location.pathname}${location.search}${location.hash}`) {
      history.replaceState(history.state, '', next);
    }
  }, [state, hydrated]);

  const commit = useCallback((q: string, remember: boolean) => {
    clearTimeout(debounce.current);
    setState((s) => (s.q === q ? s : { ...s, q, tab: q ? s.tab : 'all' }));
    if (remember && q) setRecent(rememberRecent(q));
  }, []);

  const onChange = useCallback(
    (v: string) => {
      setValue(v);
      clearTimeout(debounce.current);
      debounce.current = setTimeout(() => commit(v.trim(), false), DEBOUNCE_MS);
    },
    [commit],
  );

  const onSubmit = useCallback(
    (q: string) => {
      setValue(q);
      commit(q, true);
    },
    [commit],
  );

  const onTab = useCallback((tab: Tab) => setState((s) => ({ ...s, tab })), []);

  const suggest = useCallback(
    (prefix: string, rec: readonly string[]) =>
      engine ? engine.suggest(prefix, { recent: rec }) : Promise.resolve([]),
    [engine],
  );

  return (
    <div className="search-page">
      <SearchBox
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        suggest={suggest}
        recent={recent}
        loading={hydrated && layers.core === 'loading'}
      />
      {!state.q && (
        <div className="home__hints">
          <p className="muted">Try searching for</p>
          <ul className="chips">
            {hints.map((q) => (
              <li key={q}>
                <a
                  href={searchHref(q)}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    e.preventDefault();
                    onSubmit(q);
                  }}
                >
                  {q}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <SearchResults
        q={state.q}
        tab={state.tab}
        onTab={onTab}
        engine={engine}
        layers={layers}
        readyVersion={readyVersion}
        engineError={error}
        books={bookIndex}
        debug={state.debug}
      />
    </div>
  );
}
