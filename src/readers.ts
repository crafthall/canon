/**
 * Canon readers (moved from Spark Hall's lib/product-docs.mjs): read a hub folder
 * docs/product-hub/<id>/ through a `HubSource`, parse its pages and build one product – documents, feature catalog,
 * decision records, findings and documentation health. Files are the only source of truth; nothing is hand-entered
 * or estimated. Rendering (Markdown → HTML, in-app links) stays with the host: pass `render`; the default keeps
 * Markdown as is. Pure apart from the reads of the given source.
 */
import { parseDoc, splitSections, type DocSection, type YamlValue } from './front-matter.ts';
import { ADR_STATUSES, FEATURE_STATUSES, HUB_DIR, HUB_PATHS, PRODUCT_STATUSES, RESERVED_IDS, STAGES, STAGE_OF_STATUS, WORKFLOW_PAGES, healthOf, type Health } from './model.ts';
import { joinPath, type HubSource } from './source.ts';

/** Every kind of health finding (the `--json` contract carries them; the fixture tripwire asserts this list). */
export const FINDING_KINDS = ['missing', 'inconsistent', 'stale'] as const;
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
  meta?: { title?: string } & Record<string, unknown>;
  sections?: { title: string; body?: string; html?: string }[];
}
/** Result of the host's rule pipeline hook (Spark Hall: buildRuleGrades); its `errors` become findings. */
export interface RuleGradesResult {
  errors?: string[];
  files?: { notes?: string } & Record<string, unknown>;
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
  plan: { id: string; title: string; route: string } | null;
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

const norm = (s: unknown) => String(s || '').toLowerCase().replace(/^\d+[a-z]?[.)]?\s*/, '').trim();
const slugOf = (f: string) => f.replace(/\.md$/, '');
const asList = (v: YamlValue | undefined): YamlValue[] => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
const asNums = (v: YamlValue | undefined) => asList(v).map(Number).filter(Number.isFinite);
const firstLine = (text: string) => (String(text || '').match(/^\s*>\s*(.+)$/m) || [])[1]?.trim() || null;
const titleOf = (body: string, fallback: string) => (String(body).match(/^#\s+(.+)$/m) || [])[1]?.replace(/[`*_]/g, '').trim() || fallback;
const str = (v: YamlValue | undefined): string | null => (v ? String(v) : null);
export const escapeHtml = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** First section whose normalised title matches `re`, or null. */
export const findSection = (sections: DocSection[], re: RegExp): DocSection | null => sections.find((s) => re.test(norm(s.title))) || null;

/** Hub README section finders (template: template/README.md): the product metrics live in the hub index. */
export const README_SECTIONS: Record<string, RegExp> = { metrics: /metrics/ };

/** First paragraph of a feature's "What it does" section (plain text, for the catalog), else the first paragraph. */
export function featureSummary(body: string): string {
  const secs = splitSections(body);
  const s = findSection(secs, /^what it does/) || secs[0];
  const text = s ? s.body : String(body).replace(/^#.*$/m, '');
  const paras = text.split(/\n\s*\n/).map((p) => p.trim());
  const i = paras.findIndex((p) => p && !p.startsWith('|') && !p.startsWith('```') && !p.startsWith('#'));
  if (i < 0) return '';
  let para = paras[i];
  // "… in one step:" followed by a list: keep the lead-in and the list items' bold labels or first words.
  if (/:\s*$/.test(para) && /^[-*]\s/.test(paras[i + 1] || '')) {
    const items = paras[i + 1]
      .split('\n')
      .filter((l) => /^[-*]\s/.test(l))
      .map((l) => (l.match(/^[-*]\s+\*\*([^*]+?)[:.]?\*\*/) || l.match(/^[-*]\s+(.{0,60}?)[.:;–-]\s/) || [])[1])
      .filter(Boolean);
    if (items.length) para = `${para.replace(/:\s*$/, '')}: ${items.join(', ')}.`;
  }
  const plain = para.replace(/^[-*]\s+/gm, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > 240 ? `${plain.slice(0, 237).replace(/\s+\S*$/, '')}…` : plain;
}

/** A Markdown table as objects keyed by normalised header (lowercase, words joined by "-"), cells kept as raw Markdown. */
export function markdownTable(text: string | null | undefined): Record<string, string>[] {
  const lines = String(text || '').split('\n').filter((l) => /^\s*\|/.test(l));
  if (lines.length < 2 || !/^\s*\|[\s:|-]+\|\s*$/.test(lines[1])) return [];
  const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const head = cells(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().replace(/\s+/g, '-'));
  return lines.slice(2).map((l) => Object.fromEntries(cells(l).map((c, i) => [head[i] || `col${i}`, c])));
}

/** Plain text of a Markdown cell: links to their text, emphasis and code marks dropped. */
export const cellText = (md: unknown) => String(md || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Rows of the feature table: [{ label, status, docs: [slug] }]. In features/README.md (`sameFolder`) a row links
 * <slug>.md (candidates and README skipped); elsewhere it links features/<slug>.md.
 */
export function featureTableRows(sectionBody: string | null | undefined, { sameFolder = false } = {}): FeatureTableRow[] {
  const link = sameFolder ? /\]\((?:\.\/)?([a-z0-9-]+)\.md(?:#[^)]*)?\)/g : /\]\((?:\.\/)?features\/([a-z0-9-]+)\.md(?:#[^)]*)?\)/g;
  const rows: FeatureTableRow[] = [];
  for (const line of String(sectionBody || '').split('\n')) {
    if (!/^\s*\|/.test(line) || /^\s*\|[\s:|-]+\|\s*$/.test(line)) continue;
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const docs = [...line.matchAll(link)].map((m) => m[1]).filter((s) => s !== 'candidates' && s !== 'readme');
    if (!docs.length) continue;
    rows.push({ label: cells[0], status: cells[1] || '', docs });
  }
  return rows;
}

const isFeatureStatus = (s: string) => (FEATURE_STATUSES as readonly string[]).includes(s);

/** The leading enum word of a free-text status ("built (…)" → built), or null when it starts with something else. */
export function leadingStatus(text: unknown): string | null {
  const w = String(text || '').toLowerCase().match(/^[a-z]+/)?.[0];
  return w && isFeatureStatus(w) ? w : null;
}

type FeatureLike = Pick<Feature, 'slug' | 'file' | 'title' | 'status' | 'statusRaw' | 'product'> & { parseError?: string | null };

/** Consistency findings between the README feature table and the feature files. */
export function featureFindings(product: string, features: FeatureLike[], rows: FeatureTableRow[], readmeFile: string): Finding[] {
  const out: Finding[] = [];
  const bySlug = new Map(features.map((f) => [f.slug, f]));
  const seen = new Map<string, number>();
  for (const r of rows) {
    const primary = r.docs[0];
    seen.set(primary, (seen.get(primary) || 0) + 1);
    for (const d of r.docs) {
      if (!bySlug.has(d)) out.push({ kind: 'missing', area: 'catalog', text: `Feature table links features/${d}.md, which does not exist.`, file: readmeFile });
    }
    const f = bySlug.get(primary);
    const lead = leadingStatus(r.status);
    if (f && lead && isFeatureStatus(f.status) && lead !== f.status && r.docs.length === 1) {
      out.push({ kind: 'inconsistent', area: 'catalog', text: `“${f.title}” is ${f.status} in its file but ${lead} in the feature table.`, file: f.file });
    }
  }
  for (const [slug, n] of seen) if (n > 1) out.push({ kind: 'inconsistent', area: 'catalog', text: `features/${slug}.md is the first link of ${n} rows in the feature table (duplicate rows).`, file: readmeFile });
  const linked = new Set(rows.flatMap((r) => r.docs));
  for (const f of features) {
    if (!isFeatureStatus(f.status)) out.push({ kind: 'inconsistent', area: 'catalog', text: `“${f.title}” has status “${f.statusRaw || 'none'}”; use one of ${FEATURE_STATUSES.join(', ')} and put the detail in the text.`, file: f.file });
    if (f.product && f.product !== product) out.push({ kind: 'inconsistent', area: 'catalog', text: `“${f.title}” says product “${f.product}”, not “${product}”.`, file: f.file });
    if (rows.length && !linked.has(f.slug)) out.push({ kind: 'missing', area: 'catalog', text: `“${f.title}” has a feature file but no row in the feature table.`, file: f.file });
    if (f.parseError) out.push({ kind: 'inconsistent', area: 'catalog', text: `Front matter does not parse: ${f.parseError}`, file: f.file });
  }
  return out;
}

type AdrLike = Pick<Adr, 'number' | 'label' | 'file' | 'status' | 'supersedes' | 'supersededBy'>;

/** Findings on decision records: unknown status, dangling or one-sided supersession links. */
export function adrFindings(adrs: AdrLike[]): Finding[] {
  const out: Finding[] = [];
  const byNum = new Map(adrs.map((a) => [a.number, a]));
  for (const a of adrs) {
    if (!(ADR_STATUSES as readonly string[]).includes(a.status)) out.push({ kind: 'inconsistent', area: 'adr', text: `ADR-${a.label} has status “${a.status || 'none'}”; use one of ${ADR_STATUSES.join(', ')}.`, file: a.file });
    if (a.status === 'superseded' && !a.supersededBy.length) out.push({ kind: 'inconsistent', area: 'adr', text: `ADR-${a.label} is superseded but names no successor.`, file: a.file });
    for (const n of a.supersededBy) {
      const b = byNum.get(n);
      if (!b) out.push({ kind: 'missing', area: 'adr', text: `ADR-${a.label} is superseded by ADR-${n}, which does not exist.`, file: a.file });
      else if (!b.supersedes.includes(a.number)) out.push({ kind: 'inconsistent', area: 'adr', text: `ADR-${a.label} names ADR-${b.label} as successor, but ADR-${b.label} does not list it under supersedes.`, file: b.file });
    }
    for (const n of a.supersedes) {
      const b = byNum.get(n);
      if (!b) out.push({ kind: 'missing', area: 'adr', text: `ADR-${a.label} supersedes ADR-${n}, which does not exist.`, file: a.file });
      else if (!b.supersededBy.includes(a.number)) out.push({ kind: 'inconsistent', area: 'adr', text: `ADR-${a.label} supersedes ADR-${b.label}, but ADR-${b.label} does not name it as successor.`, file: b.file });
    }
  }
  return out;
}

/** Feature counts in the units the files use: distinct feature files, removed ones apart. */
export function featureCounts(features: { status: string }[]): FeatureCounts {
  const live = features.filter((f) => f.status !== 'removed');
  const by = (s: string) => live.filter((f) => f.status === s).length;
  return { total: live.length, built: by('built'), partial: by('partial'), building: by('building'), planned: by('specified') + by('later'), removed: features.length - live.length, unknown: live.filter((f) => !isFeatureStatus(f.status)).length };
}

/** Whether `s` is a real calendar date written YYYY-MM-DD (2027-02-30 is not). */
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Rows of the experiments table: the table under "## Experiments" (else the page's first table), columns ID,
 * Hypothesis, Metric, Go, Kill, Owner, Revisit by, Result. Rows without an ID and a hypothesis are skipped.
 */
export function experimentRows(body: string | null | undefined): Experiment[] {
  const sec = findSection(splitSections(String(body || '')), /^experiments/);
  const text = sec ? sec.body : String(body || '');
  // Only the first table: a second table further down is not an experiments table.
  const lines = text.split('\n');
  const isRow = (l: string) => /^\s*\|/.test(l);
  const start = lines.findIndex(isRow);
  let end = start;
  while (end >= 0 && end < lines.length && isRow(lines[end])) end++;
  return markdownTable(start < 0 ? '' : lines.slice(start, end).join('\n'))
    .map((r) => {
      const revisitRaw = cellText(r['revisit-by'] ?? r.revisitby);
      return {
        id: cellText(r.id),
        hypothesis: cellText(r.hypothesis),
        metric: cellText(r.metric),
        go: cellText(r.go),
        kill: cellText(r.kill),
        owner: cellText(r.owner),
        revisitBy: isIsoDate(revisitRaw) ? revisitRaw : null,
        revisitRaw,
        result: cellText(r.result),
      };
    })
    .filter((e) => e.id || e.hypothesis);
}

/** Whether an experiment has a recorded result (an empty cell or only a dash is no result). */
export const hasResult = (e: Pick<Experiment, 'result'>): boolean => !/^[-–—]*$/.test(e.result.trim());

/**
 * Experiments past their revisit-by date with no result: `revisitBy` < `today` and no result. `today` is passed in
 * (YYYY-MM-DD) – the core has no clock; a row whose date is not a valid date is never overdue.
 */
export function overdueExperiments<T extends Pick<Experiment, 'revisitBy' | 'result'>>(rows: readonly T[], today: string): T[] {
  if (!isIsoDate(today)) throw new Error(`today must be a date YYYY-MM-DD, got "${today}"`);
  return rows.filter((e) => e.revisitBy !== null && e.revisitBy < today && !hasResult(e));
}

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
export function buildProduct(id: string, src: HubProductSource, { plans = [], render = (md) => md, rules: rulesHook, today }: BuildOptions = {}): Product {
  const file = (key: keyof typeof HUB_PATHS) => `${src.dir}/${HUB_PATHS[key]}`;
  const readmeFile = `${src.dir}/README.md`;
  const { meta, body, error } = parseDoc(src.readme || '');
  const sections = splitSections(body);
  const sec = Object.fromEntries(Object.entries(README_SECTIONS).map(([k, re]) => [k, findSection(sections, re)]));
  const html = (s: DocSection | null, f = readmeFile) => (s ? render(s.body, f) : null);
  const findings: Finding[] = [];
  if (error) findings.push({ kind: 'inconsistent', area: 'overview', text: `README front matter does not parse: ${error}`, file: readmeFile });
  if (meta.product && meta.product !== id) findings.push({ kind: 'inconsistent', area: 'overview', text: `README says product “${meta.product}” in folder “${id}”.`, file: readmeFile });
  if (meta.status && !(PRODUCT_STATUSES as readonly unknown[]).includes(meta.status)) findings.push({ kind: 'inconsistent', area: 'overview', text: `README status “${meta.status}” is not one of ${PRODUCT_STATUSES.join(', ')}.`, file: readmeFile });
  /** A whole page as a hub document (title dropped), or null when the file does not exist. */
  const page = (text: string | null | undefined, f: string, sourceLabel: string): HubDoc | null => (text ? { html: render(parseDoc(text).body.replace(/^#\s+.+$/m, ''), f), source: f, sourceLabel } : null);
  /** Several pages as one document, each under its own title. */
  const pages = (list: FileText[] | undefined, sourceLabel: string): HubDoc | null =>
    list?.length
      ? {
          html: list
            .map(({ file: f, text }) => {
              const d = parseDoc(text);
              return `<h2>${escapeHtml(titleOf(d.body, f))}</h2>${render(d.body.replace(/^#\s+.+$/m, ''), f)}`;
            })
            .join('\n'),
          source: list[0].file,
          sourceLabel,
        }
      : null;

  const features: Feature[] = (src.features || [])
    .map(({ file: f, text }) => {
      const d = parseDoc(text);
      const slug = slugOf(f.split('/').pop() as string);
      const statusRaw = d.meta.status == null ? '' : String(d.meta.status);
      return {
        slug,
        file: f,
        title: titleOf(d.body, slug),
        status: statusRaw.trim().toLowerCase(),
        statusRaw,
        product: str(d.meta.product),
        group: str(d.meta.group),
        issues: asNums(d.meta.issues),
        updated: str(d.meta.updated),
        summary: d.meta.summary ? String(d.meta.summary) : featureSummary(d.body),
        html: render(d.body.replace(/^#\s+.+$/m, ''), f),
        parseError: d.error,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
  // The feature table: features/README.md.
  const catalogFile = file('featuresIndex');
  const rows = featureTableRows(src.featuresIndex ? parseDoc(src.featuresIndex).body : '', { sameFolder: true });
  findings.push(...featureFindings(id, features, rows, catalogFile));

  const adrs: Adr[] = (src.adrs || [])
    .map(({ file: f, text }) => {
      const d = parseDoc(text);
      const number = Number(d.meta.adr ?? ((f.split('/').pop() as string).match(/^(\d+)/) || [])[1]);
      return {
        number,
        label: String(number).padStart(4, '0'),
        file: f,
        title: String(d.meta.title || titleOf(d.body, f)),
        status: String(d.meta.status || '').toLowerCase(),
        date: str(d.meta.date),
        issues: asNums(d.meta.issues),
        supersedes: asNums(d.meta.supersedes),
        supersededBy: asNums(d.meta['superseded-by']),
        html: render(d.body.replace(/^#\s+.+$/m, ''), f),
      };
    })
    .filter((a) => Number.isFinite(a.number))
    .sort((a, b) => a.number - b.number);
  findings.push(...adrFindings(adrs));

  // Business plan: `plan:` in the README front matter, else a plan with the product's id.
  const planId = meta.plan ? String(meta.plan) : id;
  const plan = plans.find((p) => p.id === planId) || null;
  if (meta.plan && !plan) findings.push({ kind: 'missing', area: 'business-plan', text: `README names business plan “${meta.plan}”, which was not found (${src.dir}/${HUB_PATHS.businessPlan}).`, file: readmeFile });
  const planSec = (re: RegExp) => (plan ? (plan.sections || []).find((s) => re.test(norm(s.title))) || null : null);
  const planDoc = (re: RegExp): HubDoc | null => {
    const s = planSec(re);
    return s && plan ? { html: s.html || render(s.body || '', plan.file), source: plan.file, sourceLabel: `business plan · ${s.title}` } : null;
  };

  const roadmapDoc = src.roadmap ? parseDoc(src.roadmap) : null;
  // Candidates: ideas not counted as features. Launch tasks: the roadmap's "Launch tasks" table.
  const candidatesFile = file('candidates');
  const candidatesDoc = src.candidates ? parseDoc(src.candidates) : null;
  const candidates: Candidate[] = candidatesDoc
    ? markdownTable(candidatesDoc.body).map((r) => ({
        name: cellText(r.candidate),
        adds: cellText(r['what-it-would-add']),
        gate: cellText(r['gate-why-not-now'] ?? r.gate),
        related: (String(r['related-feature'] || '').match(/\]\((?:\.\/)?([a-z0-9-]+)\.md/) || [])[1] || null,
        source: cellText(r.source),
      }))
    : [];
  const launchSec = roadmapDoc ? findSection(splitSections(roadmapDoc.body), /^launch tasks/) : null;
  const launchTasks: LaunchTask[] = launchSec
    ? markdownTable(launchSec.body).map((r) => ({ name: cellText(r.task), neededFor: cellText(r['needed-for']), status: cellText(r.status), owner: /^yes/i.test(cellText(r.owner)), issue: cellText(r.issue) }))
    : [];
  for (const c of candidates) {
    if (c.related && !features.some((f) => f.slug === c.related)) findings.push({ kind: 'missing', area: 'catalog', text: `Candidate “${c.name}” links features/${c.related}.md, which does not exist.`, file: candidatesFile });
  }
  for (const t of launchTasks) {
    if (!/^(open|in progress|done)/i.test(t.status)) findings.push({ kind: 'inconsistent', area: 'roadmap', text: `Launch task “${t.name}” has status “${t.status}”; start it with open, in progress or done.`, file: file('roadmap') });
  }
  const archDoc = src.architecture ? parseDoc(src.architecture) : null;
  const join2 = (...parts: (string | null)[]) => parts.filter(Boolean).join('\n');
  const none: HubDoc = { html: null };

  /** The hub's documents: one per card; `html` null = no source yet. */
  const roadmap = page(src.roadmap, file('roadmap'), 'roadmap.md');
  const releases = pages(src.releases, 'releases/');
  const docs: Record<string, HubDoc> = {
    overview: page(src.overview, file('overview'), 'overview.md') || none,
    value: page(src.value, file('value'), 'value-proposition.md') || none,
    competitive: page(src.competitive, file('competitive'), 'competitive-index.md') || none,
    gtm: page(src.gtm, file('gtm'), 'go-to-market.md') || none,
    monetization: page(src.monetization, file('monetization'), 'monetization.md') || none,
    marketing: page(src.marketing, file('marketing'), 'marketing.md') || none,
    brand: page(src.brand, file('brand'), 'brand.md') || none,
    experiments: page(src.experiments, file('experiments'), 'experiments.md') || none,
    roadmap: roadmap ? { ...roadmap, html: join2(roadmap.html, releases ? `<h2>Release plans</h2>${String(releases.html).replace(/<h2>/g, '<h3>').replace(/<\/h2>/g, '</h3>')}` : '') } : none,
    metrics: sec.metrics ? { html: html(sec.metrics), source: readmeFile, sourceLabel: `hub README · ${sec.metrics.title}` } : none,
    architecture: page(src.architecture, file('architecture'), 'architecture-engineering/overview.md') || none,
    components: page(src.components, file('components'), 'components-and-data-flows.md') || none,
    stack: page(src.stack, file('stack'), 'technology-stack.md') || none,
    technical: pages(src.technical, 'architecture-engineering/technical/') || none,
    quality: page((src.technical || []).find((t) => t.file.endsWith('/testing.md'))?.text, `${src.dir}/${HUB_PATHS.technical}/testing.md`, 'technical/testing.md') || none,
    ...Object.fromEntries(WORKFLOW_PAGES.map((k) => [k, page(src.workflow?.[k], `${src.dir}/${HUB_PATHS.workflow}/${k}.md`, `ai-development-workflow/${k}.md`) || none])),
  };
  docs['business-plan'] = plan ? { ...(planDoc(/^executive summary/) || { html: null }), source: plan.file, sourceLabel: 'business plan · executive summary', route: `#business-plans/${encodeURIComponent(plan.id)}`, title: plan.meta?.title || plan.id } : none;

  const present: Record<string, boolean> = {
    overview: !!src.overview,
    value: !!docs.value.html,
    'business-plan': !!plan,
    catalog: features.length > 0,
    roadmap: !!docs.roadmap.html,
    experiments: !!docs.experiments.html,
    gtm: !!(docs.gtm.html || docs.marketing.html),
    monetization: !!docs.monetization.html,
    brand: !!docs.brand.html,
    architecture: !!archDoc,
    components: !!docs.components.html,
    stack: !!docs.stack.html,
    adr: adrs.length > 0,
    technical: !!docs.technical.html,
    metrics: !!(docs.metrics.html || docs.quality.html),
    'ai-workflow': WORKFLOW_PAGES.every((k) => docs[k].html),
  };
  {
    const gaps = WORKFLOW_PAGES.filter((k) => !docs[k].html);
    if (gaps.length && gaps.length < WORKFLOW_PAGES.length) findings.push({ kind: 'missing', area: 'ai-workflow', text: `AI & development workflow is incomplete: ${gaps.map((k) => `${k}.md`).join(', ')} missing.`, file: `${src.dir}/${HUB_PATHS.workflow}/` });
  }
  // A page still marked `status: draft` (e.g. fresh from _template/ via `npm run product:new`) requires review: it
  // exists, but nobody has written or confirmed its content yet. The business plan keeps its own plan status.
  const drafts: [keyof typeof HUB_PATHS | null, string | null | undefined, string, string, string?][] = [
    ['overview', src.overview, 'overview', 'Product overview'],
    ['value', src.value, 'value', 'Value proposition'],
    ['competitive', src.competitive, 'value', 'Competitive index'],
    ['gtm', src.gtm, 'gtm', 'Go-to-market'],
    ['marketing', src.marketing, 'gtm', 'Marketing'],
    ['monetization', src.monetization, 'monetization', 'Monetization'],
    ['brand', src.brand, 'brand', 'Brand identity'],
    ['roadmap', src.roadmap, 'roadmap', 'Roadmap'],
    ['experiments', src.experiments, 'experiments', 'Experiments'],
    ['featuresIndex', src.featuresIndex, 'catalog', 'Feature catalog'],
    ['architecture', src.architecture, 'architecture', 'Architecture overview'],
    ['components', src.components, 'components', 'Components and data flows'],
    ['stack', src.stack, 'stack', 'Technology stack'],
    ...WORKFLOW_PAGES.map((k): [null, string | null | undefined, string, string, string] => [null, src.workflow?.[k], 'ai-workflow', `AI & development workflow · ${k}`, `${src.dir}/${HUB_PATHS.workflow}/${k}.md`]),
    ...(src.technical || []).map((t): [null, string, string, string, string] => [null, t.text, 'technical', `Technical · ${t.file.split('/').pop()}`, t.file]),
    ...(src.releases || []).map((t): [null, string, string, string, string] => [null, t.text, 'roadmap', `Release plan · ${t.file.split('/').pop()}`, t.file]),
  ];
  for (const [key, text, area, label, f] of drafts) {
    if (text && String(parseDoc(text).meta.status || '').toLowerCase() === 'draft') {
      findings.push({ kind: 'stale', area, text: `${label} is still a draft (status: draft) – write the real content and set status: current.`, file: f || file(key as keyof typeof HUB_PATHS) });
    }
  }
  // Experiments: a row past its revisit-by date with no result requires review; only when the host passes today.
  const experiments = src.experiments ? experimentRows(parseDoc(src.experiments).body) : [];
  for (const e of today == null ? [] : overdueExperiments(experiments, today)) {
    findings.push({ kind: 'stale', area: 'experiments', text: `Experiment “${e.id || e.hypothesis}” is past its revisit-by date (${e.revisitBy}) with no result – record the result or set a new date.`, file: file('experiments') });
  }
  // The hub README and feature pages keep their own status enum (stage, feature status), so a draft is marked with
  // `draft: true` instead (the bootstrap skill writes it); it requires review the same way.
  const isDraftFlag = (v: unknown) => v === true || String(v ?? '').trim().toLowerCase() === 'true';
  if (isDraftFlag(meta.draft)) findings.push({ kind: 'stale', area: 'overview', text: 'Product README is still a draft (draft: true) – confirm the content and remove draft: true.', file: readmeFile });
  for (const { file: f, text } of src.features || []) {
    if (isDraftFlag(parseDoc(text).meta.draft)) findings.push({ kind: 'stale', area: 'catalog', text: `Feature “${slugOf(f.split('/').pop() as string)}” is still a draft (draft: true) – confirm the content and remove draft: true.`, file: f });
  }
  const rules = src.ruleTexts && rulesHook ? rulesHook(src.ruleTexts, src.dir) : null;
  for (const e of rules?.errors || []) findings.push({ kind: 'inconsistent', area: 'technical', text: `Rule grades: ${e}.`, file: rules?.files?.notes as string });
  const status = meta.status ? String(meta.status) : null;
  const stage = (status && STAGE_OF_STATUS[status]) || null;
  // Stale: a feature file changed after the product README – the README may need a review.
  const newest = features.map((f) => f.updated).filter(Boolean).sort().pop() || null;
  if (meta.updated && newest && String(meta.updated) < newest) findings.push({ kind: 'stale', area: 'overview', text: `A feature file was updated on ${newest}, after the product README (${meta.updated}).`, file: readmeFile });

  return {
    id,
    dir: src.dir,
    name: String(meta.name || id),
    status,
    stage,
    stageLabel: STAGES.find((s) => s.id === stage)?.label || null,
    team: str(meta.team),
    updated: str(meta.updated),
    pitch: firstLine(body),
    readmeFile,
    plan: plan ? { id: plan.id, title: plan.meta?.title || plan.id, route: `#business-plans/${encodeURIComponent(plan.id)}` } : null,
    docs,
    features: features.map((f) => {
      const out = { ...f };
      delete out.parseError;
      return out;
    }),
    featureCounts: featureCounts(features),
    candidates,
    candidatesFile: candidatesDoc ? candidatesFile : null,
    launchTasks,
    experiments,
    adrs,
    rules,
    findings,
    health: healthOf({ stage, present, findings }),
  };
}

export interface ReadOptions {
  /** Rule pipeline files to read into `ruleTexts`: key → path inside the product folder. Omitted: not read. */
  ruleFiles?: Readonly<Record<string, string>>;
}

/** Reads the sources of one product folder in the hub layout (`dir` repo-relative, e.g. docs/product-hub/<id>). */
export function readHubProduct(source: HubSource, dir: string, { ruleFiles }: ReadOptions = {}): HubProductSource {
  const p = (k: keyof typeof HUB_PATHS) => joinPath(dir, HUB_PATHS[k]);
  const list = (d: string, skip: string[] = []): FileText[] =>
    (source.isDir(d) ? source.list(d).filter((f) => f.endsWith('.md') && !skip.includes(f)).sort() : []).map((f) => ({ file: joinPath(d, f), text: source.read(joinPath(d, f)) as string }));
  const readme = source.read(joinPath(dir, 'README.md'));
  if (readme == null) throw new Error(`${dir}/README.md does not exist`);
  return {
    dir,
    readme,
    overview: source.read(p('overview')),
    value: source.read(p('value')),
    competitive: source.read(p('competitive')),
    gtm: source.read(p('gtm')),
    monetization: source.read(p('monetization')),
    marketing: source.read(p('marketing')),
    brand: source.read(p('brand')),
    roadmap: source.read(p('roadmap')),
    experiments: source.read(p('experiments')),
    releases: list(p('releases')),
    featuresIndex: source.read(p('featuresIndex')),
    features: list(p('features'), ['README.md', 'candidates.md']),
    candidates: source.read(p('candidates')),
    architecture: source.read(p('architecture')),
    components: source.read(p('components')),
    stack: source.read(p('stack')),
    adrs: list(p('decisions'), ['README.md']),
    technical: list(p('technical')),
    workflow: Object.fromEntries(WORKFLOW_PAGES.map((k) => [k, source.read(joinPath(dir, HUB_PATHS.workflow, `${k}.md`))])),
    ...(ruleFiles ? { ruleTexts: Object.fromEntries(Object.entries(ruleFiles).map(([k, f]) => [k, source.read(joinPath(dir, f))])) } : {}),
  };
}

/** Product folder ids with a README.md under `hubDir` (folders starting with "_", e.g. _template, and RESERVED_IDS are skipped). */
export function productIds(source: HubSource, hubDir: string = HUB_DIR): string[] {
  if (!source.isDir(hubDir)) return [];
  return source
    .list(hubDir)
    .filter((id) => !id.startsWith('_') && !(RESERVED_IDS as readonly string[]).includes(id) && source.isDir(joinPath(hubDir, id)) && source.read(joinPath(hubDir, id, 'README.md')) != null)
    .sort();
}

export interface LoadOptions extends BuildOptions, ReadOptions {
  /** Repo-relative folder holding one folder per product (default docs/product-hub). */
  hubDir?: string;
}

/** Reads and builds every product folder under `hubDir`. A folder that fails to build is reported in `errors`. */
export function loadProductDocs(source: HubSource, { hubDir = HUB_DIR, plans = [], render, rules, ruleFiles, today }: LoadOptions = {}): { products: Product[]; errors: string[] } {
  const errors: string[] = [];
  const products: Product[] = [];
  for (const id of productIds(source, hubDir)) {
    try {
      products.push(buildProduct(id, readHubProduct(source, joinPath(hubDir, id), { ruleFiles }), { plans, render, rules, today }));
    } catch (e) {
      errors.push(`${id}: ${(e as Error).message}`);
    }
  }
  return { products, errors };
}
