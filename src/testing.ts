/**
 * Shared fixture hubs (ADR-0002): small fictional repository roots under hubs/<name>/ that every release form of
 * the product hub – the `canon` CLI, the standalone Claude Code plugin and the HQ module – runs its
 * contract test against. Each fixture has a checked-in expectation, hubs/<name>.expected.json: the exit code of
 * `canon check --all --json --root <fixture>` and the contract view of its report (`contractView`): problems, every
 * product's stage, completeness and findings. A release form passes the contract when, for every fixture, it reports
 * exactly that. The fixtures and the expectations are described in tests/fixtures/hubs/README.md; the test that holds the core and
 * the CLI to them is tests/fixtures.test.ts.
 *
 * `FINDING_BRANCHES` names every place the readers create a health finding (src/readers.ts), so a test can show that
 * the fixtures reach each one and that no report carries a finding nobody listed. No test framework imports here – the
 * plugin and the HQ module import this file from their own tests.
 */
import { spawnSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { CheckRule } from './check.ts';
import type { FindingKind } from './readers.ts';
import type { HubReport } from './report.ts';

/** Folder that holds the fixture repository roots and their expectations. */
export const HUBS_DIR = join(import.meta.dirname, '..', 'tests', 'fixtures', 'hubs');

/** The fixtures, in the order of hubs/README.md. */
export const FIXTURE_NAMES = ['complete', 'early', 'empty', 'drifted', 'drifted-variants'] as const;
export type FixtureName = (typeof FIXTURE_NAMES)[number];

/**
 * The `today` the core tests pass (the experiments overdue rule). The fixtures are built so that every today from
 * 2026-01-16 to 2099-12-31 gives the same report: `drifted` has one experiment due 2026-01-15 without a result, and
 * `complete` has its open experiment due 2099-12-31. So `canon check` with the real date (the CLI default) equals the core
 * at this date; a release form may pass either.
 */
export const FIXTURE_TODAY = '2026-11-26';

/** The fixture that holds every structure rule and every health check exactly once. */
export const EXACTLY_ONCE_FIXTURE: FixtureName = 'drifted';

/** What a release form must report for a fixture: the shape `contractView` returns, plus the exit code. */
export interface ContractView {
  ok: boolean;
  counts: HubReport['counts'];
  problems: { rule: CheckRule; file: string; message: string }[];
  products: { id: string; stage: string | null; completeness: number | null; done: number; total: number; findings: { kind: FindingKind; area: string; text: string; file: string }[] }[];
  errors: string[];
}
export interface FixtureExpectation extends ContractView {
  fixture: FixtureName;
  /** Exit code of `canon check --all --json --root <fixture>` (and of the text mode). */
  exitCode: 0 | 1;
}

export interface Fixture {
  name: FixtureName;
  /** Absolute path of the fixture's repository root (pass it as `--root`). */
  root: string;
  expected: FixtureExpectation;
}

/** Every fixture with its root and its expectation. */
export function fixtures(): Fixture[] {
  return FIXTURE_NAMES.map((name) => ({ name, root: join(HUBS_DIR, name), expected: JSON.parse(readFileSync(join(HUBS_DIR, `${name}.expected.json`), 'utf8')) as FixtureExpectation }));
}

/** The part of a `canon check --json` report the contract fixes (the rest – titles, rows, features – may grow). */
export function contractView(report: HubReport): ContractView {
  return {
    ok: report.ok,
    counts: report.counts,
    problems: report.problems.map(({ rule, file, message }) => ({ rule, file, message })),
    products: report.products.map((p) => ({ id: p.id, stage: p.stage, completeness: p.completeness, done: p.health.done, total: p.health.total, findings: p.findings.map(({ kind, area, text, file }) => ({ kind, area, text, file })) })),
    errors: report.errors,
  };
}

/** One place in src/readers.ts that creates a finding: its health check (model.ts HEALTH_CHECKS), kind, area and wording. */
export interface FindingBranch {
  id: string;
  /** The HEALTH_CHECKS row it belongs to; null only for a branch in UNREACHABLE_BRANCHES (see hubs/README.md). */
  check: string | null;
  kind: FindingKind;
  /** The matrix row it blocks; null when it depends on the page (draft pages). */
  area: string | null;
  match: RegExp;
}

export const FINDING_BRANCHES: readonly FindingBranch[] = [
  { id: 'readme-parse', check: 'readme-meta', kind: 'inconsistent', area: 'overview', match: /^README front matter does not parse: / },
  { id: 'readme-product', check: 'readme-meta', kind: 'inconsistent', area: 'overview', match: /^README says product “[^”]*” in folder “[^”]*”\.$/ },
  { id: 'readme-status', check: 'readme-meta', kind: 'inconsistent', area: 'overview', match: /^README status “[^”]*” is not one of / },
  { id: 'catalog-row-without-file', check: 'catalog-orphan', kind: 'missing', area: 'catalog', match: /^Feature table links features\/[a-z0-9-]+\.md, which does not exist\.$/ },
  { id: 'catalog-status-mismatch', check: 'catalog-mismatch', kind: 'inconsistent', area: 'catalog', match: /^“[^”]*” is [a-z]+ in its file but [a-z]+ in the feature table\.$/ },
  { id: 'catalog-duplicate-row', check: 'catalog-orphan', kind: 'inconsistent', area: 'catalog', match: /^features\/[a-z0-9-]+\.md is the first link of \d+ rows in the feature table \(duplicate rows\)\.$/ },
  { id: 'feature-status', check: 'feature-status', kind: 'inconsistent', area: 'catalog', match: /^“[^”]*” has status “[^”]*”; use one of specified, / },
  { id: 'foreign-feature', check: 'foreign-feature', kind: 'inconsistent', area: 'catalog', match: /^“[^”]*” says product “[^”]*”, not “[^”]*”\.$/ },
  { id: 'feature-without-row', check: 'catalog-orphan', kind: 'missing', area: 'catalog', match: /^“[^”]*” has a feature file but no row in the feature table\.$/ },
  { id: 'feature-parse', check: 'feature-status', kind: 'inconsistent', area: 'catalog', match: /^Front matter does not parse: / },
  { id: 'adr-status', check: 'adr-status', kind: 'inconsistent', area: 'adr', match: /^ADR-\d+ has status “[^”]*”; use one of / },
  { id: 'adr-no-successor', check: 'adr-supersession', kind: 'inconsistent', area: 'adr', match: /^ADR-\d+ is superseded but names no successor\.$/ },
  { id: 'adr-dangling-successor', check: 'adr-supersession', kind: 'missing', area: 'adr', match: /^ADR-\d+ is superseded by ADR-\d+, which does not exist\.$/ },
  { id: 'adr-one-sided-successor', check: 'adr-supersession', kind: 'inconsistent', area: 'adr', match: /^ADR-\d+ names ADR-\d+ as successor, but ADR-\d+ does not list it under supersedes\.$/ },
  { id: 'adr-dangling-supersedes', check: 'adr-supersession', kind: 'missing', area: 'adr', match: /^ADR-\d+ supersedes ADR-\d+, which does not exist\.$/ },
  { id: 'adr-one-sided-supersedes', check: 'adr-supersession', kind: 'inconsistent', area: 'adr', match: /^ADR-\d+ supersedes ADR-\d+, but ADR-\d+ does not name it as successor\.$/ },
  { id: 'plan-missing', check: 'plan-missing', kind: 'missing', area: 'business-plan', match: /^README names business plan “[^”]*”, which was not found / },
  { id: 'candidate-dangling', check: 'catalog-orphan', kind: 'missing', area: 'catalog', match: /^Candidate “[^”]*” links features\/[a-z0-9-]+\.md, which does not exist\.$/ },
  { id: 'launch-task-status', check: 'launch-task-status', kind: 'inconsistent', area: 'roadmap', match: /^Launch task “[^”]*” has status “[^”]*”; start it with open, in progress or done\.$/ },
  { id: 'workflow-incomplete', check: 'workflow-incomplete', kind: 'missing', area: 'ai-workflow', match: /^AI & development workflow is incomplete: / },
  { id: 'draft-page', check: 'draft-page', kind: 'stale', area: null, match: / is still a draft \(status: draft\) – write the real content and set status: current\.$/ },
  // the hub README and feature pages mark a draft with `draft: true` (their status is a stage or feature status).
  { id: 'draft-flag-readme', check: 'draft-page', kind: 'stale', area: 'overview', match: /^Product README is still a draft \(draft: true\) – confirm the content and remove draft: true\.$/ },
  { id: 'draft-flag-feature', check: 'draft-page', kind: 'stale', area: 'catalog', match: /^Feature “[^”]*” is still a draft \(draft: true\) – confirm the content and remove draft: true\.$/ },
  { id: 'rule-grades', check: null, kind: 'inconsistent', area: 'technical', match: /^Rule grades: / },
  { id: 'feature-newer', check: 'feature-newer', kind: 'stale', area: 'overview', match: /^A feature file was updated on \S+, after the product README \(\S+\)\.$/ },
  { id: 'experiment-overdue', check: 'experiment-overdue', kind: 'stale', area: 'experiments', match: /^Experiment “[^”]*” is past its revisit-by date \(\d{4}-\d{2}-\d{2}\) with no result – record the result or set a new date\.$/ },
];

/**
 * Branches no fixture reaches, with the reason. `rule-grades` needs the host's rules hook (Spark Hall's
 * buildRuleGrades); `canon check` never passes one, so no release form can report it.
 */
export const UNREACHABLE_BRANCHES: Readonly<Record<string, string>> = {
  'rule-grades': 'needs a host rules hook (loadProductDocs `rules`); canon check --json never passes one',
};

/**
 * HEALTH_CHECKS rows that are not findings: `missing-page` is a health row state ("missing"), not a finding, so the
 * fixtures show it through a row, not through `findings`.
 */
export const NON_FINDING_CHECKS: Readonly<Record<string, string>> = {
  'missing-page': 'a health row with state "missing" (business-plan and ai-workflow in drifted), never a finding',
};

/** The branch ids a finding matches (exactly one for every finding the readers create today). */
export const branchesOf = (f: { text: string }): string[] => FINDING_BRANCHES.filter((b) => b.match.test(f.text)).map((b) => b.id);

// --- Plugin test helpers (tests/plugin.test.ts, tests/plugin-install.claude.test.ts, and a consumer's own install test
// of the plugin from its marketplace). No test framework imports.

export { PLUGIN_NAME, formatPluginReport } from './plugin-runner.ts';

/** The package's Claude Code plugin folder (plugin/: manifest, command, skills, bundled runner, template). */
export const PLUGIN_DIR = join(import.meta.dirname, '..', 'plugin');

/** Every path under `dir` (files and links, not followed), relative, sorted. */
export function walk(dir: string, base = dir): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((n) => {
      const p = join(dir, n);
      return lstatSync(p).isDirectory() ? walk(p, base) : [relative(base, p)];
    });
}

