import {describe,it,expect} from 'vitest';
import {makeNeonClient,call} from '../../src/neon/client.js';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
const org='org-fake-000001',pid='proj-fake-000001',
 mid='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const key='napi_FAKE_not_real_personal_or_org_token';
function client(fake){
 return makeNeonClient({key,orgId:org,fetch:fake.fetch,budget:{
  async consume(){return {allowed:true};}
 }});
}
describe('O-1 new Neon project-member API contract',()=>{
 it('uses exact API paths, per-member roles and bound authorization',async()=>{
  const fake=makeFakeNeon(),neon=client(fake);
  fake.when('listProjectMembers').resolves({members:[{
   member_id:mid,user_id:mid,org_role:'member',project_role:'viewer',
   effective_project_permission:'VIEWER'}]});
  fake.when('setProjectMemberRole').resolves({});
  fake.when('removeProjectMemberRole').resolves({});
  const path={project_id:pid,member_id:mid};
  expect((await call(neon,'listProjectMembers',{path:{project_id:pid}})).data.members).toHaveLength(1);
  expect((await call(neon,'setProjectMemberRole',{path,body:{role:'editor'}},{
   write:true,requestKey:'rmcp_fake_project_member_role'})).confirmed).toBe(true);
  expect((await call(neon,'removeProjectMemberRole',{path},{
   write:true,requestKey:'rmcp_fake_project_member_clear'})).confirmed).toBe(true);
  expect(fake.calls.map(c=>[c.operationId,c.method,c.path,c.auth])).toEqual([
   ['listProjectMembers','GET',`/projects/${pid}/members`,true],
   ['setProjectMemberRole','PUT',`/projects/${pid}/members/${mid}/role`,true],
   ['removeProjectMemberRole','DELETE',`/projects/${pid}/members/${mid}/role`,true]
  ]);
  expect(fake.calls[1].body).toEqual({role:'editor'});
  fake.assertClean();
 });
 it('rejects unsupported extra request fields through the provider-shaped fake',async()=>{
  const fake=makeFakeNeon(),neon=client(fake);
  const res=await call(neon,'setProjectMemberRole',{
   path:{project_id:pid,member_id:mid},
   body:{role:'editor',allowUnknown:true}
  },{write:true,requestKey:'rmcp_fake_invalid_shape'});
  expect(res.confirmed).toBeNull();
  expect(fake.problems).not.toHaveLength(0);
 });
});
