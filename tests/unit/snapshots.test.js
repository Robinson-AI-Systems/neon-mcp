import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,mainBranch,devBranch} from '../../test/helpers/neon-fixtures.js';
import {projectScope} from '../../src/tools/project-context.js';
import {createSnapshotReadHandlers,tools} from '../../src/tools/snapshots.js';

const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,profile:'read_only'}};
const one={id:'snap-fake-000001',name:'Before migration',
 created_at:'2026-10-10T12:00:00Z',source_branch_id:IDS.dev,
 full_size:1200,manual:true};
function fixture({snapshots=[one],branches=[mainBranch(),devBranch()],projectRow=project(),
 schedules=[{schedule:[]},{schedule:[{frequency:'daily',hour:2,retention_seconds:86400}]}]}={}){
 const fake=makeFakeNeon();
 const client=makeNeonClient({key:'napi_FAKE_snapshots',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 fake.when('getProject').resolves({project:projectRow});
 fake.when('listSnapshots').resolves({snapshots});
 fake.when('listProjectBranches').resolves({branches,annotations:{}});
 for(const result of schedules)fake.when('getSnapshotSchedule').resolves(result);
 const handler=createSnapshotReadHandlers({getClient:async(c,p)=>({
  client,scope:projectScope(c,p)})}).neon_snapshot_list;
 return {fake,handler};
}
const parsed=x=>JSON.parse(x.content[0].text);
describe('D-7 independently scoped snapshot and backup schedule discovery',()=>{
 it('declares a registered, read-only, closed-schema operation',()=>{
  expect(tools).toHaveLength(1);
  expect(tools[0]).toMatchObject({name:'neon_snapshot_list',writes:false,area:'snapshots'});
  expect(tools[0].profiles).toContain('read_only');
  expect(tools[0].inputSchema.additionalProperties).toBe(false);
 });
 it('reads project snapshots and all bounded branch schedules without any mutation',async()=>{
  const f=fixture();
  const result=parsed(await f.handler({},ctx));
  expect(result.projectId).toBe(IDS.project);
  expect(result.snapshots).toEqual([expect.objectContaining({
   id:'snap-fake-000001',sourceBranchId:IDS.dev,fullSizeBytes:1200})]);
  expect(result.branchSchedules).toHaveLength(2);
  expect(result.branchSchedules[1].schedule).toEqual([{
   frequency:'daily',hour:2,day:null,month:null,retentionSeconds:86400}]);
  expect(result.capped).toBe(false);
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  expect(f.fake.calls.filter(x=>x.operationId==='getSnapshotSchedule')).toHaveLength(2);
  expect(JSON.stringify(result)).not.toMatch(/password|connection_uri|napi_FAKE/);
  f.fake.assertClean();
 });
 it('does not discard omitted snapshots silently when caller asks for a shorter summary',async()=>{
  const f=fixture({snapshots:[one,{...one,id:'snap-fake-000002',name:'Second'}]});
  const result=parsed(await f.handler({limit:1},ctx));
  expect(result.snapshots).toHaveLength(1);
  expect(result.total).toBe(2);
  expect(result.capped).toBe(true);
  f.fake.assertClean();
 });
 it('rejects foreign project scope before a provider request',async()=>{
  const f=fixture();
  await expect(f.handler({projectId:'proj-fake-foreign'},ctx)).rejects.toThrow(/scope/);
  expect(f.fake.calls).toHaveLength(0);
 });
 it('rejects unverified project identity, duplicate snapshots and foreign branches',async()=>{
  for(const args of [
   {projectRow:project({org_id:'org-fake-other'})},
   {snapshots:[one,one]},
   {branches:[devBranch({project_id:'proj-fake-other'})]}
  ]){
   const f=fixture(args);
   await expect(f.handler({},ctx)).rejects.toThrow();
   expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
 it('never presents a partially verified schedule as completed inventory',async()=>{
  const f=fixture({schedules:[{schedule:[]},{schedule:[{
   frequency:'daily',retention_seconds:1}]}]});
  await expect(f.handler({},ctx)).rejects.toThrow(/schedule/);
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
});
