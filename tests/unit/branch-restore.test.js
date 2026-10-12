import {describe,it,expect} from 'vitest';
import {IDS,project,mainBranch,devBranch,responses} from '../../test/helpers/neon-fixtures.js';
import {makeBranchLifecycleFixture,json} from '../../test/helpers/branch-lifecycle-fixture.js';
import {createBranchRestoreHandlers,tools} from '../../src/tools/branch-restore.js';
const original=()=>({...responses.getProjectBranch('dev'),branch:devBranch()});
const refreshed=()=>({...responses.getProjectBranch('dev'),
 branch:devBranch({last_reset_at:'2026-10-11T14:00:00Z'})});
const saved=()=>devBranch({id:'br-fake-saved-000001',name:'saved_prior'});
const list=(items)=>({branches:items,annotations:{}});
function setup(options={}){
 const f=makeBranchLifecycleFixture(options);
 return {...f,handlers:createBranchRestoreHandlers({contextFor:async()=>f.ctx})};
}
function before(fake,{collision=false,source=true}={}){
 fake.when('getProject').resolves({project:project()});
 fake.when('getProjectBranch').resolves(original());
 fake.when('listProjectBranches').resolves(list(
  [mainBranch(),devBranch(),...(collision?[saved()]:[])]
   .filter(x=>source||x.id!==IDS.main)));
}
function after(fake,{advance=true,preserve=true}={}){
 fake.when('getProjectBranch').resolves(advance?refreshed():original());
 fake.when('listProjectBranches').resolves(list([
  mainBranch(),devBranch(),...(preserve?[saved()]:[])]));
}
describe('D-2 guarded branch restoration and preservation',()=>{
 it('registers two full-profile destructive writes with strict schemas',()=>{
  expect(tools.map(x=>x.name)).toEqual([
   'neon_branch_reset_from_parent','neon_branch_restore']);
  for(const t of tools){
   expect(t.writes).toBe(true);
   expect(t.destructive).toBe(true);
   expect(t.profiles).toEqual(['full']);
   expect(t.writeContract).toBe('defineWrite-v1');
   expect(t.inputSchema.additionalProperties).toBe(false);
  }
 });
 it('previews parent reset, names mandatory preservation, and sends zero writes',async()=>{
  const {fake,handlers}=setup();
  before(fake);
  const out=json(await handlers.neon_branch_reset_from_parent({
   branchId:IDS.dev,preserveUnderName:'saved_prior',dryRun:true},{}));
  expect(out.done).toBe(false);
  expect(out.preview).toContain('preserve all prior branch data under saved_prior');
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('resets from verified parent with required preservation and confirms both branches',async()=>{
  const {fake,handlers,events}=setup();
  before(fake);
  fake.when('restoreProjectBranch').resolves({branch:devBranch(),operations:[]});
  after(fake);
  const out=json(await handlers.neon_branch_reset_from_parent({
   branchId:IDS.dev,preserveUnderName:'saved_prior',confirm:true},{}));
  expect(out.confirmed).toBe(true);
  const call=fake.calls.find(c=>c.method==='POST');
  expect(call.operationId).toBe('restoreProjectBranch');
  expect(call.body).toEqual({source_branch_id:IDS.main,preserve_under_name:'saved_prior'});
  expect(events.some(e=>e.kind==='complete'&&e.confirmed==='true')).toBe(true);
  fake.assertClean();
 });
 it('restores from a specific LSN and never omits preservation name',async()=>{
  const {fake,handlers}=setup();
  before(fake);
  fake.when('restoreProjectBranch').resolves({branch:devBranch(),operations:[]});
  after(fake);
  const out=json(await handlers.neon_branch_restore({
   branchId:IDS.dev,sourceBranchId:IDS.main,sourceLsn:'0/123ABC',
   preserveUnderName:'saved_prior',confirm:true},{}));
  expect(out.confirmed).toBe(true);
  expect(fake.calls.find(c=>c.method==='POST').body).toEqual({
   source_branch_id:IDS.main,source_lsn:'0/123ABC',
   preserve_under_name:'saved_prior'});
  fake.assertClean();
 });
 it('requires exactly one valid point in time or LSN; refuses old history',async()=>{
  const inputs=[
   {sourceLsn:'0/12',sourceTimestamp:'2026-10-11T14:00:00Z'},
   {sourceLsn:'NO'},
   {sourceTimestamp:'1999-01-01T00:00:00Z'},
   {sourceTimestamp:'2026-11-31T00:00:00Z'},
   {}
  ];
  for(const extra of inputs){
   const {fake,handlers}=setup();
   before(fake);
   const out=json(await handlers.neon_branch_restore({
    branchId:IDS.dev,sourceBranchId:IDS.main,preserveUnderName:'saved_prior',
    ...extra,confirm:true},{}));
   expect(out.done).toBe(false);
   expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
   fake.assertClean();
  }
 });
 it('refuses empty preservation name before any provider request',async()=>{
  const {fake,handlers}=setup();
  const out=json(await handlers.neon_branch_reset_from_parent({
   branchId:IDS.dev,confirm:true},{}));
  expect(out.done).toBe(false);
  expect(fake.calls).toHaveLength(0);
 });
 it('refuses existing preservation name and absent parent before POST',async()=>{
  const {fake,handlers}=setup();
  before(fake,{collision:true});
  const out=json(await handlers.neon_branch_reset_from_parent({
   branchId:IDS.dev,preserveUnderName:'saved_prior',confirm:true},{}));
  expect(out.done).toBe(false);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('refuses unverified source/target and never sends POST',async()=>{
  const {fake,handlers}=setup();
  before(fake,{source:false});
  const out=json(await handlers.neon_branch_restore({
   branchId:IDS.dev,sourceBranchId:IDS.main,sourceLsn:'0/123ABC',
   preserveUnderName:'saved_prior',confirm:true},{}));
  expect(out.done).toBe(false);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('blocks restore when owner and protected infrastructure guards deny',async()=>{
  const {fake,handlers}=setup({allowed:false,production:true});
  before(fake);
  const out=json(await handlers.neon_branch_reset_from_parent({
   branchId:IDS.dev,preserveUnderName:'saved_prior',confirm:true},{}));
  expect(out.done).toBe(false);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('rejects unverified provider readback rather than claiming success',async()=>{
  const {fake,handlers}=setup();
  before(fake);
  fake.when('restoreProjectBranch').resolves({branch:devBranch(),operations:[]});
  after(fake,{advance:false,preserve:false});
  const out=json(await handlers.neon_branch_reset_from_parent({
   branchId:IDS.dev,preserveUnderName:'saved_prior',confirm:true},{}));
  expect(out.confirmed).toBe(false);
  expect(fake.calls.some(c=>c.method==='POST')).toBe(true);
  expect(fake.calls.every(c=>!c.path.includes('finalize_restore'))).toBe(true);
  fake.assertClean();
 });
});
