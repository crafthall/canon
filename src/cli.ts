#!/usr/bin/env node
/**
 * `hub` – the Crafthall Canon command line (bin of @crafthall/canon):
 *   canon new <id> [--stage idea|validation|building|live] [--name "<Name>"] [--pitch "<one line>"] [--team <id>]
 *               [--app <nx-project>[:<role>]]... [--plan <business-plan-id>] [--issue <N>] [--dry-run] [--root <dir>]
 *   canon check <id>|--all [--json] [--root <dir>] [--hub-dir <dir>] [--plans-dir <dir>] [--today <YYYY-MM-DD>]
 *   canon init <id> [the canon new options] [--json] [--hq <file>] [--no-hq] [--no-agent-rules] [--no-bootstrap]   (*               src/init.ts: canon new → bootstrap note → agent rules → Crafthall HQ check offline → Optimize → summary)
 * Exit codes: 0 = OK (created, or no problem), 1 = refused or problems found, 2 = usage error, 3 = internal error
 * (an exception the command did not expect – a bug or an unreadable file; one line on stderr, no report on stdout, so
 * it never reads as "problems found"). A project package.json that is not JSON is a problem (rule package-json), not 3.
 * `--json` prints the report of report.ts (schemaVersion, problems, hub model) – the contract for the plugin and the
 * HQ module; its schema is schema/hub-check.schema.json. A host (Spark's npm scripts) calls `runNew` / `runCheck`
 * with its own labels and host-only options; the command line itself has none of them. `--today` (default: the real
 * date, UTC) is the date the experiments overdue rule compares `revisit-by` with – the core itself has no clock.
 */
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { legacyHubNotice, resolveHubDir } from './model.ts';
import { checkHub } from './check.ts';
import { hubReport } from './report.ts';
import { isIsoDate } from './readers.ts';
import { describeAction, parseNewArgs, planNew, PLANS_DIR, subSource, type PlanNewOptions, type ScaffoldSummary } from './scaffold.ts';
import { overlaySource } from './source.ts';
import { applyPlan, BUNDLED_TEMPLATE_DIR, nodeSource, planReferences } from './node.ts';
import { findHq, listRepoFiles, nodeOptimize, runHqOffline } from './init-node.ts';
import { formatInitSummary, initProject, type InitOptions, type InitPorts } from './init.ts';

export interface Io {
  log?: (s: string) => void;
  err?: (s: string) => void;
}

export const USAGE_NEW = 'usage: canon new <id> [--stage idea|validation|building|live] [--name "<Name>"] [--pitch "<one line>"] [--team <id>] [--app <nx-project>[:<role>]]... [--plan <business-plan-id>] [--issue <N>] [--dry-run] [--root <dir>]';
export const USAGE_CHECK = 'usage: canon check <id>|--all [--json] [--root <dir>] [--hub-dir <dir>] [--plans-dir <dir>] [--today <YYYY-MM-DD>]';
export const USAGE_INIT = 'usage: canon init <id> [the canon new options] [--json] [--hq <file>] [--no-hq] [--no-agent-rules] [--no-bootstrap]';
const USAGE = `${USAGE_NEW}\n${USAGE_CHECK}\n${USAGE_INIT}`;

export interface CheckHostOptions extends Io {
  /** Repo root when `--root` is not given (default: the working directory). */
  root?: string;
  /** Prefix of every printed line (default `canon check`). */
  label?: string;
  usage?: string;
  /** Command named in the "tagged without a hub" problem (default `canon new`). */
  newCommand?: string;
  /** Today as YYYY-MM-DD when `--today` is not given (default: the real date, UTC). */
  today?: string;
}

/** Exit code of an internal error (an unexpected exception): distinct from 1 = problems found. */
export const EXIT_INTERNAL = 3;

/** Runs a command; an unexpected exception becomes one stderr line and exit code 3. */
function guarded(label: string, err: (s: string) => void, run: () => number): number {
  try {
    return run();
  } catch (e) {
    err(`${label} – internal error: ${e instanceof Error ? e.message : String(e)}`);
    return EXIT_INTERNAL;
  }
}

