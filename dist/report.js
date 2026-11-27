/**
 * The `canon check --json` report: the structure check's problems plus the hub model of every product (stage,
 * completeness, health rows, features, decision records, launch tasks, health findings) in one versioned object – the
 * contract the Claude Code plugin and the HQ module read (ADR-0002). Schema: schema/hub-check.schema.json. Bump
 * HUB_REPORT_SCHEMA_VERSION on any breaking change (a removed or renamed field, a changed type); adding an optional
 * field is not breaking. Pure: reads through a `HubSource`.
 */
import { checkHub } from "./check.js";
import { parseDoc, splitSections } from "./front-matter.js";
import { HUB_DIR, completeness } from "./model.js";
import { loadProductDocs } from "./readers.js";
import { joinPath } from "./source.js";
export const HUB_REPORT_SCHEMA_VERSION = 1;
const planOf = (id, file, text) => {
    const { meta, body } = parseDoc(text);
    return { id: meta.id ? String(meta.id) : id, file, meta: { title: meta.title ? String(meta.title) : undefined }, sections: splitSections(body).map((s) => ({ title: s.title, body: s.body })) };
};
/** Business plans: every hub's business-product/business-plan.md, then `<plansDir>/<id>/plan.md`. */
export function loadPlans(source, { hubDir = HUB_DIR, plansDir = null } = {}) {
    const plans = [];
    for (const id of source.list(hubDir).sort()) {
        const file = joinPath(hubDir, id, 'business-product/business-plan.md');
        const text = source.isDir(joinPath(hubDir, id)) ? source.read(file) : null;
        if (text != null)
            plans.push(planOf(id, file, text));
    }
    if (plansDir && source.isDir(plansDir)) {
        for (const id of source.list(plansDir).sort()) {
            const file = joinPath(plansDir, id, 'plan.md');
            const text = source.read(file);
            if (text != null)
                plans.push(planOf(id, file, text));
        }
    }
    return plans;
}
const healthView = (h) => ({ assessed: h.assessed, done: h.done, total: h.total, rows: h.rows.map((r) => ({ id: r.id, label: r.label, level: r.level, state: r.state, applicable: r.applicable, findings: r.findings })) });
/** The product as the report carries it (no rendered pages). */
export function reportProduct(p) {
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
export function hubReport(source, { hubDir = HUB_DIR, only = null, plansDir = null, newCommand, today, template = null } = {}) {
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
