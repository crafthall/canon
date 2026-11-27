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
export const CRAFTHALL_DIR = 'docs/crafthall';
/** Default folder that holds one sub-folder per product: Canon's own folder under docs/crafthall/. */
export const HUB_DIR = `${CRAFTHALL_DIR}/canon`;
/** Where the hub lived up to 0.2.x; still read when the repository has no hub at HUB_DIR. */
export const LEGACY_HUB_DIR = 'docs/product-hub';

/**
 * The hub folder of a repository: HUB_DIR when it exists or when neither folder exists (a new hub), else the legacy
 * docs/product-hub/ of 0.2.x (`legacy: true`, so a host can tell the user to move it).
 */
export function resolveHubDir(isDir: (path: string) => boolean): { hubDir: string; legacy: boolean } {
  if (!isDir(HUB_DIR) && isDir(LEGACY_HUB_DIR)) return { hubDir: LEGACY_HUB_DIR, legacy: true };
  return { hubDir: HUB_DIR, legacy: false };
}

/** The one-line notice for a hub still at the legacy folder: where it is and the command that moves it. */
export function legacyHubNotice(): string {
  return `the hub is at ${LEGACY_HUB_DIR}/, the location used up to 0.2.x – move it with: mkdir -p ${CRAFTHALL_DIR} && git mv ${LEGACY_HUB_DIR} ${HUB_DIR}`;
}
/** Product status in the hub README front matter; `paused` and `retired` are not assessed. */
export const PRODUCT_STATUSES = ['idea', 'validation', 'building', 'live', 'paused', 'retired'] as const;
export const FEATURE_STATUSES = ['specified', 'building', 'built', 'partial', 'later', 'removed'] as const;
export const ADR_STATUSES = ['proposed', 'accepted', 'superseded', 'rejected'] as const;
/** Folder names that are routes, not products (`framework` is reserved for a host's page about the framework itself). */
export const RESERVED_IDS = ['framework'] as const;
/** Every Markdown page starts with these four front matter keys. */
export const FRONT_MATTER_KEYS = ['product', 'page', 'status', 'updated'] as const;

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
export const STAGES: readonly Stage[] = [
  { id: 'idea', label: 'Idea', goal: 'Say what the product is and for whom, in one page.' },
  { id: 'validation', label: 'Validation', goal: 'Show there is a customer, a problem and a reason to beat the alternatives.' },
  { id: 'business-plan', label: 'Business plan', goal: 'Show how it earns, with a model you can recompute.' },
  { id: 'mvp', label: 'MVP scope', goal: 'Fix the first release: features, gates and architecture.' },
  { id: 'development', label: 'Development', goal: 'Build it with the docs changing in the same pull request as the code.' },
  { id: 'launch', label: 'Launch / GTM', goal: 'Go public: channels, funnel, brand and launch steps.' },
  { id: 'monetize', label: 'Monetize', goal: 'Switch revenue on at the gates the plan names.' },
  { id: 'operate', label: 'Operate', goal: 'Run it: metrics, releases and decisions stay current.' },
];

/** Hub README `status` → lifecycle stage; paused and retired products are not assessed. */
export const STAGE_OF_STATUS: Readonly<Record<string, StageId>> = { idea: 'idea', validation: 'validation', building: 'development', live: 'operate' };

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
export const REQUIREMENTS: readonly Requirement[] = [
  { id: 'overview', label: 'Overview and pitch', levels: 'RRRRRRRR' },
  { id: 'value', label: 'Value proposition and target market', levels: 'ORRRRRRR' },
  { id: 'business-plan', label: 'Business plan and model', levels: '-ORRRRRR' },
  { id: 'catalog', label: 'Feature catalog', levels: '-OORRRRR' },
  { id: 'roadmap', label: 'Roadmap and gates', levels: '-OORRRRR' },
  { id: 'experiments', label: 'Experiments', levels: 'CCCCCCCC' },
  { id: 'gtm', label: 'Go-to-market and marketing', levels: '-COOCRRR' },
  { id: 'monetization', label: 'Monetization and entitlements', levels: '-ORRRRRR' },
  { id: 'brand', label: 'Brand identity', levels: '-CCCCRRR' },
  { id: 'architecture', label: 'Architecture overview', levels: '-CCRRRRR' },
  { id: 'components', label: 'Components and data flows', levels: '-CCRRRRR' },
  { id: 'stack', label: 'Technology stack', levels: '-CCRRRRR' },
  { id: 'adr', label: 'Decision records', levels: 'CCCCCCCC' },
  { id: 'technical', label: 'Detailed technical documentation', levels: 'CCCCCCCC' },
  { id: 'metrics', label: 'Quality and product metrics', levels: 'ORRRRRRR' },
  { id: 'ai-workflow', label: 'AI and development workflow', levels: '---ORRRR' },
];

