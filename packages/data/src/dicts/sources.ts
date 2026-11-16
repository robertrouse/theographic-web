/**
 * Reference works used as BACKGROUND for generated definitions (CP-08).
 *
 * Easton's comes linked from the metadata repo (Robert's curated Airtable
 * links). The works here are matched automatically (`match.ts`), so each is
 * pinned by URL and sha256 exactly like the metadata files: a changed upstream
 * file fails the fetch instead of silently changing every prompt.
 *
 * Licences: the three CrossWire SWORD modules are public domain (each
 * module's `.conf` says `DistributionLicense=Public Domain`). TIPNR is
 * CC BY 4.0, STEPBible.org / Tyndale House; its licence explicitly allows
 * sending the data to AI servers and asks for attribution.
 */

export type DictId = 'smith' | 'isbe' | 'tipnr' | 'hitchcock';

export interface DictSource {
  id: DictId;
  /** Title as the model should name it. */
  title: string;
  year: number;
  licence: string;
  url: string;
  sha256: string;
  format: 'sword-rawld' | 'sword-zld' | 'tipnr';
  /** Path stem inside the module zip (without `.idx` etc.). */
  stem?: string;
  /** SWORD modules without `Encoding=UTF-8` in their `.conf` are Latin-1. */
  encoding?: 'utf-8' | 'windows-1252';
  /** Per-entity budget in estimated tokens; the prompt as a whole has its own cap. */
  maxTokens: number;
}

const CROSSWIRE = 'https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip';
const TIPNR_COMMIT = 'ed476a8ee6e3f7b3a46fc48af6c7dabc02387b1d';

export const DICT_SOURCES: readonly DictSource[] = [
  {
    id: 'smith',
    title: "Smith's Bible Dictionary",
    year: 1863,
    licence: 'Public domain (CrossWire SWORD module Smith 1.3)',
    url: `${CROSSWIRE}/Smith.zip`,
    sha256: '88a2c2d11f70b2484fa39d61a8e821849dca799d51e1593e8a2839f6313a8f9a',
    format: 'sword-rawld',
    stem: 'modules/lexdict/rawld/smith/smith',
    encoding: 'windows-1252',
    maxTokens: 800,
  },
  {
    id: 'isbe',
    title: 'International Standard Bible Encyclopedia',
    year: 1915,
    licence: 'Public domain (CrossWire SWORD module ISBE 2.2)',
    url: `${CROSSWIRE}/ISBE.zip`,
    sha256: '4de747545d9c349ab724bc1708b01df5481e3b93e5e51077f859dd8a32023a32',
    format: 'sword-zld',
    stem: 'modules/lexdict/zld/isbe/isbe',
    maxTokens: 1000,
  },
  {
    id: 'tipnr',
    title: 'STEPBible Proper Names (TIPNR, Tyndale House)',
    year: 2026,
    licence: 'CC BY 4.0, STEPBible.org / Tyndale House Cambridge',
    url: `https://raw.githubusercontent.com/STEPBible/STEPBible-Data/${TIPNR_COMMIT}/Proper%20Nouns/TIPNR%20-%20Translators%20Individualised%20Proper%20Names%20with%20all%20References%20-%20STEPBible.org%20CC%20BY.txt`,
    sha256: 'dc2fba41f24ed85ce0e29b426208e7ea06efc2b85ae8f2a14a06cda01648cd43',
    format: 'tipnr',
    maxTokens: 300,
  },
  {
    id: 'hitchcock',
    title: "Hitchcock's Bible Names",
    year: 1869,
    licence: 'Public domain (CrossWire SWORD module Hitchcock 2.0)',
    url: `${CROSSWIRE}/Hitchcock.zip`,
    sha256: '1c22a6482246274f463a5365232de8f79b445971f2de336b670a9b4d73fc74e4',
    format: 'sword-zld',
    stem: 'modules/lexdict/zld/hitchcock/dict',
    maxTokens: 60,
  },
];

export function dictLabel(s: Pick<DictSource, 'title' | 'year' | 'id'>): string {
  return s.id === 'hitchcock'
    ? `BACKGROUND (${s.title}, ${s.year}; meaning of the name)`
    : `BACKGROUND (${s.title}, ${s.year})`;
}
