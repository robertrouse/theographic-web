import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/web'],
    reporters: process.env.CI ? ['default', 'github-actions'] : ['default'],
  },
});
