// S-1 proof: the promoted pg transport (src/db-transport.js) carries the
// real db layer against plain Postgres — the same suite seam the Neon
// driver uses on Vercel — including schema creation for all sixteen
// own-store tables, parameterized round trips through createDb, and the
// health probe running through the transport instead of its own driver.
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import pg from 'pg';
import { createDb, SCHEMA_TABLES } from '../../src/db.js';
import { pgStoreSql, storeSql } from '../../src/db-transport.js';
import { serviceHealth } from '../../src/service-health.js';
import { requireLocalDatabaseUrl } from './local-url.js';

const SHA = 'a'.repeat(40);
let admin;
let schema;
let storeUrl;
let sql;
let db;

beforeAll(async () => {
  const base = requireLocalDatabaseUrl();
  schema = `neon_mcp_transport_${crypto.randomBytes(6).toString('hex')}`;
  admin = new pg.Client({ connectionString: base });
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(base);
  url.searchParams.set('options', `-c search_path=${schema}`);
  storeUrl = url.toString();
  sql = pgStoreSql(storeUrl);
  db = createDb(sql);
  await db.initSchema();
});

afterAll(async () => {
  await sql.end();
  if (admin) {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});

describe('pg own-store transport, real disposable Postgres', () => {
  it('creates every own-store table through the db layer', async () => {
    const rows = await sql.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = $1', [schema]);
    const names = rows.map((row) => row.table_name);
    for (const table of SCHEMA_TABLES) expect(names).toContain(table);
    expect(SCHEMA_TABLES).toHaveLength(16);
  });

  it('round-trips registrations through createDb on the pg handle', async () => {
    await db.createOAuthClient({ clientId: 'transport-client', clientSecret: 'fake-secret-transport',
      redirectUris: ['https://example.test/callback'], clientName: 'Transport' });
    const list = await db.listOAuthClients();
    expect(list.map((row) => row.clientId)).toEqual(['transport-client']);
    expect(JSON.stringify(list)).not.toContain('fake-secret-transport');
  });

  it('binds values as parameters, never string-concatenated SQL', async () => {
    const hostile = `x'); DROP TABLE oauth_clients; --`;
    await db.createOAuthClient({ clientId: hostile, redirectUris: ['https://example.test/h'],
      clientName: 'Hostile', tokenEndpointAuthMethod: 'none', clientSecret: null });
    const list = await db.listOAuthClients();
    expect(list).toHaveLength(2);
    expect(list.map((row) => row.clientId)).toContain(hostile);
    const rows = await sql`SELECT client_id FROM oauth_clients WHERE client_id = ${hostile}`;
    expect(rows).toHaveLength(1);
  });

  it('auto-selects pg for a non-Neon store URL through storeSql', async () => {
    const auto = storeSql({ DATABASE_URL: storeUrl });
    const rows = await auto.query('SELECT 1 AS probe_ok', []);
    expect(rows[0].probe_ok).toBe(1);
    await auto.end();
  });

  it('answers the health probe through the transport with the pinned shape', async () => {
    const health = await serviceHealth({ env: {
      DATABASE_URL: storeUrl, HEALTH_DB_PROBE_ENABLED: '1',
      PUBLIC_BASE_URL: 'https://neon.example.test', VERCEL_GIT_COMMIT_SHA: SHA } });
    expect(health.status).toBe('ok');
    expect(health.revision).toBe(SHA);
    expect(health.tools).toBe(139);
    expect(Object.keys(health).sort()).toEqual(['revision', 'status', 'timestamp', 'tools', 'version']);
  });
});
