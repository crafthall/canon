// Unit tests of the structure check (moved from the repo's product-hub check script): every rule both ways –
// a hub that breaks it gives a problem with that rule id, a valid hub gives none – plus a property law for the path
// normaliser that replaced node:path in the link rule.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import fc from 'fast-check';
import { afterAll, describe, expect, it } from 'vitest';
import { nodeSource } from '../src/node';
import { CHECK_RULES, HUB_PATHS, LAYOUT, ProjectJsonError, allowedFile, buildProduct, readHubProduct, checkConsistency, checkHub, checkProduct, frontKeys, linkTargets, memorySource, normalizePath, taggedProjects, type CheckProblem, type HubEntry } from '../src/index';

const page = (extra = '', body = '# Page\n') => `---\nproduct: demo\npage: overview\nstatus: current\nupdated: 2026-11-23\n${extra}---\n\n${body}`;
const rules = (ps: CheckProblem[]) => ps.map((p) => p.rule);
const messages = (ps: CheckProblem[]) => ps.map((p) => p.message);

/** checkProduct on a small product folder in memory: { path: text } plus its folders. */
function structure(files: Record<string, string>): CheckProblem[] {
  const dirs = new Set<string>();
  for (const p of Object.keys(files)) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  const entries: HubEntry[] = [...[...dirs].map((path) => ({ path, dir: true })), ...Object.keys(files).map((path) => ({ path, dir: false }))];
  const repo = new Set(Object.keys(files).map((p) => `docs/product-hub/demo/${p}`).concat(['docs/testing.md', 'docs/product-hub/README.md']));
  return checkProduct('demo', entries, { read: (p) => files[p], exists: (p) => repo.has(p) || [...repo].some((f) => f.startsWith(`${p}/`)) });
}

/** A complete Development-stage product (status: building) in memory, for the consistency checks. */
function consistency(over: Record<string, string | null> = {}, { tags = ['type:app', 'product:demo', 'role:primary'] } = {}): CheckProblem[] {
  const p = (name: string, body = 'Body.') => page('', body).replace('page: overview', `page: ${name}`);
  const files: Record<string, string | null> = {
    'README.md': '---\nproduct: demo\npage: hub\nstatus: building\napp: apps/demo\nupdated: 2026-11-23\n---\n\n# Demo\n\n> Pitch.\n\n## Product metrics\n\n| a | b |\n|---|---|\n',
    'business-product/overview.md': p('overview', '## What it is\nA checker.'),
    'business-product/value-proposition.md': p('value-proposition', '## For whom and why\nBuilders.'),
    'business-product/business-plan.md': p('business-plan', '## 2. Problem and customer\n\nMoved unchanged to the [value proposition](value-proposition.md).\n'),
    'business-product/business-model.json': '{}',
    'business-product/go-to-market.md': p('go-to-market'),
    'business-product/monetization.md': p('monetization'),
    'business-product/roadmap.md': p('roadmap', '## Releases\nR1.\n\n## Gates\nG1.'),
    'business-product/features/README.md': p('feature-catalog', '| Feature | Status | Doc |\n|---|---|---|\n| Scan | built | [scan](scan.md) |'),
    'business-product/features/scan.md': '---\nfeature: scan\nproduct: demo\npage: feature\nstatus: built\nupdated: 2026-11-23\n---\n# Scan\n',
    'architecture-engineering/overview.md': p('architecture-overview'),
    'architecture-engineering/components-and-data-flows.md': p('components-and-data-flows'),
    'architecture-engineering/technology-stack.md': p('technology-stack'),
    'architecture-engineering/decisions/README.md': p('decisions-index', '| [0001](0001-first.md) | First |'),
    'architecture-engineering/decisions/0001-first.md': p('decision'),
    'architecture-engineering/technical/testing.md': p('testing'),
    ...Object.fromEntries(['agent-instructions', 'documentation-rules', 'definition-of-done', 'documentation-skills'].map((k) => [`ai-development-workflow/${k}.md`, p(k)])),
    ...over,
  };
  for (const [k, v] of Object.entries(files)) if (v === null) delete files[k];
  return checkConsistency('demo', new Set(Object.keys(files)), { read: (f) => files[f] as string, appTags: (app) => (app === 'apps/demo' ? tags : null) });
}

