import { useEffect, useMemo, useState } from 'react';
import type { EngineManifest, EngineStatus, WorkerEngine } from '@theographic/core';
import { getEngine, preloadOnIdle } from '../../search/engine';

export type Layers = EngineStatus['layers'];

const NOT_STARTED: Layers = { core: 'loading', text: 'absent', graph: 'absent' };

export interface EngineHandle {
  engine: WorkerEngine | undefined;
  layers: Layers;
  /** Bumps whenever a layer becomes ready — a dependency for re-running a search. */
  readyVersion: number;
  error: string | undefined;
}

/**
 * The page's shared worker engine and its layer states. `start` false
 * defers creation (the header box on a reader page starts on idle); once
 * started, the graph and text layers follow on idle.
 */
export function useEngine(manifest: EngineManifest, start = true): EngineHandle {
  const [layers, setLayers] = useState<Layers>(NOT_STARTED);
  const [readyVersion, setReadyVersion] = useState(0);
  const [error, setError] = useState<string>();
  const [engine, setEngine] = useState<WorkerEngine>();

  useEffect(() => {
    if (!start) return;
    const e = getEngine({ manifest });
    setEngine(e);
    if (e.lastStatus) setLayers(e.lastStatus.layers);
    let alive = true;
    e.ready.then(
      (s) => {
        if (!alive) return;
        setLayers(s.layers);
        setReadyVersion((v) => v + 1);
      },
      (err: unknown) => {
        if (!alive) return;
        setLayers({ core: 'failed', text: 'absent', graph: 'absent' });
        setError(err instanceof Error ? err.message : String(err));
      },
    );
    const off = e.onLayer((_layer, state, status) => {
      if (!alive) return;
      setLayers(status.layers);
      if (state === 'ready') setReadyVersion((v) => v + 1);
    });
    preloadOnIdle(e);
    return () => {
      alive = false;
      off();
    };
  }, [manifest, start]);

  return useMemo(
    () => ({ engine, layers, readyVersion, error }),
    [engine, layers, readyVersion, error],
  );
}
