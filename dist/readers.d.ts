/**
 * Canon readers (moved from Spark Hall's lib/product-docs.mjs): read a hub folder
 * docs/crafthall/canon/<id>/ through a `HubSource`, parse its pages and build one product – documents, feature catalog,
 * decision records, findings and documentation health. Files are the only source of truth; nothing is hand-entered
 * or estimated. Rendering (Markdown → HTML, in-app links) stays with the host: pass `render`; the default keeps
 * Markdown as is. Pure apart from the reads of the given source.
 */
import { type DocSection } from './front-matter.js';
import { type Health } from './model.js';
import { type HubSource } from './source.js';
/** Every kind of health finding (the `--json` contract carries them; the fixture tripwire asserts this list). */
export declare const FINDING_KINDS: readonly ["missing", "inconsistent", "stale"];
export type FindingKind = (typeof FINDING_KINDS)[number];
/** One health finding; `area` is the matrix row (requirement id) it blocks. */
export interface Finding {
    kind: FindingKind;
    area: string;
    text: string;
    file: string;
}
export type Render = (md: string, file: string) => string;
export interface FileText {
    file: string;
    text: string;
}
/** A business plan as the host loads it (Spark Hall: docs/business-plans/ and the hubs' business-plan.md). */
export interface PlanInput {
    id: string;
    file: string;
    meta?: {
        title?: string;
    } & Record<string, unknown>;
    sections?: {
        title: string;
        body?: string;
        html?: string;
    }[];
}
/** Result of the host's rule pipeline hook (Spark Hall: buildRuleGrades); its `errors` become findings. */
export interface RuleGradesResult {
    errors?: string[];
    files?: {
        notes?: string;
    } & Record<string, unknown>;
    [key: string]: unknown;
}
export type RulesHook = (texts: Record<string, string | null>, dir: string) => RuleGradesResult | null;
/** The already-read sources of one product (texts null when the file does not exist). */
export interface HubProductSource {
    dir: string;
    readme: string | null;
    overview?: string | null;
    value?: string | null;
    competitive?: string | null;
    gtm?: string | null;
    monetization?: string | null;
    marketing?: string | null;
    brand?: string | null;
    roadmap?: string | null;
    experiments?: string | null;
    releases?: FileText[];
    featuresIndex?: string | null;
    features?: FileText[];
    candidates?: string | null;
    architecture?: string | null;
    components?: string | null;
    stack?: string | null;
    adrs?: FileText[];
    technical?: FileText[];
    workflow?: Partial<Record<string, string | null>>;
    /** Rule pipeline files keyed as the host's `ruleFiles` (read only when the host asks for them). */
    ruleTexts?: Record<string, string | null>;
}
export interface FeatureTableRow {
    label: string;
    status: string;
    docs: string[];
}
export interface Feature {
    slug: string;
    file: string;
    title: string;
    status: string;
    statusRaw: string;
    product: string | null;
    group: string | null;
    issues: number[];
    updated: string | null;
    summary: string;
    html: string;
    parseError?: string | null;
}
export interface Adr {
    number: number;
    label: string;
    file: string;
    title: string;
    status: string;
    date: string | null;
    issues: number[];
    supersedes: number[];
    supersededBy: number[];
    html: string;
}
export interface HubDoc {
    html: string | null;
    source?: string;
    sourceLabel?: string;
    route?: string;
    title?: string;
}
export interface FeatureCounts {
    total: number;
    built: number;
    partial: number;
    building: number;
    planned: number;
    removed: number;
    unknown: number;
}
export interface Candidate {
    name: string;
    adds: string;
    gate: string;
    related: string | null;
    source: string;
}
export interface LaunchTask {
    name: string;
    neededFor: string;
    status: string;
    owner: boolean;
    issue: string;
}
/** One row of the experiments page (business-product/experiments.md); cells as plain text. */
export interface Experiment {
    id: string;
    hypothesis: string;
    metric: string;
    go: string;
    kill: string;
    owner: string;
    /** The revisit-by date when the cell is a valid YYYY-MM-DD date, else null (e.g. "(to set)"). */
    revisitBy: string | null;
    /** The revisit-by cell as written. */
    revisitRaw: string;
    /** The recorded result; empty (or only a dash) = no result yet. */
    result: string;
}
export interface Product {
    id: string;
    dir: string;
    name: string;
    status: string | null;
    stage: string | null;
    stageLabel: string | null;
    team: string | null;
    updated: string | null;
    pitch: string | null;
    readmeFile: string;
    plan: {
        id: string;
        title: string;
        route: string;
    } | null;
    docs: Record<string, HubDoc>;
    features: Feature[];
    featureCounts: FeatureCounts;
    candidates: Candidate[];
    candidatesFile: string | null;
    launchTasks: LaunchTask[];
    experiments: Experiment[];
    adrs: Adr[];
    rules: RuleGradesResult | null;
    findings: Finding[];
    health: Health;
}
export declare const escapeHtml: (s: unknown) => string;
/** First section whose normalised title matches `re`, or null. */
export declare const findSection: (sections: DocSection[], re: RegExp) => DocSection | null;
/** Hub README section finders (template: template/README.md): the product metrics live in the hub index. */
export declare const README_SECTIONS: Record<string, RegExp>;
/** First paragraph of a feature's "What it does" section (plain text, for the catalog), else the first paragraph. */
export declare function featureSummary(body: string): string;
/** A Markdown table as objects keyed by normalised header (lowercase, words joined by "-"), cells kept as raw Markdown. */
export declare function markdownTable(text: string | null | undefined): Record<string, string>[];
/** Plain text of a Markdown cell: links to their text, emphasis and code marks dropped. */
export declare const cellText: (md: unknown) => string;
/**
 * Rows of the feature table: [{ label, status, docs: [slug] }]. In features/README.md (`sameFolder`) a row links
 * <slug>.md (candidates and README skipped); elsewhere it links features/<slug>.md.
 */