describe('structure: layout, front matter, links', () => {
  it('a folder that follows the layout passes (valid → no problem)', () => {
    expect(
      structure({
        'README.md': page('', '# Demo\n\n[overview](business-product/overview.md) · [rules](../README.md)\n'),
        'business-product/overview.md': page('', '# Overview\n\n[testing](../../../testing.md)\n'),
        'business-product/business-model.json': '{}',
        'business-product/features/team-scan.md': page(),
        'business-product/releases/r1.md': page(),
        'architecture-engineering/decisions/0001-first.md': page(),
        'architecture-engineering/technical/user-guide.md': page(),
      }),
    ).toEqual([]);
  });

  it('layout: an unknown top-level file and an unknown folder fail; a file in an unknown folder is reported once', () => {
    const problems = structure({ 'README.md': page(), 'notes.md': page(), 'drafts/idea.md': page() });
    expect(rules(problems)).toEqual(['layout', 'layout']);
    expect(problems[0]).toEqual({ rule: 'layout', file: 'docs/product-hub/demo/drafts/', message: 'docs/product-hub/demo/drafts/: folder not in the product hub layout' });
    expect(problems[1].message).toMatch(/notes\.md: file not in the product hub layout/);
  });

  it('front-matter: none, missing keys, another product, a non-date "updated"', () => {
    const problems = structure({ 'README.md': '# No front matter\n', 'business-product/overview.md': '---\nproduct: demo\npage: overview\n---\n# X\n' });
    expect(rules(problems)).toEqual(['front-matter', 'front-matter']);
    expect(problems[0].message).toMatch(/README\.md: no front matter/);
    expect(problems[1].message).toMatch(/overview\.md: front matter misses status, updated/);
    expect(messages(structure({ 'README.md': page().replace('product: demo', 'product: other') }))[0]).toMatch(/says product "other" in folder "demo"/);
    expect(structure({ 'README.md': page().replace('updated: 2026-11-23', 'updated: soon') })).toEqual([{ rule: 'front-matter', file: 'docs/product-hub/demo/README.md', message: 'docs/product-hub/demo/README.md: "updated" must be a date YYYY-MM-DD' }]);
  });

  it('link: a broken relative link fails; web links, anchors and code are not checked; a working link passes', () => {
    const body = '# X\n\n[gone](business-product/missing.md) [web](https://example.com) [here](#x)\n\n`[code](nope.md)`\n\n```\n[fenced](nope.md)\n```\n';
    const problems = structure({ 'README.md': page('', body) });
    expect(problems).toEqual([{ rule: 'link', file: 'docs/product-hub/demo/README.md', message: 'docs/product-hub/demo/README.md: broken link "business-product/missing.md"' }]);
    expect(structure({ 'README.md': page('', '[up](../../testing.md) [root](/docs/testing.md#x) [dir](business-product/)'), 'business-product/overview.md': page() })).toEqual([]);
    expect(rules(structure({ 'README.md': page('', '[out](../../../../../x.md)') }))).toEqual(['link']);
  });

  it('layout helpers', () => {
    expect(allowedFile('architecture-engineering/decisions/0006-free-runs-every-rule-offline.md')).toBe(true);
    expect(allowedFile('architecture-engineering/decisions/6-short.md')).toBe(false);
    expect(allowedFile('architecture-engineering/technical/rules/broken-reference.md')).toBe(true);
    expect(allowedFile('architecture-engineering/technical/rules/notes.json')).toBe(true);
    expect(allowedFile('architecture-engineering/technical/potential-problems.grades.json')).toBe(true);
    expect(allowedFile('architecture-engineering/technical/other.grades.json')).toBe(false);
    expect(allowedFile('architecture-engineering/technical/rules/data.yaml')).toBe(false);
    expect(allowedFile('architecture-engineering/technical/rule-registry.json')).toBe(true);
    expect(allowedFile('architecture-engineering/technical/other-data.json')).toBe(false);
    expect(allowedFile('architecture-engineering/technical/other/page.md')).toBe(false);
    expect(allowedFile('business-product/Overview.md')).toBe(false);
    expect(frontKeys('# none')).toBeNull();
    expect(linkTargets('[a](b.md) [c](https://x) [d](/docs/x.md#y)')).toEqual(['b.md', '/docs/x.md#y']);
  });

  it('property: normalizePath equals node:path posix.normalize', () => {
    const seg = fc.constantFrom('a', 'b', 'c.md', '..', '.', '');
    fc.assert(
      fc.property(fc.array(seg, { minLength: 1, maxLength: 8 }), fc.boolean(), fc.boolean(), (parts, lead, trail) => {
        const p = `${lead ? '/' : ''}${parts.join('/')}${trail ? '/' : ''}`;
        expect(normalizePath(p)).toBe(posix.normalize(p));
      }),
      { numRuns: 2000 },
    );
  });
});

