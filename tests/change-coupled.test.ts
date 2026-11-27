import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { changeCoupledProblems, checkChangeCoupled, statedReason, type TaggedProject } from '../src/index';

// a product code change must touch the product's hub feature page and changelog, or state a reason.
const projects: TaggedProject[] = [
  { dir: 'apps/demo', product: 'demo' },
  { dir: 'libs/demo-core', product: 'demo' },
  { dir: 'libs/other', product: 'other' },
];
const CODE = 'libs/demo-core/src/index.ts';
const FEATURE = 'docs/product-hub/demo/business-product/features/search.md';
const CHANGELOG = 'docs/product-hub/demo/README.md';
const check = (files: string[], text: string | null = null) => checkChangeCoupled({ files, projects, text });

describe('fixture diffs', () => {
  it('code only fails and names the missing pages', () => {
    const r = check([CODE]);
    expect(r.ok).toBe(false);
    expect(r.uncoupled).toEqual(['demo']);
    const [line] = changeCoupledProblems(r);
    expect(line).toContain('docs/product-hub/demo/business-product/features/<slug>.md');
    expect(line).toContain('docs/product-hub/demo/README.md');
  });

  it('code + hub feature page + changelog passes', () => {
    const r = check([CODE, 'apps/demo/src/page.tsx', FEATURE, CHANGELOG]);
    expect(r.ok).toBe(true);
    expect(r.products).toEqual([{ product: 'demo', code: [CODE, 'apps/demo/src/page.tsx'], features: [FEATURE], changelog: true, coupled: true }]);
    expect(changeCoupledProblems(r)).toEqual([]);
  });

  it('code + stated reason passes', () => {
    const r = check([CODE], 'Refactor.\n\nno product doc change: pure refactor, no visible effect\n');
    expect(r.ok).toBe(true);
    expect(r.reason).toBe('pure refactor, no visible effect');
  });

  it('docs only passes', () => {
    expect(check([FEATURE]).ok).toBe(true);
    expect(check([CHANGELOG, 'docs/testing.md']).ok).toBe(true);
    expect(check([]).products).toEqual([]);
  });

  it('feature page without changelog, or changelog without a feature page, fails', () => {
    expect(check([CODE, FEATURE]).ok).toBe(false);
    expect(check([CODE, CHANGELOG]).ok).toBe(false);
  });

  it('the feature catalog README and another product\'s hub do not count', () => {
    expect(check([CODE, 'docs/product-hub/demo/business-product/features/README.md', CHANGELOG]).ok).toBe(false);
    expect(check([CODE, 'docs/product-hub/other/business-product/features/x.md', 'docs/product-hub/other/README.md']).ok).toBe(false);
  });

  it('two products: each needs its own docs', () => {
    const r = check([CODE, FEATURE, CHANGELOG, 'libs/other/src/a.ts']);
    expect(r.ok).toBe(false);
    expect(r.uncoupled).toEqual(['other']);
  });

  it('a folder whose name only starts like a project is not that project', () => {
    expect(check(['libs/demo-core-extra/src/a.ts', 'apps/demonstration/x.ts']).products).toEqual([]);
  });

  it('Markdown outside src/ in a project is documentation, not code; under src/ it is site content', () => {
    expect(check(['libs/demo-core/README.md', 'libs/demo-core/docs/guide.md', 'apps/demo/docs/qa/run.md']).products).toEqual([]);
    expect(check(['apps/demo/src/content/blog/post.md']).ok).toBe(false);
    expect(check(['libs/demo-core/docs/diagram.svg']).ok).toBe(false);
  });

  it('a custom hub folder', () => {
    const r = checkChangeCoupled({ files: [CODE, 'hubs/demo/README.md', 'hubs/demo/business-product/features/a.md'], projects, hubDir: 'hubs/' });
    expect(r.ok).toBe(true);
  });
});

describe('statedReason', () => {
  it('reads the reason, case-insensitive, backticks trimmed', () => {
    expect(statedReason('No Product Doc Change: `tests only`')).toBe('tests only');
  });
  it('an empty reason or the template placeholder is no reason', () => {
    expect(statedReason('no product doc change:')).toBeNull();
    expect(statedReason('no product doc change:   \nnext line')).toBeNull();
    expect(statedReason('no product doc change: <reason>')).toBeNull();
    expect(statedReason(null)).toBeNull();
  });
  it('a placeholder line does not hide a real reason further down', () => {
    expect(statedReason('Template: no product doc change: <reason>\n\nno product doc change: CI script only')).toBe('CI script only');
  });
});

describe('properties', () => {
  const segment = fc.stringMatching(/^[a-z0-9-]{1,8}$/);
  // Unrelated: outside every tagged project (docs, scripts, untagged libs).
  const unrelated = fc.oneof(
    fc.tuple(segment, segment).map(([a, b]) => `docs/${a}/${b}.md`),
    segment.map((a) => `scripts/${a}.mjs`),
    fc.tuple(segment, segment).map(([a, b]) => `libs/x-${a}/${b}.ts`),
    segment.map((a) => `docs/product-hub/demo/business-product/${a}.md`),
  );
  const codeFile = fc.tuple(fc.constantFrom('apps/demo', 'libs/demo-core', 'libs/other'), segment).map(([d, f]) => `${d}/src/${f}.ts`);
  const docsFor = (ids: string[]) => ids.flatMap((id) => [`docs/product-hub/${id}/README.md`, `docs/product-hub/${id}/business-product/features/f.md`]);
  // A passing diff: code files plus the hub docs of every product they touch, in any order.
  const passing = fc.array(codeFile, { maxLength: 5 }).map((code) => {
    const ids = [...new Set(code.map((f) => (f.startsWith('libs/other') ? 'other' : 'demo')))];
    return [...code, ...docsFor(ids)];
  });

  it('adding unrelated files to a passing diff never makes it fail', () => {
    fc.assert(
      fc.property(passing, fc.array(unrelated, { maxLength: 8 }), fc.option(fc.constant('no product doc change: tests only')), (files, extra, text) => {
        expect(check(files, text).ok).toBe(true);
        expect(check([...extra, ...files].reverse(), text).ok).toBe(true);
      }),
    );
  });

  it('a stated reason makes any diff pass; no product code always passes', () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(codeFile, unrelated), { maxLength: 8 }), (files) => {
        expect(check(files, 'no product doc change: generated files').ok).toBe(true);
        const noCode = files.filter((f) => !/^(apps\/demo|libs\/demo-core|libs\/other)\//.test(f));
        expect(check(noCode).ok).toBe(true);
      }),
    );
  });

  it('removing the changelog from a diff with product code always fails without a reason', () => {
    fc.assert(
      fc.property(passing.filter((f) => f.some((x) => x.startsWith('apps/') || x.startsWith('libs/'))), (files) => {
        expect(check(files.filter((f) => !f.endsWith('/README.md'))).ok).toBe(false);
      }),
    );
  });
});
