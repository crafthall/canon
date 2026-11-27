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
export type Verdict = 'sourced' | 'hypothesis' | 'unsourced' | 'bad-citation' | 'template' | 'meta' | 'index' | 'navigation' | 'question' | 'lead-in';
export declare const FACTUAL_VERDICTS: readonly Verdict[];
export interface CitationContext {
    /** Whether a repository-relative path (file or folder) exists in the repository the draft was written from. */
    pathExists(path: string): boolean;
    /** Whether a commit (7-40 hex characters, a prefix is enough) exists in the history the draft was given. */
    commitExists(sha: string): boolean;
}
export interface Unit {
    /** 1-based line of the unit's first line in the page. */
    line: number;
    text: string;
    block: 'paragraph' | 'list' | 'table' | 'quote';
    /** Text of the nearest heading above the unit ('' before any heading). */
    section: string;
}
export interface SentenceResult {
    file: string;
    line: number;
    text: string;
    verdict: Verdict;
    /** References in source markers. */
    refs: string[];
    /** References that do not exist (fabricated or mistyped). */
    badRefs: string[];
}
export interface CitationTotals {
    sentences: number;
    factual: number;
    sourced: number;
    hypothesis: number;
    unsourced: number;
    badCitation: number;
    nonFactual: number;
    /** unsourced + badCitation – the R0-exit (2) number, which must be 0. */
    unsourcedFactual: number;
}
/** Prose units of a Markdown page (see the rule in the file header). */
export declare function splitUnits(markdown: string): Unit[];
/** Sentences of one prose unit. Abbreviations, decimals and file names do not end a sentence. */
export declare function splitSentences(text: string): string[];
/** References named in the `(source: …)` markers of a sentence. */
export declare function sourceRefs(sentence: string): string[];
/** Whether one reference exists. `commit abc1234`, bare hex (7-40) → commit; anything else → a path. */
export declare function refExists(ref: string, ctx: CitationContext): boolean;
/** Verdict of one sentence (or table row) of a unit. */
export declare function classify(sentence: string, unit: Pick<Unit, 'block' | 'section'>, ctx: CitationContext): {
    verdict: Verdict;
    refs: string[];
    badRefs: string[];
};
/** Every sentence of one page with its verdict. */
export declare function scorePage(file: string, markdown: string, ctx: CitationContext): SentenceResult[];
/** Totals over sentence results. */
export declare function citationTotals(results: readonly SentenceResult[]): CitationTotals;
/** Scores every Markdown page of a drafted hub: `pages` maps a page path to its text. */
export declare function scoreDraft(pages: Readonly<Record<string, string>>, ctx: CitationContext): {
    results: SentenceResult[];
    totals: CitationTotals;
};
