// Unit tests of the Canon readers: the front matter parser, the sources, and every finding kind both
// ways – the valid hub has none, one breaking edit produces exactly that finding. All reads go through memorySource.
import { describe, expect, it } from 'vitest';
import {
  FEATURE_STATUSES,
  completeness,
  experimentRows,
  featureCounts,
  featureTableRows,
  hasResult,
  isIsoDate,
  leadingStatus,
  loadProductDocs,
  markdownTable,
  memorySource,
  overdueExperiments,
  parseDoc,
  parseYaml,
  productIds,
  readHubProduct,
  splitFrontMatter,
  splitSections,
  type Finding,
  type RulesHook,
} from '../src/index';

describe('front matter parser', () => {
  it('splits front matter from the body, with or without a BOM and CRLF', () => {
    expect(splitFrontMatter('---\na: 1\n---\n# T\n')).toEqual({ yaml: 'a: 1', body: '# T\n' });
    expect(splitFrontMatter('\uFEFF---\r\na: 1\r\n---\r\nbody')).toEqual({ yaml: 'a: 1', body: 'body' });
    expect(splitFrontMatter('# No front matter')).toEqual({ yaml: null, body: '# No front matter' });
  });

  it('parses the YAML subset', () => {
    const y = parseYaml(
      [
        'name: Demo',
        'n: 3',
        'f: -1.5',
        'ok: true',
        'no: false',
        'nil: null',
        'tilde: ~',
        'empty:',
        "q: 'it''s: fine'",
        'dq: "a \\"b\\" #c"',
        'flow: [1, "two", three]',
        'none: []',
        'list:',
        '  - a',
        '  - key: v',
        '    other: w',
        'map:',
        '  inner: x',
        'lit: |',
        '  line 1',
        '  line 2',
        'fold: >-',
        '  one',
        '  two',
        '# a comment',
      ].join('\n'),
    );
    expect(y).toEqual({
      name: 'Demo',
      n: 3,
      f: -1.5,
      ok: true,
      no: false,
      nil: null,
      tilde: null,
      empty: null,
      q: "it's: fine",
      dq: 'a "b" #c',
      flow: [1, 'two', 'three'],
      none: [],
      list: ['a', { key: 'v', other: 'w' }],
      map: { inner: 'x' },
      lit: 'line 1\nline 2\n',
      fold: 'one two',
    });
    expect(parseYaml('')).toEqual({});
  });

  it.each([
    ['plain value with ": "', 'a: b: c', /quote values containing/],
    ['plain value with " #"', 'a: b #c', /quote values containing/],
    ['duplicate key', 'a: 1\na: 2', /line 2: duplicate key "a"/],
    ['tab indentation', 'a:\n\tb: 1', /tabs are not allowed/],
    ['flow map', 'a: {b: 1}', /flow maps are not supported/],
    ['nested flow list', 'a: [[1]]', /nested flow collections/],
    ['unterminated list', 'a: [1, 2', /unterminated flow list/],
    ['unterminated string', 'a: "x', /unterminated or invalid double-quoted/],
    ['anchor', 'a: &x 1', /cannot start with "&"/],
    ['not key: value', 'just text', /expected "key: value"/],
    ['indented start', '  a: 1', /must start at column 0/],
    ['unexpected indentation', 'a: 1\n   b: 2', /unexpected indentation/],
  ])('rejects %s', (_name, src, re) => {
    expect(() => parseYaml(src)).toThrow(re);
  });

  it('parseDoc returns the error instead of throwing, with empty meta', () => {
    expect(parseDoc('---\nstatus: built\n---\n# T')).toEqual({ meta: { status: 'built' }, body: '# T', error: null });
    expect(parseDoc('---\nname: a: b\n---\n# T')).toMatchObject({ meta: {}, body: '# T', error: expect.stringMatching(/line 1: quote values/) });
    expect(parseDoc('# T')).toEqual({ meta: {}, body: '# T', error: null });
  });

  it('splits ## sections and ignores headings inside code fences', () => {
    expect(splitSections('intro\n## One\na\n```\n## not\n```\n## Two ##\nb\n')).toEqual([
      { title: 'One', body: 'a\n```\n## not\n```' },
      { title: 'Two', body: 'b' },
    ]);
  });
});

