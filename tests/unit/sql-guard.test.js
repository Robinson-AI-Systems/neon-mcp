import { describe, expect, it } from 'vitest';
import { classifySql } from '../../src/neon/sql-guard.js';

// SQL is never executed: parse each statement through pinned libpg-query, not regex.
const cases = [
  // Safe read, including joins, subqueries, CTE, EXPLAIN and expressions.
  ['read', 'SELECT 1'],
  ['read', 'SELECT id FROM invoices'],
  ['read', 'SELECT id FROM invoices WHERE id = $1'],
  ['read', 'SELECT id FROM invoices ORDER BY id'],
  ['read', 'SELECT id FROM invoices LIMIT 10'],
  ['read', 'SELECT count(*) FROM invoices'],
  ['read', 'SELECT DISTINCT id FROM invoices'],
  ['read', 'SELECT id, cents FROM invoices'],
  ['read', 'SELECT id FROM invoices WHERE cents > 0'],
  ['read', 'SELECT id FROM invoices WHERE cents BETWEEN 1 AND 10'],
  ['read', 'SELECT id FROM invoices WHERE id IN (1,2,3)'],
  ['read', 'SELECT * FROM (SELECT id FROM invoices) AS x'],
  ['read', 'WITH x AS (SELECT id FROM invoices) SELECT id FROM x'],
  ['read', 'SELECT CASE WHEN true THEN 1 ELSE 0 END'],
  ['read', 'SELECT EXISTS (SELECT 1 FROM invoices)'],
  ['read', 'SELECT 1 UNION SELECT 2'],
  ['read', 'SELECT 1 INTERSECT SELECT 1'],
  ['read', 'SHOW statement_timeout'],
  ['read', 'EXPLAIN SELECT * FROM invoices'],
  ['read', 'EXPLAIN ANALYZE SELECT 1'],
  ['read', 'SELECT pg_sleep(5)'],
  ['read', 'SELECT CURRENT_DATE'],
  // Mutations and nested mutations must never enter the read-only SQL door.
  ['write', 'INSERT INTO invoices (id,cents) VALUES (1,100)'],
  ['write', 'INSERT INTO invoices (id,cents) SELECT 1,100'],
  ['write', 'INSERT INTO invoices (id,cents) VALUES (1,100) ON CONFLICT (id) DO NOTHING'],
  ['write', 'UPDATE invoices SET cents=100 WHERE id=1'],
  ['write', 'DELETE FROM invoices WHERE id=1'],
  ['write', 'DELETE FROM invoices WHERE false'],
  ['write', 'SELECT id FROM invoices FOR UPDATE'],
  ['write', 'SELECT id FROM invoices FOR SHARE'],
  ['write', 'SELECT id INTO TEMP TABLE scratch_read FROM invoices'],
  ['write', 'WITH d AS (DELETE FROM invoices WHERE id=1 RETURNING id) SELECT id FROM d'],
  ['write', 'EXPLAIN DELETE FROM invoices WHERE id=1'],
  ['write', "SELECT setval('invoice_id_seq', 12)"],
  ['write', 'SELECT pg_stat_reset()'],
  ['write', 'SELECT pg_stat_statements_reset()'],
  ['write', "SELECT pg_create_logical_replication_slot('s', 'test_decoding')"],
  ['write', 'REFRESH MATERIALIZED VIEW cached_invoices'],
  // DDL is allowed only through preview/apply, not query.
  ['ddl', 'CREATE TABLE invoice_test (id integer PRIMARY KEY)'],
  ['ddl', 'CREATE SCHEMA billing'],
  ['ddl', 'CREATE VIEW invoice_view AS SELECT id FROM invoices'],
  ['ddl', 'CREATE INDEX invoice_id_idx ON invoices(id)'],
  ['ddl', 'CREATE UNIQUE INDEX invoice_unique_idx ON invoices(id)'],
  ['ddl', 'CREATE SEQUENCE invoice_seq'],
  ['ddl', "COMMENT ON TABLE invoices IS 'sample'"],
  ['ddl', 'GRANT SELECT ON invoices TO analyst'],
  ['ddl', "CREATE TYPE invoice_state AS ENUM ('open', 'closed')"],
  ['ddl', "ALTER TYPE invoice_state ADD VALUE 'paid'"],
  ['ddl', 'CREATE TABLE invoice_copy AS SELECT * FROM invoices'],
  ['ddl', 'ALTER TABLE invoices ADD COLUMN issued_at timestamp'],
  ['ddl', 'ALTER TABLE invoices ADD CONSTRAINT cents_nonnegative CHECK (cents >= 0)'],
  ['ddl', 'ALTER TABLE invoices ALTER COLUMN cents SET DEFAULT 0'],
  ['ddl', 'ALTER TABLE invoices ENABLE ROW LEVEL SECURITY'],
  ['ddl', 'CREATE PUBLICATION invoice_changes FOR TABLE invoices'],
  ['ddl', 'CREATE TYPE amount_record AS (cents integer, label text)'],
  ['ddl', 'CREATE POLICY owner_only ON invoices USING (id > 0)'],
  // Destructive/opaque/unknown statements cannot pass as reads.
  ['destructive', 'DROP TABLE invoices'],
  ['destructive', 'TRUNCATE invoices'],
  ['destructive', 'UPDATE invoices SET cents=0'],
  ['destructive', 'DELETE FROM invoices'],
  ['destructive', 'UPDATE invoices SET cents=0 WHERE true'],
  ['destructive', 'DELETE FROM invoices WHERE 1=1'],
  ['destructive', 'ALTER TABLE invoices DROP COLUMN cents'],
  ['destructive', 'ALTER TABLE invoices ALTER COLUMN cents TYPE bigint'],
  ['destructive', 'ALTER TABLE invoices ALTER COLUMN cents SET NOT NULL'],
  ['destructive', 'ALTER TABLE invoices DISABLE ROW LEVEL SECURITY'],
  ['destructive', 'ALTER TABLE invoices RENAME TO archived_invoices'],
  ['destructive', "DO $$ BEGIN RAISE NOTICE 'testing'; END $$"],
  ['destructive', 'CALL purge_old_invoices()'],
  ['destructive', 'VACUUM FULL invoices'],
  ['destructive', 'ALTER SEQUENCE invoice_seq RESTART WITH 1'],
  ['destructive', 'REVOKE SELECT ON invoices FROM analyst'],
  ['destructive', "SELECT pg_drop_replication_slot('s')"],
  ['destructive', 'EXPLAIN ANALYZE DELETE FROM invoices'],
  ['destructive', 'WITH d AS (DELETE FROM invoices RETURNING id) SELECT id FROM d'],
  // Operations that require another safer tool or are prohibited outright.
  ['refused', 'BEGIN'],
  ['refused', 'COMMIT'],
  ['refused', 'ROLLBACK'],
  ['refused', 'SET statement_timeout = 10000'],
  ['refused', "ALTER SYSTEM SET work_mem = '1MB'"],
  ['refused', 'CREATE ROLE analyst'],
  ['refused', "ALTER ROLE analyst WITH PASSWORD 'not_a_real_password'"],
  ['refused', 'DROP ROLE analyst'],
  ['refused', "COPY invoices TO '/tmp/file.csv'"],
  ['refused', "LOAD 'example'"],
  ['refused', 'CHECKPOINT'],
  ['refused', 'LISTEN updates'],
  ['refused', "NOTIFY updates, 'hello'"],
  ['refused', 'CREATE DATABASE throwaway'],
  ['refused', 'DROP DATABASE throwaway'],
  ['refused', 'CREATE EXTENSION hstore'],
  ['refused', 'ALTER EXTENSION hstore UPDATE'],
  ['refused', 'DROP EXTENSION hstore'],
  ['refused', 'VACUUM invoices'],
  ['refused', 'REINDEX TABLE invoices'],
  ['refused', 'CREATE INDEX CONCURRENTLY invoice_concurrent ON invoices(id)'],
  ['refused', 'SELECT pg_terminate_backend(1)'],
  ['refused', 'SELECT pg_cancel_backend(1)'],
  ['refused', 'SELECT pg_reload_conf()'],
  ['refused', "SELECT set_config('work_mem', '5MB', true)"],
  ['refused', 'SELECT pg_advisory_lock(1)'],
  ['refused', 'SELECT pg_advisory_xact_lock(1)'],
  ['refused', 'SELECT pg_try_advisory_lock(1)'],
  ['refused', "SELECT pg_read_file('/etc/passwd')"],
  ['refused', "SELECT pg_read_binary_file('/etc/passwd')"],
  ['refused', "SELECT pg_ls_dir('/')"],
  ['refused', 'SELECT pg_sleep(6)'],
  ['refused', 'SELECT pg_sleep($1)'],
  ['refused', 'SELECT 1; SELECT 2'],
  ['refused', 'SELECT 1; /* hidden */ DELETE FROM invoices']
];

