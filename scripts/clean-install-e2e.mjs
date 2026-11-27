#!/usr/bin/env node
// Clean-install end-to-end test (gate R1-exit (1)): a person with git access to this repository starts the product hub
// in a brand-new repository from a release tag – nothing else on the machine is used.
//
//   node scripts/clean-install-e2e.mjs [--ref v0.1.0] [--repo <git url>] [--keep]     (npm run test:clean-install)
//
// Isolation: a fresh temp folder holds the fixture repository, an empty npm cache (`--cache` via npm_config_cache), an
// empty npm user config and an empty npm global config, and an empty global git config (GIT_CONFIG_GLOBAL), so no npm
// token, npm cache, git setting or checkout of this repository is used. PATH is reduced to the folder of this Node and
// the system folders. HOME stays the user's own: the private repository needs the user's git credentials, and the macOS
// keychain (the system git config's credential.helper osxkeychain) is found through HOME – a fresh HOME cannot read it.
// Nothing is configured or changed for git.
//
// The user path, every command counted (budget: ≤ 10 commands, ≤ 15 minutes in total):
//   git init · npm init -y · npm install --save-dev <repo>#<ref> · npx canon new … · npx canon check --all ·
//   npx canon check --all --json
// After them, without counting, the script asserts: the check exit codes are 0, the JSON report is ok with 0 problems and
// one product, the installed copy is the tag (package.json version, dist/ present, no src/ needed), the entries
// `@crafthall/canon`, `/node`, `/cli` and `/testing` import in plain Node, and the hub files exist.
// Exit 0 = PASS, 1 = FAIL (the first failing step is printed with its output).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const opt = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const REF = opt('--ref', `v${PKG.version}`);
const REPO = opt('--repo', 'git+https://github.com/crafthall/canon.git');
const KEEP = process.argv.includes('--keep');
const MAX_COMMANDS = 10;
const MAX_MS = 15 * 60_000;

const t0 = Date.now();
const base = realpathSync(mkdtempSync(join(tmpdir(), 'hub-clean-install-')));
const home = join(base, 'home');
const cache = join(base, 'npm-cache');
const repo = join(base, 'acme-notes');
for (const d of [home, cache, repo]) mkdirSync(d, { recursive: true });
const userconfig = join(home, '.npmrc');
const globalconfig = join(home, 'npmrc-global');
const gitconfig = join(home, 'gitconfig');
for (const f of [userconfig, globalconfig, gitconfig]) writeFileSync(f, '');