describe('tables and statuses', () => {
  it('reads Markdown tables and feature table rows', () => {
    expect(markdownTable('| A b | C |\n|---|---|\n| 1 | [x](y.md) |')).toEqual([{ 'a-b': '1', c: '[x](y.md)' }]);
    expect(markdownTable('| no separator |\n| 1 |')).toEqual([]);
    expect(featureTableRows('| Scan | built | [scan](scan.md), [x](./other.md#a) |\n| Ideas | – | [c](candidates.md) |', { sameFolder: true })).toEqual([{ label: 'Scan', status: 'built', docs: ['scan', 'other'] }]);
    expect(featureTableRows('| Scan | built | [scan](features/scan.md) |')).toEqual([{ label: 'Scan', status: 'built', docs: ['scan'] }]);
  });

  it('takes the leading enum word of a status only', () => {
    for (const s of FEATURE_STATUSES) expect(leadingStatus(`${s} (detail)`)).toBe(s);
    expect(leadingStatus('public beta')).toBeNull();
    expect(leadingStatus('')).toBeNull();
  });

  it('counts features in file units, removed apart', () => {
    expect(featureCounts([{ status: 'built' }, { status: 'later' }, { status: 'specified' }, { status: 'removed' }, { status: 'odd' }])).toEqual({ total: 4, built: 1, partial: 0, building: 0, planned: 2, removed: 1, unknown: 1 });
  });
});

// A valid hub at the Development stage with every page it can have, in memory.
const D = 'docs/product-hub/demo';
const page = (name: string, body = 'Body.', status = 'current') => `---\nproduct: demo\npage: ${name}\nstatus: ${status}\nupdated: 2026-11-20\n---\n\n# Demo – ${name}\n\n${body}\n`;
const feature = (slug: string, status: string, extra = '') => `---\nfeature: ${slug}\nproduct: demo\npage: feature\nstatus: ${status}\nissues: [1]\nupdated: 2026-11-20\n${extra}---\n\n# ${slug}\n\n## What it does\n${slug} does a thing.\n`;
const adr = (n: number, status: string, links = '') => `---\nadr: ${n}\ntitle: Decision ${n}\nstatus: ${status}\ndate: 2026-11-20\n${links}---\n\n# ADR-000${n}\n\nBody.\n`;
const README = `---\nproduct: demo\npage: hub\nname: Demo\nstatus: building\nteam: phoenix\nupdated: 2026-11-20\n---\n\n# Demo\n\n> Demo checks things.\n\n## Product metrics\n\n| Metric | Target |\n|---|---|\n| Users | 10 |\n`;

// Experiments: one read with a result, one due later than TODAY, one without a date yet – none is overdue.
const TODAY = '2026-11-26';
const EXPERIMENTS = '## Experiments\n\n| ID | Hypothesis | Metric | Go | Kill | Owner | Revisit by | Result |\n|---|---|---|---|---|---|---|---|\n| E1 | Shops import | share | ≥ 40 % | < 15 % | Hans | 2026-11-01 | go – 46 % |\n| E2 | Export saves time | minutes | ≥ 30 % | < 10 % | Ada | 2026-12-31 | |\n| E3 | Referrals | count | ≥ 3 | 0 | (to set) | (to set) | |';

