// End to end of `canon init` (feature crafthall-project-init): the CLI runs as a separate Node process from the
// package's src/cli.ts in a clean temporary git repository with nothing else in it.
//   1. The clean user path, executed command by command and counted (≤ 10, the spec's limit): the hub is created, the
//      agent rules are written, Crafthall HQ is not installed (an empty Claude config folder and a PATH without
//      crafthall-hq) so the step is skipped with a message, and `canon check --all` is green with only draft findings.
//   2. HQ available as an installed Claude Code plugin (a stand-in script in a fake plugin folder): it is found, run
//      offline – its environment carries no CRAFTHALL_HQ_* setting and a fresh, empty config folder – and its
//      verdict is recorded in the hub README. The real Crafthall HQ bundle is run in a host's own wrapper
//      test: this package imports nothing outside itself.
//   3. An existing hub: exit 1, every file byte for byte unchanged, HQ never started.
//   4. A repository with code: the bootstrap is pending (left to the skill), and --json prints the summary.
// No model, no network: HQ is a local script here and runs offline in the wrapper test.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { HubReport, InitSummary } from '../src/index';

const CLI = join(import.meta.dirname, '../src/cli.ts');
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
const temp = (p = 'hub-init-e2e-') => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), p)));
  dirs.push(d);
  return d;
};

/** PATH with node and git only: crafthall-hq must not be on it for the "not installed" path. */
function barePath(): string {
  const git = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  const ds = [...new Set([dirname(process.execPath), dirname(git), '/usr/bin', '/bin'])];
  for (const d of ds) expect(existsSync(join(d, 'crafthall-hq')), `${d} holds crafthall-hq – the "not installed" test needs a PATH without it`).toBe(false);
  return ds.join(delimiter);
}

/** A user environment: no HQ settings from the developer's shell, the given Claude config folder. */
const userEnv = (claudeDir: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('CRAFTHALL_HQ_')) env[k] = v;
  return { ...env, PATH: barePath(), CLAUDE_CONFIG_DIR: claudeDir, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid', ...extra };
};

