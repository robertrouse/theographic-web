/**
 * Name normalization shared by the index build and the query side. Both must
 * agree byte for byte or a name never matches itself, so there is exactly one
 * implementation and `packages/data` imports it from here.
 *
 *   "Jerusalem's"      → "jerusalem"
 *   "Beth-el"          → "beth el"      (the build also emits "bethel")
 *   "_Simon_ Peter’s"  → "simon peter"
 *   "Antioch (Syria)"  → "antioch syria"
 *
 * NFKC → lower-case → Markdown emphasis dropped → curly apostrophe folded →
 * possessive stripped → every other non-alphanumeric run becomes one space.
 * Emphasis goes first because `_` is a word character: "_God's_" would
 * otherwise keep its possessive.
 */
export function normalizeName(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[_*]/g, '')
    .replace(/’/g, "'")
    .replace(/'s\b|'(?=\s|$)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Function words that never identify an entity on their own. */
export const NAME_STOPWORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'for',
  'from',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

/** Tokens of an already-normalized string. */
export function nameTokens(norm: string): string[] {
  return norm === '' ? [] : norm.split(' ');
}
