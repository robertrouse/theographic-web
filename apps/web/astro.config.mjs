// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { writeFileSync } from 'node:fs';
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

export default defineConfig({
  site: 'https://theographic.netlify.app',
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [react(), sitemap(), netlifyRedirects()],
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
