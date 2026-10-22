import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      'server-only': fileURLToPath(new URL('./vitest.empty-module.ts', import.meta.url)),
      'client-only': fileURLToPath(new URL('./vitest.empty-module.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    exclude: ['node_modules/**', 'e2e/**', 'firebase/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts'],
      exclude: ['**/*.test.{ts,tsx}', 'src/app/**', 'src/components/ui/**'],
      thresholds: {
        // DESIGN §26: the pure domain layer keeps ≥ 90% coverage.
        'src/lib/domain/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
      },
    },
  },
});
