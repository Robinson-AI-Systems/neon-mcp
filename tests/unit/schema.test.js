import { afterEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createDb, SCHEMA_TABLES, CONNECTION_FIELDS, connectionSettings } from '../../src/db.js';
import { createFakeDb } from '../../test/helpers/fake-db.js';

it('fake schema initialization is idempotent and lists exactly the contract tables', async () => {
  const db = createFakeDb();
  await db.initSchema();
  await db.initSchema();
  expect(await db.listTables()).toEqual(SCHEMA_TABLES);
  expect(new Set(SCHEMA_TABLES).size).toBe(11);
});

it('rejects an invalid SQL adapter and does not need DATABASE_URL at import time', () => {
  expect(() => createDb('x')).toThrow(TypeError);
  expect(() => createDb(null)).toThrow(TypeError);
});
const originalUrl = process.env.DATABASE_URL;
afterEach(() => {
  if (originalUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalUrl;
});
it('reports a missing URL at call time, without leaking secrets', () => {
  delete process.env.DATABASE_URL;
  expect(() => createDb()).toThrow('DATABASE_URL is not configured. Set it in the Vercel project (docs/DEPLOY.md).');
});
it('copies every connection field, without conflating null scope with missing fields', () => {
  const row = { neon_org: 'org-fake', project_scope: null, mode: 'preview', profile: 'everyday', listing: 'catalog', secret: 'must-not-copy' };
  expect(CONNECTION_FIELDS).toEqual(['neon_org', 'project_scope', 'mode', 'profile', 'listing']);
  expect(connectionSettings(row)).toEqual({
    neon_org: 'org-fake', project_scope: null, mode: 'preview', profile: 'everyday', listing: 'catalog'
  });
  expect(() => connectionSettings(null)).toThrow(TypeError);
});
it('all DDL is additive and SQL statements are literal tagged templates', () => {
  const source = readFileSync(new URL('../../src/db.js', import.meta.url), 'utf8');
  expect(source).not.toMatch(/\b(?:DROP|TRUNCATE)\s+(?:SCHEMA|TABLE|INDEX|DATABASE)\b/i);
  // B-3c permits only six audited, additive, idempotent SQL preview columns.
  const alters = source.split('\n').filter(line => /\bALTER TABLE change_log\b/.test(line));
  expect(alters).toHaveLength(6);
  expect(alters.every(line => line.trim().startsWith('await sql') &&
    /ADD COLUMN IF NOT EXISTS sql_[a-z_]+ (?:TEXT|JSONB|TIMESTAMPTZ)/.test(line))).toBe(true);
  expect([...source.matchAll(/CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\s+(?!IF\s+NOT\s+EXISTS)/gi)]).toEqual([]);
});
it('executes the fixed DDL statement list twice, in order', async () => {
  const queries = [];
  const sql = async (strings, ...values) => { expect(values).toEqual([]); queries.push(strings[0]); return []; };
  const db = createDb(sql);
  await db.initSchema();
  const first = [...queries];
  await db.initSchema();
  expect(queries).toEqual([...first, ...first]);
  expect(first.filter((q) => /CREATE TABLE IF NOT EXISTS/.test(q))).toHaveLength(11);
  expect(first.filter((q) => /CREATE (?:UNIQUE )?INDEX IF NOT EXISTS/.test(q))).toHaveLength(10);
  expect(first.some(q => /CREATE UNIQUE INDEX IF NOT EXISTS change_log_one_apply_key/.test(q))).toBe(true);
});
