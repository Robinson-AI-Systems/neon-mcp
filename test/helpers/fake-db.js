// Based on Robinson-AI-Systems/stripe-mcp test/helpers/fake-db.js @ e2f90e8
// Test-only OAuth and schema store; imitates PostgreSQL's conditional consumption.
import { SCHEMA_TABLES, connectionSettings } from '../../src/db.js';
import { hashToken } from '../../src/core/oauth.js';

export function createFakeDb({ clock = () => Date.now(), orgs = [] } = {}) {
  const rows = new Map(), tables = new Set(), clients = new Map(), codes = new Map(), tokens = new Map();
  const attempts = [], orgRows = new Map(orgs.map((org) => [org.id, structuredClone(org)]));
  return {
    async initSchema() { SCHEMA_TABLES.forEach((name) => tables.add(name)); },
    async listTables() { return [...tables]; },
    async put(key, value) { rows.set(key, structuredClone(value)); },
    async get(key) { return rows.has(key) ? structuredClone(rows.get(key)) : null; },
    async createOAuthClient({ clientId, clientSecret, redirectUris, clientName }) {
      if (!clientId || !clientSecret || !Array.isArray(redirectUris) || !redirectUris.length)
        throw new TypeError('Missing OAuth client registration fields');
      if (clients.has(clientId)) throw new Error('duplicate client');
      clients.set(clientId, { client_id: clientId, client_secret_hash: hashToken(clientSecret),
        redirect_uris: structuredClone(redirectUris), client_name: clientName || null });
    },
    async getOAuthClient(clientId) { return structuredClone(clients.get(clientId) || null); },
    async createAuthCode({ code, clientId, redirectUri, codeChallenge, codeChallengeMethod = 'S256',
      neonOrg = null, projectScope = null, mode = 'preview', profile = 'everyday',
      listing = 'catalog', ttlSeconds = 600 }) {
      codes.set(hashToken(code), { client_id: clientId, redirect_uri: redirectUri,
        code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod,
        neon_org: neonOrg, project_scope: projectScope, mode, profile, listing,
        expires_at: clock() + ttlSeconds * 1000 });
    },
    async consumeAuthCode(code) {
      if (typeof code !== 'string' || !code) return null;
      const key = hashToken(code);
      const row = codes.get(key);
      codes.delete(key);
      return row && row.expires_at > clock()
        ? structuredClone(Object.fromEntries(Object.entries(row).filter(([name]) => name !== 'expires_at')))
        : null;
    },
    async createAccessToken({ accessToken, refreshToken, clientId, neonOrg = null,
      projectScope = null, mode = 'preview', profile = 'everyday', listing = 'catalog', ttlSeconds = 3600 }) {
      tokens.set(hashToken(accessToken), { token_hash: hashToken(accessToken),
        refresh_hash: refreshToken ? hashToken(refreshToken) : null,
        client_id: clientId, neon_org: neonOrg, project_scope: projectScope, mode, profile,
        listing, kind: 'connector', expires_at: clock() + ttlSeconds * 1000, revoked_at: null });
    },
    async getAccessToken(accessToken) {
      if (typeof accessToken !== 'string' || !accessToken) return null;
      const row = tokens.get(hashToken(accessToken));
      if (!row || row.revoked_at || row.expires_at <= clock() || row.kind !== 'connector') return null;
      return structuredClone({ client_id: row.client_id, ...connectionSettings(row),
        kind: row.kind, expires_at: new Date(row.expires_at), revoked_at: null });
    },
    async getTokenByRefreshToken(refreshToken) {
      if (typeof refreshToken !== 'string' || !refreshToken) return null;
      const row = [...tokens.values()].find((value) => value.refresh_hash === hashToken(refreshToken)
        && !value.revoked_at && value.kind === 'connector');
      return row ? structuredClone({ client_id: row.client_id, ...connectionSettings(row) }) : null;
    },
    async rotateRefreshToken({ refreshToken, clientId, accessToken, newRefreshToken, ttlSeconds = 3600 }) {
      const row = [...tokens.values()].find((value) => value.refresh_hash === hashToken(refreshToken)
        && value.client_id === clientId && !value.revoked_at && value.kind === 'connector');
      if (!row) return null;
      tokens.delete(row.token_hash);
      row.token_hash = hashToken(accessToken);
      row.refresh_hash = hashToken(newRefreshToken);
      row.expires_at = clock() + ttlSeconds * 1000;
      tokens.set(row.token_hash, row);
      return structuredClone({ client_id: row.client_id, ...connectionSettings(row) });
    },
    async revokeAccessToken(accessToken) {
      if (typeof accessToken !== 'string' || !accessToken) return false;
      const row = tokens.get(hashToken(accessToken));
      if (!row || row.revoked_at) return false;
      row.revoked_at = clock() || 1;
      return true;
    },
    async recordLoginAttempt(ip) {
      const id = attempts.length + 1;
      attempts.push({ id, ip, success: false, at: clock() });
      return id;
    },
    async markLoginAttemptSucceeded(id) {
      const attempt = attempts.find((value) => value.id === id);
      if (attempt) attempt.success = true;
    },
    async countRecentFailedLogins(ip, minutes = 15) {
      return attempts.filter((attempt) => attempt.ip === ip && !attempt.success
        && attempt.at > clock() - minutes * 60000).length;
    },
    async listNeonOrgs() {
      return structuredClone([...orgRows.values()].sort((a,b) => Number(!!b.is_default) - Number(!!a.is_default)));
    },
    async tokenRowsForTest() { return structuredClone([...tokens.values()]); }
  };
}