/** The four AI & Development Workflow pages (ai-development-workflow/<key>.md). */
export const WORKFLOW_PAGES = ['agent-instructions', 'documentation-rules', 'definition-of-done', 'documentation-skills'] as const;
export const LEVEL_LABEL: Readonly<Record<Level, string>> = { R: 'required', C: 'when triggered', O: 'optional', '-': 'not yet due' };

/** File of each page, relative to the product folder (the hub layout). */
export const HUB_PATHS = {
  overview: 'business-product/overview.md',
  businessPlan: 'business-product/business-plan.md',
  businessModel: 'business-product/business-model.json',
  value: 'business-product/value-proposition.md',
  competitive: 'business-product/competitive-index.md',
  /** Optional appendix of the business plan: the competitors and how the product stands against them. Not a matrix row. */
  competitionLandscape: 'business-product/competition-landscape.md',
  gtm: 'business-product/go-to-market.md',
  monetization: 'business-product/monetization.md',
  marketing: 'business-product/marketing.md',
  brand: 'business-product/brand.md',
  roadmap: 'business-product/roadmap.md',
  experiments: 'business-product/experiments.md',
  releases: 'business-product/releases',
  features: 'business-product/features',
  featuresIndex: 'business-product/features/README.md',
  candidates: 'business-product/features/candidates.md',
  architecture: 'architecture-engineering/overview.md',
  components: 'architecture-engineering/components-and-data-flows.md',
  stack: 'architecture-engineering/technology-stack.md',
  decisions: 'architecture-engineering/decisions',
  technical: 'architecture-engineering/technical',
  workflow: 'ai-development-workflow',
} as const;

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
export const SECTIONS: readonly Section[] = [
  {
    id: 'business-product',
    title: 'Business & Product',
    answers: 'What is it, who is it for and how does it earn?',
    pages: [
      { path: HUB_PATHS.overview, title: 'Overview and pitch', holds: 'What the product is, who it is for and the main flow, step by step.', requirement: 'overview' },
      { path: HUB_PATHS.value, title: 'Value proposition', holds: 'Customer, problem, value and the alternatives it beats (an optional competitive index scores them).', requirement: 'value' },
      { path: HUB_PATHS.businessPlan, title: 'Business plan', holds: 'Executive summary first, the full plan below, with a scenario model in business-model.json.', requirement: 'business-plan' },
      { path: HUB_PATHS.monetization, title: 'Monetization', holds: 'Offer, pricing, free and paid entitlements, revenue gates.', requirement: 'monetization' },
      { path: HUB_PATHS.gtm, title: 'Go-to-market', holds: 'Segments, channels ranked by expected pull, funnel and launch steps.', requirement: 'gtm' },
      { path: HUB_PATHS.brand, title: 'Brand identity', holds: 'Name, logo, palette, type and voice, once the product has a public face.', requirement: 'brand' },
      { path: HUB_PATHS.roadmap, title: 'Roadmap and gates', holds: 'Releases in order and every business and release gate in one table.', requirement: 'roadmap' },
      { path: HUB_PATHS.experiments, title: 'Experiments', holds: 'One row per hypothesis: metric, go and kill thresholds, owner, revisit-by date and result.', requirement: 'experiments' },
      { path: HUB_PATHS.features, title: 'Feature catalog', holds: 'One row per feature with its status, one detailed page per feature.', requirement: 'catalog' },
    ],
  },
  {
    id: 'architecture-engineering',
    title: 'Architecture & Engineering',
    answers: 'How is it built and why that way?',
    pages: [
      { path: HUB_PATHS.architecture, title: 'Architecture overview', holds: 'Runtime paths and environments.', requirement: 'architecture' },
      { path: HUB_PATHS.components, title: 'Components and data flows', holds: 'What talks to what, which data moves where, privacy and security.', requirement: 'components' },
      { path: HUB_PATHS.stack, title: 'Technology stack', holds: 'Languages, frameworks, hosting and why each was chosen.', requirement: 'stack' },
      { path: HUB_PATHS.decisions, title: 'Decision records', holds: 'One numbered record per material decision, with status and two-way supersession links.', requirement: 'adr' },
      { path: HUB_PATHS.technical, title: 'Technical documentation', holds: 'Testing, limits, risks, user guide – any number of focused pages.', requirement: 'technical' },
    ],
  },
  {
    id: 'ai-development-workflow',
    title: 'AI & Development Workflow',
    answers: 'How do agents and people work on it?',
    pages: [
      { path: `${HUB_PATHS.workflow}/agent-instructions.md`, title: 'Agent instructions', holds: 'Which agents work on the product and the rules that apply only here.', requirement: 'ai-workflow' },
      { path: `${HUB_PATHS.workflow}/documentation-rules.md`, title: 'Documentation rules', holds: 'Product-only additions to the framework rules.', requirement: 'ai-workflow' },
      { path: `${HUB_PATHS.workflow}/definition-of-done.md`, title: 'Definition of done', holds: 'One checklist: tests, docs, design bar, release gate.', requirement: 'ai-workflow' },
      { path: `${HUB_PATHS.workflow}/documentation-skills.md`, title: 'Documentation skills', holds: 'Which agent skills keep these pages current, and when they run.', requirement: 'ai-workflow' },
    ],
  },
];

