/**
 * The one tokenizer for verse text, shared by the index build and the query
 * side. The build asserts that re-tokenizing every verse reproduces the term
 * ids it wrote, so anything that changes here changes the index format in
 * effect — bump `TGIX` version in `build.ts` if the output for any verse
 * changes.
 *
 * Pipeline (docs/search-design.md §Tokenizer):
 *   NFKC → lower-case → `’` → `'` → split on `[^a-z0-9'-]+` → strip a trailing
 *   possessive (`'s` or `'`) and any leading/trailing `'`/`-` → keep internal
 *   hyphens ("god-ward" is one term) → drop the Psalm 119 acrostic header when
 *   asked → no stopword removal.
 *
 * Offsets are into the string given, so a snippet can highlight the source
 * text directly. That holds because NFKC and lower-casing never change the
 * length of KJV text — the build checks this for every verse and refuses to
 * write an index where it is false, rather than silently shifting highlights.
 */

export interface Token {
  /** Normalized term as it appears in the dictionary. */
  term: string;
  /** Half-open [start, end) char offsets into the input string. */
  start: number;
  end: number;
}

export interface TokenizeOptions {
  /**
   * Drop the acrostic header ("NUN.") if the text starts with one. Only the
   * build and the snippet code pass this, and only for Psalm 119 verses —
   * the name is matched against the 22 Hebrew letters and must be all-caps in
   * the source, so "He" the pronoun never trips it.
   */
  acrostic?: boolean;
}

/** Ps 119's 22 section headers as the KJV `verseText` spells them. */
export const ACROSTIC_HEADERS: ReadonlySet<string> = new Set([
  'aleph',
  'beth',
  'gimel',
  'daleth',
  'he',
  'vau',
  'zain',
  'cheth',
  'teth',
  'jod',
  'caph',
  'lamed',
  'mem',
  'nun',
  'samech',
  'ain',
  'pe',
  'tzaddi',
  'koph',
  'resh',
  'schin',
  'tau',
]);

const PS119_FIRST = 19119001;
const PS119_LAST = 19119176;

/** True for the 176 verses that may open with an acrostic header. */
export function isPsalm119(verseId: number): boolean {
  return verseId >= PS119_FIRST && verseId <= PS119_LAST;
}

const WORD = /[a-z0-9'-]+/g;

/** Lower-cased, apostrophe-folded copy of `text`; same length for KJV input. */
export function foldText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/’/g, "'");
}

export function tokenize(text: string, opts: TokenizeOptions = {}): Token[] {
  const folded = foldText(text);
  const out: Token[] = [];
  WORD.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD.exec(folded)) !== null) {
    let start = m.index;
    let end = start + m[0].length;
    // Trailing possessive first ("lord's" → "lord", "priests'" → "priests"),
    // then any stray punctuation-class chars at either edge ("sin--" → "sin").
    if (end - start >= 2 && folded[end - 2] === "'" && folded[end - 1] === 's') end -= 2;
    while (end > start && (folded[end - 1] === "'" || folded[end - 1] === '-')) end--;
    while (start < end && (folded[start] === "'" || folded[start] === '-')) start++;
    if (start === end) continue;
    out.push({ term: folded.slice(start, end), start, end });
  }
  if (opts.acrostic && out.length > 0) {
    const first = out[0]!;
    const source = text.slice(first.start, first.end);
    if (
      ACROSTIC_HEADERS.has(first.term) &&
      source === source.toUpperCase() &&
      text[first.end] === '.'
    ) {
      out.shift();
    }
  }
  return out;
}

/** Just the terms, in order — what the index build and query parsing want. */
export function terms(text: string, opts?: TokenizeOptions): string[] {
  return tokenize(text, opts).map((t) => t.term);
}

/**
 * Light suffix stripper used only to form *stem groups* — sets of dictionary
 * terms that share a stem and expand each other at weight 0.7. It never
 * touches the index or the snippet, so it can be crude as long as it is
 * deterministic: "love", "loved", "loveth", "lovest", "loves", "loving" →
 * "lov"; "bless", "blessed", "blessing" → "bless"; "city", "cities" → "city".
 *
 * Rules, applied at most once each in order, with a minimum stem of 3 chars:
 *   -ies/-ied → -y · -eth -est -ing -ed -es -ly -s (not after ss) · trailing -e
 */
export function stem(word: string): string {
  const MIN = 3;
  let w = word;
  if (w.length - 2 >= MIN && (w.endsWith('ies') || w.endsWith('ied'))) {
    w = w.slice(0, -3) + 'y';
  } else {
    for (const suf of ['eth', 'est', 'ing', 'ed', 'es', 'ly', 's']) {
      if (w.length - suf.length >= MIN && w.endsWith(suf)) {
        if (suf === 's' && w.endsWith('ss')) break;
        w = w.slice(0, -suf.length);
        break;
      }
    }
  }
  if (w.length - 1 >= MIN && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}
