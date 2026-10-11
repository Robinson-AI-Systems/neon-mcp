import { expect,it } from 'vitest';
import { createFakeDb } from '../../test/helpers/fake-db.js';
import { makeFakeNeon } from '../../test/helpers/fake-neon.js';
import * as fx from '../../test/helpers/neon-fixtures.js';
import { createKeyVault } from '../../src/neon/keys.js';

const fakeKey=(n)=>Buffer.alloc(32,n).toString('base64url');
const env={TOKEN_ENCRYPTION_KEY:fakeKey(23),VERCEL_ENV:'preview'};
const key='napi_FAKE_abcdefghijklmnopqrstuvw';
function fixture(){
  const fake=makeFakeNeon();
  fake.when('getAuthDetails').resolves({account_id:'fake-owner',auth_method:'api_key_user'});
  fake.when('listProjects').resolves({projects:[{...fx.project(),active_time:0}],
    pagination:{cursor:'fake-cursor'},applications:{},integrations:{}});
  const db=createFakeDb();
  return {fake,db,vault:createKeyVault({db,env,fetch:fake.fetch})};
}
it('verifies a project-scoped key, stores ciphertext only, and selects the narrowest scope',async()=>{
  const {fake,db,vault}=fixture();
  const added=await vault.storeKey({orgId:fx.IDS.org,orgLabel:'Fake organization',
    projectId:fx.IDS.project,kind:'project',key});
  expect(added).toMatchObject({orgId:fx.IDS.org,kind:'project',projectId:fx.IDS.project,
    last4:key.slice(-4)});
  expect(added).not.toHaveProperty('key');
  const encrypted=await db.getEncryptedNeonKey({orgId:fx.IDS.org,kind:'project',
    projectId:fx.IDS.project});
  expect(encrypted.key_enc).not.toContain(key);
  expect(JSON.stringify(await vault.listKeys(fx.IDS.org))).not.toContain(key);
  expect(JSON.stringify(await vault.listKeys(fx.IDS.org))).not.toContain('key_enc');
  expect(await vault.keyFor({orgId:fx.IDS.org,projectId:fx.IDS.project,need:'project'}))
    .toEqual({key,kind:'project'});
  expect((await vault.keyFor({orgId:fx.IDS.org,projectId:'proj-fake-other'})).missing).toMatch(/scoped/);
  expect(fake.calls.map(x=>x.operationId)).toEqual(['getAuthDetails','listProjects']);
  fake.assertClean();
});
it('refuses org keys on preview and cannot decrypt ciphertext with a rotated master key',async()=>{
  const {db,vault}=fixture();
  await expect(vault.storeKey({orgId:fx.IDS.org,kind:'org',key}))
    .rejects.toThrow(/preview/);
  expect((await vault.keyFor({orgId:fx.IDS.org,need:'org'})).missing).toMatch(/preview/);
  const other=createKeyVault({db,env:{...env,TOKEN_ENCRYPTION_KEY:fakeKey(24)}});
  const token=(await vault.storeKey({orgId:fx.IDS.org,kind:'project',projectId:fx.IDS.project,key})).id;
  await expect(other.keyFor({orgId:fx.IDS.org,projectId:fx.IDS.project})).rejects.toThrow(/decrypt/);
  expect(await vault.revokeKey({orgId:fx.IDS.org,id:token})).toBe(true);
  expect(await vault.revokeKey({orgId:fx.IDS.org,id:token})).toBe(false);
});
it('does not store a key that fails Neon identity or project checks',async()=>{
  const fake=makeFakeNeon();
  fake.when('getAuthDetails').resolves({account_id:'fake-owner',auth_method:'api_key_user'});
  fake.when('listProjects').resolves({projects:[],pagination:{cursor:'fake-cursor'},
    applications:{},integrations:{}});
  const db=createFakeDb();
  const vault=createKeyVault({db,env,fetch:fake.fetch});
  await expect(vault.storeKey({orgId:fx.IDS.org,kind:'project',projectId:fx.IDS.project,key}))
    .rejects.toThrow(/cannot access/);
  expect(await vault.listKeys(fx.IDS.org)).toEqual([]);
});
