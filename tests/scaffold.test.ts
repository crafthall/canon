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
    expect(rebaseLinks('[m](model.json) [r](../README.md#x) [w](https://e.com)', 'docs/business-plans/p/plan.md', 'docs/crafthall/canon/p/business-product/business-plan.md')).toBe(
      '[m](../../../../business-plans/p/model.json) [r](../../../../business-plans/README.md#x) [w](https://e.com)',
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
    const repo = memorySource(Object.fromEntries(bundled.map((f) => [`docs/crafthall/canon/_template/${f}`, readFileSync(join(BUNDLED_TEMPLATE_DIR, f), 'utf8')])));
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
    expect(plan.actions.map((a) => (a.kind === 'write' ? a.path : a.kind))).toEqual(['docs/crafthall/canon/demo/README.md', 'docs/crafthall/canon/demo/business-product/overview.md']);
    const repo = Object.fromEntries(plan.actions.map((a) => [(a as { path: string }).path, (a as { text: string }).text]));
    expect(repo['docs/crafthall/canon/demo/README.md']).toMatch(/- 2026-11-26 – Product folder created – #7\./);
    expect(repo['docs/crafthall/canon/demo/README.md']).not.toMatch(/^team:/m);
    expect(checkHub(memorySource(repo)).problems).toEqual([]);
  });

  /** Applies a plan's actions to an in-memory file map (write, edit, mv, rmdir), as the node writer does on disk. */
  const apply = (files: Record<string, string>, actions: { kind: string; path?: string; from?: string; to?: string; text?: string }[]) => {
    const out = { ...files };
    for (const a of actions) {
      if (a.kind === 'write' || a.kind === 'edit') out[a.path as string] = a.text as string;
      else if (a.kind === 'mv') {
        out[a.to as string] = out[a.from as string];
        delete out[a.from as string];
      }
    }
    return out;
  };
  const app = { 'apps/web/package.json': JSON.stringify({ name: 'web', nx: { tags: ['type:app'] } }, null, 2) + '\n' };

  it('property: the README link to the primary app reaches it from any hub folder depth', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom('docs', 'crafthall', 'canon', 'hub', 'x'), { minLength: 1, maxLength: 4 }), (segs) => {
        const hubDir = segs.join('/');
        const plan = planNew(memorySource({ ...app }), opts(['demo', '--app', 'web']), { today: '2026-11-27', template, hubDir });
        expect(plan.errors).toEqual([]);
        const readme = (plan.actions.find((a) => a.kind === 'write' && a.path === `${hubDir}/demo/README.md`) as { text: string }).text;
        const target = (readme.match(/\]\(([^)]*apps\/web\/)\)/) as RegExpMatchArray)[1];
        expect(normalizePath(`${hubDir}/demo/${target}`)).toBe('apps/web/');
      }),
      { numRuns: 200 },
    );
  });

  it('with --app, the created hub passes the check in the default and in the legacy folder', () => {
    for (const legacy of [false, true]) {
      const base: Record<string, string> = { ...app, ...(legacy ? { 'docs/product-hub/README.md': '# Rules\n' } : {}) };
      const plan = planNew(memorySource(base), opts(['demo', '--app', 'web']), { today: '2026-11-27', template });
      expect(plan.errors).toEqual([]);
      const repo = apply(base, plan.actions as never);
      expect(Object.keys(repo).some((p) => p.startsWith(legacy ? 'docs/product-hub/demo/' : 'docs/crafthall/canon/demo/')), String(legacy)).toBe(true);
      expect(checkHub(memorySource(repo)).problems.map((p) => p.message), String(legacy)).toEqual([]);
    }
  });

  it('--plan moves the competition landscape appendix with the plan, gives it page keys and keeps the links between them', () => {
    const base = {
      'docs/business-plans/p/plan.md': '---\nid: p\nstatus: final\n---\n# P\n\nFull list: [landscape](competition-landscape.md#groups). Model: [m](model.json).\n',
      'docs/business-plans/p/model.json': '{}',
      'docs/business-plans/p/competition-landscape.md': '# P – competition landscape\n\nCounts in [the plan](plan.md) §3.\n',
      'map.mjs': 'export const M = [\n];\n',
    };
    const plan = planNew(memorySource(base), opts(['demo', '--stage', 'building', '--plan', 'p']), { today: '2026-11-27', template, movedPathsFile: 'map.mjs' });
    expect(plan.errors).toEqual([]);
    const repo = apply(base, plan.actions as never);
    const land = repo['docs/crafthall/canon/demo/business-product/competition-landscape.md'];
    expect(land).toMatch(/^---\nproduct: demo\npage: competition-landscape\nstatus: current\nupdated: 2026-11-27\n---\n\n# P – competition landscape/);
    expect(land).toContain('[the plan](business-plan.md)');
    expect(repo['docs/crafthall/canon/demo/business-product/business-plan.md']).toContain('[landscape](competition-landscape.md#groups)');
    expect(Object.keys(repo).filter((p) => p.startsWith('docs/business-plans/'))).toEqual([]);
    expect(repo['map.mjs']).toContain("['docs/business-plans/p/competition-landscape.md', 'docs/crafthall/canon/demo/business-product/competition-landscape.md'],");
    expect(checkHub(memorySource(repo)).problems.filter((p) => p.file.includes('competition-landscape') || p.rule === 'layout')).toEqual([]);
    // Any other file next to the plan still has no place in the hub.
    const other = planNew(memorySource({ ...base, 'docs/business-plans/p/notes.md': 'x' }), opts(['demo', '--stage', 'building', '--plan', 'p']), { template });
    expect(other.errors).toEqual(['--plan p: docs/business-plans/p/ also holds notes.md – the hub layout has no place for it; move or delete it first']);
  });

  it('host options: an allowed team list, a moved-paths map only when named', () => {
    const repo = memorySource({ 'docs/crafthall/canon/README.md': '# Rules\n' });
    expect(planNew(repo, opts(['demo', '--team', 'nova']), { template, teams: ['phoenix', 'aurora'] }).errors).toEqual(['--team must be one of phoenix, aurora']);
    expect(planNew(repo, opts(['demo', '--team', 'Nova']), { template }).errors).toEqual(['--team must be a kebab-case id']);
    const readme = (planNew(repo, opts(['demo']), { template }).actions[0] as { text: string }).text;
    expect(readme).toMatch(/lifecycle stage in \[docs\/crafthall\/canon\/README\.md\]\(\.\.\/README\.md\) asks for them/);
    const withPlan = memorySource({ 'docs/business-plans/p/plan.md': '---\nid: p\n---\n# P\n', 'docs/business-plans/p/model.json': '{}', 'map.mjs': 'export const M = [\n];\n' });
    const o = opts(['demo', '--stage', 'building', '--plan', 'p']);
    const off = planNew(withPlan, o, { template });
    expect(off.errors).toEqual([]);
    expect(off.actions.some((a) => a.kind === 'edit' && a.path === 'map.mjs')).toBe(false);
    const on = planNew(withPlan, o, { template, movedPathsFile: 'map.mjs' });
    expect(on.actions.find((a) => a.kind === 'edit' && a.path === 'map.mjs')).toMatchObject({ text: "export const M = [\n  ['docs/business-plans/p/plan.md', 'docs/crafthall/canon/demo/business-product/business-plan.md'],\n  ['docs/business-plans/p/model.json', 'docs/crafthall/canon/demo/business-product/business-model.json'],\n];\n" });
  });
});
