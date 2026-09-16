// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://theographic.netlify.app',
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [react(), sitemap()],
  build: {
    // Entity pages are many (4,500+); keep each as /path/index.html so
    // Netlify serves clean URLs without a rewrite table.
    format: 'directory',
  },
});