function validHub(): Record<string, string> {
  return {
    [`${D}/README.md`]: README,
    [`${D}/business-product/overview.md`]: page('overview'),
    [`${D}/business-product/value-proposition.md`]: page('value-proposition'),
    [`${D}/business-product/go-to-market.md`]: page('go-to-market'),
    [`${D}/business-product/monetization.md`]: page('monetization'),
    [`${D}/business-product/brand.md`]: page('brand'),
    [`${D}/business-product/experiments.md`]: page('experiments', EXPERIMENTS),
    [`${D}/business-product/roadmap.md`]: page('roadmap', '## Launch tasks\n\n| Task | Needed for | Status | Owner | Issue |\n|---|---|---|---|---|\n| Domain | launch | open | yes | #1 |\n| Copy | launch | done | no | #2 |'),
    [`${D}/business-product/features/README.md`]: page('feature-catalog', '| Feature | Status | Doc |\n|---|---|---|\n| Scan | built | [scan](scan.md) |\n| Later | later (Q2) | [later](later.md) |'),
    [`${D}/business-product/features/scan.md`]: feature('scan', 'built'),
    [`${D}/business-product/features/later.md`]: feature('later', 'later'),
    [`${D}/business-product/features/candidates.md`]: page('candidates', '| Candidate | What it would add | Gate | Related feature | Source |\n|---|---|---|---|---|\n| Export | CSV | demand | [scan](scan.md) | user |'),
    [`${D}/architecture-engineering/overview.md`]: page('architecture'),
    [`${D}/architecture-engineering/components-and-data-flows.md`]: page('components'),
    [`${D}/architecture-engineering/technology-stack.md`]: page('stack'),
    [`${D}/architecture-engineering/decisions/README.md`]: page('decisions'),
    [`${D}/architecture-engineering/decisions/0001-first.md`]: adr(1, 'superseded', 'superseded-by: [2]\n'),
    [`${D}/architecture-engineering/decisions/0002-second.md`]: adr(2, 'accepted', 'supersedes: [1]\n'),
    [`${D}/architecture-engineering/technical/testing.md`]: page('testing'),
    [`${D}/ai-development-workflow/agent-instructions.md`]: page('agent-instructions'),
    [`${D}/ai-development-workflow/documentation-rules.md`]: page('documentation-rules'),
    [`${D}/ai-development-workflow/definition-of-done.md`]: page('definition-of-done'),
    [`${D}/ai-development-workflow/documentation-skills.md`]: page('documentation-skills'),
  };
}
const PLANS = [{ id: 'demo', file: `${D}/business-product/business-plan.md`, sections: [] }];
const load = (files: Record<string, string>, opts: { rules?: RulesHook; ruleFiles?: Record<string, string>; today?: string } = {}) => {
  const { products, errors } = loadProductDocs(memorySource(files), { plans: PLANS, today: TODAY, ...opts });
  expect(errors).toEqual([]);
  return products[0];
};
const edit = (path: string, fn: (t: string) => string) => (files: Record<string, string>) => ({ ...files, [`${D}/${path}`]: fn(files[`${D}/${path}`]) });
const add = (path: string, text: string) => (files: Record<string, string>) => ({ ...files, [`${D}/${path}`]: text });
const drop = (path: string) => (files: Record<string, string>) => {
  const out = { ...files };
  delete out[`${D}/${path}`];
  return out;
};
const front = (key: string, value: string) => (t: string) => t.replace(new RegExp(`^${key}:.*$`, 'm'), `${key}: ${value}`);

describe('a valid hub', () => {
  it('has no findings and is complete', () => {
    const p = load(validHub());
    expect(p.findings).toEqual([]);
    expect(p.stage).toBe('development');
    expect(completeness(p.health)).toBe(1);
    expect(p.features.map((f) => [f.slug, f.status])).toEqual([
      ['later', 'later'],
      ['scan', 'built'],
    ]);
    expect(p.adrs.map((a) => [a.number, a.status])).toEqual([
      [1, 'superseded'],
      [2, 'accepted'],
    ]);
    expect(p.candidates).toHaveLength(1);
    expect(p.launchTasks.map((t) => t.status)).toEqual(['open', 'done']);
    expect(p.pitch).toBe('Demo checks things.');
  });
});

