import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { classify, citationTotals, refExists, scoreDraft, scorePage, splitSentences, splitUnits, type CitationContext } from '../src/index';

const FILES = new Set(['apps/web/src/pages/[...slug].astro', 'apps/web/src/main.ts', 'apps/web/tests/cart.test.ts', 'apps/web', 'README.md', 'git-log.txt']);
const COMMITS = ['1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b'];
const ctx: CitationContext = {
  pathExists: (p) => FILES.has(p),
  commitExists: (sha) => COMMITS.some((c) => c.startsWith(sha)),
};
const verdicts = (md: string) => scorePage('x.md', md, ctx).map((r) => r.verdict);

describe('splitUnits', () => {
  it('skips front matter, headings, code fences, comments, rules and table headers', () => {
    const md = ['---', 'product: a', 'status: draft', '---', '', '# Title', '', '```', 'const x = 1. Not prose.', '```', '<!-- hidden. -->', '---', '| A | B |', '|---|---|', '| one | two |', '', 'Body text here.'].join('\n');
    const units = splitUnits(md);
    expect(units.map((u) => [u.block, u.text])).toEqual([
      ['table', '| one | two |'],
      ['paragraph', 'Body text here.'],
    ]);
  });
  it('keeps list items apart, joins wrapped lines and records the section', () => {
    const units = splitUnits('## Flow\n\n- first item\n  wraps here\n- second item\n\n> quoted\n> pitch');
    expect(units.map((u) => [u.block, u.text, u.section])).toEqual([
      ['list', 'first item wraps here', 'Flow'],
      ['list', 'second item', 'Flow'],
      ['quote', 'quoted pitch', 'Flow'],
    ]);
  });
});

describe('splitSentences', () => {
  it('splits on sentence ends but not on abbreviations, decimals, file names or inside markers', () => {
    expect(splitSentences('It reads apps/web/src/main.ts first (source: apps/web/src/main.ts). Prices are e.g. USD 1.50 each. Done!')).toEqual([
      'It reads apps/web/src/main.ts first (source: apps/web/src/main.ts).',
      'Prices are e.g. USD 1.50 each.',
      'Done!',
    ]);
  });
  it('legal references do not end a sentence', () => {
    expect(splitSentences('The engine applies one fifth of the federal art. 38 rate (source: a.ts). Next one.')).toEqual(['The engine applies one fifth of the federal art. 38 rate (source: a.ts).', 'Next one.']);
  });
  it('attaches a marker-only fragment to the sentence before it', () => {
    expect(splitSentences('The app has a cart. (source: apps/web/src/main.ts)')).toEqual(['The app has a cart. (source: apps/web/src/main.ts)']);
  });
});

describe('refExists', () => {
  it('accepts existing paths with line suffixes, folders and commits', () => {
    for (const r of ['apps/web/src/pages/[...slug].astro:1-26', 'apps/web/src/main.ts:11-18,24', 'apps/web/src/main.ts#L3,L9', 'apps/web/src/main.ts', './apps/web/src/main.ts', '/apps/web/src/main.ts:12', 'apps/web/src/main.ts:12-30', 'apps/web/src/main.ts#L4', 'apps/web/', 'commit 1a2b3c4', '1a2b3c4d5e']) expect(refExists(r, ctx), r).toBe(true);
  });
  it('rejects fabricated paths, unknown commits, parent paths and prose', () => {
    for (const r of ['apps/web/src/missing.ts', 'apps/web/src/pages/[...slug].ts', 'apps/web/../README.md', 'commit deadbee', 'deadbeef00', '../README.md', 'the README', '']) expect(refExists(r, ctx), r).toBe(false);
  });
});

