// The Neon MCP service's own tables. No agent tool may run SQL against this database.
import { neon } from '@neondatabase/serverless';
import { hashToken } from './core/oauth.js';
import { validatePricing } from './neon/pricing.js';

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
    /** Atomic shared admission control; keyHash is a one-way hash of the Neon key. */
    async consumeApiBudget({ keyHash, windowStart, limit = 500 }) {
      if (typeof keyHash !== 'string' || !/^[a-f0-9]{64}$/.test(keyHash))
        throw new TypeError('A hashed key identifier is required');
      if (!(windowStart instanceof Date) || !Number.isFinite(windowStart.getTime()) ||
        windowStart.getTime() % 60000 !== 0) throw new TypeError('Window must start on a UTC minute');
      if (!Number.isInteger(limit) || limit < 1 || limit > 699)
        throw new TypeError('API budget must be between 1 and 699 requests per minute');
      const rows = await sql`INSERT INTO rate_limits (key, window_start, count)
        VALUES (${keyHash}, ${windowStart}, 1)
        ON CONFLICT (key, window_start) DO UPDATE
        SET count = rate_limits.count + 1 WHERE rate_limits.count < ${limit}
        RETURNING count`;
      return { allowed: rows.length === 1, count: rows[0]?.count ?? limit };
    },
    /** Opt-in cleanup never deletes the active minute's counter. */
    async pruneApiBudget({ before }) {
      if (!(before instanceof Date) || !Number.isFinite(before.getTime()))
        throw new TypeError('A valid cutoff is required');
      const rows = await sql`DELETE FROM rate_limits WHERE window_start < ${before} RETURNING key`;
      return rows.length;
    },
    async saveNeonOrg({ orgId, label }) {
      if (!orgId || typeof label !== 'string' || !label.trim())
        throw new TypeError('Organization ID and label are required');
      await sql`INSERT INTO neon_orgs (id, label) VALUES (${orgId}, ${label})
        ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label`;
    },
    async getNeonOrg(orgId) {
      const rows = await sql`SELECT id, label, production_enabled, is_default
        FROM neon_orgs WHERE id = ${orgId}`;
      return rows[0] || null;
    },
    async saveEncryptedNeonKey({ orgId, kind, projectId = null, keyEnc, last4, label = null, reach = {} }) {
      if (!orgId || !['project','org','personal'].includes(kind) ||
          (kind === 'project') !== Boolean(projectId) || !keyEnc || typeof last4 !== 'string' ||
          last4.length !== 4) throw new TypeError('Invalid scoped encrypted key metadata');
      const rows = await sql`INSERT INTO neon_keys
        (org_id, kind, project_id, key_enc, last4, label, reach, checked_at)
        VALUES (${orgId}, ${kind}, ${projectId}, ${keyEnc}, ${last4}, ${label},
          ${JSON.stringify(reach)}::jsonb, now()) RETURNING id`;
      return { id: rows[0].id };
    },
    async listNeonKeySummaries(orgId) {
      return await sql`SELECT id, org_id, kind, project_id, last4, label, reach,
        added_at, checked_at, revoked_at FROM neon_keys WHERE org_id = ${orgId}
        ORDER BY added_at DESC`;
    },
    async getEncryptedNeonKey({ orgId, kind, projectId = null }) {
      const rows = await sql`SELECT id, key_enc, kind, org_id, project_id FROM neon_keys
        WHERE org_id = ${orgId} AND kind = ${kind} AND
          COALESCE(project_id, '') = COALESCE(${projectId}, '') AND revoked_at IS NULL
        LIMIT 1`;
      return rows[0] || null;
    },
    async revokeNeonKey({ orgId, id }) {
      const rows = await sql`UPDATE neon_keys SET revoked_at = now()
        WHERE id = ${id} AND org_id = ${orgId} AND revoked_at IS NULL RETURNING id`;
      return rows.length > 0;
    },
    async saveOneTimeSecret({ id, orgId, kind, label, ciphertext, expiresAt }) {
      if (!id || !orgId || !kind || !label || !ciphertext || !(expiresAt instanceof Date))
        throw new TypeError('Missing outbound secret metadata');
      await sql`INSERT INTO one_time_secrets (id, neon_org, kind, label, ciphertext, expires_at)
        VALUES (${id}, ${orgId}, ${kind}, ${label}, ${ciphertext}, ${expiresAt})`;
    },
    async getOneTimeSecretInfo(id) {
      const rows = await sql`SELECT id, neon_org, kind, label, expires_at
        FROM one_time_secrets WHERE id = ${id} AND expires_at > now()
        AND viewed_at IS NULL`;
      return rows[0] || null;
    },
    async consumeOneTimeSecret({ id, orgId }) {
      const rows = await sql`DELETE FROM one_time_secrets
        WHERE id = ${id} AND neon_org = ${orgId} AND expires_at > now()
        AND viewed_at IS NULL RETURNING kind, ciphertext`;
      return rows[0] || null;
    },
    async createSecretRequest({ id, orgId, tool, purpose, expiresAt }) {
      if (!id || !orgId || !tool || !purpose || !(expiresAt instanceof Date))
        throw new TypeError('Missing inbound secret request metadata');
      await sql`INSERT INTO secret_requests (id, neon_org, tool, purpose, expires_at)
        VALUES (${id}, ${orgId}, ${tool}, ${purpose}, ${expiresAt})`;
    },
    async getSecretRequestInfo(id) {
      const rows = await sql`SELECT id, neon_org, tool, purpose, expires_at,
        ciphertext IS NOT NULL AS ready FROM secret_requests
        WHERE id = ${id} AND expires_at > now() AND consumed_at IS NULL`;
      return rows[0] || null;
    },
    async fulfillSecretRequest({ id, orgId, ciphertext }) {
      const rows = await sql`UPDATE secret_requests SET ciphertext = ${ciphertext}
        WHERE id = ${id} AND neon_org = ${orgId} AND expires_at > now()
        AND ciphertext IS NULL AND consumed_at IS NULL RETURNING id`;
      return rows.length === 1;
    },
    async consumeSecretRequest({ id, orgId }) {
      const rows = await sql`DELETE FROM secret_requests
        WHERE id = ${id} AND neon_org = ${orgId} AND expires_at > now()
        AND ciphertext IS NOT NULL AND consumed_at IS NULL RETURNING ciphertext`;
      return rows[0] || null;
    },
    /** Reserve an external write exactly once before sending it to Neon. */
    async reserveWrite({ orgId, projectId = null, branchId = null, mode, connectionId = null,
      tool, target, summary, production = false, requestKey, spendCents = null }) {
      if (!orgId || !tool || !summary || !/^rmcp_[a-z0-9_]{5,128}$/.test(requestKey || ''))
        throw new TypeError('Invalid audit reservation');
      const rows = await sql`INSERT INTO change_log
        (neon_org, project_id, branch_id, mode, connection, tool, target, summary,
         dry_run, production, spend_month_cents, request_key, confirmed)
        VALUES (${orgId}, ${projectId}, ${branchId}, ${mode}, ${connectionId}, ${tool},
          ${target}, ${summary}, FALSE, ${production}, ${spendCents}, ${requestKey}, 'pending')
        ON CONFLICT DO NOTHING RETURNING id`;
      if (rows.length) return { created: true, id: rows[0].id };
      const existing = await sql`SELECT id, neon_org, tool, project_id, branch_id, target, confirmed FROM change_log
        WHERE request_key = ${requestKey} AND dry_run = FALSE LIMIT 1`;
      return { created: false, existing: existing[0] || null };
    },
    /** A preview never reserves a request key and contains no raw customer data. */
    async recordWritePreview({ orgId, projectId = null, branchId = null,
      mode, connectionId = null, tool, target, summary, production = false }) {
      if (!orgId || !tool || typeof summary !== 'string')
        throw new TypeError('Invalid write preview');
      const rows = await sql`INSERT INTO change_log
        (neon_org, project_id, branch_id, mode, connection, tool, target,
         summary, dry_run, production, confirmed)
        VALUES (${orgId}, ${projectId}, ${branchId}, ${mode}, ${connectionId},
          ${tool}, ${target}, ${summary}, TRUE, ${production}, 'preview') RETURNING id`;
      return rows[0].id;
    },
    /** Pending remains uncertain; once finalized, no retry may overwrite the outcome. */
    async completeWrite({ id, orgId, confirmed, operationIds = [], inverse = null }) {
      if (!id || !orgId || !['true','false','pending'].includes(confirmed) ||
          !Array.isArray(operationIds) || operationIds.some(x => typeof x !== 'string'))
        throw new TypeError('Invalid write audit completion');
      const rows = await sql`UPDATE change_log
        SET confirmed = ${confirmed}, operation_ids = ${operationIds},
          inverse = ${inverse ? JSON.stringify(inverse) : null}::jsonb
        WHERE id = ${id} AND neon_org = ${orgId} AND dry_run = FALSE
          AND confirmed = 'pending' RETURNING id`;
      return rows.length === 1;
    },
    /** B-4 stored owner caps and dated rates; never supplied by a write tool. */
    async getSpendPolicy() {
      const rows = await sql`SELECT key, value FROM settings
        WHERE key IN ('spend.cap_per_change_cents','spend.cap_per_day_cents')`;
      const values = Object.fromEntries(rows.map(r => [r.key, r.value]));
      return { perChangeCents: values['spend.cap_per_change_cents'],
        perDayCents: values['spend.cap_per_day_cents'] };
    },
    async getPricing() {
      const rows = await sql`SELECT value FROM settings WHERE key = 'pricing'`;
      return rows[0]?.value || null;
    },
    /** Owner-only setup route must authenticate the caller BEFORE invoking this method. */
    async savePricingFromOwnerSetup({ pricing, confirm = false }) {
      if (confirm !== true || !pricing || pricing.source !== 'https://neon.com/pricing' ||
          typeof pricing.checkedAt !== 'string' ||
          !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(pricing.checkedAt))
        throw new TypeError('Pricing change requires owner confirmation and a dated source');
      validatePricing(pricing);
      await sql`INSERT INTO settings (key, value, updated_by)
        VALUES ('pricing', ${JSON.stringify(pricing)}::jsonb, 'owner_setup')
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value,
          updated_by = 'owner_setup', updated_at = now()`;
      await sql`INSERT INTO change_log (tool, summary, dry_run, confirmed)
        VALUES ('neon_pricing_update', 'Owner updated source-dated pricing table', FALSE, 'true')`;
    },
    /** Atomic PostgreSQL daily counter, shared by all serverless instances. */
    async reserveSpendCapacity({ orgId, increaseCents, dailyCapCents }) {
      if (!orgId || !Number.isSafeInteger(increaseCents) || increaseCents < 0 ||
          !Number.isSafeInteger(dailyCapCents) || dailyCapCents < 0 ||
          dailyCapCents > 2000000000) throw new TypeError('Invalid spend reservation');
      if (increaseCents > dailyCapCents) return false;
      const key = 'spend_daily:' + orgId;
      const rows = await sql`INSERT INTO rate_limits (key, window_start, count)
        SELECT ${key}, date_trunc('day', now()), ${increaseCents}
        ON CONFLICT (key,window_start) DO UPDATE
          SET count = rate_limits.count + EXCLUDED.count
        WHERE rate_limits.count + EXCLUDED.count <= ${dailyCapCents}
        RETURNING count`;
      return rows.length === 1;
    },
    /** Release only a proven duplicate; an ambiguous external write stays reserved. */
    async releaseSpendCapacity({ orgId, increaseCents }) {
      if (!orgId || !Number.isSafeInteger(increaseCents) || increaseCents < 0)
        throw new TypeError('Invalid spend release');
      await sql`UPDATE rate_limits SET count = GREATEST(0, count - ${increaseCents})
        WHERE key = ${'spend_daily:' + orgId} AND window_start = date_trunc('day', now())`;
    },
    /** B-3c: record an exact SQL preview only after its child branch is verified deleted. */
    async recordSqlPreview({ orgId, target, tokenHash, identityHash,
      expectedRows, schemaHash = null, production = false }) {
      if (!orgId || !target?.projectId || !target?.branchId ||
          !/^[a-f0-9]{64}$/.test(tokenHash || '') ||
          !/^[a-f0-9]{64}$/.test(identityHash || '') ||
          !Array.isArray(expectedRows) || expectedRows.length > 20 ||
          expectedRows.some(x => !Number.isSafeInteger(x) || x < 0) ||
          schemaHash != null && !/^[a-f0-9]{64}$/.test(schemaHash))
        throw new TypeError('Invalid exact SQL preview');
      const rows = await sql`INSERT INTO change_log
        (neon_org, project_id, branch_id, mode, tool, target,
         summary, dry_run, production, confirmed, sql_preview_hash, sql_scope_hash,
         sql_expected_rows, sql_schema_hash, sql_preview_expires_at)
        VALUES (${orgId}, ${target.projectId}, ${target.branchId}, 'preview', 'neon_sql_execute',
          ${target.projectId + '/' + target.branchId}, 'Exact child SQL preview',
          TRUE, ${production}, 'preview', ${tokenHash}, ${identityHash},
          ${JSON.stringify(expectedRows)}::jsonb, ${schemaHash},
          now() + interval '30 minutes') RETURNING id`;
      return rows[0]?.id;
    },
    /** Estimate token exists only for verified resource/budget exhaustion. */
    async recordSqlEstimate({ orgId, target, tokenHash, identityHash, estimatedRows }) {
      if (!orgId || !target?.projectId || !target?.branchId ||
          !/^[a-f0-9]{64}$/.test(tokenHash || '') ||
          !/^[a-f0-9]{64}$/.test(identityHash || '') ||
          !Array.isArray(estimatedRows) || estimatedRows.length < 1 ||
          estimatedRows.length > 20 ||
          estimatedRows.some(n => !Number.isSafeInteger(n) || n < 0))
        throw new TypeError('Invalid SQL estimate');
      const rows = await sql`INSERT INTO change_log
        (neon_org, project_id, branch_id, mode, tool, target,
         summary, dry_run, production, confirmed, sql_preview_hash, sql_scope_hash,
         sql_expected_rows, sql_estimate, sql_preview_expires_at)
        VALUES (${orgId}, ${target.projectId}, ${target.branchId}, 'preview', 'neon_sql_execute',
          ${target.projectId + '/' + target.branchId}, 'Non-executing SQL estimate',
          TRUE, TRUE, 'preview', ${tokenHash}, ${identityHash},
          ${JSON.stringify(estimatedRows)}::jsonb, TRUE,
          now() + interval '30 minutes') RETURNING id`;
      return rows[0]?.id;
    },
    /** Atomically consumes a bound preview; never accepts caller-supplied expected rows. */
    async consumeSqlPreview({ orgId, tokenHash, identityHash, target, acceptEstimate = false }) {
      if (!orgId || !target?.projectId || !target?.branchId ||
          !/^[a-f0-9]{64}$/.test(tokenHash || '') ||
          !/^[a-f0-9]{64}$/.test(identityHash || ''))
        throw new TypeError('Invalid SQL preview claim');
      const rows = await sql`UPDATE change_log SET sql_preview_used_at = now()
        WHERE neon_org = ${orgId} AND project_id = ${target.projectId}
          AND branch_id = ${target.branchId} AND sql_preview_hash = ${tokenHash}
          AND sql_scope_hash = ${identityHash} AND dry_run = TRUE
          AND sql_preview_used_at IS NULL AND sql_preview_expires_at > now()
          AND (sql_estimate = FALSE OR ${acceptEstimate === true} = TRUE)
        RETURNING sql_expected_rows, sql_schema_hash, production, sql_estimate`;
      return rows[0] || null;
    },
    /** Persist a validated pre-write WAL restore point on the exact pending SQL audit. */
    async recordSqlRestoreLsn({ orgId, id, lsn }) {
      if (!orgId || !id || typeof lsn !== 'string' ||
          !/^[0-9a-f]{1,8}\/[0-9a-f]{1,8}$/i.test(lsn))
        throw new TypeError('Invalid SQL restore checkpoint');
      const rows = await sql`UPDATE change_log SET restore_lsn = ${lsn}
        WHERE id = ${id} AND neon_org = ${orgId} AND tool = 'neon_sql_execute'
          AND dry_run = FALSE AND confirmed = 'pending' AND restore_lsn IS NULL
        RETURNING id`;
      return rows.length === 1;
    },
    /** Persisted affected-row tolerance; absent/malformed values fail closed in SQL apply. */
    async getSqlAffectedRowsTolerance() {
      const rows = await sql`SELECT value FROM settings WHERE key = 'sql.affected_rows_tolerance'`;
      return rows.length ? rows[0].value : null;
    },
    /** Database-backed IN-09 defaults; never rely on an untrusted caller's SQL policy. */
    async getSqlReadPolicy() {
      const rows = await sql`SELECT value FROM settings WHERE key = 'sql.read_policy'`;
      return rows.length ? rows[0].value : null;
    },
    /** Owner-managed list only; callers of a write guard must also supply verified self identity. */
    async getProtectedResources() {
      const rows = await sql`SELECT value FROM settings WHERE key = 'protected_resources'`;
      return rows.length ? rows[0].value : [];
    },
    /** Only the passphrase-protected owner setup route may invoke this write. */
    async saveProtectedResourcesFromSetup(resources) {
      if (!Array.isArray(resources)) throw new TypeError('Expected protected resources');
      await sql`INSERT INTO settings (key, value, updated_by)
        VALUES ('protected_resources', ${JSON.stringify(resources)}::jsonb, 'owner_setup')
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value,
          updated_by = 'owner_setup', updated_at = now()`;
    },
    /** Requests only intent. This never enables production without the owner setup step. */
    async requestProductionEnable({ orgId, requestedBy = 'connector' }) {
      if (typeof orgId !== 'string' || !orgId ||
          typeof requestedBy !== 'string' || requestedBy.length > 120)
        throw new TypeError('Invalid organization intent');
      const key = 'production_intent:' + orgId;
      const rows = await sql`INSERT INTO settings (key, value, updated_by)
        SELECT ${key},
          jsonb_build_object('expiresAt', now() + interval '10 minutes'), 'mcp_request'
        FROM neon_orgs WHERE id = ${orgId} AND production_enabled = FALSE
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_by = 'mcp_request', updated_at = now()
        RETURNING key`;
      return rows.length === 1;
    },
    async getPendingProductionEnable(orgId) {
      if (typeof orgId !== 'string' || !orgId) return null;
      const rows = await sql`SELECT value->>'expiresAt' AS expires_at FROM settings
        WHERE key = ${'production_intent:' + orgId}
          AND (value->>'expiresAt')::timestamptz > now()`;
      return rows[0] || null;
    },
    /** Atomic consume-and-enable; only the passphrase-protected setup route calls it. */
    async completeProductionEnable({ orgId }) {
      if (typeof orgId !== 'string' || !orgId) return false;
      const rows = await sql`WITH claimed AS (
        DELETE FROM settings WHERE key = ${'production_intent:' + orgId}
          AND (value->>'expiresAt')::timestamptz > now() RETURNING key
      ) UPDATE neon_orgs SET production_enabled = TRUE,
          production_enabled_at = now()
        WHERE id = ${orgId} AND EXISTS(SELECT 1 FROM claimed) RETURNING id`;
      return rows.length === 1;
    },
    /** Stop immediately and invalidate pending requests. No owner activation gate needed to disable. */
    async disableProduction({ orgId }) {
      if (typeof orgId !== 'string' || !orgId) return false;
      const rows = await sql`WITH cleared AS (
        DELETE FROM settings WHERE key = ${'production_intent:' + orgId} RETURNING key
      ) UPDATE neon_orgs SET production_enabled = FALSE, production_enabled_at = NULL
        WHERE id = ${orgId} RETURNING id`;
      return rows.length === 1;
    },
    /** Return only nonsecret active connection metadata scoped to a trusted organization. */
    async listConnectionSummaries(orgId, limit = 30) {
      if(typeof orgId!=='string' || !orgId || !Number.isInteger(limit) || limit<1 || limit>50)
        throw new TypeError('Invalid organization or page size');
      return sql`SELECT client_id,kind,profile,mode,listing,project_scope,last_used_at,expires_at
        FROM oauth_tokens WHERE neon_org = ${orgId} AND revoked_at IS NULL
          AND expires_at > now() ORDER BY expires_at DESC LIMIT ${limit}`;
    },
    async listRecentChanges({orgId,tool=null,projectId=null,includePreviews=false,limit=20}) {
      if(typeof orgId!=='string' || !orgId || !Number.isInteger(limit) || limit<1 || limit>50 ||
        (tool!==null && (typeof tool!=='string' || tool.length>100)) ||
        (projectId!==null && (typeof projectId!=='string' || projectId.length>120)))
        throw new TypeError('Invalid change-log filter');
      return sql`SELECT id,project_id,branch_id,tool,target,summary,mode,production,dry_run,
          confirmed,created_at,spend_month_cents
        FROM change_log WHERE neon_org = ${orgId}
          AND (${tool}::text IS NULL OR tool = ${tool})
          AND (${projectId}::text IS NULL OR project_id = ${projectId})
          AND (${includePreviews}::boolean = true OR dry_run = false)
        ORDER BY id DESC LIMIT ${limit}`;
    },
    async listSafeSettings() {
      return sql`SELECT key,value,updated_at FROM settings WHERE key IN
        ('protected_resources','pricing','spend.cap_per_change_cents',
        'spend.cap_per_day_cents','sql.read_policy','sql.affected_rows_tolerance',
        'operation_wait_seconds','neon_api_budget_per_minute','default_region')
        ORDER BY key`;
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
      await sql`ALTER TABLE change_log ADD COLUMN IF NOT EXISTS sql_preview_hash TEXT`;
      await sql`ALTER TABLE change_log ADD COLUMN IF NOT EXISTS sql_scope_hash TEXT`;
      await sql`ALTER TABLE change_log ADD COLUMN IF NOT EXISTS sql_expected_rows JSONB`;
      await sql`ALTER TABLE change_log ADD COLUMN IF NOT EXISTS sql_schema_hash TEXT`;
      await sql`ALTER TABLE change_log ADD COLUMN IF NOT EXISTS sql_preview_expires_at TIMESTAMPTZ`;
      await sql`ALTER TABLE change_log ADD COLUMN IF NOT EXISTS sql_preview_used_at TIMESTAMPTZ`;
      await sql`ALTER TABLE change_log ADD COLUMN IF NOT EXISTS sql_estimate BOOLEAN NOT NULL DEFAULT FALSE`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS change_log_sql_preview_hash
        ON change_log (sql_preview_hash) WHERE sql_preview_hash IS NOT NULL`;
      await sql`CREATE INDEX IF NOT EXISTS change_log_request_key ON change_log (request_key, at)`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS change_log_one_apply_key
        ON change_log (request_key) WHERE request_key IS NOT NULL AND dry_run = FALSE`;
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
      await sql`INSERT INTO settings (key, value, updated_by)
        VALUES ('sql.read_policy', '{"productionReads":true,"maxRows":200}'::jsonb, 'system_default_IN-09')
        ON CONFLICT (key) DO NOTHING`;
      await sql`INSERT INTO settings (key, value, updated_by)
        VALUES ('sql.affected_rows_tolerance', '0'::jsonb, 'system_default_design_B-3')
        ON CONFLICT (key) DO NOTHING`;
      await sql`INSERT INTO settings (key, value, updated_by) VALUES
        ('spend.cap_per_change_cents', '2500'::jsonb, 'system_default_IN-10'),
        ('spend.cap_per_day_cents', '5000'::jsonb, 'system_default_IN-10'),
        ('pricing', '{"source":"https://neon.com/pricing","checkedAt":"2026-10-10","ratesMicro":{"launchCuHour":106000,"scaleCuHour":222000,"storageGbMonth":350000,"instantRestoreGbMonth":200000,"scheduledSnapshotGbMonth":90000,"extraBranchMonth":1500000,"egressGb":100000},"included":{"launchBranches":10,"scaleBranches":25,"egressGb":500}}'::jsonb, 'system_default_design')
        ON CONFLICT (key) DO NOTHING`;
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
