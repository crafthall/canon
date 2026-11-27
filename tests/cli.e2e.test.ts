// End-to-end test of the `canon` CLI (test plan "Test plan for the three release forms"): in a clean temporary
// git repository with no other files at all, `canon new` + `canon check` exit 0, and a drifted hub exits 1 with the
// expected problem rules. The CLI runs as a separate Node process from the package's own src/cli.ts; this test
// imports nothing outside the package.
import { spawnSync } from 'node:child_process';
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Ajv from 'ajv';
import { afterAll, describe, expect, it } from 'vitest';
import type { HubReport } from '../src/index';

const CLI = join(import.meta.dirname, '../src/cli.ts');
const SCHEMA = JSON.parse(readFileSync(join(import.meta.dirname, '../schema/hub-check.schema.json'), 'utf8'));
const validate = new Ajv({ allErrors: true }).compile(SCHEMA);
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** A clean repo: an empty git repository in a fresh temp folder (realpath: macOS /var → /private/var). */
function cleanRepo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'hub-e2e-')));
  dirs.push(dir);
  spawnSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}
const hub = (cwd: string, ...args: string[]) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const json = (cwd: string, ...args: string[]) => {
  const r = hub(cwd, 'check', ...args, '--json');
  const report = JSON.parse(r.out) as HubReport;
  expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
  return { code: r.code, report };
};

