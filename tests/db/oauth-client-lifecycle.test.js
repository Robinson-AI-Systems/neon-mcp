import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createDb } from '../../src/db.js';
import { hashToken } from '../../src/core/oauth.js';
import { openIsolatedSchema, closeIsolatedSchema, neonShapedQuery, rawQuery } from '../../test/helpers/pg-neon-adapter.js';
import { requireLocalDatabaseUrl } from './local-url.js';

let db;
beforeAll(async () => {
  await openIsolatedSchema(requireLocalDatabaseUrl());
  db = createDb(neonShapedQuery());
  await db.initSchema();
});
afterAll(async () => { await closeIsolatedSchema(); });

describe('CAP-6 OAuth client registration lifecycle, real disposable Postgres', () => {
  it('lists safe summaries with token counts and never any secret material', async () => {
    await db.createOAuthClient({ clientId: 'client-alpha', clientSecret: 'fake-secret-alpha',
      redirectUris: ['https://example.test/callback'], clientName: 'Alpha' });
    await db.createOAuthClient({ clientId: 'client-beta', redirectUris: ['https://example.test/beta'],
      clientName: 'Beta', tokenEndpointAuthMethod: 'none', clientSecret: null });
    await db.createAccessToken({ accessToken: 'alpha-access', refreshToken: 'alpha-refresh',
      clientId: 'client-alpha', neonOrg: 'org-fake' });
    await db.createAuthCode({ code: 'alpha-code', clientId: 'client-alpha',
      redirectUri: 'https://example.test/callback', codeChallenge: 'Z'.repeat(43) });
    const list = await db.listOAuthClients();
    expect(list.map((row) => row.clientId)).toEqual(['client-alpha', 'client-beta']);
    const alpha = list[0];
    expect(alpha).toMatchObject({ clientName: 'Alpha', hasClientSecret: true,
      tokenEndpointAuthMethod: 'client_secret_post', tokens: { total: 1, live: 1 }, pendingCodes: 1 });
    expect(list[1]).toMatchObject({ clientName: 'Beta', hasClientSecret: false,
      tokenEndpointAuthMethod: 'none', tokens: { total: 0, live: 0 }, pendingCodes: 0 });
    const serialized = JSON.stringify(list);
    expect(serialized).not.toContain('client_secret_hash');
    expect(serialized).not.toContain(hashToken('fake-secret-alpha'));
    expect(serialized).not.toContain('fake-secret-alpha');
    expect(await db.getOAuthClientSummary('client-alpha')).toMatchObject({ clientId: 'client-alpha' });
    expect(await db.getOAuthClientSummary('client-missing')).toBeNull();
  });

  it('updates metadata only; the stored credential is preserved verbatim', async () => {
    const before = await db.getOAuthClient('client-alpha');
    expect(await db.updateOAuthClient({ clientId: 'client-alpha', clientName: 'Alpha Renamed',
      redirectUris: ['https://example.test/new-callback'] })).toBe(true);
    const after = await db.getOAuthClient('client-alpha');
    expect(after.client_name).toBe('Alpha Renamed');
    expect(after.redirect_uris).toEqual(['https://example.test/new-callback']);
    expect(after.client_secret_hash).toBe(before.client_secret_hash);
    expect(after.token_endpoint_auth_method).toBe('client_secret_post');
    expect(await db.updateOAuthClient({ clientId: 'client-missing', clientName: 'Nope' })).toBe(false);
    await expect(db.updateOAuthClient({ clientId: 'client-alpha' })).rejects.toThrow();
    await expect(db.updateOAuthClient({ clientId: 'client-alpha', redirectUris: [] })).rejects.toThrow();
  });

  it('deletes a registration, revokes its tokens and clears its codes; other clients untouched', async () => {
    await db.createAccessToken({ accessToken: 'beta-access', refreshToken: 'beta-refresh',
      clientId: 'client-beta', neonOrg: 'org-fake' });
    const result = await db.deleteOAuthClient('client-alpha');
    expect(result).toEqual({ tokensRevoked: 1, codesRemoved: 1 });
    expect(await db.getOAuthClient('client-alpha')).toBeNull();
    expect(await db.getOAuthClientSummary('client-alpha')).toBeNull();
    expect(await db.getAccessToken('alpha-access')).toBeNull();
    expect(await db.getTokenByRefreshToken('alpha-refresh')).toBeNull();
    expect(await db.deleteOAuthClient('client-alpha')).toBeNull();
    expect(await db.getAccessToken('beta-access')).toMatchObject({ client_id: 'client-beta' });
    expect((await db.listOAuthClients()).map((row) => row.clientId)).toEqual(['client-beta']);
  });

  it('lists RTC passes for an organization with created and revoked state', async () => {
    const sql = neonShapedQuery();
    await sql`INSERT INTO oauth_tokens (token_hash, client_id, neon_org, project_scope,
      mode, profile, listing, kind, expires_at, revoked_at)
      VALUES (${hashToken('pass-token-one')}, 'rtc_AAAAAAAAAAAAAAAA', 'org-fake', 'proj-fake',
        'preview', 'read_only', 'catalog', 'pass', now() + interval '1 hour', NULL),
        (${hashToken('pass-token-two')}, 'rtc_BBBBBBBBBBBBBBBB', 'org-fake', 'proj-fake',
        'preview', 'read_only', 'catalog', 'pass', now() + interval '1 hour', now())`;
    const passes = await db.listRtcPasses('org-fake');
    expect(passes).toHaveLength(2);
    expect(passes.map((row) => row.pass_id).sort()).toEqual(
      ['rtc_AAAAAAAAAAAAAAAA', 'rtc_BBBBBBBBBBBBBBBB']);
    for (const row of passes) {
      expect(row.created_at).toBeTruthy();
      expect(JSON.stringify(row)).not.toContain('pass-token');
      expect(JSON.stringify(row)).not.toContain(hashToken('pass-token-one'));
    }
    expect(passes.find((row) => row.pass_id === 'rtc_BBBBBBBBBBBBBBBB').revoked_at).toBeTruthy();
    expect(passes.find((row) => row.pass_id === 'rtc_AAAAAAAAAAAAAAAA').revoked_at).toBeNull();
    expect(await db.listRtcPasses('org-other')).toEqual([]);
  });
});

