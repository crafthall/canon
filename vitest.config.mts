import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: 'canon',
    watch: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The real `claude plugin install` test needs the claude binary: vitest.claude.config.mts (npm run test:plugin-install).
    exclude: [...configDefaults.exclude, 'tests/**/*.claude.test.ts'],
    // The CLI end-to-end and fixture-contract tests start Node processes; on a busy machine they take several seconds.
    // The timeout is a hang guard scaled by the machine's measured slowdown (test-kit/hang-guard.setup.ts), with a 20 s base.
    provide: { testTimeoutBase: 20_000 },
    setupFiles: ['./test-kit/hang-guard.setup.ts'],
    reporters: ['default'],
  },
});