const env = {
  PATH: [dirname(process.execPath), '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':'),
  HOME: process.env.HOME ?? home,
  GIT_CONFIG_GLOBAL: gitconfig,
  npm_config_cache: cache,
  npm_config_userconfig: userconfig,
  npm_config_globalconfig: globalconfig,
  npm_config_update_notifier: 'false',
  npm_config_fund: 'false',
  npm_config_audit: 'false',
  GIT_TERMINAL_PROMPT: '0',
  GIT_AUTHOR_NAME: 'Clean Install',
  GIT_AUTHOR_EMAIL: 'clean-install@example.invalid',
  GIT_COMMITTER_NAME: 'Clean Install',
  GIT_COMMITTER_EMAIL: 'clean-install@example.invalid',
  LANG: 'C',
};

const steps = [];
const failures = [];
function finish(code) {
  const ms = Date.now() - t0;
  console.log('');
  console.log(`commands: ${steps.length} (budget ${MAX_COMMANDS})`);
  console.log(`elapsed:  ${(ms / 1000).toFixed(1)} s (budget ${MAX_MS / 60_000} min)`);
  if (steps.length > MAX_COMMANDS) failures.push(`${steps.length} commands > ${MAX_COMMANDS}`);
  if (ms > MAX_MS) failures.push(`${(ms / 1000).toFixed(0)} s > ${MAX_MS / 1000} s`);
  const ok = code === 0 && failures.length === 0;
  console.log(ok ? `clean-install: PASS – ${REPO}#${REF} in a fresh repository, ${steps.length} commands, ${(ms / 1000).toFixed(1)} s` : `clean-install: FAIL – ${failures.join('; ')}`);
  if (KEEP) console.log(`kept: ${base}`);
  else rmSync(base, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}

/** One counted user command, run in the fixture repository; `ok` = the exit codes it may end with. */
function user(display, cmd, args, ok = [0]) {
  const s = Date.now();
  const r = spawnSync(cmd, args, { cwd: repo, env, encoding: 'utf8', timeout: MAX_MS, maxBuffer: 1 << 26 });
  const ms = Date.now() - s;
  steps.push({ display, ms });
  const status = r.status ?? -1;
  console.log(`${String(steps.length).padStart(2)}. $ ${display}   (${(ms / 1000).toFixed(1)} s, exit ${status})`);
  if (!ok.includes(status)) {
    failures.push(`step ${steps.length} "${display}" exited ${status}`);
    console.log((r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error) : ''));
    finish(1);
  }
  return r;
}
const check = (cond, what) => {
  console.log(`    ${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures.push(what);
};

console.log(`clean-install: ${REPO}#${REF} into ${repo}`);
console.log(`isolation: npm cache ${cache} (empty), empty npm user and global config, empty global git config, PATH = ${env.PATH}; HOME is the user's own (git credentials)`);
console.log('');

user('git init -q', 'git', ['init', '-q']);
user('npm init -y', 'npm', ['init', '-y']);
user(`npm install --save-dev "${REPO}#${REF}"`, 'npm', ['install', '--save-dev', `${REPO}#${REF}`]);
user('npx canon new acme-notes --stage validation --name "Acme Notes" --pitch "Shared notes for small teams"', 'npx', [
  'canon',
  'new',
  'acme-notes',
  '--stage',
  'validation',
  '--name',
  'Acme Notes',
  '--pitch',
  'Shared notes for small teams',
]);
const text = user('npx canon check --all', 'npx', ['canon', 'check', '--all']);
console.log(text.stdout.split('\n').slice(0, 3).map((l) => `    | ${l}`).join('\n'));
const json = user('npx canon check --all --json', 'npx', ['canon', 'check', '--all', '--json']);

// Assertions (not user commands).
let report = null;
try {
  report = JSON.parse(json.stdout);
} catch {
  /* reported below */
}
check(report !== null, 'canon check --json prints one JSON report');
check(report?.ok === true && report?.problems?.length === 0, `report ok with 0 problems (got ok=${report?.ok}, problems=${report?.problems?.length})`);
check(report?.schemaVersion === 1, 'report schemaVersion 1');
check(report?.products?.length === 1 && report.products[0].id === 'acme-notes' && report.products[0].stage === 'validation', 'one product acme-notes at stage validation');
const installed = join(repo, 'node_modules', '@crafthall', 'canon');
const ipkg = existsSync(join(installed, 'package.json')) ? JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8')) : {};
check(`v${ipkg.version}` === REF || !/^v\d/.test(REF), `installed version ${ipkg.version} matches ${REF}`);
check(existsSync(join(installed, 'dist', 'cli.js')) && !existsSync(join(installed, 'src')), 'installed copy runs dist/ (no src/ shipped)');
check(existsSync(join(repo, 'docs', 'product-hub', 'acme-notes', 'README.md')), 'docs/product-hub/acme-notes/README.md created');
const lock = JSON.parse(readFileSync(join(repo, 'package-lock.json'), 'utf8'));
const resolved = lock.packages?.['node_modules/@crafthall/canon']?.resolved ?? '';
check(/#[0-9a-f]{40}$/.test(resolved), `package-lock pins a commit (${resolved})`);
const imp = spawnSync(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    "const a = await import('@crafthall/canon'); const n = await import('@crafthall/canon/node'); const c = await import('@crafthall/canon/cli'); const t = await import('@crafthall/canon/testing'); console.log([a.STAGES.length, typeof n.nodeSource, typeof c.runCheck, t.fixtures().length].join(','));",
  ],
  { cwd: repo, env, encoding: 'utf8' },
);
check(imp.status === 0 && imp.stdout.trim() === '8,function,function,5', `entries import in plain Node (${(imp.stdout + imp.stderr).trim()})`);
finish(0);
