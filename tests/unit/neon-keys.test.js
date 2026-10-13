import { expect,it } from 'vitest';
import { createFakeDb } from '../../test/helpers/fake-db.js';
import { makeFakeNeon } from '../../test/helpers/fake-neon.js';
import * as fx from '../../test/helpers/neon-fixtures.js';
import { createKeyVault,keySetupMessage,KeySetupError } from '../../src/neon/keys.js';

const fakeKey=(n)=>Buffer.alloc(32,n).toString('base64url');
const env={TOKEN_ENCRYPTION_KEY:fakeKey(23),VERCEL_ENV:'preview'};
const key='napi_FAKE_abcdefghijklmnopqrstuvw';
it('reports safe authentication stage and status without returning provider secrets',async()=>{
  const db=createFakeDb();
  const vault=createKeyVault({db,env,fetch:async()=>new Response(JSON.stringify({
    code:'FORBIDDEN',message:'Bearer '+key+' raw private provider details'
  }),{status:403,headers:{'content-type':'application/json'}})});
  let failure;
  try{await vault.storeKey({orgId:fx.IDS.org,kind:'project',projectId:fx.IDS.project,key});}
  catch(error){failure=error;}
  expect(failure).toBeInstanceOf(KeySetupError);
  expect(keySetupMessage(failure)).toContain('authentication_failed / Neon HTTP 403');
  expect(keySetupMessage(failure)).not.toContain(key);
  expect(keySetupMessage(failure)).not.toContain('raw private');
  expect(await vault.listKeys(fx.IDS.org)).toEqual([]);
  expect(keySetupMessage(new Error(key))).toBeNull();
});
it('separates encryption and storage failures and permits adding after stored revocation',async()=>{
  const {db,vault,fake}=fixture();
  const missing=createKeyVault({db,env:{VERCEL_ENV:'preview'},fetch:fake.fetch});
  await expect(missing.storeKey({orgId:fx.IDS.org,kind:'project',projectId:fx.IDS.project,key}))
    .rejects.toMatchObject({code:'encryption_unavailable'});
  expect(fake.calls).toHaveLength(0);
  const original=await vault.storeKey({orgId:fx.IDS.org,kind:'project',projectId:fx.IDS.project,key});
  expect(await vault.revokeKey({orgId:fx.IDS.org,id:original.id})).toBe(true);
  const replacement=await vault.storeKey({orgId:fx.IDS.org,kind:'project',projectId:fx.IDS.project,key});
  expect(replacement.id).not.toBe(original.id);
  db.saveEncryptedNeonKey=async()=>{throw Object.assign(new Error(key),{code:'23505'});};
  await expect(vault.storeKey({orgId:fx.IDS.org,kind:'project',projectId:fx.IDS.project,key}))
    .rejects.toMatchObject({code:'duplicate_key'});
  db.saveEncryptedNeonKey=async()=>{throw new Error(key);};
  await expect(vault.storeKey({orgId:fx.IDS.org,kind:'project',projectId:fx.IDS.project,key}))
    .rejects.toMatchObject({code:'storage_failed'});
});
function fixture(){
  const fake=makeFakeNeon();
  fake.when('getAuthDetails').resolves({account_id:'fake-owner',auth_method:'api_key_user'});
  fake.when('getProject').resolves({project:fx.project()});
  fake.when('listProjects').rejects(404,{code:'NOT_FOUND',message:'inventory unavailable'});
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
  expect(fake.calls.map(x=>x.operationId)).toEqual(['getAuthDetails','getProject']);
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
  fake.when('getProject').resolves({project:fx.project({id:'proj-fake-wrong'})});
  const db=createFakeDb();
  const vault=createKeyVault({db,env,fetch:fake.fetch});
  await expect(vault.storeKey({orgId:fx.IDS.org,kind:'project',projectId:fx.IDS.project,key}))
    .rejects.toThrow(/cannot access/);
  expect(await vault.listKeys(fx.IDS.org)).toEqual([]);
});

it('rejects a different organization or missing identity from the selected project',async()=>{
  for(const org_id of ['org-fake-foreign',undefined]){
    const fake=makeFakeNeon();
    fake.when('getAuthDetails').resolves({account_id:'fake-owner',auth_method:'api_key_org'});
    const project=fx.project();
    if(org_id)project.org_id=org_id;else delete project.org_id;
    fake.when('getProject').resolves({project});
    const db=createFakeDb();
    const vault=createKeyVault({db,env,fetch:fake.fetch});
    await expect(vault.storeKey({orgId:fx.IDS.org,kind:'project',projectId:fx.IDS.project,key}))
      .rejects.toMatchObject({code:'organization_mismatch'});
    expect(await vault.listKeys(fx.IDS.org)).toEqual([]);
  }
});

it('keeps direct project denial fail-closed without falling back to inventory or another key',async()=>{
  const fake=makeFakeNeon();
  fake.when('getAuthDetails').resolves({account_id:'fake-owner',auth_method:'api_key_org'});
  fake.when('getProject').rejects(404,{code:'NOT_FOUND',message:'not found'});
  const db=createFakeDb();
  const vault=createKeyVault({db,env,fetch:fake.fetch});
  await expect(vault.storeKey({orgId:fx.IDS.org,kind:'project',projectId:fx.IDS.project,key}))
    .rejects.toMatchObject({code:'project_probe_failed',status:404});
  expect(fake.calls.map(c=>c.operationId)).toEqual(['getAuthDetails','getProject']);
  expect(fake.calls[1].params.project_id).toBe(fx.IDS.project);
  expect(await vault.listKeys(fx.IDS.org)).toEqual([]);
});

it('rechecks an encrypted stored project key without revealing bytes or using a wider key',async()=>{
 const fake=makeFakeNeon();
 fake.when('getAuthDetails').resolves({account_id:'fake-owner',auth_method:'api_key_user'});
 fake.when('getProject').resolves({project:fx.project()});
 const db=createFakeDb();
 const vault=createKeyVault({db,env:{...env,VERCEL_ENV:'production'},fetch:fake.fetch});
 await vault.storeKey({orgId:fx.IDS.org,projectId:fx.IDS.project,kind:'project',key});
 const out=await vault.checkStoredKeyAccess({orgId:fx.IDS.org});
 expect(out.checked).toBe(1);
 expect(out.keys[0]).toMatchObject({kind:'project',reachable:true,organizationActions:false});
 expect(JSON.stringify(out)).not.toContain(key);
 expect(JSON.stringify(out)).not.toContain('key_enc');
 fake.assertClean();
});
