import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,mainBranch,devBranch,devEndpoint} from '../../test/helpers/neon-fixtures.js';
import {DEFAULT_PRICING} from '../../src/neon/pricing.js';
import {tools,createSnapshotRestoreHandlers} from '../../src/tools/snapshot-restore.js';

const original={id:'snap-fake-000001',name:'dev-backup',
 created_at:'2026-10-10T12:00:00Z',source_branch_id:IDS.dev,
 manual:true,full_size:20000000};
const review=devBranch({id:'br-fake-review-0001',name:'snapshot-review',
 default:false,protected:false});
const arg={snapshotId:original.id,name:'snapshot-review',confirm:true};
const parse=r=>JSON.parse(r.content[0].text);
function fixture({after:trueAfter=true,changed=false,missingSize=false,
 source=devBranch(),allowed=true,plan='Launch',price=DEFAULT_PRICING,
 newEndpoint=false}={}){
 const fake=makeFakeNeon(),audit=[];
 const client=makeNeonClient({key:'napi_FAKE_snapshot_restore',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 const {full_size,...withoutSize}=original;
 const item=missingSize?withoutSize:original;
 for(let i=0;i<3;i++){
  fake.when('getProject').resolves({project:project()});
  const src=(changed&&i===1)?{...source,name:'changed-dev'}:source;
  const branches=i===2&&trueAfter?[mainBranch(),source,review]:[mainBranch(),src];
  fake.when('listProjectBranches').resolves({branches,annotations:{}});
  fake.when('listSnapshots').resolves({snapshots:[item]});
  fake.when('getProjectBranch').resolves({branch:source,
   annotation:{object:{type:'console/branch',id:source.id},value:{}}});
  fake.when('listProjectEndpoints').resolves({endpoints:i===2&&newEndpoint?
   [devEndpoint({id:'ep-fake-review-0001',branch_id:review.id})]:[]});
 }
 const output={branch:review,operations:[]};
 fake.when('restoreSnapshot').resolves(output);
 const db={
  async getPricing(){return price},
  async getSpendPolicy(){return {perChangeCents:2500,perDayCents:5000}},
  async recordWritePreview(x){audit.push({kind:'preview',...x})},
  async reserveWrite(x){audit.push({kind:'reserve',...x});return {created:true,id:1}},
  async completeWrite(x){audit.push({kind:'complete',...x})}};
 const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,
  mode:'preview',profile:'full'},db,clientFor:async()=>client,
  planFor:async()=>plan?{verified:true,name:plan}:null,
  writeKey:()=> 'rmcp_restore_snapshot_fixture_12345',
  reserveSpendWrite:async({estimate})=>{audit.push({kind:'spend',estimate});
   return {created:true,id:1}},
  guards:{checkProtected:async()=>allowed,checkApp:async()=>allowed,
   checkProduction:async()=>({allowed,production:false}),
   checkSpend:async()=>allowed}};
 return {fake,audit,handler:createSnapshotRestoreHandlers({
  contextFor:async()=>ctx}).neon_snapshot_restore};
}
describe('D-7 owner-guarded staged snapshot restore',()=>{
 it('registers bounded full-owner B-1/B-4 write',()=>{
  expect(tools).toHaveLength(1);
  expect(tools[0]).toMatchObject({name:'neon_snapshot_restore',
   spend:true,writes:true,profiles:['full'],writeContract:'defineWrite-v1'});
  expect(tools[0].inputSchema.additionalProperties).toBe(false);
 });
 it('previews a conservative branch and storage forecast without POST',async()=>{
  const f=fixture(),out=parse(await f.handler({...arg,dryRun:true},{}));
  expect(out).toMatchObject({done:false,spendMonthCents:70});
  expect(out.preview).toMatch(/No compute move is permitted/);
  expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
 it('sends explicit non-finalizing restore and verifies new branch, old endpoints intact',async()=>{
  const f=fixture(),out=parse(await f.handler(arg,{}));
  expect(out).toMatchObject({done:true,confirmed:true});
  const writes=f.fake.calls.filter(c=>c.method==='POST');
  expect(writes).toHaveLength(1);
  expect(writes[0].operationId).toBe('restoreSnapshot');
  expect(writes[0].body).toEqual({name:'snapshot-review',finalize_restore:false});
  expect(f.audit.find(x=>x.kind==='spend')?.estimate).toMatchObject({
   increaseCents:70,canApply:true});
  f.fake.assertClean();
 });
 it('refuses missing new branch or changed compute placement during readback',async()=>{
  for(const options of [{after:false},{newEndpoint:true}]){
   const f=fixture(options),out=parse(await f.handler(arg,{}));
   expect(out).toMatchObject({done:false,confirmed:false});
   expect(f.fake.calls.filter(c=>c.method==='POST')).toHaveLength(1);
   f.fake.assertClean();
  }
 });
 it('refuses protected, missing size, changed, unpriced, wrong plan and owner gate',async()=>{
  for(const options of [
   {source:devBranch({protected:true})},
   {missingSize:true},{changed:true},{price:null},{plan:'Free'},{allowed:false}
  ]){
   const f=fixture(options),out=parse(await f.handler(arg,{}));
   expect(out.done).toBe(false);
   expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
 it('refuses unsafe review names without POST',async()=>{
  const f=fixture(),out=parse(await f.handler({...arg,name:'../production'},{}));
  expect(out.done).toBe(false);
  expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
});