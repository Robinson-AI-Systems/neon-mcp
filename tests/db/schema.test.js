import { beforeAll, afterAll, expect, it } from 'vitest';
import { openIsolatedSchema, closeIsolatedSchema, rawQuery, neonShapedQuery } from '../../test/helpers/pg-neon-adapter.js';
import { createDb, SCHEMA_TABLES } from '../../src/db.js';
import { requireLocalDatabaseUrl } from './local-url.js';

let db;
beforeAll(async () => {
  await openIsolatedSchema(requireLocalDatabaseUrl());
  db = createDb(neonShapedQuery());
});
afterAll(async () => { await closeIsolatedSchema(); });

async function indexes() {
  return (await rawQuery("SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() ORDER BY tablename, indexname"));
}
it('creates precisely the 12 planned tables and does not change them on a second call', async () => {
  await db.initSchema();
  const before = await indexes();
  const tables = await rawQuery("SELECT tablename FROM pg_tables WHERE schemaname = current_schema() ORDER BY tablename");
  expect(tables.map((r) => r.tablename)).toEqual([...SCHEMA_TABLES].sort());
  await db.initSchema();
  expect(await indexes()).toEqual(before);
  expect(before.some((r) => r.indexname === 'neon_keys_one_per_scope' && r.indexdef.includes('revoked_at IS NULL'))).toBe(true);
  for (const name of ['change_log_request_key', 'oauth_codes_expires_at', 'oauth_tokens_refresh_hash',
    'oauth_tokens_expires_at', 'login_attempts_ip_attempted_at', 'one_time_secrets_expires_at',
    'secret_requests_expires_at']) expect(before.map((r) => r.indexname)).toContain(name);
});
it('enforces active key uniqueness and permits a key only after its predecessor is revoked', async () => {
  const sql = neonShapedQuery();
  await sql`INSERT INTO neon_keys (org_id, kind, project_id, key_enc, last4)
    VALUES ('org-fake', 'project', 'proj-fake', 'cipher-one', '0001')`;
  await expect(sql`INSERT INTO neon_keys (org_id, kind, project_id, key_enc, last4)
    VALUES ('org-fake', 'project', 'proj-fake', 'cipher-two', '0002')`)
    .rejects.toMatchObject({ code: '23505' });
  await sql`UPDATE neon_keys SET revoked_at = now() WHERE org_id = 'org-fake' AND kind = 'project'`;
  await sql`INSERT INTO neon_keys (org_id, kind, project_id, key_enc, last4)
    VALUES ('org-fake', 'project', 'proj-fake', 'cipher-three', '0003')`;
  await sql`INSERT INTO neon_keys (org_id, kind, project_id, key_enc, last4)
    VALUES ('org-fake', 'org', NULL, 'cipher-four', '0004')`;
  await expect(sql`INSERT INTO neon_keys (org_id, kind, project_id, key_enc, last4)
    VALUES ('org-fake', 'org', NULL, 'cipher-five', '0005')`)
    .rejects.toMatchObject({ code: '23505' });
  await expect(sql`INSERT INTO neon_keys (org_id, kind, key_enc, last4)
    VALUES ('org-fake', 'admin', 'cipher-six', '0006')`)
    .rejects.toMatchObject({ code: '23514' });
});
it('defaults to preview connector mode and records all refresh and scope fields', async () => {
  const sql = neonShapedQuery();
  await sql`INSERT INTO oauth_codes (code, client_id, data, expires_at)
    VALUES ('hash-code-fake', 'client-fake', '{}', now() + interval '1 hour')`;
  await sql`INSERT INTO oauth_tokens (token_hash, refresh_hash, client_id)
    VALUES ('hash-access-fake', 'hash-refresh-fake', 'client-fake')`;
  const [code] = await sql`SELECT mode, profile, listing FROM oauth_codes WHERE code = 'hash-code-fake'`;
  const [token] = await sql`SELECT mode, profile, listing, kind FROM oauth_tokens WHERE token_hash = 'hash-access-fake'`;
  expect(code).toEqual({ mode: 'preview', profile: 'everyday', listing: 'catalog' });
  expect(token).toEqual({ mode: 'preview', profile: 'everyday', listing: 'catalog', kind: 'connector' });
  const columns = await rawQuery("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name IN ('oauth_codes', 'oauth_tokens')");
  for (const table of ['oauth_codes','oauth_tokens']) {
    const names = columns.filter((r) => r.table_name === table).map((r) => r.column_name);
    expect(names).toEqual(expect.arrayContaining(['neon_org', 'project_scope', 'mode', 'profile', 'listing']));
    expect(names).not.toEqual(expect.arrayContaining(['access_token','refresh_token','password','key_plain','plaintext']));
  }
  expect(columns.filter((r) => r.table_name === 'oauth_tokens').map((r) => r.column_name))
    .toEqual(expect.arrayContaining(['token_hash','refresh_hash']));
});
it('production is disabled; audit columns and ciphertext-only stores are present', async () => {
  const sql = neonShapedQuery();
  await sql`INSERT INTO neon_orgs (id, label) VALUES ('org-fake', 'Example')`;
  expect((await sql`SELECT production_enabled FROM neon_orgs WHERE id = 'org-fake'`)[0].production_enabled).toBe(false);
  const columns = await rawQuery("SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name IN ('change_log','neon_keys','one_time_secrets','secret_requests')");
  const names = (table) => columns.filter((r) => r.table_name === table).map((r) => r.column_name);
  expect(names('change_log')).toEqual(expect.arrayContaining(['production', 'spend_month_cents', 'restore_lsn',
    'operation_ids', 'request_key', 'confirmed']));
  expect(columns.find((r) => r.table_name === 'change_log' && r.column_name === 'operation_ids')?.data_type).toBe('ARRAY');
  for (const [table, required] of [['neon_keys','key_enc'], ['one_time_secrets','ciphertext'], ['secret_requests','ciphertext']]) {
    expect(names(table)).toContain(required);
    expect(names(table)).not.toEqual(expect.arrayContaining(['password', 'plaintext', 'key_plain']));
  }
});
