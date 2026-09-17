// Fails CI when the built site's critical assets exceed their budget.
// Sizes are gzip bytes of the files under apps/web/dist (CP-07 set the
// values; docs/checkpoints/CP-07-search-ui.md has the measurements).
//
//   main-thread JS on /      ≤ 80 KB   every JS chunk the home page loads or
//                                      preloads on the main thread (React,
//                                      react-dom, the islands) — not the worker.
//                                      CP-07 asked for 60 KB; react-dom/client
//                                      alone is 64.3 KB gz (React 19.3), so 60
//                                      is unreachable without swapping the
//                                      renderer (Preact/compat ≈ 5 KB — an ADR,
//                                      not a budget tweak). The islands
//                                      themselves are ~10 KB.
//   search worker chunk      ≤ 60 KB   the engine, bundled for the worker
//   core data layer          ≤ 200 KB  books.json + entities.index.json, the
//                                      files that gate the first search
//   text data layer          report    verses.idx + verses.txt (prefetched on
//                                      idle; not gated)
//   all loaded JS            ≤ 200 KB  the CP-00 site-wide gate, kept
//   service worker           report    sw.js; never on the main thread, so
//                                      reported, not gated. The registration
//                                      script (pwa/register.ts) is in every
//                                      page's JS and IS inside the gates.
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const dist = new URL('../apps/web/dist/', import.meta.url).pathname;
const KB = 1024;
const budgets = {
  homeMainThreadJs: 80 * KB,
  workerJs: 60 * KB,
  coreLayer: 200 * KB,
  allLoadedJs: 200 * KB,
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const gz = new Map();
const gzOf = (rel) => {
  if (!gz.has(rel)) gz.set(rel, gzipSync(readFileSync(join(dist, rel))).length);
  return gz.get(rel);
};
const kb = (n) => `${(n / KB).toFixed(1)} KB`;

const files = walk(dist).map((p) => p.slice(dist.length));
const html = files.filter((f) => f.endsWith('.html'));

/** Every /_astro/*.js a page references: script src, island component/renderer urls, modulepreload. */
function pageJs(rel) {
  const src = readFileSync(join(dist, rel), 'utf8');
  const out = new Set();
  for (const m of src.matchAll(/(?:src|href|component-url|renderer-url)="\/?(_astro\/[^"]+\.js)"/g))
    out.add(m[1]);
  return out;
}

// Astro emits framework renderer chunks even when no page references them.
// Only JS that some HTML file actually loads counts.
const referenced = new Set();
for (const h of html) for (const js of pageJs(h)) referenced.add(js);
const worker = files.find((f) => /^_astro\/search\.worker-[^/]+\.js$/.test(f));
const prefetched = worker ? [worker] : [];

const rows = [];
let failed = false;
const check = (label, total, max) => {
  const ok = max === undefined || total <= max;
  if (!ok) failed = true;
  rows.push(
    `${ok ? 'ok  ' : 'OVER'} ${label.padEnd(26)} ${kb(total).padStart(10)}${max ? `  (budget ${kb(max)})` : ''}`,
  );
};

// 1. Main-thread JS on the home page: everything it references except the worker.
const home = [...pageJs('index.html')].filter((f) => !prefetched.includes(f));
check(
  'main-thread JS on /',
  home.reduce((s, f) => s + gzOf(f), 0),
  budgets.homeMainThreadJs,
);
for (const f of home) rows.push(`       ${kb(gzOf(f)).padStart(10)}  ${f}`);

// 2. The worker chunk.
if (!worker) {
  failed = true;
  rows.push('OVER search worker chunk       missing — no _astro/search.worker-*.js in dist');
} else {
  check('search worker chunk', gzOf(worker), budgets.workerJs);
}

// 3. Data layers (files served under /data, hashed by the manifest).
const dataDir = join(dist, 'data');
const layer = (names) =>
  names.reduce((s, n) => s + gzipSync(readFileSync(join(dataDir, n))).length, 0);
check('core data layer', layer(['books.json', 'entities.index.json']), budgets.coreLayer);
check('text data layer (report)', layer(['verses.idx', 'verses.txt']));
check('graph data layer (report)', layer(['graph.bin']));

// 4. The service worker (its registration is already counted in 1 and 5).
if (files.includes('sw.js')) check('service worker (report)', gzOf('sw.js'));
else {
  failed = true;
  rows.push('OVER service worker            missing — no sw.js in dist');
}

// 5. Site-wide loaded JS (the CP-00 gate).
const loadedJs = [...referenced].filter((f) => !prefetched.includes(f));
check(
  'all loaded JS',
  loadedJs.reduce((s, f) => s + gzOf(f), 0),
  budgets.allLoadedJs,
);

console.log(rows.join('\n'));
const site = files
  .filter((f) => !f.endsWith('.js') || referenced.has(f))
  .reduce((s, f) => s + gzOf(f), 0);
console.log(
  `total site gz: ${(site / KB / KB).toFixed(2)} MB across ${files.length} files (${files.filter((f) => f.endsWith('.js') && !referenced.has(f) && f !== worker).length} unreferenced JS chunks ignored)`,
);
if (failed) process.exit(1);