describe('classify – factual sentences', () => {
  const unit = { block: 'paragraph' as const, section: 'What it is' };
  it('sourced: an existing path or commit', () => {
    expect(classify('The cart sums line items (source: apps/web/src/main.ts).', unit, ctx).verdict).toBe('sourced');
    expect(classify('The cart was added in one commit (source: commit 1a2b3c4).', unit, ctx).verdict).toBe('sourced');
    expect(classify('Two sources back this claim (sources: apps/web/src/main.ts; apps/web/tests/cart.test.ts).', unit, ctx).verdict).toBe('sourced');
  });
  it('hypothesis: marked with or without a question', () => {
    expect(classify('Buyers are small shops (hypothesis).', unit, ctx).verdict).toBe('hypothesis');
    expect(classify('Buyers are small shops (hypothesis: who buys this?).', unit, ctx).verdict).toBe('hypothesis');
  });
  it('a second range written ":N" after a comma stays with its path', () => {
    const r = classify('The import writes the year folder (source: apps/web/src/main.ts:3, :11-14; README.md).', { block: 'paragraph', section: 'Flow' }, ctx);
    expect(r).toEqual({ verdict: 'sourced', refs: ['apps/web/src/main.ts:3,11-14', 'README.md'], badRefs: [] });
    // A lone ":N" with no path before it is still a bad reference.
    expect(classify('It is fast (source: :12).', { block: 'paragraph', section: 'Flow' }, ctx).verdict).toBe('bad-citation');
  });
  it('a line list after a comma stays with its path', () => {
    const r = classify('Results are printed as money (source: apps/web/src/main.ts:11-18,24; README.md).', { block: 'paragraph', section: 'Flow' }, ctx);
    expect(r).toEqual({ verdict: 'sourced', refs: ['apps/web/src/main.ts:11-18,24', 'README.md'], badRefs: [] });
  });
  it('bad-citation: one fabricated reference fails the sentence', () => {
    const r = classify('The cart sums items (source: apps/web/src/main.ts; apps/web/src/cart.ts).', unit, ctx);
    expect(r.verdict).toBe('bad-citation');
    expect(r.badRefs).toEqual(['apps/web/src/cart.ts']);
  });
  it('unsourced: a plain claim, a Markdown link alone or a "source" word without the marker', () => {
    expect(classify('The cart sums line items for the user.', unit, ctx).verdict).toBe('unsourced');
    expect(classify('The cart sums items, see [main](../../apps/web/src/main.ts) for details.', unit, ctx).verdict).toBe('unsourced');
    expect(classify('Source is apps/web/src/main.ts for the cart totals.', unit, ctx).verdict).toBe('unsourced');
  });
});

describe('classify – non-factual units', () => {
  it('template placeholders, confirm lists, index rows, navigation, questions and lead-ins', () => {
    expect(classify('_What goes here:_ the customer and their market.', { block: 'paragraph', section: 'Customer' }, ctx).verdict).toBe('template');
    expect(classify('The price is USD 19.', { block: 'list', section: 'Confirm these' }, ctx).verdict).toBe('meta');
    expect(classify('Not read: the design system library.', { block: 'list', section: 'Not read' }, ctx).verdict).toBe('meta');
    expect(classify('| Cart checkout | built | [cart](cart.md) |', { block: 'table', section: 'Features' }, ctx).verdict).toBe('index');
    expect(classify('Hub index: [README](../README.md).', { block: 'paragraph', section: '' }, ctx).verdict).toBe('navigation');
    expect(classify('See the [feature catalog](features/README.md) for each capability.', { block: 'paragraph', section: '' }, ctx).verdict).toBe('navigation');
    expect(classify('See [components and data flows](components-and-data-flows.md) for the parts and how data moves.', { block: 'paragraph', section: '' }, ctx).verdict).toBe('navigation');
    expect(classify('See [stack](technology-stack.md): the app is built with Astro, Preact and Tailwind on a CDN.', { block: 'paragraph', section: '' }, ctx).verdict).toBe('unsourced');
    expect(classify('See [stack](technology-stack.md), which uses Astro on a CDN.', { block: 'paragraph', section: '' }, ctx).verdict).toBe('unsourced');
    expect(classify('Features are listed in the [feature catalog](features/README.md).', { block: 'paragraph', section: '' }, ctx).verdict).toBe('unsourced');
    expect(classify('- 2026-11-26 – Drafted from the repository.', { block: 'list', section: 'Changelog' }, ctx).verdict).toBe('meta');
    expect(classify('Who pays for the hosting?', { block: 'paragraph', section: 'Money' }, ctx).verdict).toBe('question');
    expect(classify('The command has three steps:', { block: 'paragraph', section: 'Flow' }, ctx).verdict).toBe('lead-in');
  });
  it('a table row without a hub link is factual and needs a marker in the row', () => {
    expect(classify('| Astro | static site generator | apps/web/astro.config.mjs |', { block: 'table', section: 'Stack' }, ctx).verdict).toBe('unsourced');
    expect(classify('| Astro | static site generator | (source: apps/web) |', { block: 'table', section: 'Stack' }, ctx).verdict).toBe('sourced');
  });
});

