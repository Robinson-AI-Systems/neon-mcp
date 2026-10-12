import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,role,responses} from '../../test/helpers/neon-fixtures.js';
import {createRoleCreateHandlers,tools} from '../../src/tools/role-create.js';
const json=r=>JSON.parse(r.content[0].text);
function make({allowed=true,secretReady=true,mode='preview'}={}){
 const fake=makeFakeNeon(),audits=[],saved=[];
 const client=makeNeonClient({key:'napi_FAKE_D4_role_create',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 const db={recordWritePreview:async v=>audits.push(v),
  reserveWrite:async v=>{audits.push(v);return {created:true,id:audits.length}},
  completeWrite:async v=>audits.push(v),
  ...(secretReady?{saveOneTimeSecret:async v=>saved.push(v),
   consumeSecretRequest:async()=>null}:{})};
 const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,mode,profile:'full'},
  db,clientFor:async()=>client,deploymentEnv:'production',
  env:{PUBLIC_BASE_URL:'https://fake-owner.invalid',TOKEN_ENCRYPTION_KEY:'A'.repeat(43)},
  writeKey:()=> 'rmcp_role_create_123456789',
  guards:{checkProtected:async()=>allowed,checkApp:async()=>allowed,
   checkProduction:async()=>({allowed,production:false}),checkSpend:async()=>true}};
 const handlers=createRoleCreateHandlers({contextFor:async()=>ctx});
 return {fake,handlers,audits,saved,ctx};
}
function reads(fake){
 fake.when('getProject').resolves({project:project()});
 fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
 fake.when('listProjectBranchRoles').resolves({roles:[role(IDS.dev)]});
}
describe('D-4 password-safe role creation',()=>{
 it('declares secret one-time delivery and B-1 confirmation gates',()=>{
  expect(tools[0]).toMatchObject({name:'neon_role_create',writes:true,
   secret:true,access:true,oneTimeOnly:true,secretRoute:'/api/neon/setup'});
  expect(tools[0].profiles).toEqual(['full']);
  expect(tools[0].inputSchema.additionalProperties).toBe(false);
 });
 it('previews then confirms a role and stores only an encrypted password',async()=>{
  const f=make();reads(f.fake);
  const args={branchId:IDS.dev,name:'report_reader'};
  const preview=json(await f.handlers.neon_role_create({...args,dryRun:true},{}));
  expect(preview.done).toBe(false);
  expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
  expect(json(await f.handlers.neon_role_create(args,{})).code).toBe('needs_confirmation');
  f.fake.when('createProjectBranchRole').resolves({role:role(IDS.dev,{
   name:'report_reader',password:'npg_FAKE_secret_value'}),operations:[]});
  f.fake.when('getProjectBranchRole').resolves({role:role(IDS.dev,{name:'report_reader'})});
  const output=json(await f.handlers.neon_role_create({...args,confirm:true},{}));
  expect(output.confirmed).toBe(true);
  expect(output.oneTimeSecretLink).toMatch(/^https:\/\/fake-owner.invalid\/api\/neon\/setup\?once=/);
  expect(f.saved).toHaveLength(1);
  expect(f.saved[0].ciphertext).toMatch(/^v1\./);
  expect(f.saved[0].ciphertext).not.toContain('npg_FAKE');
  expect(JSON.stringify({output,audits:f.audits})).not.toMatch(/npg_FAKE|password|connection_uri/);
  const posts=f.fake.calls.filter(c=>c.method==='POST');
  expect(posts).toHaveLength(1);
  expect(posts[0].body.role).toEqual({name:'report_reader'});
  f.fake.assertClean();
 });
 it('refuses invalid encryption/storage before provider or SQL access',async()=>{
  const f=make({secretReady:false});
  const result=json(await f.handlers.neon_role_create({
   branchId:IDS.dev,name:'new_reader',confirm:true},{}));
  expect(result.done).toBe(false);
  expect(f.fake.calls).toHaveLength(0);
 });
 it('denies protected resources and duplicate role names without role writes',async()=>{
  const f=make({allowed:false});reads(f.fake);
  const denied=json(await f.handlers.neon_role_create({
   branchId:IDS.dev,name:'new_reader',confirm:true},{}));
  expect(denied.done).toBe(false);
  expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
  f.fake.assertClean();
  const dup=make();reads(dup.fake);
  const already=json(await dup.handlers.neon_role_create({
   branchId:IDS.dev,name:'neondb_owner',confirm:true},{}));
  expect(already.done).toBe(false);
  expect(dup.fake.calls.every(c=>c.method==='GET')).toBe(true);
  dup.fake.assertClean();
 });
});
