import { describe, it, expect } from 'vitest';
import { createSqlExactPreview, sqlScopeHash } from '../../src/neon/sql-preview.js';
import { makeFakeNeon } from '../../test/helpers/fake-neon.js';
import { makeNeonClient } from '../../src/neon/client.js';
import * as fx from '../../test/helpers/neon-fixtures.js';

const key = 'napi_FAKE_preview_fixture_key';
const target = { projectId: fx.IDS.project, branchId: fx.IDS.main,
  database: 'neondb', role: 'neondb_owner' };
const requestKey = 'rmcp_preview_12345678';
function fixture({ admit = true, protectedItem = false, failSql = false } = {}) {
  const fake = makeFakeNeon();
  fake.when('createProjectBranch').resolves(fx.responses.createProjectBranch());
  fake.when('deleteProjectBranch').resolves({
    branch: fx.devBranch(), operations: []
  });
  const attempts = [], records = [];
  const ctx = {
    connection: { neonOrg: fx.IDS.org, projectScope: fx.IDS.project, mode: 'preview' },
    selfProject: { org: fx.IDS.org, project_id: 'proj-fake-self-db' },
    db: { getProtectedResources: async () => protectedItem ? [{
      kind: 'other', org: fx.IDS.org, project_id: fx.IDS.project, label: 'Protected'
    }] : [], recordSqlPreview: async item => records.push(item) },
    getBranch: async () => fx.mainBranch(),
    checkApp: async () => true,
    previewAdmission: async () => admit
  };
  const neonClient = makeNeonClient({ key, orgId: fx.IDS.org,
    budget: { consume: async () => ({ allowed: true }) }, fetch: fake.fetch });
  const sqlLayer = async (_ctx, branchTarget, fn) => {
    attempts.push(branchTarget);
    return fn({ query: async (sql, values) => {
      attempts.push({ sql, values });
      if (sql.startsWith('DELETE') && failSql) throw Error('fake SQL failed');
      return { rowCount: sql.startsWith('DELETE') ? 2 : 0, rows: [] };
    } });
  };
  return { fake, ctx, neonClient, sqlLayer, attempts, records,
    waiter: async () => ({ done: true }) };
}
const args = f => ({ ...f, target, statements: ['DELETE FROM invoices WHERE id > $1'],
  params: [[1]], requestKey, now: () => Date.parse('2026-10-11T18:00:00Z') });
describe('B-3c exact child-only preview', () => {
  it('creates an expiring child, executes only on child, cleans it and binds an opaque token', async () => {
    const f = fixture();
    const res = await createSqlExactPreview(args(f));
    expect(res).toMatchObject({ done: true, exact: true,
      affectedRows: [2], childDeleted: true, production: true, validForMinutes: 30 });
    expect(res.previewToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(f.records).toHaveLength(1);
    expect(f.records[0].identityHash).toBe(sqlScopeHash({
      orgId: fx.IDS.org, target, statements: args(f).statements, params: args(f).params }));
    expect(f.records[0].tokenHash).not.toBe(res.previewToken);
    expect(f.attempts[0].branchId).toBe(fx.IDS.dev);
    const methods = f.fake.calls.map(x => x.operationId);
    expect(methods).toEqual(['createProjectBranch', 'deleteProjectBranch']);
    expect(f.fake.calls[0].body.branch).toMatchObject({
      parent_id: fx.IDS.main, expires_at: '2026-10-11T19:00:00Z' });
    expect(f.fake.calls[0].body.endpoints[0]).toMatchObject({ type: 'read_write',
      autoscaling_limit_min_cu: 0.25, autoscaling_limit_max_cu: 0.25 });
    f.fake.assertClean();
  });
  it('refuses without owner protection verification or spend admission', async () => {
    for (const options of [{ admit: false }, { protectedItem: true }]) {
      const f = fixture(options);
      expect((await createSqlExactPreview(args(f))).done).toBe(false);
      expect(f.fake.calls).toEqual([]);
      expect(f.records).toEqual([]);
    }
  });
  it('always cleans child and refuses token after SQL failure', async () => {
    const f = fixture({ failSql: true });
    const result = await createSqlExactPreview(args(f));
    expect(result.code).toBe('preview_failed');
    expect(f.fake.calls.map(x => x.operationId)).toEqual(['createProjectBranch',
      'deleteProjectBranch']);
    expect(f.records).toEqual([]);
  });
  it('refuses raw reads, multi-statement input and full-table deletion before branch creation', async () => {
    for (const statements of [['SELECT 1'], ['DELETE FROM invoices'],
      ['SELECT 1; DROP TABLE invoices']]) {
      const f = fixture();
      expect((await createSqlExactPreview({ ...args(f), statements, params: [[]] })).done).toBe(false);
      expect(f.fake.calls).toEqual([]);
    }
  });
  it('scope hash binds SQL parameters, project, role, branch and organization', () => {
    const a = args(fixture());
    const v = sqlScopeHash({ orgId: fx.IDS.org, target, statements: a.statements, params: a.params });
    for (const change of [
      { orgId: 'org-fake-other' }, { target: { ...target, branchId: fx.IDS.dev } },
      { target: { ...target, role: 'another_role' } },
      { statements: ['DELETE FROM invoices WHERE id < $1'] }, { params: [[2]] }
    ]) expect(sqlScopeHash({ orgId: fx.IDS.org, target,
      statements: a.statements, params: a.params, ...change })).not.toBe(v);
  });
});
