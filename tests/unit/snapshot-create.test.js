import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,mainBranch,devBranch} from '../../test/helpers/neon-fixtures.js';
import {tools,createSnapshotCreateHandlers} from '../../src/tools/snapshot-create.js';
import {DEFAULT_PRICING} from '../../src/neon/pricing.js';

const iso=d=>new Date(Date.now()+d*86400000).toISOString().replace(/\.\d{3}Z$/,'Z');
const parse=r=>JSON.parse(r.content[0].text);
const old={id:'snap-fake-000001',name:'prior',created_at:'2026-10-10T12:00:00Z',
 source_branch_id:IDS.dev,manual:true,full_size:1000};
function fixture({size=20000000,profile='full',protectedBranch=false,afterPresent=true,
 price=DEFAULT_PRICING,plan='Launch',allowed=true,drift=false,confirmed=true,
 afterBranchDrift=false,prewriteBranchDrift=false,afterBranchOrder=false}={}){
 const fake=makeFakeNeon(),audit=[],expiresAt=iso(3);
 const client=makeNeonClient({key:'napi_FAKE_snapshot_create',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 const branch=devBranch({...(size===null?{}:{logical_size:size}),protected:protectedBranch});
 const changed=devBranch({logical_size:size+100,protected:protectedBranch});
 const newSnap={id:'snap-fake-000002',name:'new-backup',
  created_at:'2026-10-10T12:00:00Z',source_branch_id:IDS.dev,
  expires_at:expiresAt,manual:true,...(size===null?{}:{full_size:size})};
 for(let i=0;i<3;i++){
  fake.when('getProject').resolves({project:project()});
  let branches=[(prewriteBranchDrift&&i===1)||(afterBranchDrift&&i===2)
   ?mainBranch({protected:false}):mainBranch(),branch];
  if(afterBranchOrder&&i===2)branches=branches.reverse();
  fake.when('listProjectBranches').resolves({branches,annotations:{}});
  const row=(drift&&i===1)?changed:branch;
  fake.when('getProjectBranch').resolves({branch:row,
   annotation:{object:{type:'console/branch',id:row.id},value:{}}});
 }
 fake.when('listSnapshots').resolves({snapshots:[old]})
  .resolves({snapshots:[old]})
  .resolves({snapshots:afterPresent?[old,newSnap]:[old]});
 fake.when('createSnapshot').resolves({snapshot:newSnap,operations:[]});
 const db={async getPricing(){return price},
  async getSpendPolicy(){return {perChangeCents:2500,perDayCents:5000}},
  async recordWritePreview(x){audit.push({type:'preview',...x});},
  async reserveWrite(x){audit.push({type:'reserve',...x});return {created:true,id:1}},
  async completeWrite(x){audit.push({type:'complete',...x})}};
 const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,profile,
  mode:'preview'},db,clientFor:async()=>client,planFor:async()=>plan?{
   verified:true,name:plan}:null,
  writeKey:()=> 'rmcp_create_snapshot_fixture_12345',
  reserveSpendWrite:async({estimate})=>{
   audit.push({type:'spend',estimate});
   return confirmed?{created:true,id:1}:null;
  },
  guards:{checkProtected:async()=>allowed,checkApp:async()=>allowed,
   checkProduction:async()=>({allowed,production:false}),
   checkSpend:async()=>allowed}};
 const handler=createSnapshotCreateHandlers({contextFor:async()=>ctx})
  .neon_snapshot_create;
 return {fake,handler,audit,expiresAt,branch};
}
const args=f=>({branchId:IDS.dev,name:'new-backup',
 expiresAt:f.expiresAt,confirm:true});
describe('D-7 guarded manually billed snapshot creation',()=>{
 it('registers closed-schema B-1 spend write for full owners only',()=>{
  expect(tools).toHaveLength(1);
  expect(tools[0]).toMatchObject({name:'neon_snapshot_create',
   spend:true,writes:true,writeContract:'defineWrite-v1',profiles:['full']});
  expect(tools[0].inputSchema.additionalProperties).toBe(false);
 });
 it('shows source-dated B-4 amount and no POST during preview',async()=>{
  const f=fixture();
  const out=parse(await f.handler({...args(f),dryRun:true},{}));
  expect(out).toMatchObject({done:false,spendMonthCents:18});
  expect(out.preview).toMatch(/Confirm spending/);
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  expect(f.audit.some(x=>x.type==='preview')).toBe(true);
  f.fake.assertClean();
 });
 it('reserves a conservative spend amount, sends exact query and verifies new snapshot',async()=>{
  const f=fixture();
  const out=parse(await f.handler(args(f),{}));
  expect(out).toMatchObject({done:true,confirmed:true});
  const post=f.fake.calls.filter(x=>x.method==='POST');
  expect(post).toHaveLength(1);
  expect(post[0].operationId).toBe('createSnapshot');
  expect(post[0].query).toEqual({name:'new-backup',expires_at:f.expiresAt});
  expect(f.audit.find(x=>x.type==='spend')?.estimate).toMatchObject({
   increaseCents:18,canApply:true,priceCheckedAt:'2026-10-10'});
  expect(f.audit.some(x=>x.type==='complete'&&x.confirmed==='true')).toBe(true);
  f.fake.assertClean();
 });
 it('cannot claim success if created snapshot is not independently listed',async()=>{
  const f=fixture({afterPresent:false});
  const out=parse(await f.handler(args(f),{}));
  expect(out).toMatchObject({done:false,confirmed:false});
  expect(f.fake.calls.filter(x=>x.method==='POST')).toHaveLength(1);
  f.fake.assertClean();
 });
 it('refuses branch price drift before any POST and does not auto replay',async()=>{
  const f=fixture({drift:true});
  const out=parse(await f.handler(args(f),{}));
  expect(out).toMatchObject({done:false,confirmed:'pending'});
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
 it('refuses unrelated branch policy drift before POST or false confirmation afterward',async()=>{
  for(const options of [{prewriteBranchDrift:true},{afterBranchDrift:true}]){
   const f=fixture(options),out=parse(await f.handler(args(f),{}));
   expect(out.done).toBe(false);
   expect(out.confirmed).toBe(options.prewriteBranchDrift?'pending':false);
   expect(f.fake.calls.filter(x=>x.operationId==='createSnapshot')).toHaveLength(
    options.prewriteBranchDrift?0:1);
   f.fake.assertClean();
  }
 });
 it('confirms unchanged existing branch identities even when provider order varies',async()=>{
  const f=fixture({afterBranchOrder:true}),out=parse(await f.handler(args(f),{}));
  expect(out).toMatchObject({done:true,confirmed:true});
  f.fake.assertClean();
 });
 it('refuses unverified price, plan, ownership, protected branch, missing size and denied guard',async()=>{
  for(const variant of [
   {size:null},{size:-1},{size:100000000001},
   {profile:'everyday'},{protectedBranch:true},{plan:'Free'},
   {price:null},{allowed:false},{confirmed:false}
  ]){
   const f=fixture(variant),out=parse(await f.handler(args(f),{}));
   expect(out.done).toBe(false);
   expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
 it('refuses unlimited storage retention and malformed inputs',async()=>{
  const f=fixture();
  for(const a of [
   {...args(f),expiresAt:iso(12)},
   {...args(f),expiresAt:iso(-1)},
   {...args(f),name:'unsafe\nline'},
   {...args(f),branchId:IDS.main}
  ]){
   const result=parse(await f.handler(a,{}));
   expect(result.done).toBe(false);
  }
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
});