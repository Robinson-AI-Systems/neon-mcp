import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {DEFAULT_PRICING} from '../../src/neon/pricing.js';
import {IDS,project,mainBranch,devBranch,database} from '../../test/helpers/neon-fixtures.js';
import {tools,createProjectWriteHandlers} from '../../src/tools/project-writes.js';
const json=r=>JSON.parse(r.content[0].text);
function setup({scoped=true,production=true,allowApp=true}={}){
 const fake=makeFakeNeon();const changes=[];
 const client=makeNeonClient({key:'napi_FAKE_D1_write_fixture',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 const connection={neonOrg:IDS.org,projectScope:scoped?IDS.project:null,
  mode:production?'production':'preview',profile:'full'};
 const db={
  async getNeonOrg(){return {id:IDS.org,production_enabled:production};},
  async getVerifiedNeonPlan(){return {name:'Launch',verified:true};},
  async getPricing(){return DEFAULT_PRICING;},
  async recordWritePreview(x){changes.push({kind:'preview',...x});},
  async reserveWrite(x){changes.push({kind:'claim',...x});return {created:true,id:changes.length};},
  async completeWrite(x){changes.push({kind:'complete',...x});}
 };
 const ctx={connection,db,env:{VERCEL_ENV:'production'},
  clientFor:async()=>client,
  writeKey:()=> 'rmcp_neon_project_test_123456789',
  guards:{checkProtected:async()=>true,checkProduction:async()=>({allowed:production,production}),
   checkApp:async()=>allowApp,checkSpend:async()=>true},
  reserveSpendWrite:async({write})=>db.reserveWrite(write)};
 const handlers=createProjectWriteHandlers({contextFor:async()=>ctx});
 return {fake,ctx,db,handlers,changes};
}
const get=()=>({project:project()});
describe('D-1 project lifecycle write gates',()=>{
 it('declares four B-1 write contracts with no read-only exposure',()=>{
  expect(tools.map(t=>t.name)).toEqual(['neon_project_rename',
   'neon_project_delete','neon_project_recover','neon_project_create']);
  for(const t of tools){
   expect(t.writes).toBe(true);expect(t.projectWide).toBe(true);
   expect(t.writeContract).toBe('defineWrite-v1');
   expect(t.inputSchema.properties).toHaveProperty('dryRun');
   expect(t.inputSchema.properties).toHaveProperty('confirm');
  }
  const created=tools.find(t=>t.name==='neon_project_create');
  expect(created.secretRoute).toBe('/api/neon/setup');
  expect(created.oneTimeOnly).toBe(true);
 });
 it('rename previews without writing, confirms once and reads back provider change',async()=>{
  const {fake,handlers,changes}=setup();
  fake.when('getProject').resolves(get()).resolves(get()).resolves({project:project({name:'renamed'})});
  fake.when('updateProject').resolves({project:project({name:'renamed'}),operations:[]});
  const dry=json(await handlers.neon_project_rename({projectId:IDS.project,name:'renamed',dryRun:true},{}));
  expect(dry.done).toBe(false);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  const done=json(await handlers.neon_project_rename({projectId:IDS.project,name:'renamed',confirm:true},{}));
  expect(done.confirmed).toBe(true);
  expect(fake.calls.filter(c=>c.method==='PATCH')).toHaveLength(1);
  expect(changes.some(x=>x.kind==='complete'&&x.confirmed==='true')).toBe(true);
  fake.assertClean();
 });
 it('refuses guarded project writes when protected or production gate says no',async()=>{
  const {fake,handlers}=setup({production:false});
  fake.when('getProject').resolves(get());
  const denied=json(await handlers.neon_project_rename({projectId:IDS.project,name:'changed',
   confirm:true},{}));
  expect(denied.code).toBe('refused_by_guard');
  expect(fake.calls.map(c=>c.method)).toEqual(['GET']);
  fake.assertClean();
 });
 it('delete preview enumerates branches and their databases but does not delete',async()=>{
  const {fake,handlers}=setup();
  fake.when('getProject').resolves(get());
  fake.when('listProjectBranches').resolves({branches:[mainBranch(),devBranch()],annotations:{}});
  fake.when('listProjectBranchDatabases').resolves({databases:[database()]});
  const output=json(await handlers.neon_project_delete({projectId:IDS.project,dryRun:true},{}));
  expect(output.preview).toMatch(/2 branches and 2 databases/);
  expect(output.preview).toMatch(/Recoverable/);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('recover requires a discoverable soft-deleted project before mutation',async()=>{
  const {fake,handlers}=setup({scoped:false});
  fake.when('listProjects').resolves({projects:[],applications:{},integrations:{}});
  const result=json(await handlers.neon_project_recover({projectId:IDS.project,confirm:true},{}));
  expect(result.done).toBe(false);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('create requires org-wide full owner scope and refuses when source plan is absent',async()=>{
  const {fake,handlers}=setup();
  expect(json(await handlers.neon_project_create({name:'new-test',confirm:true},{})).done).toBe(false);
  expect(fake.calls).toHaveLength(0);
  const owner=setup({scoped:false});
  owner.db.getVerifiedNeonPlan=async()=>null;
  const result=json(await owner.handlers.neon_project_create({name:'new-test',confirm:true},{}));
  expect(result.done).toBe(false);
  expect(owner.fake.calls).toHaveLength(0);
 });
});
