/**
 * The scaffold plan of `canon new` (moved from Spark's product:new script): a new product folder
 * <hubDir>/<id>/ with the hub README and the pages its lifecycle stage requires (R in REQUIREMENTS), copied from a
 * template and filled in; optionally a business plan moved in (`--plan`) and Nx projects tagged (`--app`). Pure: it
 * reads through a `HubSource` and returns the actions; `applyPlan` in `@crafthall/canon/node` writes them.
 * Never overwrites: an existing or reserved id, an invalid id or an app of another product stop it before any write.
 */
import { normalizePath, REQUIREMENT_FILES, frontKeys } from "./check.js";
import { LEVEL_LABEL, REQUIREMENTS, RESERVED_IDS, STAGES, STAGE_OF_STATUS, resolveHubDir } from "./model.js";
import { joinPath } from "./source.js";
export const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const ROLES = ['primary', 'service', 'ui-host', 'tooling'];
/** Default folder of business plans that `--plan <id>` moves from (`<plansDir>/<id>/plan.md` + `model.json`). */
export const PLANS_DIR = 'docs/business-plans';
/** `--stage` values → hub README `status` (the lifecycle stage is derived from the status, STAGE_OF_STATUS). */
export const STAGE_STATUS = { idea: 'idea', validation: 'validation', building: 'building', development: 'building', live: 'live', operate: 'live' };
/** Hub README "Pages" list: section, requirement id, file, label – in the order of the hub's cards. */
export const PAGE_LIST = [
    ['Business & Product', 'overview', 'business-product/overview.md', 'Product overview and elevator pitch'],
    ['Business & Product', 'value', 'business-product/value-proposition.md', 'Value proposition'],
    ['Business & Product', 'business-plan', 'business-product/business-plan.md', 'Business plan (with business-model.json)'],
    ['Business & Product', 'gtm', 'business-product/go-to-market.md', 'Go-to-market'],
    ['Business & Product', 'monetization', 'business-product/monetization.md', 'Monetization'],
    ['Business & Product', 'roadmap', 'business-product/roadmap.md', 'Roadmap and gates'],
    ['Business & Product', 'catalog', 'business-product/features/README.md', 'Feature catalog'],
    ['Architecture & Engineering', 'architecture', 'architecture-engineering/overview.md', 'Architecture overview'],
    ['Architecture & Engineering', 'components', 'architecture-engineering/components-and-data-flows.md', 'Components and data flows'],
    ['Architecture & Engineering', 'stack', 'architecture-engineering/technology-stack.md', 'Technology stack'],
    ['AI & Development Workflow', 'ai-workflow', 'ai-development-workflow/agent-instructions.md', 'Agent instructions'],
    ['AI & Development Workflow', 'ai-workflow', 'ai-development-workflow/documentation-rules.md', 'Documentation rules'],
    ['AI & Development Workflow', 'ai-workflow', 'ai-development-workflow/definition-of-done.md', 'Definition of Done'],
    ['AI & Development Workflow', 'ai-workflow', 'ai-development-workflow/documentation-skills.md', 'Documentation skills'],
];
/** Parses the `canon new` arguments. Returns { opts } or { error } (a usage error). */
export function parseNewArgs(argv, { defaultTeam = null } = {}) {
    const opts = { id: null, name: null, pitch: null, team: defaultTeam, stage: 'idea', apps: [], plan: null, issue: null, dryRun: false, root: null };
    const valued = { '--name': 'name', '--pitch': 'pitch', '--team': 'team', '--stage': 'stage', '--plan': 'plan', '--issue': 'issue', '--root': 'root' };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--dry-run')
            opts.dryRun = true;
        else if (a === '--app') {
            if (argv[i + 1] == null)
                return { error: '--app needs a value' };
            opts.apps.push(argv[++i]);
        }
        else if (valued[a]) {
            if (argv[i + 1] == null || argv[i + 1].startsWith('--'))
                return { error: `${a} needs a value` };
            opts[valued[a]] = argv[++i];
        }
        else if (a.startsWith('--'))
            return { error: `unknown option ${a}` };
        else if (opts.id == null)
            opts.id = a;
        else
            return { error: `unexpected argument "${a}"` };
    }
    if (!opts.id)
        return { error: 'missing <id>' };
    return { opts };
}
/** posix.relative for two normalised repo-relative paths (no file system). */
export function relativePath(from, to) {
    const a = normalizePath(from).split('/').filter((p) => p && p !== '.');
    const b = normalizePath(to).split('/').filter((p) => p && p !== '.');
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i])
        i++;
    return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
}
const dirname = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '.');
/** The business plan's appendix that `--plan` moves along (docs/layout.md: competition-landscape.md). */
export const PLAN_APPENDIX = 'competition-landscape.md';
/** Front matter with the hub's page keys: product and page set, status and updated added when missing. */
function withPageKeys(text, product, page, today) {
    const m = String(text).match(/^---\n([\s\S]*?)\n---\n/);
    const kept = m ? m[1].split('\n').filter((l) => !/^(product|page):/.test(l)) : [];
    const keys = [`product: ${product}`, `page: ${page}`, ...kept];
    if (!keys.some((l) => /^status:/.test(l)))
        keys.push('status: current');
    if (!keys.some((l) => /^updated:/.test(l)))
        keys.push(`updated: ${today}`);
    return `---\n${keys.join('\n')}\n---\n${m ? String(text).slice(m[0].length) : `\n${text}`}`;
}
/** Rewrites the relative Markdown links of `text` from `fromFile` to `toFile` (repo-relative paths; code is skipped). */
export function rebaseLinks(text, fromFile, toFile) {
    let fence = false;
    return String(text)
        .split('\n')
        .map((line) => {
        if (/^\s*(```|~~~)/.test(line)) {
            fence = !fence;
            return line;
        }
        if (fence)
            return line;
        return line.replace(/\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g, (all, target, title) => {
            if (/^(https?:|mailto:|#|\/)/.test(target))
                return all;
            const [path, anchor = ''] = target.split(/(?=#)/);
            const abs = normalizePath(`${dirname(fromFile)}/${path}`);
            let rel = relativePath(dirname(toFile), abs) || '.';
            if (path.endsWith('/') && !rel.endsWith('/'))
                rel += '/';
            return `](${rel}${anchor}${title})`;
        });
    })
        .join('\n');
}
/** Replaces the body of the "## <title>" section of a Markdown text (up to the next "## "). */
function replaceSection(text, title, body) {
    const re = new RegExp(`(^## ${title}\\n)([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm');
    if (!re.test(text))
        throw new Error(`template README has no "## ${title}" section`);
    return text.replace(re, `$1\n${body.trim()}\n\n`);
}
/** Fills a template page: front matter `product` and `updated`, then <id>, <Name> and YYYY-MM-DD in the text. */
export function fillPage(text, { id, name, today }) {
    return String(text)
        .replace(/^product: <id>$/m, `product: ${id}`)
        .replace(/^updated: YYYY-MM-DD$/m, `updated: ${today}`)
        .replaceAll('<id>', id)
        .replaceAll('<Name>', name)
        .replaceAll('YYYY-MM-DD', today);
}
const titleCase = (id) => id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
/** A source over the sub-folder `prefix` of another source (paths relative to that folder). */
export function subSource(source, prefix) {
    return { read: (p) => source.read(joinPath(prefix, p)), list: (p) => source.list(joinPath(prefix, p)), isDir: (p) => source.isDir(joinPath(prefix, p)) };
}
/** Nx projects in apps/ (names = nx.name, package name, folder name). */
function appProjects(source) {
    if (!source.isDir('apps'))
        return [];
    return source
        .list('apps')
        .sort()
        .filter((d) => source.read(`apps/${d}/package.json`) != null)
        .map((d) => {
        const text = source.read(`apps/${d}/package.json`);
        const pkg = JSON.parse(text);
        return { dir: `apps/${d}`, names: [pkg.nx?.name, pkg.name, d].filter((x) => !!x), pkg, text };
    });
}
/**
 * Plans the new product without writing anything. Returns { errors, actions, summary }; `actions` are
 * { kind: 'write', path, text } (new file), { kind: 'mv', from, to } (git mv), { kind: 'edit', path, text, note }
 * (existing file), { kind: 'rmdir', path } – all paths repo-relative.
 */
export function planNew(source, opts, { today = new Date().toISOString().slice(0, 10), hubDir = resolveHubDir((p) => source.isDir(p)).hubDir, template, templateLabel, teams = null, plansDir = PLANS_DIR, movedPathsFile = null, command = 'canon new' } = {}) {
    const errors = [];
    const id = opts.id || '';
    const name = opts.name || titleCase(id);
    const dir = `${hubDir}/${id}`;
    const tplLabel = templateLabel || `${hubDir}/_template`;
    const tplSource = template || subSource(source, `${hubDir}/_template`);
    if (!ID_RE.test(id))
        errors.push(`"${opts.id}" is not a valid product id – use lowercase kebab-case (e.g. bike-gear-calc)`);
    else if (RESERVED_IDS.includes(id))
        errors.push(`"${id}" is reserved (the hub viewer uses it for its own page) – pick another id`);
    else if (source.isDir(dir) || source.read(dir) != null)
        errors.push(`${dir}/ already exists – ${command} never overwrites; edit that folder instead`);
    if (teams ? !teams.includes(opts.team) : opts.team != null && !ID_RE.test(opts.team))
        errors.push(teams ? `--team must be one of ${teams.join(', ')}` : '--team must be a kebab-case id');
    const status = STAGE_STATUS[opts.stage];
    if (!status)
        errors.push(`--stage "${opts.stage}" – use one of ${Object.keys(STAGE_STATUS).join(', ')} (the hub README status sets the stage)`);
    if (opts.issue != null && !/^\d+$/.test(String(opts.issue)))
        errors.push('--issue must be an issue number');
    if (tplSource.read('README.md') == null)
        errors.push(`${tplLabel}/README.md is missing`);
    if (errors.length)
        return { errors, actions: [], summary: null };
    const si = STAGES.findIndex((s) => s.id === STAGE_OF_STATUS[status]);
    const stageLabel = STAGES[si].label;
    // Pages this stage requires: every R requirement's first file alternative (README "Product metrics" covers metrics).
    const required = REQUIREMENTS.filter((r) => r.levels[si] === 'R').map((r) => r.id);
    const pages = [];
    for (const r of required) {
        if (r === 'metrics' || r === 'business-plan')
            continue;
        for (const f of (REQUIREMENT_FILES[r] || [])[0] || []) {
            if (tplSource.read(f) == null)
                errors.push(`${stageLabel} requires ${f}, but ${tplLabel}/${f} does not exist – add the template first`);
            else
                pages.push(f);
        }
    }
    if (!pages.includes('business-product/overview.md'))
        pages.unshift('business-product/overview.md');
    // Business plan: required from the Business plan stage on; it is never templated (it needs real numbers).
    let plan = null;
    if (required.includes('business-plan') && !opts.plan)
        errors.push(`${stageLabel} requires a business plan – pass --plan <id> with a plan from ${plansDir}/ (write one first: ${plansDir}/README.md), or start at an earlier --stage`);
    if (opts.plan) {
        const pdir = `${plansDir}/${opts.plan}`;
        if (!ID_RE.test(opts.plan) || source.read(`${pdir}/plan.md`) == null || source.read(`${pdir}/model.json`) == null)
            errors.push(`--plan ${opts.plan}: ${pdir}/plan.md and model.json must both exist`);
        else {
            // The plan's appendix (competition landscape) moves with it into business-product/; anything else has no place.
            const extra = source.list(pdir).filter((f) => !['plan.md', 'model.json', PLAN_APPENDIX, '.DS_Store'].includes(f));
            const text = source.read(`${pdir}/plan.md`);
            const meta = frontKeys(text) || {};
            if (extra.length)
                errors.push(`--plan ${opts.plan}: ${pdir}/ also holds ${extra.join(', ')} – the hub layout has no place for it; move or delete it first`);
            else if (meta.id !== opts.plan)
                errors.push(`--plan ${opts.plan}: ${pdir}/plan.md front matter says id "${meta.id || 'none'}" – fix it first`);
            else if (meta.product && meta.product !== id)
                errors.push(`--plan ${opts.plan}: the plan already belongs to product "${meta.product}"`);
            else
                plan = { id: opts.plan, dir: pdir, text, appendix: source.read(`${pdir}/${PLAN_APPENDIX}`) };
        }
    }
    // Apps: resolve each Nx project, refuse one tagged for another product, pick roles (first = primary).
    const projects = appProjects(source);
    const apps = [];
    opts.apps.forEach((spec, i) => {
        const [project, roleArg] = String(spec).split(':');
        const role = roleArg || (i === 0 ? 'primary' : null);
        const p = projects.find((x) => x.names.includes(project));
        if (!p)
            return errors.push(`--app ${project}: no Nx project with that name in apps/`);
        if (!role)
            return errors.push(`--app ${project}: a second app needs its role – --app ${project}:<${ROLES.filter((r) => r !== 'primary').join('|')}>`);
        if (!ROLES.includes(role))
            return errors.push(`--app ${project}: unknown role "${role}" – use one of ${ROLES.join(', ')}`);
        if (role === 'primary' && i > 0)
            return errors.push(`--app ${project}: only the first app is role:primary`);
        const tags = Array.isArray(p.pkg.nx?.tags) ? p.pkg.nx.tags : [];
        const other = tags.find((t) => t.startsWith('product:') && t !== `product:${id}`);
        if (other)
            return errors.push(`--app ${project}: ${p.dir} is already tagged ${other} – a project belongs to one product`);
        const oldRole = tags.find((t) => t.startsWith('role:') && t !== `role:${role}`);
        if (oldRole)
            return errors.push(`--app ${project}: ${p.dir} already has ${oldRole}`);
        if (JSON.stringify(p.pkg, null, 2) + '\n' !== p.text)
            return errors.push(`--app ${project}: ${p.dir}/package.json is not in standard 2-space JSON format – add the tags product:${id} and role:${role} by hand`);
        if (apps.some((a) => a.dir === p.dir))
            return errors.push(`--app ${project}: given twice`);
        apps.push({ ...p, project, role, tags });
        return undefined;
    });
    if (errors.length)
        return { errors, actions: [], summary: null };
    const actions = [];
    const ctx = { id, name, today };
    const tpl = (f) => tplSource.read(f);
    for (const f of pages) {
        let text = fillPage(tpl(f), ctx);
        if (opts.pitch && f === 'business-product/overview.md')
            text = text.replace(/^> One-line pitch\.$/m, `> ${opts.pitch}`);
        actions.push({ kind: 'write', path: `${dir}/${f}`, text });
    }
    // Hub README: generated front matter, the template body with the Status and Pages sections filled in.
    const primary = apps.find((a) => a.role === 'primary') || null;
    const front = ['---', `product: ${id}`, 'page: hub', `name: ${name}`, `status: ${status}`, ...(opts.team ? [`team: ${opts.team}`] : []), ...(plan && plan.id !== id ? [`plan: ${plan.id}`] : []), `app: ${primary ? primary.dir : 'none yet'}`, `updated: ${today}`, '---', ''].join('\n');
    const body = fillPage(tpl('README.md'), ctx).replace(/^---\n[\s\S]*?\n---\n/, '');
    // The README sits in <hubDir>/<id>/: one "../" per segment of that folder reaches the repository root.
    const toRoot = '../'.repeat(dir.split('/').filter(Boolean).length);
    const appCell = (a) => `[\`${a.dir}/\`](${toRoot}${a.dir}/) (\`role:${a.role}\`)`;
    const statusRows = [
        `| Stage | **${stageLabel}** (\`status: ${status}\`) |`,
        `| Team | ${opts.team ? titleCase(opts.team) : 'none yet'} |`,
        `| Primary app | ${primary ? appCell(primary) : 'none yet'} |`,
        ...apps.filter((a) => a !== primary).map((a) => `| Other app | ${appCell(a)} |`),
        ...(plan ? [`| Business plan | [business plan](business-product/business-plan.md) (plan id \`${plan.id}\`) |`] : []),
    ];
    const present = new Set([...pages, ...(plan ? ['business-product/business-plan.md'] : [])]);
    const lines = [];
    for (const section of [...new Set(PAGE_LIST.map((p) => p[0]))]) {
        const items = PAGE_LIST.filter((p) => p[0] === section && present.has(p[2]));
        if (!items.length)
            continue;
        lines.push(`**${section}**`, ...items.map((p) => `- [${p[3]}](${p[2]})`), '');
    }
    const met = (r) => (r.id === 'business-plan' ? !!plan : (REQUIREMENT_FILES[r.id] || []).some((alt) => alt.length && alt.every((f) => present.has(f))));
    const notDue = REQUIREMENTS.filter((r) => !['overview', 'metrics'].includes(r.id) && !met(r));
    // The framework rules page of the repo (<hubDir>/README.md) is linked when the repo has one.
    const rulesRef = source.read(`${hubDir}/README.md`) != null ? `[${hubDir}/README.md](../README.md)` : 'the Canon framework';
    lines.push(`**Not created yet at ${stageLabel}:** ${notDue.map((r) => `${/^[A-Z][a-z]/.test(r.label) ? r.label.charAt(0).toLowerCase() + r.label.slice(1) : r.label} (${LEVEL_LABEL[r.levels[si]]})`).join(' · ')} – added when the lifecycle stage in ${rulesRef} asks for them.`);
    let readme = replaceSection(body, 'Status', `| | |\n|---|---|\n${statusRows.join('\n')}`);
    readme = replaceSection(readme, 'Pages', lines.join('\n'));
    if (opts.pitch)
        readme = readme.replace(/^> One-line pitch\.$/m, `> ${opts.pitch}`);
    readme = readme.replace(/ – #<issue>\.$/m, opts.issue ? ` – #${opts.issue}.` : ` (\`${command}\`).`);
    actions.unshift({ kind: 'write', path: `${dir}/README.md`, text: front + readme.replace(/^\n+/, '\n') });
    if (plan) {
        const to = `${dir}/business-product/business-plan.md`;
        const modelTo = `${dir}/business-product/business-model.json`;
        const from = `${plan.dir}/plan.md`;
        actions.push({ kind: 'mv', from, to }, { kind: 'mv', from: `${plan.dir}/model.json`, to: modelTo });
        // The plan keeps its id; product + page are the hub's page keys (an older product/page line is replaced).
        const withKeys = plan.text.replace(/^---\n([\s\S]*?)\n---\n/, (_all, yaml) => {
            const kept = yaml.split('\n').filter((l) => !/^(product|page):/.test(l));
            const at = kept.findIndex((l) => /^id:/.test(l));
            kept.splice(at + 1, 0, `product: ${id}`, 'page: business-plan');
            return `---\n${kept.join('\n')}\n---\n`;
        });
        const appendixFrom = `${plan.dir}/${PLAN_APPENDIX}`;
        const appendixTo = `${dir}/business-product/${PLAN_APPENDIX}`;
        // Plan and appendix move into the same folder, so a link between them points to the new name, not back to the old folder.
        const relink = (text, fromFile, toFile, other, otherTo) => rebaseLinks(text, fromFile, toFile).replace(/\]\(([^)\s#]+)(#[^)\s]*)?\)/g, (all, t, anchor = '') => normalizePath(`${dirname(toFile)}/${t}`) === normalizePath(other) ? `](${relativePath(dirname(toFile), otherTo)}${anchor})` : all);
        const planText = plan.appendix != null ? relink(withKeys, from, to, appendixFrom, appendixTo) : rebaseLinks(withKeys, from, to);
        actions.push({ kind: 'edit', path: to, text: planText, note: 'add product + page to the plan front matter, rebase its relative links' });
        if (plan.appendix != null) {
            actions.push({ kind: 'mv', from: appendixFrom, to: appendixTo });
            actions.push({ kind: 'edit', path: appendixTo, text: relink(withPageKeys(plan.appendix, id, 'competition-landscape', today), appendixFrom, appendixTo, from, to), note: 'add the page front matter to the appendix, rebase its relative links' });
        }
        actions.push({ kind: 'rmdir', path: plan.dir });
        const src = movedPathsFile ? source.read(movedPathsFile) : null;
        if (movedPathsFile && src != null) {
            const rows = `  ['${from}', '${to}'],\n  ['${plan.dir}/model.json', '${modelTo}'],\n${plan.appendix != null ? `  ['${appendixFrom}', '${appendixTo}'],\n` : ''}`;
            const at = src.indexOf('\n];\n');
            if (at > 0)
                actions.push({ kind: 'edit', path: movedPathsFile, text: `${src.slice(0, at + 1)}${rows}${src.slice(at + 1)}`, note: 'map the old plan paths for append-only links' });
        }
    }
    for (const a of apps) {
        const pkg = structuredClone(a.pkg);
        pkg.nx = pkg.nx || {};
        pkg.nx.tags = [...a.tags.filter((t) => t !== `product:${id}` && t !== `role:${a.role}`), `product:${id}`, `role:${a.role}`];
        actions.push({ kind: 'edit', path: `${a.dir}/package.json`, text: JSON.stringify(pkg, null, 2) + '\n', note: `Nx tags product:${id}, role:${a.role}` });
    }
    return { errors: [], actions, summary: { id, name, dir, status, stageLabel, pages: [...present].sort(), apps: apps.map((a) => ({ dir: a.dir, role: a.role })), plan: plan?.id || null } };
}
/** One line per action, as `canon new` prints them. */
export const describeAction = (a) => (a.kind === 'write' ? `create ${a.path}` : a.kind === 'mv' ? `git mv ${a.from} → ${a.to}` : a.kind === 'edit' ? `edit   ${a.path}${a.note ? ` (${a.note})` : ''}` : `remove ${a.path}/ (empty)`);
