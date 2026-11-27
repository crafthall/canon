import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { REQUIREMENTS, STAGES, buildProduct, completeness, experimentRows, healthOf, isIsoDate, overdueExperiments, type StageId } from '../src/index';

const ids = REQUIREMENTS.map((r) => r.id);
const stage = fc.constantFrom(...STAGES.map((s) => s.id));
const present = fc.dictionary(fc.constantFrom(...ids), fc.boolean());
const findings = fc.array(fc.record({ area: fc.constantFrom(...ids) }), { maxLength: 6 });

describe('healthOf properties', () => {
  it('0 ≤ done ≤ total ≤ rows, and completeness is a share', () => {
    fc.assert(
      fc.property(stage, present, findings, (s, p, f) => {
        const h = healthOf({ stage: s, present: p, findings: f });
        expect(h.done).toBeGreaterThanOrEqual(0);
        expect(h.done).toBeLessThanOrEqual(h.total);
        expect(h.total).toBeLessThanOrEqual(REQUIREMENTS.length);
        const c = completeness(h);
        if (c !== null) expect(c >= 0 && c <= 1).toBe(true);
      }),
    );
  });

  it('adding a missing source with no finding never lowers the done count', () => {
    fc.assert(
      fc.property(stage, present, findings, fc.constantFrom(...ids), (s, p, f, add) => {
        const before = healthOf({ stage: s, present: p, findings: f });
        const after = healthOf({ stage: s, present: { ...p, [add]: true }, findings: f.filter((x) => x.area !== add) });
        expect(after.done).toBeGreaterThanOrEqual(before.done);
      }),
    );
  });

  it('total = required rows + triggered conditional rows at the stage', () => {
    fc.assert(
      fc.property(stage, present, (s: StageId, p) => {
        const si = STAGES.findIndex((x) => x.id === s);
        const want = REQUIREMENTS.filter((r) => r.levels[si] === 'R' || (r.levels[si] === 'C' && p[r.id])).length;
        expect(healthOf({ stage: s, present: p, findings: [] }).total).toBe(want);
      }),
    );
  });

  it('with every source present and no findings, completeness is 1 at every stage', () => {
    const all = Object.fromEntries(ids.map((i) => [i, true]));
    for (const s of STAGES) expect(completeness(healthOf({ stage: s.id, present: all, findings: [] }))).toBe(1);
  });
});

// for any experiments table and any today, the overdue set is exactly the rows with revisit-by < today and no
// result. The oracle compares day numbers (not strings), so it does not share the implementation's string comparison.
describe('experiments overdue property', () => {
  const DAY = 86_400_000;
  const BASE = Date.UTC(2020, 0, 1);
  const iso = (d: number) => new Date(BASE + d * DAY).toISOString().slice(0, 10);
  // A narrow range (two months from 2020-01-01, across month ends) so today often equals a row's date – the boundary.
  const day = fc.integer({ min: 0, max: 60 });
  const revisit = fc.oneof(day.map((d) => ({ d, cell: iso(d) })), fc.constantFrom({ d: null, cell: '(to set)' }, { d: null, cell: '' }, { d: null, cell: '2020-02-30' }, { d: null, cell: 'R0-exit' }));
  const result = fc.constantFrom('', ' ', '-', '–', 'go – 46 %', 'kill', 'inconclusive', '0');
  const noResult = (r: string) => /^[\s\-–—]*$/.test(r);
  const rows = fc.array(fc.record({ revisit, result }), { maxLength: 12 });
  const table = (rs: { revisit: { cell: string }; result: string }[]) =>
    ['## Experiments', '', '| ID | Hypothesis | Metric | Go | Kill | Owner | Revisit by | Result |', '|---|---|---|---|---|---|---|---|', ...rs.map((r, i) => `| X${i} | h${i} | m | g | k | o | ${r.revisit.cell} | ${r.result} |`)].join('\n');

  it('parsed table: overdue ids = rows with revisit-by < today and no result', () => {
    fc.assert(
      fc.property(rows, day, (rs, t) => {
        const want = rs.flatMap((r, i) => (r.revisit.d !== null && r.revisit.d < t && noResult(r.result) ? [`X${i}`] : []));
        expect(overdueExperiments(experimentRows(table(rs)), iso(t)).map((e) => e.id)).toEqual(want);
        // The same table read on each row's own revisit date: that row is never overdue on its day.
        for (const r of rs) if (r.revisit.d !== null) expect(overdueExperiments(experimentRows(table([r])), r.revisit.cell)).toEqual([]);
      }),
      { numRuns: 400 },
    );
  });

  it('through buildProduct: one stale experiments finding per overdue row, none without today', () => {
    const readme = '---\nproduct: p\npage: hub\nstatus: building\nupdated: 2026-01-01\n---\n\n# P\n';
    const page = (body: string) => `---\nproduct: p\npage: experiments\nstatus: current\nupdated: 2026-01-01\n---\n\n# P – experiments\n\n${body}\n`;
    fc.assert(
      fc.property(rows, day, (rs, t) => {
        const src = { dir: 'docs/crafthall/canon/p', readme, overview: page('x'), experiments: page(table(rs)) };
        const want = rs.filter((r) => r.revisit.d !== null && r.revisit.d < t && noResult(r.result)).length;
        const found = buildProduct('p', src, { today: iso(t) }).findings.filter((f) => f.area === 'experiments');
        expect(found.length).toBe(want);
        expect(found.every((f) => f.kind === 'stale')).toBe(true);
        expect(buildProduct('p', src).findings.filter((f) => f.area === 'experiments')).toEqual([]);
        expect(isIsoDate(iso(t))).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
