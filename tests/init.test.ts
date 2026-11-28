// `canon init` (feature crafthall-project-init): the step order, every "not available" path (HQ missing, HQ found
// no team, HQ failed, Optimize missing), the refusal on an existing hub (nothing written, nothing run), the summary and
// the README record, the agent-rules snippet (create / append / already present – never rewritten), the content rule
// of the bootstrap, HQ's answer parsing and its offline environment, and how HQ is found. All ports are fakes: no
// process, no model, no network.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterAll, describe, expect, it } from 'vitest';
import {
  AGENT_RULES_END,
  AGENT_RULES_START,
  INIT_STEPS,
  agentRulesSnippet,
  contentFiles,
  formatInitSummary,
  hqStatusRow,
  initChangelogLine,
  initProject,
  memorySource,
  planAgentRules,
  recordInReadme,
  type HqOutcome,
  type InitOptions,
  type InitPorts,
  type OptimizeOutcome,
  type ScaffoldSummary,
} from '../src/index';
import { findHq, hqOutcome, offlineHqEnv, OPTIMIZE_NOTE } from '../src/node';

const TODAY = '2026-11-27';
const README = `---\nproduct: demo\npage: hub\nname: Demo\nstatus: idea\napp: none yet\nupdated: ${TODAY}\n---\n\n# Demo – product hub\n\n## Status\n\n| | |\n|---|---|\n| Stage | **Idea** (\`status: idea\`) |\n| Team | none yet |\n\n## Pages\n\n- x\n\n## Changelog\n\n- ${TODAY} – Product folder created (\`canon init\`).\n`;
const SUMMARY: ScaffoldSummary = { id: 'demo', name: 'Demo', dir: 'docs/crafthall/canon/demo', status: 'idea', stageLabel: 'Idea', pages: ['business-product/overview.md'], apps: [], plan: null };
const CHECKED: HqOutcome = { kind: 'checked', exitCode: 0, verdict: 'OK – no conflicts or broken handoffs found in 2 agents (checked on this machine, nothing sent)', version: '0.1.0', rulesBuild: 'abc123', agents: 2, hints: [] };

/** A fake repository and ports that log every call in order. */
function harness(o: { scaffoldCode?: number; files?: string[]; hq?: HqOutcome; optimize?: OptimizeOutcome; repo?: Record<string, string>; problems?: string[] } = {}) {
  const calls: string[] = [];
  const repo: Record<string, string> = { ...(o.repo || {}) };
  const ports: InitPorts = {
    scaffold: () => {
      calls.push('scaffold');
      if ((o.scaffoldCode ?? 0) !== 0) return { code: o.scaffoldCode as number, summary: null, lines: ['canon init – refused, nothing written:', '  - docs/crafthall/canon/demo/ already exists – canon init never overwrites; edit that folder instead'] };
      repo['docs/crafthall/canon/demo/README.md'] = README;
      return { code: 0, summary: SUMMARY, lines: ['canon check demo – OK.'] };
    },
    files: () => {
      calls.push('files');
      return o.files ?? Object.keys(repo);
    },
    source: () => {
      calls.push('source');
      return memorySource(repo);
    },
    write: (p, t) => {
      calls.push(`write ${p}`);
      repo[p] = t;
    },
    hq: () => {
      calls.push('hq');
      return o.hq ?? CHECKED;
    },
    optimize: () => {
      calls.push('optimize');
      return o.optimize ?? { kind: 'missing', note: OPTIMIZE_NOTE };
    },
    check: (id) => {
      calls.push(`check ${id}`);
      return { problems: o.problems ?? [], completeness: 0, findings: ['Overview is a draft.'] };
    },
  };
  return { calls, repo, ports };
}
const run = (h: ReturnType<typeof harness>, o: Partial<InitOptions> = {}) => initProject(h.ports, { today: TODAY, ...o });

