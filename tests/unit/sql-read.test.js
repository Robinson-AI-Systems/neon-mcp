import { describe, it, expect } from 'vitest';
import { runAuthorizedSqlRead } from '../../src/neon/sql-read.js';

const org = 'org-fake-read';
const project = 'prj-fake-read';
const branch = 'br-fake-read';
const target = { projectId: project, branchId: branch, database: 'neondb', role: 'reader' };
function fixture({ production = true, policy = { productionReads: true, maxRows: 200 },
  protectedItem = false, mismatched = false, error = null } = {}) {
  const calls = [];
  const ctx = {
    connection: { neonOrg: org, projectScope: project, mode: 'preview' },
    selfProject: { org, project_id: 'prj-fake-self' },
    db: { getProtectedResources: async () => protectedItem ?
      [{ kind: 'other', org, project_id: project, label: 'protected' }] : [],
      getSqlReadPolicy: async () => policy },
    getBranch: async () => ({ id: mismatched ? 'br-fake-other' : branch,
      default: production, protected: false })
  };
  const sqlLayer = async (scope, options, cb) => {
    calls.push({ scope, options });
    return cb({ query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT') && error) throw Object.assign(Error('secret raw DB error'), { code: error });
      if (sql.startsWith('SELECT')) return { rows: Array.from({ length: 212 },
        (_, id) => ({ id })) };
      return { rows: [] };
    } });
  };
  return { ctx, sqlLayer, calls };
}
describe('B-3b authorized read-only SQL', () => {
  it('permits an approved production SELECT in a read-only transaction capped at 200 rows', async () => {
    const f = fixture();
    const result = await runAuthorizedSqlRead({ ...f, target,
      text: 'SELECT id FROM invoices WHERE id > $1', params: [2] });
    expect(result).toMatchObject({ done: true, production: true,
      rowCount: 200, maxRows: 200, truncated: true });
    expect(result.rows).toHaveLength(200);
    expect(f.calls.map(x => x.sql).filter(Boolean)).toEqual(['BEGIN READ ONLY',
      'SET LOCAL statement_timeout = 15000', 'SET LOCAL lock_timeout = 5000',
      'SELECT id FROM invoices WHERE id > $1', 'COMMIT']);
    expect(f.calls.find(x => x.sql?.startsWith('SELECT')).values).toEqual([2]);
  });
  it('honors a narrower stored setting and a production read-off switch', async () => {
    const f = fixture({ policy: { productionReads: true, maxRows: 5 } });
    const res = await runAuthorizedSqlRead({ ...f, target, text: 'SELECT id FROM invoices' });
    expect(res.rows).toHaveLength(5);
    const off = fixture({ policy: { productionReads: false, maxRows: 200 } });
    expect((await runAuthorizedSqlRead({ ...off, target, text: 'SELECT 1' })).code)
      .toBe('production_reads_disabled');
    expect(off.calls).toEqual([]);
  });
  it('allows development branch reads with production SQL reads switched off', async () => {
    const f = fixture({ production: false, policy: { productionReads: false, maxRows: 20 } });
    expect((await runAuthorizedSqlRead({ ...f, target, text: 'SELECT 1' })).done).toBe(true);
  });
  it('refuses SQL writes, multi-statements and hidden mutating CTE without connections', async () => {
    const f = fixture();
    for (const text of ['DELETE FROM invoices', 'SELECT 1; DELETE FROM invoices',
      'WITH d AS (DELETE FROM invoices RETURNING id) SELECT * FROM d',
      'EXPLAIN ANALYZE DELETE FROM invoices']) {
      expect((await runAuthorizedSqlRead({ ...f, target, text })).code).toBe('not_read_only');
    }
    expect(f.calls).toEqual([]);
  });
  it('rejects blocked resources and unverified branch before accessing a URI', async () => {
    for (const f of [fixture({ protectedItem: true }), fixture({ mismatched: true })]) {
      expect((await runAuthorizedSqlRead({ ...f, target, text: 'SELECT 1' })).done).toBe(false);
      expect(f.calls).toEqual([]);
    }
  });
  it('rejects missing policy, oversized policy and scope mismatches before SQL', async () => {
    for (const value of [null, { productionReads: true, maxRows: 999 },
      { productionReads: 'yes', maxRows: 200 }]) {
      const f = fixture({ policy: value });
      expect((await runAuthorizedSqlRead({ ...f, target, text: 'SELECT 1' })).code)
        .toBe('settings_unavailable');
      expect(f.calls).toEqual([]);
    }
    const f = fixture();
    f.ctx.connection.projectScope = 'prj-fake-other';
    expect((await runAuthorizedSqlRead({ ...f, target, text: 'SELECT 1' })).code).toBe('not_authorized');
    expect(f.calls).toEqual([]);
  });
  it('rolls back SQLSTATE 25006 and scrubs provider exception messages', async () => {
    const f = fixture({ error: '25006' });
    const result = await runAuthorizedSqlRead({ ...f, target, text: 'SELECT 1' });
    expect(result.code).toBe('read_only_violation');
    expect(JSON.stringify(result)).not.toMatch(/secret raw/);
    expect(f.calls.at(-1).sql).toBe('ROLLBACK');
  });
});

describe('B-5 read-only reconnection safety', () => {
  it('opens at most one fresh connection for the first reset and repeats read-only transaction', async () => {
    const f = fixture();
    let connections = 0, readQueries = 0;
    f.sqlLayer = async (_scope,_target,fn) => {
      connections++;
      return fn({ query: async text => {
        if (text.startsWith('SELECT')) {
          readQueries++;
          if (connections === 1) throw Object.assign(Error('reset'), { code: '08006' });
          return { rows: [{ id: 1 }] };
        }
        return { rows: [] };
      } });
    };
    const result = await runAuthorizedSqlRead({ ...f, target, text: 'SELECT 1' });
    expect(result).toMatchObject({ done: true, rowCount: 1 });
    expect(connections).toBe(2);
    expect(readQueries).toBe(2);
  });
  it('does not reconnect repeatedly on persistent disconnects or non-retriable SQLSTATE', async () => {
    for (const code of ['08006','42P01']) {
      const f = fixture(); let connections = 0;
      f.sqlLayer = async (_scope,_target,fn) => {
        connections++;
        return fn({ query: async sql => {
          if (sql.startsWith('SELECT')) throw Object.assign(Error('driver raw secret'),
            { code });
          return { rows: [] };
        } });
      };
      const result = await runAuthorizedSqlRead({ ...f, target, text: 'SELECT 1' });
      expect(result.done).toBe(false);
      expect(result.code).toBe(code === '08006' ? 'connection_reset' : 'missing_table');
      expect(connections).toBe(code === '08006' ? 2 : 1);
      expect(JSON.stringify(result)).not.toContain('driver raw secret');
    }
  });
});
