/**
 * The Crafthall Canon Claude Code plugin installed into a clean Claude Code, end to end, with no model call and no
 * network (gate R1-exit (5)). Needs the real `claude` binary, so it is not part of `npm test`
 * (vitest.config.mts excludes *.claude.test.ts); run it with `npm run test:plugin-install`.
 *   1 isolated Claude config (HOME and CLAUDE_CONFIG_DIR in a temp folder): `claude plugin marketplace add <this repo>`
 *     (the development marketplace .claude-plugin/marketplace.json) and `claude plugin install
 *     crafthall-canon@crafthall-canon-dev` succeed; the plugin is listed, enabled, with no load error;
 *     Crafthall HQ is not installed; `claude plugin details` lists the four skills and the command `check`
 *   2 differential: the installed copy's command line (commands/check.md, ${CLAUDE_PLUGIN_ROOT} = the install path), run
 *     in a copy of every shared fixture hub in a temp folder, prints with --json exactly what `canon check --all --json`
 *     (src/cli.ts) prints there, with the same exit code; the text mode lists the same problems and findings
 *   3 HQ not installed: `canon init` from the installed copy in a clean repository creates the hub from the installed
 *     template, skips the Crafthall HQ step with "not installed" and its closing check passes
 *   4 `claude plugin uninstall` removes it from the list (Claude Code keeps its cache folder); no `claude` run made any network request (all go through a loopback proxy
 *     that refuses and records every request; none expected) and no API key or token is given to any process
 * If `claude` is not on PATH, every step fails with the reason – no skip (docs/testing.md).
 */
import { execFile, spawnSync } from 'node:child_process';
import { accessSync, constants, cpSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, join, sep } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { HubReport } from '../src/report';
import type { InitSummary } from '../src/init';
import { formatPluginReport, PLUGIN_NAME } from '../src/plugin-runner';
import { contractView, fixtures } from './fixtures/index';
import { runCommand, walk } from './plugin-kit';

const ROOT = join(import.meta.dirname, '..');
const MARKETPLACE = ROOT;
const MARKETPLACE_NAME = 'crafthall-canon-dev';
const PLUGIN_ID = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;
const CLI = join(import.meta.dirname, '..', 'src', 'cli.ts');
const NO_CLAUDE =
  'test:plugin-install needs the Claude Code CLI: `claude` was not found on PATH. Install it or put it on PATH, then run `npm run test:plugin-install` again. This test does not skip.';

const dirs: string[] = [];
const temp = (prefix: string) => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  dirs.push(d);
  return d;
};

function findClaude(path = process.env.PATH ?? ''): string | undefined {
  for (const dir of path.split(delimiter).filter(Boolean)) {
    const file = join(dir, 'claude');
    try {
      accessSync(file, constants.X_OK);
      return file;
    } catch {
      /* not here */
    }
  }
  return undefined;
}

let claude = '';
let claudeHome = '';
let proxy: Server;
const proxied: string[] = [];
let proxyUrl = '';
let installPath = '';
const spawnedEnvs: Record<string, string>[] = [];

/** The environment of every `claude` run: isolated home and config, the refusing proxy, no key, no token. */
function claudeEnv(): Record<string, string> {
  const e = {
    PATH: process.env.PATH ?? '',
    HOME: claudeHome,
    CLAUDE_CONFIG_DIR: join(claudeHome, '.claude'),
    HTTPS_PROXY: proxyUrl,
    HTTP_PROXY: proxyUrl,
    https_proxy: proxyUrl,
    http_proxy: proxyUrl,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  };
  spawnedEnvs.push(e);
  return e;
}

function plugin(...args: string[]) {
  return new Promise<{ code: number | null; out: string; stdout: string }>((ok) =>
    execFile(claude, ['plugin', ...args], { cwd: claudeHome, env: claudeEnv(), encoding: 'utf8' }, (e, stdout, stderr) => {
      const out = `${stdout ?? ''}${stderr ?? ''}`;
      // The transcript of every `claude plugin` run, in the test output.
      console.log(`$ claude plugin ${args.join(' ')}\n${out.trim()}`);
      ok({ code: e ? (typeof e.code === 'number' ? e.code : null) : 0, out, stdout: stdout ?? '' });
    }),
  );
}
type Listed = { id: string; version?: string; enabled: boolean; installPath: string; errors?: string[] };
const listed = async () => (JSON.parse((await plugin('list', '--json')).stdout) as Listed[]).filter((p) => !String(p.id).endsWith('@builtin'));

/** A copy of a fixture repository root in a fresh temp folder: a clean git repository, nothing else around it. */
function fixtureCopy(root: string): string {
  const d = temp('hub-plugin-e2e-');
  cpSync(root, d, { recursive: true });
  spawnSync('git', ['init', '-q'], { cwd: d });
  return d;
}

