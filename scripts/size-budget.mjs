// Fails CI when the built site's critical assets exceed their budget.
// Budgets are gzip sizes; they get real values in CP-07 when the search island
// lands. Until then this only reports.
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const dist = new URL('../apps/web/dist/', import.meta.url).pathname;
const budgets = {
  // pattern (regex on path relative to dist) : max gzip bytes
  '^_astro/.*\\.js$': 200 * 1024, // all client JS combined
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(dist).map((p) => ({
  rel: p.slice(dist.length),
  gz: gzipSync(readFileSync(p)).length,
}));

// Astro emits framework renderer chunks even when no page references them.
// Only JS that some HTML file actually loads counts against the budget.
const referenced = new Set();
for (const f of files.filter((f) => f.rel.endsWith('.html'))) {
  const html = readFileSync(join(dist, f.rel), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="\/?(_astro\/[^"]+\.js)"/g)) referenced.add(m[1]);
}
const loaded = files.filter((f) => !f.rel.endsWith('.js') || referenced.has(f.rel));

let failed = false;
for (const [pattern, max] of Object.entries(budgets)) {
  const re = new RegExp(pattern);
  const total = loaded.filter((f) => re.test(f.rel)).reduce((s, f) => s + f.gz, 0);
  const ok = total <= max;
  if (!ok) failed = true;
  console.log(
    `${ok ? 'ok  ' : 'OVER'} ${pattern}: ${(total / 1024).toFixed(1)} KB gz (budget ${(max / 1024).toFixed(0)} KB)`,
  );
}
const site = loaded.reduce((s, f) => s + f.gz, 0);
console.log(
  `total site gz: ${(site / 1024 / 1024).toFixed(2)} MB across ${loaded.length} loaded files (${files.length - loaded.length} unreferenced JS chunks ignored)`,
);
if (failed) process.exit(1);
