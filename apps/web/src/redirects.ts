/**
 * Old URLs that no longer have a page of their own (invariant 8). Generated
 * into `public/_redirects` (Netlify's format) by the integration in
 * `astro.config.mjs`; CP-11's smoke script tests the table.
 *
 * Routes that still exist are served directly and are not listed here:
 * `/{book}`, `/person/{slug}`, `/place/{slug}`, `/period/{slug}`, `/browse/`,
 * `/about/`, `/?q=`. The `/{book}/#Book.C.V` anchors are a client-side hop
 * in the book page — a fragment never reaches the server.
 */
export interface Redirect {
  from: string;
  to: string;
  /** 301 for moved pages; 302 when the target may change again. */
  status: 301 | 302;
}

export const redirects: Redirect[] = [
  { from: '/passages', to: '/browse/#bible', status: 301 },
  { from: '/passages/', to: '/browse/#bible', status: 301 },
  { from: '/people', to: '/browse/#people', status: 301 },
  { from: '/people/', to: '/browse/#people', status: 301 },
  { from: '/places', to: '/browse/#places', status: 301 },
  { from: '/places/', to: '/browse/#places', status: 301 },
  { from: '/periods', to: '/browse/#periods', status: 301 },
  { from: '/periods/', to: '/browse/#periods', status: 301 },
];

/** Netlify `_redirects` text: one `from to status` line per rule. */
export function renderNetlifyRedirects(rules: Redirect[] = redirects): string {
  const header = '# Generated from apps/web/src/redirects.ts — edit that file, not this one.\n';
  return header + rules.map((r) => `${r.from}  ${r.to}  ${r.status}`).join('\n') + '\n';
}