/** The shell line of the plugin's check command (the `!` + backticks line of commands/check.md). */
export function commandLine(commandFile: string): string {
  const m = readFileSync(commandFile, 'utf8').match(/^!`(.+)`$/m);
  if (!m) throw new Error(`${commandFile}: no !\`…\` line`);
  return m[1]!;
}

/**
 * Runs `/crafthall-canon:check <args>` the way Claude Code runs the command's `!` line: ${CLAUDE_PLUGIN_ROOT} and
 * $ARGUMENTS replaced, the line run by a shell in `cwd`, with only PATH and HOME in the environment. `code` is the
 * exit code the line prints last; `out` is what came before it.
 */
export function runPluginCommand(pluginRoot: string, args: string, cwd: string, env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '', HOME: cwd }) {
  const line = commandLine(join(pluginRoot, 'commands', 'check.md')).replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginRoot).replaceAll('$ARGUMENTS', args);
  const r = spawnSync('/bin/sh', ['-c', line], { cwd, encoding: 'utf8', env });
  const m = r.stdout.match(/\ncrafthall-canon exit code: (\d+)\n$/);
  return { shellStatus: r.status, code: m ? Number(m[1]) : null, out: m ? r.stdout.slice(0, m.index) : r.stdout, raw: r.stdout + r.stderr };
}