describe('CAP-8 revoked-row purge, real disposable Postgres', () => {
  it('hard-deletes only revoked keys and revoked or expired tokens; live rows survive', async () => {
    // Baseline: clear rows left revoked by the lifecycle cases above (the
    // deleted client's revoked token, the revoked pass) so counts are exact.
    await db.purgeRevokedStoredRecords();
    expect(await db.countPurgeableStoredRecords()).toEqual({ neonKeys: 0, oauthTokens: 0 });
    const live = await db.saveEncryptedNeonKey({ orgId: 'org-fake', kind: 'org',
      keyEnc: 'enc-fake-live', last4: '1111' });
    const dead = await db.saveEncryptedNeonKey({ orgId: 'org-fake', kind: 'personal',
      keyEnc: 'enc-fake-dead', last4: '2222' });
    expect(await db.revokeNeonKey({ orgId: 'org-fake', id: dead.id })).toBe(true);
    await db.createAccessToken({ accessToken: 'purge-live', refreshToken: 'purge-live-refresh',
      clientId: 'client-beta', neonOrg: 'org-fake' });
    await db.createAccessToken({ accessToken: 'purge-revoked', refreshToken: 'purge-revoked-refresh',
      clientId: 'client-beta', neonOrg: 'org-fake' });
    expect(await db.revokeAccessToken('purge-revoked')).toBe(true);
    await db.createAccessToken({ accessToken: 'purge-expired', clientId: 'client-beta',
      neonOrg: 'org-fake', ttlSeconds: -5 });
    expect(await db.countPurgeableStoredRecords()).toEqual({ neonKeys: 1, oauthTokens: 2 });
    expect(await db.purgeRevokedStoredRecords()).toEqual({ neonKeys: 1, oauthTokens: 2 });
    expect(await db.countPurgeableStoredRecords()).toEqual({ neonKeys: 0, oauthTokens: 0 });
    expect(await db.purgeRevokedStoredRecords()).toEqual({ neonKeys: 0, oauthTokens: 0 });
    expect(await db.getEncryptedNeonKey({ orgId: 'org-fake', kind: 'org' }))
      .toMatchObject({ id: live.id });
    expect(await db.getAccessToken('purge-live')).toMatchObject({ client_id: 'client-beta' });
    const remainingKeys = await rawQuery('SELECT id FROM neon_keys');
    expect(remainingKeys.map((row) => String(row.id))).toEqual([String(live.id)]);
  });
});