describe('consistency: lifecycle, catalog, ADR index, apps, topics', () => {
  it('a complete product passes; a pointer section in the plan is not a second copy', () => {
    expect(consistency()).toEqual([]);
  });

  it('lifecycle: a page the stage requires is missing', () => {
    const problems = consistency({ 'ai-development-workflow/definition-of-done.md': null, 'architecture-engineering/technology-stack.md': null });
    expect(rules(problems)).toEqual(['lifecycle', 'lifecycle']);
    expect(problems.some((x) => /Technology stack is required at Development – add architecture-engineering\/technology-stack\.md/.test(x.message))).toBe(true);
    expect(problems.some((x) => /AI and development workflow is required at Development/.test(x.message))).toBe(true);
  });

  it('lifecycle: README "Product metrics" meets the metrics row; without it testing.md is needed', () => {
    const noMetrics = '---\nproduct: demo\npage: hub\nstatus: building\napp: apps/demo\nupdated: 2026-11-23\n---\n\n# Demo\n';
    expect(consistency({ 'README.md': noMetrics })).toEqual([]);
    expect(rules(consistency({ 'README.md': noMetrics, 'architecture-engineering/technical/testing.md': null }))).toEqual(['lifecycle']);
  });

  it('status: a hub README status outside the enum', () => {
    const problems = consistency({ 'README.md': '---\nproduct: demo\npage: hub\nstatus: shipping\nupdated: 2026-11-23\n---\n\n# Demo\n' });
    expect(problems).toEqual([{ rule: 'status', file: 'docs/product-hub/demo/README.md', message: 'docs/product-hub/demo/README.md: status "shipping" is not one of idea, validation, building, live, paused, retired' }]);
  });

  it('feature, catalog and adr-index: bad status, file without a row, row without a file, ADR not indexed', () => {
    const problems = consistency({
      'business-product/features/scan.md': '---\nfeature: scan\nproduct: demo\npage: feature\nstatus: shipped\nupdated: 2026-11-23\n---\n# Scan\n',
      'business-product/features/ghost.md': '---\nfeature: ghost\nproduct: demo\npage: feature\nstatus: built\nupdated: 2026-11-23\n---\n# Ghost\n',
      'business-product/features/README.md': page('', '| Feature | Status | Doc |\n|---|---|---|\n| Scan | built | [scan](scan.md) |\n| Gone | built | [gone](gone.md) |'),
      'architecture-engineering/decisions/0002-second.md': page(),
    });
    expect(rules(problems).sort()).toEqual(['adr-index', 'catalog', 'catalog', 'feature']);
    expect(problems.find((x) => x.rule === 'feature')?.message).toMatch(/scan\.md: feature status "shipped"/);
    expect(problems.some((x) => /ghost\.md: not in the feature catalog/.test(x.message))).toBe(true);
    expect(problems.some((x) => /catalog row links gone\.md, which does not exist/.test(x.message))).toBe(true);
    expect(problems.find((x) => x.rule === 'adr-index')?.message).toMatch(/0002-second\.md: not linked from the decisions index/);
  });

  it('adr-index: a decision record without an index', () => {
    expect(consistency({ 'architecture-engineering/decisions/README.md': null })).toEqual([{ rule: 'adr-index', file: 'docs/product-hub/demo/architecture-engineering/decisions/0001-first.md', message: 'docs/product-hub/demo/architecture-engineering/decisions/0001-first.md: decision record without architecture-engineering/decisions/README.md' }]);
  });

  it('package-json: a named app whose package.json is not JSON is a problem, not a crash (and not "does not exist")', () => {
    const broken = checkConsistency('demo', new Set(['README.md']), {
      read: () => '---\nproduct: demo\npage: hub\nstatus: paused\napp: apps/demo\nupdated: 2026-11-23\n---\n',
      appTags: () => {
        throw new ProjectJsonError('apps/demo/package.json');
      },
    });
    expect(broken).toEqual([{ rule: 'package-json', file: 'apps/demo/package.json', message: 'apps/demo/package.json: not valid JSON – its Nx tags cannot be read; fix the file' }]);
    // Any other exception is not a hub problem: it propagates (the CLI turns it into exit 3).
    expect(() => checkConsistency('demo', new Set(['README.md']), { read: () => '---\nproduct: demo\napp: apps/demo\n---\n', appTags: () => { throw new Error('boom'); } })).toThrow('boom');
  });

  it('app: an app without the product tag, or a named app that does not exist', () => {
    const untagged = consistency({}, { tags: ['type:app'] });
    expect(untagged).toEqual([{ rule: 'app', file: 'apps/demo/package.json', message: expect.stringMatching(/apps\/demo\/package\.json: .* no "product:demo" Nx tag/) }]);
    const missing = consistency({ 'README.md': '---\nproduct: demo\npage: hub\nstatus: building\napp: apps/demo\nupdated: 2026-11-23\n---\n\n# Demo\n\n[other](../../../apps/ghost/README.md)\n\n## Product metrics\n' });
    expect(messages(missing)).toEqual(['docs/product-hub/demo/README.md: names apps/ghost, which does not exist']);
    expect(rules(missing)).toEqual(['app']);
  });

  it('adr-index: the index may link a record as ](NNNN-x.md) or ](./NNNN-x.md); another link form is not an index entry', () => {
    const index = (link: string) => ({ 'architecture-engineering/decisions/README.md': page('', `| [0001](${link}) | First |`) });
    expect(consistency(index('./0001-first.md'))).toEqual([]);
    expect(consistency(index('0001-first.md'))).toEqual([]);
    expect(rules(consistency(index('../decisions/0001-first.md')))).toEqual(['adr-index']);
  });

  it('lifecycle: marketing.md alone meets go-to-market at Operate; neither page fails it', () => {
    const live = { 'README.md': '---\nproduct: demo\npage: hub\nstatus: live\napp: apps/demo\nupdated: 2026-11-23\n---\n\n# Demo\n\n## Product metrics\n', 'business-product/brand.md': page() };
    expect(consistency(live)).toEqual([]);
    expect(consistency({ ...live, 'business-product/go-to-market.md': null, 'business-product/marketing.md': page() })).toEqual([]);
    const neither = consistency({ ...live, 'business-product/go-to-market.md': null });
    expect(messages(neither)).toEqual(['docs/product-hub/demo: Go-to-market and marketing is required at Operate – add business-product/go-to-market.md or business-product/marketing.md']);
  });

  it('topic: the same main section in two pages is reported; Changelog, Sources and History are not', () => {
    const shared = (h: string) => consistency({ 'business-product/go-to-market.md': page('', `## ${h}\n- x\n`), 'business-product/monetization.md': page('', `## ${h}\n- y\n`) });
    expect(shared('History')).toEqual([]);
    expect(shared('Sources')).toEqual([]);
    expect(shared('Changelog')).toEqual([]);
    expect(rules(shared('Pricing'))).toEqual(['topic']);
  });

  it('topic: a repeated main section is reported once, with both pages, next to a shared Changelog', () => {
    const problems = consistency({ 'business-product/go-to-market.md': page('', '## Releases\nAgain.\n\n## Changelog\n- x\n'), 'business-product/monetization.md': page('', '## Changelog\n- y\n') });
    expect(problems).toEqual([{ rule: 'topic', file: 'docs/product-hub/demo', message: 'docs/product-hub/demo: topic "releases" is a main section in business-product/go-to-market.md and business-product/roadmap.md – keep it in one page and link from the others' }]);
  });
});

