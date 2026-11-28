/**
 * `canon init` – start a repository as a Crafthall project (feature crafthall-project-init). One run, in this
 * order: scaffold the hub (`canon new`) → bootstrap (the repository has content: left to the bootstrap skill in the
 * user's own session, the command only says so) → the agent-rules snippet in CLAUDE.md / AGENTS.md → the Crafthall
 * HQ team check (offline) → the Crafthall Optimize baseline (skipped with a note while Optimize has no free, offline
 * baseline) → summary: the HQ verdict recorded in the hub README (Status row + Changelog line), the closing hub
 * check, and what the person confirms.
 * Pure: every outside step (scaffold, file list, writes, HQ, Optimize, the closing check) is a port in `InitPorts`,
 * so unit tests cover the order and every "not available" path; `@crafthall/canon/cli` wires the Node ports.
 * Nothing is published or sent: HQ is run offline by its runner, Optimize is never run by a model or a paid call.
 */
import { type AgentRulesOptions } from './agent-rules.js';
import type { ScaffoldSummary } from './scaffold.js';
import type { HubSource } from './source.js';
export declare const INIT_SUMMARY_SCHEMA_VERSION = 1;
/** The steps of `canon init`, in the order they run. */
export declare const INIT_STEPS: readonly ["scaffold", "bootstrap", "agent-rules", "hq-check", "optimize-baseline", "summary"];
export type InitStepId = (typeof INIT_STEPS)[number];
/**
 * done = ran and wrote or checked; skipped = not applicable or not available, with the reason; pending = left to the
 * user's session (the bootstrap skill); dry-run = what would happen; refused / failed = the run stops (exit 1);
 * not-run = an earlier step stopped the run.
 */
export type InitStepStatus = 'done' | 'skipped' | 'pending' | 'dry-run' | 'refused' | 'failed' | 'not-run';
export interface InitStep {
    id: InitStepId;
    status: InitStepStatus;
    /** One line for the person. */
    message: string;
    /** Further lines (the scaffold's own output, HQ hints). */
    lines?: string[];
}
/** What the HQ runner found. */
export type HqOutcome = 
/** HQ is not installed (no `--hq`, no Claude Code plugin `crafthall-hq`, no `crafthall-hq` on PATH) or turned off. */
{
    kind: 'missing';
    message: string;
}
/** HQ ran but found no Claude Code agent team to check (its exit code 3), e.g. only AGENTS.md or nothing at all. */
 | {
    kind: 'nothing-checked';
    message: string;
}
/** HQ checked the team on this machine: exit 0 = OK, 1 = things to improve. */
 | {
    kind: 'checked';
    exitCode: 0 | 1;
    verdict: string;
    version: string | null;
    rulesBuild: string | null;
    agents: number | null;
    hints: string[];
}
/** HQ could not run or did not run offline: nothing is recorded. */
 | {
    kind: 'failed';
    message: string;
};
/** What the Optimize runner found. */
export type OptimizeOutcome = {
    kind: 'missing';
    note: string;
} | {
    kind: 'recorded';
    message: string;
};
export interface ScaffoldOutcome {
    /** The `canon new` exit code: 0 created (or dry run), 1 refused or its check failed, 2 usage error. */
    code: number;
    summary: ScaffoldSummary | null;
    /** Everything `canon new` printed (stdout and stderr, in order). */
    lines: string[];
}
export interface InitPorts {
    /** Runs `canon new` with the init's arguments. */
    scaffold: () => ScaffoldOutcome;
    /** Repo-relative files of the repository (tracked and untracked, not ignored), after the scaffold. */
    files: () => readonly string[];
    /** Reads the repository (after the scaffold). */
    source: () => HubSource;
    /** Writes one repo-relative file (creates folders). */
    write: (path: string, text: string) => void;
    /** Runs the Crafthall HQ team check, offline. */
    hq: () => HqOutcome;
    /** Records the Crafthall Optimize baseline, or says why not. */
    optimize: () => OptimizeOutcome;
    /** The closing canon check of the new product: structure problems and the hub model's completeness and findings. */
    check: (id: string) => {
        problems: string[];
        completeness: number | null;
        findings: string[];
    };
}
export interface InitOptions extends AgentRulesOptions {
    today: string;
    dryRun?: boolean;
    /** Agent-rules snippet: true = add it; a string = skip it with that reason (host or `--no-agent-rules`). */
    agentRules?: true | string;
    /** Bootstrap: `repo` = the repository has content outside the hub and agent files; `apps` = only the `--app` folders count; a string = skip with that reason. */
    bootstrap?: 'repo' | 'apps' | {
        skip: string;
    };
    /** Command the person runs for the bootstrap (named in the summary). */
    bootstrapHint?: string;
    /** Command that re-runs the HQ check (named in the summary). */
    hqCommand?: string;
    /** Prefix of the printed lines (default `canon init`). */
    label?: string;
}
export interface InitSummary {
    schemaVersion: number;
    tool: 'hub';
    command: 'init';
    /** True when no step was refused or failed (exit code 0). */
    ok: boolean;
    id: string | null;
    name: string | null;
    dir: string | null;
    stage: string | null;
    dryRun: boolean;
    steps: InitStep[];
    hq: Extract<HqOutcome, {
        kind: 'checked';
    }> | null;
    hub: {
        problems: string[];
        completeness: number | null;
        findings: string[];
    } | null;
    /** What the person confirms or does next, in order. */
    confirm: string[];
}
/** Files that do not make a repository "have content" for the bootstrap: the hub, agent files, git metadata. */
export declare function contentFiles(files: readonly string[], { hubDir, apps }?: {
    hubDir?: string;
    apps?: readonly string[] | null;
}): string[];
/** The README Status row that records the HQ result (the hub's record of the team check). */
export declare function hqStatusRow(hq: HqOutcome, today: string): string;
/** The README Changelog line of the init. */
export declare function initChangelogLine(hq: HqOutcome, optimize: OptimizeOutcome, today: string): string;
/** Adds the Status row (replacing an older HQ row) and the Changelog line (newest first) to a hub README. */
export declare function recordInReadme(readme: string, row: string, line: string): string;
/** Runs the init steps in order. Never throws for an expected outcome; an unexpected exception is the caller's (exit 3). */
export declare function initProject(ports: InitPorts, o: InitOptions): InitSummary;
/** The text form of the summary, as `canon init` prints it. */
export declare function formatInitSummary(sum: InitSummary, label?: string): string;
