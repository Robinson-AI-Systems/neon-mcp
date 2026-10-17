import {describe,it,expect} from 'vitest';
import {createFakeDb} from '../../test/helpers/fake-db.js';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {createKeyVault} from '../../src/neon/keys.js';
const org='org-fake-000001';
const me='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const key='napi_FAKE_personal_admin_key_payload_abcdefg';
const fakeKey=n=>Buffer.alloc(32,n).toString('base64url');
const env={VERCEL_ENV:'production',TOKEN_ENCRYPTION_KEY:fakeKey(19)};
function userInfo(){return {
 active_seconds_limit:100,id:me,email:'owner@example.test',login:'owner',
 name:'owner',last_name:'test',image:'',projects_limit:10,branches_limit:10,
 max_autoscaling_limit:2,auth_accounts:[],plan:'launch'
};}
function member(role='admin'){return {
 member:{id:me,user_id:me,org_id:org,role,joined_at:'2026-10-01T00:00:00Z'},
 user:{email:'owner@example.test'}
};}
function fixture({role='admin',method='api_key_user',user=me,hasMembers=true}={}){
 const fake=makeFakeNeon(),db=createFakeDb();
 fake.when('getAuthDetails').resolves({account_id:me,auth_method:method});
 fake.when('getCurrentUserInfo').resolves({...userInfo(),id:user});
 fake.when('getOrganizationMembers').resolves({
  members:hasMembers?[member(role)]:[],pagination:{}});
 const vault=createKeyVault({db,env,fetch:fake.fetch});
 return {fake,db,vault};
}
describe('O-1 privileged personal admin enrollment',()=>{
 it('only saves encrypted secret after personally verified admin and org match',async()=>{
  const f=fixture();
  const enrolled=await f.vault.storeKey({orgId:org,kind:'personal',key});
  expect(enrolled.kind).toBe('personal');
  const selected=await f.vault.keyFor({orgId:org,need:'personal'});
  expect(selected).toEqual({key,kind:'personal',ownerUserId:me});
  const encrypted=await f.db.getEncryptedNeonKey({orgId:org,kind:'personal'});
  expect(encrypted.key_enc).not.toContain(key);
  const rows=await f.vault.listKeys(org);
  expect(JSON.stringify(rows)).not.toContain(key);
  expect(JSON.stringify(rows)).not.toContain('key_enc');
  expect(f.fake.calls.map(c=>c.operationId)).toEqual([
   'getAuthDetails','getCurrentUserInfo','getOrganizationMembers']);
  f.fake.assertClean();
 });
 it('rejects forged personal key, nonadmin user, foreign identity and absent membership',async()=>{
  for(const input of [
   {method:'api_key_org'},{role:'member'},{user:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},
   {hasMembers:false}
  ]){
   const f=fixture(input);
   await expect(f.vault.storeKey({orgId:org,kind:'personal',key})).rejects.toThrow();
   expect(await f.vault.listKeys(org)).toEqual([]);
   f.fake.assertClean();
  }
 });
 it('does not accept elevated keys or expose personal identity in preview deployment',async()=>{
  const f=fixture();
  const v=createKeyVault({db:f.db,env:{...env,VERCEL_ENV:'preview'},fetch:f.fake.fetch});
  await expect(v.storeKey({orgId:org,kind:'personal',key})).rejects.toThrow(/preview/);
  expect((await v.keyFor({orgId:org,need:'personal'})).missing).toMatch(/preview/);
  expect(f.fake.calls).toHaveLength(0);
 });
});
