#!/usr/bin/env node
// Replay of the pricing-reversal worked example (steps.md). Builds a throwaway git repository from before/,
// commits it, runs `canon check supperwick` and asserts the deterministic `topic` problem; then replaces the hub with
// after/, commits the fix, reruns and asserts a clean check. Prints a short transcript; exits 0 when every assertion
// holds, 1 otherwise. Needs only Node 24 (runs the package's own src/cli.ts with native type stripping) and git.
//
// usage: node examples/pricing-reversal/replay.mjs [--keep]
//   --keep  leave the temporary repository on disk and print its path
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HERE = import.meta.dirname;
const CLI = join(HERE, '../../src/cli.ts');
const ID = 'supperwick';
const HUB = `docs/product-hub/${ID}`;
// The story's date (the fix lands 2026-04-22): pinned so freshness findings never depend on the day the replay runs.
const TODAY = '2026-04-25';
const EXPECTED_TOPIC =
  'docs/product-hub/supperwick: topic "free and paid plans" is a main section in business-product/monetization.md and business-product/releases/r1-launch.md – keep it in one page and link from the others';
const EXPECTED_CHANGED = [`${HUB}/README.md`, `${HUB}/business-product/features/README.md`, `${HUB}/business-product/releases/r1-launch.md`];
const STALE_PLAN_CELL = 'Plus only (ADR-0001)';

const keep = process.argv.includes('--keep');
const failures = [];
const check = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

const repo = realpathSync(mkdtempSync(join(tmpdir(), 'hub-pricing-reversal-')));
const git = (...args) => {
  const r = spawnSync('git', ['-c', 'user.name=Replay', '-c', 'user.email=replay@example.invalid', '-c', 'commit.gpgsign=false', ...args], {
    cwd: repo,
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
};
const hubCheck = (...extra) => spawnSync(process.execPath, [CLI, 'check', ID, '--today', TODAY, ...extra], { cwd: repo, encoding: 'utf8' });
const report = () => {
  const r = hubCheck('--json');
  return { code: r.status, json: JSON.parse(r.stdout) };
};

try {
  console.log(`replay: pricing-reversal in ${keep ? repo : 'a temporary git repository'} (canon check --today ${TODAY})`);
  git('init', '-q');

  console.log('\n1. Commit 1 – the reversal, half applied (before/)');
  cpSync(join(HERE, 'before'), repo, { recursive: true });
  git('add', '-A');
  git('commit', '-q', '-m', 'Reverse the pricing decision (ADR-0002), half applied');
  const textBefore = hubCheck();
  console.log((textBefore.stdout + textBefore.stderr).trimEnd().replace(/^/gm, '   > '));
  const before = report();
  check(textBefore.status === 1 && before.code === 1, `canon check exits 1 (text ${textBefore.status}, --json ${before.code})`);
  check(before.json.ok === false, '--json ok: false');
  check(before.json.counts.problems === 1 && before.json.counts.findings === 0, `counts: ${before.json.counts.problems} problem(s), ${before.json.counts.findings} finding(s) (want 1, 0)`);
  const [problem] = before.json.problems;
  check(problem?.rule === 'topic' && problem?.message === EXPECTED_TOPIC, `the one problem is rule "topic": ${problem?.message}`);

  console.log('\n2. Review – the stale catalog cell no rule can see');
  const catalog = (p) => readFileSync(join(repo, HUB, 'business-product/features/README.md'), 'utf8').includes(p);
  check(catalog(STALE_PLAN_CELL), `features/README.md still says "${STALE_PLAN_CELL}"`);

  console.log('\n3. Commit 2 – the fix (after/)');
  rmSync(join(repo, 'docs'), { recursive: true, force: true });
  cpSync(join(HERE, 'after'), repo, { recursive: true });
  git('add', '-A');
  git('commit', '-q', '-m', 'Finish the pricing reversal: catalog, release plan, changelog');
  const changed = git('diff', '--name-only', 'HEAD~1', 'HEAD').split('\n').filter(Boolean).sort();
  check(JSON.stringify(changed) === JSON.stringify([...EXPECTED_CHANGED].sort()), `exactly 3 files change: ${changed.join(', ')}`);
  check(!catalog(STALE_PLAN_CELL), 'the stale Plan cell is gone');

  console.log('\n4. Rerun');
  const textAfter = hubCheck();
  console.log((textAfter.stdout + textAfter.stderr).trimEnd().replace(/^/gm, '   > '));
  const after = report();
  check(textAfter.status === 0 && after.code === 0, `canon check exits 0 (text ${textAfter.status}, --json ${after.code})`);
  check(after.json.ok === true, '--json ok: true');
  check(after.json.counts.problems === 0 && after.json.counts.findings === 0, `counts: ${after.json.counts.problems} problem(s), ${after.json.counts.findings} finding(s) (want 0, 0)`);
} catch (e) {
  failures.push(String(e?.message ?? e));
  console.error(`\nreplay error: ${e?.message ?? e}`);
} finally {
  if (!keep) rmSync(repo, { recursive: true, force: true });
}

console.log(failures.length === 0 ? '\nreplay: PASS – before: 1 topic problem; after: 0 problems, 0 findings.' : `\nreplay: FAIL – ${failures.length} check(s) failed.`);
process.exit(failures.length === 0 ? 0 : 1);
