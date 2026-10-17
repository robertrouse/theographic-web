import { describe, expect, it } from 'vitest';
import { escapeHtml, renderBlocks, renderInline, splitParagraphs } from '../src/lib/markdown';

const keep = (href: string) => href;
const drop = () => undefined;

describe('renderInline', () => {
  it('renders entity links and italics', () => {
    expect(renderInline('In the beginning [God](/person/god_1324) _was_', keep)).toBe(
      'In the beginning <a href="/person/god_1324">God</a> <em>was</em>',
    );
  });

  it('renders the label as text when the resolver rejects the target', () => {
    expect(renderInline('to [Zoar](http:///place/zoar_1271)', drop)).toBe('to Zoar');
  });

  it('does not treat underscores inside a link target as italics', () => {
    expect(renderInline('[Moses](/person/moses_2108) and [Aaron](/person/aaron_1)', keep)).toBe(
      '<a href="/person/moses_2108">Moses</a> and <a href="/person/aaron_1">Aaron</a>',
    );
  });

  it('escapes HTML in text, labels and hrefs', () => {
    expect(renderInline('a <b> & [x<y](/person/a"b)', keep)).toBe(
      'a &lt;b&gt; &amp; <a href="/person/a&quot;b">x&lt;y</a>',
    );
  });

  it('leaves stray brackets and parentheses alone', () => {
    expect(renderInline('(for he _was_ the firstborn)', keep)).toBe(
      '(for he <em>was</em> the firstborn)',
    );
  });

  it('is deterministic', () => {
    const md = 'x [a](/person/a) _b_ [c](/place/c)';
    expect(renderInline(md, keep)).toBe(renderInline(md, keep));
  });
});

describe('renderBlocks', () => {
  it('splits on blank lines and joins soft breaks', () => {
    expect(splitParagraphs('one\ntwo\n\nthree\n\n\n')).toEqual(['one two', 'three']);
    expect(renderBlocks('one\ntwo\n\nthree', keep)).toBe('<p>one two</p>\n<p>three</p>');
  });
});

describe('escapeHtml', () => {
  it('escapes the four characters that matter in text and attributes', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });
});
