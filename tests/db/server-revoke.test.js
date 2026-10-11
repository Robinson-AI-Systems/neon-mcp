import {beforeAll,afterAll,it,expect} from 'vitest';
import {createDb} from '../../src/db.js';
import {openIsolatedSchema,closeIsolatedSchema,neonShapedQuery,rawQuery} from '../../test/helpers/pg-neon-adapter.js';
import {requireLocalDatabaseUrl} from './local-url.js';
let db;
beforeAll(async()=>{await openIsolatedSchema(requireLocalDatabaseUrl());
  db=createDb(neonShapedQuery());await db.initSchema();});
afterAll(async()=>{await closeIsolatedSchema();});
it('revokes only selected org/client grants; never another organization or current other client',async()=>{
  await db.createAccessToken({accessToken:'fake-a',clientId:'client-A',neonOrg:'org-A'});
  await db.createAccessToken({accessToken:'fake-a2',clientId:'client-A',neonOrg:'org-A'});
  await db.createAccessToken({accessToken:'fake-b',clientId:'client-B',neonOrg:'org-B'});
  expect(await db.getActiveScopedConnection({orgId:'org-A',clientId:'client-A'})).toMatchObject({client_id:'client-A'});
  expect(await db.revokeScopedConnection({orgId:'org-B',clientId:'client-A'})).toBe(false);
  expect(await db.revokeScopedConnection({orgId:'org-A',clientId:'client-A'})).toBe(true);
  expect(await db.getActiveScopedConnection({orgId:'org-A',clientId:'client-A'})).toBeNull();
  expect(await db.getAccessToken('fake-a')).toBeNull();
  expect(await db.getAccessToken('fake-a2')).toBeNull();
  expect(await db.getAccessToken('fake-b')).toBeTruthy();
  expect(await db.revokeScopedConnection({orgId:'org-A',clientId:'client-A'})).toBe(false);
  const rows=await rawQuery("SELECT count(*)::integer AS total FROM oauth_tokens WHERE neon_org='org-A' AND revoked_at IS NOT NULL");
  expect(rows[0].total).toBe(2);
});
it('rejects malformed selectors before making any SQL call',async()=>{
  await expect(db.getActiveScopedConnection({orgId:'org-A',clientId:'bad/one'})).rejects.toThrow();
  await expect(db.revokeScopedConnection({orgId:'',clientId:'client-A'})).rejects.toThrow();
});