/** The hub folder of `root` (docs/crafthall/canon, or the legacy docs/product-hub with a notice on stderr). */
function hubDirOf(root: string, label: string, err: (line: string) => void): string {
  const { hubDir, legacy } = resolveHubDir((p) => nodeSource(root).isDir(p));
  if (legacy) err(`${label} – note: ${legacyHubNotice()}`);
  return hubDir;
}

/** `canon check`: returns the exit code. */
export function runCheck(argv: readonly string[], o: CheckHostOptions = {}): number {
  const { label = 'canon check', err = console.error } = o;
  return guarded(label, err, () => check(argv, o));
}

function check(argv: readonly string[], { root: defaultRoot = process.cwd(), label = 'canon check', usage = USAGE_CHECK, newCommand, today: defaultToday, log = console.log, err = console.error }: CheckHostOptions): number {
  let only: string | null = null;
  let all = false;
  let json = false;
  let root = defaultRoot;
  let hubDir: string | null = null;
  let plansDir: string | null = null;
  let today = defaultToday ?? new Date().toISOString().slice(0, 10);
  const fail = (msg: string) => {
    err(`${label} – ${msg} (${usage})`);
    return 2;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') all = true;
    else if (a === '--json') json = true;
    else if (a === '--root' || a === '--hub-dir' || a === '--plans-dir' || a === '--today') {
      const v = argv[++i];
      if (v == null || v.startsWith('--')) return fail(`${a} needs a value`);
      if (a === '--today') {
        if (!isIsoDate(v)) return fail(`--today must be a date YYYY-MM-DD, got "${v}"`);
        today = v;
      } else if (a === '--root') root = resolve(v);
      else if (a === '--hub-dir') hubDir = v.replace(/\/+$/, '');
      else plansDir = v.replace(/\/+$/, '');
    } else if (a.startsWith('--')) return fail(`unknown option ${a}`);
    else if (only == null) only = a;
    else return fail(`unexpected argument "${a}"`);
  }
  if (only && all) return fail('give a product id or --all, not both');
  if (!only && !all) return fail('missing <id> or --all');
  if (hubDir == null) hubDir = hubDirOf(root, label, err);
  if (only && !existsSync(join(root, hubDir, only))) {
    err(`${label} – no product folder ${hubDir}/${only} (${usage})`);
    return 2;
  }
  const source = nodeSource(root);
  if (json) {
    const report = hubReport(source, { hubDir, only, plansDir, newCommand, today, template: nodeSource(BUNDLED_TEMPLATE_DIR) });
    log(JSON.stringify(report, null, 2));
    return report.ok ? 0 : 1;
  }
  const { products, problems } = checkHub(source, { hubDir, only, newCommand, template: nodeSource(BUNDLED_TEMPLATE_DIR) });
  if (problems.length) {
    err(`${label} – ${problems.length} problem(s):\n  - ${problems.map((p) => p.message).join('\n  - ')}`);
    return 1;
  }
  log(`${label} – OK (${only ? only : `${products} product folder(s)`}): structure, lifecycle files, links, catalog, ADR index, app tags, one topic per page.`);
  return 0;
}

export interface NewHostOptions extends Io, Pick<PlanNewOptions, 'teams' | 'movedPathsFile' | 'plansDir' | 'hubDir'> {
  root?: string;
  /** Prefix of the printed lines and the command named in messages (default `canon new`). */
  label?: string;
  /** Command named in the changelog line and the "never overwrites" refusal (default `canon new`). */
  command?: string;
  usage?: string;
  /** How the closing check is named (default `canon check`). */
  checkLabel?: string;
  newCommand?: string;
  defaultTeam?: string | null;
  /** Prefixes of files to leave out of the "still names the old plan folder" list. */
  ignoreReferences?: readonly string[];
  /** The closing "Next:" line (default: write the drafts, run canon check). */
  next?: (summary: ScaffoldSummary) => string;
  today?: string;
}

/** `canon new`: returns the exit code. */
export function runNew(argv: readonly string[], o: NewHostOptions = {}): number {
  const { label = 'canon new', err = console.error } = o;
  return guarded(label, err, () => scaffold(argv, o).code);
}

