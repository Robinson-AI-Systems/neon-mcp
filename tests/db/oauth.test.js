import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createDb, CONNECTION_FIELDS } from '../../src/db.js';
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

describe('Neon OAuth primitives, real disposable Postgres', () => {
  it('stores only the client secret hash and consumes authorization codes once', async () => {
    await db.createOAuthClient({ clientId: 'client-1', clientSecret: 'fake-secret-only',
      redirectUris: ['https://example.test/callback'], clientName: 'Example' });
    expect((await db.getOAuthClient('client-1')).client_secret_hash).toBe(hashToken('fake-secret-only'));
    const settings = { neonOrg: 'org-fake-one', projectScope: 'proj-fake-one',
      mode: 'preview', profile: 'read_only', listing: 'compact' };
    await db.createAuthCode({ code: 'code-one', clientId: 'client-1',
      redirectUri: 'https://example.test/callback', codeChallenge: 'Z'.repeat(43), ...settings });
    expect((await rawQuery('SELECT code FROM oauth_codes'))[0].code).toBe(hashToken('code-one'));
    expect(await db.consumeAuthCode('code-one')).toMatchObject({
      client_id: 'client-1', neon_org: settings.neonOrg, project_scope: settings.projectScope,
      mode: 'preview', profile: 'read_only', listing: 'compact'
    });
    expect(await db.consumeAuthCode('code-one')).toBeNull();
    await db.createAuthCode({ code: 'expired-code', clientId: 'client-1',
      redirectUri: 'https://example.test/callback', ttlSeconds: -5 });
    expect(await db.consumeAuthCode('expired-code')).toBeNull();
  });
  it('retains all scope settings through an atomic refresh; wrong client and replay fail', async () => {
    const settings = { neonOrg: 'org-fake-two', projectScope: 'proj-fake-two',
      mode: 'preview', profile: 'full', listing: 'compact' };
    await db.createAccessToken({ accessToken: 'access-one', refreshToken: 'refresh-one',
      clientId: 'client-1', ...settings });
    const [stored] = await rawQuery('SELECT token_hash, refresh_hash FROM oauth_tokens');
    expect(stored.token_hash).toBe(hashToken('access-one'));
    expect(stored.refresh_hash).toBe(hashToken('refresh-one'));
    expect(await db.rotateRefreshToken({ refreshToken: 'refresh-one', clientId: 'wrong-client',
      accessToken: 'forged', newRefreshToken: 'forged-refresh' })).toBeNull();
    const input = { refreshToken: 'refresh-one', clientId: 'client-1',
      accessToken: 'access-two', newRefreshToken: 'refresh-two' };
    const results = await Promise.all([db.rotateRefreshToken(input), db.rotateRefreshToken({
      ...input, accessToken: 'access-three', newRefreshToken: 'refresh-three'
    })]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const winner = results.find(Boolean);
    for (const field of CONNECTION_FIELDS) expect(winner[field]).toEqual({
      neon_org: settings.neonOrg, project_scope: settings.projectScope,
      mode: settings.mode, profile: settings.profile, listing: settings.listing
    }[field]);
    expect(await db.getTokenByRefreshToken('refresh-one')).toBeNull();
    expect(await db.getAccessToken('access-one')).toBeNull();
    const active = (await db.getAccessToken('access-two')) ? 'access-two' : 'access-three';
    expect(await db.getAccessToken(active)).toMatchObject({ neon_org: 'org-fake-two',
      project_scope: 'proj-fake-two', profile: 'full', listing: 'compact' });
    expect(await db.revokeAccessToken(active)).toBe(true);
    expect(await db.getAccessToken(active)).toBeNull();
    expect(await db.revokeAccessToken(active)).toBe(false);
  });
  it('retains refresh credentials after access expiry; counts only recent failures for each IP', async () => {
    await db.createAccessToken({ accessToken: 'access-expired', refreshToken: 'refresh-expired',
      clientId: 'client-1', ttlSeconds: -1 });
    expect(await db.getAccessToken('access-expired')).toBeNull();
    expect(await db.getTokenByRefreshToken('refresh-expired')).toMatchObject({ client_id: 'client-1' });
    const attempt = await db.recordLoginAttempt('192.0.2.10');
    expect(await db.countRecentFailedLogins('192.0.2.10', 15)).toBe(1);
    await db.markLoginAttemptSucceeded(attempt);
    expect(await db.countRecentFailedLogins('192.0.2.10', 15)).toBe(0);
    await db.recordLoginAttempt('192.0.2.10');
    expect(await db.countRecentFailedLogins('192.0.2.11', 15)).toBe(0);
    expect(await db.countRecentFailedLogins('192.0.2.10', 15)).toBe(1);
  });
  it('exposes only safe organization fields, with default first', async () => {
    const sql = neonShapedQuery();
    await sql`INSERT INTO neon_orgs (id, label, is_default) VALUES
      ('org-fake-id', 'One', TRUE), ('org-fake-other', 'Two', FALSE)`;
    expect(await db.listNeonOrgs()).toEqual([
      { id: 'org-fake-id', label: 'One', production_enabled: false, is_default: true },
      { id: 'org-fake-other', label: 'Two', production_enabled: false, is_default: false }
    ]);
  });
});
