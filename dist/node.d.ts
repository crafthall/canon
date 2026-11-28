import type { ScaffoldAction } from './scaffold.js';
import type { HubSource } from './source.js';
/** A source over the repo at `root` on disk; paths are repo-relative with "/" separators. */
export declare function nodeSource(root: string): HubSource;
/** The package's own template folder: the hub pages `canon new` copies when the repo has no `<hubDir>/_template/`. */
export declare const BUNDLED_TEMPLATE_DIR: string;
/** Applies a scaffold plan at `root`. A write never replaces an existing file; `mv` uses `git mv`. */
export declare function applyPlan(root: string, actions: readonly ScaffoldAction[]): void;
/** Tracked files that still name `planDir` (git grep), minus the moved files and the `ignore` prefixes; [] without git. */
export declare function planReferences(root: string, planDir: string, ignore?: readonly string[]): string[];
export { findHq, hqOutcome, listRepoFiles, nodeOptimize, offlineHqEnv, runHqOffline, HQ_TIMEOUT_MS, OPTIMIZE_NOTE, type HqLocation } from './init-node.js';