// Each finding kind: one edit of the valid hub → exactly the listed findings (kind, area, text pattern).
const CASES: [string, (f: Record<string, string>) => Record<string, string>, [Finding['kind'], string, RegExp][]][] = [
  ['README front matter does not parse', edit('README.md', front('name', 'a: b')), [['inconsistent', 'overview', /README front matter does not parse/]]],
  ['README names another product', edit('README.md', front('product', 'other')), [['inconsistent', 'overview', /README says product “other” in folder “demo”/]]],
  ['README status outside the enum', edit('README.md', front('status', 'shipping')), [['inconsistent', 'overview', /README status “shipping” is not one of/]]],
  ['catalog row links a missing file', edit('business-product/features/README.md', (t) => `${t}| Ghost | built | [ghost](ghost.md) |\n`), [['missing', 'catalog', /links features\/ghost\.md, which does not exist/]]],
  ['catalog and feature page disagree', edit('business-product/features/README.md', (t) => t.replace('| Scan | built |', '| Scan | partial |')), [['inconsistent', 'catalog', /“scan” is built in its file but partial in the feature table/]]],
  ['duplicate catalog rows', edit('business-product/features/README.md', (t) => `${t}| Scan again | built | [scan](scan.md) |\n`), [['inconsistent', 'catalog', /features\/scan\.md is the first link of 2 rows/]]],
  ['feature status outside the enum', edit('business-product/features/scan.md', front('status', 'shipped')), [['inconsistent', 'catalog', /“scan” has status “shipped”; use one of/]]],
  ['feature names another product', edit('business-product/features/scan.md', front('product', 'other')), [['inconsistent', 'catalog', /“scan” says product “other”, not “demo”/]]],
  ['feature without a catalog row', add('business-product/features/orphan.md', feature('orphan', 'built')), [['missing', 'catalog', /“orphan” has a feature file but no row/]]],
  ['feature front matter does not parse', edit('business-product/features/scan.md', (t) => t.replace('issues: [1]', 'issues: [1')), [
    ['inconsistent', 'catalog', /“scan” has status “none”/],
    ['inconsistent', 'catalog', /Front matter does not parse: line \d+: unterminated flow list/],
  ]],
  ['ADR status outside the enum', edit('architecture-engineering/decisions/0002-second.md', front('status', 'maybe')), [['inconsistent', 'adr', /ADR-0002 has status “maybe”/]]],
  ['superseded ADR without successor', edit('architecture-engineering/decisions/0001-first.md', (t) => t.replace('superseded-by: [2]\n', '')), [['inconsistent', 'adr', /ADR-0001 is superseded but names no successor/], ['inconsistent', 'adr', /ADR-0002 supersedes ADR-0001, but ADR-0001 does not name it as successor/]]],
  ['successor that does not exist', edit('architecture-engineering/decisions/0001-first.md', (t) => t.replace('superseded-by: [2]', 'superseded-by: [2, 7]')), [['missing', 'adr', /ADR-0001 is superseded by ADR-7, which does not exist/]]],
  ['successor that does not list it', edit('architecture-engineering/decisions/0002-second.md', (t) => t.replace('supersedes: [1]\n', '')), [['inconsistent', 'adr', /ADR-0001 names ADR-0002 as successor, but ADR-0002 does not list it/]]],
  ['supersedes a record that does not exist', edit('architecture-engineering/decisions/0002-second.md', (t) => t.replace('supersedes: [1]', 'supersedes: [1, 9]')), [['missing', 'adr', /ADR-0002 supersedes ADR-9, which does not exist/]]],
  ['README names a plan that does not exist', edit('README.md', (t) => t.replace('team: phoenix', 'team: phoenix\nplan: nope')), [['missing', 'business-plan', /README names business plan “nope”, which was not found/]]],
  ['candidate links a missing feature', edit('business-product/features/candidates.md', (t) => t.replace('[scan](scan.md)', '[ghost](ghost.md)')), [['missing', 'catalog', /Candidate “Export” links features\/ghost\.md, which does not exist/]]],
  ['launch task with an unknown status', edit('business-product/roadmap.md', (t) => t.replace('| open |', '| blocked |')), [['inconsistent', 'roadmap', /Launch task “Domain” has status “blocked”/]]],
  ['AI workflow partly missing', drop('ai-development-workflow/definition-of-done.md'), [['missing', 'ai-workflow', /AI & development workflow is incomplete: definition-of-done\.md missing/]]],
  ['page still a draft', edit('business-product/brand.md', front('status', 'draft')), [['stale', 'brand', /Brand identity is still a draft/]]],
  ['technical page still a draft', edit('architecture-engineering/technical/testing.md', front('status', 'draft')), [['stale', 'technical', /Technical · testing\.md is still a draft/]]],
  // calc-qa review of the draft rule for release plans and AI workflow pages was not exercised by any test.
  ['release plan still a draft', add('business-product/releases/r1.md', page('release', 'Body.', 'draft')), [['stale', 'roadmap', /Release plan · r1\.md is still a draft/]]],
  ['AI workflow page still a draft', edit('ai-development-workflow/definition-of-done.md', front('status', 'draft')), [['stale', 'ai-workflow', /AI & development workflow · definition-of-done is still a draft/]]],
  // an experiment past its revisit-by date with no result; the page itself still a draft.
  ['experiment past its revisit-by date with no result', edit('business-product/experiments.md', (t) => t.replace('| 2026-12-31 |', '| 2026-11-25 |')), [['stale', 'experiments', /^Experiment “E2” is past its revisit-by date \(2026-11-25\) with no result – record the result or set a new date\.$/]]],
  ['experiments page still a draft', edit('business-product/experiments.md', front('status', 'draft')), [['stale', 'experiments', /Experiments is still a draft/]]],
  // the bootstrap skill marks feature pages and the hub README with `draft: true` (their status is an enum).
  ['feature page still a draft', edit('business-product/features/scan.md', (t) => t.replace(/^status: built$/m, 'status: built\ndraft: true')), [['stale', 'catalog', /Feature “scan” is still a draft \(draft: true\)/]]],
  ['README still a draft', edit('README.md', (t) => t.replace('team: phoenix', 'team: phoenix\ndraft: true')), [['stale', 'overview', /Product README is still a draft \(draft: true\)/]]],
  ['feature newer than the README', edit('business-product/features/scan.md', front('updated', '2026-11-25')), [['stale', 'overview', /A feature file was updated on 2026-11-25, after the product README \(2026-11-20\)/]]],
];

