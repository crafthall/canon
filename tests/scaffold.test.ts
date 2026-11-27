// The scaffold plan: pure path helpers against node:path (property), the bundled template (the layout's pages,
// no link leaving the product folder), and the plan itself on an in-memory repo. A repository that keeps its own
// <hubDir>/_template/ compares it with this one in its own tests (consumer side).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { allowedFile, checkHub, frontKeys, LAYOUT, linkTargets, memorySource, normalizePath, overlaySource, parseNewArgs, planNew, rebaseLinks, relativePath, type NewOptions } from '../src/index';
import { BUNDLED_TEMPLATE_DIR, nodeSource } from '../src/node';

const files = (dir: string, prefix = ''): string[] =>
  readdirSync(dir)
    .sort()
    .flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n), `${prefix}${n}/`) : n === '.DS_Store' ? [] : [`${prefix}${n}`]));
const headings = (text: string) => [...text.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]);

describe('path helpers', () => {
  it('property: relativePath equals posix.relative for repo-relative paths', () => {
    const seg = fc.constantFrom('a', 'b', 'docs', 'x.md');
    const path = fc.array(seg, { minLength: 0, maxLength: 5 }).map((p) => p.join('/'));
    fc.assert(
      fc.property(path, path, (a, b) => {
        expect(relativePath(a || '.', b || '.')).toBe(posix.relative(a || '.', b || '.'));
      }),
      { numRuns: 2000 },
    );
  });

  it('rebaseLinks keeps the target of a moved page', () => {
    expect(rebaseLinks('[m](model.json) [r](../README.md#x) [w](https://e.com)', 'docs/business-plans/p/plan.md', 'docs/product-hub/p/business-product/business-plan.md')).toBe(
      '[m](../../../business-plans/p/model.json) [r](../../../business-plans/README.md#x) [w](https://e.com)',
    );
    expect(normalizePath('docs/a/../b/./c.md')).toBe('docs/b/c.md');
  });
});

