import type { HqOutcome, OptimizeOutcome } from './init.js';
/** How long one HQ check may take (a hang guard: it reads a few files – Spark's 15 agents take about 2 s, far longer on a loaded machine). */
export declare const HQ_TIMEOUT_MS = 120000;
/** Where HQ was found: the command to run (`node <script>` or the binary) and how it was found. */
export interface HqLocation {
    command: string;
    args: string[];
    via: 'flag' | 'plugin' | 'path';
    label: string;
}
/** Finds Crafthall HQ (see the file comment). `flag` = the `--hq` value, resolved against `cwd`. */
export declare function findHq({ flag, env, cwd }?: {
    flag?: string | null;
    env?: NodeJS.ProcessEnv;
    cwd?: string;
}): HqLocation | {
    missing: string;
};
/** The environment HQ runs in: every HQ setting removed, a fresh config folder (no sign-in session → offline). */
export declare function offlineHqEnv(env: NodeJS.ProcessEnv, configDir: string): NodeJS.ProcessEnv;
/** Reads HQ's `--json` answer into an outcome (pure; exported for tests). */
export declare function hqOutcome(status: number | null, stdout: string, stderr: string): HqOutcome;
/** Runs the HQ team check on `root`, offline. */
export declare function runHqOffline(root: string, loc: HqLocation, env?: NodeJS.ProcessEnv): HqOutcome;
/** Repo-relative files: `git ls-files` (tracked + untracked, not ignored); without git a walk that skips .git and node_modules. */
export declare function listRepoFiles(root: string): string[];
/**
 * The Crafthall Optimize step. Optimize (`apps/optimize`, CLI `crafthall-optimize`) has no free, offline baseline
 * command today: its `compare` measures with paid model runs and `import-usage` needs the user's own `/usage` rows,
 * so the init never runs it and says so.
 */
export declare const OPTIMIZE_NOTE = "Crafthall Optimize has no free, offline baseline command yet (its compare makes paid model runs); record the baseline with Optimize once the product has tasks to measure";
export declare const nodeOptimize: () => OptimizeOutcome;
