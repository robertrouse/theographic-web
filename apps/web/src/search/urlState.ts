/**
 * The search view lives in the URL: `/?q=<query>&tab=<group>&debug=1`.
 * Pure helpers so the contract is unit-tested without a DOM.
 *
 * Rules: defaults are omitted (a clean load leaves a clean URL); the
 * writer uses `replaceState`, never `pushState` — typing is not
 * navigation; `q` is `encodeURIComponent`-encoded with `:` and `,` left
 * literal so `?q=Prov%2025:2` — the 2020 site's hint form — is both what we
 * read and what we write.
 */
import type { Group } from '@theographic/core';

export type Tab = 'all' | Group;

export const TABS: readonly Tab[] = [
  'all',
  'passages',
  'verses',
  'people',
  'places',
  'events',
  'groups',
];

export interface SearchUrlState {
  q: string;
  tab: Tab;
  debug: boolean;
}

export const DEFAULT_STATE: SearchUrlState = { q: '', tab: 'all', debug: false };

function isTab(s: string): s is Tab {
  return (TABS as readonly string[]).includes(s);
}

/** Parse a query string (with or without the leading `?`). Unknown values fall back. */
export function readSearchState(search: string): SearchUrlState {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const q = (params.get('q') ?? '').trim();
  const tabRaw = (params.get('tab') ?? '').toLowerCase();
  const tab: Tab = isTab(tabRaw) ? tabRaw : 'all';
  const debug = params.get('debug') === '1' || params.get('debug') === 'true';
  return { q, tab: q ? tab : 'all', debug };
}

/** Readable encoding: spaces as %20, colons and commas literal. */
export function encodeQuery(q: string): string {
  return encodeURIComponent(q).replace(/%3A/gi, ':').replace(/%2C/gi, ',');
}

/** The query string for a state, `''` for the defaults; `?`-prefixed otherwise. */
export function writeSearchState(state: SearchUrlState): string {
  const parts: string[] = [];
  const q = state.q.trim();
  if (q) parts.push(`q=${encodeQuery(q)}`);
  if (q && state.tab !== 'all') parts.push(`tab=${state.tab}`);
  if (state.debug) parts.push('debug=1');
  return parts.length ? `?${parts.join('&')}` : '';
}

/** `/?q=…` for links from other pages. */
export function searchHref(q: string, tab: Tab = 'all'): string {
  return `/${writeSearchState({ q, tab, debug: false })}`;
}
