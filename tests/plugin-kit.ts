// Helpers shared by the plugin tests: they live in src/testing.ts (the package's `./testing` entry) so a consumer's own
// install test of the plugin can use them too. Kept under the old name for the tests.
export { commandLine, runPluginCommand as runCommand, walk } from '../src/testing.ts';
