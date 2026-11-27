/**
 * Where the readers get files from: every file read of the Canon readers goes through one `HubSource`,
 * so the same code reads a repo on disk (`nodeSource` in `@crafthall/canon/node`), a Git tree, or an in-memory map
 * in tests (`memorySource`). Paths are repo-relative with "/" separators.
 */
export interface HubSource {
    /** Text of a file, or null when there is no such file. */
    read(path: string): string | null;
    /** Names of the entries of a folder (files and folders, unsorted), or [] when it is not a folder. */
    list(path: string): string[];
    /** Whether a path is a folder. */
    isDir(path: string): boolean;
}
/** A source over an in-memory map `{ 'docs/product-hub/demo/README.md': '…' }`; folders are implied by the paths. */
export declare function memorySource(files: Readonly<Record<string, string>>): HubSource;
/**
 * A source that reads `top` first and falls back to `base`, file by file; a folder lists the entries of both. Used for a
 * repository's own `<hubDir>/_template/` over the package's bundled template: the repository keeps only the pages it
 * changes, every other page comes from the package.
 */
export declare function overlaySource(top: HubSource, base: HubSource): HubSource;
/** Joins path parts with "/" (no normalisation beyond dropping empty parts). */
export declare const joinPath: (...parts: string[]) => string;
