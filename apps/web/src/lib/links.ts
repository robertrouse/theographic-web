/**
 * Turns the link targets found in source Markdown into site paths, or
 * `undefined` when the target is not a page this site has.
 *
 * The source is not tidy. Verse `rich` carries a few `http:///place/x`,
 * `http://person/x` and `/people/x` variants; Easton entries link verses the
 * 2020 way (`/gen#Gen.45.17`, `/lev#Lev.8`, `1chr/#1Chr.8.12`). All of it is
 * normalised here, once, and checked against the bundles so a typo'd slug
 * renders as text rather than a 404.
 */
import { getBook, getPerson, getPlace } from './data.js';
import type { LinkResolver } from './markdown.js';

const OLD_ANCHOR = /^\/?([a-z0-9]+)\/?#([1-3]?[A-Za-z]+)\.(\d+)(?:\.(\d+))?$/;

export function resolveSiteHref(raw: string): string | undefined {
  let href = raw.trim().replace(/^https?:\/\/+/, '/');
  if (!href.startsWith('/')) href = '/' + href;
  href = href.replace(/^\/people\//, '/person/');

  const entity = href.match(/^\/(person|place)\/([^/#?]+)$/);
  if (entity) {
    const [, kind, slug] = entity;
    const exists = kind === 'person' ? getPerson(slug!) : getPlace(slug!);
    return exists ? `/${kind}/${slug}` : undefined;
  }

  const anchor = href.match(OLD_ANCHOR);
  if (anchor) {
    const [, bookSlug, , c, v] = anchor;
    const book = getBook(bookSlug!.toLowerCase());
    if (!book) return undefined;
    const chapter = Number.parseInt(c!, 10);
    if (chapter < 1 || chapter > book.chapterCount) return undefined;
    return v ? `/${book.slug}/${chapter}#v${v}` : `/${book.slug}/${chapter}`;
  }

  return undefined;
}

export const siteLinks: LinkResolver = resolveSiteHref;
