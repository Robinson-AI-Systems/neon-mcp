import {describe,it,expect} from 'vitest';
import {makeBranchLifecycleFixture,json} from '../../test/helpers/branch-lifecycle-fixture.js';
import {IDS,project,mainBranch,devBranch,devEndpoint,database,responses} from '../../test/helpers/neon-fixtures.js';
import {tools} from '../../src/tools/branch-lifecycle.js';
const list=branches=>({branches,annotations:{}});
const projectResponse=()=>({project:project()});
describe('D-2 verified branch create, delete, recover',()=>{
 it('declares audited writes and billable creation with closed schemas',()=>{
  expect(tools.map(t=>t.name)).toEqual(['neon_branch_create','neon_branch_delete','neon_branch_recover']);
  for(const t of tools){expect(t.writes).toBe(true);
   expect(t.writeContract).toBe('defineWrite-v1');
   expect(t.inputSchema.additionalProperties).toBe(false);}
  expect(tools[0].spend).toBe(true);
  expect(tools[1].destructive).toBe(true);
 });
 it('refuses implicit parent or missing name before any Neon request',async()=>{
  const {fake,handlers}=makeBranchLifecycleFixture();
  const out=json(await handlers.neon_branch_create({name:'new',confirm:true},{}));
  expect(out.done).toBe(false);
  expect(fake.calls).toHaveLength(0);
 });
 it('refuses duplicate branch name without provider mutation',async()=>{
  const {fake,handlers}=makeBranchLifecycleFixture();
  fake.when('getProject').resolves(projectResponse());
  fake.when('listProjectBranches').resolves(list([mainBranch(),devBranch()]));
  const out=json(await handlers.neon_branch_create({name:'dev',parentBranchId:IDS.main,confirm:true},{}));
  expect(out.done).toBe(false);
  expect(fake.calls.every(x=>x.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('requires independently verified plan before any billable creation',async()=>{
  const {fake,handlers}=makeBranchLifecycleFixture({plan:null});
  fake.when('getProject').resolves(projectResponse());
  fake.when('listProjectBranches').resolves(list([mainBranch()]));
  const out=json(await handlers.neon_branch_create({name:'newbranch',parentBranchId:IDS.main,confirm:true},{}));
  expect(out.done).toBe(false);
  expect(fake.calls.every(x=>x.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('shows an audited branch price and does not create on dry run',async()=>{
  const {fake,handlers,events}=makeBranchLifecycleFixture();
  fake.when('getProject').resolves(projectResponse());
  fake.when('listProjectBranches').resolves(list([mainBranch()]));
  const out=json(await handlers.neon_branch_create({name:'newbranch',parentBranchId:IDS.main,dryRun:true},{}));
  expect(out.done).toBe(false);
  expect(out.spendMonthCents).toBe(0);
  expect(events.some(e=>e.kind==='preview')).toBe(true);
  expect(fake.calls.every(x=>x.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('creates from exact parent only once then verifies returned branch identity',async()=>{
  const {fake,handlers,events}=makeBranchLifecycleFixture();
  fake.when('getProject').resolves(projectResponse());
  fake.when('listProjectBranches').resolves(list([mainBranch()]));
  fake.when('createProjectBranch').resolves(responses.createProjectBranch());
  fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
  const out=json(await handlers.neon_branch_create({
   name:'dev',parentBranchId:IDS.main,confirm:true},{}));
  expect(out.confirmed).toBe(true);
  const posted=fake.calls.filter(c=>c.method==='POST');
  expect(posted).toHaveLength(1);
  expect(posted[0].body.branch).toMatchObject({
   name:'dev',parent_id:IDS.main,init_source:'parent-data'});
  expect(events.some(e=>e.kind==='complete'&&e.confirmed==='true')).toBe(true);
  fake.assertClean();
 });
 it('creates an expiring unprotected branch without a compute',async()=>{
  const {fake,handlers}=makeBranchLifecycleFixture();
  const expiresAt=new Date(Date.now()+86400000).toISOString().slice(0,19)+'Z';
  fake.when('getProject').resolves(projectResponse());
  fake.when('listProjectBranches').resolves(list([mainBranch()]));
  fake.when('createProjectBranch').resolves(responses.createProjectBranch());
  fake.when('getProjectBranch').resolves({...responses.getProjectBranch('dev'),
   branch:devBranch({expires_at:expiresAt,protected:false})});
  const out=json(await handlers.neon_branch_create({
   name:'dev',parentBranchId:IDS.main,expiresAt,
   protected:false,confirm:true},{}));
  expect(out.confirmed).toBe(true);
  expect(fake.calls.find(c=>c.method==='POST').body.branch).toMatchObject({
   expires_at:expiresAt,protected:false});
  fake.assertClean();
 });
 it('refuses protection with expiration before any provider request',async()=>{
  const {fake,handlers}=makeBranchLifecycleFixture();
  const expiresAt=new Date(Date.now()+86400000).toISOString().slice(0,19)+'Z';
  const out=json(await handlers.neon_branch_create({name:'unsafe',
   parentBranchId:IDS.main,protected:true,expiresAt,confirm:true},{}));
  expect(out.done).toBe(false);
  expect(fake.calls).toHaveLength(0);
 });
 it('does not confirm a historical branch without exact recovered-source proof',async()=>{
  const {fake,handlers}=makeBranchLifecycleFixture();
  fake.when('getProject').resolves(projectResponse());
  fake.when('listProjectBranches').resolves(list([mainBranch()]));
  fake.when('createProjectBranch').resolves(responses.createProjectBranch());
  fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
  const out=json(await handlers.neon_branch_create({name:'dev',
   parentBranchId:IDS.main,parentLsn:'0/16B6A60',confirm:true},{}));
  expect(out.confirmed).toBe(false);
  expect(fake.calls.filter(x=>x.method==='POST')).toHaveLength(1);
  fake.assertClean();
 });
 it('prices optional compute along with the new branch and verifies its endpoint',async()=>{
  const {fake,handlers}=makeBranchLifecycleFixture();
  fake.when('getProject').resolves(projectResponse());
  fake.when('listProjectBranches').resolves(list([mainBranch()]));
  fake.when('createProjectBranch').resolves(responses.createProjectBranch());
  fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
  fake.when('listProjectBranchEndpoints').resolves({endpoints:[devEndpoint({
   type:'read_only',autoscaling_limit_min_cu:0.25,autoscaling_limit_max_cu:0.5})]});
  const out=json(await handlers.neon_branch_create({name:'dev',parentBranchId:IDS.main,
   computeType:'read_only',minCu:0.25,maxCu:0.5,confirm:true},{}));
  expect(out.confirmed).toBe(true);
  const payload=fake.calls.find(c=>c.method==='POST').body;
  expect(payload.endpoints).toEqual([{type:'read_only',
   autoscaling_limit_min_cu:0.25,autoscaling_limit_max_cu:0.5}]);
  fake.assertClean();
 });
 it('refuses ambiguous history, bad expiration, or unpriced compute before provider writes',async()=>{
  const {fake,handlers}=makeBranchLifecycleFixture();
  for(const more of [
   {parentLsn:'0/1',parentTimestamp:'2025-01-01T00:00:00Z'},
   {expiresAt:'2999-01-01T00:00:00Z'},
   {computeType:'read_only',minCu:0.5,maxCu:0.25},
   {minCu:0.25,maxCu:0.5}
  ]){
   const out=json(await handlers.neon_branch_create({
    name:'dev',parentBranchId:IDS.main,...more,confirm:true},{}));
   expect(out.done).toBe(false);
  }
  expect(fake.calls).toHaveLength(0);
 });
 it('refuses deletion of default or protected branch',async()=>{
  const {fake,handlers}=makeBranchLifecycleFixture();
  fake.when('getProject').resolves(projectResponse());
  fake.when('getProjectBranch').resolves(responses.getProjectBranch('main'));
  const out=json(await handlers.neon_branch_delete({branchId:IDS.main,confirm:true},{}));
  expect(out.done).toBe(false);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('refuses deleting parent with child before any provider DELETE',async()=>{
  const {fake,handlers}=makeBranchLifecycleFixture();
  fake.when('getProject').resolves(projectResponse());
  fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
  fake.when('listProjectBranches').resolves(list([mainBranch(),devBranch(),
   devBranch({id:'br-fake-child-003',parent_id:IDS.dev})]));
  const out=json(await handlers.neon_branch_delete({branchId:IDS.dev,confirm:true},{}));
  expect(out.done).toBe(false);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('previews every compute and database before soft-delete without mutation',async()=>{
  const {fake,handlers}=makeBranchLifecycleFixture();
  fake.when('getProject').resolves(projectResponse());
  fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
  fake.when('listProjectBranches').resolves(list([mainBranch(),devBranch()]));
  fake.when('listProjectBranchEndpoints').resolves({endpoints:[devEndpoint()]});
  fake.when('listProjectBranchDatabases').resolves({databases:[database(IDS.dev)]});
  const out=json(await handlers.neon_branch_delete({branchId:IDS.dev,dryRun:true},{}));
  expect(out.preview).toMatch(/one|1 computes and 1 databases/);
  expect(fake.calls.every(c=>c.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('soft-deletes without hard_delete, verifies absence and recovery visibility',async()=>{
  const {fake,handlers}=makeBranchLifecycleFixture();
  fake.when('getProject').resolves(projectResponse());
  fake.when('getProjectBranch').resolves(responses.getProjectBranch('dev'));
  fake.when('listProjectBranches').resolves(list([mainBranch(),devBranch()]))
   .resolves(list([mainBranch()]))
   .resolves(list([mainBranch(),devBranch()]));
  fake.when('listProjectBranchEndpoints').resolves({endpoints:[devEndpoint()]});
  fake.when('listProjectBranchDatabases').resolves({databases:[database(IDS.dev)]});
  fake.when('deleteProjectBranch').resolves({branch:devBranch(),operations:[]});
  const out=json(await handlers.neon_branch_delete({branchId:IDS.dev,confirm:true},{}));
  expect(out.confirmed).toBe(true);
  const request=fake.calls.find(c=>c.method==='DELETE');
  expect(request.query).not.toHaveProperty('hard_delete');
  fake.assertClean();
 });
 it('never recovers an active or undiscoverable branch',async()=>{
  const {fake,handlers}=makeBranchLifecycleFixture({production:true});
  fake.when('getProject').resolves(projectResponse());
  fake.when('listProjectBranches').resolves(list([mainBranch(),devBranch()]));
  const out=json(await handlers.neon_branch_recover({branchId:IDS.dev,confirm:true},{}));
  expect(out.done).toBe(false);
  expect(fake.calls.every(x=>x.method==='GET')).toBe(true);
  fake.assertClean();
 });
 it('recovers only independently verified deleted branch',async()=>{
  const {fake,handlers}=makeBranchLifecycleFixture({production:true});
  fake.when('getProject').resolves(projectResponse());
  fake.when('listProjectBranches').resolves(list([mainBranch()]))
   .resolves(list([mainBranch(),devBranch()]))
   .resolves(list([mainBranch(),devBranch()]));
  fake.when('recoverProjectBranch').resolves({branch:devBranch(),endpoints:[devEndpoint()]});
  const out=json(await handlers.neon_branch_recover({branchId:IDS.dev,confirm:true},{}));
  expect(out.confirmed).toBe(true);
  expect(fake.calls.filter(x=>x.method==='POST')).toHaveLength(1);
  fake.assertClean();
 });
 it('never mutates if owner production or app/protected checks refuse',async()=>{
  const {fake,handlers}=makeBranchLifecycleFixture({allowed:false});
  fake.when('getProject').resolves(projectResponse());
  fake.when('listProjectBranches').resolves(list([mainBranch()]));
  const out=json(await handlers.neon_branch_create({name:'newbranch',
   parentBranchId:IDS.main,confirm:true},{}));
  expect(out.code).toBe('refused_by_guard');
  expect(fake.calls.every(x=>x.method==='GET')).toBe(true);
  fake.assertClean();
 });
});
