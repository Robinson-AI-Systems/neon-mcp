import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project} from '../../test/helpers/neon-fixtures.js';
import {tools,createSecurityWriteHandlers} from '../../src/tools/security-writes.js';

const parse=r=>JSON.parse(r.content[0].text);
const value=(blocked=false,vpc=false)=>project({settings:{
 block_public_connections:blocked,block_vpc_connections:vpc}});
function setup({profile='full',allowed=true,production=true}={}){
 const fake=makeFakeNeon(),writes=[];
 const client=makeNeonClient({key:'napi_FAKE_network_access',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 const db={
  async recordWritePreview(x){writes.push({kind:'preview',...x});},
  async reserveWrite(x){writes.push({kind:'reserve',...x});return {created:true,id:writes.length};},
  async completeWrite(x){writes.push({kind:'complete',...x});}
 };
 const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,
  mode:production?'production':'preview',profile},db,
  clientFor:async()=>client,writeKey:()=> 'rmcp_security_network_fixture_12345',
  guards:{checkProtected:async()=>allowed,
   checkApp:async()=>allowed,
   checkProduction:async()=>({allowed,production}),
   checkSpend:async()=>allowed}};
 const handler=createSecurityWriteHandlers({contextFor:async()=>ctx})
  .neon_security_set_public_access;
 return {fake,ctx,db,writes,handler};
}
describe('D-8 guarded project network access',()=>{
 it('registers only an owner full B-1 access mutation',()=>{
  expect(tools).toHaveLength(1);
  expect(tools[0]).toMatchObject({name:'neon_security_set_public_access',
   profiles:['full'],projectWide:true,access:true,writes:true,
   writeContract:'defineWrite-v1'});
  expect(tools[0].inputSchema.additionalProperties).toBe(false);
 });
 it('dry-runs verified access changes without provider write or client wake',async()=>{
  const f=setup();f.fake.when('getProject').resolves({project:value()});
  const result=parse(await f.handler({blockPublic:true,dryRun:true},{}));
  expect(result.done).toBe(false);
  expect(result.preview).toMatch(/public blocked, VPC allowed/);
  expect(f.fake.calls.map(x=>x.operationId)).toEqual(['getProject']);
  expect(f.writes.some(x=>x.kind==='preview')).toBe(true);
  f.fake.assertClean();
 });
 it('changes public restriction only, preserves VPC and independently reads back',async()=>{
  const f=setup();
  f.fake.when('getProject').resolves({project:value()})
   .resolves({project:value()}).resolves({project:value(true)});
  f.fake.when('updateProject').resolves({project:value(true),operations:[]});
  const result=parse(await f.handler({blockPublic:true,confirm:true},{}));
  expect(result).toMatchObject({done:true,confirmed:true});
  const patches=f.fake.calls.filter(x=>x.method==='PATCH');
  expect(patches).toHaveLength(1);
  expect(patches[0].body).toEqual({project:{settings:{block_public_connections:true}}});
  expect(f.fake.calls.filter(x=>x.method==='GET')).toHaveLength(3);
  expect(f.writes.some(x=>x.kind==='complete'&&x.confirmed==='true')).toBe(true);
  f.fake.assertClean();
 });
 it('can change VPC without dropping an existing public restriction',async()=>{
  const f=setup();f.fake.when('getProject')
   .resolves({project:value(true,false)})
   .resolves({project:value(true,false)})
   .resolves({project:value(true,false)});
  const out=parse(await f.handler({blockVpc:true,confirm:true},{}));
  expect(out.done).toBe(false); // both blocked is prohibited before PATCH
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
 it('rejects missing, malformed, or unverified provider access state',async()=>{
  for(const p of [project(),value('yes'),project({org_id:'org-fake-other',
   settings:value().settings})]){
   const f=setup();f.fake.when('getProject').resolves({project:p});
   const result=parse(await f.handler({blockPublic:true,confirm:true},{}));
   expect(result.done).toBe(false);
   expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
 it('refuses both-path lockout, no-op and absent requested changes',async()=>{
  for(const a of [{blockPublic:true,blockVpc:true},
   {blockPublic:false},{blockVpc:false},{}]){
   const f=setup();f.fake.when('getProject').resolves({project:value()});
   const result=parse(await f.handler({...a,confirm:true},{}));
   expect(result.done).toBe(false);
   expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
 it('rejects owner scope, production, app or protected denial before PATCH',async()=>{
  for(const variant of [{profile:'everyday'},{production:false},{allowed:false}]){
   const f=setup(variant);f.fake.when('getProject').resolves({project:value()});
   const result=parse(await f.handler({blockPublic:true,confirm:true},{}));
   expect(result.done).toBe(false);
   expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
 it('fails closed when settings drift between preview and application',async()=>{
  const f=setup();f.fake.when('getProject').resolves({project:value()})
   .resolves({project:value(false,true)});
  const result=parse(await f.handler({blockPublic:true,confirm:true},{}));
  expect(result.done).toBe(false);
  expect(result.confirmed).toBe('pending');
  expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  f.fake.assertClean();
 });
 it('does not claim success when provider readback disagrees',async()=>{
  const f=setup();f.fake.when('getProject').resolves({project:value()})
   .resolves({project:value()}).resolves({project:value()});
  f.fake.when('updateProject').resolves({project:value(true),operations:[]});
  const result=parse(await f.handler({blockPublic:true,confirm:true},{}));
  expect(result).toMatchObject({done:false,confirmed:false});
  expect(f.fake.calls.filter(x=>x.method==='PATCH')).toHaveLength(1);
  f.fake.assertClean();
 });
 it('rejects foreign target before provider access',async()=>{
  const f=setup();const result=parse(await f.handler({
   projectId:'proj-fake-outside',blockPublic:true,confirm:true},{}));
  expect(result.done).toBe(false);expect(f.fake.calls).toHaveLength(0);
 });
});