/** `canon new` returning its summary too (`canon init` builds on it); `summary` is null unless the code is 0. */
function scaffold(argv: readonly string[], o: NewHostOptions): { code: number; summary: ScaffoldSummary | null } {
  const r = (code: number, summary: ScaffoldSummary | null = null) => ({ code, summary });
  const { root: defaultRoot = process.cwd(), label = 'canon new', command = 'canon new', usage = USAGE_NEW, checkLabel = 'canon check', newCommand, defaultTeam = null, ignoreReferences = [], next, today, log = console.log, err = console.error, teams, movedPathsFile, plansDir = PLANS_DIR } = o;
  const parsed = parseNewArgs(argv, { defaultTeam });
  if (parsed.error != null) {
    err(`${label} – ${parsed.error}\n${usage}`);
    return r(2);
  }
  const { opts } = parsed;
  const root = opts.root ? resolve(opts.root) : defaultRoot;
  const hubDir = o.hubDir ?? hubDirOf(root, label, err);
  const source = nodeSource(root);
  // The repo's own template pages win, page by page; every page it does not have comes from the package's template.
  const own = source.isDir(`${hubDir}/_template`);
  const bundled = nodeSource(BUNDLED_TEMPLATE_DIR);
  const template = own ? overlaySource(subSource(source, `${hubDir}/_template`), bundled) : bundled;
  const templateLabel = own ? `${hubDir}/_template (over the @crafthall/canon template)` : '@crafthall/canon template';
  const plan = planNew(source, opts, { ...(today ? { today } : {}), hubDir, teams, plansDir, movedPathsFile, command, template, templateLabel });
  if (plan.errors.length) {
    err(`${label} – refused, nothing written:\n  - ${plan.errors.join('\n  - ')}`);
    return r(1);
  }
  const s = plan.summary as ScaffoldSummary;
  log(`${label} – ${opts.dryRun ? 'dry run, nothing written' : 'creating'} ${s.name} (${s.id}) at ${s.stageLabel} (status: ${s.status}):`);
  for (const a of plan.actions) log(`  ${describeAction(a)}`);
  if (opts.dryRun) return r(0, s);
  applyPlan(root, plan.actions);
  if (s.plan) {
    const refs = planReferences(root, `${plansDir}/${s.plan}`, [...(movedPathsFile ? [movedPathsFile] : []), ...ignoreReferences]);
    if (refs.length) log(`${label} – these files still name ${plansDir}/${s.plan}/ – point them at ${s.dir}/business-product/:\n  - ${refs.join('\n  - ')}`);
  }
  const { problems } = checkHub(nodeSource(root), { hubDir, only: s.id, newCommand, template: bundled });
  if (problems.length) {
    err(`${label} – created, but ${checkLabel} ${s.id} found ${problems.length} problem(s):\n  - ${problems.map((p) => p.message).join('\n  - ')}`);
    return r(1);
  }
  log(`${checkLabel} ${s.id} – OK.`);
  const nextLine = next ? next(s) : `Next: write the draft pages (they show as "requires review" until status: current), then run canon check ${s.id}.`;
  if (nextLine) log(nextLine);
  return r(0, s);
}

export interface InitHostOptions extends NewHostOptions {
  /** Prefix of the printed lines (default `canon init`). */
  initLabel?: string;
  initUsage?: string;
  /** Agent-rules snippet: true (default) adds it; a string skips it with that reason (e.g. the repo's rules already hold it). */
  agentRules?: true | string;
  /** The check command the snippet names (default `canon check --all`). */
  checkCommand?: string;
  /** Bootstrap scope (default `repo`); `apps` = only the `--app` folders count as content. */
  bootstrap?: InitOptions['bootstrap'];
  bootstrapHint?: string;
  /** HQ file used when `--hq` is not given (a host's own copy); default: find the plugin or PATH. */
  hq?: string | null;
  hqCommand?: string;
  /** Ports a test or host replaces (default: the Node ones). */
  ports?: Partial<Pick<InitPorts, 'hq' | 'optimize' | 'files'>>;
  env?: NodeJS.ProcessEnv;
}

/** `canon init`: returns the exit code (0 initialised, 1 refused or a step failed, 2 usage error, 3 internal error). */
export function runInit(argv: readonly string[], o: InitHostOptions = {}): number {
  const { initLabel = 'canon init', err = console.error } = o;
  return guarded(initLabel, err, () => init(argv, o));
}

