/**
 * Incoming deep links → the in-app path to load (CP-10).
 *
 * Two shapes arrive at a native shell:
 *
 *   theographic://person/moses_2108        custom scheme: the host IS the
 *                                          first path segment
 *   https://theographic.netlify.app/person/moses_2108
 *                                          Universal / App Link: the site's
 *                                          own URL
 *
 * Both map to the same root-relative path the site serves, with the query
 * and fragment kept (`/?q=Saul`, `/john/#John.3.16`). The old-URL table
 * (`redirects.ts`, invariant 8) is applied here too: Netlify does it on the
 * web, and nothing else would inside the shell.
 *
 * Pure — no DOM — so it is unit-tested; `native.ts` does the navigating.
 */
import { redirects } from '../redirects';

export const SCHEME = 'theographic';
/** Hosts whose links open in the app. A custom domain is added here AND to
 *  the associated-domains entitlement / Android intent filter. */
export const SITE_HOSTS: readonly string[] = ['theographic.netlify.app'];

const redirectMap = new Map(redirects.map((r) => [r.from, r.to]));

/**
 * The path to navigate to for an incoming URL, or `undefined` when the
 * URL is not ours (another scheme, another host) and must be left alone.
 */
export function shellPathFor(raw: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  let path: string;
  if (url.protocol === `${SCHEME}:`) {
    // `theographic://person/x` parses with host `person`; `theographic:///x`
    // and `theographic://x` (bare host) are accepted too.
    // `theographic://browse` parses with an empty pathname, `…//browse/`
    // with `/`; both spellings are kept as written, as the site accepts both.
    const host = url.hostname;
    path = host ? `/${host}${url.pathname}` : url.pathname || '/';
  } else if (
    (url.protocol === 'https:' || url.protocol === 'http:') &&
    SITE_HOSTS.includes(url.hostname)
  ) {
    path = url.pathname || '/';
  } else {
    return undefined;
  }
  // Old URLs: the table's `to` may carry its own fragment (`/browse/#people`).
  const moved = redirectMap.get(path);
  if (moved !== undefined) return moved + url.search;
  return path + url.search + url.hash;
}
