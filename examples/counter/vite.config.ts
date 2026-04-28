import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@workflow-ts/core': fileURLToPath(
        new URL('../../packages/core/src/index.ts', import.meta.url),
      ),
      '@workflow-ts/react': fileURLToPath(
        new URL('../../packages/react/src/index.ts', import.meta.url),
      ),
    },
  },
  plugins: [react()],
});
