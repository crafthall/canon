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
export function memorySource(files: Readonly<Record<string, string>>): HubSource {
  const dirs = new Map<string, Set<string>>();
  for (const p of Object.keys(files)) {
    const parts = p.split('/');
    for (let i = 0; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (!dirs.has(dir)) dirs.set(dir, new Set());
      (dirs.get(dir) as Set<string>).add(parts[i]);
    }
  }
  const clean = (p: string) => p.replace(/^\.?\/+|\/+$/g, '');
  return {
    read: (p) => (Object.prototype.hasOwnProperty.call(files, clean(p)) ? files[clean(p)] : null),
    list: (p) => [...(dirs.get(clean(p)) ?? [])],
    isDir: (p) => dirs.has(clean(p)),
  };
}

/**
 * A source that reads `top` first and falls back to `base`, file by file; a folder lists the entries of both. Used for a
 * repository's own `<hubDir>/_template/` over the package's bundled template: the repository keeps only the pages it
 * changes, every other page comes from the package.
 */
export function overlaySource(top: HubSource, base: HubSource): HubSource {
  return {
    read: (p) => top.read(p) ?? base.read(p),
    list: (p) => [...new Set([...top.list(p), ...base.list(p)])],
    isDir: (p) => top.isDir(p) || base.isDir(p),
  };
}

/** Joins path parts with "/" (no normalisation beyond dropping empty parts). */
export const joinPath = (...parts: string[]): string => parts.filter(Boolean).join('/');
