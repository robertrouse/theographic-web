/**
 * Text normalization shared by the alias table, the scanner and the
 * ambiguity derivation. Kept apart so `ambiguous.ts` and `bookAliases.ts`
 * do not import each other.
 */

export const ORDINALS: Record<string, string> = {
  '1': '1',
  '2': '2',
  '3': '3',
  i: '1',
  ii: '2',
  iii: '3',
  first: '1',
  second: '2',
  third: '3',
  '1st': '1',
  '2nd': '2',
  '3rd': '3',
};

/** "III", "First", "2nd" → "3", "1", "2"; anything else → undefined. */
export function ordinalValue(word: string): string | undefined {
  return ORDINALS[word.toLowerCase()];
}

/**
 * Canonical alias key: NFKC, lower-case, dots dropped, letter runs and digit
 * runs become separate words, whitespace collapsed. Ordinal *words* are not
 * folded here — that happens at table build (as extra entries) and in the
 * scanner, so "I am" never becomes "1 am".
 *
 *   "1Sam."  → "1 sam"     "Song of Solomon" → "song of solomon"
 *   "Jn3"    → "jn 3"      "  Phlm  "        → "phlm"
 */
export function normalizeAlias(s: string): string {
  return (
    s
      .normalize('NFKC')
      .toLowerCase()
      .replace(/\./g, '')
      .match(/[a-z]+|[0-9]+/g)
      ?.join(' ') ?? ''
  );
}
