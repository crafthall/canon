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
import { type Io } from './cli.js';
import type { HubReport } from './report.js';
export declare const PLUGIN_NAME = "crafthall-canon";
export declare const PLUGIN_CHECK_LABEL = "crafthall-canon check";
export declare const PLUGIN_CHECK_USAGE = "usage: /crafthall-canon:check [<id>|--all] [--json] [--root <dir>] [--hub-dir <dir>] [--plans-dir <dir>] [--today <YYYY-MM-DD>] (no <id> = --all)";
/** The `canon check` arguments the plugin's check runs: the user's, with `--all` added when neither an id nor `--all` is given. */
export declare function pluginCheckArgs(argv: readonly string[]): string[];
/** The text report of a `canon check --json` report: verdict line, problems, then every product's findings. */
export declare function formatPluginReport(report: HubReport, label?: string): string;
/** `/crafthall-canon:check`: returns the exit code of `canon check` for the same arguments. */
export declare function runPluginCheck(argv: readonly string[], { log, err }?: Io): number;
/** The plugin's `hub`: `check` is the plugin's check; every other command is the `canon` CLI. */
export declare function pluginMain(argv: readonly string[], io?: Io): number;
