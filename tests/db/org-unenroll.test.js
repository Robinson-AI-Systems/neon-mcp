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

describe('CAP-7 organization unenrollment, real disposable Postgres', () => {
  it('previews exact per-org counts and cascades only that org', async () => {
    await db.saveNeonOrg({ orgId: 'org-alpha', label: 'Alpha' });
    await db.saveNeonOrg({ orgId: 'org-beta', label: 'Beta' });
    await db.saveEncryptedNeonKey({ orgId: 'org-alpha', kind: 'org',
      keyEnc: 'enc-fake-a1', last4: '1111' });
    await db.saveEncryptedNeonKey({ orgId: 'org-alpha', kind: 'personal',
      keyEnc: 'enc-fake-a2', last4: '2222' });
    const a3 = await db.saveEncryptedNeonKey({ orgId: 'org-alpha', kind: 'project',
      projectId: 'proj-fake-a', keyEnc: 'enc-fake-a3', last4: '3333' });
    expect(await db.revokeNeonKey({ orgId: 'org-alpha', id: a3.id })).toBe(true);
    await db.saveEncryptedNeonKey({ orgId: 'org-beta', kind: 'org',
      keyEnc: 'enc-fake-b1', last4: '4444' });
    await db.createAccessToken({ accessToken: 'alpha-access', refreshToken: 'alpha-refresh',
      clientId: 'client-x', neonOrg: 'org-alpha' });
    await db.createAccessToken({ accessToken: 'beta-access', refreshToken: 'beta-refresh',
      clientId: 'client-x', neonOrg: 'org-beta' });
    await db.createAuthCode({ code: 'alpha-code', clientId: 'client-x',
      redirectUri: 'https://example.test/callback', codeChallenge: 'Z'.repeat(43),
      neonOrg: 'org-alpha' });
    const sql = neonShapedQuery();
    await sql`INSERT INTO oauth_tokens (token_hash, client_id, neon_org, project_scope,
      mode, profile, listing, kind, expires_at)
      VALUES (${hashToken('alpha-pass')}, 'rtc_CCCCCCCCCCCCCCCC', 'org-alpha', 'proj-fake-a',
        'preview', 'read_only', 'catalog', 'pass', now() + interval '1 hour')`;
    const preview = await db.getNeonOrgRemovalPreview('org-alpha');
    expect(preview.org).toMatchObject({ id: 'org-alpha', label: 'Alpha' });
    expect(preview).toMatchObject({ storedKeys: 3, liveKeys: 2, liveTokens: 2,
      livePasses: 1, pendingCodes: 1 });
    expect(await db.getNeonOrgRemovalPreview('org-missing')).toBeNull();

    const removed = await db.deleteNeonOrg('org-alpha');
    expect(removed).toEqual({ keysRevoked: 2, tokensRevoked: 2, codesRemoved: 1 });
    expect(await db.getNeonOrg('org-alpha')).toBeNull();
    expect((await db.listNeonOrgs()).map((row) => row.id)).toEqual(['org-beta']);
    // Cascade proof: alpha's grants are dead, beta's are untouched.
    expect(await db.getAccessToken('alpha-access')).toBeNull();
    expect(await db.getTokenByRefreshToken('alpha-refresh')).toBeNull();
    expect(await db.getAccessToken('beta-access')).toMatchObject({ neon_org: 'org-beta' });
    const alphaKeys = await rawQuery(
      'SELECT revoked_at FROM neon_keys WHERE org_id = $1 ORDER BY id', ['org-alpha']);
    expect(alphaKeys).toHaveLength(3);
    expect(alphaKeys.every((row) => row.revoked_at)).toBe(true);
    expect(await db.getEncryptedNeonKey({ orgId: 'org-beta', kind: 'org' }))
      .toMatchObject({ key_enc: 'enc-fake-b1' });
    expect(await db.deleteNeonOrg('org-alpha')).toBeNull();
  });

  it('re-enrollment after removal succeeds through the ordinary upsert', async () => {
    await db.saveNeonOrg({ orgId: 'org-alpha', label: 'Alpha Again' });
    expect(await db.getNeonOrg('org-alpha')).toMatchObject({ label: 'Alpha Again' });
    const key = await db.saveEncryptedNeonKey({ orgId: 'org-alpha', kind: 'org',
      keyEnc: 'enc-fake-new', last4: '9999' });
    expect(key.id).toBeTruthy();
    expect(await db.getEncryptedNeonKey({ orgId: 'org-alpha', kind: 'org' }))
      .toMatchObject({ key_enc: 'enc-fake-new' });
  });
});
