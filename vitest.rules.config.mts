import { defineConfig } from 'vitest/config';

// Security-rules tests run against the Firestore emulator (pnpm test:rules).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['firebase/tests/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
