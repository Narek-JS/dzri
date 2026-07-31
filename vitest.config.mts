import path from 'node:path';

import { defineConfig } from 'vitest/config';

/**
 * Unit tests only — no database, no server, no network. `npm test` has to
 * run on a machine with no secrets, so anything needing Neon lives in a
 * `*.integration.test.ts` file and runs from vitest.integration.config.ts.
 */
export default defineConfig({
  resolve: {
    // Mirrors the `@/*` path in tsconfig.json.
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/*.integration.test.ts'],
    setupFiles: ['./vitest.setup.unit.ts'],
  },
});
