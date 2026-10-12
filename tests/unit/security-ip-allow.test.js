import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {IDS,project} from '../../test/helpers/neon-fixtures.js';
import {tools,createSecurityIpHandlers} from '../../src/tools/security-ip-allow.js';
const parse=r=>JSON.parse(r.content[0].text);
const original=['192.0.2.0/24','2001:db8::1/128'];
const projectWith=(ips=original,only=true)=>project({settings:{
 allowed_ips:{ips,protected_branches_only:only}}});
function fixture({plan='Scale',allowed=true}={}){
 const fake=makeFakeNeon(),log=[];
 const client=makeNeonClient({key:'napi_FAKE_ip_allow',orgId:IDS.org,
  fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
 const ctx={connection:{neonOrg:IDS.org,projectScope:IDS.project,
  mode:'production',profile:'full'},db:{
  getVerifiedNeonPlan:async()=>plan?{name:plan,verified:true}:null,
  recordWritePreview:async x=>log.push({kind:'preview',...x}),
  reserveWrite:async x=>{log.push({kind:'reserve',...x});return {created:true,id:4}},
  completeWrite:async x=>log.push({kind:'complete',...x})
 },clientFor:async()=>client,writeKey:()=> 'rmcp_security_ip_test_12345',
 guards:{checkProtected:async()=>allowed,checkApp:async()=>allowed,
  checkProduction:async()=>({allowed,production:true}),
  checkSpend:async()=>allowed}};
 const h=createSecurityIpHandlers({contextFor:async()=>ctx}).neon_security_set_ip_allow;
 return {fake,log,ctx,h};
}
describe('D-8 verified IP allowlist mutations',()=>{
 it('declares a full owner access write with closed schema',()=>{
  expect(tools).toHaveLength(1);
  expect(tools[0]).toMatchObject({name:'neon_security_set_ip_allow',
   access:true,projectWide:true,writes:true,profiles:['full']});
  expect(tools[0].inputSchema.required).toEqual(['action','ips']);
 });
 it('dry-run calculates exact add with Vercel risk warning and GET only',async()=>{
  const f=fixture();
  f.fake.when('getProject').resolves({project:projectWith()});
  const v=parse(await f.h({action:'add',ips:['198.51.100.42'],dryRun:true},{}));
  expect(v.done).toBe(false);
  expect(v.preview).toMatch(/192\.0\.2\.0\/24, 2001:db8::1\/128, 198\.51\.100\.42/);
  expect(v.preview).toMatch(/Vercel dynamic egress/);
  expect(f.fake.calls.map(x=>x.method)).toEqual(['GET']);
  expect(f.log.some(x=>x.kind==='preview')).toBe(true);
  f.fake.assertClean();
 });
 it('removes exact address with protected-only preserved and independent readback',async()=>{
  const f=fixture();
  f.fake.when('getProject').resolves({project:projectWith()})
   .resolves({project:projectWith()})
   .resolves({project:projectWith(['192.0.2.0/24'])});
  f.fake.when('updateProject').resolves({
   project:projectWith(['192.0.2.0/24']),operations:[]});
  const v=parse(await f.h({action:'remove',ips:['2001:db8::1/128'],confirm:true},{}));
  expect(v).toMatchObject({done:true,confirmed:true});
  const p=f.fake.calls.filter(x=>x.method==='PATCH');
  expect(p).toHaveLength(1);
  expect(p[0].body).toEqual({project:{settings:{allowed_ips:{
   ips:['192.0.2.0/24'],protected_branches_only:true}}}});
  expect(f.log.some(x=>x.kind==='complete'&&x.confirmed==='true')).toBe(true);
  f.fake.assertClean();
 });
 it('refuses absent plan, unentitled plan, unverified project and missing allowance',async()=>{
  for(const plan of [null,'Free','Launch']){
   const f=fixture({plan});
   const v=parse(await f.h({action:'replace',ips:['192.0.2.9'],confirm:true},{}));
   expect(v.done).toBe(false);expect(f.fake.calls).toHaveLength(0);
  }
  for(const row of [project(),project({org_id:'org-fake-other',settings:projectWith().settings})]){
   const f=fixture();f.fake.when('getProject').resolves({project:row});
   const v=parse(await f.h({action:'add',ips:['192.0.2.9'],confirm:true},{}));
   expect(v.done).toBe(false);expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
 });
 it('refuses malformed, duplicate, out-of-range CIDRs, absent removals, and empty result',async()=>{
  const cases=[
   {action:'replace',ips:['192.0.2.0/33']},
   {action:'add',ips:['192.0.2.0/24']},
   {action:'replace',ips:['192.0.2.9','192.0.2.9']},
   {action:'remove',ips:['203.0.113.9']},
   {action:'replace',ips:['example.com']},
   {action:'replace',ips:[' 192.0.2.1']},
   {action:'replace',ips:[]}
  ];
  for(const a of cases){
   const f=fixture();f.fake.when('getProject').resolves({project:projectWith()});
   const v=parse(await f.h({...a,confirm:true},{}));
   expect(v.done).toBe(false);
   expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
   f.fake.assertClean();
  }
  const f=fixture();f.fake.when('getProject').resolves({project:projectWith(['192.0.2.5'])});
  expect(parse(await f.h({action:'remove',ips:['192.0.2.5'],confirm:true},{})).done).toBe(false);
  f.fake.assertClean();
 });
 it('denies protected/owner gate and cross-project scope with no mutation',async()=>{
  const f=fixture({allowed:false});
  f.fake.when('getProject').resolves({project:projectWith()});
  const v=parse(await f.h({action:'add',ips:['192.0.2.25'],confirm:true},{}));
  expect(v.done).toBe(false);expect(f.fake.calls.every(x=>x.method==='GET')).toBe(true);
  const other=fixture();
  const outside=parse(await other.h({projectId:'proj-fake-other',
   action:'add',ips:['192.0.2.25'],confirm:true},{}));
  expect(outside.done).toBe(false);expect(other.fake.calls).toHaveLength(0);
 });
 it('stale read and false provider readback never claim confirmed success',async()=>{
  const drift=fixture();
  drift.fake.when('getProject').resolves({project:projectWith()})
   .resolves({project:projectWith(['192.0.2.7'])});
  const blocked=parse(await drift.h({action:'add',ips:['192.0.2.8'],confirm:true},{}));
  expect(blocked.done).toBe(false);
  expect(drift.fake.calls.every(x=>x.method==='GET')).toBe(true);
  const bad=fixture();
  bad.fake.when('getProject').resolves({project:projectWith()})
   .resolves({project:projectWith()}).resolves({project:projectWith()});
  bad.fake.when('updateProject').resolves({
   project:projectWith([...original,'192.0.2.8']),operations:[]});
  const pending=parse(await bad.h({action:'add',ips:['192.0.2.8'],confirm:true},{}));
  expect(pending.done).toBe(false);expect(pending.confirmed).toBe(false);
  expect(bad.fake.calls.filter(x=>x.method==='PATCH')).toHaveLength(1);
  bad.fake.assertClean();
 });
});