describe('every finding kind, both ways', () => {
  it.each(CASES)('%s', (_name, change, expected) => {
    const p = load(change(validHub()));
    expect(p.findings.map((f) => [f.kind, f.area])).toEqual(expected.map(([k, a]) => [k, a]));
    expected.forEach(([, , re], i) => expect(p.findings[i].text).toMatch(re));
    // A finding blocks its area: completeness drops below 1 (the valid hub is 1); an unreadable or unknown README
    // status leaves the product not assessed (null).
    expect(completeness(p.health) ?? 0).toBeLessThan(1);
  });

  it('rule pipeline errors from the host hook become findings, and only when the hook is given', () => {
    const files = add('architecture-engineering/technical/rules/notes.json', '{')(validHub());
    const ruleFiles = { notes: 'architecture-engineering/technical/rules/notes.json' };
    const rules: RulesHook = (texts, dir) => ({ errors: texts.notes === '{' ? ['notes.json: bad JSON'] : [], files: { notes: `${dir}/${ruleFiles.notes}` } });
    const p = load(files, { rules, ruleFiles });
    expect(p.findings).toEqual([{ kind: 'inconsistent', area: 'technical', text: 'Rule grades: notes.json: bad JSON.', file: `${D}/${ruleFiles.notes}` }]);
    expect(load(files).findings).toEqual([]);
    expect(load(validHub(), { rules, ruleFiles }).findings).toEqual([]);
  });

  // calc-qa review of the status comparison applies only to one-link rows (r.docs.length === 1); a row that
  // links several feature files describes a group, so its status is not compared with the first file's status.
  it('a catalog row linking several feature files is not compared on status', () => {
    const multi = edit('business-product/features/README.md', (t) => t.replace('| Scan | built | [scan](scan.md) |', '| Scan | partial | [scan](scan.md), [later](later.md) |'));
    expect(load(multi(validHub())).findings).toEqual([]);
    const single = edit('business-product/features/README.md', (t) => t.replace('| Scan | built | [scan](scan.md) |', '| Scan | partial | [scan](scan.md) |'));
    expect(load(single(validHub())).findings.map((f) => f.text)).toEqual(['“scan” is built in its file but partial in the feature table.']);
  });

  it('a paused product is not assessed', () => {
    const p = load(edit('README.md', front('status', 'paused'))(validHub()));
    expect(p.stage).toBeNull();
    expect(completeness(p.health)).toBeNull();
  });
});

