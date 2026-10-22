/**
 * Load the pinned reference works and attach them to people and places.
 * Downloads once into `.cache/dicts/`, verifies sha256 on every load, and
 * throws on a mismatch — the pin is the point.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildBookAliasTable } from '@theographic/core';
import { CACHE_ROOT } from '../fetch.js';
import { sha256 } from '../hash.js';
import type { Normalized } from '../normalize.js';
import type { Background, MatchStats } from './match.js';
import { buildNameIndex, matchHeadwords, matchHitchcock, matchTipnr } from './match.js';
import type { DictSource } from './sources.js';
import { DICT_SOURCES } from './sources.js';
import { readSwordZip } from './sword.js';
import { parseTipnr } from './tipnr.js';

export type { Background, BackgroundEntry, MatchStats } from './match.js';
export { DICT_SOURCES, dictLabel } from './sources.js';

async function fetchPinned(s: DictSource, log: (m: string) => void): Promise<Uint8Array> {
  const dir = join(CACHE_ROOT, 'dicts');
  const file = join(dir, `${s.id}-${s.sha256.slice(0, 12)}`);
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(file));
  } catch {
    log(`dicts: downloading ${s.title}`);
    const res = await fetch(s.url);
    if (!res.ok) throw new Error(`dicts: ${s.url}: HTTP ${res.status}`);
    bytes = new Uint8Array(await res.arrayBuffer());
    await mkdir(dir, { recursive: true });
    await writeFile(file, bytes);
  }
  const got = sha256(bytes);
  if (got !== s.sha256) {
    throw new Error(`dicts: ${s.id} sha256 ${got} does not match the pin ${s.sha256}`);
  }
  return bytes;
}

export async function loadBackground(
  n: Normalized,
  log: (m: string) => void = () => {},
): Promise<{ background: Background; stats: MatchStats[] }> {
  const table = buildBookAliasTable(n.books);
  const index = buildNameIndex(n);
  const background: Background = new Map();
  const stats: MatchStats[] = [];
  for (const s of DICT_SOURCES) {
    const bytes = await fetchPinned(s, log);
    if (s.format === 'tipnr') {
      const recs = parseTipnr(new TextDecoder('utf-8').decode(bytes));
      stats.push(matchTipnr(recs, index, table, background));
      continue;
    }
    const entries = readSwordZip(
      bytes,
      s.stem!,
      s.format === 'sword-rawld' ? 'rawld' : 'zld',
      s.encoding,
    );
    stats.push(
      s.id === 'hitchcock'
        ? matchHitchcock(entries, index, background)
        : matchHeadwords(s.id as 'smith' | 'isbe', entries, index, table, background),
    );
  }
  return { background, stats };
}
