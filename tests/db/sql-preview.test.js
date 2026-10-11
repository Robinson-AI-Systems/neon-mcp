import { beforeAll, afterAll, it, expect } from 'vitest';
import { createDb } from '../../src/db.js';
import { openIsolatedSchema, closeIsolatedSchema, neonShapedQuery, rawQuery }
  from '../../test/helpers/pg-neon-adapter.js';
import { requireLocalDatabaseUrl } from './local-url.js';

let db;
const tokenHash = 'a'.repeat(64), identityHash = 'b'.repeat(64);
const orgId = 'org-fake-preview', target = { projectId: 'prj-fake-preview', branchId: 'br-fake-preview' };
beforeAll(async () => {
  await openIsolatedSchema(requireLocalDatabaseUrl());
  db = createDb(neonShapedQuery());
  await db.initSchema();
  await db.initSchema();
});
afterAll(async () => { await closeIsolatedSchema(); });
it('persists no raw SQL, ephemeral token or sensitive parameters', async () => {
  const id = await db.recordSqlPreview({ orgId, target, tokenHash, identityHash,
    expectedRows: [3,0], production: true });
  expect(id).toBeTruthy();
  const rows = await rawQuery('SELECT sql_preview_hash, sql_scope_hash, sql_expected_rows, dry_run, production FROM change_log');
  expect(rows[0]).toMatchObject({ sql_preview_hash: tokenHash,
    sql_scope_hash: identityHash, sql_expected_rows: [3,0], dry_run: true, production: true });
});
it('accepts a bound token once only, with strict org, SQL hash and target', async () => {
  const base = { orgId, target, tokenHash, identityHash };
  expect(await db.consumeSqlPreview({ ...base, orgId: 'org-fake-other' })).toBeNull();
  expect(await db.consumeSqlPreview({ ...base, identityHash: 'c'.repeat(64) })).toBeNull();
  expect(await db.consumeSqlPreview({ ...base,
    target: { projectId: target.projectId, branchId: 'br-fake-other' } })).toBeNull();
  expect(await db.consumeSqlPreview(base)).toMatchObject({ sql_expected_rows: [3,0] });
  expect(await db.consumeSqlPreview(base)).toBeNull();
});
it('rejects expired previews before an apply can begin', async () => {
  await db.recordSqlPreview({ orgId, target, tokenHash: 'd'.repeat(64),
    identityHash, expectedRows: [2] });
  await rawQuery("UPDATE change_log SET sql_preview_expires_at = now() - interval '1 second' WHERE sql_preview_hash = $1",
    ['d'.repeat(64)]);
  expect(await db.consumeSqlPreview({ orgId, target,
    tokenHash: 'd'.repeat(64), identityHash })).toBeNull();
});

it('estimated-preview token needs explicit consent, with no premature consumption', async () => {
  const estimatedHash = 'e'.repeat(64);
  await db.recordSqlEstimate({ orgId, target, tokenHash: estimatedHash, identityHash,
    estimatedRows: [100] });
  const request = { orgId, target, tokenHash: estimatedHash, identityHash };
  expect(await db.consumeSqlPreview(request)).toBeNull();
  expect(await db.consumeSqlPreview({ ...request, acceptEstimate: true }))
    .toMatchObject({ sql_estimate: true, sql_expected_rows: [100], production: true });
  expect(await db.consumeSqlPreview({ ...request, acceptEstimate: true })).toBeNull();
});
