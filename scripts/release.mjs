#!/usr/bin/env node
// Cuts a release tag that a git dependency installs with no build step (CONTRIBUTING.md "Releases").
//
//   node scripts/release.mjs <version> [--push]      (npm run release -- 0.1.1)
//
// 1. Refuses unless the tree is clean and on `main`, and the tag does not exist yet.
// 2. Sets the version in package.json and plugin/.claude-plugin/plugin.json; commits "Release v<version>" on main when
//    that changed anything.
// 3. Runs the tests, the type check and the build (dist/), and checks the committed plugin bundle is fresh.
// 4. On a detached HEAD on top of that commit: adds dist/ (ignored on main) and replaces package.json by its install-only
//    form – no `scripts` (npm prepares a git dependency with a full devDependency install when it sees `build`,
//    `prepare`, `prepack` or an install script) and no `devDependencies`; commits "v<version> build" and tags it with an
//    annotated tag. main never carries dist/.
// 5. Returns to main. With --push: pushes main and the tag to origin.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const version = args.find((a) => !a.startsWith('--'));
const push = args.includes('--push');
const fail = (msg) => {
  console.error(`release – ${msg}`);
  process.exit(1);
};
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/.test(version)) fail('usage: node scripts/release.mjs <x.y.z> [--push]');
const tag = `v${version}`;

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const run = (cmd, a) => execFileSync(cmd, a, { cwd: ROOT, stdio: 'inherit' });
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (git('status', '--porcelain')) fail('the working tree is not clean – commit or stash first');
if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') fail('run it on main');
if (git('tag', '--list', tag)) fail(`tag ${tag} exists already – a tag is never moved; pick a new version`);

// 2. Version bump on main.
const PKG = join(ROOT, 'package.json');
const PLUGIN = join(ROOT, 'plugin', '.claude-plugin', 'plugin.json');
const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
const plugin = JSON.parse(readFileSync(PLUGIN, 'utf8'));
if (pkg.version !== version || plugin.version !== version) {
  pkg.version = version;
  plugin.version = version;
  writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n');
  writeFileSync(PLUGIN, JSON.stringify(plugin, null, 2) + '\n');
  run(npm, ['install', '--package-lock-only', '--no-audit', '--no-fund']);
  git('add', 'package.json', 'package-lock.json', 'plugin/.claude-plugin/plugin.json');
  git('commit', '-q', '-m', `Release ${tag}`);
}
const mainSha = git('rev-parse', 'HEAD');

// 3. Checks and build (the plugin bundle freshness is part of the tests).
run(npm, ['run', 'typecheck']);
run(npm, ['test']);
run(npm, ['run', 'build']);

// 4. The release commit: main + dist/ + the install-only package.json.
git('checkout', '-q', '--detach');
try {
  const installOnly = { ...pkg };
  delete installOnly.scripts;
  delete installOnly.devDependencies;
  writeFileSync(PKG, JSON.stringify(installOnly, null, 2) + '\n');
  git('add', '-f', 'dist', 'package.json');
  git('commit', '-q', '-m', `${tag} build: dist/ and the install-only package.json (not on main)`);
  git('tag', '-a', tag, '-m', `@crafthall/canon ${tag}`);
  console.log(`release – ${tag} = ${git('rev-parse', 'HEAD')} (on top of main ${mainSha})`);
} finally {
  git('checkout', '-q', '-f', 'main');
}
if (push) {
  git('push', 'origin', 'main', tag);
  console.log(`release – pushed main and ${tag}`);
} else console.log(`release – next: git push origin main ${tag}`);
