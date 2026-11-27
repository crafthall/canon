// The standalone Claude Code plugin crafthall-canon (ADR-0002 release form 2, see CONTRIBUTING.md). Runs in `npm test`
// with no `claude` binary; the real install into an isolated Claude Code is tests/plugin-install.claude.test.ts.
//   manifest  every skill folder and command file the plugin holds is in plugin.json and nothing listed is missing;
//             every skill has its name and a description; no symbolic link (Claude Code drops links out of a plugin)
//   fresh     the committed bundle (plugin/scripts/hub-core.mjs) and template copy equal a fresh build
//   args      the command's arguments: id, --all, --json, no id = --all, bad arguments exit 2 (unit + property: the
//             plugin's exit code is always canon check's for the same arguments)
//   differential  the command line of commands/check.md, run with the committed plugin in a copy of every shared
//             fixture hub in a temp folder, prints the same JSON as `canon check --all --json` (src/cli.ts, a separate
//             process) and the text lists exactly the problems and findings of that report
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterAll, describe, expect, it } from 'vitest';
import { parseDoc } from '../src/front-matter';
import { runCheck } from '../src/cli';
import { formatPluginReport, pluginCheckArgs, runPluginCheck, PLUGIN_NAME } from '../src/plugin-runner';
import type { HubReport } from '../src/report';
import { FIXTURE_TODAY, contractView, fixtures } from './fixtures/index';
import { runCommand, walk } from './plugin-kit';
import { buildPlugin, PLUGIN } from '../scripts/build-plugin.mjs';

const LIB = join(import.meta.dirname, '..');
const CLI = join(LIB, 'src', 'cli.ts');
const MANIFEST = JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'));
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
const temp = (prefix: string) => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  dirs.push(d);
  return d;
};

/** A copy of a fixture repository root in a fresh temp folder: nothing else around it. */
function fixtureCopy(root: string): string {
  const d = temp('hub-plugin-fx-');
  cpSync(root, d, { recursive: true });
  spawnSync('git', ['init', '-q'], { cwd: d });
  return d;
}

const hubJson = (cwd: string) => spawnSync(process.execPath, [CLI, 'check', '--all', '--json'], { cwd, encoding: 'utf8' });

