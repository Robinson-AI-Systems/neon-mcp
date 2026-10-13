import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,mainBranch,devBranch} from '../../test/helpers/neon-fixtures.js';
import {tools,createSnapshotDeleteHandlers} from '../../src/tools/snapshot-delete.js';

const one={id:'snap-fake-000001',name:'dev-before-change',
 created_at:'2026-10-10T12:00:00Z',source_branch_id:IDS.dev,
 full_size:1024,manual:true};
const other={...one,id:'snap-fake-000002',name:'keep-me'};
const parse=r=>JSON.parse(r.content[0].text);
function fixture({snap=one,source=devBranch(),scope=IDS.project,
 profile='full',allowed=true,afterPresent=false,changed=false,
 extra=false,afterOtherDrift=false,afterBranchDrift=false}={}){
 const fake=makeFakeNeon(),audit=[];
 const client=makeNeonClient({key:'napi_FAKE_snapshot_delete',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 const items=snap?[snap,...(extra?[other]:[])]:[],
 next=afterPresent?items:items.filter(x=>x.id!==one.id);
 const afterItems=afterOtherDrift?next.map(x=>x.id===other.id
  ?{...x,name:'unexpected-other-rename'}:x):next;
 const beforeProject=project();
 for(let i=0;i<3;i++){
  fake.when('getProject').resolves({project:beforeProject});
  fake.when('listProjectBranches').resolves({branches:[
   afterBranchDrift&&i===2?mainBranch({protected:false}):mainBranch(),source],
   annotations:{}});
 }
 fake.when('listSnapshots').resolves({snapshots:items})
  .resolves({snapshots:changed?[{...one,name:'changed'}]:items})
  .resolves({snapshots:afterItems});
 fake.when('getProjectBranch').resolves({branch:source,
  annotation:{object:{type:'console/branch',id:source.id},value:{}}})
  .resolves({branch:source,
  annotation:{object:{type:'console/branch',id:source.id},value:{}}});
 fake.when('deleteSnapshot').resolves({operations:[]});
 const db={
  async recordWritePreview(x){audit.push({kind:'preview',...x});},
  async reserveWrite(x){audit.push({kind:'reserve',...x});return {created:true,id:audit.length};},
  async completeWrite(x){audit.push({kind:'complete',...x});}
 };
 const ctx={connection:{neonOrg:IDS.org,projectScope:scope,profile,
  mode:'preview'},db,
  clientFor:async()=>client,writeKey:()=> 'rmcp_delete_snapshot_fixture_12345',
  guards:{checkProtected:async()=>allowed,checkApp:async()=>allowed,
   checkProduction:async()=>({allowed,production:false}),
   checkSpend:async()=>allowed}};
 const handler=createSnapshotDeleteHandlers({contextFor:async()=>ctx})
  .neon_snapshot_delete;
 return {fake,audit,handler};
}
const args={snapshotId:one.id,confirm:true};
describe('D-7 bounded, owner-only manual snapshot deletion',()=>{
 it('registers exactly one destructive owner write with a closed schema',()=>{
  expect(tools).toHaveLength(1);
  expect(tools[0]).toMatchObject({name:'neon_snapshot_delete',
   writes:true,writeContract:'defineWrite-v1',destructive:true,
   profiles:['full'],area:'snapshots'});
  expect(tools[0].inputSchema.additionalProperties).toBe(false);
 });
 it('previews a loss of recovery point without DELETE',async()=>{
  const f=fixture();const result=parse(await f.handler({...args,dryRun:true},{}));
  expect(result.done).toBe(false);
  expect(result.preview).toMatch(/cannot be undone/);
  expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
  expect(f.audit.some(x=>x.kind==='preview')).toBe(true);
  f.fake.assertClean();
 });
 it('deletes only the verified dev snapshot, rereads and confirms absence',async()=>{
  const f=fixture();
  const result=parse(await f.handler(args,{}));
  expect(result).toMatchObject({done:true,confirmed:true});
  const mutations=f.fake.calls.filter(c=>c.method!=='GET');
  expect(mutations).toHaveLength(1);
  expect(mutations[0].operationId).toBe('deleteSnapshot');
  expect(f.fake.calls.filter(c=>c.operationId==='listSnapshots')).toHaveLength(3);
  expect(f.audit.some(x=>x.kind==='complete'&&x.confirmed==='true')).toBe(true);
  f.fake.assertClean();
 });
 it('does not claim a successful deletion if the provider still lists the snapshot',async()=>{
  const f=fixture({afterPresent:true});
  const result=parse(await f.handler(args,{}));
  expect(result).toMatchObject({done:false,confirmed:false});
  expect(f.fake.calls.filter(c=>c.operationId==='deleteSnapshot')).toHaveLength(1);
  f.fake.assertClean();
 });
 it('does not confirm deletion when unrelated snapshot metadata or branch policy drifts',async()=>{
  for(const option of [{extra:true,afterOtherDrift:true},{afterBranchDrift:true}]){
   const f=fixture(option),out=parse(await f.handler(args,{}));
   expect(out).toMatchObject({done:false,confirmed:false});
   expect(f.fake.calls.filter(x=>x.operationId==='deleteSnapshot')).toHaveLength(1);
   f.fake.assertClean();
  }
 });
 it('preserves unchanged unrelated snapshot rows on confirmed deletion',async()=>{
  const f=fixture({extra:true}),out=parse(await f.handler(args,{}));
  expect(out).toMatchObject({done:true,confirmed:true});
  f.fake.assertClean();
 });
 it('refuses changed snapshots before DELETE, leaving outcome pending',async()=>{
  const f=fixture({changed:true});
  const result=parse(await f.handler(args,{}));
  expect(result).toMatchObject({done:false,confirmed:'pending'});
  expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
 it('refuses protected/default/malformed source branches without mutations',async()=>{
  for(const source of [mainBranch({id:IDS.dev}),devBranch({protected:true}),
   devBranch({default:true})]){
   const f=fixture({source});
   const result=parse(await f.handler(args,{}));
   expect(result.done).toBe(false);
   expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
 it('refuses scheduled, expired-source, missing or mismatched scope',async()=>{
  for(const state of [
   {snap:{...one,manual:false}},
   {snap:{...one,source_branch_id:'br-fake-vanished'}},
   {snap:null},
   {scope:'proj-fake-foreign'},
   {profile:'everyday'},
   {allowed:false}
  ]){
   const f=fixture(state);const result=parse(await f.handler(args,{}));
   expect(result.done).toBe(false);
   expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
  }
 });
});
