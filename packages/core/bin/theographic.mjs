#!/usr/bin/env node
/**
 * `npx theographic search "Paul Antioch" [--json] [--debug] [--data <dir>] [--limit n]`
 * `npx theographic suggest "jerus"`
 * `npx theographic plan "love in John"`
 *
 * The same engine the site runs, over `fsSource` pointing at the built
 * bundles (default `apps/web/public/data`, or `THEOGRAPHIC_DATA_DIR`).
 * `--json` prints the full `SearchResult`; the determinism test compares
 * its `all[]` ids with an in-process search.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const dist = resolve(here, '../dist-node/node/index.js');
if (!existsSync(dist)) {
  console.error(
    `theographic: ${dist} is missing — run \`npm run build -w @theographic/core\` first`,
  );
  process.exit(2);
}
const { createEngine, fsSource } = await import(dist);

const args = process.argv.slice(2);
const flags = new Map();
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--json' || a === '--debug') flags.set(a.slice(2), true);
  else if (a === '--data' || a === '--limit') flags.set(a.slice(2), args[++i]);
  else positional.push(a);
}
const [command = 'search', ...rest] = positional;
const query = rest.join(' ');
const dataDir = resolve(
  flags.get('data') ??
    process.env.THEOGRAPHIC_DATA_DIR ??
    resolve(here, '../../../apps/web/public/data'),
);

if (!query && command !== 'status') {
  console.error(
    'usage: theographic <search|suggest|plan|status> "<query>" [--json] [--debug] [--data <dir>] [--limit n]',
  );
  process.exit(2);
}
if (!existsSync(resolve(dataDir, 'books.json'))) {
  console.error(`theographic: no bundles under ${dataDir} — run \`npm run data\` or pass --data`);
  process.exit(2);
}

const engine = await createEngine(fsSource(dataDir));
const limit = flags.has('limit') ? Number(flags.get('limit')) : 10;

function line(h) {
  const id = typeof h.id === 'number' ? String(h.id) : h.id;
  const sub = h.sublabel ? `  — ${h.sublabel}` : '';
  const snippet = h.snippet ? `\n      ${h.snippet.text}` : '';
  const why = flags.get('debug') && h.why ? `\n      why: ${h.why.join(' · ')}` : '';
  return `  ${h.score.toFixed(3)}  ${h.group.padEnd(8)} ${h.label}${sub}  [${id}]${snippet}${why}`;
}

switch (command) {
  case 'search': {
    const r = engine.searchSync(query, { limitPerGroup: limit });
    if (flags.get('json')) {
      console.log(JSON.stringify(r, null, 2));
      break;
    }
    console.log(`query: ${JSON.stringify(query)}  (${r.timings.total.toFixed(1)} ms)`);
    if (flags.get('debug')) console.log(`plan:\n  ${r.plan.why.join('\n  ')}`);
    const counts = Object.entries(r.groups)
      .filter(([, g]) => g.total > 0)
      .map(([k, g]) => `${k} ${g.total}`)
      .join(' · ');
    console.log(`groups: ${counts || 'none'}`);
    console.log('all:');
    for (const h of r.all) console.log(line(h));
    break;
  }
  case 'suggest': {
    const s = engine.suggest(query);
    if (flags.get('json')) console.log(JSON.stringify(s, null, 2));
    else
      for (const x of s)
        console.log(
          `  ${x.score.toFixed(3)}  ${x.kind.padEnd(9)} ${x.label}${x.sublabel ? `  — ${x.sublabel}` : ''}${flags.get('debug') ? `  (${x.why})` : ''}`,
        );
    break;
  }
  case 'plan': {
    console.log(JSON.stringify(engine.plan(query), null, 2));
    break;
  }
  case 'status': {
    console.log(JSON.stringify(engine.status(), null, 2));
    break;
  }
  default:
    console.error(`theographic: unknown command ${command}`);
    process.exit(2);
}
