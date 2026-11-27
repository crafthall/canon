// The `--json` contract: the report of every shared fixture hub, one by one and whole, and of a small drifted
// in-memory hub validates against schema/hub-check.schema.json (ajv, an outside validator), and the schema's enums are the code's.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { CHECK_RULES, FINDING_KINDS, HUB_REPORT_SCHEMA_VERSION, PRODUCT_STATUSES, hubReport, memorySource, productIds } from '../src/index';
import { nodeSource } from '../src/node';
import { fixtures } from './fixtures/index';

const SCHEMA = JSON.parse(readFileSync(join(import.meta.dirname, '../schema/hub-check.schema.json'), 'utf8'));
const validate = new Ajv({ allErrors: true }).compile(SCHEMA);
const valid = (r: unknown) => {
  const ok = validate(r);
  return ok ? 'valid' : JSON.stringify(validate.errors, null, 1);
};

describe('canon check --json report and its schema', () => {
  const repo = nodeSource(fixtures().find((f) => f.name === 'complete')!.root);
  const ids = productIds(repo);

  it('the schema is version 1 and its rule ids are the check rules', () => {
    expect(SCHEMA.properties.schemaVersion.const).toBe(HUB_REPORT_SCHEMA_VERSION);
    expect(HUB_REPORT_SCHEMA_VERSION).toBe(1);
    expect(SCHEMA.properties.problems.items.properties.rule.enum).toEqual([...CHECK_RULES]);
    expect(SCHEMA.properties.products.items.properties.findings.items.properties.kind.enum).toEqual([...FINDING_KINDS]);
  });

  it('every fixture hub, one by one and all together, gives a report that validates', () => {
    let seen = 0;
    for (const f of fixtures()) {
      const src = nodeSource(f.root);
      const fids = productIds(src);
      for (const id of fids) {
        const r = hubReport(src, { only: id });
        expect(valid(r), `${f.name}/${id}`).toBe('valid');
        expect([r.scope, r.products.map((p) => p.id)]).toEqual([id, [id]]);
        seen++;
      }
      const all = hubReport(src);
      expect(valid(all), f.name).toBe('valid');
      expect(all.products.map((p) => p.id)).toEqual(fids);
      expect(all.counts.products).toBe(fids.length);
      expect(all.ok, f.name).toBe(f.expected.ok);
    }
    expect(seen).toBeGreaterThanOrEqual(5);
  });

  it('a drifted in-memory hub validates too, with problems and findings filled', () => {
    const page = (name: string, extra = '') => `---\nproduct: tiny\npage: ${name}\nstatus: draft\nupdated: 2026-11-26\n${extra}---\n\n# ${name}\n`;
    const src = memorySource({
      'docs/product-hub/tiny/README.md': '---\nproduct: tiny\npage: hub\nstatus: building\nupdated: 2026-11-26\n---\n\n# Tiny\n\n> Pitch.\n\n[gone](business-product/gone.md)\n',
      'docs/product-hub/tiny/business-product/overview.md': page('overview'),
      'docs/product-hub/tiny/business-product/features/README.md': page('feature-catalog').replace('status: draft', 'status: current') + '\n| F | built | [f](f.md) |\n|---|---|---|\n',
      'docs/product-hub/tiny/business-product/features/f.md': page('feature').replace('status: draft', 'status: shipped'),
      'docs/product-hub/tiny/notes.txt': 'x',
    });
    const r = hubReport(src);
    expect(valid(r)).toBe('valid');
    expect(r.ok).toBe(false);
    expect(new Set(r.problems.map((p) => p.rule))).toEqual(new Set(['layout', 'link', 'lifecycle', 'feature']));
    expect(r.products[0].findings.length).toBeGreaterThan(0);
    expect(r.products[0].stage).toBe('development');
  });

  it('a report with an undocumented field or a wrong type fails the schema (the schema is not vacuous)', () => {
    const r = hubReport(repo, { only: ids[0] });
    expect(valid({ ...r, extra: 1 })).not.toBe('valid');
    expect(valid({ ...r, schemaVersion: 2 })).not.toBe('valid');
    expect(valid({ ...r, products: [{ ...r.products[0], completeness: '1' }] })).not.toBe('valid');
    expect(valid({ ...r, problems: [{ rule: 'nope', file: 'x', message: 'y' }] })).not.toBe('valid');
    expect(PRODUCT_STATUSES).toContain(r.products[0].status);
  });
});