function init(argv: readonly string[], o: InitHostOptions): number {
  const { initLabel = 'canon init', initUsage = USAGE_INIT, log = console.log, err = console.error, env = process.env, newCommand } = o;
  let json = false;
  let hqFlag: string | null = o.hq ?? null;
  let noHq = false;
  let agentRules: true | string = o.agentRules ?? true;
  let bootstrap: InitOptions['bootstrap'] = o.bootstrap ?? 'repo';
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') json = true;
    else if (a === '--no-hq') noHq = true;
    else if (a === '--no-agent-rules') agentRules = 'turned off (--no-agent-rules)';
    else if (a === '--no-bootstrap') bootstrap = { skip: 'turned off (--no-bootstrap)' };
    else if (a === '--hq') {
      const v = argv[++i];
      if (v == null || v.startsWith('--')) {
        err(`${initLabel} – --hq needs a file (${initUsage})`);
        return 2;
      }
      hqFlag = v;
    } else rest.push(a);
  }
  const parsed = parseNewArgs(rest, { defaultTeam: o.defaultTeam ?? null });
  if (parsed.error != null) {
    err(`${initLabel} – ${parsed.error}\n${initUsage}`);
    return 2;
  }
  const root = parsed.opts.root ? resolve(parsed.opts.root) : (o.root ?? process.cwd());
  // Resolved once here, so scaffold (called with the same options) does not print the legacy notice a second time.
  const hubDir = o.hubDir ?? hubDirOf(root, initLabel, err);
  o = { ...o, hubDir };
  const today = o.today ?? new Date().toISOString().slice(0, 10);
  const captured: string[] = [];
  const ports: InitPorts = {
    scaffold: () => {
      const r = scaffold(rest, { ...o, root, label: o.label ?? initLabel, command: o.command ?? 'canon init', next: () => '', log: (l) => captured.push(...l.split('\n')), err: (l) => captured.push(...l.split('\n')) });
      return { code: r.code, summary: r.summary, lines: captured.filter((l) => l.trim()) };
    },
    files: o.ports?.files ?? (() => listRepoFiles(root)),
    source: () => nodeSource(root),
    write: (p, text) => {
      const f = join(root, p);
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, text);
    },
    hq:
      o.ports?.hq ??
      (() => {
        if (noHq) return { kind: 'missing', message: 'turned off (--no-hq)' };
        const loc = findHq({ flag: hqFlag, env, cwd: o.root ?? process.cwd() });
        return 'missing' in loc ? { kind: 'missing', message: loc.missing } : runHqOffline(root, loc, env);
      }),
    optimize: o.ports?.optimize ?? nodeOptimize,
    check: (id) => {
      const report = hubReport(nodeSource(root), { hubDir, only: id, newCommand, today });
      const p = report.products.find((x) => x.id === id);
      return { problems: report.problems.map((x) => x.message), completeness: p?.completeness ?? null, findings: (p?.findings || []).map((f) => f.text) };
    },
  };
  const summary = initProject(ports, { today, dryRun: parsed.opts.dryRun, agentRules, bootstrap, bootstrapHint: o.bootstrapHint, hqCommand: o.hqCommand, hubDir, checkCommand: o.checkCommand, label: initLabel });
  if (json) log(JSON.stringify(summary, null, 2));
  else (summary.ok ? log : err)(formatInitSummary(summary, initLabel));
  return summary.ok ? 0 : 1;
}

/** `hub <command> …`: returns the exit code. */
export function main(argv: readonly string[], io: Io = {}): number {
  const [cmd, ...rest] = argv;
  const err = io.err ?? console.error;
  if (cmd === 'new') return runNew(rest, io);
  if (cmd === 'check') return runCheck(rest, io);
  if (cmd === 'init') return runInit(rest, io);
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
    (io.log ?? console.log)(USAGE);
    return 0;
  }
  err(`hub – ${cmd ? `unknown command "${cmd}"` : 'missing command'}\n${USAGE}`);
  return 2;
}

const invoked = (() => {
  try {
    return !!process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();
if (invoked) process.exitCode = main(process.argv.slice(2));
