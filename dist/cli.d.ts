#!/usr/bin/env node
import { type PlanNewOptions, type ScaffoldSummary } from './scaffold.js';
import { type InitOptions, type InitPorts } from './init.js';
export interface Io {
    log?: (s: string) => void;
    err?: (s: string) => void;
}
export declare const USAGE_NEW = "usage: canon new <id> [--stage idea|validation|building|live] [--name \"<Name>\"] [--pitch \"<one line>\"] [--team <id>] [--app <nx-project>[:<role>]]... [--plan <business-plan-id>] [--issue <N>] [--dry-run] [--root <dir>]";
export declare const USAGE_CHECK = "usage: canon check <id>|--all [--json] [--root <dir>] [--hub-dir <dir>] [--plans-dir <dir>] [--today <YYYY-MM-DD>]";
export declare const USAGE_INIT = "usage: canon init <id> [the canon new options] [--json] [--hq <file>] [--no-hq] [--no-agent-rules] [--no-bootstrap]";
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
export declare const EXIT_INTERNAL = 3;
/** `canon check`: returns the exit code. */
export declare function runCheck(argv: readonly string[], o?: CheckHostOptions): number;
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
export declare function runNew(argv: readonly string[], o?: NewHostOptions): number;
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
export declare function runInit(argv: readonly string[], o?: InitHostOptions): number;
/** `hub <command> …`: returns the exit code. */
export declare function main(argv: readonly string[], io?: Io): number;
