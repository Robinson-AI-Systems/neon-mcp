import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project} from '../../test/helpers/neon-fixtures.js';
import {tools,createSecurityAuditWriteHandlers} from '../../src/tools/security-audit-writes.js';
const json=r=>JSON.parse(r.content[0].text);
const projectAt=(level='full',extra={})=>project({settings:{
 audit_log_level:level,block_public_connections:false,
 block_vpc_connections:false,enable_logical_replication:false,...extra}});
function fixture({allowed=true,profile='full',production=true}={}){
 const fake=makeFakeNeon(),audit=[];
 const client=makeNeonClient({key:'napi_FAKE_audit_reduce',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 const c={connection:{neonOrg:IDS.org,projectScope:IDS.project,profile,
  mode:production?'production':'preview'},clientFor:async()=>client,
  db:{recordWritePreview:async x=>audit.push({kind:'preview',...x}),
   reserveWrite:async x=>{audit.push({kind:'reserve',...x});return {created:true,id:17}},
   completeWrite:async x=>audit.push({kind:'complete',...x})},
  writeKey:()=> 'rmcp_audit_level_fixture_1234',
  guards:{checkProtected:async()=>allowed,checkApp:async()=>allowed,
   checkProduction:async()=>({allowed:allowed&&production,production}),
   checkSpend:async()=>allowed}};
 const h=createSecurityAuditWriteHandlers({contextFor:async()=>c})
  .neon_security_set_audit_log_level;
 return {fake,c,h,audit};
}
function records(f,levels=['full']){
 const get=f.fake.when('getProject');
 for(const p of levels)get.resolves({project:typeof p==='string'?projectAt(p):p});
}
describe('D-8 guarded audit verbosity reduction without cost increases',()=>{
 it('uses a full-owner audited write contract and closed input',()=>{
  expect(tools).toHaveLength(1);
  expect(tools[0]).toMatchObject({name:'neon_security_set_audit_log_level',
   projectWide:true,writes:true,access:true,profiles:['full'],
   writeContract:'defineWrite-v1'});
  expect(tools[0].inputSchema.additionalProperties).toBe(false);
 });
 it('previews a stricter audit level with GET-only no spending',async()=>{
  const f=fixture();records(f);
  const x=json(await f.h({level:'extended',dryRun:true},{}));
  expect(x.needsConfirmation).toBe(true);
  expect(x.preview).toContain('lowers audit event detail');
  expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
  expect(f.audit.some(c=>c.kind==='preview')).toBe(true);
  f.fake.assertClean();
 });
 it('confirms only full to extended and verifies PATCH with independent readback',async()=>{
  const f=fixture();records(f,['full','full','extended']);
  f.fake.when('updateProject').resolves({project:projectAt('extended'),operations:[]});
  const x=json(await f.h({level:'extended',confirm:true},{}));
  expect(x).toMatchObject({done:true,confirmed:true});
  const writes=f.fake.calls.filter(c=>c.method==='PATCH');
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({operationId:'updateProject',auth:true,
   body:{project:{settings:{audit_log_level:'extended'}}}});
  expect(f.audit.some(c=>c.kind==='complete'&&c.confirmed==='true')).toBe(true);
  f.fake.assertClean();
 });
 it('rejects increased, same or unobserved logging before any provider PATCH',async()=>{
  for(const [current,requested] of [
   ['base','extended'],['extended','full'],['full','full'],
   ['extended','extended'],[project({settings:{}}),'base'],
   [projectAt('unrecognized'),'base']]){
   const f=fixture();records(f,[current]);
   const x=json(await f.h({level:requested,confirm:true},{}));
   expect(x.done).toBe(false);
   expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
 it('refuses stale audit level or unrelated security policy drift at apply',async()=>{
  for(const changed of [
   projectAt('extended'),
   projectAt('full',{block_public_connections:true})
  ]){
   const f=fixture();records(f,['full',changed]);
   const x=json(await f.h({level:'base',confirm:true},{}));
   expect(x).toMatchObject({done:false,confirmed:'pending'});
   expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
 it('does not confirm a claimed change if Neon did not persist it or changed other policy',async()=>{
  for(const actual of [projectAt('full'),projectAt('base',{block_vpc_connections:true})]){
   const f=fixture();records(f,['full','full',actual]);
   f.fake.when('updateProject').resolves({project:projectAt('base'),operations:[]});
   const x=json(await f.h({level:'base',confirm:true},{}));
   expect(x.done).toBe(false);
   expect(f.fake.calls.filter(c=>c.method==='PATCH')).toHaveLength(1);
   f.fake.assertClean();
  }
 });
 it('refuses foreign identity and missing profile/approval',async()=>{
  for(const options of [{profile:'everyday'},{production:false},{allowed:false}]){
   const f=fixture(options);records(f);
   const x=json(await f.h({level:'base',confirm:true},{}));
   expect(x.done).toBe(false);
   expect(f.fake.calls.every(c=>c.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
  const f=fixture();records(f,[projectAt('full',{hipaa:true,org_id:'bad'})]);
  const x=json(await f.h({level:'base',confirm:true},{}));
  expect(x.done).toBe(false);
  f.fake.assertClean();
 });
});
