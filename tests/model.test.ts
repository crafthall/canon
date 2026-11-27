import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HEALTH_CHECKS,
  HUB_PATHS,
  REQUIREMENTS,
  SECTIONS,
  STAGES,
  STAGE_OF_STATUS,
  completeness,
  healthOf,
  levelAt,
  requirementsAt,
  stageOfStatus,
} from '../src/index';

/** Rows of the first Markdown table under a heading that starts with `heading`: [label, ...letters]. */
function matrixOf(file: string, heading: RegExp): string[][] {
  const text = readFileSync(file, 'utf8');
  const start = text.search(heading);
  expect(start, `${file}: heading ${heading} not found`).toBeGreaterThanOrEqual(0);
  const lines = text.slice(start).split('\n');
  const first = lines.findIndex((l) => l.startsWith('|'));
  const table: string[] = [];
  for (const l of lines.slice(first)) {
    if (!l.startsWith('|')) break;
    table.push(l);
  }
  return table.slice(2).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
}

describe('framework model', () => {
  it('every matrix row has one level per stage, from R C O -', () => {
    for (const r of REQUIREMENTS) expect(r.levels, r.id).toMatch(new RegExp(`^[RCO-]{${STAGES.length}}$`));
    expect(new Set(REQUIREMENTS.map((r) => r.id)).size).toBe(REQUIREMENTS.length);
  });

  it('the overview is required at every stage, and nothing is required before it exists', () => {
    for (const s of STAGES) expect(levelAt('overview', s.id)).toBe('R');
  });

  it('a requirement never falls back from required to optional at a later stage', () => {
    for (const r of REQUIREMENTS) {
      const firstR = r.levels.indexOf('R');
      if (firstR >= 0) expect(r.levels.slice(firstR), r.id).toMatch(/^R+$/);
    }
  });

  it('every product status that is assessed maps to a stage; paused and retired are not assessed', () => {
    for (const st of Object.values(STAGE_OF_STATUS)) expect(STAGES.map((s) => s.id)).toContain(st);
    expect(stageOfStatus('paused')).toBeNull();
    expect(stageOfStatus('building')).toBe('development');
    expect(stageOfStatus(undefined)).toBeNull();
  });

  it('every section page counts toward a known matrix row, and every row except metrics has a page', () => {
    const ids = new Set(REQUIREMENTS.map((r) => r.id));
    const covered = new Set(SECTIONS.flatMap((s) => s.pages.map((p) => p.requirement)));
    for (const id of covered) expect(ids.has(id), id).toBe(true);
    for (const id of ids) if (id !== 'metrics') expect(covered.has(id), id).toBe(true);
    const known = new Set<string>(Object.values(HUB_PATHS));
    for (const p of SECTIONS.flatMap((s) => s.pages)) expect(known.has(p.path) || p.path.startsWith(`${HUB_PATHS.workflow}/`), p.path).toBe(true);
  });

  it('health check ids are unique', () => {
    expect(new Set(HEALTH_CHECKS.map((c) => c.id)).size).toBe(HEALTH_CHECKS.length);
  });

  it('requirementsAt(idea) = the overview only', () => {
    expect(requirementsAt('idea').map((r) => r.id)).toEqual(['overview']);
  });

  it('healthOf: a validation product with overview and value but no metrics is 2 of 3 complete', () => {
    const h = healthOf({ stage: 'validation', present: { overview: true, value: true }, findings: [] });
    expect([h.done, h.total]).toEqual([2, 3]);
    expect(h.rows.find((r) => r.id === 'metrics')?.state).toBe('missing');
    expect(completeness(h)).toBeCloseTo(2 / 3);
  });

  it('healthOf: an open finding turns a present page into review; a triggered C row joins the denominator', () => {
    const h = healthOf({ stage: 'idea', present: { overview: true, adr: true }, findings: [{ area: 'adr' }] });
    expect(h.rows.find((r) => r.id === 'adr')?.state).toBe('review');
    expect([h.done, h.total]).toEqual([1, 2]);
  });

  it('healthOf: an unknown stage is not assessed', () => {
    const h = healthOf({ stage: 'paused', present: { overview: true }, findings: [] });
    expect(h.assessed).toBe(false);
    expect(completeness(h)).toBeNull();
  });
});

describe('differential: the documented matrix equals the code', () => {
  const expected = REQUIREMENTS.map((r) => r.levels.split('').join(''));
  const letters = (rows: string[][]) => rows.map((cells) => cells.slice(1).map((c) => (c === '–' ? '-' : c)).join(''));

  it('package docs (docs/lifecycle.md)', () => {
    const rows = matrixOf(join(import.meta.dirname, '../docs/lifecycle.md'), /^## The matrix/m);
    expect(letters(rows)).toEqual(expected);
    expect(rows.map((c) => c[0])).toEqual(REQUIREMENTS.map((r) => r.label));
  });
});
