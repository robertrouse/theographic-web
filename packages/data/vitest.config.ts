import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'data',
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
