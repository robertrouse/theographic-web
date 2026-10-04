/**
 * One hit, rendered by its group. Verses show the whole verse with
 * `<mark>` from the snippet offsets and a `Book C:V` link into the reader;
 * passages show the reference and its first verses; entities show label,
 * sublabel and verse count. In debug mode every hit shows its `why[]`.
 */
import type { ComponentChild } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Hit, Ref, Snippet, WorkerEngine } from '@theographic/core';
import { hitHref, verseHref, verseParts, type BookIndex } from '../../search/hrefs';

export function Marked({ snippet }: { snippet: Snippet }): ComponentChild[] {
  const out: ComponentChild[] = [];
  let at = 0;
  snippet.highlights.forEach(([s, e], i) => {
    if (s > at) out.push(snippet.text.slice(at, s));
    out.push(<mark key={i}>{snippet.text.slice(s, e)}</mark>);
    at = e;
  });
  if (at < snippet.text.length) out.push(snippet.text.slice(at));
  return out;
}

const PASSAGE_VERSES = 3;

function PassageText({
  hit,
  engine,
  textReady,
  books,
}: {
  hit: Hit;
  engine: WorkerEngine;
  textReady: boolean;
  books: BookIndex;
}) {
  const ref = hit.ref as Ref | undefined;
  const [verses, setVerses] = useState<{ id: number; text: string }[]>();
  useEffect(() => {
    if (!ref || ref.kind === 'book' || !textReady) return;
    let alive = true;
    engine.versesFor(ref).then(
      (v) => {
        if (alive) setVerses(v);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [engine, ref, textReady]);
  if (!ref || ref.kind === 'book') return null;
  if (!verses) {
    if (hit.snippet) return <p class="hit__text">{hit.snippet.text}</p>;
    return textReady ? null : <p class="hit__text muted">Loading text…</p>;
  }
  const shown = verses.slice(0, PASSAGE_VERSES);
  const rest = verses.length - shown.length;
  return (
    <div class="hit__passage">
      {shown.map((v) => {
        const { c, v: n } = verseParts(v.id);
        return (
          <p class="hit__text" key={v.id}>
            <a class="hit__vnum" href={verseHref(v.id, books)}>
              {c}:{n}
            </a>{' '}
            {v.text}
          </p>
        );
      })}
      {rest > 0 && (
        <p class="hit__more muted">
          <a href={hitHref(hit, books)}>
            … {rest} more verse{rest === 1 ? '' : 's'}
          </a>
        </p>
      )}
    </div>
  );
}

function Why({ why }: { why: string[] | undefined }) {
  if (!why?.length) return null;
  return (
    <ul class="hit__why">
      {why.map((w, i) => (
        <li key={i}>{w}</li>
      ))}
    </ul>
  );
}

export interface HitItemProps {
  hit: Hit;
  books: BookIndex;
  engine: WorkerEngine;
  textReady: boolean;
  debug: boolean;
}

export function HitItem({ hit, books, engine, textReady, debug }: HitItemProps) {
  const href = hitHref(hit, books);
  const title = href ? <a href={href}>{hit.label}</a> : <span>{hit.label}</span>;
  const score = debug ? <span class="hit__score">{hit.score.toFixed(3)}</span> : null;

  if (hit.group === 'verses') {
    return (
      <li class="hit hit--verse">
        <div class="hit__head">
          <span class="hit__ref">{title}</span>
          {score}
        </div>
        {hit.snippet && (
          <p class="hit__text">
            <Marked snippet={hit.snippet} />
          </p>
        )}
        {debug && <Why why={hit.why} />}
      </li>
    );
  }

  if (hit.group === 'passages') {
    return (
      <li class="hit hit--passage">
        <div class="hit__head">
          <span class="hit__title">{title}</span>
          {hit.sublabel && <span class="hit__sub">{hit.sublabel}</span>}
          {score}
        </div>
        <PassageText hit={hit} engine={engine} textReady={textReady} books={books} />
        {debug && <Why why={hit.why} />}
      </li>
    );
  }

  // Places' sublabels already carry the count ("City · 754 verses" / "no verses").
  const count = hit.verseCount;
  const subHasCount = hit.sublabel !== undefined && /\bverses?\b/.test(hit.sublabel);
  return (
    <li class="hit hit--entity">
      <div class="hit__head">
        <span class="hit__title">{title}</span>
        {hit.sublabel && <span class="hit__sub">{hit.sublabel}</span>}
        {count !== undefined && !subHasCount && (
          <span class="hit__count">
            {count} verse{count === 1 ? '' : 's'}
          </span>
        )}
        {score}
      </div>
      {debug && <Why why={hit.why} />}
    </li>
  );
}
