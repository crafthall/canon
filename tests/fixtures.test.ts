// Contract test on the shared fixture hubs (ADR-0002, see CONTRIBUTING.md "Design records"). For every fixture under tests/fixtures/hubs/,
// the core (hubReport over nodeSource) and the CLI (`canon check --all --json --root <fixture>`, a separate Node process)
// must give exactly the checked-in expectation, and every report must follow schema/hub-check.schema.json. The plugin
// and the HQ module run the same comparison through tests/fixtures/index.ts.
// Coverage: `drifted` holds every structure rule (CHECK_RULES) and every health check (HEALTH_CHECKS) exactly once, and
// the fixtures together reach every finding branch of src/readers.ts but one documented exclusion – a new rule, check
// or branch without a fixture fails here.
// Property: any sequence of the breaking edits of tests/fixtures/mutations.mjs applied to the complete fixture yields
// only findings of a known branch, with that branch's kind and area, and never leaves the hub looking complete.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CHECK_RULES, FINDING_KINDS, HEALTH_CHECKS, buildProduct, completeness, hubReport, readHubProduct, requirementsAt, type HubProductSource, type HubReport } from '../src/index';
import { nodeSource } from '../src/node';
import { EXACTLY_ONCE_FIXTURE, FINDING_BRANCHES, FIXTURE_TODAY, NON_FINDING_CHECKS, UNREACHABLE_BRANCHES, branchesOf, contractView, fixtures } from './fixtures/index';
import { MUTATIONS, SHARP_MUTATIONS } from './fixtures/mutations.mjs';

const CLI = join(import.meta.dirname, '../src/cli.ts');
const validate = new Ajv({ allErrors: true }).compile(JSON.parse(readFileSync(join(import.meta.dirname, '../schema/hub-check.schema.json'), 'utf8')));
const FIXTURES = fixtures();
const byName = Object.fromEntries(FIXTURES.map((f) => [f.name, f]));
const core = (root: string): HubReport => hubReport(nodeSource(root), { today: FIXTURE_TODAY });
const cli = (root: string, ...args: string[]) => spawnSync(process.execPath, [CLI, 'check', '--all', ...args, '--root', root], { encoding: 'utf8' });
const findingsOf = (r: HubReport) => r.products.flatMap((p) => p.findings);

describe('shared fixture hubs: core and CLI give exactly the expectation', () => {
  it.each(FIXTURES.map((f) => [f.name, f] as const))('%s – core (hubReport via nodeSource)', (_name, f) => {
    const report = core(f.root);
    expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
    expect({ fixture: f.name, exitCode: report.ok ? 0 : 1, ...contractView(report) }).toEqual(f.expected);
  });

  it.each(FIXTURES.map((f) => [f.name, f] as const))('%s – CLI --json in a separate process', (_name, f) => {
    const r = cli(f.root, '--json');
    expect(r.stderr).toBe('');
    expect(r.status).toBe(f.expected.exitCode);
    const report = JSON.parse(r.stdout) as HubReport;
    expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
    expect({ fixture: f.name, exitCode: r.status, ...contractView(report) }).toEqual(f.expected);
    // The whole report, not only the contract view, equals the core's.
    expect(report).toEqual(core(f.root));
  });

  it.each(FIXTURES.map((f) => [f.name, f] as const))('%s – CLI text mode: same exit code, one line per problem', (_name, f) => {
    const r = cli(f.root);
    expect(r.status).toBe(f.expected.exitCode);
    if (f.expected.exitCode === 0) expect(r.stdout).toMatch(/^canon check – OK \(\d+ product folder\(s\)\)/);
    else expect(r.stderr.trim().split('\n').slice(1).map((l) => l.replace(/^ {2}- /, ''))).toEqual(f.expected.problems.map((p) => p.message));
  });
});

