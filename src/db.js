// The Neon MCP service's own tables. No agent tool may run SQL against this database.
import { neon } from '@neondatabase/serverless';

export const SCHEMA_TABLES = Object.freeze([
  'neon_orgs', 'neon_keys', 'oauth_clients', 'oauth_codes', 'oauth_tokens',
  'login_attempts', 'rate_limits', 'change_log', 'one_time_secrets',
  'secret_requests', 'settings'
]);

// Keep this list in step with the code and token tables: refresh must preserve all fields.
export const CONNECTION_FIELDS = Object.freeze(['neon_org', 'project_scope', 'mode', 'profile', 'listing']);

export function connectionSettings(row) {
  if (!row || typeof row !== 'object') throw new TypeError('Connection settings require a row.');
  return Object.fromEntries(CONNECTION_FIELDS.map((field) => [field, row[field]]));
}

function productionSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured. Set it in the Vercel project (docs/DEPLOY.md).');
  return neon(url);
}

export function createDb(sql = productionSql()) {
  if (typeof sql !== 'function') throw new TypeError('Database SQL must be a tagged-template function.');
  return {
    async initSchema() {
      // Additive foundation migration; intentionally never alters or deletes existing data.
      await sql`CREATE TABLE IF NOT EXISTS neon_orgs (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        production_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        production_enabled_at TIMESTAMPTZ,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        added_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS neon_keys (
        id BIGSERIAL PRIMARY KEY,
        org_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('project','org','personal')),
        project_id TEXT,
        key_enc TEXT NOT NULL, last4 TEXT NOT NULL, label TEXT,
        reach JSONB,
        added_at TIMESTAMPTZ NOT NULL DEFAULT now(), checked_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ
      )`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS neon_keys_one_per_scope
        ON neon_keys (org_id, kind, COALESCE(project_id, '')) WHERE revoked_at IS NULL`;
      await sql`CREATE TABLE IF NOT EXISTS oauth_clients (
        client_id TEXT PRIMARY KEY, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS oauth_codes (
        code TEXT PRIMARY KEY, client_id TEXT NOT NULL, data JSONB NOT NULL,
        neon_org TEXT, project_scope TEXT, mode TEXT NOT NULL DEFAULT 'preview',
        profile TEXT NOT NULL DEFAULT 'everyday', listing TEXT NOT NULL DEFAULT 'catalog',
        expires_at TIMESTAMPTZ NOT NULL
      )`;
      await sql`CREATE TABLE IF NOT EXISTS oauth_tokens (
        token_hash TEXT PRIMARY KEY, client_id TEXT, refresh_hash TEXT,
        neon_org TEXT, project_scope TEXT, mode TEXT NOT NULL DEFAULT 'preview',
        profile TEXT NOT NULL DEFAULT 'everyday', listing TEXT NOT NULL DEFAULT 'catalog',
        kind TEXT NOT NULL DEFAULT 'connector',
        expires_at TIMESTAMPTZ, last_used_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS login_attempts (
        id BIGSERIAL PRIMARY KEY, ip TEXT NOT NULL,
        attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(), success BOOLEAN NOT NULL
      )`;
      await sql`CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT NOT NULL, window_start TIMESTAMPTZ NOT NULL,
        count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (key, window_start)
      )`;
      await sql`CREATE TABLE IF NOT EXISTS change_log (
        id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(),
        neon_org TEXT, project_id TEXT, branch_id TEXT, mode TEXT, connection TEXT,
        tool TEXT NOT NULL, target TEXT,
        summary TEXT NOT NULL, before JSONB, after JSONB,
        dry_run BOOLEAN NOT NULL DEFAULT FALSE, production BOOLEAN NOT NULL DEFAULT FALSE,
        spend_month_cents BIGINT,
        request_key TEXT, operation_ids TEXT[], confirmed TEXT,
        restore_lsn TEXT, inverse JSONB, undone_by BIGINT
      )`;
      await sql`CREATE INDEX IF NOT EXISTS change_log_request_key ON change_log (request_key, at)`;
      await sql`CREATE TABLE IF NOT EXISTS one_time_secrets (
        id TEXT PRIMARY KEY, neon_org TEXT, kind TEXT NOT NULL,
        label TEXT NOT NULL, ciphertext TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL, viewed_at TIMESTAMPTZ
      )`;
      await sql`CREATE TABLE IF NOT EXISTS secret_requests (
        id TEXT PRIMARY KEY, neon_org TEXT, tool TEXT NOT NULL,
        purpose TEXT NOT NULL, ciphertext TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ
      )`;
      await sql`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_by TEXT
      )`;
      // Indexes needed for expiring connector grants and temporary secrets.
      await sql`CREATE INDEX IF NOT EXISTS oauth_codes_expires_at ON oauth_codes (expires_at)`;
      await sql`CREATE INDEX IF NOT EXISTS oauth_tokens_refresh_hash ON oauth_tokens (refresh_hash)`;
      await sql`CREATE INDEX IF NOT EXISTS oauth_tokens_expires_at ON oauth_tokens (expires_at)`;
      await sql`CREATE INDEX IF NOT EXISTS login_attempts_ip_attempted_at ON login_attempts (ip, attempted_at)`;
      await sql`CREATE INDEX IF NOT EXISTS one_time_secrets_expires_at ON one_time_secrets (expires_at)`;
      await sql`CREATE INDEX IF NOT EXISTS secret_requests_expires_at ON secret_requests (expires_at)`;
    }
  };
}

export async function initSchema() {
  return createDb().initSchema();
}
