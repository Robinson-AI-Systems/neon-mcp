import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,devBranch,responses} from '../../test/helpers/neon-fixtures.js';
import {createBranchWriteHandlers,tools} from '../../src/tools/branch-writes.js';
const json=r=>JSON.parse(r.content[0].text);
function setup({allowed=true,production=false}={}){
 const fake=makeFakeNeon(),events=[];
 const client=makeNeonClient({key:'napi_FAKE_D2_write_fixture',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 const db={
  async recordWritePreview(x){events.push({type:'preview',...x});},
  async reserveWrite(x){events.push({type:'reserve',...x});return {created:true,id:events.length};},
  async completeWrite(x){events.push({type:'complete',...x});}
 };
 const context={db,connection:{neonOrg:IDS.org,projectScope:IDS.project,
  mode:production?'production':'preview',profile:'full'},
  clientFor:async()=>client,writeKey:()=> 'rmcp_branch_write_123456789',
  guards:{checkProtected:async()=>allowed,checkApp:async()=>true,
   checkProduction:async()=>({allowed,production}),
   checkSpend:async()=>true},deploymentEnv:'production'};
 const handlers=createBranchWriteHandlers({contextFor:async()=>context});
 return {fake,events,handlers};
}
const original=()=>({project:project()});
const response=branch=>({...responses.getProjectBranch('dev'),branch});
const before=()=>response(devBranch());
describe('D-2 branch name and protection write contracts',()=>{
 it('registers B-1 audited and closed-schema writes',()=>{
  expect(tools.map(t=>t.name)).toEqual(['neon_branch_rename','neon_branch_set_protected']);
  for(const t of tools){
   expect(t.writes).toBe(true);expect(t.writeContract).toBe('defineWrite-v1');
   expect(t.inputSchema.additionalProperties).toBe(false);
  }
 });
 it('previews rename without provider mutation and verifies confirmed result',async()=>{
  const {fake,handlers,events}=setup();
  fake.when('getProject').resolves(original());
  fake.when('getProjectBranch').resolves(before()).resolves(before())
   .resolves(response(devBranch({name:'new-name'})));
  fake.when('updateProjectBranch').resolves({branch:devBranch({name:'new-name'}),operations:[]});
  const dry=json(await handlers.neon_branch_rename({branchId:IDS.dev,name:'new-name',dryRun:true},{}));
  expect(dry.done).toBe(false);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  const done=json(await handlers.neon_branch_rename({branchId:IDS.dev,name:'new-name',confirm:true},{}));
  expect(done.confirmed).toBe(true);
  expect(fake.calls.find(x=>x.method==='PATCH').body.branch).toEqual({name:'new-name'});
  expect(events.some(e=>e.type==='complete'&&e.confirmed==='true')).toBe(true);
  fake.assertClean();
 });
 it('denies all writes when protection guard refuses',async()=>{
  const {fake,handlers}=setup({allowed:false});
  fake.when('getProject').resolves(original());
  fake.when('getProjectBranch').resolves(before());
  const out=json(await handlers.neon_branch_rename({branchId:IDS.dev,name:'rename',confirm:true},{}));
  expect(out.code).toBe('refused_by_guard');
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('cannot silently remove protection when production permission is not enabled',async()=>{
  const {fake,handlers}=setup({production:true,allowed:false});
  fake.when('getProject').resolves(original());
  fake.when('getProjectBranch').resolves(response(devBranch({protected:true})));
  const result=json(await handlers.neon_branch_set_protected({branchId:IDS.dev,protected:false,confirm:true},{}));
  expect(result.done).toBe(false);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('protects development branches only with confirmed, verified readback',async()=>{
  const {fake,handlers}=setup();
  fake.when('getProject').resolves(original());
  fake.when('getProjectBranch').resolves(before()).resolves(response(devBranch({protected:true})));
  fake.when('updateProjectBranch').resolves({branch:devBranch({protected:true}),operations:[]});
  const out=json(await handlers.neon_branch_set_protected({branchId:IDS.dev,protected:true,confirm:true},{}));
  expect(out.confirmed).toBe(true);
  expect(fake.calls.find(x=>x.method==='PATCH').body.branch).toEqual({protected:true});
  fake.assertClean();
 });
 it('refuses mismatched provider org, branch identity and invalid names',async()=>{
  const {fake,handlers}=setup();
  const bad=json(await handlers.neon_branch_rename({branchId:IDS.dev,name:'\n',confirm:true},{}));
  expect(bad.done).toBe(false);expect(fake.calls).toHaveLength(0);
  fake.when('getProject').resolves({project:project({org_id:'org-fake-other'})});
  const mismatch=json(await handlers.neon_branch_rename({branchId:IDS.dev,name:'rename',confirm:true},{}));
  expect(mismatch.done).toBe(false);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
});