beforeAll(async () => {
  claude = findClaude() ?? '';
  if (!claude) throw new Error(NO_CLAUDE);
  claudeHome = temp('hub-plugin-claude-');
  proxy = createServer((req, res) => {
    proxied.push(`${req.method} ${req.url}`);
    res.writeHead(502).end();
  });
  proxy.on('connect', (req, socket) => {
    proxied.push(`CONNECT ${req.url}`);
    socket.destroy();
  });
  proxyUrl = await new Promise<string>((ok) => proxy.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${(proxy.address() as { port: number }).port}`)));
  console.log(`plugin-install: ${claude} ${spawnSync(claude, ['--version'], { env: claudeEnv(), encoding: 'utf8' }).stdout.trim()}; marketplace ${MARKETPLACE}`);
});

afterAll(async () => {
  if (proxy) await new Promise<void>((ok) => (proxy.closeAllConnections(), proxy.close(() => ok())));
  dirs.forEach((d) => rmSync(d, { recursive: true, force: true }));
});

describe('Crafthall Canon plugin installed into a clean Claude Code, no model call, no network', () => {
  it(`1. marketplace add and install ${PLUGIN_ID} in an isolated config: listed, enabled, no load error, HQ not installed`, async () => {
    expect(await listed()).toEqual([]);
    const add = await plugin('marketplace', 'add', MARKETPLACE);
    expect(add.code, add.out).toBe(0);
    expect(add.out).toContain(`Successfully added marketplace: ${MARKETPLACE_NAME}`);
    const install = await plugin('install', PLUGIN_ID);
    expect(install.code, install.out).toBe(0);
    expect(install.out).toContain(`Successfully installed plugin: ${PLUGIN_ID}`);

    const all = await listed();
    expect(all.map((p) => p.id)).toEqual([PLUGIN_ID]);
    expect(all.some((p) => p.id.startsWith('crafthall-hq@'))).toBe(false);
    const [entry] = all;
    expect(entry).toMatchObject({ id: PLUGIN_ID, enabled: true });
    expect(entry.errors ?? [], 'plugin load errors').toEqual([]);
    installPath = entry.installPath;
    expect(installPath.startsWith(join(claudeHome, '.claude', 'plugins') + sep)).toBe(true);
    // The installed copy is real files, the same tree as the plugin folder (no link dropped, nothing added).
    expect(walk(installPath).filter((p) => !p.startsWith('.git'))).toEqual(walk(join(ROOT, 'plugin')));

    const details = await plugin('details', PLUGIN_ID);
    expect(details.code, details.out).toBe(0);
    // Claude Code lists plugin commands with the skills: the command `check` plus the four skills.
    expect(details.out).toMatch(/Skills \(5\)\s+bootstrap, check, everything-as-code, hub-check, project-init\n/);
    expect(details.out).toMatch(/MCP servers \(0\)/);
  });

  it.each(fixtures().map((f) => [f.name, f] as const))('2. %s – the installed command prints canon check --all --json in a fresh repository', (_name, f) => {
    const repo = fixtureCopy(f.root);
    const ref = spawnSync(process.execPath, [CLI, 'check', '--all', '--json'], { cwd: repo, encoding: 'utf8' });
    const report = JSON.parse(ref.stdout) as HubReport;
    expect({ fixture: f.name, exitCode: ref.status, ...contractView(report) }).toEqual(f.expected);

    const json = runCommand(installPath, '--json', repo);
    expect(json.code, json.raw).toBe(ref.status);
    expect(JSON.parse(json.out)).toEqual(report);
    const text = runCommand(installPath, '', repo);
    expect(text.code, text.raw).toBe(ref.status);
    expect(text.out.trimEnd()).toBe(formatPluginReport(report));
    if (f.name === 'drifted') console.log(`/crafthall-canon:check in ${f.name}:\n${text.out.split('\n').slice(0, 3).join('\n')}\n…`);
  });

  it('3. HQ not installed: canon init from the installed copy uses its template, skips the HQ step, closing check passes', () => {
    const repo = temp('hub-plugin-init-');
    spawnSync('git', ['init', '-q'], { cwd: repo });
    // The isolated config, where only this plugin is installed, and a PATH with no crafthall-hq.
    const env = { PATH: process.env.PATH ?? '', HOME: claudeHome, CLAUDE_CONFIG_DIR: join(claudeHome, '.claude') };
    expect(spawnSync('/bin/sh', ['-c', 'command -v crafthall-hq'], { env }).status, 'crafthall-hq is on PATH').not.toBe(0);
    const r = spawnSync(process.execPath, [join(installPath, 'scripts', 'hub.mjs'), 'init', 'demo-calc', '--name', 'Demo Calc', '--json'], { cwd: repo, env, encoding: 'utf8' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const summary = JSON.parse(r.stdout) as InitSummary;
    expect(summary.ok).toBe(true);
    const hq = summary.steps.find((s) => s.id === 'hq-check')!;
    expect(hq.status).toBe('skipped');
    expect(hq.message).toMatch(/not installed/);
    expect(summary.hub?.problems).toEqual([]);
    expect(readFileSync(join(repo, 'CLAUDE.md'), 'utf8')).toContain('<!-- crafthall-canon:agent-rules v1 -->');
    const check = runCommand(installPath, 'demo-calc', repo);
    expect(check.code, check.raw).toBe(0);
  });

  it('4. uninstall removes it; no network request from any claude run; no key or token passed', async () => {
    const un = await plugin('uninstall', PLUGIN_ID);
    expect(un.code, un.out).toBe(0);
    expect(await listed()).toEqual([]);
    expect((await plugin('marketplace', 'remove', MARKETPLACE_NAME)).code).toBe(0);
    expect(proxied, 'requests the refusing proxy saw').toEqual([]);
    for (const e of spawnedEnvs) expect(Object.keys(e).filter((k) => /KEY|TOKEN|ANTHROPIC/.test(k))).toEqual([]);
  });
});
