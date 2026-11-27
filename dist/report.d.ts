/**
 * The `canon check --json` report: the structure check's problems plus the hub model of every product (stage,
 * completeness, health rows, features, decision records, launch tasks, health findings) in one versioned object – the
 * contract the Claude Code plugin and the HQ module read (ADR-0002). Schema: schema/hub-check.schema.json. Bump
 * HUB_REPORT_SCHEMA_VERSION on any breaking change (a removed or renamed field, a changed type); adding an optional
 * field is not breaking. Pure: reads through a `HubSource`.
 */
import { type CheckProblem } from './check.js';
import { type Finding, type PlanInput, type Product } from './readers.js';
import { type HubSource } from './source.js';
export declare const HUB_REPORT_SCHEMA_VERSION = 1;
export interface HubReportProduct {
    id: string;
    dir: string;
    name: string;
    status: string | null;
    stage: string | null;
    stageLabel: string | null;
    team: string | null;
    updated: string | null;
    pitch: string | null;
    plan: {
        id: string;
        title: string;
    } | null;
    /** Documentation completeness 0..1, or null when the product is not assessed. */
    completeness: number | null;
    health: {
        assessed: boolean;
        done: number;
        total: number;
        rows: {
            id: string;
            label: string;
            level: string | null;
            state: string;
            applicable: boolean;
            findings: number;
        }[];
    };
    featureCounts: Product['featureCounts'];
    features: {
        slug: string;
        file: string;
        title: string;
        status: string;
        updated: string | null;
    }[];
    adrs: {
        number: number;
        label: string;
        title: string;
        status: string;
        date: string | null;
        file: string;
    }[];
    launchTasks: {
        name: string;
        neededFor: string;
        status: string;
        owner: boolean;
        issue: string;
    }[];
    candidates: number;
    /** Health findings (drafts, catalog drift, one-sided supersessions …): informational, they never fail the check. */
    findings: Finding[];
}
export interface HubReport {
    schemaVersion: number;
    tool: 'hub';
    hubDir: string;
    /** `all` or the product folder id the check was scoped to. */
    scope: string;
    /** True when the structure check found no problem (exit code 0). */
    ok: boolean;
    counts: {
        products: number;
        problems: number;
        findings: number;
    };
    /** Structure check problems: each fails the check. */
    problems: CheckProblem[];
    products: HubReportProduct[];
    /** Product folders whose README could not be read. */
    errors: string[];
}
export interface HubReportOptions {
    hubDir?: string;
    only?: string | null;
    /** A folder of business plans (`<plansDir>/<id>/plan.md`) besides the hubs' own business-plan.md pages. */
    plansDir?: string | null;
    /** Command named in the "tagged without a hub" problem (default `canon new`). */
    newCommand?: string;
    /** Today as YYYY-MM-DD for the experiments overdue rule; omitted → no experiment is reported overdue (no clock here). */
    today?: string;
    /** The template the repository's `_template/` overrides (CheckHubOptions.template); the CLI passes the bundled one. */
    template?: HubSource | null;
}
/** Business plans: every hub's business-product/business-plan.md, then `<plansDir>/<id>/plan.md`. */
export declare function loadPlans(source: HubSource, { hubDir, plansDir }?: {
    hubDir?: string;
    plansDir?: string | null;
}): PlanInput[];
/** The product as the report carries it (no rendered pages). */
export declare function reportProduct(p: Product): HubReportProduct;
/** Runs the structure check and builds the hub model of every product (or only `only`) into one report. */
export declare function hubReport(source: HubSource, { hubDir, only, plansDir, newCommand, today, template }?: HubReportOptions): HubReport;