describe('scoreDraft totals', () => {
  it('counts every verdict and the unsourced factual number', () => {
    const page = [
      '---',
      'product: a',
      'page: overview',
      'status: draft',
      'updated: 2026-11-26',
      '---',
      '# A – overview',
      '',
      'Hub index: [README](../README.md).',
      '',
      '## What it is',
      '',
      'A shop cart (source: apps/web/src/main.ts). It ships tests (source: apps/web/tests/cart.test.ts). Buyers are shops (hypothesis: confirm the buyer).',
      'It is fast. It uses a made-up file (source: apps/web/src/nope.ts).',
      '',
      '## Confirm these',
      '',
      '- The buyer.',
    ].join('\n');
    const { totals } = scoreDraft({ 'business-product/overview.md': page, 'model.json': '{}' }, ctx);
    expect(totals).toEqual({ sentences: 7, factual: 5, sourced: 2, hypothesis: 1, unsourced: 1, badCitation: 1, nonFactual: 2, unsourcedFactual: 2 });
  });
  it('a fully marked draft has 0 unsourced factual sentences', () => {
    expect(citationTotals(scorePage('a.md', 'One fact (source: README.md). Another guess (hypothesis).', ctx)).unsourcedFactual).toBe(0);
  });
});

describe('properties', () => {
  const word = fc.constantFrom('cart', 'sums', 'items', 'shop', 'checks', 'totals', 'prices', 'orders', 'users', 'reads');
  const sentence = fc.array(word, { minLength: 4, maxLength: 9 }).map((w) => `${w[0][0].toUpperCase()}${w.join(' ').slice(1)}`);
  it('any factual sentence becomes sourced with a valid marker and stays unsourced-or-bad with a fabricated one', () => {
    fc.assert(
      fc.property(sentence, fc.constantFrom(...FILES), fc.stringMatching(/^[a-z]{3,8}\/[a-z]{3,8}\.ts$/), (s, good, bad) => {
        const unit = { block: 'paragraph' as const, section: 'Body' };
        expect(classify(`${s}.`, unit, ctx).verdict).toBe('unsourced');
        expect(classify(`${s} (source: ${good}).`, unit, ctx).verdict).toBe('sourced');
        expect(classify(`${s} (source: ${bad}).`, unit, ctx).verdict).toBe('bad-citation');
      }),
    );
  });
  it('appending one unmarked factual sentence to a fully sourced page adds exactly one unsourced sentence', () => {
    fc.assert(
      fc.property(fc.array(sentence, { minLength: 1, maxLength: 5 }), sentence, (ss, extra) => {
        const md = ss.map((s) => `${s} (source: README.md).`).join(' ');
        const before = citationTotals(scorePage('a.md', md, ctx)).unsourcedFactual;
        const after = citationTotals(scorePage('a.md', `${md} ${extra}.`, ctx)).unsourcedFactual;
        expect(before).toBe(0);
        expect(after).toBe(1);
      }),
    );
  });
});

it('verdicts helper covers a mixed page', () => {
  expect(verdicts('The first fact here (source: README.md). The second fact here. Two words.')).toEqual(['sourced', 'unsourced', 'navigation']);
});
