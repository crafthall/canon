/**
 * The structure check of a product hub (rules and layout: docs/layout.md). For a product folder <hubDir>/<id>/ it reports
 *   1. a file or folder that is not in the fixed layout (rule `layout`),
 *   2. a Markdown page without the front matter keys product, page, status, updated, or with a wrong product or date
 *      (`front-matter`),
 *   3. a relative (or repo-root) Markdown link whose target does not exist (`link`),
 *   4. a page the lifecycle stage requires that is missing (`lifecycle`; matrix: REQUIREMENTS in model.ts), and a hub
 *      README status outside the enum (`status`),
 *   5. a feature file without an enum status (`feature`), without a row in features/README.md, or a row without a file
 *      (`catalog`),
 *   6. a decision record missing from decisions/README.md (`adr-index`),
 *   7. an app named in the hub README that does not exist or lacks the Nx tag product:<id> (`app`),
 *   8. the same "## " topic heading as a main section of two pages, Changelog, Sources and History excepted (`topic`),
 *   9. a project in apps/ or libs/ tagged product:<id> without <hubDir>/<id>/README.md (`tagged-without-hub`), a
 *      product folder with a reserved name (`reserved-id`) and a stray file in <hubDir>/ (`hub-folder`),
 *  10. a project package.json in apps/ or libs/ that is not valid JSON, so its Nx tags cannot be read (`package-json`,
 *      reported as a problem, not a crash).
 * Pure: every read goes through a `HubSource` (or the callbacks of checkProduct / checkConsistency).
 */
import { featureTableRows } from './readers.ts';
import { FEATURE_STATUSES, FRONT_MATTER_KEYS, HUB_DIR, PRODUCT_STATUSES, REQUIREMENTS, RESERVED_IDS, STAGES, STAGE_OF_STATUS, WORKFLOW_PAGES } from './model.ts';
import { joinPath, type HubSource } from './source.ts';

/** Rule ids of the structure check (stable: the `--json` contract carries them). */
export const CHECK_RULES = ['layout', 'front-matter', 'link', 'lifecycle', 'status', 'feature', 'catalog', 'adr-index', 'app', 'topic', 'tagged-without-hub', 'reserved-id', 'hub-folder', 'package-json'] as const;
export type CheckRule = (typeof CHECK_RULES)[number];

/** One problem of the structure check. `message` is the line the check prints; `file` the path it is about. */
export interface CheckProblem {
  rule: CheckRule;
  file: string;
  message: string;
}

/** One entry of a product folder, relative to it. */
export interface HubEntry {
  path: string;
  dir: boolean;
}

export const FRONT_KEYS: readonly string[] = FRONT_MATTER_KEYS;

const KEBAB = '[a-z0-9]+(?:-[a-z0-9]+)*';
/**
 * The fixed layout: exact paths (`files`) and patterns for the open folders. A path inside a product folder is
 * allowed when it is listed or matches a pattern; folders are allowed when listed in `dirs`.
 */