describe('checkHub through a HubSource', () => {
  const pkg = (tags: string[]) => JSON.stringify({ name: 'x', nx: { tags } });
  const hubReadme = '---\nproduct: demo\npage: hub\nstatus: paused\nupdated: 2026-11-23\n---\n\n# Demo\n\n[app](../../../apps/has-hub/)\n';
  const base = {
    'apps/has-hub/package.json': pkg(['type:app', 'product:demo', 'role:primary']),
    'libs/demo-lib/package.json': pkg(['type:util', 'product:demo']),
    'apps/plain/package.json': pkg(['type:app']),
    'docs/product-hub/README.md': '# Hubs\n',
    'docs/product-hub/demo/README.md': hubReadme,
  };

  it('a valid repo has no problem', () => {
    expect(checkHub(memorySource(base))).toEqual({ products: 1, problems: [] });
  });

  it('tagged-without-hub, reserved-id and hub-folder; `only` scopes the check', () => {
    const src = memorySource({ ...base, 'apps/orphan/package.json': pkg(['type:app', 'product:ghost', 'role:primary']), 'docs/product-hub/framework/README.md': hubReadme, 'docs/product-hub/notes.txt': 'x' });
    expect(taggedProjects(src)).toEqual([
      { dir: 'apps/has-hub', product: 'demo' },
      { dir: 'apps/orphan', product: 'ghost' },
      { dir: 'libs/demo-lib', product: 'demo' },
    ]);
    const { problems } = checkHub(src, { newCommand: 'npm run product:new --' });
    expect(rules(problems)).toEqual(['reserved-id', 'hub-folder', 'tagged-without-hub']);
    expect(problems[2].message).toBe('apps/orphan/package.json: tagged product:ghost, but docs/product-hub/ghost/README.md does not exist – create it with npm run product:new -- ghost');
    expect(checkHub(src).problems[2].message).toMatch(/create it with canon new ghost$/);
    expect(checkHub(src, { only: 'demo' }).problems.map((p) => p.rule)).toEqual(['hub-folder']);
  });

  it('reserved-id: the message names no host (no Spark, no Spark Hall)', () => {
    const { problems } = checkHub(memorySource({ ...base, 'docs/product-hub/framework/README.md': hubReadme }));
    expect(messages(problems)).toEqual(['docs/product-hub/framework/: "framework" is a reserved name (the hub viewer uses it for its own page, not a product) – rename the product folder']);
    expect(problems[0].message).not.toMatch(/spark/i);
  });

  it('package-json: a project package.json that is not JSON is reported once, also when a hub README names it; tags of the others still count', () => {
    const named = hubReadme.replace('[app](../../../apps/has-hub/)', '[app](../../../apps/has-hub/) [web](../../../apps/broken/)');
    const src = memorySource({ ...base, 'docs/product-hub/demo/README.md': named, 'apps/broken/package.json': '{ "nx": { "tags": ["product:demo"] }, }', 'libs/bad/package.json': 'not json', 'apps/orphan/package.json': pkg(['product:ghost']) });
    expect(taggedProjects(src)).toEqual([
      { dir: 'apps/has-hub', product: 'demo' },
      { dir: 'apps/orphan', product: 'ghost' },
      { dir: 'libs/demo-lib', product: 'demo' },
    ]);
    const { problems } = checkHub(src);
    expect(problems.map((p) => [p.rule, p.file])).toEqual([
      ['package-json', 'apps/broken/package.json'],
      ['tagged-without-hub', 'apps/orphan/package.json'],
      ['package-json', 'libs/bad/package.json'],
    ]);
    // `only` still reports it: the hidden tags may be this product's.
    expect(checkHub(src, { only: 'demo' }).problems.map((p) => p.file)).toEqual(['apps/broken/package.json', 'libs/bad/package.json']);
    // JSON `null` parses: no tags, no problem.
    expect(checkHub(memorySource({ ...base, 'apps/nul/package.json': 'null' })).problems).toEqual([]);
  });

  it('a "_" folder (template) gets the structure rules only and is not counted', () => {
    const src = memorySource({ ...base, 'docs/product-hub/_template/README.md': '---\nproduct: <id>\npage: hub\nstatus: idea\nupdated: YYYY-MM-DD\n---\n' });
    expect(checkHub(src)).toEqual({ products: 1, problems: [] });
  });

  it('a link in _template/ to a page only the bundled template has: broken without `template`, fine with it', () => {
    const readme = '---\nproduct: <id>\npage: hub\nstatus: idea\nupdated: YYYY-MM-DD\n---\n\n[o](business-product/overview.md) [g](business-product/gone.md)\n';
    const src = memorySource({ ...base, 'docs/product-hub/_template/README.md': readme });
    const template = memorySource({ 'README.md': 'x', 'business-product/overview.md': 'x' });
    const links = (o: Parameters<typeof checkHub>[1]) => checkHub(src, o).problems.map((p) => p.message);
    expect(links({})).toEqual([
      'docs/product-hub/_template/README.md: broken link "business-product/overview.md"',
      'docs/product-hub/_template/README.md: broken link "business-product/gone.md"',
    ]);
    expect(links({ template })).toEqual(['docs/product-hub/_template/README.md: broken link "business-product/gone.md"']);
    // Only the template folder falls back: a product's own link to the same page is still broken.
    const product = memorySource({ ...base, 'docs/product-hub/demo/README.md': (base['docs/product-hub/demo/README.md'] as string) + '\n[o](business-product/brand.md)\n' });
    expect(checkHub(product, { template: memorySource({ 'business-product/brand.md': 'x' }) }).problems.map((p) => p.rule)).toContain('link');
  });

  it('every rule id is covered by a test above', () => {
    expect([...CHECK_RULES].sort()).toEqual(['adr-index', 'app', 'catalog', 'feature', 'front-matter', 'hub-folder', 'layout', 'lifecycle', 'link', 'package-json', 'reserved-id', 'status', 'tagged-without-hub', 'topic']);
  });
});

