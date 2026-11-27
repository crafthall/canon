/**
 * Change-coupled docs check (feature everything-as-code): a change that touches a product's code (a project
 * in apps/ or libs/ tagged `product:<id>`) must also touch that product's hub – one feature page
 * `<hubDir>/<id>/business-product/features/<slug>.md` and the hub changelog `<hubDir>/<id>/README.md` – unless the
 * change states `no product doc change: <reason>` (PR body or commit message). Markdown outside a project's `src/`
 * (README, `docs/`) is documentation, not code (`isProjectDoc`). Pure: it takes the changed paths, the
 * tagged projects (`taggedProjects`) and the text that may carry the reason; reading git is the caller's job.
 */
import { HUB_DIR } from "./model.js";
/** The escape phrase; the reason is the rest of the line and must not be empty. */
export const NO_DOC_CHANGE = /no product doc change:[ \t]*([^\n\r]*\S)/i;
/** The stated `no product doc change: <reason>`, or null when the text has none, the reason is empty or still the `<placeholder>`. */
export function statedReason(text) {
    // Every match counts, so a template's placeholder line ("no product doc change: <reason>") does not hide a real one.
    for (const m of (text ?? '').matchAll(new RegExp(NO_DOC_CHANGE.source, 'gi'))) {
        const reason = m[1].trim().replace(/^`+|`+$/g, '').trim();
        if (reason && !/^<[^>]*>$/.test(reason))
            return reason;
    }
    return null;
}
const norm = (p) => p.replace(/\\/g, '/').replace(/^\.?\/+/, '');
const under = (file, dir) => file.startsWith(`${norm(dir).replace(/\/+$/, '')}/`);
/**
 * Whether a path inside a project is documentation, not code: a Markdown file outside the project's `src/` (README,
 * `docs/`, QA records). Markdown under `src/` is site content (pages, posts) and counts as code.
 */
export function isProjectDoc(file, dir) {
    const rest = norm(file).slice(norm(dir).replace(/\/+$/, '').length + 1);
    return /\.md$/i.test(rest) && !/(^|\/)src\//.test(rest);
}
/** The product ids whose tagged code a path belongs to (a path can sit in nested projects of two products). */
export function productsOf(file, projects) {
    const f = norm(file);
    return [...new Set(projects.filter((p) => under(f, p.dir) && !isProjectDoc(f, p.dir)).map((p) => p.product))];
}
/** Checks one change. Docs-only changes and changes outside tagged projects always pass. */
export function checkChangeCoupled({ files, projects, text = null, hubDir = HUB_DIR }) {
    const paths = [...new Set(files.map(norm).filter(Boolean))];
    const code = new Map();
    for (const f of paths)
        for (const id of productsOf(f, projects))
            code.set(id, [...(code.get(id) ?? []), f]);
    const hub = norm(hubDir).replace(/\/+$/, '');
    const products = [...code.keys()].sort().map((product) => {
        const base = `${hub}/${product}/`;
        const features = paths.filter((f) => f.startsWith(`${base}business-product/features/`) && /\/features\/[^/]+\.md$/.test(f) && !f.endsWith('/features/README.md'));
        const changelog = paths.includes(`${base}README.md`);
        return { product, code: code.get(product) ?? [], features, changelog, coupled: features.length > 0 && changelog };
    });
    const uncoupled = products.filter((p) => !p.coupled).map((p) => p.product);
    const reason = statedReason(text);
    return { ok: uncoupled.length === 0 || reason !== null, reason, products, uncoupled };
}
/** Problem lines for an uncoupled change (empty when it passes), naming what to add or how to state the reason. */
export function changeCoupledProblems(result, hubDir = HUB_DIR) {
    if (result.ok)
        return [];
    const hub = norm(hubDir).replace(/\/+$/, '');
    return result.products.filter((p) => !p.coupled).map((p) => {
        const missing = [p.features.length ? null : `a feature page ${hub}/${p.product}/business-product/features/<slug>.md`, p.changelog ? null : `the changelog ${hub}/${p.product}/README.md`].filter(Boolean);
        return `${p.product}: ${p.code.length} code file(s) changed (e.g. ${p.code[0]}) without ${missing.join(' and ')} – update them, or state "no product doc change: <reason>" in the PR body or a commit message`;
    });
}
