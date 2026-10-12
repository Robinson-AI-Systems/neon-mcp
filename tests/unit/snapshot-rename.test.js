import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project,mainBranch,devBranch} from '../../test/helpers/neon-fixtures.js';
import {tools,createSnapshotRenameHandlers} from '../../src/tools/snapshot-rename.js';

const one={id:'snap-fake-000001',name:'dev-before-change',
 created_at:'2026-10-10T12:00:00Z',source_branch_id:IDS.dev,
 full_size:1024,manual:true,expires_at:'2026-11-01T12:00:00Z'};
const parse=r=>JSON.parse(r.content[0].text);
const args={snapshotId:one.id,name:'new-name',confirm:true};
function fixture({snapshot=one,source=devBranch(),profile='full',
 allow=true,stale=false,readbackName='new-name'}={}){
 const fake=makeFakeNeon(),audit=[];
 const client=makeNeonClient({key:'napi_FAKE_snapshot_rename',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 const annotation={object:{type:'console/branch',id:source.id},value:{}};
 for(let i=0;i<3;i++){
  fake.when('getProject').resolves({project:project()});
  fake.when('listProjectBranches').resolves({
   branches:[mainBranch(),source],annotations:{}});
  fake.when('getProjectBranch').resolves({branch:source,annotation});
 }
 const items=snapshot?[snapshot]:[];
 fake.when('listSnapshots').resolves({snapshots:items})
  .resolves({snapshots:stale?[{...snapshot,name:'other-name'}]:items})
  .resolves({snapshots:snapshot?[{...snapshot,name:readbackName}]:[]});
 fake.when('updateSnapshot').resolves({
  snapshot:{...one,name:'new-name'},operations:[]});
 const db={async recordWritePreview(x){audit.push({type:'preview',...x});},
  async reserveWrite(x){audit.push({type:'reserve',...x});return {created:true,id:audit.length};},
  async completeWrite(x){audit.push({type:'complete',...x});}};
 const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,profile,
  mode:'preview'},db,clientFor:async()=>client,
  writeKey:()=> 'rmcp_rename_snapshot_fixture_12345',
  guards:{checkProtected:async()=>allow,checkApp:async()=>allow,
   checkProduction:async()=>({allowed:allow,production:false}),
   checkSpend:async()=>allow}};
 return {fake,audit,handler:createSnapshotRenameHandlers({
  contextFor:async()=>ctx}).neon_snapshot_update};
}
describe('D-7 snapshot name-only update',()=>{
 it('registers a guarded owner-only closed-schema write',()=>{
  expect(tools).toHaveLength(1);
  expect(tools[0]).toMatchObject({name:'neon_snapshot_update',
   writes:true,writeContract:'defineWrite-v1',profiles:['full']});
  expect(tools[0].inputSchema.additionalProperties).toBe(false);
 });
 it('previews an exact name-only mutation without PATCH',async()=>{
  const f=fixture();
  const out=parse(await f.handler({...args,dryRun:true},{}));
  expect(out.preview).toMatch(/Only its name changes/);
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
 it('uses provider-defined PATCH shape and exact independent readback',async()=>{
  const f=fixture();
  const out=parse(await f.handler(args,{}));
  expect(out).toMatchObject({done:true,confirmed:true});
  const patches=f.fake.calls.filter(x=>x.method==='PATCH');
  expect(patches).toHaveLength(1);
  expect(patches[0].operationId).toBe('updateSnapshot');
  expect(patches[0].body).toEqual({snapshot:{name:'new-name'}});
  expect(f.fake.calls.filter(x=>x.operationId==='listSnapshots')).toHaveLength(3);
  expect(f.audit.some(x=>x.type==='complete'&&x.confirmed==='true')).toBe(true);
  f.fake.assertClean();
 });
 it('never confirms wrong provider readback',async()=>{
  const f=fixture({readbackName:'not-renamed'});
  const out=parse(await f.handler(args,{}));
  expect(out).toMatchObject({done:false,confirmed:false});
  f.fake.assertClean();
 });
 it('refuses stale metadata before any mutation',async()=>{
  const f=fixture({stale:true});
  const out=parse(await f.handler(args,{}));
  expect(out).toMatchObject({done:false,confirmed:'pending'});
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
 it('refuses missing, scheduled, protected, unchanged, invalid or unauthorized',async()=>{
  for(const [options,input] of [
   [{snapshot:null},args],
   [{snapshot:{...one,manual:false}},args],
   [{source:devBranch({protected:true})},args],
   [{source:devBranch({default:true})},args],
   [{profile:'everyday'},args],
   [{allow:false},args],
   [{}, {...args,name:one.name}],
   [{}, {...args,name:'unsafe\nname'}]
  ]){
   const f=fixture(options);
   const out=parse(await f.handler(input,{}));
   expect(out.done).toBe(false);
   expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
});
