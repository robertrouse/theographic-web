/**
 * Recent searches in `localStorage`, newest first, at most `MAX`. Every
 * access is wrapped: a private window, a full quota or a blocked origin
 * means "no recent searches", never a thrown error in a keystroke handler.
 */
const KEY = 'theographic.recent';
export const MAX_RECENT = 10;
/** How many show beneath an empty box on focus. */
export const SHOW_RECENT = 5;

export function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberRecent(q: string): string[] {
  const query = q.trim();
  if (!query) return readRecent();
  const list = [
    query,
    ...readRecent().filter((x) => x.toLowerCase() !== query.toLowerCase()),
  ].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Not stored; the in-memory list is still returned for this page.
  }
  return list;
}

export function forgetRecent(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to forget.
  }
}
