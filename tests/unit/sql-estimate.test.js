import { describe, it, expect } from 'vitest';
import { createSqlEstimatedPreview } from '../../src/neon/sql-estimate.js';
import { createSqlExactPreview } from '../../src/neon/sql-preview.js';

const orgId = 'org-fake-fallback';
const target = { projectId: 'prj-fake-fallback', branchId: 'br-fake-fallback',
  database: 'neondb', role: 'writer' };
const statements = ['DELETE FROM invoices WHERE id > $1'], params = [[1]];
function fixture({ allowed = true, verified = true, production = true } = {}) {
  const queries = [], audits = [];
  const ctx = {
    connection: { neonOrg: orgId, projectScope: target.projectId, mode: 'preview' },
    selfProject: { org: orgId, project_id: 'prj-fake-self' },
    db: { getProtectedResources: async () => [],
      recordSqlPreview: async () => { throw Error('Unexpected exact token'); },
      recordSqlEstimate: async value => audits.push(value) },
    getBranch: async () => ({ id: target.branchId, default: production }),
    checkApp: async () => true,
    previewAdmission: async () => allowed,
    verifyPreviewFallback: async ({ reason }) => verified &&
      ['branch_limit','budget_exhausted'].includes(reason)
  };
  const sqlLayer = async (_scope, requestedTarget, fn) => {
    expect(requestedTarget.branchId).toBe(target.branchId);
    return fn({ query: async text => {
      queries.push(text);
      if (text.startsWith('EXPLAIN')) return {
        rows: [{ 'QUERY PLAN': [{ Plan: { 'Node Type': 'ModifyTable',
          'Plan Rows': 0, Plans: [{ 'Node Type': 'Seq Scan', 'Plan Rows': 23 }] } }] }]
      };
      return { rowCount: 0 };
    } });
  };
  return { ctx, sqlLayer, queries, audits };
}
const args = f => ({ ...f, target, statements, params,
  requestKey: 'rmcp_fallback_fake_0001', reason: 'branch_limit' });
describe('B-3d SQL estimate fallback', () => {
  it('issues explicitly inexact token from READ ONLY EXPLAIN without target writes', async () => {
    const f = fixture();
    const result = await createSqlEstimatedPreview(args(f));
    expect(result).toMatchObject({ done: true, exact: false, estimated: true,
      requiresAcceptEstimate: true, affectedRowsEstimate: [23] });
    expect(result.previewToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(f.queries).toEqual(['BEGIN READ ONLY', 'SET LOCAL statement_timeout = 15000',
      'SET LOCAL lock_timeout = 5000',
      'EXPLAIN (FORMAT JSON) DELETE FROM invoices WHERE id > $1', 'COMMIT']);
    expect(f.audits).toHaveLength(1);
    expect(f.audits[0].estimatedRows).toEqual([23]);
  });
  it('refuses unverified capacity, wrong scope, DDL or protected targets before querying', async () => {
    for (const overrides of [{ verified: false }, { production: false }]) {
      const f = fixture(overrides);
      expect((await createSqlEstimatedPreview(args(f))).done).toBe(false);
      expect(f.queries).toEqual([]);
    }
    for (const reason of ['unknown','limit_unverified']) {
      const f = fixture();
      expect((await createSqlEstimatedPreview({ ...args(f), reason })).done).toBe(false);
      expect(f.queries).toEqual([]);
    }
    const f = fixture();
    expect((await createSqlEstimatedPreview({ ...args(f),
      statements: ['CREATE TABLE t (id INT)'], params: [[]] })).code).toBe('cannot_estimate');
    expect(f.queries).toEqual([]);
  });
  it('routes only trusted spend exhaustion from the exact-preview path', async () => {
    const f = fixture({ allowed: false });
    const result = await createSqlExactPreview({ ...args(f), neonClient: {},
      now: () => Date.parse('2026-10-11T18:00:00Z') });
    expect(result).toMatchObject({ done: true, exact: false,
      requiresAcceptEstimate: true });
    expect(f.queries.some(x => x.startsWith('EXPLAIN'))).toBe(true);
    const g = fixture({ allowed: false, verified: false });
    const refused = await createSqlExactPreview({ ...args(g), neonClient: {} });
    expect(refused.code).toBe('spend_refused');
    expect(g.queries).toEqual([]);
  });
});