describe('shared fixture hubs: what each fixture shows', () => {
  it('complete – exit 0, completeness 100 % at Development, 0 findings, every matrix row counted', () => {
    const e = byName.complete.expected;
    expect([e.exitCode, e.counts.findings, e.problems.length]).toEqual([0, 0, 0]);
    expect(e.products.map((p) => [p.stage, p.completeness, p.done, p.total])).toEqual([['development', 1, 16, 16]]);
  });

  it('early – exit 0, completeness counted against Idea only', () => {
    const e = byName.early.expected;
    expect([e.exitCode, e.counts.findings]).toEqual([0, 0]);
    expect(e.products.map((p) => [p.stage, p.completeness, p.total])).toEqual([['idea', 1, requirementsAt('idea').length]]);
  });

  it('empty – no hub: exit 0, no products (the plan said exit 1 "no hub" – flagged in hubs/README.md, CLI unchanged)', () => {
    const e = byName.empty.expected;
    expect([e.exitCode, e.counts.products, e.problems.length]).toEqual([0, 0, 0]);
  });

  it('drifted – every structure rule exactly once', () => {
    const rules = core(byName[EXACTLY_ONCE_FIXTURE].root).problems.map((p) => p.rule).sort();
    expect(rules).toEqual([...CHECK_RULES].sort());
  });

  it('drifted – every health check exactly once (missing-page as a health row, not a finding)', () => {
    const report = core(byName[EXACTLY_ONCE_FIXTURE].root);
    const checks = findingsOf(report).map((f) => FINDING_BRANCHES.find((b) => b.id === branchesOf(f)[0])?.check).sort();
    const expected = HEALTH_CHECKS.map((c) => c.id).filter((id) => !(id in NON_FINDING_CHECKS)).sort();
    expect(checks).toEqual(expected);
    expect(report.products.flatMap((p) => p.health.rows.filter((r) => r.state === 'missing').map((r) => r.id))).toEqual(['business-plan', 'ai-workflow']);
  });

  it('drifted – the pricing reversal: ADR-0004 dropped the free tier, the catalog and the R2 release plan still have it', () => {
    const texts = findingsOf(core(byName.drifted.root)).map((f) => f.text);
    expect(texts).toContain('ADR-0004 supersedes ADR-0001, but ADR-0001 does not name it as successor.');
    expect(texts).toContain('“Free tier” is removed in its file but built in the feature table.');
    expect(texts).toContain('Release plan · r2-launch.md is still a draft (status: draft) – write the real content and set status: current.');
  });

  it('every finding of every fixture matches exactly one branch, with its kind and area', () => {
    for (const f of FIXTURES) {
      for (const x of findingsOf(core(f.root))) {
        const ids = branchesOf(x);
        expect(ids, `${f.name}: ${x.text}`).toHaveLength(1);
        const b = FINDING_BRANCHES.find((y) => y.id === ids[0]);
        expect(x.kind, `${f.name}: ${x.text}`).toBe(b?.kind);
        if (b?.area) expect(x.area, `${f.name}: ${x.text}`).toBe(b.area);
      }
    }
  });

  it('the fixtures reach every finding branch but the documented unreachable ones', () => {
    const reached = new Set(FIXTURES.flatMap((f) => findingsOf(core(f.root)).flatMap(branchesOf)));
    const expected = FINDING_BRANCHES.map((b) => b.id).filter((id) => !(id in UNREACHABLE_BRANCHES));
    expect([...reached].sort()).toEqual(expected.sort());
  });

  it('the finding kinds are exactly missing, inconsistent and stale, and every one has a branch (a new kind fails here)', () => {
    expect([...FINDING_KINDS]).toEqual(['missing', 'inconsistent', 'stale']);
    expect(new Set(FINDING_BRANCHES.map((b) => b.kind))).toEqual(new Set(FINDING_KINDS));
  });

  it('FINDING_BRANCHES lists every place src/readers.ts creates a finding (a new branch needs a row and a fixture)', () => {
    const src = readFileSync(join(import.meta.dirname, '../src/readers.ts'), 'utf8');
    // Every `kind:` in the readers is a literal finding kind, apart from the one type annotation of Finding: a finding
    // built through a helper (`kind: k`) or with a kind outside FINDING_KINDS fails here.
    const all = [...src.matchAll(/\bkind\s*:\s*([^,}\s]+)/g)].map((m) => m[1]);
    expect(all.filter((k) => k !== 'FindingKind;' && !FINDING_KINDS.some((x) => k === `'${x}'`))).toEqual([]);
    expect(all.filter((k) => k === 'FindingKind;')).toHaveLength(1);
    expect(all.length - 1).toBe(FINDING_BRANCHES.length);
    // Every branch belongs to a health check; only an unreachable branch (a host hook) may have none.
    for (const b of FINDING_BRANCHES) {
      if (b.check) expect(HEALTH_CHECKS.map((c) => c.id), b.id).toContain(b.check);
      else expect(UNREACHABLE_BRANCHES, b.id).toHaveProperty([b.id]);
    }
  });
});

describe('property: breaking edits of the complete fixture', () => {
  const dir = 'docs/product-hub/acme-ledger';
  const clean = readHubProduct(nodeSource(byName.complete.root), dir);
  const plans = [{ id: 'acme-ledger', file: `${dir}/business-product/business-plan.md` }];
  const build = (src: HubProductSource) => buildProduct('acme-ledger', src, { plans, today: FIXTURE_TODAY });
  const edits: Record<string, (s: HubProductSource) => HubProductSource> = { ...MUTATIONS, ...SHARP_MUTATIONS };
  const names = Object.keys(edits);
  // Appends a second "## Launch tasks" section; the readers read the first one, and the complete fixture has that table,
  // so the edit is invisible here (mutations.mjs; launch-task-bad-status-in-table is the edit that shows).
  const INVISIBLE = new Set(['launch-task-bad-status']);

  const holds = (seq: string[]) => {
    const p = build(seq.reduce((s, n) => edits[n](s), clean));
    for (const x of p.findings) {
      const ids = branchesOf(x);
      expect(ids, `${seq.join(' → ')}: ${x.text}`).toHaveLength(1);
      const b = FINDING_BRANCHES.find((y) => y.id === ids[0]);
      expect(x.kind, x.text).toBe(b?.kind);
      if (b?.area) expect(x.area, x.text).toBe(b.area);
    }
    // Detected: a finding, a lower completeness, or the product is no longer assessed.
    const c = completeness(p.health);
    const detected = p.findings.length > 0 || c === null || c < 1;
    expect(detected, seq.join(' → ')).toBe(seq.some((n) => !INVISIBLE.has(n)));
  };

  it('the clean fixture is a fixed point: 0 findings, completeness 1', () => {
    const p = build(clean);
    expect([p.findings.length, completeness(p.health)]).toEqual([0, 1]);
  });

  it.each(names)('single edit %s is detected (unless known invisible) and yields only known branches', (n) => holds([n]));

  it('any sequence of 1–4 edits is detected (unless all known invisible) and yields only known branches', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...names), { minLength: 1, maxLength: 4 }), (seq) => holds(seq)),
      { numRuns: 300 },
    );
  });
});
