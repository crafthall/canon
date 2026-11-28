/**
 * Source-or-hypothesis counter for drafted hub pages (feature bootstrap-from-repo, R0-exit (2)). It splits
 * Markdown pages into sentences, decides which sentences state a fact, and counts the factual ones that carry neither
 * a source citation that exists nor a `(hypothesis…)` mark. Pure: the caller says which paths and commits exist.
 *
 * Markers (the syntax the bootstrap skill writes):
 *   (source: apps/web/src/main.ts)                  a repository path; `:12`, `:12-30`, `:12-30,41` or `#L12` after it is allowed
 *   (source: commit 1a2b3c4; tests/cart.test.ts)    several references, separated by ";" or ","
 *   (hypothesis: who pays for this?)                no source – the person must confirm; `(hypothesis)` alone is fine
 * A reference is valid when the path exists (file or folder, after dropping the line suffix and a leading "./" or "/")
 * or, for `commit <sha>` and bare hex of 7-40 characters, when the commit exists. One invalid reference makes the
 * sentence `bad-citation` (a fabricated path is never a source), which counts as unsourced.
 *
 * Classification rule (each prose unit, in this order):
 *   1. Not prose – skipped entirely: front matter, fenced code, headings, HTML comments, rules, table header and
 *      separator rows.
 *   2. non-factual `template`: an unfilled template placeholder line (`_What goes here:_ …`).
 *   3. non-factual `meta`: anything under a heading that asks the person to act, reports what the draft skipped or
 *      logs edits of the hub itself ("Confirm these", "Open questions", "Not read", "Questions", "Changelog").
 *   4. non-factual `index`: a table row that links to a Markdown page of the hub (catalog and index rows – the claim
 *      lives in the linked page, which is counted on its own).
 *   5. non-factual `navigation`: fewer than three words left after removing links, inline code, markers and
 *      punctuation ("Hub index: [README](../README.md)."), or a pointer to another hub page and nothing else – "See
 *      [page](page.md)." optionally followed by "for <topic>" ("See the [feature catalog](features/README.md) for
 *      each capability."); a pointer with any other clause is factual.
 *   6. non-factual `question`: ends with "?"; `lead-in`: ends with ":" (the list below it is counted item by item).
 *   7. otherwise factual: `sourced`, `hypothesis`, `bad-citation` or `unsourced`.
 * A table row is one unit; a list item, a quote line group and a paragraph are split into sentences. A fragment that
 * is only markers ("… text. (source: a.ts)") belongs to the sentence before it.
 */
