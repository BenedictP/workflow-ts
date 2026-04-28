import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@workflow-ts/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    globals: true,
    environment: 'happy-dom',
    testTimeout: 10000,
    hookTimeout: 10000,
    setupFiles: ['./test/setup.ts'],
  },
});
