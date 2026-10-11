import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { applyGuardedSql } from '../../src/neon/sql-apply.js';
import { sqlScopeHash } from '../../src/neon/sql-preview.js';

const orgId = 'org-fake-apply';
const target = { projectId: 'prj-fake-apply', branchId: 'br-fake-apply',
  database: 'neondb', role: 'neondb_owner' };
const statements = ['DELETE FROM invoices WHERE id > $1'], params = [[1]];
const previewToken = 'a'.repeat(48), requestKey = 'rmcp_apply_verified_001';
function make({ expectedRows = [2], protectedResource = false, mode = 'production',
  productionEnabled = true, branchProduction = true, spending = true,
  duplicate = false, commitFails = false, readback = true, estimated = false } = {}) {
  const events = [];
  const tokenHash = createHash('sha256').update(previewToken).digest('hex');
  const expectedHash = sqlScopeHash({ orgId, target, statements, params });
  const db = {
    getProtectedResources: async () => protectedResource ? [{
      kind: 'other', org: orgId, project_id: target.projectId, label: 'Blocked'
    }] : [],
    getNeonOrg: async () => ({ production_enabled: productionEnabled }),
    reserveWrite: async write => { events.push(['reserve', write]); return duplicate
      ? { created: false, existing: { id: 17 } } : { created: true, id: 19 }; },
    consumeSqlPreview: async input => {
      events.push(['consume', input]);
      return input.tokenHash === tokenHash && input.identityHash === expectedHash
        ? { production: true, sql_expected_rows: expectedRows, sql_estimate: estimated } : null;
    },
    recordSqlRestoreLsn: async x => { events.push(['restore', x]); return true; },
    completeWrite: async x => { events.push(['complete', x]); return true; }
  };
  const ctx = {
    connection: { neonOrg: orgId, projectScope: target.projectId, mode, profile: 'full' },
    deploymentEnv: 'production', selfProject: { org: orgId, project_id: 'prj-fake-self' },
    db, getBranch: async () => ({ id: target.branchId,
      default: branchProduction, protected: false }),
    checkApp: async () => true,
    sqlSpendAdmission: async () => spending
  };
  const sqlLayer = async (_ctx, _target, fn) => fn({ query: async (text) => {
    events.push(['sql', text]);
    if (text === 'SELECT pg_current_wal_lsn() AS restore_lsn')
      return { rows: [{ restore_lsn: '0/168BD00' }] };
    if (text === 'COMMIT' && commitFails) throw new Error('network unknown');
    return { rowCount: text.startsWith('DELETE') ? 2 : 0 };
  } });
  const verifyReadBack = async () => readback;
  const args = { ctx, target, statements, params, previewToken,
    confirm: true, requestKey, sqlLayer, verifyReadBack };
  return { args, ctx, events, db };
}
const sqlEvents = f => f.events.filter(e => e[0] === 'sql').map(e => e[1]);
describe('B-3d private guarded production SQL apply', () => {
  it('requires exact bound token, writes LSN before SQL, checks counts and reads back', async () => {
    const f = make();
    const res = await applyGuardedSql(f.args);
    expect(res).toMatchObject({ done: true, confirmed: true, production: true,
      affectedRows: [2], restorePointRecorded: true });
    expect(f.events.find(e => e[0] === 'consume')[1]).toMatchObject({
      tokenHash: createHash('sha256').update(previewToken).digest('hex') });
    expect(f.events.findIndex(e => e[0] === 'restore')).toBeLessThan(
      f.events.findIndex(e => e[0] === 'sql' && e[1].startsWith('DELETE')));
    expect(sqlEvents(f)).toContain('COMMIT');
    expect(f.events.find(e => e[0] === 'complete')[1].confirmed).toBe('true');
  });
  it('rolls back on the first mismatch without committing', async () => {
    const f = make({ expectedRows: [1] });
    expect(await applyGuardedSql(f.args)).toMatchObject({
      done: false, code: 'row_count_mismatch', expectedRows: [1], affectedRows: [2] });
    expect(sqlEvents(f)).toContain('ROLLBACK');
    expect(sqlEvents(f)).not.toContain('COMMIT');
    expect(f.events.find(e => e[0] === 'complete')[1].confirmed).toBe('false');
  });
  it('refuses without confirmation, production access, spend admission or protection', async () => {
    for (const override of [{ mode: 'preview' }, { productionEnabled: false },
      { spending: false }, { protectedResource: true }]) {
      const f = make(override), res = await applyGuardedSql(f.args);
      expect(res.done).toBe(false);
      expect(sqlEvents(f)).toEqual([]);
      expect(f.events.find(e => e[0] === 'consume')).toBeUndefined();
    }
    const f = make();
    expect((await applyGuardedSql({ ...f.args, confirm: false })).code)
      .toBe('needs_confirmation');
    expect(f.events).toEqual([]);
  });
  it('refuses expired/other SQL identity tokens without target connections', async () => {
    for (const overrides of [
      { previewToken: 'z'.repeat(48) },
      { params: [[99]] },
      { statements: ['DELETE FROM invoices WHERE id < $1'] },
      { target: { ...target, role: 'other_role' } }
    ]) {
      const f = make();
      expect((await applyGuardedSql({ ...f.args, ...overrides })).code).toBe('preview_mismatch');
      expect(sqlEvents(f)).toEqual([]);
    }
  });
  it('does not consume a token or execute SQL on duplicate request keys', async () => {
    const f = make({ duplicate: true });
    expect((await applyGuardedSql(f.args)).code).toBe('duplicate_request');
    expect(f.events.map(e => e[0])).toEqual(['reserve']);
  });
  it('keeps uncertain commits and failed read-back pending, never resends', async () => {
    for (const options of [{ commitFails: true }, { readback: false }]) {
      const f = make(options), res = await applyGuardedSql(f.args);
      expect(res).toMatchObject({ done: false, confirmed: 'pending',
        code: 'apply_uncertain' });
      expect(sqlEvents(f).filter(s => s.startsWith('DELETE'))).toHaveLength(1);
      expect(f.events.find(e => e[0] === 'complete')[1].confirmed).toBe('pending');
    }
  });
  it('development writes still require guard admission and do not accept production tokens', async () => {
    const f = make({ branchProduction: false, mode: 'preview' });
    expect((await applyGuardedSql(f.args)).code).toBe('unexpected_preview');
    expect(sqlEvents(f)).toEqual([]);
    expect(await applyGuardedSql({ ...f.args, previewToken: undefined }))
      .toMatchObject({ done: true, production: false, restorePointRecorded: false });
    expect(sqlEvents(f)).not.toContain('SELECT pg_current_wal_lsn() AS restore_lsn');
  });
  it('refuses parser-invalid, multi-query and full-table SQL before reservation', async () => {
    for (const sql of ['SELECT 1', 'DELETE FROM invoices', 'SELECT 1; DELETE FROM invoices',
      'COPY invoices TO STDOUT']) {
      const f = make();
      expect((await applyGuardedSql({ ...f.args,
        statements: [sql], params: [[]] })).done).toBe(false);
      expect(f.events).toEqual([]);
    }
  });
});

describe('B-3d inexact production preview consent', () => {
  it('refuses without acceptEstimate and permits a verified but uncertain count when explicitly accepted', async () => {
    const without = make({ estimated: true, expectedRows: [1] });
    expect((await applyGuardedSql(without.args)).code).toBe('preview_mismatch');
    expect(sqlEvents(without)).toEqual([]);
    const accepted = make({ estimated: true, expectedRows: [1] });
    expect(await applyGuardedSql({ ...accepted.args, acceptEstimate: true }))
      .toMatchObject({ done: true, estimatedPreview: true, affectedRows: [2] });
    expect(sqlEvents(accepted)).toContain('COMMIT');
  });
});
