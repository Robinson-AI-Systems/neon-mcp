// Adapted from Robinson-AI-Systems/stripe-mcp tests/db/contract.test.js @ f9a54f8.
import { beforeAll, afterAll, expect, it } from 'vitest';
import { openIsolatedSchema, closeIsolatedSchema, rawQuery, neonShapedQuery } from '../../test/helpers/pg-neon-adapter.js';
import { runDbContract } from '../../test/contract/db-contract.js';
import { requireLocalDatabaseUrl } from './local-url.js';

let sql;
beforeAll(async () => {
  await openIsolatedSchema(requireLocalDatabaseUrl());
  await rawQuery('CREATE TABLE contract_items (key TEXT PRIMARY KEY, value JSONB NOT NULL)');
  sql = neonShapedQuery();
});
afterAll(async () => { await closeIsolatedSchema(); });

runDbContract('isolated PostgreSQL', async () => ({
  async put(key, value) { await sql`INSERT INTO contract_items (key, value) VALUES (${key}, ${JSON.stringify(value)}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`; },
  async get(key) { const rows = await sql`SELECT value FROM contract_items WHERE key = ${key}`; return rows[0]?.value ?? null; }
}));

it('binds values as parameters, never as SQL text', async () => {
  expect((await sql`SELECT ${42}::integer AS answer`)[0].answer).toBe(42);
  const hostile = "x'); DROP TABLE contract_items; --";
  expect((await sql`SELECT ${hostile}::text AS v`)[0].v).toBe(hostile);
  expect((await sql`SELECT count(*)::int AS n FROM contract_items`)[0].n).toBeGreaterThanOrEqual(0);
});