describe('canon init – step order', () => {
  it('runs scaffold → bootstrap → agent rules → HQ → Optimize → summary, in that order', () => {
    const h = harness();
    const s = run(h);
    expect(s.steps.map((x) => x.id)).toEqual([...INIT_STEPS]);
    expect(h.calls).toEqual(['scaffold', 'files', 'source', 'write CLAUDE.md', 'hq', 'optimize', 'source', 'write docs/crafthall/canon/demo/README.md', 'check demo']);
    expect(s.ok).toBe(true);
    expect(s.steps.map((x) => x.status)).toEqual(['done', 'skipped', 'done', 'done', 'skipped', 'done']);
  });

  it('the agent rules are written before HQ runs, so HQ reads them; the record is written after Optimize', () => {
    const h = harness();
    run(h);
    expect(h.calls.indexOf('write CLAUDE.md')).toBeLessThan(h.calls.indexOf('hq'));
    expect(h.calls.indexOf('optimize')).toBeLessThan(h.calls.indexOf('write docs/crafthall/canon/demo/README.md'));
  });
});

describe('canon init – not available paths', () => {
  it('HQ not installed → skipped with its message, recorded as not run, the person is told how to check later', () => {
    const h = harness({ hq: { kind: 'missing', message: 'Crafthall HQ is not installed (no Claude Code plugin crafthall-hq, no crafthall-hq on PATH, no --hq)' } });
    const s = run(h, { hqCommand: '/crafthall-hq:open' });
    const step = s.steps.find((x) => x.id === 'hq-check');
    expect(step).toEqual({ id: 'hq-check', status: 'skipped', message: 'Crafthall HQ is not installed (no Claude Code plugin crafthall-hq, no crafthall-hq on PATH, no --hq)' });
    expect(s.ok).toBe(true);
    expect(s.hq).toBeNull();
    expect(h.repo['docs/crafthall/canon/demo/README.md']).toMatch(/^\| Crafthall HQ team check \| not run – Crafthall HQ is not installed .*\(2026-11-27\) \|$/m);
    expect(s.confirm).toContain('Check the agent team with Crafthall HQ once it is installed (/crafthall-hq:open).');
  });

  it('HQ found no agent team (exit 3) → skipped; HQ failed → failed step, nothing recorded as a verdict, init still OK', () => {
    const none = run(harness({ hq: { kind: 'nothing-checked', message: 'Crafthall HQ: no agent team found in demo.' } }));
    expect(none.steps[3]).toMatchObject({ status: 'skipped', message: 'Crafthall HQ: no agent team found in demo.' });
    expect(none.confirm.some((c) => c.startsWith('Add the agent team'))).toBe(true);
    const h = harness({ hq: { kind: 'failed', message: 'Crafthall HQ did not run offline' } });
    const failed = run(h);
    expect(failed.steps[3]).toMatchObject({ status: 'failed', message: 'Crafthall HQ did not run offline; nothing recorded' });
    expect(failed.ok).toBe(true);
    expect(h.repo['docs/crafthall/canon/demo/README.md']).toMatch(/\| Crafthall HQ team check \| not run – failed: Crafthall HQ did not run offline/);
  });

  it('Optimize missing → skipped with its note; a recorded baseline → done', () => {
    const s = run(harness());
    expect(s.steps[4]).toEqual({ id: 'optimize-baseline', status: 'skipped', message: OPTIMIZE_NOTE });
    const h = harness({ optimize: { kind: 'recorded', message: 'baseline: 3 tasks, USD 0.42' } });
    const r = run(h);
    expect(r.steps[4]).toEqual({ id: 'optimize-baseline', status: 'done', message: 'baseline: 3 tasks, USD 0.42' });
    expect(h.repo['docs/crafthall/canon/demo/README.md']).toMatch(/Optimize baseline recorded\.$/m);
  });
});

describe('canon init – an existing hub', () => {
  it('refuses: nothing is written, HQ and Optimize never run, every later step is not-run, exit 1', () => {
    const h = harness({ scaffoldCode: 1, repo: { 'docs/crafthall/canon/demo/README.md': 'mine', 'CLAUDE.md': 'rules' } });
    const s = run(h);
    expect(h.calls).toEqual(['scaffold']);
    expect(h.repo).toEqual({ 'docs/crafthall/canon/demo/README.md': 'mine', 'CLAUDE.md': 'rules' });
    expect(s.ok).toBe(false);
    expect(s.steps.map((x) => x.status)).toEqual(['refused', 'not-run', 'not-run', 'not-run', 'not-run', 'not-run']);
    expect(s.steps[0].lines?.join('\n')).toMatch(/never overwrites/);
    expect(formatInitSummary(s)).toMatch(/canon init – stopped \(exit 1\)\.$/);
  });

  it('a canon check problem after the record fails the summary step (exit 1)', () => {
    const s = run(harness({ problems: ['docs/crafthall/canon/demo/README.md: broken link "x.md"'] }));
    expect(s.ok).toBe(false);
    expect(s.steps[5]).toMatchObject({ status: 'failed', lines: ['docs/crafthall/canon/demo/README.md: broken link "x.md"'] });
  });
});

