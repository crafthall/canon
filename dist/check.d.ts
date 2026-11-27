import { type HubSource } from './source.js';
/** Rule ids of the structure check (stable: the `--json` contract carries them). */
export declare const CHECK_RULES: readonly ["layout", "front-matter", "link", "lifecycle", "status", "feature", "catalog", "adr-index", "app", "topic", "tagged-without-hub", "reserved-id", "hub-folder", "package-json"];
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
export declare const FRONT_KEYS: readonly string[];
/**
 * The fixed layout: exact paths (`files`) and patterns for the open folders. A path inside a product folder is
 * allowed when it is listed or matches a pattern; folders are allowed when listed in `dirs`.
 */
export declare const LAYOUT: {
    files: ReadonlySet<string>;
    patterns: readonly RegExp[];
    dirs: ReadonlySet<string>;
};
/** Whether a path (relative to a product folder) is a file the layout allows. */
export declare const allowedFile: (p: string) => boolean;
/** Top-level `key: value` lines of a page's front matter as raw strings, or null when there is no front matter. */
export declare function frontKeys(text: string | null | undefined): Record<string, string> | null;
/** Relative and repo-root link targets of a Markdown text (fenced code and inline code skipped). */
export declare function linkTargets(text: string | null | undefined): string[];
/** Normalises a "/"-separated path like path.posix.normalize (no file system). */
export declare function normalizePath(p: string): string;
export interface ProductIO {
    /** Text of a file relative to the product folder. */
    read(path: string): string;
    /** Whether a repo-relative path (file or folder) exists. */
    exists(repoPath: string): boolean;
    /** Repo-relative product folder used in messages (default `<HUB_DIR>/<id>`). */
    base?: string;
}
/** Layout, front matter and link problems of one product folder (`entries` = every file and folder, relative). */
export declare function checkProduct(id: string, entries: readonly HubEntry[], { read, exists, base }: ProductIO): CheckProblem[];
/**
 * Lifecycle files: which file(s) meet each requirement of the matrix (REQUIREMENTS). A requirement is met when every
 * file of one alternative exists.
 */
export declare const REQUIREMENT_FILES: Readonly<Record<string, readonly (readonly string[])[]>>;
/** "## " headings that are expected in many pages (templates), so they are not a topic in two files. */
export declare const SHARED_HEADINGS: ReadonlySet<string>;
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
export declare function checkConsistency(id: string, files: ReadonlySet<string>, { read, appTags, base }: ConsistencyIO): CheckProblem[];
/** Every file and folder under `dir` (repo-relative), relative to it, sorted per folder; .DS_Store skipped. */
export declare function walkHub(source: HubSource, dir: string, prefix?: string): HubEntry[];
/** A project's package.json that is not valid JSON (`file` is its repo-relative path). */
export declare class ProjectJsonError extends Error {
    readonly file: string;
    constructor(file: string);
}
/**
 * Nx tags of a project (package.json "nx.tags"), or null when the project has no package.json. Throws a
 * `ProjectJsonError` when the package.json is not valid JSON.
 */
export declare const projectTags: (source: HubSource) => (projectDir: string) => string[] | null;
/**
 * Projects in apps/ and libs/ with a product:<id> tag: [{ dir, product }] (package.json "nx.tags"). A package.json
 * that is not valid JSON is skipped here; checkHub reports it as `package-json`.
 */
export declare function taggedProjects(source: HubSource): {
    dir: string;
    product: string;
}[];
export interface CheckHubOptions {
    /** Repo-relative folder holding one folder per product (default: docs/crafthall/canon, or the legacy docs/product-hub when only that exists). */
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
export declare function checkHub(source: HubSource, { hubDir, only, newCommand, template }?: CheckHubOptions): {
    products: number;
    problems: CheckProblem[];
};
