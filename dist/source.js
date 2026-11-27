/** A source over an in-memory map `{ 'docs/crafthall/canon/demo/README.md': '…' }`; folders are implied by the paths. */
export function memorySource(files) {
    const dirs = new Map();
    for (const p of Object.keys(files)) {
        const parts = p.split('/');
        for (let i = 0; i < parts.length; i++) {
            const dir = parts.slice(0, i).join('/');
            if (!dirs.has(dir))
                dirs.set(dir, new Set());
            dirs.get(dir).add(parts[i]);
        }
    }
    const clean = (p) => p.replace(/^\.?\/+|\/+$/g, '');
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
export function overlaySource(top, base) {
    return {
        read: (p) => top.read(p) ?? base.read(p),
        list: (p) => [...new Set([...top.list(p), ...base.list(p)])],
        isDir: (p) => top.isDir(p) || base.isDir(p),
    };
}
/** Joins path parts with "/" (no normalisation beyond dropping empty parts). */
export const joinPath = (...parts) => parts.filter(Boolean).join('/');