describe('canon init – summary', () => {
  it('records the HQ verdict in the README Status table and Changelog, and lists the hints and what to confirm', () => {
    const hq: HqOutcome = { ...CHECKED, exitCode: 1, verdict: 'Things to improve – 2 hints | 1 minor', hints: ['One-way handoff – .claude/agents/a.md:4'] };
    const h = harness({ hq });
    const s = run(h);
    const readme = h.repo['docs/crafthall/canon/demo/README.md'];
    expect(readme).toContain('| Team | none yet |\n| Crafthall HQ team check | Things to improve – 2 hints \\| 1 minor – 2026-11-27, Crafthall HQ 0.1.0, rules abc123 |\n\n## Pages');
    expect(readme).toContain('## Changelog\n\n- 2026-11-27 – Started as a Crafthall project (`canon init`): Crafthall HQ team check found things to improve (offline); Optimize baseline skipped (no offline baseline yet).\n- 2026-11-27 – Product folder created');
    expect(s.hq).toEqual(hq);
    expect(s.steps[3].lines).toEqual(['One-way handoff – .claude/agents/a.md:4']);
    expect(s.confirm).toEqual(['Read the agent rules in CLAUDE.md and commit them with the hub.', 'Fix or record the Crafthall HQ hints above (re-run: crafthall-hq).', 'Write the draft pages and set status: current once confirmed (1 page(s) in docs/crafthall/canon/demo/).']);
    expect(s.hub).toEqual({ problems: [], completeness: 0, findings: ['Overview is a draft.'] });
    const text = formatInitSummary(s);
    expect(text.split('\n')[0]).toBe('canon init – Demo (demo):');
    expect(text).toMatch(/^ {2}4\. hq-check {10}done {5}Things to improve/m);
    expect(text).toMatch(/completeness 0 %, 1 finding\(s\)/);
    expect(text).toMatch(/canon init – OK\.$/);
  });

  it('a dry run writes nothing and runs neither HQ nor Optimize', () => {
    const h = harness();
    const s = run(h, { dryRun: true });
    expect(h.calls).toEqual(['scaffold', 'files', 'source']);
    expect(s.steps.map((x) => x.status)).toEqual(['dry-run', 'skipped', 'dry-run', 'dry-run', 'dry-run', 'dry-run']);
    expect(s.ok).toBe(true);
  });

  it('host switches: agent rules skipped with a reason; bootstrap skipped with a reason', () => {
    const h = harness();
    const s = run(h, { agentRules: "Spark's CLAUDE.md already holds the rule", bootstrap: { skip: 'turned off (--no-bootstrap)' } });
    expect(s.steps[1]).toEqual({ id: 'bootstrap', status: 'skipped', message: 'turned off (--no-bootstrap)' });
    expect(s.steps[2]).toEqual({ id: 'agent-rules', status: 'skipped', message: "Spark's CLAUDE.md already holds the rule" });
    expect(h.calls).not.toContain('write CLAUDE.md');
    expect(h.calls).not.toContain('files');
  });
});

