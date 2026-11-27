import { defineConfig } from 'vitest/config';

// The plugin-install end-to-end test: needs the real `claude` binary, so it is not in the default `npm test`
// (vitest.config.mts excludes *.claude.test.ts). Run: npm run test:plugin-install
export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: 'canon-claude',
    watch: false,
    environment: 'node',
    include: ['tests/**/*.claude.test.ts'],
    // Same load-scaled hang guard as vitest.config.mts; `claude plugin` runs take seconds each on a busy machine.
    provide: { testTimeoutBase: 60_000 },
    setupFiles: ['./test-kit/hang-guard.setup.ts'],
    reporters: ['default'],
  },
});
