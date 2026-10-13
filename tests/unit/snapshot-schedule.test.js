import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,mainBranch,devBranch} from '../../test/helpers/neon-fixtures.js';
import {tools,createSnapshotScheduleHandlers} from '../../src/tools/snapshot-schedule.js';

const original=[{frequency:'daily',hour:4,retention_seconds:604800},
 {frequency:'weekly',day:1,retention_seconds:2592000}];
const shortened=[{frequency:'daily',hour:4,retention_seconds:86400},original[1]];
const input={branchId:IDS.dev,frequency:'daily',hour:4,
 retentionSeconds:86400,confirm:true};
const parse=out=>JSON.parse(out.content[0].text);
function fixture({source=devBranch(),existing=original,after=shortened,
 changed=false,allowed=true,profile='full',expanded=false,
 beforeReorder=false,afterReorder=false,postBranchDrift=false,
 sourceNameMismatch=false}={}){
 const fake=makeFakeNeon(),audit=[];
 const client=makeNeonClient({key:'napi_FAKE_schedule_fixture',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 for(let i=0;i<3;i++){
  const src=i===1&&changed?{...source,protected:true}:source;
  fake.when('getProject').resolves({project:project()});
  let branches=[i===2&&postBranchDrift?mainBranch({name:'changed-main'}):mainBranch(),src];
  if((i===1&&beforeReorder)||(i===2&&afterReorder))branches=branches.reverse();
  fake.when('listProjectBranches').resolves({branches,annotations:{}});
  fake.when('getProjectBranch').resolves({branch:i===0&&sourceNameMismatch?
   {...src,name:'different-source-name'}:src,
   annotation:{object:{type:'console/branch',id:src.id},value:{}}});
 }
 fake.when('getSnapshotSchedule')
  .resolves({schedule:existing})
  .resolves({schedule:changed&&expanded?[]:beforeReorder?[...existing].reverse():existing})
  .resolves({schedule:afterReorder?[...after].reverse():after});
 fake.when('setSnapshotSchedule').resolves({});
 const db={
  async recordWritePreview(x){audit.push({kind:'preview',...x})},
  async reserveWrite(x){audit.push({kind:'reserve',...x});return {created:true,id:1}},
  async completeWrite(x){audit.push({kind:'complete',...x})}};
 const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,
  profile,mode:'preview'},db,clientFor:async()=>client,
  writeKey:()=> 'rmcp_snapshot_schedule_fixture_12345',
  guards:{checkProtected:async()=>allowed,checkApp:async()=>allowed,
   checkProduction:async()=>({allowed,production:false}),
   checkSpend:async()=>allowed}};
 return {fake,audit,handler:createSnapshotScheduleHandlers({
  contextFor:async()=>ctx}).neon_snapshot_set_schedule};
}
describe('D-7 strictly reducing automatic snapshot retention',()=>{
 it('registers a full-owner destructive B-1 mutation and closed schema',()=>{
  expect(tools).toHaveLength(1);
  expect(tools[0]).toMatchObject({name:'neon_snapshot_set_schedule',
   writes:true,destructive:true,spend:false,profiles:['full'],
   writeContract:'defineWrite-v1'});
  expect(tools[0].inputSchema.additionalProperties).toBe(false);
 });
 it('previews loss of coverage with no provider writes',async()=>{
  const f=fixture(),out=parse(await f.handler({...input,dryRun:true},{}));
  expect(out.preview).toMatch(/Older recovery points may expire sooner/);
  expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
 it('PUTs the pinned complete shape preserving all other cadences and confirms readback',async()=>{
  const f=fixture(),out=parse(await f.handler(input,{}));
  expect(out).toMatchObject({done:true,confirmed:true});
  const put=f.fake.calls.filter(c=>c.method==='PUT');
  expect(put).toHaveLength(1);
  expect(put[0].operationId).toBe('setSnapshotSchedule');
  expect(put[0].body).toEqual({schedule:shortened});
  expect(f.fake.calls.filter(c=>c.operationId==='getSnapshotSchedule')).toHaveLength(3);
  f.fake.assertClean();
 });
 it('compares complete branch and cadence records by identity across provider reorder',async()=>{
  const f=fixture({beforeReorder:true,afterReorder:true});
  const out=parse(await f.handler(input,{}));
  expect(out).toMatchObject({done:true,confirmed:true});
  expect(f.fake.calls.filter(c=>c.method==='PUT')).toHaveLength(1);
  f.fake.assertClean();
 });
 it('refuses mismatched exact source identity or unrelated branch drift',async()=>{
  for(const variant of [{sourceNameMismatch:true},{postBranchDrift:true}]){
   const f=fixture(variant),out=parse(await f.handler(input,{}));
   expect(out.done).toBe(false);
   expect(f.fake.calls.filter(c=>c.method==='PUT')).toHaveLength(
    variant.sourceNameMismatch?0:1);
   if(variant.postBranchDrift)expect(out.confirmed).toBe(false);
   f.fake.assertClean();
  }
 });
 it('refuses false provider readback without claiming success',async()=>{
  const f=fixture({after:original}),out=parse(await f.handler(input,{}));
  expect(out).toMatchObject({done:false,confirmed:false});
  expect(f.fake.calls.filter(c=>c.method==='PUT')).toHaveLength(1);
  f.fake.assertClean();
 });
 it('rejects protected, default, unauthorized and changed branch before PUT',async()=>{
  for(const opt of [{source:devBranch({protected:true})},
   {source:devBranch({default:true})},{profile:'everyday'},
   {allowed:false},{changed:true}]){
   const f=fixture(opt),out=parse(await f.handler(input,{}));
   expect(out.done).toBe(false);
   expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
 it('never adds, extends, removes or silently erases unknown provider configuration',async()=>{
  for(const [existing,requested] of [
   [original,{...input,retentionSeconds:604800}],
   [original,{...input,retentionSeconds:9999999}],
   [original,{...input,frequency:'monthly'}],
   [[{frequency:'daily',hour:4},original[1]],input],
   [[{...original[0],new_field:'unknown'},original[1]],input],
   [[original[0],original[0]],input],
   [[],input]]){
   const f=fixture({existing}),out=parse(await f.handler(requested,{}));
   expect(out.done).toBe(false);
   expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
});


describe('D-7 safe elimination of a redundant automatic backup cadence',()=>{
 const remove={branchId:IDS.dev,frequency:'weekly',day:1,
  action:'remove_cadence',confirm:true};
 it('previews recovery loss without provider mutation',async()=>{
  const f=fixture();
  const out=parse(await f.handler({...remove,dryRun:true},{}));
  expect(out.preview).toMatch(/Remove an existing redundant weekly backup cadence/);
  expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
 it('removes only the selected weekly cadence, retaining a finite daily schedule',async()=>{
  const f=fixture({after:[original[0]]});
  const out=parse(await f.handler(remove,{}));
  expect(out).toMatchObject({done:true,confirmed:true});
  const writes=f.fake.calls.filter(c=>c.method==='PUT');
  expect(writes).toHaveLength(1);
  expect(writes[0].operationId).toBe('setSnapshotSchedule');
  expect(writes[0].body).toEqual({schedule:[original[0]]});
  f.fake.assertClean();
 });
 it('fails closed when the provider does not persist the reduction',async()=>{
  const f=fixture({after:original}),out=parse(await f.handler(remove,{}));
  expect(out).toMatchObject({done:false,confirmed:false});
  expect(f.fake.calls.filter(c=>c.method==='PUT')).toHaveLength(1);
  f.fake.assertClean();
 });
 it('refuses removing the only cadence or the last daily-or-better protection',async()=>{
  const hourly={frequency:'hourly',retention_seconds:86400};
  for(const [existing,requested] of [
   [[original[1]],remove],
   [[original[0],original[1]],{...remove,frequency:'daily',hour:4,day:undefined}],
   [[hourly,original[1]],{...remove,frequency:'hourly',day:undefined}],
   [[{frequency:'daily',retention_seconds:7200},original[1]],remove],
   [original,{...remove,retentionSeconds:86400}],
   [original,{...remove,day:2}],
   [original,{...remove,action:'unsupported'}]
  ]){
   const f=fixture({existing}),out=parse(await f.handler(requested,{}));
   expect(out.done).toBe(false);
   expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
 it('does not bypass owner and branch-protection safeguards for cadence removal',async()=>{
  for(const opt of [{source:devBranch({protected:true})},
   {source:devBranch({default:true})},{profile:'read_only'},
   {allowed:false},{changed:true}]){
   const f=fixture(opt),out=parse(await f.handler(remove,{}));
   expect(out.done).toBe(false);
   expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
});
