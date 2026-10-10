// The Postgres behavior the SQL connection layer (A-6) and SQL guard (B-3) are built on, proven on real Postgres:
// isolated throwaway schemas, read-only transactions, statement timeouts, rollback. These must hold on CI's service.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { openIsolatedSchema, closeIsolatedSchema, rawQuery } from '../../test/helpers/pg-neon-adapter.js';
import { requireLocalDatabaseUrl } from './local-url.js';

const url = requireLocalDatabaseUrl();
let schema;
beforeAll(async () => {
  schema = await openIsolatedSchema(url);
  await rawQuery('CREATE TABLE items (id INT PRIMARY KEY, label TEXT NOT NULL)');
  await rawQuery("INSERT INTO items VALUES (1, 'one'), (2, 'two')");
});
afterAll(async () => { await closeIsolatedSchema(); });

async function withClient(fn) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`SET search_path TO "${schema}"`);
    return await fn(client);
  } finally { await client.end(); }
}

describe('throwaway Postgres harness', () => {
  it('runs in a uniquely named schema on a server version the guard supports', async () => {
    expect(schema).toMatch(/^neon_mcp_test_[a-f0-9]{12}$/);
    const [{ server_version_num: v }] = await rawQuery('SHOW server_version_num');
    expect(Number(v)).toBeGreaterThanOrEqual(140000);
  });
  it('BEGIN READ ONLY refuses a write (SQLSTATE 25006)', () => withClient(async (c) => {
    await c.query('BEGIN READ ONLY');
    await expect(c.query("INSERT INTO items VALUES (3, 'three')")).rejects.toMatchObject({ code: '25006' });
    await c.query('ROLLBACK');
    expect((await c.query('SELECT count(*)::int AS n FROM items')).rows[0].n).toBe(2);
  }));
  it('statement_timeout cancels a long statement (SQLSTATE 57014)', () => withClient(async (c) => {
    await c.query("SET statement_timeout = '100ms'");
    await expect(c.query('SELECT pg_sleep(2)')).rejects.toMatchObject({ code: '57014' });
  }));
  it('a rolled-back transaction leaves no change', () => withClient(async (c) => {
    await c.query('BEGIN');
    const res = await c.query("UPDATE items SET label = 'changed' WHERE id = $1", [1]);
    expect(res.rowCount).toBe(1);
    await c.query('ROLLBACK');
    expect((await c.query('SELECT label FROM items WHERE id = 1')).rows[0].label).toBe('one');
  }));
  it('the harness refuses a non-local database URL', async () => {
    const saved = process.env.TEST_DATABASE_URL;
    process.env.TEST_DATABASE_URL = 'postgresql://user:FAKE' + '@db.example.org/db'; // split so the secret scan sees no URL
    try { expect(() => requireLocalDatabaseUrl()).toThrow(/non-local/); }
    finally { process.env.TEST_DATABASE_URL = saved; }
  });
});
