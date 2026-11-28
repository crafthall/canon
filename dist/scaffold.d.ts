import { type HubSource } from './source.js';
export declare const ID_RE: RegExp;
export declare const ROLES: readonly ["primary", "service", "ui-host", "tooling"];
/** Default folder of business plans that `--plan <id>` moves from (`<plansDir>/<id>/plan.md` + `model.json`). */
export declare const PLANS_DIR = "docs/business-plans";
/** `--stage` values → hub README `status` (the lifecycle stage is derived from the status, STAGE_OF_STATUS). */
export declare const STAGE_STATUS: Readonly<Record<string, string>>;
/** Hub README "Pages" list: section, requirement id, file, label – in the order of the hub's cards. */
export declare const PAGE_LIST: readonly (readonly [string, string, string, string])[];
export interface NewOptions {
    id: string | null;
    name: string | null;
    pitch: string | null;
    team: string | null;
    stage: string;
    apps: string[];
    plan: string | null;
    issue: string | null;
    dryRun: boolean;
    root: string | null;
}
/** Parses the `canon new` arguments. Returns { opts } or { error } (a usage error). */
export declare function parseNewArgs(argv: readonly string[], { defaultTeam }?: {
    defaultTeam?: string | null;
}): {
    opts: NewOptions;
    error?: undefined;
} | {
    error: string;
    opts?: undefined;
};
/** posix.relative for two normalised repo-relative paths (no file system). */
export declare function relativePath(from: string, to: string): string;
/** The business plan's appendix that `--plan` moves along (docs/layout.md: competition-landscape.md). */
export declare const PLAN_APPENDIX = "competition-landscape.md";
/** Rewrites the relative Markdown links of `text` from `fromFile` to `toFile` (repo-relative paths; code is skipped). */
export declare function rebaseLinks(text: string, fromFile: string, toFile: string): string;
/** Fills a template page: front matter `product` and `updated`, then <id>, <Name> and YYYY-MM-DD in the text. */
export declare function fillPage(text: string, { id, name, today }: {
    id: string;
    name: string;
    today: string;
}): string;
/** A source over the sub-folder `prefix` of another source (paths relative to that folder). */
export declare function subSource(source: HubSource, prefix: string): HubSource;
export type ScaffoldAction = {
    kind: 'write';
    path: string;
    text: string;
} | {
    kind: 'mv';
    from: string;
    to: string;
} | {
    kind: 'edit';
    path: string;
    text: string;
    note?: string;
} | {
    kind: 'rmdir';
    path: string;
};
export interface ScaffoldSummary {
    id: string;
    name: string;
    dir: string;
    status: string;
    stageLabel: string;
    pages: string[];
    apps: {
        dir: string;
        role: string;
    }[];
    plan: string | null;
}
export interface PlanNewOptions {
    today?: string;
    hubDir?: string;
    /** Template pages; default: `<hubDir>/_template/` of the repo. */
    template?: HubSource;
    /** How the template is named in messages (default `<hubDir>/_template`). */
    templateLabel?: string;
    /** Allowed `--team` values; omitted: any kebab-case id. */
    teams?: readonly string[] | null;
    plansDir?: string;
    /** Host-only: a JS module with an array of [old, new] path rows that gets the moved plan's rows. Off by default. */
    movedPathsFile?: string | null;
    /** Name of the command in messages (default `canon new`). */
    command?: string;
}
/**
 * Plans the new product without writing anything. Returns { errors, actions, summary }; `actions` are
 * { kind: 'write', path, text } (new file), { kind: 'mv', from, to } (git mv), { kind: 'edit', path, text, note }
 * (existing file), { kind: 'rmdir', path } – all paths repo-relative.
 */
export declare function planNew(source: HubSource, opts: NewOptions, { today, hubDir, template, templateLabel, teams, plansDir, movedPathsFile, command }?: PlanNewOptions): {
    errors: string[];
    actions: ScaffoldAction[];
    summary: ScaffoldSummary | null;
};
/** One line per action, as `canon new` prints them. */
export declare const describeAction: (a: ScaffoldAction) => string;