describe('sources', () => {
  it('reads a hub only through the given source', () => {
    const src = memorySource({ ...validHub(), 'docs/product-hub/_template/README.md': README, 'docs/product-hub/framework/README.md': README, 'docs/product-hub/no-readme/x.md': 'x' });
    expect(productIds(src)).toEqual(['demo']);
    const s = readHubProduct(src, D);
    expect(s.features?.map((f) => f.file)).toEqual([`${D}/business-product/features/later.md`, `${D}/business-product/features/scan.md`]);
    expect(s.adrs?.map((f) => f.file.split('/').pop())).toEqual(['0001-first.md', '0002-second.md']);
    expect(s.marketing).toBeNull();
    expect(s.ruleTexts).toBeUndefined();
    expect(readHubProduct(src, D, { ruleFiles: { notes: 'x.json' } }).ruleTexts).toEqual({ notes: null });
  });

  it('memorySource answers reads, folders and lists', () => {
    const src = memorySource({ 'a/b/c.md': 'C', 'a/d.md': 'D' });
    expect(src.read('a/b/c.md')).toBe('C');
    expect(src.read('a/b')).toBeNull();
    expect(src.isDir('a/b')).toBe(true);
    expect(src.isDir('a/d.md')).toBe(false);
    expect(src.list('a').sort()).toEqual(['b', 'd.md']);
    expect(src.list('zzz')).toEqual([]);
  });

  it('a hub folder whose README vanished is reported as an error, not thrown', () => {
    const files = validHub();
    const src = memorySource(files);
    const flaky = { ...src, read: (p: string) => (p === `${D}/README.md` && flaky.seen++ > 0 ? null : src.read(p)), seen: 0 };
    const { products, errors } = loadProductDocs(flaky);
    expect(products).toEqual([]);
    expect(errors).toEqual([`demo: ${D}/README.md does not exist`]);
  });
});

