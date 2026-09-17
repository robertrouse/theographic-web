/**
 * `?debug=1`: the classifier's plan, the engine's per-phase timings, the
 * worker round trip, and layer status. Per-hit `why[]` renders under each
 * hit (hits.tsx) when debug is on.
 */
import type { SearchResult } from '@theographic/core';
import type { Layers } from './useEngine';

export function DebugPanel({
  result,
  roundTripMs,
  layers,
}: {
  result: SearchResult;
  roundTripMs: number;
  layers: Layers;
}) {
  const timings = Object.entries(result.timings);
  const engineMs = timings.reduce((s, [, v]) => s + v, 0);
  return (
    <details className="debug" open>
      <summary>Debug</summary>
      <dl className="debug__grid">
        <dt>layers</dt>
        <dd>
          {(Object.keys(layers) as (keyof Layers)[]).map((l) => `${l}: ${layers[l]}`).join(' · ')}
        </dd>
        <dt>ready</dt>
        <dd>
          {Object.entries(result.ready)
            .map(([g, ok]) => `${g}${ok ? '' : ' ✗'}`)
            .join(' · ')}
        </dd>
        <dt>timings</dt>
        <dd>
          engine {engineMs.toFixed(1)} ms (
          {timings.map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}) · round trip{' '}
          {roundTripMs.toFixed(1)} ms
        </dd>
        <dt>plan</dt>
        <dd>
          <ol className="debug__why">
            {result.plan.why.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ol>
        </dd>
        <dt>clauses</dt>
        <dd>
          {result.plan.clauses.map((c, i) => (
            <div key={i} className="debug__clause">
              “{c.text}” → refs {c.refs.length}, entities{' '}
              {c.entities
                .map((e) => `${e.text}${e.weak ? ' (weak)' : ''} [${e.ids.length}]`)
                .join(', ') || '—'}
              , text “{c.textQuery}”{c.phrase ? ' (phrase)' : ''}
              {c.scope ? `, scope ${JSON.stringify(c.scope)}` : ''}
            </div>
          ))}
        </dd>
      </dl>
    </details>
  );
}
