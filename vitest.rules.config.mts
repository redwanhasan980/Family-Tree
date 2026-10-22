import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Tests that need the Firestore emulator (pnpm test:rules): the security rules, and
// integration tests (*.emulator.test.ts) that run repositories and commands against it.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      'server-only': fileURLToPath(new URL('./vitest.empty-module.ts', import.meta.url)),
      'client-only': fileURLToPath(new URL('./vitest.empty-module.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['firebase/tests/**/*.test.ts', 'src/**/*.emulator.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