describe('experiments', () => {
  it('reads the experiments table: plain cells, valid dates only, rows without ID and hypothesis skipped', () => {
    const rows = experimentRows(parseDoc(page('experiments', `${EXPERIMENTS}\n|  |  | x | | | | 2026-01-01 | |`)).body);
    expect(rows.map((r) => [r.id, r.owner, r.revisitBy, r.revisitRaw, r.result])).toEqual([
      ['E1', 'Hans', '2026-11-01', '2026-11-01', 'go – 46 %'],
      ['E2', 'Ada', '2026-12-31', '2026-12-31', ''],
      ['E3', '(to set)', null, '(to set)', ''],
    ]);
    // Only the first table under "## Experiments"; a page without that heading falls back to its first table.
    expect(experimentRows('## Experiments\n\n| ID | Revisit by |\n|---|---|\n| A | 2020-01-01 |\n\nText.\n\n| ID | Revisit by |\n|---|---|\n| B | 2020-01-01 |').map((r) => r.id)).toEqual(['A']);
    expect(experimentRows('| ID | Hypothesis |\n|---|---|\n| Z | z |').map((r) => r.id)).toEqual(['Z']);
    expect(experimentRows(null)).toEqual([]);
  });

  it('isIsoDate accepts real calendar dates only', () => {
    expect(['2026-11-26', '2028-02-29'].map(isIsoDate)).toEqual([true, true]);
    expect(['2026-02-30', '2027-02-29', '2026-1-01', '26-11-2026', '(to set)', '', null].map(isIsoDate)).toEqual([false, false, false, false, false, false, false]);
  });

  it('hasResult: an empty cell or only a dash is no result', () => {
    expect(['', ' ', '-', '–', '—', '--'].map((result) => hasResult({ result }))).toEqual([false, false, false, false, false, false]);
    expect(['go', 'kill – 0 %', '0'].map((result) => hasResult({ result }))).toEqual([true, true, true]);
  });

  it('overdue = revisit-by strictly before today and no result; the day itself is not overdue', () => {
    const rows = [
      { id: 'a', revisitBy: '2026-11-25', result: '' },
      { id: 'b', revisitBy: '2026-11-26', result: '' },
      { id: 'c', revisitBy: '2026-11-27', result: '' },
      { id: 'd', revisitBy: '2026-11-01', result: 'go' },
      { id: 'e', revisitBy: null, result: '' },
    ];
    expect(overdueExperiments(rows, '2026-11-26').map((r) => r.id)).toEqual(['a']);
    expect(overdueExperiments(rows, '2026-11-27').map((r) => r.id)).toEqual(['a', 'b']);
    expect(() => overdueExperiments(rows, '26.11.2026')).toThrow(/today must be a date YYYY-MM-DD/);
  });

  it('the parser only gives a date to an exact YYYY-MM-DD cell, under either header spelling', () => {
    const t = (head: string, cell: string) => experimentRows(`| ID | ${head} | Result |\n|---|---|---|\n| A | ${cell} | |`);
    expect(t('Revisit-by', '2020-01-05')[0].revisitBy).toBe('2020-01-05');
    expect(t('Revisit by', '2020-01-05')[0].revisitBy).toBe('2020-01-05');
    for (const bad of ['2020-1-5', '05.01.2020', '2020-02-30', '(to set)']) {
      const rows = t('Revisit-by', bad);
      expect(rows[0].revisitBy, bad).toBeNull();
      expect(overdueExperiments(rows, '2026-11-26'), bad).toEqual([]);
    }
  });

  it('no today, no overdue finding: the core has no clock', () => {
    const files = edit('business-product/experiments.md', (t) => t.replace('| 2026-12-31 |', '| 2000-01-01 |'))(validHub());
    expect(load(files, { today: undefined }).findings).toEqual([]);
    expect(load(files).findings.map((f) => f.area)).toEqual(['experiments']);
  });

  it('the page is a conditional row: it counts once it exists, and an overdue row blocks it', () => {
    const valid = load(validHub());
    expect(valid.health.rows.find((r) => r.id === 'experiments')).toMatchObject({ level: 'C', state: 'ok', applicable: true });
    expect(valid.experiments.map((e) => e.id)).toEqual(['E1', 'E2', 'E3']);
    const none = load(drop('business-product/experiments.md')(validHub()));
    expect(none.health.rows.find((r) => r.id === 'experiments')).toMatchObject({ state: 'not-triggered', applicable: false });
    expect([none.health.done, none.health.total]).toEqual([valid.health.done - 1, valid.health.total - 1]);
    expect(none.findings).toEqual([]);
    const overdue = load(edit('business-product/experiments.md', (t) => t.replace('| 2026-12-31 |', '| 2026-11-01 |'))(validHub()));
    expect(overdue.health.rows.find((r) => r.id === 'experiments')).toMatchObject({ state: 'review', findings: 1 });
    expect(overdue.findings[0].file).toBe(`${D}/business-product/experiments.md`);
  });
});
