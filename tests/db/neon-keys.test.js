import { beforeAll,afterAll,expect,it } from 'vitest';
import { createDb } from '../../src/db.js';
import { openIsolatedSchema,closeIsolatedSchema,neonShapedQuery,rawQuery } from '../../test/helpers/pg-neon-adapter.js';
import { requireLocalDatabaseUrl } from './local-url.js';
let db;
beforeAll(async()=>{await openIsolatedSchema(requireLocalDatabaseUrl());
  db=createDb(neonShapedQuery());await db.initSchema();});
afterAll(async()=>{await closeIsolatedSchema();});
it('persists ciphertext only and never permits duplicate active key scopes',async()=>{
  await db.saveNeonOrg({orgId:'org-fake-test',label:'Fake'});
  expect((await db.getNeonOrg('org-fake-test')).production_enabled).toBe(false);
  const input={orgId:'org-fake-test',kind:'project',projectId:'proj-fake-test',
    keyEnc:'v1.ciphertext-only-test',last4:'1234',reach:{verified:true}};
  const saved=await db.saveEncryptedNeonKey(input);
  const found=await db.getEncryptedNeonKey({orgId:input.orgId,kind:input.kind,projectId:input.projectId});
  expect(found.key_enc).toBe(input.keyEnc);
  expect(JSON.stringify(await db.listNeonKeySummaries(input.orgId))).not.toContain('key_enc');
  expect(await db.getEncryptedNeonKey({orgId:'org-fake-other',kind:'project',
    projectId:input.projectId})).toBeNull();
  await expect(db.saveEncryptedNeonKey({...input,keyEnc:'other-ciphertext'}))
    .rejects.toMatchObject({code:'23505'});
  expect(await db.revokeNeonKey({orgId:input.orgId,id:saved.id})).toBe(true);
  expect(await db.revokeNeonKey({orgId:input.orgId,id:saved.id})).toBe(false);
  expect((await db.saveEncryptedNeonKey({...input,keyEnc:'new-ciphertext'})).id).toBeDefined();
  const query=await rawQuery("SELECT count(*)::int AS total FROM neon_keys WHERE org_id='org-fake-test'");
  expect(query[0].total).toBe(2);
});
