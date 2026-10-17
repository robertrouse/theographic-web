import { describe, expect, it } from 'vitest';
import { shellPathFor } from '../src/shell/links';

describe('shellPathFor', () => {
  it('maps the custom scheme, host as the first segment', () => {
    expect(shellPathFor('theographic://person/moses_2108')).toBe('/person/moses_2108');
    expect(shellPathFor('theographic://place/bethlehem_1041')).toBe('/place/bethlehem_1041');
    expect(shellPathFor('theographic://browse/')).toBe('/browse/');
    expect(shellPathFor('theographic://browse')).toBe('/browse');
    expect(shellPathFor('theographic://')).toBe('/');
    expect(shellPathFor('theographic:///person/moses_2108')).toBe('/person/moses_2108');
  });

  it('keeps the query and the fragment', () => {
    expect(shellPathFor('theographic://?q=Saul')).toBe('/?q=Saul');
    expect(shellPathFor('https://theographic.netlify.app/?q=Prov%2025:2&tab=verses')).toBe(
      '/?q=Prov%2025:2&tab=verses',
    );
    expect(shellPathFor('https://theographic.netlify.app/john/#John.3.16')).toBe(
      '/john/#John.3.16',
    );
  });

  it("maps the site's own links and nothing else", () => {
    expect(shellPathFor('https://theographic.netlify.app/person/moses_2108')).toBe(
      '/person/moses_2108',
    );
    expect(shellPathFor('https://theographic.netlify.app')).toBe('/');
    expect(shellPathFor('https://example.com/person/moses_2108')).toBeUndefined();
    expect(shellPathFor('mailto:robert@viz.bible')).toBeUndefined();
    expect(shellPathFor('not a url')).toBeUndefined();
  });

  it('applies the old-URL table (invariant 8) as Netlify would', () => {
    expect(shellPathFor('https://theographic.netlify.app/people')).toBe('/browse/#people');
    expect(shellPathFor('https://theographic.netlify.app/places/')).toBe('/browse/#places');
    expect(shellPathFor('theographic://periods')).toBe('/browse/#periods');
  });
});