export const LAYOUT: { files: ReadonlySet<string>; patterns: readonly RegExp[]; dirs: ReadonlySet<string> } = {
  files: new Set([
    'README.md',
    'business-product/overview.md',
    'business-product/business-plan.md',
    'business-product/business-model.json',
    'business-product/value-proposition.md',
    'business-product/competitive-index.md',
    'business-product/competition-landscape.md',
    'business-product/go-to-market.md',
    'business-product/monetization.md',
    'business-product/marketing.md',
    'business-product/brand.md',
    'business-product/roadmap.md',
    'business-product/experiments.md',
    'business-product/features/README.md',
    'business-product/features/candidates.md',
    'architecture-engineering/overview.md',
    'architecture-engineering/components-and-data-flows.md',
    'architecture-engineering/technology-stack.md',
    'architecture-engineering/decisions/README.md',
    'ai-development-workflow/agent-instructions.md',
    'ai-development-workflow/documentation-rules.md',
    'ai-development-workflow/definition-of-done.md',
    'ai-development-workflow/documentation-skills.md',
  ]),
  patterns: [
    new RegExp(`^business-product\\/releases\\/${KEBAB}\\.md$`),
    new RegExp(`^business-product\\/features\\/${KEBAB}\\.md$`),
    new RegExp(`^architecture-engineering\\/decisions\\/\\d{4}-${KEBAB}\\.md$`),
    new RegExp(`^architecture-engineering\\/technical\\/${KEBAB}\\.md$`),
    /^architecture-engineering\/technical\/potential-problems\.grades\.json$/,
    new RegExp(`^architecture-engineering\\/technical\\/rules\\/(?:README\\.md|${KEBAB}\\.md|notes\\.json)$`),
    /^architecture-engineering\/technical\/rule-registry\.json$/,
  ],
  dirs: new Set(['business-product', 'business-product/releases', 'business-product/features', 'architecture-engineering', 'architecture-engineering/decisions', 'architecture-engineering/technical', 'architecture-engineering/technical/rules', 'ai-development-workflow']),
};

/** Whether a path (relative to a product folder) is a file the layout allows. */
export const allowedFile = (p: string): boolean => LAYOUT.files.has(p) || LAYOUT.patterns.some((re) => re.test(p));

/** Top-level `key: value` lines of a page's front matter as raw strings, or null when there is no front matter. */
export function frontKeys(text: string | null | undefined): Record<string, string> | null {
  const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const out: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const k = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (k) out[k[1]] = k[2].trim();
  }
  return out;
}

