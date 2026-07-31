import path from 'node:path';

import { defineConfig } from 'vitest/config';

/**
 * Integration tests only. These need a real Neon branch and a running
 * server, so they are kept out of `npm test` — see vitest.config.mts.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    globalSetup: ['./vitest.integration.setup.mts'],
    setupFiles: ['./vitest.integration.env.ts'],
    // Neon is a network round trip away and dev-server routes compile on
    // first hit; the defaults are too tight for both.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // One database, shared rows. Files run one at a time.
    fileParallelism: false,
  },
});
