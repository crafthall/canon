// The shared fixture hubs' API lives in src/testing.ts (the package's `./testing` entry, built to dist/testing.js); the
// hubs and their expectations stay here in tests/fixtures/hubs/. Kept so the tests import it by its old path.
export * from '../../src/testing.ts';
