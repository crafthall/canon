#!/usr/bin/env node
// Builds the package for an installed copy: src/*.ts → dist/*.js + dist/*.d.ts (tsc, tsconfig.build.json). Node does not
// strip TypeScript types inside node_modules and bundlers do not always transform TS from dependencies, so every entry of
// package.json "exports" and the `hub` bin point at dist/. dist/ is not committed on main: scripts/release.mjs builds it
// and commits it only on the release tag's commit, so a git dependency pinned to a tag installs with no build step.
//   node scripts/build.mjs        (npm run build)
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');

rmSync(DIST, { recursive: true, force: true });
execFileSync(process.execPath, [tsc, '-p', join(ROOT, 'tsconfig.build.json')], { stdio: 'inherit', cwd: ROOT });

// tsc rewrites relative `.ts` specifiers in the JS (rewriteRelativeImportExtensions) but keeps them in the .d.ts files;
// point those at the emitted `.js` too, so a consumer's TypeScript resolves them without allowImportingTsExtensions.
for (const f of readdirSync(DIST).filter((n) => n.endsWith('.d.ts'))) {
  const file = join(DIST, f);
  writeFileSync(file, readFileSync(file, 'utf8').replace(/((?:from|import)\s*\(?\s*'\.\.?\/[^']*)\.ts'/g, "$1.js'"));
}

const cli = join(DIST, 'cli.js');
if (!existsSync(cli) || !readFileSync(cli, 'utf8').startsWith('#!/usr/bin/env node')) throw new Error('build: dist/cli.js is missing or has no shebang');
chmodSync(cli, 0o755);
for (const entry of ['index', 'node', 'cli', 'testing']) {
  for (const ext of ['.js', '.d.ts']) if (!existsSync(join(DIST, entry + ext))) throw new Error(`build: dist/${entry}${ext} is missing`);
}
// No relative `.ts` specifier may survive in the output: an installed copy would fail to load it.
for (const f of readdirSync(DIST).filter((n) => n.endsWith('.js') || n.endsWith('.d.ts'))) {
  const text = readFileSync(join(DIST, f), 'utf8');
  if (/(?:from|import)\s*\(?\s*'\.\.?\/[^']*\.ts'/.test(text)) throw new Error(`build: dist/${f} still imports a .ts file`);
}
console.log('product-hub build – dist/ written (JS + .d.ts)');
