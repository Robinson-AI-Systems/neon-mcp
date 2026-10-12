import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,mainBranch,devBranch,responses} from '../../test/helpers/neon-fixtures.js';
import {createBranchWriteHandlers,tools} from '../../src/tools/branch-writes.js';
const json=r=>JSON.parse(r.content[0].text);
const br=(record)=>({...responses.getProjectBranch('dev'),branch:record});
const list=(items)=>({branches:items,annotations:{}});
function setup({allowed=true,production=false}={}){
 const fake=makeFakeNeon(),events=[];
 const client=makeNeonClient({key:'napi_FAKE_branch_configuration',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 const db={
  async recordWritePreview(x){events.push({type:'preview',...x})},
  async reserveWrite(x){events.push({type:'reserve',...x});return {created:true,id:events.length}},
  async completeWrite(x){events.push({type:'complete',...x})}
 };
 const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,
  profile:'full',mode:production?'production':'preview'},db,
  clientFor:async()=>client,writeKey:()=> 'rmcp_branch_configuration_123456789',
  deploymentEnv:'production',
  guards:{checkProtected:async()=>allowed,checkApp:async()=>true,
   checkProduction:async()=>({allowed,production}),
   checkSpend:async()=>true}};
 return {fake,events,handlers:createBranchWriteHandlers({contextFor:async()=>ctx})};
}
describe('D-2 branch TTL and default assignment',()=>{
 it('declares guarded write metadata',()=>{
  expect(tools.map(t=>t.name)).toEqual(['neon_branch_rename','neon_branch_set_protected',
   'neon_branch_set_expiration','neon_branch_set_default']);
  for(const t of tools.filter(t=>t.name.includes('expiration')||t.name.includes('default'))){
   expect(t.writes).toBe(true);expect(t.writeContract).toBe('defineWrite-v1');
   expect(t.inputSchema.additionalProperties).toBe(false);
  }
 });
 it('expires a leaf branch only within 30 days, with provider read-back',async()=>{
  const {fake,handlers,events}=setup();
  const expiresAt=new Date(Date.now()+86400000).toISOString().replace(/\.\d{3}Z$/,'Z');
  fake.when('getProject').resolves({project:project()});
  fake.when('getProjectBranch').resolves(br(devBranch())).resolves(
   br(devBranch({expires_at:expiresAt})));
  fake.when('listProjectBranches').resolves(list([mainBranch(),devBranch()]));
  fake.when('updateProjectBranch').resolves({branch:devBranch({expires_at:expiresAt}),operations:[]});
  const out=json(await handlers.neon_branch_set_expiration({
   branchId:IDS.dev,expiresAt,confirm:true},{}));
  expect(out.confirmed).toBe(true);
  expect(fake.calls.find(c=>c.method==='PATCH').body.branch.expires_at).toBe(expiresAt);
  expect(events.some(x=>x.type==='complete'&&x.confirmed==='true')).toBe(true);
  fake.assertClean();
 });
 it('refuses expiry for default or protected branch and all unknown parents',async()=>{
  const {fake,handlers}=setup();
  fake.when('getProject').resolves({project:project()});
  fake.when('getProjectBranch').resolves(br(mainBranch())).resolves(br(devBranch()));
  const soon=new Date(Date.now()+86400000).toISOString().replace(/\.\d{3}Z$/,'Z');
  const denied=json(await handlers.neon_branch_set_expiration({
   branchId:IDS.main,expiresAt:soon,confirm:true},{}));
  expect(denied.done).toBe(false);
  fake.when('listProjectBranches').resolves(list([mainBranch(),devBranch(),
   devBranch({id:'br-fake-child-000003',parent_id:IDS.dev})]));
  const parent=json(await handlers.neon_branch_set_expiration({
   branchId:IDS.dev,expiresAt:soon,confirm:true},{}));
  expect(parent.done).toBe(false);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('refuses expired, over-30-day and ambiguous expiry input with no network',async()=>{
  const {fake,handlers}=setup();
  for(const args of [{branchId:IDS.dev,remove:true,expiresAt:'2030-01-01T00:00:00Z'},
   {branchId:IDS.dev}, {branchId:IDS.dev,expiresAt:'2000-01-01T00:00:00Z'},
   {branchId:IDS.dev,expiresAt:new Date(Date.now()+35*86400000).toISOString()
     .replace(/\.\d{3}Z$/,'Z')}]) {
   expect(json(await handlers.neon_branch_set_expiration({...args,confirm:true},{})).done).toBe(false);
  }
  expect(fake.calls).toHaveLength(0);
 });
 it('default reassignment previews full project impact and refuses without owner production approval',async()=>{
  const {fake,handlers}=setup({allowed:false,production:true});
  fake.when('getProject').resolves({project:project()});
  fake.when('getProjectBranch').resolves(br(devBranch()));
  fake.when('listProjectBranches').resolves(list([mainBranch(),devBranch()]));
  const result=json(await handlers.neon_branch_set_default({branchId:IDS.dev,confirm:true},{}));
  expect(result.done).toBe(false);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('changes default only after protected production approval and reads back both sides',async()=>{
  const {fake,handlers}=setup({production:true});
  fake.when('getProject').resolves({project:project()});
  fake.when('getProjectBranch').resolves(br(devBranch()));
  fake.when('listProjectBranches').resolves(list([mainBranch(),devBranch()]))
   .resolves(list([mainBranch({default:false}),devBranch({default:true})]));
  fake.when('setDefaultProjectBranch').resolves({branch:devBranch({default:true}),operations:[]});
  const result=json(await handlers.neon_branch_set_default({branchId:IDS.dev,confirm:true},{}));
  expect(result.confirmed).toBe(true);
  expect(fake.calls.filter(c=>c.method==='POST')).toHaveLength(1);
  expect(fake.calls.find(c=>c.method==='POST').operationId).toBe('setDefaultProjectBranch');
  fake.assertClean();
 });
});
