/**
 * Query grammar (docs/search-design.md §"Query grammar"):
 *
 *   query  ::= clause (';' clause)*
 *   clause ::= item+
 *   item   ::= filter | quoted | word
 *   filter ::= ('in'|'book'|'person'|'place'|'event'|'group'|'type'|'mentions'|'sort') ':' value
 *
 * Sugar: a trailing "in <book|ot|nt|division>" becomes `in:`; a clause
 * starting "verses mentioning X" becomes `mentions:X`. References are NOT
 * parsed here — the classifier hands the remaining text to `parseReference`
 * — so "3:16" is never mistaken for a filter: only the nine keys above,
 * case-insensitively, introduce one.
 *
 * Every item keeps its `[start, end)` span in the clause so later steps can
 * blank consumed text in place and character offsets stay meaningful.
 */
import type { Filter, FilterKey } from './types.js';

export const FILTER_KEYS: ReadonlySet<string> = new Set<FilterKey>([
  'in',
  'book',
  'person',
  'place',
  'event',
  'group',
  'type',
  'mentions',
  'sort',
]);

export interface QuotedItem {
  kind: 'quoted';
  text: string;
  span: [number, number];
}

export interface WordItem {
  kind: 'word';
  text: string;
  span: [number, number];
}

export interface RawClause {
  /** The clause text, as typed (leading/trailing space trimmed). */
  text: string;
  /** Offset of `text` in the whole query. */
  offset: number;
  filters: Filter[];
  quoted: QuotedItem[];
  words: WordItem[];
}

export interface GrammarOptions {
  /**
   * Decides whether the words after a trailing "in" name a scope the host
   * understands (a book alias, a testament, a division). Without it the
   * sugar is off.
   */
  isScope?: (words: string[]) => boolean;
  /** Longest scope name in words the sugar tries; default 4 ("song of solomon"). */
  maxScopeWords?: number;
}

const FILTER_RE = /^([A-Za-z]+):/;

function splitClauses(input: string): { text: string; offset: number }[] {
  const out: { text: string; offset: number }[] = [];
  let start = 0;
  let inQuote = false;
  for (let i = 0; i <= input.length; i++) {
    const ch = input[i];
    if (ch === '"') inQuote = !inQuote;
    if ((ch === ';' && !inQuote) || i === input.length) {
      const raw = input.slice(start, i);
      const lead = raw.length - raw.trimStart().length;
      const text = raw.trim();
      if (text !== '') out.push({ text, offset: start + lead });
      start = i + 1;
    }
  }
  return out;
}

function parseClause(text: string, offset: number, opts: GrammarOptions): RawClause {
  const filters: Filter[] = [];
  const quoted: QuotedItem[] = [];
  const words: WordItem[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i]!;
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      i++;
      continue;
    }
    if (ch === '"') {
      const close = text.indexOf('"', i + 1);
      const end = close < 0 ? n : close + 1;
      const inner = text.slice(i + 1, close < 0 ? n : close).trim();
      if (inner !== '') quoted.push({ kind: 'quoted', text: inner, span: [i, end] });
      i = end;
      continue;
    }
    // A word runs to the next whitespace; a filter key is a word up to ':'.
    let j = i;
    while (j < n && !/\s/.test(text[j]!)) j++;
    const word = text.slice(i, j);
    const m = FILTER_RE.exec(word);
    if (m && FILTER_KEYS.has(m[1]!.toLowerCase())) {
      const key = m[1]!.toLowerCase() as FilterKey;
      let value = word.slice(m[0].length);
      let end = j;
      if (value.startsWith('"')) {
        const close = text.indexOf('"', i + m[0].length + 1);
        end = close < 0 ? n : close + 1;
        value = text.slice(i + m[0].length + 1, close < 0 ? n : close);
      }
      filters.push({ key, value: value.trim(), span: [i, end], source: 'filter' });
      i = end;
      continue;
    }
    words.push({ kind: 'word', text: word, span: [i, j] });
    i = j;
  }

  // Sugar: "verses mentioning X" → mentions:X (the rest of the clause).
  if (
    words.length >= 3 &&
    words[0]!.text.toLowerCase() === 'verses' &&
    words[1]!.text.toLowerCase() === 'mentioning' &&
    filters.length === 0 &&
    quoted.length === 0
  ) {
    const rest = words.slice(2);
    const value = rest.map((w) => w.text).join(' ');
    filters.push({
      key: 'mentions',
      value,
      span: [words[0]!.span[0], rest[rest.length - 1]!.span[1]],
      source: 'sugar',
    });
    words.length = 0;
  }

  // Sugar: "… in <scope>" → in:<scope>, only with content before the "in".
  if (opts.isScope) {
    const max = opts.maxScopeWords ?? 4;
    for (let k = 1; k <= max; k++) {
      const at = words.length - 1 - k; // index of the "in"
      if (at < 1) break;
      if (words[at]!.text.toLowerCase() !== 'in') continue;
      const tail = words.slice(at + 1).map((w) => w.text);
      if (!opts.isScope(tail)) continue;
      filters.push({
        key: 'in',
        value: tail.join(' '),
        span: [words[at]!.span[0], words[words.length - 1]!.span[1]],
        source: 'sugar',
      });
      words.splice(at);
      break;
    }
  }

  return { text, offset, filters, quoted, words };
}

export function parseQuery(input: string, opts: GrammarOptions = {}): RawClause[] {
  return splitClauses(input).map((c) => parseClause(c.text, c.offset, opts));
}

/** `text` with the given spans replaced by spaces, so offsets are unchanged. */
export function blankSpans(text: string, spans: readonly [number, number][]): string {
  if (spans.length === 0) return text;
  const chars = text.split('');
  for (const [s, e] of spans) for (let i = s; i < e && i < chars.length; i++) chars[i] = ' ';
  return chars.join('');
}
