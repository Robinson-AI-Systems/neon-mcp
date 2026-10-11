import { createHash } from 'node:crypto';
import { beforeAll, afterAll, it, expect } from 'vitest';
import pg from 'pg';
import { createDb } from '../../src/db.js';
import { applyGuardedSql } from '../../src/neon/sql-apply.js';
import { sqlScopeHash } from '../../src/neon/sql-preview.js';
import { openIsolatedSchema, closeIsolatedSchema, neonShapedQuery, rawQuery }
  from '../../test/helpers/pg-neon-adapter.js';
import { requireLocalDatabaseUrl } from './local-url.js';

const orgId = 'org-fake-apply-db', target = {
  projectId: 'prj-fake-apply-db', branchId: 'br-fake-apply-db',
  database: 'neondb', role: 'writer'
};
const statements = ['DELETE FROM invoices WHERE id >= $1'], params = [[2]];
let db, schema;
beforeAll(async () => {
  schema = await openIsolatedSchema(requireLocalDatabaseUrl());
  db = createDb(neonShapedQuery());
  await db.initSchema();
  await rawQuery('CREATE TABLE invoices (id int PRIMARY KEY, cents int NOT NULL)');
  await rawQuery('INSERT INTO invoices VALUES (1,100),(2,200),(3,300)');
});
afterAll(async () => closeIsolatedSchema());
async function run(expectedRows, key) {
  const token = 't'.repeat(47) + key.slice(-1);
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await db.recordSqlPreview({ orgId, target, tokenHash,
    identityHash: sqlScopeHash({ orgId, target, statements, params }),
    expectedRows, production: true });
  const safeDb = { ...db, getProtectedResources: async () => [],
    getNeonOrg: async () => ({ production_enabled: true }) };
  const ctx = { connection: { neonOrg: orgId, projectScope: target.projectId,
    mode: 'production', profile: 'full' }, deploymentEnv: 'production',
    selfProject: { org: orgId, project_id: 'prj-fake-server' }, db: safeDb,
    getBranch: async () => ({ id: target.branchId, default: true }),
    checkApp: async () => true, sqlSpendAdmission: async () => true };
  const sqlLayer = async (_scope, _target, fn) => {
    const client = new pg.Client({ connectionString: requireLocalDatabaseUrl() });
    await client.connect();
    try {
      await client.query('SET search_path TO "' + schema + '"');
      return await fn({ query: (text, values) => client.query(text, values) });
    } finally { await client.end(); }
  };
  return applyGuardedSql({ ctx, target, statements, params, previewToken: token,
    confirm: true, requestKey: key, sqlLayer, verifyReadBack: async () => true });
}
it('mismatch rolls back actual PostgreSQL data, and checkpoint remains in audit', async () => {
  const result = await run([1], 'rmcp_apply_real_mismatch_1');
  expect(result).toMatchObject({ done: false, code: 'row_count_mismatch',
    expectedRows: [1], affectedRows: [2] });
  const invoices = await rawQuery('SELECT id FROM invoices ORDER BY id');
  expect(invoices.map(row => row.id)).toEqual([1,2,3]);
  const audit = await rawQuery('SELECT confirmed, restore_lsn FROM change_log WHERE request_key = $1',
    ['rmcp_apply_real_mismatch_1']);
  expect(audit[0].confirmed).toBe('false');
  expect(audit[0].restore_lsn).toMatch(/^[0-9a-f]+\/[0-9a-f]+$/i);
});
it('matching preview commits once and stores WAL before commit', async () => {
  const result = await run([2], 'rmcp_apply_real_success_2');
  expect(result).toMatchObject({ done: true, confirmed: true, affectedRows: [2] });
  expect((await rawQuery('SELECT id FROM invoices ORDER BY id')).map(x => x.id)).toEqual([1]);
  const audit = await rawQuery('SELECT confirmed, restore_lsn FROM change_log WHERE request_key = $1',
    ['rmcp_apply_real_success_2']);
  expect(audit[0].confirmed).toBe('true');
  expect(audit[0].restore_lsn).toMatch(/^[0-9a-f]+\/[0-9a-f]+$/i);
  expect((await db.recordSqlRestoreLsn({ orgId, id: 9999999, lsn: '0/1' }))).toBe(false);
});
