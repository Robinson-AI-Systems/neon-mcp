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

it('rotates one active server key atomically and rejects racing or foreign CAS attempts',async()=>{
 const orgId='org-rotation-test';
 await db.saveNeonOrg({orgId,label:'Rotation fixture'});
 const scope={orgId,kind:'org',projectId:null};
 const original=await db.saveEncryptedNeonKey({...scope,keyEnc:'v1.old-ciphertext',
  last4:'1111',label:'before',reach:{verified:true,providerKeyId:101}});
 const current=await db.getEncryptedNeonKey(scope);
 expect(current.id).toBe(original.id);
 const change={...scope,expectedVaultId:original.id,expectedKeyEnc:current.key_enc,
  keyEnc:'v1.new-ciphertext',last4:'2222',label:'after',
  reach:{verified:true,providerKeyId:202}};
 const raced=await Promise.all([db.rotateEncryptedNeonKey(change),
  db.rotateEncryptedNeonKey(change)]);
 expect(raced.filter(Boolean)).toHaveLength(1);
 expect(await db.rotateEncryptedNeonKey({...change,orgId:'org-foreign'})).toBe(false);
 expect(await db.rotateEncryptedNeonKey({...change,expectedKeyEnc:'v1.old-ciphertext'})).toBe(false);
 expect((await db.getEncryptedNeonKey(scope)).key_enc).toBe('v1.new-ciphertext');
 const rows=await rawQuery("SELECT count(*)::int AS n FROM neon_keys WHERE org_id='org-rotation-test' AND revoked_at IS NULL");
 expect(rows[0].n).toBe(1);
 expect(await db.getEncryptedNeonKey({orgId:'org-foreign',kind:'org'})).toBeNull();
});