describe('link rule on disk: the ".." guard', () => {
  // A real file outside the repository root: without the guard, nodeSource would find it and the link would pass.
  const outer = realpathSync(mkdtempSync(join(tmpdir(), 'hub-escape-')));
  afterAll(() => rmSync(outer, { recursive: true, force: true }));
  const root = join(outer, 'repo');
  const hub = join(root, 'docs/product-hub/demo');
  mkdirSync(hub, { recursive: true });
  writeFileSync(join(outer, 'outside.md'), '# Outside the repo\n');
  writeFileSync(join(root, 'inside.md'), '# Inside the repo\n');
  const readme = (link: string) => `---\nproduct: demo\npage: hub\nstatus: paused\nupdated: 2026-11-23\n---\n\n# Demo\n\n[x](${link})\n`;

  it('a link that leaves the repository root is broken, even when the target exists on disk', () => {
    writeFileSync(join(hub, 'README.md'), readme('../../../../outside.md'));
    const { problems } = checkHub(nodeSource(root));
    expect(problems).toEqual([{ rule: 'link', file: 'docs/product-hub/demo/README.md', message: 'docs/product-hub/demo/README.md: broken link "../../../../outside.md"' }]);
  });

  it('the same depth inside the root passes (the guard is not a blanket refusal of ".." links)', () => {
    writeFileSync(join(hub, 'README.md'), readme('../../../inside.md'));
    expect(checkHub(nodeSource(root)).problems).toEqual([]);
  });
});