describe('plugin manifest and layout', () => {
  const skillDirs = readdirSync(join(PLUGIN, 'skills')).sort();
  it('lists every skill folder and every command file, and nothing that is missing', () => {
    expect(MANIFEST.name).toBe(PLUGIN_NAME);
    expect(MANIFEST.metadata.skills).toEqual(skillDirs);
    expect(MANIFEST.metadata.commands).toEqual(readdirSync(join(PLUGIN, 'commands')).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')).sort());
    expect(skillDirs).toEqual(['bootstrap', 'everything-as-code', 'hub-check', 'project-init']);
  });

  it.each(skillDirs)('skill %s: SKILL.md with its own name and a description; no skill named like the command', (dir) => {
    const { meta } = parseDoc(readFileSync(join(PLUGIN, 'skills', dir, 'SKILL.md'), 'utf8'));
    expect(meta.name).toBe(dir);
    expect(String(meta.description ?? '').length).toBeGreaterThan(80);
    expect(MANIFEST.metadata.commands).not.toContain(dir);
  });

  it('holds only regular files – no symbolic link, which Claude Code would drop from the installed copy', () => {
    const links = walk(PLUGIN).filter((p) => lstatSync(join(PLUGIN, p)).isSymbolicLink());
    expect(links).toEqual([]);
    expect(walk(PLUGIN).filter((p) => !p.startsWith('template/') && !p.startsWith('skills/'))).toEqual(['.claude-plugin/plugin.json', 'README.md', 'commands/check.md', 'scripts/hub-core.mjs', 'scripts/hub.mjs']);
  });

  it('is listed in the development marketplace of this repository (.claude-plugin/marketplace.json, source ./plugin)', () => {
    const market = JSON.parse(readFileSync(join(LIB, '.claude-plugin', 'marketplace.json'), 'utf8'));
    const entry = market.plugins.find((p: { name: string }) => p.name === PLUGIN_NAME);
    expect(market.name).toBe('crafthall-canon-dev');
    expect(entry.source).toBe('./plugin');
    expect(realpathSync(join(LIB, entry.source))).toBe(realpathSync(PLUGIN));
  });

  it('the committed bundle and template copy equal a fresh build (npm run build:plugin)', async () => {
    const out = temp('hub-plugin-build-');
    await buildPlugin(out);
    expect(readFileSync(join(out, 'scripts', 'hub-core.mjs'), 'utf8'), 'plugin/scripts/hub-core.mjs is stale – run npm run build:plugin').toBe(readFileSync(join(PLUGIN, 'scripts', 'hub-core.mjs'), 'utf8'));
    const tpl = walk(join(out, 'template'));
    expect(walk(join(PLUGIN, 'template'))).toEqual(tpl);
    for (const f of tpl) expect(readFileSync(join(PLUGIN, 'template', f), 'utf8'), `plugin/template/${f} is stale`).toBe(readFileSync(join(out, 'template', f), 'utf8'));
  });
});

describe('command arguments', () => {
  it('no id and no --all means --all; an id, --all and option values are kept as given', () => {
    expect(pluginCheckArgs([])).toEqual(['--all']);
    expect(pluginCheckArgs(['--json'])).toEqual(['--all', '--json']);
    expect(pluginCheckArgs(['acme'])).toEqual(['acme']);
    expect(pluginCheckArgs(['--all', '--json'])).toEqual(['--all', '--json']);
    // A value of --root / --today is not a product id.
    expect(pluginCheckArgs(['--root', 'x'])).toEqual(['--all', '--root', 'x']);
    expect(pluginCheckArgs(['--today', '2026-01-01', 'acme'])).toEqual(['--today', '2026-01-01', 'acme']);
  });

  const drifted = fixtures().find((f) => f.name === 'drifted')!;
  const run = (argv: string[]) => {
    const out: string[] = [];
    const err: string[] = [];
    const code = runPluginCheck(argv, { log: (s) => out.push(s), err: (s) => err.push(s) });
    return { code, out: out.join('\n'), err: err.join('\n') };
  };

  it('id, --all and --json: exit codes and output of canon check', () => {
    const one = run(['acme-ledger', '--root', drifted.root, '--today', FIXTURE_TODAY]);
    expect(one.code).toBe(1);
    expect(one.out).toMatch(/^crafthall-canon check – 11 problem\(s\), 12 finding\(s\) \(acme-ledger\)$/m);
    const all = run(['--all', '--json', '--root', drifted.root, '--today', FIXTURE_TODAY]);
    expect(all.code).toBe(1);
    expect({ fixture: 'drifted', exitCode: all.code, ...contractView(JSON.parse(all.out) as HubReport) }).toEqual(drifted.expected);
    const ok = run(['--root', fixtures().find((f) => f.name === 'complete')!.root]);
    expect(ok.code).toBe(0);
    expect(ok.out).toMatch(/^crafthall-canon check – OK, 0 finding\(s\) \(1 product folder\(s\)\)/);
  });

  it.each([
    [['--bogus'], /unknown option --bogus/],
    [['acme', '--all'], /give a product id or --all, not both/],
    [['a', 'b'], /unexpected argument "b"/],
    [['--today', 'tomorrow'], /--today must be a date YYYY-MM-DD/],
    [['--root'], /--root needs a value/],
    [['no-such-product', '--root', drifted.root], /no product folder docs\/crafthall\/canon\/no-such-product/],
  ])('bad arguments %j → exit 2 with the reason and the plugin usage, nothing on stdout', (argv, reason) => {
    const r = run(argv);
    expect(r.code).toBe(2);
    expect(r.out).toBe('');
    expect(r.err).toMatch(reason);
    expect(r.err).toMatch(/^crafthall-canon check – /);
    if (!/no product folder/.test(r.err)) expect(r.err).toContain(`/${PLUGIN_NAME}:check [<id>|--all]`);
  });

  it('property: for any arguments the exit code is canon check’s for the same arguments (with --all when no id)', () => {
    const token = fc.constantFrom('--all', '--json', 'acme-ledger', 'acme-orbit', 'nope', '--today', FIXTURE_TODAY, 'bad-date', '--bogus', '--hub-dir', 'docs/crafthall/canon');
    fc.assert(
      fc.property(fc.array(token, { maxLength: 6 }), (argv) => {
        const args = [...argv, '--root', drifted.root];
        const silent = { log: () => undefined, err: () => undefined };
        const plugin = runPluginCheck(args, silent);
        expect(plugin).toBe(runCheck(pluginCheckArgs(args), silent));
        expect([0, 1, 2]).toContain(plugin);
      }),
      { numRuns: 150 },
    );
  });
});

describe('differential: the committed plugin = canon check on every shared fixture hub, in a temp folder', () => {
  it.each(fixtures().map((f) => [f.name, f] as const))('%s – the command line with --json prints canon check --all --json; the text lists the same problems and findings', (_name, f) => {
    const repo = fixtureCopy(f.root);
    const ref = hubJson(repo);
    expect(ref.status).toBe(f.expected.exitCode);
    const report = JSON.parse(ref.stdout) as HubReport;
    // The reference itself is the contract (the fixture test holds the core to it with FIXTURE_TODAY; the real date gives the same).
    expect({ fixture: f.name, exitCode: ref.status, ...contractView(report) }).toEqual(f.expected);

    const json = runCommand(PLUGIN, '--json', repo);
    expect(json.shellStatus).toBe(0);
    expect(json.code, json.raw).toBe(f.expected.exitCode);
    expect(JSON.parse(json.out)).toEqual(report);

    const text = runCommand(PLUGIN, '', repo);
    expect(text.code, text.raw).toBe(f.expected.exitCode);
    expect(text.out.trimEnd()).toBe(formatPluginReport(report));
    const lines = text.out.split('\n');
    for (const p of report.problems) expect(lines.filter((l) => l === `  - ${p.message}`)).toHaveLength(1);
    for (const x of report.products.flatMap((p) => p.findings)) expect(lines.filter((l) => l === `    - [${x.kind}] ${x.area}: ${x.text} (${x.file})`)).toHaveLength(1);
    expect(lines.filter((l) => /^ {2}- /.test(l))).toHaveLength(report.problems.length + report.errors.length);
    expect(lines.filter((l) => /^ {4}- \[/.test(l))).toHaveLength(report.counts.findings);
  });

  it('one product id: the same JSON as canon check <id> --json', () => {
    const repo = fixtureCopy(fixtures().find((f) => f.name === 'drifted')!.root);
    const ref = spawnSync(process.execPath, [CLI, 'check', 'acme-orbit', '--json'], { cwd: repo, encoding: 'utf8' });
    const r = runCommand(PLUGIN, 'acme-orbit --json', repo);
    expect([r.code, JSON.parse(r.out)]).toEqual([ref.status, JSON.parse(ref.stdout)]);
  });

  it('canon new from the plugin in a clean repository uses the plugin’s template copy, and its check passes', () => {
    const repo = temp('hub-plugin-new-');
    spawnSync('git', ['init', '-q'], { cwd: repo });
    const made = spawnSync(process.execPath, [join(PLUGIN, 'scripts', 'hub.mjs'), 'new', 'demo-calc', '--name', 'Demo Calc'], { cwd: repo, encoding: 'utf8' });
    expect(made.status, made.stdout + made.stderr).toBe(0);
    expect(made.stdout).toMatch(/canon check demo-calc – OK\./);
    expect(existsSync(join(repo, 'docs/crafthall/canon/demo-calc/README.md'))).toBe(true);
    const r = runCommand(PLUGIN, 'demo-calc', repo);
    expect(r.code, r.raw).toBe(0);
    expect(r.out).toMatch(/^crafthall-canon check – OK, \d+ finding\(s\) \(demo-calc\)/);
  });
});
