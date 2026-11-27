export interface TaggedProject {
    /** Repo-relative project folder, e.g. `libs/billing`. */
    dir: string;
    /** Product id from the `product:<id>` tag. */
    product: string;
}
export interface ChangeCoupledInput {
    /** Changed repo-relative paths ("/" separators). */
    files: readonly string[];
    /** Projects tagged `product:<id>`. */
    projects: readonly TaggedProject[];
    /** Text that may state the escape (PR body, commit messages); empty or absent = none. */
    text?: string | null;
    /** Folder with one folder per product (default docs/product-hub). */
    hubDir?: string;
}
export interface ProductCoupling {
    product: string;
    /** Changed files under the product's tagged projects. */
    code: string[];
    /** Changed feature pages of the product's hub (not the catalog README). */
    features: string[];
    /** Whether the hub README (holds the changelog) changed. */
    changelog: boolean;
    /** Code changed with a feature page and the changelog, or no code changed. */
    coupled: boolean;
}
export interface ChangeCoupledResult {
    /** True when every product with changed code is coupled, or a reason is stated. */
    ok: boolean;
    /** The stated reason, or null. */
    reason: string | null;
    /** One entry per product whose code changed, sorted by product id. */
    products: ProductCoupling[];
    /** Products whose code changed without their hub docs (empty when `ok` through coupling). */
    uncoupled: string[];
}
/** The escape phrase; the reason is the rest of the line and must not be empty. */
export declare const NO_DOC_CHANGE: RegExp;
/** The stated `no product doc change: <reason>`, or null when the text has none, the reason is empty or still the `<placeholder>`. */
export declare function statedReason(text: string | null | undefined): string | null;
/**
 * Whether a path inside a project is documentation, not code: a Markdown file outside the project's `src/` (README,
 * `docs/`, QA records). Markdown under `src/` is site content (pages, posts) and counts as code.
 */
export declare function isProjectDoc(file: string, dir: string): boolean;
/** The product ids whose tagged code a path belongs to (a path can sit in nested projects of two products). */
export declare function productsOf(file: string, projects: readonly TaggedProject[]): string[];
/** Checks one change. Docs-only changes and changes outside tagged projects always pass. */
export declare function checkChangeCoupled({ files, projects, text, hubDir }: ChangeCoupledInput): ChangeCoupledResult;
/** Problem lines for an uncoupled change (empty when it passes), naming what to add or how to state the reason. */
export declare function changeCoupledProblems(result: ChangeCoupledResult, hubDir?: string): string[];
