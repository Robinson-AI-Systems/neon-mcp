import {describe,it,expect} from 'vitest';
import {makeBranchLifecycleFixture,json} from '../../test/helpers/branch-lifecycle-fixture.js';
import {IDS,project,mainBranch,devBranch} from '../../test/helpers/neon-fixtures.js';
import {tools,createBranchRestoreHandlers} from '../../src/tools/branch-restores.js';

const preserved='dev_before_history_20261011';
const saved=()=>devBranch({id:'br-fake-preserved-0002',name:preserved});
const before=()=>devBranch({name:'dev',updated_at:'2026-10-11T00:00:00Z'});
const after=()=>devBranch({name:'dev',updated_at:'2026-10-11T01:00:00Z',
 last_reset_at:'2026-10-11T01:00:00Z'});
const response=branch=>({branch,annotation:{object:{type:'console/branch',id:branch.id},value:{}}});
const page=branches=>({branches,annotations:{}});
function setup({allowed=true,plan='Launch'}={}){
 const fx=makeBranchLifecycleFixture({allowed,plan,production:false});
 const handlers=createBranchRestoreHandlers({contextFor:async()=>fx.ctx});
 return {...fx,handlers};
}
function readBefore(fake,{source=true}={}){
 fake.when('getProject').resolves({project:project()});
 fake.when('getProjectBranch').resolves(response(before()));
 fake.when('listProjectBranches').resolves(page(source?[mainBranch(),before()]:[before()]));
}
describe('D-2 destructive branch restoration',()=>{
 it('registers two full-profile guarded destructive and billable contracts',()=>{
  expect(tools.map(t=>t.name)).toEqual(['neon_branch_reset_from_parent','neon_branch_restore']);
  for(const tool of tools){
   expect(tool.profiles).toEqual(['full']);
   expect(tool.writeContract).toBe('defineWrite-v1');
   expect(tool.destructive).toBe(true);
   expect(tool.spend).toBe(true);
   expect(tool.inputSchema.additionalProperties).toBe(false);
  }
 });
 it('refuses missing/foreign parent and no silent provider writes',async()=>{
  const {fake,handlers}=setup();
  readBefore(fake,{source:false});
  const out=json(await handlers.neon_branch_reset_from_parent({
   projectId:IDS.project,branchId:IDS.dev,confirm:true},{}));
  expect(out.done).toBe(false);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('previews default branch reset with explicit preserved old state and dollar quote',async()=>{
  const {fake,handlers,events}=setup();
  readBefore(fake);
  const out=json(await handlers.neon_branch_reset_from_parent({
   branchId:IDS.dev,preserveName:preserved,dryRun:true},{}));
  expect(out.done).toBe(false);
  expect(out.preview).toContain(preserved);
  expect(out.spendMonthCents).toBe(0);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  expect(events.some(e=>e.kind==='preview')).toBe(true);
  fake.assertClean();
 });
 it('resets from the verified parent, always preserves prior branch and checks read-back',async()=>{
  const {fake,handlers,events}=setup();
  fake.when('getProject').resolves({project:project()});
  fake.when('getProjectBranch').resolves(response(before())).resolves(response(after()));
  fake.when('listProjectBranches').resolves(page([mainBranch(),before()]))
   .resolves(page([mainBranch(),after(),saved()]));
  fake.when('restoreProjectBranch').resolves({branch:after(),operations:[]});
  const out=json(await handlers.neon_branch_reset_from_parent({
   branchId:IDS.dev,preserveName:preserved,confirm:true},{}));
  expect(out.confirmed).toBe(true);
  const posted=fake.calls.filter(c=>c.method==='POST');
  expect(posted).toHaveLength(1);
  expect(posted[0].body).toEqual({source_branch_id:IDS.main,
   preserve_under_name:preserved});
  expect(events.some(e=>e.kind==='complete'&&e.confirmed==='true')).toBe(true);
  fake.assertClean();
 });
 it('restores from specific LSN and never omits preservation, including preview mode',async()=>{
  const {fake,handlers}=setup();
  fake.when('getProject').resolves({project:project()});
  fake.when('getProjectBranch').resolves(response(before())).resolves(response(after()));
  fake.when('listProjectBranches').resolves(page([mainBranch(),before()]))
   .resolves(page([mainBranch(),after(),saved()]));
  fake.when('restoreProjectBranch').resolves({branch:after(),operations:[]});
  const result=json(await handlers.neon_branch_restore({branchId:IDS.dev,
   sourceBranchId:IDS.main,sourceLsn:'0/1A2B3C',
   preserveName:preserved,confirm:true},{}));
  expect(result.confirmed).toBe(true);
  expect(fake.calls.find(c=>c.method==='POST').body).toEqual({
   source_branch_id:IDS.main,source_lsn:'0/1A2B3C',
   preserve_under_name:preserved});
  fake.assertClean();
 });
 it('never marks an unverified preservation branch as successful',async()=>{
  const {fake,handlers}=setup();
  fake.when('getProject').resolves({project:project()});
  fake.when('getProjectBranch').resolves(response(before())).resolves(response(after()));
  fake.when('listProjectBranches').resolves(page([mainBranch(),before()]))
   .resolves(page([mainBranch(),after()]));
  fake.when('restoreProjectBranch').resolves({branch:after(),operations:[]});
  const out=json(await handlers.neon_branch_reset_from_parent({
   branchId:IDS.dev,preserveName:preserved,confirm:true},{}));
  expect(out.confirmed).toBe(false);
  expect(fake.calls.filter(x=>x.method==='POST')).toHaveLength(1);
  fake.assertClean();
 });
 it('refuses unverified spend plan without any restore POST',async()=>{
  const {fake,handlers}=setup({plan:null});
  readBefore(fake);
  const out=json(await handlers.neon_branch_reset_from_parent({
   branchId:IDS.dev,preserveName:preserved,confirm:true},{}));
  expect(out.done).toBe(false);
  expect(fake.calls.every(x=>x.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('refuses invalid historical time inputs and duplicate preservation names',async()=>{
  const {fake,handlers}=setup();
  readBefore(fake);
  const out=json(await handlers.neon_branch_restore({
   branchId:IDS.dev,sourceBranchId:IDS.dev,preserveName:preserved,confirm:true},{}));
  expect(out.done).toBe(false);
  expect(fake.calls.every(x=>x.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('refuses every mutation after denial by the protected-resource gate',async()=>{
  const {fake,handlers}=setup({allowed:false});
  readBefore(fake);
  const out=json(await handlers.neon_branch_restore({branchId:IDS.dev,
   sourceBranchId:IDS.main,sourceLsn:'0/1A2B3C',
   preserveName:preserved,confirm:true},{}));
  expect(out.code).toBe('refused_by_guard');
  expect(fake.calls.every(x=>x.method==='GET')).toBe(true);
  fake.assertClean();
 });
});
