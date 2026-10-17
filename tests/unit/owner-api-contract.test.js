import {describe,it,expect} from 'vitest';
import {makeNeonClient,call} from '../../src/neon/client.js';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
const org='org-fake-000001',project='proj-fake-000001';
const uuid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const time='2026-10-17T10:00:00Z',expires='2026-10-18T10:00:00Z';
const key='napi_FAKE_owner_fixture_key_0000000000000000';
function context(fake){return makeNeonClient({key,orgId:org,fetch:fake.fetch,
 budget:{async consume(){return {allowed:true}}}});}
const writeOptions={write:true,requestKey:'rmcp_fake_owner_operation'};
describe('O-2 pinned provider wire contracts',()=>{
 it('pins personal and organization key list/create/revoke paths and exact bodies',async()=>{
  const fake=makeFakeNeon(),c=context(fake);
  fake.when('listApiKeys').resolves([]);
  fake.when('listOrgApiKeys').resolves([]);
  const created={id:31,name:'robinson-neon-mcp-test-2026-10-17',
   key:'napi_FAKE_new_api_key_one_time_0000000000',created_at:time,created_by:uuid};
  fake.when('createApiKey').resolves(created);
  fake.when('createOrgApiKey').resolves({...created,project_id:project});
  const revoked={id:31,name:created.name,created_at:time,created_by:uuid,
   last_used_from_addr:'192.0.2.21',revoked:true};
  fake.when('revokeApiKey').resolves(revoked);
  fake.when('revokeOrgApiKey').resolves({...revoked,project_id:project});
  expect((await call(c,'listApiKeys')).data).toEqual([]);
  expect((await call(c,'listOrgApiKeys',{path:{org_id:org}})).data).toEqual([]);
  const name=created.name;
  expect((await call(c,'createApiKey',{body:{key_name:name}},writeOptions)).data.id).toBe(31);
  expect((await call(c,'createOrgApiKey',{path:{org_id:org},
   body:{key_name:name,project_id:project}},writeOptions)).data.project_id).toBe(project);
  expect((await call(c,'revokeApiKey',{path:{key_id:31}},writeOptions)).confirmed).toBe(true);
  expect((await call(c,'revokeOrgApiKey',{path:{org_id:org,key_id:31}},
   writeOptions)).confirmed).toBe(true);
  expect(fake.calls.map(x=>[x.method,x.path])).toEqual([
   ['GET','/api_keys'],['GET',`/organizations/${org}/api_keys`],
   ['POST','/api_keys'],['POST',`/organizations/${org}/api_keys`],
   ['DELETE','/api_keys/31'],['DELETE',`/organizations/${org}/api_keys/31`]]);
  expect(fake.calls[3].body).toEqual({key_name:name,project_id:project});
  expect(fake.calls.every(x=>x.auth)).toBe(true);
  fake.assertClean();
 });
 it('pins production transfer request UUID and interorganization write schema',async()=>{
  const fake=makeFakeNeon(),c=context(fake);
  fake.when('createProjectTransferRequest').resolves({
   id:uuid,project_id:project,created_at:time,expires_at:expires},{status:201});
  fake.when('transferProjectsFromOrgToOrg').resolves({});
  const a=await call(c,'createProjectTransferRequest',{
   path:{project_id:project},body:{ttl_seconds:86400}},writeOptions);
  expect(a.data.id).toBe(uuid);
  const b=await call(c,'transferProjectsFromOrgToOrg',{
   path:{source_org_id:org},body:{
    destination_org_id:'org-fake-destination',project_ids:[project]}},writeOptions);
  expect(b.confirmed).toBe(true);
  expect(fake.calls.map(x=>[x.method,x.path])).toEqual([
   ['POST',`/projects/${project}/transfer_requests`],
   ['POST',`/organizations/${org}/projects/transfer`]]);
  expect(fake.calls[0].body).toEqual({ttl_seconds:86400});
  expect(fake.calls[1].body).toEqual({destination_org_id:'org-fake-destination',
   project_ids:[project]});
  fake.assertClean();
 });
});
