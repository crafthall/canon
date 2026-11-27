import type { CheckRule } from './check.js';
import type { FindingKind } from './readers.js';
import type { HubReport } from './report.js';
/** Folder that holds the fixture repository roots and their expectations. */
export declare const HUBS_DIR: string;
/** The fixtures, in the order of hubs/README.md. */
export declare const FIXTURE_NAMES: readonly ["complete", "early", "empty", "drifted", "drifted-variants"];
export type FixtureName = (typeof FIXTURE_NAMES)[number];
/**
 * The `today` the core tests pass (the experiments overdue rule). The fixtures are built so that every today from
 * 2026-01-16 to 2099-12-31 gives the same report: `drifted` has one experiment due 2026-01-15 without a result, and
 * `complete` has its open experiment due 2099-12-31. So `canon check` with the real date (the CLI default) equals the core
 * at this date; a release form may pass either.
 */
export declare const FIXTURE_TODAY = "2026-11-26";
/** The fixture that holds every structure rule and every health check exactly once. */
export declare const EXACTLY_ONCE_FIXTURE: FixtureName;
/** What a release form must report for a fixture: the shape `contractView` returns, plus the exit code. */
export interface ContractView {
    ok: boolean;
    counts: HubReport['counts'];
    problems: {
        rule: CheckRule;
        file: string;
        message: string;
    }[];
    products: {
        id: string;
        stage: string | null;
        completeness: number | null;
        done: number;
        total: number;
        findings: {
            kind: FindingKind;
            area: string;
            text: string;
            file: string;
        }[];
    }[];
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
export declare function fixtures(): Fixture[];
/** The part of a `canon check --json` report the contract fixes (the rest – titles, rows, features – may grow). */
export declare function contractView(report: HubReport): ContractView;
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
export declare const FINDING_BRANCHES: readonly FindingBranch[];
/**
 * Branches no fixture reaches, with the reason. `rule-grades` needs the host's rules hook (Spark Hall's
 * buildRuleGrades); `canon check` never passes one, so no release form can report it.
 */
export declare const UNREACHABLE_BRANCHES: Readonly<Record<string, string>>;
/**
 * HEALTH_CHECKS rows that are not findings: `missing-page` is a health row state ("missing"), not a finding, so the
 * fixtures show it through a row, not through `findings`.
 */
export declare const NON_FINDING_CHECKS: Readonly<Record<string, string>>;
/** The branch ids a finding matches (exactly one for every finding the readers create today). */
export declare const branchesOf: (f: {
    text: string;
}) => string[];
export { PLUGIN_NAME, formatPluginReport } from './plugin-runner.js';
/** The package's Claude Code plugin folder (plugin/: manifest, command, skills, bundled runner, template). */
export declare const PLUGIN_DIR: string;
/** Every path under `dir` (files and links, not followed), relative, sorted. */
export declare function walk(dir: string, base?: string): string[];
/** The shell line of the plugin's check command (the `!` + backticks line of commands/check.md). */
export declare function commandLine(commandFile: string): string;
/**
 * Runs `/crafthall-canon:check <args>` the way Claude Code runs the command's `!` line: ${CLAUDE_PLUGIN_ROOT} and
 * $ARGUMENTS replaced, the line run by a shell in `cwd`, with only PATH and HOME in the environment. `code` is the
 * exit code the line prints last; `out` is what came before it.
 */
export declare function runPluginCommand(pluginRoot: string, args: string, cwd: string, env?: NodeJS.ProcessEnv): {
    shellStatus: number | null;
    code: number | null;
    out: string;
    raw: string;
};
