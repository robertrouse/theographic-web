/**
 * The header box on every page but home. Typeahead works in place; a
 * submit navigates to `/?q=`. The worker starts on idle after hydration
 * so a reader who never searches pays only for a cached, tiny fetch.
 */
import { useCallback, useEffect, useState } from 'react';
import type { EngineManifest } from '@theographic/core';
import { readRecent, rememberRecent } from '../../search/recent';
import { searchHref } from '../../search/urlState';
import { SearchBox } from './SearchBox';
import { useEngine } from './useEngine';

export default function HeaderSearch({ manifest }: { manifest: EngineManifest }) {
  const [value, setValue] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const { engine } = useEngine(manifest);

  useEffect(() => {
    setRecent(readRecent());
  }, []);

  const suggest = useCallback(
    (prefix: string, rec: readonly string[]) =>
      engine ? engine.suggest(prefix, { recent: rec }) : Promise.resolve([]),
    [engine],
  );

  const onSubmit = useCallback((q: string) => {
    if (!q) return;
    setRecent(rememberRecent(q));
    location.assign(searchHref(q));
  }, []);

  return (
    <SearchBox
      compact
      value={value}
      onChange={setValue}
      onSubmit={onSubmit}
      suggest={suggest}
      recent={recent}
    />
  );
}