describe('B-3 fail-closed PostgreSQL AST guard', () => {
  it.each(cases)('%s: %s', async (classification, sql) => {
    const result = await classifySql(sql);
    expect(result.classification, sql).toBe(classification);
  });
  it('exercises at least 60 real PostgreSQL parser cases', () => {
    expect(cases.length).toBeGreaterThanOrEqual(60);
  });
  it('refuses invalid or missing input without leaking SQL into errors', async () => {
    for (const value of [null, '', ' ', 'SELECT * FROM WHERE very_secret_table', 'SELECT 1; SELECT 2']) {
      const answer = await classifySql(value);
      expect(answer.kind).toBe('refused');
      expect(JSON.stringify(answer)).not.toContain('very_secret_table');
    }
  });
  it('identifies both absence of WHERE and constant-true WHERE as full-table', async () => {
    for (const sql of ['DELETE FROM invoices', 'DELETE FROM invoices WHERE true',
      'DELETE FROM invoices WHERE 1=1', 'UPDATE invoices SET cents=0']) {
      expect((await classifySql(sql)).fullTable, sql).toBe(true);
    }
    expect((await classifySql('DELETE FROM invoices WHERE id=1')).fullTable).toBe(false);
  });
  it('keeps nested writes out of the read classifier', async () => {
    expect((await classifySql(
      'WITH d AS (DELETE FROM invoices RETURNING id) SELECT id FROM d'
    )).classification).toBe('destructive');
  });
  it('does not open connections or alter the MCP tool registry', async () => {
    const result = await classifySql('SELECT 42');
    expect(result.kind).toBe('read');
    expect(result.access).toBe(false);
  });
});
