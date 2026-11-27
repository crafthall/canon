/**
 * Runner of the standalone Claude Code plugin `crafthall-canon` (ADR-0002 release form 2). The plugin's
 * `/crafthall-canon:check` command runs `check`; `new`, `init` and `help` go to the `canon` CLI unchanged, so the
 * plugin's skills can run `canon init` and `canon check` from the plugin with no package installed.
 *
 * `check` is `canon check` with two differences only, both in what is printed, never in what is found:
 * - no `<id>` and no `--all` means `--all` (a slash command with no arguments checks the whole repository);
 * - the text mode prints the health findings (missing, stale, inconsistent) of every product besides the problems,
 *   because the plugin's user asks "what is missing or stale" – plain `canon check` prints only the problems.
 * Every argument, the validation, the exit codes (0 no problem, 1 problems, 2 usage error, 3 internal error) and the
 * findings come from `runCheck --json` of cli.ts itself: the text is a rendering of that report, and `--json` prints
 * it as is. The plugin's bundle (plugin/scripts/hub-core.mjs, built by scripts/build-plugin.mjs) holds this file and
 * the CLI; a launcher (plugin/scripts/hub.mjs) calls `pluginMain`.
 */
import { main, runCheck, type Io } from './cli.ts';
import type { HubReport } from './report.ts';

export const PLUGIN_NAME = 'crafthall-canon';
export const PLUGIN_CHECK_LABEL = `${PLUGIN_NAME} check`;
export const PLUGIN_CHECK_USAGE = `usage: /${PLUGIN_NAME}:check [<id>|--all] [--json] [--root <dir>] [--hub-dir <dir>] [--plans-dir <dir>] [--today <YYYY-MM-DD>] (no <id> = --all)`;

/** Options of `canon check` that take a value (the next argument is not a product id). */
const VALUE_OPTIONS = new Set(['--root', '--hub-dir', '--plans-dir', '--today']);

/** The `canon check` arguments the plugin's check runs: the user's, with `--all` added when neither an id nor `--all` is given. */
export function pluginCheckArgs(argv: readonly string[]): string[] {
  let target = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUE_OPTIONS.has(a)) i++;
    else if (a === '--all' || !a.startsWith('--')) target = true;
  }
  return target ? [...argv] : ['--all', ...argv];
}

const pct = (c: number | null) => (c == null ? 'not assessed' : `completeness ${Math.round(c * 100)} %`);

/** The text report of a `canon check --json` report: verdict line, problems, then every product's findings. */
export function formatPluginReport(report: HubReport, label = PLUGIN_CHECK_LABEL): string {
  const scope = report.scope === 'all' ? `${report.counts.products} product folder(s)` : report.scope;
  const { problems, findings } = report.counts;
  const lines = [
    problems
      ? `${label} – ${problems} problem(s), ${findings} finding(s) (${scope})`
      : `${label} – OK, ${findings} finding(s) (${scope}): structure, lifecycle files, links, catalog, ADR index, app tags, one topic per page.`,
  ];
  if (problems) {
    lines.push('', 'Problems (each fails the check):');
    for (const p of report.problems) lines.push(`  - ${p.message}`);
  }
  if (report.products.length) lines.push('', 'Products (findings are missing, stale or inconsistent pages; they do not fail the check):');
  for (const p of report.products) {
    const head = `  ${p.id} – ${p.stageLabel ?? p.stage ?? 'no stage'}, ${pct(p.completeness)}${p.health.assessed ? ` (${p.health.done}/${p.health.total})` : ''}`;
    lines.push(p.findings.length ? `${head}, ${p.findings.length} finding(s):` : `${head}, no findings`);
    for (const f of p.findings) lines.push(`    - [${f.kind}] ${f.area}: ${f.text} (${f.file})`);
  }
  if (!report.products.length && !problems) lines.push('', `No product hub under ${report.hubDir}/ – start one with /${PLUGIN_NAME}:project-init (or canon new <id>).`);
  if (report.errors.length) {
    lines.push('', 'Not read:');
    for (const e of report.errors) lines.push(`  - ${e}`);
  }
  return lines.join('\n');
}

/** `/crafthall-canon:check`: returns the exit code of `canon check` for the same arguments. */
export function runPluginCheck(argv: readonly string[], { log = console.log, err = console.error }: Io = {}): number {
  const args = pluginCheckArgs(argv);
  const json = args.includes('--json');
  let out = '';
  const code = runCheck(json ? args : [...args, '--json'], { label: PLUGIN_CHECK_LABEL, usage: PLUGIN_CHECK_USAGE, log: (s) => (out += s), err });
  if (code !== 0 && code !== 1) return code;
  if (json) log(out);
  else log(formatPluginReport(JSON.parse(out) as HubReport));
  return code;
}

/** The plugin's `hub`: `check` is the plugin's check; every other command is the `canon` CLI. */
export function pluginMain(argv: readonly string[], io: Io = {}): number {
  const [cmd, ...rest] = argv;
  if (cmd === 'check') return runPluginCheck(rest, io);
  return main(argv, io);
}
