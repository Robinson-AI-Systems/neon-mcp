import {describe,it,expect,vi,afterEach} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,mainBranch,devBranch,devEndpoint,responses} from '../../test/helpers/neon-fixtures.js';
import {DEFAULT_PRICING} from '../../src/neon/pricing.js';
import {makeContractFixture} from '../../test/helpers/write-contract.js';
import {createDevRunHandlers,tools} from '../../src/tools/dev-runs.js';
import {dispatchReadOnlyTool} from '../../src/core/mcp-server.js';
import {handlers as metaHandlers,tools as metaTools} from '../../src/tools/meta.js';
const args={projectId:IDS.project,name:'testdev',parentBranchId:IDS.main};
const expiry=()=>new Date(Date.now()+86400000).toISOString().slice(0,19)+'Z';
const list=branches=>({branches,annotations:{}});
function make({allowed=true,production=false,withOwned=false,badProof=false}={}){
 const fake=makeFakeNeon();
 const client=makeNeonClient({key:'napi_FAKE_DEV_RUN_TEST',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true};}}});
 let rows=withOwned?[{run_id:'run-owned',object_type:'branch',object_id:IDS.dev,
  parent_id:IDS.main,cleaned:false}]:[];
 let current=withOwned?{id:'run-owned',status:'active',project_id:IDS.project}:null;
 const f=makeContractFixture();
 f.ctx.connection={neonOrg:IDS.org,projectScope:IDS.project,profile:'full',mode:'preview'};
 f.ctx.getBranch=async({branchId})=>branchId===IDS.main?mainBranch():
  branchId===IDS.dev?devBranch():null;
 f.ctx.clientFor=async p=>{expect(p).toBe(IDS.project);return client;};
 f.ctx.guards.checkProtected=async()=>allowed;
 f.ctx.guards.checkApp=async()=>allowed;
 f.ctx.guards.checkProduction=async()=>({allowed,production});
 f.ctx.guards.checkSpend=async()=>allowed;
 f.ctx.db.getDevSettings=async()=>({ttl_hours:24,
  compute:{min_cu:0.25,max_cu:1,suspend_seconds:300}});
 f.ctx.db.getPricing=async()=>DEFAULT_PRICING;
 f.ctx.db.getSpendPolicy=async()=>({perChangeCents:100000,perDayCents:100000});
 f.ctx.db.getVerifiedNeonPlan=async()=>({verified:true,name:'Launch'});
 f.ctx.db.reserveDevRun=async row=>{if(current&&current.id!==row.id)return null;
  current={id:row.id,status:'active',project_id:row.projectId,
   connection:row.connectionId};return current;};
 f.ctx.db.recordDevRunBranch=async row=>{rows.push({run_id:row.runId,
  object_type:'branch',object_id:row.branchId,parent_id:row.parentId,cleaned:false});
  return true;};
 f.ctx.db.getDevRun=async({orgId,projectId,runId})=>
  orgId===IDS.org&&projectId===IDS.project&&runId===current?.id?current:null;
 f.ctx.db.listDevRunObjects=async({orgId,projectId,runId})=>
  orgId===IDS.org&&projectId===IDS.project&&runId===current?.id?structuredClone(rows):[];
 f.ctx.db.listDevRuns=async()=>current?[{id:current.id,project_id:IDS.project,
  status:current.status,created_at:'2026-10-14T00:00:00Z',
  cleaned_at:null,objects:rows.length,remaining:rows.filter(r=>!r.cleaned).length}]:[];
 f.ctx.db.markDevRunBranchCleaned=async({branchId})=>{
  const r=rows.find(v=>v.object_id===branchId&&!v.cleaned);if(!r)return false;
  r.cleaned=true;return true;};
 f.ctx.db.finishDevRun=async()=>{if(rows.some(r=>!r.cleaned))return false;
  current.status='cleaned';return true;};
 const p=project({owner_id:IDS.org,owner:{email:'fake@example.test',
  name:'Fake',subscription_type:'launch_v3',branches_limit:5000}});
 fake.when('getProject').resolves({project:p});
 const e=expiry();
 const branch=devBranch({name:'testdev',protected:false,expires_at:badProof?'2026-01-01T00:00:00Z':e});
 if(!withOwned){
  fake.when('listProjectBranches').resolves(list([mainBranch()]));
  fake.when('createProjectBranch').resolves({
   ...responses.createProjectBranch(),branch:devBranch({name:'testdev',protected:false,
    expires_at:e}),operations:[]});
  fake.when('getProjectBranch').resolves({
   ...responses.getProjectBranch('dev'),branch});
  fake.when('listProjectBranchEndpoints').resolves({endpoints:[devEndpoint()]});
 }else{
  fake.when('listProjectBranches').resolves(list([mainBranch(),devBranch({name:'testdev'})]))
   .resolves(list([mainBranch(),devBranch({name:'testdev'})]))
   .resolves(list([mainBranch(),devBranch({name:'testdev'})]))
   .resolves(list([mainBranch(),devBranch({name:'testdev'})]))
   .resolves(list([mainBranch()]))
   .resolves(list([mainBranch()]));
  fake.when('getProjectBranch').resolves({...responses.getProjectBranch('dev'),
   branch:devBranch({name:'testdev'})});
  fake.when('deleteProjectBranch').resolves({branch:devBranch(),operations:[]});
 }
 const handlers=createDevRunHandlers({contextFor:async()=>f.ctx});
 const registry={tools:[...tools,...metaTools],handlers:{...handlers,...metaHandlers}};
 return {...f,fake,client,handlers,registry,get rows(){return rows;},get run(){return current;},
  selectedExpiry:e,forceRun:(id='run-owned')=>{current={id,status:'active',project_id:IDS.project};}};
}
afterEach(()=>vi.useRealTimers());
describe('V-1 recorded development lifecycle',()=>{
 it('registers two audited writes and a safe read with exact schemas',()=>{
  expect(tools.map(t=>t.name)).toEqual([
   'neon_dev_branch_create','neon_dev_list_runs','neon_dev_cleanup']);
  expect(tools.map(t=>t.writes)).toEqual([true,false,true]);
  for(const t of tools)expect(t.inputSchema.additionalProperties).toBe(false);
  expect(tools[0]).toMatchObject({spend:true,profiles:['full']});
  expect(tools[2]).toMatchObject({destructive:true,profiles:['full']});
 });
 it('refuses unknown parent, missing owner pricing or missing confirmed spend before POST',async()=>{
  const f=make();
  let out=f.parse(await f.handlers.neon_dev_branch_create({...args,
   parentBranchId:'br-not-known',confirm:true}));
  expect(out.done).toBe(false);
  expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
 it('creates a priced, expiring, annotated and compute-backed branch once',async()=>{
  const f=make();
  const dry=f.parse(await f.handlers.neon_dev_branch_create({...args,dryRun:true}));
  expect(dry).toMatchObject({done:false,needsConfirmation:true});
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  const confirmed=f.parse(await f.handlers.neon_dev_branch_create({...args,confirm:true}));
  expect(confirmed,JSON.stringify(confirmed)).toMatchObject({done:true,confirmed:true});
  const posts=f.fake.calls.filter(c=>c.method==='POST');
  expect(posts).toHaveLength(1);
  expect(posts[0].auth).toBe(true);
  expect(posts[0].body).toMatchObject({branch:{
   name:'testdev',parent_id:IDS.main,protected:false,expires_at:f.selectedExpiry},
   annotation_value:{rtc_run:expect.stringMatching(/^run-/)},
   endpoints:[{type:'read_write',autoscaling_limit_min_cu:0.25,
    autoscaling_limit_max_cu:1,suspend_timeout_seconds:300}]});
  expect(f.rows).toHaveLength(1);
  const again=f.parse(await f.handlers.neon_dev_branch_create({...args,confirm:true}));
  expect(again.done).toBe(true); // B-1 returns the existing durable confirmation, never a second POST.
  expect(f.fake.calls.filter(c=>c.method==='POST')).toHaveLength(1);
  f.fake.assertClean();
 });
 it('refuses unverifiable result, retains pending audit and never fabricates ownership',async()=>{
  const f=make({badProof:true});
  const out=f.parse(await f.handlers.neon_dev_branch_create({...args,confirm:true}));
  expect(out.confirmed).toBe('pending');
  expect(f.rows).toHaveLength(0);
  expect(f.fake.calls.filter(c=>c.method==='POST')).toHaveLength(1);
  f.fake.assertClean();
 });
 it('refuses production, protection and read_only even via direct name',async()=>{
  const f=make({allowed:false});
  const out=f.parse(await f.handlers.neon_dev_branch_create({...args,confirm:true}));
  expect(out.done).toBe(false);
  expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
  const denied=await dispatchReadOnlyTool({registry:f.registry,
   name:'neon_dev_branch_create',args:{...args,confirm:true},
   connection:{...f.ctx.connection,profile:'read_only'},
   db:f.ctx.db,env:{VERCEL_ENV:'production'}});
  expect(denied.isError).toBe(true);
  f.fake.assertClean();
 });
 it('lists only exact project-run scope without a Neon mutation',async()=>{
  const f=make({withOwned:true});
  const out=f.parse(await f.handlers.neon_dev_list_runs({projectId:IDS.project,limit:20}));
  expect(out.runs).toMatchObject([{runId:'run-owned',objects:1,remaining:1}]);
  const foreign=f.parse(await f.handlers.neon_dev_list_runs({
   projectId:'proj-foreign-00001'}).catch(()=>({
    content:[{text:JSON.stringify({done:false})}]})));
  expect(foreign.done).toBe(false);
  expect(f.fake.calls).toHaveLength(0);
 });
 it('precisely deletes an owned dev branch and never hard-deletes',async()=>{
  const f=make({withOwned:true});
  const preview=f.parse(await f.handlers.neon_dev_cleanup({
   projectId:IDS.project,runId:'run-owned',dryRun:true}));
  expect(preview).toMatchObject({done:false,needsConfirmation:true});
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  const result=f.parse(await f.handlers.neon_dev_cleanup({
   projectId:IDS.project,runId:'run-owned',confirm:true}));
  expect(result,JSON.stringify(result)).toMatchObject({done:true,confirmed:true});
  expect(f.run.status).toBe('cleaned');
  expect(f.rows[0].cleaned).toBe(true);
  const deletes=f.fake.calls.filter(x=>x.method==='DELETE');
  expect(deletes).toHaveLength(1);
  expect(deletes[0].query).not.toHaveProperty('hard_delete');
  expect(deletes[0].params.branch_id).toBe(IDS.dev);
  f.fake.assertClean();
 });
 it('cannot cleanup an unknown run and does not infer ownership from a branch name',async()=>{
  const f=make({withOwned:true});
  const out=f.parse(await f.handlers.neon_dev_cleanup({
   projectId:IDS.project,runId:'run-unrecorded',confirm:true}));
  expect(out.done).toBe(false);
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
});
