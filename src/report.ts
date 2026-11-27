/**
 * The `canon check --json` report: the structure check's problems plus the hub model of every product (stage,
 * completeness, health rows, features, decision records, launch tasks, health findings) in one versioned object – the
 * contract the Claude Code plugin and the HQ module read (ADR-0002). Schema: schema/hub-check.schema.json. Bump
 * HUB_REPORT_SCHEMA_VERSION on any breaking change (a removed or renamed field, a changed type); adding an optional
 * field is not breaking. Pure: reads through a `HubSource`.
 */
import { checkHub, type CheckProblem } from './check.ts';
import { parseDoc, splitSections } from './front-matter.ts';
import { HUB_DIR, completeness, type Health } from './model.ts';
import { loadProductDocs, type Finding, type PlanInput, type Product } from './readers.ts';
import { joinPath, type HubSource } from './source.ts';

export const HUB_REPORT_SCHEMA_VERSION = 1;

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
  plan: { id: string; title: string } | null;
  /** Documentation completeness 0..1, or null when the product is not assessed. */
  completeness: number | null;
  health: { assessed: boolean; done: number; total: number; rows: { id: string; label: string; level: string | null; state: string; applicable: boolean; findings: number }[] };
  featureCounts: Product['featureCounts'];
  features: { slug: string; file: string; title: string; status: string; updated: string | null }[];
  adrs: { number: number; label: string; title: string; status: string; date: string | null; file: string }[];
  launchTasks: { name: string; neededFor: string; status: string; owner: boolean; issue: string }[];
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
  counts: { products: number; problems: number; findings: number };
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

const planOf = (id: string, file: string, text: string): PlanInput => {
  const { meta, body } = parseDoc(text);
  return { id: meta.id ? String(meta.id) : id, file, meta: { title: meta.title ? String(meta.title) : undefined }, sections: splitSections(body).map((s) => ({ title: s.title, body: s.body })) };
};

/** Business plans: every hub's business-product/business-plan.md, then `<plansDir>/<id>/plan.md`. */
export function loadPlans(source: HubSource, { hubDir = HUB_DIR, plansDir = null }: { hubDir?: string; plansDir?: string | null } = {}): PlanInput[] {
  const plans: PlanInput[] = [];
  for (const id of source.list(hubDir).sort()) {
    const file = joinPath(hubDir, id, 'business-product/business-plan.md');
    const text = source.isDir(joinPath(hubDir, id)) ? source.read(file) : null;
    if (text != null) plans.push(planOf(id, file, text));
  }
  if (plansDir && source.isDir(plansDir)) {
    for (const id of source.list(plansDir).sort()) {
      const file = joinPath(plansDir, id, 'plan.md');
      const text = source.read(file);
      if (text != null) plans.push(planOf(id, file, text));
    }
  }
  return plans;
}

const healthView = (h: Health): HubReportProduct['health'] => ({ assessed: h.assessed, done: h.done, total: h.total, rows: h.rows.map((r) => ({ id: r.id, label: r.label, level: r.level, state: r.state, applicable: r.applicable, findings: r.findings })) });

/** The product as the report carries it (no rendered pages). */
export function reportProduct(p: Product): HubReportProduct {
  return {
    id: p.id,
    dir: p.dir,
    name: p.name,
    status: p.status,
    stage: p.stage,
    stageLabel: p.stageLabel,
    team: p.team,
    updated: p.updated,
    pitch: p.pitch,
    plan: p.plan ? { id: p.plan.id, title: p.plan.title } : null,
    completeness: completeness(p.health),
    health: healthView(p.health),
    featureCounts: p.featureCounts,
    features: p.features.map((f) => ({ slug: f.slug, file: f.file, title: f.title, status: f.status, updated: f.updated })),
    adrs: p.adrs.map((a) => ({ number: a.number, label: a.label, title: a.title, status: a.status, date: a.date, file: a.file })),
    launchTasks: p.launchTasks.map((t) => ({ name: t.name, neededFor: t.neededFor, status: t.status, owner: t.owner, issue: t.issue })),
    candidates: p.candidates.length,
    findings: p.findings.map(({ kind, area, text, file }) => ({ kind, area, text, file })),
  };
}

/** Runs the structure check and builds the hub model of every product (or only `only`) into one report. */
export function hubReport(source: HubSource, { hubDir = HUB_DIR, only = null, plansDir = null, newCommand, today, template = null }: HubReportOptions = {}): HubReport {
  const { problems } = checkHub(source, { hubDir, only, newCommand, template });
  const { products, errors } = loadProductDocs(source, { hubDir, plans: loadPlans(source, { hubDir, plansDir }), today });
  const picked = products.filter((p) => !only || p.id === only).map(reportProduct);
  const scopedErrors = errors.filter((e) => !only || e.startsWith(`${only}:`));
  return {
    schemaVersion: HUB_REPORT_SCHEMA_VERSION,
    tool: 'hub',
    hubDir,
    scope: only || 'all',
    ok: problems.length === 0,
    counts: { products: picked.length, problems: problems.length, findings: picked.reduce((n, p) => n + p.findings.length, 0) },
    problems,
    products: picked,
    errors: scopedErrors,
  };
}