describe('canon init – bootstrap decision', () => {
  it('a repository with content → pending (left to the bootstrap skill); only hub and agent files → skipped', () => {
    const withCode = run(harness({ files: ['src/index.ts', 'CLAUDE.md', 'docs/crafthall/canon/demo/README.md'] }), { bootstrapHint: 'skill bootstrap' });
    expect(withCode.steps[1]).toMatchObject({ status: 'pending' });
    expect(withCode.steps[1].message).toMatch(/^1 file\(s\) to read: run skill bootstrap for demo/);
    expect(withCode.confirm[0]).toBe('Run skill bootstrap for demo, then answer its "Confirm these" list.');
    expect(run(harness({ files: ['CLAUDE.md', '.gitignore', '.claude/agents/a.md', 'docs/crafthall/canon/demo/README.md'] })).steps[1].status).toBe('skipped');
  });

  it('scope apps: only the --app folders count (a monorepo full of other code is not this product)', () => {
    const files = ['apps/other/src/a.ts', 'libs/x/y.ts'];
    expect(run(harness({ files }), { bootstrap: 'apps' }).steps[1]).toMatchObject({ status: 'skipped', message: 'no --app folder with code yet, nothing to read' });
    expect(contentFiles(['apps/web/package.json', 'apps/web/src/a.ts', 'apps/webx/b.ts'], { apps: ['apps/web'] })).toEqual(['apps/web/src/a.ts']);
    expect(contentFiles(['apps/web/package.json'], { apps: ['apps/web'] })).toEqual([]);
  });

  it('contentFiles leaves out the hub folder, agent files and git metadata', () => {
    expect(contentFiles(['CLAUDE.md', 'AGENTS.md', '.claude/skills/x/SKILL.md', '.gitignore', '.gitattributes', 'docs/crafthall/canon/a/README.md', 'docs/crafthall/canonx.md', 'README.md', 'docs/CLAUDE.md'])).toEqual(['docs/crafthall/canonx.md', 'README.md', 'docs/CLAUDE.md']);
    expect(contentFiles(['notes/x.md', 'h/a.md'], { hubDir: 'h' })).toEqual(['notes/x.md']);
  });
});

describe('agent-rules snippet', () => {
  it('creates CLAUDE.md when there is no agent file; appends to an existing one; prefers CLAUDE.md over AGENTS.md', () => {
    expect(planAgentRules(memorySource({}))).toEqual({ file: 'CLAUDE.md', action: 'create', text: agentRulesSnippet() });
    expect(planAgentRules(memorySource({ 'AGENTS.md': '# Rules\n' }))).toEqual({ file: 'AGENTS.md', action: 'append', text: `# Rules\n\n${agentRulesSnippet()}` });
    expect(planAgentRules(memorySource({ 'AGENTS.md': 'a', 'CLAUDE.md': 'b\n\n' }))).toEqual({ file: 'CLAUDE.md', action: 'append', text: `b\n\n${agentRulesSnippet()}` });
    expect(planAgentRules(memorySource({ 'CLAUDE.md': 'no newline' })).text).toBe(`no newline\n\n${agentRulesSnippet()}`);
    expect(planAgentRules(memorySource({ 'CLAUDE.md': '' })).text).toBe(agentRulesSnippet());
    // A block written by 0.1.x (@crafthall/product-hub) is left alone, not duplicated.
    const legacy = '# Rules\n\n<!-- crafthall-product-hub:agent-rules v1 -->\nold\n<!-- /crafthall-product-hub:agent-rules -->\n';
    expect(planAgentRules(memorySource({ 'CLAUDE.md': legacy }))).toEqual({ file: 'CLAUDE.md', action: 'present', text: legacy });
  });

  it('a block already in either file is left as it is (an older version too)', () => {
    const old = `x\n<!-- crafthall-canon:agent-rules v0 -->\nold\n${AGENT_RULES_END}\n`;
    expect(planAgentRules(memorySource({ 'CLAUDE.md': 'plain', 'AGENTS.md': old }))).toEqual({ file: 'AGENTS.md', action: 'present', text: old });
  });

  it('names the hub folder and the check command; holds the rule, the changelog line and the escape', () => {
    const s = agentRulesSnippet({ hubDir: 'handbook/products', checkCommand: 'npm run hub:check' });
    expect(s.startsWith(`${AGENT_RULES_START}\n`)).toBe(true);
    expect(s.endsWith(`${AGENT_RULES_END}\n`)).toBe(true);
    for (const needle of ['`handbook/products/<id>/`', '`npm run hub:check`', 'in the same change', '"Changelog"', '`no product doc change: <reason>`', 'business-product/features/<slug>.md']) expect(s).toContain(needle);
  });

  it('property: applying the plan twice changes nothing the second time, and the original text is always kept as a prefix', () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: undefined }), fc.option(fc.string(), { nil: undefined }), (claude, agents) => {
        const repo: Record<string, string> = {};
        if (claude !== undefined) repo['CLAUDE.md'] = claude;
        if (agents !== undefined) repo['AGENTS.md'] = agents;
        const first = planAgentRules(memorySource(repo));
        const before = repo[first.file];
        if (before != null && !before.includes('<!-- crafthall-canon:agent-rules')) expect(first.text.startsWith(before)).toBe(true);
        const after = { ...repo, [first.file]: first.text };
        const second = planAgentRules(memorySource(after));
        expect(second.action).toBe('present');
        expect(second.text).toBe(after[second.file]);
      }),
    );
  });
});

