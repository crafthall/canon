import { type HubSource } from './source.js';
export interface CatalogFeature {
    slug: string;
    title: string;
    summary: string;
    status: string;
}
export interface MatchCandidate {
    slug: string;
    title: string;
    score: number;
}
export interface MatchRow {
    curated: CatalogFeature;
    /** Best drafted candidates, highest score first (at most 3). */
    candidates: MatchCandidate[];
    /** Drafted slug the automatic pass assigned, or null. */
    auto: string | null;
    autoScore: number;
}
export interface MatchResult {
    rows: MatchRow[];
    drafted: CatalogFeature[];
    /** Drafted features no curated feature was matched to (automatic pass). */
    unmatchedDrafted: string[];
    matched: number;
    total: number;
    /** matched / total, or null when the curated catalog is empty. */
    recall: number | null;
    /** Drafted features the automatic pass matched / drafted features, or null when nothing was drafted. */
    precision: number | null;
    threshold: number;
}
/** The feature catalog of a product folder (`dir`, repo-relative, e.g. docs/product-hub/acme): rows with a page. */
export declare function readCatalog(source: HubSource, dir: string): CatalogFeature[];
/** Light suffix strip so plural and verb forms meet. */
export declare function stemWord(w: string): string;
/** Content words of a text. */
export declare function featureWords(text: string): string[];
/** Similarity of two features in [0, 1]. */
export declare function similarity(a: CatalogFeature, b: CatalogFeature): number;
export declare const DEFAULT_THRESHOLD = 0.3;
/** Automatic first-pass match of curated features to drafted ones. */
export declare function matchFeatures(curated: readonly CatalogFeature[], drafted: readonly CatalogFeature[], { threshold }?: {
    threshold?: number | undefined;
}): MatchResult;
/** A reviewer's decisions: curated slug → drafted slug(s) that cover it, or null/[] for "not found". */
export type Review = Readonly<Record<string, string | readonly string[] | null>>;
/** Recall after the reviewer's calls; curated features the review does not name keep the automatic match. */
export declare function applyReview(result: MatchResult, review: Review): {
    matched: number;
    total: number;
    recall: number | null;
    reviewed: number;
    draftedMatched: number;
    drafted: number;
    precision: number | null;
};
/** The matching sheet (Markdown) for a reviewer. */
export declare function matchingSheet(result: MatchResult, { title }?: {
    title?: string | undefined;
}): string;
