import { describe, expect, it } from 'vitest';
import { applyReview, featureWords, matchFeatures, matchingSheet, memorySource, readCatalog, similarity, stemWord, type CatalogFeature } from '../src/index';

const f = (slug: string, title: string, summary = '', status = 'built'): CatalogFeature => ({ slug, title, summary, status });

const curated = [
  f('cost-calculator', '3D print cost calculator', 'Filament, electricity and machine wear for one print.'),
  f('pricing-calculator', 'Fee-aware pricing calculator', 'Price that keeps the margin after marketplace fees.'),
  f('hosting', 'Hosting and deploy', 'Static hosting with a deploy script.'),
];

describe('featureWords and stemWord', () => {
  it('drops stop words and meets plural and verb forms', () => {
    expect(featureWords('The calculators for printing')).toEqual(['calculator', 'print']);
    expect(stemWord('deploys')).toBe('deploy');
    expect(stemWord('libraries')).toBe('library');
    expect(stemWord('cost')).toBe('cost');
  });
});

describe('matchFeatures', () => {
  it('matches renamed but equivalent features and leaves missing ones unmatched', () => {
    const drafted = [f('print-cost', 'Print cost calculator', 'Cost of a print from filament and power.'), f('pricing', 'Pricing with marketplace fees', 'Sale price after fees and margin.'), f('blog', 'Blog posts')];
    const r = matchFeatures(curated, drafted);
    expect(r.rows.map((x) => x.auto)).toEqual(['print-cost', 'pricing', null]);
    expect(r.matched).toBe(2);
    expect(r.recall).toBeCloseTo(2 / 3);
    expect(r.unmatchedDrafted).toEqual(['blog']);
  });
  it('never assigns one drafted feature to two curated ones', () => {
    const drafted = [f('calculators', 'Print cost and pricing calculators', 'Cost and fee-aware price.')];
    const r = matchFeatures(curated, drafted);
    expect(r.rows.filter((x) => x.auto).length).toBe(1);
  });
  it('unrelated drafts score 0 recall; an empty catalog gives null', () => {
    expect(matchFeatures(curated, [f('weather', 'Weather widget', 'Shows rain.')]).recall).toBe(0);
    expect(matchFeatures([], [f('a', 'A thing')]).recall).toBeNull();
  });
  it('similarity is symmetric and 1 for identical features', () => {
    expect(similarity(curated[0], curated[0])).toBe(1);
    expect(similarity(curated[0], curated[1])).toBeCloseTo(similarity(curated[1], curated[0]));
  });
});

describe('applyReview', () => {
  it('the reviewer overrides the automatic pass both ways', () => {
    const drafted = [f('print-cost', 'Print cost calculator'), f('deploy', 'Deployment pipeline')];
    const r = matchFeatures(curated, drafted);
    expect(r.matched).toBeLessThan(3);
    expect(applyReview(r, { hosting: 'deploy', 'pricing-calculator': ['print-cost'] }).matched).toBe(3);
    expect(applyReview(r, { 'cost-calculator': null }).matched).toBe(r.matched - 1);
  });
  // precision = drafted features that cover a curated feature / drafted features.
  it('counts precision over drafted features, a split counting every slug once', () => {
    const drafted = [f('print-cost', 'Print cost calculator'), f('deploy', 'Deployment pipeline'), f('weather', 'Weather widget', 'Shows rain.')];
    const r = matchFeatures(curated, drafted);
    expect(r.precision).toBe((drafted.length - r.unmatchedDrafted.length) / drafted.length);
    const all = applyReview(r, { hosting: 'deploy', 'cost-calculator': 'print-cost', 'pricing-calculator': ['print-cost', 'deploy'] });
    expect([all.draftedMatched, all.drafted, all.precision]).toEqual([2, 3, 2 / 3]);
    const none = applyReview(r, { hosting: null, 'cost-calculator': [], 'pricing-calculator': null });
    expect([none.draftedMatched, none.precision]).toEqual([0, 0]);
    expect(matchFeatures(curated, []).precision).toBeNull();
  });
});

describe('readCatalog and matchingSheet', () => {
  it('reads rows, titles, summaries and statuses from a hub folder', () => {
    const src = memorySource({
      'h/business-product/features/README.md': '| Feature | Status | Doc |\n|---|---|---|\n| Cart checkout | built | [cart](cart.md) |\n| Ideas | – | [candidates](candidates.md) |\n',
      'h/business-product/features/cart.md': '---\nfeature: cart\nproduct: h\npage: feature\nstatus: built\nupdated: 2026-11-26\nsummary: Pay for the items in the cart.\n---\n\n# Cart\n',
    });
    expect(readCatalog(src, 'h')).toEqual([{ slug: 'cart', title: 'Cart checkout', summary: 'Pay for the items in the cart.', status: 'built' }]);
    expect(readCatalog(src, 'missing')).toEqual([]);
  });
  it('the sheet lists every curated and drafted feature', () => {
    const sheet = matchingSheet(matchFeatures(curated, [f('print-cost', 'Print cost calculator')]));
    for (const c of curated) expect(sheet).toContain(c.slug);
    expect(sheet).toContain('print-cost');
    expect(sheet).toMatch(/1 of 3 curated features matched/);
  });
});
