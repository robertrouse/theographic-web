/**
 * Regenerates the GENERATED block in `src/refs/ambiguous.ts` from the built
 * data. Run after a data refresh when `ambiguous.test.ts` reports drift:
 *
 *   npx tsx packages/core/test/gen-ambiguous.mts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deriveAmbiguousBooks } from '../src/refs/ambiguous.js';
import { DATA_DIR, loadBooks, loadEntities, renderAmbiguousLiteral } from './data.js';

const books = loadBooks();
const entities = loadEntities();
if (!books || !entities) throw new Error(`no data under ${DATA_DIR}; run \`npm run data\` first`);

const record = deriveAmbiguousBooks(books, entities);
const file = fileURLToPath(new URL('../src/refs/ambiguous.ts', import.meta.url));
const src = readFileSync(file, 'utf8');
const out = src.replace(
  /\/\* GENERATED-START \*\/[\s\S]*?\/\* GENERATED-END \*\//,
  `/* GENERATED-START */\n${renderAmbiguousLiteral(record)}\n  /* GENERATED-END */`,
);
writeFileSync(file, out);
const n = Object.values(record).reduce((sum, l) => sum + l.length, 0);
console.log(`${Object.keys(record).length} ambiguous books, ${n} entities → ${file}`);