describe('overlaySource (a repository template over the bundled one)', () => {
  it('property: a file reads from top when top has it, else from base; a folder lists the union', () => {
    const path = fc.constantFrom('README.md', 'a/x.md', 'a/y.md', 'b/z.md', 'a/b/c.md');
    const files = fc.dictionary(path, fc.string({ maxLength: 5 }));
    fc.assert(
      fc.property(files, files, (top, base) => {
        const o = overlaySource(memorySource(top), memorySource(base));
        for (const p of ['README.md', 'a/x.md', 'a/y.md', 'b/z.md', 'a/b/c.md', 'nope.md']) expect(o.read(p)).toBe(p in top ? top[p] : p in base ? base[p] : null);
        for (const d of ['', 'a', 'b', 'a/b', 'c']) {
          expect(new Set(o.list(d))).toEqual(new Set([...memorySource(top).list(d), ...memorySource(base).list(d)]));
          expect(o.isDir(d)).toBe(memorySource(top).isDir(d) || memorySource(base).isDir(d));
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe('bundled template', () => {
  const bundled = files(BUNDLED_TEMPLATE_DIR);

  it('every page has front matter with product, page, status and updated, and at least one section', () => {
    expect(bundled.length).toBeGreaterThan(0);
    for (const f of bundled) {
      const text = readFileSync(join(BUNDLED_TEMPLATE_DIR, f), 'utf8');
      expect(Object.keys(frontKeys(text) || {}), f).toEqual(expect.arrayContaining(['product', 'page', 'status', 'updated']));
      expect(headings(text).length, f).toBeGreaterThan(0);
    }
  });

  it('has a page for every fixed layout page and every open folder, the business plan excepted (it needs real numbers)', () => {
    const untemplated = new Set(['business-product/business-plan.md', 'business-product/business-model.json']);
    for (const f of LAYOUT.files) if (!untemplated.has(f)) expect(bundled, f).toContain(f);
    for (const re of [/^business-product\/releases\//, /^business-product\/features\/(?!README|candidates)/, /^architecture-engineering\/decisions\/\d{4}-/, /^architecture-engineering\/technical\/[^/]+\.md$/]) {
      expect(bundled.some((f) => re.test(f)), String(re)).toBe(true);
    }
    expect(bundled.filter((f) => !allowedFile(f))).toEqual([]);
  });

  it('copied whole into <hubDir>/_template/ it passes the structure check (layout, front matter, links, one topic per page)', () => {
    const repo = memorySource(Object.fromEntries(bundled.map((f) => [`docs/product-hub/_template/${f}`, readFileSync(join(BUNDLED_TEMPLATE_DIR, f), 'utf8')])));
    expect(checkHub(repo).problems).toEqual([]);
  });

  it('links only inside the product folder (it must work in a repo with no other docs)', () => {
    for (const f of bundled) {
      for (const t of linkTargets(readFileSync(join(BUNDLED_TEMPLATE_DIR, f), 'utf8'))) {
        const target = normalizePath(`${posix.dirname(f)}/${t.split('#')[0]}`);
        expect(target.startsWith('..') || t.startsWith('/'), `${f} → ${t}`).toBe(false);
      }
    }
  });
});

describe('planNew on an in-memory repo', () => {
  const opts = (argv: string[]) => (parseNewArgs(argv) as { opts: NewOptions }).opts;
  const template = nodeSource(BUNDLED_TEMPLATE_DIR);

  it('plans the README and the Idea pages; applied to memory, the check passes', () => {
    const plan = planNew(memorySource({}), opts(['demo', '--issue', '7']), { today: '2026-11-26', template });
    expect(plan.errors).toEqual([]);
    expect(plan.actions.map((a) => (a.kind === 'write' ? a.path : a.kind))).toEqual(['docs/product-hub/demo/README.md', 'docs/product-hub/demo/business-product/overview.md']);
    const repo = Object.fromEntries(plan.actions.map((a) => [(a as { path: string }).path, (a as { text: string }).text]));
    expect(repo['docs/product-hub/demo/README.md']).toMatch(/- 2026-11-26 – Product folder created – #7\./);
    expect(repo['docs/product-hub/demo/README.md']).not.toMatch(/^team:/m);
    expect(checkHub(memorySource(repo)).problems).toEqual([]);
  });

  it('host options: an allowed team list, a moved-paths map only when named', () => {
    const repo = memorySource({ 'docs/product-hub/README.md': '# Rules\n' });
    expect(planNew(repo, opts(['demo', '--team', 'nova']), { template, teams: ['phoenix', 'aurora'] }).errors).toEqual(['--team must be one of phoenix, aurora']);
    expect(planNew(repo, opts(['demo', '--team', 'Nova']), { template }).errors).toEqual(['--team must be a kebab-case id']);
    const readme = (planNew(repo, opts(['demo']), { template }).actions[0] as { text: string }).text;
    expect(readme).toMatch(/lifecycle stage in \[docs\/product-hub\/README\.md\]\(\.\.\/README\.md\) asks for them/);
    const withPlan = memorySource({ 'docs/business-plans/p/plan.md': '---\nid: p\n---\n# P\n', 'docs/business-plans/p/model.json': '{}', 'map.mjs': 'export const M = [\n];\n' });
    const o = opts(['demo', '--stage', 'building', '--plan', 'p']);
    const off = planNew(withPlan, o, { template });
    expect(off.errors).toEqual([]);
    expect(off.actions.some((a) => a.kind === 'edit' && a.path === 'map.mjs')).toBe(false);
    const on = planNew(withPlan, o, { template, movedPathsFile: 'map.mjs' });
    expect(on.actions.find((a) => a.kind === 'edit' && a.path === 'map.mjs')).toMatchObject({ text: "export const M = [\n  ['docs/business-plans/p/plan.md', 'docs/product-hub/demo/business-product/business-plan.md'],\n  ['docs/business-plans/p/model.json', 'docs/product-hub/demo/business-product/business-model.json'],\n];\n" });
  });
});
