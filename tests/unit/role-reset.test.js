import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,role,responses,AT} from '../../test/helpers/neon-fixtures.js';
import {tools,createRoleResetHandlers} from '../../src/tools/role-reset.js';
const json=r=>JSON.parse(r.content[0].text);
const name='service_reader';
const before=()=>role(IDS.dev,{name,updated_at:AT});
const after=()=>role(IDS.dev,{name,updated_at:'2026-10-11T13:00:00Z'});
function setup({allowed=true,hasExchange=true,production=false}={}){
 const fake=makeFakeNeon(),stored=[],changes=[];
 const client=makeNeonClient({key:'napi_FAKE_role_reset',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 const db={recordWritePreview:async x=>changes.push(x),
  reserveWrite:async x=>{changes.push(x);return {created:true,id:changes.length}},
  completeWrite:async x=>changes.push(x),
  ...(hasExchange?{saveOneTimeSecret:async x=>stored.push(x),
   consumeSecretRequest:async()=>null}:{})};
 const context={connection:{neonOrg:IDS.org,projectScope:IDS.project,
  mode:'preview',profile:'full'},
  db,clientFor:async()=>client,
  env:{PUBLIC_BASE_URL:'https://fake-owner.invalid',
   TOKEN_ENCRYPTION_KEY:'A'.repeat(43)},deploymentEnv:'production',
  writeKey:()=> 'rmcp_role_reset_12345678',
  guards:{checkProtected:async()=>allowed,checkApp:async()=>allowed,
   checkProduction:async()=>({allowed,production}),checkSpend:async()=>true}};
 return {fake,stored,changes,handlers:createRoleResetHandlers({
  contextFor:async()=>context})};
}
const scope=f=>{
 f.fake.when('getProject').resolves({project:project()});
 f.fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
 f.fake.when('getProjectBranchRole').resolves({role:before()});
};
describe('D-4 guarded role password rotation',()=>{
 it('requires confirmation and one-time secret only under full owner profile',()=>{
  expect(tools[0]).toMatchObject({name:'neon_role_reset_password',
   writes:true,secret:true,access:true,oneTimeOnly:true});
  expect(tools[0].inputSchema.additionalProperties).toBe(false);
  expect(tools[0].profiles).toEqual(['full']);
 });
 it('previews disruption, stores encrypted response, and verifies revision before link',async()=>{
  const f=setup();scope(f);
  const args={branchId:IDS.dev,roleName:name};
  const preview=json(await f.handlers.neon_role_reset_password({...args,dryRun:true},{}));
  expect(preview.preview).toMatch(/existing apps and connection strings/);
  expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
  expect(json(await f.handlers.neon_role_reset_password(args,{})).code)
   .toBe('needs_confirmation');
  f.fake.when('resetProjectBranchRolePassword').resolves({
   role:{...after(),password:'npg_FAKE_rotated_secret'},operations:[]});
  // GET before POST and read-after need different provider revisions.
  f.fake.when('getProjectBranchRole').resolves({role:before()})
   .resolves({role:after()}).resolves({role:after()});
  const done=json(await f.handlers.neon_role_reset_password({...args,confirm:true},{}));
  expect(done.confirmed).toBe(true);
  expect(done.oneTimeSecretLink).toMatch(/^https:\/\/fake-owner.invalid\/api\/neon\/setup\?once=/);
  expect(f.stored).toHaveLength(1);
  expect(f.stored[0].ciphertext).toMatch(/^v1\./);
  expect(f.stored[0].ciphertext).not.toContain('npg_FAKE');
  expect(JSON.stringify({done,changes:f.changes})).not.toMatch(/npg_FAKE_rotated_secret|connection_uri/);
  expect(f.fake.calls.filter(c=>c.method==='POST')).toHaveLength(1);
  f.fake.assertClean();
 });
 it('refuses secret delivery when reset revision does not independently advance',async()=>{
  const f=setup();scope(f);
  f.fake.when('resetProjectBranchRolePassword').resolves({
   role:{...after(),password:'npg_FAKE_unverified_rotation'},operations:[]});
  // Actual readback remains stale despite the POST response.
  f.fake.when('getProjectBranchRole').resolves({role:before()})
   .resolves({role:before()});
  const result=json(await f.handlers.neon_role_reset_password({
   branchId:IDS.dev,roleName:name,confirm:true},{}));
  expect(result.confirmed).toBe('pending');
  expect(result.oneTimeSecretLink).toBeUndefined();
  expect(f.stored).toHaveLength(0);
  expect(f.fake.calls.filter(x=>x.method==='POST')).toHaveLength(1);
  expect(JSON.stringify({result,changes:f.changes})).not.toContain('npg_FAKE_unverified_rotation');
  f.fake.assertClean();
 });
 it('does not contact Neon without secure secret handoff storage',async()=>{
  const f=setup({hasExchange:false});
  const result=json(await f.handlers.neon_role_reset_password({
   branchId:IDS.dev,roleName:name,confirm:true},{}));
  expect(result.done).toBe(false);
  expect(f.fake.calls).toHaveLength(0);
 });
 it('denies protected or production targets without owner approval',async()=>{
  for(const setting of [{allowed:false},{production:true}]){
   const f=setup(setting);scope(f);
   const out=json(await f.handlers.neon_role_reset_password({
    branchId:IDS.dev,roleName:name,confirm:true},{}));
   expect(out.done).toBe(false);
   expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
 it('refuses protected role and does not attempt to reset its password',async()=>{
  const f=setup();
  f.fake.when('getProject').resolves({project:project()});
  f.fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
  f.fake.when('getProjectBranchRole').resolves({role:role(IDS.dev,{
   name,protected:true})});
  expect(json(await f.handlers.neon_role_reset_password({
   branchId:IDS.dev,roleName:name,confirm:true},{})).done).toBe(false);
  expect(f.fake.calls.filter(c=>c.method==='POST')).toHaveLength(0);
  f.fake.assertClean();
 });
});
