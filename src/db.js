// The Neon MCP service's own tables. No agent tool may run SQL against this database.
import { neon } from '@neondatabase/serverless';
import { hashToken } from './core/oauth.js';

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

    // OAuth client registration and authentication (always persist token and client secret hashes).
    async createOAuthClient({ clientId, clientSecret, redirectUris, clientName }) {
      if (!clientId || !clientSecret || !Array.isArray(redirectUris) || !redirectUris.length)
        throw new TypeError('Missing OAuth client registration fields');
      const data = JSON.stringify({
        client_secret_hash: hashToken(clientSecret), redirect_uris: redirectUris,
        client_name: clientName || null
      });
      await sql`INSERT INTO oauth_clients (client_id, data) VALUES (${clientId}, ${data}::jsonb)`;
    },
    async getOAuthClient(clientId) {
      const rows = await sql`SELECT client_id, data FROM oauth_clients WHERE client_id = ${clientId}`;
      return rows[0] ? { client_id: rows[0].client_id, ...rows[0].data } : null;
    },
    async createAuthCode({ code, clientId, redirectUri, codeChallenge, codeChallengeMethod = 'S256',
      neonOrg = null, projectScope = null, mode = 'preview', profile = 'everyday',
      listing = 'catalog', ttlSeconds = 600 }) {
      const data = JSON.stringify({
        redirect_uri: redirectUri, code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod
      });
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      await sql`INSERT INTO oauth_codes
        (code, client_id, data, neon_org, project_scope, mode, profile, listing, expires_at)
        VALUES (${hashToken(code)}, ${clientId}, ${data}::jsonb, ${neonOrg}, ${projectScope},
          ${mode}, ${profile}, ${listing}, ${expiresAt})`;
    },
    async consumeAuthCode(code) {
      if (typeof code !== 'string' || !code) return null;
      const rows = await sql`DELETE FROM oauth_codes WHERE code = ${hashToken(code)}
        AND expires_at > now() RETURNING client_id, data, neon_org, project_scope, mode, profile, listing`;
      const row = rows[0];
      return row ? { client_id: row.client_id, ...row.data, ...connectionSettings(row) } : null;
    },
    async createAccessToken({ accessToken, refreshToken, clientId, neonOrg = null,
      projectScope = null, mode = 'preview', profile = 'everyday', listing = 'catalog', ttlSeconds = 3600 }) {
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      await sql`INSERT INTO oauth_tokens
        (token_hash, refresh_hash, client_id, neon_org, project_scope, mode, profile, listing, expires_at)
        VALUES (${hashToken(accessToken)}, ${refreshToken ? hashToken(refreshToken) : null},
          ${clientId}, ${neonOrg}, ${projectScope}, ${mode}, ${profile}, ${listing}, ${expiresAt})`;
    },
    async getAccessToken(accessToken) {
      if (typeof accessToken !== 'string' || !accessToken) return null;
      const rows = await sql`SELECT client_id, neon_org, project_scope, mode, profile, listing, kind,
        expires_at, revoked_at FROM oauth_tokens WHERE token_hash = ${hashToken(accessToken)}
        AND expires_at > now() AND revoked_at IS NULL AND kind = 'connector'`;
      return rows[0] || null;
    },
    async getTokenByRefreshToken(refreshToken) {
      if (typeof refreshToken !== 'string' || !refreshToken) return null;
      const rows = await sql`SELECT client_id, neon_org, project_scope, mode, profile, listing
        FROM oauth_tokens WHERE refresh_hash = ${hashToken(refreshToken)}
        AND revoked_at IS NULL AND kind = 'connector'`;
      return rows[0] || null;
    },
    async rotateRefreshToken({ refreshToken, clientId, accessToken, newRefreshToken,
      ttlSeconds = 3600 }) {
      // The conditional UPDATE atomically consumes the prior refresh hash once.
      // All connection settings remain on this row, even after access-token expiry.
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      const rows = await sql`UPDATE oauth_tokens SET
        token_hash = ${hashToken(accessToken)}, refresh_hash = ${hashToken(newRefreshToken)},
        expires_at = ${expiresAt}, last_used_at = NULL
        WHERE refresh_hash = ${hashToken(refreshToken)} AND client_id = ${clientId}
          AND revoked_at IS NULL AND kind = 'connector'
        RETURNING client_id, neon_org, project_scope, mode, profile, listing`;
      const row = rows[0];
      return row ? { client_id: row.client_id, ...connectionSettings(row) } : null;
    },
    async revokeAccessToken(accessToken) {
      if (typeof accessToken !== 'string' || !accessToken) return false;
      const rows = await sql`UPDATE oauth_tokens SET revoked_at = now()
        WHERE token_hash = ${hashToken(accessToken)} AND revoked_at IS NULL
        RETURNING token_hash`;
      return rows.length > 0;
    },
    async recordLoginAttempt(ip) {
      const rows = await sql`INSERT INTO login_attempts (ip, success) VALUES (${ip}, FALSE) RETURNING id`;
      return rows[0].id;
    },
    async markLoginAttemptSucceeded(id) {
      await sql`UPDATE login_attempts SET success = TRUE WHERE id = ${id}`;
    },
    async countRecentFailedLogins(ip, minutes = 15) {
      const rows = await sql`SELECT count(*)::integer AS count FROM login_attempts
        WHERE ip = ${ip} AND success = FALSE
          AND attempted_at > now() - ${minutes} * interval '1 minute'`;
      return rows[0].count;
    },
    async listNeonOrgs() {
      return await sql`SELECT id, label, production_enabled, is_default FROM neon_orgs
        ORDER BY is_default DESC, added_at ASC`;
    },
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