/** Relative and repo-root link targets of a Markdown text (fenced code and inline code skipped). */
export function linkTargets(text: string | null | undefined): string[] {
  const out: string[] = [];
  let fence = false;
  for (const line of String(text).split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    for (const [, target] of line.replace(/`[^`]*`/g, '').matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      out.push(target);
    }
  }
  return out;
}

/** Normalises a "/"-separated path like path.posix.normalize (no file system). */
export function normalizePath(p: string): string {
  const abs = p.startsWith('/');
  const out: string[] = [];
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop();
      else if (!abs) out.push('..');
    } else out.push(part);
  }
  if (!out.length) return abs ? '/' : p.endsWith('/') ? './' : '.';
  return (abs ? '/' : '') + out.join('/') + (p.endsWith('/') ? '/' : '');
}

const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '.');

export interface ProductIO {
  /** Text of a file relative to the product folder. */
  read(path: string): string;
  /** Whether a repo-relative path (file or folder) exists. */
  exists(repoPath: string): boolean;
  /** Repo-relative product folder used in messages (default `<HUB_DIR>/<id>`). */
  base?: string;
}

/** Layout, front matter and link problems of one product folder (`entries` = every file and folder, relative). */
export function checkProduct(id: string, entries: readonly HubEntry[], { read, exists, base = `${HUB_DIR}/${id}` }: ProductIO): CheckProblem[] {
  const problems: CheckProblem[] = [];
  const add = (rule: CheckRule, file: string, message: string) => problems.push({ rule, file, message });
  for (const e of entries) {
    if (e.dir) {
      if (!LAYOUT.dirs.has(e.path)) add('layout', `${base}/${e.path}/`, `${base}/${e.path}/: folder not in the product hub layout`);
      continue;
    }
    const file = `${base}/${e.path}`;
    if (!allowedFile(e.path)) {
      // A file inside an unknown folder is reported once, through its folder.
      if (!entries.some((d) => d.dir && e.path.startsWith(`${d.path}/`) && !LAYOUT.dirs.has(d.path))) add('layout', file, `${file}: file not in the product hub layout`);
      continue;
    }
    if (!e.path.endsWith('.md')) continue;
    const text = read(e.path);
    const keys = frontKeys(text);
    if (!keys) add('front-matter', file, `${file}: no front matter (${FRONT_KEYS.join(', ')})`);
    else {
      const missing = FRONT_KEYS.filter((k) => !keys[k]);
      if (missing.length) add('front-matter', file, `${file}: front matter misses ${missing.join(', ')}`);
      if (keys.product && id !== '_template' && keys.product !== id) add('front-matter', file, `${file}: front matter says product "${keys.product}" in folder "${id}"`);
      if (keys.updated && id !== '_template' && !/^\d{4}-\d{2}-\d{2}$/.test(keys.updated)) add('front-matter', file, `${file}: "updated" must be a date YYYY-MM-DD`);
    }
    for (const target of linkTargets(text)) {
      const f = decodeURI(target.split('#')[0]);
      if (!f) continue;
      const repoPath = f.startsWith('/') ? f.slice(1) : normalizePath(`${base}/${dirOf(e.path)}/${f}`);
      if (repoPath.startsWith('..') || !exists(repoPath.replace(/\/$/, ''))) add('link', file, `${file}: broken link "${target}"`);
    }
  }
  return problems;
}

/**
 * Lifecycle files: which file(s) meet each requirement of the matrix (REQUIREMENTS). A requirement is met when every
 * file of one alternative exists.
 */
export const REQUIREMENT_FILES: Readonly<Record<string, readonly (readonly string[])[]>> = {
  overview: [['business-product/overview.md']],
  value: [['business-product/value-proposition.md']],
  'business-plan': [['business-product/business-plan.md', 'business-product/business-model.json']],
  catalog: [['business-product/features/README.md']],
  roadmap: [['business-product/roadmap.md']],
  experiments: [['business-product/experiments.md']],
  gtm: [['business-product/go-to-market.md'], ['business-product/marketing.md']],
  monetization: [['business-product/monetization.md']],
  brand: [['business-product/brand.md']],
  architecture: [['architecture-engineering/overview.md']],
  components: [['architecture-engineering/components-and-data-flows.md']],
  stack: [['architecture-engineering/technology-stack.md']],
  adr: [['architecture-engineering/decisions/README.md']],
  technical: [],
  metrics: [['architecture-engineering/technical/testing.md']],
  'ai-workflow': [WORKFLOW_PAGES.map((k) => `ai-development-workflow/${k}.md`)],
};
/** "## " headings that are expected in many pages (templates), so they are not a topic in two files. */
export const SHARED_HEADINGS: ReadonlySet<string> = new Set(['changelog', 'sources', 'history']);
const normHeading = (h: string) => h.toLowerCase().replace(/^\d+[a-z]?[.)]?\s*/, '').replace(/[`*_]/g, '').replace(/\s*\(.*\)\s*$/, '').trim();

export interface ConsistencyIO {
  /** Text of a file relative to the product folder. */
  read(path: string): string;
  /**
   * Nx tags of a project folder (e.g. apps/x), or null when the project does not exist. Throws a `ProjectJsonError`
   * when its package.json is not valid JSON (reported as rule `package-json`).
   */
  appTags(appDir: string): string[] | null;
  base?: string;
}

/**
 * Consistency problems of one product folder beyond the structure: lifecycle files, feature catalog, ADR index, app
 * tags and topic headings. `files` = paths relative to the folder.
 */
export function checkConsistency(id: string, files: ReadonlySet<string>, { read, appTags, base = `${HUB_DIR}/${id}` }: ConsistencyIO): CheckProblem[] {
  const problems: CheckProblem[] = [];
  const add = (rule: CheckRule, file: string, message: string) => problems.push({ rule, file, message });
  const has = (p: string) => files.has(p);
  const readme = has('README.md') ? read('README.md') : '';
  const meta = frontKeys(readme) || {};
  // 1. Pages the lifecycle stage requires.
  const stage = STAGE_OF_STATUS[meta.status];
  const si = STAGES.findIndex((s) => s.id === stage);
  if (meta.status && !(PRODUCT_STATUSES as readonly string[]).includes(meta.status)) add('status', `${base}/README.md`, `${base}/README.md: status "${meta.status}" is not one of ${PRODUCT_STATUSES.join(', ')}`);
  if (si >= 0) {
    for (const r of REQUIREMENTS) {
      if (r.levels[si] !== 'R') continue;
      const alts = REQUIREMENT_FILES[r.id] || [];
      if (r.id === 'metrics' && /^##\s+product metrics/im.test(readme)) continue;
      if (alts.length && !alts.some((alt) => alt.every(has))) add('lifecycle', base, `${base}: ${r.label} is required at ${STAGES[si].label} – add ${alts.map((a) => a.join(' + ')).join(' or ')}`);
    }
  }
  // 2. Feature files: a status from the enum and a row in the catalog.
  const features = [...files].filter((p) => /^business-product\/features\/[a-z0-9-]+\.md$/.test(p) && !/\/(README|candidates)\.md$/.test(p)).sort();
  const catalog = has('business-product/features/README.md') ? read('business-product/features/README.md') : '';
  const listed = new Set(featureTableRows(catalog, { sameFolder: true }).flatMap((r) => r.docs));
  for (const f of features) {
    const slug = (f.split('/').pop() as string).replace(/\.md$/, '');
    const status = (read(f).match(/^status:\s*(\S+)/m) || [])[1];
    if (!(FEATURE_STATUSES as readonly (string | undefined)[]).includes(status)) add('feature', `${base}/${f}`, `${base}/${f}: feature status "${status || 'none'}" – use one of ${FEATURE_STATUSES.join(', ')}`);
    if (catalog && !listed.has(slug)) add('catalog', `${base}/${f}`, `${base}/${f}: not in the feature catalog (business-product/features/README.md)`);
  }
  for (const slug of listed) if (!has(`business-product/features/${slug}.md`)) add('catalog', `${base}/business-product/features/README.md`, `${base}/business-product/features/README.md: catalog row links ${slug}.md, which does not exist`);
  // 3. Every decision record is in the decisions index.
  const index = has('architecture-engineering/decisions/README.md') ? read('architecture-engineering/decisions/README.md') : null;
  for (const f of [...files].filter((p) => /^architecture-engineering\/decisions\/\d{4}-[^/]+\.md$/.test(p))) {
    const name = f.split('/').pop() as string;
    if (index == null) add('adr-index', `${base}/${f}`, `${base}/${f}: decision record without architecture-engineering/decisions/README.md`);
    else if (!index.includes(`](${name})`) && !index.includes(`](./${name})`)) add('adr-index', `${base}/${f}`, `${base}/${f}: not linked from the decisions index (architecture-engineering/decisions/README.md)`);
  }
  // 4. Apps named in the hub README exist and carry product:<id>.
  if (id !== '_template') {
    const apps = new Set([...readme.matchAll(/\]\((?:\.\.\/){3}(apps\/[a-z0-9-]+)\//g)].map((m) => m[1]));
    if (meta.app && meta.app !== 'none' && /^apps\//.test(meta.app)) apps.add(meta.app.replace(/\/$/, ''));
    for (const app of apps) {
      let tags: string[] | null;
      try {
        tags = appTags(app);
      } catch (e) {
        if (!(e instanceof ProjectJsonError)) throw e;
        add('package-json', e.file, packageJsonMessage(e.file));
        continue;
      }
      if (!tags) add('app', `${base}/README.md`, `${base}/README.md: names ${app}, which does not exist`);
      else if (!tags.includes(`product:${id}`)) add('app', `${app}/package.json`, `${app}/package.json: named in ${base}/README.md but has no "product:${id}" Nx tag (add it to "nx": { "tags" } – Canon docs, layout.md "App tags")`);
    }
  }
  // 5. One topic in one file: the same "## " heading as a main section of two pages.
  const pages = [...files].filter((p) => p.endsWith('.md') && !/^business-product\/features\/|^architecture-engineering\/decisions\//.test(p));
  const seen = new Map<string, Set<string>>();
  for (const p of pages) {
    // A section that only points to the page holding the topic ("Moved … to [page](…)") is not a second copy.
    let fence = false;
    let cur: { h: string; body: string } | null = null;
    const sections: { h: string; body: string }[] = [];
    for (const line of read(p).split('\n')) {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence;
      const m = !fence && line.match(/^##\s+(.+?)\s*$/);
      if (m) sections.push((cur = { h: normHeading(m[1]), body: '' }));
      else if (cur) cur.body += line + '\n';
    }
    for (const s of sections) {
      if (!s.h || SHARED_HEADINGS.has(s.h) || /^moved\b/i.test(s.body.trim())) continue;
      if (!seen.has(s.h)) seen.set(s.h, new Set());
      (seen.get(s.h) as Set<string>).add(p);
    }
  }
  for (const [h, where] of seen) if (where.size > 1) add('topic', base, `${base}: topic "${h}" is a main section in ${[...where].sort().join(' and ')} – keep it in one page and link from the others`);
  return problems;
}

/** Every file and folder under `dir` (repo-relative), relative to it, sorted per folder; .DS_Store skipped. */
export function walkHub(source: HubSource, dir: string, prefix = ''): HubEntry[] {
  const out: HubEntry[] = [];
  for (const name of source.list(dir).sort()) {
    if (name === '.DS_Store') continue;
    const abs = joinPath(dir, name);
    const path = prefix ? `${prefix}/${name}` : name;
    if (source.isDir(abs)) out.push({ path, dir: true }, ...walkHub(source, abs, path));
    else out.push({ path, dir: false });
  }
  return out;
}

/** A project's package.json that is not valid JSON (`file` is its repo-relative path). */
export class ProjectJsonError extends Error {
  readonly file: string;
  constructor(file: string) {
    super(`${file} is not valid JSON`);
    this.name = 'ProjectJsonError';
    this.file = file;
  }
}

/** The `package-json` problem line (no parser detail: it differs between JavaScript engines, and the contract is fixed). */
const packageJsonMessage = (file: string) => `${file}: not valid JSON – its Nx tags cannot be read; fix the file`;

/**
 * Nx tags of a project (package.json "nx.tags"), or null when the project has no package.json. Throws a
 * `ProjectJsonError` when the package.json is not valid JSON.
 */
export const projectTags =
  (source: HubSource) =>
  (projectDir: string): string[] | null => {
    const file = joinPath(projectDir, 'package.json');
    const text = source.read(file);
    if (text == null) return null;
    let pkg: { nx?: { tags?: unknown } } | null;
    try {
      pkg = JSON.parse(text) as { nx?: { tags?: unknown } } | null;
    } catch {
      throw new ProjectJsonError(file);
    }
    const tags = pkg?.nx?.tags;
    return Array.isArray(tags) ? (tags as string[]) : [];
  };

/** Every project folder in apps/ and libs/ with its Nx tags (null: no package.json) or `broken` (package.json not JSON). */
function projects(source: HubSource): { dir: string; tags: string[] | null; broken: boolean }[] {
  const out: { dir: string; tags: string[] | null; broken: boolean }[] = [];
  const tagsOf = projectTags(source);
  for (const area of ['apps', 'libs']) {
    if (!source.isDir(area)) continue;
    for (const d of source.list(area).sort()) {
      const dir = `${area}/${d}`;
      try {
        out.push({ dir, tags: tagsOf(dir), broken: false });
      } catch (e) {
        if (!(e instanceof ProjectJsonError)) throw e;
        out.push({ dir, tags: null, broken: true });
      }
    }
  }
  return out;
}

/**
 * Projects in apps/ and libs/ with a product:<id> tag: [{ dir, product }] (package.json "nx.tags"). A package.json
 * that is not valid JSON is skipped here; checkHub reports it as `package-json`.
 */
export function taggedProjects(source: HubSource): { dir: string; product: string }[] {
  const out: { dir: string; product: string }[] = [];
  for (const { dir, tags } of projects(source)) for (const t of tags || []) if (t.startsWith('product:')) out.push({ dir, product: t.slice('product:'.length) });
  return out;
}

export interface CheckHubOptions {
  /** Repo-relative folder holding one folder per product (default docs/product-hub). */
  hubDir?: string;
  /** Check only this product folder (and the projects tagged for it). */
  only?: string | null;
  /** Command named in the "tagged without a hub" message (default `canon new`). */
  newCommand?: string;
  /**
   * The template a repository's `<hubDir>/_template/` overrides page by page (the package's bundled template; `canon new`
   * reads a page from it when the repository's template lacks it). With it, a link inside `_template/` to such a page is
   * not broken. Without it, `_template/` must hold every page it links to.
   */
  template?: HubSource | null;
}

/** Checks every product folder under `hubDir` (or only `only`). `products` counts product folders ("_" folders not). */
export function checkHub(source: HubSource, { hubDir = HUB_DIR, only = null, newCommand = 'canon new', template = null }: CheckHubOptions = {}): { products: number; problems: CheckProblem[] } {
  if (!source.isDir(hubDir)) return { products: 0, problems: [] };
  const problems: CheckProblem[] = [];
  let products = 0;
  const exists = (p: string) => source.read(p) != null || source.isDir(p);
  for (const name of source.list(hubDir).sort()) {
    const abs = joinPath(hubDir, name);
    if (!source.isDir(abs)) {
      if (name !== 'README.md' && name !== '.DS_Store') problems.push({ rule: 'hub-folder', file: `${hubDir}/${name}`, message: `${hubDir}/${name}: only README.md and product folders belong in ${hubDir}/` });
      continue;
    }
    if (only && name !== only) continue;
    if ((RESERVED_IDS as readonly string[]).includes(name)) {
      problems.push({ rule: 'reserved-id', file: `${hubDir}/${name}/`, message: `${hubDir}/${name}/: "${name}" is a reserved name (the hub viewer uses it for its own page, not a product) – rename the product folder` });
      continue;
    }
    products += name.startsWith('_') ? 0 : 1;
    const entries = walkHub(source, abs);
    const read = (p: string) => source.read(joinPath(abs, p)) as string;
    // In the repository's template, a page it does not override comes from `template` (see CheckHubOptions.template).
    const inTemplate = (p: string) => {
      const rel = p.startsWith(`${abs}/`) ? p.slice(abs.length + 1) : null;
      return !!template && rel != null && (template.read(rel) != null || template.isDir(rel));
    };
    const existsHere = name === '_template' && template ? (p: string) => exists(p) || inTemplate(p) : exists;
    problems.push(...checkProduct(name, entries, { read, exists: existsHere, base: abs }));
    if (!name.startsWith('_')) problems.push(...checkConsistency(name, new Set(entries.filter((e) => !e.dir).map((e) => e.path)), { read, appTags: projectTags(source), base: abs }));
  }
  // A project tagged for a product needs that product's hub (the reverse – a hub naming an app – is checkConsistency).
  for (const { dir, product } of taggedProjects(source)) {
    if (only && product !== only) continue;
    if (source.read(joinPath(hubDir, product, 'README.md')) == null) problems.push({ rule: 'tagged-without-hub', file: `${dir}/package.json`, message: `${dir}/package.json: tagged product:${product}, but ${hubDir}/${product}/README.md does not exist – create it with ${newCommand} ${product}` });
  }
  // A package.json that is not JSON hides its tags: reported once (a hub README naming the app may have reported it).
  for (const { dir, broken } of projects(source)) {
    const file = `${dir}/package.json`;
    if (broken && !problems.some((p) => p.rule === 'package-json' && p.file === file)) problems.push({ rule: 'package-json', file, message: packageJsonMessage(file) });
  }
  return { products, problems };
}
