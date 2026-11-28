/**
 * Canon readers (moved from Spark Hall's lib/product-docs.mjs): read a hub folder
 * docs/crafthall/canon/<id>/ through a `HubSource`, parse its pages and build one product – documents, feature catalog,
 * decision records, findings and documentation health. Files are the only source of truth; nothing is hand-entered
 * or estimated. Rendering (Markdown → HTML, in-app links) stays with the host: pass `render`; the default keeps
 * Markdown as is. Pure apart from the reads of the given source.
 */
import { parseDoc, splitSections } from "./front-matter.js";
import { ADR_STATUSES, FEATURE_STATUSES, HUB_PATHS, PRODUCT_STATUSES, RESERVED_IDS, STAGES, STAGE_OF_STATUS, WORKFLOW_PAGES, healthOf, resolveHubDir } from "./model.js";
import { joinPath } from "./source.js";
/** Every kind of health finding (the `--json` contract carries them; the fixture tripwire asserts this list). */
export const FINDING_KINDS = ['missing', 'inconsistent', 'stale'];
const norm = (s) => String(s || '').toLowerCase().replace(/^\d+[a-z]?[.)]?\s*/, '').trim();
const slugOf = (f) => f.replace(/\.md$/, '');
const asList = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
const asNums = (v) => asList(v).map(Number).filter(Number.isFinite);
const firstLine = (text) => (String(text || '').match(/^\s*>\s*(.+)$/m) || [])[1]?.trim() || null;
const titleOf = (body, fallback) => (String(body).match(/^#\s+(.+)$/m) || [])[1]?.replace(/[`*_]/g, '').trim() || fallback;
const str = (v) => (v ? String(v) : null);
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** First section whose normalised title matches `re`, or null. */
export const findSection = (sections, re) => sections.find((s) => re.test(norm(s.title))) || null;
/** Hub README section finders (template: template/README.md): the product metrics live in the hub index. */
export const README_SECTIONS = { metrics: /metrics/ };
/** First paragraph of a feature's "What it does" section (plain text, for the catalog), else the first paragraph. */
export function featureSummary(body) {
    const secs = splitSections(body);
    const s = findSection(secs, /^what it does/) || secs[0];
    const text = s ? s.body : String(body).replace(/^#.*$/m, '');
    const paras = text.split(/\n\s*\n/).map((p) => p.trim());
    const i = paras.findIndex((p) => p && !p.startsWith('|') && !p.startsWith('```') && !p.startsWith('#'));
    if (i < 0)
        return '';
    let para = paras[i];
    // "… in one step:" followed by a list: keep the lead-in and the list items' bold labels or first words.
    if (/:\s*$/.test(para) && /^[-*]\s/.test(paras[i + 1] || '')) {
        const items = paras[i + 1]
            .split('\n')
            .filter((l) => /^[-*]\s/.test(l))
            .map((l) => (l.match(/^[-*]\s+\*\*([^*]+?)[:.]?\*\*/) || l.match(/^[-*]\s+(.{0,60}?)[.:;–-]\s/) || [])[1])
            .filter(Boolean);
        if (items.length)
            para = `${para.replace(/:\s*$/, '')}: ${items.join(', ')}.`;
    }
    const plain = para.replace(/^[-*]\s+/gm, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
    return plain.length > 240 ? `${plain.slice(0, 237).replace(/\s+\S*$/, '')}…` : plain;
}
/** A Markdown table as objects keyed by normalised header (lowercase, words joined by "-"), cells kept as raw Markdown. */
export function markdownTable(text) {
    const lines = String(text || '').split('\n').filter((l) => /^\s*\|/.test(l));
    if (lines.length < 2 || !/^\s*\|[\s:|-]+\|\s*$/.test(lines[1]))
        return [];
    const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const head = cells(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().replace(/\s+/g, '-'));
    return lines.slice(2).map((l) => Object.fromEntries(cells(l).map((c, i) => [head[i] || `col${i}`, c])));
}
/** Plain text of a Markdown cell: links to their text, emphasis and code marks dropped. */
export const cellText = (md) => String(md || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
/**
 * Rows of the feature table: [{ label, status, docs: [slug] }]. In features/README.md (`sameFolder`) a row links
 * <slug>.md (candidates and README skipped); elsewhere it links features/<slug>.md.
 */
export function featureTableRows(sectionBody, { sameFolder = false } = {}) {
    const link = sameFolder ? /\]\((?:\.\/)?([a-z0-9-]+)\.md(?:#[^)]*)?\)/g : /\]\((?:\.\/)?features\/([a-z0-9-]+)\.md(?:#[^)]*)?\)/g;
    const rows = [];
    for (const line of String(sectionBody || '').split('\n')) {
        if (!/^\s*\|/.test(line) || /^\s*\|[\s:|-]+\|\s*$/.test(line))
            continue;
        const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const docs = [...line.matchAll(link)].map((m) => m[1]).filter((s) => s !== 'candidates' && s !== 'readme');
        if (!docs.length)
            continue;
        rows.push({ label: cells[0], status: cells[1] || '', docs });
    }
    return rows;
}
const isFeatureStatus = (s) => FEATURE_STATUSES.includes(s);
/** The leading enum word of a free-text status ("built (…)" → built), or null when it starts with something else. */
export function leadingStatus(text) {
    const w = String(text || '').toLowerCase().match(/^[a-z]+/)?.[0];
    return w && isFeatureStatus(w) ? w : null;
}
/** Consistency findings between the README feature table and the feature files. */
export function featureFindings(product, features, rows, readmeFile) {
    const out = [];
    const bySlug = new Map(features.map((f) => [f.slug, f]));
    const seen = new Map();
    for (const r of rows) {
        const primary = r.docs[0];
        seen.set(primary, (seen.get(primary) || 0) + 1);
        for (const d of r.docs) {
            if (!bySlug.has(d))
                out.push({ kind: 'missing', area: 'catalog', text: `Feature table links features/${d}.md, which does not exist.`, file: readmeFile });
        }
        const f = bySlug.get(primary);
        const lead = leadingStatus(r.status);
        if (f && lead && isFeatureStatus(f.status) && lead !== f.status && r.docs.length === 1) {
            out.push({ kind: 'inconsistent', area: 'catalog', text: `“${f.title}” is ${f.status} in its file but ${lead} in the feature table.`, file: f.file });
        }
    }
    for (const [slug, n] of seen)
        if (n > 1)
            out.push({ kind: 'inconsistent', area: 'catalog', text: `features/${slug}.md is the first link of ${n} rows in the feature table (duplicate rows).`, file: readmeFile });
    const linked = new Set(rows.flatMap((r) => r.docs));
    for (const f of features) {
        if (!isFeatureStatus(f.status))
            out.push({ kind: 'inconsistent', area: 'catalog', text: `“${f.title}” has status “${f.statusRaw || 'none'}”; use one of ${FEATURE_STATUSES.join(', ')} and put the detail in the text.`, file: f.file });
        if (f.product && f.product !== product)
            out.push({ kind: 'inconsistent', area: 'catalog', text: `“${f.title}” says product “${f.product}”, not “${product}”.`, file: f.file });
        if (rows.length && !linked.has(f.slug))
            out.push({ kind: 'missing', area: 'catalog', text: `“${f.title}” has a feature file but no row in the feature table.`, file: f.file });
        if (f.parseError)
            out.push({ kind: 'inconsistent', area: 'catalog', text: `Front matter does not parse: ${f.parseError}`, file: f.file });
    }
    return out;
}
/** Findings on decision records: unknown status, dangling or one-sided supersession links. */
export function adrFindings(adrs) {
    const out = [];
    const byNum = new Map(adrs.map((a) => [a.number, a]));
    for (const a of adrs) {
        if (!ADR_STATUSES.includes(a.status))
            out.push({ kind: 'inconsistent', area: 'adr', text: `ADR-${a.label} has status “${a.status || 'none'}”; use one of ${ADR_STATUSES.join(', ')}.`, file: a.file });
        if (a.status === 'superseded' && !a.supersededBy.length)
            out.push({ kind: 'inconsistent', area: 'adr', text: `ADR-${a.label} is superseded but names no successor.`, file: a.file });
        for (const n of a.supersededBy) {
            const b = byNum.get(n);
            if (!b)
                out.push({ kind: 'missing', area: 'adr', text: `ADR-${a.label} is superseded by ADR-${n}, which does not exist.`, file: a.file });
            else if (!b.supersedes.includes(a.number))
                out.push({ kind: 'inconsistent', area: 'adr', text: `ADR-${a.label} names ADR-${b.label} as successor, but ADR-${b.label} does not list it under supersedes.`, file: b.file });
        }
        for (const n of a.supersedes) {
            const b = byNum.get(n);
            if (!b)
                out.push({ kind: 'missing', area: 'adr', text: `ADR-${a.label} supersedes ADR-${n}, which does not exist.`, file: a.file });
            else if (!b.supersededBy.includes(a.number))
                out.push({ kind: 'inconsistent', area: 'adr', text: `ADR-${a.label} supersedes ADR-${b.label}, but ADR-${b.label} does not name it as successor.`, file: b.file });
        }
    }
    return out;
}
/** Feature counts in the units the files use: distinct feature files, removed ones apart. */
export function featureCounts(features) {
    const live = features.filter((f) => f.status !== 'removed');
    const by = (s) => live.filter((f) => f.status === s).length;
    return { total: live.length, built: by('built'), partial: by('partial'), building: by('building'), planned: by('specified') + by('later'), removed: features.length - live.length, unknown: live.filter((f) => !isFeatureStatus(f.status)).length };
}
/** Whether `s` is a real calendar date written YYYY-MM-DD (2027-02-30 is not). */
export function isIsoDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s))
        return false;
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
/**
 * Rows of the experiments table: the table under "## Experiments" (else the page's first table), columns ID,
 * Hypothesis, Metric, Go, Kill, Owner, Revisit by, Result. Rows without an ID and a hypothesis are skipped.
 */
export function experimentRows(body) {
    const sec = findSection(splitSections(String(body || '')), /^experiments/);
    const text = sec ? sec.body : String(body || '');
    // Only the first table: a second table further down is not an experiments table.
    const lines = text.split('\n');
    const isRow = (l) => /^\s*\|/.test(l);
    const start = lines.findIndex(isRow);
    let end = start;
    while (end >= 0 && end < lines.length && isRow(lines[end]))
        end++;
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
export const hasResult = (e) => !/^[-–—]*$/.test(e.result.trim());
/**
 * Experiments past their revisit-by date with no result: `revisitBy` < `today` and no result. `today` is passed in
 * (YYYY-MM-DD) – the core has no clock; a row whose date is not a valid date is never overdue.
 */
export function overdueExperiments(rows, today) {
    if (!isIsoDate(today))
        throw new Error(`today must be a date YYYY-MM-DD, got "${today}"`);
    return rows.filter((e) => e.revisitBy !== null && e.revisitBy < today && !hasResult(e));
}
/**
 * Builds one product from already-read sources (`HubProductSource`; texts null when the file does not exist).
 * `plans` = business plans (sections with html). `render(md, file)` returns HTML.
 */
export function buildProduct(id, src, { plans = [], render = (md) => md, rules: rulesHook, today } = {}) {
    const file = (key) => `${src.dir}/${HUB_PATHS[key]}`;
    const readmeFile = `${src.dir}/README.md`;
    const { meta, body, error } = parseDoc(src.readme || '');
    const sections = splitSections(body);
    const sec = Object.fromEntries(Object.entries(README_SECTIONS).map(([k, re]) => [k, findSection(sections, re)]));
    const html = (s, f = readmeFile) => (s ? render(s.body, f) : null);
    const findings = [];
    if (error)
        findings.push({ kind: 'inconsistent', area: 'overview', text: `README front matter does not parse: ${error}`, file: readmeFile });
    if (meta.product && meta.product !== id)
        findings.push({ kind: 'inconsistent', area: 'overview', text: `README says product “${meta.product}” in folder “${id}”.`, file: readmeFile });
    if (meta.status && !PRODUCT_STATUSES.includes(meta.status))
        findings.push({ kind: 'inconsistent', area: 'overview', text: `README status “${meta.status}” is not one of ${PRODUCT_STATUSES.join(', ')}.`, file: readmeFile });
    /** A whole page as a hub document (title dropped), or null when the file does not exist. */
    const page = (text, f, sourceLabel) => (text ? { html: render(parseDoc(text).body.replace(/^#\s+.+$/m, ''), f), source: f, sourceLabel } : null);
    /** Several pages as one document, each under its own title. */
    const pages = (list, sourceLabel) => list?.length
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
    const features = (src.features || [])
        .map(({ file: f, text }) => {
        const d = parseDoc(text);
        const slug = slugOf(f.split('/').pop());
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
    const adrs = (src.adrs || [])
        .map(({ file: f, text }) => {
        const d = parseDoc(text);
        const number = Number(d.meta.adr ?? (f.split('/').pop().match(/^(\d+)/) || [])[1]);
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
    if (meta.plan && !plan)
        findings.push({ kind: 'missing', area: 'business-plan', text: `README names business plan “${meta.plan}”, which was not found (${src.dir}/${HUB_PATHS.businessPlan}).`, file: readmeFile });
    const planSec = (re) => (plan ? (plan.sections || []).find((s) => re.test(norm(s.title))) || null : null);
    const planDoc = (re) => {
        const s = planSec(re);
        return s && plan ? { html: s.html || render(s.body || '', plan.file), source: plan.file, sourceLabel: `business plan · ${s.title}` } : null;
    };
    const roadmapDoc = src.roadmap ? parseDoc(src.roadmap) : null;
    // Candidates: ideas not counted as features. Launch tasks: the roadmap's "Launch tasks" table.
    const candidatesFile = file('candidates');
    const candidatesDoc = src.candidates ? parseDoc(src.candidates) : null;
    const candidates = candidatesDoc
        ? markdownTable(candidatesDoc.body).map((r) => ({
            name: cellText(r.candidate),
            adds: cellText(r['what-it-would-add']),
            gate: cellText(r['gate-why-not-now'] ?? r.gate),
            related: (String(r['related-feature'] || '').match(/\]\((?:\.\/)?([a-z0-9-]+)\.md/) || [])[1] || null,
            source: cellText(r.source),
        }))
        : [];
    const launchSec = roadmapDoc ? findSection(splitSections(roadmapDoc.body), /^launch tasks/) : null;
    const launchTasks = launchSec
        ? markdownTable(launchSec.body).map((r) => ({ name: cellText(r.task), neededFor: cellText(r['needed-for']), status: cellText(r.status), owner: /^yes/i.test(cellText(r.owner)), issue: cellText(r.issue) }))
        : [];
    for (const c of candidates) {
        if (c.related && !features.some((f) => f.slug === c.related))
            findings.push({ kind: 'missing', area: 'catalog', text: `Candidate “${c.name}” links features/${c.related}.md, which does not exist.`, file: candidatesFile });
    }
    for (const t of launchTasks) {
        if (!/^(open|in progress|done)/i.test(t.status))
            findings.push({ kind: 'inconsistent', area: 'roadmap', text: `Launch task “${t.name}” has status “${t.status}”; start it with open, in progress or done.`, file: file('roadmap') });
    }
    const archDoc = src.architecture ? parseDoc(src.architecture) : null;
    const join2 = (...parts) => parts.filter(Boolean).join('\n');
    const none = { html: null };
    /** The hub's documents: one per card; `html` null = no source yet. */
    const roadmap = page(src.roadmap, file('roadmap'), 'roadmap.md');
    const releases = pages(src.releases, 'releases/');
    const docs = {
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
    const present = {
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
        if (gaps.length && gaps.length < WORKFLOW_PAGES.length)
            findings.push({ kind: 'missing', area: 'ai-workflow', text: `AI & development workflow is incomplete: ${gaps.map((k) => `${k}.md`).join(', ')} missing.`, file: `${src.dir}/${HUB_PATHS.workflow}/` });
    }
    // A page still marked `status: draft` (e.g. fresh from _template/ via `npm run product:new`) requires review: it
    // exists, but nobody has written or confirmed its content yet. The business plan keeps its own plan status.
    const drafts = [
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
        ...WORKFLOW_PAGES.map((k) => [null, src.workflow?.[k], 'ai-workflow', `AI & development workflow · ${k}`, `${src.dir}/${HUB_PATHS.workflow}/${k}.md`]),
        ...(src.technical || []).map((t) => [null, t.text, 'technical', `Technical · ${t.file.split('/').pop()}`, t.file]),
        ...(src.releases || []).map((t) => [null, t.text, 'roadmap', `Release plan · ${t.file.split('/').pop()}`, t.file]),
    ];
    for (const [key, text, area, label, f] of drafts) {
        if (text && String(parseDoc(text).meta.status || '').toLowerCase() === 'draft') {
            findings.push({ kind: 'stale', area, text: `${label} is still a draft (status: draft) – write the real content and set status: current.`, file: f || file(key) });
        }
    }
    // Experiments: a row past its revisit-by date with no result requires review; only when the host passes today.
    const experiments = src.experiments ? experimentRows(parseDoc(src.experiments).body) : [];
    for (const e of today == null ? [] : overdueExperiments(experiments, today)) {
        findings.push({ kind: 'stale', area: 'experiments', text: `Experiment “${e.id || e.hypothesis}” is past its revisit-by date (${e.revisitBy}) with no result – record the result or set a new date.`, file: file('experiments') });
    }
    // The hub README and feature pages keep their own status enum (stage, feature status), so a draft is marked with
    // `draft: true` instead (the bootstrap skill writes it); it requires review the same way.
    const isDraftFlag = (v) => v === true || String(v ?? '').trim().toLowerCase() === 'true';
    if (isDraftFlag(meta.draft))
        findings.push({ kind: 'stale', area: 'overview', text: 'Product README is still a draft (draft: true) – confirm the content and remove draft: true.', file: readmeFile });
    for (const { file: f, text } of src.features || []) {
        if (isDraftFlag(parseDoc(text).meta.draft))
            findings.push({ kind: 'stale', area: 'catalog', text: `Feature “${slugOf(f.split('/').pop())}” is still a draft (draft: true) – confirm the content and remove draft: true.`, file: f });
    }
    const rules = src.ruleTexts && rulesHook ? rulesHook(src.ruleTexts, src.dir) : null;
    for (const e of rules?.errors || [])
        findings.push({ kind: 'inconsistent', area: 'technical', text: `Rule grades: ${e}.`, file: rules?.files?.notes });
    const status = meta.status ? String(meta.status) : null;
    const stage = (status && STAGE_OF_STATUS[status]) || null;
    // Stale: a feature file changed after the product README – the README may need a review.
    const newest = features.map((f) => f.updated).filter(Boolean).sort().pop() || null;
    if (meta.updated && newest && String(meta.updated) < newest)
        findings.push({ kind: 'stale', area: 'overview', text: `A feature file was updated on ${newest}, after the product README (${meta.updated}).`, file: readmeFile });
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
/** Reads the sources of one product folder in the hub layout (`dir` repo-relative, e.g. docs/crafthall/canon/<id>). */
export function readHubProduct(source, dir, { ruleFiles } = {}) {
    const p = (k) => joinPath(dir, HUB_PATHS[k]);
    const list = (d, skip = []) => (source.isDir(d) ? source.list(d).filter((f) => f.endsWith('.md') && !skip.includes(f)).sort() : []).map((f) => ({ file: joinPath(d, f), text: source.read(joinPath(d, f)) }));
    const readme = source.read(joinPath(dir, 'README.md'));
    if (readme == null)
        throw new Error(`${dir}/README.md does not exist`);
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
export function productIds(source, hubDir = resolveHubDir((p) => source.isDir(p)).hubDir) {
    if (!source.isDir(hubDir))
        return [];
    return source
        .list(hubDir)
        .filter((id) => !id.startsWith('_') && !RESERVED_IDS.includes(id) && source.isDir(joinPath(hubDir, id)) && source.read(joinPath(hubDir, id, 'README.md')) != null)
        .sort();
}
/** Reads and builds every product folder under `hubDir`. A folder that fails to build is reported in `errors`. */
export function loadProductDocs(source, { hubDir = resolveHubDir((p) => source.isDir(p)).hubDir, plans = [], render, rules, ruleFiles, today } = {}) {
    const errors = [];
    const products = [];
    for (const id of productIds(source, hubDir)) {
        try {
            products.push(buildProduct(id, readHubProduct(source, joinPath(hubDir, id), { ruleFiles }), { plans, render, rules, today }));
        }
        catch (e) {
            errors.push(`${id}: ${e.message}`);
        }
    }
    return { products, errors };
}
