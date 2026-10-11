import { beforeAll, afterAll, it, expect } from 'vitest';
import pg from 'pg';
import { createDb } from '../../src/db.js';
import { runAuthorizedSqlRead } from '../../src/neon/sql-read.js';
import { openIsolatedSchema, closeIsolatedSchema, neonShapedQuery, rawQuery } from '../../test/helpers/pg-neon-adapter.js';
import { requireLocalDatabaseUrl } from './local-url.js';

const org = 'org-fake-read-db', project = 'prj-fake-read-db', branch = 'br-fake-read-db';
let schema, db;
beforeAll(async () => {
  schema = await openIsolatedSchema(requireLocalDatabaseUrl());
  db = createDb(neonShapedQuery());
  await db.initSchema();
  await db.initSchema(); // idempotent seeding
  await rawQuery('CREATE TABLE invoices (id INT PRIMARY KEY, cents INT NOT NULL)');
  await rawQuery('INSERT INTO invoices VALUES (1,100), (2,200), (3,300)');
});
afterAll(async () => { await closeIsolatedSchema(); });

it('seeds explicit, owner-approved production SELECT policy exactly once', async () => {
  const rows = await rawQuery("SELECT value, updated_by FROM settings WHERE key = 'sql.read_policy'");
  expect(rows).toHaveLength(1);
  expect(rows[0].value).toEqual({ productionReads: true, maxRows: 200 });
  expect(rows[0].updated_by).toBe('system_default_IN-09');
  expect(await db.getSqlReadPolicy()).toEqual(rows[0].value);
});
it('does not override an owner-disabled production read setting on reinitialization', async () => {
  await rawQuery("UPDATE settings SET value = '{\"productionReads\":false,\"maxRows\":12}'::jsonb WHERE key = 'sql.read_policy'");
  await db.initSchema();
  expect(await db.getSqlReadPolicy()).toEqual({ productionReads: false, maxRows: 12 });
});
it('returns capped rows from real PostgreSQL with transaction-level read-only enforcement', async () => {
  const ctx = { connection: { neonOrg: org, projectScope: project, mode: 'preview' },
    db: { getProtectedResources: async () => [], getSqlReadPolicy: async () => ({ productionReads: true, maxRows: 2 }) },
    selfProject: { org, project_id: 'prj-fake-self' },
    getBranch: async () => ({ id: branch, default: true, protected: true }) };
  const sqlLayer = async (_scope, _target, fn) => {
    const client = new pg.Client({ connectionString: requireLocalDatabaseUrl() });
    await client.connect();
    try {
      await client.query('SET search_path TO "' + schema + '"');
      return await fn({ query: (text, values) => client.query(text, values) });
    } finally { await client.end(); }
  };
  const result = await runAuthorizedSqlRead({ ctx, target: {
    projectId: project, branchId: branch, database: 'neondb', role: 'reader' },
  text: 'SELECT id FROM invoices ORDER BY id', sqlLayer });
  expect(result).toMatchObject({ done: true, production: true, rowCount: 2, maxRows: 2, truncated: true });
  expect(result.rows.map(x => x.id)).toEqual([1, 2]);
  expect((await rawQuery('SELECT COUNT(*)::int AS n FROM invoices'))[0].n).toBe(3);
});
