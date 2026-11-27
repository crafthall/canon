/**
 * `@crafthall/canon/node` – the Node side of the package: the file system source, the writer of a
 * scaffold plan (files, `git mv`) and the bundled default template. Kept out of the main entry so the core stays free
 * of file reads and runs in a browser or any bundler.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ScaffoldAction } from './scaffold.ts';
import type { HubSource } from './source.ts';

/** A source over the repo at `root` on disk; paths are repo-relative with "/" separators. */
export function nodeSource(root: string): HubSource {
  const abs = (p: string) => join(root, ...p.split('/').filter(Boolean));
  const isDir = (p: string) => existsSync(abs(p)) && statSync(abs(p)).isDirectory();
  return {
    read: (p) => (existsSync(abs(p)) && statSync(abs(p)).isFile() ? readFileSync(abs(p), 'utf8') : null),
    list: (p) => (isDir(p) ? readdirSync(abs(p)) : []),
    isDir,
  };
}

/** The package's own template folder: the hub pages `canon new` copies when the repo has no `<hubDir>/_template/`. */
export const BUNDLED_TEMPLATE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'template');

/** Applies a scaffold plan at `root`. A write never replaces an existing file; `mv` uses `git mv`. */
export function applyPlan(root: string, actions: readonly ScaffoldAction[]): void {
  for (const a of actions) {
    if (a.kind === 'write') {
      const f = join(root, a.path);
      if (existsSync(f)) throw new Error(`${a.path} exists – refusing to overwrite`);
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, a.text);
    } else if (a.kind === 'mv') {
      mkdirSync(dirname(join(root, a.to)), { recursive: true });
      if (existsSync(join(root, a.to))) throw new Error(`${a.to} exists – refusing to overwrite`);
      execFileSync('git', ['mv', a.from, a.to], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });
    } else if (a.kind === 'edit') writeFileSync(join(root, a.path), a.text);
    else {
      const d = join(root, a.path);
      // git mv leaves the plan folder empty on disk; remove it (a .DS_Store keeps it – harmless, git ignores it).
      if (existsSync(d) && statSync(d).isDirectory() && readdirSync(d).length === 0) rmdirSync(d);
    }
  }
}

/** Tracked files that still name `planDir` (git grep), minus the moved files and the `ignore` prefixes; [] without git. */
export function planReferences(root: string, planDir: string, ignore: readonly string[] = []): string[] {
  try {
    const out = execFileSync('git', ['grep', '-l', '-F', planDir.replace(/^docs\//, '') + '/'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').filter((f) => f && !f.startsWith(`${planDir}/`) && !ignore.some((p) => f === p || f.startsWith(p)));
  } catch {
    return [];
  }
}


export { findHq, hqOutcome, listRepoFiles, nodeOptimize, offlineHqEnv, runHqOffline, HQ_TIMEOUT_MS, OPTIMIZE_NOTE, type HqLocation } from './init-node.ts';
