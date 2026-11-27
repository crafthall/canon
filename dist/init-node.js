/**
 * The Node ports of `canon init`: find Crafthall HQ, run its team check offline, list the repository's files,
 * and the Crafthall Optimize step. Exported from `@crafthall/canon/node`; `runInit` in cli.ts wires them.
 *
 * Crafthall HQ is found, in this order: `--hq <file>` (a host's own copy, e.g. Spark's committed plugin bundle);
 * the installed Claude Code plugin `crafthall-hq` (`$CLAUDE_CONFIG_DIR` or `~/.claude`, `plugins/installed_plugins.json`
 * → its `.mcp.json` entry script); `crafthall-hq` on PATH. None → the step is skipped with a message.
 * It always runs **offline**: every `CRAFTHALL_HQ_*` / `ATHENA_*` setting (key, engine, consent) is removed from its
 * environment and its config folder is a fresh empty temporary folder, so no sign-in session exists and HQ's mode
 * rule (`checkMode`: no session, engine, key or store → offline) picks the local check; a result that does not say
 * `offline: true` is refused. Nothing is sent and nothing is stored.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
/** How long one HQ check may take (a hang guard: it reads a few files – Spark's 15 agents take about 2 s, far longer on a loaded machine). */
export const HQ_TIMEOUT_MS = 120_000;
/** The plugin's entry script from its `.mcp.json` (`node ${CLAUDE_PLUGIN_ROOT}/scripts/athena.mjs mcp`), else scripts/athena.mjs. */
function pluginScript(installPath) {
    try {
        const mcp = JSON.parse(readFileSync(join(installPath, '.mcp.json'), 'utf8'));
        for (const s of Object.values(mcp.mcpServers || {})) {
            const arg = (s.args || []).find((a) => /\.m?js$/.test(a));
            if (s.command === 'node' && arg) {
                const f = arg.replace('${CLAUDE_PLUGIN_ROOT}', installPath);
                if (existsSync(f))
                    return f;
            }
        }
    }
    catch {
        /* no or unreadable .mcp.json: fall through */
    }
    const f = join(installPath, 'scripts', 'athena.mjs');
    return existsSync(f) ? f : null;
}
const asCommand = (file) => (/\.(m|c)?js$/.test(file) ? { command: process.execPath, args: [file] } : { command: file, args: [] });
/** Finds Crafthall HQ (see the file comment). `flag` = the `--hq` value, resolved against `cwd`. */
export function findHq({ flag = null, env = process.env, cwd = process.cwd() } = {}) {
    if (flag) {
        const f = resolve(cwd, flag);
        if (!existsSync(f))
            return { missing: `--hq ${flag}: no such file` };
        return { ...asCommand(f), via: 'flag', label: flag };
    }
    const claudeDir = env.CLAUDE_CONFIG_DIR || join(env.HOME || homedir(), '.claude');
    try {
        const installed = JSON.parse(readFileSync(join(claudeDir, 'plugins', 'installed_plugins.json'), 'utf8'));
        for (const [key, entries] of Object.entries(installed.plugins || {})) {
            if (!key.startsWith('crafthall-hq@'))
                continue;
            for (const e of entries || []) {
                const script = e.installPath ? pluginScript(e.installPath) : null;
                if (script)
                    return { ...asCommand(script), via: 'plugin', label: `Claude Code plugin ${key}` };
            }
        }
    }
    catch {
        /* no plugins file: not installed as a plugin */
    }
    for (const d of (env.PATH || '').split(delimiter).filter(Boolean)) {
        const f = join(d, 'crafthall-hq');
        if (existsSync(f) && statSync(f).isFile())
            return { command: f, args: [], via: 'path', label: f };
    }
    return { missing: 'Crafthall HQ is not installed (no Claude Code plugin crafthall-hq, no crafthall-hq on PATH, no --hq)' };
}
/** The environment HQ runs in: every HQ setting removed, a fresh config folder (no sign-in session → offline). */
export function offlineHqEnv(env, configDir) {
    const out = {};
    for (const [k, v] of Object.entries(env))
        if (!k.startsWith('CRAFTHALL_HQ_') && !k.startsWith('ATHENA_'))
            out[k] = v;
    out.CRAFTHALL_HQ_CONFIG_DIR = configDir;
    return out;
}
/** Reads HQ's `--json` answer into an outcome (pure; exported for tests). */
export function hqOutcome(status, stdout, stderr) {
    const firstLine = (s) => s.split('\n').map((l) => l.trim()).find(Boolean) || '';
    if (status === 3)
        return { kind: 'nothing-checked', message: firstLine(stderr) || firstLine(stdout) || 'Crafthall HQ found no Claude Code agent team (.claude/agents/*.md) – nothing checked' };
    if (status !== 0 && status !== 1)
        return { kind: 'failed', message: `Crafthall HQ exited with ${status ?? 'a signal'}${firstLine(stderr) ? `: ${firstLine(stderr)}` : ''}` };
    let j;
    try {
        j = JSON.parse(stdout);
    }
    catch {
        return { kind: 'failed', message: 'Crafthall HQ did not print a JSON result' };
    }
    if (j.offline !== true)
        return { kind: 'failed', message: 'Crafthall HQ did not run offline' };
    if (typeof j.verdict !== 'string')
        return { kind: 'failed', message: 'Crafthall HQ printed no verdict' };
    const str = (v) => (typeof v === 'string' && v ? v : null);
    const hints = (j.result?.quality?.findings || []).slice(0, 5).map((f) => {
        const e = (f.evidence || [])[0];
        return `${String(f.title ?? 'hint')}${e?.file ? ` – ${String(e.file)}${e.line != null ? `:${String(e.line)}` : ''}` : ''}`;
    });
    return { kind: 'checked', exitCode: status, verdict: j.verdict, version: str(j.scope?.athenaVersion), rulesBuild: str(j.result?.rulesBuild), agents: typeof j.scope?.agents === 'number' ? j.scope.agents : null, hints };
}
/** Runs the HQ team check on `root`, offline. */
export function runHqOffline(root, loc, env = process.env) {
    const config = mkdtempSync(join(tmpdir(), 'hub-init-hq-'));
    try {
        const r = spawnSync(loc.command, [...loc.args, root, '--json'], { cwd: root, env: offlineHqEnv(env, config), encoding: 'utf8', timeout: HQ_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe'] });
        if (r.error)
            return { kind: 'failed', message: `could not start Crafthall HQ (${loc.label}): ${r.error.message}` };
        return hqOutcome(r.status, r.stdout, r.stderr);
    }
    finally {
        rmSync(config, { recursive: true, force: true });
    }
}
/** Repo-relative files: `git ls-files` (tracked + untracked, not ignored); without git a walk that skips .git and node_modules. */
export function listRepoFiles(root) {
    try {
        const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
        return out.split('\0').filter(Boolean);
    }
    catch {
        const out = [];
        const walk = (rel) => {
            for (const name of readdirSync(join(root, rel))) {
                if (name === '.git' || name === 'node_modules')
                    continue;
                const p = rel ? `${rel}/${name}` : name;
                if (statSync(join(root, p)).isDirectory())
                    walk(p);
                else
                    out.push(p);
                if (out.length > 10_000)
                    return;
            }
        };
        walk('');
        return out;
    }
}
/**
 * The Crafthall Optimize step. Optimize (`apps/optimize`, CLI `crafthall-optimize`) has no free, offline baseline
 * command today: its `compare` measures with paid model runs and `import-usage` needs the user's own `/usage` rows,
 * so the init never runs it and says so.
 */
export const OPTIMIZE_NOTE = 'Crafthall Optimize has no free, offline baseline command yet (its compare makes paid model runs); record the baseline with Optimize once the product has tasks to measure';
export const nodeOptimize = () => ({ kind: 'missing', note: OPTIMIZE_NOTE });