// The business plan's optional appendix `business-product/competition-landscape.md`: allowed by the layout, never
// required, and never read as the competitive index (a different page with its own fixed name).
describe('optional page: competition landscape', () => {
  it('a hub with the appendix passes the structure and consistency checks; misspelled siblings still fail', () => {
    expect(HUB_PATHS.competitionLandscape).toBe('business-product/competition-landscape.md');
    expect(allowedFile(HUB_PATHS.competitionLandscape)).toBe(true);
    expect(structure({ 'README.md': page(), [HUB_PATHS.competitionLandscape]: page().replace('page: overview', 'page: competition-landscape') })).toEqual([]);
    expect(consistency({ [HUB_PATHS.competitionLandscape]: page('', '# Competition landscape\n\nRivals.\n').replace('page: overview', 'page: competition-landscape') })).toEqual([]);
    for (const wrong of ['competition-landscapes.md', 'competitor-landscape.md', 'Competition-landscape.md', 'competition_landscape.md', 'competition-landscape.markdown']) {
      const problems = structure({ 'README.md': page(), [`business-product/${wrong}`]: page() });
      expect(problems, wrong).toEqual([{ rule: 'layout', file: `docs/product-hub/demo/business-product/${wrong}`, message: `docs/product-hub/demo/business-product/${wrong}: file not in the product hub layout` }]);
    }
    // Only directly under business-product/.
    expect(allowedFile('competition-landscape.md')).toBe(false);
    expect(allowedFile('architecture-engineering/competition-landscape.md')).toBe(false);
  });

  it('the reader never takes the appendix for the competitive index', () => {
    const D = 'docs/product-hub/demo';
    const readme = '---\nproduct: demo\npage: hub\nstatus: building\nupdated: 2026-11-23\n---\n\n# Demo\n';
    const source = memorySource({ [`${D}/README.md`]: readme, [`${D}/${HUB_PATHS.competitionLandscape}`]: page('', '# Landscape\n\nRivals.\n') });
    const src = readHubProduct(source, D);
    expect(src.competitive).toBeNull();
    const product = buildProduct('demo', src);
    expect(product.docs.competitive.html).toBeNull();
    expect(product.findings.filter((f) => f.file?.endsWith('competition-landscape.md'))).toEqual([]);
  });

  // Property: the layout check accepts exactly the paths allowedFile accepts – every LAYOUT.files entry passes, and
  // any other file name directly in business-product/ fails with one layout problem.
  it('property: every listed file passes; every unlisted business-product file fails', () => {
    for (const f of LAYOUT.files) {
      const body = f.endsWith('.json') ? '{}' : page();
      expect(rules(structure({ 'README.md': page(), [f]: body })).filter((r) => r === 'layout'), f).toEqual([]);
    }
    const name = fc.stringMatching(/^[a-zA-Z0-9_-]{1,24}\.(md|json|txt)$/);
    fc.assert(
      fc.property(name, (n) => {
        const p = `business-product/${n}`;
        fc.pre(!LAYOUT.files.has(p) && !LAYOUT.patterns.some((re) => re.test(p)));
        expect(rules(structure({ 'README.md': page(), [p]: n.endsWith('.md') ? page() : '{}' }))).toEqual(['layout']);
      }),
    );
  });
});
