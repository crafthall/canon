/**
 * Crafthall Canon – the framework model (docs/concept.md, docs/layout.md,
 * docs/lifecycle.md). One documentation folder per product: a fixed page layout in three
 * sections, eight lifecycle stages, a documentation matrix saying which page each stage needs, health checks and a
 * completeness count. Pure data and pure functions – no file reads, no host imports – so the same model serves a host's
 * dashboard, the `canon` CLI (cli.ts: the scaffold in scaffold.ts and the structure check in check.ts) and any page that
 * describes the framework. The readers that apply it to a
 * hub folder are in readers.ts; the package entry is index.ts.
 */
/** Folder of everything a Crafthall product writes into a repository: one sub-folder per product (canon, hq, …). */
export declare const CRAFTHALL_DIR = "docs/crafthall";
/** Default folder that holds one sub-folder per product: Canon's own folder under docs/crafthall/. */
export declare const HUB_DIR = "docs/crafthall/canon";
/** Where the hub lived up to 0.2.x; still read when the repository has no hub at HUB_DIR. */
export declare const LEGACY_HUB_DIR = "docs/product-hub";
/**
 * The hub folder of a repository: HUB_DIR when it exists or when neither folder exists (a new hub), else the legacy
 * docs/product-hub/ of 0.2.x (`legacy: true`, so a host can tell the user to move it).
 */
export declare function resolveHubDir(isDir: (path: string) => boolean): {
    hubDir: string;
    legacy: boolean;
};
/** The one-line notice for a hub still at the legacy folder: where it is and the command that moves it. */
export declare function legacyHubNotice(): string;
/** Product status in the hub README front matter; `paused` and `retired` are not assessed. */
export declare const PRODUCT_STATUSES: readonly ["idea", "validation", "building", "live", "paused", "retired"];
export declare const FEATURE_STATUSES: readonly ["specified", "building", "built", "partial", "later", "removed"];
export declare const ADR_STATUSES: readonly ["proposed", "accepted", "superseded", "rejected"];
/** Folder names that are routes, not products (`framework` is reserved for a host's page about the framework itself). */
export declare const RESERVED_IDS: readonly ["framework"];
/** Every Markdown page starts with these four front matter keys. */
export declare const FRONT_MATTER_KEYS: readonly ["product", "page", "status", "updated"];
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export type StageId = 'idea' | 'validation' | 'business-plan' | 'mvp' | 'development' | 'launch' | 'monetize' | 'operate';
/** R required to leave the stage, C required once triggered, O optional draft, - not yet due. */
export type Level = 'R' | 'C' | 'O' | '-';
export interface Stage {
    id: StageId;
    label: string;
    /** What the stage is for, one sentence. */
    goal: string;
}
/** Lifecycle stages of the documentation matrix, in order. */
export declare const STAGES: readonly Stage[];
/** Hub README `status` → lifecycle stage; paused and retired products are not assessed. */
export declare const STAGE_OF_STATUS: Readonly<Record<string, StageId>>;
export interface Requirement {
    id: string;
    label: string;
    /** One letter per stage in STAGES order. */
    levels: string;
}
/**
 * The documentation matrix: one letter per stage in STAGES order. R required to leave the stage, C required once
 * triggered (a source exists), O optional draft, - not yet due. Mirrors docs/lifecycle.md "The matrix" (tests/model.test.ts compares them).
 */
export declare const REQUIREMENTS: readonly Requirement[];
/** The four AI & Development Workflow pages (ai-development-workflow/<key>.md). */
export declare const WORKFLOW_PAGES: readonly ["agent-instructions", "documentation-rules", "definition-of-done", "documentation-skills"];
export declare const LEVEL_LABEL: Readonly<Record<Level, string>>;
/** File of each page, relative to the product folder (the hub layout). */
export declare const HUB_PATHS: {
    readonly overview: "business-product/overview.md";
    readonly businessPlan: "business-product/business-plan.md";
    readonly businessModel: "business-product/business-model.json";
    readonly value: "business-product/value-proposition.md";
    readonly competitive: "business-product/competitive-index.md";
    /** Optional appendix of the business plan: the competitors and how the product stands against them. Not a matrix row. */
    readonly competitionLandscape: "business-product/competition-landscape.md";
    readonly gtm: "business-product/go-to-market.md";
    readonly monetization: "business-product/monetization.md";
    readonly marketing: "business-product/marketing.md";
    readonly brand: "business-product/brand.md";
    readonly roadmap: "business-product/roadmap.md";
    readonly experiments: "business-product/experiments.md";
    readonly releases: "business-product/releases";
    readonly features: "business-product/features";
    readonly featuresIndex: "business-product/features/README.md";
    readonly candidates: "business-product/features/candidates.md";
    readonly architecture: "architecture-engineering/overview.md";
    readonly components: "architecture-engineering/components-and-data-flows.md";
    readonly stack: "architecture-engineering/technology-stack.md";
    readonly decisions: "architecture-engineering/decisions";
    readonly technical: "architecture-engineering/technical";
    readonly workflow: "ai-development-workflow";
};
export interface HubPage {
    /** File or folder relative to the product folder. */
    path: string;
    title: string;
    /** What goes there, one sentence. */
    holds: string;
    /** The matrix row this page counts toward. */
    requirement: string;
}
export interface Section {
    id: 'business-product' | 'architecture-engineering' | 'ai-development-workflow';
    title: string;
    /** The question the section answers. */
    answers: string;
    pages: readonly HubPage[];
}
/** The three sections of a product folder and their pages, in reading order. */
export declare const SECTIONS: readonly Section[];
export type HealthKind = 'missing' | 'review' | 'inconsistent';
export interface HealthCheck {
    id: string;
    kind: HealthKind;
    finds: string;
}
/** What the health check reports (the rows of "Documentation health"); each finding blocks completeness of its area. */
export declare const HEALTH_CHECKS: readonly HealthCheck[];
/** Lifecycle stage of a hub README status, or null when the product is not assessed (paused, retired, unknown). */
export declare const stageOfStatus: (status: string | null | undefined) => StageId | null;
/** Level of one matrix row at a stage, or null for an unknown row or stage. */
export declare function levelAt(requirementId: string, stage: StageId): Level | null;
/** Matrix rows at a stage with the given levels (default: required only). */
export declare function requirementsAt(stage: StageId, levels?: readonly Level[]): Requirement[];
export type RowState = 'ok' | 'review' | 'missing' | 'extra' | 'not-triggered' | 'not-due';
export interface HealthRow {
    id: string;
    label: string;
    level: Level | null;
    levelLabel: string;
    state: RowState;
    applicable: boolean;
    findings: number;
}
export interface Health {
    assessed: boolean;
    done: number;
    total: number;
    rows: HealthRow[];
}
export interface HealthInput {
    stage: string | null | undefined;
    /** Requirement id → whether its source exists. */
    present: Readonly<Record<string, unknown>>;
    /** Open findings; `area` is the requirement id they block. */
    findings: readonly {
        area: string;
    }[];
}
/**
 * Documentation health for a product at its lifecycle stage. A requirement counts as complete when its source exists
 * and has no open finding; required (R) items and triggered conditional (C) items form the denominator; optional and
 * not-yet-due items are listed but never counted. Unknown stage → `assessed: false` (shown as "not assessed").
 */
export declare function healthOf({ stage, present, findings }: HealthInput): Health;
/** Documentation completeness as a 0..1 share, or null when the product is not assessed. */
export declare const completeness: (h: Health) => number | null;