export declare function featureTableRows(sectionBody: string | null | undefined, { sameFolder }?: {
    sameFolder?: boolean | undefined;
}): FeatureTableRow[];
/** The leading enum word of a free-text status ("built (…)" → built), or null when it starts with something else. */
export declare function leadingStatus(text: unknown): string | null;
type FeatureLike = Pick<Feature, 'slug' | 'file' | 'title' | 'status' | 'statusRaw' | 'product'> & {
    parseError?: string | null;
};
/** Consistency findings between the README feature table and the feature files. */
export declare function featureFindings(product: string, features: FeatureLike[], rows: FeatureTableRow[], readmeFile: string): Finding[];
type AdrLike = Pick<Adr, 'number' | 'label' | 'file' | 'status' | 'supersedes' | 'supersededBy'>;
/** Findings on decision records: unknown status, dangling or one-sided supersession links. */
export declare function adrFindings(adrs: AdrLike[]): Finding[];
/** Feature counts in the units the files use: distinct feature files, removed ones apart. */
export declare function featureCounts(features: {
    status: string;
}[]): FeatureCounts;
/** Whether `s` is a real calendar date written YYYY-MM-DD (2027-02-30 is not). */
export declare function isIsoDate(s: unknown): s is string;
/**
 * Rows of the experiments table: the table under "## Experiments" (else the page's first table), columns ID,
 * Hypothesis, Metric, Go, Kill, Owner, Revisit by, Result. Rows without an ID and a hypothesis are skipped.
 */
export declare function experimentRows(body: string | null | undefined): Experiment[];
/** Whether an experiment has a recorded result (an empty cell or only a dash is no result). */
export declare const hasResult: (e: Pick<Experiment, "result">) => boolean;
/**
 * Experiments past their revisit-by date with no result: `revisitBy` < `today` and no result. `today` is passed in
 * (YYYY-MM-DD) – the core has no clock; a row whose date is not a valid date is never overdue.
 */
export declare function overdueExperiments<T extends Pick<Experiment, 'revisitBy' | 'result'>>(rows: readonly T[], today: string): T[];
export interface BuildOptions {
    /** Business plans the host loaded; the hub README `plan:` (else the product id) picks one. */
    plans?: PlanInput[];
    /** Markdown → HTML; the default keeps Markdown. */
    render?: Render;
    /** Builds the Rules page data from `src.ruleTexts` (Spark Hall: buildRuleGrades); its errors become findings. */
    rules?: RulesHook;
    /**
     * Today as YYYY-MM-DD, for the experiments overdue rule. The core has no clock: the host passes its date (the
     * CLI the real one). Omitted → experiments are read but never reported as overdue.
     */
    today?: string;
}
/**
 * Builds one product from already-read sources (`HubProductSource`; texts null when the file does not exist).
 * `plans` = business plans (sections with html). `render(md, file)` returns HTML.
 */
export declare function buildProduct(id: string, src: HubProductSource, { plans, render, rules: rulesHook, today }?: BuildOptions): Product;
export interface ReadOptions {
    /** Rule pipeline files to read into `ruleTexts`: key → path inside the product folder. Omitted: not read. */
    ruleFiles?: Readonly<Record<string, string>>;
}
/** Reads the sources of one product folder in the hub layout (`dir` repo-relative, e.g. docs/crafthall/canon/<id>). */
export declare function readHubProduct(source: HubSource, dir: string, { ruleFiles }?: ReadOptions): HubProductSource;
/** Product folder ids with a README.md under `hubDir` (folders starting with "_", e.g. _template, and RESERVED_IDS are skipped). */
export declare function productIds(source: HubSource, hubDir?: string): string[];
export interface LoadOptions extends BuildOptions, ReadOptions {
    /** Repo-relative folder holding one folder per product (default: docs/crafthall/canon, or the legacy docs/product-hub when only that exists). */
    hubDir?: string;
}
/** Reads and builds every product folder under `hubDir`. A folder that fails to build is reported in `errors`. */
export declare function loadProductDocs(source: HubSource, { hubDir, plans, render, rules, ruleFiles, today }?: LoadOptions): {
    products: Product[];
    errors: string[];
};
export {};
