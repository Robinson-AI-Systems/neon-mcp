// Based on Robinson-AI-Systems/stripe-mcp test/helpers/fake-db.js @ e2f90e8
// Test-only OAuth and schema store; imitates PostgreSQL's conditional consumption.
import { SCHEMA_TABLES, connectionSettings } from '../../src/db.js';
import { hashToken } from '../../src/core/oauth.js';

export function createFakeDb({ clock = () => Date.now(), orgs = [] } = {}) {
  const rows = new Map(), tables = new Set(), clients = new Map(), codes = new Map(), tokens = new Map();
  const attempts = [], orgRows = new Map(orgs.map((org) => [org.id, structuredClone(org)]));
  const keys = [], limits = new Map(), outbound = new Map(), inbound = new Map();
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
    async saveNeonOrg({orgId,label}) {
      const prior=orgRows.get(orgId);
      orgRows.set(orgId,{id:orgId,label,production_enabled:prior?.production_enabled||false,
        is_default:prior?.is_default||false});
    },
    async getNeonOrg(orgId) {return structuredClone(orgRows.get(orgId)||null);},
    async saveEncryptedNeonKey({orgId,kind,projectId=null,keyEnc,last4,label=null,reach={}}) {
      if(keys.some(v=>v.org_id===orgId&&v.kind===kind&&v.project_id===projectId&&!v.revoked_at))
        throw new Error('duplicate active key');
      const id=keys.length+1;
      keys.push({id,org_id:orgId,kind,project_id:projectId,key_enc:keyEnc,last4,label,
        reach:structuredClone(reach),added_at:new Date(),checked_at:new Date(),revoked_at:null});
      return {id};
    },
    async rotateEncryptedNeonKey({orgId,kind,projectId=null,expectedVaultId,
      expectedKeyEnc,keyEnc,last4,label,reach}) {
      const row=keys.find(v=>v.org_id===orgId&&v.kind===kind&&
       v.project_id===projectId&&v.id===expectedVaultId&&
       v.key_enc===expectedKeyEnc&&!v.revoked_at);
      if(!row)return false;
      Object.assign(row,{key_enc:keyEnc,last4,label,reach:structuredClone(reach),
       checked_at:new Date()});
      return true;
    },
    async listNeonKeySummaries(orgId) {
      return structuredClone(keys.filter(v=>v.org_id===orgId).map(({key_enc:_cipher,...rest})=>rest));
    },
    async getEncryptedNeonKey({orgId,kind,projectId=null}) {
      const row=keys.find(v=>v.org_id===orgId&&v.kind===kind&&v.project_id===projectId&&!v.revoked_at);
      return row?structuredClone({id:row.id,org_id:row.org_id,kind:row.kind,
        project_id:row.project_id,key_enc:row.key_enc,reach:row.reach}):null;
    },
    async revokeNeonKey({orgId,id}) {
      const row=keys.find(v=>v.org_id===orgId&&v.id===id&&!v.revoked_at);
      if(!row)return false;
      row.revoked_at=new Date();return true;
    },
    async consumeApiBudget({keyHash,windowStart,limit=500}) {
      const id=keyHash+'|'+windowStart.toISOString(),count=limits.get(id)||0;
      if(count>=limit)return {allowed:false,count};
      limits.set(id,count+1);return {allowed:true,count:count+1};
    },
    async pruneApiBudget({before}) {
      let removed=0;
      for(const key of limits.keys()) if(Date.parse(key.split('|')[1])<before.getTime()){
        limits.delete(key);removed++;
      }
      return removed;
    },
    async saveOneTimeSecret({id,orgId,kind,label,ciphertext,expiresAt}) {
      if(outbound.has(id))throw new Error('duplicate outbound id');
      outbound.set(id,{id,neon_org:orgId,kind,label,ciphertext,expires_at:expiresAt.getTime()});
    },
    async getOneTimeSecretInfo(id) {
      const row=outbound.get(id);
      return row&&row.expires_at>clock()?structuredClone({id,neon_org:row.neon_org,
        kind:row.kind,label:row.label,expires_at:new Date(row.expires_at)}):null;
    },
    async consumeOneTimeSecret({id,orgId}) {
      const row=outbound.get(id);
      if(!row||row.neon_org!==orgId)return null;
      outbound.delete(id);
      return row.expires_at>clock()?{kind:row.kind,ciphertext:row.ciphertext}:null;
    },
    async createSecretRequest({id,orgId,tool,purpose,expiresAt}) {
      if(inbound.has(id))throw new Error('duplicate incoming id');
      inbound.set(id,{id,neon_org:orgId,tool,purpose,expires_at:expiresAt.getTime(),ciphertext:null});
    },
    async getSecretRequestInfo(id) {
      const row=inbound.get(id);
      return row&&row.expires_at>clock()?structuredClone({id,neon_org:row.neon_org,
        tool:row.tool,purpose:row.purpose,ready:!!row.ciphertext}):null;
    },
    async fulfillSecretRequest({id,orgId,ciphertext}) {
      const row=inbound.get(id);
      if(!row||row.neon_org!==orgId||row.expires_at<=clock()||row.ciphertext)return false;
      row.ciphertext=ciphertext;return true;
    },
    async consumeSecretRequest({id,orgId}) {
      const row=inbound.get(id);
      if(!row||row.neon_org!==orgId||!row.ciphertext)return null;
      inbound.delete(id);
      return row.expires_at>clock()?{ciphertext:row.ciphertext}:null;
    },
    async tokenRowsForTest() { return structuredClone([...tokens.values()]); }
  };
}
