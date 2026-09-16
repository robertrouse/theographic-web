/**
 * A deliberately tiny Markdown-subset renderer for the two kinds of text the
 * bundles carry: verse `rich` (entity links + `_italics_`) and Easton entries
 * (the same plus blank-line paragraphs). Deterministic, no dependencies, and
 * it escapes everything it does not recognise — the output goes straight
 * into `set:html`.
 *
 * Links go through a resolver so the caller decides what a target becomes:
 * a site path, or `undefined` to render the label as plain text. Unknown
 * targets never become broken links.
 */

export type LinkResolver = (href: string) => string | undefined;

const LINK = /\[([^\]]*)\]\(([^)\s]*)\)/g;
const ITALIC = /_([^_\n]+)_/g;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineText(s: string): string {
  return escapeHtml(s).replace(ITALIC, '<em>$1</em>');
}

/** One paragraph's worth: links and italics only. */
export function renderInline(md: string, resolve: LinkResolver): string {
  let out = '';
  let last = 0;
  for (const m of md.matchAll(LINK)) {
    const [whole, label = '', rawHref = ''] = m;
    out += inlineText(md.slice(last, m.index));
    const href = resolve(rawHref);
    out += href ? `<a href="${escapeHtml(href)}">${inlineText(label)}</a>` : inlineText(label);
    last = m.index + whole.length;
  }
  out += inlineText(md.slice(last));
  return out;
}

/** Blank-line separated paragraphs, whitespace collapsed, empties dropped. */
export function splitParagraphs(md: string): string[] {
  return md
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter((p) => p.length > 0);
}

/** Paragraphs, each rendered inline. */
export function renderBlocks(md: string, resolve: LinkResolver): string {
  return splitParagraphs(md)
    .map((p) => `<p>${renderInline(p, resolve)}</p>`)
    .join('\n');
}