export type HealthKind = 'missing' | 'review' | 'inconsistent';

export interface HealthCheck {
  id: string;
  kind: HealthKind;
  finds: string;
}

/** What the health check reports (the rows of "Documentation health"); each finding blocks completeness of its area. */
export const HEALTH_CHECKS: readonly HealthCheck[] = [
  { id: 'missing-page', kind: 'missing', finds: 'A page the current stage requires does not exist.' },
  { id: 'draft-page', kind: 'review', finds: 'A page is still marked status: draft.' },
  { id: 'feature-newer', kind: 'review', finds: 'A feature page changed after the hub README – the index may be stale.' },
  { id: 'feature-status', kind: 'inconsistent', finds: 'A feature status outside the allowed list, or feature front matter that does not parse.' },
  { id: 'catalog-mismatch', kind: 'inconsistent', finds: 'The feature catalog and the feature page disagree on status.' },
  { id: 'catalog-orphan', kind: 'inconsistent', finds: 'A feature page without a catalog row, a catalog row or a candidate that links a missing page, or two rows for one page.' },
  { id: 'foreign-feature', kind: 'inconsistent', finds: 'A feature page that names another product.' },
  { id: 'adr-status', kind: 'inconsistent', finds: 'A decision record with an unknown status.' },
  { id: 'adr-supersession', kind: 'inconsistent', finds: 'A one-sided or dangling supersession link between decision records.' },
  { id: 'plan-missing', kind: 'inconsistent', finds: 'The hub names a business plan that does not exist.' },
  { id: 'readme-meta', kind: 'inconsistent', finds: 'The hub README names another product, an unknown status or front matter that does not parse.' },
  { id: 'workflow-incomplete', kind: 'missing', finds: 'Some, but not all four, AI & development workflow pages exist.' },
  { id: 'launch-task-status', kind: 'inconsistent', finds: 'A launch task in the roadmap whose status is not open, in progress or done.' },
  { id: 'experiment-overdue', kind: 'review', finds: 'An experiment whose revisit-by date has passed (before the given today) with no recorded result.' },
];

/** Lifecycle stage of a hub README status, or null when the product is not assessed (paused, retired, unknown). */
export const stageOfStatus = (status: string | null | undefined): StageId | null => (status ? (STAGE_OF_STATUS[status] ?? null) : null);

/** Level of one matrix row at a stage, or null for an unknown row or stage. */
export function levelAt(requirementId: string, stage: StageId): Level | null {
  const si = STAGES.findIndex((s) => s.id === stage);
  const r = REQUIREMENTS.find((x) => x.id === requirementId);
  return si >= 0 && r ? (r.levels[si] as Level) : null;
}

/** Matrix rows at a stage with the given levels (default: required only). */
export function requirementsAt(stage: StageId, levels: readonly Level[] = ['R']): Requirement[] {
  return REQUIREMENTS.filter((r) => {
    const l = levelAt(r.id, stage);
    return l !== null && levels.includes(l);
  });
}

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
  findings: readonly { area: string }[];
}

/**
 * Documentation health for a product at its lifecycle stage. A requirement counts as complete when its source exists
 * and has no open finding; required (R) items and triggered conditional (C) items form the denominator; optional and
 * not-yet-due items are listed but never counted. Unknown stage → `assessed: false` (shown as "not assessed").
 */
export function healthOf({ stage, present, findings }: HealthInput): Health {
  const si = STAGES.findIndex((s) => s.id === stage);
  const rows = REQUIREMENTS.map((r): HealthRow => {
    const level = si >= 0 ? (r.levels[si] as Level) : null;
    const has = !!present[r.id];
    const open = findings.filter((f) => f.area === r.id);
    const applicable = level === 'R' || (level === 'C' && has);
    const state: RowState = !applicable ? (has ? 'extra' : level === 'C' ? 'not-triggered' : 'not-due') : !has ? 'missing' : open.length ? 'review' : 'ok';
    return { id: r.id, label: r.label, level, levelLabel: level ? LEVEL_LABEL[level] : 'unknown', state, applicable, findings: open.length };
  });
  if (si < 0) return { assessed: false, done: 0, total: 0, rows };
  const app = rows.filter((r) => r.applicable);
  return { assessed: app.length > 0, done: app.filter((r) => r.state === 'ok').length, total: app.length, rows };
}

/** Documentation completeness as a 0..1 share, or null when the product is not assessed. */
export const completeness = (h: Health): number | null => (h.assessed && h.total > 0 ? h.done / h.total : null);