describe('hub CLI end to end in a clean repository', () => {
  it('canon new + canon check exit 0 at Idea and at Validation; --json follows the schema', () => {
    const dir = cleanRepo();
    expect(existsSync(join(dir, 'docs'))).toBe(false);
    const made = hub(dir, 'new', 'demo-calc', '--stage', 'idea', '--name', 'Demo Calc', '--pitch', 'Works out demo sums.');
    expect(made.err).toBe('');
    expect(made.code).toBe(0);
    expect(made.out).toMatch(/canon new – creating Demo Calc \(demo-calc\) at Idea/);
    expect(made.out).toMatch(/canon check demo-calc – OK\./);
    expect(readFileSync(join(dir, 'docs/product-hub/demo-calc/README.md'), 'utf8')).toMatch(/^> Works out demo sums\.$/m);
    const v = hub(dir, 'new', 'second', '--stage', 'validation', '--team', 'growth');
    expect(v.code, v.out + v.err).toBe(0);
    expect(existsSync(join(dir, 'docs/product-hub/second/business-product/value-proposition.md'))).toBe(true);

    const one = hub(dir, 'check', 'demo-calc');
    expect([one.code, one.out.trim()]).toEqual([0, 'canon check – OK (demo-calc): structure, lifecycle files, links, catalog, ADR index, app tags, one topic per page.']);
    const all = hub(dir, 'check', '--all');
    expect([all.code, all.out.trim()]).toEqual([0, 'canon check – OK (2 product folder(s)): structure, lifecycle files, links, catalog, ADR index, app tags, one topic per page.']);

    const { code, report } = json(dir, '--all');
    expect(code).toBe(0);
    expect(report.ok).toBe(true);
    expect(report.products.map((p) => [p.id, p.stage, p.team])).toEqual([
      ['demo-calc', 'idea', null],
      ['second', 'validation', 'growth'],
    ]);
    // Fresh pages are drafts: health findings (informational), never check problems.
    expect(report.products[0].findings.map((f) => [f.kind, f.area])).toEqual([['stale', 'overview']]);
    expect(report.products[0].completeness).toBe(0);
  });

  it("canon new: a repository's own _template/ pages win page by page; every page it lacks comes from the package template", () => {
    const dir = cleanRepo();
    const tpl = join(dir, 'docs/product-hub/_template');
    mkdirSync(join(tpl, 'business-product'), { recursive: true });
    const bundledOverview = readFileSync(join(import.meta.dirname, '../template/business-product/overview.md'), 'utf8');
    writeFileSync(join(tpl, 'business-product/overview.md'), bundledOverview.replace(/^# .*$/m, '# <Name> – overview (house style)'));
    const made = hub(dir, 'new', 'demo-calc', '--stage', 'validation', '--name', 'Demo Calc');
    expect(made.code, made.out + made.err).toBe(0);
    expect(readFileSync(join(dir, 'docs/product-hub/demo-calc/business-product/overview.md'), 'utf8')).toMatch(/^# Demo Calc – overview \(house style\)$/m);
    // README and value proposition are not in the repo's template: the package's pages are used.
    expect(readFileSync(join(dir, 'docs/product-hub/demo-calc/business-product/value-proposition.md'), 'utf8')).toBe(
      readFileSync(join(import.meta.dirname, '../template/business-product/value-proposition.md'), 'utf8').replaceAll('<Name>', 'Demo Calc').replace(/^product: .*$/m, 'product: demo-calc').replace(/^updated: .*$/m, (l) => l.replace(/YYYY-MM-DD/, new Date().toISOString().slice(0, 10))),
    );
    expect(existsSync(join(dir, 'docs/product-hub/demo-calc/README.md'))).toBe(true);
    expect(hub(dir, 'check', 'demo-calc').code).toBe(0);
  });

  it('a drifted hub exits 1 with the expected problem rules, in text and in --json', () => {
    const dir = cleanRepo();
    expect(hub(dir, 'new', 'drift', '--stage', 'validation').code).toBe(0);
    const at = (p: string) => join(dir, 'docs/product-hub/drift', p);
    rmSync(at('business-product/value-proposition.md'));
    writeFileSync(at('notes.md'), '---\nproduct: drift\npage: notes\nstatus: current\nupdated: 2026-11-26\n---\n# Notes\n');
    appendFileSync(at('business-product/overview.md'), '\n[gone](missing.md)\n');
    writeFileSync(at('README.md'), readFileSync(at('README.md'), 'utf8').replace('product: drift', 'product: other'));
    mkdirSync(join(dir, 'apps/orphan'), { recursive: true });
    writeFileSync(join(dir, 'apps/orphan/package.json'), JSON.stringify({ name: 'orphan', nx: { tags: ['product:ghost'] } }));

    const text = hub(dir, 'check', '--all');
    expect(text.code).toBe(1);
    expect(text.err).toMatch(/^canon check – 6 problem\(s\):/);
    expect(text.err).toMatch(/create it with canon new ghost/);

    const { code, report } = json(dir, '--all');
    expect(code).toBe(1);
    expect(report.ok).toBe(false);
    expect(report.problems.map((p) => p.rule).sort()).toEqual(['front-matter', 'layout', 'lifecycle', 'link', 'link', 'tagged-without-hub']);
    // The README's own link to the removed page is broken too.
    expect(report.problems.filter((p) => p.rule === 'link').map((p) => p.message)).toEqual(['docs/product-hub/drift/README.md: broken link "business-product/value-proposition.md"', 'docs/product-hub/drift/business-product/overview.md: broken link "missing.md"']);
    expect(report.counts.problems).toBe(6);
  });

  it('an apps/*/package.json that is not JSON is a problem (exit 1, rule package-json, a full --json report), not a crash', () => {
    const dir = cleanRepo();
    expect(hub(dir, 'new', 'demo', '--stage', 'idea').code).toBe(0);
    mkdirSync(join(dir, 'apps/broken'), { recursive: true });
    writeFileSync(join(dir, 'apps/broken/package.json'), '{ "name": "broken", }\n');
    const text = hub(dir, 'check', '--all');
    expect([text.code, text.err]).toEqual([1, 'canon check – 1 problem(s):\n  - apps/broken/package.json: not valid JSON – its Nx tags cannot be read; fix the file\n']);
    // Scoped to one product the broken file is still reported: its hidden tags may belong to that product.
    expect(hub(dir, 'check', 'demo').code).toBe(1);
    const { code, report } = json(dir, '--all');
    expect([code, report.ok, report.problems]).toEqual([1, false, [{ rule: 'package-json', file: 'apps/broken/package.json', message: 'apps/broken/package.json: not valid JSON – its Nx tags cannot be read; fix the file' }]]);
    expect(report.products.map((p) => p.id)).toEqual(['demo']);
  });

  it('an internal error exits 3 with one stderr line and no report – never 1 = problems found', () => {
    const dir = cleanRepo();
    expect(hub(dir, 'new', 'demo', '--stage', 'idea').code).toBe(0);
    // A hub page the process cannot read (EACCES) is an internal error, not a hub problem.
    const page = join(dir, 'docs/product-hub/demo/business-product/overview.md');
    chmodSync(page, 0o000);
    try {
      for (const args of [['check', '--all'], ['check', '--all', '--json'], ['check', 'demo', '--json']]) {
        const r = hub(dir, ...args);
        expect(r.code, args.join(' ')).toBe(3);
        expect(r.out, args.join(' ')).toBe('');
        expect(r.err, args.join(' ')).toMatch(/^canon check – internal error: EACCES[^\n]*\n$/);
      }
    } finally {
      chmodSync(page, 0o644);
    }
    expect(hub(dir, 'check', '--all').code).toBe(0);
  });

  it('--today sets the date of the experiments rule; the default is the real date; a bad date is a usage error', () => {
    const dir = cleanRepo();
    expect(hub(dir, 'new', 'acme-bets').code).toBe(0);
    writeFileSync(join(dir, 'docs/product-hub/acme-bets/business-product/experiments.md'), '---\nproduct: acme-bets\npage: experiments\nstatus: current\nupdated: 2026-01-01\n---\n\n# Acme Bets – experiments\n\n## Experiments\n\n| ID | Hypothesis | Metric | Go | Kill | Owner | Revisit by | Result |\n|---|---|---|---|---|---|---|---|\n| E1 | A bet | a number | ≥ 1 | 0 | me | 2026-01-15 | |\n');
    const overdue = (args: string[]) => json(dir, 'acme-bets', ...args).report.products[0].findings.filter((f) => f.area === 'experiments').map((f) => f.text);
    expect(overdue(['--today', '2026-01-15'])).toEqual([]);
    expect(overdue(['--today', '2026-01-16'])).toEqual(['Experiment “E1” is past its revisit-by date (2026-01-15) with no result – record the result or set a new date.']);
    expect(overdue([])).toHaveLength(1); // the real date is after 2026-01-15
    expect(hub(dir, 'check', 'acme-bets', '--today', '2026-02-30').code).toBe(2);
    expect(hub(dir, 'check', 'acme-bets', '--today').code).toBe(2);
  });

  it('usage errors exit 2', () => {
    const dir = cleanRepo();
    expect(hub(dir).code).toBe(2);
    expect(hub(dir, 'bogus').code).toBe(2);
    expect(hub(dir, 'check').code).toBe(2);
    expect(hub(dir, 'check', 'nope').code).toBe(2);
    expect(hub(dir, 'check', '--all', '--bogus').code).toBe(2);
    expect(hub(dir, 'new').code).toBe(2);
    expect(hub(dir, 'new', 'x', '--bogus').code).toBe(2);
    expect(hub(dir, '--help').code).toBe(0);
    // A refusal (not a usage error) is exit 1 and writes nothing.
    const r = hub(dir, 'new', 'Bad_Id');
    expect([r.code, existsSync(join(dir, 'docs'))]).toEqual([1, false]);
  });
});