describe('README record', () => {
  it('replaces an older HQ row instead of adding a second one; changelog newest first', () => {
    const once = recordInReadme(README, hqStatusRow(CHECKED, '2026-11-27'), '- a');
    const twice = recordInReadme(once, hqStatusRow({ kind: 'missing', message: 'gone' }, '2026-11-28'), '- b');
    expect(twice.match(/^\| Crafthall HQ team check \|/gm)).toHaveLength(1);
    expect(twice).toContain('| Crafthall HQ team check | not run – gone (2026-11-28) |');
    expect(twice).toMatch(/## Changelog\n\n- b\n- a\n- 2026-11-27 – Product folder created/);
    expect(() => recordInReadme('# x\n', 'r', 'l')).toThrow(/no "## Status"/);
  });

  it('property: a verdict with any characters stays one table cell (no stray pipe or line break)', () => {
    fc.assert(
      fc.property(fc.string(), (verdict) => {
        const row = hqStatusRow({ ...CHECKED, verdict }, TODAY);
        expect(row.includes('\n')).toBe(false);
        expect(row.replace(/\\\|/g, '').split('|')).toHaveLength(4);
      }),
    );
  });

  it('changelog line names the HQ outcome and the Optimize step', () => {
    expect(initChangelogLine(CHECKED, { kind: 'missing', note: 'n' }, TODAY)).toBe('- 2026-11-27 – Started as a Crafthall project (`canon init`): Crafthall HQ team check OK (offline); Optimize baseline skipped (no offline baseline yet).');
    expect(initChangelogLine({ kind: 'missing', message: 'm' }, { kind: 'recorded', message: 'r' }, TODAY)).toBe('- 2026-11-27 – Started as a Crafthall project (`canon init`): Crafthall HQ team check not run (see Status); Optimize baseline recorded.');
  });
});

describe('HQ runner (pure parts)', () => {
  const json = (o: object) => JSON.stringify(o);
  it('reads the --json answer: verdict, version, rules build, top hints with file:line', () => {
    const out = json({ verdict: 'OK – fine (checked on this machine, nothing sent)', exitCode: 0, offline: true, scope: { hqVersion: '0.1.0+x', agents: 3 }, result: { rulesBuild: 'r1', quality: { findings: [{ title: 'No boundaries', evidence: [{ file: '.claude/agents/a.md', line: 1 }] }, { title: 'Bare' }] } } });
    expect(hqOutcome(0, out, '')).toEqual({ kind: 'checked', exitCode: 0, verdict: 'OK – fine (checked on this machine, nothing sent)', version: '0.1.0+x', rulesBuild: 'r1', agents: 3, hints: ['No boundaries – .claude/agents/a.md:1', 'Bare'] });
    expect(hqOutcome(1, out, '')).toMatchObject({ kind: 'checked', exitCode: 1 });
  });

  it('exit 3 = nothing checked (first line of HQ output); not offline, no JSON, no verdict or another exit code = failed', () => {
    expect(hqOutcome(3, '', '\nCrafthall HQ: no agent team found in x. Nothing was checked.\n')).toEqual({ kind: 'nothing-checked', message: 'Crafthall HQ: no agent team found in x. Nothing was checked.' });
    expect(hqOutcome(3, '', '').kind).toBe('nothing-checked');
    expect(hqOutcome(0, json({ verdict: 'OK', offline: false }), '')).toEqual({ kind: 'failed', message: 'Crafthall HQ did not run offline' });
    expect(hqOutcome(0, 'not json', '')).toEqual({ kind: 'failed', message: 'Crafthall HQ did not print a JSON result' });
    expect(hqOutcome(0, json({ offline: true }), '')).toEqual({ kind: 'failed', message: 'Crafthall HQ printed no verdict' });
    expect(hqOutcome(4, '', 'engine not available')).toEqual({ kind: 'failed', message: 'Crafthall HQ exited with 4: engine not available' });
    expect(hqOutcome(null, '', '')).toEqual({ kind: 'failed', message: 'Crafthall HQ exited with a signal' });
  });

  it('offline environment: every CRAFTHALL_HQ_* setting removed, a fresh config folder set, the rest kept', () => {
    const env = offlineHqEnv({ PATH: '/bin', HOME: '/h', CRAFTHALL_HQ_KEY: 'k', CRAFTHALL_HQ_ENGINE_URL: 'https://e', CRAFTHALL_HQ_CONSENT: 'yes', CRAFTHALL_HQ_CONFIG_DIR: '/old' }, '/tmp/fresh');
    expect(env).toEqual({ PATH: '/bin', HOME: '/h', CRAFTHALL_HQ_CONFIG_DIR: '/tmp/fresh' });
  });
});

describe('findHq', () => {
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
  const temp = () => {
    const d = realpathSync(mkdtempSync(join(tmpdir(), 'hub-init-find-')));
    dirs.push(d);
    return d;
  };

  it('--hq first (a .mjs runs with node), then the installed Claude Code plugin from its .mcp.json, then PATH; none → missing', () => {
    const d = temp();
    const claude = join(d, 'claude');
    const plugin = join(d, 'cache/crafthall-hq/0.1.0');
    mkdirSync(join(plugin, 'bin'), { recursive: true });
    mkdirSync(join(claude, 'plugins'), { recursive: true });
    writeFileSync(join(plugin, 'bin/hq.mjs'), '');
    writeFileSync(join(plugin, '.mcp.json'), JSON.stringify({ mcpServers: { 'crafthall-hq': { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/bin/hq.mjs', 'mcp'] } } }));
    writeFileSync(join(claude, 'plugins/installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'other@x': [{ installPath: d }], 'crafthall-hq@local': [{ installPath: plugin }] } }));
    const pathDir = join(d, 'path');
    mkdirSync(pathDir);
    writeFileSync(join(pathDir, 'crafthall-hq'), '');
    const flagFile = join(d, 'own.mjs');
    writeFileSync(flagFile, '');

    expect(findHq({ flag: 'own.mjs', cwd: d, env: {} })).toEqual({ command: process.execPath, args: [flagFile], via: 'flag', label: 'own.mjs' });
    expect(findHq({ flag: 'nope.mjs', cwd: d, env: {} })).toEqual({ missing: '--hq nope.mjs: no such file' });
    expect(findHq({ env: { CLAUDE_CONFIG_DIR: claude, PATH: pathDir } })).toEqual({ command: process.execPath, args: [join(plugin, 'bin/hq.mjs')], via: 'plugin', label: 'Claude Code plugin crafthall-hq@local' });
    expect(findHq({ env: { CLAUDE_CONFIG_DIR: join(d, 'none'), PATH: pathDir } })).toEqual({ command: join(pathDir, 'crafthall-hq'), args: [], via: 'path', label: join(pathDir, 'crafthall-hq') });
    expect(findHq({ env: { CLAUDE_CONFIG_DIR: join(d, 'none'), PATH: join(d, 'empty') } })).toEqual({ missing: 'Crafthall HQ is not installed (no Claude Code plugin crafthall-hq, no crafthall-hq on PATH, no --hq)' });
  });

  it('a plugin without .mcp.json falls back to scripts/crafthall-hq.mjs; a plugin entry without the script is passed over', () => {
    const d = temp();
    const a = join(d, 'a');
    const b = join(d, 'b');
    mkdirSync(join(b, 'scripts'), { recursive: true });
    mkdirSync(join(d, 'plugins'));
    writeFileSync(join(b, 'scripts/crafthall-hq.mjs'), '');
    writeFileSync(join(d, 'plugins/installed_plugins.json'), JSON.stringify({ plugins: { 'crafthall-hq@a': [{ installPath: a }], 'crafthall-hq@b': [{ installPath: b }] } }));
    expect(findHq({ env: { CLAUDE_CONFIG_DIR: d, PATH: '' } })).toMatchObject({ via: 'plugin', args: [join(b, 'scripts/crafthall-hq.mjs')] });
  });
});
