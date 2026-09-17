// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Writes `public/_redirects` from `src/redirects.ts` so the table has one
 * source (invariant 8). Runs at config time so `dev` and `build` agree; the
 * generated file is committed so a review diff shows what changed.
 * @returns {import('astro').AstroIntegration}
 */
function netlifyRedirects() {
  return {
    name: 'theographic:redirects',
    hooks: {
      'astro:config:setup': async ({ logger }) => {
        const { renderNetlifyRedirects } = await import('./src/redirects.ts');
        const out = fileURLToPath(new URL('./public/_redirects', import.meta.url));
        writeFileSync(out, renderNetlifyRedirects());
        logger.info(`wrote ${out}`);
      },
    },
  };
}

/**
 * Adds `<link rel="modulepreload">` for each island's entry chunk, its
 * renderer and every chunk they statically import, and `<link rel="prefetch">`
 * for the search worker chunk, to every built page. Astro's hydration
 * script discovers the entry chunks after the HTML is parsed and their
 * dependencies (react, the shared search chunk) and the worker one round
 * trip at a time — ~600 ms each on a Slow 4G profile, on the way to the
 * first search. `prefetch` rather than `preload as="worker"`: Chrome does
 * not implement the latter, while a prefetched file is served to the
 * worker from the HTTP cache. Runs after the build so the hashed names
 * are known; the graph is read from the emitted JS (`from"./x.js"` and the
 * worker's `new URL`).
 * @returns {import('astro').AstroIntegration}
 */
function preloadIslandChunks() {
  return {
    name: 'theographic:preload-chunks',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const astroDir = join(root, '_astro');
        /** @type {Map<string, {imports: string[], workers: string[]}>} */
        const graph = new Map();
        for (const name of readdirSync(astroDir)) {
          if (!name.endsWith('.js')) continue;
          const js = readFileSync(join(astroDir, name), 'utf8');
          const imports = [...js.matchAll(/from\s*["'`]\.\/([^"'`]+\.js)["'`]/g)].map((m) => m[1]);
          const workers = [
            ...js.matchAll(/new Worker\(new URL\(["'`]\/_astro\/([^"'`]+\.js)["'`]/g),
          ].map((m) => m[1]);
          graph.set(name, { imports, workers });
        }
        /** @param {string} entry */
        const closure = (entry) => {
          const mods = new Set();
          const workers = new Set();
          const walk = (n) => {
            const g = graph.get(n);
            if (!g) return;
            for (const w of g.workers) workers.add(w);
            for (const i of g.imports) {
              if (mods.has(i)) continue;
              mods.add(i);
              walk(i);
            }
          };
          walk(entry);
          return { mods, workers };
        };
        let pages = 0;
        const walkHtml = (d) => {
          for (const name of readdirSync(d)) {
            const p = join(d, name);
            if (statSync(p).isDirectory()) {
              if (name !== '_astro') walkHtml(p);
              continue;
            }
            if (!name.endsWith('.html')) continue;
            const html = readFileSync(p, 'utf8');
            const entries = [
              ...html.matchAll(/(?:component|renderer)-url="\/_astro\/([^"]+\.js)"/g),
            ].map((m) => m[1]);
            if (entries.length === 0) continue;
            const mods = new Set();
            const workers = new Set();
            for (const e of entries) {
              mods.add(e);
              const c = closure(e);
              for (const m of c.mods) mods.add(m);
              for (const w of c.workers) workers.add(w);
            }
            const links = [
              ...[...mods].map((m) => `<link rel="modulepreload" href="/_astro/${m}">`),
              ...[...workers].map((w) => `<link rel="prefetch" href="/_astro/${w}">`),
            ].join('');
            if (!links) continue;
            writeFileSync(p, html.replace('</head>', `${links}</head>`));
            pages++;
          }
        };
        walkHtml(root);
        logger.info(`preload links added to ${pages} pages`);
      },
    },
  };
}

export default defineConfig({
  site: 'https://theographic.netlify.app',
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [react(), sitemap(), netlifyRedirects(), preloadIslandChunks()],
  build: {
    // Entity pages are many (4,500+); keep each as /path/index.html so
    // Netlify serves clean URLs without a rewrite table.
    format: 'directory',
  },
  vite: {
    define: {
      // Absolute path of the bundles for src/lib/data.ts. Injected here because
      // a built chunk's import.meta.url points into dist/.prerender, not src/.
      __DATA_DIR__: JSON.stringify(fileURLToPath(new URL('./public/data/', import.meta.url))),
    },
    worker: { format: 'es' },
    build: {
      // MapLibre is imported lazily on place pages that have coordinates;
      // its chunk is large by nature and must not trip the chunk warning.
      chunkSizeWarningLimit: 1200,
    },
  },
});
