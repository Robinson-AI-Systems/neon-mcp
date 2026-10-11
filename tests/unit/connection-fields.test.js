import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CONNECTION_FIELDS, connectionSettings } from '../../src/db.js';
import { createFakeDb } from '../../test/helpers/fake-db.js';

it('all connection fields on code and token tables are explicitly copied', () => {
  const source = readFileSync(new URL('../../src/db.js', import.meta.url), 'utf8');
  for (const name of ['oauth_codes', 'oauth_tokens']) {
    const segment = source.match(new RegExp('CREATE TABLE IF NOT EXISTS ' + name + ' \\(([\\s\\S]*?)\\)\\`'))?.[1];
    expect(segment, 'missing schema for ' + name).toBeTruthy();
    const fields = segment.match(/\b(?:neon_org|project_scope|mode|profile|listing)\b(?=\s+TEXT)/g) || [];
    expect(fields).toEqual(CONNECTION_FIELDS);
  }
  expect(connectionSettings({ neon_org: 'org-fake', project_scope: 'proj-fake',
    mode: 'preview', profile: 'read_only', listing: 'compact' })).toEqual({
    neon_org: 'org-fake', project_scope: 'proj-fake',
    mode: 'preview', profile: 'read_only', listing: 'compact'
  });
});
it('fake reflects the single-use and rotating refresh contracts', async () => {
  const db = createFakeDb();
  await db.createAuthCode({ code: 'fake-code', clientId: 'fake-client' });
  expect(await db.consumeAuthCode('fake-code')).toMatchObject({ client_id: 'fake-client' });
  expect(await db.consumeAuthCode('fake-code')).toBeNull();
  await db.createAccessToken({ accessToken: 'fake-a', refreshToken: 'fake-r', clientId: 'fake-client',
    neonOrg: 'org-fake', projectScope: 'proj-fake', listing: 'compact' });
  const first = await db.rotateRefreshToken({ refreshToken: 'fake-r', clientId: 'fake-client',
    accessToken: 'fake-b', newRefreshToken: 'fake-s' });
  expect(first).toMatchObject({ neon_org: 'org-fake', project_scope: 'proj-fake', listing: 'compact' });
  expect(await db.rotateRefreshToken({ refreshToken: 'fake-r', clientId: 'fake-client',
    accessToken: 'fake-c', newRefreshToken: 'fake-t' })).toBeNull();
});