export const FACTUAL_VERDICTS = ['sourced', 'hypothesis', 'unsourced', 'bad-citation'];
const SOURCE_RE = /\(\s*sources?\s*:\s*([^()]*(?:\([^()]*\)[^()]*)*)\)/gi;
const HYPOTHESIS_RE = /\(\s*hypothesis\b[^()]*(?:\([^()]*\)[^()]*)*\)/gi;
/** "See [page](page.md)." or "See the [page](page.md) for <topic>." – a pointer to another hub page, nothing else. */
const POINTER = /^[-*\s]*see (?:the |also )?\[[^\]]+\]\((?!https?:|mailto:)[^)\s]*\.md(?:#[^)]*)?\)(?: for [^.;:()[\]]+)?\.?$/i;
const META_HEADING = /^(confirm\b|to confirm|open questions?|questions\b|not read\b|changelog\b|what (?:i|the draft|this draft) (?:did not|didn't) read)/i;
const ABBREVIATIONS = ['e.g.', 'i.e.', 'etc.', 'vs.', 'cf.', 'approx.', 'incl.', 'no.', 'nr.', 'dr.', 'mr.', 'ms.', 'st.', 'fig.', 'resp.', 'ca.', 'art.', 'arts.', 'para.', 'sec.', 'ch.', 'p.', 'pp.', 'abs.', 'lit.', 'ziff.', 'bzw.', 'z.b.', 'vgl.'];
/** Prose units of a Markdown page (see the rule in the file header). */
export function splitUnits(markdown) {
    const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
    const units = [];
    let i = 0;
    // Front matter.
    if (/^\uFEFF?---\s*$/.test(lines[0] ?? '')) {
        const end = lines.findIndex((l, k) => k > 0 && /^---\s*$/.test(l));
        if (end > 0)
            i = end + 1;
    }
    let section = '';
    let para = null;
    const flush = () => {
        if (para)
            units.push({ line: para.line, text: para.parts.join(' ').replace(/\s+/g, ' ').trim(), block: para.block, section });
        para = null;
    };
    let fence = null;
    let comment = false;
    let tableRow = 0;
    for (; i < lines.length; i++) {
        const raw = lines[i];
        const line = raw.trimEnd();
        if (fence) {
            if (line.trim().startsWith(fence))
                fence = null;
            continue;
        }
        const f = line.trim().match(/^(```+|~~~+)/);
        if (f) {
            flush();
            fence = f[1];
            continue;
        }
        if (comment) {
            if (line.includes('-->'))
                comment = false;
            continue;
        }
        if (/^\s*<!--/.test(line)) {
            flush();
            if (!line.includes('-->'))
                comment = true;
            continue;
        }
        if (!line.trim()) {
            flush();
            tableRow = 0;
            continue;
        }
        const h = line.match(/^\s{0,3}#{1,6}\s+(.*)$/);
        if (h) {
            flush();
            section = h[1].replace(/#+\s*$/, '').trim();
            continue;
        }
        if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
            flush();
            continue;
        }
        if (/^\s*\|/.test(line)) {
            flush();
            tableRow++;
            const separator = /^\s*\|[\s:|-]+\|?\s*$/.test(line);
            const next = lines[i + 1] ?? '';
            const isHeader = tableRow === 1 && /^\s*\|[\s:|-]+\|?\s*$/.test(next);
            if (!separator && !isHeader)
                units.push({ line: i + 1, text: line.trim(), block: 'table', section });
            continue;
        }
        tableRow = 0;
        const item = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/);
        if (item) {
            flush();
            para = { line: i + 1, parts: [item[1]], block: 'list' };
            continue;
        }
        const quote = line.match(/^\s*>\s?(.*)$/);
        if (quote) {
            if (!para || para.block !== 'quote') {
                flush();
                para = { line: i + 1, parts: [], block: 'quote' };
            }
            if (quote[1].trim())
                para.parts.push(quote[1]);
            continue;
        }
        if (para && (para.block === 'paragraph' || para.block === 'list'))
            para.parts.push(line.trim());
        else {
            flush();
            para = { line: i + 1, parts: [line.trim()], block: 'paragraph' };
        }
    }
    flush();
    return units.filter((u) => u.text);
}
const isMarkerOnly = (s) => !s.replace(SOURCE_RE, '').replace(HYPOTHESIS_RE, '').replace(/[\s.;,]/g, '');
/** Sentences of one prose unit. Abbreviations, decimals and file names do not end a sentence. */
export function splitSentences(text) {
    let t = String(text);
    const keep = [];
    // Protect markers and inline code: a "." inside them never ends a sentence.
    t = t.replace(/`[^`]*`|\(\s*(?:sources?\s*:|hypothesis\b)[^()]*(?:\([^()]*\)[^()]*)*\)/gi, (m) => {
        keep.push(m);
        return `\uE000${keep.length - 1}\uE000`;
    });
    for (const a of ABBREVIATIONS) {
        const re = new RegExp(`(^|[\\s(])${a.replace(/\./g, '\\.')}`, 'gi');
        t = t.replace(re, (m) => m.replace(/\./g, '\uE001'));
    }
    const parts = t.split(/(?<=[.!?]["')\]*_]*)\s+(?=["'([*_\uE000]*[A-Z0-9\uE000])/);
    const restore = (s) => s.replace(/\uE000(\d+)\uE000/g, (_, n) => keep[Number(n)]).replace(/\uE001/g, '.');
    const out = [];
    for (const p of parts.map(restore).map((s) => s.trim()).filter(Boolean)) {
        if (out.length && isMarkerOnly(p))
            out[out.length - 1] = `${out[out.length - 1]} ${p}`;
        else
            out.push(p);
    }
    return out;
}
/** References named in the `(source: …)` markers of a sentence. */
export function sourceRefs(sentence) {
    const refs = [];
    for (const m of String(sentence).matchAll(SOURCE_RE)) {
        for (const r of m[1].split(/[;,]/)) {
            const ref = r.replace(/[`*]/g, '').trim();
            // "a.ts:11-18,24" – a bare line number after a comma continues the previous reference's line list; so does
            // ":24" ("a.ts:3, :24", the same file's second range – seen in an evaluation re-run, it names no other file).
            if (/^:?L?\d+(?:-L?\d+)?$/.test(ref) && refs.length && /(?::|#L)\d/.test(refs[refs.length - 1]))
                refs[refs.length - 1] += `,${ref.replace(/^:/, '')}`;
            else if (ref)
                refs.push(ref);
        }
    }
    return refs;
}
/** Whether one reference exists. `commit abc1234`, bare hex (7-40) → commit; anything else → a path. */
export function refExists(ref, ctx) {
    const r = ref.trim();
    const commit = r.match(/^(?:commit\s+)?([0-9a-f]{7,40})$/i);
    if (commit && (/^commit\s/i.test(r) || !/[./]/.test(r)))
        return ctx.commitExists(commit[1].toLowerCase());
    const path = r
        .replace(/^(?:file|path)\s+/i, '')
        .replace(/#L\d+(?:-L?\d+)?(?:,L?\d+(?:-L?\d+)?)*$/i, '')
        .replace(/:\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/, '')
        .replace(/^\.?\/+/, '')
        .replace(/\/+$/, '');
    if (!path || path.split('/').includes('..') || /\s/.test(path))
        return false;
    return ctx.pathExists(path);
}
const linksHubPage = (text) => /\]\((?!https?:|mailto:|#)[^)\s]*\.md(?:#[^)]*)?\)/.test(text);
const wordsLeft = (s) => s
    .replace(SOURCE_RE, ' ')
    .replace(HYPOTHESIS_RE, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
/** Verdict of one sentence (or table row) of a unit. */
export function classify(sentence, unit, ctx) {
    const refs = sourceRefs(sentence);
    const badRefs = refs.filter((r) => !refExists(r, ctx));
    const none = { refs, badRefs };
    if (/^_?what goes here:?_?/i.test(sentence.replace(/^[*_\s]+/, '').trim()) || /_What goes here:_/i.test(sentence))
        return { verdict: 'template', ...none };
    if (META_HEADING.test(unit.section))
        return { verdict: 'meta', ...none };
    if (unit.block === 'table' && linksHubPage(sentence))
        return { verdict: 'index', ...none };
    if (wordsLeft(sentence) < 3)
        return { verdict: 'navigation', ...none };
    if (POINTER.test(sentence.trim()))
        return { verdict: 'navigation', ...none };
    const bare = sentence.replace(SOURCE_RE, '').replace(HYPOTHESIS_RE, '').replace(/[\s*_|]+$/g, '').trim();
    if (unit.block !== 'table' && /\?["')\]]*$/.test(bare))
        return { verdict: 'question', ...none };
    if (unit.block !== 'table' && /:$/.test(bare) && !refs.length)
        return { verdict: 'lead-in', ...none };
    if (refs.length)
        return { verdict: badRefs.length ? 'bad-citation' : 'sourced', ...none };
    if (new RegExp(HYPOTHESIS_RE.source, 'i').test(sentence))
        return { verdict: 'hypothesis', ...none };
    return { verdict: 'unsourced', ...none };
}
/** Every sentence of one page with its verdict. */
export function scorePage(file, markdown, ctx) {
    const out = [];
    for (const u of splitUnits(markdown)) {
        const sentences = u.block === 'table' ? [u.text] : splitSentences(u.text);
        for (const s of sentences)
            out.push({ file, line: u.line, text: s, ...classify(s, u, ctx) });
    }
    return out;
}
/** Totals over sentence results. */
export function citationTotals(results) {
    const n = (v) => results.filter((r) => r.verdict === v).length;
    const factual = results.filter((r) => FACTUAL_VERDICTS.includes(r.verdict)).length;
    return {
        sentences: results.length,
        factual,
        sourced: n('sourced'),
        hypothesis: n('hypothesis'),
        unsourced: n('unsourced'),
        badCitation: n('bad-citation'),
        nonFactual: results.length - factual,
        unsourcedFactual: n('unsourced') + n('bad-citation'),
    };
}
/** Scores every Markdown page of a drafted hub: `pages` maps a page path to its text. */
export function scoreDraft(pages, ctx) {
    const results = Object.keys(pages)
        .filter((p) => p.endsWith('.md'))
        .sort()
        .flatMap((p) => scorePage(p, pages[p], ctx));
    return { results, totals: citationTotals(results) };
}