/** Runs one user command (`hub …` = the package CLI, `git …` = git) in `cwd`. */
function sh(cwd: string, env: NodeJS.ProcessEnv, command: readonly string[]) {
  const [bin, ...args] = command;
  const r = bin === 'canon' ? spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: 'utf8' }) : spawnSync(bin, args, { cwd, env, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

/** Everything under `dir` as path → content (for "unchanged" checks); .git left out. */
function snapshot(dir: string, rel = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of readdirSync(join(dir, rel))) {
    if (n === '.git') continue;
    const p = rel ? `${rel}/${n}` : n;
    try {
      Object.assign(out, snapshot(dir, p));
    } catch {
      out[p] = readFileSync(join(dir, p), 'utf8');
    }
  }
  return out;
}

/** A stand-in Crafthall HQ installed as a Claude Code plugin: it writes what it saw and answers like HQ's --json. */
function fakeHqPlugin(claudeDir: string, seen: string) {
  const plugin = join(claudeDir, 'plugins/cache/crafthall-local/crafthall-hq/0.1.0');
  mkdirSync(join(plugin, 'scripts'), { recursive: true });
  writeFileSync(join(plugin, '.mcp.json'), JSON.stringify({ mcpServers: { 'crafthall-hq': { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/scripts/crafthall-hq.mjs', 'mcp'] } } }));
  writeFileSync(
    join(plugin, 'scripts/crafthall-hq.mjs'),
    `import { readdirSync, writeFileSync, existsSync } from 'node:fs';
const cfg = process.env.CRAFTHALL_HQ_CONFIG_DIR;
const hqVars = Object.keys(process.env).filter((k) => k.startsWith('CRAFTHALL_HQ_') && k !== 'CRAFTHALL_HQ_CONFIG_DIR');
writeFileSync(${JSON.stringify(seen)}, JSON.stringify({ argv: process.argv.slice(2), hqVars, configEmpty: !!cfg && existsSync(cfg) && readdirSync(cfg).length === 0, agentRules: existsSync('CLAUDE.md') }));
console.log(JSON.stringify({ verdict: 'OK – no conflicts or broken handoffs found in 1 agent (checked on this machine, nothing sent)', exitCode: 0, offline: true, scope: { hqVersion: '0.1.0-test', agents: 1 }, result: { rulesBuild: 'testbuild', quality: { findings: [] } } }));
`,
  );
  mkdirSync(join(claudeDir, 'plugins'), { recursive: true });
  writeFileSync(join(claudeDir, 'plugins/installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'crafthall-hq@crafthall-local': [{ scope: 'user', installPath: plugin, version: '0.1.0' }] } }));
}

describe('canon init end to end in a clean repository', () => {
  it('the clean user path: ≤ 10 commands; hub created, HQ not installed → skipped with a message, canon check green', () => {
    const dir = temp();
    const env = userEnv(temp('hub-init-claude-'));
    // The whole user path, as the person types it (feature doc "How to run"); each line is one command.
    const path: string[][] = [
      ['git', 'init', '-q'],
      ['canon', 'init', 'demo-calc', '--name', 'Demo Calc', '--pitch', 'Works out demo sums.'],
      ['canon', 'check', '--all'],
      ['git', 'add', '-A'],
      ['git', 'commit', '-q', '-m', 'Start Demo Calc as a Crafthall project'],
    ];
    expect(path.length).toBeLessThanOrEqual(10);
    const results = path.map((c) => sh(dir, env, c));
    results.forEach((r, i) => expect(r.code, `${path[i].join(' ')}\n${r.out}${r.err}`).toBe(0));
    const init = results[1].out;
    expect(init).toMatch(/^canon init – Demo Calc \(demo-calc\):$/m);
    expect(init).toMatch(/^ {2}1\. scaffold +done +created docs\/crafthall\/canon\/demo-calc\/ at Idea/m);
    expect(init).toMatch(/^ {2}2\. bootstrap +skipped +the repository has no content/m);
    expect(init).toMatch(/^ {2}3\. agent-rules +done +created CLAUDE\.md with the Canon agent rules$/m);
    expect(init).toMatch(/^ {2}4\. hq-check +skipped +Crafthall HQ is not installed \(no Claude Code plugin crafthall-hq, no crafthall-hq on PATH, no --hq\)$/m);
    expect(init).toMatch(/^ {2}5\. optimize-baseline skipped +Crafthall Optimize has no free, offline baseline command yet/m);
    expect(init).toMatch(/^ {2}6\. summary +done +HQ result recorded in docs\/crafthall\/canon\/demo-calc\/README\.md \(Status, Changelog\); canon check demo-calc – OK/m);
    expect(init.trim().split('\n').pop()).toBe('canon init – OK.');
    expect(results[2].out.trim()).toBe('canon check – OK (1 product folder(s)): structure, lifecycle files, links, catalog, ADR index, app tags, one topic per page.');

    const readme = readFileSync(join(dir, 'docs/crafthall/canon/demo-calc/README.md'), 'utf8');
    expect(readme).toMatch(/^\| Crafthall HQ team check \| not run – Crafthall HQ is not installed .*\|$/m);
    expect(readme).toMatch(/^- \d{4}-\d\d-\d\d – Started as a Crafthall project \(`canon init`\): Crafthall HQ team check not run \(see Status\); Optimize baseline skipped/m);
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toMatch(/^<!-- crafthall-canon:agent-rules v1 -->\n## Product docs \(Crafthall Canon\)/);

    // Only draft / expected findings, no problem.
    const j = sh(dir, env, ['canon', 'check', '--all', '--json']);
    const report = JSON.parse(j.out) as HubReport;
    expect([j.code, report.ok, report.problems]).toEqual([0, true, []]);
    expect(report.products[0].findings.map((f) => [f.kind, f.area])).toEqual([['stale', 'overview']]);
    // Everything is committed: nothing outside the hub and CLAUDE.md was written.
    expect(sh(dir, env, ['git', 'ls-files']).out.trim().split('\n').sort()).toEqual(['CLAUDE.md', 'docs/crafthall/canon/demo-calc/README.md', 'docs/crafthall/canon/demo-calc/business-product/overview.md']);
  });

  it('HQ installed as a Claude Code plugin: found, run offline (no HQ settings, empty config folder), verdict recorded', () => {
    const dir = temp();
    const claude = temp('hub-init-claude-');
    const seen = join(temp('hub-init-seen-'), 'seen.json');
    fakeHqPlugin(claude, seen);
    // A signed-in developer's shell: a key, an engine and consent are set – none may reach HQ.
    const env = userEnv(claude, { CRAFTHALL_HQ_KEY: 'secret', CRAFTHALL_HQ_ENGINE_URL: 'https://engine.example.invalid', CRAFTHALL_HQ_CONSENT: 'yes' });
    expect(sh(dir, env, ['git', 'init', '-q']).code).toBe(0);
    mkdirSync(join(dir, '.claude/agents'), { recursive: true });
    writeFileSync(join(dir, '.claude/agents/dev.md'), '---\nname: dev\ndescription: Builds things.\n---\nYou build things. Never deploy.\n');
    const r = sh(dir, env, ['canon', 'init', 'team-app', '--stage', 'validation']);
    expect(r.code, r.out + r.err).toBe(0);
    expect(r.out).toMatch(/^ {2}4\. hq-check +done +OK – no conflicts or broken handoffs found in 1 agent \(checked on this machine, nothing sent\)$/m);
    expect(JSON.parse(readFileSync(seen, 'utf8'))).toEqual({ argv: [dir, '--json'], hqVars: [], configEmpty: true, agentRules: true });
    const readme = readFileSync(join(dir, 'docs/crafthall/canon/team-app/README.md'), 'utf8');
    expect(readme).toMatch(/^\| Crafthall HQ team check \| OK – no conflicts or broken handoffs found in 1 agent \(checked on this machine, nothing sent\) – \d{4}-\d\d-\d\d, Crafthall HQ 0\.1\.0-test, rules testbuild \|$/m);
    expect(readme).toMatch(/Crafthall HQ team check OK \(offline\)/);
    expect(sh(dir, env, ['canon', 'check', '--all']).code).toBe(0);
  });

  it('an existing hub: exit 1, nothing changed, HQ never started', () => {
    const dir = temp();
    const claude = temp('hub-init-claude-');
    const seen = join(temp('hub-init-seen-'), 'seen.json');
    fakeHqPlugin(claude, seen);
    const env = userEnv(claude);
    sh(dir, env, ['git', 'init', '-q']);
    expect(sh(dir, env, ['canon', 'new', 'demo']).code).toBe(0);
    writeFileSync(join(dir, 'CLAUDE.md'), '# My rules\n');
    const before = snapshot(dir);
    const r = sh(dir, env, ['canon', 'init', 'demo']);
    expect(r.code).toBe(1);
    expect(r.out).toBe('');
    expect(r.err).toMatch(/docs\/crafthall\/canon\/demo\/ already exists – canon init never overwrites/);
    expect(r.err).toMatch(/^ {2}4\. hq-check +not-run/m);
    expect(snapshot(dir)).toEqual(before);
    expect(existsSync(seen)).toBe(false);
  });

  it('a repository with code: bootstrap pending for the skill; --json prints the summary; a usage error exits 2', () => {
    const dir = temp();
    const env = userEnv(temp('hub-init-claude-'));
    sh(dir, env, ['git', 'init', '-q']);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src/index.js'), 'export const sum = (a, b) => a + b;\n');
    writeFileSync(join(dir, 'AGENTS.md'), '# Agents\n');
    const r = sh(dir, env, ['canon', 'init', 'old-app', '--json']);
    expect(r.code, r.err).toBe(0);
    const s = JSON.parse(r.out) as InitSummary;
    expect(s).toMatchObject({ schemaVersion: 1, tool: 'hub', command: 'init', ok: true, id: 'old-app', dir: 'docs/crafthall/canon/old-app', stage: 'Idea', dryRun: false, hq: null });
    expect(s.steps.map((x) => [x.id, x.status])).toEqual([
      ['scaffold', 'done'],
      ['bootstrap', 'pending'],
      ['agent-rules', 'done'],
      ['hq-check', 'skipped'],
      ['optimize-baseline', 'skipped'],
      ['summary', 'done'],
    ]);
    expect(s.steps[1].message).toMatch(/^1 file\(s\) to read: run the bootstrap skill for old-app/);
    expect(s.steps[2].message).toBe('appended to AGENTS.md the Canon agent rules');
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toMatch(/^# Agents\n\n<!-- crafthall-canon:agent-rules v1 -->/);
    expect(s.confirm[0]).toBe('Run the bootstrap skill for old-app, then answer its "Confirm these" list.');
    expect(sh(dir, env, ['canon', 'init']).code).toBe(2);
    expect(sh(dir, env, ['canon', 'init', 'x', '--hq']).code).toBe(2);
  });
});
